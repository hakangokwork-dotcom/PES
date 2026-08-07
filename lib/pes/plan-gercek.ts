import type postgres from 'postgres'
import { gunEkle } from './yerlestirme'

/* Plan / gerçek karşılaştırması (tasarım K6, §6.2).

   İKİ AYRI KAYNAK, İKİ AYRI ÇÖZÜNÜRLÜK:
     · AŞAMA seviyesi — work_order_stage'in plan/gerçek tarihleri.
       Her siparişte vardır, kabadır: "kesim 2 gün geç bitti".
     · GÜN seviyesi — work_order_gunluk_uretim. İSTEĞE BAĞLIDIR;
       girilmişse bant bant eğri çıkar, girilmemişse çıkmaz.

   Girilmemiş günü 0 saymıyoruz. Sıfır çizmek duran bir bant demektir;
   "bilmiyoruz" ile "durdu" farklı şeylerdir. */

export type EgriAtama = { adet: number; planBaslangic: string; planBitis: string }
export type EgriGiris = { tarih: string; adet: number }
export type EgriNoktasi = {
  tarih: string
  /** O güne kadar planlanan kümülatif adet */
  plan: number
  /** O güne kadar girilen kümülatif adet; veri bitince null */
  gercek: number | null
}

function gunSayisi(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((t(b) - t(a)) / 86_400_000)
}

/**
 * Plan ve gerçek kümülatif eğrisi.
 *
 * Plan: her tahsis kendi penceresinde doğrusal ilerler, tahsis adedinde
 * durur. Gerçek: girişlerin kümülatifi; SON girişten sonrası null kalır
 * — düz bir çizgiyi geleceğe uzatmak "üretim durdu" gibi okunurdu.
 */
export function egriHesapla(atamalar: EgriAtama[], girisler: EgriGiris[]): EgriNoktasi[] {
  if (atamalar.length === 0) return []

  const baslangic = atamalar.reduce((m, a) => (a.planBaslangic < m ? a.planBaslangic : m), atamalar[0].planBaslangic)
  let bitis = atamalar.reduce((m, a) => (a.planBitis > m ? a.planBitis : m), atamalar[0].planBitis)

  const sonGiris = girisler.length > 0
    ? girisler.reduce((m, g) => (g.tarih > m ? g.tarih : m), girisler[0].tarih)
    : null
  if (sonGiris && sonGiris > bitis) bitis = sonGiris

  const gunlukGiris = new Map<string, number>()
  for (const g of girisler) {
    gunlukGiris.set(g.tarih, (gunlukGiris.get(g.tarih) ?? 0) + g.adet)
  }

  const noktalar: EgriNoktasi[] = []
  let kumulatifGercek = 0

  for (let i = 0; i <= gunSayisi(baslangic, bitis); i++) {
    const gun = gunEkle(baslangic, i)

    let plan = 0
    for (const a of atamalar) {
      const pencereGun = gunSayisi(a.planBaslangic, a.planBitis) + 1
      const gunlukHedef = Math.ceil(a.adet / Math.max(1, pencereGun))
      const gecen = Math.min(pencereGun, Math.max(0, gunSayisi(a.planBaslangic, gun) + 1))
      plan += Math.min(a.adet, gunlukHedef * gecen)
    }

    kumulatifGercek += gunlukGiris.get(gun) ?? 0
    noktalar.push({
      tarih: gun,
      plan,
      /* Veri bittiği yerde çizgi de biter. */
      gercek: sonGiris !== null && gun <= sonGiris ? kumulatifGercek : null,
    })
  }

  return noktalar
}

export type AsamaKarsilastirma = {
  stageRowId: number
  kod: string
  ad: string
  siraNo: number
  atolyeKodu: string | null
  atolyeAdi: string | null
  disAtolye: boolean
  planBaslangic: string | null
  planBitis: string | null
  gercekBaslangic: string | null
  gercekBitis: string | null
  /** Gerçek bitiş - plan bitiş (gün). Pozitif = geç. Biri yoksa null. */
  sapmaGun: number | null
  durum: string
}

export type BantKarsilastirma = {
  atamaId: number
  lineKodu: string
  lineAdi: string
  tahsisAdet: number
  planBaslangic: string
  planBitis: string
  gunlukHedef: number
  girilenToplam: number
  hataliToplam: number
  girisGunSayisi: number
  sonGiris: string | null
}

export type PlanGercek = {
  workOrderId: number
  isEmriNo: string
  modelAdi: string
  musteri: string | null
  siparisMiktari: number
  teslimTarihi: string | null
  asamalar: AsamaKarsilastirma[]
  bantlar: BantKarsilastirma[]
  egri: EgriNoktasi[]
}

/**
 * Bir siparişin plan/gerçek tablosu.
 *
 * sql bir TRANSACTION handle'ı olmalı (withTenant/withTenantRoute içi).
 * Sipariş bulunamazsa null döner.
 */
export async function planGercek(
  sql: postgres.TransactionSql,
  workOrderId: number,
): Promise<PlanGercek | null> {
  const [wo] = await sql`
    SELECT id, is_emri_no, model_adi, musteri, siparis_miktari, teslim_tarihi::text AS teslim_tarihi
    FROM work_order WHERE id = ${workOrderId}`
  if (!wo) return null

  const asamaSatirlari = await sql`
    SELECT
      s.id                      AS stage_row_id,
      ps.code, ps.name, ps.sira_no,
      w.code                    AS atolye_kodu,
      w.name                    AS atolye_adi,
      (s.workshop_id IS NOT NULL AND s.workshop_id <> wo.workshop_id) AS dis_atolye,
      s.plan_baslangic::text    AS plan_baslangic,
      s.plan_bitis::text        AS plan_bitis,
      s.gercek_baslangic::text  AS gercek_baslangic,
      s.gercek_bitis::text      AS gercek_bitis,
      (s.gercek_bitis - s.plan_bitis) AS sapma_gun,
      s.durum
    FROM work_order_stage s
    JOIN work_order wo       ON wo.id = s.work_order_id
    JOIN production_stage ps ON ps.id = s.stage_id
    LEFT JOIN workshop w     ON w.id = s.workshop_id
    WHERE s.work_order_id = ${workOrderId}
    ORDER BY ps.sira_no`

  const bantSatirlari = await sql`
    SELECT
      a.id                   AS atama_id,
      pl.code                AS line_kodu,
      pl.name                AS line_adi,
      a.adet                 AS tahsis_adet,
      a.plan_baslangic::text AS plan_baslangic,
      a.plan_bitis::text     AS plan_bitis,
      CEIL(a.adet::numeric / GREATEST(1, a.plan_bitis - a.plan_baslangic + 1))::int AS gunluk_hedef,
      COALESCE(SUM(g.adet), 0)::int        AS girilen_toplam,
      COALESCE(SUM(g.hatali_adet), 0)::int AS hatali_toplam,
      COUNT(g.id)::int                     AS giris_gun_sayisi,
      MAX(g.tarih)::text                   AS son_giris
    FROM work_order_stage_atama a
    JOIN work_order_stage wos ON wos.id = a.stage_row_id
    JOIN production_line pl   ON pl.id = a.line_id
    LEFT JOIN work_order_gunluk_uretim g ON g.atama_id = a.id
    WHERE wos.work_order_id = ${workOrderId}
    GROUP BY a.id, pl.code, pl.name
    ORDER BY pl.code`

  const girisSatirlari = await sql`
    SELECT g.tarih::text AS tarih, SUM(g.adet)::int AS adet
    FROM work_order_gunluk_uretim g
    JOIN work_order_stage_atama a ON a.id = g.atama_id
    JOIN work_order_stage wos     ON wos.id = a.stage_row_id
    WHERE wos.work_order_id = ${workOrderId}
    GROUP BY g.tarih
    ORDER BY g.tarih`

  const bantlar: BantKarsilastirma[] = bantSatirlari.map(r => ({
    atamaId: Number(r.atama_id),
    lineKodu: r.line_kodu as string,
    lineAdi: r.line_adi as string,
    tahsisAdet: Number(r.tahsis_adet),
    planBaslangic: r.plan_baslangic as string,
    planBitis: r.plan_bitis as string,
    gunlukHedef: Number(r.gunluk_hedef),
    girilenToplam: Number(r.girilen_toplam),
    hataliToplam: Number(r.hatali_toplam),
    girisGunSayisi: Number(r.giris_gun_sayisi),
    sonGiris: (r.son_giris as string | null) ?? null,
  }))

  return {
    workOrderId: Number(wo.id),
    isEmriNo: wo.is_emri_no as string,
    modelAdi: wo.model_adi as string,
    musteri: (wo.musteri as string | null) ?? null,
    siparisMiktari: Number(wo.siparis_miktari),
    teslimTarihi: (wo.teslim_tarihi as string | null) ?? null,
    asamalar: asamaSatirlari.map(r => ({
      stageRowId: Number(r.stage_row_id),
      kod: r.code as string,
      ad: r.name as string,
      siraNo: Number(r.sira_no),
      atolyeKodu: (r.atolye_kodu as string | null) ?? null,
      atolyeAdi: (r.atolye_adi as string | null) ?? null,
      disAtolye: r.dis_atolye === true,
      planBaslangic: (r.plan_baslangic as string | null) ?? null,
      planBitis: (r.plan_bitis as string | null) ?? null,
      gercekBaslangic: (r.gercek_baslangic as string | null) ?? null,
      gercekBitis: (r.gercek_bitis as string | null) ?? null,
      sapmaGun: r.sapma_gun === null ? null : Number(r.sapma_gun),
      durum: r.durum as string,
    })),
    bantlar,
    egri: egriHesapla(
      bantlar.map(b => ({ adet: b.tahsisAdet, planBaslangic: b.planBaslangic, planBitis: b.planBitis })),
      girisSatirlari.map(g => ({ tarih: g.tarih as string, adet: Number(g.adet) })),
    ),
  }
}
