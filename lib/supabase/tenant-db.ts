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
  fn: (sql: postgres.TransactionSql) => Promise<T>,
  opts: { workshopId?: number | null; userEmail?: string | null; kayitSurum?: string | null } = {}
): Promise<T> {
  if (!isValidUuid(tenantId)) {
    throw new Error(`withTenant: geçersiz tenant_id (${tenantId})`)
  }
  const sql = getDB()
  return sql.begin(async (txSql) => {
    /* Dört ayar TEK sorguda: her biri ayrı gidiş-dönüştü, her işlemde.
       - current_workshop_id (033): atölye kullanıcısı kısıtı. HER ZAMAN
         yazılır — boş bırakmak havuzdan gelen bağlantıda önceki değerin
         kalması riskini doğurur. Boş = kısıt yok = merkez kullanıcısı.
       - current_user_email (054): "kaydı kim girdi" tetikleyicisi okur;
         boş = bilinmiyor (betikler, arka plan işleri).
       - beklenen_surum (055): ekranın kaydı açtığında gördüğü sürüm; araya
         başka yazım girdiyse tetikleyici PT409 ile durdurur. Boş = kontrol yok. */
    await txSql`SELECT
      set_config('app.current_tenant_id', ${tenantId}, true),
      set_config('app.current_workshop_id', ${opts.workshopId != null ? String(opts.workshopId) : ''}, true),
      set_config('app.current_user_email', ${opts.userEmail ?? ''}, true),
      set_config('app.beklenen_surum', ${opts.kayitSurum ?? ''}, true)`
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
