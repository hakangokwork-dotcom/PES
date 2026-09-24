'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type SureSatiri = {
  workshopId: number
  atolye: string
  teorikDk: number | null
  uretimDk: number | null
  uretimGun: number | null
  uretimAtlanan: number | null
  beyanDk: number | null
}

const dk = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const f = (v: number | null) => v === null ? '—' : dk.format(v)

export default function SureKarsilastirma({ bultenId, donem, satirlar }: {
  bultenId: number; donem: string; satirlar: SureSatiri[]
}) {
  const router = useRouter()
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [bekleyen, setBekleyen] = useState<number | null>(null)

  async function cagir(workshopId: number, kaynak: 'uretim' | 'beyan', dkAdet?: number) {
    setBekleyen(workshopId); setMesaj(null)
    const r = await fetch(`/api/pes/model/${bultenId}/gercek-sure`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bulten_id: bultenId, workshop_id: workshopId, donem, kaynak, dk_adet: dkAdet }),
    })
    const j = await r.json()
    setBekleyen(null)
    setMesaj(r.ok ? null : (j.error ?? 'İşlem başarısız'))
    if (r.ok) router.refresh()
  }

  async function beyanSor(workshopId: number) {
    const girilen = window.prompt('Atölyenin beyan ettiği dakika/adet:')
    if (!girilen) return
    const n = Number(girilen.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) { setMesaj('Geçerli bir sayı gir'); return }
    await cagir(workshopId, 'beyan', n)
  }

  return (
    <section className="space-y-2">
      <h2 className="font-medium">Süre karşılaştırması</h2>
      {mesaj && <p className="text-sm text-rose-700">{mesaj}</p>}
      <div className="overflow-x-auto border rounded">
        <table className="text-sm w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2">Atölye</th>
              <th className="text-right px-3 py-2">Teorik dk/adet</th>
              <th className="text-right px-3 py-2">Üretimden</th>
              <th className="text-right px-3 py-2">Fark</th>
              <th className="text-right px-3 py-2">Beyan</th>
              <th className="text-left px-3 py-2">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map(s => {
              const fark = s.teorikDk !== null && s.uretimDk !== null ? s.uretimDk - s.teorikDk : null
              return (
                <tr key={s.workshopId} className="border-t">
                  <td className="px-3 py-2">{s.atolye}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f(s.teorikDk)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {f(s.uretimDk)}
                    {s.uretimGun !== null && (
                      <span className="block text-xs text-slate-400">
                        {s.uretimGun} gün{s.uretimAtlanan ? `, ${s.uretimAtlanan} atlandı` : ''}
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${
                    fark === null ? 'text-slate-300' : fark > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {fark === null ? '—' : `${fark > 0 ? '+' : ''}${dk.format(fark)}`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{f(s.beyanDk)}</td>
                  <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                    <button onClick={() => cagir(s.workshopId, 'uretim')}
                            disabled={bekleyen === s.workshopId}
                            className="text-xs underline disabled:opacity-50">üretimden türet</button>
                    <button onClick={() => beyanSor(s.workshopId)}
                            disabled={bekleyen === s.workshopId}
                            className="text-xs underline disabled:opacity-50">beyan gir</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        <strong>Fiyatlama teorik süreyi kullanır.</strong> Üretimden türetilen bant
        ortalamasıdır — duruş, model değişimi ve fire içindedir, teorikten yüksek
        çıkması normaldir. Bir bant aynı gün birden fazla iş emri işlediyse o gün
        paylaştırılamadığı için hesaba girmez ve “atlandı” diye sayılır.
      </p>
    </section>
  )
}
