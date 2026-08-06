'use client'

import { useState, useEffect } from 'react'
import { useDonem } from '@/lib/pes/useDonem'
import { useToast } from '@/components/ui'

interface Workshop { id: number; code: string; name: string }
interface Line { id: number; code: string; name: string; daily_target: number }
interface ProdRow { line_id: number; line_code: string; line_name: string; model_code: string; total_sam: number; target_qty: number; actual_qty: number; work_days: number }

export default function ProductionPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [workshopId, setWorkshopId] = useState('')
  /* Dönem artık ekranın kendi state'i değil; üst bardaki seçim URL'de
     tutulur ve tüm /pes ekranları aynı dönemi gösterir. */
  const { yil: year, ay: month } = useDonem()
  const [rows, setRows] = useState<ProdRow[]>([])
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/pes/workshops').then(r => r.json()).then(d => setWorkshops(d.workshops ?? []))
  }, [])

  // Atölye seçilince bantları yükle
  useEffect(() => {
    if (!workshopId) return
    fetch(`/api/pes/workshops/${workshopId}`)
      .then(r => r.json())
      .then(async (d) => {
        // Bantları ayrı endpoint'ten al
        const lr = await fetch(`/api/pes/workshops/${workshopId}/lines`).then(r => r.json())
        const lineList = lr.lines ?? []
        setLines(lineList)

        // Her bant için boş satır oluştur
        setRows(lineList.map((l: Line) => ({
          line_id: l.id,
          line_code: l.code,
          line_name: l.name,
          model_code: '',
          total_sam: 0,
          target_qty: l.daily_target * 22,
          actual_qty: 0,
          work_days: 22,
        })))

        // Mevcut veriyi yükle
        const pr = await fetch(`/api/pes/production?workshop_id=${workshopId}&year=${year}&month=${month}`).then(r => r.json())
        if (pr.production?.length > 0) {
          setRows(prev => prev.map(row => {
            const existing = pr.production.find((p: Record<string, unknown>) => p.line_id === row.line_id)
            if (existing) {
              return {
                ...row,
                model_code: existing.model_code ?? '',
                total_sam: existing.total_sam ?? 0,
                target_qty: existing.target_qty ?? 0,
                actual_qty: existing.actual_qty ?? 0,
                work_days: existing.work_days ?? 22,
              }
            }
            return row
          }))
        }
      })
  }, [workshopId, year, month])

  function updateRow(idx: number, field: string, value: string | number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  async function handleSave() {
    if (!workshopId) return
    setLoading(true)
    setError('')

    let saved = 0
    for (const row of rows) {
      if (!row.model_code && row.actual_qty === 0) continue

      const res = await fetch('/api/pes/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_id: row.line_id,
          workshop_id: parseInt(workshopId),
          year, month,
          model_code: row.model_code || `MODEL-${row.line_code}`,
          total_sam: row.total_sam,
          target_qty: row.target_qty,
          actual_qty: row.actual_qty,
          work_days: row.work_days,
        }),
      })

      if (res.ok) saved++
      else {
        const d = await res.json()
        setError(d.error)
        break
      }
    }

    setLoading(false)
    if (!error) toast.success(`${saved} bant için üretim verisi kaydedildi`)
  }

  const inputClass = 'w-full px-2 py-1.5 border border-line rounded text-sm focus:outline-none focus:border-accent text-right'

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Aylık Üretim Girişi</h1>
        <p className="text-faint mt-1">Bant bazlı aylık üretim verilerini girin</p>
      </div>

      {/* Seçim */}
      <div className="bg-white border border-line-soft rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Atölye</label>
            <select className="w-full px-3 py-2 border border-line rounded-lg text-sm" value={workshopId} onChange={e => setWorkshopId(e.target.value)}>
              <option value="">Seçin...</option>
              {workshops.map(w => (
                <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {workshopId && lines.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-4">Bant Bazlı Üretim</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-soft">
                  <th className="py-2 text-left text-faint font-medium">Bant</th>
                  <th className="py-2 text-left text-faint font-medium">Model Kodu</th>
                  <th className="py-2 text-right text-faint font-medium">SAM (dk)</th>
                  <th className="py-2 text-right text-faint font-medium">Hedef</th>
                  <th className="py-2 text-right text-faint font-medium">Gerçekleşen</th>
                  <th className="py-2 text-right text-faint font-medium">Verimlilik</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => {
                  const eff = row.target_qty > 0 ? ((row.actual_qty / row.target_qty) * 100) : 0
                  return (
                    <tr key={row.line_id}>
                      <td className="py-2 text-accent font-medium">{row.line_code}<br/><span className="text-xs text-faint">{row.line_name}</span></td>
                      <td className="py-2"><input className="w-32 px-2 py-1.5 border border-line rounded text-sm" value={row.model_code} onChange={e => updateRow(idx, 'model_code', e.target.value)} placeholder="PNT-001" /></td>
                      <td className="py-2"><input type="number" className={inputClass} style={{width: 80}} value={row.total_sam} onChange={e => updateRow(idx, 'total_sam', parseFloat(e.target.value) || 0)} min={0} step={0.1} /></td>
                      <td className="py-2"><input type="number" className={inputClass} style={{width: 90}} value={row.target_qty} onChange={e => updateRow(idx, 'target_qty', parseInt(e.target.value) || 0)} min={0} /></td>
                      <td className="py-2"><input type="number" className={inputClass} style={{width: 90}} value={row.actual_qty} onChange={e => updateRow(idx, 'actual_qty', parseInt(e.target.value) || 0)} min={0} /></td>
                      <td className="py-2 text-right">
                        <span className={`font-medium ${eff >= 90 ? 'text-green-600' : eff >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                          %{eff.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {error && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}

          <button
            onClick={handleSave}
            disabled={loading}
            className="mt-4 px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Kaydediliyor...' : 'Üretim Verilerini Kaydet'}
          </button>
        </div>
      )}

      {workshopId && lines.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-700">Bu atölyeye henüz bant eklenmemiş. Önce atölye detay sayfasından bant ekleyin.</p>
        </div>
      )}
    </div>
  )
}
