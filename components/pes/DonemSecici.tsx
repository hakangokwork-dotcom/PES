'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Field, Select } from '@/components/ui'
import { AY_ADLARI, donemYaz, type Donem } from '@/lib/pes/donem'
import { useDonem } from '@/lib/pes/useDonem'

/* Giriş ekranlarının dönem seçicisi. DonemBar yalnız verisi olan dönemleri
   listeler; veri GİRİLEN ekranda henüz kaydı olmayan ay da seçilebilmeli.
   Seçim yine URL'de (?donem) — ekranlar arasında korunur. */
export default function DonemSecici() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const secili = useDonem()

  const buYil = new Date().getFullYear()
  const yillar = [...new Set([buYil + 1, buYil, buYil - 1, buYil - 2, secili.yil])].sort((a, b) => b - a)

  function git(d: Donem) {
    const p = new URLSearchParams(params.toString())
    p.set('donem', donemYaz(d))
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }

  return (
    <>
      <Field label="Yıl" className="w-28">
        <Select value={secili.yil} onChange={e => git({ yil: Number(e.target.value), ay: secili.ay })}>
          {yillar.map(y => <option key={y} value={y}>{y}</option>)}
        </Select>
      </Field>
      <Field label="Ay" className="w-36">
        <Select value={secili.ay} onChange={e => git({ yil: secili.yil, ay: Number(e.target.value) })}>
          {AY_ADLARI.slice(1).map((ad, i) => <option key={ad} value={i + 1}>{ad}</option>)}
        </Select>
      </Field>
    </>
  )
}
