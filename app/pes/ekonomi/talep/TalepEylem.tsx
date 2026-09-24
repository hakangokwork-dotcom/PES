'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Bir atölye-dönem için talep açar ya da iptal eder.
 *
 * İptal SİLMEZ — `cancelled_at` işaretler. Kimden ne istendiği kaydı kalmalı;
 * silinirse "bu atölyeden istemiş miydik" sorusu cevapsız kalır.
 */
export default function TalepEylem({
  workshopId, donem, acik, not,
}: {
  workshopId: number
  donem: string
  acik: boolean
  not: string | null
}) {
  const router = useRouter()
  const [bekliyor, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [notYaz, setNotYaz] = useState(false)
  const [metin, setMetin] = useState(not ?? '')

  async function calistir(yontem: 'POST' | 'DELETE') {
    setHata(null)
    const cevap = await fetch('/api/pes/ekonomi/talep', {
      method: yontem,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workshop_id: workshopId,
        donem,
        ...(yontem === 'POST' ? { note: metin.trim() || null } : {}),
      }),
    })
    if (!cevap.ok) {
      const g = await cevap.json().catch(() => ({}))
      setHata(g.error ?? `Hata ${cevap.status}`)
      return
    }
    setNotYaz(false)
    basla(() => router.refresh())
  }

  if (acik) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-slate-900 text-white">Talep açık</span>
          <button
            onClick={() => calistir('DELETE')}
            disabled={bekliyor}
            className="text-xs underline text-slate-500 hover:text-slate-800 disabled:opacity-50"
          >
            iptal
          </button>
        </div>
        {not && <div className="text-xs text-slate-500 max-w-xs">{not}</div>}
        {hata && <div className="text-xs text-red-600">{hata}</div>}
      </div>
    )
  }

  if (notYaz) {
    return (
      <div className="space-y-1">
        <input
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          placeholder="Not (atölye görür)"
          className="border border-slate-300 rounded px-2 py-1 text-xs w-48"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={() => calistir('POST')}
            disabled={bekliyor}
            className="text-xs px-2 py-1 rounded bg-slate-900 text-white disabled:opacity-50"
          >
            {bekliyor ? '…' : 'Talep aç'}
          </button>
          <button
            onClick={() => { setNotYaz(false); setHata(null) }}
            className="text-xs underline text-slate-500"
          >
            vazgeç
          </button>
        </div>
        {hata && <div className="text-xs text-red-600">{hata}</div>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setNotYaz(true)}
      className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
    >
      Talep aç
    </button>
  )
}
