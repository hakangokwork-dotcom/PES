import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Katalog seçenekleri — tek istekte birden çok boyut (spec §4).
 *   GET /api/pes/katalog?boyut=klasman,kumas_turu,ana_grup
 *   → { secenekler: { klasman: [{ code, label }], kumas_turu: [...] } }
 *
 * Form açılışında bir kez çekilir. Boyut adı capability_dimension.code'dur;
 * bilinmeyen boyut sessizce boş dizi döner, 400 değil — form kırılmasın.
 */
export const GET = withTenantRoute(async (req, { sql }) => {
  const ham = new URL(req.url).searchParams.get('boyut') ?? ''
  const boyutlar = [...new Set(ham.split(',').map(s => s.trim()).filter(Boolean))]
  if (boyutlar.length === 0) {
    return NextResponse.json({ error: 'boyut gerekli' }, { status: 400 })
  }
  const satirlar = await sql`
    SELECT d.code AS boyut, v.code, v.label
      FROM capability_value v
      JOIN capability_dimension d ON d.id = v.dimension_id
     WHERE d.code IN ${sql(boyutlar)}
     ORDER BY d.code, v.sort_order, v.label`
  const secenekler: Record<string, { code: string; label: string }[]> = {}
  for (const b of boyutlar) secenekler[b] = []
  for (const r of satirlar) {
    secenekler[r.boyut as string].push({ code: r.code as string, label: r.label as string })
  }
  return NextResponse.json({ secenekler })
})
