import { getTenantContext } from '@/lib/auth/tenant-context'

/**
 * Sunucu bileşenleri için "hangi atölyedeyim".
 *
 * İstemci tarafındaki karşılığı components/pes/AktifAtolye.tsx içindeki
 * useAktifAtolyeId(); kural ikisinde de aynı: URL'deki wid > oturumdaki
 * atölye. Merkez kullanıcısında oturum atölyesi yoktur ve davranış
 * eskisi gibi kalır (wid yoksa "atölye seçin").
 *
 * wid bir GÜVENLİK sınırı değil (033 ile kısıt RLS'e taşındı); yalnız
 * hangi atölyenin gösterileceğini söyler. Atölye kullanıcısı elle başka
 * bir id yazsa da veritabanı boş döner.
 */
export async function aktifAtolyeId(widParam?: string): Promise<number | null> {
  const w = Number(widParam)
  if (Number.isInteger(w) && w > 0) return w

  const tenant = await getTenantContext()
  return tenant?.workshopId ?? null
}
