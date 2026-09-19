import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Kumaş çekme testi (tasarım K11, migration 036).
 *
 *   GET  /api/pes/work-orders/270/cekme-testi
 *   POST /api/pes/work-orders/270/cekme-testi
 *        { tarih, yikamaSayisi?, enCekme?, boyCekme?, mayKaymasi?, sonuc, yapan?, notlar? }
 *
 * Kumaş geldikten SONRA, kesim planlanmadan ÖNCE yapılır. Çekme yüzdeleri
 * negatiftir (kumaş küçülür), işaret korunur. Altı alan bu tur için yeter;
 * renk haslığı ve gramaj kapsam dışı (K11).
 *
 * Bir iş emrinin birden çok testi olabilir (yeniden yıkama, ikinci top);
 * takvim en yenisini gösterir.
 */
const SONUCLAR = new Set(['UYGUN', 'RİSKLİ', 'RED', 'BEKLIYOR'])
const TARIH = /^\d{4}-\d{2}-\d{2}$/

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const wo = parseInt(params.id)
  if (!Number.isInteger(wo)) return NextResponse.json({ error: 'Geçersiz iş emri' }, { status: 400 })
  const testler = await sql`
    SELECT id, tarih::text, yikama_sayisi, en_cekme_pct, boy_cekme_pct,
           may_kaymasi_pct, sonuc, yapan, notlar
      FROM kumas_cekme_testi
     WHERE work_order_id = ${wo}
     ORDER BY tarih DESC, id DESC`
  return NextResponse.json({ testler })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const wo = parseInt(params.id)
  if (!Number.isInteger(wo)) return NextResponse.json({ error: 'Geçersiz iş emri' }, { status: 400 })

  const b = await req.json()
  const tarih = String(b.tarih ?? '')
  if (!TARIH.test(tarih)) {
    return NextResponse.json({ error: 'Test tarihi YYYY-AA-GG olmalı' }, { status: 400 })
  }
  if (!SONUCLAR.has(b.sonuc)) {
    return NextResponse.json({ error: 'Sonuç UYGUN, RİSKLİ, RED ya da BEKLIYOR olmalı' }, { status: 400 })
  }

  /* RLS satırı gizliyorsa 404 — yetkisiz kullanıcıya iş emrinin varlığını sızdırmaz. */
  const [w] = await sql`SELECT workshop_id FROM work_order WHERE id = ${wo}`
  if (!w) return NextResponse.json({ error: 'İş emri bulunamadı' }, { status: 404 })

  const sayi = (v: unknown): number | null => {
    if (v === null || v === undefined || String(v).trim() === '') return null
    const n = Number(String(v).replace(',', '.'))
    return Number.isFinite(n) ? n : NaN
  }
  const yikama = sayi(b.yikamaSayisi), en = sayi(b.enCekme), boy = sayi(b.boyCekme), may = sayi(b.mayKaymasi)
  for (const [ad, v] of [['yikamaSayisi', yikama], ['enCekme', en], ['boyCekme', boy], ['mayKaymasi', may]] as const) {
    if (Number.isNaN(v)) return NextResponse.json({ error: `${ad} sayı olmalı` }, { status: 400 })
  }
  if (yikama !== null && (yikama < 0 || yikama > 10)) {
    return NextResponse.json({ error: 'Yıkama sayısı 0–10 arası olmalı' }, { status: 400 })
  }

  const [satir] = await sql`
    INSERT INTO kumas_cekme_testi ${sql({
      work_order_id: wo,
      tenant_id: tenant.tenantId,
      workshop_id: w.workshop_id,
      tarih,
      yikama_sayisi: yikama === null ? null : Math.round(yikama),
      en_cekme_pct: en,
      boy_cekme_pct: boy,
      may_kaymasi_pct: may,
      sonuc: b.sonuc,
      yapan: b.yapan ? String(b.yapan).trim() : null,
      notlar: b.notlar ? String(b.notlar).trim() : null,
    })}
    RETURNING id`
  return NextResponse.json({ ok: true, id: satir.id })
})

export const DELETE = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const wo = parseInt(params.id)
  const testId = Number(new URL(req.url).searchParams.get('testId'))
  if (!Number.isInteger(wo) || !Number.isInteger(testId)) {
    return NextResponse.json({ error: 'testId gerekli' }, { status: 400 })
  }
  const silinen = await sql`
    DELETE FROM kumas_cekme_testi WHERE id = ${testId} AND work_order_id = ${wo} RETURNING id`
  if (!silinen.length) return NextResponse.json({ error: 'Test bulunamadı' }, { status: 404 })
  return NextResponse.json({ ok: true })
})
