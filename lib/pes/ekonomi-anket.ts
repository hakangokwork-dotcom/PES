/**
 * Atölye gider anketi (Atolye_Gider_Model.xlsx VERI_GIRIS) → PES tipleri.
 *
 * VERI_GIRIS satır 1: "Tutarlar aylık TL." Gider kalemleri ZATEN aylıktır,
 * bölünmez. Bölünen tek şey cirodur:
 *   aylık ciro = Kesilen fatura toplamı ÷ Fatura dönemi (ay)
 *
 * Anket birden fazla ayı kapsıyorsa her ay aynı aylık değerleri alır ve
 * hepsi 'turetilmis' işaretlenir — çünkü bu, üç ayın ayrı ölçümü değil,
 * üçüne birden atfedilen bir ortalamadır. Ekranda gri gösterilir.
 *
 * Anketin HANGİ AYDAN başladığı Excel'de yoktur; çağıran zorunlu olarak
 * verir (import script'inde --baslangic). Tahmin edilmez.
 */
import { matchExpenseColumn, parseAmount } from './expense-mapping'
import type { EkonomiSatiri, GiderSatiri } from './ekonomi-tipler'

/**
 * VERI_GIRIS'e özel başlıklar. Genel sözlük bunları doğru yere koyamaz
 * çünkü normalizeHeader parantez içini atıyor:
 *   "Diğer (telefon, internet)" → "diger" → other
 * Oysa Excel'de bu başlık telefon ve interneti kastediyor.
 */
const OZEL_BASLIK: Partial<Record<string, keyof GiderSatiri>> = {
  'Diğer (telefon, internet)': 'communication',
}

/**
 * Tek Excel başlığının birden fazla PES kalemini kapsadığı yerler.
 * Ayrıştırılamaz; hangi kolona toplandığı raporlanır.
 */
const BIRLESIK_ALANLAR: Record<string, string> = {
  'İğne ve iplik': 'İğne ve iplik → thread',
}

export type CozulmusAnket = {
  kisaAd: string
  unvan: string | null
  bolge: number | null
  klasmanlar: string[]
  aySayisi: number
  gider: GiderSatiri
  ekonomi: EkonomiSatiri
  birlesikAlanlar: string[]
}

/** "6.Bölge" → 6. Tanınmayan biçimde null. */
function bolgeCoz(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const m = /(\d)/.exec(String(v))
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 6 ? n : null
}

export function anketSatiriCoz(ham: Record<string, unknown>): CozulmusAnket {
  const gider: GiderSatiri = { incentive_amount: null }
  const birlesik: string[] = []

  // Başlık sözlüğü expense-mapping.ts'te tek yerde yaşar. Burada yalnız
  // VERI_GIRIS'e özel istisnalar geçersiz kılar.
  for (const baslik of Object.keys(ham)) {
    const kolon = OZEL_BASLIK[baslik] ?? matchExpenseColumn(baslik)
    if (!kolon) continue
    const deger = parseAmount(ham[baslik])
    if (deger === null) continue
    ;(gider as Record<string, number | null>)[kolon] = deger
    if (BIRLESIK_ALANLAR[baslik]) birlesik.push(BIRLESIK_ALANLAR[baslik])
  }

  // İğne kalemi ayrı sorulmadığı sürece boş kalır; toplamı thread taşır.
  if (gider.needle === undefined) gider.needle = null

  const ayHam = parseAmount(ham['Fatura dönemi (ay)'])
  const aySayisi = ayHam && ayHam > 0 ? Math.round(ayHam) : 1
  const fatura = parseAmount(ham['Kesilen fatura toplamı (TL)'])

  const ekonomi: EkonomiSatiri = {
    revenue_declared: fatura === null ? null : fatura / aySayisi,
    idle_days: parseAmount(ham['Boş / dışarı çalışılan gün (aylık ort.)']),
    qty_declared: parseAmount(ham['Aylık adet (bant kapasitesi)']),
    nominal_days: parseAmount(ham['Aylık nominal çalışma günü']),
    actual_days: parseAmount(ham['Fiili çalışma günü (aylık ort.)']),
    hours_per_day: parseAmount(ham['Günlük çalışma saati']),
    cutting_staff: parseAmount(ham['Kesim kişi']),
    sewing_staff: parseAmount(ham['Dikim kişi']),
    ukp_staff: parseAmount(ham['UKP kişi (ütü-kontrol-paket)']),
    office_staff: parseAmount(ham['Ofis kişi']),
    area_m2: parseAmount(ham['Üretim alanı (m²)']),
    source: aySayisi > 1 ? 'turetilmis' : 'anket',
  }

  const klasmanHam = ham['Klasman (Taha Giyim tedarik yönetimi)']
  const klasmanlar = klasmanHam
    ? String(klasmanHam).split(';').map(s => s.trim()).filter(Boolean)
    : []

  return {
    kisaAd: String(ham['Kısa ad'] ?? '').trim(),
    unvan: ham['İşletme unvanı'] ? String(ham['İşletme unvanı']).trim() : null,
    bolge: bolgeCoz(ham['Teşvik bölgesi']),
    klasmanlar,
    aySayisi,
    gider,
    ekonomi,
    birlesikAlanlar: birlesik,
  }
}

export type AylikSatir = {
  year: number
  month: number
  gider: GiderSatiri
  ekonomi: EkonomiSatiri
}

/**
 * Anketi kapsadığı aylara yayar. Gider kalemleri zaten aylık olduğu için
 * bölünmez; her ay aynı tutarları taşır ve çok aylıysa 'turetilmis' olur.
 *
 * @param baslangic 'YYYY-MM' — anketin kapsadığı ilk ay. Zorunlu.
 */
export function anketiAylaraBol(c: CozulmusAnket, baslangic: string): AylikSatir[] {
  const m = /^(\d{4})-(\d{2})$/.exec(baslangic.trim())
  if (!m) throw new Error(`Geçersiz başlangıç ayı: "${baslangic}" — YYYY-MM bekleniyor`)
  const yil = Number(m[1])
  const ay = Number(m[2])
  if (ay < 1 || ay > 12) throw new Error(`Geçersiz başlangıç ayı: "${baslangic}" — ay 1-12 olmalı`)

  const satirlar: AylikSatir[] = []
  for (let i = 0; i < c.aySayisi; i++) {
    const toplam = (ay - 1) + i
    satirlar.push({
      year: yil + Math.floor(toplam / 12),
      month: (toplam % 12) + 1,
      gider: { ...c.gider },
      ekonomi: { ...c.ekonomi },
    })
  }
  return satirlar
}

/**
 * FORMULLER!E12 uyarısı: net gider = brüt − teşvik kuralı SGK'nın BRÜT
 * bildirildiğini varsayar. Teşvik SGK'dan büyükse SGK net bildirilmiş
 * demektir ve teşvik iki kez düşülür — net gider olduğundan düşük çıkar.
 *
 * Örssan pilotu bu durumda: SGK 200 bin, teşvik 1,3 milyon.
 */
export function sgkSupheliMi(g: Pick<GiderSatiri, 'sgk' | 'incentive_amount'>): boolean {
  if (g.sgk === null || g.sgk === undefined) return false
  if (g.incentive_amount === null || g.incentive_amount === undefined) return false
  return g.incentive_amount > g.sgk
}
