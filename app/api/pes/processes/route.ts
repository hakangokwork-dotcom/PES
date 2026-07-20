import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (_req, { sql }) => {
  const data = await sql`SELECT * FROM master_process ORDER BY sort_order`
  return NextResponse.json({ processes: data })
})

export const POST = withTenantRoute(async (req, { sql }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO master_process (code, name, group_type, description, sort_order)
    VALUES (${body.code}, ${body.name}, ${body.group_type ?? 'Her ikisi'}, ${body.description ?? null}, ${body.sort_order ?? 0})
    RETURNING id
  `
  return NextResponse.json({ process: { id: row.id } })
})
