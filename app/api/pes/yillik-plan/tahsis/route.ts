import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Hücreyi elle düzenle. adet 0 → satır silinir. Düzenlenen hücre
 * 'elle' olur ve sonraki "Öner" onu ezmez.
 */
export const PUT = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const kalemId = Number(b.kalemId)
  const workshopId = Number(b.workshopId)
  const ay = Number(b.ay)
  const adet = Number(b.adet)
  if (![kalemId, workshopId, ay, adet].every(Number.isInteger) || ay < 1 || ay > 12 || adet < 0) {
    return NextResponse.json({ error: 'kalemId, workshopId, ay (1-12) ve adet (>=0) zorunlu' }, { status: 400 })
  }
  if (adet === 0) {
    await sql`DELETE FROM talep_tahsis WHERE kalem_id = ${kalemId} AND workshop_id = ${workshopId} AND ay = ${ay}`
    return NextResponse.json({ ok: true })
  }
  await sql`
    INSERT INTO talep_tahsis (kalem_id, tenant_id, workshop_id, ay, adet, kaynak)
    VALUES (${kalemId}, ${tenant.tenantId}, ${workshopId}, ${ay}, ${adet}, 'elle')
    ON CONFLICT (kalem_id, workshop_id, ay)
    DO UPDATE SET adet = EXCLUDED.adet, kaynak = 'elle', updated_at = now()`
  return NextResponse.json({ ok: true })
})
