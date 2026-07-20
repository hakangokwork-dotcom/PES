import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  const [row] = await sql`UPDATE work_order_material SET
    tip            = COALESCE(${body.tip ?? null},            tip),
    kod            = COALESCE(${body.kod ?? null},            kod),
    ad             = COALESCE(${body.ad ?? null},             ad),
    miktar         = COALESCE(${body.miktar ?? null},         miktar),
    birim          = COALESCE(${body.birim ?? null},          birim),
    durum          = COALESCE(${body.durum ?? null},          durum),
    beklenen_tarih = COALESCE(${body.beklenen_tarih ?? null}, beklenen_tarih),
    gelis_tarihi   = COALESCE(${body.gelis_tarihi ?? null},   gelis_tarihi),
    tedarikci      = COALESCE(${body.tedarikci ?? null},      tedarikci),
    notlar         = COALESCE(${body.notlar ?? null},         notlar)
    WHERE id = ${Number(body.id)} RETURNING *`
  return NextResponse.json({ material: row })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  await sql`DELETE FROM work_order_material WHERE id = ${Number(id)}`
  return NextResponse.json({ ok: true })
})
