import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { Boxes, Wallet, Gauge, BarChart3 } from 'lucide-react'
import { EffTrendChart } from '@/components/pes/DashboardCharts'

export const dynamic = 'force-dynamic'

interface Props { searchParams: Promise<{ wid?: string }> }

export default async function WorkshopDashboard({ searchParams }: Props) {
  const { wid } = await searchParams

  const data = await withServerTenant(async (sql) => {
    if (!wid) {
      const workshops = await sql`SELECT id, code, name, city, type, sewing_staff, total_staff FROM workshop WHERE is_active = true ORDER BY code`
      return { mode: 'list' as const, workshops }
    }

    const workshopId = parseInt(wid)
    const [w] = await sql`SELECT * FROM workshop WHERE id = ${workshopId}`
    if (!w) return { mode: 'notfound' as const }

    const [lastPeriod] = await sql`
      SELECT year, month FROM monthly_production WHERE workshop_id = ${workshopId}
      ORDER BY year DESC, month DESC LIMIT 1
    `
    const pYear = lastPeriod?.year ?? 2026
    const pMonth = lastPeriod?.month ?? 1

    const [prodKpi] = await sql`
      SELECT COALESCE(SUM(target_qty), 0)::int as target, COALESCE(SUM(actual_qty), 0)::int as actual,
             CASE WHEN SUM(target_qty) > 0 THEN ROUND(SUM(actual_qty)::numeric / SUM(target_qty) * 100, 1) ELSE 0 END as eff
      FROM monthly_production WHERE workshop_id = ${workshopId} AND year = ${pYear} AND month = ${pMonth}
    `

    const [expKpi] = await sql`
      SELECT (personnel+sgk+food+electricity+water+gas+transport+vehicle+cargo+machine_maint+thread+other) as total,
             target_revenue, work_days
      FROM monthly_expense WHERE workshop_id = ${workshopId} ORDER BY year DESC, month DESC LIMIT 1
    `

    const [qualKpi] = await sql`
      SELECT CASE WHEN SUM(inspected_qty) > 0 THEN ROUND(SUM(first_pass_qty)::numeric / SUM(inspected_qty) * 100, 1) ELSE NULL END as fpq,
             COALESCE(SUM(rejected_qty), 0)::int as rejected,
             COALESCE(SUM(rework_qty), 0)::int as rework
      FROM quality_record WHERE workshop_id = ${workshopId} AND year = ${pYear} AND month = ${pMonth}
    `

    const [downtimeKpi] = await sql`
      SELECT COALESCE(SUM(dr.duration_min), 0)::int as total_min, COUNT(*)::int as count,
             COALESCE(SUM(CASE WHEN dr.downtime_type = 'Plansiz' THEN dr.duration_min ELSE 0 END), 0)::int as unplanned_min
      FROM downtime_record dr
      JOIN production_line pl ON pl.id = dr.line_id
      WHERE pl.workshop_id = ${workshopId}
        AND EXTRACT(YEAR FROM dr.occurred_at) = ${pYear}
        AND EXTRACT(MONTH FROM dr.occurred_at) = ${pMonth}
    `

    const [changeKpi] = await sql`
      SELECT COALESCE(SUM(total_min), 0)::int as total_min, COUNT(*)::int as count
      FROM changeover_record cr
      JOIN production_line pl ON pl.id = cr.line_id
      WHERE pl.workshop_id = ${workshopId}
        AND EXTRACT(YEAR FROM cr.occurred_date) = ${pYear}
        AND EXTRACT(MONTH FROM cr.occurred_date) = ${pMonth}
    `

    const [wfKpi] = await sql`
      SELECT total_staff, left_count, joined_count, in_warmup,
             CASE WHEN total_staff > 0 THEN ROUND(left_count::numeric / total_staff * 100, 1) ELSE 0 END as turnover_pct
      FROM workforce_turnover WHERE workshop_id = ${workshopId} ORDER BY year DESC, month DESC LIMIT 1
    `

    const bandPerf = await sql`
      SELECT pl.code, pl.name, pl.daily_target,
             COALESCE(SUM(mp.actual_qty), 0)::int as actual, COALESCE(SUM(mp.target_qty), 0)::int as target,
             CASE WHEN SUM(mp.target_qty) > 0 THEN ROUND(SUM(mp.actual_qty)::numeric / SUM(mp.target_qty) * 100, 1) ELSE 0 END as eff
      FROM production_line pl
      LEFT JOIN monthly_production mp ON mp.line_id = pl.id AND mp.year = ${pYear} AND mp.month = ${pMonth}
      WHERE pl.workshop_id = ${workshopId} AND pl.is_active = true
      GROUP BY pl.id, pl.code, pl.name, pl.daily_target
      ORDER BY pl.code
    `

    const effTrend = await sql`
      SELECT year, month, ROUND(SUM(actual_qty)::numeric / NULLIF(SUM(target_qty), 0) * 100, 1) as eff
      FROM monthly_production WHERE workshop_id = ${workshopId}
      GROUP BY year, month ORDER BY year, month`

    return { mode: 'detail' as const, w, workshopId, pYear, pMonth, prodKpi, expKpi, qualKpi, downtimeKpi, changeKpi, wfKpi, bandPerf, effTrend }
  })

  if (!data) redirect('/login')

  if (data.mode === 'list') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pt-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-[#197A56] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">PES</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Atolye Secin</h1>
          <p className="text-gray-500 mt-1">Verimlilik paneline erismek icin atolyenizi secin</p>
        </div>
        <div className="space-y-3">
          {data.workshops.map((w) => (
            <Link key={w.id} href={`/workshop?wid=${w.id}`}
              className="block bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-[#197A56] transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[#197A56] font-bold text-lg">{w.code}</span>
                  <span className="text-gray-900 ml-2 font-medium">{w.name}</span>
                  <p className="text-sm text-gray-500 mt-0.5">{w.city} - Tip {w.type} - {w.sewing_staff} dikim op. - {w.total_staff} toplam</p>
                </div>
                <span className="text-gray-400 text-2xl">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  if (data.mode === 'notfound') return <p>Atolye bulunamadi</p>

  const { w, workshopId, pYear, pMonth, prodKpi, expKpi, qualKpi, downtimeKpi, changeKpi, wfKpi, bandPerf, effTrend } = data

  const totalExpense = Number(expKpi?.total ?? 0)
  const targetRevenue = Number(expKpi?.target_revenue ?? 0)
  const workDays = Number(expKpi?.work_days ?? 22)
  const sewingStaff = Number(w.sewing_staff)
  const netHours = Number(w.net_hours_day ?? 9)
  const costPerMin = (sewingStaff > 0 && workDays > 0) ? (totalExpense / (sewingStaff * workDays * netHours * 60)).toFixed(2) : '---'
  const marginPct = targetRevenue > 0 ? ((targetRevenue - totalExpense) / targetRevenue * 100).toFixed(1) : null

  const totalCapMin = sewingStaff * workDays * netHours * 60
  const downtimePct = totalCapMin > 0 ? (Number(downtimeKpi?.total_min ?? 0) / totalCapMin * 100).toFixed(1) : '0'

  const efficiency = Number(prodKpi?.eff ?? 0)
  const fpq = qualKpi?.fpq ? Number(qualKpi.fpq) : null

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{w.name}</h1>
          <p className="text-gray-500">{w.code} - {w.city} - Tip {w.type} - {sewingStaff} dikim - {pMonth}/{pYear}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500">Verimlilik</p>
          <p className={`text-3xl font-bold ${efficiency >= 90 ? 'text-green-600' : efficiency >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
            %{efficiency}
          </p>
          <p className="text-xs text-gray-400 mt-1">H: {Number(prodKpi?.target ?? 0).toLocaleString('tr-TR')} G: {Number(prodKpi?.actual ?? 0).toLocaleString('tr-TR')}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500">TL/dk Maliyet</p>
          <p className="text-3xl font-bold text-gray-900">{costPerMin} <span className="text-sm text-gray-400">TL</span></p>
          {marginPct && <p className={`text-xs mt-1 ${Number(marginPct) >= 0 ? 'text-green-600' : 'text-red-600'}`}>Marj: %{marginPct}</p>}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500">Kalite (FPQ)</p>
          <p className={`text-3xl font-bold ${fpq !== null ? (fpq >= 95 ? 'text-green-600' : fpq >= 90 ? 'text-amber-600' : 'text-red-600') : 'text-gray-300'}`}>
            {fpq !== null ? `%${fpq}` : '---'}
          </p>
          {Number(qualKpi?.rejected ?? 0) > 0 && <p className="text-xs text-red-400 mt-1">Red: {Number(qualKpi?.rejected)} Tamir: {Number(qualKpi?.rework)}</p>}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500">Durus</p>
          <p className="text-3xl font-bold text-red-600">{downtimeKpi?.total_min ?? 0} <span className="text-sm text-gray-400">dk</span></p>
          <p className="text-xs text-gray-400 mt-1">Kapasite etkisi: %{downtimePct}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Model Degisim</p>
          <p className="text-lg font-bold text-gray-800">{changeKpi?.total_min ?? 0} dk</p>
          <p className="text-xs text-gray-400">{changeKpi?.count ?? 0} degisim</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Isgucudevir</p>
          <p className="text-lg font-bold text-gray-800">%{wfKpi?.turnover_pct ?? 0}</p>
          <p className="text-xs text-gray-400">Giden: {wfKpi?.left_count ?? 0} Gelen: {wfKpi?.joined_count ?? 0}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Toplam Gider</p>
          <p className="text-lg font-bold text-gray-800">{totalExpense > 0 ? (totalExpense / 1000000).toFixed(2) + 'M' : '---'} TL</p>
          <p className="text-xs text-gray-400">Gunluk: {workDays > 0 ? Math.round(totalExpense / workDays).toLocaleString('tr-TR') : '---'} TL</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Isinma Personel</p>
          <p className="text-lg font-bold text-amber-600">{wfKpi?.in_warmup ?? 0} kisi</p>
          <p className="text-xs text-gray-400">Toplam: {wfKpi?.total_staff ?? Number(w.total_staff)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { href: `/workshop/production?wid=${workshopId}`, Icon: Boxes, label: 'Üretim' },
          { href: `/workshop/costs?wid=${workshopId}`, Icon: Wallet, label: 'Gider' },
          { href: `/workshop/quality?wid=${workshopId}`, Icon: Gauge, label: 'Kalite' },
          { href: `/workshop/analysis?wid=${workshopId}`, Icon: BarChart3, label: 'Analiz' },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 hover:shadow-md hover:border-emerald-300 transition-all flex items-center gap-2.5">
            <a.Icon className="w-5 h-5 text-[#197A56]" strokeWidth={1.9} />
            <span className="text-sm font-medium text-emerald-900">{a.label}</span>
          </Link>
        ))}
      </div>

      {effTrend.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Verimlilik Trendi</h2>
          <EffTrendChart data={effTrend as { year: number; month: number; eff: number }[]} />
        </div>
      )}

      {bandPerf.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bant Performanslari</h2>
          <div className="space-y-3">
            {bandPerf.map((b) => {
              const bEff = Number(b.eff)
              const barColor = bEff >= 90 ? 'bg-green-500' : bEff >= 70 ? 'bg-amber-500' : 'bg-red-500'
              return (
                <div key={String(b.code)}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{String(b.code)} - {String(b.name)}</span>
                    <span className={`text-sm font-bold ${bEff >= 90 ? 'text-green-600' : bEff >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                      %{bEff}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full ${barColor}`} style={{ width: `${Math.min(bEff, 100)}%` }}></div>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    H: {Number(b.target).toLocaleString('tr-TR')} G: {Number(b.actual).toLocaleString('tr-TR')} Gunluk: {Number(b.daily_target).toLocaleString('tr-TR')}/gun
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
