import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = parseInt(params.id)
  const data = await sql`SELECT * FROM production_line WHERE workshop_id = ${id} ORDER BY code`
  return NextResponse.json({ lines: data })
})
