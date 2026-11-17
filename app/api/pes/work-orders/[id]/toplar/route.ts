// app/api/pes/work-orders/[id]/toplar/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Kumaş topları (062). Atölye ve merkez yazar (ortak kayıt, 409).
 *
 *   GET    → { toplar, gruplar }  gruplar: çekme grubu başına çözgü/atkı ortalama, min, max (SQL'de)
 *   POST   { tedarikci?, artikel?, kompozisyon?, tedarikci_lotu, parti_no?, top_no, metre?,
 *            kullanilabilir_en_cm?, irsaliye_no?, gelis_tarihi?, notlar? }   → her zaman 'Karantina'
 *   PATCH  ?top=ID  { durum?, ton_grubu?, cekme_grubu?, ...yukarıdaki alanlar }  (x-kayit-surum)
 *   DELETE ?top=ID
 */
const METIN = ['tedarikci', 'artikel', 'kompozisyon', 'tedarikci_lotu', 'parti_no', 'top_no', 'irsaliye_no', 'notlar', 'ton_grubu', 'cekme_grubu'] as const
const SAYI = ['metre', 'kullanilabilir_en_cm'] as const
const DURUMLAR = new Set(['Karantina', 'Serbest', 'Red'])
const TARIH = /^\d{4}-\d{2}-\d{2}$/

function alanlar(b: Record<string, unknown>): { veri: Record<string, unknown>; hata: string | null } {
  const veri: Record<string, unknown> = {}
  for (const k of METIN) if (k in b) veri[k] = b[k] == null || String(b[k]).trim() === '' ? null : String(b[k]).trim()
  for (const k of SAYI) if (k in b) {
    if (b[k] == null || String(b[k]).trim() === '') { veri[k] = null; continue }
    const n = Number(String(b[k]).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return { veri, hata: `${k} pozitif sayı olmalı` }
    veri[k] = n
  }
  if ('gelis_tarihi' in b) {
    if (!TARIH.test(String(b.gelis_tarihi))) return { veri, hata: 'Geliş tarihi YYYY-AA-GG olmalı' }
    veri.gelis_tarihi = b.gelis_tarihi
  }
  if ('durum' in b) {
    if (!DURUMLAR.has(String(b.durum))) return { veri, hata: 'Durum Karantina, Serbest ya da Red olmalı' }
    veri.durum = b.durum
  }
  return { veri, hata: null }
}

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const wo = Number(params.id)
  const toplar = await sql`
    SELECT t.*, t.gelis_tarihi::text,
           (SELECT row_to_json(x) FROM (
               SELECT c.id, c.tarih::text, c.sonuc, c.boy_cekme_pct, c.en_cekme_pct, c.may_kaymasi_pct, c.hedef_renk
                 FROM kumas_cekme_testi c WHERE c.top_id = t.id ORDER BY c.tarih DESC, c.id DESC LIMIT 1) x) AS son_test
      FROM kumas_top t WHERE t.work_order_id = ${wo} ORDER BY t.tedarikci_lotu, t.top_no`
  const gruplar = await sql`
    SELECT t.cekme_grubu, count(DISTINCT t.id)::int AS top_sayisi,
           round(avg(c.boy_cekme_pct), 2) AS cozgu_ort, min(c.boy_cekme_pct) AS cozgu_min, max(c.boy_cekme_pct) AS cozgu_max,
           round(avg(c.en_cekme_pct), 2)  AS atki_ort,  min(c.en_cekme_pct)  AS atki_min,  max(c.en_cekme_pct)  AS atki_max
      FROM kumas_top t JOIN kumas_cekme_testi c ON c.top_id = t.id
     WHERE t.work_order_id = ${wo} AND t.cekme_grubu IS NOT NULL
     GROUP BY t.cekme_grubu ORDER BY t.cekme_grubu`
  return NextResponse.json({ toplar, gruplar })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const wo = Number(params.id)
  const [w] = await sql`SELECT workshop_id FROM work_order WHERE id = ${wo}`
  if (!w) return NextResponse.json({ error: 'İş emri bulunamadı' }, { status: 404 })
  const b = await req.json()
  const { veri, hata } = alanlar(b)
  if (hata) return NextResponse.json({ error: hata }, { status: 400 })
  if (!veri.tedarikci_lotu || !veri.top_no) return NextResponse.json({ error: 'Tedarikçi lotu ve top no zorunlu' }, { status: 400 })
  delete veri.durum // kabulde her zaman karantina
  try {
    const [t] = await sql`
      INSERT INTO kumas_top ${sql({ ...veri, tenant_id: tenant.tenantId, work_order_id: wo, workshop_id: w.workshop_id })}
      RETURNING id`
    return NextResponse.json({ id: t.id })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      return NextResponse.json({ error: `Bu lotta ${veri.top_no} numaralı top zaten kayıtlı` }, { status: 409 })
    }
    throw e
  }
})

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const top = Number(req.nextUrl.searchParams.get('top'))
  const { veri, hata } = alanlar(await req.json())
  if (hata) return NextResponse.json({ error: hata }, { status: 400 })
  if (Object.keys(veri).length === 0) return NextResponse.json({ error: 'Değişecek alan yok' }, { status: 400 })
  const [t] = await sql`
    UPDATE kumas_top SET ${sql(veri)} WHERE id = ${top} AND work_order_id = ${Number(params.id)} RETURNING id`
  if (!t) return NextResponse.json({ error: 'Top bulunamadı' }, { status: 404 })
  return NextResponse.json({ ok: true })
})

export const DELETE = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const top = Number(req.nextUrl.searchParams.get('top'))
  const silinen = await sql`DELETE FROM kumas_top WHERE id = ${top} AND work_order_id = ${Number(params.id)} RETURNING id`
  if (!silinen.length) return NextResponse.json({ error: 'Top bulunamadı' }, { status: 404 })
  return NextResponse.json({ ok: true })
})
