'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const DEFECTS = ['Dikiş hatası','Montaj hatası','Kemer/fermuar hatası','Temizlik hatası','Ütü hatası','Etiket/paket hatası','Ölçü hatası']

export default function QualityWrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor...</div>}><WorkshopQualityPage /></Suspense>
}

interface LineItem { id: number; code: string; name: string }

function WorkshopQualityPage() {
  const searchParams = useSearchParams()
  const wid = searchParams.get('wid')
  const [workshopName, setWorkshopName] = useState('')
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [form, setForm] = useState({ inspected_qty: 0, first_pass_qty: 0, rejected_qty: 0, rework_qty: 0, top_defect_cat: '', customer_return: 0, model_code: '', line_id: '' })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [lines, setLines] = useState<LineItem[]>([])

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/workshops/${wid}`).then(r => r.json()).then(d => setWorkshopName(d.workshop?.name ?? ''))
    fetch(`/api/pes/workshops/${wid}/lines`).then(r => r.json()).then(d => setLines(d.lines ?? [])).catch(() => {})
  }, [wid])

  const fpq = form.inspected_qty > 0 ? ((form.first_pass_qty / form.inspected_qty) * 100).toFixed(1) : '—'
  const redRate = form.inspected_qty > 0 ? ((form.rejected_qty / form.inspected_qty) * 100).toFixed(1) : '—'

  async function handleSave() {
    if (!wid) return
    setLoading(true); setMessage('')
    const res = await fetch('/api/pes/quality', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workshop_id: parseInt(wid), year, month, inspected_qty: form.inspected_qty, first_pass_qty: form.first_pass_qty, rejected_qty: form.rejected_qty, rework_qty: form.rework_qty, top_defect_cat: form.top_defect_cat, customer_return: form.customer_return, model_code: form.model_code || null, line_id: form.line_id ? parseInt(form.line_id) : null }),
    })
    setLoading(false)
    if (res.ok) setMessage('Kalite verisi kaydedildi')
  }

  if (!wid) return <p>Atölye seçin</p>
  const ic = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent text-right'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href={`/workshop?wid=${wid}`} className="text-sm text-faint hover:text-ink">← Dashboard</Link>
        <h1 className="text-2xl font-bold text-ink mt-2">{workshopName} — Kalite Girişi</h1>
      </div>

      <div className="bg-white border border-line-soft rounded-xl p-4 flex gap-4 items-end flex-wrap">
        <div><label className="block text-xs font-medium text-muted mb-1">Yil</label><select className="px-3 py-2 border border-line rounded-lg text-sm" value={year} onChange={e => setYear(parseInt(e.target.value))}><option value={2025}>2025</option><option value={2026}>2026</option></select></div>
        <div><label className="block text-xs font-medium text-muted mb-1">Ay</label><select className="px-3 py-2 border border-line rounded-lg text-sm" value={month} onChange={e => setMonth(parseInt(e.target.value))}>{[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}</select></div>
        <div><label className="block text-xs font-medium text-muted mb-1">Bant</label>
          <select className="px-3 py-2 border border-line rounded-lg text-sm" value={form.line_id} onChange={e => setForm(p => ({...p, line_id: e.target.value}))}>
            <option value="">Tumu</option>
            {lines.map(l => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1">Model Kodu</label>
          <input className="px-3 py-2 border border-line rounded-lg text-sm w-32" value={form.model_code} onChange={e => setForm(p => ({...p, model_code: e.target.value}))} placeholder="orn. WASHA" />
        </div>
      </div>

      <div className="bg-white border border-line-soft rounded-xl p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div><label className="block text-xs font-medium text-muted mb-1">Kontrol Edilen</label><input type="number" className={ic} value={form.inspected_qty} onChange={e => setForm(p => ({...p, inspected_qty: parseInt(e.target.value)||0}))} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">İlk Geçiş (FPQ)</label><input type="number" className={ic} value={form.first_pass_qty} onChange={e => setForm(p => ({...p, first_pass_qty: parseInt(e.target.value)||0}))} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Red Edilen</label><input type="number" className={ic} value={form.rejected_qty} onChange={e => setForm(p => ({...p, rejected_qty: parseInt(e.target.value)||0}))} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Yeniden İşlem</label><input type="number" className={ic} value={form.rework_qty} onChange={e => setForm(p => ({...p, rework_qty: parseInt(e.target.value)||0}))} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">Müşteri İade</label><input type="number" className={ic} value={form.customer_return} onChange={e => setForm(p => ({...p, customer_return: parseInt(e.target.value)||0}))} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1">En Sık Hata</label>
            <select className="w-full px-3 py-2 border border-line rounded-lg text-sm" value={form.top_defect_cat} onChange={e => setForm(p => ({...p, top_defect_cat: e.target.value}))}>
              <option value="">Seçin...</option>{DEFECTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-line-soft grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <p className="text-xs text-emerald-600">FPQ</p>
            <p className={`text-2xl font-bold ${Number(fpq) >= 95 ? 'text-green-600' : Number(fpq) >= 90 ? 'text-amber-600' : 'text-red-600'}`}>%{fpq}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-xs text-red-600">Red Oranı</p>
            <p className="text-2xl font-bold text-red-700">%{redRate}</p>
          </div>
          <div className="bg-canvas rounded-lg p-3 text-center">
            <p className="text-xs text-faint">Hedef FPQ</p>
            <p className="text-2xl font-bold text-faint">≥%95</p>
          </div>
        </div>
      </div>

      {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">{message}</div>}
      <button onClick={handleSave} disabled={loading} className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium disabled:opacity-50">
        {loading ? 'Kaydediliyor...' : 'Kaydet'}
      </button>
    </div>
  )
}
