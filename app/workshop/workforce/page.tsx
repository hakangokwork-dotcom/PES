'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function WorkforceWrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor...</div>}><WorkshopWorkforcePage /></Suspense>
}

function WorkshopWorkforcePage() {
  const searchParams = useSearchParams()
  const wid = searchParams.get('wid')
  const [workshopName, setWorkshopName] = useState('')
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [form, setForm] = useState({ total_staff: 0, left_count: 0, joined_count: 0, in_warmup: 0, avg_tenure_mon: 0 })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/workshops/${wid}`).then(r => r.json()).then(d => setWorkshopName(d.workshop?.name ?? ''))
  }, [wid])

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/workforce?workshop_id=${wid}`).then(r => r.json()).then(d => {
      const existing = (d.records ?? []).find((r: Record<string, unknown>) => r.year === year && r.month === month)
      if (existing) setForm({ total_staff: existing.total_staff, left_count: existing.left_count, joined_count: existing.joined_count, in_warmup: existing.in_warmup, avg_tenure_mon: existing.avg_tenure_mon ?? 0 })
    })
  }, [wid, year, month])

  const turnoverRate = form.total_staff > 0 ? (((form.left_count + form.joined_count) / 2) / form.total_staff * 100).toFixed(1) : '0'

  async function handleSave() {
    if (!wid) return
    setLoading(true); setMessage('')
    const res = await fetch('/api/pes/workforce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workshop_id: parseInt(wid), year, month, ...form }) })
    setLoading(false)
    if (res.ok) setMessage('İşgücü verisi kaydedildi')
  }

  if (!wid) return <p>Atölye seçin</p>
  const ic = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent text-right'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href={`/workshop?wid=${wid}`} className="text-sm text-faint hover:text-gray-700">← Dashboard</Link>
        <h1 className="text-2xl font-bold text-ink mt-2">{workshopName} — İşgücü</h1>
      </div>
      <div className="bg-white border border-line-soft rounded-xl p-4 flex gap-4 items-end">
        <div><label className="block text-xs font-medium text-muted mb-1">Yıl</label><select className="px-3 py-2 border border-line rounded-lg text-sm" value={year} onChange={e => setYear(parseInt(e.target.value))}><option value={2025}>2025</option><option value={2026}>2026</option></select></div>
        <div><label className="block text-xs font-medium text-muted mb-1">Ay</label><select className="px-3 py-2 border border-line rounded-lg text-sm" value={month} onChange={e => setMonth(parseInt(e.target.value))}>{[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}</select></div>
      </div>
      <div className="bg-white border border-line-soft rounded-xl p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div><label className="block text-xs font-medium text-muted mb-1">Toplam Çalışan</label><input type="number" className={ic} value={form.total_staff} onChange={e => setForm(p => ({...p, total_staff: parseInt(e.target.value)||0}))} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Ayrılan</label><input type="number" className={ic} value={form.left_count} onChange={e => setForm(p => ({...p, left_count: parseInt(e.target.value)||0}))} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Başlayan</label><input type="number" className={ic} value={form.joined_count} onChange={e => setForm(p => ({...p, joined_count: parseInt(e.target.value)||0}))} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Isınma Sürecinde</label><input type="number" className={ic} value={form.in_warmup} onChange={e => setForm(p => ({...p, in_warmup: parseInt(e.target.value)||0}))} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Ort. Kıdem (ay)</label><input type="number" className={ic} value={form.avg_tenure_mon} onChange={e => setForm(p => ({...p, avg_tenure_mon: parseFloat(e.target.value)||0}))} step={0.1} /></div>
          <div className={`rounded-lg p-3 text-center ${Number(turnoverRate) <= 20 ? 'bg-green-50' : Number(turnoverRate) <= 40 ? 'bg-amber-50' : 'bg-red-50'}`}>
            <p className="text-xs text-faint">Devir Oranı</p>
            <p className={`text-2xl font-bold ${Number(turnoverRate) <= 20 ? 'text-green-600' : Number(turnoverRate) <= 40 ? 'text-amber-600' : 'text-red-600'}`}>%{turnoverRate}</p>
          </div>
        </div>
      </div>
      {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}
      <button onClick={handleSave} disabled={loading} className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium disabled:opacity-50">{loading ? 'Kaydediliyor...' : 'Kaydet'}</button>
    </div>
  )
}
