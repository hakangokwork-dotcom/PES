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

  // 019c: bootstrap SECURITY DEFINER fonksiyonu üzerinden.
  // Doğrudan tenant_user sorgusu artık çalışmaz — uygulama pes_app rolüyle
  // bağlanıyor, auth.uid() NULL, tenant_user politikaları 0 satır döndürür.
  // Fonksiyon claimedTenantId verilirse üyeliği doğrular, verilmezse
  // primary tenant'a düşer; her iki durumda da yalnız bu user'ın üyelikleri.
  const rows = await sql`
    SELECT tenant_id, role, tenant_type
    FROM resolve_tenant_context(${user.id}::uuid, ${claimedTenantId}::uuid)
  ` as Array<{
    tenant_id: string
    role: TenantContext['role']
    tenant_type: TenantContext['tenantType']
  }>
  if (rows.length === 0) return null

  const { tenant_id, role, tenant_type } = rows[0]
  return {
    tenantId: tenant_id,
    userId: user.id,
    role,
    tenantType: tenant_type,
    isInternalAdmin: tenant_type === 'internal' && (role === 'owner' || role === 'admin'),
  }
}
