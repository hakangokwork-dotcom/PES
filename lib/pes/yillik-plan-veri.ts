/**
 * Yıllık talep planı — veritabanı okuması. Hesap yillik-plan.ts'te.
 *
 * Tüm fonksiyonlar TRANSACTION handle'ı ister (withTenantRoute /
 * withServerTenant içi); aksi halde RLS tenant bağlamı yok, 0 satır.
 */
import type postgres from 'postgres'
import { aylikKapasiteDk, VARDIYA_DK, VERIM } from './yillik-plan'
import { referansDikimSn, type Aday } from './referans-model'
import {
  boyutUyumlari, uyumOzeti, genelUyum, GENEL_ETIKET,
  type AtolyeYetenegi, type GenelUyum,
} from './yetenek-uyum'
import { adayAtolyeler } from './aday-atolye'
import type { Kunye } from './kunye'

type Sql = postgres.TransactionSql
const bosYil = () => Array<number>(12).fill(0)

export type AtolyeKapasite = { workshopId: number; kod: string; ad: string; kapasiteDk: number[] }

export async function atolyeKapasiteleri(sql: Sql, yil: number): Promise<AtolyeKapasite[]> {
  const atolyeler = await sql`
    SELECT w.id, w.code, w.name,
           COALESCE(SUM(pl.operator_count) FILTER (WHERE pl.is_active), 0)::int AS operator,
           COALESCE(SUM(pl.daily_target)   FILTER (WHERE pl.is_active), 0)::int AS hedef
      FROM workshop w
      LEFT JOIN production_line pl ON pl.workshop_id = w.id
     WHERE w.is_active
     GROUP BY w.id
     ORDER BY w.code
  ` as unknown as Array<{ id: number; code: string; name: string; operator: number; hedef: number }>

  const ozel = await sql`
    SELECT workshop_id, tarih::text AS tarih, gunluk_kapasite
      FROM workshop_kapasite_gun
     WHERE tarih >= make_date(${yil}::int, 1, 1)
       AND tarih <  make_date(${yil}::int + 1, 1, 1)
  ` as unknown as Array<{ workshop_id: number; tarih: string; gunluk_kapasite: number }>

  return atolyeler.map((a) => {
    const oranlar: Record<string, number> = {}
    for (const o of ozel.filter((x) => x.workshop_id === a.id)) {
      /* Override ADET; normal hedefe oranla dakikaya çevrilir. Hedef
         girilmemişse oran kurulamaz: sıfır override kapatır, diğeri yok sayılır. */
      oranlar[o.tarih] = a.hedef > 0 ? o.gunluk_kapasite / a.hedef : (o.gunluk_kapasite === 0 ? 0 : 1)
    }
    return {
      workshopId: a.id, kod: a.code, ad: a.name,
      kapasiteDk: aylikKapasiteDk(yil, a.operator * VARDIYA_DK * VERIM, oranlar),
    }
  })
}

/** Atanmış gerçek PO'ların aylık dakikası. Ay = bitiş, yoksa teslim. */
export async function poAylikYuk(sql: Sql, yil: number): Promise<{
  yuk: Map<number, number[]>; samsizPo: number
}> {
  const satirlar = await sql`
    SELECT workshop_id,
           extract(month FROM COALESCE(bitis_tarihi, teslim_tarihi))::int AS ay,
           COALESCE(SUM(siparis_miktari * sam_toplam_sn / 60.0), 0)::float AS dk,
           COUNT(*) FILTER (WHERE COALESCE(sam_toplam_sn, 0) = 0)::int AS samsiz
      FROM work_order
     WHERE workshop_id IS NOT NULL
       AND durum <> 'Iptal'
       AND extract(year FROM COALESCE(bitis_tarihi, teslim_tarihi)) = ${yil}
     GROUP BY 1, 2
  ` as unknown as Array<{ workshop_id: number; ay: number; dk: number; samsiz: number }>
  const yuk = new Map<number, number[]>()
  let samsizPo = 0
  for (const s of satirlar) {
    const a = yuk.get(s.workshop_id) ?? bosYil()
    a[s.ay - 1] += s.dk
    yuk.set(s.workshop_id, a)
    samsizPo += s.samsiz
  }
  return { yuk, samsizPo }
}

/**
 * Tahsislerin aylık dakikası. Kaleme bağlanmış PO'lar zaten poAylikYuk'ta
 * sayıldığı için kalemin tahsisi TÜKETİLEN oranında küçültülür — yoksa
 * aynı iş iki kez yük olurdu.
 */
export async function tahsisAylikYuk(
  sql: Sql, yil: number, haricKalemId: number | null,
): Promise<Map<number, number[]>> {
  const satirlar = await sql`
    WITH tuketim AS (
      SELECT tahmin_kalem_id AS kalem_id, SUM(siparis_miktari)::float AS adet
        FROM work_order
       WHERE tahmin_kalem_id IS NOT NULL AND durum <> 'Iptal'
       GROUP BY 1)
    SELECT t.workshop_id, t.ay,
           SUM(t.adet * k.sam_dk
               * GREATEST(0, 1 - COALESCE(u.adet, 0) / k.adet))::float AS dk
      FROM talep_tahsis t
      JOIN talep_tahmini_kalem k ON k.id = t.kalem_id
      JOIN talep_tahmini h ON h.id = k.tahmin_id
      LEFT JOIN tuketim u ON u.kalem_id = k.id
     WHERE h.yil = ${yil}
       AND k.sam_dk IS NOT NULL
       AND (${haricKalemId}::int IS NULL OR t.kalem_id <> ${haricKalemId}::int)
     GROUP BY 1, 2
  ` as unknown as Array<{ workshop_id: number; ay: number; dk: number }>
  const yuk = new Map<number, number[]>()
  for (const s of satirlar) {
    const a = yuk.get(s.workshop_id) ?? bosYil()
    a[s.ay - 1] += s.dk
    yuk.set(s.workshop_id, a)
  }
  return yuk
}

/** Ürün tipinin referans dikim süresi (dk); referans yoksa null. */
export async function referansSamDk(sql: Sql, urunTipiId: number): Promise<number | null> {
  const satirlar = await sql`
    SELECT bolge, ek_parca_ad, gorulme, sn_medyan::float AS sn_medyan
      FROM ref_parca_sure WHERE urun_tipi_id = ${urunTipiId}
  ` as unknown as Array<{ bolge: string; ek_parca_ad: string; gorulme: number; sn_medyan: number }>
  if (satirlar.length === 0) return null
  const adaylar: Aday[] = satirlar.map((s) => ({
    bolge: s.bolge, ekParca: s.ek_parca_ad, gorulme: s.gorulme, snMedyan: s.sn_medyan,
  }))
  const sn = referansDikimSn(adaylar)
  return sn > 0 ? sn / 60 : null
}

export type AtolyeUyumu = { uyum: GenelUyum; neden: string | null }

export async function atolyeUyumlari(
  sql: Sql, kunye: Kunye,
): Promise<Map<number, AtolyeUyumu>> {
  const yetenek = await sql`
    SELECT DISTINCT pl.workshop_id, lc.dimension_code AS boyut, lc.value_code AS deger
      FROM line_capability lc
      JOIN production_line pl ON pl.id = lc.line_id
  ` as unknown as Array<{ workshop_id: number; boyut: string; deger: string }>
  const izlenen = new Set((await sql`
    SELECT DISTINCT dimension_code FROM line_capability
  ` as unknown as Array<{ dimension_code: string }>).map((r) => r.dimension_code))

  const atolyeYet = new Map<number, AtolyeYetenegi[]>()
  for (const y of yetenek) {
    const l = atolyeYet.get(y.workshop_id) ?? []
    l.push({ boyut: y.boyut, deger: y.deger })
    atolyeYet.set(y.workshop_id, l)
  }
  const atolyeler = await sql`SELECT id FROM workshop WHERE is_active` as unknown as Array<{ id: number }>
  const sonuc = new Map<number, AtolyeUyumu>()
  for (const { id } of atolyeler) {
    const ozet = uyumOzeti(boyutUyumlari(kunye, atolyeYet.get(id) ?? [], izlenen))
    const uyum = genelUyum(ozet)
    sonuc.set(id, {
      uyum,
      neden: uyum === 'uyumsuz' ? `Uymayan: ${ozet.eksikBoyutlar.join(', ')}`
        : uyum === 'bilinmiyor' ? GENEL_ETIKET.bilinmiyor : null,
    })
  }
  return sonuc
}

/** adayAtolyeler puanı; yıl sonuna teslim varsayılır. */
export async function atolyePuanlari(
  sql: Sql, yil: number, kunye: Kunye, adet: number,
): Promise<Map<number, number>> {
  const bugunIso = new Date().toISOString().slice(0, 10)
  const yilBasi = `${yil}-01-01`
  const adaylar = await adayAtolyeler(sql, {
    adet,
    teslimTarihi: `${yil}-12-31`,
    bugun: bugunIso > yilBasi ? bugunIso : yilBasi,
    klasmanKodu: kunye.klasman_kodu ?? null,
    kumasTuruKodu: kunye.kumas_turu_kodu ?? null,
  })
  return new Map(adaylar.map((a) => [a.workshopId, a.puan]))
}
