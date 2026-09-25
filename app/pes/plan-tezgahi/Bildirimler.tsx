'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GEREKCE_ETIKET, type GerekceKodu } from '@/lib/pes/plan-onay'
import { gecikmeGunu, bildirimOzeti, type Bildirim } from '@/lib/pes/plan-bildirim'

export type BildirimSatiri = Bildirim & {
  isEmriNo: string
  modelAdi: string
  atolyeAdi: string
}

/**
 * Atölyelerden gelen gecikme bildirimleri.
 *
 * TNA'nın "gecikme günü" sütunu: gün SAKLANMAZ, planlanan ve bildirilen
 * tarihten türetilir. Erkene çekme de gösterilir — plan öne alındıysa
 * bu da haberdir ve kapasite açılmış demektir.
 */
export default function Bildirimler({ bildirimler }: { bildirimler: BildirimSatiri[] }) {
  const router = useRouter()
  const [bekliyor, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [hepsi, setHepsi] = useState(false)

  const ozet = bildirimOzeti(bildirimler)
  const gorunen = hepsi ? bildirimler : bildirimler.filter((b) => b.okunduAt === null)

  async function okundu(id: number) {
    setHata(null)
    const c = await fetch('/api/pes/plan-bildirim', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!c.ok) {
      const g = await c.json().catch(() => ({}))
      setHata(g.error ?? `İşlem başarısız (${c.status})`)
      return
    }
    basla(() => router.refresh())
  }

  if (bildirimler.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Atölyeden gelen bildirimler
        </h2>
        {ozet.okunmamis > 0 && (
          <span className="text-sm px-2 py-0.5 rounded bg-red-100 text-red-800">
            {ozet.okunmamis} okunmamış
          </span>
        )}
        {ozet.enBuyukGecikme !== null && ozet.enBuyukGecikme > 0 && (
          <span className="text-sm text-slate-600">
            en büyük gecikme <strong>{ozet.enBuyukGecikme} gün</strong>
          </span>
        )}
        {ozet.erkeneCekilen > 0 && (
          <span className="text-sm text-emerald-700">
            {ozet.erkeneCekilen} iş erkene çekildi
          </span>
        )}
        <button onClick={() => setHepsi((h) => !h)}
                className="text-xs underline text-slate-500">
          {hepsi ? 'yalnız okunmamışlar' : `hepsini göster (${bildirimler.length})`}
        </button>
        {hata && <span className="text-sm text-red-600">{hata}</span>}
      </div>

      {gorunen.length === 0 ? (
        <p className="text-sm text-slate-500">Okunmamış bildirim yok.</p>
      ) : (
        <div className="space-y-1.5">
          {gorunen.map((b) => {
            const g = gecikmeGunu(b)
            return (
              <article key={b.id}
                       className={`rounded border p-3 text-sm ${
                         b.okunduAt === null ? 'border-slate-900' : 'border-slate-200 opacity-70'}`}>
                <div className="flex justify-between gap-3 flex-wrap items-baseline">
                  <div>
                    <span className="font-medium">{b.isEmriNo}</span>
                    <span className="text-slate-400"> · {b.modelAdi} · {b.atolyeAdi}</span>
                  </div>
                  {g !== null && (
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      g > 0 ? 'bg-red-100 text-red-800'
                      : g < 0 ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'}`}>
                      {g > 0 ? `${g} gün gecikme` : g < 0 ? `${-g} gün erken` : 'kayma yok'}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-slate-600">
                  {b.eskiBitis ?? '—'} → <strong>{b.yeniBitis}</strong>
                  {' · '}{GEREKCE_ETIKET[b.gerekceKodu as GerekceKodu]}
                </div>
                {b.not && <div className="text-xs text-slate-500 mt-0.5">{b.not}</div>}
                {b.okunduAt === null && (
                  <button onClick={() => okundu(b.id)} disabled={bekliyor}
                          className="mt-1 text-xs underline text-slate-500 disabled:opacity-50">
                    okundu olarak işaretle
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
