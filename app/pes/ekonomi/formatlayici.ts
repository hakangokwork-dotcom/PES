/**
 * Rasyo değeri formatlama — Turkish locale.
 * Format tipleri RasyoMeta.format alanından gelir.
 */
import type { RasyoMeta } from '@/lib/pes/ekonomi-rasyo-meta'

const trPct1 = new Intl.NumberFormat('tr-TR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const trInt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const trDec2 = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const trDec4 = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})
const trTL = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

/** Büyük TL değerlerini kısalt: 1.000.000 → "1,0 M ₺", 50.000 → "50 bin ₺" */
function fmtTL(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${trDec2.format(v / 1_000_000)} M ₺`
  if (abs >= 1_000) return `${trInt.format(v / 1_000)} bin ₺`
  return `${trInt.format(v)} ₺`
}

export function fmtRasyo(meta: RasyoMeta, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  switch (meta.format) {
    case 'percent': return trPct1.format(v)
    case 'int':     return trInt.format(v)
    case 'dec2':    return trDec2.format(v)
    case 'dec4':    return trDec4.format(v)
    case 'tl':      return fmtTL(v)
    default:        return String(v)
  }
}

/** Sadece birim son ekine ihtiyaç duyulursa (bar tooltip için) */
export function birimEki(meta: RasyoMeta): string {
  if (meta.format === 'percent') return ''
  if (meta.format === 'tl') return ' ₺'
  return meta.birim !== '-' ? ` ${meta.birim}` : ''
}
