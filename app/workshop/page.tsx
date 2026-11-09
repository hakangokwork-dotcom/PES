import { redirect } from 'next/navigation'
import { aktifAtolyeId } from '@/lib/auth/aktif-atolye'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { Suspense } from 'react'
import { Boxes, Wallet, Gauge, CirclePause, ClipboardCheck } from 'lucide-react'
import { Card, CardBody, CardHeader, LinkButton, Metric, PageHeader } from '@/components/ui'
import DonemBar from '@/components/pes/DonemBar'
import { etkinDonem, donemEtiket, type Donem } from '@/lib/pes/donem'
import { effTone, fpqTone, devirTone, TONE_BAR, TONE_ETIKET, TONE_TEXT, type Tone } from '@/lib/ui/tone'
import { sayi, tl, yuzde } from '@/lib/ui/sayi'
import { EffTrendChart } from '@/components/pes/DashboardCharts'
import AtolyeSecici, { type AtolyeSatiri } from '@/components/pes/AtolyeSecici'

export const dynamic = 'force-dynamic'

interface Props { searchParams: Promise<{ wid?: string; donem?: string }> }


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
      SELECT total_staff, left_count, joined_count, in_warmup, devir_orani
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
  const totalCapMin = sewingStaff * workDays * netHours * 60
  const costPerMin = totalCapMin > 0 ? totalExpense / totalCapMin : null
  const marj = targetRevenue > 0 ? (targetRevenue - totalExpense) / targetRevenue * 100 : null
  const downtimePct = totalCapMin > 0 ? Number(downtimeKpi?.total_min ?? 0) / totalCapMin * 100 : null

  /* En yeni veri 2 aydan eskiyse uyar: demo/eski veri "güncel" sanılmasın. */
  const bugun = new Date()
  const eskiVeri = donemler.length === 0 ||
    (bugun.getFullYear() * 12 + bugun.getMonth() + 1) - (donemler[0].yil * 12 + donemler[0].ay) >= 2

  const hedefVar = Number(prodKpi?.target ?? 0) > 0
  const efficiency = hedefVar ? Number(prodKpi?.eff ?? 0) : null
  const fpq = qualKpi?.fpq == null ? null : Number(qualKpi.fpq)
  const devir = wfKpi?.devir_orani == null ? null : Number(wfKpi.devir_orani)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={String(w.name)}
        context={`${w.code} · ${w.city ?? '—'} · Tip ${w.type} · ${sayi(sewingStaff)} dikim · ${donemEtiket({ yil: pYear, ay: pMonth })}`}
        actions={
          <LinkButton href="/workshop/gunluk-uretim" variant="primary" size="lg" icon={<ClipboardCheck className="size-4" />}>
            Bugünkü üretimi gir
          </LinkButton>
        }
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
          {' '}<Link href="/workshop/production" className="font-medium text-accent-ink underline underline-offset-2">Aylık üretim girişine git</Link>
        </p>
      )}

      <Card>
        <CardHeader title="Merkezden gelenler" />
        <ul className="divide-y divide-line-soft px-4">
          {[
            {
              href: '/workshop/plan',
              deger: sayi(gelen?.bekleyen_teklif ?? 0),
              metin: 'plan teklifi cevabınızı bekliyor',
              vurgu: Number(gelen?.bekleyen_teklif ?? 0) > 0,
            },
            {
              href: '/workshop/is-emri',
              deger: sayi(gelen?.yaklasan_teslim ?? 0),
              metin: 'iş emrinin teslimine 7 gün veya daha az kaldı',
              vurgu: Number(gelen?.yaklasan_teslim ?? 0) > 0,
            },
            {
              href: '/workshop/olgunluk',
              deger: yuzde(sonDenetim?.yuzde),
              metin: sonDenetim
                ? `son olgunluk denetimi (${String(sonDenetim.tarih).slice(0, 10).split('-').reverse().join('.')}) — süreç kırılımını görün`
                : 'henüz resmi olgunluk denetimi yok — öz değerlendirmeyle hazırlanın',
              vurgu: false,
            },
          ].map((g) => (
            <li key={g.href}>
              <Link href={g.href} className="group flex items-center gap-3 py-2.5">
                <span className={`num w-14 shrink-0 text-right text-lg font-semibold ${g.vurgu ? 'text-warn' : 'text-ink'}`}>
                  {g.deger}
                </span>
                <span className="flex-1 text-sm text-body">{g.metin}</span>
                <span className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Gosterge etiket="Verimlilik" deger={yuzde(efficiency)} ton={effTone(efficiency)}
          alt={`Hedef ${sayi(prodKpi?.target)} · Gerçekleşen ${sayi(prodKpi?.actual)} adet`} />
        <Gosterge etiket="Dakika maliyeti" deger={tl(costPerMin, 2)}
          alt={marj == null ? 'Hedef ciro girilmedi' : `Marj ${yuzde(marj)}`} />
        <Gosterge etiket="Kalite (ilk geçiş)" deger={yuzde(fpq)} ton={fpqTone(fpq)}
          alt={Number(qualKpi?.rejected ?? 0) > 0 ? `Red ${sayi(qualKpi?.rejected)} · Tamir ${sayi(qualKpi?.rework)} adet` : undefined} />
        <Gosterge etiket="Duruş" deger={`${sayi(downtimeKpi?.total_min ?? 0)} dk`}
          alt={`Kapasite kaybı ${yuzde(downtimePct)}`} />
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 lg:grid-cols-4">
          <Ikincil etiket="Model değişimi" deger={`${sayi(changeKpi?.total_min ?? 0)} dk`} alt={`${sayi(changeKpi?.count ?? 0)} değişim`} />
          <Ikincil etiket="İşgücü devri" deger={yuzde(devir)} sinif={TONE_TEXT[devirTone(devir)]}
            alt={`Ayrılan ${sayi(wfKpi?.left_count ?? 0)} · Başlayan ${sayi(wfKpi?.joined_count ?? 0)}`} />
          <Ikincil etiket="Aylık gider" deger={totalExpense > 0 ? tl(totalExpense) : '—'}
            alt={totalExpense > 0 && workDays > 0 ? `Günlük ${tl(totalExpense / workDays)}` : undefined} />
          <Ikincil etiket="Isınma sürecinde" deger={`${sayi(wfKpi?.in_warmup ?? 0)} kişi`}
            alt={`Toplam ${sayi(wfKpi?.total_staff ?? w.total_staff)} kişi`} />
        </dl>
      </Card>

      <nav aria-label="Hızlı erişim" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { href: `/workshop/production`, Icon: Boxes, label: 'Aylık üretim' },
          { href: `/workshop/quality`, Icon: Gauge, label: 'Kalite' },
          { href: `/workshop/downtime`, Icon: CirclePause, label: 'Duruş' },
          { href: `/workshop/costs`, Icon: Wallet, label: 'Gider' },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className="bg-accent-soft border border-line-soft rounded-lg p-3 hover:border-accent transition-colors flex items-center gap-2.5">
            <a.Icon className="w-5 h-5 text-accent" strokeWidth={1.9} />
            <span className="text-sm font-medium text-accent-ink">{a.label}</span>
          </Link>
        ))}
      </nav>

      {effTrend.length > 1 && (
        <Card>
          <CardHeader title="Verimlilik trendi" />
          <CardBody>
            <EffTrendChart data={effTrend as unknown as { year: number; month: number; eff: number }[]} />
          </CardBody>
        </Card>
      )}

      {bandPerf.length > 0 && (
        <Card>
          <CardHeader title="Bant performansları" />
          <CardBody className="space-y-4">
            {bandPerf.map((b) => {
              const bOlcu = Number(b.target) > 0
              const bEff = bOlcu ? Number(b.eff) : null
              const ton = effTone(bEff)
              return (
                <div key={String(b.code)}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-body">{String(b.code)} · {String(b.name)}</span>
                    <span className={`num text-sm font-semibold ${bOlcu ? TONE_TEXT[ton] : 'text-faint'}`}>
                      {yuzde(bEff)}{TONE_ETIKET[ton] && <span className="ml-1.5 text-xs font-medium">{TONE_ETIKET[ton]}</span>}
                    </span>
                  </div>
                  <div className="w-full bg-canvas rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full ${TONE_BAR[ton]}`} style={{ width: `${Math.min(bEff ?? 0, 100)}%` }}></div>
                  </div>
                  <p className="num text-xs text-faint mt-0.5">
                    Hedef {sayi(b.target)} · Gerçekleşen {sayi(b.actual)} · Günlük hedef {sayi(b.daily_target)} adet
                  </p>
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

/* Ana göstergeler: eşiği olan değerde renk sözcükle birlikte (renk tek taşıyıcı değil). */
function Gosterge({ etiket, deger, ton = 'neutral', alt }: { etiket: string; deger: string; ton?: Tone; alt?: string }) {
  return (
    <Card>
      <CardBody>
        <p className="mb-1 text-xs text-faint">{etiket}</p>
        <Metric value={deger} delta={TONE_ETIKET[ton] || undefined} tone={ton} />
        {alt && <p className="num mt-1 text-xs text-faint">{alt}</p>}
      </CardBody>
    </Card>
  )
}

function Ikincil({ etiket, deger, alt, sinif = 'text-ink' }: { etiket: string; deger: string; alt?: string; sinif?: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{etiket}</dt>
      <dd className={`num text-lg font-semibold ${sinif}`}>{deger}</dd>
      {alt && <dd className="num text-xs text-faint">{alt}</dd>}
    </div>
  )
}
