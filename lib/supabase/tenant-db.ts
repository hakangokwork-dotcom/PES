import postgres from 'postgres'
import { getDB } from './db'

/**
 * withTenant: bir tenant context'inde transaction çalıştırır.
 *
 * - SET LOCAL app.current_tenant_id = <uuid>
 * - RLS politikaları sadece bu tenant'ın satırlarını görür/değiştirir
 * - Transaction sonunda ayar otomatik temizlenir (LOCAL scope)
 *
 * Migration 019 RLS politikaları FORCE'lu — service role connection bile
 * bu wrapper olmadan satır göremez.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (sql: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  if (!isValidUuid(tenantId)) {
    throw new Error(`withTenant: geçersiz tenant_id (${tenantId})`)
  }
  const sql = getDB()
  return sql.begin(async (txSql) => {
    await txSql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    return fn(txSql)
  }) as Promise<T>
}

/**
 * withInternalAdmin: ProMode-A şirketi içi admin işlemleri (cross-tenant).
 *
 * - SET LOCAL app.is_internal = 'true' → is_internal_admin() RLS'te true döner
 * - Tüm tenant'ların verisine erişir
 * - Sadece authenticated internal admin user için kullanılır (auth katmanında doğrulanır)
 */
export async function withInternalAdmin<T>(
  fn: (sql: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  const sql = getDB()
  return sql.begin(async (txSql) => {
    await txSql`SELECT set_config('app.is_internal', 'true', true)`
    return fn(txSql)
  }) as Promise<T>
}

/**
 * withParentTenant: parent tenant kendi alt-tenant'larının verisini görür.
 *
 * Faz 5'te aktif olur. Şimdilik current_tenant_or_children() fonksiyonu var,
 * RLS politikaları SELECT için bu set'i kabul edecek şekilde genişletilecek.
 */
export async function withParentTenant<T>(
  tenantId: string,
  fn: (sql: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  if (!isValidUuid(tenantId)) {
    throw new Error(`withParentTenant: geçersiz tenant_id (${tenantId})`)
  }
  const sql = getDB()
  return sql.begin(async (txSql) => {
    await txSql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    await txSql`SELECT set_config('app.parent_visibility', 'true', true)`
    return fn(txSql)
  }) as Promise<T>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isValidUuid(s: string): boolean {
  return typeof s === 'string' && UUID_RE.test(s)
}
