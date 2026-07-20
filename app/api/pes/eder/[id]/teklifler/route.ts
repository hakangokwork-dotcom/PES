import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  const data = await sql`
    SELECT * FROM eder_atolye_teklif WHERE model_id = ${id} ORDER BY teklif_fiyat_tl
  `
  return NextResponse.json({ teklifler: data })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const id = Number(params.id)
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO eder_atolye_teklif (tenant_id, model_id, atolye_adi, teklif_fiyat_tl, notlar)
    VALUES (${tenant.tenantId}, ${id}, ${body.atolye_adi}, ${body.teklif_fiyat_tl}, ${body.notlar ?? null})
    RETURNING *
  `
  return NextResponse.json({ teklif: row })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const teklifId = req.nextUrl.searchParams.get('teklif_id')
  if (!teklifId) return NextResponse.json({ error: 'teklif_id gerekli' }, { status: 400 })
  await sql`DELETE FROM eder_atolye_teklif WHERE id = ${Number(teklifId)}`
  return NextResponse.json({ ok: true })
})
