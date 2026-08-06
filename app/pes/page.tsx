import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import {
  Building2, Layers, Wallet, Boxes, Star, ClipboardList, LineChart as LineIcon,
  BarChart3, Gauge, TrendingUp, TrendingDown, Minus, ArrowRight,
} from 'lucide-react'
import { EffTrendChart, WorkshopEffBar, TierDonut } from '@/components/pes/DashboardCharts'
import { effTone, TONE_TEXT } from '@/lib/ui/tone'

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

    /* DİKKAT GEREKTİRENLER — panonun asıl işi.
       "Aktif Atölye: 12" bir yöneticinin sabah ilk sorusu değil; "bugün
       neye bakmam lazım" öyle. Her satır ilgili ekrana gider. */
    /* DISTINCT workshop_id: view atölye x denetim tipi başına satır
       veriyor. count(*) kullanılırsa iki denetimi de dolmuş bir atölye
       iki kez sayılır ve "74 atölye" gibi gerçekte olmayan bir sayı çıkar. */
    const [denetim] = await sql`
      SELECT
        count(DISTINCT workshop_id) FILTER (WHERE durum = 'SURESI_DOLMUS')::int AS dolmus,
        count(DISTINCT workshop_id) FILTER (WHERE durum = 'YAKLASIYOR')::int    AS yaklasan
      FROM v_atolye_denetim_durum WHERE is_active`

    const [eksikBeyan] = await sql`
      SELECT count(*)::int AS c
      FROM workshop w
      WHERE w.is_active
        AND NOT EXISTS (
          SELECT 1 FROM monthly_expense me
          WHERE me.workshop_id = w.id
            AND (me.year, me.month) =
                (SELECT year, month FROM monthly_production ORDER BY year DESC, month DESC LIMIT 1))`

    const [gecikenIs] = await sql`
      SELECT count(*)::int AS c
      FROM work_order
      WHERE durum NOT IN ('Tamamlandi','Sevk Edildi','İptal')
        AND teslim_tarihi IS NOT NULL
        AND teslim_tarihi <= CURRENT_DATE + 7`

    const [dusukVerim] = await sql`
      SELECT count(*)::int AS c FROM (
        SELECT mp.workshop_id,
               SUM(mp.actual_qty)::numeric / NULLIF(SUM(mp.target_qty), 0) * 100 AS eff
        FROM monthly_production mp
        WHERE (mp.year, mp.month) =
              (SELECT year, month FROM monthly_production ORDER BY year DESC, month DESC LIMIT 1)
        GROUP BY mp.workshop_id
      ) t WHERE t.eff < 75`

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

    return { denetim, eksikBeyan, gecikenIs, dusukVerim, wc, lc, ec, pc, woc, avgEff: eff?.avg_eff ?? null, effTrend, wsEff, tierDist, recentProd }
  })

  if (!data) redirect('/login')

  const { denetim, eksikBeyan, gecikenIs, dusukVerim, wc, lc, ec, pc, woc, avgEff, effTrend, wsEff, tierDist, recentProd } = data

  const trendDelta = effTrend.length >= 2 ? Number(effTrend.at(-1)!.eff) - Number(effTrend.at(-2)!.eff) : 0

  /* Sayımlar artık kart değil, başlığın altında ince bir şerit.
     Dört büyük rakam ekranın en değerli yerini kaplıyordu ama hiçbiri
     eyleme çağırmıyordu. */
  const serit = [
    { etiket: 'aktif atölye', deger: wc?.c ?? 0, href: '/pes/workshops' },
    { etiket: 'aktif bant', deger: lc?.c ?? 0, href: '/pes/workshops' },
    { etiket: 'iş emri', deger: woc?.c ?? 0, href: '/workshop/is-emri' },
    { etiket: 'üretim kaydı', deger: pc?.c ?? 0, href: '/pes/production' },
    { etiket: 'gider kaydı', deger: ec?.c ?? 0, href: '/pes/costs' },
  ]

  const dikkat = [
    {
      sayi: denetim?.dolmus ?? 0,
      metin: 'atölyenin denetim süresi dolmuş',
      href: '/pes/atolye-profil',
      agir: true,
    },
    {
      sayi: denetim?.yaklasan ?? 0,
      metin: 'atölyenin denetimi 90 gün içinde doluyor',
      href: '/pes/atolye-profil',
      agir: false,
    },
    {
      sayi: dusukVerim?.c ?? 0,
      metin: 'atölye son dönemde %75 verimliliğin altında',
      href: '/pes/compare',
      agir: true,
    },
    {
      sayi: gecikenIs?.c ?? 0,
      metin: 'iş emrinin teslimine 7 gün veya daha az kaldı',
      href: '/workshop/is-emri',
      agir: true,
    },
    {
      sayi: eksikBeyan?.c ?? 0,
      metin: 'atölye son dönem gider beyanını vermemiş',
      href: '/pes/costs',
      agir: false,
    },
  ].filter(d => d.sayi > 0)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-bold text-ink">Merkez Paneli</h1>
          <span className="hidden text-xs text-faint sm:block">
            {effTrend.length ? `Son dönem: ${effTrend.at(-1)!.month}/${effTrend.at(-1)!.year}` : ''}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-faint">
          {serit.map((x, i) => (
            <span key={x.etiket} className="flex items-center gap-1">
              {i > 0 && <span className="mr-2 text-line">·</span>}
              <Link href={x.href} className="text-ink tabular-nums hover:text-accent hover:underline">
                {x.deger}
              </Link>
              {x.etiket}
            </span>
          ))}
        </p>
      </div>

      {/* Dikkat gerektirenler — panonun en üstü, en değerli yeri */}
      <div className="rounded-xl border border-line-soft bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Dikkat gerektirenler</h2>
        {dikkat.length === 0 ? (
          <p className="text-sm text-faint">Bekleyen bir şey görünmüyor.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {dikkat.map(d => (
              <li key={d.metin}>
                <Link href={d.href} className="group flex items-center gap-3 py-2">
                  <span className={`w-10 shrink-0 text-right text-lg font-semibold tabular-nums ${d.agir ? 'text-danger' : 'text-warn'}`}>
                    {d.sayi}
                  </span>
                  <span className="flex-1 text-sm text-body">{d.metin}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Grafikler */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Verimlilik trendi */}
        <div className="lg:col-span-2 bg-white border border-line-soft rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-ink">Ortalama Verimlilik Trendi</h2>
            {avgEff !== null && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-ink">%{avgEff}</span>
                <span className={`flex items-center gap-0.5 text-xs font-medium ${trendDelta > 0 ? 'text-emerald-600' : trendDelta < 0 ? 'text-red-600' : 'text-faint'}`}>
                  {trendDelta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : trendDelta < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                  {trendDelta > 0 ? '+' : ''}{trendDelta.toFixed(1)}
                </span>
              </div>
            )}
          </div>
          {effTrend.length > 0
            ? <EffTrendChart data={effTrend as unknown as { year: number; month: number; eff: number }[]} />
            : <EmptyMini text="Üretim verisi bekleniyor" />}
        </div>

        {/* Tedarikçi kademe dağılımı */}
        <div className="bg-white border border-line-soft rounded-xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">Tedarikçi Kademeleri</h2>
          {tierDist.length > 0
            ? <TierDonut data={tierDist as unknown as { tier: string; c: number }[]} />
            : <EmptyMini text="Henüz skorlama yok" />}
        </div>
      </div>

      {/* Atölye verimlilik sıralaması + son üretim */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border border-line-soft rounded-xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">Atölye Verimlilik Sıralaması</h2>
          {wsEff.length > 0
            ? <WorkshopEffBar data={wsEff as unknown as { code: string; eff: number }[]} />
            : <EmptyMini text="Üretim verisi bekleniyor" />}
        </div>

        <div className="bg-white border border-line-soft rounded-xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">Son Dönem Üretim</h2>
          <div className="space-y-1">
            {recentProd.map((r: Record<string, unknown>, i: number) => {
              const eff = Number(r.eff)
              return (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-line-soft last:border-0">
                  <span className="text-accent font-semibold text-sm w-14">{String(r.code)}</span>
                  <span className="text-muted text-sm truncate flex-1">{String(r.name)}</span>
                  <span className="text-faint text-xs tabular-nums hidden sm:block">{Number(r.total_actual).toLocaleString('tr-TR')}</span>
                  <span className={`text-sm font-bold tabular-nums w-14 text-right ${TONE_TEXT[effTone(eff)]}`}>%{eff}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

    </div>
  )
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="h-[180px] flex flex-col items-center justify-center text-center">
      <BarChart3 className="w-8 h-8 text-faint mb-2" />
      <p className="text-sm text-faint">{text}</p>
    </div>
  )
}
