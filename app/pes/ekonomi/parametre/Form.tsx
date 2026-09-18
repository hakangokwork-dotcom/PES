'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type ParamTanim = { anahtar: string; etiket: string; aciklama: string }

export default function Form({ tanimlar, donem, mevcut }: {
  tanimlar: ParamTanim[]
  donem: string
  mevcut: Record<string, number>
}) {
  const router = useRouter()
  const [yeniDonem, setYeniDonem] = useState(donem)
  const [durum, setDurum] = useState<string>('hazir')
  const [etki, setEtki] = useState<{ satir: number; atolye: number } | null>(null)

  async function gonder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setDurum('gonderiliyor')
    const fd = new FormData(e.currentTarget)
    const degerler = Object.fromEntries(
      tanimlar.map(t => [t.anahtar, fd.get(t.anahtar)]).filter(([, v]) => v !== null && v !== ''),
    )
    const r = await fetch('/api/pes/ekonomi/parametre', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ donem: yeniDonem, degerler }),
    })
    const j = await r.json()
    if (!r.ok) { setDurum(j.error ?? 'Kaydedilemedi'); return }
    setEtki(j.etki)
    setDurum('kaydedildi')
    router.refresh()
  }

  return (
    <form onSubmit={gonder} className="space-y-3 max-w-3xl">
      <label className="block">
        <span className="text-sm text-slate-600">Geçerlilik dönemi</span>
        <input value={yeniDonem} onChange={e => setYeniDonem(e.target.value)}
               pattern="\d{4}-\d{2}" required
               className="block border rounded px-2 py-1 tabular-nums" />
        <span className="text-xs text-slate-400">
          Bu dönemden itibaren geçerli olur. Önceki aylar eski değerlerle hesaplanmaya devam eder.
        </span>
      </label>

      <table className="text-sm w-full border rounded">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-3 py-2">Parametre</th>
            <th className="text-right px-3 py-2">Değer</th>
            <th className="text-left px-3 py-2">Açıklama</th>
          </tr>
        </thead>
        <tbody>
          {tanimlar.map(t => (
            <tr key={t.anahtar} className="border-t align-top">
              <td className="px-3 py-2">{t.etiket}</td>
              <td className="px-3 py-2 text-right">
                <input name={t.anahtar} type="number" step="any"
                       defaultValue={mevcut[t.anahtar]}
                       className="border rounded px-2 py-1 w-36 text-right tabular-nums" />
              </td>
              <td className="px-3 py-2 text-slate-500">{t.aciklama}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="submit" disabled={durum === 'gonderiliyor'}
              className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50">
        {durum === 'gonderiliyor' ? 'Kaydediliyor…' : `${yeniDonem} için kaydet`}
      </button>

      {durum === 'kaydedildi' && etki && (
        <p className="text-sm text-emerald-700">
          Kaydedildi. {yeniDonem} ve sonrasındaki {etki.satir} ekonomi satırı
          ({etki.atolye} atölye) artık bu değerlerle hesaplanıyor.
        </p>
      )}
      {!['hazir', 'gonderiliyor', 'kaydedildi'].includes(durum) &&
        <p className="text-sm text-rose-700">{durum}</p>}
    </form>
  )
}
