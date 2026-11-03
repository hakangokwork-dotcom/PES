import { redirect } from 'next/navigation'
import { aktifAtolyeId } from '@/lib/auth/aktif-atolye'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { Suspense } from 'react'
import { Boxes, Wallet, Gauge, BarChart3 } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import DonemBar from '@/components/pes/DonemBar'
import { etkinDonem, donemEtiket, type Donem } from '@/lib/pes/donem'
import { effTone, fpqTone, TONE_TEXT, type Tone } from '@/lib/ui/tone'
import { EffTrendChart } from '@/components/pes/DashboardCharts'
import AtolyeSecici, { type AtolyeSatiri } from '@/components/pes/AtolyeSecici'

export const dynamic = 'force-dynamic'

interface Props { searchParams: Promise<{ wid?: string; donem?: string }> }

const CUBUK: Record<Tone, string> = { good: 'bg-accent', warn: 'bg-warn', bad: 'bg-danger', neutral: 'bg-line' }

export default async function WorkshopDashboard({ searchParams }: Props) {
  const { wid: widParam, donem: donemParam } = await searchParams
  const wid = await aktifAtolyeId(widParam)

  const data = await withServerTenant(async (sql, _tenantId, userId) => {
    if (!wid) {
      /* "Kim sahiplenmiş" bilgisi. auth şemasına doğrudan JOIN yapılamaz —
         uygulama pes_app rolüyle bağlanır ve o şemayı göremez; köprü
         SECURITY DEFINER fonksiyondur (migration 026). */
      const workshops = await sql`
        SELECT w.id, w.code, w.name, w.city, w.type, w.sewing_staff, w.total_staff,
               w.owner_user_id, kullanici_eposta(w.owner_user_id) AS owner_email
        FROM workshop w
        WHERE w.is_active = true
        ORDER BY w.code`
      return { mode: 'list' as const, workshops, userId }
    }

    const workshopId = wid
    const [w] = await sql`SELECT * FROM workshop WHERE id = ${workshopId}`
    if (!w) return { mode: 'notfound' as const }

    /* Dönem bu atölyenin kendi verisinden; seçim URL'de (?donem=2026-03).
       Eskiden her zaman son dönem gösteriliyordu ve veri yoksa sabit
       Ocak 2026'ya düşüyordu. */
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay
        FROM monthly_production WHERE workshop_id = ${workshopId}
       ORDER BY yil DESC, ay DESC` as unknown as Donem[]
    const secili = etkinDonem(donemParam, donemler)
    const pYear = secili.yil
    const pMonth = secili.ay

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

    /* MERKEZDEN GELENLER — atölyenin cevap vermesi ya da bilmesi gereken,
       merkezin başlattığı işler. Portalın iki yönlü akışının atölye ucu. */
    const [gelen] = await sql`
      SELECT
        (SELECT count(*)::int FROM plan_teklif
          WHERE workshop_id = ${workshopId} AND durum = 'bekliyor') AS bekleyen_teklif,
        (SELECT count(*)::int FROM work_order
          WHERE workshop_id = ${workshopId}
            AND durum NOT IN ('Tamamlandi','Sevk Edildi','İptal')
            AND teslim_tarihi IS NOT NULL AND teslim_tarihi <= CURRENT_DATE + 7) AS yaklasan_teslim`
    const [sonDenetim] = await sql`
      SELECT o.tarih::text AS tarih, o.yuzde::text AS yuzde
        FROM v_olgunluk_denetim_ozet o
        JOIN olgunluk_denetim d ON d.id = o.denetim_id
       WHERE o.workshop_id = ${workshopId} AND d.tur = 'DENETIM' AND d.durum = 'tamamlandi'
       ORDER BY o.tarih DESC, o.denetim_id DESC LIMIT 1`

    const effTrend = await sql`
      SELECT year, month, ROUND(SUM(actual_qty)::numeric / NULLIF(SUM(target_qty), 0) * 100, 1) as eff
      FROM monthly_production WHERE workshop_id = ${workshopId}
      GROUP BY year, month ORDER BY year, month`

    return { mode: 'detail' as const, w, workshopId, donemler, gelen, sonDenetim, pYear, pMonth, prodKpi, expKpi, qualKpi, downtimeKpi, changeKpi, wfKpi, bandPerf, effTrend }
  })

  if (!data) redirect('/login')

  if (data.mode === 'list') {
    return (
      <AtolyeSecici
        atolyeler={data.workshops as unknown as AtolyeSatiri[]}
        userId={data.userId}
      />
    )
  }

  if (data.mode === 'notfound') return <p className="text-faint">Atölye bulunamadı</p>

  const { w, workshopId, donemler, gelen, sonDenetim, pYear, pMonth, prodKpi, expKpi, qualKpi, downtimeKpi, changeKpi, wfKpi, bandPerf, effTrend } = data

  const totalExpense = Number(expKpi?.total ?? 0)
  const targetRevenue = Number(expKpi?.target_revenue ?? 0)
  const workDays = Number(expKpi?.work_days ?? 22)
  const sewingStaff = Number(w.sewing_staff)
  const netHours = Number(w.net_hours_day ?? 9)
  const costPerMin = (sewingStaff > 0 && workDays > 0) ? (totalExpense / (sewingStaff * workDays * netHours * 60)).toFixed(2) : '---'
  const marginPct = targetRevenue > 0 ? ((targetRevenue - totalExpense) / targetRevenue * 100).toFixed(1) : null

  const totalCapMin = sewingStaff * workDays * netHours * 60
  const downtimePct = totalCapMin > 0 ? (Number(downtimeKpi?.total_min ?? 0) / totalCapMin * 100).toFixed(1) : '0'

  /* En yeni veri 2 aydan eskiyse uyar: demo/eski veri "güncel" sanılmasın. */
  const bugun = new Date()
  const eskiVeri = donemler.length === 0 ||
    (bugun.getFullYear() * 12 + bugun.getMonth() + 1) - (donemler[0].yil * 12 + donemler[0].ay) >= 2

  const hedefVar = Number(prodKpi?.target ?? 0) > 0
  const efficiency = Number(prodKpi?.eff ?? 0)
  const fpq = qualKpi?.fpq ? Number(qualKpi.fpq) : null

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={String(w.name)}
        context={`${w.code} · ${w.city ?? '—'} · Tip ${w.type} · ${sewingStaff} dikim · ${donemEtiket({ yil: pYear, ay: pMonth })}`}
      />

      {donemler.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line-soft">
          {/* useSearchParams istemci tarafında; Suspense sınırı zorunlu. */}
          <Suspense fallback={<div className="h-[37px] bg-surface" />}>
            <DonemBar mevcut={donemler} />
          </Suspense>
        </div>
      )}

      {eskiVeri && (
        <p className="rounded-lg border border-line-soft bg-warn-soft px-4 py-2.5 text-[13px] text-body">
          {donemler.length === 0
            ? 'Bu atölyeden henüz aylık üretim verisi girilmedi; göstergeler boş.'
            : `Son üretim verisi ${donemEtiket(donemler[0])} dönemine ait. Güncel dönem girilmedikçe bu ekran eski durumu gösterir.`}
          {' '}<Link href="/workshop/production" className="font-medium text-accent-ink underline underline-offset-2">Üretim girişine git</Link>
        </p>
      )}

      <div className="rounded-xl border border-line-soft bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Merkezden gelenler</h2>
        <ul className="divide-y divide-line-soft">
          {[
            {
              href: '/workshop/plan',
              deger: String(gelen?.bekleyen_teklif ?? 0),
              metin: 'plan teklifi cevabınızı bekliyor',
              vurgu: Number(gelen?.bekleyen_teklif ?? 0) > 0,
            },
            {
              href: '/workshop/is-emri',
              deger: String(gelen?.yaklasan_teslim ?? 0),
              metin: 'iş emrinin teslimine 7 gün veya daha az kaldı',
              vurgu: Number(gelen?.yaklasan_teslim ?? 0) > 0,
            },
            {
              href: '/workshop/olgunluk',
              deger: sonDenetim?.yuzde ? `%${sonDenetim.yuzde}` : '—',
              metin: sonDenetim
                ? `son olgunluk denetimi (${String(sonDenetim.tarih).slice(0, 10).split('-').reverse().join('.')}) — süreç kırılımını görün`
                : 'henüz resmi olgunluk denetimi yok — öz değerlendirmeyle hazırlanın',
              vurgu: false,
            },
          ].map((g) => (
            <li key={g.href}>
              <Link href={g.href} className="group flex items-center gap-3 py-2">
                <span className={`w-14 shrink-0 text-right text-lg font-semibold tabular-nums ${g.vurgu ? 'text-warn' : 'text-ink'}`}>
                  {g.deger}
                </span>
                <span className="flex-1 text-sm text-body">{g.metin}</span>
                <span className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-line-soft rounded-xl p-5">
          <p className="text-xs text-faint">Verimlilik</p>
          <p className={`text-3xl font-bold ${hedefVar ? TONE_TEXT[effTone(efficiency)] : 'text-faint'}`}>
            {hedefVar ? `%${efficiency}` : '—'}
          </p>
          <p className="text-xs text-faint mt-1">H: {Number(prodKpi?.target ?? 0).toLocaleString('tr-TR')} G: {Number(prodKpi?.actual ?? 0).toLocaleString('tr-TR')}</p>
        </div>
        <div className="bg-surface border border-line-soft rounded-xl p-5">
          <p className="text-xs text-faint">TL/dk Maliyet</p>
          <p className="text-3xl font-bold text-ink">{costPerMin} <span className="text-sm text-faint">TL</span></p>
          {marginPct && <p className={`text-xs mt-1 ${Number(marginPct) >= 0 ? 'text-accent-ink' : 'text-danger'}`}>Marj: %{marginPct}</p>}
        </div>
        <div className="bg-surface border border-line-soft rounded-xl p-5">
          <p className="text-xs text-faint">Kalite (FPQ)</p>
          <p className={`text-3xl font-bold ${fpq !== null ? TONE_TEXT[fpqTone(fpq)] : 'text-faint'}`}>
            {fpq !== null ? `%${fpq}` : '---'}
          </p>
          {Number(qualKpi?.rejected ?? 0) > 0 && <p className="text-xs text-danger mt-1">Red: {Number(qualKpi?.rejected)} Tamir: {Number(qualKpi?.rework)}</p>}
        </div>
        <div className="bg-surface border border-line-soft rounded-xl p-5">
          <p className="text-xs text-faint">Duruş</p>
          <p className="text-3xl font-bold text-ink">{downtimeKpi?.total_min ?? 0} <span className="text-sm text-faint">dk</span></p>
          <p className="text-xs text-faint mt-1">Kapasite etkisi: %{downtimePct}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-canvas border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Model Değişim</p>
          <p className="text-lg font-bold text-ink">{changeKpi?.total_min ?? 0} dk</p>
          <p className="text-xs text-faint">{changeKpi?.count ?? 0} değişim</p>
        </div>
        <div className="bg-canvas border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">İşgücü devri</p>
          <p className="text-lg font-bold text-ink">%{wfKpi?.turnover_pct ?? 0}</p>
          <p className="text-xs text-faint">Giden: {wfKpi?.left_count ?? 0} Gelen: {wfKpi?.joined_count ?? 0}</p>
        </div>
        <div className="bg-canvas border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Toplam Gider</p>
          <p className="text-lg font-bold text-ink">{totalExpense > 0 ? (totalExpense / 1000000).toFixed(2) + 'M' : '---'} TL</p>
          <p className="text-xs text-faint">Günlük: {workDays > 0 ? Math.round(totalExpense / workDays).toLocaleString('tr-TR') : '---'} TL</p>
        </div>
        <div className="bg-canvas border border-line-soft rounded-xl p-4">
          <p className="text-xs text-faint">Isınma Personel</p>
          <p className="text-lg font-bold text-ink">{wfKpi?.in_warmup ?? 0} kişi</p>
          <p className="text-xs text-faint">Toplam: {wfKpi?.total_staff ?? Number(w.total_staff)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { href: `/workshop/production`, Icon: Boxes, label: 'Üretim' },
          { href: `/workshop/costs`, Icon: Wallet, label: 'Gider' },
          { href: `/workshop/quality`, Icon: Gauge, label: 'Kalite' },
          { href: `/workshop/analysis`, Icon: BarChart3, label: 'Analiz' },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className="bg-accent-soft border border-line-soft rounded-xl p-3 hover:border-accent transition-colors flex items-center gap-2.5">
            <a.Icon className="w-5 h-5 text-accent" strokeWidth={1.9} />
            <span className="text-sm font-medium text-accent-ink">{a.label}</span>
          </Link>
        ))}
      </div>

      {effTrend.length > 1 && (
        <div className="bg-surface border border-line-soft rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-2">Verimlilik Trendi</h2>
          <EffTrendChart data={effTrend as unknown as { year: number; month: number; eff: number }[]} />
        </div>
      )}

      {bandPerf.length > 0 && (
        <div className="bg-surface border border-line-soft rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-4">Bant Performansları</h2>
          <div className="space-y-3">
            {bandPerf.map((b) => {
              const bEff = Number(b.eff)
              const bOlcu = Number(b.target) > 0
              const barColor = bOlcu ? CUBUK[effTone(bEff)] : CUBUK.neutral
              return (
                <div key={String(b.code)}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-body">{String(b.code)} - {String(b.name)}</span>
                    <span className={`text-sm font-bold ${bOlcu ? TONE_TEXT[effTone(bEff)] : 'text-faint'}`}>
                      {bOlcu ? `%${bEff}` : '—'}
                    </span>
                  </div>
                  <div className="w-full bg-canvas rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full ${barColor}`} style={{ width: `${Math.min(bEff, 100)}%` }}></div>
                  </div>
                  <p className="text-xs text-faint mt-0.5">
                    H: {Number(b.target).toLocaleString('tr-TR')} G: {Number(b.actual).toLocaleString('tr-TR')} Günlük: {Number(b.daily_target).toLocaleString('tr-TR')}/gün
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
