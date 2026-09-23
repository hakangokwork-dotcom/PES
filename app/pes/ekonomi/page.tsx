/**
 * /pes/ekonomi — Atölye Rasyo Radarı
 *
 * Server component: postgres.js ile EKONOMI_SORGUSU çalıştırır, hesapla()
 * ile 37 rasyoya çevirir, marjSirasi ekler, RadarClient'a geçer.
 *
 * Kimlik kontrolü withServerTenant üzerinden yapılır — auth yoksa null
 * döner ve redirect('/login') çalışır.
 */
import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { EKONOMI_SORGUSU, dbSatiriCoz, paramCoz } from '@/lib/pes/ekonomi-sorgu'
import { hesapla } from '@/lib/pes/ekonomi-hesap'
import { marjSirasi, fiyatEndeksi } from '@/lib/pes/ekonomi-akran'
import type { AkranAdayi } from '@/lib/pes/ekonomi-akran'
import type { AtolyeRasyolari } from '@/lib/pes/ekonomi-radar'
import RadarClient from './RadarClient'

export const dynamic = 'force-dynamic'

export default async function EkonomiSayfa({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string }>
}) {
  const sp = await searchParams
  const donem = sp.donem ?? '2026-01'

  // YYYY-MM doğrulaması
  const donemGecerli = /^\d{4}-(0[1-9]|1[0-2])$/.test(donem) ? donem : '2026-01'
  const [yil, ay] = donemGecerli.split('-').map(Number)

  const sonuc = await withServerTenant(async (sql) => {
    // Aktif dönemler
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay
      FROM monthly_expense
      ORDER BY yil DESC, ay DESC
      LIMIT 24
    ` as Array<{ yil: number; ay: number }>

    // Parametreler
    const paramSatirlari = await sql`
      SELECT DISTINCT ON (param_key) param_key, param_value
      FROM economy_param
      WHERE donem <= ${donemGecerli}
      ORDER BY param_key, donem DESC
    ` as Array<{ param_key: string; param_value: unknown }>

    const param = paramCoz(paramSatirlari)

    // Ana ekonomi sorgusu
    const satirlar = await sql.unsafe(EKONOMI_SORGUSU, [donemGecerli, yil, ay])

    // Her satırı rasyolara çevir
    const rasyolarArr: AtolyeRasyolari[] = satirlar.map((r) => {
      const girdi = dbSatiriCoz(r as unknown as Parameters<typeof dbSatiriCoz>[0], param)
      const rasyolar = hesapla(girdi)
      return {
        workshopId: r.workshop_id as number,
        ad: r.name as string,
        code: r.code as string,
        bolge: r.bolge as number | null,
        veri_var: r.veri_var as boolean,
        rasyolar: { ...rasyolar, marjSirasi: null, fiyatEndeksi: null }, // ikinci geçişte dolar
      }
    })

    // marjSirasi hesapla
    const akranAdaylari: AkranAdayi[] = rasyolarArr.map(a => ({
      workshopId: a.workshopId,
      ad: a.ad,
      klasmanlar: [],
      sewingStaff: null,
      marj: a.rasyolar.marj,
    }))

    /* Örnekleme bağlı iki gösterge ikinci geçişte dolar: tek atölyeden
       hesaplanamazlar. Endeksin paydası bu dönemin dikim dk cirosu medyanı. */
    const dkCiroOrneklem = rasyolarArr.map(a => a.rasyolar.dikimDkCiro)
    for (const a of rasyolarArr) {
      a.rasyolar.marjSirasi = marjSirasi(a.rasyolar.marj, akranAdaylari)
      a.rasyolar.fiyatEndeksi = fiyatEndeksi(a.rasyolar.dikimDkCiro, dkCiroOrneklem)
    }

    return { donemler, rasyolarArr }
  })

  if (!sonuc) redirect('/login')

  const { donemler, rasyolarArr } = sonuc

  return (
    <RadarClient
      veri={rasyolarArr}
      secilenDonem={donemGecerli}
      donemler={donemler}
    />
  )
}
