import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/** GET /api/pes/index — seriler, değerler ve grup eşleştirmesi */
export const GET = withTenantRoute(async (_req, { sql }) => {
  const [series, values, map] = await Promise.all([
    sql`SELECT code, label, kind, unit, description FROM index_series ORDER BY sort_order, code`,
    sql`
      SELECT id, series_code, donem, value, source, note, tenant_id
      FROM price_index
      ORDER BY series_code, donem DESC
    `,
    sql`
      SELECT m.group_code, m.series_code, m.rationale, s.label AS series_label
      FROM expense_group_index_map m
      JOIN index_series s ON s.code = m.series_code
      ORDER BY m.group_code
    `,
  ])
  return NextResponse.json({ series, values, map })
})

/** POST /api/pes/index — endeks değeri ekle/güncelle */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()

  const seriesCode = String(body.series_code ?? '').trim()
  const donem = String(body.donem ?? '').trim()
  const value = Number(body.value)

  if (!seriesCode) return NextResponse.json({ error: 'series_code zorunlu' }, { status: 400 })
  if (!/^\d{4}-\d{2}$/.test(donem)) {
    return NextResponse.json({ error: 'donem formatı YYYY-MM olmalı' }, { status: 400 })
  }
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: 'value pozitif bir sayı olmalı' }, { status: 400 })
  }

  const exists = await sql`SELECT code FROM index_series WHERE code = ${seriesCode}`
  if (exists.length === 0) {
    return NextResponse.json({ error: `Bilinmeyen seri: ${seriesCode}` }, { status: 400 })
  }

  const rows = await sql`
    INSERT INTO price_index (tenant_id, series_code, donem, value, source, note)
    VALUES (
      ${tenant.tenantId}, ${seriesCode}, ${donem}, ${value},
      ${body.source ?? 'manuel'}, ${body.note ?? null}
    )
    ON CONFLICT (tenant_id, series_code, donem) DO UPDATE SET
      value = EXCLUDED.value,
      source = EXCLUDED.source,
      note = EXCLUDED.note,
      updated_at = NOW()
    RETURNING *
  `
  return NextResponse.json({ value: rows[0] }, { status: 201 })
})

/** DELETE /api/pes/index?id=123 */
export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  }
  await sql`DELETE FROM price_index WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
