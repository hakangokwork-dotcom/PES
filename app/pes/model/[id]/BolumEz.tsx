'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const BOLUMLER = ['KESIM', 'DIKIM', 'UKP'] as const

export default function BolumEz({ bultenId, operasyonId, bolum, kaynak }: {
  bultenId: number
  operasyonId: number
  bolum: string
  kaynak: string
}) {
  const router = useRouter()
  const [bekliyor, setBekliyor] = useState(false)

  async function degistir(yeni: string) {
    if (yeni === bolum) return
    setBekliyor(true)
    await fetch(`/api/pes/model/${bultenId}/bolum`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operasyon_id: operasyonId, bolum: yeni }),
    })
    setBekliyor(false)
    router.refresh()
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select value={bolum} disabled={bekliyor}
              onChange={e => degistir(e.target.value)}
              className="border rounded px-1 py-0.5 text-xs">
        {BOLUMLER.map(b => <option key={b} value={b}>{b}</option>)}
      </select>
      {kaynak === 'elle' && (
        <span className="text-xs text-amber-700" title="Kural değil, elle seçildi">elle</span>
      )}
    </span>
  )
}
