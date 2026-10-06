import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/** Tahmin başlığı oluştur / güncelle / onayla. */

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const yil = Number(b.yil)
  const departman = String(b.departman ?? '').trim()
  const ad = String(b.ad ?? '').trim()
  if (!Number.isInteger(yil) || yil < 2020 || yil > 2100) {
    return NextResponse.json({ error: 'yil geçersiz' }, { status: 400 })
  }
  if (!departman || !ad) {
    return NextResponse.json({ error: 'departman ve ad zorunlu' }, { status: 400 })
  }
  const [row] = await sql`
    INSERT INTO talep_tahmini (tenant_id, yil, departman, ad, kumas, aciklama)
    VALUES (${tenant.tenantId}, ${yil}, ${departman.slice(0, 120)}, ${ad.slice(0, 120)},
            ${b.kumas ? String(b.kumas).slice(0, 120) : null},
            ${b.aciklama ? String(b.aciklama).slice(0, 500) : null})
    RETURNING id
  ` as unknown as Array<{ id: number }>
  return NextResponse.json({ id: row.id })
})

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const id = Number(b.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  const durum = b.durum === undefined ? null : String(b.durum)
  if (durum !== null && !['Taslak', 'Onayli'].includes(durum)) {
    return NextResponse.json({ error: "durum 'Taslak' ya da 'Onayli' olmalı" }, { status: 400 })
  }
  const metin = (v: unknown, n: number) => (v === undefined ? null : String(v).trim().slice(0, n))
  const [row] = await sql`
    UPDATE talep_tahmini SET
      departman  = coalesce(nullif(${metin(b.departman, 120)}::text, ''), departman),
      ad         = coalesce(nullif(${metin(b.ad, 120)}::text, ''), ad),
      kumas      = CASE WHEN ${b.kumas !== undefined} THEN ${metin(b.kumas, 120)} ELSE kumas END,
      durum      = coalesce(${durum}::text, durum),
      updated_at = now()
    WHERE id = ${id}
    RETURNING id
  ` as unknown as Array<{ id: number }>
  if (!row) return NextResponse.json({ error: 'Tahmin bulunamadı' }, { status: 404 })
  return NextResponse.json({ id: row.id })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  const bagli = await sql`
    SELECT count(*)::int AS n FROM work_order w
      JOIN talep_tahmini_kalem k ON k.id = w.tahmin_kalem_id
     WHERE k.tahmin_id = ${id}` as unknown as Array<{ n: number }>
  if (bagli[0].n > 0) {
    return NextResponse.json({ error: 'Bu tahmine bağlı sipariş var; önce bağları çözün' }, { status: 409 })
  }
  await sql`DELETE FROM talep_tahmini WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
