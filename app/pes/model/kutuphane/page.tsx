import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'

/**
 * /pes/model/kutuphane — operasyon zamanı kütüphanesi gezgini
 *
 * 30.319 satır tek sayfada gösterilemez: ürün tipi → operasyon grubu →
 * operasyon kırılımıyla gezilir. Seçim URL'de, paylaşılabilir.
 *
 * Güven seviyesi her satırda: kaynak dokümanın deyimiyle 2.039 DUSUK
 * kayıt "sahada doğrulanmalı" — filtreyle ayrıca listelenebiliyor.
 */
export const dynamic = 'force-dynamic'

const GUVEN_RENK: Record<string, string> = {
  YUKSEK: 'bg-emerald-100 text-emerald-800',
  ORTA: 'bg-amber-100 text-amber-800',
  DUSUK: 'bg-rose-100 text-rose-800',
  TEK_OLCUM: 'bg-slate-100 text-slate-600',
}

export default async function Kutuphane({
  searchParams,
}: { searchParams: Promise<{ tip?: string; grup?: string; q?: string; guven?: string }> }) {
  const sp = await searchParams
  const tipId = sp.tip ? Number(sp.tip) : null
  const grupId = sp.grup ? Number(sp.grup) : null
  const q = (sp.q ?? '').trim()
  const guven = sp.guven ?? null

  const data = await withServerTenant(async (sql) => {
    const toplam = await sql`
      SELECT count(*)::int AS n, count(*) FILTER (WHERE guven_seviyesi='DUSUK')::int AS dusuk
      FROM ref_operasyon_zamani` as Array<{ n: number; dusuk: number }>

    const tipler = await sql`
      SELECT ut.id, ut.klasman_ad, ut.urun_grubu, count(z.id)::int AS olcum
      FROM ref_urun_tipi ut
      LEFT JOIN ref_operasyon_zamani z ON z.urun_tipi_id = ut.id
      WHERE ${q ? sql`ut.klasman_ad ILIKE ${'%' + q + '%'}` : sql`TRUE`}
      GROUP BY ut.id ORDER BY olcum DESC, ut.klasman_ad LIMIT 120`

    const gruplar = tipId ? await sql`
      SELECT og.id, og.ad, count(*)::int AS olcum
      FROM ref_operasyon_zamani z JOIN ref_operasyon_grup og ON og.id = z.operasyon_grup_id
      WHERE z.urun_tipi_id = ${tipId}
        AND ${guven ? sql`z.guven_seviyesi = ${guven}` : sql`TRUE`}
      GROUP BY og.id ORDER BY olcum DESC, og.ad` : []

    const satirlar = tipId && grupId ? await sql`
      SELECT z.id, o.ad AS operasyon, v.tam_ad AS ek_parca, z.mtm::float AS mtm,
             z.mtm_min::float AS mtm_min, z.mtm_max::float AS mtm_max,
             z.orneklem, z.varyasyon_yuzde::float AS vk, z.guven_seviyesi
      FROM ref_operasyon_zamani z
      JOIN ref_operasyon o ON o.id = z.operasyon_id
      LEFT JOIN ref_ek_parca_varyant v ON v.id = z.ek_parca_varyant_id
      WHERE z.urun_tipi_id = ${tipId} AND z.operasyon_grup_id = ${grupId}
        AND ${guven ? sql`z.guven_seviyesi = ${guven}` : sql`TRUE`}
      ORDER BY z.mtm DESC LIMIT 400` : []

    return { toplam: toplam[0], tipler, gruplar, satirlar }
  })

  if (!data) redirect('/login')
  const { toplam, tipler, gruplar, satirlar } = data
  const bag = (p: Record<string, string | number | null>) => {
    const u = new URLSearchParams()
    if (p.tip) u.set('tip', String(p.tip))
    if (p.grup) u.set('grup', String(p.grup))
    if (q) u.set('q', q)
    if (p.guven) u.set('guven', String(p.guven))
    return `/pes/model/kutuphane?${u.toString()}`
  }

  return (
    <main className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Operasyon Zamanı Kütüphanesi</h1>
        <p className="text-sm text-slate-500">
          {toplam?.n.toLocaleString('tr-TR')} MTM ölçümü ·{' '}
          <Link href={bag({ guven: 'DUSUK' })} className="underline text-rose-700">
            {toplam?.dusuk.toLocaleString('tr-TR')} düşük güvenli
          </Link>
          {' · '}<Link href="/pes/model" className="underline">modeller →</Link>
        </p>
      </header>

      {guven && (
        <p className="text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Yalnız <strong>{guven}</strong> güven seviyesindeki ölçümler gösteriliyor.{' '}
          <Link href={bag({ tip: tipId, grup: grupId })} className="underline">filtreyi kaldır</Link>
        </p>
      )}

      <form className="flex gap-2" action="/pes/model/kutuphane">
        <input name="q" defaultValue={q} placeholder="Klasman ara (ör. JEAN, GOMLEK)"
               className="border rounded px-2 py-1 text-sm w-80" />
        {guven && <input type="hidden" name="guven" value={guven} />}
        <button className="px-3 py-1 rounded bg-slate-900 text-white text-sm">Ara</button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="border rounded overflow-hidden">
          <h2 className="px-3 py-2 bg-slate-50 text-sm font-medium">Ürün tipi ({tipler.length})</h2>
          <ul className="max-h-[28rem] overflow-y-auto text-sm">
            {tipler.map((t: Record<string, unknown>) => (
              <li key={String(t.id)}>
                <Link href={bag({ tip: String(t.id), guven })}
                      className={`block px-3 py-1.5 hover:bg-slate-50 ${Number(t.id) === tipId ? 'bg-slate-100 font-medium' : ''}`}>
                  {String(t.klasman_ad)}
                  <span className="text-xs text-slate-400"> · {String(t.olcum)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="border rounded overflow-hidden">
          <h2 className="px-3 py-2 bg-slate-50 text-sm font-medium">Operasyon grubu</h2>
          {gruplar.length === 0
            ? <p className="p-3 text-sm text-slate-400">Soldan bir ürün tipi seç.</p>
            : <ul className="max-h-[28rem] overflow-y-auto text-sm">
                {gruplar.map((g: Record<string, unknown>) => (
                  <li key={String(g.id)}>
                    <Link href={bag({ tip: tipId, grup: String(g.id), guven })}
                          className={`block px-3 py-1.5 hover:bg-slate-50 ${Number(g.id) === grupId ? 'bg-slate-100 font-medium' : ''}`}>
                      {String(g.ad)}
                      <span className="text-xs text-slate-400"> · {String(g.olcum)}</span>
                    </Link>
                  </li>
                ))}
              </ul>}
        </section>

        <section className="border rounded overflow-hidden">
          <h2 className="px-3 py-2 bg-slate-50 text-sm font-medium">Operasyonlar</h2>
          {satirlar.length === 0
            ? <p className="p-3 text-sm text-slate-400">Bir operasyon grubu seç.</p>
            : <div className="max-h-[28rem] overflow-y-auto">
                <table className="text-sm w-full">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-1.5">Operasyon</th>
                      <th className="text-right px-3 py-1.5">MTM (sn)</th>
                      <th className="text-right px-3 py-1.5">Örneklem</th>
                      <th className="text-left px-3 py-1.5">Güven</th>
                    </tr>
                  </thead>
                  <tbody>
                    {satirlar.map((s: Record<string, unknown>) => (
                      <tr key={String(s.id)} className="border-t">
                        <td className="px-3 py-1.5">
                          {String(s.operasyon)}
                          {s.ek_parca ? <span className="block text-xs text-slate-400">{String(s.ek_parca)}</span> : null}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {Number(s.mtm).toFixed(2)}
                          {Number(s.orneklem) > 1 && (
                            <span className="block text-xs text-slate-400">
                              {Number(s.mtm_min).toFixed(1)}–{Number(s.mtm_max).toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{String(s.orneklem)}</td>
                        <td className="px-3 py-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${GUVEN_RENK[String(s.guven_seviyesi)] ?? ''}`}>
                            {String(s.guven_seviyesi)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </section>
      </div>

      <p className="text-xs text-slate-400">
        MTM değerleri <strong>medyan</strong>; birden fazla ölçüm varsa altında min–maks
        aralığı yazar. <code>TEK_OLCUM</code> tek ölçümden gelir, doğrulanmamıştır.
        <code>DUSUK</code> ölçümlerde varyasyon katsayısı %20&apos;nin üstünde — bunlar
        sahada doğrulanmadan fiyatlamada dayanak yapılmamalı.
      </p>
    </main>
  )
}
