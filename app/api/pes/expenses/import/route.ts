import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import {
  mapHeaders, parseAmount, coerceForColumn, EXPENSE_LABELS,
  type ExpenseColumn, type HeaderMapping,
} from '@/lib/pes/expense-mapping'
import {
  scoreDeclaration, resolveParams,
  type ExpenseDeclaration, type CrossCheckContext, type QualityScore,
} from '@/lib/pes/validation-rules'

/**
 * POST /api/pes/expenses/import?mode=preview|commit
 *
 * preview: dosyayı ayrıştırır, başlıkları eşler, atölyeleri bulur ve
 *          güven skorunu hesaplar — HİÇBİR ŞEY YAZMAZ.
 * commit:  aynısını yapar, sonra ham satırı staging'e, temizlenmiş
 *          değerleri monthly_expense'e yazar ve skoru kaydeder.
 *
 * xlsx ayrıştırma bilerek sunucuda: paket ~430KB, client'a gitmemeli.
 */

type RowReport = {
  rowIndex: number
  workshop_code: string | null
  workshop_id: number | null
  donem: string | null
  matched: boolean
  problem?: string
  score?: QualityScore
  values?: Partial<Record<ExpenseColumn, number | null>>
}

/** 'YYYY-MM' | Excel tarihi | '01.2026' gibi girdileri YYYY-MM'e çevirir. */
function normalizeDonem(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
  }

  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/)              // 2026-01
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/)                   // 01.2026
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})(\d{2})$/)                          // 202601
  if (m) return `${m[1]}-${m[2]}`
  return null
}

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const mode = new URL(req.url).searchParams.get('mode') ?? 'preview'
  if (mode !== 'preview' && mode !== 'commit') {
    return NextResponse.json({ error: "mode 'preview' veya 'commit' olmalı" }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file gerekli' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  } catch {
    return NextResponse.json({ error: 'Dosya okunamadı — geçerli bir xlsx mi?' }, { status: 400 })
  }

  // "Gider Beyani" sayfasını tercih et, yoksa ilk sayfa
  const sheetName =
    workbook.SheetNames.find((s) => s.toLowerCase().replace(/[^a-z]/g, '').includes('giderbeyani')) ??
    workbook.SheetNames[0]
  const ws = workbook.Sheets[sheetName]
  if (!ws) return NextResponse.json({ error: 'Dosyada sayfa bulunamadı' }, { status: 400 })

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })
  if (rows.length === 0) {
    return NextResponse.json({ error: `"${sheetName}" sayfası boş` }, { status: 400 })
  }

  const headers = Object.keys(rows[0])
  const mapping: HeaderMapping = mapHeaders(headers)

  if (Object.keys(mapping.expense).length === 0) {
    return NextResponse.json({
      error: 'Hiçbir gider kalemi tanınmadı — şablonu kullandığınızdan emin olun.',
      sheet: sheetName, headers, mapping,
    }, { status: 400 })
  }

  const workshops = await sql`
    SELECT id, code, name, total_staff, sewing_staff, line_count FROM workshop
  ` as Array<{ id: number; code: string; name: string; total_staff: number | null; sewing_staff: number | null; line_count: number | null }>

  const byCode = new Map(workshops.map((w) => [w.code.trim().toLowerCase(), w]))
  const byName = new Map(workshops.map((w) => [w.name.trim().toLowerCase(), w]))

  const paramRows = await sql`
    SELECT param_key, donem_from, value_num, tenant_id FROM validation_param
  ` as Array<{ param_key: string; donem_from: string; value_num: string | null; tenant_id: string | null }>

  const reports: RowReport[] = []

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const report: RowReport = { rowIndex: i + 2, workshop_code: null, workshop_id: null, donem: null, matched: false }

    const codeCell = mapping.meta.workshop_code ? raw[mapping.meta.workshop_code] : null
    const nameCell = mapping.meta.workshop_name ? raw[mapping.meta.workshop_name] : null
    const code = codeCell ? String(codeCell).trim() : null
    report.workshop_code = code

    const ws2 =
      (code ? byCode.get(code.toLowerCase()) : undefined) ??
      (nameCell ? byName.get(String(nameCell).trim().toLowerCase()) : undefined)

    const donem = mapping.meta.donem ? normalizeDonem(raw[mapping.meta.donem]) : null
    report.donem = donem

    // Tamamen boş satırları sessizce atla (şablonda kalan artıklar)
    const hasAnyValue = Object.values(mapping.expense).some(
      (h) => h && parseAmount(raw[h]) !== null,
    )
    if (!ws2 && !donem && !hasAnyValue) continue

    if (!ws2) { report.problem = 'Atölye bulunamadı'; reports.push(report); continue }
    if (!donem) { report.problem = 'Dönem okunamadı (YYYY-MM bekleniyor)'; reports.push(report); continue }

    report.workshop_id = ws2.id
    report.matched = true

    const values: Partial<Record<ExpenseColumn, number | null>> = {}
    for (const [col, header] of Object.entries(mapping.expense) as [ExpenseColumn, string][]) {
      values[col] = parseAmount(raw[header])
    }
    report.values = values

    const [yearStr, monthStr] = donem.split('-')
    const declaration = {
      workshop_id: ws2.id,
      year: Number(yearStr),
      month: Number(monthStr),
      work_days: mapping.meta.work_days ? parseAmount(raw[mapping.meta.work_days]) : null,
      ...values,
    } as unknown as ExpenseDeclaration

    const hasProduction = await sql`
      SELECT EXISTS (
        SELECT 1 FROM monthly_production
        WHERE workshop_id = ${ws2.id} AND year = ${Number(yearStr)} AND month = ${Number(monthStr)}
      ) AS ok
    ` as Array<{ ok: boolean }>

    const ctx: CrossCheckContext = {
      total_staff: ws2.total_staff,
      sewing_staff: ws2.sewing_staff,
      line_count: ws2.line_count,
      has_production: hasProduction[0]?.ok ?? false,
    }

    report.score = scoreDeclaration(declaration, ctx, resolveParams(paramRows, donem))
    reports.push(report)

    if (mode === 'commit') {
      const workDays = mapping.meta.work_days ? parseAmount(raw[mapping.meta.work_days]) : null

      // 1) Ham satır staging'e — dokunulmadan (izlenebilirlik ilkesi)
      const staged = await sql`
        INSERT INTO expense_declaration_staging
          (tenant_id, source, source_ref, donem, raw, workshop_id, match_status, promoted_at)
        VALUES (
          ${tenant.tenantId}, 'forms_xlsx', ${file.name}, ${donem},
          ${sql.json(raw as never)}, ${ws2.id}, 'matched', NOW()
        )
        RETURNING id
      ` as Array<{ id: number }>

      // 2) Temizlenmiş değerler monthly_expense'e
      const expense = await sql`
        INSERT INTO monthly_expense ${sql({
          workshop_id: ws2.id,
          tenant_id: tenant.tenantId,
          year: Number(yearStr),
          month: Number(monthStr),
          work_days: workDays === null ? 22 : Math.round(workDays),
          // bigint kolonlara kuruşlu değer yazılamaz — şema tipine göre yuvarla
          ...Object.fromEntries(
            Object.entries(values)
              .filter(([, v]) => v !== null)
              .map(([col, v]) => [col, coerceForColumn(col, v as number)]),
          ),
        })}
        RETURNING id
      ` as Array<{ id: number }>

      // 3) Güven skoru
      const s = report.score
      await sql`
        INSERT INTO declaration_quality (
          tenant_id, staging_id, expense_id, workshop_id, donem,
          completeness_sc, consistency_sc, plausibility_sc, crosscheck_sc, total_sc,
          flags, status, rule_version
        ) VALUES (
          ${tenant.tenantId}, ${staged[0].id}, ${expense[0].id}, ${ws2.id}, ${donem},
          ${s.completeness_sc}, ${s.consistency_sc}, ${s.plausibility_sc},
          ${s.crosscheck_sc}, ${s.total_sc},
          ${sql.json(s.flags)}, ${s.status}, ${s.rule_version}
        )
        ON CONFLICT (expense_id) DO UPDATE SET
          total_sc = EXCLUDED.total_sc, status = EXCLUDED.status,
          flags = EXCLUDED.flags, computed_at = NOW()
      `
    }
  }

  const matched = reports.filter((r) => r.matched)
  const summary = {
    sheet: sheetName,
    total_rows: reports.length,
    matched: matched.length,
    unmatched: reports.length - matched.length,
    by_status: matched.reduce<Record<string, number>>((acc, r) => {
      const st = r.score?.status ?? 'unknown'
      acc[st] = (acc[st] ?? 0) + 1
      return acc
    }, {}),
    recognized_fields: Object.keys(mapping.expense).length,
    total_fields: Object.keys(EXPENSE_LABELS).length,
  }

  return NextResponse.json({ mode, summary, mapping, reports })
})
