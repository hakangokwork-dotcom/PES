import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const action = req.nextUrl.searchParams.get('action') || 'dimensions'
  const lineId = req.nextUrl.searchParams.get('line_id')

  if (action === 'dimensions') {
    const dims = await sql`SELECT d.*, json_agg(json_build_object('id', v.id, 'code', v.code, 'label', v.label, 'sort_order', v.sort_order) ORDER BY v.sort_order) AS values
      FROM capability_dimension d
      LEFT JOIN capability_value v ON v.dimension_id = d.id
      GROUP BY d.id ORDER BY d.sort_order`
    return NextResponse.json({ dimensions: dims })
  }

  if (action === 'line_profile' && lineId) {
    const caps = await sql`SELECT dimension_code, value_code, attribute_type FROM line_capability WHERE line_id = ${Number(lineId)} AND attribute_type = 'PROFILE'`
    return NextResponse.json({ capabilities: caps })
  }

  if (action === 'summary' && lineId) {
    const summary = await sql`
      SELECT d.label AS boyut, d.sort_order,
        string_agg(cv.label, ' / ' ORDER BY cv.sort_order) AS degerler,
        count(*)::int AS sayi
      FROM line_capability lc
      JOIN capability_dimension d ON d.code = lc.dimension_code
      JOIN capability_value cv ON cv.code = lc.value_code AND cv.dimension_id = d.id
      WHERE lc.line_id = ${Number(lineId)} AND lc.attribute_type = 'PROFILE'
      GROUP BY d.label, d.sort_order ORDER BY d.sort_order`
    return NextResponse.json({ summary })
  }

  return NextResponse.json({ error: 'Gecersiz action' }, { status: 400 })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const { line_id, capabilities } = body as { line_id: number; capabilities: { dimension_code: string; value_code: string }[] }

  await sql`DELETE FROM line_capability WHERE line_id = ${line_id} AND attribute_type = 'PROFILE'`

  if (capabilities.length > 0) {
    const rows = capabilities.map(c => ({
      tenant_id: tenant.tenantId,
      line_id,
      dimension_code: c.dimension_code,
      value_code: c.value_code,
      attribute_type: 'PROFILE',
    }))
    await sql`INSERT INTO line_capability ${sql(rows, 'tenant_id', 'line_id', 'dimension_code', 'value_code', 'attribute_type')}
      ON CONFLICT (line_id, dimension_code, value_code, attribute_type) DO NOTHING`
  }

  return NextResponse.json({ ok: true, saved: capabilities.length })
})
