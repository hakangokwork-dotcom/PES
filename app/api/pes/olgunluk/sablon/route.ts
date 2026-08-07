import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { sablonlar, katalog, sablonKlonla } from '@/lib/pes/olgunluk'
import { dbHata } from '../_guard'

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
  const body = (await req.json()) as Record<string, unknown>
  const islem = String(body.islem ?? '')
  const kaynakId = Number(body.sablon_id)
  if (!Number.isInteger(kaynakId)) {
    return NextResponse.json({ error: 'Geçersiz şablon' }, { status: 400 })
  }

  const [kaynak] = await sql`SELECT id, kod, ad, durum FROM olgunluk_sablon WHERE id = ${kaynakId}`
  if (!kaynak) return NextResponse.json({ error: 'Şablon bulunamadı' }, { status: 404 })

  try {
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
