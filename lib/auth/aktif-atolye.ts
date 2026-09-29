import { cookies } from 'next/headers'
import { getTenantContext } from '@/lib/auth/tenant-context'

/**
 * Sunucu bileşenleri için "hangi atölyedeyim".
 *
 * İstemci tarafındaki karşılığı components/pes/AktifAtolye.tsx içindeki
 * useAktifAtolyeId(); kural ikisinde de aynı:
 *
 *   1. Oturumdaki atölye — atölyeye bağlı kullanıcı YALNIZ kendi atölyesini
 *      görür; URL'deki wid onu başka yere götürmez.
 *   2. Merkez kullanıcısının "girdiği" atölye (ATOLYE_COOKIE). Seçim
 *      /workshop/gir'den geçer ve panelin HER ekranında aynı kalır. Eskiden
 *      yalnız URL'de taşınıyordu: bir bağlantıda düşünce ekran "Atölye
 *      seçin" diyor, oturum atölyesi bekleyen ekranlar ise kullanıcıyı
 *      merkez ekranına (/pes/...) atıp başka atölyelerin verisini
 *      gösteriyordu.
 *   3. URL'deki wid — eski bağlantılar için geriye uyumluluk.
 *
 * Çerez bir GÜVENLİK sınırı değil (033 ile kısıt RLS'e taşındı) ve bağlı
 * kullanıcıda hiç okunmaz; yalnız merkez kullanıcısına hangi atölyenin
 * gösterileceğini söyler.
 */
export const ATOLYE_COOKIE = 'pes_aktif_atolye'

function gecerliId(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Merkez kullanıcısının seçtiği atölye (çerez); yoksa null. */
export async function secilenAtolyeId(): Promise<number | null> {
  return gecerliId((await cookies()).get(ATOLYE_COOKIE)?.value)
}

export async function aktifAtolyeId(widParam?: string): Promise<number | null> {
  const tenant = await getTenantContext()
  if (tenant?.workshopId) return tenant.workshopId
  return (await secilenAtolyeId()) ?? gecerliId(widParam)
}
