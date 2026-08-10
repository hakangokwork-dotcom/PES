import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { revizyonlar, type Revizyon } from '@/lib/pes/olgunluk'

/**
 * Bir katalog satırının düzenleme geçmişi (032).
 *
 *   GET /api/pes/olgunluk/revizyon?tur=kriter&id=88
 *
 * Panelde canlı yazım yapılırken "az önce ne yazıyordu" sorusunun cevabı.
 * Geçmiş SALT OKUNUR: geri alma, eski metni forma doldurup kullanıcının
 * kaydetmesiyle olur — sessiz bir geri yazma, araya giren başka bir
 * düzenlemeyi habersiz ezerdi.
 */

const TURLER = new Set<Revizyon['tur']>(['kategori', 'surec', 'kriter'])

export const GET = withTenantRoute(async (req, { sql }) => {
  const url = new URL(req.url)
  const tur = String(url.searchParams.get('tur') ?? '') as Revizyon['tur']
  const id = parseInt(url.searchParams.get('id') ?? '')

  if (!TURLER.has(tur) || !Number.isInteger(id)) {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }
  return NextResponse.json({ revizyonlar: await revizyonlar(sql, tur, id) })
})
