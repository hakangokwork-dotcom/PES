import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { workshopCreateSchema } from '@/lib/pes/validation'

export const GET = withTenantRoute(async (_req, { sql }) => {
  const data = await sql`SELECT * FROM workshop ORDER BY code`
  return NextResponse.json({ workshops: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const parsed = workshopCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const d = parsed.data
  try {
    const [row] = await sql`
      INSERT INTO workshop (
        tenant_id,
        code, name, city, district, type,
        total_staff, sewing_staff, ukp_staff, cutting_staff,
        management, indirect, line_count, daily_target, net_hours_day
      )
      VALUES (
        ${tenant.tenantId},
        ${d.code}, ${d.name}, ${d.city ?? null}, ${d.district ?? null}, ${d.type},
        ${d.total_staff}, ${d.sewing_staff}, ${d.ukp_staff}, ${d.cutting_staff},
        ${d.management}, ${d.indirect}, ${d.line_count}, ${d.daily_target}, ${d.net_hours_day}
      )
      RETURNING id
    `
    return NextResponse.json({ workshop: { id: row.id } })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('duplicate key')) {
      return NextResponse.json({ error: 'Bu kod zaten kullanılıyor' }, { status: 400 })
    }
    throw err
  }
})
