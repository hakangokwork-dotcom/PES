import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = parseInt(params.id)
  const body = await req.json()
  await sql`
    UPDATE master_process SET
      code = COALESCE(${body.code ?? null}, code),
      name = COALESCE(${body.name ?? null}, name),
      group_type = COALESCE(${body.group_type ?? null}, group_type),
      description = COALESCE(${body.description ?? null}, description),
      sort_order = COALESCE(${body.sort_order ?? null}, sort_order)
    WHERE id = ${id}
  `
  return NextResponse.json({ process: { id } })
})

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = parseInt(params.id)
  await sql`DELETE FROM master_process WHERE id = ${id}`
  return NextResponse.json({ message: 'Silindi' })
})
