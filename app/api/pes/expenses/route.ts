import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const url = new URL(req.url)
  const workshopId = url.searchParams.get('workshop_id')
  const year = url.searchParams.get('year')
  const month = url.searchParams.get('month')

  if (workshopId && year && month) {
    const rows = await sql`
      SELECT * FROM monthly_expense
      WHERE workshop_id = ${parseInt(workshopId)}
        AND year = ${parseInt(year)}
        AND month = ${parseInt(month)}
    `
    return NextResponse.json({ expense: rows[0] ?? null })
  }

  const rows = await sql`SELECT * FROM monthly_expense ORDER BY year DESC, month DESC LIMIT 100`
  return NextResponse.json({ expenses: rows })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO monthly_expense (
      tenant_id, workshop_id, year, month, work_days,
      personnel, sgk, food, electricity, water, gas,
      transport, vehicle, cargo, machine_maint, thread, other,
      target_revenue
    ) VALUES (
      ${tenant.tenantId}, ${body.workshop_id}, ${body.year}, ${body.month}, ${body.work_days},
      ${body.personnel}, ${body.sgk}, ${body.food}, ${body.electricity},
      ${body.water}, ${body.gas}, ${body.transport}, ${body.vehicle},
      ${body.cargo}, ${body.machine_maint}, ${body.thread}, ${body.other},
      ${body.target_revenue}
    )
    ON CONFLICT (workshop_id, year, month) DO UPDATE SET
      work_days = EXCLUDED.work_days,
      personnel = EXCLUDED.personnel, sgk = EXCLUDED.sgk,
      food = EXCLUDED.food, electricity = EXCLUDED.electricity,
      water = EXCLUDED.water, gas = EXCLUDED.gas,
      transport = EXCLUDED.transport, vehicle = EXCLUDED.vehicle,
      cargo = EXCLUDED.cargo, machine_maint = EXCLUDED.machine_maint,
      thread = EXCLUDED.thread, other = EXCLUDED.other,
      target_revenue = EXCLUDED.target_revenue
    RETURNING id
  `
  return NextResponse.json({ expense: { id: row.id }, message: 'Gider kaydedildi' })
})
