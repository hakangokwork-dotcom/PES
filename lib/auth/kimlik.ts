import { createClient } from '@/lib/supabase/server'
import { withTenant } from '@/lib/supabase/tenant-db'
import type { TenantContext } from '@/lib/auth/tenant-context'

/**
 * Kenar çubuğundaki kimlik bloğu için: kullanıcı e-postası ve tenant adı.
 *
 * NEDEN AYRI: TenantContext yalnız kimlikleri (uuid) taşıyor, gösterilecek
 * metni değil. İki kenar çubuğu da aynı bilgiyi istiyor; layout'ların
 * ikisinde ayrı ayrı yazılırsa biri değişince diğeri geride kalır.
 *
 * Hata yutulur: kimlik bloğu bir kolaylıktır, sayfayı düşürmemeli.
 */
export async function kimlikBilgisi(tenant: TenantContext): Promise<{
  eposta: string | null
  tenantAdi: string | null
}> {
  let eposta: string | null = null
  let tenantAdi: string | null = null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    eposta = user?.email ?? null
  } catch (err) {
    console.error('[kimlik] e-posta okunamadı', err)
  }

  try {
    tenantAdi = await withTenant(tenant.tenantId, async (sql) => {
      const rows = await sql`SELECT name FROM tenant WHERE id = ${tenant.tenantId}`
      return (rows[0]?.name as string | undefined) ?? null
    })
  } catch (err) {
    console.error('[kimlik] tenant adı okunamadı', err)
  }

  return { eposta, tenantAdi }
}
