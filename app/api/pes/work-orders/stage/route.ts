import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  const [row] = await sql`UPDATE work_order_stage SET
    line_id          = COALESCE(${body.line_id ?? null},          line_id),
    plan_baslangic   = COALESCE(${body.plan_baslangic ?? null},   plan_baslangic),
    plan_bitis       = COALESCE(${body.plan_bitis ?? null},       plan_bitis),
    plan_sure_dk     = COALESCE(${body.plan_sure_dk ?? null},     plan_sure_dk),
    gercek_baslangic = COALESCE(${body.gercek_baslangic ?? null}, gercek_baslangic),
    gercek_bitis     = COALESCE(${body.gercek_bitis ?? null},     gercek_bitis),
    gercek_sure_dk   = COALESCE(${body.gercek_sure_dk ?? null},   gercek_sure_dk),
    durum            = COALESCE(${body.durum ?? null},            durum),
    ilerleme_pct     = COALESCE(${body.ilerleme_pct ?? null},     ilerleme_pct),
    uretilen_adet    = COALESCE(${body.uretilen_adet ?? null},    uretilen_adet),
    hatali_adet      = COALESCE(${body.hatali_adet ?? null},      hatali_adet),
    notlar           = COALESCE(${body.notlar ?? null},           notlar),
    updated_at       = now()
    WHERE id = ${Number(body.id)} RETURNING *`
  return NextResponse.json({ stage: row })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  await sql`DELETE FROM work_order_stage WHERE id = ${Number(id)}`
  return NextResponse.json({ ok: true })
})
