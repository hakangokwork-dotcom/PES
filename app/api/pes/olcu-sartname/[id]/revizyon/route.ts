// app/api/pes/olcu-sartname/[id]/revizyon/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute, idOku, gecersizKimlik } from '@/app/api/_lib/with-tenant'

/** POST → kaynak şartnamenin noktaları ve değerleriyle yeni 'Önerilen' revizyon. { id } döner. */
export const POST = withTenantRoute<{ id: string }>(async (_req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) {
    return NextResponse.json({ error: 'Ölçü şartnamesini yalnız merkez yönetir' }, { status: 403 })
  }
  const kaynak = idOku(params.id)
  if (kaynak === null) return gecersizKimlik()
  const [s] = await sql`SELECT model_bulten_id, kumas_kategorisi, asama FROM olcu_sartname WHERE id = ${kaynak}`
  if (!s) return NextResponse.json({ error: 'Şartname bulunamadı' }, { status: 404 })

  const [yeni] = await sql`
    INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama, revizyon, notlar)
    SELECT ${tenant.tenantId}, ${s.model_bulten_id}, ${s.kumas_kategorisi}, ${s.asama},
           max(revizyon) + 1, ${`Rev. kaynağı: #${kaynak}`}
      FROM olcu_sartname
     WHERE model_bulten_id = ${s.model_bulten_id} AND kumas_kategorisi = ${s.kumas_kategorisi} AND asama = ${s.asama}
    RETURNING id`
  const noktalar = await sql`
    SELECT id, kod, ad, musteri_adi, yontem, kritik, sira FROM olcu_noktasi WHERE sartname_id = ${kaynak} ORDER BY sira, id`
  for (const n of noktalar) {
    const [nk] = await sql`
      INSERT INTO olcu_noktasi (tenant_id, sartname_id, kod, ad, musteri_adi, yontem, kritik, sira)
      VALUES (${tenant.tenantId}, ${yeni.id}, ${n.kod}, ${n.ad}, ${n.musteri_adi}, ${n.yontem}, ${n.kritik}, ${n.sira})
      RETURNING id`
    await sql`
      INSERT INTO olcu_degeri (tenant_id, nokta_id, beden, nominal, tol_eksi, tol_arti)
      SELECT tenant_id, ${nk.id}, beden, nominal, tol_eksi, tol_arti FROM olcu_degeri WHERE nokta_id = ${n.id}`
  }
  return NextResponse.json({ id: yeni.id })
})
