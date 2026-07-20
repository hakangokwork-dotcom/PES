'use client'

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'

/* ───────── Types ───────── */
interface Line { id: number; name: string; operator_count: number; daily_target: number }
interface Measurement {
  id: number; line_id: number; line_name: string; model_code: string
  operation_name: string; cycle_time_sn: number; operator_count: number
  measured_date: string
}
interface WipRec {
  id: number; line_id: number; line_name: string; model_code: string
  operation_name: string; wip_qty: number; recorded_date: string; notes: string
}

/* ───────── Wrapper with Suspense ───────── */
export default function VsmPageWrapper() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Yükleniyor...</div>}>
      <VsmPageContent />
    </Suspense>
  )
}

/* ───────── Component ───────── */
function VsmPageContent() {
  const searchParams = useSearchParams()
  const wid = searchParams.get('wid')
  const widQ = wid ? `workshop_id=${wid}` : ''

  /* State */
  const [lines, setLines] = useState<Line[]>([])
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [wipRecords, setWipRecords] = useState<WipRec[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'yamazumi' | 'wip' | 'olcum'>('yamazumi')

  /* VSM Parameters */
  const [shiftMin, setShiftMin] = useState(540) // 9 saat
  const [breakMin, setBreakMin] = useState(60)
  const [dailyDemand, setDailyDemand] = useState(0)
  const [measureDate, setMeasureDate] = useState(new Date().toISOString().split('T')[0])

  /* New measurement form */
  const [newMeas, setNewMeas] = useState({
    operation_name: '', cycle_time_sn: 0, operator_count: 1, model_code: ''
  })

  /* New WIP form */
  const [newWip, setNewWip] = useState({
    operation_name: '', wip_qty: 0, model_code: '', notes: ''
  })

  const [tablesReady, setTablesReady] = useState(true)

  /* ───────── Fetch ───────── */
  const fetchLines = useCallback(async () => {
    if (!wid) return
    try {
      const r = await fetch(`/api/pes/workshops/${wid}/lines`)
      const d = await r.json()
      const ls: Line[] = (d.lines ?? []).map((l: Record<string, unknown>) => ({
        id: l.id as number,
        name: (l.name ?? l.code ?? '') as string,
        operator_count: (l.operator_count ?? 0) as number,
        daily_target: (l.daily_target ?? 300) as number,
      }))
      setLines(ls)
      if (ls.length > 0 && !selectedLine) {
        setSelectedLine(ls[0].id)
        setDailyDemand(ls[0].daily_target || 300)
      }
    } catch { /* ignore */ }
  }, [wid, selectedLine])

  const fetchMeasurements = useCallback(async () => {
    if (!wid || !selectedLine) return
    setLoading(true)
    try {
      const r = await fetch(`/api/pes/measurements?${widQ}&line_id=${selectedLine}&date=${measureDate}`)
      if (!r.ok) { setTablesReady(false); setMeasurements([]); setLoading(false); return }
      const d = await r.json()
      if (d.error) { setTablesReady(false); setMeasurements([]); setLoading(false); return }
      setTablesReady(true)
      setMeasurements(d.measurements ?? [])
    } catch { setTablesReady(false); setMeasurements([]) }
    setLoading(false)
  }, [wid, widQ, selectedLine, measureDate])

  const fetchWip = useCallback(async () => {
    if (!wid) return
    try {
      const r = await fetch(`/api/pes/wip?${widQ}&date=${measureDate}`)
      if (!r.ok) { setWipRecords([]); return }
      const d = await r.json()
      if (d.error) { setWipRecords([]); return }
      setWipRecords(d.records ?? [])
    } catch { setWipRecords([]) }
  }, [wid, widQ, measureDate])

  useEffect(() => { fetchLines() }, [fetchLines])
  useEffect(() => { fetchMeasurements() }, [fetchMeasurements])
  useEffect(() => { fetchWip() }, [fetchWip])

  /* ───────── Calculations ───────── */
  const netAvailableSec = (shiftMin - breakMin) * 60
  const taktTime = dailyDemand > 0 ? netAvailableSec / dailyDemand : 0

  const lineMeasurements = useMemo(() =>
    measurements.filter(m => m.line_id === selectedLine),
    [measurements, selectedLine]
  )

  // Per-operation effective cycle time = CT / operator_count
  const opsWithEffCT = useMemo(() =>
    lineMeasurements.map(m => ({
      ...m,
      effectiveCT: Number(m.cycle_time_sn) / Number(m.operator_count),
    })),
    [lineMeasurements]
  )

  const totalCycleSec = useMemo(() => opsWithEffCT.reduce((s, o) => s + o.effectiveCT, 0), [opsWithEffCT])
  const totalSmvSec = useMemo(() => lineMeasurements.reduce((s, m) => s + Number(m.cycle_time_sn), 0), [lineMeasurements])
  const totalOperators = useMemo(() => lineMeasurements.reduce((s, m) => s + Number(m.operator_count), 0), [lineMeasurements])
  const maxCT = useMemo(() => opsWithEffCT.length > 0 ? Math.max(...opsWithEffCT.map(o => o.effectiveCT)) : 0, [opsWithEffCT])
  const bottleneckOp = useMemo(() => opsWithEffCT.find(o => o.effectiveCT === maxCT), [opsWithEffCT, maxCT])

  // Hat Dengeleme Verimliliği
  const balancingEff = totalOperators > 0 && maxCT > 0
    ? (totalCycleSec / (totalOperators * maxCT)) * 100 : 0
  const balancingLoss = 100 - balancingEff

  // Gerekli Operatör
  const requiredOps = taktTime > 0 ? Math.ceil(totalSmvSec / taktTime) : 0

  // PCE — VA time = total process time, LT = VA + WIP wait times
  const lineWip = wipRecords.filter(w => w.line_id === selectedLine)
  const totalWipQty = lineWip.reduce((s, w) => s + w.wip_qty, 0)
  const wipWaitSec = totalWipQty * taktTime
  const leadTimeSec = totalSmvSec + wipWaitSec
  const pce = leadTimeSec > 0 ? (totalSmvSec / leadTimeSec) * 100 : 0

  // Günlük kapasite (bottleneck bazlı)
  const dailyCapacity = maxCT > 0 ? Math.floor(netAvailableSec / maxCT) : 0

  /* ───────── Actions ───────── */
  const addMeasurement = async () => {
    if (!newMeas.operation_name.trim() || newMeas.cycle_time_sn <= 0 || !wid) return
    setSaving(true)
    try {
      await fetch('/api/pes/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newMeas, workshop_id: Number(wid), line_id: selectedLine, measured_date: measureDate
        }),
      })
      setNewMeas({ operation_name: '', cycle_time_sn: 0, operator_count: 1, model_code: '' })
      fetchMeasurements()
    } catch { /* ignore */ }
    setSaving(false)
  }

  const deleteMeasurement = async (id: number) => {
    await fetch(`/api/pes/measurements/${id}`, { method: 'DELETE' })
    fetchMeasurements()
  }

  const addWip = async () => {
    if (!newWip.operation_name.trim() || !wid) return
    setSaving(true)
    try {
      await fetch('/api/pes/wip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newWip, workshop_id: Number(wid), line_id: selectedLine, recorded_date: measureDate
        }),
      })
      setNewWip({ operation_name: '', wip_qty: 0, model_code: '', notes: '' })
      fetchWip()
    } catch { /* ignore */ }
    setSaving(false)
  }

  const deleteWip = async (id: number) => {
    await fetch(`/api/pes/wip/${id}`, { method: 'DELETE' })
    fetchWip()
  }

  /* ───────── Helpers ───────── */
  const fmt = (n: number, d = 1) => n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })

  const yamazumiColor = (ct: number) => {
    if (taktTime === 0) return 'bg-gray-300'
    if (ct > taktTime) return 'bg-red-500'
    if (ct >= taktTime * 0.8) return 'bg-amber-400'
    return 'bg-emerald-500'
  }

  const pceColor = pce >= 25 ? 'text-emerald-700' : pce >= 15 ? 'text-blue-700' : pce >= 5 ? 'text-amber-700' : 'text-red-700'
  const pceLabel = pce >= 25 ? 'Mükemmel' : pce >= 15 ? 'İyi' : pce >= 5 ? 'Ortalama' : 'Kritik'
  const beColor = balancingEff >= 85 ? 'text-emerald-700' : balancingEff >= 70 ? 'text-blue-700' : 'text-red-700'

  if (!wid) return <div className="p-6 text-gray-400">Atölye seçin</div>

  /* ───────── Render ───────── */
  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">VSM Analiz</h1>
        <p className="text-sm text-gray-500 mt-1">Takt Time, Yamazumi, Hat Dengeleme, PCE ve WIP takibi</p>
      </div>

      {!tablesReady && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-800">
          Veritabanı tabloları henüz oluşturulmamış. Supabase SQL Editor&apos;da <strong>008_vsm_wip.sql</strong> dosyasını çalıştırın.
          Tablolar olmadan parametreler ve hesaplamalar görüntülenebilir, ancak veri kaydedilemez.
        </div>
      )}

      {/* Parametre Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Bant</label>
            <select value={selectedLine ?? ''} onChange={e => {
              setSelectedLine(Number(e.target.value))
              const line = lines.find(l => l.id === Number(e.target.value))
              if (line) setDailyDemand(line.daily_target || dailyDemand)
            }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tarih</label>
            <input type="date" value={measureDate} onChange={e => setMeasureDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Vardiya (dk)</label>
            <input type="number" value={shiftMin} onChange={e => setShiftMin(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mola (dk)</label>
            <input type="number" value={breakMin} onChange={e => setBreakMin(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Günlük Talep (adet)</label>
            <input type="number" value={dailyDemand || ''} onChange={e => setDailyDemand(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Net Süre</label>
            <div className="text-sm font-semibold text-gray-900 mt-2">
              {Math.round(netAvailableSec / 60)} dk ({Math.round(netAvailableSec)} sn)
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs text-blue-600 mb-1">Takt Time</div>
          <div className="text-2xl font-bold text-blue-800">{fmt(taktTime)} sn</div>
          <div className="text-xs text-blue-500">{dailyDemand} adet/gün</div>
        </div>
        <div className={`bg-white border rounded-xl p-4 ${maxCT > taktTime && taktTime > 0 ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
          <div className="text-xs text-gray-500 mb-1">Bottleneck</div>
          <div className={`text-2xl font-bold ${maxCT > taktTime && taktTime > 0 ? 'text-red-700' : 'text-gray-900'}`}>{fmt(maxCT)} sn</div>
          <div className="text-xs text-gray-500 truncate">{bottleneckOp?.operation_name ?? '—'}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className={`text-xs mb-1 ${beColor}`}>Hat Dengeleme</div>
          <div className={`text-2xl font-bold ${beColor}`}>%{fmt(balancingEff)}</div>
          <div className="text-xs text-gray-500">Kayıp: %{fmt(balancingLoss)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className={`text-xs mb-1 ${pceColor}`}>PCE (Değer Katma)</div>
          <div className={`text-2xl font-bold ${pceColor}`}>%{fmt(pce)}</div>
          <div className={`text-xs ${pceColor}`}>{pceLabel}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Kapasite / Operatör</div>
          <div className="text-lg font-bold text-gray-900">{dailyCapacity} ad/gün</div>
          <div className="text-xs text-gray-500">Gerekli: {requiredOps} op · Mevcut: {fmt(totalOperators, 0)}</div>
        </div>
      </div>

      {/* Second row KPIs */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Toplam Süre</div>
          <div className="text-sm font-bold">{fmt(totalSmvSec)} sn ({fmt(totalSmvSec / 60)} dk)</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Operasyon Sayısı</div>
          <div className="text-sm font-bold">{lineMeasurements.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Toplam Kişi</div>
          <div className="text-sm font-bold">{fmt(totalOperators, 1)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">WIP Toplam</div>
          <div className="text-sm font-bold">{totalWipQty} adet</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">WIP Bekleme</div>
          <div className="text-sm font-bold">{fmt(wipWaitSec / 60)} dk</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500">Lead Time</div>
          <div className="text-sm font-bold">{fmt(leadTimeSec / 60)} dk</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['yamazumi', 'olcum', 'wip'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'yamazumi' ? 'Yamazumi Chart' : t === 'olcum' ? 'CT Ölçüm' : 'WIP Takip'}
          </button>
        ))}
      </div>

      {/* ─── Tab: Yamazumi ─── */}
      {tab === 'yamazumi' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Yamazumi Chart — Operasyon Yük Dağılımı
          </h3>
          {opsWithEffCT.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">CT ölçümü girin, Yamazumi chart oluşturulsun</p>
          ) : (
            <div className="space-y-4">
              {/* Chart */}
              <div className="relative">
                {/* Takt Time line */}
                {taktTime > 0 && maxCT > 0 && (
                  <div className="absolute left-0 right-0 border-t-2 border-dashed border-blue-500 z-10"
                    style={{ bottom: `${Math.min((taktTime / (maxCT * 1.2)) * 100, 95)}%` }}>
                    <span className="absolute -top-5 right-0 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                      TT: {fmt(taktTime)} sn
                    </span>
                  </div>
                )}
                <div className="flex items-end gap-1 h-64">
                  {opsWithEffCT.map((op, i) => {
                    const maxH = maxCT * 1.2
                    const pct = maxH > 0 ? (op.effectiveCT / maxH) * 100 : 0
                    return (
                      <div key={op.id ?? i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                        {/* Tooltip */}
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">
                          {op.operation_name}: {fmt(Number(op.cycle_time_sn))} sn / {fmt(Number(op.operator_count))} kişi = {fmt(op.effectiveCT)} sn
                        </div>
                        {/* Bar */}
                        <div
                          className={`w-full rounded-t-md transition-all ${yamazumiColor(op.effectiveCT)} min-h-[4px]`}
                          style={{ height: `${Math.max(pct, 2)}%` }}
                        />
                        {/* Label */}
                        <div className="text-[9px] text-gray-500 mt-1 text-center truncate w-full px-0.5">
                          {op.operation_name.length > 8 ? op.operation_name.slice(0, 8) + '..' : op.operation_name}
                        </div>
                        <div className="text-[9px] font-mono text-gray-700">{fmt(op.effectiveCT)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Legend */}
              <div className="flex gap-4 text-xs text-gray-600 mt-2">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> CT {'>'} Takt Time (Darboğaz)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400" /> %80-100 Takt Time (Risk)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> Normal</span>
                <span className="flex items-center gap-1"><span className="w-6 border-t-2 border-dashed border-blue-500" /> Takt Time</span>
              </div>

              {/* Detail Table */}
              <table className="w-full text-sm mt-4">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left px-3 py-2">#</th>
                    <th className="text-left px-3 py-2">Operasyon</th>
                    <th className="text-right px-3 py-2">CT (sn)</th>
                    <th className="text-right px-3 py-2">Kişi</th>
                    <th className="text-right px-3 py-2">Efektif CT</th>
                    <th className="text-right px-3 py-2">vs Takt</th>
                    <th className="text-center px-3 py-2">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {opsWithEffCT.map((op, i) => {
                    const diff = taktTime > 0 ? op.effectiveCT - taktTime : 0
                    const isBottleneck = op.id === bottleneckOp?.id
                    return (
                      <tr key={op.id} className={`border-b border-gray-50 ${isBottleneck ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-900 font-medium">
                          {op.operation_name}
                          {isBottleneck && <span className="ml-1 text-[10px] bg-red-100 text-red-700 rounded px-1 py-0.5">DARBOĞAZ</span>}
                        </td>
                        <td className="text-right px-3 py-2 font-mono">{fmt(Number(op.cycle_time_sn))}</td>
                        <td className="text-right px-3 py-2 font-mono">{fmt(Number(op.operator_count))}</td>
                        <td className="text-right px-3 py-2 font-mono font-semibold">{fmt(op.effectiveCT)}</td>
                        <td className={`text-right px-3 py-2 font-mono ${diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {taktTime > 0 ? `${diff > 0 ? '+' : ''}${fmt(diff)}` : '—'}
                        </td>
                        <td className="text-center px-3 py-2">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${yamazumiColor(op.effectiveCT)}`} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: CT Ölçüm ─── */}
      {tab === 'olcum' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Cycle Time Ölçüm — Zaman Etüdü</h3>
          </div>
          {/* Add form */}
          <div className="p-4 bg-emerald-50 border-b border-emerald-100">
            <div className="grid grid-cols-5 gap-2">
              <input value={newMeas.operation_name} onChange={e => setNewMeas(p => ({ ...p, operation_name: e.target.value }))}
                placeholder="Operasyon adı" className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <input type="number" step="0.01" value={newMeas.cycle_time_sn || ''} onChange={e => setNewMeas(p => ({ ...p, cycle_time_sn: Number(e.target.value) }))}
                placeholder="CT (sn)" className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <input type="number" step="0.01" value={newMeas.operator_count || ''} onChange={e => setNewMeas(p => ({ ...p, operator_count: Number(e.target.value) }))}
                placeholder="Kişi" className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <input value={newMeas.model_code} onChange={e => setNewMeas(p => ({ ...p, model_code: e.target.value }))}
                placeholder="Model kodu" className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <button onClick={addMeasurement} disabled={saving || !newMeas.operation_name || newMeas.cycle_time_sn <= 0}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                + Ekle
              </button>
            </div>
          </div>
          {/* Table */}
          {loading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Yükleniyor...</div>
          ) : lineMeasurements.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">Bu bant ve tarih için ölçüm yok</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left px-4 py-2">Operasyon</th>
                  <th className="text-left px-4 py-2">Model</th>
                  <th className="text-right px-4 py-2">CT (sn)</th>
                  <th className="text-right px-4 py-2">Kişi</th>
                  <th className="text-right px-4 py-2">Efektif CT</th>
                  <th className="text-right px-4 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {lineMeasurements.map(m => (
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-900">{m.operation_name}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{m.model_code || '—'}</td>
                    <td className="text-right px-4 py-2 font-mono">{fmt(Number(m.cycle_time_sn))}</td>
                    <td className="text-right px-4 py-2 font-mono">{fmt(Number(m.operator_count))}</td>
                    <td className="text-right px-4 py-2 font-mono font-semibold">
                      {fmt(Number(m.cycle_time_sn) / Number(m.operator_count))}
                    </td>
                    <td className="text-right px-4 py-2">
                      <button onClick={() => deleteMeasurement(m.id)} className="text-xs text-red-400 hover:text-red-600">Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── Tab: WIP ─── */}
      {tab === 'wip' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">WIP Takip — Bantlar Arası Yarı Mamul Stok</h3>
          </div>
          {/* Add form */}
          <div className="p-4 bg-amber-50 border-b border-amber-100">
            <div className="grid grid-cols-5 gap-2">
              <input value={newWip.operation_name} onChange={e => setNewWip(p => ({ ...p, operation_name: e.target.value }))}
                placeholder="Operasyon/konum adı" className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <input type="number" value={newWip.wip_qty || ''} onChange={e => setNewWip(p => ({ ...p, wip_qty: Number(e.target.value) }))}
                placeholder="WIP adet" className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <input value={newWip.model_code} onChange={e => setNewWip(p => ({ ...p, model_code: e.target.value }))}
                placeholder="Model kodu" className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <input value={newWip.notes} onChange={e => setNewWip(p => ({ ...p, notes: e.target.value }))}
                placeholder="Not" className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <button onClick={addWip} disabled={saving || !newWip.operation_name}
                className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                + WIP Ekle
              </button>
            </div>
          </div>
          {/* WIP Cards + Table */}
          {wipRecords.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">Bu tarih için WIP kaydı yok</div>
          ) : (
            <>
              {/* Summary */}
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex gap-6">
                <div className="text-sm"><span className="text-gray-500">Toplam WIP:</span> <span className="font-bold">{totalWipQty} adet</span></div>
                <div className="text-sm"><span className="text-gray-500">WIP Bekleme:</span> <span className="font-bold">{fmt(wipWaitSec / 60)} dk</span></div>
                <div className="text-sm"><span className="text-gray-500">Kayıt:</span> <span className="font-bold">{wipRecords.length}</span></div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left px-4 py-2">Konum / Operasyon</th>
                    <th className="text-left px-4 py-2">Bant</th>
                    <th className="text-left px-4 py-2">Model</th>
                    <th className="text-right px-4 py-2">WIP (adet)</th>
                    <th className="text-right px-4 py-2">Bekleme (dk)</th>
                    <th className="text-left px-4 py-2">Not</th>
                    <th className="text-right px-4 py-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {wipRecords.map(w => (
                    <tr key={w.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-900">{w.operation_name || '—'}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{w.line_name || '—'}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{w.model_code || '—'}</td>
                      <td className="text-right px-4 py-2 font-mono font-semibold">{w.wip_qty}</td>
                      <td className="text-right px-4 py-2 font-mono text-gray-600">
                        {taktTime > 0 ? fmt((w.wip_qty * taktTime) / 60) : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">{w.notes || '—'}</td>
                      <td className="text-right px-4 py-2">
                        <button onClick={() => deleteWip(w.id)} className="text-xs text-red-400 hover:text-red-600">Sil</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Benchmarks Info */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-gray-600 mb-2">VSM Benchmark Referansları</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-500">
          <div>
            <div className="font-medium text-gray-700 mb-1">Hat Verimliliği</div>
            <div>{'>'} %88 Mükemmel</div>
            <div>%80-88 İyi</div>
            <div>%70-80 Ortalama</div>
            <div>{'<'} %60 Kritik</div>
          </div>
          <div>
            <div className="font-medium text-gray-700 mb-1">PCE (Değer Katma)</div>
            <div>{'>'} %25 Mükemmel (Lean)</div>
            <div>%15-25 İyi</div>
            <div>%5-15 Ortalama</div>
            <div>{'<'} %5 Kritik</div>
          </div>
          <div>
            <div className="font-medium text-gray-700 mb-1">Hat Dengeleme</div>
            <div>{'>'} %85 İyi</div>
            <div>%70-85 Ortalama</div>
            <div>{'<'} %70 Kötü</div>
          </div>
          <div>
            <div className="font-medium text-gray-700 mb-1">OEE</div>
            <div>{'>'} %85 Dünya Standartı</div>
            <div>%75-85 İyi</div>
            <div>%65-75 Kabul Edilebilir</div>
            <div>{'<'} %65 Kabul Edilemez</div>
          </div>
        </div>
      </div>
    </div>
  )
}
