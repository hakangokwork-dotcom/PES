import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const url = new URL(req.url)
  const workshopId = url.searchParams.get('workshop_id')

  if (workshopId) {
    const rows = await sql`
      SELECT wt.*, w.code as workshop_code, w.name as workshop_name
      FROM workforce_turnover wt
      JOIN workshop w ON w.id = wt.workshop_id
      WHERE wt.workshop_id = ${parseInt(workshopId)}
      ORDER BY wt.year DESC, wt.month DESC
    `
    return NextResponse.json({ records: rows })
  }

  const rows = await sql`
    SELECT wt.*, w.code as workshop_code, w.name as workshop_name
    FROM workforce_turnover wt
    JOIN workshop w ON w.id = wt.workshop_id
    ORDER BY wt.year DESC, wt.month DESC
    LIMIT 100
  `
  return NextResponse.json({ records: rows })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO workforce_turnover (tenant_id, workshop_id, year, month, total_staff, left_count, joined_count, in_warmup, avg_tenure_mon)
    VALUES (${tenant.tenantId}, ${body.workshop_id}, ${body.year}, ${body.month}, ${body.total_staff}, ${body.left_count}, ${body.joined_count}, ${body.in_warmup ?? 0}, ${body.avg_tenure_mon ?? null})
    ON CONFLICT (workshop_id, year, month) DO UPDATE SET
      total_staff = EXCLUDED.total_staff, left_count = EXCLUDED.left_count,
      joined_count = EXCLUDED.joined_count, in_warmup = EXCLUDED.in_warmup,
      avg_tenure_mon = EXCLUDED.avg_tenure_mon
    RETURNING id
  `
  return NextResponse.json({ record: { id: row.id }, message: 'İşgücü verisi kaydedildi' })
})
