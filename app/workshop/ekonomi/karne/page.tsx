import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/panel-guard'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { EKONOMI_SORGUSU, dbSatiriCoz, paramCoz } from '@/lib/pes/ekonomi-sorgu'
import { hesapla } from '@/lib/pes/ekonomi-hesap'
import { akranDegerleri } from '@/lib/pes/ekonomi-akran-sorgu'
import {
  akranIstatistik, konum, ASGARI_ORNEKLEM, KONUM_ETIKET,
} from '@/lib/pes/ekonomi-akran-ozet'
import { RASYO_META_MAP } from '@/lib/pes/ekonomi-rasyo-meta'
import { donemCoz } from '@/lib/pes/ekonomi-talep'
import { alanFormulu } from '@/lib/pes/formul-katalogu'
import { fmtRasyo } from '@/app/pes/ekonomi/formatlayici'
import type { EkonomiRasyo } from '@/lib/pes/ekonomi-tipler'

export const dynamic = 'force-dynamic'

/**
 * /workshop/ekonomi/karne — Atölye kendi durumunu ve kıyasını görür.
 *
 * Bu ekran veri toplamanın KARŞILIĞI: atölyenin doldurma sebebi.
 *
 * BAŞKA ATÖLYE GÖRÜNMEZ. Ne ad, ne kod, ne tek tek değer. Yalnız medyan,
 * çeyreklik ve "n atölye içinde kaçıncı". Akran değerleri tek bir yerden,
 * yalnız sayı dizisi döndüren akranDegerleri() ile geliyor.
 *
 * n < 5 ise kıyas HİÇ gösterilmez: küçük grupta medyan rakibin rakamını
 * ifşa eder.
 */

/* Atölyeye anlamlı gelen alt küme — 37 rasyonun hepsi değil. */
const GOSTERGELER: Array<keyof EkonomiRasyo> = [
  'marj', 'ciroKisi', 'dikimDkCiro', 'dakikaMarji',
  'dikimDkMaliyet', 'asgariDkCarpani', 'basabasFiyat', 'adilFiyat',
  'iscilikPayi', 'adetDikimci',
]

export default async function KarneSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string }>
}) {
  const tenant = await requireSession()
  if (!tenant.workshopId) redirect('/pes/ekonomi')

  const sp = await searchParams
  const donem = donemCoz(sp.donem ?? '') ? (sp.donem as string) : '2026-01'
  const d = donemCoz(donem)!

  /* 1) Kendi rasyoları — atölyenin KENDİ RLS bağlamında. */
  const kendi = await withServerTenant(async (sql) => {
    const [w] = await sql`
      SELECT id, code, name FROM workshop WHERE id = ${tenant.workshopId}
    ` as unknown as Array<{ id: number; code: string; name: string }>

    const paramSatirlari = await sql`
      SELECT DISTINCT ON (param_key) param_key, param_value
      FROM economy_param WHERE donem <= ${donem}
      ORDER BY param_key, donem DESC
    ` as unknown as Array<{ param_key: string; param_value: unknown }>
    const param = paramCoz(paramSatirlari)

    const ham = await sql.unsafe(EKONOMI_SORGUSU, [donem, d.yil, d.ay])
    const satir = (ham as unknown as Array<Record<string, unknown>>)
      .find((r) => r.workshop_id === tenant.workshopId)

    const donemler = await sql`
      SELECT year::int AS yil, month::int AS ay FROM workshop_economy
       WHERE workshop_id = ${tenant.workshopId}
       ORDER BY yil DESC, ay DESC LIMIT 12
    ` as unknown as Array<{ yil: number; ay: number }>

    return {
      atolye: w,
      rasyolar: satir ? hesapla(dbSatiriCoz(satir as never, param)) : null,
      donemler,
    }
  })

  if (!kendi) redirect('/login')

  /* 2) Akran değerleri — bilinçli yükseltme, çıkışı yalnız sayı. */
  const akran = kendi.rasyolar
    ? await akranDegerleri(tenant.tenantId, donem, GOSTERGELER)
    : {}

  const satirlar = GOSTERGELER.map((alan) => {
    const meta = RASYO_META_MAP.get(alan as string)
    const kendiDeger = kendi.rasyolar?.[alan] ?? null
    const yon = meta?.yon === 'dusuk-iyi' ? 'dusuk-iyi' as const : 'yuksek-iyi' as const
    const ist = meta && meta.yon !== 'notr'
      ? akranIstatistik(kendiDeger, akran[alan as string] ?? [], yon)
      : null
    return { alan, meta, kendiDeger, yon, ist, k: ist ? konum(ist, yon) : null }
  }).filter((s) => s.meta)

  const yeterliOrneklem = satirlar.some((s) => s.ist !== null)

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/workshop" className="text-sm text-faint hover:text-ink">← Panel</Link>
        <h1 className="text-xl font-semibold mt-1">Karnem</h1>
        <p className="text-sm text-slate-500">
          {kendi.atolye.name} · {donem} ·{' '}
          <Link href={`/workshop/ekonomi?donem=${donem}`} className="underline">
            verimi güncelle →
          </Link>
        </p>
      </div>

      {kendi.donemler.length > 0 && (
        <nav className="flex gap-1 text-sm flex-wrap">
          {kendi.donemler.map((x) => {
            const s = `${x.yil}-${String(x.ay).padStart(2, '0')}`
            return (
              <Link key={s} href={`/workshop/ekonomi/karne?donem=${s}`}
                    className={`px-2 py-1 rounded ${s === donem ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 border border-slate-200'}`}>
                {s}
              </Link>
            )
          })}
        </nav>
      )}

      {!kendi.rasyolar && (
        <p className="rounded border border-amber-200 bg-amber-50 p-4 text-sm">
          {donem} dönemi için veriniz yok.{' '}
          <Link href={`/workshop/ekonomi?donem=${donem}`} className="underline font-medium">
            Veri girin
          </Link>{' '}
          — karne verinizden hesaplanıyor.
        </p>
      )}

      {kendi.rasyolar && !yeterliOrneklem && (
        <p className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Kıyas için yeterli atölye yok ({ASGARI_ORNEKLEM} atölyeden az veri var).
          Kendi rakamlarınız aşağıda; kıyas, veri yeterli sayıya ulaşınca açılır.
        </p>
      )}

      {kendi.rasyolar && (
        <div className="space-y-2">
          {satirlar.map(({ alan, meta, kendiDeger, ist, k }) => {
            const formul = alanFormulu(alan as string)
            return (
              <article key={alan as string} className="rounded border border-slate-200 p-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-medium">{meta!.etiket}</h2>
                    <p className="text-xs text-slate-400">{meta!.onemAciklama}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-semibold tabular-nums">
                      {kendiDeger === null
                        ? <span className="text-slate-400 text-base font-normal">hesaplanamadı</span>
                        : fmtRasyo(meta!, kendiDeger)}
                    </div>
                    {ist?.kendiSira && (
                      <div className="text-xs text-slate-500">
                        {ist.n} atölye içinde {ist.kendiSira}.
                      </div>
                    )}
                  </div>
                </div>

                {ist && (
                  <div className="mt-3 text-sm">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>en düşük {fmtRasyo(meta!, ist.enDusuk)}</span>
                      <span>medyan {fmtRasyo(meta!, ist.medyan)}</span>
                      <span>en yüksek {fmtRasyo(meta!, ist.enYuksek)}</span>
                    </div>
                    {/* Çeyreklik aralığı + kendi konumu. Başka atölyenin
                        tek tek değeri GÖSTERİLMEZ, yalnız dağılım. */}
                    <div className="relative mt-1 h-2 rounded bg-slate-100">
                      {(() => {
                        const genislik = ist.enYuksek - ist.enDusuk
                        const oran = (v: number) =>
                          genislik === 0 ? 50 : ((v - ist.enDusuk) / genislik) * 100
                        return (
                          <>
                            <div className="absolute h-full rounded bg-slate-300"
                                 style={{ left: `${oran(ist.q1)}%`, width: `${oran(ist.q3) - oran(ist.q1)}%` }} />
                            <div className="absolute h-full w-px bg-slate-500"
                                 style={{ left: `${oran(ist.medyan)}%` }} />
                            {kendiDeger !== null && (
                              <div className="absolute -top-0.5 h-3 w-1 rounded bg-slate-900"
                                   style={{ left: `${oran(kendiDeger)}%` }} />
                            )}
                          </>
                        )
                      })()}
                    </div>
                    {k && (
                      <div className="mt-1 text-xs font-medium text-slate-700">
                        {KONUM_ETIKET[k]}
                      </div>
                    )}
                  </div>
                )}

                {formul && (
                  <p className="mt-2 text-xs text-slate-400 font-mono">{formul.sozel}</p>
                )}
              </article>
            )
          })}
        </div>
      )}

      <p className="text-xs text-slate-400">
        Kıyas rakamları isimsizdir: yalnız dağılım ve sıranız gösterilir,
        başka atölyelerin değerleri gösterilmez.
      </p>
    </div>
  )
}
