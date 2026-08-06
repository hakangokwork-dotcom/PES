'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Line { id: number; code: string; name: string }
interface DowntimeRow { id: number; line_code: string; occurred_at: string; duration_min: number; downtime_type: string; reason: string | null; affected_ops: number }

const TYPES = ['Planlı','Plansız','Organizasyonel','Tedarik']

export default function DowntimeWrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor...</div>}><WorkshopDowntimePage /></Suspense>
}

function WorkshopDowntimePage() {
  const searchParams = useSearchParams()
  const wid = searchParams.get('wid')
  const [workshopName, setWorkshopName] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [records, setRecords] = useState<DowntimeRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ line_id: '', occurred_at: new Date().toISOString().slice(0,16), duration_min: 0, downtime_type: 'Plansız', reason: '', affected_ops: 0 })

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/workshops/${wid}`).then(r => r.json()).then(d => setWorkshopName(d.workshop?.name ?? ''))
    fetch(`/api/pes/workshops/${wid}/lines`).then(r => r.json()).then(d => setLines(d.lines ?? []))
    fetch(`/api/pes/downtime?workshop_id=${wid}`).then(r => r.json()).then(d => setRecords(d.records ?? []))
  }, [wid])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setMessage('')
    const res = await fetch('/api/pes/downtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, line_id: parseInt(form.line_id), occurred_at: new Date(form.occurred_at).toISOString() }) })
    setLoading(false)
    if (res.ok) {
      setMessage('Duruş kaydedildi'); setShowForm(false)
      fetch(`/api/pes/downtime?workshop_id=${wid}`).then(r => r.json()).then(d => setRecords(d.records ?? []))
    }
  }

  const totalMin = records.reduce((s, r) => s + r.duration_min, 0)
  if (!wid) return <p>Atölye seçin</p>
  const ic = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/workshop?wid=${wid}`} className="text-sm text-faint hover:text-gray-700">← Dashboard</Link>
          <h1 className="text-2xl font-bold text-ink mt-2">{workshopName} — Duruş Kayıtları</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium">{showForm ? 'İptal' : '+ Duruş Ekle'}</button>
      </div>

      {totalMin > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4"><p className="text-xs text-red-600">Toplam Duruş</p><p className="text-xl font-bold text-red-700">{totalMin} dk</p></div>
          <div className="bg-white border border-line-soft rounded-xl p-4"><p className="text-xs text-faint">Kayıt</p><p className="text-xl font-bold">{records.length}</p></div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4"><p className="text-xs text-amber-600">Ortalama</p><p className="text-xl font-bold text-amber-700">{records.length > 0 ? Math.round(totalMin/records.length) : 0} dk</p></div>
        </div>
      )}

      {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-line-soft rounded-xl p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div><label className="block text-xs font-medium text-muted mb-1">Bant</label><select className={ic} value={form.line_id} onChange={e => setForm(p => ({...p, line_id: e.target.value}))} required><option value="">Seçin</option>{lines.map(l => <option key={l.id} value={l.id}>{l.code}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Tarih/Saat</label><input type="datetime-local" className={ic} value={form.occurred_at} onChange={e => setForm(p => ({...p, occurred_at: e.target.value}))} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Süre (dk)</label><input type="number" className={ic} value={form.duration_min} onChange={e => setForm(p => ({...p, duration_min: parseInt(e.target.value)||0}))} min={1} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Tür</label><select className={ic} value={form.downtime_type} onChange={e => setForm(p => ({...p, downtime_type: e.target.value}))}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Etk. Op.</label><input type="number" className={ic} value={form.affected_ops} onChange={e => setForm(p => ({...p, affected_ops: parseInt(e.target.value)||0}))} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Neden</label><input className={ic} value={form.reason} onChange={e => setForm(p => ({...p, reason: e.target.value}))} placeholder="Arıza açıklaması" /></div>
          <div className="md:col-span-3"><button type="submit" disabled={loading} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50">{loading ? '...' : 'Kaydet'}</button></div>
        </form>
      )}

      {records.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas border-b border-line-soft"><th className="px-4 py-3 text-left text-faint">Tarih</th><th className="px-4 py-3 text-left text-faint">Bant</th><th className="px-4 py-3 text-right text-faint">Süre</th><th className="px-4 py-3 text-center text-faint">Tür</th><th className="px-4 py-3 text-left text-faint">Neden</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-canvas">
                  <td className="px-4 py-3 text-muted">{new Date(r.occurred_at).toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3">{r.line_code}</td>
                  <td className="px-4 py-3 text-right text-red-600 font-medium">{r.duration_min} dk</td>
                  <td className="px-4 py-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.downtime_type === 'Plansız' ? 'bg-red-100 text-red-700' : r.downtime_type === 'Tedarik' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-muted'}`}>{r.downtime_type}</span></td>
                  <td className="px-4 py-3 text-muted truncate max-w-[200px]">{r.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
