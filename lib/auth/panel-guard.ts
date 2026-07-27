import { redirect } from 'next/navigation'
import { getTenantContext, type TenantContext } from '@/lib/auth/tenant-context'

/**
 * Panel erişim kontrolü — /pes ve /workshop layout'larından çağrılır.
 *
 * NEDEN LAYOUT'TA: koruma daha önce sayfa sayfa `redirect('/login')` ile
 * yapılıyordu ve 46 sayfanın 35'inde unutulmuştu — /workshop/vsm gibi
 * sayfalar oturumsuz açılıyordu. Layout tek giriş noktasıdır: altındaki
 * her rota otomatik kapsanır, yeni sayfa eklenince koruma unutulamaz.
 *
 * PANEL AYRIMI:
 *   /pes      → yönetim paneli. Yalnız internal tenant'ın owner/admin'i.
 *   /workshop → kullanıcı (atölye) paneli. Herkes girebilir; yöneticinin de
 *               atölye ekranlarını görmesi gerekir (destek/kontrol).
 *
 * ROL TEK BAŞINA YETMEZ: bir atölye hesabı da kendi tenant'ında 'owner'dır
 * (atolye@pes.local, demo-atolye tenant'ı). Yönetim panelini açan şey
 * "owner olmak" değil, INTERNAL tenant'ta owner/admin olmaktır — yani
 * TenantContext.isInternalAdmin. Bunu role bakarak taklit etmeye çalışmak
 * atölye sahiplerini yanlışlıkla yönetim paneline sokar.
 *
 * Yetkisiz kullanıcı /pes'e girmeye çalışırsa 403 değil, kendi paneline
 * yönlendirilir — "yasak" değil, "burası senin yerin değil".
 */

export type Panel = 'yonetim' | 'atolye'

/** Kullanıcının paneli — giriş sonrası nereye gideceğini de bu belirler. */
export function panelFor(tenant: TenantContext): Panel {
  return tenant.isInternalAdmin ? 'yonetim' : 'atolye'
}

export const PANEL_YOLU: Record<Panel, string> = {
  yonetim: '/pes',
  atolye: '/workshop',
}

/**
 * Oturumu ve rolü doğrular; uygunsa context döner, değilse yönlendirir.
 * `redirect()` throw ettiği için dönüş tipi null içermez.
 */
export async function requirePanel(panel: Panel): Promise<TenantContext> {
  const tenant = await getTenantContext()
  if (!tenant) redirect('/login')

  if (panelFor(tenant) !== panel) {
    redirect(PANEL_YOLU[panelFor(tenant)])
  }
  return tenant
}

/** Yalnız oturum arar, rol ayrımı yapmaz (atölye paneli: her rol girebilir). */
export async function requireSession(): Promise<TenantContext> {
  const tenant = await getTenantContext()
  if (!tenant) redirect('/login')
  return tenant
}
