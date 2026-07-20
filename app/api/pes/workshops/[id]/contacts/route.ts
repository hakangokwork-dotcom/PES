import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = parseInt(params.id)
  const rows = await sql`
    SELECT * FROM workshop_contact
    WHERE workshop_id = ${id}
    ORDER BY is_primary DESC, name
  `
  return NextResponse.json({ contacts: rows })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const id = parseInt(params.id)
  const body = await req.json()

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'İsim zorunlu' }, { status: 400 })
  }

  // Atölye başına tek birincil kişi (partial unique index) — yenisi
  // birincil işaretlendiyse önce eskisi düşürülür.
  if (body.is_primary) {
    await sql`UPDATE workshop_contact SET is_primary = false WHERE workshop_id = ${id} AND is_primary`
  }

  const rows = await sql`
    INSERT INTO workshop_contact (workshop_id, tenant_id, name, role, phone, email, is_primary)
    VALUES (
      ${id}, ${tenant.tenantId}, ${body.name.trim()},
      ${body.role ?? null}, ${body.phone ?? null}, ${body.email ?? null},
      ${Boolean(body.is_primary)}
    )
    RETURNING *
  `
  return NextResponse.json({ contact: rows[0] }, { status: 201 })
})

export const DELETE = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = parseInt(params.id)
  const contactId = parseInt(new URL(req.url).searchParams.get('contactId') ?? '')
  if (!contactId) {
    return NextResponse.json({ error: 'contactId zorunlu' }, { status: 400 })
  }
  await sql`DELETE FROM workshop_contact WHERE id = ${contactId} AND workshop_id = ${id}`
  return NextResponse.json({ ok: true })
})
