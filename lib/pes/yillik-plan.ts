/**
 * Yıllık talep planı — saf hesap.
 *
 * ORTAK BİRİM DAKİKA. Atölyeler karışık ürün diker; 1.000 gömlek ile
 * 1.000 mont aynı yük değildir. Kalem yükü = adet × SAM dk, atölye
 * kapasitesi = günlük dakika (gunlukKapasite zinciri) × çalışma günü.
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

export type KapasiteKaynagi = 'operator' | 'calisan' | 'hedef' | 'yok'

/** Kesim ve UKP personeli dikimci olmadığından toplam çalışanın dikim payı. */
export function dikimPayi(kesimOrani: number, ukpOrani: number): number {
  const d = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0)
  return 1 / (1 + d(kesimOrani) + d(ukpOrani))
}

/**
 * Normal bir çalışma gününün dakikası; veri varlığına göre zincir:
 * operatör → çalışan (dikim payıyla) → günlük hedef × SAM → yok.
 */
export function gunlukKapasite(g: {
  operator: number; calisan: number; dikimPayi: number; hedefAdet: number; samDk: number | null
}): { dk: number | null; kaynak: KapasiteKaynagi } {
  if (g.operator > 0) return { dk: g.operator * VARDIYA_DK * VERIM, kaynak: 'operator' }
  if (g.calisan > 0) return { dk: g.calisan * g.dikimPayi * VARDIYA_DK * VERIM, kaynak: 'calisan' }
  if (g.hedefAdet > 0 && g.samDk !== null && g.samDk > 0) {
    return { dk: g.hedefAdet * g.samDk, kaynak: 'hedef' }
  }
  return { dk: null, kaynak: 'yok' }
}

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

/**
 * Profili toplam 100 olacak şekilde ölçekler (2 ondalık). Yuvarlama artığı
 * en büyük aya yazılır. Toplam sıfır/geçersizse eşit profilden başlanır.
 */
export function profilNormalle(p: number[]): number[] {
  const temiz = p.map((x) => (Number.isFinite(x) && x > 0 ? x : 0))
  const toplam = temiz.reduce((a, b) => a + b, 0)
  const kaynak = toplam > 0 ? temiz : esitProfil()
  const t = kaynak.reduce((a, b) => a + b, 0)
  const r = kaynak.map((x) => Math.round((x * 10000) / t) / 100)
  const artik = Math.round((100 - r.reduce((a, b) => a + b, 0)) * 100) / 100
  const en = r.indexOf(Math.max(...r))
  r[en] = Math.round((r[en] + artik) * 100) / 100
  return r
}

/**
 * Hücre girdisi → adet. Türkçe binlik nokta ve boşluk atılır; boş = 0
 * (sil). Negatif/ondalık/harf için null.
 */
export function hucreAdedi(girdi: string): number | null {
  const t = girdi.replace(/[.\s]/g, '')
  if (t === '') return 0
  return /^\d+$/.test(t) ? Number(t) : null
}

/** Profil yüzdelerini adede çevirir; toplam en büyük kalan yöntemiyle korunur. */
export function aylikAdet(adet: number, profil: number[]): number[] {
  /* Profil DB'de NUMERIC(6,2): 8,33×12 = 99,96. 100'e bölmek adet kaybettirir;
     kendi toplamına göre normalize edilir. */
  const toplam = profil.reduce((a, b) => a + b, 0)
  if (!(toplam > 0)) return profil.map(() => 0)
  const ham = profil.map((p) => (adet * p) / toplam)
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
 * Elle girilmiş tahsisler korunur: ihtiyaçtan düşülür ve o (atölye, ay)
 * çiftine öneri yazılmaz; öneri kalanı diğer atölyelere dağıtır.
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
      /* (atölye, ay) çiftinde elle satır varsa öneri yazılamaz (tekil anahtar). */
      if (elleAy.some((e) => e.workshopId === a.workshopId)) continue
      const sigar = Math.floor(Math.max(0, a.bosDk[m] ?? 0) / g.samDk)
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
