import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const wid = req.nextUrl.searchParams.get('workshop_id')
  const lineId = req.nextUrl.searchParams.get('line_id')
  const date = req.nextUrl.searchParams.get('date')

  let data
  if (wid && lineId && date) {
    data = await sql`
      SELECT om.*, pl.name as line_name
      FROM operation_measurement om
      LEFT JOIN production_line pl ON pl.id = om.line_id
      WHERE om.workshop_id = ${Number(wid)} AND om.line_id = ${Number(lineId)} AND om.measured_date = ${date}
      ORDER BY om.operation_name
    `
  } else if (wid && lineId) {
    data = await sql`
      SELECT om.*, pl.name as line_name
      FROM operation_measurement om
      LEFT JOIN production_line pl ON pl.id = om.line_id
      WHERE om.workshop_id = ${Number(wid)} AND om.line_id = ${Number(lineId)}
      ORDER BY om.measured_date DESC, om.operation_name
      LIMIT 200
    `
  } else if (wid) {
    data = await sql`
      SELECT om.*, pl.name as line_name
      FROM operation_measurement om
      LEFT JOIN production_line pl ON pl.id = om.line_id
      WHERE om.workshop_id = ${Number(wid)}
      ORDER BY om.measured_date DESC, om.line_id, om.operation_name
      LIMIT 200
    `
  } else {
    data = await sql`SELECT * FROM operation_measurement ORDER BY measured_date DESC LIMIT 100`
  }
  return NextResponse.json({ measurements: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO operation_measurement (tenant_id, workshop_id, line_id, model_code, operation_name, cycle_time_sn, operator_count, measured_date, observer_name, notes)
    VALUES (
      ${tenant.tenantId},
      ${body.workshop_id},
      ${body.line_id ?? null},
      ${body.model_code ?? null},
      ${body.operation_name},
      ${body.cycle_time_sn},
      ${body.operator_count ?? 1},
      ${body.measured_date ?? new Date().toISOString().split('T')[0]},
      ${body.observer_name ?? null},
      ${body.notes ?? null}
    )
    RETURNING *
  `
  return NextResponse.json({ measurement: row })
})
