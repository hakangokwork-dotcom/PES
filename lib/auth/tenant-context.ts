import { NextRequest } from 'next/server'
import { cookies, headers } from 'next/headers'
import { ATOLYE_COOKIE, KAPSAM_HEADER, gecerliAtolyeId } from '@/lib/auth/atolye-kapsam'
import { createClient } from '@/lib/supabase/server'
import { getDB } from '@/lib/supabase/db'

const TENANT_COOKIE = 'pma_tenant_id'
const TENANT_HEADER = 'x-tenant-id'

export type TenantContext = {
  tenantId: string
  userId: string
  /** Denetim/geçmiş kayıtlarında "kim yaptı" yazabilmek için. pes_app rolü
      auth şemasını okuyamaz, dolayısıyla e-posta sonradan join'lenemez. */
  userEmail: string | null
  /** 033: kullanıcı bir atölyeye bağlıysa o atölyenin id'si; merkez
      kullanıcısında null. RLS kısıtı buna göre uygulanır. */
  workshopId: number | null
  /** workshopId oturum bağından değil, merkez yöneticisinin atölye
      panelinde yaptığı seçimden geliyor (bkz. lib/auth/atolye-kapsam.ts).
      Yetki açısından fark YOK — bu yalnız "atölye değiştir" bağlantısını
      göstermek ve değiştirmeye izin vermek için. */
  atolyeSecimi: boolean
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
 *
 * `req` OPSİYONELDİR: sayfa/layout gibi server component'lerde NextRequest
 * yoktur. O durumda header adımı atlanır, cookie ve primary tenant kalır —
 * zaten x-tenant-id yalnız API istemcileri için.
 */
export async function getTenantContext(req?: NextRequest | null): Promise<TenantContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const claimedTenantId =
    req?.headers.get(TENANT_HEADER) ||
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

  /* 033: atölye bağı. SECURITY DEFINER — resolve_tenant_context ile aynı
     gerekçe: pes_app rolü workshop_user'ı doğrudan okuyamaz. */
  const wsRows = await sql`
    SELECT resolve_workshop_id(${user.id}::uuid) AS workshop_id
  ` as Array<{ workshop_id: number | null }>

  const isInternalAdmin = tenant_type === 'internal' && (role === 'owner' || role === 'admin')
  const bagliAtolye = wsRows[0]?.workshop_id ?? null
  const secilen = bagliAtolye == null ? await secilenAtolye(isInternalAdmin) : null

  return {
    tenantId: tenant_id,
    userId: user.id,
    userEmail: user.email ?? null,
    workshopId: bagliAtolye ?? secilen,
    atolyeSecimi: secilen != null,
    role,
    tenantType: tenant_type,
    isInternalAdmin,
  }
}

/**
 * Merkez yöneticisinin atölye panelinde seçtiği atölye; kapsam dışındaysa
 * null. Bağlı olmayan kullanıcı için çağrılır. Kurallar ve gerekçe:
 * lib/auth/atolye-kapsam.ts.
 */
export async function secilenAtolye(isInternalAdmin: boolean): Promise<number | null> {
  if (!isInternalAdmin) return null
  if ((await headers()).get(KAPSAM_HEADER) !== '1') return null
  return gecerliAtolyeId((await cookies()).get(ATOLYE_COOKIE)?.value)
}
