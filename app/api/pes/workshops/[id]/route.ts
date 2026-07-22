import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { atolyeSil, engelleriYaz } from '@/lib/pes/workshop-baglantilar'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = parseInt(params.id)
  const rows = await sql`SELECT * FROM workshop WHERE id = ${id}`
  if (rows.length === 0) return NextResponse.json({ error: 'Atölye bulunamadı' }, { status: 404 })
  return NextResponse.json({ workshop: rows[0] })
})

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = parseInt(params.id)
  const body = await req.json()
  await sql`
    UPDATE workshop SET
      name = COALESCE(${body.name ?? null}, name),
      city = COALESCE(${body.city ?? null}, city),
      district = COALESCE(${body.district ?? null}, district),
      type = COALESCE(${body.type ?? null}, type),
      total_staff = COALESCE(${body.total_staff ?? null}, total_staff),
      sewing_staff = COALESCE(${body.sewing_staff ?? null}, sewing_staff),
      ukp_staff = COALESCE(${body.ukp_staff ?? null}, ukp_staff),
      cutting_staff = COALESCE(${body.cutting_staff ?? null}, cutting_staff),
      management = COALESCE(${body.management ?? null}, management),
      indirect = COALESCE(${body.indirect ?? null}, indirect),
      line_count = COALESCE(${body.line_count ?? null}, line_count),
      daily_target = COALESCE(${body.daily_target ?? null}, daily_target),
      net_hours_day = COALESCE(${body.net_hours_day ?? null}, net_hours_day),
      bolge = COALESCE(${body.bolge ?? null}, bolge),
      is_active = COALESCE(${body.is_active ?? null}, is_active)
    WHERE id = ${id}
  `
  return NextResponse.json({ workshop: { id } })
})

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })
  }

  const sonuc = await atolyeSil(sql, id)

  if (!sonuc.bulundu) {
    return NextResponse.json({ error: 'Bu atölye artık yok' }, { status: 404 })
  }
  if (!sonuc.silindi) {
    return NextResponse.json(
      {
        error: `Silinemez — ${engelleriYaz(sonuc.engeller)} bağlı. Bunun yerine arşivleyebilirsin.`,
        engeller: sonuc.engeller,
      },
      { status: 409 }
    )
  }
  return NextResponse.json({ ok: true })
})
