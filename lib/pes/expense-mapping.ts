/**
 * Gider beyan formu → monthly_expense kolon sözlüğü.
 *
 * Migration 021 ile monthly_expense 27 gider kalemine çıktı. Forms/xlsx
 * başlıkları serbest metin olduğu için eşleme burada tek yerde tutulur;
 * form başlığı değişince YALNIZ bu dosya güncellenir.
 *
 * Eşleme normalize edilmiş başlık üzerinden yapılır (küçük harf, Türkçe
 * karakter sadeleştirme, noktalama ve fazla boşluk temizliği) — böylece
 * "Elektrik Gideri (TL)" ile "elektrik gideri" aynı kolona düşer.
 */

export type ExpenseColumn =
  | 'personnel' | 'sgk' | 'food' | 'electricity' | 'water' | 'gas'
  | 'transport' | 'vehicle' | 'cargo' | 'machine_maint' | 'thread' | 'other'
  | 'rent' | 'building_depr' | 'machine_depr' | 'insurance' | 'overtime'
  | 'bonus' | 'severance_reserve' | 'incentive_amount' | 'isg' | 'consulting'
  | 'official_fees' | 'communication' | 'stationery' | 'needle' | 'consumables'

/** Gider kalemi olmayan ama formda gelen alanlar. */
export type MetaColumn = 'work_days' | 'target_revenue' | 'donem' | 'workshop_code' | 'workshop_name'

export const EXPENSE_LABELS: Record<ExpenseColumn, string> = {
  personnel: 'Personel Maaş',
  sgk: 'SGK Primi',
  overtime: 'Fazla Mesai',
  bonus: 'Prim / İkramiye',
  severance_reserve: 'Kıdem Tazminatı Karşılığı',
  food: 'Yemek',
  transport: 'Servis / Ulaşım',
  electricity: 'Elektrik',
  water: 'Su',
  gas: 'Doğalgaz',
  rent: 'Kira',
  building_depr: 'Bina Amortismanı',
  machine_depr: 'Makine Amortismanı',
  machine_maint: 'Makine Bakım',
  thread: 'İplik',
  needle: 'İğne',
  consumables: 'Sarf Malzeme',
  insurance: 'Sigorta',
  isg: 'İSG',
  consulting: 'Danışmanlık',
  official_fees: 'Resmi Harç / Vergi',
  communication: 'Telefon / İnternet',
  stationery: 'Kırtasiye',
  cargo: 'Kargo',
  vehicle: 'Araç',
  incentive_amount: 'Teşvik (mahsup)',
  other: 'Diğer',
}

/**
 * Her kolon için kabul edilen başlık varyantları.
 * Normalize edilmiş halleriyle karşılaştırılır — buraya ham hallerini yazmak yeterli.
 */
const SYNONYMS: Record<ExpenseColumn, string[]> = {
  personnel: ['personel maas', 'maas', 'personel gideri', 'iscilik', 'net maas', 'ucret'],
  sgk: ['sgk', 'sgk primi', 'sigorta primi', 'ssk'],
  overtime: ['fazla mesai', 'mesai', 'ek mesai', 'fm'],
  bonus: ['prim', 'ikramiye', 'prim ikramiye', 'bonus'],
  severance_reserve: ['kidem', 'kidem tazminati', 'kidem tazminati karsiligi', 'ihbar tazminati'],
  food: ['yemek', 'yemek gideri', 'gida'],
  transport: ['servis', 'ulasim', 'servis ulasim', 'personel servisi', 'tasima'],
  electricity: ['elektrik', 'elektrik gideri'],
  water: ['su', 'su gideri'],
  gas: ['dogalgaz', 'gaz', 'dogal gaz'],
  rent: ['kira', 'kira gideri', 'isyeri kirasi'],
  building_depr: ['bina amortismani', 'bina amortisman', 'bina'],
  machine_depr: ['makine amortismani', 'makine amortisman', 'amortisman'],
  machine_maint: ['makine bakim', 'bakim', 'bakim onarim', 'makine bakim onarim', 'teknik servis'],
  thread: ['iplik', 'iplik gideri', 'dikis ipligi'],
  needle: ['igne', 'igne gideri'],
  consumables: ['sarf', 'sarf malzeme', 'sarf malzemesi', 'yardimci malzeme'],
  insurance: ['sigorta', 'bina sigortasi', 'makine sigortasi', 'dask'],
  isg: ['isg', 'is sagligi', 'is guvenligi', 'is sagligi ve guvenligi', 'osgb'],
  consulting: ['danismanlik', 'musavirlik', 'mali musavir', 'muhasebe'],
  official_fees: ['resmi harc', 'harc', 'vergi', 'resmi odemeler', 'belediye'],
  communication: ['telefon', 'internet', 'iletisim', 'telefon internet', 'haberlesme'],
  stationery: ['kirtasiye', 'ofis malzemesi'],
  cargo: ['kargo', 'kargo gideri', 'nakliye'],
  vehicle: ['arac', 'arac gideri', 'akaryakit', 'yakit'],
  incentive_amount: ['tesvik', 'tesvik tutari', 'sgk tesviki', 'devlet destegi'],
  other: ['diger', 'diger giderler', 'muhtelif'],
}

const META_SYNONYMS: Record<MetaColumn, string[]> = {
  work_days: ['calisma gunu', 'is gunu', 'calisilan gun', 'gun sayisi'],
  target_revenue: ['hedef ciro', 'ciro', 'hedef gelir'],
  donem: ['donem', 'ay', 'tarih', 'ay yil'],
  workshop_code: ['atolye kodu', 'kod', 'firma kodu'],
  workshop_name: ['atolye', 'atolye adi', 'firma', 'firma adi', 'unvan'],
}

/** Türkçe karakterleri sadeleştirip başlığı karşılaştırılabilir hale getirir. */
export function normalizeHeader(raw: string): string {
  return raw
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\(.*?\)/g, ' ')      // "(TL)" gibi birim eklerini at
    .replace(/[^a-z0-9\s]/g, ' ')  // noktalama
    .replace(/\s+/g, ' ')
    .trim()
}

const EXPENSE_LOOKUP = buildLookup(SYNONYMS)
const META_LOOKUP = buildLookup(META_SYNONYMS)

function buildLookup<K extends string>(source: Record<K, string[]>): Map<string, K> {
  const map = new Map<string, K>()
  for (const [col, variants] of Object.entries(source) as [K, string[]][]) {
    map.set(normalizeHeader(col), col)          // kolon adının kendisi de geçerli
    for (const v of variants) map.set(normalizeHeader(v), col)
  }
  return map
}

/** Form başlığını gider kolonuna eşler; tanınmazsa null. */
export function matchExpenseColumn(header: string): ExpenseColumn | null {
  return EXPENSE_LOOKUP.get(normalizeHeader(header)) ?? null
}

/** Form başlığını meta alanına eşler; tanınmazsa null. */
export function matchMetaColumn(header: string): MetaColumn | null {
  return META_LOOKUP.get(normalizeHeader(header)) ?? null
}

export type HeaderMapping = {
  expense: Partial<Record<ExpenseColumn, string>>   // kolon → kaynak başlık
  meta: Partial<Record<MetaColumn, string>>
  unmatched: string[]
}

/**
 * Bir başlık satırını tam eşleme raporuna çevirir.
 * Import ekranı bunu kullanıcıya gösterir: neyin nereye gittiği, neyin atlandığı.
 */
export function mapHeaders(headers: string[]): HeaderMapping {
  const result: HeaderMapping = { expense: {}, meta: {}, unmatched: [] }

  for (const h of headers) {
    if (!h?.trim()) continue
    const expenseCol = matchExpenseColumn(h)
    if (expenseCol && !result.expense[expenseCol]) {
      result.expense[expenseCol] = h
      continue
    }
    const metaCol = matchMetaColumn(h)
    if (metaCol && !result.meta[metaCol]) {
      result.meta[metaCol] = h
      continue
    }
    result.unmatched.push(h)
  }

  return result
}

/** "1.234,56 TL" / "1,234.56" gibi serbest sayı metnini number'a çevirir. */
export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const s = String(value).replace(/[^\d,.-]/g, '').trim()
  if (!s) return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  // Ondalık ayırıcı: hangisi sonda ise o. Diğeri binlik ayırıcıdır.
  let normalized: string
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, '')
  } else {
    normalized = s
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}
