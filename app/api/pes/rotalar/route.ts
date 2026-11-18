// app/api/pes/rotalar/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Rota şablonu (064, SAP PLKO karşılığı). Okuma kiracı içi; yazma merkez.
 *
 *   GET  /api/pes/rotalar   → { rotalar: [{ id, ad, aciklama, aktif, operasyon_sayisi }] }
 *   POST /api/pes/rotalar   { ad, aciklama? } → { id }
 */
export const GET = withTenantRoute(async (_req, { sql }) => {
  const rotalar = await sql`
    SELECT r.id, r.ad, r.aciklama, r.aktif,
           (SELECT count(*)::int FROM rota_operasyonu o WHERE o.sablon_id = r.id) AS operasyon_sayisi
      FROM rota_sablonu r ORDER BY r.aktif DESC, r.ad`
  return NextResponse.json({ rotalar })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  if (tenant.workshopId !== null) return NextResponse.json({ error: 'Rota şablonlarını yalnız merkez yönetir' }, { status: 403 })
  const b = await req.json()
  const ad = String(b.ad ?? '').trim()
  if (!ad) return NextResponse.json({ error: 'Şablon adı zorunlu' }, { status: 400 })
  try {
    const [r] = await sql`
      INSERT INTO rota_sablonu ${sql({ tenant_id: tenant.tenantId, ad, aciklama: String(b.aciklama ?? '').trim() || null })}
      RETURNING id`
    return NextResponse.json({ id: r.id })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return NextResponse.json({ error: `"${ad}" adlı şablon zaten var` }, { status: 409 })
    throw e
  }
})
