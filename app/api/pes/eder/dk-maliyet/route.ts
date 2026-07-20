import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const donem = req.nextUrl.searchParams.get('donem')
  const data = donem
    ? await sql`SELECT * FROM dk_maliyet WHERE donem = ${donem} ORDER BY bolge`
    : await sql`SELECT * FROM dk_maliyet ORDER BY donem DESC, bolge`
  return NextResponse.json({ maliyetler: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO dk_maliyet (tenant_id, donem, bolge, dk_maliyet_tl)
    VALUES (${tenant.tenantId}, ${body.donem}, ${body.bolge}, ${body.dk_maliyet_tl})
    ON CONFLICT (donem, bolge) DO UPDATE SET dk_maliyet_tl = EXCLUDED.dk_maliyet_tl
    RETURNING *
  `
  return NextResponse.json({ maliyet: row })
})
