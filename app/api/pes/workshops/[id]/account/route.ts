import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = parseInt(params.id)
  const rows = await sql`SELECT * FROM workshop_account WHERE workshop_id = ${id}`
  return NextResponse.json({ account: rows[0] ?? null })
})

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const id = parseInt(params.id)
  const body = await req.json()

  // 020 her workshop'a boş account satırı açar; yine de sonradan eklenen
  // atölyeler için upsert güvenli tarafta kalır.
  await sql`
    INSERT INTO workshop_account (workshop_id, tenant_id)
    VALUES (${id}, ${tenant.tenantId})
    ON CONFLICT (workshop_id) DO NOTHING
  `

  await sql`
    UPDATE workshop_account SET
      legal_name         = COALESCE(${body.legal_name ?? null}, legal_name),
      tax_no             = COALESCE(${body.tax_no ?? null}, tax_no),
      founded_date       = COALESCE(${body.founded_date ?? null}, founded_date),
      relationship_start = COALESCE(${body.relationship_start ?? null}, relationship_start),
      production_area_m2 = COALESCE(${body.production_area_m2 ?? null}, production_area_m2),
      building_ownership = COALESCE(${body.building_ownership ?? null}, building_ownership),
      incentive_zone     = COALESCE(${body.incentive_zone ?? null}, incentive_zone),
      address_full       = COALESCE(${body.address_full ?? null}, address_full),
      notes              = COALESCE(${body.notes ?? null}, notes)
    WHERE workshop_id = ${id}
  `

  const rows = await sql`SELECT * FROM workshop_account WHERE workshop_id = ${id}`
  return NextResponse.json({ account: rows[0] ?? null })
})
