import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = parseInt(params.id)
  const body = await req.json()
  await sql`
    UPDATE model_library SET
      name = COALESCE(${body.name ?? null}, name),
      sam_minutes = COALESCE(${body.sam_minutes ?? null}, sam_minutes),
      source = COALESCE(${body.source ?? null}, source),
      bottleneck_sec = COALESCE(${body.bottleneck_sec ?? null}, bottleneck_sec)
    WHERE id = ${id}
  `
  return NextResponse.json({ model: { id } })
})

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = parseInt(params.id)
  await sql`DELETE FROM model_library WHERE id = ${id}`
  return NextResponse.json({ message: 'Silindi' })
})
