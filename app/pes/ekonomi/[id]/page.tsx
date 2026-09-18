/**
 * /pes/ekonomi/[id] — Tek atölye karnesi
 *
 * Her rasyo yanında akran medyanı ve yüzdelik yeri gösterilir.
 * Akran grubu kademesi ve n üstte yazılıdır.
 *
 * Plan: docs/superpowers/plans/2026-09-15-atolye-ekonomi-e0.md Task 16
 * Uyarlama: KOLONLAR/bicimle yerine RASYO_META + fmtRasyo kullanılır.
 * Klasman sorgusu: capability_value.dimension_code kolonu mevcut değil →
 *   klasmanHarita boş bırakıldı, akran grubu 'tumu' kademesine düşer.
 */
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { donemCoz, donemYaz, donemEtiket } from '@/lib/pes/donem'
import {
  dbSatiriCoz, paramCoz, EKONOMI_SORGUSU,
  type EkonomiDbSatiri,
} from '@/lib/pes/ekonomi-sorgu'
import { hesapla } from '@/lib/pes/ekonomi-hesap'
import { marjSirasi, medyan, yuzdelikSkor, akranGrubu, type AkranAdayi } from '@/lib/pes/ekonomi-akran'
import { RASYO_META } from '@/lib/pes/ekonomi-rasyo-meta'
import { fmtRasyo } from '../formatlayici'

export const dynamic = 'force-dynamic'

const KADEME_ETIKET = {
  'klasman+buyukluk': 'aynı klasman ve büyüklük',
  'klasman': 'aynı klasman',
  'tumu': 'tüm örneklem',
} as const

export default async function EkonomiKarne({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ donem?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const workshopId = Number(id)
  if (!Number.isInteger(workshopId) || workshopId <= 0) notFound()

  const donemSecili = donemCoz(sp.donem)

  const data = await withServerTenant(async (sql) => {
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay
      FROM workshop_economy WHERE workshop_id = ${workshopId}
      ORDER BY yil DESC, ay DESC
    ` as Array<{ yil: number; ay: number }>

    const donem = donemSecili ?? donemler[0] ?? null
    if (!donem) return { donem: null, donemler, hedef: null, hepsi: [] }

    const donemStr = donemYaz(donem)
    const paramSatirlari = await sql`
      SELECT DISTINCT ON (param_key) param_key, param_value
      FROM economy_param WHERE donem <= ${donemStr}
      ORDER BY param_key, donem DESC
    ` as Array<{ param_key: string; param_value: unknown }>
    const param = paramCoz(paramSatirlari)

    const ham = await sql.unsafe(
      EKONOMI_SORGUSU, [donemStr, donem.yil, donem.ay],
    ) as unknown as EkonomiDbSatiri[]

    // Klasman sorgusunu atla — capability_value.dimension_code kolonu yok.
    const klasmanHarita = new Map<number, string[]>()

    const hepsi = ham.map(r => {
      const girdi = dbSatiriCoz(r, param)
      const rasyo = hesapla(girdi)
      return {
        workshopId: r.workshop_id,
        ad: r.name,
        veriVar: r.veri_var,
        source: girdi.ekonomi.source,
        klasmanlar: klasmanHarita.get(r.workshop_id) ?? [],
        sewingStaff: girdi.ekonomi.sewing_staff,
        rasyo,
      }
    })

    // marjSirasi — tüm örneklemde hesaplanır
    const akranAdaylari: AkranAdayi[] = hepsi.map(h => ({
      workshopId: h.workshopId,
      ad: h.ad,
      klasmanlar: h.klasmanlar,
      sewingStaff: h.sewingStaff,
      marj: h.rasyo.marj,
    }))
    const marjSirasiSonuclari = new Map<number, number | null>(
      hepsi.map(h => [h.workshopId, marjSirasi(h.rasyo.marj, akranAdaylari)])
    )

    return {
      donem,
      donemler,
      hedef: hepsi.find(h => h.workshopId === workshopId) ?? null,
      hepsi,
      marjSirasiSonuclari,
    }
  })

  if (!data) redirect('/login')
  const { donem, donemler, hedef, hepsi, marjSirasiSonuclari } = data
  if (!hedef) notFound()

  const adaylar: AkranAdayi[] = hepsi.map(h => ({
    workshopId: h.workshopId,
    ad: h.ad,
    klasmanlar: h.klasmanlar,
    sewingStaff: h.sewingStaff,
    marj: h.rasyo.marj,
  }))
  const hedefAday = adaylar.find(a => a.workshopId === workshopId)!
  const grup = akranGrubu(hedefAday, adaylar)
  const grupIdSet = new Set(grup.uyeler.map(u => u.workshopId))
  const grupSatirlari = hepsi.filter(h => grupIdSet.has(h.workshopId))

  return (
    <main className="p-6 space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{hedef.ad}</h1>
          <p className="text-sm text-slate-500">
            {donem ? donemEtiket(donem) : '—'}
            {!hedef.veriVar && ' · bu dönemde ekonomi satırı yok'}
            {hedef.veriVar && hedef.source === 'turetilmis' && ' · çok aylı beyandan türetildi'}
            {' · '}
            <Link href="/pes/ekonomi" className="underline">tüm atölyeler →</Link>
          </p>
        </div>
        <nav className="flex gap-1 text-sm flex-wrap">
          {donemler.slice(0, 12).map(d => (
            <Link
              key={`${d.yil}-${d.ay}`}
              href={`/pes/ekonomi/${workshopId}?donem=${donemYaz(d)}`}
              className={`px-2 py-1 rounded ${
                donem && d.yil === donem.yil && d.ay === donem.ay
                  ? 'bg-slate-900 text-white'
                  : 'hover:bg-slate-100'
              }`}
            >
              {donemYaz(d)}
            </Link>
          ))}
        </nav>
      </header>

      <p className="text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
        Akran grubu: <strong>{KADEME_ETIKET[grup.kademe]}</strong>, n={grup.n}
        {grup.kademe === 'tumu' && ' — bu klasmanda yeterli örneklem yok, tüm atölyelerle kıyaslanıyor'}
        {grup.n < 5 && ' — örneklem küçük, medyanı temkinli okuyun'}
      </p>

      <div className="overflow-x-auto border rounded">
        <table className="text-sm w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2">Gösterge</th>
              <th className="text-right px-3 py-2">{hedef.ad}</th>
              <th className="text-right px-3 py-2">Akran medyanı</th>
              <th className="text-right px-3 py-2">Yüzdelik</th>
              <th className="text-left px-3 py-2">Nasıl okunur</th>
            </tr>
          </thead>
          <tbody>
            {RASYO_META.map(k => {
              // marjSirasi EkonomiRasyo'da yok, ayrı hesaplandı
              const v: number | null =
                k.alan === 'marjSirasi'
                  ? (marjSirasiSonuclari?.get(workshopId) ?? null)
                  : hedef.rasyo[k.alan as keyof typeof hedef.rasyo] ?? null

              const grupDegerleri = grupSatirlari.map(s =>
                k.alan === 'marjSirasi'
                  ? (marjSirasiSonuclari?.get(s.workshopId) ?? null)
                  : s.rasyo[k.alan as keyof typeof s.rasyo] ?? null
              )
              const med = medyan(grupDegerleri)
              const hamSkor = yuzdelikSkor(v, grupDegerleri)

              // Yüzdelik yönü:
              //   yuksek-iyi → ham skor (yüksek = iyi)
              //   dusuk-iyi  → 100 − ham (düşük değer = iyi)
              //   notr       → gösterilmez
              const skor =
                hamSkor === null || k.yon === 'notr'
                  ? null
                  : k.yon === 'dusuk-iyi'
                  ? 100 - hamSkor
                  : hamSkor

              return (
                <tr key={k.alan} className="border-t align-top">
                  <td className="px-3 py-2">
                    <span>{k.etiket}</span>
                    {k.birim !== '-' && k.birim !== '%' && (
                      <span className="ml-1 text-xs text-slate-400">{k.birim}</span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${
                      v === null ? 'text-slate-300' : ''
                    }`}
                  >
                    {fmtRasyo(k, v)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {fmtRasyo(k, med)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {skor === null ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <span className={skor >= 50 ? 'text-emerald-700' : 'text-rose-700'}>
                        {Math.round(skor)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500 max-w-md text-xs">
                    {k.onemAciklama}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Yüzdelik 0–100: 100 akran grubunun en iyisi. Yönü olmayan göstergelerde
        (kişi sayısı, adil fiyat gibi) yüzdelik gösterilmez — "iyi" diye bir yönü yoktur.
        "—" hesaplanamadı demektir, sıfır değil.
      </p>
    </main>
  )
}
