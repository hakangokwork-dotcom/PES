import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import MetricInfo from '@/components/pes/MetricInfo'
import { effTone, fpqTone, TONE_TEXT } from '@/lib/ui/tone'
import { donemCoz } from '@/lib/pes/donem'

export const dynamic = 'force-dynamic'

export default async function ComparePage({
  searchParams,
}: { searchParams: Promise<{ donem?: string }> }) {
  /* Dönem üst bardan geliyor; yoksa veride bulunan en yeni döneme düşer. */
  const secilen = donemCoz((await searchParams).donem)

  const data = await withServerTenant(async (sql) => {
    const workshops = await sql`
      SELECT w.id, w.code, w.name, w.type, w.city, w.sewing_staff, w.total_staff, w.net_hours_day
      FROM workshop w WHERE w.is_active = true ORDER BY w.code
    `

    const [lastPeriod] = await sql`
      SELECT year, month FROM monthly_production ORDER BY year DESC, month DESC LIMIT 1
    `
    const pYear = secilen?.yil ?? lastPeriod?.year ?? 2026
    const pMonth = secilen?.ay ?? lastPeriod?.month ?? 1

    const prodData = await sql`
      SELECT workshop_id,
        SUM(target_qty)::int as target, SUM(actual_qty)::int as actual,
        CASE WHEN SUM(target_qty) > 0 THEN ROUND(SUM(actual_qty)::numeric / SUM(target_qty) * 100, 1) ELSE 0 END as efficiency
      FROM monthly_production WHERE year = ${pYear} AND month = ${pMonth}
      GROUP BY workshop_id
    `
    const costData = await sql`
      SELECT workshop_id, work_days,
        (personnel+sgk+food+electricity+water+gas+transport+vehicle+cargo+machine_maint+thread+other) as total_expense,
        target_revenue
      FROM monthly_expense WHERE year = ${pYear} AND month = ${pMonth}
    `
    const qualData = await sql`
      SELECT workshop_id,
        SUM(inspected_qty)::int as inspected, SUM(first_pass_qty)::int as fpq_qty,
        CASE WHEN SUM(inspected_qty) > 0 THEN ROUND(SUM(first_pass_qty)::numeric / SUM(inspected_qty) * 100, 1) ELSE 0 END as fpq,
        SUM(rejected_qty)::int as rejected
      FROM quality_record WHERE year = ${pYear} AND month = ${pMonth}
      GROUP BY workshop_id
    `
    const dtData = await sql`
      SELECT pl.workshop_id, SUM(dr.duration_min)::int as total_min, COUNT(*)::int as count
      FROM downtime_record dr
      JOIN production_line pl ON pl.id = dr.line_id
      WHERE EXTRACT(YEAR FROM dr.occurred_at) = ${pYear} AND EXTRACT(MONTH FROM dr.occurred_at) = ${pMonth}
      GROUP BY pl.workshop_id
    `
    const scoreData = await sql`
      SELECT workshop_id, composite_sc, tier, trend, efficiency_sc, quality_sc, delivery_sc, cost_sc
      FROM supplier_score WHERE year = ${pYear} AND month = ${pMonth}
    `
    return { workshops, pYear, pMonth, prodData, costData, qualData, dtData, scoreData }
  })

  if (!data) redirect('/login')

  const { workshops, pYear, pMonth, prodData, costData, qualData, dtData, scoreData } = data

  const prodMap = Object.fromEntries(prodData.map(r => [r.workshop_id, r]))
  const costMap = Object.fromEntries(costData.map(r => [r.workshop_id, r]))
  const qualMap = Object.fromEntries(qualData.map(r => [r.workshop_id, r]))
  const dtMap = Object.fromEntries(dtData.map(r => [r.workshop_id, r]))
  const scoreMap = Object.fromEntries(scoreData.map(r => [r.workshop_id, r]))

  const rows = workshops.map(w => {
    const p = prodMap[w.id as number]
    const c = costMap[w.id as number]
    const q = qualMap[w.id as number]
    const d = dtMap[w.id as number]
    const s = scoreMap[w.id as number]

    const sewStaff = Number(w.sewing_staff)
    const workDays = Number(c?.work_days ?? 22)
    const netH = Number(w.net_hours_day ?? 9)
    const totalExp = Number(c?.total_expense ?? 0)
    const costPerMin = (sewStaff > 0 && workDays > 0) ? totalExp / (sewStaff * workDays * netH * 60) : 0
    const marginPct = Number(c?.target_revenue ?? 0) > 0 ? ((Number(c.target_revenue) - totalExp) / Number(c.target_revenue) * 100) : 0

    return {
      id: w.id, code: w.code, name: w.name, type: w.type, city: w.city,
      sewingStaff: sewStaff,
      efficiency: Number(p?.efficiency ?? 0),
      target: Number(p?.target ?? 0),
      actual: Number(p?.actual ?? 0),
      costPerMin: Math.round(costPerMin * 100) / 100,
      totalExpense: totalExp,
      marginPct: Math.round(marginPct * 10) / 10,
      fpq: Number(q?.fpq ?? 0),
      rejected: Number(q?.rejected ?? 0),
      downtimeMin: Number(d?.total_min ?? 0),
      compositeScore: Number(s?.composite_sc ?? 0),
      tier: (s?.tier ?? '---') as string,
      trend: (s?.trend ?? '---') as string,
    }
  })

  const byEff = [...rows].sort((a, b) => b.efficiency - a.efficiency)
  const byCost = [...rows].sort((a, b) => a.costPerMin - b.costPerMin)
  const byFpq = [...rows].sort((a, b) => b.fpq - a.fpq)
  const byScore = [...rows].sort((a, b) => b.compositeScore - a.compositeScore)

  const fmt = (n: number) => n.toLocaleString('tr-TR')
  const tierColor = (t: string) => {
    if (t === 'Stratejik') return 'bg-emerald-100 text-emerald-800'
    if (t === 'Gelisen') return 'bg-canvas text-muted'
    if (t === 'Izlemede') return 'bg-amber-100 text-amber-800'
    if (t === 'Risk') return 'bg-orange-100 text-orange-800'
    if (t === 'Kritik') return 'bg-red-100 text-red-800'
    return 'bg-canvas text-muted'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Cross-Atolye Karsilastirma</h1>
        <p className="text-sm text-faint mt-1">Tum atolyeler - {pMonth}/{pYear} donemi</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint inline-flex items-center gap-1">Ort. Verimlilik <MetricInfo metricKey="verimlilik" size={11} /></p>
          <p className="text-2xl font-bold text-ink">%{rows.length > 0 ? (rows.reduce((s, r) => s + r.efficiency, 0) / rows.filter(r => r.efficiency > 0).length || 0).toFixed(1) : '0'}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint inline-flex items-center gap-1">Ort. TL/dk <MetricInfo metricKey="tl_dk" size={11} /></p>
          <p className="text-2xl font-bold text-ink">{rows.filter(r => r.costPerMin > 0).length > 0 ? (rows.filter(r => r.costPerMin > 0).reduce((s, r) => s + r.costPerMin, 0) / rows.filter(r => r.costPerMin > 0).length).toFixed(2) : '---'}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint inline-flex items-center gap-1">Ort. FPQ <MetricInfo metricKey="fpq" size={11} /></p>
          <p className="text-2xl font-bold text-ink">%{rows.filter(r => r.fpq > 0).length > 0 ? (rows.filter(r => r.fpq > 0).reduce((s, r) => s + r.fpq, 0) / rows.filter(r => r.fpq > 0).length).toFixed(1) : '0'}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Toplam Atolye</p>
          <p className="text-2xl font-bold text-ink">{rows.length}</p>
        </div>
      </div>

      <div className="bg-white border border-line-soft rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-canvas border-b border-line-soft">
          <h2 className="text-sm font-semibold text-body">Performans Tablosu</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-faint border-b border-line-soft">
                <th className="text-left px-3 py-2">Atolye</th>
                <th className="text-center px-2 py-2">Tip</th>
                <th className="text-right px-2 py-2"><span className="inline-flex items-center justify-end gap-0.5">Verimlilik <MetricInfo metricKey="verimlilik" size={10} /></span></th>
                <th className="text-right px-2 py-2"><span className="inline-flex items-center justify-end gap-0.5">TL/dk <MetricInfo metricKey="tl_dk" size={10} /></span></th>
                <th className="text-right px-2 py-2"><span className="inline-flex items-center justify-end gap-0.5">Marj% <MetricInfo metricKey="marj" size={10} /></span></th>
                <th className="text-right px-2 py-2"><span className="inline-flex items-center justify-end gap-0.5">FPQ% <MetricInfo metricKey="fpq" size={10} /></span></th>
                <th className="text-right px-2 py-2">Durus dk</th>
                <th className="text-right px-2 py-2"><span className="inline-flex items-center justify-end gap-0.5">Skor <MetricInfo metricKey="composite_score" size={10} /></span></th>
                <th className="text-center px-2 py-2">Tier</th>
                <th className="text-center px-2 py-2">Trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id as number} className="border-b border-line-soft hover:bg-canvas">
                  <td className="px-3 py-2">
                    <Link href={`/workshop?wid=${r.id}`} className="text-emerald-700 hover:underline font-medium">{r.code as string}</Link>
                    <span className="text-faint ml-1 text-xs">{r.name as string}</span>
                  </td>
                  <td className="text-center px-2 py-2 text-xs text-faint">{r.type as string}</td>
                  <td className={`text-right px-2 py-2 font-mono font-semibold ${TONE_TEXT[effTone(r.efficiency)]}`}>
                    {r.efficiency > 0 ? `%${r.efficiency}` : '---'}
                  </td>
                  <td className="text-right px-2 py-2 font-mono">{r.costPerMin > 0 ? r.costPerMin.toFixed(2) : '---'}</td>
                  <td className={`text-right px-2 py-2 font-mono ${r.marginPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {r.marginPct !== 0 ? `%${r.marginPct}` : '---'}
                  </td>
                  <td className={`text-right px-2 py-2 font-mono ${r.fpq > 0 ? TONE_TEXT[fpqTone(r.fpq)] : 'text-faint'}`}>
                    {r.fpq > 0 ? `%${r.fpq}` : '---'}
                  </td>
                  <td className="text-right px-2 py-2 font-mono text-red-600">{r.downtimeMin > 0 ? fmt(r.downtimeMin) : '---'}</td>
                  <td className="text-right px-2 py-2 font-mono font-semibold">{r.compositeScore > 0 ? r.compositeScore.toFixed(1) : '---'}</td>
                  <td className="text-center px-2 py-2">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${tierColor(r.tier)}`}>{r.tier}</span>
                  </td>
                  <td className="text-center px-2 py-2 text-xs">{r.trend === 'Artis' ? '▲' : r.trend === 'Dusus' ? '▼' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-line-soft rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-canvas border-b border-line-soft">
            <h3 className="text-sm font-semibold text-body">Verimlilik Siralamasi</h3>
          </div>
          <div className="divide-y divide-line-soft">
            {byEff.filter(r => r.efficiency > 0).map((r, i) => (
              <div key={r.id as number} className="px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${i < 3 ? 'bg-accent' : 'bg-line'}`}>{i + 1}</span>
                  <span className="text-sm text-ink">{r.code as string} — {r.name as string}</span>
                </div>
                <span className={`text-sm font-bold ${TONE_TEXT[effTone(r.efficiency)]}`}>%{r.efficiency}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-line-soft rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-canvas border-b border-line-soft">
            <h3 className="text-sm font-semibold text-body">Maliyet Siralamasi (TL/dk - dusuk iyi)</h3>
          </div>
          <div className="divide-y divide-line-soft">
            {byCost.filter(r => r.costPerMin > 0).map((r, i) => (
              <div key={r.id as number} className="px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${i === 0 ? 'bg-emerald-500' : i === 1 ? 'bg-emerald-400' : i === 2 ? 'bg-emerald-300' : 'bg-line'}`}>{i + 1}</span>
                  <span className="text-sm text-ink">{r.code as string} — {r.name as string}</span>
                </div>
                <span className="text-sm font-bold text-ink">{r.costPerMin.toFixed(2)} TL/dk</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-line-soft rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-canvas border-b border-line-soft">
            <h3 className="text-sm font-semibold text-body">Kalite Siralamasi (FPQ)</h3>
          </div>
          <div className="divide-y divide-line-soft">
            {byFpq.filter(r => r.fpq > 0).map((r, i) => (
              <div key={r.id as number} className="px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${i === 0 ? 'bg-canvas' : i === 1 ? 'bg-canvas' : i === 2 ? 'bg-canvas' : 'bg-line'}`}>{i + 1}</span>
                  <span className="text-sm text-ink">{r.code as string} — {r.name as string}</span>
                </div>
                <span className={`text-sm font-bold ${TONE_TEXT[fpqTone(r.fpq)]}`}>%{r.fpq}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-line-soft rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-canvas border-b border-line-soft">
            <h3 className="text-sm font-semibold text-body">Genel Skor Siralamasi</h3>
          </div>
          <div className="divide-y divide-line-soft">
            {byScore.filter(r => r.compositeScore > 0).map((r, i) => (
              <div key={r.id as number} className="px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${i < 3 ? 'bg-accent' : 'bg-line'}`}>{i + 1}</span>
                  <span className="text-sm text-ink">{r.code as string} — {r.name as string}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${tierColor(r.tier)}`}>{r.tier}</span>
                  <span className="text-sm font-bold text-ink">{r.compositeScore.toFixed(1)}</span>
                </div>
              </div>
            ))}
            {byScore.filter(r => r.compositeScore > 0).length === 0 && (
              <p className="px-4 py-6 text-sm text-faint text-center">Skor hesaplanmamis. Skorlama sayfasindan hesaplayin.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
