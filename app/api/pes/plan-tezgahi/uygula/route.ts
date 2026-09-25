import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { atolyeBaglamiYukle } from '@/lib/pes/bant-doluluk-veri'
import { planBitisi } from '@/lib/pes/bant-doluluk'
import { gecerliYerlesim, type TeklifKalem } from '@/lib/pes/plan-onay'

/**
 * Kabul edilen teklifi GERÇEK plana çevirir.
 *
 * "Tek tuşla atölyenin operasyonel görünümüne geçsin" isteğinin karşılığı:
 * buradan sonra iş, atölyenin kendi ekranlarında (iş emri, bant takvimi)
 * görünür ve gerçek kapasiteyi doldurur.
 *
 * KARŞI ÖNERİ VARSA O GEÇERLİDİR. Planlamacı revizyonu uyguladığında
 * atölyenin tarihleri yazılır, kendi ilk teklifi değil — aksi halde
 * "kabul ettim" der ama atölyenin yine tutturamayacağı tarihi yazar.
 *
 * yerlestir() ÇAĞRILMIYOR: o teslim tarihinden GERİYE planlıyor ve
 * planlamacının tezgâhta seçtiği tarihleri ezerdi. Anlaşılan yerleşim
 * neyse o yazılır.
 */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const teklifId = Number(b.teklif_id)
  if (!Number.isInteger(teklifId)) {
    return NextResponse.json({ error: 'teklif_id zorunlu' }, { status: 400 })
  }

  const [teklif] = await sql`
    SELECT id, durum, workshop_id, taslak_id FROM plan_teklif WHERE id = ${teklifId}
  ` as unknown as Array<{ id: number; durum: string; workshop_id: number; taslak_id: number }>
  if (!teklif) return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 })

  /* Reddedilen ya da hâlâ cevap bekleyen teklif uygulanmaz. */
  if (!['kabul', 'revizyon'].includes(teklif.durum)) {
    return NextResponse.json(
      { error: `Bu teklif uygulanamaz (${teklif.durum}).` }, { status: 409 })
  }

  const kalemSatirlari = await sql`
    SELECT id, work_order_id, line_id, baslangic::text AS baslangic,
           bitis::text AS bitis, adet,
           karsi_baslangic::text AS karsi_baslangic, karsi_adet, karsi_not
      FROM plan_teklif_kalem WHERE teklif_id = ${teklifId}
  ` as unknown as Array<Record<string, unknown>>

  if (kalemSatirlari.length === 0) {
    return NextResponse.json({ error: 'Teklifte kalem yok' }, { status: 400 })
  }

  const [dikim] = await sql`
    SELECT id, sira_no FROM production_stage WHERE code = 'DIKIM' LIMIT 1
  ` as unknown as Array<{ id: number; sira_no: number }>
  if (!dikim) {
    return NextResponse.json({ error: "production_stage'de DIKIM yok" }, { status: 500 })
  }

  const ctx = await atolyeBaglamiYukle(sql, kalemSatirlari[0].line_id as number)
  if (!ctx) return NextResponse.json({ error: 'Bant bağlamı okunamadı' }, { status: 500 })

  /* İş emri başına grupla: bir WO birden çok banda bölünmüş olabilir ve
     tek aşama satırı altında birden çok atama durur. */
  const woGruplari = new Map<number, Array<{ kalem: TeklifKalem; baslangic: string; bitis: string; adet: number }>>()

  for (const r of kalemSatirlari) {
    const k: TeklifKalem = {
      id: r.id as number,
      workOrderId: r.work_order_id as number,
      lineId: r.line_id as number,
      baslangic: r.baslangic as string,
      bitis: r.bitis as string,
      adet: r.adet as number,
      karsiBaslangic: (r.karsi_baslangic as string | null) ?? null,
      karsiAdet: (r.karsi_adet as number | null) ?? null,
      karsiNot: (r.karsi_not as string | null) ?? null,
    }
    const g = gecerliYerlesim(k)

    /* Bitiş yeniden türetilir: karşı öneri tarihi/adedi değiştirdiyse
       teklifteki bitiş artık geçerli değil. */
    const bitis = planBitisi(
      { atamaId: k.id, lineId: k.lineId, adet: g.adet, planBaslangic: g.baslangic, elleplan: {} },
      ctx)

    const liste = woGruplari.get(k.workOrderId) ?? []
    liste.push({ kalem: k, baslangic: g.baslangic, bitis, adet: g.adet })
    woGruplari.set(k.workOrderId, liste)
  }

  const yazilan: Array<{ workOrderId: number; baslangic: string; bitis: string; atama: number }> = []

  for (const [woId, paylar] of woGruplari) {
    const enErken = paylar.reduce((m, p) => (p.baslangic < m ? p.baslangic : m), paylar[0].baslangic)
    const enGec = paylar.reduce((m, p) => (p.bitis > m ? p.bitis : m), paylar[0].bitis)

    /* Aynı iş emri ikinci kez uygulanırsa eski dikim aşaması ve atamaları
       TEMİZLENİR. Üst üste yazmak, atölyenin takviminde aynı işi iki kez
       gösterirdi. */
    await sql`
      DELETE FROM work_order_stage
       WHERE work_order_id = ${woId} AND stage_id = ${dikim.id}`

    const [stage] = await sql`
      INSERT INTO work_order_stage
        (work_order_id, tenant_id, stage_id, sira_no, workshop_id,
         plan_baslangic, plan_bitis, durum)
      VALUES (${woId}, ${tenant.tenantId}, ${dikim.id}, ${dikim.sira_no ?? 2},
              ${teklif.workshop_id}, ${enErken}, ${enGec}, 'Beklemede')
      RETURNING id
    ` as unknown as Array<{ id: number }>

    for (const p of paylar) {
      await sql`
        INSERT INTO work_order_stage_atama
          (stage_row_id, tenant_id, line_id, adet, plan_baslangic, plan_bitis)
        VALUES (${stage.id}, ${tenant.tenantId}, ${p.kalem.lineId}, ${p.adet},
                ${p.baslangic}, ${p.bitis})`
    }

    await sql`
      UPDATE work_order
         SET workshop_id = ${teklif.workshop_id},
             durum = CASE WHEN durum IN ('Taslak', 'Bekleniyor') THEN 'Planlandi' ELSE durum END,
             updated_at = now()
       WHERE id = ${woId}`

    yazilan.push({ workOrderId: woId, baslangic: enErken, bitis: enGec, atama: paylar.length })
  }

  return NextResponse.json({ uygulanan: yazilan })
})
