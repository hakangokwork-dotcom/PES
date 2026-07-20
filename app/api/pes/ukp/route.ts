import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const wid = req.nextUrl.searchParams.get('workshop_id')
  const data = wid
    ? await sql`SELECT * FROM ukp_record WHERE workshop_id = ${Number(wid)} ORDER BY tarih DESC LIMIT 100`
    : await sql`SELECT * FROM ukp_record ORDER BY tarih DESC LIMIT 100`
  return NextResponse.json({ records: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`INSERT INTO ukp_record (tenant_id, workshop_id, work_order_id, tarih, utu_adet, kontrol_adet, paket_adet, hatali_adet, personel_sayisi, calisma_dk, notlar)
    VALUES (${tenant.tenantId}, ${body.workshop_id}, ${body.work_order_id ?? null}, ${body.tarih ?? new Date().toISOString().split('T')[0]},
      ${body.utu_adet ?? 0}, ${body.kontrol_adet ?? 0}, ${body.paket_adet ?? 0}, ${body.hatali_adet ?? 0},
      ${body.personel_sayisi ?? 0}, ${body.calisma_dk ?? 540}, ${body.notlar ?? null})
    RETURNING *`
  return NextResponse.json({ record: row })
})
