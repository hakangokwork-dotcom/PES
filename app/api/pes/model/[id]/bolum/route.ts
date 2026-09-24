import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Bir operasyonun bölümünü elle ezer. bolum_kaynak='elle' olur ve kural
 * yeniden uygulandığında KORUNUR — kullanıcının kararı kuralı yener.
 */
export const PATCH = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const opId = Number(b.operasyon_id)
  const bolum = String(b.bolum ?? '')
  if (!Number.isInteger(opId) || !['KESIM', 'DIKIM', 'UKP'].includes(bolum)) {
    return NextResponse.json({ error: 'operasyon_id ve bolum (KESIM|DIKIM|UKP) zorunlu' }, { status: 400 })
  }
  const [row] = await sql`
    UPDATE model_bulten_operasyon
       SET bolum = ${bolum}, bolum_kaynak = 'elle'
     WHERE id = ${opId}
    RETURNING id, bolum, bolum_kaynak`
  if (!row) return NextResponse.json({ error: 'Operasyon bulunamadı' }, { status: 404 })
  return NextResponse.json({ operasyon: row })
})
