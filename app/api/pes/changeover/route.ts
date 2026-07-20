import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (_req, { sql }) => {
  const rows = await sql`
    SELECT cr.*, pl.code as line_code, w.code as workshop_code
    FROM changeover_record cr
    JOIN production_line pl ON pl.id = cr.line_id
    JOIN workshop w ON w.id = pl.workshop_id
    ORDER BY cr.occurred_date DESC
    LIMIT 100
  `
  return NextResponse.json({ records: rows })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO changeover_record (tenant_id, line_id, occurred_date, total_min, machine_adj_min, balancing_min, first_batch_min, warmup_min)
    VALUES (${tenant.tenantId}, ${body.line_id}, ${body.occurred_date}, ${body.total_min}, ${body.machine_adj_min ?? 0}, ${body.balancing_min ?? 0}, ${body.first_batch_min ?? 0}, ${body.warmup_min ?? 0})
    RETURNING id
  `
  return NextResponse.json({ record: { id: row.id }, message: 'Changeover kaydedildi' })
})
