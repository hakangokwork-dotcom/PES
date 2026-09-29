/**
 * MERKEZDEN ATÖLYEYE GİRİŞ — kapsam kuralları.
 *
 * Atölye paneli, her atölyenin ileride KENDİ hesabıyla girip kendi işini
 * yöneteceği yer. Bugün atölye hesapları henüz açılmadığı için merkez
 * yöneticisi paneli bir atölyeyi seçerek kullanıyor; seçim, o atölyenin
 * hesabıyla girmekle BİREBİR aynı olmalı: aynı ekranlar, aynı RLS kısıtı,
 * aynı yazma yetkileri. Hesaplar açıldığında hiçbir ekran değişmez —
 * yalnız atölyeyi seçim yerine oturum belirler.
 *
 * Nasıl: seçim ATOLYE_COOKIE çerezinde durur; getTenantContext ve
 * withServerTenant onu `workshopId` olarak döndürür (bkz.
 * lib/auth/tenant-context.ts → secilenAtolye). Üç şart birden gerekir:
 *   1. kullanıcı bir atölyeye bağlı DEĞİL (bağlıysa kendi atölyesi geçerli)
 *   2. kullanıcı internal admin (merkez yöneticisi) — başka kimse seçemez
 *   3. istek ATÖLYE PANELİNE ait (KAPSAM_HEADER)
 *
 * NEDEN 3. ŞART: çerez tarayıcı genelinde. Kapsam her istekte uygulansaydı
 * merkez paneli (/pes) de seçili atölyeye daralırdı; iki sekmede biri /pes
 * biri /workshop açıkken birbirini bozardı. Proxy her isteği işaretler:
 * sayfa yolu /workshop ise, API çağrısı da /workshop sayfasından
 * geliyorsa (Referer) atölye kapsamındadır. İstemcinin yolladığı başlık
 * proxy'de her zaman silinip yeniden yazılır — taklit edilemez.
 *
 * Bu dosya BAĞIMLILIKSIZ: proxy'den de içe aktarılıyor.
 */
export const ATOLYE_COOKIE = 'pes_aktif_atolye'
export const KAPSAM_HEADER = 'x-pes-atolye-kapsami'

function atolyeYoluMu(yol: string): boolean {
  return yol === '/workshop' || yol.startsWith('/workshop/')
}

/** İstek atölye paneline mi ait? (proxy'de hesaplanır) */
export function atolyeKapsamindaMi(url: URL, referer: string | null): boolean {
  if (atolyeYoluMu(url.pathname)) return true
  if (!url.pathname.startsWith('/api/') || !referer) return false
  try {
    const r = new URL(referer)
    return r.origin === url.origin && atolyeYoluMu(r.pathname)
  } catch {
    return false
  }
}

export function gecerliAtolyeId(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}
