import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = parseInt(params.id)
  await sql`DELETE FROM production_line WHERE id = ${id}`
  return NextResponse.json({ message: 'Bant silindi' })
})

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = parseInt(params.id)
  const body = await req.json()
  await sql`
    UPDATE production_line SET
      name = COALESCE(${body.name ?? null}, name),
      line_type = COALESCE(${body.line_type ?? null}, line_type),
      operator_count = COALESCE(${body.operator_count ?? null}, operator_count),
      daily_target = COALESCE(${body.daily_target ?? null}, daily_target),
      max_cycle_sec = COALESCE(${body.max_cycle_sec ?? null}, max_cycle_sec)
    WHERE id = ${id}
  `
  return NextResponse.json({ line: { id } })
})
