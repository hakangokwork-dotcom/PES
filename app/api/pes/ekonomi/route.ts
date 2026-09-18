import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/** Elle girilen ekonomi satırı. source her zaman 'elle' — türetilmiş satır
 *  yalnız import script'inden gelir ve survey_id taşımak zorundadır. */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const tenantId = tenant.tenantId
  const b = await req.json()

  const workshopId = Number(b.workshop_id)
  const year = Number(b.year)
  const month = Number(b.month)
  if (!Number.isInteger(workshopId) || !Number.isInteger(year) ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'workshop_id, year ve month zorunlu' }, { status: 400 })
  }

  const s = (v: unknown) => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const [row] = await sql`
    INSERT INTO workshop_economy (
      workshop_id, tenant_id, year, month,
      revenue_declared, idle_days, qty_declared,
      nominal_days, actual_days, hours_per_day,
      cutting_staff, sewing_staff, ukp_staff, office_staff,
      area_m2, source, note)
    VALUES (
      ${workshopId}, ${tenantId}, ${year}, ${month},
      ${s(b.revenue_declared)}, ${s(b.idle_days)}, ${s(b.qty_declared)},
      ${s(b.nominal_days)}, ${s(b.actual_days)}, ${s(b.hours_per_day)},
      ${s(b.cutting_staff)}, ${s(b.sewing_staff)}, ${s(b.ukp_staff)}, ${s(b.office_staff)},
      ${s(b.area_m2)}, 'elle', ${b.note ?? null})
    ON CONFLICT (workshop_id, year, month) DO UPDATE SET
      revenue_declared = EXCLUDED.revenue_declared,
      idle_days = EXCLUDED.idle_days,
      qty_declared = EXCLUDED.qty_declared,
      nominal_days = EXCLUDED.nominal_days,
      actual_days = EXCLUDED.actual_days,
      hours_per_day = EXCLUDED.hours_per_day,
      cutting_staff = EXCLUDED.cutting_staff,
      sewing_staff = EXCLUDED.sewing_staff,
      ukp_staff = EXCLUDED.ukp_staff,
      office_staff = EXCLUDED.office_staff,
      area_m2 = EXCLUDED.area_m2,
      source = 'elle',
      survey_id = NULL,
      note = EXCLUDED.note,
      updated_at = now()
    RETURNING *`

  return NextResponse.json({ satir: row })
})
