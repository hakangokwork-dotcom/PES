import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Taslak (senaryo) oluştur / yeniden adlandır / kapat.
 *
 * Taslak SİLİNMEZ, kapanır. "B planı"nı silmek, neyin neden denendiği
 * bilgisini de siler; kapatmak listeden düşürür ama kaydı bırakır.
 */

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const ad = String(b.ad ?? '').trim()
  if (!ad) return NextResponse.json({ error: 'ad zorunlu' }, { status: 400 })

  const [row] = await sql`
    INSERT INTO plan_taslak (tenant_id, ad, aciklama, durum)
    VALUES (${tenant.tenantId}, ${ad.slice(0, 120)},
            ${b.aciklama ? String(b.aciklama).slice(0, 500) : null}, 'taslak')
    RETURNING id, ad, aciklama, durum
  ` as unknown as Array<Record<string, unknown>>

  return NextResponse.json({ taslak: row })
})

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const id = Number(b.id)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  }

  const ad = b.ad === undefined ? null : String(b.ad).trim().slice(0, 120)
  const durum = b.durum === undefined ? null : String(b.durum)
  if (durum !== null && !['taslak', 'kapandi'].includes(durum)) {
    return NextResponse.json({ error: "durum 'taslak' ya da 'kapandi' olmalı" }, { status: 400 })
  }
  if (ad !== null && ad === '') {
    return NextResponse.json({ error: 'ad boş olamaz' }, { status: 400 })
  }

  const [row] = await sql`
    UPDATE plan_taslak SET
      ad         = coalesce(${ad}::text, ad),
      durum      = coalesce(${durum}::text, durum),
      updated_at = now()
    WHERE id = ${id}
    RETURNING id, ad, aciklama, durum
  ` as unknown as Array<Record<string, unknown>>

  if (!row) return NextResponse.json({ error: 'Taslak bulunamadı' }, { status: 404 })
  return NextResponse.json({ taslak: row })
})
