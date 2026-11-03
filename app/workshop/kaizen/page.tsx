'use client'

import { useAktifAtolyeId } from '@/components/pes/AktifAtolye'
import AtolyeSecilmedi from '@/components/pes/AtolyeSecilmedi'
import { Suspense, useState, useEffect } from 'react'

interface KaizenItem { id: number; baslik: string; kategori: string; hedef_metrik: string; mevcut_deger: number; hedef_deger: number; sonuc_deger: number | null; sorumlu: string; baslangic_tarihi: string; bitis_tarihi: string; durum: string; notlar: string }

const KATEGORILER = ['DARBOGAZ', 'WIP', 'KALITE', 'MALIYET', 'CHANGEOVER', 'GENEL']
const DURUMLAR = ['PLAN', 'UYGULA', 'KONTROL', 'STANDART', 'IPTAL']
const durumColor: Record<string, string> = { PLAN: 'bg-canvas text-muted', UYGULA: 'bg-warn-soft text-warn', KONTROL: 'bg-canvas text-muted', STANDART: 'bg-accent-soft text-accent-ink', IPTAL: 'bg-canvas text-faint' }
const durumLabel: Record<string, string> = { PLAN: 'Plan', UYGULA: 'Uygula', KONTROL: 'Kontrol', STANDART: 'Standart', IPTAL: 'Iptal' }

export default function Wrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor...</div>}><KaizenPage /></Suspense>
}

function KaizenPage() {
  const wid = useAktifAtolyeId()
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
  if (!wid) return <AtolyeSecilmedi />

  // PDCA ozet
  const planCount = actions.filter(a => a.durum === 'PLAN').length
  const uygulaCount = actions.filter(a => a.durum === 'UYGULA').length
  const kontrolCount = actions.filter(a => a.durum === 'KONTROL').length
  const standartCount = actions.filter(a => a.durum === 'STANDART').length

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Kaizen / PDCA</h1>
          <p className="text-sm text-faint">Sürekli iyileştirme aksiyonları ve takibi</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover">{showForm ? 'Iptal' : '+ Yeni Aksiyon'}</button>
      </div>

      {/* PDCA Ozet */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="bg-canvas border border-line rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-muted">{planCount}</p>
          <p className="text-xs text-muted">PLAN</p>
        </div>
        <div className="bg-warn-soft border border-line-soft rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-warn">{uygulaCount}</p>
          <p className="text-xs text-warn">UYGULA (DO)</p>
        </div>
        <div className="bg-canvas border border-line rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-muted">{kontrolCount}</p>
          <p className="text-xs text-muted">KONTROL (CHECK)</p>
        </div>
        <div className="bg-accent-soft border border-line-soft rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-accent-ink">{standartCount}</p>
          <p className="text-xs text-accent-ink">STANDART (ACT)</p>
        </div>
      </div>

      {/* Yeni Aksiyon Formu */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface border border-line-soft rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-ink">Yeni İyileştirme Aksiyonu</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="md:col-span-2"><label className="block text-xs text-muted mb-1">Başlık *</label><input required className={ic} value={form.baslik} onChange={e => setForm(p => ({...p, baslik: e.target.value}))} placeholder="Darbogaz operasyonu icin ek makine" /></div>
            <div><label className="block text-xs text-muted mb-1">Kategori</label><select className={ic} value={form.kategori} onChange={e => setForm(p => ({...p, kategori: e.target.value}))}>{KATEGORILER.map(k => <option key={k} value={k}>{k}</option>)}</select></div>
            <div><label className="block text-xs text-muted mb-1">Hedef Metrik</label><input className={ic} value={form.hedef_metrik} onChange={e => setForm(p => ({...p, hedef_metrik: e.target.value}))} placeholder="orn. Cikti Verimliligi %" /></div>
            <div><label className="block text-xs text-muted mb-1">Mevcut Değer</label><input type="number" inputMode="decimal" step="0.1" className={ic} value={form.mevcut_deger} onChange={e => setForm(p => ({...p, mevcut_deger: e.target.value}))} /></div>
            <div><label className="block text-xs text-muted mb-1">Hedef Değer</label><input type="number" inputMode="decimal" step="0.1" className={ic} value={form.hedef_deger} onChange={e => setForm(p => ({...p, hedef_deger: e.target.value}))} /></div>
            <div><label className="block text-xs text-muted mb-1">Sorumlu</label><input className={ic} value={form.sorumlu} onChange={e => setForm(p => ({...p, sorumlu: e.target.value}))} /></div>
            <div><label className="block text-xs text-muted mb-1">Başlangıç</label><input type="date" className={ic} value={form.baslangic_tarihi} onChange={e => setForm(p => ({...p, baslangic_tarihi: e.target.value}))} /></div>
            <div><label className="block text-xs text-muted mb-1">Bitiş</label><input type="date" className={ic} value={form.bitis_tarihi} onChange={e => setForm(p => ({...p, bitis_tarihi: e.target.value}))} /></div>
          </div>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Kaydediliyor...' : 'Olustur'}</button>
        </form>
      )}

      {/* Aksiyon Listesi */}
      {actions.length === 0 ? (
        <div className="bg-surface border border-line-soft rounded-xl p-8 text-center text-faint">Henüz kaizen aksiyonu yok</div>
      ) : (
        <div className="space-y-3">
          {actions.map(a => (
            <div key={a.id} className="bg-surface border border-line-soft rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${durumColor[a.durum] || 'bg-canvas'}`}>{durumLabel[a.durum] || a.durum}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-canvas text-muted">{a.kategori}</span>
                    <span className="font-medium text-ink">{a.baslik}</span>
                  </div>
                  {a.hedef_metrik && (
                    <p className="text-sm text-faint mt-1">
                      {a.hedef_metrik}: {Number(a.mevcut_deger)} → {Number(a.hedef_deger)}
                      {a.sonuc_deger !== null && <span className={`ml-2 font-bold ${Number(a.sonuc_deger) >= Number(a.hedef_deger) ? 'text-accent-ink' : 'text-danger'}`}>Sonuc: {Number(a.sonuc_deger)}</span>}
                    </p>
                  )}
                  <p className="text-xs text-faint mt-0.5">{a.sorumlu || '---'} | {a.baslangic_tarihi ? `${a.baslangic_tarihi} → ${a.bitis_tarihi || '...'}` : '---'}</p>
                </div>
                <div className="flex gap-1">
                  {DURUMLAR.filter(d => d !== a.durum && d !== 'IPTAL').map(d => (
                    <button key={d} onClick={() => updateDurum(a.id, d)}
                      className={`text-[11px] px-2 py-1 rounded ${durumColor[d]}`}>{durumLabel[d]}</button>
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
