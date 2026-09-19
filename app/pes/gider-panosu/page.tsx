import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { donemCoz, AY_ADLARI } from '@/lib/pes/donem'

/* ---------------------------------------------------------------
   Gider Panosu
   Amaç: aynı dönemin atölyelerini gider oranlarıyla yan yana koymak.
   /pes/compare üretim + kalite + skor odaklı; buradaki tablo
   YALNIZ gider yapısına bakar — G1-G8 grup payları, kişi başı gider,
   doluluk (beyan tamlığı) ve teşvikin net maliyete etkisi.

   Kaynaklar:
     v_expense_groups (021) — G1..G8 + toplam_brut/net + doluluk_orani
     workshop         — total_staff, sewing_staff, bolge
     declaration_quality — total_sc, status

   Dönem: URL ?donem=YYYY-MM; yoksa monthly_expense'te en yeni.
--------------------------------------------------------------- */
export const dynamic = 'force-dynamic'

type Satir = {
  workshop_id: number
  code: string
  name: string
  city: string | null
  bolge: number | null
  total_staff: number
  sewing_staff: number
  work_days: number
  alan_m2: number | null
  brut: number
  net: number
  tesvik: number
  doluluk: number
  quality_sc: number | null
  quality_status: string | null
  g1_iscilik: number
  g2_personel_yan: number
  g3_enerji: number
  g4_mekan: number
  g5_makine: number
  g6_sarf: number
  g7_dis_hizmet: number
  g8_diger: number
}

const G_ETIKET = {
  g1_iscilik: 'G1 İşçilik',
  g2_personel_yan: 'G2 Personel yan',
  g3_enerji: 'G3 Enerji',
  g4_mekan: 'G4 Mekân',
  g5_makine: 'G5 Makine',
  g6_sarf: 'G6 Sarf',
  g7_dis_hizmet: 'G7 Dış hizmet',
  g8_diger: 'G8 Diğer',
} as const
type GKey = keyof typeof G_ETIKET
const G_KEYS: GKey[] = Object.keys(G_ETIKET) as GKey[]
/* WCAG-uyumlu, sıra bağımlı kararlı palet — stacked bar okunabilirliği
   için aynı satırda 8 farklı renk. Tailwind sınıfları değil, SVG doldurma
   olduğundan HEX. */
const G_RENK: Record<GKey, string> = {
  g1_iscilik: '#2563eb',       // mavi — en büyük pay çoğu zaman burada
  g2_personel_yan: '#0ea5e9',  // açık mavi (kişi kaynaklı)
  g3_enerji: '#eab308',        // amber
  g4_mekan: '#a855f7',         // mor
  g5_makine: '#64748b',        // gri (sermaye)
  g6_sarf: '#10b981',          // yeşil (sarf)
  g7_dis_hizmet: '#f97316',    // turuncu
  g8_diger: '#94a3b8',         // gri açık
}

export default async function GiderPanosu({
  searchParams,
}: { searchParams: Promise<{ donem?: string; sort?: string }> }) {
  const sp = await searchParams
  const donemSecili = donemCoz(sp.donem)

  const data = await withServerTenant(async (sql) => {
    /* Mevcut dönemler yalnız gider verisinden — layout'un DonemBar'ı
       üretim tablosuna bakıyor, tek başına giderle çalışan atölyelerde
       liste boş kalıyordu. */
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay
      FROM monthly_expense
      ORDER BY yil DESC, ay DESC
    ` as Array<{ yil: number; ay: number }>

    const donem = donemSecili
      ? { yil: donemSecili.yil, ay: donemSecili.ay }
      : donemler[0]

    if (!donem) return { donem: null, donemler, satirlar: [] as Satir[] }

    /* alan_m2 kaynağı: form ham JSONB — henüz workshop kolonuna
       taşınmadı. Migration eklenene kadar staging'ten okuyoruz,
       böylece dashboard cost/m² gösterebiliyor. NULLIF ile boş/geçersiz
       değer NULL kalır; regexp_replace virgül-ondalık için. */
    const satirlar = await sql`
      SELECT
        me.workshop_id, w.code, w.name, w.city, w.bolge,
        w.total_staff, w.sewing_staff, me.work_days,
        NULLIF(
          regexp_replace(
            COALESCE(s.raw -> 'sheet1' ->> 'ÜRETİM YAPILAN ALAN KAÇ M2 DİR ?', ''),
            '[^0-9.]', '', 'g'
          ), ''
        )::float AS alan_m2,
        g.toplam_brut::float AS brut, g.toplam_net::float AS net,
        g.tesvik::float AS tesvik, g.doluluk_orani::float AS doluluk,
        q.total_sc::float AS quality_sc, q.status AS quality_status,
        g.g1_iscilik::float AS g1_iscilik,
        g.g2_personel_yan::float AS g2_personel_yan,
        g.g3_enerji::float AS g3_enerji,
        g.g4_mekan::float AS g4_mekan,
        g.g5_makine::float AS g5_makine,
        g.g6_sarf::float AS g6_sarf,
        g.g7_dis_hizmet::float AS g7_dis_hizmet,
        g.g8_diger::float AS g8_diger
      FROM monthly_expense me
      JOIN v_expense_groups g ON g.id = me.id
      JOIN workshop w ON w.id = me.workshop_id
      LEFT JOIN declaration_quality q ON q.expense_id = me.id
      LEFT JOIN expense_declaration_staging s
        ON s.id = me.current_staging_id
      WHERE me.year = ${donem.yil} AND me.month = ${donem.ay}
      ORDER BY g.toplam_brut DESC
    ` as unknown as Satir[]

    return { donem, donemler, satirlar }
  })

  if (!data) redirect('/login')
  const { donem, donemler, satirlar } = data

  if (!donem || satirlar.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-ink">Gider Panosu</h1>
        <div className="bg-white border border-line-soft rounded-xl p-8 text-center text-faint">
          Bu dönemde gider beyanı yok. <Link href="/pes/expenses/import" className="text-emerald-700 hover:underline">Gider yükle</Link> ekranını kullanın.
        </div>
      </div>
    )
  }

  const sort = sp.sort ?? 'brut'
  const siralanan = [...satirlar].sort((a, b) => {
    switch (sort) {
      case 'kisi_basi': return kisiBasi(b) - kisiBasi(a)
      case 'm2_basi':   return m2Basi(b) - m2Basi(a)
      case 'doluluk':  return b.doluluk - a.doluluk
      case 'iscilik_pay': return grupPay(b, 'g1_iscilik') - grupPay(a, 'g1_iscilik')
      case 'tesvik_etki': return tesvikEtki(b) - tesvikEtki(a)
      case 'name':     return a.name.localeCompare(b.name, 'tr')
      default:         return b.brut - a.brut
    }
  })

  const enBrutli = Math.max(...satirlar.map(s => s.brut))
  const toplamBrut = satirlar.reduce((s, r) => s + r.brut, 0)
  const toplamNet = satirlar.reduce((s, r) => s + r.net, 0)
  const toplamTesvik = satirlar.reduce((s, r) => s + r.tesvik, 0)
  const ortDoluluk = satirlar.reduce((s, r) => s + r.doluluk, 0) / satirlar.length
  const ortKisiBasi = ortalama(satirlar.map(kisiBasi).filter(v => v > 0))
  const ortM2Basi = ortalama(satirlar.map(m2Basi).filter(v => v > 0))
  /* Medyan — pantoya karşı dirençli tek referans çizgi */
  const medyanKisiBasi = medyan(satirlar.map(kisiBasi).filter(v => v > 0))

  const sortLink = (k: string, label: string) => (
    <Link
      href={`/pes/gider-panosu?donem=${donem.yil}-${String(donem.ay).padStart(2,'0')}&sort=${k}`}
      className={`text-xs rounded px-2 py-1 border ${sort === k ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-line-soft text-body hover:bg-canvas'}`}
    >{label}</Link>
  )

  const donemLink = (d: { yil: number; ay: number }) => (
    <Link
      key={`${d.yil}-${d.ay}`}
      href={`/pes/gider-panosu?donem=${d.yil}-${String(d.ay).padStart(2,'0')}&sort=${sort}`}
      className={`text-xs rounded px-2 py-1 border ${d.yil === donem.yil && d.ay === donem.ay ? 'bg-ink text-white border-ink' : 'bg-white border-line-soft text-body hover:bg-canvas'}`}
    >{AY_ADLARI[d.ay]} {d.yil}</Link>
  )

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Gider Panosu</h1>
          <p className="text-sm text-faint mt-1">
            {AY_ADLARI[donem.ay]} {donem.yil} — {satirlar.length} atölye beyanı, G1–G8 grup dağılımı ve oran karşılaştırması.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {donemler.slice(0, 6).map(donemLink)}
        </div>
      </div>

      {/* KPI şerit */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <KpiKart etiket="Toplam brüt gider" deger={fmtTL(toplamBrut)} altbilgi="Grup toplamları" />
        <KpiKart etiket="Teşvik mahsubu" deger={fmtTL(toplamTesvik)} altbilgi={`Net: ${fmtTL(toplamNet)}`} tone="green" />
        <KpiKart etiket="Medyan kişi başı" deger={fmtTL(medyanKisiBasi)} altbilgi={`Ort: ${fmtTL(ortKisiBasi)}`} />
        <KpiKart etiket="Ort. m² başı" deger={ortM2Basi > 0 ? fmtTL(ortM2Basi) : '—'} altbilgi="brüt / üretim m²" />
        <KpiKart etiket="Ort. doluluk" deger={`%${(ortDoluluk * 100).toFixed(0)}`} altbilgi="27 kalemden kaçı dolu" tone={ortDoluluk > 0.75 ? 'green' : 'amber'} />
        <KpiKart etiket="Kabul edilen" deger={`${satirlar.filter(s => s.quality_status === 'accepted').length}/${satirlar.length}`} altbilgi="declaration_quality" />
      </div>

      {/* Sıralama */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-faint mr-1">Sırala:</span>
        {sortLink('brut', 'Brüt gider')}
        {sortLink('kisi_basi', 'Kişi başı gider')}
        {sortLink('m2_basi', 'm² başı gider')}
        {sortLink('iscilik_pay', 'İşçilik payı %')}
        {sortLink('doluluk', 'Beyan doluluk')}
        {sortLink('tesvik_etki', 'Teşvik etkisi %')}
        {sortLink('name', 'Ad (A→Z)')}
      </div>

      {/* Ana tablo */}
      <div className="bg-white border border-line-soft rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-canvas border-b border-line-soft flex items-center justify-between">
          <h2 className="text-sm font-semibold text-body">Atölye karşılaştırma</h2>
          <span className="text-[11px] text-faint">Renkli çubuk: G1–G8 grup payları (yatay = %100)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-faint border-b border-line-soft">
                <th className="text-left px-3 py-2">Atölye</th>
                <th className="text-right px-2 py-2">Personel</th>
                <th className="text-right px-2 py-2">Alan m²</th>
                <th className="text-right px-2 py-2">Brüt</th>
                <th className="text-right px-2 py-2">Net</th>
                <th className="text-right px-2 py-2">Kişi başı</th>
                <th className="text-right px-2 py-2">m² başı</th>
                <th className="text-right px-2 py-2">İşçilik %</th>
                <th className="text-right px-2 py-2">Doluluk</th>
                <th className="text-left px-3 py-2 min-w-[220px]">Grup dağılımı</th>
              </tr>
            </thead>
            <tbody>
              {siralanan.map(r => {
                const kb = kisiBasi(r)
                const m2 = m2Basi(r)
                const iscilikPay = grupPay(r, 'g1_iscilik')
                return (
                  <tr key={r.workshop_id} className="border-b border-line-soft hover:bg-canvas">
                    <td className="px-3 py-2">
                      <Link href={`/workshop?wid=${r.workshop_id}`} className="text-emerald-700 hover:underline font-medium">{r.code}</Link>
                      <span className="text-faint ml-1 text-xs">{r.name}</span>
                      {r.bolge && <span className="ml-1 text-[10px] text-faint">B{r.bolge}</span>}
                    </td>
                    <td className="text-right px-2 py-2 font-mono">{r.total_staff.toLocaleString('tr-TR')}</td>
                    <td className="text-right px-2 py-2 font-mono">{r.alan_m2 ? r.alan_m2.toLocaleString('tr-TR') : '—'}</td>
                    <td className="text-right px-2 py-2 font-mono">{fmtTL(r.brut)}</td>
                    <td className="text-right px-2 py-2 font-mono text-emerald-700">{fmtTL(r.net)}</td>
                    <td className="text-right px-2 py-2 font-mono">{kb > 0 ? fmtTL(kb) : '—'}</td>
                    <td className="text-right px-2 py-2 font-mono">{m2 > 0 ? fmtTL(m2) : '—'}</td>
                    <td className="text-right px-2 py-2 font-mono">{(iscilikPay * 100).toFixed(0)}%</td>
                    <td className="text-right px-2 py-2 font-mono">
                      <span title={r.quality_status ?? ''}>{(r.doluluk * 100).toFixed(0)}%</span>
                    </td>
                    <td className="px-3 py-2">
                      <StackedGrup satir={r} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Brüt gider bar chart */}
      <div className="bg-white border border-line-soft rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-canvas border-b border-line-soft">
          <h2 className="text-sm font-semibold text-body">Brüt gider — büyükten küçüğe</h2>
        </div>
        <div className="p-4 space-y-1.5">
          {[...satirlar].sort((a, b) => b.brut - a.brut).map(r => (
            <div key={r.workshop_id} className="flex items-center gap-3 text-xs">
              <div className="w-40 shrink-0 text-body">{r.code} <span className="text-faint">{r.name}</span></div>
              <div className="flex-1 h-4 bg-canvas rounded overflow-hidden relative">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${enBrutli > 0 ? (r.brut / enBrutli * 100) : 0}%` }}
                />
              </div>
              <div className="w-32 text-right font-mono">{fmtTL(r.brut)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Grup lejantı */}
      <div className="bg-white border border-line-soft rounded-xl p-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <span className="text-faint">Grup lejantı:</span>
        {G_KEYS.map(k => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: G_RENK[k] }} />
            <span className="text-body">{G_ETIKET[k]}</span>
          </span>
        ))}
      </div>

      {/* Uyarı: veri kalitesi */}
      {satirlar.some(s => s.quality_status === 'pending_fix') && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
          <strong>Not:</strong> {satirlar.filter(s => s.quality_status === 'pending_fix').length} atölye beyanı düşük dolulukla işaretli (pending_fix).
          Karşılaştırma yaparken doluluk sütununa dikkat.
        </div>
      )}
    </div>
  )
}

/* ---------------- yardımcılar ---------------- */
function kisiBasi(r: Satir): number {
  return r.total_staff > 0 ? r.brut / r.total_staff : 0
}
function m2Basi(r: Satir): number {
  return r.alan_m2 && r.alan_m2 > 0 ? r.brut / r.alan_m2 : 0
}
function grupPay(r: Satir, k: GKey): number {
  return r.brut > 0 ? r[k] / r.brut : 0
}
function tesvikEtki(r: Satir): number {
  return r.brut > 0 ? r.tesvik / r.brut : 0
}
function ortalama(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}
function medyan(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function fmtTL(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M ₺'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + ' bin ₺'
  return n.toLocaleString('tr-TR') + ' ₺'
}

/* Stacked yatay grup çubuğu — 8 grup, %100 genişliğinde. */
function StackedGrup({ satir }: { satir: Satir }) {
  const toplam = G_KEYS.reduce((s, k) => s + satir[k], 0)
  if (toplam === 0) return <span className="text-xs text-faint">—</span>
  return (
    <div className="flex h-4 w-full rounded overflow-hidden border border-line-soft">
      {G_KEYS.map(k => {
        const p = satir[k] / toplam
        if (p <= 0) return null
        const yuzde = (p * 100).toFixed(1)
        return (
          <div
            key={k}
            title={`${G_ETIKET[k]}: ${yuzde}%`}
            style={{ width: `${p * 100}%`, background: G_RENK[k] }}
          />
        )
      })}
    </div>
  )
}

/* KPI Kart */
function KpiKart({
  etiket, deger, altbilgi, tone,
}: { etiket: string; deger: string; altbilgi?: string; tone?: 'green' | 'amber' }) {
  const val =
    tone === 'green' ? 'text-emerald-700'
    : tone === 'amber' ? 'text-amber-700'
    : 'text-ink'
  return (
    <div className="bg-white border border-line-soft rounded-xl p-4">
      <p className="text-xs text-faint">{etiket}</p>
      <p className={`text-2xl font-bold ${val}`}>{deger}</p>
      {altbilgi && <p className="text-[11px] text-faint mt-0.5">{altbilgi}</p>}
    </div>
  )
}
