'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GEREKCE_ETIKET, GEREKCE_KODLARI, type GerekceKodu } from '@/lib/pes/plan-onay'
import { gecikmeGunu, bildirimDogrula } from '@/lib/pes/plan-bildirim'

export type PlanliIs = {
  workOrderId: number
  isEmriNo: string
  modelAdi: string
  planBitis: string | null
  teslim: string | null
}

export type GecmisBildirim = {
  id: number
  workOrderId: number
  isEmriNo: string
  eskiBitis: string | null
  yeniBitis: string
  gerekceKodu: GerekceKodu
  not: string | null
  olusturulma: string
}

const tr = (t: string | null) => t ?? '—'

/**
 * Atölyenin gecikme bildirimi.
 *
 * TNA takviminin "gecikme günü" sütununun karşılığı. Gün SAKLANMAZ,
 * iki tarihten türetilir; tarih düzeltilince kendiliğinden güncellenir.
 */
export default function GecikmeBildir({
  isler, gecmis,
}: {
  isler: PlanliIs[]
  gecmis: GecmisBildirim[]
}) {
  const router = useRouter()
  const [bekliyor, basla] = useTransition()
  const [woId, setWoId] = useState<number>(isler[0]?.workOrderId ?? 0)
  const [yeniBitis, setYeniBitis] = useState('')
  const [gerekce, setGerekce] = useState<GerekceKodu | ''>('')
  const [not, setNot] = useState('')
  const [hata, setHata] = useState<string | null>(null)
  const [tamam, setTamam] = useState(false)

  const secili = isler.find((i) => i.workOrderId === woId)
  const kayma = secili?.planBitis && yeniBitis
    ? gecikmeGunu({ eskiBitis: secili.planBitis, yeniBitis })
    : null

  const onHata = bildirimDogrula({
    tip: 'gecikme', yeniBitis, gerekceKodu: gerekce || null, not: not || null,
  })

  async function gonder() {
    setHata(null); setTamam(false)
    const c = await fetch('/api/pes/plan-bildirim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tip: 'gecikme', work_order_id: woId,
        eski_bitis: secili?.planBitis ?? null,
        yeni_bitis: yeniBitis, gerekce_kodu: gerekce, not: not || null,
      }),
    })
    if (!c.ok) {
      const g = await c.json().catch(() => ({}))
      setHata(g.error ?? `Gönderilemedi (${c.status})`)
      return
    }
    setTamam(true); setYeniBitis(''); setGerekce(''); setNot('')
    basla(() => router.refresh())
  }

  if (isler.length === 0 && gecmis.length === 0) return null

  return (
    <section className="rounded border border-slate-200 p-4 space-y-3">
      <h2 className="text-sm font-semibold">Gecikme bildir</h2>

      {isler.length === 0 ? (
        <p className="text-sm text-slate-500">
          Planınızda bildirilecek aktif iş yok.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block text-sm sm:col-span-2">
              <span className="block text-xs text-slate-600">İş emri</span>
              <select value={woId} onChange={(e) => setWoId(Number(e.target.value))}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1">
                {isler.map((i) => (
                  <option key={i.workOrderId} value={i.workOrderId}>
                    {i.isEmriNo} — {i.modelAdi}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-xs text-slate-600">Yeni bitiş</span>
              <input type="date" value={yeniBitis} onChange={(e) => setYeniBitis(e.target.value)}
                     className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" />
            </label>
            <label className="block text-sm">
              <span className="block text-xs text-slate-600">Gerekçe</span>
              <select value={gerekce} onChange={(e) => setGerekce(e.target.value as GerekceKodu | '')}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1">
                <option value="">— seçin —</option>
                {GEREKCE_KODLARI.map((k) => (
                  <option key={k} value={k}>{GEREKCE_ETIKET[k]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="text-xs text-slate-500">
            Planlanan bitiş: <strong>{tr(secili?.planBitis ?? null)}</strong>
            {secili?.teslim && <> · teslim {secili.teslim}</>}
            {kayma !== null && (
              <span className={`ml-2 px-1.5 py-0.5 rounded ${
                kayma > 0 ? 'bg-red-100 text-red-800'
                : kayma < 0 ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'}`}>
                {kayma > 0 ? `${kayma} gün gecikme` : kayma < 0 ? `${-kayma} gün erken` : 'kayma yok'}
              </span>
            )}
          </div>

          <label className="block text-sm">
            <span className="block text-xs text-slate-600">
              Açıklama{gerekce === 'DIGER' ? ' (zorunlu)' : ''}
            </span>
            <textarea value={not} onChange={(e) => setNot(e.target.value)} rows={2}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      placeholder="Planlamacının ne yapacağını bilmesi için kısa bir not" />
          </label>

          {onHata.length > 0 && yeniBitis !== '' && (
            <p className="text-sm text-amber-700">{onHata[0].mesaj}</p>
          )}
          {hata && <p className="text-sm text-red-600">{hata}</p>}
          {tamam && <p className="text-sm text-emerald-700">Bildirim gönderildi.</p>}

          <button onClick={gonder} disabled={bekliyor || onHata.length > 0}
                  className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-40">
            {bekliyor ? 'Gönderiliyor…' : 'Gecikmeyi bildir'}
          </button>
        </>
      )}

      {gecmis.length > 0 && (
        <div className="pt-3 border-t border-slate-200">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Bildirdikleriniz
          </h3>
          <ul className="space-y-1 text-sm">
            {gecmis.map((b) => {
              const g = gecikmeGunu(b)
              return (
                <li key={b.id} className="text-slate-600">
                  <span className="font-medium">{b.isEmriNo}</span>
                  {' · '}{tr(b.eskiBitis)} → {b.yeniBitis}
                  {g !== null && <> ({g > 0 ? '+' : ''}{g} gün)</>}
                  {' · '}{GEREKCE_ETIKET[b.gerekceKodu]}
                  {b.not && <span className="text-slate-400"> — {b.not}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
