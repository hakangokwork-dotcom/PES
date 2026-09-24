/**
 * Veri talebi — bir dönemin ekonomi verisi ne kadar tamam?
 *
 * TALEBİN DURUMU KOLONDA TUTULMAZ. `economy_data_request`'te "dolduruldu"
 * diye bir alan yok, çünkü o alan `workshop_economy` güncellenince saparadı
 * ve ekran yalan söylerdi. Doluluk her zaman satırın kendisinden TÜRETİLİR.
 *
 * "Eksik" ile "sıfır" ayrı: 0 kişilik ofis kadrosu geçerli bir cevaptır,
 * boş bırakılmış ofis kadrosu değildir. Bu yüzden kontrol `=== null`,
 * `!deger` değil — `!0` doğru döner ve sıfırı eksik sayardı.
 */

/** Rasyoların hesaplanabilmesi için gereken alanlar. */
export const ZORUNLU_ALANLAR = [
  { alan: 'revenue_declared', etiket: 'Aylık ciro' },
  { alan: 'qty_declared', etiket: 'Aylık adet' },
  { alan: 'nominal_days', etiket: 'Nominal gün' },
  { alan: 'actual_days', etiket: 'Fiili gün' },
  { alan: 'hours_per_day', etiket: 'Günlük saat' },
  { alan: 'cutting_staff', etiket: 'Kesim kişi' },
  { alan: 'sewing_staff', etiket: 'Dikim kişi' },
  { alan: 'ukp_staff', etiket: 'UKP kişi' },
  { alan: 'office_staff', etiket: 'Ofis kişi' },
] as const

/** Hesap için şart değil ama karneyi iyileştirir. */
export const ISTEGE_BAGLI_ALANLAR = [
  { alan: 'idle_days', etiket: 'Boş gün' },
  { alan: 'area_m2', etiket: 'Alan (m²)' },
] as const

export type EkonomiKayit = Record<string, unknown> | null | undefined

/** Doldurulmamış zorunlu alanların etiketleri. */
export function eksikAlanlar(kayit: EkonomiKayit): string[] {
  if (!kayit) return ZORUNLU_ALANLAR.map((z) => z.etiket)
  return ZORUNLU_ALANLAR
    .filter((z) => kayit[z.alan] === null || kayit[z.alan] === undefined)
    .map((z) => z.etiket)
}

export type Doluluk = 'veri-yok' | 'eksik' | 'gider-yok' | 'tam'

/**
 * Dönemin durumu.
 *
 * `gider-yok` ayrı bir durum: ekonomi satırı eksiksiz olsa bile gider
 * gelmeden kâr, marj ve dakika maliyeti hesaplanamaz — ekranda "tam"
 * görünüp rasyoların boş çıkması en kafa karıştırıcı hâl olurdu.
 */
export function doluluk(kayit: EkonomiKayit, giderVar: boolean): Doluluk {
  if (!kayit) return 'veri-yok'
  if (eksikAlanlar(kayit).length > 0) return 'eksik'
  if (!giderVar) return 'gider-yok'
  return 'tam'
}

export const DOLULUK_ETIKET: Record<Doluluk, string> = {
  'veri-yok': 'Veri yok',
  eksik: 'Eksik',
  'gider-yok': 'Gider bekleniyor',
  tam: 'Tam',
}

/** Tamamlanma oranı (0–1); ekranda çubuk için. */
export function tamamlanmaOrani(kayit: EkonomiKayit): number {
  if (!kayit) return 0
  const eksik = eksikAlanlar(kayit).length
  return (ZORUNLU_ALANLAR.length - eksik) / ZORUNLU_ALANLAR.length
}

/** YYYY-MM dönemini yıl/ay çiftine çevirir; geçersizse null. */
export function donemCoz(donem: string): { yil: number; ay: number } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(donem)) return null
  const [yil, ay] = donem.split('-').map(Number)
  return { yil, ay }
}
