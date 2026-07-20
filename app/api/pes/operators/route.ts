import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const wid = req.nextUrl.searchParams.get('workshop_id')
  const data = wid
    ? await sql`SELECT o.*, pl.name as line_name FROM operator o LEFT JOIN production_line pl ON pl.id = o.line_id WHERE o.workshop_id = ${Number(wid)} AND o.aktif = true ORDER BY o.ad_soyad`
    : await sql`SELECT * FROM operator WHERE aktif = true ORDER BY ad_soyad LIMIT 200`
  return NextResponse.json({ operators: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`INSERT INTO operator (tenant_id, workshop_id, line_id, sicil_no, ad_soyad, operasyon, makine_tipi, giris_tarihi, skill_level)
    VALUES (${tenant.tenantId}, ${body.workshop_id}, ${body.line_id ?? null}, ${body.sicil_no ?? null}, ${body.ad_soyad},
      ${body.operasyon ?? null}, ${body.makine_tipi ?? null}, ${body.giris_tarihi ?? null}, ${body.skill_level ?? 'JUNIOR'})
    RETURNING *`
  return NextResponse.json({ operator: row })
})
