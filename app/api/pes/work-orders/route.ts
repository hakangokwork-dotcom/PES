import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const wid = req.nextUrl.searchParams.get('workshop_id')
  const durum = req.nextUrl.searchParams.get('durum')

  let data
  if (wid && durum) {
    data = await sql`SELECT * FROM v_work_order_full WHERE workshop_id = ${Number(wid)} AND durum = ${durum} ORDER BY oncelik DESC, teslim_tarihi ASC NULLS LAST, created_at DESC`
  } else if (wid) {
    data = await sql`SELECT * FROM v_work_order_full WHERE workshop_id = ${Number(wid)} ORDER BY oncelik DESC, teslim_tarihi ASC NULLS LAST, created_at DESC`
  } else {
    data = await sql`SELECT * FROM v_work_order_full ORDER BY oncelik DESC, teslim_tarihi ASC NULLS LAST, created_at DESC LIMIT 200`
  }
  return NextResponse.json({ orders: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO work_order (
      tenant_id, is_emri_no, workshop_id, line_id, musteri, siparis_no, model_adi, stil_kodu,
      siparis_miktari, baslangic_tarihi, bitis_tarihi, teslim_tarihi,
      mtm_toplam_sn, sam_toplam_sn, darbogaz_op, darbogaz_sure_sn,
      anlasmali_fiyat, yikama_fiyati, durum, notlar,
      oncelik, risk_seviyesi, musteri_kodu, musteri_iletisim, sezon, notlar_genel, etiketler
    ) VALUES (
      ${tenant.tenantId},
      ${body.is_emri_no}, ${body.workshop_id}, ${body.line_id ?? null},
      ${body.musteri ?? null}, ${body.siparis_no ?? null},
      ${body.model_adi}, ${body.stil_kodu ?? null}, ${body.siparis_miktari ?? 0},
      ${body.baslangic_tarihi ?? null}, ${body.bitis_tarihi ?? null}, ${body.teslim_tarihi ?? null},
      ${body.mtm_toplam_sn ?? 0}, ${body.sam_toplam_sn ?? 0},
      ${body.darbogaz_op ?? null}, ${body.darbogaz_sure_sn ?? 0},
      ${body.anlasmali_fiyat ?? 0}, ${body.yikama_fiyati ?? 0},
      ${body.durum ?? 'Taslak'}, ${body.notlar ?? null},
      ${body.oncelik ?? 'Normal'}, ${body.risk_seviyesi ?? 'Düşük'},
      ${body.musteri_kodu ?? null}, ${body.musteri_iletisim ?? null},
      ${body.sezon ?? null}, ${body.notlar_genel ?? null},
      ${JSON.stringify(body.etiketler ?? [])}::jsonb
    )
    RETURNING *`

  await sql`SELECT wo_init_stages(${row.id})`

  return NextResponse.json({ order: row })
})
