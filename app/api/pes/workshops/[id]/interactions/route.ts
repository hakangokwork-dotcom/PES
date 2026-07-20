import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

const KINDS = ['ziyaret', 'denetim', 'olay', 'dmaic', 'fiyat_revizyonu', 'not'] as const

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = parseInt(params.id)
  const rows = await sql`
    SELECT * FROM workshop_interaction
    WHERE workshop_id = ${id}
    ORDER BY occurred_at DESC, id DESC
    LIMIT 200
  `
  return NextResponse.json({ interactions: rows })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const id = parseInt(params.id)
  const body = await req.json()

  if (!KINDS.includes(body.kind)) {
    return NextResponse.json({ error: `Geçersiz tür. Beklenen: ${KINDS.join(', ')}` }, { status: 400 })
  }
  if (!body.summary?.trim()) {
    return NextResponse.json({ error: 'Özet zorunlu' }, { status: 400 })
  }

  const rows = await sql`
    INSERT INTO workshop_interaction
      (workshop_id, tenant_id, kind, occurred_at, summary, detail)
    VALUES (
      ${id}, ${tenant.tenantId}, ${body.kind},
      ${body.occurred_at ?? new Date().toISOString().slice(0, 10)},
      ${body.summary.trim()},
      ${JSON.stringify(body.detail ?? {})}::jsonb
    )
    RETURNING *
  `
  return NextResponse.json({ interaction: rows[0] }, { status: 201 })
})
