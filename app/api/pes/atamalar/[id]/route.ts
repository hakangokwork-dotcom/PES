import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { planBitisi } from '@/lib/pes/bant-doluluk'
import { atolyeBaglamiYukle, elleplanYukle } from '@/lib/pes/bant-doluluk-veri'

/**
 * Bant tahsisini taşır (plan Task 13): başka banda ve/veya başka tarihe.
 *
 *   PATCH /api/pes/atamalar/57  { lineId?, planBaslangic? }
 *
 * plan_bitis İSTEMCİDEN ALINMAZ — türetilir (K4). Elle girilen günlük
 * planlar (plan_adet) taşımada KORUNUR: otomatik günler yeni bandın
 * payına göre kayar, atölyenin yazdığı rampa durur. Aksi halde
 * planlamacı her taşımada rampayı baştan yazardı.
 *
 * Bant değişimi yalnız AYNI ATÖLYE içinde: 030'un K1'i sipariş bir
 * atölyeye aittir der; başka atölyeye taşımak yerleştirme sihirbazının
 * işidir (aşama zinciri, dış atölye kontrolü orada).
 */
const TARIH = /^\d{4}-\d{2}-\d{2}$/

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = parseInt(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz atama' }, { status: 400 })

  const b = await req.json()
  const yeniLine = b.lineId == null ? null : Number(b.lineId)
  const yeniBas = b.planBaslangic == null ? null : String(b.planBaslangic)

  if (yeniLine !== null && !Number.isInteger(yeniLine)) {
    return NextResponse.json({ error: 'lineId tam sayı olmalı' }, { status: 400 })
  }
  if (yeniBas !== null && !TARIH.test(yeniBas)) {
    return NextResponse.json({ error: 'planBaslangic YYYY-AA-GG olmalı' }, { status: 400 })
  }
  if (yeniLine === null && yeniBas === null) {
    return NextResponse.json({ error: 'Değişecek alan yok' }, { status: 400 })
  }

  const [mevcut] = await sql`
    SELECT a.id, a.line_id, a.adet, a.plan_baslangic::text, pl.workshop_id
      FROM work_order_stage_atama a
      JOIN production_line pl ON pl.id = a.line_id
     WHERE a.id = ${id}`
  if (!mevcut) return NextResponse.json({ error: 'Atama bulunamadı' }, { status: 404 })

  if (yeniLine !== null && yeniLine !== mevcut.line_id) {
    const [hedef] = await sql`SELECT workshop_id, is_active FROM production_line WHERE id = ${yeniLine}`
    if (!hedef) return NextResponse.json({ error: 'Hedef bant bulunamadı' }, { status: 404 })
    if (hedef.workshop_id !== mevcut.workshop_id) {
      return NextResponse.json(
        { error: 'Sipariş başka atölyeye buradan taşınamaz; yerleştirme sihirbazını kullanın' },
        { status: 400 })
    }
    if (!hedef.is_active) {
      return NextResponse.json({ error: 'Hedef bant pasif' }, { status: 400 })
    }
  }

  const lineId = yeniLine ?? (mevcut.line_id as number)
  const planBaslangic = yeniBas ?? (mevcut.plan_baslangic as string)

  const ctx = await atolyeBaglamiYukle(sql, lineId)
  if (!ctx) return NextResponse.json({ error: 'Bant bulunamadı' }, { status: 404 })
  const elleplan = await elleplanYukle(sql, id)

  const planBitis = planBitisi(
    { atamaId: id, lineId, adet: mevcut.adet as number, planBaslangic, elleplan }, ctx)

  await sql`
    UPDATE work_order_stage_atama
       SET line_id = ${lineId},
           plan_baslangic = ${planBaslangic},
           plan_bitis = ${planBitis}
     WHERE id = ${id}`

  return NextResponse.json({ ok: true, lineId, planBaslangic, planBitis })
})
