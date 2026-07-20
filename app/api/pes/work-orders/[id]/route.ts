import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const woId = Number(params.id)
  if (!woId) return NextResponse.json({ error: 'Geçersiz id' }, { status: 400 })

  const [order]   = await sql`SELECT * FROM v_work_order_full WHERE id = ${woId}`
  if (!order) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 })

  const stages    = await sql`SELECT * FROM v_work_order_stages WHERE work_order_id = ${woId} ORDER BY sira_no, id`
  const materials = await sql`SELECT * FROM work_order_material WHERE work_order_id = ${woId} ORDER BY tip, id`
  const journal   = await sql`SELECT * FROM work_order_journal WHERE work_order_id = ${woId} ORDER BY tarih DESC, id DESC LIMIT 100`
  const history   = await sql`SELECT * FROM work_order_status_history WHERE work_order_id = ${woId} ORDER BY tarih DESC LIMIT 50`

  return NextResponse.json({ order, stages, materials, journal, history })
})

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = Number(params.id)
  const body = await req.json()
  const [row] = await sql`UPDATE work_order SET
    durum               = COALESCE(${body.durum ?? null},               durum),
    tamamlanan_adet     = COALESCE(${body.tamamlanan_adet ?? null},     tamamlanan_adet),
    line_id             = COALESCE(${body.line_id ?? null},             line_id),
    anlasmali_fiyat     = COALESCE(${body.anlasmali_fiyat ?? null},     anlasmali_fiyat),
    yikama_fiyati       = COALESCE(${body.yikama_fiyati ?? null},       yikama_fiyati),
    teslim_tarihi       = COALESCE(${body.teslim_tarihi ?? null},       teslim_tarihi),
    baslangic_tarihi    = COALESCE(${body.baslangic_tarihi ?? null},    baslangic_tarihi),
    bitis_tarihi        = COALESCE(${body.bitis_tarihi ?? null},        bitis_tarihi),
    siparis_miktari     = COALESCE(${body.siparis_miktari ?? null},     siparis_miktari),
    musteri             = COALESCE(${body.musteri ?? null},             musteri),
    musteri_kodu        = COALESCE(${body.musteri_kodu ?? null},        musteri_kodu),
    musteri_iletisim    = COALESCE(${body.musteri_iletisim ?? null},    musteri_iletisim),
    sezon               = COALESCE(${body.sezon ?? null},               sezon),
    oncelik             = COALESCE(${body.oncelik ?? null},             oncelik),
    risk_seviyesi       = COALESCE(${body.risk_seviyesi ?? null},       risk_seviyesi),
    sample_onaylandi    = COALESCE(${body.sample_onaylandi ?? null},    sample_onaylandi),
    tech_pack_onaylandi = COALESCE(${body.tech_pack_onaylandi ?? null}, tech_pack_onaylandi),
    paylasim_admin      = COALESCE(${body.paylasim_admin ?? null},      paylasim_admin),
    notlar              = COALESCE(${body.notlar ?? null},              notlar),
    notlar_genel        = COALESCE(${body.notlar_genel ?? null},        notlar_genel),
    etiketler           = COALESCE(${body.etiketler != null ? JSON.stringify(body.etiketler) : null}::jsonb, etiketler),
    updated_at          = now()
    WHERE id = ${id} RETURNING *`
  return NextResponse.json({ order: row })
})

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  await sql`DELETE FROM work_order WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
