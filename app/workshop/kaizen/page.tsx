'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

interface KaizenItem { id: number; baslik: string; kategori: string; hedef_metrik: string; mevcut_deger: number; hedef_deger: number; sonuc_deger: number | null; sorumlu: string; baslangic_tarihi: string; bitis_tarihi: string; durum: string; notlar: string }

const KATEGORILER = ['DARBOGAZ', 'WIP', 'KALITE', 'MALIYET', 'CHANGEOVER', 'GENEL']
const DURUMLAR = ['PLAN', 'UYGULA', 'KONTROL', 'STANDART', 'IPTAL']
const durumColor: Record<string, string> = { PLAN: 'bg-blue-100 text-blue-800', UYGULA: 'bg-amber-100 text-amber-800', KONTROL: 'bg-purple-100 text-purple-800', STANDART: 'bg-green-100 text-green-800', IPTAL: 'bg-gray-100 text-faint' }
const durumLabel: Record<string, string> = { PLAN: 'Plan', UYGULA: 'Uygula', KONTROL: 'Kontrol', STANDART: 'Standart', IPTAL: 'Iptal' }

export default function Wrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yukleniyor...</div>}><KaizenPage /></Suspense>
}

function KaizenPage() {
  const wid = useSearchParams().get('wid')
  const [actions, setActions] = useState<KaizenItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ baslik: '', kategori: 'GENEL', hedef_metrik: '', mevcut_deger: '', hedef_deger: '', sorumlu: '', baslangic_tarihi: '', bitis_tarihi: '' })

  useEffect(() => {
    if (!wid) return
    fetch(`/api/pes/kaizen?workshop_id=${wid}`).then(r => r.json()).then(d => setActions(d.actions ?? [])).catch(() => {})
  }, [wid])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!wid) return
    setSaving(true)
    await fetch('/api/pes/kaizen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, workshop_id: Number(wid), mevcut_deger: Number(form.mevcut_deger) || null, hedef_deger: Number(form.hedef_deger) || null }) })
    setShowForm(false)
    const r = await fetch(`/api/pes/kaizen?workshop_id=${wid}`).then(r => r.json())
    setActions(r.actions ?? [])
    setSaving(false)
  }

  async function updateDurum(id: number, durum: string) {
    await fetch(`/api/pes/kaizen/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ durum }) })
    const r = await fetch(`/api/pes/kaizen?workshop_id=${wid}`).then(r => r.json())
    setActions(r.actions ?? [])
  }

  const ic = 'w-full border border-line rounded-lg px-3 py-2 text-sm'
  if (!wid) return <div className="p-6 text-faint">Atolye secin</div>

  // PDCA ozet
  const planCount = actions.filter(a => a.durum === 'PLAN').length
  const uygulaCount = actions.filter(a => a.durum === 'UYGULA').length
  const kontrolCount = actions.filter(a => a.durum === 'KONTROL').length
  const standartCount = actions.filter(a => a.durum === 'STANDART').length

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Kaizen / PDCA</h1>
          <p className="text-sm text-faint">Surekli iyilestirme aksiyonlari ve takibi</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">{showForm ? 'Iptal' : '+ Yeni Aksiyon'}</button>
      </div>

      {/* PDCA Ozet */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-800">{planCount}</p>
          <p className="text-xs text-blue-600">PLAN</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-800">{uygulaCount}</p>
          <p className="text-xs text-amber-600">UYGULA (DO)</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-purple-800">{kontrolCount}</p>
          <p className="text-xs text-purple-600">KONTROL (CHECK)</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-800">{standartCount}</p>
          <p className="text-xs text-green-600">STANDART (ACT)</p>
        </div>
      </div>

      {/* Yeni Aksiyon Formu */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-line-soft rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-ink">Yeni Iyilestirme Aksiyonu</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="md:col-span-2"><label className="block text-xs text-muted mb-1">Baslik *</label><input required className={ic} value={form.baslik} onChange={e => setForm(p => ({...p, baslik: e.target.value}))} placeholder="Darbogaz operasyonu icin ek makine" /></div>
            <div><label className="block text-xs text-muted mb-1">Kategori</label><select className={ic} value={form.kategori} onChange={e => setForm(p => ({...p, kategori: e.target.value}))}>{KATEGORILER.map(k => <option key={k} value={k}>{k}</option>)}</select></div>
            <div><label className="block text-xs text-muted mb-1">Hedef Metrik</label><input className={ic} value={form.hedef_metrik} onChange={e => setForm(p => ({...p, hedef_metrik: e.target.value}))} placeholder="orn. Cikti Verimliligi %" /></div>
            <div><label className="block text-xs text-muted mb-1">Mevcut Deger</label><input type="number" step="0.1" className={ic} value={form.mevcut_deger} onChange={e => setForm(p => ({...p, mevcut_deger: e.target.value}))} /></div>
            <div><label className="block text-xs text-muted mb-1">Hedef Deger</label><input type="number" step="0.1" className={ic} value={form.hedef_deger} onChange={e => setForm(p => ({...p, hedef_deger: e.target.value}))} /></div>
            <div><label className="block text-xs text-muted mb-1">Sorumlu</label><input className={ic} value={form.sorumlu} onChange={e => setForm(p => ({...p, sorumlu: e.target.value}))} /></div>
            <div><label className="block text-xs text-muted mb-1">Baslangic</label><input type="date" className={ic} value={form.baslangic_tarihi} onChange={e => setForm(p => ({...p, baslangic_tarihi: e.target.value}))} /></div>
            <div><label className="block text-xs text-muted mb-1">Bitis</label><input type="date" className={ic} value={form.bitis_tarihi} onChange={e => setForm(p => ({...p, bitis_tarihi: e.target.value}))} /></div>
          </div>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Kaydediliyor...' : 'Olustur'}</button>
        </form>
      )}

      {/* Aksiyon Listesi */}
      {actions.length === 0 ? (
        <div className="bg-white border border-line-soft rounded-xl p-8 text-center text-faint">Henuz kaizen aksiyonu yok</div>
      ) : (
        <div className="space-y-3">
          {actions.map(a => (
            <div key={a.id} className="bg-white border border-line-soft rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${durumColor[a.durum] || 'bg-gray-100'}`}>{durumLabel[a.durum] || a.durum}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-muted">{a.kategori}</span>
                    <span className="font-medium text-ink">{a.baslik}</span>
                  </div>
                  {a.hedef_metrik && (
                    <p className="text-sm text-faint mt-1">
                      {a.hedef_metrik}: {Number(a.mevcut_deger)} → {Number(a.hedef_deger)}
                      {a.sonuc_deger !== null && <span className={`ml-2 font-bold ${Number(a.sonuc_deger) >= Number(a.hedef_deger) ? 'text-green-600' : 'text-red-600'}`}>Sonuc: {Number(a.sonuc_deger)}</span>}
                    </p>
                  )}
                  <p className="text-xs text-faint mt-0.5">{a.sorumlu || '---'} | {a.baslangic_tarihi ? `${a.baslangic_tarihi} → ${a.bitis_tarihi || '...'}` : '---'}</p>
                </div>
                <div className="flex gap-1">
                  {DURUMLAR.filter(d => d !== a.durum && d !== 'IPTAL').map(d => (
                    <button key={d} onClick={() => updateDurum(a.id, d)}
                      className={`text-[10px] px-2 py-1 rounded ${durumColor[d]}`}>{durumLabel[d]}</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
