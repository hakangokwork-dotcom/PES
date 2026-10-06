import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * GET ?donem=YYYY-MM → o ayda GEÇERLİ değerler: istenen dönemden küçük/eşit
 * en yakın dönem (ekonomi-sorgu.ts ve referans-sorgu.ts ile aynı kural).
 * Birebir eşleşme ara aylarda (ör. 2026-07) boş dönüyor ve ekranlar
 * referansı 0 gösteriyordu. Yanıttaki `donem` alanı hangi dönemin
 * kullanıldığını söyler.
 * Parametresiz: bütün dönemler, en yeni önce.
 */
export const GET = withTenantRoute(async (req, { sql }) => {
  const donem = req.nextUrl.searchParams.get('donem')
  const data = donem
    ? await sql`
        SELECT * FROM dk_maliyet
        WHERE donem = (SELECT max(donem) FROM dk_maliyet WHERE donem <= ${donem})
        ORDER BY bolge`
    : await sql`SELECT * FROM dk_maliyet ORDER BY donem DESC, bolge`
  return NextResponse.json({ maliyetler: data })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO dk_maliyet (tenant_id, donem, bolge, dk_maliyet_tl)
    VALUES (${tenant.tenantId}, ${body.donem}, ${body.bolge}, ${body.dk_maliyet_tl})
    ON CONFLICT (donem, bolge) DO UPDATE SET dk_maliyet_tl = EXCLUDED.dk_maliyet_tl
    RETURNING *
  `
  return NextResponse.json({ maliyet: row })
})
