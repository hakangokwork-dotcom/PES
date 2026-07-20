import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  const journal = await sql`SELECT j.*, ps.name AS stage_name FROM work_order_journal j
    LEFT JOIN production_stage ps ON j.stage_id = ps.id
    WHERE work_order_id = ${id} ORDER BY tarih DESC, id DESC`
  return NextResponse.json({ journal })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const id = Number(params.id)
  const body = await req.json()
  if (!body.aciklama) return NextResponse.json({ error: 'aciklama zorunlu' }, { status: 400 })
  const tarih = body.tarih || new Date().toISOString().slice(0, 10)
  const [row] = await sql`INSERT INTO work_order_journal (
    tenant_id, work_order_id, stage_id, tarih, vardiya, tip, kategori, baslik, aciklama, oneri, yazan, paylasim_admin
  ) VALUES (
    ${tenant.tenantId}, ${id}, ${body.stage_id ?? null}, ${tarih},
    ${body.vardiya ?? 'Gündüz'}, ${body.tip ?? 'NOT'}, ${body.kategori ?? null},
    ${body.baslik ?? null}, ${body.aciklama}, ${body.oneri ?? null},
    ${body.yazan ?? null}, ${body.paylasim_admin ?? false}
  ) RETURNING *`
  return NextResponse.json({ entry: row })
})
