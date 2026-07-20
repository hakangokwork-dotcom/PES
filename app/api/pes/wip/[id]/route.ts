import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  await sql`DELETE FROM wip_record WHERE id = ${Number(params.id)}`
  return NextResponse.json({ ok: true })
})
