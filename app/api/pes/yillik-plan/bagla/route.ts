import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { atolyeyseReddet } from '../_yetki'

/** PO'yu tahmin kalemine bağla (kalemId null → çöz). */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const b = await req.json()
  const workOrderId = Number(b.workOrderId)
  const kalemId = b.kalemId === null ? null : Number(b.kalemId)
  if (!Number.isInteger(workOrderId) || (kalemId !== null && !Number.isInteger(kalemId))) {
    return NextResponse.json({ error: 'workOrderId zorunlu, kalemId tam sayı ya da null' }, { status: 400 })
  }
  if (kalemId !== null) {
    const [k] = await sql`SELECT 1 FROM talep_tahmini_kalem WHERE id = ${kalemId}`
    if (!k) return NextResponse.json({ error: 'Kalem bulunamadı' }, { status: 404 })
  }
  const [r] = await sql`
    UPDATE work_order SET tahmin_kalem_id = ${kalemId} WHERE id = ${workOrderId} RETURNING id
  ` as unknown as Array<{ id: number }>
  if (!r) return NextResponse.json({ error: 'Sipariş bulunamadı' }, { status: 404 })
  return NextResponse.json({ ok: true })
})
