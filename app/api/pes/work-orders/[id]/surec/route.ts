// app/api/pes/work-orders/[id]/surec/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute, idOku, gecersizKimlik } from '@/app/api/_lib/with-tenant'

/** GET → { durum: v_is_emri_surec satırı, sartnameler: modelin şartnameleri (geçersizler hariç) } */
export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const wo = idOku(params.id)
  if (wo === null) return gecersizKimlik()
  const [durum] = await sql`SELECT * FROM v_is_emri_surec WHERE work_order_id = ${wo}`
  if (!durum) return NextResponse.json({ error: 'İş emri bulunamadı' }, { status: 404 })
  const sartnameler = durum.model_bulten_id ? await sql`
    SELECT s.id, s.kumas_kategorisi, s.asama, s.revizyon, s.durum, s.onaylayan, s.onay_tarihi::text,
           (SELECT count(*)::int FROM olcu_noktasi n WHERE n.sartname_id = s.id) AS nokta_sayisi
      FROM olcu_sartname s
     WHERE s.model_bulten_id = ${durum.model_bulten_id} AND s.durum <> 'Geçersiz'
     ORDER BY s.asama, s.kumas_kategorisi, s.revizyon DESC` : []
  return NextResponse.json({ durum, sartnameler })
})
