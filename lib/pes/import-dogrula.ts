/**
 * CSV import girdisi ile veritabanı kısıtları arasındaki tolerans katmanı.
 *
 * NEDEN VAR: Kullanıcı şablonu Excel'de açıp doldurur. Excel Türkçe karakteri
 * bozabilir, kullanıcı "Plansiz" yazar ama CHECK kısıtı "Plansız" bekler,
 * ya da "Küçük" yazar ama kod yalnız "Kucuk" arar. Bu farklar eskiden ya ham
 * PostgreSQL hatasına ("value too long for type character(1)") ya da sessiz
 * veri bozulmasına (yanlış değere düşme) dönüşüyordu. İkisi de kabul edilemez:
 * biri kullanıcıyı çaresiz bırakır, diğeri yanlış veriyi doğru gibi gösterir.
 *
 * KURAL: tanınmayan değer için ASLA varsayılana düşülmez — null döner ve
 * çağıran anlamlı bir hata üretir. Sessizce "Normal" yazmak, kullanıcının
 * "Küçük" dediğini görmezden gelmektir.
 */

/* Türkçe harfleri sadeleştirir; karşılaştırma bunun üzerinden yapılır.
   import-klasman/import-matris betikleriyle AYNI kural. */
const TR: Record<string, string> = {
  ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I',
  ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U',
}

/** Karşılaştırma anahtarı: TR sadeleştir, büyüt, harf/rakam dışını at.
    "Kesim & Dikim", "Kesim ve Dikim" ve "Kesim&Dikim" aynı anahtara iner. */
function anahtar(s: string): string {
  const sade = s.split('').map((c) => TR[c] ?? c).join('')
  return sade
    .toUpperCase()
    .replace(/\bVE\b/g, '')          // "ve" bağlacı ayraç sayılır
    .replace(/[^A-Z0-9]+/g, '')
}

/**
 * Kullanıcının yazdığı değeri, izin verilen değerlerden birine çevirir.
 * Eşleşme yoksa null — çağıran hata üretir, varsayılana DÜŞMEZ.
 */
export function enumCoz(
  deger: string | null | undefined,
  gecerliler: readonly string[]
): string | null {
  const ham = (deger ?? '').trim()
  if (!ham) return null
  const a = anahtar(ham)
  if (!a) return null
  return gecerliler.find((g) => anahtar(g) === a) ?? null
}

/** Kullanıcıya ne yazması gerektiğini söyleyen hata metni. */
export function enumHata(
  alan: string,
  deger: string | null | undefined,
  gecerliler: readonly string[],
  satirNo?: number
): string {
  const yer = satirNo ? `satır ${satirNo}: ` : ''
  const yazilan = (deger ?? '').trim()
  const ne = yazilan ? `"${yazilan}"` : 'boş'
  return `${yer}${alan} alanı ${ne} — geçerli değerler: ${gecerliler.join(', ')}`
}

/** Aralık içindeki tam sayı, değilse null (0 ve negatif de reddedilebilir). */
export function sayiAraliginda(
  deger: string | number | null | undefined,
  min: number,
  max: number
): number | null {
  const ham = String(deger ?? '').trim()
  if (!ham) return null
  const n = Number(ham)
  if (!Number.isFinite(n)) return null
  const t = Math.round(n)
  return t >= min && t <= max ? t : null
}

/* Veritabanı CHECK kısıtlarının tek kopyası — şablon ve import aynı listeyi
   kullanır ki biri değişince diğeri sessizce eskimesin. */
export const DURUS_TIPLERI = ['Planlı', 'Plansız', 'Organizasyonel', 'Tedarik'] as const
export const BANT_TIPLERI = ['Normal', 'Küçük'] as const
export const URETIM_TIPLERI = ['CMT', 'CMT+Yıkama', 'Dikim', 'Kesim & Dikim'] as const
/** workshop.type — atölye SINIFI (CHAR(1)). Üretim tipiyle karıştırılmamalı. */
export const ATOLYE_SINIFLARI = ['A', 'B', 'C', 'X'] as const
