/**
 * Model operasyon bülteni (Excel) → model_bulten + model_bulten_operasyon.
 *
 * Saf: dosya okumaz. Çağıran xlsx'i okur, sayfaları bu fonksiyonlara verir.
 * Böylece başlık eşlemesi ve sayı çevrimi dosyasız test edilebilir.
 *
 * Beklenen yapı (örnek: pantolon-jean-uretim-case.xlsx):
 *   Bilgi       → Alan | Bilgi  ikilileri
 *   Operasyonlar→ Sıra | 1.Seviye Süreç | 2.Seviye Süreç | 3.Seviye Süreç |
 *                 Çevrim (sn) | Tip | Makine Kodu | Operatör | Öncesi
 */
import type { BultenSatiri } from './bulten-bolum'

export type BultenBilgisi = {
  model_adi: string
  plm_id: string | null
  kumas_tipi: string | null
  sezon: string | null
  siparis_adedi: number | null
  not_metni: string | null
}

/** Bilgi sayfasının tanıdığı alan adları. Tanınmayanlar yok sayılır. */
const BILGI_ALANI: Record<string, keyof BultenBilgisi> = {
  'Model Adı': 'model_adi',
  'Model No / PLM ID': 'plm_id',
  'PLM ID': 'plm_id',
  'Kumaş Tipi': 'kumas_tipi',
  'Sipariş Adedi': 'siparis_adedi',
  'Sezon': 'sezon',
  'Notlar': 'not_metni',
}

function sayi(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function bilgiCoz(satirlar: Array<[unknown, unknown]>): BultenBilgisi {
  const b: BultenBilgisi = {
    model_adi: '', plm_id: null, kumas_tipi: null,
    sezon: null, siparis_adedi: null, not_metni: null,
  }
  for (const [alanHam, degerHam] of satirlar) {
    const alan = BILGI_ALANI[String(alanHam ?? '').trim()]
    if (!alan) continue
    const deger = degerHam === null || degerHam === undefined ? null : String(degerHam).trim()
    if (alan === 'siparis_adedi') b.siparis_adedi = sayi(deger)
    else if (alan === 'model_adi') b.model_adi = deger ?? ''
    else (b as Record<string, unknown>)[alan] = deger
  }
  if (!b.model_adi) {
    throw new Error('Bilgi sayfasında "Model Adı" yok — bültenin kimliği bu alandır')
  }
  return b
}

/** Operasyon satırı başlıkları. Sıra ve süre dışındakiler isteğe bağlı. */
export function operasyonlariCoz(ham: Array<Record<string, unknown>>): BultenSatiri[] {
  const cikti: BultenSatiri[] = []
  for (const r of ham) {
    const sira = sayi(r['Sıra'])
    if (sira === null) continue        // sıra yoksa satır değil
    const metin = (k: string) => {
      const v = r[k]
      if (v === null || v === undefined) return null
      const s = String(v).trim()
      return s === '' ? null : s
    }
    cikti.push({
      sira_no: sira,
      seviye1: metin('1.Seviye Süreç'),
      seviye2: metin('2.Seviye Süreç'),
      seviye3: metin('3.Seviye Süreç'),
      // Süre okunamazsa 0: satırı atmak operasyonu kaybeder, 0 ise
      // toplamı bozmaz ve eksikliği ekranda görünür kalır.
      cevrim_sn: sayi(r['Çevrim (sn)']) ?? 0,
      tip: metin('Tip'),
      makine_kodu: metin('Makine Kodu'),
      oncesi: metin('Öncesi'),
    })
  }
  return cikti
}

export type BultenOzet = { operasyonSayisi: number; toplamSn: number; toplamDk: number }

export function bultenOzeti(satirlar: BultenSatiri[]): BultenOzet {
  const toplamSn = satirlar.reduce((a, s) => a + s.cevrim_sn, 0)
  return { operasyonSayisi: satirlar.length, toplamSn, toplamDk: toplamSn / 60 }
}
