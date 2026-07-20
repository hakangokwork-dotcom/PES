import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const wid = req.nextUrl.searchParams.get('workshop_id')
  const data = wid
    ? await sql`SELECT * FROM yikama_record WHERE workshop_id = ${Number(wid)} ORDER BY tarih DESC LIMIT 100`
    : await sql`SELECT * FROM yikama_record ORDER BY tarih DESC LIMIT 100`
  return NextResponse.json({ records: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`INSERT INTO yikama_record (tenant_id, workshop_id, work_order_id, tarih, giren_adet, cikan_adet, hatali_adet, cevrim_sayisi, cevrim_sure_dk, enerji_kwh, su_litre, notlar)
    VALUES (${tenant.tenantId}, ${body.workshop_id}, ${body.work_order_id ?? null}, ${body.tarih ?? new Date().toISOString().split('T')[0]},
      ${body.giren_adet ?? 0}, ${body.cikan_adet ?? 0}, ${body.hatali_adet ?? 0}, ${body.cevrim_sayisi ?? 0},
      ${body.cevrim_sure_dk ?? 85}, ${body.enerji_kwh ?? null}, ${body.su_litre ?? null}, ${body.notlar ?? null})
    RETURNING *`
  return NextResponse.json({ record: row })
})
