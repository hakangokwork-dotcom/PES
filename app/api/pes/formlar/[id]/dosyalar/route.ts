import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import { DOSYA_KOVASI, dosyaHatasi, dosyaYolu } from '@/lib/pes/form-dosya'

/* 060: form ekleri. Yetki RLS'li satırdan gelir: form/dosya satırı bu
   bağlantıda görünmüyorsa depoya hiç gidilmez. Depo erişimi service role. */

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const dosyalar = await sql`
    SELECT id, yol, ad, tur, boyut, aciklama, giren_taraf, giren_eposta, girildi_at
      FROM uretim_formu_dosya WHERE form_id = ${Number(params.id)} ORDER BY id`
  if (dosyalar.length === 0) return NextResponse.json({ dosyalar: [] })
  const { data, error } = await createAdminClient().storage.from(DOSYA_KOVASI)
    .createSignedUrls(dosyalar.map(d => d.yol as string), 3600)
  if (error) throw error
  const url = new Map(data.map(d => [d.path, d.signedUrl]))
  return NextResponse.json({ dosyalar: dosyalar.map(({ yol, ...d }) => ({ ...d, url: url.get(yol) ?? null })) })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const formId = Number(params.id)
  const [form] = await sql`SELECT tenant_id, workshop_id FROM uretim_formu WHERE id = ${formId}`
  if (!form) return NextResponse.json({ error: 'Form bulunamadı' }, { status: 404 })

  const fd = await req.formData()
  const dosya = fd.get('dosya')
  if (!(dosya instanceof File)) return NextResponse.json({ error: 'Dosya seçilmedi' }, { status: 400 })
  const hata = dosyaHatasi(dosya.type, dosya.size)
  if (hata) return NextResponse.json({ error: hata }, { status: 400 })

  const yol = dosyaYolu(form.tenant_id, form.workshop_id, formId, randomUUID(), dosya.type)
  const depo = createAdminClient().storage.from(DOSYA_KOVASI)
  const { error } = await depo.upload(yol, dosya, { contentType: dosya.type })
  if (error) throw error
  try {
    const [kayit] = await sql`
      INSERT INTO uretim_formu_dosya (tenant_id, form_id, workshop_id, yol, ad, tur, boyut, aciklama)
      VALUES (${form.tenant_id}, ${formId}, ${form.workshop_id}, ${yol}, ${dosya.name.slice(0, 200) || 'dosya'},
              ${dosya.type}, ${dosya.size}, ${String(fd.get('aciklama') ?? '').slice(0, 500) || null})
      RETURNING id`
    return NextResponse.json({ id: kayit.id })
  } catch (e) {
    await depo.remove([yol]) // satır yazılamadıysa sahipsiz dosya kalmasın
    throw e
  }
})

export const DELETE = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const dosyaId = Number(req.nextUrl.searchParams.get('dosya'))
  const [d] = await sql`
    DELETE FROM uretim_formu_dosya WHERE id = ${dosyaId} AND form_id = ${Number(params.id)} RETURNING yol`
  if (!d) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 })
  const { error } = await createAdminClient().storage.from(DOSYA_KOVASI).remove([d.yol])
  if (error) throw error // satır silinmesi de geri alınır (aynı işlem)
  return NextResponse.json({ ok: true })
})
