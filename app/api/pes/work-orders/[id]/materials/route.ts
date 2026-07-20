import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  const materials = await sql`SELECT * FROM work_order_material WHERE work_order_id = ${id} ORDER BY tip, id`
  return NextResponse.json({ materials })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const id = Number(params.id)
  const body = await req.json()
  if (!body.ad) return NextResponse.json({ error: 'ad zorunlu' }, { status: 400 })
  const [row] = await sql`INSERT INTO work_order_material (
    tenant_id, work_order_id, tip, kod, ad, miktar, birim, durum, beklenen_tarih, gelis_tarihi, tedarikci, notlar
  ) VALUES (
    ${tenant.tenantId}, ${id}, ${body.tip ?? 'AKSESUAR'}, ${body.kod ?? null}, ${body.ad},
    ${body.miktar ?? null}, ${body.birim ?? null},
    ${body.durum ?? 'Bekleniyor'}, ${body.beklenen_tarih ?? null}, ${body.gelis_tarihi ?? null},
    ${body.tedarikci ?? null}, ${body.notlar ?? null}
  ) RETURNING *`
  return NextResponse.json({ material: row })
})
