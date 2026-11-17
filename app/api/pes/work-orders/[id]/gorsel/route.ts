// app/api/pes/work-orders/[id]/gorsel/route.ts
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import { DOSYA_KOVASI, dosyaHatasi, surecYolu } from '@/lib/pes/form-dosya'

/* 062: süreç fotoğrafları. 060 form ekleriyle aynı kova ve kural: yetki RLS'li
   satırdan gelir (iş emri / görsel satırı görünmüyorsa depoya gidilmez),
   depo erişimi service role, görüntüleme 1 saatlik imzalı bağlantı.
     GET    ?adim=KUMAS[&kayit=ID]
     POST   formData: dosya, adim, kayit?, aciklama?
     DELETE ?gorsel=ID */
const ADIMLAR = new Set(['KUMAS', 'CEKME', 'PASTAL', 'KONTROL', 'SEVK', 'YIKAMA', 'DONUS', 'FINAL'])

export const GET = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const adim = req.nextUrl.searchParams.get('adim') ?? ''
  const kayit = req.nextUrl.searchParams.get('kayit')
  const gorseller = await sql`
    SELECT id, yol, ad, tur, boyut, aciklama, kayit_id, giren_taraf, giren_eposta, girildi_at
      FROM surec_gorsel
     WHERE work_order_id = ${Number(params.id)} AND adim = ${adim}
       ${kayit ? sql`AND kayit_id = ${Number(kayit)}` : sql``}
     ORDER BY id`
  if (gorseller.length === 0) return NextResponse.json({ gorseller: [] })
  const { data, error } = await createAdminClient().storage.from(DOSYA_KOVASI)
    .createSignedUrls(gorseller.map(g => g.yol as string), 3600)
  if (error) throw error
  const url = new Map(data.map(d => [d.path, d.signedUrl]))
  return NextResponse.json({ gorseller: gorseller.map(({ yol, ...g }) => ({ ...g, url: url.get(yol) ?? null })) })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const wo = Number(params.id)
  const [w] = await sql`SELECT tenant_id, workshop_id FROM work_order WHERE id = ${wo}`
  if (!w) return NextResponse.json({ error: 'İş emri bulunamadı' }, { status: 404 })

  const fd = await req.formData()
  const adim = String(fd.get('adim') ?? '')
  if (!ADIMLAR.has(adim)) return NextResponse.json({ error: 'Geçersiz adım' }, { status: 400 })
  const dosya = fd.get('dosya')
  if (!(dosya instanceof File)) return NextResponse.json({ error: 'Dosya seçilmedi' }, { status: 400 })
  const hata = dosyaHatasi(dosya.type, dosya.size)
  if (hata) return NextResponse.json({ error: hata }, { status: 400 })
  const kayitHam = fd.get('kayit')
  const kayit = kayitHam ? Number(kayitHam) : null
  if (kayit !== null && !Number.isInteger(kayit)) return NextResponse.json({ error: 'Geçersiz kayıt' }, { status: 400 })

  const yol = surecYolu(w.tenant_id, wo, adim, randomUUID(), dosya.type)
  const depo = createAdminClient().storage.from(DOSYA_KOVASI)
  const { error } = await depo.upload(yol, dosya, { contentType: dosya.type })
  if (error) throw error
  try {
    const [g] = await sql`
      INSERT INTO surec_gorsel (tenant_id, work_order_id, workshop_id, adim, kayit_id, yol, ad, tur, boyut, aciklama)
      VALUES (${w.tenant_id}, ${wo}, ${w.workshop_id}, ${adim}, ${kayit}, ${yol},
              ${dosya.name.slice(0, 200) || 'foto'}, ${dosya.type}, ${dosya.size},
              ${String(fd.get('aciklama') ?? '').slice(0, 500) || null})
      RETURNING id`
    return NextResponse.json({ id: g.id })
  } catch (e) {
    await depo.remove([yol]) // satır yazılamadıysa sahipsiz dosya kalmasın
    throw e
  }
})

export const DELETE = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = Number(req.nextUrl.searchParams.get('gorsel'))
  const [g] = await sql`
    DELETE FROM surec_gorsel WHERE id = ${id} AND work_order_id = ${Number(params.id)} RETURNING yol`
  if (!g) return NextResponse.json({ error: 'Fotoğraf bulunamadı' }, { status: 404 })
  const { error } = await createAdminClient().storage.from(DOSYA_KOVASI).remove([g.yol])
  if (error) throw error // satır silinmesi de geri alınır (aynı işlem)
  return NextResponse.json({ ok: true })
})
