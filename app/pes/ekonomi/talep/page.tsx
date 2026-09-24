/**
 * /pes/ekonomi/talep — Veri toplama takibi
 *
 * "Kimden ne istedik, kim doldurdu, ne eksik." Ekonomi ekranları 131 aktif
 * atölyenin 11'ini kapsıyor; bu sayfa aradaki farkı kapatmanın iş listesi.
 *
 * DOLULUK TÜRETİLİR, SAKLANMAZ. economy_data_request'te "dolduruldu" diye
 * bir alan yok — olsaydı workshop_economy güncellenince sapar ve ekran
 * yalan söylerdi. Her satırın durumu o anki veriden hesaplanır.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import {
  doluluk, eksikAlanlar, tamamlanmaOrani, donemCoz,
  DOLULUK_ETIKET, type Doluluk,
} from '@/lib/pes/ekonomi-talep'
import TalepEylem from './TalepEylem'

export const dynamic = 'force-dynamic'

const DURUM_RENK: Record<Doluluk, string> = {
  tam: 'bg-emerald-100 text-emerald-800',
  'gider-yok': 'bg-amber-100 text-amber-800',
  eksik: 'bg-amber-100 text-amber-800',
  'veri-yok': 'bg-slate-100 text-slate-600',
}

type Satir = {
  workshop_id: number
  name: string
  code: string | null
  ekonomi: Record<string, unknown> | null
  giderVar: boolean
  talepAcik: boolean
  talepNot: string | null
}

export default async function TalepSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string; sadece?: string }>
}) {
  const sp = await searchParams
  const donem = donemCoz(sp.donem ?? '') ? (sp.donem as string) : '2026-01'
  const d = donemCoz(donem)!

  const sonuc = await withServerTenant(async (sql) => {
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay
      FROM workshop_economy ORDER BY yil DESC, ay DESC LIMIT 24
    ` as Array<{ yil: number; ay: number }>

    const satirlar = await sql`
      SELECT w.id AS workshop_id, w.name, w.code,
             to_jsonb(we) - 'id' - 'tenant_id' - 'created_at' - 'updated_at' AS ekonomi,
             (me.workshop_id IS NOT NULL) AS gider_var,
             (r.id IS NOT NULL AND r.cancelled_at IS NULL) AS talep_acik,
             r.note AS talep_not
        FROM workshop w
        LEFT JOIN workshop_economy we
               ON we.workshop_id = w.id AND we.year = ${d.yil} AND we.month = ${d.ay}
        LEFT JOIN monthly_expense me
               ON me.workshop_id = w.id AND me.year = ${d.yil} AND me.month = ${d.ay}
        LEFT JOIN economy_data_request r
               ON r.workshop_id = w.id AND r.year = ${d.yil} AND r.month = ${d.ay}
       WHERE w.is_active
       ORDER BY w.name
    ` as unknown as Array<Record<string, unknown>>

    return {
      donemler,
      satirlar: satirlar.map((r): Satir => ({
        workshop_id: r.workshop_id as number,
        name: r.name as string,
        code: (r.code as string | null) ?? null,
        ekonomi: (r.ekonomi as Record<string, unknown> | null) ?? null,
        giderVar: Boolean(r.gider_var),
        talepAcik: Boolean(r.talep_acik),
        talepNot: (r.talep_not as string | null) ?? null,
      })),
    }
  })

  if (!sonuc) redirect('/login')
  const { donemler, satirlar } = sonuc

  const ile = satirlar.map((s) => ({ ...s, durum: doluluk(s.ekonomi, s.giderVar) }))
  const sayim = {
    tam: ile.filter((s) => s.durum === 'tam').length,
    eksik: ile.filter((s) => s.durum === 'eksik').length,
    giderYok: ile.filter((s) => s.durum === 'gider-yok').length,
    veriYok: ile.filter((s) => s.durum === 'veri-yok').length,
    talepAcik: ile.filter((s) => s.talepAcik).length,
  }

  /* Varsayılan görünüm eksikleri öne alır — iş listesi, envanter değil. */
  const sadece = sp.sadece === 'hepsi' ? 'hepsi' : 'eksikler'
  const gorunen = sadece === 'hepsi' ? ile : ile.filter((s) => s.durum !== 'tam')

  const bag = (ek: Record<string, string>) => {
    const p = new URLSearchParams({ donem, sadece, ...ek })
    return `/pes/ekonomi/talep?${p.toString()}`
  }

  return (
    <main className="p-6 space-y-5">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Veri Toplama</h1>
          <p className="text-sm text-slate-500">
            {donem} · {satirlar.length} aktif atölye ·{' '}
            <Link href={`/pes/ekonomi?donem=${donem}`} className="underline">rasyo radarı →</Link>
          </p>
        </div>
        <nav className="flex gap-1 text-sm flex-wrap">
          {donemler.map((x) => {
            const s = `${x.yil}-${String(x.ay).padStart(2, '0')}`
            return (
              <Link key={s} href={`/pes/ekonomi/talep?donem=${s}&sadece=${sadece}`}
                    className={`px-2 py-1 rounded ${s === donem ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
                {s}
              </Link>
            )
          })}
        </nav>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
        {[
          ['Tam', sayim.tam, 'text-emerald-700'],
          ['Eksik alan', sayim.eksik, 'text-amber-700'],
          ['Gider bekleniyor', sayim.giderYok, 'text-amber-700'],
          ['Veri yok', sayim.veriYok, 'text-slate-600'],
          ['Açık talep', sayim.talepAcik, 'text-slate-900'],
        ].map(([etiket, n, renk]) => (
          <div key={etiket as string} className="rounded border border-slate-200 p-3">
            <div className={`text-2xl font-semibold tabular-nums ${renk}`}>{n as number}</div>
            <div className="text-xs text-slate-500">{etiket as string}</div>
          </div>
        ))}
      </section>

      <nav className="flex gap-1 text-sm">
        <Link href={bag({ sadece: 'eksikler' })}
              className={`px-3 py-1.5 rounded ${sadece === 'eksikler' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 border border-slate-200'}`}>
          Eksikler ({ile.length - sayim.tam})
        </Link>
        <Link href={bag({ sadece: 'hepsi' })}
              className={`px-3 py-1.5 rounded ${sadece === 'hepsi' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 border border-slate-200'}`}>
          Hepsi ({ile.length})
        </Link>
      </nav>

      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Atölye</th>
              <th className="px-3 py-2 font-medium">Durum</th>
              <th className="px-3 py-2 font-medium">Eksik alanlar</th>
              <th className="px-3 py-2 font-medium">Talep</th>
            </tr>
          </thead>
          <tbody>
            {gorunen.map((s) => {
              const eksik = eksikAlanlar(s.ekonomi)
              const oran = tamamlanmaOrani(s.ekonomi)
              return (
                <tr key={s.workshop_id} className="border-t border-slate-200">
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.name}</div>
                    {s.code && <div className="text-xs text-slate-400">{s.code}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${DURUM_RENK[s.durum]}`}>
                      {DOLULUK_ETIKET[s.durum]}
                    </span>
                    {s.ekonomi && (
                      <div className="mt-1 h-1 w-20 bg-slate-200 rounded overflow-hidden">
                        <div className="h-full bg-slate-700" style={{ width: `${oran * 100}%` }} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 max-w-md">
                    {s.durum === 'tam' ? '—'
                      : s.durum === 'gider-yok' ? 'Gider satırı yok'
                      : eksik.length === 9 ? 'Hiç veri girilmemiş'
                      : eksik.join(', ')}
                  </td>
                  <td className="px-3 py-2">
                    <TalepEylem
                      workshopId={s.workshop_id} donem={donem}
                      acik={s.talepAcik} not={s.talepNot}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {gorunen.length === 0 && (
          <p className="p-4 text-sm text-slate-500">
            {donem} döneminde eksik atölye yok.
          </p>
        )}
      </div>
    </main>
  )
}
