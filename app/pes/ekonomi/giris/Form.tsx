'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Atolye = { id: number; name: string }
type Mevcut = Record<string, string | number | null>

const ALANLAR: Array<[string, string, string]> = [
  ['revenue_declared', 'Aylık ciro (TL)', 'Fatura toplamı ÷ ay sayısı. Boş gün düzeltmesi ÖNCESİ.'],
  ['idle_days', 'Boş / dışarı gün', 'Aylık ortalama. Ciro düzeltmesinin girdisi.'],
  ['qty_declared', 'Aylık adet (beyan)', 'Bant kapasitesi tahmini. PES üretim kaydı varsa hesapta o kullanılır.'],
  ['nominal_days', 'Nominal çalışma günü', 'Tipik 22. Benchmark cetveli bununla ölçülür.'],
  ['actual_days', 'Fiili çalışma günü', 'Gerçek takvim. Fiyatlama bununla yapılır.'],
  ['hours_per_day', 'Günlük çalışma saati', 'Molalar hariç.'],
  ['cutting_staff', 'Kesim kişi', 'Bu AYA ait kadro.'],
  ['sewing_staff', 'Dikim kişi', 'Bu AYA ait kadro.'],
  ['ukp_staff', 'UKP kişi', 'Ütü, kontrol, paket.'],
  ['office_staff', 'Ofis kişi', 'Ürün üretmez ama maliyeti üretim dakikasına biner.'],
  ['area_m2', 'Üretim alanı (m²)', ''],
]

export default function Form({ atolyeler, donem, mevcut, workshopId }: {
  atolyeler: Atolye[]
  donem: { yil: number; ay: number }
  mevcut: Mevcut | null
  workshopId: number | null
}) {
  const router = useRouter()
  const [durum, setDurum] = useState<'hazir' | 'gonderiliyor' | 'kaydedildi' | string>('hazir')

  async function gonder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setDurum('gonderiliyor')
    const fd = new FormData(e.currentTarget)
    const govde = Object.fromEntries(fd.entries())
    const r = await fetch('/api/pes/ekonomi', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...govde, year: donem.yil, month: donem.ay }),
    })
    if (!r.ok) { setDurum((await r.json()).error ?? 'Kaydedilemedi'); return }
    setDurum('kaydedildi')
    router.refresh()
  }

  return (
    <form onSubmit={gonder} className="space-y-3 max-w-2xl">
      <label className="block">
        <span className="text-sm text-slate-600">Atölye</span>
        <select name="workshop_id" defaultValue={workshopId ?? ''} required
                onChange={e => router.push(`/pes/ekonomi/giris?atolye=${e.target.value}&donem=${donem.yil}-${String(donem.ay).padStart(2, '0')}`)}
                className="block w-full border rounded px-2 py-1">
          <option value="">— seçin —</option>
          {atolyeler.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>

      {ALANLAR.map(([ad, etiket, ipucu]) => (
        <label key={ad} className="block">
          <span className="text-sm text-slate-600">{etiket}</span>
          <input name={ad} type="number" step="any"
                 defaultValue={mevcut?.[ad] != null ? String(mevcut[ad]) : ''}
                 className="block w-full border rounded px-2 py-1 tabular-nums" />
          {ipucu && <span className="text-xs text-slate-400">{ipucu}</span>}
        </label>
      ))}

      <label className="block">
        <span className="text-sm text-slate-600">Not</span>
        <input name="note" defaultValue={mevcut?.note != null ? String(mevcut.note) : ''}
               className="block w-full border rounded px-2 py-1" />
      </label>

      <button type="submit" disabled={durum === 'gonderiliyor'}
              className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50">
        {durum === 'gonderiliyor' ? 'Kaydediliyor…' : 'Kaydet'}
      </button>

      {durum === 'kaydedildi' && <p className="text-sm text-emerald-700">Kaydedildi. Satır artık "elle" kaynaklı.</p>}
      {durum !== 'hazir' && durum !== 'gonderiliyor' && durum !== 'kaydedildi' &&
        <p className="text-sm text-rose-700">{durum}</p>}
    </form>
  )
}
