import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { disariCikanAsamalar } from '@/lib/pes/atolye-yetenek'

/**
 * GET /api/pes/workshops/12/yetenek?asamalar=KESIM,DIKIM,UKP
 *   → { uretimTipi, disariCikanlar: ['UKP'] }
 *
 * Sihirbazın "hangi aşamalar dışarı çıkmalı" adımı bunu kullanır.
 * Üretim tipi bilinmiyorsa disariCikanlar BOŞ döner — emin olmadan
 * kullanıcıyı dış atölye seçmeye zorlamayız (bkz. lib/pes/atolye-yetenek.ts).
 */
export const GET = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const wid = parseInt(params.id)
  if (!Number.isInteger(wid)) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })

  const asamalar = (new URL(req.url).searchParams.get('asamalar') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)

  const [p] = await sql`SELECT uretim_tipi FROM workshop_profil WHERE workshop_id = ${wid}`
  const uretimTipi = (p?.uretim_tipi as string | null) ?? null

  return NextResponse.json({
    uretimTipi,
    disariCikanlar: disariCikanAsamalar(uretimTipi, asamalar),
  })
})
