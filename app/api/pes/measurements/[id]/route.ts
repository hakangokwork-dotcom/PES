import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  await sql`DELETE FROM operation_measurement WHERE id = ${Number(params.id)}`
  return NextResponse.json({ ok: true })
})

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const body = await req.json()
  const [row] = await sql`
    UPDATE operation_measurement SET
      operation_name = COALESCE(${body.operation_name ?? null}, operation_name),
      cycle_time_sn = COALESCE(${body.cycle_time_sn ?? null}, cycle_time_sn),
      operator_count = COALESCE(${body.operator_count ?? null}, operator_count)
    WHERE id = ${Number(params.id)}
    RETURNING *
  `
  return NextResponse.json({ measurement: row })
})
