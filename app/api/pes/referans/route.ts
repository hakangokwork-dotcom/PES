import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const action = req.nextUrl.searchParams.get('action') || 'urun_tipleri'

  if (action === 'urun_tipleri') {
    const segment = req.nextUrl.searchParams.get('segment')
    const urunGrubu = req.nextUrl.searchParams.get('urun_grubu')
    const search = req.nextUrl.searchParams.get('q')

    let data
    if (search) {
      data = await sql`SELECT * FROM ref_urun_tipi WHERE aktif = true AND klasman_ad ILIKE ${'%' + search + '%'} ORDER BY klasman_ad LIMIT 50`
    } else if (segment && urunGrubu) {
      data = await sql`SELECT * FROM ref_urun_tipi WHERE aktif = true AND segment = ${segment} AND urun_grubu = ${urunGrubu} ORDER BY klasman_ad`
    } else if (segment) {
      data = await sql`SELECT * FROM ref_urun_tipi WHERE aktif = true AND segment = ${segment} ORDER BY klasman_ad`
    } else if (urunGrubu) {
      data = await sql`SELECT * FROM ref_urun_tipi WHERE aktif = true AND urun_grubu = ${urunGrubu} ORDER BY klasman_ad`
    } else {
      data = await sql`SELECT * FROM ref_urun_tipi WHERE aktif = true ORDER BY klasman_ad`
    }
    return NextResponse.json({ urun_tipleri: data })
  }

  if (action === 'filtreler') {
    const segments = await sql`SELECT DISTINCT segment FROM ref_urun_tipi WHERE segment IS NOT NULL ORDER BY segment`
    const urunGruplari = await sql`SELECT DISTINCT urun_grubu FROM ref_urun_tipi WHERE urun_grubu IS NOT NULL ORDER BY urun_grubu`
    const kolTipleri = await sql`SELECT DISTINCT kol_tipi FROM ref_urun_tipi WHERE kol_tipi IS NOT NULL ORDER BY kol_tipi`
    return NextResponse.json({
      segments: segments.map(r => r.segment),
      urun_gruplari: urunGruplari.map(r => r.urun_grubu),
      kol_tipleri: kolTipleri.map(r => r.kol_tipi),
    })
  }

  if (action === 'ek_parcalar') {
    const urunTipiId = req.nextUrl.searchParams.get('urun_tipi_id')
    if (!urunTipiId) return NextResponse.json({ error: 'urun_tipi_id gerekli' }, { status: 400 })

    const data = await sql`
      SELECT DISTINCT ept.id, ept.ad, COUNT(epv.id)::int as varyant_sayisi
      FROM ref_operasyon_zamani oz
      JOIN ref_ek_parca_varyant epv ON epv.id = oz.ek_parca_varyant_id
      JOIN ref_ek_parca_tipi ept ON ept.id = epv.ek_parca_tipi_id
      WHERE oz.urun_tipi_id = ${Number(urunTipiId)}
      GROUP BY ept.id, ept.ad
      ORDER BY ept.ad
    `
    return NextResponse.json({ ek_parcalar: data })
  }

  if (action === 'varyantlar') {
    const urunTipiId = req.nextUrl.searchParams.get('urun_tipi_id')
    const ekParcaTipiId = req.nextUrl.searchParams.get('ek_parca_tipi_id')
    if (!urunTipiId || !ekParcaTipiId) return NextResponse.json({ error: 'urun_tipi_id ve ek_parca_tipi_id gerekli' }, { status: 400 })

    const data = await sql`
      SELECT DISTINCT epv.id, epv.tam_ad, epv.ozellikler
      FROM ref_operasyon_zamani oz
      JOIN ref_ek_parca_varyant epv ON epv.id = oz.ek_parca_varyant_id
      WHERE oz.urun_tipi_id = ${Number(urunTipiId)} AND epv.ek_parca_tipi_id = ${Number(ekParcaTipiId)}
      ORDER BY epv.tam_ad
    `
    return NextResponse.json({ varyantlar: data })
  }

  if (action === 'operasyonlar') {
    const urunTipiId = req.nextUrl.searchParams.get('urun_tipi_id')
    const varyantIds = req.nextUrl.searchParams.get('varyant_ids')
    if (!urunTipiId) return NextResponse.json({ error: 'urun_tipi_id gerekli' }, { status: 400 })

    let data
    if (varyantIds) {
      const ids = varyantIds.split(',').map(Number)
      data = await sql`
        SELECT oz.id, oz.mtm, oz.mtm_min, oz.mtm_max, oz.guven_seviyesi, oz.orneklem,
               og.ad AS operasyon_grup, op.ad AS operasyon, epv.tam_ad AS ek_parca,
               mt.ad AS makine_tipi
        FROM ref_operasyon_zamani oz
        JOIN ref_operasyon_grup og ON og.id = oz.operasyon_grup_id
        JOIN ref_operasyon op ON op.id = oz.operasyon_id
        JOIN ref_ek_parca_varyant epv ON epv.id = oz.ek_parca_varyant_id
        LEFT JOIN ref_makine_tipi mt ON mt.id = op.makine_tipi_id
        WHERE oz.urun_tipi_id = ${Number(urunTipiId)} AND oz.ek_parca_varyant_id IN ${sql(ids)}
        ORDER BY og.ad, op.ad
      `
    } else {
      data = await sql`
        SELECT oz.id, oz.mtm, oz.mtm_min, oz.mtm_max, oz.guven_seviyesi, oz.orneklem,
               og.ad AS operasyon_grup, op.ad AS operasyon, epv.tam_ad AS ek_parca,
               mt.ad AS makine_tipi
        FROM ref_operasyon_zamani oz
        JOIN ref_operasyon_grup og ON og.id = oz.operasyon_grup_id
        JOIN ref_operasyon op ON op.id = oz.operasyon_id
        JOIN ref_ek_parca_varyant epv ON epv.id = oz.ek_parca_varyant_id
        LEFT JOIN ref_makine_tipi mt ON mt.id = op.makine_tipi_id
        WHERE oz.urun_tipi_id = ${Number(urunTipiId)}
        ORDER BY og.ad, op.ad
      `
    }

    const grouped: Record<string, { grup: string; operasyonlar: Record<string, unknown>[] }> = {}
    for (const row of data) {
      const g = row.operasyon_grup as string
      if (!grouped[g]) grouped[g] = { grup: g, operasyonlar: [] }
      grouped[g].operasyonlar.push(row as Record<string, unknown>)
    }

    const toplamMtm = data.reduce((s, r) => s + Number(r.mtm), 0)
    return NextResponse.json({
      operasyonlar: Object.values(grouped),
      toplam_mtm: Math.round(toplamMtm * 100) / 100,
      toplam_dk: Math.round(toplamMtm / 60 * 100) / 100,
      kayit_sayisi: data.length,
    })
  }

  if (action === 'sablon_ops') {
    const opGruplariParam = req.nextUrl.searchParams.get('op_gruplari')
    const urunTipiId = req.nextUrl.searchParams.get('urun_tipi_id')
    if (!opGruplariParam) return NextResponse.json({ error: 'op_gruplari gerekli' }, { status: 400 })

    const opGrupAdlari = opGruplariParam.split(',').map(s => s.trim()).filter(Boolean)

    let data
    if (urunTipiId) {
      data = await sql`
        SELECT og.ad AS operasyon_grup, op.ad AS operasyon,
               ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY oz.mtm)::numeric, 2) AS mtm,
               CASE WHEN COUNT(*) = 1 THEN MAX(oz.guven_seviyesi) ELSE 'MEDYAN' END AS guven_seviyesi,
               mt.ad AS makine_tipi
        FROM ref_operasyon_zamani oz
        JOIN ref_operasyon_grup og ON og.id = oz.operasyon_grup_id
        JOIN ref_operasyon op ON op.id = oz.operasyon_id
        LEFT JOIN ref_makine_tipi mt ON mt.id = op.makine_tipi_id
        WHERE oz.urun_tipi_id = ${Number(urunTipiId)} AND og.ad = ANY(${opGrupAdlari})
        GROUP BY og.ad, op.ad, mt.ad
        ORDER BY og.ad, op.ad
      `
    } else {
      data = await sql`
        SELECT og.ad AS operasyon_grup, op.ad AS operasyon,
               ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY oz.mtm)::numeric, 2) AS mtm,
               'MEDYAN' AS guven_seviyesi,
               mt.ad AS makine_tipi
        FROM ref_operasyon_zamani oz
        JOIN ref_operasyon_grup og ON og.id = oz.operasyon_grup_id
        JOIN ref_operasyon op ON op.id = oz.operasyon_id
        LEFT JOIN ref_makine_tipi mt ON mt.id = op.makine_tipi_id
        WHERE og.ad = ANY(${opGrupAdlari})
        GROUP BY og.ad, op.ad, mt.ad
        ORDER BY og.ad, op.ad
      `
    }

    const grouped: Record<string, { grup: string; operasyonlar: Record<string, unknown>[] }> = {}
    for (const row of data) {
      const g = row.operasyon_grup as string
      if (!grouped[g]) grouped[g] = { grup: g, operasyonlar: [] }
      grouped[g].operasyonlar.push(row as Record<string, unknown>)
    }

    const toplamMtm = data.reduce((s, r) => s + Number(r.mtm), 0)
    return NextResponse.json({
      operasyonlar: Object.values(grouped),
      toplam_mtm: Math.round(toplamMtm * 100) / 100,
      toplam_dk: Math.round(toplamMtm / 60 * 100) / 100,
      kayit_sayisi: data.length,
    })
  }

  if (action === 'istatistik') {
    const [stats] = await sql`
      SELECT
        (SELECT COUNT(*) FROM ref_urun_tipi WHERE aktif = true)::int AS urun_tipi_sayisi,
        (SELECT COUNT(*) FROM ref_ek_parca_tipi)::int AS ek_parca_sayisi,
        (SELECT COUNT(*) FROM ref_ek_parca_varyant)::int AS varyant_sayisi,
        (SELECT COUNT(*) FROM ref_operasyon_grup)::int AS grup_sayisi,
        (SELECT COUNT(*) FROM ref_operasyon)::int AS operasyon_sayisi,
        (SELECT COUNT(*) FROM ref_operasyon_zamani)::int AS zaman_kaydi_sayisi,
        (SELECT COUNT(*) FROM ref_makine_tipi)::int AS makine_sayisi
    `
    return NextResponse.json({ istatistik: stats })
  }

  return NextResponse.json({ error: 'Gecersiz action' }, { status: 400 })
})
