/**
 * Referans model tablosu — ekran ve CSV aynı kaynaktan.
 * Hesap lib/pes/referans-model.ts'te; burası yalnız veriyi toplar.
 */
import type postgres from 'postgres'
import { paramCoz } from './ekonomi-sorgu'
import {
  bolgeSureleri, bolumSureleri, guvenEtiketi, modelSayisiTahmini, referansFiyat,
  type Aday, type BolgeSure, type BolumSure, type Guven, type ReferansFiyat,
} from './referans-model'

type Sql = postgres.Sql | postgres.TransactionSql

export type ReferansSatiri = {
  urunTipiId: number
  klasman: string
  urunGrubu: string | null
  segment: string | null
  modelSayisi: number
  parcaSayisi: number
  guven: Guven
  bolgeler: BolgeSure[]
  sure: BolumSure
  /** Teşvik bölgesi (1-6) → fiyat. */
  fiyat: Record<number, ReferansFiyat>
}

export type ReferansTablosu = {
  /** Kullanılan dk_maliyet dönemi (istenen dönemden küçük/eşit en yakın). */
  dkDonem: string | null
  paramDonem: string | null
  dkMaliyet: Record<number, number>
  oranlar: { kesim: number; ukp: number }
  satirlar: ReferansSatiri[]
}

export async function referansTablosu(sql: Sql, donem: string): Promise<ReferansTablosu> {
  const [dk] = await sql`
    SELECT max(donem) AS d FROM dk_maliyet WHERE donem <= ${donem}` as unknown as Array<{ d: string | null }>
  const dkSatir = dk?.d
    ? await sql`SELECT bolge, dk_maliyet_tl::float AS tl FROM dk_maliyet WHERE donem = ${dk.d}` as unknown as Array<{ bolge: number; tl: number }>
    : []
  const dkMaliyet: Record<number, number> = {}
  for (const r of dkSatir) dkMaliyet[r.bolge] = r.tl

  const paramSatirlari = await sql`
    SELECT DISTINCT ON (param_key) param_key, param_value
    FROM economy_param WHERE donem <= ${donem} ORDER BY param_key, donem DESC`
  const param = paramCoz(paramSatirlari as unknown as Array<{ param_key: string; param_value: unknown }>)
  const [pd] = await sql`
    SELECT max(donem) AS d FROM economy_param WHERE donem <= ${donem}` as unknown as Array<{ d: string | null }>

  const parcalar = await sql`
    SELECT p.urun_tipi_id, ut.klasman_ad, ut.urun_grubu, ut.segment,
           p.bolge, p.ek_parca_ad, p.gorulme, p.sn_medyan::float AS sn_medyan
    FROM ref_parca_sure p JOIN ref_urun_tipi ut ON ut.id = p.urun_tipi_id` as unknown as Array<{
      urun_tipi_id: number; klasman_ad: string; urun_grubu: string | null; segment: string | null
      bolge: string; ek_parca_ad: string; gorulme: number; sn_medyan: number
    }>

  const grup = new Map<number, { bas: (typeof parcalar)[number]; adaylar: Aday[] }>()
  for (const p of parcalar) {
    const g = grup.get(p.urun_tipi_id) ?? { bas: p, adaylar: [] }
    g.adaylar.push({ bolge: p.bolge, ekParca: p.ek_parca_ad, gorulme: p.gorulme, snMedyan: p.sn_medyan })
    grup.set(p.urun_tipi_id, g)
  }

  const satirlar: ReferansSatiri[] = [...grup.entries()].map(([id, { bas, adaylar }]) => {
    const bolgeler = bolgeSureleri(adaylar)
    const dikimSn = bolgeler.reduce((s, b) => s + b.sn, 0)
    const sure = bolumSureleri(dikimSn, param)
    const n = modelSayisiTahmini(adaylar)
    const fiyat: Record<number, ReferansFiyat> = {}
    for (const b of Object.keys(dkMaliyet).map(Number)) fiyat[b] = referansFiyat(sure, dkMaliyet[b])
    return {
      urunTipiId: id, klasman: bas.klasman_ad, urunGrubu: bas.urun_grubu, segment: bas.segment,
      modelSayisi: n, parcaSayisi: adaylar.length, guven: guvenEtiketi(n),
      bolgeler, sure, fiyat,
    }
  }).sort((a, b) =>
    (a.urunGrubu ?? '').localeCompare(b.urunGrubu ?? '', 'tr') || a.klasman.localeCompare(b.klasman, 'tr'))

  return {
    dkDonem: dk?.d ?? null,
    paramDonem: pd?.d ?? null,
    dkMaliyet,
    oranlar: { kesim: param.ref_kesim_personel_orani, ukp: param.ref_ukp_personel_orani },
    satirlar,
  }
}

/** Ekrandaki ve CSV'deki dönem varsayılanı: bugünün ayı. */
export function varsayilanDonem(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
