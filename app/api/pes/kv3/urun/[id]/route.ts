import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const urunId = Number(params.id)
  if (!urunId) return NextResponse.json({ error: 'Geçersiz id' }, { status: 400 })

  const [urun] = await sql`SELECT * FROM kv3_urun WHERE id = ${urunId}`
  if (!urun) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 })

  const islemler = await sql`
    SELECT id, parca, grup, islem_adi, mtm_sn, min_sn, max_sn, orneklem, guven
    FROM kv3_urun_islem
    WHERE urun_id = ${urunId}
    ORDER BY parca, grup NULLS FIRST, islem_adi
  `

  const parcaOzet = await sql`
    SELECT parca,
           COUNT(*) AS islem_sayisi,
           COALESCE(SUM(mtm_sn), 0)::numeric(10,2) AS toplam_sure_sn
    FROM kv3_urun_islem
    WHERE urun_id = ${urunId}
    GROUP BY parca
    ORDER BY parca
  `

  return NextResponse.json({ urun, parcalar: parcaOzet, islemler })
})
