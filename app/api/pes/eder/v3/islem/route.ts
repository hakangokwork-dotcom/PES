import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const body = await req.json()
  const { id, ana_grup, islem_adi, makine_tipi, mtm_sn, cevrim_sn, kisi_sayisi, sira_no, aktif, notlar } = body
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })

  const [row] = await sql`
    UPDATE eder_model_islem SET
      ana_grup    = COALESCE(${ana_grup ?? null},    ana_grup),
      islem_adi   = COALESCE(${islem_adi ?? null},   islem_adi),
      makine_tipi = COALESCE(${makine_tipi ?? null}, makine_tipi),
      mtm_sn      = COALESCE(${mtm_sn ?? null},      mtm_sn),
      cevrim_sn   = COALESCE(${cevrim_sn ?? null},   cevrim_sn),
      kisi_sayisi = COALESCE(${kisi_sayisi ?? null}, kisi_sayisi),
      sira_no     = COALESCE(${sira_no ?? null},     sira_no),
      aktif       = COALESCE(${aktif ?? null},       aktif),
      notlar      = COALESCE(${notlar ?? null},      notlar)
    WHERE id = ${Number(id)}
    RETURNING *
  `
  return NextResponse.json({ islem: row })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  await sql`DELETE FROM eder_model_islem WHERE id = ${Number(id)}`
  return NextResponse.json({ ok: true })
})
