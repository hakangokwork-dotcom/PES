'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FiyatHesapla({ bultenId, donem, varsayilanAdet }: {
  bultenId: number; donem: string; varsayilanAdet: number | null
}) {
  const router = useRouter()
  const [cmt, setCmt] = useState('')
  const [adet, setAdet] = useState(varsayilanAdet ? String(varsayilanAdet) : '')
  const [durum, setDurum] = useState('hazir')

  async function hesapla(e: React.FormEvent) {
    e.preventDefault()
    setDurum('hesaplaniyor')
    const r = await fetch(`/api/pes/model/${bultenId}/fiyat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bulten_id: bultenId, donem,
        cmt_fiyat: cmt === '' ? null : Number(cmt),
        gunluk_adet: adet === '' ? null : Number(adet),
      }),
    })
    const j = await r.json()
    setDurum(r.ok ? `${j.yazilan} atölye için hesaplandı` : (j.error ?? 'Hesaplanamadı'))
    router.refresh()
  }

  return (
    <form onSubmit={hesapla} className="flex flex-wrap items-end gap-3 border rounded p-3 bg-slate-50">
      <label className="text-sm">
        <span className="block text-slate-600">CMT fiyat (TL/adet)</span>
        <input value={cmt} onChange={e => setCmt(e.target.value)} type="number" step="any"
               className="border rounded px-2 py-1 w-32 tabular-nums" />
      </label>
      <label className="text-sm">
        <span className="block text-slate-600">Günlük adet</span>
        <input value={adet} onChange={e => setAdet(e.target.value)} type="number"
               className="border rounded px-2 py-1 w-32 tabular-nums" />
      </label>
      <button disabled={durum === 'hesaplaniyor'}
              className="px-4 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
        {durum === 'hesaplaniyor' ? 'Hesaplanıyor…' : 'Hesapla'}
      </button>
      {durum !== 'hazir' && durum !== 'hesaplaniyor' && (
        <span className="text-sm text-slate-600">{durum}</span>
      )}
      <span className="text-xs text-slate-400 basis-full">
        CMT boş bırakılırsa maliyet ve adil fiyat yine hesaplanır; marj ve kâr boş kalır.
      </span>
    </form>
  )
}
