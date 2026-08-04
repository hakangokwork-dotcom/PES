import { NextResponse } from 'next/server'
import * as xlsx from 'xlsx'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { atolyeProfilSatirlari, excelSatirlari } from '@/lib/pes/atolye-profil'

/**
 * GET /api/pes/atolye-profil            -> JSON
 * GET /api/pes/atolye-profil?format=xlsx -> Excel indirir
 * &arsiv=1 pasif atölyeleri de katar
 *
 * Ekran ve Excel aynı sorguyu (lib/pes/atolye-profil.ts) kullanır.
 */
export const GET = withTenantRoute(async (req, { sql }) => {
  const url = new URL(req.url)
  const arsivDahil = url.searchParams.get('arsiv') === '1'
  const satirlar = await atolyeProfilSatirlari(sql, { arsivDahil })

  if (url.searchParams.get('format') !== 'xlsx') {
    return NextResponse.json({ satirlar })
  }

  const ws = xlsx.utils.json_to_sheet(excelSatirlari(satirlar))
  ws['!cols'] = [
    { wch: 9 }, { wch: 30 }, { wch: 14 }, { wch: 9 }, { wch: 12 },
    { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 13 }, { wch: 12 },
    { wch: 14 }, { wch: 9 }, { wch: 13 }, { wch: 6 }, { wch: 14 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 17 }, { wch: 13 }, { wch: 15 },
    { wch: 14 }, { wch: 12 },
  ]
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'Atolye Profil')
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const bugun = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="atolye-profil-${bugun}.xlsx"`,
    },
  })
})
