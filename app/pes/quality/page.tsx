'use client'

import { useState, useEffect } from 'react'

interface Workshop { id: number; code: string; name: string }

const DEFECT_CATEGORIES = [
  'Dikiş hatası', 'Montaj hatası', 'Kemer/fermuar hatası',
  'Temizlik hatası', 'Ütü hatası', 'Etiket/paket hatası', 'Ölçü hatası',
]

export default function QualityPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [workshopId, setWorkshopId] = useState('')
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [form, setForm] = useState({
    inspected_qty: 0, first_pass_qty: 0, rejected_qty: 0,
    rework_qty: 0, top_defect_cat: '', customer_return: 0,
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/pes/workshops').then(r => r.json()).then(d => setWorkshops(d.workshops ?? []))
  }, [])

  const fpq = form.inspected_qty > 0 ? ((form.first_pass_qty / form.inspected_qty) * 100).toFixed(1) : '—'
  const redRate = form.inspected_qty > 0 ? ((form.rejected_qty / form.inspected_qty) * 100).toFixed(1) : '—'
  const reworkRate = form.inspected_qty > 0 ? ((form.rework_qty / form.inspected_qty) * 100).toFixed(1) : '—'

  async function handleSave() {
    if (!workshopId) return
    setLoading(true)
    setError('')
    setMessage('')

    const res = await fetch('/api/pes/quality', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workshop_id: parseInt(workshopId), year, month, ...form }),
    })

    const data = await res.json()
    setLoading(false)
    if (!res.ok) setError(data.error)
    else setMessage('Kalite verisi kaydedildi')
  }

  const inputClass = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent text-right'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Kalite Yönetimi</h1>
        <p className="text-faint mt-1">Aylık kalite verisi girişi</p>
      </div>

      {/* Seçim */}
      <div className="bg-white border border-line-soft rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Atölye</label>
            <select className="w-full px-3 py-2 border border-line rounded-lg text-sm" value={workshopId} onChange={e => setWorkshopId(e.target.value)}>
              <option value="">Seçin...</option>
              {workshops.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Yıl</label>
            <select className="w-full px-3 py-2 border border-line rounded-lg text-sm" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              <option value={2025}>2025</option><option value={2026}>2026</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ay</label>
            <select className="w-full px-3 py-2 border border-line rounded-lg text-sm" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {workshopId && (
        <>
          <div className="bg-white border border-line-soft rounded-xl p-6">
            <h2 className="text-lg font-semibold text-ink mb-4">Kalite Verileri</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Kontrol Edilen Adet</label>
                <input type="number" className={inputClass} value={form.inspected_qty} onChange={e => setForm(p => ({...p, inspected_qty: parseInt(e.target.value)||0}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">İlk Geçiş (FPQ)</label>
                <input type="number" className={inputClass} value={form.first_pass_qty} onChange={e => setForm(p => ({...p, first_pass_qty: parseInt(e.target.value)||0}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Red Edilen</label>
                <input type="number" className={inputClass} value={form.rejected_qty} onChange={e => setForm(p => ({...p, rejected_qty: parseInt(e.target.value)||0}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Yeniden İşlem</label>
                <input type="number" className={inputClass} value={form.rework_qty} onChange={e => setForm(p => ({...p, rework_qty: parseInt(e.target.value)||0}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Müşteri İade</label>
                <input type="number" className={inputClass} value={form.customer_return} onChange={e => setForm(p => ({...p, customer_return: parseInt(e.target.value)||0}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">En Sık Hata</label>
                <select className="w-full px-3 py-2 border border-line rounded-lg text-sm" value={form.top_defect_cat} onChange={e => setForm(p => ({...p, top_defect_cat: e.target.value}))}>
                  <option value="">Seçin...</option>
                  {DEFECT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Hesaplanan Metrikler */}
            <div className="mt-6 pt-4 border-t border-line-soft grid grid-cols-3 gap-4">
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-xs text-emerald-600">FPQ</p>
                <p className={`text-xl font-bold ${Number(fpq) >= 95 ? 'text-green-600' : Number(fpq) >= 90 ? 'text-amber-600' : 'text-red-600'}`}>%{fpq}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xs text-red-600">Red Oranı</p>
                <p className="text-xl font-bold text-red-700">%{redRate}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xs text-amber-600">Yeniden İşlem</p>
                <p className="text-xl font-bold text-amber-700">%{reworkRate}</p>
              </div>
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}
          {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}

          <button onClick={handleSave} disabled={loading} className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Kalite Verisini Kaydet'}
          </button>
        </>
      )}
    </div>
  )
}
