import type postgres from 'postgres'
import {
  bantPaylari, asamaGunu, geriyePlanla, bosPencereBul, gunEkle,
  type AsamaGirdi, type Aralik,
} from './yerlestirme'

export type YerlestirIstek = {
  siparisNo: string
  musteri: string
  modelAdi: string
  adet: number
  teslimTarihi: string
  bugun: string
  workshopId: number
  /** Dikim aşamasının paylaştırılacağı bantlar (tasarım K1: tek atölye) */
  lineIds: number[]
  /** İşaretlenen zincir, ör. ['KESIM','DIKIM','YIKAMA','UKP','SEVK'] */
  asamaKodlari: string[]
  /** Aşama kodu → o aşamayı yapacak DIŞ atölye (tasarım K4).
      Verilmeyen aşama siparişin atölyesinde yapılır. */
  disAtolye?: Record<string, number>
}

export type YerlestirSonuc = {
  workOrderId: number
  yetisiyor: boolean
  elleTarihGereken: string[]
  /** Bant doluluğu yüzünden zincirin tamamı kaç gün geriye kaydı */
  kaydirilanGun: number
}

/**
 * Siparişi, zincirini ve bant tahsislerini TEK transaction'da yazar.
 *
 * sql bir TRANSACTION handle'ı olmalı (withTenant/withTenantRoute içi).
 * Yarım kalmış plan diye bir şey olmamalı: aşamalar yazılıp tahsisler
 * yazılmazsa sipariş sistemde "planlanmış ama hiçbir bantta değil"
 * olarak kalır ve kimse fark etmez.
 */
export async function yerlestir(
  sql: postgres.TransactionSql,
  tenantId: string,
  istek: YerlestirIstek,
): Promise<YerlestirSonuc> {
  // 1) Bantların günlük hedefleri — bantın bu atölyeye ait olduğu da burada doğrulanır
  const bantlar = await sql`
    SELECT id, COALESCE(daily_target, 0)::int AS daily_target
    FROM production_line
    WHERE id = ANY(${istek.lineIds}) AND workshop_id = ${istek.workshopId} AND is_active`
  if (bantlar.length === 0) throw new Error('Seçilen bantlar bu atölyede bulunamadı')

  const paylar = bantPaylari(istek.adet, bantlar.map(b => ({
    lineId: b.id as number, gunlukHedef: Number(b.daily_target),
  })))
  const dikimGunu = asamaGunu(istek.adet, paylar.reduce((t, p) => t + p.gunlukHedef, 0))

  /* 2) Aşama tanımları + HER AŞAMANIN KENDİ ATÖLYESİNİN kapasitesi.
     UKP dışarıda yapılıyorsa süre DIŞ atölyenin kapasitesinden çıkar;
     sipariş atölyesininkine bakmak yanlış tarih üretirdi. */
  const disAtolye = istek.disAtolye ?? {}
  const asamaAtolyesi = (kod: string) => disAtolye[kod] ?? istek.workshopId

  const disIdler = [...new Set(Object.values(disAtolye))]
  if (disIdler.length > 0) {
    const gecerli = await sql`
      SELECT id FROM workshop WHERE id = ANY(${disIdler}) AND is_active`
    if (gecerli.length !== disIdler.length) {
      throw new Error('Seçilen dış atölyelerden biri bulunamadı veya pasif')
    }
  }

  const stageRows = await sql`
    SELECT ps.id, ps.code, ps.sira_no
    FROM production_stage ps
    WHERE ps.code = ANY(${istek.asamaKodlari})
    ORDER BY ps.sira_no`
  if (stageRows.length !== istek.asamaKodlari.length) {
    throw new Error('Bilinmeyen aşama kodu var')
  }

  const ilgiliAtolyeler = [...new Set([istek.workshopId, ...disIdler])]
  const kapasiteSatirlari = await sql`
    SELECT workshop_id, stage_id, gunluk_kapasite
    FROM workshop_stage_capacity
    WHERE workshop_id = ANY(${ilgiliAtolyeler})`
  const kapasite = new Map(
    kapasiteSatirlari.map(k => [`${k.workshop_id}:${k.stage_id}`, Number(k.gunluk_kapasite)]),
  )

  const girdiler: AsamaGirdi[] = stageRows.map(r => {
    const kod = r.code as string
    const stageId = r.id as number
    const kap = kapasite.get(`${asamaAtolyesi(kod)}:${stageId}`) ?? null
    return {
      stageId,
      kod,
      siraNo: Number(r.sira_no),
      gun: kod === 'DIKIM' ? dikimGunu : asamaGunu(istek.adet, kap),
    }
  })

  let plan = geriyePlanla(istek.teslimTarihi, girdiler, istek.bugun)

  /* 2b) BANT ÇAKIŞMA KONTROLÜ (tasarım §5.4).
     Faz 1'de bu yoktu: tahsis mevcut tahsislere bakılmadan yazılıyordu,
     iki sipariş aynı bandı aynı gün kullanabiliyordu.

     Seçilen bantların HEPSİNİN meşgul aralıkları birleştirilir; dikim
     tek parça çalıştığı için pencere hepsinde birden boş olmalı.
     Çakışma varsa ZİNCİRİN TAMAMI aynı kadar geriye kayar — yalnız
     dikimi kaydırmak kesim/UKP ile ilişkiyi bozardı. */
  let kaydirilanGun = 0
  const dikim = plan.pencereler.find(p => p.kod === 'DIKIM')
  if (dikim?.baslangic && dikim.bitis) {
    const dolu = await sql`
      SELECT plan_baslangic::text AS baslangic, plan_bitis::text AS bitis
      FROM work_order_stage_atama
      WHERE line_id = ANY(${paylar.map(p => p.lineId)})
      ORDER BY plan_baslangic` as unknown as Aralik[]

    if (dolu.length > 0) {
      const gun = Math.max(1, gunSayisi(dikim.baslangic, dikim.bitis))
      const bos = bosPencereBul(dolu, gun, dikim.bitis)
      kaydirilanGun = bos.kaydirilanGun
      if (kaydirilanGun > 0) {
        plan = geriyePlanla(gunEkle(istek.teslimTarihi, -kaydirilanGun), girdiler, istek.bugun)
      }
    }
  }

  /* 3) Sipariş.
     work_order'ın NOT NULL kolonları (doğrulandı): is_emri_no,
     workshop_id, model_adi, siparis_miktari, tenant_id — hepsi burada.
     durum CHECK listesi: Taslak / Planlandi / Bekleniyor / Devam /
     Duraklatildi / Tamamlandi / İptal / Sevk Edildi. */
  const [wo] = await sql`
    INSERT INTO work_order ${sql({
      tenant_id: tenantId,
      is_emri_no: istek.siparisNo,
      siparis_no: istek.siparisNo,
      workshop_id: istek.workshopId,
      musteri: istek.musteri,
      model_adi: istek.modelAdi,
      siparis_miktari: istek.adet,
      teslim_tarihi: istek.teslimTarihi,
      baslangic_tarihi: plan.pencereler.find(p => p.baslangic)?.baslangic ?? null,
      bitis_tarihi: istek.teslimTarihi,
      durum: 'Planlandi',
    })}
    RETURNING id`
  const workOrderId = wo.id as number

  // 4) Zincir + tahsisler
  for (const p of plan.pencereler) {
    const [stage] = await sql`
      INSERT INTO work_order_stage ${sql({
        work_order_id: workOrderId,
        /* tenant_id ZORUNLU ve RLS bunu süzüyor. Yazılmazsa insert
           "new row violates row-level security policy" ile reddedilir —
           NOT NULL hatası değil, RLS hatası olarak. */
        tenant_id: tenantId,
        stage_id: p.stageId,
        sira_no: p.siraNo,
        /* Aşamanın KENDİ atölyesi: dış atölyeye çıkanlar için farklı (K4). */
        workshop_id: asamaAtolyesi(p.kod),
        plan_baslangic: p.baslangic,
        plan_bitis: p.bitis,
        durum: 'Beklemede',
      })}
      RETURNING id`

    if (p.kod !== 'DIKIM' || p.baslangic === null || p.bitis === null) continue

    for (const pay of paylar) {
      await sql`INSERT INTO work_order_stage_atama ${sql({
        stage_row_id: stage.id as number,
        tenant_id: tenantId,
        line_id: pay.lineId,
        adet: pay.adet,
        plan_baslangic: p.baslangic,
        plan_bitis: p.bitis,
      })}`
    }
  }

  return {
    workOrderId,
    yetisiyor: plan.yetisiyor,
    elleTarihGereken: plan.elleTarihGereken,
    kaydirilanGun,
  }
}

function gunSayisi(baslangic: string, bitis: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((t(bitis) - t(baslangic)) / 86_400_000) + 1
}
