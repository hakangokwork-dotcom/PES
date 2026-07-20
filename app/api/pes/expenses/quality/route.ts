import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import {
  scoreDeclaration,
  resolveParams,
  RULE_VERSION,
  type ExpenseDeclaration,
  type CrossCheckContext,
} from '@/lib/pes/validation-rules'

/** GET /api/pes/expenses/quality?donem=2026-01 — mevcut skorları oku */
export const GET = withTenantRoute(async (req, { sql }) => {
  const donem = new URL(req.url).searchParams.get('donem')

  const rows = donem
    ? await sql`
        SELECT dq.*, w.code AS workshop_code, w.name AS workshop_name
        FROM declaration_quality dq
        LEFT JOIN workshop w ON w.id = dq.workshop_id
        WHERE dq.donem = ${donem}
        ORDER BY dq.total_sc ASC NULLS FIRST, w.code
      `
    : await sql`
        SELECT dq.*, w.code AS workshop_code, w.name AS workshop_name
        FROM declaration_quality dq
        LEFT JOIN workshop w ON w.id = dq.workshop_id
        ORDER BY dq.donem DESC, dq.total_sc ASC NULLS FIRST
        LIMIT 500
      `

  return NextResponse.json({ scores: rows })
})

/**
 * POST /api/pes/expenses/quality  {"donem":"2026-01"}  (donem yoksa tümü)
 *
 * Dönemdeki gider beyanlarını skorlar ve declaration_quality'ye yazar.
 * Idempotent: aynı expense_id için tekrar çalıştırılırsa üzerine yazar.
 */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json().catch(() => ({}))
  const donem: string | null = body.donem ?? null

  if (donem && !/^\d{4}-\d{2}$/.test(donem)) {
    return NextResponse.json({ error: 'donem formatı YYYY-MM olmalı' }, { status: 400 })
  }

  // Gider satırları + çapraz kontrol bağlamı tek sorguda
  const rows = await sql`
    SELECT
      me.*,
      w.total_staff, w.sewing_staff, w.line_count,
      EXISTS (
        SELECT 1 FROM monthly_production mp
        WHERE mp.workshop_id = me.workshop_id
          AND mp.year = me.year AND mp.month = me.month
      ) AS has_production
    FROM monthly_expense me
    JOIN workshop w ON w.id = me.workshop_id
    WHERE ${donem
      ? sql`to_char(make_date(me.year, me.month, 1), 'YYYY-MM') = ${donem}`
      : sql`true`}
  ` as Array<Record<string, unknown>>

  if (rows.length === 0) {
    return NextResponse.json({ scored: 0, message: 'Skorlanacak beyan bulunamadı.' })
  }

  const paramRows = await sql`
    SELECT param_key, donem_from, value_num, tenant_id FROM validation_param
  ` as Array<{ param_key: string; donem_from: string; value_num: string | null; tenant_id: string | null }>

  const results: Array<{ workshop_id: number; donem: string; total_sc: number; status: string }> = []

  for (const row of rows) {
    const year = Number(row.year)
    const month = Number(row.month)
    const rowDonem = `${year}-${String(month).padStart(2, '0')}`
    const params = resolveParams(paramRows, rowDonem)

    const ctx: CrossCheckContext = {
      total_staff: row.total_staff as number | null,
      sewing_staff: row.sewing_staff as number | null,
      line_count: row.line_count as number | null,
      has_production: Boolean(row.has_production),
    }

    const score = scoreDeclaration(row as unknown as ExpenseDeclaration, ctx, params)

    await sql`
      INSERT INTO declaration_quality (
        tenant_id, expense_id, workshop_id, donem,
        completeness_sc, consistency_sc, plausibility_sc, crosscheck_sc, total_sc,
        flags, status, rule_version, computed_at
      ) VALUES (
        ${tenant.tenantId}, ${row.id as number}, ${row.workshop_id as number}, ${rowDonem},
        ${score.completeness_sc}, ${score.consistency_sc}, ${score.plausibility_sc},
        ${score.crosscheck_sc}, ${score.total_sc},
        ${sql.json(score.flags)}, ${score.status}, ${score.rule_version}, NOW()
      )
      ON CONFLICT (expense_id) DO UPDATE SET
        completeness_sc = EXCLUDED.completeness_sc,
        consistency_sc  = EXCLUDED.consistency_sc,
        plausibility_sc = EXCLUDED.plausibility_sc,
        crosscheck_sc   = EXCLUDED.crosscheck_sc,
        total_sc        = EXCLUDED.total_sc,
        flags           = EXCLUDED.flags,
        status          = EXCLUDED.status,
        rule_version    = EXCLUDED.rule_version,
        computed_at     = NOW()
    `

    results.push({
      workshop_id: row.workshop_id as number,
      donem: rowDonem,
      total_sc: score.total_sc,
      status: score.status,
    })
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    scored: results.length,
    rule_version: RULE_VERSION,
    summary,
    results,
  })
})
