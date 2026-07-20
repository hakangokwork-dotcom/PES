'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TermTip from './TermTip'

type Series = { code: string; label: string; kind: string; unit: string | null; description: string | null }
type Value = { id: number; series_code: string; donem: string; value: string; source: string | null; note: string | null }
type MapRow = { group_code: string; series_code: string; series_label: string; rationale: string | null }

const GROUP_LABELS: Record<string, string> = {
  g1_iscilik: 'G1 İşçilik',
  g2_personel_yan: 'G2 Personel Yan',
  g3_enerji: 'G3 Enerji',
  g4_mekan: 'G4 Mekân',
  g5_makine: 'G5 Makine',
  g6_sarf: 'G6 Sarf',
  g7_dis_hizmet: 'G7 Dış Hizmet',
  g8_diger: 'G8 Diğer',
}

export default function IndexManager({
  series, values, map,
}: {
  series: Series[]
  values: Value[]
  map: MapRow[]
}) {
  const router = useRouter()
  const [form, setForm] = useState({ series_code: series[0]?.code ?? '', donem: '', value: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const bySeries = values.reduce<Record<string, Value[]>>((acc, v) => {
    ;(acc[v.series_code] ??= []).push(v)
    return acc
  }, {})

  async function add() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/pes/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, value: Number(form.value) }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Kaydedilemedi')
      setForm((f) => ({ ...f, donem: '', value: '' }))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    setBusy(true)
    try {
      await fetch(`/api/pes/index?id=${id}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Giriş */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-800">
          <TermTip termKey="fiyat_endeksi">Endeks</TermTip> değeri gir
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Her ay için ilgili serilerin değerini girin. Bir dönemin endeksi
          girilmemişse o dönemin{' '}
          <TermTip termKey="reel_deger">reel değeri</TermTip>{' '}
          <strong>hesaplanmaz</strong> — sistem tahmin üretmez.
        </p>
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Seri</label>
            <select
              value={form.series_code}
              onChange={(e) => setForm((f) => ({ ...f, series_code: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#197A56]"
            >
              {series.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dönem</label>
            <input
              placeholder="2026-07"
              value={form.donem}
              onChange={(e) => setForm((f) => ({ ...f, donem: e.target.value }))}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#197A56]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Değer</label>
            <input
              type="number"
              step="0.0001"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              className="w-36 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#197A56]"
            />
          </div>
          <button
            onClick={add}
            disabled={busy || !form.donem || !form.value}
            className="px-4 py-2 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] transition-colors text-sm font-medium disabled:opacity-50"
          >
            Ekle
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </section>

      {/* Seri değerleri */}
      <section>
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Girilmiş değerler</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {series.map((s) => {
            const rows = bySeries[s.code] ?? []
            return (
              <div key={s.code} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium text-gray-900">{s.label}</h3>
                  <span className="text-xs text-gray-400">{s.unit}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>

                {rows.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2">
                    Değer girilmemiş — bu seriye bağlı gruplar reel hesaplanamaz.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {rows.map((v) => (
                      <div key={v.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{v.donem}</span>
                        <span className="text-gray-900 font-medium">
                          {Number(v.value).toLocaleString('tr-TR')}
                        </span>
                        <button
                          onClick={() => remove(v.id)}
                          disabled={busy}
                          className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
                        >
                          sil
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Grup eşleştirmesi */}
      <section>
        <h2 className="text-sm font-semibold text-gray-800 mb-1">
          <TermTip termKey="gider_gruplari">Grup</TermTip> →{' '}
          <TermTip termKey="deflator">deflatör</TermTip> eşleştirmesi
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Her gider grubu farklı bir seriyle düzeltilir. Doğalgazı TÜFE ile düzeltmek
          kur etkisini gerçek maliyet artışı gibi gösterirdi.{' '}
          <TermTip termKey="baz_donem">Baz dönem</TermTip> her serinin en güncel değeridir.
        </p>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2.5 text-left text-gray-500 font-medium">Grup</th>
                <th className="px-4 py-2.5 text-left text-gray-500 font-medium">Deflatör</th>
                <th className="px-4 py-2.5 text-left text-gray-500 font-medium">Gerekçe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {map.map((m) => (
                <tr key={m.group_code}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {GROUP_LABELS[m.group_code] ?? m.group_code}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">{m.series_label}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{m.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
