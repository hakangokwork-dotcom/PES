'use client'

import { useState, useEffect } from 'react'
import GirenBilgisi from '@/components/pes/GirenBilgisi'
import type { GirenAlanlari } from '@/lib/pes/giren'

interface Workshop { id: number; code: string; name: string }

export default function WorkforcePage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [workshopId, setWorkshopId] = useState('')
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [form, setForm] = useState({
    total_staff: 0, left_count: 0, joined_count: 0, in_warmup: 0, avg_tenure_mon: 0,
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [mevcut, setMevcut] = useState<GirenAlanlari | null>(null)
  const [yenile, setYenile] = useState(0)

  useEffect(() => {
    fetch('/api/pes/workshops').then(r => r.json()).then(d => setWorkshops(d.workshops ?? []))
  }, [])

  // Mevcut veriyi yükle
  useEffect(() => {
    if (!workshopId) return
    fetch(`/api/pes/workforce?workshop_id=${workshopId}`)
      .then(r => r.json())
      .then(d => {
        const existing = (d.records ?? []).find((r: Record<string, unknown>) => r.year === year && r.month === month)
        setMevcut(existing ?? null)
        if (existing) {
          setForm({
            total_staff: existing.total_staff, left_count: existing.left_count,
            joined_count: existing.joined_count, in_warmup: existing.in_warmup,
            avg_tenure_mon: existing.avg_tenure_mon ?? 0,
          })
        }
      })
  }, [workshopId, year, month, yenile])

  const netChange = form.joined_count - form.left_count
  const turnoverRate = form.total_staff > 0
    ? (((form.left_count + form.joined_count) / 2) / form.total_staff * 100).toFixed(1)
    : '0'

  async function handleSave() {
    if (!workshopId) return
    setLoading(true)
    setError('')
    setMessage('')

    const res = await fetch('/api/pes/workforce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workshop_id: parseInt(workshopId), year, month, ...form }),
    })

    const data = await res.json()
    setLoading(false)
    if (!res.ok) setError(data.error)
    else { setMessage('İşgücü verisi kaydedildi'); setYenile((n) => n + 1) }
  }

  const inputClass = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent text-right'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">İşgücü Devir Oranı</h1>
        <p className="text-faint mt-1">Aylık personel giriş-çıkış takibi</p>
      </div>

      <div className="bg-surface border border-line-soft rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-body mb-1">Atölye</label>
            <select className="w-full px-3 py-2 border border-line rounded-lg text-sm" value={workshopId} onChange={e => setWorkshopId(e.target.value)}>
              <option value="">Seçin...</option>
              {workshops.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Yıl</label>
            <select className="w-full px-3 py-2 border border-line rounded-lg text-sm" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              <option value={2025}>2025</option><option value={2026}>2026</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Ay</label>
            <select className="w-full px-3 py-2 border border-line rounded-lg text-sm" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {workshopId && (
        <>
          <div className="bg-surface border border-line-soft rounded-xl p-6">
            <h2 className="text-lg font-semibold text-ink mb-4">Personel Verileri</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Toplam Çalışan (ay sonu)</label>
                <input type="number" className={inputClass} value={form.total_staff} onChange={e => setForm(p => ({...p, total_staff: parseInt(e.target.value)||0}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">İşten Ayrılan</label>
                <input type="number" className={inputClass} value={form.left_count} onChange={e => setForm(p => ({...p, left_count: parseInt(e.target.value)||0}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">İşe Başlayan</label>
                <input type="number" className={inputClass} value={form.joined_count} onChange={e => setForm(p => ({...p, joined_count: parseInt(e.target.value)||0}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Isınma Sürecindeki</label>
                <input type="number" className={inputClass} value={form.in_warmup} onChange={e => setForm(p => ({...p, in_warmup: parseInt(e.target.value)||0}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Ort. Kıdem (ay)</label>
                <input type="number" className={inputClass} value={form.avg_tenure_mon} onChange={e => setForm(p => ({...p, avg_tenure_mon: parseFloat(e.target.value)||0}))} step={0.1} />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-line-soft grid grid-cols-3 gap-4">
              <div className={`rounded-lg p-3 text-center ${netChange >= 0 ? 'bg-accent-soft' : 'bg-danger-soft'}`}>
                <p className="text-xs text-faint">Net Değişim</p>
                <p className={`text-xl font-bold ${netChange >= 0 ? 'text-accent-ink' : 'text-danger'}`}>
                  {netChange > 0 ? '+' : ''}{netChange}
                </p>
              </div>
              <div className={`rounded-lg p-3 text-center ${Number(turnoverRate) <= 20 ? 'bg-accent-soft' : Number(turnoverRate) <= 40 ? 'bg-warn-soft' : 'bg-danger-soft'}`}>
                <p className="text-xs text-faint">Devir Oranı</p>
                <p className={`text-xl font-bold ${Number(turnoverRate) <= 20 ? 'text-accent-ink' : Number(turnoverRate) <= 40 ? 'text-warn' : 'text-danger'}`}>
                  %{turnoverRate}
                </p>
              </div>
              <div className="bg-canvas rounded-lg p-3 text-center">
                <p className="text-xs text-faint">Isınma Sürecinde</p>
                <p className="text-xl font-bold text-ink">{form.in_warmup}</p>
              </div>
            </div>
          </div>

          <div className="bg-canvas border border-line-soft rounded-xl p-4 text-xs text-faint">
            <p><strong>Referans:</strong> ≤%20 İyi · %20–40 Normal · %40–60 Yüksek · &gt;%60 Kritik</p>
          </div>

          <GirenBilgisi kayit={mevcut} />
          {error && <div className="bg-danger-soft border border-danger-line text-danger text-sm px-4 py-2 rounded-lg">{error}</div>}
          {message && <div className="bg-accent-soft border border-line-soft text-accent-ink text-sm px-4 py-2 rounded-lg">{message}</div>}

          <button onClick={handleSave} disabled={loading} className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </>
      )}
    </div>
  )
}
