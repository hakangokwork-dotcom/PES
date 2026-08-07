import type postgres from 'postgres'

/* Malzeme / üretim başlangıcı çakışması (tasarım K3, §5.5).

   KURAL: en geç malzeme, ilk üretim aşamasının planlanan başlangıcından
   SONRA geliyorsa sipariş işaretlenir. ENGELLENMEZ — karar kullanıcıda.

   "En geç malzeme" hesabında gerçek geliş tarihi beklenen tarihi ezer:
   beklenen 15 Ocak yazsa da malzeme 20 Kasım'da geldiyse sorun yok.
   Beklenen tarihe bakmak, gelmiş malzemeyi geç sanmak olurdu. */

export type MalzemeUyarisi = {
  workOrderId: number
  siparisNo: string | null
  musteri: string | null
  atolyeKodu: string
  uretimBaslangic: string
  enGecMalzeme: string
  gecikmeGun: number
  bekleyenKalem: number
}

/**
 * Malzemesi üretim başlangıcına yetişmeyen siparişler.
 *
 * sql bir TRANSACTION handle'ı olmalı (withTenant/withTenantRoute içi).
 */
export async function malzemeGecikenSiparisler(
  sql: postgres.TransactionSql,
): Promise<MalzemeUyarisi[]> {
  const satirlar = await sql`
    WITH uretim AS (
      /* Zincirin ilk TARİHLİ aşaması; tarihsiz aşamalar (kapasitesi
         tanımsız olanlar) karşılaştırmaya girmez. */
      SELECT work_order_id, MIN(plan_baslangic) AS baslangic
      FROM work_order_stage
      WHERE plan_baslangic IS NOT NULL
      GROUP BY work_order_id
    ),
    malzeme AS (
      SELECT work_order_id,
             MAX(COALESCE(gelis_tarihi, beklenen_tarih)) AS en_gec,
             COUNT(*) FILTER (WHERE durum <> 'Geldi')::int AS bekleyen
      FROM work_order_material
      WHERE COALESCE(gelis_tarihi, beklenen_tarih) IS NOT NULL
      GROUP BY work_order_id
    )
    SELECT
      wo.id                     AS work_order_id,
      wo.siparis_no,
      wo.musteri,
      w.code                    AS atolye_kodu,
      u.baslangic::text         AS uretim_baslangic,
      m.en_gec::text            AS en_gec_malzeme,
      (m.en_gec - u.baslangic)  AS gecikme_gun,
      m.bekleyen                AS bekleyen_kalem
    FROM work_order wo
    JOIN workshop w  ON w.id = wo.workshop_id
    JOIN uretim  u   ON u.work_order_id = wo.id
    JOIN malzeme m   ON m.work_order_id = wo.id
    WHERE wo.durum NOT IN ('Tamamlandi', 'Sevk Edildi', 'İptal')
      AND m.en_gec > u.baslangic
    ORDER BY (m.en_gec - u.baslangic) DESC, wo.siparis_no`

  return satirlar.map(r => ({
    workOrderId: Number(r.work_order_id),
    siparisNo: (r.siparis_no as string | null) ?? null,
    musteri: (r.musteri as string | null) ?? null,
    atolyeKodu: r.atolye_kodu as string,
    uretimBaslangic: r.uretim_baslangic as string,
    enGecMalzeme: r.en_gec_malzeme as string,
    gecikmeGun: Number(r.gecikme_gun),
    bekleyenKalem: Number(r.bekleyen_kalem),
  }))
}
