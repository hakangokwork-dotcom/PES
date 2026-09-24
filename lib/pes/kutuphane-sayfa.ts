/**
 * Operasyon zamanı kütüphanesi dosyasının sayfa tanımları.
 *
 * Kaynak: PES/Konfeksiyon_operasyonları/konfeksiyon_veri_modeli.xlsx
 * Hedef:  migration 012'nin ref_* tabloları (kurulu, boş).
 *
 * İKİ ÖLÇÜLMÜŞ TUZAK:
 *
 * 1. Başlık satırı sayfaya göre değişiyor. Altı sayfa "başlık metni /
 *    boş / kolon adları / veri" düzeninde (kolonlar r3). 04_operasyon_grup
 *    ise doğrudan kolon adlarıyla başlıyor (r1). Tek offset varsayılırsa
 *    o sayfanın ilk grubu ya kaybolur ya başlık veri olarak yazılır.
 *
 * 2. 02_ek_parca_tipi'nin id=1 satırında ad BOŞ, ama ref_ek_parca_tipi.ad
 *    NOT NULL ve 03_ek_parca_varyant'ta bir varyant bu id'ye bağlı.
 *    Satır atılamaz (yabancı anahtar kırılır), boş da yazılamaz —
 *    adDuzelt() yer tutucu koyar ve kayıp görünür kalır.
 */

export type SayfaTanimi = {
  /** Hedef ref_ tablosu. */
  tablo: string
  /** Kolon adlarının bulunduğu 1-tabanlı satır numarası. Veri bir sonrakinden. */
  baslikSatiri: number
  /** Kolon adları — hedef tablonun kolonlarıyla birebir. */
  kolonlar: string[]
  /** Beklenen veri satırı sayısı; import bunu doğrular. */
  beklenenSatir: number
}

export const SAYFALAR: Record<string, SayfaTanimi> = {
  '01_urun_tipi': {
    tablo: 'ref_urun_tipi',
    baslikSatiri: 3,
    kolonlar: ['id', 'klasman_ad', 'segment', 'kumas_grubu', 'urun_grubu', 'kol_tipi', 'ozellik'],
    beklenenSatir: 117,
  },
  '02_ek_parca_tipi': {
    tablo: 'ref_ek_parca_tipi',
    baslikSatiri: 3,
    kolonlar: ['id', 'ad'],
    beklenenSatir: 464,
  },
  '03_ek_parca_varyant': {
    tablo: 'ref_ek_parca_varyant',
    baslikSatiri: 3,
    kolonlar: ['id', 'ek_parca_tipi_id', 'tam_ad', 'ozellikler'],
    beklenenSatir: 1270,
  },
  // TUZAK: başlık r1'de, veri r2'den. Diğer altı sayfadan farklı.
  '04_operasyon_grup': {
    tablo: 'ref_operasyon_grup',
    baslikSatiri: 1,
    kolonlar: ['id', 'ad'],
    beklenenSatir: 273,
  },
  '05_operasyon': {
    tablo: 'ref_operasyon',
    baslikSatiri: 3,
    kolonlar: ['id', 'ad', 'makine_tipi_id', 'skill_level', 'setup_suresi'],
    beklenenSatir: 1338,
  },
  '06_makine_tipi': {
    tablo: 'ref_makine_tipi',
    baslikSatiri: 3,
    kolonlar: ['id', 'ad', 'aciklama'],
    beklenenSatir: 17,
  },
  '07_operasyon_zamani': {
    tablo: 'ref_operasyon_zamani',
    baslikSatiri: 3,
    kolonlar: [
      'id', 'urun_tipi_id', 'ek_parca_varyant_id', 'operasyon_grup_id', 'operasyon_id',
      'mtm', 'mtm_min', 'mtm_max', 'mtm_ortalama', 'mtm_std',
      'orneklem', 'varyasyon_yuzde', 'guven_seviyesi',
    ],
    beklenenSatir: 30319,
  },
}

export type HamSatir = Array<unknown>
export type Kayit = Record<string, unknown>

/**
 * Ham satırları kolon adlarıyla eşler.
 *
 * Tamamen boş satır ve id'si boş satır atılır: id olmadan yabancı anahtar
 * kurulamaz, o satıra bağlı çocuk kayıtlar zaten yüklenemez.
 */
export function satirlariCoz(kolonlar: string[], hamSatirlar: HamSatir[]): Kayit[] {
  const cikti: Kayit[] = []
  for (const ham of hamSatirlar) {
    if (!ham || ham.every(h => h === null || h === undefined || h === '')) continue
    const kayit: Kayit = {}
    kolonlar.forEach((k, i) => {
      const v = ham[i]
      kayit[k] = v === undefined || v === '' ? null : v
    })
    if (kayit.id === null) continue
    cikti.push(kayit)
  }
  return cikti
}

/**
 * NOT NULL ad kolonları için: boş adı yer tutucuyla doldurur.
 * Kayıt silinmez çünkü çocuk tablolar id'ye bağlı; yer tutucu sayesinde
 * eksik veri ekranda görünür kalır ve sonradan düzeltilebilir.
 */
export function adDuzelt(ad: unknown, id: number | string): string {
  const s = ad === null || ad === undefined ? '' : String(ad).trim()
  return s === '' ? `(adsız #${id})` : s
}
