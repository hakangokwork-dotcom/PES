import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (_req, { sql }) => {
  const scores = await sql`
    SELECT ss.*, w.code as workshop_code, w.name as workshop_name, w.type as workshop_type
    FROM supplier_score ss
    JOIN workshop w ON w.id = ss.workshop_id
    ORDER BY ss.year DESC, ss.month DESC, ss.composite_sc DESC NULLS LAST
    LIMIT 100
  `
  return NextResponse.json({ scores })
})
