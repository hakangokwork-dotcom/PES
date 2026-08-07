import type postgres from 'postgres'

/* Günlük üretim girişi (tasarım K6, §6.3).

   NE İÇİN: yerleştirme siparişi bantlara PLANLAR; bu dosya o planın
   gerçekleşenini toplar. Giriş İSTEĞE BAĞLIDIR — girilmezse aşamanın
   başla/bitir tarihleri yeterlidir, girilirse plan/gerçek eğrisi çıkar.

   BİRİM: satır = bir bant tahsisi (work_order_stage_atama) + bir gün.
   Atölye "bugün bu bantta ne çıktı" der; sipariş/aşama arkada bağlıdır.

   Atölye ayrımı BANTTAN yapılır (production_line.workshop_id), aşamanın
   workshop_id'sinden değil: bant fiziksel olarak bir atölyededir ve
   aşamanın atölyesi NULL olabilir. */

export type GunlukSatir = {
  atamaId: number
  lineId: number
  lineKodu: string
  lineAdi: string
  workOrderId: number
  isEmriNo: string
  siparisNo: string | null
  modelAdi: string
  musteri: string | null
  /** Bu banda düşen toplam adet */
  tahsisAdet: number
  planBaslangic: string
  planBitis: string
  /** Tahsisin plan penceresine bölünmüş günlük hedefi */
  gunlukHedef: number
  /** Seçilen günden ÖNCE girilmiş toplam */
  oncekiToplam: number
  /** Seçilen güne girilmiş adet (kayıt yoksa 0) */
  girilenAdet: number
  girilenHatali: number
  /** Kayıt gerçekten var mı — 0 adet ile "girilmedi" farklı şeylerdir */
  kayitVar: boolean
  /** Bu gün dahil kalan adet */
  kalanAdet: number
  /** Plan penceresi geçmiş, tahsis hâlâ bitmemiş */
  gecikmis: boolean
}

/**
 * Bir atölyenin, verilen gün için giriş bekleyen bant satırları.
 *
 * sql bir TRANSACTION handle'ı olmalı (withTenant/withTenantRoute içi).
 */
export async function gunlukSatirlar(
  sql: postgres.TransactionSql,
  workshopId: number,
  tarih: string,
): Promise<GunlukSatir[]> {
  const satirlar = await sql`
    SELECT
      a.id                       AS atama_id,
      a.line_id,
      pl.code                    AS line_kodu,
      pl.name                    AS line_adi,
      wo.id                      AS work_order_id,
      wo.is_emri_no,
      wo.siparis_no,
      wo.model_adi,
      wo.musteri,
      a.adet                     AS tahsis_adet,
      a.plan_baslangic::text     AS plan_baslangic,
      a.plan_bitis::text         AS plan_bitis,
      CEIL(a.adet::numeric / GREATEST(1, a.plan_bitis - a.plan_baslangic + 1))::int
                                 AS gunluk_hedef,
      COALESCE(o.onceki, 0)::int AS onceki_toplam,
      COALESCE(g.adet, 0)::int   AS girilen_adet,
      COALESCE(g.hatali_adet, 0)::int AS girilen_hatali,
      (g.id IS NOT NULL)         AS kayit_var,
      (${tarih}::date > a.plan_bitis) AS gecikmis
    FROM work_order_stage_atama a
    JOIN work_order_stage wos ON wos.id = a.stage_row_id
    JOIN work_order wo        ON wo.id  = wos.work_order_id
    JOIN production_line pl   ON pl.id  = a.line_id
    LEFT JOIN work_order_gunluk_uretim g
           ON g.atama_id = a.id AND g.tarih = ${tarih}::date
    LEFT JOIN LATERAL (
      SELECT SUM(x.adet) AS onceki
      FROM work_order_gunluk_uretim x
      WHERE x.atama_id = a.id AND x.tarih < ${tarih}::date
    ) o ON TRUE
    WHERE pl.workshop_id = ${workshopId}
      AND wo.durum NOT IN ('Tamamlandi', 'Sevk Edildi', 'İptal')
      AND (
        /* plan penceresi içinde */
        ${tarih}::date BETWEEN a.plan_baslangic AND a.plan_bitis
        /* ya da o güne zaten giriş yapılmış (düzeltme için erişilebilsin) */
        OR g.id IS NOT NULL
        /* ya da plan geçmiş ama tahsis bitmemiş — üretim sarkmıştır,
           gizlemek girişi imkânsız kılardı */
        OR (${tarih}::date > a.plan_bitis AND COALESCE(o.onceki, 0) < a.adet)
      )
    ORDER BY pl.code, wo.is_emri_no`

  return satirlar.map(r => {
    const tahsis = Number(r.tahsis_adet)
    const onceki = Number(r.onceki_toplam)
    const girilen = Number(r.girilen_adet)
    return {
      atamaId: Number(r.atama_id),
      lineId: Number(r.line_id),
      lineKodu: r.line_kodu as string,
      lineAdi: r.line_adi as string,
      workOrderId: Number(r.work_order_id),
      isEmriNo: r.is_emri_no as string,
      siparisNo: (r.siparis_no as string | null) ?? null,
      modelAdi: r.model_adi as string,
      musteri: (r.musteri as string | null) ?? null,
      tahsisAdet: tahsis,
      planBaslangic: r.plan_baslangic as string,
      planBitis: r.plan_bitis as string,
      gunlukHedef: Number(r.gunluk_hedef),
      oncekiToplam: onceki,
      girilenAdet: girilen,
      girilenHatali: Number(r.girilen_hatali),
      kayitVar: r.kayit_var === true,
      kalanAdet: tahsis - onceki - girilen,
      gecikmis: r.gecikmis === true,
    }
  })
}

/**
 * Bir bant-gün girişini yazar.
 *
 * adet null → kayıt SİLİNİR ("henüz girilmedi"). adet 0 → kayıt KALIR
 * ("bugün hiç çıkmadı"). İkisi farklı bilgidir: 0'ı silmek duran bir
 * bandı girilmemiş göstermek olurdu.
 */
export async function gunlukKaydet(
  sql: postgres.TransactionSql,
  tenantId: string,
  atamaId: number,
  tarih: string,
  adet: number | null,
  hataliAdet: number,
): Promise<void> {
  if (adet === null) {
    await sql`DELETE FROM work_order_gunluk_uretim
              WHERE atama_id = ${atamaId} AND tarih = ${tarih}::date`
  } else {
    await sql`
      INSERT INTO work_order_gunluk_uretim ${sql({
        atama_id: atamaId,
        /* tenant_id ZORUNLU: RLS bunu süzüyor, yazılmazsa insert
           "new row violates row-level security policy" ile reddedilir. */
        tenant_id: tenantId,
        tarih,
        adet,
        hatali_adet: hataliAdet,
      })}
      ON CONFLICT (atama_id, tarih) DO UPDATE SET
        adet = EXCLUDED.adet,
        hatali_adet = EXCLUDED.hatali_adet`
  }

  await asamaToplamiTazele(sql, atamaId)
}

/**
 * Aşamanın üretilen/hatalı adedini günlük girişlerden yeniden hesaplar.
 *
 * NEDEN: work_order_stage.uretilen_adet iş emri ekranında ELLE de
 * giriliyor. Günlük giriş yapıldığı anda aynı sayının iki kaynağı olur
 * ve biri sessizce eskir — aşama "0 adet" derken günlük 4.960 gösterir.
 * Giriş varsa doğruluk kaynağı GİRİŞTİR.
 *
 * Son giriş silinirse eski elle yazılan değere DÖNÜLMEZ (o değer artık
 * yok); sıfırlanmaz da — kimsenin yazmadığı bir 0, üretimi durmuş gibi
 * gösterirdi. Değer olduğu gibi bırakılır.
 */
async function asamaToplamiTazele(
  sql: postgres.TransactionSql,
  atamaId: number,
): Promise<void> {
  await sql`
    UPDATE work_order_stage s
    SET uretilen_adet = t.adet,
        hatali_adet   = t.hatali
    FROM (
      SELECT a.stage_row_id,
             COALESCE(SUM(g.adet), 0)::int        AS adet,
             COALESCE(SUM(g.hatali_adet), 0)::int AS hatali,
             COUNT(g.id)                          AS giris
      FROM work_order_stage_atama a
      LEFT JOIN work_order_gunluk_uretim g ON g.atama_id = a.id
      WHERE a.stage_row_id = (
        SELECT stage_row_id FROM work_order_stage_atama WHERE id = ${atamaId}
      )
      GROUP BY a.stage_row_id
    ) t
    WHERE s.id = t.stage_row_id AND t.giris > 0`
}
