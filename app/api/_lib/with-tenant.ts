import { NextRequest, NextResponse } from 'next/server'
import postgres from 'postgres'
import { getTenantContext, TenantContext } from '@/lib/auth/tenant-context'
import { withTenant, withInternalAdmin } from '@/lib/supabase/tenant-db'

type RouteCtx<P> = {
  sql: postgres.TransactionSql
  tenant: TenantContext
  params: P
}

type Handler<P> = (req: NextRequest, ctx: RouteCtx<P>) => Promise<NextResponse>

type NextRouteCtx<P> = { params: Promise<P> } | undefined
type RouteFn<P> = (req: NextRequest, ctx?: NextRouteCtx<P>) => Promise<NextResponse>

/**
 * withTenantRoute: Next.js API route'u tenant-aware sarar.
 *
 * - Tenant context yoksa 401
 * - withTenant() ile transaction açar, RLS otomatik tenant'a izole
 * - Internal admin ise withInternalAdmin() (cross-tenant) — opt-in flag
 * - Dynamic route params 3. parametreden gelir
 *
 * Kullanım:
 *   export const GET = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
 *     const rows = await sql`SELECT * FROM workshop WHERE id = ${parseInt(params.id)}`
 *     return NextResponse.json({ workshops: rows })
 *   })
 */
export function withTenantRoute<P = Record<string, string>>(
  handler: Handler<P>,
  opts: { internalAdmin?: boolean } = {}
): RouteFn<P> {
  return async (req: NextRequest, ctx?: NextRouteCtx<P>): Promise<NextResponse> => {
    try {
      const tenant = await getTenantContext(req)
      if (!tenant) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      }

      if (opts.internalAdmin && !tenant.isInternalAdmin) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }

      const params = (ctx?.params ? await ctx.params : ({} as P))

      if (opts.internalAdmin) {
        return await withInternalAdmin<NextResponse>((sql) => handler(req, { sql, tenant, params }))
      }
      return await withTenant<NextResponse>(tenant.tenantId, (sql) => handler(req, { sql, tenant, params }))
    } catch (err) {
      console.error('[withTenantRoute]', err)
      const msg = err instanceof Error ? err.message : 'Sunucu hatası'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }
}
