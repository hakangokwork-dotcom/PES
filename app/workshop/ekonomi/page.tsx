import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/panel-guard'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { donemCoz, eksikAlanlar, doluluk, DOLULUK_ETIKET } from '@/lib/pes/ekonomi-talep'
import EkonomiForm from './EkonomiForm'

export const dynamic = 'force-dynamic'

/**
 * /workshop/ekonomi — Atölye kendi aylık verisini girer.
 *
 * ATÖLYE SEÇİCİ YOK; atölye oturumdan gelir (033 deseni).
 *
 * GİDER BURADA YOK. Gider `monthly_expense`'te ve atölyenin zaten
 * kullandığı Excel yükleme akışı var (/workshop/veri-yukle). İkinci bir
 * giriş yolu açmak iki kaynak yaratır ve hangisinin doğru olduğu sorusunu
 * doğurur; ekran gider eksikse bunu söyleyip oraya yönlendirir.
 */
export default async function AtolyeEkonomiSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string }>
}) {
  const tenant = await requireSession()
  if (!tenant.workshopId) redirect('/pes/ekonomi')

  const sp = await searchParams
  const simdi = new Date()
  const varsayilan = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}`
  const donem = donemCoz(sp.donem ?? '') ? (sp.donem as string) : varsayilan
  const d = donemCoz(donem)!

  const veri = await withServerTenant(async (sql) => {
    const [w] = await sql`
      SELECT id, code, name FROM workshop WHERE id = ${tenant.workshopId}
    ` as unknown as Array<{ id: number; code: string; name: string }>

    const [kayit] = await sql`
      SELECT to_jsonb(we) - 'id' - 'tenant_id' - 'created_at' AS k
        FROM workshop_economy we
       WHERE we.workshop_id = ${tenant.workshopId}
         AND we.year = ${d.yil} AND we.month = ${d.ay}
    ` as unknown as Array<{ k: Record<string, unknown> }>

    const [gider] = await sql`
      SELECT 1 AS var FROM monthly_expense
       WHERE workshop_id = ${tenant.workshopId}
         AND year = ${d.yil} AND month = ${d.ay} LIMIT 1
    ` as unknown as Array<{ var: number }>

    const [talep] = await sql`
      SELECT note, requested_at FROM economy_data_request
       WHERE workshop_id = ${tenant.workshopId}
         AND year = ${d.yil} AND month = ${d.ay} AND cancelled_at IS NULL
    ` as unknown as Array<{ note: string | null; requested_at: string }>

    /* Son 12 dönemin doluluğu — atölye neyi eksik bıraktığını görsün. */
    const gecmis = await sql`
      SELECT we.year::int AS yil, we.month::int AS ay,
             to_jsonb(we) AS k,
             EXISTS (SELECT 1 FROM monthly_expense me
                      WHERE me.workshop_id = we.workshop_id
                        AND me.year = we.year AND me.month = we.month) AS gider_var
        FROM workshop_economy we
       WHERE we.workshop_id = ${tenant.workshopId}
       ORDER BY we.year DESC, we.month DESC LIMIT 12
    ` as unknown as Array<{ yil: number; ay: number; k: Record<string, unknown>; gider_var: boolean }>

    return {
      atolye: w,
      kayit: kayit?.k ?? null,
      giderVar: Boolean(gider),
      talep: talep ?? null,
      gecmis,
    }
  })

  if (!veri) redirect('/login')
  const eksik = eksikAlanlar(veri.kayit)
  const durum = doluluk(veri.kayit, veri.giderVar)

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/workshop" className="text-sm text-faint hover:text-ink">← Panel</Link>
        <h1 className="text-xl font-semibold mt-1">Aylık Ekonomi Verisi</h1>
        <p className="text-sm text-slate-500">
          {veri.atolye.name} · {donem} ·{' '}
          <Link href={`/workshop/ekonomi/karne?donem=${donem}`} className="underline">
            karnemi gör →
          </Link>
        </p>
      </div>

      {veri.talep && (
        <div className="rounded border border-slate-900 bg-slate-50 p-3 text-sm">
          <div className="font-medium">Bu dönem için veri talebi var</div>
          {veri.talep.note && <div className="text-slate-600 mt-0.5">{veri.talep.note}</div>}
        </div>
      )}

      <div className="rounded border border-slate-200 p-3 text-sm flex items-center gap-3 flex-wrap">
        <span className="text-slate-500">Durum:</span>
        <span className="font-medium">{DOLULUK_ETIKET[durum]}</span>
        {eksik.length > 0 && (
          <span className="text-slate-500">· eksik: {eksik.join(', ')}</span>
        )}
        {durum === 'gider-yok' && (
          <span className="text-amber-700">
            · gider satırı yok —{' '}
            <Link href="/workshop/veri-yukle" className="underline">gider yükle</Link>
          </span>
        )}
      </div>

      <EkonomiForm donem={donem} kayit={veri.kayit} />

      {veri.gecmis.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Girdiğim dönemler
          </h2>
          <div className="flex flex-wrap gap-1 text-sm">
            {veri.gecmis.map((g) => {
              const s = `${g.yil}-${String(g.ay).padStart(2, '0')}`
              const dd = doluluk(g.k, g.gider_var)
              return (
                <Link key={s} href={`/workshop/ekonomi?donem=${s}`}
                      className={`px-2 py-1 rounded border ${s === donem ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {s}
                  <span className={`ml-1 text-xs ${s === donem ? 'text-slate-300' : 'text-slate-400'}`}>
                    {dd === 'tam' ? '✓' : '!'}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
