import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (_req, { sql }) => {
  const data = await sql`SELECT * FROM model_bottleneck ORDER BY model_code`
  return NextResponse.json({ bottlenecks: data })
})

export const POST = withTenantRoute(async (req, { sql }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO model_bottleneck (model_code, bottleneck_operation, bottleneck_sec, net_hours)
    VALUES (${body.model_code}, ${body.bottleneck_operation ?? null}, ${body.bottleneck_sec}, ${body.net_hours ?? 9})
    ON CONFLICT (model_code) DO UPDATE SET
      bottleneck_operation = EXCLUDED.bottleneck_operation,
      bottleneck_sec = EXCLUDED.bottleneck_sec,
      net_hours = EXCLUDED.net_hours
    RETURNING id
  `
  return NextResponse.json({ bottleneck: { id: row.id } })
})
