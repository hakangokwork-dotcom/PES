import { getTenantContext } from '@/lib/auth/tenant-context'
import { gecerliAtolyeId } from '@/lib/auth/atolye-kapsam'

/**
 * Sunucu bileşenleri için "hangi atölyedeyim".
 *
 * Asıl cevap oturumdadır: atölye hesabının kendi atölyesi ya da merkez
 * yöneticisinin atölye panelinde seçtiği atölye — ikisi de
 * TenantContext.workshopId olarak gelir (bkz. lib/auth/atolye-kapsam.ts).
 *
 * URL'deki wid yalnız ikisi de yokken okunur. Merkez yöneticisinin eski
 * `?wid=` bağlantıları proxy'de /workshop/gir'e çevrildiği için bu yol
 * pratikte artık kullanılmıyor; eski yer imleri için duruyor.
 */
export async function aktifAtolyeId(widParam?: string): Promise<number | null> {
  const tenant = await getTenantContext()
  return tenant?.workshopId ?? gecerliAtolyeId(widParam)
}
