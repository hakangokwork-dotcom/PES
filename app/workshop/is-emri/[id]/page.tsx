'use client'

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface WO {
  id: number
  is_emri_no: string
  musteri: string | null
  musteri_kodu: string | null
  musteri_iletisim: string | null
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
  aciliyet: string
  sezon: string | null
  sample_onaylandi: boolean
  tech_pack_onaylandi: boolean
  paylasim_admin: boolean
  notlar: string | null
  notlar_genel: string | null
  anlasmali_fiyat: number
  yikama_fiyati: number
  sam_toplam_sn: number
  etiketler: string[]
}

interface Stage {
  id: number; work_order_id: number; stage_id: number
  stage_code: string; stage_name: string; stage_renk: string
  sira_no: number; line_id: number | null; line_name: string | null
  plan_baslangic: string | null; plan_bitis: string | null; plan_sure_dk: number | null
  gercek_baslangic: string | null; gercek_bitis: string | null; gercek_sure_dk: number | null
  durum: string; ilerleme_pct: number
  uretilen_adet: number; hatali_adet: number
  notlar: string | null
  gecikme_gun: number | null
}

interface Material {
  id: number; tip: string; kod: string | null; ad: string
  miktar: number | null; birim: string | null
  durum: string; beklenen_tarih: string | null; gelis_tarihi: string | null
  tedarikci: string | null; notlar: string | null
}

interface Journal {
  id: number; tarih: string; vardiya: string
  tip: string; kategori: string | null; baslik: string | null
  aciklama: string; oneri: string | null; yazan: string | null
  paylasim_admin: boolean; resolved: boolean; resolved_at: string | null
  resolved_notlar: string | null; stage_name?: string
}

interface Line { id: number; code: string; name: string }

const DURUM_RENK: Record<string, string> = {
  'Taslak': 'bg-slate-100 text-slate-700',
  'Planlandi': 'bg-blue-100 text-blue-800',
  'Bekleniyor': 'bg-amber-100 text-amber-800',
  'Devam': 'bg-emerald-100 text-emerald-800',
  'Duraklatildi': 'bg-orange-100 text-orange-800',
  'Tamamlandi': 'bg-emerald-200 text-emerald-900',
  'İptal': 'bg-red-100 text-red-700',
  'Sevk Edildi': 'bg-purple-100 text-purple-800',
}
const STAGE_DURUM_RENK: Record<string, string> = {
  'Beklemede':    'bg-slate-100 text-muted',
  'Hazır':        'bg-blue-100 text-blue-700',
  'Devam':        'bg-emerald-100 text-emerald-700',
  'Duraklatildi': 'bg-amber-100 text-amber-700',
  'Tamamlandi':   'bg-emerald-200 text-emerald-900',
  'İptal':        'bg-red-100 text-red-700',
}
const MATERIAL_DURUM_RENK: Record<string, string> = {
  'Bekleniyor':     'bg-slate-100 text-muted',
  'Sipariş Verildi':'bg-blue-100 text-blue-700',
  'Yolda':          'bg-amber-100 text-amber-700',
  'Geldi':          'bg-emerald-100 text-emerald-800',
  'Eksik':          'bg-red-100 text-red-700',
  'İade':           'bg-red-50 text-red-600',
}
const JOURNAL_TIP_RENK: Record<string, { bg: string; text: string; icon: string }> = {
  'NOT':     { bg: 'bg-slate-100', text: 'text-slate-700', icon: '📝' },
  'PROBLEM': { bg: 'bg-red-100',   text: 'text-red-800',   icon: '⚠️' },
  'KAIZEN':  { bg: 'bg-cyan-100',  text: 'text-cyan-800',  icon: '💡' },
  'UYARI':   { bg: 'bg-amber-100', text: 'text-amber-800', icon: '🔔' },
  'BAŞARI':  { bg: 'bg-emerald-100', text: 'text-emerald-800', icon: '✅' },
  'BLOKAJ':  { bg: 'bg-purple-100', text: 'text-purple-800', icon: '🚧' },
}

export default function Wrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor...</div>}><WoDetailPage /></Suspense>
}

function WoDetailPage() {
  const params = useParams()
  const wid = useSearchParams().get('wid')
  const router = useRouter()
  const id = Number(params.id)

  const [order, setOrder] = useState<WO | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [journal, setJournal] = useState<Journal[]>([])
  const [history, setHistory] = useState<{ tarih: string; eski_durum: string; yeni_durum: string }[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [tab, setTab] = useState<'ozet'|'asamalar'|'malzemeler'|'gunluk'|'gecmis'>('ozet')
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/pes/work-orders/${id}`)
      const d = await r.json()
      if (d.error) { alert(d.error); router.push(`/workshop/is-emri?wid=${wid}`); return }
      setOrder(d.order)
      setStages(d.stages || [])
      setMaterials(d.materials || [])
      setJournal(d.journal || [])
      setHistory(d.history || [])
    } finally { setLoading(false) }
  }, [id, wid, router])

  useEffect(() => {
    reload()
    if (wid) fetch(`/api/pes/workshops/${wid}/lines`).then(r => r.json()).then(d => setLines(d.lines || []))
  }, [reload, wid])

  if (loading || !order) return <div className="p-6 text-faint">Yükleniyor...</div>

  return (
    <div className="space-y-5">
      {/* Geri */}
      <Link href={`/workshop/is-emri?wid=${wid}`} className="text-xs text-faint hover:text-ink">← İş Emri Listesi</Link>

      {/* Header */}
      <WoHeader order={order} onRefresh={reload} />

      {/* Tabs */}
      <div className="bg-white border border-line-soft rounded-xl">
        <div className="border-b border-line-soft flex items-center gap-1 px-2 overflow-x-auto">
          {[
            ['ozet','Özet','📋'],
            ['asamalar',`Aşamalar (${stages.length})`,'📊'],
            ['malzemeler',`Malzemeler (${materials.length})`,'📦'],
            ['gunluk',`Günlük (${journal.length})`,'📝'],
            ['gecmis',`Geçmiş (${history.length})`,'🕐'],
          ].map(([k, label, icon]) => (
            <button key={k} onClick={() => setTab(k as 'ozet'|'asamalar'|'malzemeler'|'gunluk'|'gecmis')}
              className={`px-3 py-2.5 text-sm border-b-2 transition ${tab === k ? 'border-emerald-600 text-emerald-700 font-medium' : 'border-transparent text-faint hover:text-slate-800'}`}>
              <span className="mr-1">{icon}</span>{label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'ozet'      && <OzetTab order={order} lines={lines} onRefresh={reload} />}
          {tab === 'asamalar'  && <AsamalarTab stages={stages} lines={lines} onRefresh={reload} woId={id} />}
          {tab === 'malzemeler'&& <MalzemelerTab materials={materials} onRefresh={reload} woId={id} />}
          {tab === 'gunluk'    && <GunlukTab journal={journal} stages={stages} onRefresh={reload} woId={id} />}
          {tab === 'gecmis'    && <GecmisTab history={history} />}
        </div>
      </div>

      <style jsx>{`
        :global(.input) { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.5rem; font-size: 0.875rem; outline: none; }
        :global(.input:focus) { border-color: #197A56; box-shadow: 0 0 0 2px rgba(25, 122, 86, 0.15); }
        :global(.input-sm) { padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 12px; }
        :global(.input-sm:focus) { outline: none; border-color: #197A56; }
      `}</style>
    </div>
  )
}

/* ───────── Header ───────── */
function WoHeader({ order, onRefresh }: { order: WO; onRefresh: () => void }) {
  async function changeStatus(newStatus: string) {
    if (!confirm(`Durum "${newStatus}" olarak değiştirilsin mi?`)) return
    await fetch(`/api/pes/work-orders/${order.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durum: newStatus }),
    })
    await onRefresh()
  }

  return (
    <div className="bg-white border border-line-soft rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[300px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wider text-faint font-semibold">{order.is_emri_no}</span>
            <Badge cls={DURUM_RENK[order.durum] || 'bg-slate-100 text-slate-700'}>{order.durum}</Badge>
            {order.aciliyet === 'kritik' && <Badge cls="bg-red-600 text-white">⚠ Teslim Geçti ({Math.abs(order.teslim_kalan_gun || 0)}g)</Badge>}
            {order.aciliyet === 'acil' && <Badge cls="bg-amber-500 text-white">⏰ {order.teslim_kalan_gun}g kaldı</Badge>}
            <Badge cls={
              order.oncelik === 'Kritik' ? 'bg-red-600 text-white' :
              order.oncelik === 'Yüksek' ? 'bg-amber-500 text-white' :
              order.oncelik === 'Düşük' ? 'bg-slate-100 text-faint' :
              'bg-slate-200 text-slate-700'
            }>{order.oncelik}</Badge>
          </div>
          <h1 className="text-2xl font-semibold text-ink mt-1">{order.model_adi}</h1>
          <div className="text-sm text-muted mt-0.5 flex items-center gap-3 flex-wrap">
            {order.stil_kodu && <span>Stil: {order.stil_kodu}</span>}
            {order.musteri && <span>Müşteri: {order.musteri}</span>}
            {order.sezon && <span>{order.sezon}</span>}
            <span>· <b>{order.siparis_miktari.toLocaleString('tr-TR')}</b> adet</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-faint mr-1">Hızlı Durum:</span>
          {['Devam','Duraklatildi','Tamamlandi'].filter(d => d !== order.durum).map(d => (
            <button key={d} onClick={() => changeStatus(d)}
              className="text-xs px-2.5 py-1.5 border border-line rounded-lg hover:bg-canvas">
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Progress bars */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
        <ProgressMini label="Üretim" pct={order.ilerleme_pct} sub={`${order.tamamlanan_adet}/${order.siparis_miktari} adet`} />
        <ProgressMini label="Materyal" pct={order.materyal_durumu_pct} sub={`${order.gelen_malzeme}/${order.toplam_malzeme}${order.eksik_malzeme ? ` · ${order.eksik_malzeme} eksik` : ''}`} />
        <ProgressMini label="Aşamalar" pct={order.toplam_asama > 0 ? Math.round((order.tamamlanan_asama / order.toplam_asama) * 100) : 0} sub={`${order.tamamlanan_asama}/${order.toplam_asama} tamamlandı`} />
        <div>
          <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">Onaylar</div>
          <div className="flex flex-col gap-1 mt-1.5 text-xs">
            <span className={order.tech_pack_onaylandi ? 'text-emerald-700' : 'text-amber-700'}>
              {order.tech_pack_onaylandi ? '✓' : '○'} Tech Pack onaylandı
            </span>
            <span className={order.sample_onaylandi ? 'text-emerald-700' : 'text-amber-700'}>
              {order.sample_onaylandi ? '✓' : '○'} Numune onaylandı
            </span>
            <span className={order.paylasim_admin ? 'text-blue-700' : 'text-slate-400'}>
              {order.paylasim_admin ? '✓' : '○'} Admin ile paylaşımda
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────── Özet Tab ───────── */
function OzetTab({ order, lines, onRefresh }: { order: WO; lines: Line[]; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...order })

  async function save() {
    await fetch(`/api/pes/work-orders/${order.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setEditing(false)
    await onRefresh()
  }

  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <button onClick={() => { setForm({ ...order }); setEditing(true) }}
            className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg">✎ Düzenle</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <DataRow label="İş Emri No" value={order.is_emri_no} />
          <DataRow label="Sipariş No" value={order.siparis_no} />
          <DataRow label="Model" value={order.model_adi} />
          <DataRow label="Stil Kodu" value={order.stil_kodu} />
          <DataRow label="Müşteri" value={order.musteri ? `${order.musteri}${order.musteri_kodu ? ` (${order.musteri_kodu})` : ''}` : '—'} />
          <DataRow label="Müşteri İletişim" value={order.musteri_iletisim} />
          <DataRow label="Sezon" value={order.sezon} />
          <DataRow label="Sipariş Miktarı" value={`${order.siparis_miktari.toLocaleString('tr-TR')} adet`} />
          <DataRow label="Bant" value={order.line_name ? `${order.line_code} — ${order.line_name}` : 'Atanmadı'} />
          <DataRow label="Başlangıç" value={order.baslangic_tarihi} />
          <DataRow label="Teslim Tarihi" value={order.teslim_tarihi} />
          <DataRow label="Risk Seviyesi" value={order.risk_seviyesi} />
          <DataRow label="Toplam SAM" value={`${order.sam_toplam_sn || 0} sn`} />
          <DataRow label="Anlaşmalı Fiyat" value={`${order.anlasmali_fiyat || 0} TL/adet`} />
          <DataRow label="Yıkama Fiyatı" value={`${order.yikama_fiyati || 0} TL`} />
          <DataRow label="Tahmini Ciro" value={`${(order.anlasmali_fiyat * order.siparis_miktari).toLocaleString('tr-TR')} TL`} highlight />
        </div>
        {order.notlar_genel && (
          <div>
            <div className="text-xs uppercase tracking-wider text-faint font-semibold mb-1">Genel Notlar</div>
            <div className="bg-canvas border border-line-soft rounded-lg p-3 text-sm whitespace-pre-wrap">{order.notlar_genel}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Müşteri"><input className="input" value={form.musteri || ''} onChange={e => setForm({ ...form, musteri: e.target.value })} /></Field>
        <Field label="Müşteri Kodu"><input className="input" value={form.musteri_kodu || ''} onChange={e => setForm({ ...form, musteri_kodu: e.target.value })} /></Field>
        <Field label="Müşteri İletişim"><input className="input" value={form.musteri_iletisim || ''} onChange={e => setForm({ ...form, musteri_iletisim: e.target.value })} /></Field>
        <Field label="Sezon"><input className="input" value={form.sezon || ''} onChange={e => setForm({ ...form, sezon: e.target.value })} /></Field>
        <Field label="Sipariş Miktarı"><input type="number" className="input" value={form.siparis_miktari} onChange={e => setForm({ ...form, siparis_miktari: Number(e.target.value) })} /></Field>
        <Field label="Bant">
          <select className="input" value={form.line_id || ''} onChange={e => setForm({ ...form, line_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">— Atanmadı —</option>
            {lines.map(l => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
          </select>
        </Field>
        <Field label="Başlangıç"><input type="date" className="input" value={form.baslangic_tarihi || ''} onChange={e => setForm({ ...form, baslangic_tarihi: e.target.value })} /></Field>
        <Field label="Teslim Tarihi"><input type="date" className="input" value={form.teslim_tarihi || ''} onChange={e => setForm({ ...form, teslim_tarihi: e.target.value })} /></Field>
        <Field label="Öncelik"><select className="input" value={form.oncelik} onChange={e => setForm({ ...form, oncelik: e.target.value })}>{['Düşük','Normal','Yüksek','Kritik'].map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Risk"><select className="input" value={form.risk_seviyesi} onChange={e => setForm({ ...form, risk_seviyesi: e.target.value })}>{['Düşük','Orta','Yüksek','Kritik'].map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Anlaşmalı Fiyat (TL/adet)"><input type="number" step="0.01" className="input" value={form.anlasmali_fiyat} onChange={e => setForm({ ...form, anlasmali_fiyat: Number(e.target.value) })} /></Field>
        <Field label="SAM (sn)"><input type="number" step="0.01" className="input" value={form.sam_toplam_sn} onChange={e => setForm({ ...form, sam_toplam_sn: Number(e.target.value) })} /></Field>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.tech_pack_onaylandi} onChange={e => setForm({ ...form, tech_pack_onaylandi: e.target.checked })} /> Tech Pack onaylandı</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.sample_onaylandi} onChange={e => setForm({ ...form, sample_onaylandi: e.target.checked })} /> Numune onaylandı</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.paylasim_admin} onChange={e => setForm({ ...form, paylasim_admin: e.target.checked })} /> Admin ile paylaş</label>
      </div>
      <Field label="Genel Notlar"><textarea className="input min-h-[80px]" value={form.notlar_genel || ''} onChange={e => setForm({ ...form, notlar_genel: e.target.value })} /></Field>
      <div className="flex gap-2">
        <button onClick={save} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover">Kaydet</button>
        <button onClick={() => setEditing(false)} className="px-4 py-2 border border-line rounded-lg text-sm">İptal</button>
      </div>
    </div>
  )
}

/* ───────── Aşamalar Tab — Kompakt, kullanıcı dostu kart bazlı UI ───────── */

const TR_AY_KISA = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']

function fmtTrDate(s: string | null | undefined): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return `${d.getDate()} ${TR_AY_KISA[d.getMonth()]}`
}
function fmtTrDateFull(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return `${d.getDate()} ${TR_AY_KISA[d.getMonth()]} ${d.getFullYear()}`
}
function rangeLabel(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  if (start && end) {
    const a = new Date(start), b = new Date(end)
    if (a.getTime() === b.getTime()) return fmtTrDateFull(start)
    const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1
    return `${fmtTrDate(start)} → ${fmtTrDate(end)} · ${days} gün`
  }
  if (start) return `${fmtTrDateFull(start)} itibaren`
  return `${fmtTrDateFull(end)}'a kadar`
}
function todayISO() { return new Date().toISOString().slice(0, 10) }
function addDaysISO(s: string, n: number): string {
  const d = new Date(s)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function AsamalarTab({ stages, lines, onRefresh, woId }: { stages: Stage[]; lines: Line[]; onRefresh: () => void; woId: number }) {
  const [showAdd, setShowAdd] = useState(false)
  const [catalog, setCatalog] = useState<{ id: number; code: string; name: string; sira_no: number; zorunlu: boolean; renk: string }[]>([])

  useEffect(() => {
    fetch(`/api/pes/work-orders/${woId}/stages`).then(r => r.json()).then(d => setCatalog(d.catalog || []))
  }, [woId])

  // Henüz eklenmemiş katalog aşamaları
  const eklenebilir = useMemo(() => {
    const mevcut = new Set(stages.map(s => s.stage_id))
    return catalog.filter(c => !mevcut.has(c.id))
  }, [catalog, stages])

  async function patch(stageId: number, body: Partial<Stage>) {
    await fetch('/api/pes/work-orders/stage', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: stageId, ...body }),
    })
    await onRefresh()
  }

  async function addStage(catalogId: number) {
    const cat = catalog.find(c => c.id === catalogId)
    if (!cat) return
    await fetch(`/api/pes/work-orders/${woId}/stages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: catalogId, sira_no: cat.sira_no }),
    })
    setShowAdd(false)
    await onRefresh()
  }

  async function delStage(stageRowId: number) {
    if (!confirm('Bu aşama silinsin mi?')) return
    await fetch(`/api/pes/work-orders/stage?id=${stageRowId}`, { method: 'DELETE' })
    await onRefresh()
  }

  // Sırala: zorunlu önce gelmesi için sira_no
  const sorted = [...stages].sort((a, b) => (a.sira_no || 0) - (b.sira_no || 0))

  return (
    <div className="space-y-3">
      {/* Kullanıcı talimat satırı */}
      <div className="bg-canvas border border-line-soft rounded-lg p-3 text-xs text-muted flex items-start gap-2">
        <span className="text-blue-500">💡</span>
        <span>
          Her aşama bir kart. <b>"Plan tarihi"</b> ve <b>"Süre"</b> birinden biri girince diğeri otomatik hesaplanır.
          Aşama başladığında <b>"Başlat"</b>, bittiğinde <b>"Bitir"</b> butonu tek tıkla durum + tarihi günceller.
          Üretilen adet ilerleme yüzdesini WO'nun ana ilerleme barına yansıtır.
        </span>
      </div>

      {sorted.map(s => (
        <StageCard key={s.id} stage={s} lines={lines}
          onPatch={(body) => patch(s.id, body)}
          onDelete={() => delStage(s.id)}
        />
      ))}

      {/* Aşama ekle */}
      <div className="flex items-center gap-2">
        {!showAdd ? (
          <button onClick={() => setShowAdd(true)}
            className="text-sm px-4 py-2 bg-white border border-dashed border-slate-300 rounded-lg hover:border-emerald-400 hover:bg-emerald-50/30 text-muted flex items-center gap-2">
            <span className="text-lg leading-none">+</span> Opsiyonel Aşama Ekle
          </button>
        ) : (
          <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-700 font-medium">Hangi aşama eklensin?</span>
            {eklenebilir.length === 0 ? (
              <span className="text-xs text-faint italic">Tüm katalog aşamaları zaten eklenmiş.</span>
            ) : (
              eklenebilir.map(c => (
                <button key={c.id} onClick={() => addStage(c.id)}
                  className="text-xs px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-md flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.renk }} />
                  {c.name}
                </button>
              ))
            )}
            <button onClick={() => setShowAdd(false)} className="text-xs text-faint ml-auto px-2">İptal</button>
          </div>
        )}
      </div>
    </div>
  )
}

function StageCard({ stage, lines, onPatch, onDelete }: {
  stage: Stage
  lines: Line[]
  onPatch: (body: Partial<Stage>) => Promise<void>
  onDelete: () => void
}) {
  const [editPlan, setEditPlan] = useState(false)
  const [editGercek, setEditGercek] = useState(false)
  const [editAdet, setEditAdet] = useState(false)
  const [editNot, setEditNot] = useState(false)

  // Plan field state
  const [planStart, setPlanStart] = useState(stage.plan_baslangic || '')
  const [planEnd, setPlanEnd] = useState(stage.plan_bitis || '')
  const [planDays, setPlanDays] = useState<string>('')

  // Gerçek field state
  const [gercekStart, setGercekStart] = useState(stage.gercek_baslangic || '')
  const [gercekEnd, setGercekEnd] = useState(stage.gercek_bitis || '')

  // Adet
  const [uretilen, setUretilen] = useState(String(stage.uretilen_adet || 0))
  const [hatali, setHatali] = useState(String(stage.hatali_adet || 0))

  // Notlar
  const [notlar, setNotlar] = useState(stage.notlar || '')

  useEffect(() => {
    setPlanStart(stage.plan_baslangic || '')
    setPlanEnd(stage.plan_bitis || '')
    setGercekStart(stage.gercek_baslangic || '')
    setGercekEnd(stage.gercek_bitis || '')
    setUretilen(String(stage.uretilen_adet || 0))
    setHatali(String(stage.hatali_adet || 0))
    setNotlar(stage.notlar || '')
    if (stage.plan_baslangic && stage.plan_bitis) {
      const d = Math.round((new Date(stage.plan_bitis).getTime() - new Date(stage.plan_baslangic).getTime()) / 86400000) + 1
      setPlanDays(String(d))
    } else { setPlanDays('') }
  }, [stage])

  // Plan kaydet — başlangıç + (bitiş veya süre) verilince hesapla
  async function savePlan() {
    let pStart = planStart || null
    let pEnd = planEnd || null
    if (pStart && !pEnd && planDays && Number(planDays) > 0) {
      pEnd = addDaysISO(pStart, Number(planDays) - 1)
    }
    if (!pStart && pEnd && planDays && Number(planDays) > 0) {
      pStart = addDaysISO(pEnd, -(Number(planDays) - 1))
    }
    await onPatch({
      plan_baslangic: pStart as string | null,
      plan_bitis: pEnd as string | null,
      plan_sure_dk: pStart && pEnd ? Math.round((new Date(pEnd).getTime() - new Date(pStart).getTime()) / 60000) + (24 * 60) : null,
    })
    setEditPlan(false)
  }

  async function saveGercek() {
    await onPatch({ gercek_baslangic: gercekStart || null, gercek_bitis: gercekEnd || null })
    setEditGercek(false)
  }
  async function saveAdet() {
    await onPatch({ uretilen_adet: Number(uretilen), hatali_adet: Number(hatali) })
    setEditAdet(false)
  }
  async function saveNot() {
    await onPatch({ notlar })
    setEditNot(false)
  }

  // Hızlı aksiyonlar
  async function quickStart() {
    await onPatch({ durum: 'Devam', gercek_baslangic: stage.gercek_baslangic || todayISO(), ilerleme_pct: stage.ilerleme_pct > 0 ? stage.ilerleme_pct : 5 })
  }
  async function quickFinish() {
    await onPatch({ durum: 'Tamamlandi', gercek_bitis: todayISO(), ilerleme_pct: 100 })
  }
  async function quickPause() {
    await onPatch({ durum: 'Duraklatildi' })
  }
  async function quickPlanBugun() {
    const today = todayISO()
    await onPatch({ plan_baslangic: today })
  }
  async function quickPlanFromYesterday() {
    const today = todayISO()
    const week = addDaysISO(today, 6)
    await onPatch({ plan_baslangic: today, plan_bitis: week })
  }
  async function setProgress(p: number) {
    await onPatch({ ilerleme_pct: p, durum: p === 100 ? 'Tamamlandi' : (p > 0 ? 'Devam' : stage.durum) })
  }
  async function setLine(lineId: number | null) {
    await onPatch({ line_id: lineId })
  }

  const isPlanned = stage.plan_baslangic || stage.plan_bitis
  const isStarted = stage.gercek_baslangic
  const isDone = stage.durum === 'Tamamlandi'

  return (
    <div className="border border-line-soft rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100" style={{ backgroundColor: (stage.stage_renk || '#94a3b8') + '15' }}>
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.stage_renk || '#94a3b8' }} />
        <span className="font-semibold text-base">{stage.stage_name}</span>
        <Badge cls={STAGE_DURUM_RENK[stage.durum] || 'bg-slate-100'}>{stage.durum}</Badge>
        {stage.gecikme_gun != null && stage.gecikme_gun > 0 && (
          <Badge cls="bg-red-100 text-red-700">+{stage.gecikme_gun}g gecikme</Badge>
        )}
        {stage.gecikme_gun != null && stage.gecikme_gun < 0 && (
          <Badge cls="bg-emerald-100 text-emerald-700">{Math.abs(stage.gecikme_gun)}g erken</Badge>
        )}

        {/* Bant seçici inline */}
        <select className="text-xs px-2 py-1 bg-white border border-line-soft rounded ml-2"
          value={stage.line_id ?? ''}
          onChange={e => setLine(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— Bant seç —</option>
          {lines.map(l => <option key={l.id} value={l.id}>{l.code} {l.name}</option>)}
        </select>

        <div className="flex-1" />

        {/* Hızlı aksiyon butonları */}
        {!isStarted && (
          <button onClick={quickStart}
            className="text-xs px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 flex items-center gap-1">
            ▶ Başlat
          </button>
        )}
        {isStarted && !isDone && (
          <>
            {stage.durum !== 'Duraklatildi' && (
              <button onClick={quickPause} className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200">⏸</button>
            )}
            <button onClick={quickFinish}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1">
              ✓ Bitir
            </button>
          </>
        )}
        <button onClick={onDelete} className="text-xs text-slate-400 hover:text-red-600 px-1" title="Aşamayı sil">🗑</button>
      </div>

      {/* Body — 2 kolon: Plan / Gerçek */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {/* PLAN kolonu */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-blue-700 font-semibold">📅 Plan</span>
            {!editPlan && (
              <button onClick={() => setEditPlan(true)}
                className="text-xs text-blue-600 hover:text-blue-800">✏ Değiştir</button>
            )}
          </div>
          {!editPlan ? (
            <div>
              <div className="text-sm font-medium text-ink">
                {isPlanned ? rangeLabel(stage.plan_baslangic, stage.plan_bitis) : <span className="text-slate-400 italic">henüz plan yok</span>}
              </div>
              {!isPlanned && (
                <div className="flex gap-1.5 mt-2">
                  <button onClick={quickPlanBugun} className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Bugün başla</button>
                  <button onClick={quickPlanFromYesterday} className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Bu hafta (7 gün)</button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 bg-blue-50 -m-1 p-3 rounded">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted block">Başlangıç</label>
                  <input type="date" className="w-full text-sm px-2 py-1 border border-line rounded" value={planStart} onChange={e => setPlanStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-muted block">Bitiş</label>
                  <input type="date" className="w-full text-sm px-2 py-1 border border-line rounded" value={planEnd} onChange={e => setPlanEnd(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-muted block">veya Süre (gün)</label>
                  <input type="number" min={1} placeholder="5" className="w-full text-sm px-2 py-1 border border-line rounded" value={planDays} onChange={e => setPlanDays(e.target.value)} />
                </div>
              </div>
              <div className="text-[10px] text-faint italic">Sadece başlangıç + süre veya başlangıç + bitiş yeter; eksik olanı sistem hesaplar.</div>
              <div className="flex gap-2">
                <button onClick={savePlan} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Kaydet</button>
                <button onClick={() => setEditPlan(false)} className="text-xs px-3 py-1 border border-line rounded">İptal</button>
              </div>
            </div>
          )}
        </div>

        {/* GERÇEK kolonu */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">⏱ Gerçek</span>
            {!editGercek && (
              <button onClick={() => setEditGercek(true)}
                className="text-xs text-emerald-700 hover:text-emerald-900">✏ Değiştir</button>
            )}
          </div>
          {!editGercek ? (
            <div>
              <div className="text-sm font-medium text-ink">
                {(stage.gercek_baslangic || stage.gercek_bitis)
                  ? rangeLabel(stage.gercek_baslangic, stage.gercek_bitis)
                  : <span className="text-slate-400 italic">henüz başlamadı</span>}
              </div>
            </div>
          ) : (
            <div className="space-y-2 bg-emerald-50 -m-1 p-3 rounded">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted block">Gerçek Başlangıç</label>
                  <input type="date" className="w-full text-sm px-2 py-1 border border-line rounded" value={gercekStart} onChange={e => setGercekStart(e.target.value)} />
                  <button onClick={() => setGercekStart(todayISO())} className="text-[10px] text-emerald-700 hover:text-emerald-900 mt-0.5">→ Bugün</button>
                </div>
                <div>
                  <label className="text-[10px] text-muted block">Gerçek Bitiş</label>
                  <input type="date" className="w-full text-sm px-2 py-1 border border-line rounded" value={gercekEnd} onChange={e => setGercekEnd(e.target.value)} />
                  <button onClick={() => setGercekEnd(todayISO())} className="text-[10px] text-emerald-700 hover:text-emerald-900 mt-0.5">→ Bugün</button>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveGercek} className="text-xs px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700">Kaydet</button>
                <button onClick={() => setEditGercek(false)} className="text-xs px-3 py-1 border border-line rounded">İptal</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* İlerleme + Adet + Not — alt şerit */}
      <div className="border-t border-gray-100 px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* İlerleme */}
        <div>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-faint font-semibold mb-1">
            <span>📊 İlerleme</span>
            <span className="font-mono text-slate-700">%{stage.ilerleme_pct}</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full transition-all ${stage.ilerleme_pct === 100 ? 'bg-emerald-500' : stage.ilerleme_pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
              style={{ width: `${stage.ilerleme_pct}%` }} />
          </div>
          <div className="flex gap-1 mt-1.5">
            {[0, 25, 50, 75, 100].map(p => (
              <button key={p} onClick={() => setProgress(p)}
                className={`text-[10px] px-1.5 py-0.5 rounded ${stage.ilerleme_pct === p ? 'bg-slate-800 text-white' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}>
                %{p}
              </button>
            ))}
          </div>
        </div>

        {/* Adet */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-faint font-semibold">🎯 Üretim</span>
            {!editAdet && (
              <button onClick={() => setEditAdet(true)} className="text-xs text-faint hover:text-slate-800">✏</button>
            )}
          </div>
          {!editAdet ? (
            <div className="text-sm mt-1">
              <span className="font-semibold text-ink">{stage.uretilen_adet}</span>
              <span className="text-slate-400"> adet</span>
              {stage.hatali_adet > 0 && (
                <span className="text-red-600 ml-2 text-xs">· {stage.hatali_adet} hatalı</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-1">
              <input type="number" className="w-16 text-sm px-1.5 py-0.5 border border-line rounded" value={uretilen} onChange={e => setUretilen(e.target.value)} placeholder="adet" />
              <span className="text-xs text-slate-400">/</span>
              <input type="number" className="w-14 text-sm px-1.5 py-0.5 border border-line rounded" value={hatali} onChange={e => setHatali(e.target.value)} placeholder="hatalı" />
              <button onClick={saveAdet} className="text-xs px-2 py-0.5 bg-emerald-600 text-white rounded">✓</button>
              <button onClick={() => setEditAdet(false)} className="text-xs text-faint">×</button>
            </div>
          )}
        </div>

        {/* Notlar */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-faint font-semibold">📝 Not</span>
            {!editNot && (
              <button onClick={() => setEditNot(true)} className="text-xs text-faint hover:text-slate-800">✏</button>
            )}
          </div>
          {!editNot ? (
            <div className="text-xs text-muted mt-1 italic">
              {stage.notlar || <span className="text-slate-300">— not yok —</span>}
            </div>
          ) : (
            <div className="space-y-1 mt-1">
              <textarea className="w-full text-xs px-2 py-1 border border-line rounded min-h-[40px]" value={notlar} onChange={e => setNotlar(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={saveNot} className="text-xs px-2 py-0.5 bg-emerald-600 text-white rounded">Kaydet</button>
                <button onClick={() => setEditNot(false)} className="text-xs text-faint">İptal</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ───────── Malzemeler Tab ───────── */
function MalzemelerTab({ materials, onRefresh, woId }: { materials: Material[]; onRefresh: () => void; woId: number }) {
  const [showAdd, setShowAdd] = useState(false)
  const [add, setAdd] = useState({ tip: 'AKSESUAR', kod: '', ad: '', miktar: 0, birim: '', durum: 'Bekleniyor', beklenen_tarih: '', tedarikci: '' })

  async function save() {
    if (!add.ad.trim()) { alert('Malzeme adı zorunlu'); return }
    await fetch(`/api/pes/work-orders/${woId}/materials`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...add, beklenen_tarih: add.beklenen_tarih || null }),
    })
    setShowAdd(false); setAdd({ tip: 'AKSESUAR', kod: '', ad: '', miktar: 0, birim: '', durum: 'Bekleniyor', beklenen_tarih: '', tedarikci: '' })
    await onRefresh()
  }

  async function patch(m: Material, patch: Partial<Material>) {
    await fetch('/api/pes/work-orders/material', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, ...patch }),
    })
    await onRefresh()
  }

  async function del(id: number) {
    if (!confirm('Sil?')) return
    await fetch(`/api/pes/work-orders/material?id=${id}`, { method: 'DELETE' })
    await onRefresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs px-3 py-1.5 bg-accent text-white rounded-lg">+ Malzeme Ekle</button>
        <span className="text-xs text-faint">Kumaş, aksesuar, etiket, ambalaj — durum: Bekleniyor → Sipariş → Yolda → Geldi</span>
      </div>

      {showAdd && (
        <div className="bg-canvas border border-line-soft rounded-lg p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
          <Field label="Tip"><select className="input-sm" value={add.tip} onChange={e => setAdd({ ...add, tip: e.target.value })}>{['KUMAŞ','AKSESUAR','ETİKET','AMBALAJ','İPLİK','DIGER'].map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Ad *"><input className="input-sm" value={add.ad} onChange={e => setAdd({ ...add, ad: e.target.value })} /></Field>
          <Field label="Kod"><input className="input-sm" value={add.kod} onChange={e => setAdd({ ...add, kod: e.target.value })} /></Field>
          <Field label="Miktar"><input type="number" step="0.01" className="input-sm" value={add.miktar} onChange={e => setAdd({ ...add, miktar: Number(e.target.value) })} /></Field>
          <Field label="Birim"><input className="input-sm" placeholder="m, kg, adet" value={add.birim} onChange={e => setAdd({ ...add, birim: e.target.value })} /></Field>
          <Field label="Tedarikçi"><input className="input-sm" value={add.tedarikci} onChange={e => setAdd({ ...add, tedarikci: e.target.value })} /></Field>
          <Field label="Beklenen Tarih"><input type="date" className="input-sm" value={add.beklenen_tarih} onChange={e => setAdd({ ...add, beklenen_tarih: e.target.value })} /></Field>
          <Field label="Durum"><select className="input-sm" value={add.durum} onChange={e => setAdd({ ...add, durum: e.target.value })}>{Object.keys(MATERIAL_DURUM_RENK).map(d => <option key={d}>{d}</option>)}</select></Field>
          <div className="md:col-span-4 flex gap-2"><button onClick={save} className="px-3 py-1 bg-accent text-white rounded text-xs">Ekle</button></div>
        </div>
      )}

      {materials.length === 0 && <div className="text-xs text-slate-400 italic text-center py-6">Henüz malzeme kaydı yok.</div>}

      <table className="w-full text-xs">
        <thead className="bg-canvas text-faint uppercase tracking-wider text-[10px]">
          <tr>
            <th className="px-3 py-2 text-left">Tip</th>
            <th className="px-3 py-2 text-left">Ad</th>
            <th className="px-3 py-2 text-left">Kod</th>
            <th className="px-3 py-2 text-right">Miktar</th>
            <th className="px-3 py-2 text-left">Tedarikçi</th>
            <th className="px-3 py-2 text-left">Beklenen</th>
            <th className="px-3 py-2 text-left">Geldi</th>
            <th className="px-3 py-2">Durum</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {materials.map(m => (
            <tr key={m.id} className="border-t border-gray-100 hover:bg-canvas">
              <td className="px-3 py-1.5 text-muted">{m.tip}</td>
              <td className="px-3 py-1.5 font-medium">{m.ad}</td>
              <td className="px-3 py-1.5 text-faint font-mono">{m.kod}</td>
              <td className="px-3 py-1.5 text-right font-mono">{m.miktar} {m.birim}</td>
              <td className="px-3 py-1.5 text-muted">{m.tedarikci}</td>
              <td className="px-3 py-1.5 text-faint">{m.beklenen_tarih}</td>
              <td className="px-3 py-1.5 text-faint">
                <input type="date" className="input-sm" value={m.gelis_tarihi || ''}
                  onChange={e => patch(m, { gelis_tarihi: e.target.value, durum: e.target.value ? 'Geldi' : m.durum })} />
              </td>
              <td className="px-3 py-1.5">
                <select className="input-sm" value={m.durum} onChange={e => patch(m, { durum: e.target.value })}>
                  {Object.keys(MATERIAL_DURUM_RENK).map(d => <option key={d}>{d}</option>)}
                </select>
              </td>
              <td className="px-3 py-1.5 text-right">
                <button onClick={() => del(m.id)} className="text-red-500 text-xs">×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ───────── Günlük (Journal) Tab ───────── */
function GunlukTab({ journal, stages, onRefresh, woId }: { journal: Journal[]; stages: Stage[]; onRefresh: () => void; woId: number }) {
  const [showAdd, setShowAdd] = useState(false)
  const [add, setAdd] = useState({
    tarih: new Date().toISOString().slice(0, 10), vardiya: 'Gündüz',
    tip: 'PROBLEM', kategori: '', baslik: '', aciklama: '', oneri: '', stage_id: '', yazan: '', paylasim_admin: false,
  })

  async function save() {
    if (!add.aciklama.trim()) { alert('Açıklama zorunlu'); return }
    await fetch(`/api/pes/work-orders/${woId}/journal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...add, stage_id: add.stage_id ? Number(add.stage_id) : null }),
    })
    setShowAdd(false)
    setAdd({ tarih: new Date().toISOString().slice(0, 10), vardiya: 'Gündüz', tip: 'PROBLEM', kategori: '', baslik: '', aciklama: '', oneri: '', stage_id: '', yazan: '', paylasim_admin: false })
    await onRefresh()
  }

  async function resolveEntry(j: Journal) {
    const note = prompt('Çözüm notu (opsiyonel):', '')
    if (note === null) return
    await fetch('/api/pes/work-orders/journal', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: j.id, resolved: true, resolved_notlar: note || null }),
    })
    await onRefresh()
  }

  async function togglePaylasim(j: Journal) {
    await fetch('/api/pes/work-orders/journal', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: j.id, paylasim_admin: !j.paylasim_admin }),
    })
    await onRefresh()
  }

  async function del(id: number) {
    if (!confirm('Sil?')) return
    await fetch(`/api/pes/work-orders/journal?id=${id}`, { method: 'DELETE' })
    await onRefresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs px-3 py-1.5 bg-accent text-white rounded-lg">+ Günlük Kaydı</button>
        <span className="text-xs text-faint">Problem, kaizen, başarı, blokaj, uyarı, not — admin ile paylaşıma açabilirsin</span>
      </div>

      {showAdd && (
        <div className="bg-canvas border border-line-soft rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Field label="Tarih"><input type="date" className="input-sm" value={add.tarih} onChange={e => setAdd({ ...add, tarih: e.target.value })} /></Field>
            <Field label="Vardiya"><select className="input-sm" value={add.vardiya} onChange={e => setAdd({ ...add, vardiya: e.target.value })}>{['Gündüz','Gece','Tek'].map(v => <option key={v}>{v}</option>)}</select></Field>
            <Field label="Tip"><select className="input-sm" value={add.tip} onChange={e => setAdd({ ...add, tip: e.target.value })}>{Object.keys(JOURNAL_TIP_RENK).map(t => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Aşama (opsiyonel)">
              <select className="input-sm" value={add.stage_id} onChange={e => setAdd({ ...add, stage_id: e.target.value })}>
                <option value="">—</option>
                {stages.map(s => <option key={s.id} value={s.stage_id}>{s.stage_name}</option>)}
              </select>
            </Field>
            <Field label="Kategori"><input className="input-sm" placeholder="Makine, Operatör, Malzeme, Kalite, Plan..." value={add.kategori} onChange={e => setAdd({ ...add, kategori: e.target.value })} /></Field>
            <Field label="Yazan"><input className="input-sm" value={add.yazan} onChange={e => setAdd({ ...add, yazan: e.target.value })} placeholder="Ad Soyad" /></Field>
            <Field label="Başlık"><input className="input-sm" value={add.baslik} onChange={e => setAdd({ ...add, baslik: e.target.value })} placeholder="Kısa başlık (ops.)" /></Field>
          </div>
          <Field label="Açıklama *"><textarea className="input min-h-[80px]" value={add.aciklama} onChange={e => setAdd({ ...add, aciklama: e.target.value })} placeholder="Ne oldu? Detaylı yaz." /></Field>
          <Field label="Öneri / Çözüm"><textarea className="input min-h-[50px]" value={add.oneri} onChange={e => setAdd({ ...add, oneri: e.target.value })} placeholder="Çözüm önerisi (opsiyonel)" /></Field>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={add.paylasim_admin} onChange={e => setAdd({ ...add, paylasim_admin: e.target.checked })} /> Bu kaydı admin (merkez) ile paylaş</label>
          <div className="flex gap-2"><button onClick={save} className="px-3 py-1 bg-accent text-white rounded text-xs">Kaydet</button></div>
        </div>
      )}

      {journal.length === 0 && <div className="text-xs text-slate-400 italic text-center py-6">Henüz günlük kaydı yok.</div>}

      <div className="space-y-2">
        {journal.map(j => {
          const meta = JOURNAL_TIP_RENK[j.tip] || JOURNAL_TIP_RENK.NOT
          return (
            <div key={j.id} className={`border rounded-lg p-3 ${meta.bg.replace('100', '50')} ${j.resolved ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg">{meta.icon}</span>
                  <Badge cls={`${meta.bg} ${meta.text}`}>{j.tip}</Badge>
                  {j.kategori && <Badge cls="bg-white text-muted border border-line-soft">{j.kategori}</Badge>}
                  {j.stage_name && <Badge cls="bg-slate-100 text-muted">📊 {j.stage_name}</Badge>}
                  <span className="text-xs text-faint">{j.tarih} · {j.vardiya}</span>
                  {j.paylasim_admin && <Badge cls="bg-blue-100 text-blue-700">🔗 Admin paylaşımda</Badge>}
                  {j.resolved && <Badge cls="bg-emerald-100 text-emerald-700">✓ Çözüldü</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  {!j.resolved && j.tip === 'PROBLEM' && (
                    <button onClick={() => resolveEntry(j)} className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200">Çözüldü</button>
                  )}
                  <button onClick={() => togglePaylasim(j)} className="text-xs px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded" title="Admin paylaşımını aç/kapat">🔗</button>
                  <button onClick={() => del(j.id)} className="text-xs text-red-500 px-1">×</button>
                </div>
              </div>
              {j.baslik && <div className="font-semibold text-sm mt-2">{j.baslik}</div>}
              <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{j.aciklama}</div>
              {j.oneri && (
                <div className="mt-2 pl-3 border-l-2 border-cyan-400 text-xs text-slate-700">
                  <span className="font-semibold text-cyan-700">Öneri/Çözüm: </span>{j.oneri}
                </div>
              )}
              {j.resolved && j.resolved_notlar && (
                <div className="mt-2 pl-3 border-l-2 border-emerald-400 text-xs text-muted">
                  <span className="font-semibold text-emerald-700">Çözüm Notu: </span>{j.resolved_notlar}
                </div>
              )}
              {j.yazan && <div className="text-[10px] text-slate-400 mt-2">— {j.yazan}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ───────── Geçmiş Tab ───────── */
function GecmisTab({ history }: { history: { tarih: string; eski_durum: string; yeni_durum: string }[] }) {
  if (history.length === 0) return <div className="text-xs text-slate-400 italic text-center py-6">Durum geçmişi henüz yok.</div>
  return (
    <div className="space-y-2">
      {history.map((h, i) => (
        <div key={i} className="flex items-center gap-3 text-xs border-b border-slate-100 py-2">
          <span className="text-slate-400 font-mono">{new Date(h.tarih).toLocaleString('tr-TR')}</span>
          <span className="text-muted">{h.eski_durum || '—'}</span>
          <span>→</span>
          <span className="font-medium">{h.yeni_durum}</span>
        </div>
      ))}
    </div>
  )
}

/* ───────── Helpers ───────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[10px] font-medium text-faint uppercase tracking-wider mb-1">{label}</label>{children}</div>
}
function DataRow({ label, value, highlight }: { label: string; value: string | number | null | undefined; highlight?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-slate-100 pb-2">
      <div className="w-32 text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={`flex-1 ${highlight ? 'font-bold text-accent' : 'text-ink'}`}>{value || '—'}</div>
    </div>
  )
}
function Cell({ label, value, highlight }: { label: string; value: string | number | null | undefined; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={`mt-0.5 font-mono ${highlight ? 'text-accent font-bold' : 'text-slate-700'}`}>{value || '—'}</div>
    </div>
  )
}
function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${cls}`}>{children}</span>
}
function ProgressMini({ label, pct, sub }: { label: string; pct: number; sub: string }) {
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : pct > 0 ? 'bg-blue-500' : 'bg-slate-300'
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="uppercase tracking-wider text-faint font-semibold">{label}</span>
        <span className="font-mono font-semibold">%{pct}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="text-[10px] text-faint mt-0.5 truncate">{sub}</div>
    </div>
  )
}
