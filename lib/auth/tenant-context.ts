import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getDB } from '@/lib/supabase/db'

const TENANT_COOKIE = 'pma_tenant_id'
const TENANT_HEADER = 'x-tenant-id'

export type TenantContext = {
  tenantId: string
  userId: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  tenantType: 'individual' | 'parent' | 'internal'
  isInternalAdmin: boolean
}

/**
 * Request'ten tenant context çıkarır.
 *
 * Sıralama:
 *   1. Header `x-tenant-id` (API client/SDK)
 *   2. Cookie `pma_tenant_id` (web UI)
 *   3. Kullanıcının primary tenant'ı (tenant_user.is_primary=true)
 *
 * Doğrulama:
 *   - User'ın o tenant'a `tenant_user` üzerinden bağlı olması zorunlu
 *   - Aksi halde 403
 */
export async function getTenantContext(req: NextRequest): Promise<TenantContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const claimedTenantId =
    req.headers.get(TENANT_HEADER) ||
    (await cookies()).get(TENANT_COOKIE)?.value ||
    null

  const sql = getDB()

  if (claimedTenantId) {
    const rows = await sql`
      SELECT tu.role, t.type AS tenant_type
      FROM tenant_user tu
      JOIN tenant t ON t.id = tu.tenant_id
      WHERE tu.user_id = ${user.id} AND tu.tenant_id = ${claimedTenantId}
      LIMIT 1
    ` as Array<{ role: TenantContext['role']; tenant_type: TenantContext['tenantType'] }>
    if (rows.length === 0) return null
    return {
      tenantId: claimedTenantId,
      userId: user.id,
      role: rows[0].role,
      tenantType: rows[0].tenant_type,
      isInternalAdmin: rows[0].tenant_type === 'internal' && (rows[0].role === 'owner' || rows[0].role === 'admin'),
    }
  }

  // Primary tenant fallback
  const rows = await sql`
    SELECT tu.tenant_id, tu.role, t.type AS tenant_type
    FROM tenant_user tu
    JOIN tenant t ON t.id = tu.tenant_id
    WHERE tu.user_id = ${user.id}
    ORDER BY tu.is_primary DESC, tu.created_at ASC
    LIMIT 1
  ` as Array<{ tenant_id: string; role: TenantContext['role']; tenant_type: TenantContext['tenantType'] }>
  if (rows.length === 0) return null
  return {
    tenantId: rows[0].tenant_id,
    userId: user.id,
    role: rows[0].role,
    tenantType: rows[0].tenant_type,
    isInternalAdmin: rows[0].tenant_type === 'internal' && (rows[0].role === 'owner' || rows[0].role === 'admin'),
  }
}
