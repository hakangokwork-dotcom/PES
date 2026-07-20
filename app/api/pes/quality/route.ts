import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const url = new URL(req.url)
  const workshopId = url.searchParams.get('workshop_id')

  if (workshopId) {
    const rows = await sql`
      SELECT qr.*, w.code as workshop_code, w.name as workshop_name
      FROM quality_record qr
      JOIN workshop w ON w.id = qr.workshop_id
      WHERE qr.workshop_id = ${parseInt(workshopId)}
      ORDER BY qr.year DESC, qr.month DESC
    `
    return NextResponse.json({ records: rows })
  }

  const rows = await sql`
    SELECT qr.*, w.code as workshop_code, w.name as workshop_name
    FROM quality_record qr
    JOIN workshop w ON w.id = qr.workshop_id
    ORDER BY qr.year DESC, qr.month DESC
    LIMIT 100
  `
  return NextResponse.json({ records: rows })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO quality_record (tenant_id, workshop_id, line_id, year, month, inspected_qty, first_pass_qty, rejected_qty, rework_qty, top_defect_cat, customer_return)
    VALUES (${tenant.tenantId}, ${body.workshop_id}, ${body.line_id ?? null}, ${body.year}, ${body.month}, ${body.inspected_qty}, ${body.first_pass_qty}, ${body.rejected_qty}, ${body.rework_qty}, ${body.top_defect_cat ?? null}, ${body.customer_return ?? 0})
    RETURNING id
  `
  return NextResponse.json({ record: { id: row.id }, message: 'Kalite verisi kaydedildi' })
})
