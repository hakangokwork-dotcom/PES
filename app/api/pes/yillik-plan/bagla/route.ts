import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/** PO'yu tahmin kalemine bağla (kalemId null → çöz). */
export const POST = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const workOrderId = Number(b.workOrderId)
  const kalemId = b.kalemId === null ? null : Number(b.kalemId)
  if (!Number.isInteger(workOrderId) || (kalemId !== null && !Number.isInteger(kalemId))) {
    return NextResponse.json({ error: 'workOrderId zorunlu, kalemId tam sayı ya da null' }, { status: 400 })
  }
  const [r] = await sql`
    UPDATE work_order SET tahmin_kalem_id = ${kalemId} WHERE id = ${workOrderId} RETURNING id
  ` as unknown as Array<{ id: number }>
  if (!r) return NextResponse.json({ error: 'Sipariş bulunamadı' }, { status: 404 })
  return NextResponse.json({ ok: true })
})
