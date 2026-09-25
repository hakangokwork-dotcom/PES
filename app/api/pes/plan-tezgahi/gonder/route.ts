import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { atolyeBaglamiYukle } from '@/lib/pes/bant-doluluk-veri'
import { kalemPlani } from '@/lib/pes/plan-tezgah'

/**
 * Taslağı atölyelere gönder.
 *
 * HER ATÖLYEYE AYRI TEKLİF. Tek teklif olsaydı bir atölyenin reddi bütün
 * planı bloklardı; ayrı olunca kabul edenler yoluna devam eder.
 *
 * KALEMLER KOPYALANIR, İŞARET EDİLMEZ. Taslak gönderildikten sonra da
 * değişmeye devam eder (planlamacı sürüklemeyi bırakmaz); teklif ise
 * değişmemeli. "Tam olarak neyi gönderdik" sorusunun cevabı sabit kalmalı.
 *
 * Bitiş tarihi GÖNDERİM ANINDAKİ kapasiteyle hesaplanıp saklanır: atölye
 * neyi gördüyse o kalmalı.
 */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const taslakId = Number(b.taslak_id)
  if (!Number.isInteger(taslakId)) {
    return NextResponse.json({ error: 'taslak_id zorunlu' }, { status: 400 })
  }

  const [taslak] = await sql`
    SELECT id, ad, durum FROM plan_taslak WHERE id = ${taslakId}
  ` as unknown as Array<{ id: number; ad: string; durum: string }>
  if (!taslak) return NextResponse.json({ error: 'Taslak bulunamadı' }, { status: 404 })

  const kalemler = await sql`
    SELECT id, work_order_id, workshop_id, line_id, baslangic::text AS baslangic, adet
      FROM plan_taslak_kalem WHERE taslak_id = ${taslakId}
  ` as unknown as Array<{
    id: number; work_order_id: number; workshop_id: number
    line_id: number; baslangic: string; adet: number
  }>

  if (kalemler.length === 0) {
    return NextResponse.json({ error: 'Taslakta yerleştirilmiş iş yok' }, { status: 400 })
  }

  const atolyeler = [...new Set(kalemler.map((k) => k.workshop_id))]
  const olusan: Array<{ teklifId: number; workshopId: number; kalem: number; turNo: number }> = []

  for (const wsId of atolyeler) {
    const wsKalemler = kalemler.filter((k) => k.workshop_id === wsId)

    /* Bitiş, gönderim anındaki kapasiteyle türetilir. */
    const ctx = await atolyeBaglamiYukle(sql, wsKalemler[0].line_id)
    if (!ctx) continue

    /* Bu atölye için kaçıncı tur: revizyon sonrası yeniden gönderilebilir. */
    const [son] = await sql`
      SELECT coalesce(max(tur_no), 0)::int AS n
        FROM plan_teklif WHERE taslak_id = ${taslakId} AND workshop_id = ${wsId}
    ` as unknown as Array<{ n: number }>

    /* Cevap bekleyen tur varsa yenisi açılmaz — atölye iki teklifi aynı anda
       cevaplayamaz ve hangisinin geçerli olduğu belirsizleşir. */
    const [bekleyen] = await sql`
      SELECT id FROM plan_teklif
       WHERE taslak_id = ${taslakId} AND workshop_id = ${wsId} AND durum = 'bekliyor'
       LIMIT 1
    ` as unknown as Array<{ id: number }>
    if (bekleyen) continue

    const turNo = son.n + 1
    const [teklif] = await sql`
      INSERT INTO plan_teklif (tenant_id, taslak_id, workshop_id, tur_no, durum)
      VALUES (${tenant.tenantId}, ${taslakId}, ${wsId}, ${turNo}, 'bekliyor')
      RETURNING id
    ` as unknown as Array<{ id: number }>

    for (const k of wsKalemler) {
      const p = kalemPlani({
        id: k.id, workOrderId: k.work_order_id, workshopId: k.workshop_id,
        lineId: k.line_id, baslangic: k.baslangic, adet: k.adet,
      }, ctx)

      await sql`
        INSERT INTO plan_teklif_kalem
          (teklif_id, tenant_id, work_order_id, line_id, baslangic, bitis, adet)
        VALUES (${teklif.id}, ${tenant.tenantId}, ${k.work_order_id}, ${k.line_id},
                ${k.baslangic}, ${p.bitis}, ${k.adet})`
    }

    olusan.push({ teklifId: teklif.id, workshopId: wsId, kalem: wsKalemler.length, turNo })
  }

  if (olusan.length === 0) {
    return NextResponse.json(
      { error: 'Gönderilecek yeni teklif yok — cevap bekleyen tur var' }, { status: 409 })
  }

  await sql`UPDATE plan_taslak SET durum = 'gonderildi', updated_at = now() WHERE id = ${taslakId}`

  return NextResponse.json({ teklifler: olusan })
})
