import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'

export const dynamic = 'force-dynamic'

interface Props { searchParams: Promise<{ wid?: string }> }

export default async function AnalysisPage({ searchParams }: Props) {
  const { wid } = await searchParams
  if (!wid) return <p>Atölye seçin</p>

  const workshopId = parseInt(wid)

  const data = await withServerTenant(async (sql) => {
    const [w] = await sql`SELECT * FROM workshop WHERE id = ${workshopId}`
    if (!w) return null

    const prodTrend = await sql`
      SELECT year, month, SUM(target_qty)::int as target, SUM(actual_qty)::int as actual,
             CASE WHEN SUM(target_qty) > 0 THEN ROUND(SUM(actual_qty)::numeric / SUM(target_qty) * 100, 1) ELSE 0 END as eff
      FROM monthly_production WHERE workshop_id = ${workshopId}
      GROUP BY year, month ORDER BY year, month
    `

    const costTrend = await sql`
      SELECT year, month, work_days,
             (personnel+sgk+food+electricity+water+gas+transport+vehicle+cargo+machine_maint+thread+other) as total_expense,
             CASE WHEN ${Number(w.sewing_staff)} > 0 AND work_days > 0
               THEN ROUND((personnel+sgk+food+electricity+water+gas+transport+vehicle+cargo+machine_maint+thread+other)::numeric / (${Number(w.sewing_staff)} * work_days * 540), 2)
               ELSE 0 END as cost_per_min,
             target_revenue
      FROM monthly_expense WHERE workshop_id = ${workshopId}
      ORDER BY year, month
    `

    const [lastExpense] = await sql`
      SELECT * FROM monthly_expense WHERE workshop_id = ${workshopId}
      ORDER BY year DESC, month DESC LIMIT 1
    `

    const qualTrend = await sql`
      SELECT year, month, SUM(inspected_qty)::int as inspected, SUM(first_pass_qty)::int as fpq,
             SUM(rejected_qty)::int as rejected, SUM(rework_qty)::int as rework,
             CASE WHEN SUM(inspected_qty) > 0 THEN ROUND(SUM(first_pass_qty)::numeric / SUM(inspected_qty) * 100, 1) ELSE 0 END as fpq_rate,
             CASE WHEN SUM(inspected_qty) > 0 THEN ROUND(SUM(rejected_qty)::numeric / SUM(inspected_qty) * 100, 1) ELSE 0 END as red_rate
      FROM quality_record WHERE workshop_id = ${workshopId}
      GROUP BY year, month ORDER BY year, month
    `

    const downtimeByType = await sql`
      SELECT dr.downtime_type, COUNT(*)::int as count, SUM(dr.duration_min)::int as total_min
      FROM downtime_record dr
      JOIN production_line pl ON pl.id = dr.line_id
      WHERE pl.workshop_id = ${workshopId}
      GROUP BY dr.downtime_type ORDER BY total_min DESC
    `

    const workforceTrend = await sql`
      SELECT year, month, total_staff, left_count, joined_count, in_warmup,
             CASE WHEN total_staff > 0 THEN ROUND(((left_count+joined_count)/2.0) / total_staff * 100, 1) ELSE 0 END as turnover_rate
      FROM workforce_turnover WHERE workshop_id = ${workshopId}
      ORDER BY year, month
    `

    return { w, prodTrend, costTrend, lastExpense, qualTrend, downtimeByType, workforceTrend }
  })

  if (!data) redirect('/login')
  if (data === null || !data.w) return <p>Atölye bulunamadı</p>

  const { w, prodTrend, costTrend, lastExpense, qualTrend, downtimeByType, workforceTrend } = data

  const expenseItems = lastExpense ? [
    { label: 'Personel', value: Number(lastExpense.personnel) },
    { label: 'SGK', value: Number(lastExpense.sgk) },
    { label: 'Yemek', value: Number(lastExpense.food) },
    { label: 'Elektrik', value: Number(lastExpense.electricity) },
    { label: 'Su', value: Number(lastExpense.water) },
    { label: 'Doğalgaz', value: Number(lastExpense.gas) },
    { label: 'Servis', value: Number(lastExpense.transport) },
    { label: 'Araç', value: Number(lastExpense.vehicle) },
    { label: 'Kargo', value: Number(lastExpense.cargo) },
    { label: 'Makine Bakım', value: Number(lastExpense.machine_maint) },
    { label: 'İplik', value: Number(lastExpense.thread) },
    { label: 'Diğer', value: Number(lastExpense.other) },
  ].filter(e => e.value > 0).sort((a, b) => b.value - a.value) : []

  const totalExpense = expenseItems.reduce((s, e) => s + e.value, 0)

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <Link href={`/workshop?wid=${wid}`} className="text-sm text-faint hover:text-ink">← Dashboard</Link>
        <h1 className="text-2xl font-bold text-ink mt-2">{w.name} — Analiz</h1>
        <p className="text-faint">{w.code} · Detaylı performans analizi</p>
      </div>

      {prodTrend.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-4">Verimlilik Trendi</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-soft">
                <th className="py-2 text-left text-faint font-medium">Dönem</th>
                <th className="py-2 text-right text-faint font-medium">Hedef</th>
                <th className="py-2 text-right text-faint font-medium">Gerçekleşen</th>
                <th className="py-2 text-right text-faint font-medium">Verimlilik</th>
                <th className="py-2 text-left text-faint font-medium w-48">Grafik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {prodTrend.map((p, i) => {
                const eff = Number(p.eff)
                const color = eff >= 90 ? 'bg-green-500' : eff >= 70 ? 'bg-amber-500' : 'bg-red-500'
                return (
                  <tr key={i}>
                    <td className="py-2 text-body">{String(p.year)}/{String(p.month)}</td>
                    <td className="py-2 text-right">{Number(p.target).toLocaleString('tr-TR')}</td>
                    <td className="py-2 text-right">{Number(p.actual).toLocaleString('tr-TR')}</td>
                    <td className="py-2 text-right font-bold">{eff}%</td>
                    <td className="py-2">
                      <div className="w-full bg-canvas rounded-full h-2">
                        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(eff, 100)}%` }}></div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {costTrend.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-4">Maliyet Trendi</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-soft">
                <th className="py-2 text-left text-faint font-medium">Dönem</th>
                <th className="py-2 text-right text-faint font-medium">Toplam Gider</th>
                <th className="py-2 text-right text-faint font-medium">TL/dk</th>
                <th className="py-2 text-right text-faint font-medium">Hedef Ciro</th>
                <th className="py-2 text-right text-faint font-medium">Marj</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {costTrend.map((c, i) => {
                const margin = Number(c.target_revenue) - Number(c.total_expense)
                const marginPct = Number(c.target_revenue) > 0 ? (margin / Number(c.target_revenue) * 100).toFixed(1) : '—'
                return (
                  <tr key={i}>
                    <td className="py-2 text-body">{String(c.year)}/{String(c.month)}</td>
                    <td className="py-2 text-right">{(Number(c.total_expense) / 1000).toFixed(0)}K TL</td>
                    <td className="py-2 text-right font-bold text-accent">{String(c.cost_per_min)} TL</td>
                    <td className="py-2 text-right">{Number(c.target_revenue) > 0 ? (Number(c.target_revenue) / 1000).toFixed(0) + 'K' : '—'}</td>
                    <td className={`py-2 text-right font-medium ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {marginPct !== '—' ? `%${marginPct}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {expenseItems.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-4">Gider Dağılımı (Son Ay)</h2>
          <div className="space-y-2">
            {expenseItems.map((e, i) => {
              const pct = totalExpense > 0 ? (e.value / totalExpense * 100) : 0
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-muted w-24 text-right">{e.label}</span>
                  <div className="flex-1 bg-canvas rounded-full h-4">
                    <div className="h-4 rounded-full bg-accent" style={{ width: `${pct}%`, opacity: 0.4 + (pct / 100) * 0.6 }}></div>
                  </div>
                  <span className="text-xs text-body w-20 text-right">{(e.value / 1000).toFixed(0)}K</span>
                  <span className="text-xs text-faint w-12 text-right">%{pct.toFixed(0)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {qualTrend.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-4">Kalite Trendi</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-soft">
                <th className="py-2 text-left text-faint font-medium">Dönem</th>
                <th className="py-2 text-right text-faint font-medium">Kontrol</th>
                <th className="py-2 text-right text-faint font-medium">FPQ %</th>
                <th className="py-2 text-right text-faint font-medium">Red %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {qualTrend.map((q, i) => (
                <tr key={i}>
                  <td className="py-2 text-body">{String(q.year)}/{String(q.month)}</td>
                  <td className="py-2 text-right">{Number(q.inspected).toLocaleString('tr-TR')}</td>
                  <td className="py-2 text-right"><span className={`font-bold ${Number(q.fpq_rate) >= 95 ? 'text-green-600' : 'text-amber-600'}`}>%{String(q.fpq_rate)}</span></td>
                  <td className="py-2 text-right text-red-600">%{String(q.red_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {downtimeByType.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-4">Duruş Analizi</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {downtimeByType.map((d, i) => (
              <div key={i} className={`rounded-lg p-3 ${
                d.downtime_type === 'Plansız' ? 'bg-red-50' :
                d.downtime_type === 'Tedarik' ? 'bg-orange-50' :
                d.downtime_type === 'Organizasyonel' ? 'bg-canvas' : 'bg-canvas'
              }`}>
                <p className="text-xs text-muted">{String(d.downtime_type)}</p>
                <p className="text-xl font-bold text-ink">{String(d.total_min)} dk</p>
                <p className="text-xs text-faint">{String(d.count)} kayıt</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {workforceTrend.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-4">İşgücü Devir Oranı</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-soft">
                <th className="py-2 text-left text-faint font-medium">Dönem</th>
                <th className="py-2 text-right text-faint font-medium">Toplam</th>
                <th className="py-2 text-right text-faint font-medium">Giren</th>
                <th className="py-2 text-right text-faint font-medium">Çıkan</th>
                <th className="py-2 text-right text-faint font-medium">Devir %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {workforceTrend.map((wf, i) => (
                <tr key={i}>
                  <td className="py-2 text-body">{String(wf.year)}/{String(wf.month)}</td>
                  <td className="py-2 text-right">{String(wf.total_staff)}</td>
                  <td className="py-2 text-right text-green-600">+{String(wf.joined_count)}</td>
                  <td className="py-2 text-right text-red-600">-{String(wf.left_count)}</td>
                  <td className="py-2 text-right font-bold">{String(wf.turnover_rate)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {prodTrend.length === 0 && costTrend.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">Henüz analiz için yeterli veri yok</p>
          <p className="text-sm text-amber-600 mt-1">Üretim ve gider verisi girdikçe analizler otomatik oluşacak</p>
          <div className="flex gap-3 justify-center mt-4">
            <Link href={`/workshop/production?wid=${wid}`} className="px-4 py-2 bg-accent text-white rounded-lg text-sm">Üretim Girişi</Link>
            <Link href={`/workshop/costs?wid=${wid}`} className="px-4 py-2 bg-accent text-white rounded-lg text-sm">Gider Girişi</Link>
          </div>
        </div>
      )}
    </div>
  )
}
