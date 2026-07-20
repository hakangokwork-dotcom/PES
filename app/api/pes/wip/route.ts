import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const wid = req.nextUrl.searchParams.get('workshop_id')
  const lineId = req.nextUrl.searchParams.get('line_id')
  const date = req.nextUrl.searchParams.get('date')

  let data
  if (wid && date) {
    data = await sql`
      SELECT wr.*, pl.name as line_name
      FROM wip_record wr
      LEFT JOIN production_line pl ON pl.id = wr.line_id
      WHERE wr.workshop_id = ${Number(wid)} AND wr.recorded_date = ${date}
      ORDER BY wr.line_id, wr.created_at
    `
  } else if (wid) {
    data = await sql`
      SELECT wr.*, pl.name as line_name
      FROM wip_record wr
      LEFT JOIN production_line pl ON pl.id = wr.line_id
      WHERE wr.workshop_id = ${Number(wid)}
      ORDER BY wr.recorded_date DESC, wr.line_id
      LIMIT 200
    `
  } else if (lineId) {
    data = await sql`
      SELECT wr.*, pl.name as line_name
      FROM wip_record wr
      LEFT JOIN production_line pl ON pl.id = wr.line_id
      WHERE wr.line_id = ${Number(lineId)}
      ORDER BY wr.recorded_date DESC
      LIMIT 100
    `
  } else {
    data = await sql`SELECT * FROM wip_record ORDER BY recorded_date DESC LIMIT 100`
  }
  return NextResponse.json({ records: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO wip_record (tenant_id, workshop_id, line_id, model_code, operation_name, recorded_date, wip_qty, notes)
    VALUES (
      ${tenant.tenantId},
      ${body.workshop_id},
      ${body.line_id ?? null},
      ${body.model_code ?? null},
      ${body.operation_name ?? null},
      ${body.recorded_date ?? new Date().toISOString().split('T')[0]},
      ${body.wip_qty},
      ${body.notes ?? null}
    )
    RETURNING *
  `
  return NextResponse.json({ record: row })
})
