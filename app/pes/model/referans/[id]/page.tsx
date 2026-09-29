import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { donemCoz, donemYaz } from '@/lib/pes/donem'
import { referansTablosu, varsayilanDonem } from '@/lib/pes/referans-sorgu'
import { modelSayisiTahmini } from '@/lib/pes/referans-model'
import { GUVEN_RENK, GUVEN_ACIKLAMA } from '../guven'

/**
 * /pes/model/referans/[id] — bir ürün tipinin referans modeli: bölge
 * kırılımı, her parçanın ortalama modele katkısı ve altı bölgenin fiyatı.
 * Katkı = min(1, görülme ÷ N_bölge) × medyan süre (lib/pes/referans-model.ts).
 */
export const dynamic = 'force-dynamic'

const dk = (sn: number | null) => (sn === null ? '—' : (sn / 60).toFixed(2))
const tl = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Parca = {
  bolge: string; ek_parca_ad: string; gorulme: number
  sn_medyan: number; sn_min: number; sn_max: number; op_sayisi: number
}

export default async function ReferansModelDetay({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ donem?: string }> }) {
  const { id } = await params
  const urunTipiId = Number(id)
  if (!Number.isInteger(urunTipiId)) notFound()
  const sp = await searchParams
  const d = donemCoz(sp.donem)
  const donem = d ? donemYaz(d) : varsayilanDonem()

  const data = await withServerTenant(async (sql) => {
    const tablo = await referansTablosu(sql, donem)
    const parcalar = await sql`
      SELECT bolge, ek_parca_ad, gorulme, sn_medyan::float AS sn_medyan,
             sn_min::float AS sn_min, sn_max::float AS sn_max, op_sayisi
      FROM ref_parca_sure WHERE urun_tipi_id = ${urunTipiId}` as unknown as Parca[]
    return { tablo, parcalar }
  })
  if (!data) redirect('/login')
  const s = data.tablo.satirlar.find((x) => x.urunTipiId === urunTipiId)
  if (!s) notFound()

  const bolgeler = Object.keys(data.tablo.dkMaliyet).map(Number).sort()
  const top = s.sure.kesimSn === null || s.sure.ukpSn === null ? null : s.sure.kesimSn + s.sure.dikimSn + s.sure.ukpSn

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <p className="text-sm">
          <Link href={`/pes/model/referans?donem=${donem}`} className="underline text-slate-500">← Referans model fiyatları</Link>
        </p>
        <h1 className="text-xl font-semibold flex items-center gap-3 flex-wrap">
          {s.klasman}
          <span className={`text-xs px-2 py-0.5 rounded ${GUVEN_RENK[s.guven]}`}>
            {s.guven} · {GUVEN_ACIKLAMA[s.guven]}
          </span>
        </h1>
        <p className="text-sm text-slate-500">
          {s.urunGrubu ?? '—'} · {s.segment ?? '—'} · tahmini {s.modelSayisi} model · {s.parcaSayisi} farklı parça ·{' '}
          <Link href={`/pes/model/kutuphane?tip=${urunTipiId}`} className="underline">kütüphanede aç →</Link>
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="border rounded p-4">
          <h2 className="font-medium mb-2">Standart süre</h2>
          <table className="text-sm w-full">
            <tbody>
              <tr><td className="py-1">Kesim <span className="text-slate-400">(tahmini)</span></td><td className="text-right tabular-nums">{dk(s.sure.kesimSn)} dk</td></tr>
              <tr><td className="py-1">Dikim <span className="text-slate-400">(MTM)</span></td><td className="text-right tabular-nums">{dk(s.sure.dikimSn)} dk</td></tr>
              <tr><td className="py-1">UKP <span className="text-slate-400">(tahmini)</span></td><td className="text-right tabular-nums">{dk(s.sure.ukpSn)} dk</td></tr>
              <tr className="border-t font-semibold"><td className="py-1">Toplam</td><td className="text-right tabular-nums">{dk(top)} dk</td></tr>
            </tbody>
          </table>
        </div>
        <div className="border rounded p-4 overflow-x-auto">
          <h2 className="font-medium mb-2">Referans fiyat (TL/adet) · 3D dönemi {data.tablo.dkDonem ?? '—'}</h2>
          <table className="text-sm w-full">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left">Bölge</th><th className="text-right">TL/dk</th>
                <th className="text-right">Kesim</th><th className="text-right">Dikim</th>
                <th className="text-right">UKP</th><th className="text-right">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {bolgeler.map((b) => {
                const f = s.fiyat[b]
                return (
                  <tr key={b} className="border-t">
                    <td className="py-1">{b}</td>
                    <td className="text-right tabular-nums text-slate-500">{tl(data.tablo.dkMaliyet[b])}</td>
                    <td className="text-right tabular-nums text-slate-500">{tl(f.kesimTl)}</td>
                    <td className="text-right tabular-nums">{tl(f.dikimTl)}</td>
                    <td className="text-right tabular-nums text-slate-500">{tl(f.ukpTl)}</td>
                    <td className="text-right tabular-nums font-semibold">{tl(f.toplamTl)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Dikim süresinin bölge kırılımı</h2>
        <p className="text-sm text-slate-500 max-w-4xl">
          Her bölgede en yaygın parça o bölgeye sahip her modelde var sayılır (N). Diğer parçalar
          görülme oranında katkı yapar; birbirinin alternatifi olan parçalar böylece oranlarıyla girer.
          Katkısı düşük ama süresi uzun parçalar, modele göre fiyatı en çok oynatan kalemlerdir.
        </p>
        {s.bolgeler.map((b) => {
          const l = data.parcalar.filter((p) => p.bolge === b.bolge)
          const n = modelSayisiTahmini(l.map((p) => ({ bolge: p.bolge, ekParca: p.ek_parca_ad, gorulme: p.gorulme, snMedyan: p.sn_medyan })))
          const satir = l.map((p) => {
            const agirlik = n === 0 ? 0 : Math.min(1, p.gorulme / n)
            return { ...p, agirlik, katki: agirlik * p.sn_medyan }
          }).sort((a, c) => c.katki - a.katki)
          return (
            <details key={b.bolge} className="border rounded">
              <summary className="px-3 py-2 cursor-pointer flex gap-4 flex-wrap">
                <span className="font-medium">{b.bolge}</span>
                <span className="tabular-nums">{dk(b.sn)} dk</span>
                <span className="text-slate-500 text-sm">N = {b.modelSayisi} · {b.parcaSayisi} parça · dikimin %{(b.sn / s.sure.dikimSn * 100).toFixed(0)}&apos;i</span>
              </summary>
              <div className="overflow-x-auto">
                <table className="text-sm w-full">
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-1">Ek parça</th>
                      <th className="text-right px-3 py-1">Görülme</th>
                      <th className="text-right px-3 py-1">Ağırlık</th>
                      <th className="text-right px-3 py-1">Medyan sn</th>
                      <th className="text-right px-3 py-1">Min–maks sn</th>
                      <th className="text-right px-3 py-1">Op.</th>
                      <th className="text-right px-3 py-1">Katkı sn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {satir.map((p) => (
                      <tr key={p.ek_parca_ad} className="border-t">
                        <td className="px-3 py-1">{p.ek_parca_ad}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{p.gorulme}</td>
                        <td className="px-3 py-1 text-right tabular-nums">%{(p.agirlik * 100).toFixed(0)}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{p.sn_medyan.toFixed(1)}</td>
                        <td className="px-3 py-1 text-right tabular-nums text-slate-500">{p.sn_min.toFixed(0)}–{p.sn_max.toFixed(0)}</td>
                        <td className="px-3 py-1 text-right tabular-nums text-slate-500">{p.op_sayisi}</td>
                        <td className="px-3 py-1 text-right tabular-nums font-medium">{p.katki.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )
        })}
      </section>
    </main>
  )
}
