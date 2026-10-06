import type { FormEvent } from 'react'
import type { AtolyeKapasitesi, AySatiri, Klasman, PlanSatiri } from '@/lib/pes/yillik-plan'

export type Sekme = 'doluluk' | 'talep'

export type YillikPlanVerisi = {
  yil: number
  sekme: Sekme
  /** Klasman filtresi (katalogda doğrulanmış) ya da null. */
  klasman: string | null
  /** Yan paneli açık atölye ya da null. */
  atolyeId: number | null
  klasmanIzleniyor: boolean
  katalog: Klasman[]
  atolyeler: AtolyeKapasitesi[]
  planlar: PlanSatiri[]
  fiili: AySatiri[]
  talepler: AySatiri[]
}

export type Istek = (yol: string, method: 'PUT' | 'DELETE', govde?: unknown) => Promise<boolean>
export type HataYaz = (mesaj: string | null) => void

export const tr = new Intl.NumberFormat('tr-TR')
export const ADET_HATASI = 'Adet negatif olmayan tam sayı olmalı (ör. 20000 ya da 20.000)'
export const inp = 'border border-slate-300 rounded px-2 py-1 text-xs w-full'
export const btn = 'rounded bg-slate-900 text-white text-xs px-2 py-1 disabled:opacity-50'

/**
 * Form gönderimini FormData'ya çevirir. `action` yerine onSubmit: React 19
 * `action` formu her gönderimde sıfırlar; hata alınca kullanıcının yazdığı
 * kaybolurdu.
 */
export function gonder(fn: (f: FormData, form: HTMLFormElement) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    fn(new FormData(e.currentTarget), e.currentTarget)
  }
}
