import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { lineCreateSchema } from '@/lib/pes/validation'

export const GET = withTenantRoute(async (req, { sql }) => {
  const wid = req.nextUrl.searchParams.get('workshop_id')
  const data = wid
    ? await sql`SELECT id, code, name, workshop_id, line_type, operator_count, daily_target, max_cycle_sec, is_active
                FROM production_line WHERE workshop_id = ${Number(wid)} AND is_active = TRUE ORDER BY id`
    : await sql`SELECT id, code, name, workshop_id, line_type, operator_count, daily_target, max_cycle_sec, is_active
                FROM production_line WHERE is_active = TRUE ORDER BY workshop_id, id`
  return NextResponse.json({ lines: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const parsed = lineCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const d = parsed.data
  try {
    const [row] = await sql`
      INSERT INTO production_line (tenant_id, code, workshop_id, name, line_type, operator_count, daily_target, max_cycle_sec)
      VALUES (${tenant.tenantId}, ${d.code}, ${d.workshop_id}, ${d.name}, ${d.line_type}, ${d.operator_count}, ${d.daily_target}, ${d.max_cycle_sec ?? null})
      RETURNING id
    `
    return NextResponse.json({ line: { id: row.id } })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('duplicate key')) {
      return NextResponse.json({ error: 'Bu bant kodu zaten kullanılıyor' }, { status: 400 })
    }
    throw err
  }
})
