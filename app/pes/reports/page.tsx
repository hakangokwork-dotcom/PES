import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { effTone, fpqTone, TONE_TEXT } from '@/lib/ui/tone'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const data = await withServerTenant(async (sql) => {
    const [totals] = await sql`
      SELECT
        COUNT(DISTINCT w.id)::int as workshop_count,
        COALESCE(SUM(w.sewing_staff), 0)::int as total_sewing,
        COALESCE(SUM(w.total_staff), 0)::int as total_staff,
        COUNT(DISTINCT pl.id)::int as total_lines,
        COALESCE(SUM(pl.daily_target), 0)::int as total_daily_target
      FROM workshop w
      LEFT JOIN production_line pl ON pl.workshop_id = w.id AND pl.is_active = true
      WHERE w.is_active = true
    `

    const workshopSummary = await sql`
      SELECT w.code, w.name, w.type, w.city, w.sewing_staff, w.total_staff,
             COUNT(DISTINCT pl.id)::int as line_count,
             COALESCE(SUM(pl.daily_target), 0)::int as total_daily_target
      FROM workshop w
      LEFT JOIN production_line pl ON pl.workshop_id = w.id AND pl.is_active = true
      WHERE w.is_active = true
      GROUP BY w.id, w.code, w.name, w.type, w.city, w.sewing_staff, w.total_staff
      ORDER BY w.code
    `

    const prodSummary = await sql`
      SELECT w.code, w.name,
             SUM(mp.target_qty)::int as total_target,
             SUM(mp.actual_qty)::int as total_actual,
             CASE WHEN SUM(mp.target_qty) > 0
               THEN ROUND(SUM(mp.actual_qty)::numeric / SUM(mp.target_qty) * 100, 1)
               ELSE 0 END as efficiency
      FROM monthly_production mp
      JOIN workshop w ON w.id = mp.workshop_id
      GROUP BY w.code, w.name
      ORDER BY efficiency DESC
    `

    const expenseSummary = await sql`
      SELECT w.code, w.name, w.sewing_staff,
             me.year, me.month, me.work_days,
             (me.personnel + me.sgk + me.food + me.electricity + me.water + me.gas + me.transport + me.vehicle + me.cargo + me.machine_maint + me.thread + me.other) as total_expense,
             CASE WHEN w.sewing_staff > 0 AND me.work_days > 0
               THEN ROUND((me.personnel + me.sgk + me.food + me.electricity + me.water + me.gas + me.transport + me.vehicle + me.cargo + me.machine_maint + me.thread + me.other)::numeric / (w.sewing_staff * me.work_days * 540), 2)
               ELSE 0 END as cost_per_min
      FROM monthly_expense me
      JOIN workshop w ON w.id = me.workshop_id
      ORDER BY me.year DESC, me.month DESC, cost_per_min ASC
    `

    const qualitySummary = await sql`
      SELECT w.code, w.name,
             SUM(qr.inspected_qty)::int as total_inspected,
             SUM(qr.first_pass_qty)::int as total_fpq,
             SUM(qr.rejected_qty)::int as total_rejected,
             CASE WHEN SUM(qr.inspected_qty) > 0
               THEN ROUND(SUM(qr.first_pass_qty)::numeric / SUM(qr.inspected_qty) * 100, 1)
               ELSE 0 END as fpq_rate
      FROM quality_record qr
      JOIN workshop w ON w.id = qr.workshop_id
      GROUP BY w.code, w.name
      ORDER BY fpq_rate DESC
    `

    const scoreSummary = await sql`
      SELECT w.code, w.name, ss.composite_sc, ss.tier, ss.trend,
             ss.efficiency_sc, ss.quality_sc, ss.delivery_sc, ss.cost_sc, ss.compliance_sc
      FROM supplier_score ss
      JOIN workshop w ON w.id = ss.workshop_id
      WHERE (ss.year, ss.month) = (SELECT year, month FROM supplier_score ORDER BY year DESC, month DESC LIMIT 1)
      ORDER BY ss.composite_sc DESC NULLS LAST
    `

    return { totals, workshopSummary, prodSummary, expenseSummary, qualitySummary, scoreSummary }
  })

  if (!data) redirect('/login')

  const { totals, workshopSummary, prodSummary, expenseSummary, qualitySummary, scoreSummary } = data

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Raporlar ve Analiz</h1>
        <p className="text-faint mt-1">Sistem geneli performans özeti</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Aktif Atölye</p>
          <p className="text-2xl font-bold text-ink">{Number(totals.workshop_count)}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Toplam Bant</p>
          <p className="text-2xl font-bold text-ink">{Number(totals.total_lines)}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Dikim Operatörü</p>
          <p className="text-2xl font-bold text-ink">{Number(totals.total_sewing).toLocaleString('tr-TR')}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Toplam Çalışan</p>
          <p className="text-2xl font-bold text-ink">{Number(totals.total_staff).toLocaleString('tr-TR')}</p>
        </div>
        <div className="bg-white border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Günlük Hedef</p>
          <p className="text-2xl font-bold text-ink">{Number(totals.total_daily_target).toLocaleString('tr-TR')}</p>
        </div>
      </div>

      <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-line-soft">
          <h2 className="text-lg font-semibold text-ink">Atölye Profil Özeti</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas border-b border-line-soft">
              <th className="px-4 py-3 text-left text-faint font-medium">Kod</th>
              <th className="px-4 py-3 text-left text-faint font-medium">Ad</th>
              <th className="px-4 py-3 text-center text-faint font-medium">Tip</th>
              <th className="px-4 py-3 text-left text-faint font-medium">Şehir</th>
              <th className="px-4 py-3 text-right text-faint font-medium">Dikim</th>
              <th className="px-4 py-3 text-right text-faint font-medium">Toplam</th>
              <th className="px-4 py-3 text-right text-faint font-medium">Bant</th>
              <th className="px-4 py-3 text-right text-faint font-medium">G.Hedef</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {workshopSummary.map((w, i) => (
              <tr key={i} className="hover:bg-canvas">
                <td className="px-4 py-3 text-accent font-medium">{String(w.code)}</td>
                <td className="px-4 py-3 text-ink">{String(w.name)}</td>
                <td className="px-4 py-3 text-center"><span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">{String(w.type)}</span></td>
                <td className="px-4 py-3 text-muted">{w.city ? String(w.city) : '—'}</td>
                <td className="px-4 py-3 text-right">{String(w.sewing_staff)}</td>
                <td className="px-4 py-3 text-right">{String(w.total_staff)}</td>
                <td className="px-4 py-3 text-right">{String(w.line_count)}</td>
                <td className="px-4 py-3 text-right">{Number(w.total_daily_target).toLocaleString('tr-TR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {prodSummary.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-line-soft">
            <h2 className="text-lg font-semibold text-ink">Verimlilik Sıralaması</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line-soft">
                <th className="px-4 py-3 text-center text-faint font-medium">#</th>
                <th className="px-4 py-3 text-left text-faint font-medium">Atölye</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Hedef</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Gerçekleşen</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Verimlilik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prodSummary.map((p, i) => (
                <tr key={i} className="hover:bg-canvas">
                  <td className="px-4 py-3 text-center text-faint">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">{String(p.code)} — {String(p.name)}</td>
                  <td className="px-4 py-3 text-right">{Number(p.total_target).toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right">{Number(p.total_actual).toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${TONE_TEXT[effTone(Number(p.efficiency))]}`}>%{String(p.efficiency)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expenseSummary.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-line-soft">
            <h2 className="text-lg font-semibold text-ink">Maliyet Analizi</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line-soft">
                <th className="px-4 py-3 text-left text-faint font-medium">Atölye</th>
                <th className="px-4 py-3 text-center text-faint font-medium">Dönem</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Toplam Gider</th>
                <th className="px-4 py-3 text-right text-faint font-medium">TL/dk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenseSummary.map((e, i) => (
                <tr key={i} className="hover:bg-canvas">
                  <td className="px-4 py-3 text-ink">{String(e.code)} — {String(e.name)}</td>
                  <td className="px-4 py-3 text-center text-muted">{String(e.year)}/{String(e.month)}</td>
                  <td className="px-4 py-3 text-right">{Number(e.total_expense).toLocaleString('tr-TR')} TL</td>
                  <td className="px-4 py-3 text-right font-bold text-accent">{String(e.cost_per_min)} TL/dk</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {qualitySummary.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-line-soft">
            <h2 className="text-lg font-semibold text-ink">Kalite Analizi</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line-soft">
                <th className="px-4 py-3 text-left text-faint font-medium">Atölye</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Kontrol</th>
                <th className="px-4 py-3 text-right text-faint font-medium">FPQ</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Red</th>
                <th className="px-4 py-3 text-right text-faint font-medium">FPQ %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {qualitySummary.map((q, i) => (
                <tr key={i} className="hover:bg-canvas">
                  <td className="px-4 py-3 text-ink">{String(q.code)} — {String(q.name)}</td>
                  <td className="px-4 py-3 text-right">{Number(q.total_inspected).toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right">{Number(q.total_fpq).toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right text-red-600">{Number(q.total_rejected).toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${TONE_TEXT[fpqTone(Number(q.fpq_rate))]}`}>%{String(q.fpq_rate)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scoreSummary.length > 0 && (
        <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-line-soft">
            <h2 className="text-lg font-semibold text-ink">Tedarikçi Skor Sıralaması</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line-soft">
                <th className="px-4 py-3 text-center text-faint font-medium">#</th>
                <th className="px-4 py-3 text-left text-faint font-medium">Atölye</th>
                <th className="px-4 py-3 text-right text-faint font-medium">Bileşik</th>
                <th className="px-4 py-3 text-center text-faint font-medium">Kademe</th>
                <th className="px-4 py-3 text-center text-faint font-medium">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scoreSummary.map((s, i) => (
                <tr key={i} className="hover:bg-canvas">
                  <td className="px-4 py-3 text-center text-faint">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">{String(s.code)} — {String(s.name)}</td>
                  <td className="px-4 py-3 text-right font-bold text-ink">{String(s.composite_sc)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.tier === 'Stratejik' ? 'bg-green-100 text-green-700' :
                      s.tier === 'Gelişen' ? 'bg-blue-100 text-blue-700' :
                      s.tier === 'İzlemede' ? 'bg-amber-100 text-amber-700' :
                      s.tier === 'Risk' ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>{String(s.tier)}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-lg">{s.trend === 'Artış' ? '↑' : s.trend === 'Düşüş' ? '↓' : '→'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
