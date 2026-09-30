import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { referansSureci, type RefOperasyon, type RefParca } from '@/lib/pes/vsim-referans'

/* VSIM · referanstan başlat.
   ?urun_tipi_id yoksa: referans modeli olan ürün tipleri (katalog; her oturum okur).
   Varsa: o ürün tipinin tipik modeli VSIM akışı olarak (mainOps/subOps + özet). */
export const GET = withTenantRoute(async (req, { sql }) => {
  const raw = req.nextUrl.searchParams.get('urun_tipi_id')
  if (!raw) {
    const tipler = await sql`
      SELECT ut.id, ut.klasman_ad, ut.urun_grubu, ut.segment, count(p.id)::int AS parca
      FROM ref_urun_tipi ut JOIN ref_parca_sure p ON p.urun_tipi_id = ut.id
      WHERE ut.aktif IS NOT FALSE
      GROUP BY ut.id ORDER BY ut.klasman_ad`
    return NextResponse.json({ tipler })
  }
  const id = Number(raw)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz ürün tipi' }, { status: 400 })
  const esik = Math.min(1, Math.max(0.1, Number(req.nextUrl.searchParams.get('esik')) || 0.5))

  const [tip] = await sql`SELECT id, klasman_ad, urun_grubu FROM ref_urun_tipi WHERE id = ${id}`
  if (!tip) return NextResponse.json({ error: 'Ürün tipi bulunamadı' }, { status: 404 })

  const parcalar = await sql`
    SELECT bolge, ek_parca_ad AS "ekParca", ek_parca_varyant_id AS "varyantId",
           gorulme, sn_medyan::float AS "snMedyan"
    FROM ref_parca_sure WHERE urun_tipi_id = ${id}` as unknown as RefParca[]
  const varyantlar = [...new Set(parcalar.map(p => p.varyantId).filter((v): v is number => v != null))]
  const operasyonlar = varyantlar.length
    ? await sql`
        SELECT z.ek_parca_varyant_id AS "varyantId", o.ad, m.ad AS makine, z.mtm::float AS mtm, z.id AS sira
        FROM ref_operasyon_zamani z
        JOIN ref_operasyon o ON o.id = z.operasyon_id
        LEFT JOIN ref_makine_tipi m ON m.id = o.makine_tipi_id
        WHERE z.urun_tipi_id = ${id} AND z.ek_parca_varyant_id = ANY(${varyantlar})` as unknown as RefOperasyon[]
    : []

  const surec = referansSureci(parcalar, operasyonlar, { esik })
  return NextResponse.json({ urunTipi: tip, esik, ...surec })
})
