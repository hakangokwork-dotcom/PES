'use client'
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DolulukTablosu from './DolulukTablosu'
import TalepTablosu from './TalepTablosu'
import AtolyePaneli from './AtolyePaneli'
import type { Istek, Sekme, YillikPlanVerisi } from './ortak'

export default function YillikPlan({ veri }: { veri: YillikPlanVerisi }) {
  const router = useRouter()
  const params = useSearchParams()
  const [bekliyor, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)

  const git = (degis: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(degis)) {
      if (v === null) q.delete(k)
      else q.set(k, v)
    }
    router.push(`/pes/yillik-plan?${q.toString()}`)
  }

  const istek: Istek = async (yol, method, govde) => {
    setHata(null)
    const r = await fetch(yol, {
      method,
      headers: { 'content-type': 'application/json' },
      body: govde === undefined ? undefined : JSON.stringify(govde),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setHata(j.error ?? `Hata ${r.status}`); return false }
    basla(() => router.refresh())
    return true
  }

  const secili = veri.sekme === 'doluluk'
    ? veri.atolyeler.find((a) => a.workshopId === veri.atolyeId) ?? null
    : null
  const sekmeSinif = (s: Sekme) =>
    `rounded px-3 py-1 text-sm ${veri.sekme === s ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200'}`

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Yıllık Plan</h1>
        <select aria-label="Yıl" className="rounded border px-2 py-1 text-sm" value={veri.yil}
                onChange={(e) => git({ yil: e.target.value })}>
          {[veri.yil - 1, veri.yil, veri.yil + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select aria-label="Klasman" className="rounded border px-2 py-1 text-sm" value={veri.klasman ?? ''}
                onChange={(e) => git({ klasman: e.target.value || null })}>
          <option value="">Tüm klasmanlar</option>
          {veri.katalog.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
        </select>
        <nav className="flex gap-1" aria-label="Sekmeler">
          <button type="button" className={sekmeSinif('doluluk')} onClick={() => git({ sekme: null })}>
            Doluluk
          </button>
          <button type="button" className={sekmeSinif('talep')} onClick={() => git({ sekme: 'talep', atolye: null })}>
            Talep
          </button>
        </nav>
        {bekliyor && <span className="text-xs text-slate-500">Güncelleniyor…</span>}
      </header>
      {hata && <div role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{hata}</div>}

      {veri.sekme === 'talep' ? (
        <TalepTablosu veri={veri} istek={istek} setHata={setHata} />
      ) : (
        <div className={secili ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]' : ''}>
          <div className="min-w-0">
            <DolulukTablosu veri={veri} kompakt={secili !== null}
              sec={(id) => git({ atolye: id === veri.atolyeId ? null : String(id) })} />
          </div>
          {secili && (
            <AtolyePaneli key={secili.workshopId} atolye={secili} veri={veri} istek={istek} setHata={setHata}
                          kapat={() => git({ atolye: null })} />
          )}
        </div>
      )}
    </div>
  )
}
