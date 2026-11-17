import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { formTanimi, formVerisiniSuz } from '@/lib/pes/formlar'
import { poDogrula } from '../po-dogrula'
import { createAdminClient } from '@/lib/supabase/admin'
import { DOSYA_KOVASI } from '@/lib/pes/form-dosya'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const [form] = await sql`
    SELECT f.*, w.name AS workshop_name, wo.siparis_no, wo.is_emri_no, wo.model_adi, wo.musteri
      FROM uretim_formu f
      JOIN workshop w ON w.id = f.workshop_id
      LEFT JOIN work_order wo ON wo.id = f.work_order_id
     WHERE f.id = ${Number(params.id)}`
  if (!form) return NextResponse.json({ error: 'Form bulunamadı' }, { status: 404 })
  return NextResponse.json({ form })
})

/* Ortak kayıt (055): istemci x-kayit-surum gönderir; araya giren değişiklik 409. */
export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = Number(params.id)
  const body = await req.json()
  const [mevcut] = await sql`SELECT workshop_id, form_kodu FROM uretim_formu WHERE id = ${id}`
  if (!mevcut) return NextResponse.json({ error: 'Form bulunamadı' }, { status: 404 })
  const t = formTanimi(mevcut.form_kodu)
  if (!t) return NextResponse.json({ error: 'Bilinmeyen form' }, { status: 400 })
  const workOrderId = body.work_order_id ? Number(body.work_order_id) : null
  const poHata = await poDogrula(sql, workOrderId, mevcut.workshop_id)
  if (poHata) return NextResponse.json({ error: poHata }, { status: 400 })

  const [form] = await sql`
    UPDATE uretim_formu SET
      work_order_id = ${workOrderId},
      tarih = COALESCE(${body.tarih || null}::date, tarih),
      veri = ${sql.json(formVerisiniSuz(t, body.veri))}
    WHERE id = ${id} RETURNING *`
  return NextResponse.json({ form })
})

/* Ekler satırla birlikte (cascade) silinir; depodaki dosyaları da sil.
   Depo hatası işlemi geri alır — form, dosyası kaybolmuş hâlde kalmaz. */
export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  const ekler = await sql`SELECT yol FROM uretim_formu_dosya WHERE form_id = ${id}`
  await sql`DELETE FROM uretim_formu WHERE id = ${id}`
  if (ekler.length) {
    const { error } = await createAdminClient().storage.from(DOSYA_KOVASI).remove(ekler.map(e => e.yol as string))
    if (error) throw error
  }
  return NextResponse.json({ ok: true })
})
