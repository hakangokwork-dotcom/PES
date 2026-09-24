import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Kütüphane gezgini verisi.
 *   ?urun_tipi_id=            → o tipin operasyon grupları + satır sayısı
 *   ?urun_tipi_id=&grup_id=   → grubun operasyonları ve MTM'leri
 *   ?q=                       → ürün tipi araması
 *   ?guven=DUSUK              → yalnız o güven seviyesi
 * Parametresiz: ürün tipi listesi.
 */
export const GET = withTenantRoute(async (req, { sql }) => {
  const u = new URL(req.url)
  const urunTipiId = u.searchParams.get('urun_tipi_id')
  const grupId = u.searchParams.get('grup_id')
  const q = (u.searchParams.get('q') ?? '').trim()
  const guven = u.searchParams.get('guven')

  if (!urunTipiId) {
    const tipler = await sql`
      SELECT ut.id, ut.klasman_ad, ut.segment, ut.kumas_grubu, ut.urun_grubu,
             count(z.id)::int AS olcum_sayisi
      FROM ref_urun_tipi ut
      LEFT JOIN ref_operasyon_zamani z ON z.urun_tipi_id = ut.id
      WHERE ${q ? sql`ut.klasman_ad ILIKE ${'%' + q + '%'}` : sql`TRUE`}
      GROUP BY ut.id
      ORDER BY olcum_sayisi DESC, ut.klasman_ad
      LIMIT 200`
    return NextResponse.json({ tipler })
  }

  if (!grupId) {
    const gruplar = await sql`
      SELECT og.id, og.ad, count(*)::int AS olcum_sayisi,
             round(avg(z.mtm)::numeric, 2)::float AS ort_mtm
      FROM ref_operasyon_zamani z
      JOIN ref_operasyon_grup og ON og.id = z.operasyon_grup_id
      WHERE z.urun_tipi_id = ${Number(urunTipiId)}
        AND ${guven ? sql`z.guven_seviyesi = ${guven}` : sql`TRUE`}
      GROUP BY og.id
      ORDER BY olcum_sayisi DESC, og.ad`
    return NextResponse.json({ gruplar })
  }

  const satirlar = await sql`
    SELECT z.id, o.ad AS operasyon, v.tam_ad AS ek_parca,
           z.mtm::float, z.mtm_min::float, z.mtm_max::float,
           z.orneklem, z.varyasyon_yuzde::float, z.guven_seviyesi,
           mt.ad AS makine
    FROM ref_operasyon_zamani z
    JOIN ref_operasyon o ON o.id = z.operasyon_id
    LEFT JOIN ref_ek_parca_varyant v ON v.id = z.ek_parca_varyant_id
    LEFT JOIN ref_makine_tipi mt ON mt.id = o.makine_tipi_id
    WHERE z.urun_tipi_id = ${Number(urunTipiId)}
      AND z.operasyon_grup_id = ${Number(grupId)}
      AND ${guven ? sql`z.guven_seviyesi = ${guven}` : sql`TRUE`}
    ORDER BY z.mtm DESC
    LIMIT 500`
  return NextResponse.json({ satirlar })
})
