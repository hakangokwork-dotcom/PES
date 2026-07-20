import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const wid = req.nextUrl.searchParams.get('workshop_id')
  try {
    const data = wid
      ? await sql`SELECT * FROM v_eder_model_ozet WHERE workshop_id = ${Number(wid)} ORDER BY created_at DESC`
      : await sql`SELECT * FROM v_eder_model_ozet ORDER BY created_at DESC`
    return NextResponse.json({ models: data })
  } catch {
    const data = wid
      ? await sql`SELECT * FROM eder_model WHERE workshop_id = ${Number(wid)} ORDER BY created_at DESC`
      : await sql`SELECT * FROM eder_model ORDER BY created_at DESC`
    return NextResponse.json({ models: data })
  }
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO eder_model (tenant_id, workshop_id, model_adi, plm_id, siparis_adedi, bolge, donem, gunluk_calisma_sn, hedef_sure_sn)
    VALUES (
      ${tenant.tenantId},
      ${body.workshop_id ?? null},
      ${body.model_adi},
      ${body.plm_id ?? null},
      ${body.siparis_adedi ?? 0},
      ${body.bolge},
      ${body.donem},
      ${body.gunluk_calisma_sn ?? 32400},
      ${body.hedef_sure_sn ?? 30}
    )
    RETURNING *
  `
  return NextResponse.json({ model: row })
})
