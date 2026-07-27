import postgres from 'postgres'
import { createClient } from './server'
import { getDB } from './db'
import { withTenant } from './tenant-db'

/**
 * Server Component'lar için tenant-aware DB query helper.
 *
 * - Cookies'tan auth user okur (createClient)
 * - tenant_user üzerinden primary tenant'ı bulur
 * - withTenant transaction sarmalı içinde fn'i çalıştırır
 * - Auth/tenant yoksa null döner (page redirect('/login') yapmalı)
 *
 * Kullanım:
 *   export default async function Page() {
 *     const data = await withServerTenant(async (sql) => {
 *       return { rows: await sql`SELECT * FROM workshop` }
 *     })
 *     if (!data) redirect('/login')
 *     // ...
 *   }
 */
export async function withServerTenant<T>(
  fn: (sql: postgres.TransactionSql, tenantId: string, userId: string) => Promise<T>
): Promise<T | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 019c: doğrudan tenant_user sorgusu yerine SECURITY DEFINER bootstrap.
  // Uygulama pes_app rolüyle bağlandığı için auth.uid() NULL ve
  // tenant_user politikaları 0 satır döndürür.
  const sql = getDB()
  const tenantRows = await sql`
    SELECT tenant_id FROM resolve_tenant_context(${user.id}::uuid)
  ` as Array<{ tenant_id: string }>
  if (tenantRows.length === 0) return null

  const tenantId = tenantRows[0].tenant_id
  return withTenant(tenantId, (txSql) => fn(txSql, tenantId, user.id))
}
