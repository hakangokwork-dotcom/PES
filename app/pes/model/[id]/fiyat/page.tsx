import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import FiyatHesapla from './FiyatHesapla'
import SureKarsilastirma, { type SureSatiri } from './SureKarsilastirma'

/**
 * /pes/model/[id]/fiyat — E3'ün asıl ekranı.
 * Bültenin bölüm süreleri × atölyenin E0'dan gelen dakika maliyeti.
 */
export const dynamic = 'force-dynamic'

const tl = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = new Intl.NumberFormat('tr-TR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const f = (v: unknown, fmt: Intl.NumberFormat = tl) =>
  v === null || v === undefined ? '—' : fmt.format(Number(v))

export default async function FiyatSayfasi({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ donem?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const bultenId = Number(id)
  if (!Number.isInteger(bultenId)) notFound()
  const donem = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.donem ?? '') ? (sp.donem as string) : '2026-01'

  const data = await withServerTenant(async (sql) => {
    const [bulten] = await sql`SELECT * FROM model_bulten WHERE id = ${bultenId}`
    if (!bulten) return null
    const [bolum] = await sql`
      SELECT coalesce(sum(cevrim_sn) FILTER (WHERE bolum='KESIM'),0)::float AS kesim,
             coalesce(sum(cevrim_sn) FILTER (WHERE bolum='DIKIM'),0)::float AS dikim,
             coalesce(sum(cevrim_sn) FILTER (WHERE bolum='UKP'),0)::float  AS ukp
      FROM model_bulten_operasyon WHERE bulten_id = ${bultenId}`
    const fiyatlar = await sql`
      SELECT mf.id, mf.workshop_id, w.name AS atolye, w.bolge,
             mf.toplam_maliyet::float AS toplam_maliyet, mf.adil_fiyat::float AS adil_fiyat,
             mf.cmt_fiyat::float AS cmt_fiyat,
             mf.kar_adet::float AS kar_adet, mf.marj::float AS marj,
             mf.kapasite_payi::float AS kapasite_payi, mf.referans_3d::float AS referans_3d,
             mf.cmt_3d_sapma::float AS cmt_3d_sapma, mf.dikim_dk::float AS dikim_dk
      FROM model_fiyat mf JOIN workshop w ON w.id = mf.workshop_id
      WHERE mf.bulten_id = ${bultenId} AND mf.donem = ${donem}
      ORDER BY mf.toplam_maliyet NULLS LAST`
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay FROM workshop_economy
      ORDER BY yil DESC, ay DESC LIMIT 12`
    const sureler = await sql`
      SELECT mf.workshop_id, w.name AS atolye,
             mf.dikim_dk::float AS teorik_dk,
             u.dk_adet::float AS uretim_dk, u.gun_sayisi, u.atlanan_gun,
             b2.dk_adet::float AS beyan_dk
      FROM model_fiyat mf
      JOIN workshop w ON w.id = mf.workshop_id
      LEFT JOIN model_gercek_sure u
             ON u.bulten_id = mf.bulten_id AND u.workshop_id = mf.workshop_id
            AND u.donem = mf.donem AND u.kaynak = 'uretim'
      LEFT JOIN model_gercek_sure b2
             ON b2.bulten_id = mf.bulten_id AND b2.workshop_id = mf.workshop_id
            AND b2.donem = mf.donem AND b2.kaynak = 'beyan'
      WHERE mf.bulten_id = ${bultenId} AND mf.donem = ${donem}
      ORDER BY w.name`

    return { bulten, bolum, fiyatlar, donemler, sureler }
  })

  if (!data) redirect('/login')
  const { bulten, bolum, fiyatlar, donemler, sureler } = data
  const hedefMarj = 0.15

  return (
    <main className="p-6 space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{String(bulten.model_adi)} — fiyat</h1>
          <p className="text-sm text-slate-500">
            {donem} · KESİM {Number(bolum?.kesim)} sn · DİKİM {Number(bolum?.dikim)} sn · UKP {Number(bolum?.ukp)} sn ·{' '}
            <Link href={`/pes/model/${bultenId}`} className="underline">bültene dön</Link>
          </p>
        </div>
        <nav className="flex gap-1 text-sm">
          {donemler.map((d: Record<string, unknown>) => {
            const s = `${d.yil}-${String(d.ay).padStart(2, '0')}`
            return (
              <Link key={s} href={`/pes/model/${bultenId}/fiyat?donem=${s}`}
                    className={`px-2 py-1 rounded ${s === donem ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
                {s}
              </Link>
            )
          })}
        </nav>
      </header>

      <FiyatHesapla bultenId={bultenId} donem={donem}
                    varsayilanAdet={bulten.siparis_adedi ? Math.round(Number(bulten.siparis_adedi) / 22) : null} />

      {fiyatlar.length === 0 ? (
        <p className="text-slate-500 border rounded p-6">
          Bu dönem için henüz fiyat hesaplanmamış. Yukarıdan CMT ve günlük adet girip hesapla.
        </p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="text-sm w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2">Atölye</th>
                <th className="text-right px-3 py-2">Dikim dk/adet</th>
                <th className="text-right px-3 py-2">Toplam maliyet</th>
                <th className="text-right px-3 py-2">Adil fiyat</th>
                <th className="text-right px-3 py-2">CMT</th>
                <th className="text-right px-3 py-2">Kâr/adet</th>
                <th className="text-right px-3 py-2">Marj</th>
                <th className="text-right px-3 py-2">Kapasite payı</th>
                <th className="text-right px-3 py-2">3D referans</th>
              </tr>
            </thead>
            <tbody>
              {fiyatlar.map((r: Record<string, unknown>) => {
                const marj = r.marj === null ? null : Number(r.marj)
                const renk = marj === null ? '' : marj >= hedefMarj ? 'text-emerald-700'
                  : marj >= 0 ? 'text-amber-700' : 'text-rose-700'
                const asim = r.kapasite_payi !== null && Number(r.kapasite_payi) > 1
                return (
                  <tr key={String(r.id)} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/pes/ekonomi/${r.workshop_id}?donem=${donem}`} className="underline">
                        {String(r.atolye)}
                      </Link>
                      <span className="text-xs text-slate-400"> · {String(r.bolge ?? '—')}. bölge</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{f(r.dikim_dk)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{f(r.toplam_maliyet)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f(r.adil_fiyat)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f(r.cmt_fiyat)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${renk}`}>{f(r.kar_adet)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${renk}`}>{f(r.marj, pct)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${asim ? 'text-rose-700' : ''}`}>
                      {f(r.kapasite_payi, pct)}
                      {asim && <span className="block text-xs">aşım</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {f(r.referans_3d)}
                      {r.cmt_3d_sapma !== null && (
                        <span className="block text-xs">{f(r.cmt_3d_sapma, pct)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {fiyatlar.length > 0 && (
        <SureKarsilastirma
          bultenId={bultenId}
          donem={donem}
          satirlar={(sureler as Array<Record<string, unknown>>).map(s => ({
            workshopId: Number(s.workshop_id),
            atolye: String(s.atolye),
            teorikDk: s.teorik_dk === null ? null : Number(s.teorik_dk),
            uretimDk: s.uretim_dk === null ? null : Number(s.uretim_dk),
            uretimGun: s.gun_sayisi === null ? null : Number(s.gun_sayisi),
            uretimAtlanan: s.atlanan_gun === null ? null : Number(s.atlanan_gun),
            beyanDk: s.beyan_dk === null ? null : Number(s.beyan_dk),
          })) satisfies SureSatiri[]}
        />
      )}

      <p className="text-xs text-slate-400">
        Maliyet, bültenin <strong>teorik</strong> süresiyle ve her atölyenin <strong>kendi</strong>
        {' '}dakika maliyetiyle hesaplanır — bölgesel 3D değeriyle değil; 3D yalnız referans sütununda.
        Kapasite payı %100&apos;ü geçiyorsa iş bu günlük adetle o banda sığmıyor demektir;
        bu bir fiyat sorunu değil adet sorunudur. “—” hesaplanamadı demektir, sıfır değil.
      </p>
    </main>
  )
}
