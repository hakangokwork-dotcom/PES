/**
 * /pes/siparis-simulasyon — Sipariş ve teşvik simülatörü (E5)
 *
 * Dört soruyu cevaplar:
 *   1. 50.000 tek sipariş mi, 5.000'er 10 sipariş mi?
 *   2. Model değişim süresinin çıktıya etkisi
 *   3. MTM değişimi ↔ çıktı ilişkisi
 *   4. Fast-track siparişte adil teşvik ne olmalı
 *
 * VARSAYIM / ÖLÇÜM AYRIMI: değişim süresi ve öğrenme eğrisi VARSAYIMDIR —
 * PES'te gerçek ölçüm yok (changeover_record'un 45 satırı demo verisi).
 * Dakika maliyeti (E0) ve MTM süresi (E3) GERÇEK. Ekran ikisini ayrı
 * gösterir; karışırsa uydurma sayı ölçülmüş gibi görünür.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { EKONOMI_SORGUSU, dbSatiriCoz, paramCoz } from '@/lib/pes/ekonomi-sorgu'
import { hesapla } from '@/lib/pes/ekonomi-hesap'
import { VARSAYILAN_SENARYO_PARAM } from '@/lib/pes/siparis-senaryo'
import Simulator, { type AtolyeSecenegi, type BultenSecenegi } from './Simulator'

export const dynamic = 'force-dynamic'

export default async function SimulasyonSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string }>
}) {
  const sp = await searchParams
  const donem = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.donem ?? '')
    ? (sp.donem as string) : '2026-01'
  const [yil, ay] = donem.split('-').map(Number)

  const veri = await withServerTenant(async (sql) => {
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay
      FROM workshop_economy ORDER BY yil DESC, ay DESC LIMIT 24
    ` as Array<{ yil: number; ay: number }>

    const paramSatirlari = await sql`
      SELECT DISTINCT ON (param_key) param_key, param_value
      FROM economy_param WHERE donem <= ${donem}
      ORDER BY param_key, donem DESC
    ` as unknown as Array<{ param_key: string; param_value: unknown }>
    const param = paramCoz(paramSatirlari)

    /* Atölye başına: dikim dk maliyeti (E0 — GERÇEK), dikim kadrosu,
       günlük kapasite, dakika marjı (garanti değeri için). */
    const ham = await sql.unsafe(EKONOMI_SORGUSU, [donem, yil, ay])
    const atolyeler: AtolyeSecenegi[] = (ham as unknown as Array<Record<string, unknown>>)
      .map((r) => {
        const girdi = dbSatiriCoz(r as never, param)
        const rasyo = hesapla(girdi)
        const dikimKisi = girdi.ekonomi.sewing_staff
        const saat = girdi.ekonomi.hours_per_day
        return {
          id: r.workshop_id as number,
          ad: r.name as string,
          dikimDkMaliyet: rasyo.dikimDkMaliyet,
          dakikaMarji: rasyo.dakikaMarji,
          dikimKisi,
          gunlukKapasiteDk: dikimKisi !== null && saat !== null ? dikimKisi * saat * 60 : null,
        }
      })
      .filter((a) => a.dikimDkMaliyet !== null && a.gunlukKapasiteDk !== null)

    /* Bültenler: bölüm SAM'leri (E3 — GERÇEK). */
    const bultenler = await sql`
      SELECT b.id, b.model_adi,
             coalesce(sum(o.cevrim_sn) FILTER (WHERE o.bolum='KESIM'),0)::float AS kesim_sn,
             coalesce(sum(o.cevrim_sn) FILTER (WHERE o.bolum='DIKIM'),0)::float AS dikim_sn,
             coalesce(sum(o.cevrim_sn) FILTER (WHERE o.bolum='UKP'),0)::float   AS ukp_sn
        FROM model_bulten b
        LEFT JOIN model_bulten_operasyon o ON o.bulten_id = b.id
       GROUP BY b.id, b.model_adi
       ORDER BY b.model_adi
    ` as unknown as Array<Record<string, unknown>>

    /* Atölyeye özel üretim parametresi varsa onu kullan (042). */
    const uretimParam = await sql`
      SELECT workshop_id, degisim_dk, ogrenme_orani, ilk_birim_carpani, kaynak
        FROM workshop_uretim_param
    ` as unknown as Array<Record<string, unknown>>

    return {
      donemler, atolyeler, param,
      bultenler: bultenler.map((b): BultenSecenegi => ({
        id: b.id as number,
        ad: b.model_adi as string,
        kesimSn: Number(b.kesim_sn),
        dikimSn: Number(b.dikim_sn),
        ukpSn: Number(b.ukp_sn),
      })),
      uretimParam: uretimParam.map((u) => ({
        workshopId: u.workshop_id as number,
        degisimDk: u.degisim_dk === null ? null : Number(u.degisim_dk),
        ogrenmeOrani: u.ogrenme_orani === null ? null : Number(u.ogrenme_orani),
        ilkBirimCarpani: u.ilk_birim_carpani === null ? null : Number(u.ilk_birim_carpani),
        kaynak: u.kaynak as string,
      })),
    }
  })

  if (!veri) redirect('/login')

  return (
    <main className="p-6 space-y-5">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Sipariş ve Teşvik Simülatörü</h1>
          <p className="text-sm text-slate-500">
            {donem} · {veri.atolyeler.length} atölye · {veri.bultenler.length} bülten ·{' '}
            <Link href={`/pes/ekonomi?donem=${donem}`} className="underline">rasyo radarı →</Link>
          </p>
        </div>
        <nav className="flex gap-1 text-sm flex-wrap">
          {veri.donemler.map((d) => {
            const s = `${d.yil}-${String(d.ay).padStart(2, '0')}`
            return (
              <Link key={s} href={`/pes/siparis-simulasyon?donem=${s}`}
                    className={`px-2 py-1 rounded ${s === donem ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
                {s}
              </Link>
            )
          })}
        </nav>
      </header>

      {veri.atolyeler.length === 0 || veri.bultenler.length === 0 ? (
        <p className="rounded border border-amber-200 bg-amber-50 p-4 text-sm">
          Simülasyon için hem dakika maliyeti hesaplanabilen bir atölye hem de
          bir model bülteni gerekiyor.{' '}
          {veri.atolyeler.length === 0 && (
            <Link href={`/pes/ekonomi/talep?donem=${donem}`} className="underline">
              Önce ekonomi verisi toplayın
            </Link>
          )}
          {veri.bultenler.length === 0 && (
            <Link href="/pes/model" className="underline">Önce bülten yükleyin</Link>
          )}
        </p>
      ) : (
        <Simulator
          atolyeler={veri.atolyeler}
          bultenler={veri.bultenler}
          uretimParam={veri.uretimParam}
          effSewing={veri.param.eff_sewing}
          hedefMarj={veri.param.target_margin}
          varsayilan={VARSAYILAN_SENARYO_PARAM}
        />
      )}
    </main>
  )
}
