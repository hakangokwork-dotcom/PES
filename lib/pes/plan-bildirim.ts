/**
 * Plan bildirimleri — gecikme ve çit içi değişiklik.
 *
 * İKİ YÖN, TEK MEKANİZMA. İkisi de aynı cümleyi kuruyor: "kararlaştırdığımız
 * tarih tutmuyor, sebebi şu."
 *
 *   gecikme     atölye → planlamacı
 *   degisiklik  planlamacı → atölye (zaman çiti içinde plan değişti)
 *
 * TNA (Time & Action) takviminin karşılığı: planlanan tarih, gerçekleşen
 * tarih, GECİKME GÜNÜ, açıklama.
 *
 * GECİKME GÜNÜ SAKLANMAZ, TÜRETİLİR. Saklansaydı tarih düzeltilince
 * sessizce yanlış kalırdı — E3'teki "bitiş tarihini saklama" kuralının
 * aynısı.
 */
import type { GerekceKodu } from './plan-onay'

export type BildirimTipi = 'gecikme' | 'degisiklik'

export const TIP_ETIKET: Record<BildirimTipi, string> = {
  gecikme: 'Gecikme bildirimi',
  degisiklik: 'Plan değişikliği',
}

export type Bildirim = {
  id: number
  tip: BildirimTipi
  workOrderId: number
  workshopId: number
  eskiBitis: string | null
  yeniBitis: string
  gerekceKodu: GerekceKodu
  not: string | null
  olusturulma: string
  okunduAt: string | null
}

/** b − a, gün. Tarihler 'YYYY-MM-DD'; UTC ile saat dilimi taşımaz. */
export function gunFarki(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((t(b) - t(a)) / 86_400_000)
}

/**
 * Gecikme günü.
 *
 * Eski tarih bilinmiyorsa NULL döner — 0 DEĞİL. "Kayma yok" ile
 * "karşılaştıracak tarih yok" farklı şeylerdir; 0 yazmak ikinci durumu
 * "zamanında" gibi gösterirdi.
 *
 * Negatif değer ERKENE ÇEKME demektir ve gizlenmez: plan öne alındıysa
 * bu da haberdir.
 */
export function gecikmeGunu(b: Pick<Bildirim, 'eskiBitis' | 'yeniBitis'>): number | null {
  if (!b.eskiBitis) return null
  return gunFarki(b.eskiBitis, b.yeniBitis)
}

export type BildirimHatasi = { alan: string; mesaj: string }

/** Bildirim yazılabilir mi. Kurallar veritabanı CHECK'leriyle aynı. */
export function bildirimDogrula(g: {
  tip: string
  yeniBitis: string
  gerekceKodu: string | null
  not: string | null
}): BildirimHatasi[] {
  const h: BildirimHatasi[] = []

  if (g.tip !== 'gecikme' && g.tip !== 'degisiklik') {
    h.push({ alan: 'tip', mesaj: "tip 'gecikme' ya da 'degisiklik' olmalı." })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.yeniBitis)) {
    h.push({ alan: 'yeniBitis', mesaj: 'Yeni bitiş tarihi YYYY-AA-GG olmalı.' })
  }
  if (!g.gerekceKodu) {
    h.push({ alan: 'gerekceKodu', mesaj: 'Gerekçe zorunlu: tarih değiştiyse sebebi de bilinmeli.' })
  }
  if (g.gerekceKodu === 'DIGER' && !g.not?.trim()) {
    h.push({ alan: 'not', mesaj: '"Diğer" seçildiğinde açıklama zorunlu.' })
  }
  return h
}

export type BildirimOzeti = {
  toplam: number
  okunmamis: number
  /** En büyük gecikme, gün. Hiç hesaplanamıyorsa null. */
  enBuyukGecikme: number | null
  /** Erkene çekilen bildirim sayısı. */
  erkeneCekilen: number
}

export function bildirimOzeti(bildirimler: Bildirim[]): BildirimOzeti {
  const gunler = bildirimler
    .map(gecikmeGunu)
    .filter((g): g is number => g !== null)

  return {
    toplam: bildirimler.length,
    okunmamis: bildirimler.filter((b) => b.okunduAt === null).length,
    enBuyukGecikme: gunler.length ? Math.max(...gunler) : null,
    erkeneCekilen: gunler.filter((g) => g < 0).length,
  }
}

/**
 * Bir planlama değişikliği zaman çiti içinde mi — yani atölyeye
 * bildirilmeli mi?
 *
 * Kullanıcı kararı (2026-09-25): çit ENGELLEMEZ, uyarır ve değişiklik
 * atölyeye BİLDİRİLİR. Sessizce değişen bir plan, onay mekanizmasını
 * anlamsız kılar.
 */
export function bildirimGerekir(
  bugun: string,
  eskiBaslangic: string,
  citGun: number,
): boolean {
  return gunFarki(bugun, eskiBaslangic) < citGun
}
