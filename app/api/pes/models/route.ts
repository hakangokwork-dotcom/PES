import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (_req, { sql }) => {
  const data = await sql`
    SELECT ml.*, pc.name as category_name, mp.name as process_name, mp.code as process_code
    FROM model_library ml
    LEFT JOIN product_category pc ON pc.id = ml.category_id
    LEFT JOIN master_process mp ON mp.id = ml.process_id
    ORDER BY ml.code, mp.sort_order
  `
  return NextResponse.json({ models: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO model_library (tenant_id, code, name, category_id, template_code, process_id, sam_minutes, source, valid_from, bottleneck_sec)
    VALUES (${tenant.tenantId}, ${body.code}, ${body.name}, ${body.category_id}, ${body.template_code}, ${body.process_id}, ${body.sam_minutes}, ${body.source ?? 'Pratik'}, ${body.valid_from ?? new Date().toISOString().split('T')[0]}, ${body.bottleneck_sec ?? null})
    ON CONFLICT (code, process_id) DO UPDATE SET
      name = EXCLUDED.name, sam_minutes = EXCLUDED.sam_minutes,
      source = EXCLUDED.source, bottleneck_sec = EXCLUDED.bottleneck_sec
    RETURNING id
  `
  return NextResponse.json({ model: { id: row.id } })
})
