import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (_req, { sql }) => {
  const data = await sql`SELECT * FROM product_category ORDER BY code`
  return NextResponse.json({ categories: data })
})
