import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { sablonlar, katalog, sablonKlonla } from '@/lib/pes/olgunluk'
import { dbHata, katalogYetkisi } from '../_guard'

/**
 * Olgunluk katalog sürümleri.
 *
 *   GET  /api/pes/olgunluk/sablon            sürüm listesi
 *   GET  /api/pes/olgunluk/sablon?id=1       tek sürümün tam kataloğu
 *   POST /api/pes/olgunluk/sablon            { islem, sablon_id, kod?, ad? }
 *          islem = klonla | yayinla | arsivle
 *
 * NEDEN KLONLAMA VAR: yayındaki şablon kilitli (031 trigger). Kriter
 * değiştirmenin tek yolu yeni bir sürüm açmak. Böylece eski denetimler
 * kendi sorularıyla okunmaya devam eder — düzenleme geçmişi bozmaz.
 */

export const GET = withTenantRoute(async (req, { sql }) => {
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '')
  if (Number.isInteger(id)) {
    const k = await katalog(sql, id)
    if (!k) return NextResponse.json({ error: 'Şablon bulunamadı' }, { status: 404 })
    return NextResponse.json(k)
  }
  return NextResponse.json({ sablonlar: await sablonlar(sql) })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  // Sürüm işlemleri taslakSablon()'dan geçmiyor (klonlama kaynağı yayında
  // olabilir), o yüzden rol kapısı burada ayrıca çağrılır.
  const yetkiHatasi = katalogYetkisi(tenant.role)
  if (yetkiHatasi) return yetkiHatasi

  const body = (await req.json()) as Record<string, unknown>
  const islem = String(body.islem ?? '')
  const kaynakId = Number(body.sablon_id)
  if (!Number.isInteger(kaynakId)) {
    return NextResponse.json({ error: 'Geçersiz şablon' }, { status: 400 })
  }

  const [kaynak] = await sql`SELECT id, kod, ad, durum FROM olgunluk_sablon WHERE id = ${kaynakId}`
  if (!kaynak) return NextResponse.json({ error: 'Şablon bulunamadı' }, { status: 404 })

  try {
    /* Tek tıkla düzenlemeye geçiş.
       Yayındaki sürüm kilitli (031) ve öyle kalmalı — tamamlanmış denetimler
       o soruları kullanıyor. Ama kullanıcı katalogu CANLI yazıyor; her
       seferinde "kod gir, ad gir, klonla" akışı yazımı kesiyordu. Bu işlem
       sürüm kodunu kendi üretir ve zaten açık bir taslak kopya varsa yenisini
       açmak yerine ona götürür. */
    if (islem === 'duzenlemeyeBasla') {
      if (kaynak.durum === 'taslak') {
        return NextResponse.json({ sablon_id: kaynak.id, zaten_taslak: true })
      }

      const [mevcutTaslak] = await sql`
        SELECT id, kod FROM olgunluk_sablon
         WHERE tenant_id = ${tenant.tenantId} AND durum = 'taslak' AND klon_kaynak_id = ${kaynak.id}
         ORDER BY id DESC LIMIT 1`
      if (mevcutTaslak) {
        return NextResponse.json({ sablon_id: mevcutTaslak.id, mevcut_kod: mevcutTaslak.kod })
      }

      // v4 -> v5. Sayı ile bitmiyorsa "-taslak" eklenir ve çakışırsa artar.
      const kodlar = (await sql`
        SELECT kod FROM olgunluk_sablon WHERE tenant_id = ${tenant.tenantId}`)
        .map((r) => String(r.kod))
      const m = /^(.*?)(\d+)$/.exec(String(kaynak.kod))
      let yeniKod: string
      if (m) {
        let n = parseInt(m[2]) + 1
        while (kodlar.includes(`${m[1]}${n}`)) n++
        yeniKod = `${m[1]}${n}`
      } else {
        let n = 2
        yeniKod = `${kaynak.kod}-taslak`
        while (kodlar.includes(yeniKod)) { yeniKod = `${kaynak.kod}-taslak${n}`; n++ }
      }

      const yeniId = await sablonKlonla(sql, {
        kaynakId: kaynak.id as number,
        tenantId: tenant.tenantId,
        kod: yeniKod,
      })
      return NextResponse.json({ sablon_id: yeniId, yeni_kod: yeniKod })
    }

    if (islem === 'klonla') {
      const kod = String(body.kod ?? '').trim()
      if (!kod) return NextResponse.json({ error: 'Yeni sürüm kodu gerekli' }, { status: 400 })

      const yeniId = await sablonKlonla(sql, {
        kaynakId: kaynak.id as number,
        tenantId: tenant.tenantId,
        kod,
        ad: String(body.ad ?? ''),
      })
      return NextResponse.json({ sablon_id: yeniId })
    }

    if (islem === 'yayinla') {
      if (kaynak.durum === 'yayinda') {
        return NextResponse.json({ error: 'Bu sürüm zaten yayında' }, { status: 400 })
      }
      const [{ adet }] = await sql`
        SELECT count(*)::int AS adet FROM olgunluk_surec
         WHERE sablon_id = ${kaynak.id} AND aktif`
      if (adet === 0) {
        return NextResponse.json({ error: 'Süreci olmayan sürüm yayınlanamaz' }, { status: 400 })
      }
      // Tek yayın kuralı kısmi unique index'te; eskiyi ÖNCE arşive al,
      // yoksa index ihlali "yeni sürüm yayınlanamıyor" gibi görünür.
      await sql`
        UPDATE olgunluk_sablon SET durum = 'arsiv'
         WHERE tenant_id = ${tenant.tenantId} AND durum = 'yayinda' AND id <> ${kaynak.id}`
      await sql`
        UPDATE olgunluk_sablon SET durum = 'yayinda', yayin_tarihi = now()
         WHERE id = ${kaynak.id}`
      return NextResponse.json({ ok: true })
    }

    if (islem === 'arsivle') {
      await sql`UPDATE olgunluk_sablon SET durum = 'arsiv' WHERE id = ${kaynak.id}`
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Bilinmeyen işlem' }, { status: 400 })
  } catch (e) {
    return dbHata(e)
  }
})
