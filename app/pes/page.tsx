import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import {
  Building2, Layers, Wallet, Boxes, Star, ClipboardList, LineChart as LineIcon,
  BarChart3, Gauge, TrendingUp, TrendingDown, Minus, ArrowRight,
} from 'lucide-react'
import { EffTrendChart, WorkshopEffBar, TierDonut } from '@/components/pes/DashboardCharts'

export const dynamic = 'force-dynamic'

export default async function PesDashboard() {
  const data = await withServerTenant(async (sql) => {
    const [wc] = await sql`SELECT COUNT(*)::int as c FROM workshop WHERE is_active = true`
    const [lc] = await sql`SELECT COUNT(*)::int as c FROM production_line WHERE is_active = true`
    const [ec] = await sql`SELECT COUNT(*)::int as c FROM monthly_expense`
    const [pc] = await sql`SELECT COUNT(*)::int as c FROM monthly_production`
    const [woc] = await sql`SELECT COUNT(*)::int as c FROM work_order`

    const [eff] = await sql`
      SELECT ROUND(AVG(CASE WHEN target_qty > 0 THEN actual_qty::numeric / target_qty * 100 ELSE NULL END), 1) as avg_eff
      FROM monthly_production
      WHERE (year, month) = (SELECT year, month FROM monthly_production ORDER BY year DESC, month DESC LIMIT 1)`

    const effTrend = await sql`
      SELECT year, month, ROUND(AVG(CASE WHEN target_qty > 0 THEN actual_qty::numeric / target_qty * 100 ELSE NULL END), 1) as eff
      FROM monthly_production GROUP BY year, month ORDER BY year, month`

    const wsEff = await sql`
      SELECT w.code, ROUND(SUM(mp.actual_qty)::numeric / NULLIF(SUM(mp.target_qty), 0) * 100, 1) as eff
      FROM monthly_production mp JOIN workshop w ON w.id = mp.workshop_id
      WHERE (mp.year, mp.month) = (SELECT year, month FROM monthly_production ORDER BY year DESC, month DESC LIMIT 1)
      GROUP BY w.code ORDER BY eff DESC`

    const tierDist = await sql`
      SELECT tier, COUNT(*)::int as c FROM supplier_score
      WHERE (year, month) = (SELECT year, month FROM supplier_score ORDER BY year DESC, month DESC LIMIT 1)
      GROUP BY tier`

    const recentProd = await sql`
      SELECT w.code, w.name, mp.year, mp.month,
             SUM(mp.actual_qty) as total_actual, SUM(mp.target_qty) as total_target,
             CASE WHEN SUM(mp.target_qty) > 0 THEN ROUND(SUM(mp.actual_qty)::numeric / SUM(mp.target_qty) * 100, 1) ELSE 0 END as eff,
             ss.tier
      FROM monthly_production mp
      JOIN workshop w ON w.id = mp.workshop_id
      LEFT JOIN supplier_score ss ON ss.workshop_id = mp.workshop_id AND ss.year = mp.year AND ss.month = mp.month
      WHERE (mp.year, mp.month) = (SELECT year, month FROM monthly_production ORDER BY year DESC, month DESC LIMIT 1)
      GROUP BY w.code, w.name, mp.year, mp.month, ss.tier
      ORDER BY eff DESC LIMIT 8`

    return { wc, lc, ec, pc, woc, avgEff: eff?.avg_eff ?? null, effTrend, wsEff, tierDist, recentProd }
  })

  if (!data) redirect('/login')

  const { wc, lc, ec, pc, woc, avgEff, effTrend, wsEff, tierDist, recentProd } = data

  const trendDelta = effTrend.length >= 2 ? Number(effTrend.at(-1)!.eff) - Number(effTrend.at(-2)!.eff) : 0

  const stats = [
    { label: 'Aktif Atölye', value: wc?.c ?? 0, href: '/pes/workshops', Icon: Building2, tint: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Aktif Bant', value: lc?.c ?? 0, href: '/pes/workshops', Icon: Layers, tint: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Açık İş Emri', value: woc?.c ?? 0, href: '/workshop/is-emri', Icon: ClipboardList, tint: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Üretim Kaydı', value: pc?.c ?? 0, href: '/pes/production', Icon: Boxes, tint: 'text-amber-600', bg: 'bg-amber-50' },
  ]

  const quickActions = [
    { label: 'Atölyeler', href: '/pes/workshops', Icon: Building2 },
    { label: 'Skorlama', href: '/pes/scoring', Icon: Star },
    { label: 'Üretim', href: '/pes/production', Icon: Boxes },
    { label: 'Kalite', href: '/pes/quality', Icon: Gauge },
    { label: 'Karşılaştırma', href: '/pes/compare', Icon: BarChart3 },
    { label: 'Raporlar', href: '/pes/reports', Icon: LineIcon },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Merkez Paneli</h1>
          <p className="text-gray-500 mt-1">Atölye Verimlilik Değerlendirme Sistemi</p>
        </div>
        <span className="text-xs text-gray-400 hidden sm:block">
          {effTrend.length ? `Son dönem: ${effTrend.at(-1)!.month}/${effTrend.at(-1)!.year}` : ''}
        </span>
      </div>

      {/* Stat kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => (
          <Link key={s.label} href={s.href}
            className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-[#197A56] hover:shadow-sm transition-all">
            <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
              <s.Icon className={`w-5 h-5 ${s.tint}`} strokeWidth={2} />
            </div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">{s.label}
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
            </div>
          </Link>
        ))}
      </div>

      {/* Grafikler */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Verimlilik trendi */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-900">Ortalama Verimlilik Trendi</h2>
            {avgEff !== null && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-gray-900">%{avgEff}</span>
                <span className={`flex items-center gap-0.5 text-xs font-medium ${trendDelta > 0 ? 'text-emerald-600' : trendDelta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {trendDelta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : trendDelta < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                  {trendDelta > 0 ? '+' : ''}{trendDelta.toFixed(1)}
                </span>
              </div>
            )}
          </div>
          {effTrend.length > 0
            ? <EffTrendChart data={effTrend as { year: number; month: number; eff: number }[]} />
            : <EmptyMini text="Üretim verisi bekleniyor" />}
        </div>

        {/* Tedarikçi kademe dağılımı */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Tedarikçi Kademeleri</h2>
          {tierDist.length > 0
            ? <TierDonut data={tierDist as { tier: string; c: number }[]} />
            : <EmptyMini text="Henüz skorlama yok" />}
        </div>
      </div>

      {/* Atölye verimlilik sıralaması + son üretim */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Atölye Verimlilik Sıralaması</h2>
          {wsEff.length > 0
            ? <WorkshopEffBar data={wsEff as { code: string; eff: number }[]} />
            : <EmptyMini text="Üretim verisi bekleniyor" />}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Son Dönem Üretim</h2>
          <div className="space-y-1">
            {recentProd.map((r: Record<string, unknown>, i: number) => {
              const eff = Number(r.eff)
              return (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-[#197A56] font-semibold text-sm w-14">{String(r.code)}</span>
                  <span className="text-gray-600 text-sm truncate flex-1">{String(r.name)}</span>
                  <span className="text-gray-400 text-xs tabular-nums hidden sm:block">{Number(r.total_actual).toLocaleString('tr-TR')}</span>
                  <span className={`text-sm font-bold tabular-nums w-14 text-right ${eff >= 90 ? 'text-emerald-600' : eff >= 75 ? 'text-amber-600' : 'text-red-600'}`}>%{eff}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Hızlı erişim */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Hızlı Erişim</h2>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          {quickActions.map(a => (
            <Link key={a.label} href={a.href}
              className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col items-center gap-1.5 hover:border-[#197A56] hover:bg-emerald-50/40 transition-colors">
              <a.Icon className="w-5 h-5 text-gray-400" strokeWidth={1.8} />
              <span className="text-xs text-gray-700">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="h-[180px] flex flex-col items-center justify-center text-center">
      <BarChart3 className="w-8 h-8 text-gray-200 mb-2" />
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  )
}
