'use client'

import { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface WO {
  id: number
  is_emri_no: string
  model_adi: string
  musteri: string | null
  stil_kodu: string | null
  siparis_miktari: number
  line_id: number | null
  line_name: string | null
  line_code: string | null
  baslangic_tarihi: string | null
  bitis_tarihi: string | null
  teslim_tarihi: string | null
  durum: string
  oncelik: string
  ilerleme_pct: number
  aciliyet: string
}
interface Line { id: number; code: string; name: string; daily_target?: number }
interface Stage {
  id: number; work_order_id: number; stage_code: string; stage_name: string; stage_renk: string
  line_id: number | null; line_name: string | null
  plan_baslangic: string | null; plan_bitis: string | null
  gercek_baslangic: string | null; gercek_bitis: string | null
  durum: string; ilerleme_pct: number
}

const DURUM_RENK: Record<string, string> = {
  'Taslak':       '#94a3b8',
  'Planlandi':    '#3b82f6',
  'Bekleniyor':   '#f59e0b',
  'Devam':        '#10b981',
  'Duraklatildi': '#f97316',
  'Tamamlandi':   '#059669',
  'İptal':        '#ef4444',
  'Sevk Edildi':  '#a855f7',
}
const ONCELIK_RENK: Record<string, string> = {
  'Kritik': '#dc2626',
  'Yüksek': '#f59e0b',
  'Normal': '#3b82f6',
  'Düşük':  '#94a3b8',
}

const TR_AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
const TR_GUNLER = ['Pzr','Pzt','Sal','Çar','Per','Cum','Cmt']

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function daysOf(start: Date, end: Date) {
  const days: Date[] = []
  const cur = new Date(start)
  while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
  return days
}
function parseDate(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}
function dateOnly(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function diffDays(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000) }
function isWeekend(d: Date) { const w = d.getDay(); return w === 0 || w === 6 }
function fmt(d: Date) { return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}` }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function Wrapper() {
  return <Suspense fallback={<div className="p-6 text-faint">Yükleniyor...</div>}><TakvimPage /></Suspense>
}

interface DragState {
  woId: number
  type: 'move' | 'resize-end'
  startX: number
  startY: number
  origStart: Date          // bar'ın orijinal başlangıç
  origEnd: Date            // bar'ın orijinal bitiş
  origLineId: number | null
  curStart: Date           // sürükleme sırasında güncel başlangıç
  curEnd: Date             // sürükleme sırasında güncel bitiş
  curLineId: number | null
  moved: boolean           // tıklamayla sürüklemeyi ayırt et
}

function TakvimPage() {
  const wid = useSearchParams().get('wid')
  const router = useRouter()
  const [orders, setOrders] = useState<WO[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [allStages, setAllStages] = useState<Stage[]>([])
  const [refDate, setRefDate] = useState(() => new Date())
  const [view, setView] = useState<'ay' | 'hafta' | 'asama'>('ay')
  const [colorMode, setColorMode] = useState<'durum' | 'oncelik'>('oncelik')
  const [filterDurum, setFilterDurum] = useState('')
  const [showWeekends, setShowWeekends] = useState(true)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [savingDrag, setSavingDrag] = useState(false)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const lineRowRefs = useRef<Map<number | null, HTMLDivElement | null>>(new Map())

  const reload = useCallback(async () => {
    if (!wid) return
    const [ordRes, lineRes] = await Promise.all([
      fetch(`/api/pes/work-orders?workshop_id=${wid}`).then(r => r.json()),
      fetch(`/api/pes/workshops/${wid}/lines`).then(r => r.json()),
    ])
    setOrders(ordRes.orders ?? [])
    setLines(lineRes.lines ?? [])

    // Aşama detayları için her WO için ayrı çağrı yapmamak adına: tüm WO id'lerini topla
    // ve bir kerede stage'leri çek (ana endpoint stages dönmediği için tek tek)
    if (view === 'asama' && (ordRes.orders ?? []).length > 0) {
      const stagePromises = (ordRes.orders as WO[]).map(o =>
        fetch(`/api/pes/work-orders/${o.id}`).then(r => r.json()).then(d => d.stages || [])
      )
      const allBatches = await Promise.all(stagePromises)
      setAllStages(allBatches.flat())
    } else {
      setAllStages([])
    }
  }, [wid, view])

  useEffect(() => { reload() }, [reload])

  // Gösterilecek tarih aralığı
  const range = useMemo(() => {
    if (view === 'ay') {
      return { start: startOfMonth(refDate), end: endOfMonth(refDate) }
    } else if (view === 'hafta') {
      const dow = refDate.getDay()  // 0=pazar
      const monStart = new Date(refDate)
      monStart.setDate(refDate.getDate() - ((dow + 6) % 7))  // pazartesi
      const sunEnd = new Date(monStart)
      sunEnd.setDate(monStart.getDate() + 13)  // 2 hafta göster
      return { start: monStart, end: sunEnd }
    }
    // asama view aynı ay aralığı
    return { start: startOfMonth(refDate), end: endOfMonth(refDate) }
  }, [refDate, view])

  const days = useMemo(() => {
    const all = daysOf(range.start, range.end)
    return showWeekends ? all : all.filter(d => !isWeekend(d))
  }, [range, showWeekends])

  // Filter orders that intersect with the current view range
  const visibleOrders = useMemo(() => {
    return orders.filter(o => {
      if (filterDurum && o.durum !== filterDurum) return false
      if (o.durum === 'İptal') return false
      const start = parseDate(o.baslangic_tarihi)
      const end   = parseDate(o.bitis_tarihi) || parseDate(o.teslim_tarihi)
      if (!start && !end) return false
      const s = start || end!
      const e = end || start!
      return e >= range.start && s <= range.end
    })
  }, [orders, filterDurum, range])

  // Drag override: dragged WO'nun curLineId'sine göre grupla
  function effectiveLine(o: WO): number | null {
    if (drag && drag.woId === o.id && drag.moved) return drag.curLineId
    return o.line_id
  }
  function effectiveDates(o: WO): { start: Date | null; end: Date | null } {
    if (drag && drag.woId === o.id && drag.moved) {
      return { start: drag.curStart, end: drag.curEnd }
    }
    return {
      start: parseDate(o.baslangic_tarihi),
      end: parseDate(o.bitis_tarihi) || parseDate(o.teslim_tarihi),
    }
  }

  // Group by line_id (null = atanmamış) — drag override dahil
  const ordersByLine = useMemo(() => {
    const map = new Map<number | null, WO[]>()
    for (const o of visibleOrders) {
      const k = drag && drag.woId === o.id && drag.moved ? drag.curLineId : o.line_id
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(o)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleOrders, drag])

  const stagesByLine = useMemo(() => {
    if (view !== 'asama') return new Map<number | null, (Stage & { wo?: WO })[]>()
    const map = new Map<number | null, (Stage & { wo?: WO })[]>()
    for (const s of allStages) {
      if (!s.plan_baslangic && !s.gercek_baslangic) continue
      const start = parseDate(s.gercek_baslangic) || parseDate(s.plan_baslangic)
      const end   = parseDate(s.gercek_bitis)     || parseDate(s.plan_bitis)
      if (!start || !end) continue
      if (end < range.start || start > range.end) continue
      const wo = orders.find(o => o.id === s.work_order_id)
      const k = s.line_id ?? wo?.line_id ?? null
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push({ ...s, wo })
    }
    return map
  }, [allStages, orders, range, view])

  // Bar pozisyon hesabı
  function getBarPosition(barStart: Date, barEnd: Date): { gridColumnStart: number; gridColumnEnd: number } | null {
    const sIdx = days.findIndex(d => dateOnly(d).getTime() >= dateOnly(barStart).getTime())
    const eIdx = days.findIndex(d => dateOnly(d).getTime() > dateOnly(barEnd).getTime())
    const startCol = sIdx === -1 ? days.length + 1 : sIdx + 2  // +2: 1-bant col, 1-grid offset
    const endCol = eIdx === -1 ? days.length + 2 : eIdx + 2
    if (endCol <= startCol) return null
    if (startCol > days.length + 1) return null
    return { gridColumnStart: Math.max(2, startCol), gridColumnEnd: Math.min(days.length + 2, endCol) }
  }

  // ───────── Drag & Drop ─────────
  async function commitDrag(d: DragState) {
    setSavingDrag(true)
    try {
      await fetch(`/api/pes/work-orders/${d.woId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_id: d.curLineId,
          baslangic_tarihi: toISO(d.curStart),
          bitis_tarihi: toISO(d.curEnd),
        }),
      })
      await reload()
    } finally { setSavingDrag(false) }
  }

  // Drag dinleyici — window seviyesinde kayıtlı
  useEffect(() => {
    if (!drag) return
    /* Daraltılmış kopya: effect yalnız drag varken kurulur ve dep dizisinde
       drag olduğu için her değişimde yeniden kurulur — yani closure boyunca
       sabit ve non-null. TypeScript state değişkeninde bu daralmayı closure'a
       taşıyamıyor; `drag!` yazmak yerine sabiti kullanıyoruz. */
    const d = drag
    const colWidth = view === 'ay' ? 32 : view === 'hafta' ? 60 : 32

    function onMove(e: PointerEvent) {
      if (!drag) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      const moved = drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4
      const dayDelta = Math.round(dx / colWidth)

      let newStart = drag.origStart
      let newEnd = drag.origEnd
      let newLineId = drag.origLineId

      if (drag.type === 'move') {
        newStart = addDays(drag.origStart, dayDelta)
        newEnd   = addDays(drag.origEnd, dayDelta)
        // Hangi line üzerinde olduğumuzu cursor Y'sine göre belirle
        for (const [lineId, ref] of lineRowRefs.current.entries()) {
          if (!ref) continue
          const rect = ref.getBoundingClientRect()
          if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
            newLineId = lineId
            break
          }
        }
      } else if (drag.type === 'resize-end') {
        newEnd = addDays(drag.origEnd, dayDelta)
        if (newEnd < drag.origStart) newEnd = drag.origStart
      }

      setDrag(prev => prev ? { ...prev, curStart: newStart, curEnd: newEnd, curLineId: newLineId, moved } : null)
    }
    function onUp() {
      if (d.moved) {
        const changed =
          d.curStart.getTime() !== d.origStart.getTime() ||
          d.curEnd.getTime()   !== d.origEnd.getTime()   ||
          d.curLineId          !== d.origLineId
        if (changed) commitDrag(d)
      }
      setDrag(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, view])

  function startDrag(
    e: React.PointerEvent,
    woId: number,
    type: 'move' | 'resize-end',
    barStart: Date,
    barEnd: Date,
    lineId: number | null,
  ) {
    if (view === 'asama') return  // aşama view'da drag desteklenmiyor (dolaylı veri)
    e.preventDefault()
    e.stopPropagation()
    setDrag({
      woId, type,
      startX: e.clientX, startY: e.clientY,
      origStart: barStart, origEnd: barEnd, origLineId: lineId,
      curStart: barStart, curEnd: barEnd, curLineId: lineId,
      moved: false,
    })
  }

  function shiftRange(delta: number) {
    const d = new Date(refDate)
    if (view === 'ay' || view === 'asama') d.setMonth(d.getMonth() + delta)
    else d.setDate(d.getDate() + delta * 7)
    setRefDate(d)
  }

  // Atanmamış olarak göster (line_id = null)
  const unassignedRow = ordersByLine.get(null) || []

  // Line column widths
  const dayColWidth = view === 'ay' ? 32 : view === 'hafta' ? 60 : 32

  if (!wid) {
    return <div className="p-6 text-faint">Lütfen sol menüden bir atölye seçin.</div>
  }

  const today = dateOnly(new Date())

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Bant Takvimi</h1>
          <p className="text-sm text-faint mt-1">
            Ay/hafta görünümü — bant doluluk + WO planı. Bar üzerine tıkla → iş emri detayına git.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-line-soft rounded-xl p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => shiftRange(-1)} className="px-2 py-1.5 text-sm border border-line-soft rounded hover:bg-canvas">‹</button>
          <button onClick={() => setRefDate(new Date())} className="px-3 py-1.5 text-sm border border-line-soft rounded hover:bg-canvas">Bugün</button>
          <button onClick={() => shiftRange(+1)} className="px-2 py-1.5 text-sm border border-line-soft rounded hover:bg-canvas">›</button>
        </div>
        <span className="text-sm font-semibold text-ink px-2">
          {view === 'hafta'
            ? `${fmt(range.start)} – ${fmt(range.end)} ${range.end.getFullYear()}`
            : `${TR_AYLAR[refDate.getMonth()]} ${refDate.getFullYear()}`}
        </span>

        <div className="h-6 w-px bg-line-soft mx-1" />

        <div className="flex items-center gap-1 text-sm">
          {(['ay','hafta','asama'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded transition ${view === v ? 'bg-accent text-white' : 'border border-line-soft hover:bg-canvas'}`}>
              {v === 'ay' ? 'Ay' : v === 'hafta' ? 'Hafta' : 'Aşama Detay'}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-line-soft mx-1" />

        <select value={colorMode} onChange={e => setColorMode(e.target.value as 'durum' | 'oncelik')} className="px-2 py-1.5 text-sm border border-line-soft rounded">
          <option value="oncelik">Renk: Önceliğe göre</option>
          <option value="durum">Renk: Duruma göre</option>
        </select>
        <select value={filterDurum} onChange={e => setFilterDurum(e.target.value)} className="px-2 py-1.5 text-sm border border-line-soft rounded">
          <option value="">Tüm Durum</option>
          {Object.keys(DURUM_RENK).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-muted ml-2">
          <input type="checkbox" checked={showWeekends} onChange={e => setShowWeekends(e.target.checked)} />
          Hafta sonu
        </label>

        <span className="ml-auto text-xs text-faint">{visibleOrders.length} WO görünür</span>
        {savingDrag && <span className="text-xs text-muted font-medium animate-pulse">⟳ Kaydediliyor...</span>}
      </div>

      {/* Drag ipucu */}
      <div className="text-[11px] text-faint px-1 flex items-center gap-3 flex-wrap">
        <span>💡 <b>Sürükle</b>: bar'ı tut → tarih kaydır veya banta taşı.</span>
        <span><b>Sağ kenar</b>: tutarak bitiş tarihini uzat/kısalt.</span>
        <span><b>Tıkla</b> (sürüklemeden): WO detay sayfasına git.</span>
        <span><b>Esc</b>: sürüklemeyi iptal et.</span>
      </div>

      {/* Lejant */}
      <div className="text-[11px] text-faint flex items-center gap-3 flex-wrap px-1">
        <span><b className="text-ink">Renk lejantı:</b></span>
        {Object.entries(colorMode === 'durum' ? DURUM_RENK : ONCELIK_RENK).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: v }} />
            <span>{k}</span>
          </span>
        ))}
      </div>

      {/* Gantt grid */}
      <div className="bg-white border border-line-soft rounded-xl overflow-x-auto">
        <div
          className="grid text-xs"
          style={{
            gridTemplateColumns: `160px repeat(${days.length}, ${dayColWidth}px)`,
            minWidth: 160 + days.length * dayColWidth,
          }}
        >
          {/* Header row: gun başlıkları */}
          <div className="sticky left-0 z-10 bg-canvas border-r border-b border-line font-semibold py-2 px-3 text-ink flex items-center">
            Bant ({lines.length})
          </div>
          {days.map((d, i) => {
            const isToday = dateOnly(d).getTime() === today.getTime()
            const w = isWeekend(d)
            return (
              <div key={i}
                className={`border-r border-b border-line-soft text-center py-1 ${
                  isToday ? 'bg-canvas ring-1 ring-accent' : w ? 'bg-canvas text-faint' : 'bg-white'
                }`}>
                <div className="font-mono font-semibold text-[11px]">{d.getDate()}</div>
                <div className="text-[11px] text-faint">{TR_GUNLER[d.getDay()]}</div>
              </div>
            )
          })}

          {/* Atanmamış (line_id = null) */}
          {unassignedRow.length > 0 && (
            <>
              <div className="sticky left-0 z-10 bg-amber-50 border-r border-b border-line-soft px-3 py-2 flex flex-col">
                <span className="font-semibold text-amber-800 text-xs">⚠ Atanmamış</span>
                <span className="text-[11px] text-amber-600">{unassignedRow.length} WO</span>
              </div>
              <div className="border-b border-line-soft bg-amber-50/30 relative" style={{ gridColumn: `2 / span ${days.length}`, minHeight: 50 }}>
                <div className="px-2 py-1 flex flex-wrap gap-1">
                  {unassignedRow.map(o => (
                    <Link key={o.id} href={`/workshop/is-emri/${o.id}?wid=${wid}`}
                      className="text-[11px] px-2 py-0.5 bg-white border border-amber-300 rounded hover:bg-amber-100 truncate max-w-[120px]"
                      title={`${o.is_emri_no}: ${o.model_adi}`}>
                      {o.model_adi}
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Banlar */}
          {lines.map(line => {
            const wos = ordersByLine.get(line.id) || []
            const stages = stagesByLine.get(line.id) || []
            const items: { id: string; woId?: number; barStart: Date; barEnd: Date; label: string; sub: string; color: string; href: string; tooltip: string; ilerleme: number; isActual?: boolean; isDragging?: boolean }[] = []

            if (view === 'asama') {
              for (const s of stages) {
                const start = parseDate(s.gercek_baslangic) || parseDate(s.plan_baslangic)!
                const end   = parseDate(s.gercek_bitis)     || parseDate(s.plan_bitis)!
                items.push({
                  id: `s${s.id}`,
                  barStart: start, barEnd: end,
                  label: `${s.stage_name}`,
                  sub: s.wo?.is_emri_no || '',
                  color: s.stage_renk,
                  href: `/workshop/is-emri/${s.work_order_id}?wid=${wid}`,
                  tooltip: `${s.wo?.model_adi || ''} · ${s.stage_name} · ${s.durum} · %${s.ilerleme_pct}`,
                  ilerleme: s.ilerleme_pct,
                  isActual: !!s.gercek_baslangic,
                })
              }
            } else {
              for (const o of wos) {
                const eff = effectiveDates(o)
                if (!eff.start || !eff.end) continue
                const isDragging = drag?.woId === o.id && drag.moved
                items.push({
                  id: `wo${o.id}`,
                  woId: o.id,
                  barStart: eff.start, barEnd: eff.end,
                  label: o.model_adi,
                  sub: `${o.is_emri_no} · ${o.siparis_miktari}`,
                  color: colorMode === 'durum' ? (DURUM_RENK[o.durum] || '#94a3b8') : (ONCELIK_RENK[o.oncelik] || '#94a3b8'),
                  href: `/workshop/is-emri/${o.id}?wid=${wid}`,
                  tooltip: `${o.is_emri_no} · ${o.model_adi}\n${o.musteri || ''} · ${o.siparis_miktari} adet\n${o.durum} · ${o.oncelik}\n%${o.ilerleme_pct} ilerleme`,
                  ilerleme: o.ilerleme_pct,
                  isDragging,
                })
              }
            }

            return (
              <div key={line.id} className="contents">
                <div className="sticky left-0 z-10 bg-white border-r border-b border-line-soft px-3 py-2 flex flex-col justify-center">
                  <div className="text-xs font-semibold text-ink">{line.code}</div>
                  <div className="text-[11px] text-faint truncate">{line.name}</div>
                </div>
                <div
                  ref={el => { lineRowRefs.current.set(line.id, el) }}
                  className="border-b border-line-soft relative grid"
                  style={{ gridColumn: `2 / span ${days.length}`, gridTemplateColumns: `repeat(${days.length}, ${dayColWidth}px)`, minHeight: 50 }}>
                  {/* arka plan haftasonu sütunları */}
                  {days.map((d, i) => {
                    const isToday = dateOnly(d).getTime() === today.getTime()
                    const w = isWeekend(d)
                    return (
                      <div key={i} className={`border-r border-line-soft ${
                        isToday ? 'bg-canvas/50' : w ? 'bg-canvas' : ''
                      }`} />
                    )
                  })}
                  {/* WO bar'ları */}
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, ${dayColWidth}px)` }}>
                    {items.map(it => {
                      const pos = getBarPosition(it.barStart, it.barEnd)
                      if (!pos) return null
                      const span = pos.gridColumnEnd - pos.gridColumnStart
                      const isDraggable = view !== 'asama' && it.woId
                      return (
                        <div key={it.id}
                          title={it.tooltip}
                          className={`relative my-1.5 mx-0.5 rounded text-white text-[11px] flex items-center px-1.5 overflow-hidden shadow-sm ${
                            isDraggable ? 'cursor-grab' : 'cursor-pointer'
                          } ${it.isDragging ? 'ring-2 ring-offset-1 ring-accent cursor-grabbing z-20' : 'hover:ring-2 hover:ring-offset-1 hover:ring-line'} transition-shadow`}
                          style={{
                            gridColumnStart: pos.gridColumnStart - 1,
                            gridColumnEnd: pos.gridColumnEnd - 1,
                            backgroundColor: it.color,
                            opacity: it.isActual === false ? 0.65 : (it.isDragging ? 0.85 : 1),
                          }}
                          onPointerDown={isDraggable ? e => {
                            // Resize handle (sağ kenar) ise resize-end başlat
                            const target = e.target as HTMLElement
                            if (target.dataset.handle === 'resize-end') {
                              startDrag(e, it.woId!, 'resize-end', it.barStart, it.barEnd, line.id)
                            } else {
                              startDrag(e, it.woId!, 'move', it.barStart, it.barEnd, line.id)
                            }
                          } : undefined}
                          onClick={(e) => {
                            // Sürüklenmediyse tıklama → detay sayfası
                            if (drag && drag.moved) { e.preventDefault(); return }
                            router.push(it.href)
                          }}>
                          {/* İlerleme overlay */}
                          {it.ilerleme > 0 && it.ilerleme < 100 && (
                            <div className="absolute inset-y-0 left-0 bg-black/15" style={{ width: `${it.ilerleme}%` }} />
                          )}
                          <div className="relative z-10 truncate font-medium leading-tight">
                            {span >= 3 ? it.label : it.label.slice(0, 4)}
                            {span >= 6 && it.sub && <span className="opacity-75 ml-1.5">· {it.sub}</span>}
                          </div>
                          {/* Sağ kenar resize handle */}
                          {isDraggable && span >= 2 && (
                            <div
                              data-handle="resize-end"
                              className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30"
                              title="Bitiş tarihini değiştir"
                            />
                          )}
                          {/* Drag preview tarih etiketi */}
                          {it.isDragging && (
                            <div className="absolute -top-6 left-0 bg-canvas text-white text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap z-30 shadow">
                              {fmt(it.barStart)} → {fmt(it.barEnd)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Bant yoksa */}
          {lines.length === 0 && (
            <div className="col-span-full py-10 text-center text-sm text-faint">
              Atölye için bant tanımlı değil. Önce <b>Profil</b> sayfasından bant ekleyin.
            </div>
          )}
        </div>
      </div>

      {/* Bant doluluk özeti */}
      <div className="bg-white border border-line-soft rounded-xl p-4">
        <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
          📊 Bant Doluluk Özeti ({TR_AYLAR[refDate.getMonth()]} {refDate.getFullYear()})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {lines.map(line => {
            const wos = ordersByLine.get(line.id) || []
            const totalDays = days.filter(d => !isWeekend(d)).length
            // Bantta üretim olan iş günü sayısı (kabaca)
            const dolugun = new Set<string>()
            for (const o of wos) {
              const start = parseDate(o.baslangic_tarihi)
              const end = parseDate(o.bitis_tarihi) || parseDate(o.teslim_tarihi)
              if (!start || !end) continue
              const s = start < range.start ? range.start : start
              const e = end > range.end ? range.end : end
              const cur = new Date(s)
              while (cur <= e) {
                if (!isWeekend(cur)) dolugun.add(cur.toISOString().slice(0,10))
                cur.setDate(cur.getDate() + 1)
              }
            }
            const dolulukPct = totalDays > 0 ? Math.round((dolugun.size / totalDays) * 100) : 0
            const barColor = dolulukPct >= 90 ? 'bg-red-500' : dolulukPct >= 70 ? 'bg-emerald-500' : dolulukPct >= 40 ? 'bg-amber-500' : 'bg-line'
            return (
              <div key={line.id} className="flex items-center gap-3 text-xs">
                <span className="w-32 truncate font-medium">{line.code} · {line.name}</span>
                <div className="flex-1 h-4 bg-canvas rounded-full overflow-hidden relative">
                  <div className={`h-full ${barColor}`} style={{ width: `${dolulukPct}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-mono font-semibold text-ink">
                    %{dolulukPct} · {dolugun.size}/{totalDays} iş günü
                  </span>
                </div>
                <span className="w-16 text-right text-faint">{wos.length} WO</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
