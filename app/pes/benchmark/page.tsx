import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import MetricInfo from '@/components/pes/MetricInfo'

// Benchmark tablosundaki metric_key (DB) → ontology key map
const METRIC_KEY_MAP: Record<string, string> = {
  efficiency: 'verimlilik',
  fpq: 'fpq',
  reject_rate: 'red_orani',
  cost_per_min: 'tl_dk',
  margin: 'marj',
  downtime_pct: 'durus_etkisi',
  turnover: 'isgucu_devir',
  composite_score: 'composite_score',
}

export const dynamic = 'force-dynamic'

export default async function BenchmarkPage() {
  const data = await withServerTenant(async (sql) => {
    let benchmarks: Record<string, unknown>[] = []
    let tableMissing = false
    try {
      benchmarks = await sql`SELECT * FROM pes_benchmark ORDER BY id`
    } catch {
      tableMissing = true
      return { tableMissing, benchmarks: [], pYear: 2026, pMonth: 1, workshops: [], prodData: [], costData: [], qualData: [], scoreData: [] }
    }

    const [lastPeriod] = await sql`SELECT year, month FROM monthly_production ORDER BY year DESC, month DESC LIMIT 1`
    const pYear = lastPeriod?.year ?? 2026
    const pMonth = lastPeriod?.month ?? 1

    const workshops = await sql`
      SELECT w.id, w.code, w.name, w.type, w.sewing_staff, w.net_hours_day FROM workshop w WHERE w.is_active = true ORDER BY w.code
    `
    const prodData = await sql`
      SELECT workshop_id,
        CASE WHEN SUM(target_qty) > 0 THEN ROUND(SUM(actual_qty)::numeric / SUM(target_qty) * 100, 1) ELSE 0 END as efficiency
      FROM monthly_production WHERE year = ${pYear} AND month = ${pMonth} GROUP BY workshop_id
    `
    const costData = await sql`
      SELECT workshop_id, work_days,
        (personnel+sgk+food+electricity+water+gas+transport+vehicle+cargo+machine_maint+thread+other) as total_expense,
        target_revenue
      FROM monthly_expense WHERE year = ${pYear} AND month = ${pMonth}
    `
    const qualData = await sql`
      SELECT workshop_id,
        CASE WHEN SUM(inspected_qty) > 0 THEN ROUND(SUM(first_pass_qty)::numeric / SUM(inspected_qty) * 100, 1) ELSE 0 END as fpq,
        CASE WHEN SUM(inspected_qty) > 0 THEN ROUND(SUM(rejected_qty)::numeric / SUM(inspected_qty) * 100, 1) ELSE 0 END as reject_rate
      FROM quality_record WHERE year = ${pYear} AND month = ${pMonth} GROUP BY workshop_id
    `
    const scoreData = await sql`
      SELECT workshop_id, composite_sc FROM supplier_score WHERE year = ${pYear} AND month = ${pMonth}
    `
    return { tableMissing: false, benchmarks, pYear, pMonth, workshops, prodData, costData, qualData, scoreData }
  })

  if (!data) redirect('/login')

  if (data.tableMissing) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Benchmark Yonetimi</h1>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-800">
          Benchmark tablosu henuz olusturulmamis. Supabase SQL Editor&apos;da <strong>010_benchmark.sql</strong> dosyasini calistirin.
        </div>
      </div>
    )
  }

  const { benchmarks, pYear, pMonth, workshops, prodData, costData, qualData, scoreData } = data

  const prodMap = Object.fromEntries(prodData.map(r => [r.workshop_id, r]))
  const costMap = Object.fromEntries(costData.map(r => [r.workshop_id, r]))
  const qualMap = Object.fromEntries(qualData.map(r => [r.workshop_id, r]))
  const scoreMap = Object.fromEntries(scoreData.map(r => [r.workshop_id, r]))

  const wsMetrics = workshops.map(w => {
    const p = prodMap[w.id as number]
    const c = costMap[w.id as number]
    const q = qualMap[w.id as number]
    const s = scoreMap[w.id as number]
    const sewStaff = Number(w.sewing_staff)
    const workDays = Number(c?.work_days ?? 22)
    const netH = Number(w.net_hours_day ?? 9)
    const totalExp = Number(c?.total_expense ?? 0)
    const costPerMin = (sewStaff > 0 && workDays > 0) ? totalExp / (sewStaff * workDays * netH * 60) : 0
    const marginPct = Number(c?.target_revenue ?? 0) > 0 ? ((Number(c.target_revenue) - totalExp) / Number(c.target_revenue) * 100) : 0

    return {
      id: w.id, code: w.code as string, name: w.name as string,
      efficiency: Number(p?.efficiency ?? 0),
      fpq: Number(q?.fpq ?? 0),
      reject_rate: Number(q?.reject_rate ?? 0),
      cost_per_min: Math.round(costPerMin * 100) / 100,
      margin: Math.round(marginPct * 10) / 10,
      composite_score: Number(s?.composite_sc ?? 0),
      downtime_pct: 0,
      turnover: 0,
    }
  })

  function statusColor(bm: Record<string, unknown>, value: number): string {
    const dir = bm.direction as string
    const target = Number(bm.target_value)
    const warn = Number(bm.warning_value ?? target)

    if (dir === 'higher_better') {
      if (value >= target) return 'bg-green-100 text-green-800'
      if (value >= warn) return 'bg-amber-100 text-amber-800'
      return 'bg-red-100 text-red-800'
    } else {
      if (value <= target) return 'bg-green-100 text-green-800'
      if (value <= warn) return 'bg-amber-100 text-amber-800'
      return 'bg-red-100 text-red-800'
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Benchmark Yonetimi</h1>
        <p className="text-sm text-gray-500 mt-1">Merkezi hedefler ve atolye karsilastirmasi - {pMonth}/{pYear}</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Hedef Degerleri</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-100">
              <th className="text-left px-4 py-2">Metrik</th>
              <th className="text-center px-2 py-2 bg-green-50">Hedef</th>
              <th className="text-center px-2 py-2 bg-amber-50">Uyari</th>
              <th className="text-center px-2 py-2 bg-red-50">Kritik</th>
              <th className="text-center px-2 py-2">Birim</th>
              <th className="text-center px-2 py-2">Yon</th>
            </tr>
          </thead>
          <tbody>
            {benchmarks.map(bm => {
              const ontologyKey = METRIC_KEY_MAP[bm.metric_key as string]
              return (
              <tr key={bm.id as number} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">
                  <span className="inline-flex items-center gap-1">
                    {bm.metric_label as string}
                    {ontologyKey && <MetricInfo metricKey={ontologyKey} />}
                  </span>
                </td>
                <td className="text-center px-2 py-2 font-mono font-bold text-green-700 bg-green-50">{String(bm.target_value)}</td>
                <td className="text-center px-2 py-2 font-mono text-amber-700 bg-amber-50">{bm.warning_value != null ? String(bm.warning_value) : '---'}</td>
                <td className="text-center px-2 py-2 font-mono text-red-700 bg-red-50">{bm.critical_value != null ? String(bm.critical_value) : '---'}</td>
                <td className="text-center px-2 py-2 text-gray-500">{bm.unit as string}</td>
                <td className="text-center px-2 py-2 text-xs text-gray-400">{(bm.direction as string) === 'higher_better' ? '↑ yuksek' : '↓ dusuk'}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Atolye Benchmark Karsilastirmasi</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left px-3 py-2 sticky left-0 bg-white">Atolye</th>
                {benchmarks.map(bm => {
                  const ontologyKey = METRIC_KEY_MAP[bm.metric_key as string]
                  return (
                  <th key={bm.id as number} className="text-center px-2 py-2 min-w-[80px]">
                    <div className="text-[10px] leading-tight inline-flex items-center justify-center gap-0.5">
                      {bm.metric_label as string}
                      {ontologyKey && <MetricInfo metricKey={ontologyKey} size={11} />}
                    </div>
                    <div className="text-[9px] text-gray-400">H: {String(bm.target_value)}</div>
                  </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {wsMetrics.map(ws => (
                <tr key={ws.id as number} className="border-b border-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900 sticky left-0 bg-white">{ws.code}</td>
                  {benchmarks.map(bm => {
                    const key = bm.metric_key as string
                    const val = (ws as Record<string, unknown>)[key] as number ?? 0
                    const color = val > 0 ? statusColor(bm, val) : 'bg-gray-50 text-gray-400'
                    return (
                      <td key={bm.id as number} className="text-center px-2 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${color}`}>
                          {val > 0 ? (Number.isInteger(val) ? val : val.toFixed(1)) : '---'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-1"></div>
          <p className="text-green-800 font-medium">Hedefte</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
          <div className="w-3 h-3 bg-amber-500 rounded-full mx-auto mb-1"></div>
          <p className="text-amber-800 font-medium">Uyari</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <div className="w-3 h-3 bg-red-500 rounded-full mx-auto mb-1"></div>
          <p className="text-red-800 font-medium">Kritik</p>
        </div>
      </div>
    </div>
  )
}
