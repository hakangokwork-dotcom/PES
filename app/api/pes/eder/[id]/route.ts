import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  const [model] = await sql`SELECT * FROM eder_model WHERE id = ${id}`
  if (!model) return NextResponse.json({ error: 'Model bulunamadı' }, { status: 404 })

  const gruplar = await sql`
    SELECT * FROM eder_operasyon_grubu WHERE model_id = ${id} ORDER BY sira_no
  `

  const grupIds = gruplar.map((g: Record<string, unknown>) => g.id as number)
  let altOps: Record<string, unknown>[] = []
  if (grupIds.length > 0) {
    altOps = await sql`
      SELECT * FROM eder_alt_operasyon WHERE grup_id IN ${sql(grupIds)} ORDER BY sira_no
    `
  }

  const [dkm] = await sql`
    SELECT dk_maliyet_tl FROM dk_maliyet WHERE donem = ${model.donem} AND bolge = ${model.bolge}
  `

  const teklifler = await sql`
    SELECT * FROM eder_atolye_teklif WHERE model_id = ${id} ORDER BY teklif_fiyat_tl
  `

  const gruplarWithOps = gruplar.map((g: Record<string, unknown>) => ({
    ...g,
    alt_operasyonlar: altOps.filter((op: Record<string, unknown>) => op.grup_id === g.id),
  }))

  return NextResponse.json({
    model,
    gruplar: gruplarWithOps,
    dk_maliyet_tl: dkm?.dk_maliyet_tl ?? null,
    teklifler,
  })
})

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = Number(params.id)
  const body = await req.json()
  const [row] = await sql`
    UPDATE eder_model SET
      model_adi = COALESCE(${body.model_adi ?? null}, model_adi),
      plm_id = COALESCE(${body.plm_id ?? null}, plm_id),
      siparis_adedi = COALESCE(${body.siparis_adedi ?? null}, siparis_adedi),
      bolge = COALESCE(${body.bolge ?? null}, bolge),
      donem = COALESCE(${body.donem ?? null}, donem),
      gunluk_calisma_sn = COALESCE(${body.gunluk_calisma_sn ?? null}, gunluk_calisma_sn),
      hedef_sure_sn = COALESCE(${body.hedef_sure_sn ?? null}, hedef_sure_sn)
    WHERE id = ${id}
    RETURNING *
  `
  return NextResponse.json({ model: row })
})

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  await sql`DELETE FROM eder_model WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
