'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AY_ADLARI, donemYaz, etkinDonem, type Donem } from '@/lib/pes/donem'

/* Dönem seçici — /pes altındaki TÜM ekranlar için tek yerde.
   Seçim URL'de tutulur, böylece ekran değiştirince kaybolmaz. */
export default function DonemBar({ mevcut }: { mevcut: Donem[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const secili = etkinDonem(params.get('donem'), mevcut)

  const yillar = useMemo(
    () => [...new Set(mevcut.map(d => d.yil))].sort((a, b) => b - a),
    [mevcut],
  )
  /* Seçili yılda veri olan aylar; yoksa 12 ayın hepsi açık kalsın. */
  const aylar = useMemo(() => {
    const v = mevcut.filter(d => d.yil === secili.yil).map(d => d.ay).sort((a, b) => a - b)
    return v.length ? v : Array.from({ length: 12 }, (_, i) => i + 1)
  }, [mevcut, secili.yil])

  function git(d: Donem) {
    const p = new URLSearchParams(params.toString())
    p.set('donem', donemYaz(d))
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }

  return (
    <div className="flex items-center gap-2 border-b border-line-soft bg-surface px-6 py-2 lg:px-8">
      <span className="text-[11px] font-medium uppercase tracking-wider text-faint">Dönem</span>

      <select
        value={secili.yil}
        onChange={e => git({ yil: Number(e.target.value), ay: secili.ay })}
        className="rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-ink focus:border-accent focus:outline-none"
      >
        {yillar.map(y => <option key={y} value={y}>{y}</option>)}
      </select>

      <select
        value={secili.ay}
        onChange={e => git({ yil: secili.yil, ay: Number(e.target.value) })}
        className="rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-ink focus:border-accent focus:outline-none"
      >
        {aylar.map(a => <option key={a} value={a}>{AY_ADLARI[a]}</option>)}
      </select>

      <span className="ml-2 text-[11px] text-faint">
        Bu seçim ekranlar arasında korunur.
      </span>
    </div>
  )
}
