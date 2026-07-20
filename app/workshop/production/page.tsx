'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Line { id: number; code: string; name: string; daily_target: number; line_type: string }
interface ProdRow { line_id: number; line_code: string; line_name: string; model_code: string; total_sam: number; target_qty: number; actual_qty: number; work_days: number }

export default function ProductionWrapper() {
  return <Suspense fallback={<div className="p-6 text-gray-400">Yükleniyor...</div>}><WorkshopProductionPage /></Suspense>
}

function WorkshopProductionPage() {
  const searchParams = useSearchParams()
  const wid = searchParams.get('wid')
  const [workshopName, setWorkshopName] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [rows, setRows] = useState<ProdRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/workshops/${wid}`).then(r => r.json()).then(d => setWorkshopName(d.workshop?.name ?? ''))
    loadLines()
  }, [wid])

  async function loadLines() {
    if (!wid) return
    const lr = await fetch(`/api/pes/workshops/${wid}/lines`).then(r => r.json())
    const allLines = lr.lines ?? []
    const lineList = allLines.filter((l: Line) => l.line_type === 'Dikim' || l.line_type === 'Normal')
    setLines(lineList)
    setRows(lineList.map((l: Line) => ({
      line_id: l.id, line_code: l.code, line_name: l.name,
      model_code: '', total_sam: 0, target_qty: l.daily_target * 22, actual_qty: 0, work_days: 22,
    })))

    const pr = await fetch(`/api/pes/production?workshop_id=${wid}&year=${year}&month=${month}`).then(r => r.json())
    if (pr.production?.length > 0) {
      setRows(prev => prev.map(row => {
        const existing = pr.production.find((p: Record<string, unknown>) => p.line_id === row.line_id)
        return existing ? { ...row, model_code: (existing.model_code as string) ?? '', total_sam: Number(existing.total_sam) ?? 0, target_qty: Number(existing.target_qty), actual_qty: Number(existing.actual_qty), work_days: Number(existing.work_days) } : row
      }))
    }
  }

  useEffect(() => { if (wid) loadLines() }, [year, month])

  function updateRow(idx: number, field: string, value: string | number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  async function handleSave() {
    if (!wid) return
    setLoading(true); setMessage('')
    let saved = 0
    for (const row of rows) {
      if (!row.model_code && row.actual_qty === 0) continue
      const res = await fetch('/api/pes/production', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_id: row.line_id, workshop_id: parseInt(wid), year, month, model_code: row.model_code || `MODEL-${row.line_code}`, total_sam: row.total_sam, target_qty: row.target_qty, actual_qty: row.actual_qty, work_days: row.work_days }),
      })
      if (res.ok) saved++
    }
    setLoading(false)
    setMessage(`${saved} bant için üretim verisi kaydedildi`)
  }

  if (!wid) return <p>Atölye seçin</p>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href={`/workshop?wid=${wid}`} className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{workshopName} — Üretim Girişi</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Yıl</label>
            <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              <option value={2025}>2025</option><option value={2026}>2026</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ay</label>
            <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {lines.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 text-left text-gray-500 font-medium">Bant</th>
                <th className="py-2 text-left text-gray-500 font-medium">Model</th>
                <th className="py-2 text-center text-gray-500 font-medium">SAM (sn)</th>
                <th className="py-2 text-center text-gray-500 font-medium">Hedef</th>
                <th className="py-2 text-center text-gray-500 font-medium">Gerçekleşen</th>
                <th className="py-2 text-center text-gray-500 font-medium">Verimlilik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, idx) => {
                const eff = row.target_qty > 0 ? ((row.actual_qty / row.target_qty) * 100) : 0
                return (
                  <tr key={row.line_id}>
                    <td className="py-2"><span className="text-[#197A56] font-medium">{row.line_code}</span><br/><span className="text-xs text-gray-400">{row.line_name}</span></td>
                    <td className="py-2"><input className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm" value={row.model_code} onChange={e => updateRow(idx, 'model_code', e.target.value)} placeholder="PNT-001" /></td>
                    <td className="py-2 text-center"><input type="number" className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm text-center" value={row.total_sam} onChange={e => updateRow(idx, 'total_sam', parseFloat(e.target.value)||0)} step={0.1} /></td>
                    <td className="py-2 text-center"><input type="number" className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm text-center" value={row.target_qty} onChange={e => updateRow(idx, 'target_qty', parseInt(e.target.value)||0)} /></td>
                    <td className="py-2 text-center"><input type="number" className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm text-center" value={row.actual_qty} onChange={e => updateRow(idx, 'actual_qty', parseInt(e.target.value)||0)} /></td>
                    <td className="py-2 text-center"><span className={`font-bold ${eff >= 90 ? 'text-green-600' : eff >= 70 ? 'text-amber-600' : 'text-red-600'}`}>%{eff.toFixed(1)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {message && <div className="mt-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}
          <button onClick={handleSave} disabled={loading} className="mt-4 px-6 py-2.5 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] text-sm font-medium disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      )}

      {lines.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          Önce <Link href={`/workshop/profile?wid=${wid}`} className="underline">profil sayfasından</Link> bant ekleyin.
        </div>
      )}
    </div>
  )
}
