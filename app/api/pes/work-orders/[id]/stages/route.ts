import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  const stages = await sql`SELECT * FROM v_work_order_stages WHERE work_order_id = ${id} ORDER BY sira_no, id`
  const catalog = await sql`SELECT * FROM production_stage ORDER BY sira_no`
  return NextResponse.json({ stages, catalog })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const id = Number(params.id)
  const body = await req.json()
  if (!body.stage_id) return NextResponse.json({ error: 'stage_id zorunlu' }, { status: 400 })
  const [row] = await sql`
    INSERT INTO work_order_stage (
      tenant_id, work_order_id, stage_id, sira_no, line_id,
      plan_baslangic, plan_bitis, plan_sure_dk,
      durum, notlar
    ) VALUES (
      ${tenant.tenantId}, ${id}, ${body.stage_id}, ${body.sira_no ?? 100}, ${body.line_id ?? null},
      ${body.plan_baslangic ?? null}, ${body.plan_bitis ?? null}, ${body.plan_sure_dk ?? null},
      ${body.durum ?? 'Beklemede'}, ${body.notlar ?? null}
    ) RETURNING *`
  return NextResponse.json({ stage: row })
})
