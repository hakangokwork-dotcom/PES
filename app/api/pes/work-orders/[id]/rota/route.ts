// app/api/pes/work-orders/[id]/rota/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute, idOku, gecersizKimlik } from '@/app/api/_lib/with-tenant'

/**
 * Rota şablonunu iş emrine uygular (064 wo_rota_kur): eksik adımlar eklenir,
 * var olan adımın planına/gerçeğine dokunulmaz, boş firması doldurulur.
 *
 *   POST /api/pes/work-orders/12/rota  { rota_sablonu_id } → { eklenen }   (merkez)
 */
export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) return NextResponse.json({ error: 'Rotayı yalnız merkez uygular' }, { status: 403 })
  const id = idOku(params.id)
  if (id === null) return gecersizKimlik()
  const b = await req.json()
  const sablon = Number(b.rota_sablonu_id)
  if (!Number.isInteger(sablon)) return NextResponse.json({ error: 'Şablon seçin' }, { status: 400 })
  const [r] = await sql`SELECT id FROM rota_sablonu WHERE id = ${sablon} AND aktif`
  if (!r) return NextResponse.json({ error: 'Şablon bulunamadı ya da pasif' }, { status: 404 })
  const [wo] = await sql`UPDATE work_order SET rota_sablonu_id = ${sablon} WHERE id = ${id} RETURNING id`
  if (!wo) return NextResponse.json({ error: 'İş emri bulunamadı' }, { status: 404 })
  const [{ eklenen }] = await sql`SELECT wo_rota_kur(${id}) AS eklenen`
  return NextResponse.json({ eklenen })
})
