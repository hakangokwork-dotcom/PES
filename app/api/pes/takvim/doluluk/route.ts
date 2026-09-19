import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Takvimin TEK okuma ucu (tasarım §5, plan Task 5).
 *
 *   GET /api/pes/takvim/doluluk?baslangic=2027-01-01&bitis=2027-01-31
 *       &tedarik=Tedarik%20395&bolge=Ege&yetkinlik=Denim
 *
 * NEDEN TEK UÇ: eski ekran /workshops, /lines ve /work-orders'ı ayrı ayrı
 * çekip istemcide birleştiriyordu. 131 atölyede bu üç tur ağ gecikmesi
 * demek ve birleştirme mantığı istemciye sızıyor.
 *
 * ORAN HESAPLAMAZ. Doluluk, bant payı ve plan_bitis lib/pes/bant-doluluk
 * içinde yaşar; bu uç yalnız ham satırları döndürür. İki yerde hesap
 * yapmak, zamanla iki farklı gerçek demektir.
 *
 * TARİHLER ::text İLE DÖNER. postgres.js DATE kolonunu Date nesnesine
 * çevirir; istemcide .slice(0,10) çağrısı çöker ve TypeScript bunu
 * yakalamaz — tip iddiası çalışma zamanında doğrulanmıyor.
 */
export const GET = withTenantRoute(async (req, { sql }) => {
  const u = new URL(req.url)
  const baslangic = u.searchParams.get('baslangic')
  const bitis = u.searchParams.get('bitis')

  const gecerliTarih = (t: string | null) => !!t && /^\d{4}-\d{2}-\d{2}$/.test(t)
  if (!gecerliTarih(baslangic) || !gecerliTarih(bitis)) {
    return NextResponse.json(
      { error: 'baslangic ve bitis YYYY-AA-GG biçiminde gerekli' }, { status: 400 })
  }
  if (bitis! < baslangic!) {
    return NextResponse.json({ error: 'bitis baslangictan önce olamaz' }, { status: 400 })
  }
  /* Bir yıldan uzun aralık matris görünümünde bile gerekmez; sınırsız
     bırakmak tek istekle tüm tarihçeyi çekmeye davettir. */
  const gunSayisi = Math.round(
    (Date.parse(bitis!) - Date.parse(baslangic!)) / 86_400_000) + 1
  if (gunSayisi > 400) {
    return NextResponse.json({ error: 'Aralık en fazla 400 gün olabilir' }, { status: 400 })
  }

  const tedarik = u.searchParams.get('tedarik')
  const bolge = u.searchParams.get('bolge')
  const yetkinlik = u.searchParams.get('yetkinlik')

  /* workshop_profil'de kolon adı bolge_ad (bolge DEĞİL).
     line_capability değere value_code ile bağlanır (value_id DEĞİL);
     filtre hem kodu hem etiketi kabul eder ki arayüz hangisini
     gönderirse göndersin çalışsın. */
  const atolyeler = await sql`
    SELECT w.id, w.code, w.name, w.is_active,
           p.tedarik_mudurlugu, p.bolge_ad AS bolge
      FROM workshop w
      LEFT JOIN workshop_profil p ON p.workshop_id = w.id
     WHERE w.is_active
       AND (${tedarik}::text IS NULL OR p.tedarik_mudurlugu = ${tedarik})
       AND (${bolge}::text   IS NULL OR p.bolge_ad = ${bolge})
       AND (${yetkinlik}::text IS NULL OR EXISTS (
             SELECT 1
               FROM line_capability lc
               JOIN production_line pl2 ON pl2.id = lc.line_id
               LEFT JOIN capability_value cv ON cv.code = lc.value_code
              WHERE pl2.workshop_id = w.id
                AND (lc.value_code = ${yetkinlik} OR cv.label = ${yetkinlik})))
     ORDER BY p.tedarik_mudurlugu NULLS LAST, w.name`

  const atolyeIdleri = atolyeler.map(a => a.id as number)
  if (atolyeIdleri.length === 0) {
    return NextResponse.json({
      atolyeler: [], bantlar: [], atamalar: [], bloklar: [],
      kapasiteGun: [], gunluk: [], asamalar: [], malzemeler: [], testler: [],
    })
  }

  const bantlar = await sql`
    SELECT id, code, name, workshop_id, daily_target, is_active
      FROM production_line
     WHERE workshop_id IN ${sql(atolyeIdleri)}
     ORDER BY workshop_id, code`

  const atamalar = await sql`
    SELECT a.id, a.line_id, a.adet,
           a.plan_baslangic::text, a.plan_bitis::text,
           a.gercek_baslangic::text, a.gercek_bitis::text,
           wo.id AS work_order_id, wo.is_emri_no, wo.model_adi, wo.musteri,
           wo.teslim_tarihi::text, wo.siparis_miktari, wo.durum, wo.oncelik
      FROM work_order_stage_atama a
      JOIN work_order_stage ws ON ws.id = a.stage_row_id
      JOIN work_order wo       ON wo.id = ws.work_order_id
      JOIN production_line pl  ON pl.id = a.line_id
     WHERE pl.workshop_id IN ${sql(atolyeIdleri)}
       AND a.plan_bitis >= ${baslangic} AND a.plan_baslangic <= ${bitis}
       AND wo.durum NOT IN ('İptal','Tamamlandi','Sevk Edildi')`

  const bloklar = await sql`
    SELECT ls.id, ls.line_id, ls.tip, ls.adet, ls.sahip, ls.notlar,
           ls.gecerlilik_bitis::text,
           ls.baslangic_tarihi::text, ls.bitis_tarihi::text
      FROM line_schedule ls
      JOIN production_line pl ON pl.id = ls.line_id
     WHERE pl.workshop_id IN ${sql(atolyeIdleri)}
       AND ls.bitis_tarihi >= ${baslangic} AND ls.baslangic_tarihi <= ${bitis}`

  const kapasiteGun = await sql`
    SELECT workshop_id, tarih::text, gunluk_kapasite, sebep
      FROM workshop_kapasite_gun
     WHERE workshop_id IN ${sql(atolyeIdleri)}
       AND tarih BETWEEN ${baslangic} AND ${bitis}`

  /* plan_adet (atölyenin yazdığı plan) ve adet (gerçekleşen) aynı satırda.
     adet NULL = GİRİLMEDİ; 0 ile karıştırılmamalı. */
  const gunluk = await sql`
    SELECT g.atama_id, g.tarih::text, g.plan_adet, g.adet
      FROM work_order_gunluk_uretim g
      JOIN work_order_stage_atama a ON a.id = g.atama_id
      JOIN production_line pl       ON pl.id = a.line_id
     WHERE pl.workshop_id IN ${sql(atolyeIdleri)}
       AND g.tarih BETWEEN ${baslangic} AND ${bitis}`

  /* Zincirin tamamı gelir — kesim ve hazırlık dikimden ÖNCE başladığı
     için tarih aralığıyla filtrelenmez; PO satırı hepsini çizer. */
  const asamalar = await sql`
    SELECT ws.id, ws.work_order_id, ws.workshop_id,
           ps.code, ps.name, ps.sira_no, ps.zorunlu,
           ws.plan_baslangic::text, ws.plan_bitis::text,
           ws.gercek_baslangic::text, ws.gercek_bitis::text,
           ws.durum, ws.ilerleme_pct
      FROM work_order_stage ws
      JOIN production_stage ps ON ps.id = ws.stage_id
     WHERE ws.work_order_id IN (
             SELECT DISTINCT wo2.id
               FROM work_order wo2
               JOIN work_order_stage ws2 ON ws2.work_order_id = wo2.id
               JOIN work_order_stage_atama a2 ON a2.stage_row_id = ws2.id
               JOIN production_line pl2 ON pl2.id = a2.line_id
              WHERE pl2.workshop_id IN ${sql(atolyeIdleri)})
     ORDER BY ws.work_order_id, ps.sira_no`

  const malzemeler = await sql`
    SELECT m.work_order_id, m.tip, m.kod, m.ad,
           m.miktar::float, m.gelen_miktar::float, m.birim,
           m.durum, m.beklenen_tarih::text, m.gelis_tarihi::text, m.tedarikci
      FROM work_order_material m
      JOIN work_order wo ON wo.id = m.work_order_id
     WHERE wo.workshop_id IN ${sql(atolyeIdleri)}`

  const testler = await sql`
    SELECT t.work_order_id, t.tarih::text, t.yikama_sayisi,
           /* NUMERIC postgres.js'te dize döner; tipler.ts number bekliyor */
           t.en_cekme_pct::float, t.boy_cekme_pct::float, t.may_kaymasi_pct::float,
           t.sonuc, t.yapan
      FROM kumas_cekme_testi t
      JOIN work_order wo ON wo.id = t.work_order_id
     WHERE wo.workshop_id IN ${sql(atolyeIdleri)}`

  return NextResponse.json({
    atolyeler, bantlar, atamalar, bloklar, kapasiteGun, gunluk, asamalar, malzemeler, testler,
  })
})
