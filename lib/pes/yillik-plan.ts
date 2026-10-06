/**
 * Yıllık plan (v2, basit yapı) — saf hesap ve paylaşılan tipler.
 *
 * HER ŞEY ADET. Atölyenin aylık kapasitesi tek sayıdır (klasmandan
 * bağımsız); planlamacı her ay hangi atölyeye hangi klasmandan kaç adet
 * yaptıracağını kendisi yazar. v1'in dakika/SAM hesabı ve öneri motoru
 * bilerek kaldırıldı (spec 2026-10-06-yillik-plan-basit-design.md).
 *
 * Kapasite öncelik sırası (spec §1):
 *   1. ay düzeltmesi (atolye_kapasite_ay) — 0 dahil, "o ay kapalı"
 *   2. profil bazı (workshop_profil.aylik_kapasite > 0)
 *   3. atölye beyanı (workshop.monthly_capacity > 0; ekranda "beyan")
 *   4. aktif bantların günlük hedef toplamı × çalışma günü (≈ tahmin)
 *   5. yok
 *
 * İstemci bileşenleri de bu dosyayı içe aktarır: sunucuya özgü import YOK.
 */
import { pazarMi } from './bant-doluluk'
import { boyutUyumlari, uyumOzeti, genelUyum, type GenelUyum } from './yetenek-uyum'

export const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

export type KapasiteKaynagi = 'duzeltme' | 'profil' | 'atolye' | 'hedef' | 'yok'

export const KAYNAK_ETIKET: Record<KapasiteKaynagi, string> = {
  duzeltme: 'düzeltme',
  profil: 'profil',
  atolye: 'beyan',
  hedef: 'hedef≈',
  yok: 'kapasite yok',
}

export const KAYNAK_ACIKLAMA: Record<KapasiteKaynagi, string> = {
  duzeltme: 'Bu ay için elle girilen kapasite düzeltmesi',
  profil: 'Atölye profilindeki aylık kapasite',
  atolye: 'Atölye kaydındaki beyan edilen aylık kapasite (workshop.monthly_capacity)',
  hedef: 'Aktif bantların günlük hedef toplamı × ayın çalışma günü (kaba tahmin)',
  yok: 'Kapasite bilgisi yok; doluluk yüzdesi hesaplanamaz',
}

export type Klasman = { code: string; label: string }

/** Plan, fiili sipariş ve talep satırlarının ortak biçimi. Talepte workshopId null. */
export type AySatiri = { workshopId: number | null; ay: number; klasmanKodu: string | null; adet: number }

export type PlanSatiri = {
  id: number
  workshopId: number
  ay: number
  klasmanKodu: string
  adet: number
  notMetni: string | null
}

export type AyDuzeltmesi = { adet: number; sebep: string | null }

export type AtolyeKapasitesi = {
  workshopId: number
  kod: string
  ad: string
  /** workshop_profil.aylik_kapasite (ham; 0/null = baz yok). */
  profilKapasite: number | null
  /** workshop.monthly_capacity (ham; beyan, 0/null = yok). */
  atolyeKapasite: number | null
  /** Aktif bantların daily_target toplamı. */
  gunlukHedef: number
  /** Düzeltmeler hariç bazın kaynağı — satır etiketi. */
  bazKaynak: KapasiteKaynagi
  kapasite: (number | null)[]
  kaynak: KapasiteKaynagi[]
  duzeltme: (AyDuzeltmesi | null)[]
  /** Atölyenin bantlarında kayıtlı klasman kodları (line_capability). */
  klasmanlar: string[]
}

const iki = (n: number) => String(n).padStart(2, '0')

/** Ayın çalışma günü: pazartesi–cumartesi; pazar kapalı (bant-doluluk.ts kuralı). */
export function calismaGunu(yil: number, ay: number): number {
  const son = new Date(Date.UTC(yil, ay, 0)).getUTCDate()
  let n = 0
  for (let g = 1; g <= son; g++) {
    if (!pazarMi(`${yil}-${iki(ay)}-${iki(g)}`)) n++
  }
  return n
}

export function kapasiteCoz(g: {
  duzeltme: number | null
  profil: number | null
  atolye: number | null
  gunlukHedef: number
  calismaGunu: number
}): { adet: number | null; kaynak: KapasiteKaynagi } {
  if (g.duzeltme !== null && g.duzeltme >= 0) return { adet: g.duzeltme, kaynak: 'duzeltme' }
  if (g.profil !== null && g.profil > 0) return { adet: g.profil, kaynak: 'profil' }
  if (g.atolye !== null && g.atolye > 0) return { adet: g.atolye, kaynak: 'atolye' }
  if (g.gunlukHedef > 0 && g.calismaGunu > 0) {
    return { adet: g.gunlukHedef * g.calismaGunu, kaynak: 'hedef' }
  }
  return { adet: null, kaynak: 'yok' }
}

export function yillikKapasite(yil: number, g: {
  duzeltmeler: (number | null)[]
  profil: number | null
  atolye: number | null
  gunlukHedef: number
}): { adet: (number | null)[]; kaynak: KapasiteKaynagi[] } {
  const c = Array.from({ length: 12 }, (_, m) => kapasiteCoz({
    duzeltme: g.duzeltmeler[m] ?? null,
    profil: g.profil,
    atolye: g.atolye,
    gunlukHedef: g.gunlukHedef,
    calismaGunu: calismaGunu(yil, m + 1),
  }))
  return { adet: c.map((x) => x.adet), kaynak: c.map((x) => x.kaynak) }
}

/** Atölye satırı etiketi: düzeltmeler hariç bazın kaynağı. */
export function bazKaynagi(
  profil: number | null, atolye: number | null, gunlukHedef: number,
): KapasiteKaynagi {
  return kapasiteCoz({ duzeltme: null, profil, atolye, gunlukHedef, calismaGunu: 1 }).kaynak
}

/**
 * Doluluk yüzdesi. Kapasite yoksa null. Kapasite 0 (ay kapalı) iken plan
 * varsa sonsuz — kırmızı görünmeli; plan yoksa %0.
 */
export function dolulukYuzdesi(plan: number, kapasite: number | null): number | null {
  if (kapasite === null) return null
  if (kapasite <= 0) return plan > 0 ? Number.POSITIVE_INFINITY : 0
  return (plan / kapasite) * 100
}

export type DolulukRengi = 'yok' | 'yesil' | 'sari' | 'kirmizi'

export function dolulukRengi(y: number | null): DolulukRengi {
  if (y === null) return 'yok'
  if (y > 100) return 'kirmizi'
  if (y > 85) return 'sari'
  return 'yesil'
}

export function yuzdeMetni(y: number | null): string {
  if (y === null) return '—'
  if (!Number.isFinite(y)) return '∞'
  if (y > 0 && y < 1) return '<%1'
  return `%${Math.round(y)}`
}

/** Talep − yerleşen. Negatifse "fazla" olarak döner. */
export function talepAcigi(talep: number, yerlesen: number): { acik: number; fazla: number } {
  return { acik: Math.max(0, talep - yerlesen), fazla: Math.max(0, yerlesen - talep) }
}

/**
 * 12 aylık toplam. `workshopId` verilmezse tüm atölyeler; `klasman`
 * null/undefined ise tüm klasmanlar.
 */
export function ayToplamlari(
  satirlar: AySatiri[],
  f: { workshopId?: number; klasman?: string | null } = {},
): number[] {
  const t = Array<number>(12).fill(0)
  for (const s of satirlar) {
    if (f.workshopId !== undefined && s.workshopId !== f.workshopId) continue
    if (f.klasman != null && s.klasmanKodu !== f.klasman) continue
    if (s.ay >= 1 && s.ay <= 12) t[s.ay - 1] += s.adet
  }
  return t
}

/**
 * Ekran girdisi → adet. Boşluk atılır; nokta yalnız binlik ayracı olarak
 * (1.500, 20.000.000) kabul edilir, boş = 0. "1.5", negatif, harf için null.
 */
export function hucreAdedi(girdi: string): number | null {
  const t = girdi.replace(/\s/g, '')
  if (t === '') return 0
  if (/^\d+$/.test(t) || /^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''))
  return null
}

/** API gövdesindeki adet: yalnız negatif olmayan, INTEGER'a sığan tam sayı (number). */
export function adetGecerli(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 2_147_483_647 ? v : null
}

/**
 * Klasman-yalnız yetenek uyumu — yetenek-uyum.ts kuralları, künye yalnız
 * klasman_kodu. Atölyenin klasman kaydı yoksa "bilinmiyor" (uyumsuz değil).
 */
export function klasmanUyumu(
  kod: string, atolyeKlasmanlari: string[], klasmanIzleniyor: boolean,
): GenelUyum {
  const izlenen = new Set<string>(klasmanIzleniyor ? ['klasman'] : [])
  const yetenek = atolyeKlasmanlari.map((d) => ({ boyut: 'klasman', deger: d }))
  return genelUyum(uyumOzeti(boyutUyumlari({ klasman_kodu: kod }, yetenek, izlenen)))
}

/** Klasman seçiliyken atölye grup sırası: uygun → kontrol edilemedi → uygun değil. */
export const UYUM_SIRASI: Record<GenelUyum, number> = { uygun: 0, bilinmiyor: 1, uyumsuz: 2 }

export const UYUM_GRUP_ETIKET: Record<GenelUyum, string> = {
  uygun: 'Uygun',
  bilinmiyor: 'Kontrol edilemedi (klasman kaydı yok)',
  uyumsuz: 'Uygun değil',
}

const tr = new Intl.NumberFormat('tr-TR')

/** Planlama Masası ipucu: "B021 (20.000), B005 (8.000)". */
export function planIpucuMetni(satirlar: Array<{ kod: string; adet: number }>): string | null {
  if (satirlar.length === 0) return null
  return satirlar.map((s) => `${s.kod} (${tr.format(s.adet)})`).join(', ')
}
