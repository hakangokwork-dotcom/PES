'use client'

import { useState, useEffect, useMemo } from 'react'
import { DataTable, EmptyState, type Column } from '@/components/ui'

interface Workshop { id: number; code: string; name: string }
interface Line { id: number; code: string; name: string }
interface ChangeoverRow { id: number; line_code: string; workshop_code: string; occurred_date: string; total_min: number; machine_adj_min: number; balancing_min: number; first_batch_min: number; warmup_min: number }

export default function ChangeoverPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [records, setRecords] = useState<ChangeoverRow[]>([])

  const ortalama = useMemo(() => (
    records.length ? Math.round(records.reduce((t, r) => t + Number(r.total_min || 0), 0) / records.length) : 0
  ), [records])

  /* Dakika kolonları numeric: sağa dayalı + tabular rakam, böylece
     basamaklar üst üste gelir ve göz büyüğü hızlı bulur. */
  const dk = (v: number) => `${v} dk`
  const kolonlar: Column<ChangeoverRow>[] = [
    { key: 'occurred_date', label: 'Tarih', width: '110px',
      render: r => <span className="text-muted">{r.occurred_date}</span> },
    { key: 'workshop_code', label: 'Atölye / Bant',
      render: r => <span className="text-ink">{r.workshop_code} / {r.line_code}</span> },
    { key: 'machine_adj_min', label: 'Makine', numeric: true, render: r => dk(r.machine_adj_min) },
    { key: 'balancing_min', label: 'Dengeleme', numeric: true, render: r => dk(r.balancing_min) },
    { key: 'first_batch_min', label: 'İlk Parti', numeric: true, render: r => dk(r.first_batch_min) },
    { key: 'warmup_min', label: 'Isınma', numeric: true, render: r => dk(r.warmup_min) },
    { key: 'total_min', label: 'Toplam', numeric: true,
      render: r => <span className="font-semibold text-ink">{dk(r.total_min)}</span> },
  ]
  const [workshopId, setWorkshopId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    line_id: '', occurred_date: new Date().toISOString().split('T')[0],
    machine_adj_min: 0, balancing_min: 0, first_batch_min: 0, warmup_min: 0,
  })

  const totalMin = form.machine_adj_min + form.balancing_min + form.first_batch_min + form.warmup_min

  useEffect(() => {
    fetch('/api/pes/workshops').then(r => r.json()).then(d => setWorkshops(d.workshops ?? []))
    fetch('/api/pes/changeover').then(r => r.json()).then(d => setRecords(d.records ?? []))
  }, [])

  useEffect(() => {
    if (!workshopId) return
    fetch(`/api/pes/workshops/${workshopId}/lines`).then(r => r.json()).then(d => setLines(d.lines ?? []))
  }, [workshopId])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const res = await fetch('/api/pes/changeover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, line_id: parseInt(form.line_id), total_min: totalMin }),
    })

    setLoading(false)
    if (res.ok) {
      setMessage('Changeover kaydedildi')
      setShowForm(false)
      const r = await fetch('/api/pes/changeover').then(r => r.json())
      setRecords(r.records ?? [])
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Model Değiştirme (Changeover)</h1>
          <p className="text-faint mt-1">Üretim geçiş süreleri ve kayıpları</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
          {showForm ? 'İptal' : '+ Changeover Ekle'}
        </button>
      </div>

      {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-line-soft rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Atölye</label>
              <select className={inputClass} value={workshopId} onChange={e => setWorkshopId(e.target.value)} required>
                <option value="">Seçin...</option>
                {workshops.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Bant</label>
              <select className={inputClass} value={form.line_id} onChange={e => setForm(p => ({...p, line_id: e.target.value}))} required>
                <option value="">Seçin...</option>
                {lines.map(l => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Tarih</label>
              <input type="date" className={inputClass} value={form.occurred_date} onChange={e => setForm(p => ({...p, occurred_date: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Makine Ayar (dk)</label>
              <input type="number" className={inputClass} value={form.machine_adj_min} onChange={e => setForm(p => ({...p, machine_adj_min: parseInt(e.target.value)||0}))} min={0} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Bant Dengeleme (dk)</label>
              <input type="number" className={inputClass} value={form.balancing_min} onChange={e => setForm(p => ({...p, balancing_min: parseInt(e.target.value)||0}))} min={0} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">İlk Parti (dk)</label>
              <input type="number" className={inputClass} value={form.first_batch_min} onChange={e => setForm(p => ({...p, first_batch_min: parseInt(e.target.value)||0}))} min={0} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Isınma (dk)</label>
              <input type="number" className={inputClass} value={form.warmup_min} onChange={e => setForm(p => ({...p, warmup_min: parseInt(e.target.value)||0}))} min={0} />
            </div>
            <div className="bg-amber-50 rounded-lg p-3 flex flex-col justify-center">
              <p className="text-xs text-amber-600">Toplam Süre</p>
              <p className="text-xl font-bold text-amber-900">{totalMin} dk</p>
            </div>
          </div>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </form>
      )}

      {records.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
          <DataTable
            columns={kolonlar}
            rows={records}
            rowKey={r => r.id}
            initialSort={{ key: 'occurred_date', dir: 'desc' }}
            empty={<EmptyState title="Changeover kaydı yok" description="Seçili atölye için bu dönemde model geçişi girilmemiş." />}
            footer={<span className="num">{records.length} kayıt · ortalama {ortalama} dk</span>}
          />
        </div>
      )}
    </div>
  )
}
