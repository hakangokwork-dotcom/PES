/**
 * /pes/ekonomi/klasman — Klasman merkezli karşılaştırma
 *
 * Radar ve karne atölyeden başlar: "bu atölye nasıl". Bu sayfa klasmandan
 * başlar: "PANTOLON diken atölyeler kim, hangisi kâr ediyor".
 *
 * NEDEN AYRI SAYFA: akranGrubu() ile "aynı klasmanı diken atölyeler"
 * sorusunu atölye tarafından sormak anlamsız cevap veriyor. PES klasmanı
 * bant seviyesinde ve atölyeler çok klasman dikiyor (Bese'de 8, SRT'de 6);
 * "herhangi bir ortak klasman" kuralıyla 11 pilotta gruplar n=5..11 çıkıyor
 * ve İmkot herkesle akran oluyor. Klasmandan bakınca gruplar anlamlı.
 *
 * Seçim URL'de (?klasman=PANTOLON) — paylaşılabilir, geri tuşu çalışır.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { EKONOMI_SORGUSU, dbSatiriCoz, paramCoz } from '@/lib/pes/ekonomi-sorgu'
import { hesapla } from '@/lib/pes/ekonomi-hesap'
import {
  atolyeKlasmanlari, klasmanOzetleri, klasmanOzeti,
  type KlasmanAtolyesi,
} from '@/lib/pes/ekonomi-klasman'
import { RASYO_META_MAP } from '@/lib/pes/ekonomi-rasyo-meta'
import { fmtRasyo } from '../formatlayici'

export const dynamic = 'force-dynamic'

/** Yan yana gösterilen rasyolar. Sıra ekranda soldan sağa. */
const SUTUNLAR = [
  'marj', 'aylikCiro', 'ciroKisi', 'dikimDkCiro',
  'dikimDkMaliyet', 'asgariDkCarpani', 'basabasFiyat', 'adilFiyat',
] as const

function meta(alan: string) {
  const m = RASYO_META_MAP.get(alan)
  if (!m) throw new Error(`RASYO_META'da yok: ${alan}`)
  return m
}

export default async function KlasmanSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string; klasman?: string }>
}) {
  const sp = await searchParams
  const donem = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.donem ?? '')
    ? (sp.donem as string) : '2026-01'
  const [yil, ay] = donem.split('-').map(Number)

  const sonuc = await withServerTenant(async (sql) => {
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay
      FROM workshop_economy ORDER BY yil DESC, ay DESC LIMIT 24
    ` as Array<{ yil: number; ay: number }>

    const paramSatirlari = await sql`
      SELECT DISTINCT ON (param_key) param_key, param_value
      FROM economy_param WHERE donem <= ${donem}
      ORDER BY param_key, donem DESC
    ` as Array<{ param_key: string; param_value: unknown }>
    const param = paramCoz(paramSatirlari)

    /* Klasman bant seviyesinde: line_capability.dimension_code='klasman'.
       capability_value'da dimension_code kolonu YOKTUR (orada dimension_id
       var) — ilk uygulamada bu varsayılmış ve sorgu atlanmıştı. */
    const klasmanSatirlari = await sql`
      SELECT pl.workshop_id::int AS workshop_id, lc.value_code
      FROM line_capability lc
      JOIN production_line pl ON pl.id = lc.line_id
      WHERE lc.dimension_code = 'klasman'
    ` as Array<{ workshop_id: number; value_code: string }>
    const klasmanHarita = atolyeKlasmanlari(klasmanSatirlari)

    const ham = await sql.unsafe(EKONOMI_SORGUSU, [donem, yil, ay])

    const atolyeler: Array<KlasmanAtolyesi & { rasyolar: ReturnType<typeof hesapla> }> =
      ham.map((r) => {
        const girdi = dbSatiriCoz(r as unknown as Parameters<typeof dbSatiriCoz>[0], param)
        const rasyolar = hesapla(girdi)
        return {
          workshopId: r.workshop_id as number,
          ad: r.name as string,
          klasmanlar: klasmanHarita.get(r.workshop_id as number) ?? [],
          marj: rasyolar.marj,
          dikimDkCiro: rasyolar.dikimDkCiro,
          rasyolar,
        }
      })

    return { donemler, atolyeler }
  })

  if (!sonuc) redirect('/login')
  const { donemler, atolyeler } = sonuc

  const ozetler = klasmanOzetleri(atolyeler)
  const secili = sp.klasman && ozetler.some(o => o.klasman === sp.klasman)
    ? sp.klasman
    : ozetler[0]?.klasman ?? null
  const seciliOzet = secili ? klasmanOzeti(secili, atolyeler) : null

  /* Seçili klasmanın atölyeleri: marjı olanlar önce, yüksekten düşüğe. */
  const seciliAtolyeler = seciliOzet
    ? [...seciliOzet.atolyeler]
        .map(a => atolyeler.find(x => x.workshopId === a.workshopId)!)
        .sort((x, y) => {
          if (x.marj === null && y.marj === null) return x.ad.localeCompare(y.ad, 'tr')
          if (x.marj === null) return 1
          if (y.marj === null) return -1
          return y.marj - x.marj
        })
    : []

  const bag = (k: string) => `/pes/ekonomi/klasman?donem=${donem}&klasman=${encodeURIComponent(k)}`

  return (
    <main className="p-6 space-y-5">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Klasman Karşılaştırması</h1>
          <p className="text-sm text-slate-500">
            {donem} · {ozetler.length} klasman ·{' '}
            <Link href={`/pes/ekonomi?donem=${donem}`} className="underline">rasyo radarı →</Link>
          </p>
        </div>
        <nav className="flex gap-1 text-sm flex-wrap">
          {donemler.map(d => {
            const s = `${d.yil}-${String(d.ay).padStart(2, '0')}`
            return (
              <Link key={s}
                    href={`/pes/ekonomi/klasman?donem=${s}${secili ? `&klasman=${encodeURIComponent(secili)}` : ''}`}
                    className={`px-2 py-1 rounded ${s === donem ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
                {s}
              </Link>
            )
          })}
        </nav>
      </header>

      <p className="text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
        <strong>Bu rakamlar klasmana ait değil, atölyeye ait.</strong> Bir atölyenin
        marjı tüm üretiminin marjıdır; birden fazla klasman diken atölye her
        listede aynı rakamla görünür. Yani burada okunan şey “PANTOLON ne kadar
        kârlı” değil, <em>“PANTOLON diken atölyeler nasıl gidiyor”</em>.
        Klasman başına gerçek kâr/zarar model katmanından (E3) gelecek.
      </p>

      {ozetler.length === 0 ? (
        <p className="text-slate-500 border rounded p-6">
          Bu dönemde klasman bilgisi olan atölye yok. Klasmanlar bant
          seviyesinde <code>line_capability</code> tablosundan okunuyor.
        </p>
      ) : (
        <>
          <section className="overflow-x-auto border rounded">
            <table className="text-sm w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2">Klasman</th>
                  <th className="text-right px-3 py-2"
                      title="Ekonomi verisi olan atölye / bu klasmanı diken toplam atölye. Satırdaki diğer rakamları soldaki sayı belirler.">
                    Verili / toplam
                  </th>
                  <th className="text-right px-3 py-2">Medyan marj</th>
                  <th className="text-right px-3 py-2">Zararda</th>
                  <th className="text-right px-3 py-2">Yayılım</th>
                  <th className="text-left px-3 py-2">En iyi</th>
                  <th className="text-left px-3 py-2">En kötü</th>
                </tr>
              </thead>
              <tbody>
                {ozetler.map(o => (
                  <tr key={o.klasman}
                      className={`border-t hover:bg-slate-50 ${o.klasman === secili ? 'bg-slate-100' : ''}`}>
                    <td className="px-3 py-2">
                      <Link href={bag(o.klasman)} className="underline font-medium">{o.klasman}</Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={o.marjliAtolyeSayisi === 0 ? 'text-slate-300' : 'font-medium'}>
                        {o.marjliAtolyeSayisi}
                      </span>
                      <span className="text-slate-400"> / {o.atolyeSayisi}</span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${
                      o.medyanMarj === null ? 'text-slate-300'
                        : o.medyanMarj < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {fmtRasyo(meta('marj'), o.medyanMarj)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {o.marjliAtolyeSayisi === 0
                        ? <span className="text-slate-300">—</span>
                        : <span className={o.zarardaSayisi > 0 ? 'text-rose-700' : ''}>
                            {o.zarardaSayisi}/{o.marjliAtolyeSayisi}
                          </span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {fmtRasyo(meta('marj'), o.yayilim)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{o.enIyi?.ad ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{o.enKotu?.ad ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {seciliOzet && (
            <section className="space-y-2">
              <h2 className="font-medium">
                {seciliOzet.klasman} diken {seciliOzet.atolyeSayisi} atölye
                {seciliOzet.marjliAtolyeSayisi < 2 && (
                  <span className="ml-2 text-sm font-normal text-amber-700">
                    — kıyaslanacak yeterli veri yok
                  </span>
                )}
              </h2>
              <div className="overflow-x-auto border rounded">
                <table className="text-sm w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2">Atölye</th>
                      {SUTUNLAR.map(alan => (
                        <th key={alan} className="text-right px-3 py-2 whitespace-nowrap"
                            title={meta(alan).onemAciklama}>
                          {meta(alan).etiket}
                        </th>
                      ))}
                      <th className="text-left px-3 py-2">Diğer klasmanları</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seciliAtolyeler.map(a => (
                      <tr key={a.workshopId} className="border-t hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <Link href={`/pes/ekonomi/${a.workshopId}?donem=${donem}`}
                                className="underline">{a.ad}</Link>
                        </td>
                        {SUTUNLAR.map(alan => {
                          const v = a.rasyolar[alan]
                          const m = meta(alan)
                          const renk = v === null ? 'text-slate-300'
                            : alan === 'marj' ? (v < 0 ? 'text-rose-700' : 'text-emerald-700')
                            : ''
                          return (
                            <td key={alan} className={`px-3 py-2 text-right tabular-nums ${renk}`}>
                              {fmtRasyo(m, v)}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {a.klasmanlar.filter(k => k !== seciliOzet.klasman).join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2">
                    <tr>
                      <td className="px-3 py-2 font-medium">
                        Medyan{' '}
                        <span className="text-xs text-slate-500">
                          n={seciliOzet.marjliAtolyeSayisi}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {fmtRasyo(meta('marj'), seciliOzet.medyanMarj)}
                      </td>
                      <td colSpan={2} />
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {fmtRasyo(meta('dikimDkCiro'), seciliOzet.medyanDikimDkCiro)}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <p className="text-xs text-slate-400">
        “—” hesaplanamadı demektir, sıfır değil. Bir atölye diktiği her
        klasmanın listesinde görünür; sağdaki sütun o atölyenin başka hangi
        klasmanları diktiğini söyler — karşılaştırmayı okurken bu önemli,
        çünkü rakam o klasmana değil atölyenin tümüne ait.
      </p>
    </main>
  )
}
