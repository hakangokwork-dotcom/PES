import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = parseInt(params.id)
  const all = new URL(req.url).searchParams.get('all') === '1'

  const rows = all
    ? await sql`
        SELECT * FROM workshop_customer_share
        WHERE workshop_id = ${id}
        ORDER BY valid_from DESC, customer_label
      `
    : await sql`
        SELECT * FROM workshop_customer_share
        WHERE workshop_id = ${id} AND valid_to IS NULL
        ORDER BY share_pct DESC NULLS LAST, customer_label
      `
  return NextResponse.json({ shares: rows })
})

/**
 * SCD-2 yazma: aynı müşteri için açık dönem varsa dünden kapatılır,
 * yeni satır bugünden açılır. Geçmiş silinmez.
 */
export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const id = parseInt(params.id)
  const body = await req.json()

  const label = body.customer_label?.trim()
  if (!label) {
    return NextResponse.json({ error: 'Müşteri etiketi zorunlu' }, { status: 400 })
  }
  const pct = body.share_pct === null || body.share_pct === undefined ? null : Number(body.share_pct)
  if (pct !== null && (Number.isNaN(pct) || pct < 0 || pct > 100)) {
    return NextResponse.json({ error: 'Pay yüzdesi 0-100 aralığında olmalı' }, { status: 400 })
  }

  const validFrom = body.valid_from ?? new Date().toISOString().slice(0, 10)

  // Açık dönemi kapat. valid_to >= valid_from CHECK'ini ihlal etmemek için
  // kapanış tarihi, satırın kendi valid_from'undan küçük olamaz.
  await sql`
    UPDATE workshop_customer_share
    SET valid_to = GREATEST(${validFrom}::date - 1, valid_from)
    WHERE workshop_id = ${id} AND customer_label = ${label} AND valid_to IS NULL
  `

  const rows = await sql`
    INSERT INTO workshop_customer_share
      (workshop_id, tenant_id, customer_label, share_pct, valid_from)
    VALUES (${id}, ${tenant.tenantId}, ${label}, ${pct}, ${validFrom})
    RETURNING *
  `
  return NextResponse.json({ share: rows[0] }, { status: 201 })
})
