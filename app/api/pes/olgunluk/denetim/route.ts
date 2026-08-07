import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { dbHata } from '../_guard'

/**
 * Olgunluk denetimi başlığı.
 *
 *   POST   /api/pes/olgunluk/denetim          { workshop_id, tarih, denetci? }
 *   PATCH  /api/pes/olgunluk/denetim          { id, durum? | denetci? | not_metni? }
 *   DELETE /api/pes/olgunluk/denetim?id=7
 *
 * ŞABLON SEÇİLMEZ, YAYINDAKİ ALINIR: denetçinin "hangi sürüme göre
 * denetliyorum" diye bir kararı olmamalı. 031'deki trigger da yalnız
 * yayındaki şablona denetim açılmasına izin veriyor.
 *
 * TAMAMLANDI = KİLİT: tamamlanmış denetimin cevapları değiştirilemez
 * (cevap ucu reddeder). Geri almak için durum tekrar 'taslak' yapılır;
 * bu bilinçli bir işlem olsun diye ayrı bir istek.
 */

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = (await req.json()) as Record<string, unknown>
  const workshopId = Number(body.workshop_id)
  if (!Number.isInteger(workshopId)) {
    return NextResponse.json({ error: 'Atölye seçilmeli' }, { status: 400 })
  }
  const tarih = String(body.tarih ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
    return NextResponse.json({ error: 'Tarih gerekli' }, { status: 400 })
  }

  const [w] = await sql`SELECT id FROM workshop WHERE id = ${workshopId}`
  if (!w) return NextResponse.json({ error: 'Atölye bulunamadı' }, { status: 404 })

  const [sablon] = await sql`
    SELECT id, kod FROM olgunluk_sablon
     WHERE tenant_id = ${tenant.tenantId} AND durum = 'yayinda'`
  if (!sablon) {
    return NextResponse.json({
      error: 'Yayında olgunluk sürümü yok. Katalog sayfasından bir sürüm yayınlayın.',
    }, { status: 409 })
  }

  const [ayni] = await sql`
    SELECT id FROM olgunluk_denetim
     WHERE workshop_id = ${workshopId} AND sablon_id = ${sablon.id} AND tarih = ${tarih}`
  if (ayni) {
    // Çift kayıt yerine mevcuda yönlendir: aynı gün ikinci kez "yeni
    // denetim" demek neredeyse her zaman yarım kalanı sürdürmek demektir.
    return NextResponse.json({ id: ayni.id, mevcut: true })
  }

  try {
    const [satir] = await sql`
      INSERT INTO olgunluk_denetim (tenant_id, workshop_id, sablon_id, tarih, denetci)
      VALUES (${tenant.tenantId}, ${workshopId}, ${sablon.id}, ${tarih},
              ${String(body.denetci ?? '').trim() || null})
      RETURNING id`
    return NextResponse.json({ id: satir.id })
  } catch (e) {
    return dbHata(e)
  }
})

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const body = (await req.json()) as Record<string, unknown>
  const id = Number(body.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz denetim' }, { status: 400 })

  const [mevcut] = await sql`SELECT id, durum FROM olgunluk_denetim WHERE id = ${id}`
  if (!mevcut) return NextResponse.json({ error: 'Denetim bulunamadı' }, { status: 404 })

  const alanlar: Record<string, string | null> = {}
  if ('denetci' in body) alanlar.denetci = String(body.denetci ?? '').trim() || null
  if ('not_metni' in body) alanlar.not_metni = String(body.not_metni ?? '').trim() || null

  if ('durum' in body) {
    const d = String(body.durum ?? '')
    if (d !== 'taslak' && d !== 'tamamlandi') {
      return NextResponse.json({ error: 'Durum taslak veya tamamlandi olmalı' }, { status: 400 })
    }
    if (d === 'tamamlandi') {
      // Hiç cevaplanmamış denetim tamamlanamaz: rapora sıfır puanlı bir
      // atölye olarak düşer ve "denetlendi ama kötü" gibi görünürdü.
      const [{ adet }] = await sql`
        SELECT count(*)::int AS adet FROM olgunluk_denetim_kriter WHERE denetim_id = ${id}`
      if (adet === 0) {
        return NextResponse.json({ error: 'Hiç madde işaretlenmemiş' }, { status: 400 })
      }
    }
    alanlar.durum = d
  }

  if (Object.keys(alanlar).length === 0) {
    return NextResponse.json({ error: 'Değişiklik yok' }, { status: 400 })
  }

  try {
    await sql`
      UPDATE olgunluk_denetim
         SET ${sql(alanlar)},
             tamamlandi_at = ${alanlar.durum === 'tamamlandi' ? sql`now()` : sql`tamamlandi_at`},
             updated_at = now()
       WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbHata(e)
  }
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '')
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz denetim' }, { status: 400 })

  const [mevcut] = await sql`SELECT durum FROM olgunluk_denetim WHERE id = ${id}`
  if (!mevcut) return NextResponse.json({ error: 'Denetim bulunamadı' }, { status: 404 })
  if (mevcut.durum === 'tamamlandi') {
    return NextResponse.json({
      error: 'Tamamlanmış denetim silinemez. Önce taslağa geri alın.',
    }, { status: 409 })
  }

  try {
    await sql`DELETE FROM olgunluk_denetim WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbHata(e)
  }
})
