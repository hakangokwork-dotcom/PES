import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { formTanimi, formVerisiniSuz } from '@/lib/pes/formlar'
import { poDogrula } from './po-dogrula'

/* 059: üretim formları. Atölye kullanıcısını RLS kendi atölyesine kısıtlar. */

export const GET = withTenantRoute(async (req, { sql }) => {
  const q = req.nextUrl.searchParams
  const wid = Number(q.get('workshop_id')) || null
  const wo = Number(q.get('work_order_id')) || null
  const kod = q.get('form_kodu') || null
  const formlar = await sql`
    SELECT f.id, f.workshop_id, f.work_order_id, f.form_kodu, f.tarih, f.created_at,
           f.giren_taraf, f.giren_eposta, f.girildi_at,
           w.name AS workshop_name, wo.siparis_no, wo.is_emri_no, wo.model_adi, wo.musteri,
           (SELECT count(*)::int FROM uretim_formu_dosya d WHERE d.form_id = f.id) AS ek_sayisi
      FROM uretim_formu f
      JOIN workshop w ON w.id = f.workshop_id
      LEFT JOIN work_order wo ON wo.id = f.work_order_id
     WHERE (${wid}::int IS NULL OR f.workshop_id = ${wid})
       AND (${wo}::int IS NULL OR f.work_order_id = ${wo})
       AND (${kod}::text IS NULL OR f.form_kodu = ${kod})
     ORDER BY f.tarih DESC, f.id DESC
     LIMIT 300`
  return NextResponse.json({ formlar })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const t = formTanimi(String(body.form_kodu))
  const workshopId = Number(body.workshop_id)
  const workOrderId = body.work_order_id ? Number(body.work_order_id) : null
  if (!t) return NextResponse.json({ error: 'Bilinmeyen form' }, { status: 400 })
  if (!Number.isInteger(workshopId) || workshopId <= 0) return NextResponse.json({ error: 'Atölye seçilmedi' }, { status: 400 })
  const poHata = await poDogrula(sql, workOrderId, workshopId)
  if (poHata) return NextResponse.json({ error: poHata }, { status: 400 })

  const veri = formVerisiniSuz(t, body.veri)
  const [form] = await sql`
    INSERT INTO uretim_formu (tenant_id, workshop_id, work_order_id, form_kodu, tarih, veri)
    VALUES (${tenant.tenantId}, ${workshopId}, ${workOrderId}, ${t.kod},
            COALESCE(${body.tarih || null}::date, CURRENT_DATE), ${sql.json(veri)})
    RETURNING *`
  return NextResponse.json({ form })
})
