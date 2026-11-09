/* Ekrandaki sayıların tek biçimi (tr-TR): binlik nokta, ondalık virgül,
   boş değer '—'. toFixed() ondalığı noktayla yazar ("0.85 TL"); kullanılmaz. */

type Deger = number | string | null | undefined

function sayiya(v: Deger): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const BOS = '—'

/** 1234567 → "1.234.567"; basamak verilirse en çok o kadar ondalık. */
export function sayi(v: Deger, basamak = 0): string {
  const n = sayiya(v)
  return n == null ? BOS : n.toLocaleString('tr-TR', { maximumFractionDigits: basamak })
}

/** 85.34 → "%85,3" (değer zaten yüzde cinsinden). */
export function yuzde(v: Deger, basamak = 1): string {
  const n = sayiya(v)
  return n == null ? BOS : `%${n.toLocaleString('tr-TR', { maximumFractionDigits: basamak })}`
}

/** 1234567 → "1.234.567 TL"; basamak 2 ise "0,85 TL" gibi kuruşlu. */
export function tl(v: Deger, basamak = 0): string {
  const n = sayiya(v)
  return n == null ? BOS : `${n.toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak })} TL`
}
