/**
 * Yıllık talep planı — saf hesap.
 *
 * ORTAK BİRİM DAKİKA. Atölyeler karışık ürün diker; 1.000 gömlek ile
 * 1.000 mont aynı yük değildir. Kalem yükü = adet × SAM dk, atölye
 * kapasitesi = operatör × 540 × verim × çalışma günü.
 *
 * Çalışma günü kuralı bant-doluluk.ts ile aynı: yalnız pazar kapalı.
 * workshop_kapasite_gun ADET cinsinden (günlük hedef toplamının yerine);
 * burada o günün oranı olarak uygulanır: override ÷ normal hedef.
 */
import { pazarMi } from './bant-doluluk'
import type { GenelUyum } from './yetenek-uyum'

/** auto-plan/route.ts ile aynı varsayım. */
export const VARDIYA_DK = 540
export const VERIM = 0.85

export type Tahsis = { workshopId: number; ay: number; adet: number }

const iki = (n: number) => String(n).padStart(2, '0')

export function ayGunleri(yil: number, ay: number): string[] {
  const son = new Date(Date.UTC(yil, ay, 0)).getUTCDate()
  return Array.from({ length: son }, (_, i) => `${yil}-${iki(ay)}-${iki(i + 1)}`)
}

/**
 * @param gunlukDk normal bir çalışma gününün dakikası
 * @param oranlar  tarih → o günün normale oranı (override ÷ normal hedef)
 */
export function aylikKapasiteDk(
  yil: number, gunlukDk: number, oranlar: Record<string, number>,
): number[] {
  return Array.from({ length: 12 }, (_, i) =>
    ayGunleri(yil, i + 1).reduce(
      (t, g) => t + (pazarMi(g) ? 0 : gunlukDk * (oranlar[g] ?? 1)), 0))
}

export function esitProfil(): number[] {
  return Array.from({ length: 12 }, () => 100 / 12)
}

export function profilGecerli(p: unknown): p is number[] {
  if (!Array.isArray(p) || p.length !== 12) return false
  if (!p.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)) return false
  return Math.abs(p.reduce((a, b) => a + b, 0) - 100) < 0.05
}

/** Profil yüzdelerini adede çevirir; toplam en büyük kalan yöntemiyle korunur. */
export function aylikAdet(adet: number, profil: number[]): number[] {
  const ham = profil.map((p) => (adet * p) / 100)
  const taban = ham.map(Math.floor)
  let kalan = adet - taban.reduce((a, b) => a + b, 0)
  const sira = ham.map((h, i) => ({ i, k: h - taban[i] })).sort((a, b) => b.k - a.k || a.i - b.i)
  for (const { i } of sira) {
    if (kalan <= 0) break
    taban[i] += 1
    kalan -= 1
  }
  return taban
}

export function yukYuzdesi(yukDk: number, kapasiteDk: number): number | null {
  return kapasiteDk > 0 ? (yukDk / kapasiteDk) * 100 : null
}

export type OneriAdayi = {
  workshopId: number
  puan: number
  uyum: GenelUyum
  /** 12 ay; BU KALEMİN tahsisleri HARİÇ boş dakika. */
  bosDk: number[]
}

/**
 * Açgözlü öneri: her ay için uygun atölyeler puan sırasıyla boş
 * dakikaları kadar doldurulur.
 *
 * Yalnız `uygun` atölye alınır. `bilinmiyor` (künye ya da yetenek kaydı
 * eksik) ENGEL DEĞİLDİR ama öneri onu seçmez — planlamacı elle girebilir.
 * Sığmayan adet zorla atanmaz, `tahsisEdilemeyen` olarak döner.
 * Elle girilmiş tahsisler korunur: önce ihtiyaçtan ve o atölyenin
 * boşluğundan düşülür, öneri yalnız kalanı dağıtır.
 */
export function oneriUret(g: {
  aylikAdet: number[]
  samDk: number
  adaylar: OneriAdayi[]
  elle: Tahsis[]
}): { tahsisler: Tahsis[]; tahsisEdilemeyen: number[] } {
  if (!(g.samDk > 0)) throw new Error('SAM sıfırdan büyük olmalı')
  const sirali = g.adaylar
    .filter((a) => a.uyum === 'uygun')
    .sort((a, b) => b.puan - a.puan || a.workshopId - b.workshopId)

  const tahsisler: Tahsis[] = []
  const tahsisEdilemeyen: number[] = []
  for (let m = 0; m < 12; m++) {
    const ay = m + 1
    const elleAy = g.elle.filter((e) => e.ay === ay)
    let kalan = Math.max(0, (g.aylikAdet[m] ?? 0) - elleAy.reduce((t, e) => t + e.adet, 0))
    for (const a of sirali) {
      if (kalan <= 0) break
      const elleDk = elleAy
        .filter((e) => e.workshopId === a.workshopId)
        .reduce((t, e) => t + e.adet * g.samDk, 0)
      const sigar = Math.floor(Math.max(0, (a.bosDk[m] ?? 0) - elleDk) / g.samDk)
      const al = Math.min(kalan, sigar)
      if (al > 0) {
        tahsisler.push({ workshopId: a.workshopId, ay, adet: al })
        kalan -= al
      }
    }
    tahsisEdilemeyen.push(kalan)
  }
  return { tahsisler, tahsisEdilemeyen }
}
