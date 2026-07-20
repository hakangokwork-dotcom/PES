import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute(async (req, { sql }) => {
  const kumas = req.nextUrl.searchParams.get('kumas')

  const rows = kumas
    ? await sql`
        SELECT id, kumas, urun, ozellik, parca_sayisi, islem_sayisi
        FROM kv3_urun
        WHERE kumas = ${kumas}
        ORDER BY urun, COALESCE(ozellik, '')
      `
    : await sql`
        SELECT id, kumas, urun, ozellik, parca_sayisi, islem_sayisi
        FROM kv3_urun
        ORDER BY kumas, urun, COALESCE(ozellik, '')
      `

  const kumasList = await sql`SELECT DISTINCT kumas FROM kv3_urun ORDER BY kumas`

  return NextResponse.json({ urunler: rows, kumaslar: kumasList.map(r => r.kumas) })
})
