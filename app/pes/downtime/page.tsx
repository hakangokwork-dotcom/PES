'use client'

import { useState, useEffect } from 'react'

interface Workshop { id: number; code: string; name: string }
interface Line { id: number; code: string; name: string }
interface DowntimeRow { id: number; line_code: string; workshop_code: string; occurred_at: string; duration_min: number; downtime_type: string; reason: string | null; affected_ops: number }

const DOWNTIME_TYPES = ['Planlı', 'Plansız', 'Organizasyonel', 'Tedarik']

export default function DowntimePage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [records, setRecords] = useState<DowntimeRow[]>([])
  const [workshopId, setWorkshopId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    line_id: '', occurred_at: new Date().toISOString().slice(0, 16),
    duration_min: 0, downtime_type: 'Plansız', reason: '', affected_ops: 0,
  })

  useEffect(() => {
    fetch('/api/pes/workshops').then(r => r.json()).then(d => setWorkshops(d.workshops ?? []))
    fetch('/api/pes/downtime').then(r => r.json()).then(d => setRecords(d.records ?? []))
  }, [])

  useEffect(() => {
    if (!workshopId) return
    fetch(`/api/pes/workshops/${workshopId}/lines`).then(r => r.json()).then(d => setLines(d.lines ?? []))
  }, [workshopId])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const res = await fetch('/api/pes/downtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, line_id: parseInt(form.line_id), occurred_at: new Date(form.occurred_at).toISOString() }),
    })

    setLoading(false)
    if (res.ok) {
      setMessage('Duruş kaydedildi')
      setShowForm(false)
      const r = await fetch('/api/pes/downtime').then(r => r.json())
      setRecords(r.records ?? [])
    }
  }

  const totalDowntime = records.reduce((sum, r) => sum + r.duration_min, 0)
  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#197A56] focus:ring-1 focus:ring-[#197A56]'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Duruş Analizi</h1>
          <p className="text-gray-500 mt-1">Bant bazlı duruş kayıtları</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-[#197A56] text-white rounded-lg hover:bg-[#0E3E1B] text-sm font-medium">
          {showForm ? 'İptal' : '+ Duruş Ekle'}
        </button>
      </div>

      {totalDowntime > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">Toplam Duruş</p>
            <p className="text-xl font-bold text-red-600">{totalDowntime} dk</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">Kayıt Sayısı</p>
            <p className="text-xl font-bold text-gray-900">{records.length}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">Ort. Duruş</p>
            <p className="text-xl font-bold text-amber-600">{records.length > 0 ? Math.round(totalDowntime / records.length) : 0} dk</p>
          </div>
        </div>
      )}

      {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Atölye</label>
              <select className={inputClass} value={workshopId} onChange={e => setWorkshopId(e.target.value)} required>
                <option value="">Seçin...</option>
                {workshops.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bant</label>
              <select className={inputClass} value={form.line_id} onChange={e => setForm(p => ({...p, line_id: e.target.value}))} required>
                <option value="">Seçin...</option>
                {lines.map(l => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tarih/Saat</label>
              <input type="datetime-local" className={inputClass} value={form.occurred_at} onChange={e => setForm(p => ({...p, occurred_at: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Süre (dk)</label>
              <input type="number" className={inputClass} value={form.duration_min} onChange={e => setForm(p => ({...p, duration_min: parseInt(e.target.value)||0}))} min={1} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tür</label>
              <select className={inputClass} value={form.downtime_type} onChange={e => setForm(p => ({...p, downtime_type: e.target.value}))}>
                {DOWNTIME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Etkilenen Op.</label>
              <input type="number" className={inputClass} value={form.affected_ops} onChange={e => setForm(p => ({...p, affected_ops: parseInt(e.target.value)||0}))} min={0} />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Neden</label>
              <input className={inputClass} value={form.reason} onChange={e => setForm(p => ({...p, reason: e.target.value}))} placeholder="Overlok makinesi arızası" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-[#197A56] text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </form>
      )}

      {records.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Tarih</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Atölye/Bant</th>
                <th className="px-4 py-3 text-right text-gray-500 font-medium">Süre</th>
                <th className="px-4 py-3 text-center text-gray-500 font-medium">Tür</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Neden</th>
                <th className="px-4 py-3 text-right text-gray-500 font-medium">Etk. Op.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{new Date(r.occurred_at).toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-gray-900">{r.workshop_code} / {r.line_code}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">{r.duration_min} dk</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      r.downtime_type === 'Plansız' ? 'bg-red-100 text-red-700' :
                      r.downtime_type === 'Tedarik' ? 'bg-orange-100 text-orange-700' :
                      r.downtime_type === 'Organizasyonel' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{r.downtime_type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{r.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{r.affected_ops}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
