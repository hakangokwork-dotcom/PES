import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = Number(params.id)
  const body = await req.json()
  const [row] = await sql`UPDATE kaizen_action SET
    durum = COALESCE(${body.durum ?? null}, durum),
    sonuc_deger = COALESCE(${body.sonuc_deger ?? null}, sonuc_deger),
    notlar = COALESCE(${body.notlar ?? null}, notlar),
    updated_at = now()
    WHERE id = ${id} RETURNING *`
  return NextResponse.json({ action: row })
})
