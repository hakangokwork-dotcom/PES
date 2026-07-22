'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/* Liste satırındaki Arşivle / Geri al.
   Onay sormaz: işlem geri alınabilir, onay penceresi yalnız gürültü yapar. */
export default function AtolyeArsivDugmesi({ id, aktif }: { id: number; aktif: boolean }) {
  const [bekliyor, setBekliyor] = useState(false)
  const [hata, setHata] = useState('')
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function degistir() {
    setHata('')
    setBekliyor(true)
    try {
      const r = await fetch(`/api/pes/workshops/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !aktif }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setHata(d.error ?? 'İşlem başarısız')
      } else {
        startTransition(() => router.refresh())
      }
    } catch {
      setHata('Bağlantı hatası')
    } finally {
      setBekliyor(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={degistir}
        disabled={bekliyor}
        className="text-xs font-medium px-3 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
      >
        {bekliyor ? '…' : aktif ? 'Arşivle' : 'Geri al'}
      </button>
      {hata && <span className="text-[11px] text-red-600">{hata}</span>}
    </div>
  )
}
