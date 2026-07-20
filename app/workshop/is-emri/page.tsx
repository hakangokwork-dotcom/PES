'use client'

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Line { id: number; code: string; name: string; daily_target?: number; operator_count?: number }
interface WO {
  id: number
  is_emri_no: string
  musteri: string | null
  musteri_kodu: string | null
  siparis_no: string | null
  model_adi: string
  stil_kodu: string | null
  siparis_miktari: number
  baslangic_tarihi: string | null
  bitis_tarihi: string | null
  teslim_tarihi: string | null
  line_id: number | null
  line_name: string | null
  line_code: string | null
  durum: string
  oncelik: string
  risk_seviyesi: string
  tamamlanan_adet: number
  ilerleme_pct: number
  materyal_durumu_pct: number
  toplam_asama: number
  tamamlanan_asama: number
  toplam_malzeme: number
  gelen_malzeme: number
  eksik_malzeme: number
  problem_sayisi: number
  acik_problem: number
  teslim_kalan_gun: number | null
  aciliyet: 'normal' | 'yakin' | 'acil' | 'kritik'
  sezon: string | null
  sample_onaylandi: boolean
  tech_pack_onaylandi: boolean
  notlar: string | null
}

const DURUM_RENK: Record<string, string> = {
  'Taslak':       'bg-slate-100 text-slate-700',
  'Planlandi':    'bg-blue-100 text-blue-800',
  'Bekleniyor':   'bg-amber-100 text-amber-800',
  'Devam':        'bg-emerald-100 text-emerald-800',
  'Duraklatildi': 'bg-orange-100 text-orange-800',
  'Tamamlandi':   'bg-emerald-200 text-emerald-900',
  'İptal':        'bg-red-100 text-red-700',
  'Sevk Edildi':  'bg-purple-100 text-purple-800',
}
const ONCELIK_RENK: Record<string, string> = {
  'Kritik': 'bg-red-600 text-white',
  'Yüksek': 'bg-amber-500 text-white',
  'Normal': 'bg-slate-200 text-slate-700',
  'Düşük':  'bg-slate-100 text-slate-500',
}
const ACILIYET_RENK: Record<string, string> = {
  'kritik': 'border-l-4 border-red-500 bg-red-50/30',
  'acil':   'border-l-4 border-amber-500 bg-amber-50/30',
  'yakin':  'border-l-4 border-blue-300',
  'normal': '',
}

export default function Wrapper() {
  return <Suspense fallback={<div className="p-6 text-gray-400">Yükleniyor...</div>}><IsEmriPage /></Suspense>
}

function IsEmriPage() {
  const wid = useSearchParams().get('wid')
  const [orders, setOrders] = useState<WO[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState({ durum: '', oncelik: '', aciliyet: '', q: '' })

  const [form, setForm] = useState({
    is_emri_no: '', musteri: '', musteri_kodu: '', musteri_iletisim: '', siparis_no: '',
    model_adi: '', stil_kodu: '', siparis_miktari: 0, sezon: '', line_id: '',
    baslangic_tarihi: '', teslim_tarihi: '',
    sam_toplam_sn: 0, anlasmali_fiyat: 0,
    oncelik: 'Normal', risk_seviyesi: 'Düşük', durum: 'Planlandi',
    notlar: '', notlar_genel: '',
  })

  // Auto-plan state
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<{
    line_id: number; line_code: string; line_name: string;
    baslangic_tarihi: string; bitis_tarihi: string; gun_sayisi: number;
    daily_target: number; capacity_pct: number;
    score: number; reasons: string[]; warnings: string[];
  }[] | null>(null)

  async function autoSuggest() {
    if (!form.siparis_miktari || !form.teslim_tarihi) {
      alert('Adet ve teslim tarihi gerekli')
      return
    }
    setSuggesting(true)
    setSuggestions(null)
    try {
      const r = await fetch('/api/pes/work-orders/auto-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workshop_id: Number(wid),
          siparis_miktari: form.siparis_miktari,
          teslim_tarihi: form.teslim_tarihi,
          sam_toplam_sn: form.sam_toplam_sn || null,
        }),
      })
      const d = await r.json()
      if (d.error) alert(d.error)
      else setSuggestions(d.suggestions || [])
    } finally { setSuggesting(false) }
  }

  function applySuggestion(s: { line_id: number; baslangic_tarihi: string; bitis_tarihi: string }) {
    setForm({
      ...form,
      line_id: String(s.line_id),
      baslangic_tarihi: s.baslangic_tarihi,
      // teslim tarihini kullanıcı zaten girmiş; bitis_tarihi farklı bir alan ama formda yok — kaydederken hesaplanır
    })
    setSuggestions(null)
  }

  const reload = useCallback(async () => {
    if (!wid) return
    const r = await fetch(`/api/pes/work-orders?workshop_id=${wid}`)
    const d = await r.json()
    setOrders(d.orders ?? [])
  }, [wid])

  useEffect(() => {
    if (!wid) return
    reload()
    fetch(`/api/pes/workshops/${wid}/lines`).then(r => r.json()).then(d => setLines(d.lines ?? [])).catch(() => {})
  }, [wid, reload])

  const filtered = useMemo(() => {
    let list = orders
    if (filter.durum)    list = list.filter(o => o.durum === filter.durum)
    if (filter.oncelik)  list = list.filter(o => o.oncelik === filter.oncelik)
    if (filter.aciliyet) list = list.filter(o => o.aciliyet === filter.aciliyet)
    if (filter.q.trim()) {
      const q = filter.q.toLowerCase()
      list = list.filter(o =>
        (o.is_emri_no || '').toLowerCase().includes(q) ||
        (o.model_adi || '').toLowerCase().includes(q) ||
        (o.musteri || '').toLowerCase().includes(q) ||
        (o.stil_kodu || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [orders, filter])

  const counts = useMemo(() => ({
    total: orders.length,
    devam: orders.filter(o => o.durum === 'Devam').length,
    bekleyen: orders.filter(o => o.durum === 'Bekleniyor').length,
    kritik: orders.filter(o => o.aciliyet === 'kritik').length,
    acil: orders.filter(o => o.aciliyet === 'acil').length,
    acik_problem: orders.reduce((s, o) => s + (o.acik_problem || 0), 0),
  }), [orders])

  async function createOrder() {
    if (!form.is_emri_no.trim() || !form.model_adi.trim()) {
      alert('İş emri no ve model adı zorunlu')
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/pes/work-orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          workshop_id: Number(wid),
          line_id: form.line_id ? Number(form.line_id) : null,
          baslangic_tarihi: form.baslangic_tarihi || null,
          teslim_tarihi: form.teslim_tarihi || null,
        }),
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Hata')
      setShowForm(false)
      setForm({ ...form, is_emri_no: '', musteri: '', model_adi: '', stil_kodu: '', siparis_miktari: 0, teslim_tarihi: '', notlar: '' })
      await reload()
    } catch (e) {
      alert(`Hata: ${(e as Error).message}`)
    } finally { setSaving(false) }
  }

  if (!wid) {
    return <div className="p-6 text-gray-400">Lütfen sol menüden bir atölye seçin.</div>
  }

  return (
    <div className="space-y-5">
      {/* Header + Stats */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">İş Emirleri</h1>
          <p className="text-sm text-gray-500 mt-1">Sipariş geldiğinde estimate iş emri oluştur, bant ata, plan yap, gerçekleşeni gir, problemleri günlüğe yaz.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-[#197A56] text-white rounded-lg text-sm font-medium hover:bg-[#145e42]">
          {showForm ? 'İptal' : '+ Yeni İş Emri'}
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Toplam" value={counts.total} />
        <Stat label="Devam" value={counts.devam} tone="emerald" />
        <Stat label="Bekleyen" value={counts.bekleyen} tone="amber" />
        <Stat label="Kritik" value={counts.kritik} tone="red" />
        <Stat label="Acil" value={counts.acil} tone="orange" />
        <Stat label="Açık Problem" value={counts.acik_problem} tone={counts.acik_problem > 0 ? 'red' : 'slate'} />
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-2 flex-wrap">
        <input className="flex-1 min-w-[160px] px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
          placeholder="Ara: iş emri no, model, müşteri, stil..."
          value={filter.q} onChange={e => setFilter({ ...filter, q: e.target.value })} />
        <select className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg" value={filter.durum} onChange={e => setFilter({ ...filter, durum: e.target.value })}>
          <option value="">Tüm Durum</option>
          {Object.keys(DURUM_RENK).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg" value={filter.oncelik} onChange={e => setFilter({ ...filter, oncelik: e.target.value })}>
          <option value="">Tüm Öncelik</option>
          {['Kritik','Yüksek','Normal','Düşük'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg" value={filter.aciliyet} onChange={e => setFilter({ ...filter, aciliyet: e.target.value })}>
          <option value="">Tüm Aciliyet</option>
          <option value="kritik">Kritik (geçti)</option>
          <option value="acil">Acil (≤3 gün)</option>
          <option value="yakin">Yakın (≤7 gün)</option>
          <option value="normal">Normal</option>
        </select>
        {(filter.q || filter.durum || filter.oncelik || filter.aciliyet) && (
          <button onClick={() => setFilter({ durum: '', oncelik: '', aciliyet: '', q: '' })}
            className="text-xs text-slate-500 hover:text-slate-700">Filtreyi temizle</button>
        )}
        <span className="ml-auto text-xs text-slate-500">{filtered.length} / {orders.length}</span>
      </div>

      {/* New Order Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Yeni İş Emri Oluştur (Estimate)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="İş Emri No *">
              <input className="input" value={form.is_emri_no} onChange={e => setForm({ ...form, is_emri_no: e.target.value })} placeholder="WO-2026-001" />
            </Field>
            <Field label="Sipariş No (müşteri PO)">
              <input className="input" value={form.siparis_no} onChange={e => setForm({ ...form, siparis_no: e.target.value })} />
            </Field>
            <Field label="Sezon">
              <input className="input" value={form.sezon} onChange={e => setForm({ ...form, sezon: e.target.value })} placeholder="Yaz 2026" />
            </Field>
            <Field label="Müşteri">
              <input className="input" value={form.musteri} onChange={e => setForm({ ...form, musteri: e.target.value })} />
            </Field>
            <Field label="Müşteri Kodu">
              <input className="input" value={form.musteri_kodu} onChange={e => setForm({ ...form, musteri_kodu: e.target.value })} />
            </Field>
            <Field label="Müşteri İletişim">
              <input className="input" value={form.musteri_iletisim} onChange={e => setForm({ ...form, musteri_iletisim: e.target.value })} placeholder="ad@firma.com / 555..." />
            </Field>
            <Field label="Model Adı *">
              <input className="input" value={form.model_adi} onChange={e => setForm({ ...form, model_adi: e.target.value })} />
            </Field>
            <Field label="Stil Kodu">
              <input className="input" value={form.stil_kodu} onChange={e => setForm({ ...form, stil_kodu: e.target.value })} />
            </Field>
            <Field label="Adet">
              <input type="number" className="input" value={form.siparis_miktari} onChange={e => setForm({ ...form, siparis_miktari: Number(e.target.value) })} />
            </Field>
            <Field label="Bant">
              <select className="input" value={form.line_id} onChange={e => setForm({ ...form, line_id: e.target.value })}>
                <option value="">Seçilmedi (sonra atanır)</option>
                {lines.map(l => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
              </select>
            </Field>
            <Field label="Başlangıç Tarihi">
              <input type="date" className="input" value={form.baslangic_tarihi} onChange={e => setForm({ ...form, baslangic_tarihi: e.target.value })} />
            </Field>
            <Field label="Teslim Tarihi *">
              <input type="date" className="input" value={form.teslim_tarihi} onChange={e => setForm({ ...form, teslim_tarihi: e.target.value })} />
            </Field>
            <Field label="Toplam SAM (sn)">
              <input type="number" step="0.01" className="input" value={form.sam_toplam_sn} onChange={e => setForm({ ...form, sam_toplam_sn: Number(e.target.value) })} />
            </Field>
            <Field label="Anlaşmalı Fiyat (TL/adet)">
              <input type="number" step="0.01" className="input" value={form.anlasmali_fiyat} onChange={e => setForm({ ...form, anlasmali_fiyat: Number(e.target.value) })} />
            </Field>
            <Field label="Öncelik">
              <select className="input" value={form.oncelik} onChange={e => setForm({ ...form, oncelik: e.target.value })}>
                {['Düşük','Normal','Yüksek','Kritik'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Risk Seviyesi">
              <select className="input" value={form.risk_seviyesi} onChange={e => setForm({ ...form, risk_seviyesi: e.target.value })}>
                {['Düşük','Orta','Yüksek','Kritik'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Durum">
              <select className="input" value={form.durum} onChange={e => setForm({ ...form, durum: e.target.value })}>
                {Object.keys(DURUM_RENK).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
          </div>

          {/* Auto-plan suggestion box */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm">🪄</span>
              <span className="text-sm font-semibold text-purple-900">Otomatik Plan Önerisi</span>
              <span className="text-xs text-purple-700">— Adet ve teslim tarihi yeterli; bant + tarih önerilerini sistem hesaplar.</span>
              <button onClick={autoSuggest} disabled={suggesting || !form.siparis_miktari || !form.teslim_tarihi}
                className="ml-auto text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-40">
                {suggesting ? 'Hesaplanıyor...' : (suggestions ? 'Tekrar Hesapla' : '🪄 Plan Öner')}
              </button>
            </div>
            {suggestions && suggestions.length === 0 && (
              <div className="text-xs text-amber-800 bg-amber-100 border border-amber-200 rounded p-2">
                ⚠ Atölye için bant bulunamadı. Önce <b>Profil</b> sayfasından bant tanımla.
              </div>
            )}
            {suggestions && suggestions.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {suggestions.slice(0, 4).map((s, i) => {
                  const isSelected = form.line_id === String(s.line_id) && form.baslangic_tarihi === s.baslangic_tarihi
                  return (
                    <div key={i}
                      className={`bg-white border rounded-lg p-3 transition cursor-pointer ${
                        isSelected ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-purple-200 hover:border-purple-400'
                      }`}
                      onClick={() => applySuggestion(s)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {i === 0 && <span className="text-[10px] px-1.5 py-0.5 bg-purple-600 text-white rounded font-semibold">EN İYİ</span>}
                        <span className="font-semibold text-sm">{s.line_code} — {s.line_name}</span>
                        <span className="ml-auto text-xs font-mono text-slate-500">skor {s.score}</span>
                      </div>
                      <div className="text-sm mt-1.5">
                        📅 <b>{s.baslangic_tarihi}</b> → <b>{s.bitis_tarihi}</b>
                        <span className="text-slate-500"> · {s.gun_sayisi} gün · {s.daily_target} adet/gün</span>
                      </div>
                      {s.reasons.length > 0 && (
                        <div className="mt-1.5 text-[11px] text-emerald-700">
                          {s.reasons.map((r, j) => <div key={j}>✓ {r}</div>)}
                        </div>
                      )}
                      {s.warnings.length > 0 && (
                        <div className="mt-1 text-[11px] text-amber-700">
                          {s.warnings.map((w, j) => <div key={j}>⚠ {w}</div>)}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">Bant Yükü</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${s.capacity_pct >= 90 ? 'bg-red-500' : s.capacity_pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${s.capacity_pct}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-slate-600">%{s.capacity_pct}</span>
                      </div>
                      <div className="mt-2 text-center">
                        <span className={`text-xs font-medium ${isSelected ? 'text-emerald-700' : 'text-purple-600'}`}>
                          {isSelected ? '✓ Seçili' : 'Bunu seç →'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <Field label="Genel Notlar">
            <textarea className="input min-h-[60px]" value={form.notlar_genel} onChange={e => setForm({ ...form, notlar_genel: e.target.value })} />
          </Field>
          <div className="flex items-center gap-2">
            <button disabled={saving} onClick={createOrder}
              className="px-4 py-2 bg-[#197A56] text-white rounded-lg text-sm font-medium hover:bg-[#145e42] disabled:opacity-50">
              {saving ? 'Kaydediliyor...' : 'Oluştur (zorunlu aşamalar otomatik açılır)'}
            </button>
            <span className="text-xs text-slate-500">Oluşturduktan sonra detay sayfasında plan/gerçek tarihleri, malzemeleri ve günlüğü yönet.</span>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
            Henüz iş emri yok veya filtreyle eşleşen yok.
          </div>
        )}
        {filtered.map(o => (
          <Link key={o.id} href={`/workshop/is-emri/${o.id}?wid=${wid}`}
            className={`block bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition ${ACILIYET_RENK[o.aciliyet] || ''}`}>
            <div className="flex items-start gap-4 flex-wrap">
              {/* Sol: Tanımlama */}
              <div className="flex-1 min-w-[260px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">{o.is_emri_no}</span>
                  <Badge cls={DURUM_RENK[o.durum] || 'bg-slate-100 text-slate-700'}>{o.durum}</Badge>
                  <Badge cls={ONCELIK_RENK[o.oncelik] || 'bg-slate-100 text-slate-500'}>{o.oncelik}</Badge>
                  {o.aciliyet === 'kritik' && <Badge cls="bg-red-600 text-white">⚠ Teslim Geçti</Badge>}
                  {o.aciliyet === 'acil'  && <Badge cls="bg-amber-500 text-white">⏰ Acil</Badge>}
                  {!o.sample_onaylandi && <Badge cls="bg-orange-100 text-orange-700">Numune onayı bekliyor</Badge>}
                </div>
                <div className="text-sm text-gray-700 mt-1 truncate">
                  <span className="font-medium">{o.model_adi}</span>
                  {o.stil_kodu && <span className="text-gray-400"> · {o.stil_kodu}</span>}
                  {o.musteri && <span className="text-gray-500"> · {o.musteri}</span>}
                </div>
                <div className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                  <span><b>{o.siparis_miktari.toLocaleString('tr-TR')}</b> adet</span>
                  {o.line_name && <span>→ {o.line_code || ''} {o.line_name}</span>}
                  {o.teslim_tarihi && <span>📅 {o.teslim_tarihi}{o.teslim_kalan_gun != null && ` (${o.teslim_kalan_gun >= 0 ? '+' : ''}${o.teslim_kalan_gun}g)`}</span>}
                  {o.sezon && <span>· {o.sezon}</span>}
                </div>
              </div>

              {/* Orta: İlerleme */}
              <div className="w-full md:w-auto md:flex-1 grid grid-cols-2 gap-3">
                <ProgressBox label="Üretim" pct={o.ilerleme_pct} sub={`${o.tamamlanan_adet}/${o.siparis_miktari}`} />
                <ProgressBox label="Materyal" pct={o.materyal_durumu_pct} sub={`${o.gelen_malzeme}/${o.toplam_malzeme}${o.eksik_malzeme > 0 ? ` · ${o.eksik_malzeme} eksik` : ''}`} />
              </div>

              {/* Sağ: Aşama özet + uyarı */}
              <div className="text-right space-y-1 min-w-[100px]">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Aşamalar</div>
                <div className="text-sm font-mono">
                  <span className="text-emerald-700 font-semibold">{o.tamamlanan_asama}</span>
                  <span className="text-slate-400"> / {o.toplam_asama}</span>
                </div>
                {o.acik_problem > 0 && (
                  <div className="text-[10px] text-red-700 font-medium">⚠ {o.acik_problem} açık problem</div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%; padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db; border-radius: 0.5rem;
          font-size: 0.875rem; outline: none;
        }
        :global(.input:focus) {
          border-color: #197A56;
          box-shadow: 0 0 0 2px rgba(25, 122, 86, 0.15);
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>{children}</div>
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: number; tone?: string }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-900',
    emerald: 'bg-emerald-50 text-emerald-900',
    amber: 'bg-amber-50 text-amber-900',
    red: 'bg-red-50 text-red-900',
    orange: 'bg-orange-50 text-orange-900',
  }
  return (
    <div className={`rounded-lg p-3 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70 font-semibold">{label}</div>
      <div className="text-2xl font-bold font-mono mt-0.5">{value}</div>
    </div>
  )
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${cls}`}>{children}</span>
}

function ProgressBox({ label, pct, sub }: { label: string; pct: number; sub: string }) {
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : pct > 0 ? 'bg-blue-500' : 'bg-slate-300'
  return (
    <div className="text-xs">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        <span>{label}</span>
        <span className="font-mono text-slate-700">%{pct}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-0.5">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</div>
    </div>
  )
}
