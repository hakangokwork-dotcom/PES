import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const url = new URL(req.url)
  const workshopId = url.searchParams.get('workshop_id')
  const rows = await sql`
    SELECT dr.*, pl.code as line_code, pl.name as line_name, w.code as workshop_code
    FROM downtime_record dr
    JOIN production_line pl ON pl.id = dr.line_id
    JOIN workshop w ON w.id = pl.workshop_id
    ${workshopId ? sql`WHERE pl.workshop_id = ${parseInt(workshopId)}` : sql``}
    ORDER BY dr.occurred_at DESC
    LIMIT 100
  `
  return NextResponse.json({ records: rows })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO downtime_record (tenant_id, line_id, occurred_at, duration_min, downtime_type, reason, affected_ops)
    VALUES (${tenant.tenantId}, ${body.line_id}, ${body.occurred_at}, ${body.duration_min}, ${body.downtime_type}, ${body.reason ?? null}, ${body.affected_ops ?? 0})
    RETURNING id
  `
  return NextResponse.json({ record: { id: row.id }, message: 'Duruş kaydedildi' })
})
