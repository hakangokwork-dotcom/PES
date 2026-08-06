'use client'

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'

interface Workshop {
  id: number; code: string; name: string;
  city: string | null; type: string | null;
  line_count: number; daily_target: number;
  is_active: boolean;
}
interface Line {
  id: number; code: string; name: string; workshop_id: number;
  daily_target: number | null; operator_count: number | null; is_active: boolean;
}
interface WO {
  id: number; is_emri_no: string; model_adi: string; musteri: string | null;
  workshop_id: number; line_id: number | null; line_name: string | null;
  baslangic_tarihi: string | null; bitis_tarihi: string | null; teslim_tarihi: string | null;
  durum: string; oncelik: string; ilerleme_pct: number; siparis_miktari: number;
  aciliyet: string;
}

const ONCELIK_RENK: Record<string, string> = {
  'Kritik': '#dc2626', 'Yüksek': '#f59e0b', 'Normal': '#3b82f6', 'Düşük': '#94a3b8',
}
const TR_AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
const TR_GUNLER = ['Pzr','Pzt','Sal','Çar','Per','Cum','Cmt']

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth()+1, 0) }
function daysOf(s: Date, e: Date) { const arr: Date[] = []; const c = new Date(s); while (c <= e) { arr.push(new Date(c)); c.setDate(c.getDate()+1) } return arr }
function parseDate(s: string | null) { if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d }
function dateOnly(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function isWeekend(d: Date) { const w = d.getDay(); return w === 0 || w === 6 }
function fmt(d: Date) { return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}` }

export default function Wrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor...</div>}><PesTakvimPage /></Suspense>
}

function PesTakvimPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [allLines, setAllLines] = useState<Line[]>([])
  const [allOrders, setAllOrders] = useState<WO[]>([])
  const [refDate, setRefDate] = useState(() => new Date())
  const [view, setView] = useState<'genel' | 'atolye' | 'slot'>('genel')
  const [selectedWorkshop, setSelectedWorkshop] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [filterDolulukMin, setFilterDolulukMin] = useState<number>(0)
  const [filterDolulukMax, setFilterDolulukMax] = useState<number>(100)
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [wsRes, linesRes, ordersRes] = await Promise.all([
        fetch('/api/pes/workshops').then(r => r.json()),
        fetch('/api/pes/lines').then(r => r.json()),
        fetch('/api/pes/work-orders').then(r => r.json()),
      ])
      setWorkshops(wsRes.workshops || [])
      setAllLines(linesRes.lines || [])
      setAllOrders(ordersRes.orders || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { reload() }, [reload])

  const range = useMemo(() => ({ start: startOfMonth(refDate), end: endOfMonth(refDate) }), [refDate])
  const days = useMemo(() => daysOf(range.start, range.end), [range])
  const today = dateOnly(new Date())
  const isgun = useMemo(() => days.filter(d => !isWeekend(d)).length, [days])

  // Atölye başına özet hesapla
  const workshopSummary = useMemo(() => {
    return workshops.map(ws => {
      const lines = allLines.filter(l => l.workshop_id === ws.id)
      const wos = allOrders.filter(o => {
        if (o.workshop_id !== ws.id) return false
        if (o.durum === 'İptal' || o.durum === 'Tamamlandi' || o.durum === 'Sevk Edildi') return false
        const start = parseDate(o.baslangic_tarihi)
        const end = parseDate(o.bitis_tarihi) || parseDate(o.teslim_tarihi)
        if (!start || !end) return false
        return end >= range.start && start <= range.end
      })

      // Bant başına doluluk hesapla
      const lineDoluluk = lines.map(line => {
        const lwos = wos.filter(o => o.line_id === line.id)
        const dolugun = new Set<string>()
        for (const o of lwos) {
          const s = parseDate(o.baslangic_tarihi)
          const e = parseDate(o.bitis_tarihi) || parseDate(o.teslim_tarihi)
          if (!s || !e) continue
          const a = s < range.start ? range.start : s
          const b = e > range.end ? range.end : e
          const cur = new Date(a)
          while (cur <= b) {
            if (!isWeekend(cur)) dolugun.add(cur.toISOString().slice(0,10))
            cur.setDate(cur.getDate()+1)
          }
        }
        return { line, dolu_gun: dolugun.size, doluluk_pct: isgun > 0 ? Math.round((dolugun.size / isgun) * 100) : 0 }
      })

      const avgDoluluk = lineDoluluk.length > 0
        ? Math.round(lineDoluluk.reduce((s, ld) => s + ld.doluluk_pct, 0) / lineDoluluk.length)
        : 0
      const acikSlot = lineDoluluk.reduce((s, ld) => s + Math.max(0, isgun - ld.dolu_gun), 0)
      const kritikWo = wos.filter(w => w.aciliyet === 'kritik').length
      const acilWo = wos.filter(w => w.aciliyet === 'acil').length
      const acikProblem = 0 // TODO: birleşik view'dan çek

      return {
        ws, lines, wos, lineDoluluk,
        avgDoluluk, acikSlot, kritikWo, acilWo, acikProblem,
      }
    })
  }, [workshops, allLines, allOrders, range, isgun])

  // Atölyeler filtresi
  const filteredSummary = useMemo(() => {
    return workshopSummary.filter(s => {
      if (!showInactive && !s.ws.is_active) return false
      if (s.avgDoluluk < filterDolulukMin) return false
      if (s.avgDoluluk > filterDolulukMax) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!(s.ws.code.toLowerCase().includes(q) || s.ws.name.toLowerCase().includes(q) || (s.ws.city || '').toLowerCase().includes(q))) return false
      }
      return true
    }).sort((a, b) => a.avgDoluluk - b.avgDoluluk)  // Boş olanlar üstte
  }, [workshopSummary, filterDolulukMin, filterDolulukMax, showInactive, search])

  const totals = useMemo(() => ({
    total: workshopSummary.length,
    bos: workshopSummary.filter(s => s.avgDoluluk < 30).length,
    yogun: workshopSummary.filter(s => s.avgDoluluk >= 80).length,
    tum_acik_slot: workshopSummary.reduce((s, x) => s + x.acikSlot, 0),
    tum_wo: workshopSummary.reduce((s, x) => s + x.wos.length, 0),
    tum_kritik: workshopSummary.reduce((s, x) => s + x.kritikWo, 0),
  }), [workshopSummary])

  function shiftMonth(delta: number) {
    const d = new Date(refDate)
    d.setMonth(d.getMonth() + delta)
    setRefDate(d)
  }

  // Seçili atölyenin takvim verisi
  const selectedSummary = useMemo(() => {
    if (!selectedWorkshop) return null
    return workshopSummary.find(s => s.ws.id === selectedWorkshop) || null
  }, [selectedWorkshop, workshopSummary])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Atölyeler — Bant Takvimi</h1>
          <p className="text-sm text-faint mt-1">
            Tüm atölyelerin bant doluluk durumu. Boş atölye/slot bul, müşteri siparişine en uygun atölyeyi seç.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-line-soft rounded-xl p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => shiftMonth(-1)} className="px-2 py-1.5 text-sm border border-line-soft rounded hover:bg-canvas">‹</button>
          <button onClick={() => setRefDate(new Date())} className="px-3 py-1.5 text-sm border border-line-soft rounded hover:bg-canvas">Bugün</button>
          <button onClick={() => shiftMonth(+1)} className="px-2 py-1.5 text-sm border border-line-soft rounded hover:bg-canvas">›</button>
        </div>
        <span className="text-sm font-semibold text-ink px-2">
          {TR_AYLAR[refDate.getMonth()]} {refDate.getFullYear()}
        </span>

        <div className="h-6 w-px bg-line-soft mx-1" />

        <div className="flex items-center gap-1 text-sm">
          {(['genel', 'atolye', 'slot'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded transition ${view === v ? 'bg-accent text-white' : 'border border-line-soft hover:bg-canvas'}`}>
              {v === 'genel' ? 'Atölye Listesi' : v === 'atolye' ? 'Tek Atölye Detay' : '🔍 Slot Bulucu'}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-line-soft mx-1" />

        <input className="px-3 py-1.5 text-sm border border-line-soft rounded-lg w-[200px]"
          placeholder="Ara: kod, isim, şehir..."
          value={search} onChange={e => setSearch(e.target.value)} />

        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span>Doluluk:</span>
          <input type="number" className="w-14 px-2 py-1 border border-line-soft rounded" value={filterDolulukMin} onChange={e => setFilterDolulukMin(Number(e.target.value))} />
          <span>→</span>
          <input type="number" className="w-14 px-2 py-1 border border-line-soft rounded" value={filterDolulukMax} onChange={e => setFilterDolulukMax(Number(e.target.value))} />
          <span>%</span>
        </div>

        <button onClick={() => { setFilterDolulukMin(0); setFilterDolulukMax(30); setSearch('') }}
          className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded font-medium" title="Doluluğu %30'un altında olanları göster">
          🟢 Boş Atölyeler
        </button>
        <button onClick={() => { setFilterDolulukMin(80); setFilterDolulukMax(100); setSearch('') }}
          className="text-xs px-2.5 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded font-medium" title="Doluluğu %80 ve üzeri olanları göster">
          🔴 Yoğun Atölyeler
        </button>
        <button onClick={() => { setFilterDolulukMin(0); setFilterDolulukMax(100); setSearch('') }}
          className="text-xs text-faint hover:text-ink">Temizle</button>

        <span className="ml-auto text-xs text-faint">{filteredSummary.length} / {workshopSummary.length}</span>
      </div>

      {/* Genel Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Toplam Atölye" value={totals.total} />
        <Stat label="Boş Atölye" value={totals.bos} sub="(<%30 doluluk)" tone="emerald" />
        <Stat label="Yoğun" value={totals.yogun} sub="(≥%80)" tone="red" />
        <Stat label="Açık İş Günü" value={totals.tum_acik_slot} sub="tüm bantlarda" tone="cyan" />
        <Stat label="Aktif WO" value={totals.tum_wo} />
        <Stat label="Kritik" value={totals.tum_kritik} sub="teslim geçmiş" tone="red" />
      </div>

      {loading ? (
        <div className="p-10 text-center text-faint">Yükleniyor...</div>
      ) : view === 'genel' ? (
        <AtolyeListView
          summary={filteredSummary}
          range={range}
          isgun={isgun}
          onSelect={(id) => { setSelectedWorkshop(id); setView('atolye') }}
        />
      ) : view === 'atolye' ? (
        <AtolyeDetayView
          summary={selectedSummary}
          allSummary={workshopSummary}
          days={days}
          range={range}
          today={today}
          onChangeWorkshop={(id) => setSelectedWorkshop(id)}
          onBack={() => setView('genel')}
        />
      ) : (
        <SlotBulucuView
          workshops={workshops}
          allLines={allLines}
          allOrders={allOrders}
          onJumpAtolye={(wsId) => { setSelectedWorkshop(wsId); setView('atolye') }}
        />
      )}
    </div>
  )
}

/* ───────── Atölye Liste Görünümü ───────── */
function AtolyeListView({
  summary, range, isgun, onSelect,
}: {
  summary: ReturnType<typeof useWorkshopSummaryDummy>[]
  range: { start: Date; end: Date }
  isgun: number
  onSelect: (id: number) => void
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {summary.map(s => {
        const tone = s.avgDoluluk >= 80 ? 'red' : s.avgDoluluk >= 50 ? 'amber' : s.avgDoluluk >= 20 ? 'emerald' : 'slate'
        const tones: Record<string, string> = {
          red:     'border-red-300 bg-red-50',
          amber:   'border-amber-300 bg-amber-50',
          emerald: 'border-emerald-300 bg-emerald-50',
          slate:   'border-line-soft bg-white',
        }
        const barColor = s.avgDoluluk >= 90 ? 'bg-red-500' : s.avgDoluluk >= 70 ? 'bg-amber-500' : s.avgDoluluk >= 30 ? 'bg-emerald-500' : 'bg-line'
        return (
          <button key={s.ws.id} onClick={() => onSelect(s.ws.id)}
            className={`text-left rounded-lg border p-4 hover:shadow-md transition cursor-pointer ${tones[tone]}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-[11px] text-faint uppercase">{s.ws.code} · {s.ws.city || '—'}</div>
                <div className="font-semibold text-ink mt-0.5 text-base">{s.ws.name}</div>
                <div className="text-[11px] text-faint mt-0.5">{s.ws.type || '—'} · {s.ws.line_count} bant · {s.ws.daily_target} adet/gün</div>
              </div>
              {s.avgDoluluk < 20 && <span className="text-[11px] px-1.5 py-0.5 bg-emerald-600 text-white rounded font-semibold">BOŞ</span>}
              {s.avgDoluluk >= 90 && <span className="text-[11px] px-1.5 py-0.5 bg-red-600 text-white rounded font-semibold">DOLU</span>}
              {s.kritikWo > 0 && <span className="text-[11px] px-1.5 py-0.5 bg-red-600 text-white rounded font-semibold">⚠ {s.kritikWo}</span>}
            </div>

            {/* Genel doluluk */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-muted mb-1">
                <span>Bant Doluluk Ortalaması</span>
                <span className="font-mono font-semibold">%{s.avgDoluluk}</span>
              </div>
              <div className="h-2 bg-canvas rounded-full overflow-hidden">
                <div className={`h-full ${barColor}`} style={{ width: `${s.avgDoluluk}%` }} />
              </div>
            </div>

            {/* Bant başına ufak bar */}
            <div className="mt-2 space-y-1">
              {s.lineDoluluk.slice(0, 5).map(ld => (
                <div key={ld.line.id} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-muted w-20 truncate">{ld.line.code}</span>
                  <div className="flex-1 h-1.5 bg-canvas rounded-full overflow-hidden">
                    <div className={`h-full ${ld.doluluk_pct >= 90 ? 'bg-red-500' : ld.doluluk_pct >= 70 ? 'bg-amber-500' : ld.doluluk_pct >= 30 ? 'bg-emerald-500' : 'bg-line'}`}
                      style={{ width: `${ld.doluluk_pct}%` }} />
                  </div>
                  <span className="font-mono text-faint w-10 text-right">%{ld.doluluk_pct}</span>
                  <span className="font-mono text-faint w-12 text-right">{isgun - ld.dolu_gun}g boş</span>
                </div>
              ))}
              {s.lineDoluluk.length > 5 && <div className="text-[11px] text-faint italic">+{s.lineDoluluk.length - 5} bant daha</div>}
            </div>

            {/* Alt: rakamlar */}
            <div className="mt-3 pt-2 border-t border-line-soft/50 grid grid-cols-3 text-[11px]">
              <div>
                <div className="text-faint">Aktif WO</div>
                <div className="font-mono font-semibold">{s.wos.length}</div>
              </div>
              <div>
                <div className="text-faint">Açık Slot</div>
                <div className="font-mono font-semibold text-emerald-700">{s.acikSlot}g</div>
              </div>
              <div>
                <div className="text-faint">Acil/Kritik</div>
                <div className="font-mono font-semibold text-red-700">{s.kritikWo + s.acilWo}</div>
              </div>
            </div>

            <div className="mt-3 text-xs text-faint text-right">
              <span className="font-medium text-ink">Detay & Takvim →</span>
            </div>
          </button>
        )
      })}
      {summary.length === 0 && (
        <div className="md:col-span-full p-10 text-center text-faint">
          Filtreyle eşleşen atölye yok.
        </div>
      )}
    </div>
  )
}

/* ───────── Atölye Detay Görünümü (mini gantt) ───────── */
function AtolyeDetayView({
  summary, allSummary, days, range, today, onChangeWorkshop, onBack,
}: {
  summary: ReturnType<typeof useWorkshopSummaryDummy> | null
  allSummary: ReturnType<typeof useWorkshopSummaryDummy>[]
  days: Date[]
  range: { start: Date; end: Date }
  today: Date
  onChangeWorkshop: (id: number) => void
  onBack: () => void
}) {
  if (!summary) {
    return (
      <div className="bg-white border border-line-soft rounded-xl p-6">
        <div className="text-sm text-faint">Bir atölye seç:</div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
          {allSummary.map(s => (
            <button key={s.ws.id} onClick={() => onChangeWorkshop(s.ws.id)}
              className="text-left p-2 border border-line-soft rounded hover:bg-canvas text-xs">
              <div className="font-medium">{s.ws.code} {s.ws.name}</div>
              <div className="text-faint">%{s.avgDoluluk} dolu</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const dayColWidth = 28

  return (
    <div className="space-y-3">
      {/* Üst bar: atölye seçimi */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onBack} className="text-xs text-muted hover:text-ink">← Liste</button>
        <select value={summary.ws.id} onChange={e => onChangeWorkshop(Number(e.target.value))}
          className="text-sm px-3 py-1.5 border border-line-soft rounded">
          {allSummary.map(s => <option key={s.ws.id} value={s.ws.id}>{s.ws.code} — {s.ws.name} (%{s.avgDoluluk})</option>)}
        </select>
        <div className="text-xs text-faint">
          {summary.ws.city} · {summary.ws.line_count} bant · {summary.ws.daily_target} adet/gün
        </div>
        <Link href={`/workshop/takvim?wid=${summary.ws.id}`}
          className="ml-auto text-xs px-3 py-1.5 bg-canvas hover:bg-line-soft rounded">
          🔧 Atölye paneline git (düzenleyebilir)
        </Link>
      </div>

      {/* Gantt grid */}
      <div className="bg-white border border-line-soft rounded-xl overflow-x-auto">
        <div className="grid text-xs"
          style={{ gridTemplateColumns: `160px repeat(${days.length}, ${dayColWidth}px)`, minWidth: 160 + days.length * dayColWidth }}>
          {/* Header */}
          <div className="sticky left-0 z-10 bg-canvas border-r border-b border-line font-semibold py-2 px-3 text-ink flex items-center">
            Bant ({summary.lines.length})
          </div>
          {days.map((d, i) => {
            const isToday = dateOnly(d).getTime() === today.getTime()
            const w = isWeekend(d)
            return (
              <div key={i} className={`border-r border-b border-line-soft text-center py-1 ${
                isToday ? 'bg-canvas ring-1 ring-accent' : w ? 'bg-canvas text-faint' : 'bg-white'
              }`}>
                <div className="font-mono font-semibold text-[11px]">{d.getDate()}</div>
                <div className="text-[11px] text-faint">{TR_GUNLER[d.getDay()]}</div>
              </div>
            )
          })}

          {/* Banlar */}
          {summary.lines.map(line => {
            const lwos = summary.wos.filter(o => o.line_id === line.id)
            return (
              <div key={line.id} className="contents">
                <div className="sticky left-0 z-10 bg-white border-r border-b border-line-soft px-3 py-2 flex flex-col justify-center">
                  <div className="text-xs font-semibold text-ink">{line.code}</div>
                  <div className="text-[11px] text-faint truncate">{line.name}</div>
                </div>
                <div className="border-b border-line-soft relative grid"
                  style={{ gridColumn: `2 / span ${days.length}`, gridTemplateColumns: `repeat(${days.length}, ${dayColWidth}px)`, minHeight: 48 }}>
                  {days.map((d, i) => {
                    const isToday = dateOnly(d).getTime() === today.getTime()
                    const w = isWeekend(d)
                    return (
                      <div key={i} className={`border-r border-line-soft ${
                        isToday ? 'bg-canvas/50' : w ? 'bg-canvas' : ''
                      }`} />
                    )
                  })}
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, ${dayColWidth}px)` }}>
                    {lwos.map(o => {
                      const start = parseDate(o.baslangic_tarihi)
                      const end = parseDate(o.bitis_tarihi) || parseDate(o.teslim_tarihi)
                      if (!start || !end) return null
                      const sIdx = days.findIndex(d => dateOnly(d).getTime() >= dateOnly(start).getTime())
                      const eIdx = days.findIndex(d => dateOnly(d).getTime() > dateOnly(end).getTime())
                      const startCol = sIdx === -1 ? days.length + 1 : sIdx + 1
                      const endCol = eIdx === -1 ? days.length + 1 : eIdx + 1
                      if (endCol <= startCol) return null
                      const span = endCol - startCol
                      const color = ONCELIK_RENK[o.oncelik] || '#94a3b8'
                      return (
                        <Link key={o.id} href={`/workshop/is-emri/${o.id}?wid=${summary.ws.id}`}
                          title={`${o.is_emri_no} · ${o.model_adi}\n${o.musteri || ''} · ${o.siparis_miktari} adet\n${o.durum} · ${o.oncelik}`}
                          className="relative my-1 mx-0.5 rounded text-white text-[11px] flex items-center px-1.5 overflow-hidden hover:ring-2 hover:ring-offset-1 hover:ring-line"
                          style={{
                            gridColumnStart: startCol, gridColumnEnd: endCol,
                            backgroundColor: color,
                          }}>
                          {o.ilerleme_pct > 0 && o.ilerleme_pct < 100 && (
                            <div className="absolute inset-y-0 left-0 bg-black/15" style={{ width: `${o.ilerleme_pct}%` }} />
                          )}
                          <div className="relative z-10 truncate font-medium">
                            {span >= 3 ? o.model_adi : o.model_adi.slice(0, 4)}
                            {span >= 6 && <span className="opacity-75 ml-1.5">· {o.siparis_miktari}</span>}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
          {summary.lines.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-faint">
              Bu atölyenin aktif bantı yok.
            </div>
          )}
        </div>
      </div>

      {/* Bant doluluk özeti */}
      <div className="bg-white border border-line-soft rounded-xl p-4">
        <h3 className="text-sm font-semibold text-ink mb-3">Bant Doluluk Detayı</h3>
        <div className="space-y-1.5">
          {summary.lineDoluluk.map(ld => (
            <div key={ld.line.id} className="flex items-center gap-3 text-xs">
              <span className="w-32 font-medium truncate">{ld.line.code} · {ld.line.name}</span>
              <div className="flex-1 h-3 bg-canvas rounded-full overflow-hidden relative">
                <div className={`h-full ${
                  ld.doluluk_pct >= 90 ? 'bg-red-500' :
                  ld.doluluk_pct >= 70 ? 'bg-amber-500' :
                  ld.doluluk_pct >= 30 ? 'bg-emerald-500' : 'bg-line'
                }`} style={{ width: `${ld.doluluk_pct}%` }} />
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-mono font-semibold text-ink">
                  %{ld.doluluk_pct}
                </span>
              </div>
              <span className="w-24 text-right text-faint text-[11px] font-mono">
                {ld.line.daily_target ? `${ld.line.daily_target} adet/gün` : ''}
              </span>
              <span className="w-20 text-right text-emerald-700 text-[11px] font-mono">
                {Math.max(0, /* total work days */ 22 - ld.dolu_gun)}g açık
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ───────── Slot Bulucu Görünümü ───────── */
function SlotBulucuView({
  workshops, allLines, allOrders, onJumpAtolye,
}: {
  workshops: Workshop[]
  allLines: Line[]
  allOrders: WO[]
  onJumpAtolye: (wsId: number) => void
}) {
  const todayISO = new Date().toISOString().slice(0, 10)
  const [criteria, setCriteria] = useState({
    siparis_adedi: 1000,
    teslim_tarihi: addDaysISO(todayISO, 30),
    en_erken_baslangic: todayISO,
    gun_sayisi: 0,                   // 0 = otomatik (adet/daily_target)
    sehir: '',
    sadece_aktif: true,
    max_doluluk_pct: 100,
  })
  const [results, setResults] = useState<SlotResult[] | null>(null)
  const [calculating, setCalculating] = useState(false)

  function compute() {
    setCalculating(true)
    setTimeout(() => {  // UI flush
      try {
        const out = findSlots({ criteria, workshops, allLines, allOrders })
        setResults(out)
      } finally { setCalculating(false) }
    }, 50)
  }

  return (
    <div className="space-y-4">
      {/* Search form */}
      <div className="bg-canvas border border-line rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔍</span>
          <h3 className="font-semibold text-muted">Sipariş için Uygun Slot Ara</h3>
          <span className="text-xs text-muted">— Tüm atölyelerin tüm bantlarında uygun boş slotları bul, skora göre sırala.</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="Sipariş Adedi *">
            <input type="number" className="input" value={criteria.siparis_adedi}
              onChange={e => setCriteria({ ...criteria, siparis_adedi: Number(e.target.value) })} />
          </Field>
          <Field label="En Erken Başlangıç">
            <input type="date" className="input" value={criteria.en_erken_baslangic}
              onChange={e => setCriteria({ ...criteria, en_erken_baslangic: e.target.value })} />
          </Field>
          <Field label="En Geç Teslim *">
            <input type="date" className="input" value={criteria.teslim_tarihi}
              onChange={e => setCriteria({ ...criteria, teslim_tarihi: e.target.value })} />
          </Field>
          <Field label="Gün Sayısı (otomatik = 0)">
            <input type="number" className="input" value={criteria.gun_sayisi}
              onChange={e => setCriteria({ ...criteria, gun_sayisi: Number(e.target.value) })}
              placeholder="adet/günlük_hedef" />
          </Field>
          <Field label="Şehir filtresi (ops.)">
            <input className="input" value={criteria.sehir}
              onChange={e => setCriteria({ ...criteria, sehir: e.target.value })}
              placeholder="İstanbul, Bursa..." />
          </Field>
          <Field label="Maks Bant Doluluk %">
            <input type="number" className="input" value={criteria.max_doluluk_pct}
              onChange={e => setCriteria({ ...criteria, max_doluluk_pct: Number(e.target.value) })} />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={criteria.sadece_aktif}
                onChange={e => setCriteria({ ...criteria, sadece_aktif: e.target.checked })} />
              Sadece aktif atölyeler
            </label>
          </div>
          <div className="flex items-end">
            <button onClick={compute} disabled={calculating}
              className="w-full px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover disabled:opacity-50">
              {calculating ? 'Hesaplanıyor...' : '🔍 Slot Ara'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {results && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink"><b>{results.length}</b> uygun slot bulundu</span>
            <span className="text-xs text-faint">Skora göre sıralı (en iyi üstte)</span>
          </div>

          {results.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-sm text-amber-800">
              ⚠ Verilen kriterlere uygun slot bulunamadı. Şunları dene:
              <ul className="text-left mt-2 inline-block text-xs space-y-0.5">
                <li>• Teslim tarihini ileri al</li>
                <li>• Sipariş adetini düşür</li>
                <li>• Maks doluluk filtresini gevşet (örn. %100)</li>
                <li>• Şehir filtresini kaldır</li>
              </ul>
            </div>
          )}

          <div className="space-y-2">
            {results.slice(0, 20).map((r, i) => (
              <SlotResultCard key={`${r.workshop_id}-${r.line_id}-${r.start}`} rank={i+1} result={r}
                onJumpAtolye={() => onJumpAtolye(r.workshop_id)}
              />
            ))}
            {results.length > 20 && (
              <div className="text-xs text-faint text-center py-2">
                + {results.length - 20} daha düşük skorlu slot var. Filtreleri sıkılaştırarak daralt.
              </div>
            )}
          </div>
        </>
      )}

      {!results && !calculating && (
        <div className="bg-canvas border border-line-soft rounded-xl p-10 text-center text-faint">
          Yukarıdaki formu doldurup <b>🔍 Slot Ara</b>'ya bas.
          <br/>
          Sistem tüm atölyelerin bantlarında uygun ardışık boş slot'ları bulur.
        </div>
      )}
    </div>
  )
}

function SlotResultCard({ rank, result, onJumpAtolye }: { rank: number; result: SlotResult; onJumpAtolye: () => void }) {
  const isBest = rank === 1
  return (
    <div className={`border rounded-lg p-3 ${isBest ? 'border-emerald-400 bg-emerald-50' : 'border-line-soft bg-white'}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-canvas text-ink flex items-center justify-center text-xs font-bold">
          {rank}
        </div>
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 flex-wrap">
            {isBest && <span className="text-[11px] px-1.5 py-0.5 bg-emerald-600 text-white rounded font-bold">EN İYİ</span>}
            <span className="font-semibold text-sm">{result.workshop_code} — {result.workshop_name}</span>
            <span className="text-xs text-faint">{result.workshop_city ? `· ${result.workshop_city}` : ''}</span>
            <span className="ml-auto text-[11px] text-faint font-mono">skor {result.score}</span>
          </div>
          <div className="text-sm mt-1">
            🏭 <b>{result.line_code}</b> — {result.line_name}
            <span className="text-faint"> · {result.daily_target} adet/gün</span>
          </div>
          <div className="text-sm mt-0.5">
            📅 <b>{result.start}</b> → <b>{result.end}</b>
            <span className="text-faint"> · {result.gun_sayisi} gün · teslim öncesi {result.tampon_gun} gün tampon</span>
          </div>
          {result.reasons.length > 0 && (
            <div className="mt-1 text-[11px] text-emerald-700">
              {result.reasons.map((r, j) => <div key={j}>✓ {r}</div>)}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-faint uppercase tracking-wider">Bant Yükü</span>
            <div className="flex-1 h-1.5 bg-canvas rounded-full overflow-hidden max-w-[200px]">
              <div className={`h-full ${result.line_doluluk >= 90 ? 'bg-red-500' : result.line_doluluk >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${result.line_doluluk}%` }} />
            </div>
            <span className="text-[11px] font-mono text-muted">%{result.line_doluluk}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <button onClick={onJumpAtolye}
            className="text-xs px-3 py-1.5 bg-canvas hover:bg-line-soft rounded">
            📊 Takvimi Gör
          </button>
          <Link href={`/workshop/is-emri?wid=${result.workshop_id}`}
            className="text-xs px-3 py-1.5 bg-accent text-white hover:bg-accent-hover rounded text-center">
            ➕ WO Yarat
          </Link>
        </div>
      </div>
    </div>
  )
}

interface SlotResult {
  workshop_id: number; workshop_code: string; workshop_name: string; workshop_city: string | null;
  line_id: number; line_code: string; line_name: string;
  daily_target: number;
  start: string; end: string; gun_sayisi: number;
  tampon_gun: number;     // teslim_tarihine göre
  line_doluluk: number;   // % (mevcut yük)
  score: number;
  reasons: string[];
}

function findSlots({
  criteria, workshops, allLines, allOrders,
}: {
  criteria: { siparis_adedi: number; teslim_tarihi: string; en_erken_baslangic: string; gun_sayisi: number; sehir: string; sadece_aktif: boolean; max_doluluk_pct: number };
  workshops: Workshop[]
  allLines: Line[]
  allOrders: WO[]
}): SlotResult[] {
  const results: SlotResult[] = []

  const teslim = parseDate(criteria.teslim_tarihi)
  const earliest = parseDate(criteria.en_erken_baslangic) || new Date()
  if (!teslim) return []

  for (const ws of workshops) {
    if (criteria.sadece_aktif && !ws.is_active) continue
    if (criteria.sehir && !(ws.city || '').toLowerCase().includes(criteria.sehir.toLowerCase())) continue

    const wsLines = allLines.filter(l => l.workshop_id === ws.id && l.is_active)
    for (const line of wsLines) {
      const dailyTarget = Number(line.daily_target) || 100
      const neededDays = criteria.gun_sayisi > 0
        ? criteria.gun_sayisi
        : Math.max(1, Math.ceil(criteria.siparis_adedi / dailyTarget))

      // Bantın bu zaman penceresinde meşgul olduğu aralıklar
      const winStart = new Date(earliest)
      const winEnd = new Date(teslim)
      const lineWOs = allOrders.filter(o =>
        o.line_id === line.id &&
        o.durum !== 'İptal' && o.durum !== 'Tamamlandi' && o.durum !== 'Sevk Edildi'
      )
      const busy: { s: Date; e: Date }[] = lineWOs.map(o => {
        const s = parseDate(o.baslangic_tarihi) || parseDate(o.teslim_tarihi)
        const e = parseDate(o.bitis_tarihi) || parseDate(o.teslim_tarihi)
        if (!s || !e) return null
        return { s: dateOnly(s), e: dateOnly(e) }
      }).filter((x): x is { s: Date; e: Date } => x !== null)
        .sort((a, b) => a.s.getTime() - b.s.getTime())

      // Doluluk hesabı (pencere genelinde)
      const winDays = Math.max(1, Math.round((winEnd.getTime() - winStart.getTime()) / 86400000) + 1)
      let busyDays = 0
      for (const iv of busy) {
        const a = iv.s < winStart ? winStart : iv.s
        const b = iv.e > winEnd ? winEnd : iv.e
        if (b >= a) busyDays += Math.round((b.getTime() - a.getTime()) / 86400000) + 1
      }
      const lineDoluluk = Math.min(100, Math.round((busyDays / winDays) * 100))
      if (lineDoluluk > criteria.max_doluluk_pct) continue

      // Boş slotları bul (busy'lerin arasında ardışık günler)
      const latestStart = new Date(teslim)
      latestStart.setDate(latestStart.getDate() - (neededDays - 1))

      let cursor = dateOnly(earliest)
      while (cursor <= dateOnly(latestStart)) {
        // cursor'dan başlayan neededDays uzunluğunda slot busy ile çakışıyor mu?
        const slotEnd = addDays(cursor, neededDays - 1)
        let conflict = false
        for (const iv of busy) {
          if (slotEnd < iv.s) break  // busy ileride
          if (cursor > iv.e) continue
          conflict = true; break
        }
        if (!conflict) {
          // Slot bulundu
          const tampon = Math.round((teslim.getTime() - slotEnd.getTime()) / 86400000)
          let score = 60
          const reasons: string[] = []
          if (tampon >= 7) { score += 20; reasons.push(`${tampon} gün tampon kaldı`) }
          else if (tampon >= 3) { score += 10; reasons.push(`${tampon} gün tampon`) }
          else if (tampon >= 0) { reasons.push(`${tampon} gün tampon (sıkışık)`) }

          if (lineDoluluk < 30) { score += 25; reasons.push(`Bant boş (kullanım %${lineDoluluk})`) }
          else if (lineDoluluk < 60) { score += 12; reasons.push(`Bant orta yüklü (%${lineDoluluk})`) }
          else { reasons.push(`Bant yoğun (%${lineDoluluk})`) }

          if (Number(line.daily_target) >= 1.2 * (criteria.siparis_adedi / Math.max(1, neededDays))) {
            score += 10
            reasons.push(`Günlük hedef rahat: ${dailyTarget} adet/gün`)
          }

          results.push({
            workshop_id: ws.id, workshop_code: ws.code, workshop_name: ws.name, workshop_city: ws.city,
            line_id: line.id, line_code: line.code, line_name: line.name,
            daily_target: dailyTarget,
            start: cursor.toISOString().slice(0, 10),
            end: slotEnd.toISOString().slice(0, 10),
            gun_sayisi: neededDays,
            tampon_gun: tampon,
            line_doluluk: lineDoluluk,
            score, reasons,
          })
          // Aynı bant için sadece ilk (en erken) slotu al
          break
        }
        cursor = addDays(cursor, 1)
      }
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results
}

function addDaysISO(s: string, n: number): string {
  const d = new Date(s)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] font-medium text-faint uppercase tracking-wider mb-1">{label}</label>{children}<style jsx>{`:global(.input) { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--color-line); border-radius: 0.5rem; font-size: 0.875rem; outline: none; } :global(.input:focus) { border-color: var(--color-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 18%, transparent); }`}</style></div>
}

// Type helper — TS için (gerçek fonksiyon değil)
type WorkshopSummary = {
  ws: Workshop
  lines: Line[]
  wos: WO[]
  lineDoluluk: { line: Line; dolu_gun: number; doluluk_pct: number }[]
  avgDoluluk: number
  acikSlot: number
  kritikWo: number
  acilWo: number
  acikProblem: number
}
function useWorkshopSummaryDummy(): WorkshopSummary { return null as unknown as WorkshopSummary }

function Stat({ label, value, sub, tone = 'slate' }: { label: string; value: number; sub?: string; tone?: string }) {
  const tones: Record<string, string> = {
    slate: 'bg-white border-line-soft',
    emerald: 'bg-emerald-50 border-emerald-200',
    cyan: 'bg-canvas border-line',
    amber: 'bg-amber-50 border-amber-200',
    red: 'bg-red-50 border-red-200',
  }
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="text-2xl font-bold font-mono mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-faint mt-0.5">{sub}</div>}
    </div>
  )
}
