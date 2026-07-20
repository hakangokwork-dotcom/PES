import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const wid = req.nextUrl.searchParams.get('workshop_id')
  const rows = wid
    ? await sql`
        SELECT * FROM v_eder_model_v3_ozet
        WHERE workshop_id = ${Number(wid)}
        ORDER BY created_at DESC NULLS LAST
      `
    : await sql`
        SELECT * FROM v_eder_model_v3_ozet
        ORDER BY created_at DESC NULLS LAST
      `
  return NextResponse.json({ models: rows })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()

  const [row] = await sql`
    INSERT INTO eder_model (
      tenant_id, workshop_id, model_adi, plm_id, siparis_adedi, bolge, donem,
      gunluk_calisma_sn, hedef_sure_sn, kv3_urun_id, selected_parcalar
    )
    VALUES (
      ${tenant.tenantId},
      ${body.workshop_id ?? null},
      ${body.model_adi},
      ${body.plm_id ?? null},
      ${body.siparis_adedi ?? 0},
      ${body.bolge ?? 3},
      ${body.donem ?? '2026-04'},
      ${body.gunluk_calisma_sn ?? 32400},
      ${body.hedef_sure_sn ?? 30},
      ${body.kv3_urun_id},
      ${JSON.stringify(body.selected_parcalar ?? [])}::jsonb
    )
    RETURNING *
  `

  let islemCount = 0
  if (row.kv3_urun_id) {
    const [r] = await sql`SELECT eder_populate_islemler(${row.id}, ${row.kv3_urun_id}) AS cnt`
    islemCount = Number(r.cnt) || 0
  }

  return NextResponse.json({ model: row, inserted_islem: islemCount })
})

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const body = await req.json()
  const { id, selected_parcalar, model_adi, plm_id, siparis_adedi, bolge, donem, gunluk_calisma_sn, hedef_sure_sn } = body
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })

  const [row] = await sql`
    UPDATE eder_model SET
      model_adi         = COALESCE(${model_adi}, model_adi),
      plm_id            = COALESCE(${plm_id}, plm_id),
      siparis_adedi     = COALESCE(${siparis_adedi}, siparis_adedi),
      bolge             = COALESCE(${bolge}, bolge),
      donem             = COALESCE(${donem}, donem),
      gunluk_calisma_sn = COALESCE(${gunluk_calisma_sn}, gunluk_calisma_sn),
      hedef_sure_sn     = COALESCE(${hedef_sure_sn}, hedef_sure_sn),
      selected_parcalar = COALESCE(${selected_parcalar != null ? JSON.stringify(selected_parcalar) : null}::jsonb, selected_parcalar),
      updated_at        = now()
    WHERE id = ${Number(id)}
    RETURNING *
  `
  return NextResponse.json({ model: row })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  await sql`DELETE FROM eder_model WHERE id = ${Number(id)}`
  return NextResponse.json({ ok: true })
})
