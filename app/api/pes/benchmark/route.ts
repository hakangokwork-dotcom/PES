import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (_req, { sql }) => {
  const data = await sql`SELECT * FROM pes_benchmark ORDER BY id`
  return NextResponse.json({ benchmarks: data })
})

export const POST = withTenantRoute(async (req, { sql }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO pes_benchmark (metric_key, metric_label, target_value, warning_value, critical_value, unit, direction, notes)
    VALUES (${body.metric_key}, ${body.metric_label}, ${body.target_value}, ${body.warning_value ?? null}, ${body.critical_value ?? null}, ${body.unit ?? '%'}, ${body.direction ?? 'higher_better'}, ${body.notes ?? null})
    ON CONFLICT (metric_key) DO UPDATE SET
      target_value = EXCLUDED.target_value,
      warning_value = EXCLUDED.warning_value,
      critical_value = EXCLUDED.critical_value,
      notes = EXCLUDED.notes,
      updated_at = now()
    RETURNING *
  `
  return NextResponse.json({ benchmark: row })
})
