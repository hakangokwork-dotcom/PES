import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const wid = req.nextUrl.searchParams.get('workshop_id')
  const data = wid
    ? await sql`SELECT * FROM kaizen_action WHERE workshop_id = ${Number(wid)} ORDER BY created_at DESC`
    : await sql`SELECT ka.*, w.name as workshop_name FROM kaizen_action ka LEFT JOIN workshop w ON w.id = ka.workshop_id ORDER BY ka.created_at DESC LIMIT 200`
  return NextResponse.json({ actions: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`INSERT INTO kaizen_action (tenant_id, workshop_id, baslik, kategori, hedef_metrik, mevcut_deger, hedef_deger, sorumlu, baslangic_tarihi, bitis_tarihi, durum, notlar)
    VALUES (${tenant.tenantId}, ${body.workshop_id}, ${body.baslik}, ${body.kategori ?? 'GENEL'}, ${body.hedef_metrik ?? null},
      ${body.mevcut_deger ?? null}, ${body.hedef_deger ?? null}, ${body.sorumlu ?? null},
      ${body.baslangic_tarihi ?? null}, ${body.bitis_tarihi ?? null}, ${body.durum ?? 'PLAN'}, ${body.notlar ?? null})
    RETURNING *`
  return NextResponse.json({ action: row })
})
