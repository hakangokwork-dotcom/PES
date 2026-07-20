import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  const setResolved = body.resolved === true
  const [row] = await sql`UPDATE work_order_journal SET
    tip             = COALESCE(${body.tip ?? null},             tip),
    kategori        = COALESCE(${body.kategori ?? null},        kategori),
    baslik          = COALESCE(${body.baslik ?? null},          baslik),
    aciklama        = COALESCE(${body.aciklama ?? null},        aciklama),
    oneri           = COALESCE(${body.oneri ?? null},           oneri),
    paylasim_admin  = COALESCE(${body.paylasim_admin ?? null},  paylasim_admin),
    resolved        = COALESCE(${body.resolved ?? null},        resolved),
    resolved_at     = CASE WHEN ${setResolved} THEN COALESCE(resolved_at, now()) ELSE resolved_at END,
    resolved_notlar = COALESCE(${body.resolved_notlar ?? null}, resolved_notlar)
    WHERE id = ${Number(body.id)} RETURNING *`
  return NextResponse.json({ entry: row })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  await sql`DELETE FROM work_order_journal WHERE id = ${Number(id)}`
  return NextResponse.json({ ok: true })
})
