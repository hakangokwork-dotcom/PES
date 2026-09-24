import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { donemCoz } from '@/lib/pes/ekonomi-talep'

/**
 * Veri talebi aç / iptal et.
 *
 * Talep İÇ EKİP işidir; RLS (040) atölye kullanıcısının yazmasını zaten
 * engelliyor, burada ayrıca kontrol etmeye gerek yok — tek kaynak politika.
 *
 * Talep SİLİNMEZ, iptal edilir: kimden ne istendiği kaydı kalmalı. Aynı
 * atölye-dönem için tekrar talep açılırsa iptal geri alınır (UNIQUE kısıt
 * yeni satır yazılmasını zaten engelliyor).
 */

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const workshopId = Number(b.workshop_id)
  const d = donemCoz(String(b.donem ?? ''))
  const not = b.note ? String(b.note).slice(0, 500) : null

  if (!Number.isInteger(workshopId) || workshopId <= 0) {
    return NextResponse.json({ error: 'workshop_id zorunlu' }, { status: 400 })
  }
  if (!d) {
    return NextResponse.json({ error: 'donem YYYY-MM biçiminde olmalı' }, { status: 400 })
  }

  const [row] = await sql`
    INSERT INTO economy_data_request
      (tenant_id, workshop_id, year, month, note, requested_at, cancelled_at)
    VALUES (${tenant.tenantId}, ${workshopId}, ${d.yil}, ${d.ay}, ${not}, now(), NULL)
    ON CONFLICT (workshop_id, year, month) DO UPDATE
      SET note = EXCLUDED.note, requested_at = now(), cancelled_at = NULL
    RETURNING id, workshop_id, year, month, note, requested_at
  ` as unknown as Array<Record<string, unknown>>

  return NextResponse.json({ talep: row })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const workshopId = Number(b.workshop_id)
  const d = donemCoz(String(b.donem ?? ''))

  if (!Number.isInteger(workshopId) || !d) {
    return NextResponse.json({ error: 'workshop_id ve donem zorunlu' }, { status: 400 })
  }

  const [row] = await sql`
    UPDATE economy_data_request SET cancelled_at = now()
     WHERE workshop_id = ${workshopId} AND year = ${d.yil} AND month = ${d.ay}
       AND cancelled_at IS NULL
    RETURNING id
  ` as unknown as Array<{ id: number }>

  if (!row) return NextResponse.json({ error: 'Açık talep bulunamadı' }, { status: 404 })
  return NextResponse.json({ iptal: row.id })
})
