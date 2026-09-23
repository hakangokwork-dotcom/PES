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
import { dnaProfilleri as dnaHesapla, type GiderGrupSatiri } from '@/lib/pes/ekonomi-dna'
import { G_KEYS } from '@/lib/pes/gider-gruplari'
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

    /* Maliyet DNA: G1-G8 v_expense_groups'tan geliyor, rasyolardan
       türetilemez. Gider satırı olmayan atölye de listeye girer; toplamı
       null çıkar ve bölüm onu göstermez. */
    const dnaSatirlari: GiderGrupSatiri[] = satirlar
      /* Yalnız ekonomi satırı OLAN atölyeler. monthly_expense'te demo seed
         kayıtları da var (FA-01..FA-08, _seed_demo_data.mjs) ve onlar
         işçilik medyanını yukarı çekip gerçek atölyeleri yapay olarak
         "yalın" gösteriyordu. Radarın geri kalanı zaten bu 11 satır
         üzerinden hesaplanıyor; DNA da aynı örneklemde kalsın. */
      .filter(r => r.veri_var === true)
      .map((r) => ({
      workshopId: r.workshop_id as number,
      ad: r.name as string,
      g1_iscilik: (r.g1_iscilik as number | null) ?? null,
      g2_personel_yan: (r.g2_personel_yan as number | null) ?? null,
      g3_enerji: (r.g3_enerji as number | null) ?? null,
      g4_mekan: (r.g4_mekan as number | null) ?? null,
      g5_makine: (r.g5_makine as number | null) ?? null,
      g6_sarf: (r.g6_sarf as number | null) ?? null,
      g7_dis_hizmet: (r.g7_dis_hizmet as number | null) ?? null,
      g8_diger: (r.g8_diger as number | null) ?? null,
    }))
    /* Medyan yalnız gider verisi OLAN atölyelerden. YALNIZ G kolonlarına
       bakılır: Object.values(...) kullanmak workshopId'yi de sayı olarak
       görüp her atölyeyi geçiriyordu. */
    const dnaVerili = dnaSatirlari.filter(s =>
      G_KEYS.some(k => typeof s[k] === 'number' && (s[k] as number) > 0),
    )
    const dna = dnaHesapla(dnaVerili)

    return { donemler, rasyolarArr, dna }
  })

  if (!sonuc) redirect('/login')

  const { donemler, rasyolarArr, dna } = sonuc

  return (
    <RadarClient
      veri={rasyolarArr}
      secilenDonem={donemGecerli}
      donemler={donemler}
      dnaProfilleri={dna}
    />
  )
}
