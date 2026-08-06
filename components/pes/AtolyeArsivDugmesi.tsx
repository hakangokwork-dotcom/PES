'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/* Liste satırındaki Pasife al / Aktife al.
   "Aktif = şu anda çalışıyor" kullanıcının tanımı; eskiden "Arşivle"
   yazıyordu ama alan aynı alan (workshop.is_active) ve iki farklı isim
   aynı anahtarı iki şeymiş gibi gösteriyordu.
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
        className="text-xs font-medium px-3 py-1 rounded-lg border border-line text-muted hover:bg-canvas transition-colors disabled:opacity-40"
      >
        {bekliyor ? '…' : aktif ? 'Pasife al' : 'Aktife al'}
      </button>
      {hata && <span className="text-[11px] text-red-600">{hata}</span>}
    </div>
  )
}
