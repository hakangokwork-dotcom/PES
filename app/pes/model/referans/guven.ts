import type { Guven } from '@/lib/pes/referans-model'

export const GUVEN_RENK: Record<Guven, string> = {
  YUKSEK: 'bg-emerald-100 text-emerald-800',
  ORTA: 'bg-amber-100 text-amber-800',
  DUSUK: 'bg-orange-100 text-orange-800',
  ZAYIF: 'bg-rose-100 text-rose-800',
}

export const GUVEN_ACIKLAMA: Record<Guven, string> = {
  YUKSEK: '8+ model', ORTA: '4–7 model', DUSUK: '2–3 model', ZAYIF: 'tek model',
}
