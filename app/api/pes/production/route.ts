import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const url = new URL(req.url)
  const workshopId = url.searchParams.get('workshop_id')
  const year = url.searchParams.get('year')
  const month = url.searchParams.get('month')

  if (workshopId && year && month) {
    const rows = await sql`
      SELECT mp.*, pl.name as line_name, pl.code as line_code
      FROM monthly_production mp
      JOIN production_line pl ON pl.id = mp.line_id
      WHERE mp.workshop_id = ${parseInt(workshopId)}
        AND mp.year = ${parseInt(year)}
        AND mp.month = ${parseInt(month)}
      ORDER BY pl.code
    `
    return NextResponse.json({ production: rows })
  }

  const rows = await sql`
    SELECT mp.*, w.name as workshop_name, pl.name as line_name
    FROM monthly_production mp
    JOIN workshop w ON w.id = mp.workshop_id
    JOIN production_line pl ON pl.id = mp.line_id
    ORDER BY mp.year DESC, mp.month DESC
    LIMIT 100
  `
  return NextResponse.json({ production: rows })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO monthly_production (
      tenant_id, line_id, workshop_id, year, month, model_code, group_type,
      total_sam, target_qty, actual_qty, work_days
    ) VALUES (
      ${tenant.tenantId}, ${body.line_id}, ${body.workshop_id}, ${body.year}, ${body.month},
      ${body.model_code ?? null}, ${body.group_type ?? null},
      ${body.total_sam ?? null}, ${body.target_qty}, ${body.actual_qty},
      ${body.work_days}
    )
    ON CONFLICT (line_id, year, month, model_code) DO UPDATE SET
      target_qty = EXCLUDED.target_qty,
      actual_qty = EXCLUDED.actual_qty,
      total_sam = EXCLUDED.total_sam,
      work_days = EXCLUDED.work_days,
      group_type = EXCLUDED.group_type
    RETURNING id
  `
  return NextResponse.json({ production: { id: row.id }, message: 'Üretim verisi kaydedildi' })
})
