'use client'

import { useState, useEffect, useMemo } from 'react'
import { Badge, DataTable, EmptyState, type Column } from '@/components/ui'

interface Workshop { id: number; code: string; name: string }
interface Line { id: number; code: string; name: string }
interface DowntimeRow { id: number; line_code: string; workshop_code: string; occurred_at: string; duration_min: number; downtime_type: string; reason: string | null; affected_ops: number }

/* Duruş türü bir SINIFLANDIRMA değil, ciddiyet göstergesi: plansız duruş
   üretimi durdurur, planlı olan planın parçasıdır. O yüzden ton taşıyor. */
const DURUM_TONU: Record<string, 'bad' | 'warn' | 'neutral'> = {
  'Plansız': 'bad',
  'Tedarik': 'warn',
  'Organizasyonel': 'neutral',
  'Planlı': 'neutral',
}

const DOWNTIME_TYPES = ['Planlı', 'Plansız', 'Organizasyonel', 'Tedarik']

export default function DowntimePage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [records, setRecords] = useState<DowntimeRow[]>([])

  const toplamDk = useMemo(() => records.reduce((t, r) => t + Number(r.duration_min || 0), 0), [records])

  const kolonlar: Column<DowntimeRow>[] = [
    {
      key: 'occurred_at', label: 'Tarih', width: '160px',
      render: r => <span className="text-muted">{new Date(r.occurred_at).toLocaleString('tr-TR')}</span>,
    },
    {
      key: 'workshop_code', label: 'Atölye / Bant',
      render: r => <span className="text-ink">{r.workshop_code} / {r.line_code}</span>,
    },
    {
      key: 'duration_min', label: 'Süre', numeric: true,
      render: r => <span className="font-medium text-danger">{r.duration_min} dk</span>,
    },
    {
      key: 'downtime_type', label: 'Tür', align: 'center',
      render: r => <Badge tone={DURUM_TONU[r.downtime_type] ?? 'neutral'}>{r.downtime_type}</Badge>,
    },
    {
      key: 'reason', label: 'Neden',
      render: r => <span className="block max-w-[220px] truncate text-muted">{r.reason ?? '—'}</span>,
    },
    { key: 'affected_ops', label: 'Etk. Op.', numeric: true },
  ]
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
  const inputClass = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Duruş Analizi</h1>
          <p className="text-faint mt-1">Bant bazlı duruş kayıtları</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
          {showForm ? 'İptal' : '+ Duruş Ekle'}
        </button>
      </div>

      {totalDowntime > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-line-soft rounded-xl p-4">
            <p className="text-xs text-faint">Toplam Duruş</p>
            <p className="text-xl font-bold text-red-600">{totalDowntime} dk</p>
          </div>
          <div className="bg-white border border-line-soft rounded-xl p-4">
            <p className="text-xs text-faint">Kayıt Sayısı</p>
            <p className="text-xl font-bold text-ink">{records.length}</p>
          </div>
          <div className="bg-white border border-line-soft rounded-xl p-4">
            <p className="text-xs text-faint">Ort. Duruş</p>
            <p className="text-xl font-bold text-amber-600">{records.length > 0 ? Math.round(totalDowntime / records.length) : 0} dk</p>
          </div>
        </div>
      )}

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
              <label className="block text-xs font-medium text-muted mb-1">Tarih/Saat</label>
              <input type="datetime-local" className={inputClass} value={form.occurred_at} onChange={e => setForm(p => ({...p, occurred_at: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Süre (dk)</label>
              <input type="number" className={inputClass} value={form.duration_min} onChange={e => setForm(p => ({...p, duration_min: parseInt(e.target.value)||0}))} min={1} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Tür</label>
              <select className={inputClass} value={form.downtime_type} onChange={e => setForm(p => ({...p, downtime_type: e.target.value}))}>
                {DOWNTIME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Etkilenen Op.</label>
              <input type="number" className={inputClass} value={form.affected_ops} onChange={e => setForm(p => ({...p, affected_ops: parseInt(e.target.value)||0}))} min={0} />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-muted mb-1">Neden</label>
              <input className={inputClass} value={form.reason} onChange={e => setForm(p => ({...p, reason: e.target.value}))} placeholder="Overlok makinesi arızası" />
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
            initialSort={{ key: 'occurred_at', dir: 'desc' }}
            rowTone={r => (r.downtime_type === 'Plansız' ? 'bad' : 'neutral')}
            empty={<EmptyState title="Duruş kaydı yok" description="Seçili atölye için bu dönemde kayıt girilmemiş." />}
            footer={<span className="num">{records.length} kayıt · toplam {toplamDk} dk</span>}
          />
        </div>
      )}
    </div>
  )
}
