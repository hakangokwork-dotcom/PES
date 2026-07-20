import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { calcCompositeScore, determineTier, determineTrend } from '@/lib/pes/scoring'

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const { workshop_id, year, month } = await req.json()
  if (!workshop_id || !year || !month) {
    return NextResponse.json({ error: 'workshop_id, year, month gerekli' }, { status: 400 })
  }

  const effRows = await sql`
    SELECT CASE WHEN SUM(target_qty) > 0
      THEN LEAST(ROUND(SUM(actual_qty)::numeric / SUM(target_qty) * 100, 1), 100)
      ELSE 0 END as eff
    FROM monthly_production
    WHERE workshop_id = ${workshop_id} AND year = ${year} AND month = ${month}
  `
  const efficiencyScore = Number(effRows[0]?.eff ?? 0)

  const qualRows = await sql`
    SELECT CASE WHEN SUM(inspected_qty) > 0
      THEN LEAST(ROUND(SUM(first_pass_qty)::numeric / SUM(inspected_qty) * 100, 1), 100)
      ELSE 80 END as fpq
    FROM quality_record
    WHERE workshop_id = ${workshop_id} AND year = ${year} AND month = ${month}
  `
  const qualityScore = Number(qualRows[0]?.fpq ?? 80)

  const delRows = await sql`
    SELECT CASE WHEN SUM(target_qty) > 0
      THEN LEAST(ROUND(SUM(actual_qty)::numeric / SUM(target_qty) * 100, 1), 100)
      ELSE 75 END as delivery_pct
    FROM monthly_production
    WHERE workshop_id = ${workshop_id} AND year = ${year} AND month = ${month}
  `
  const deliveryScore = Number(delRows[0]?.delivery_pct ?? 75)

  const costRows = await sql`
    SELECT
      CASE WHEN me.target_revenue > 0
        THEN LEAST(ROUND(
          (1 - (me.personnel+me.sgk+me.food+me.electricity+me.water+me.gas+me.transport+me.vehicle+me.cargo+me.machine_maint+me.thread+me.other)::numeric
          / me.target_revenue) * 100 + 50, 1
        ), 100)
        ELSE 70 END as cost_pct
    FROM monthly_expense me
    WHERE me.workshop_id = ${workshop_id} AND me.year = ${year} AND me.month = ${month}
  `
  const costScore = Math.max(0, Number(costRows[0]?.cost_pct ?? 70))

  const compRows = await sql`
    SELECT
      CASE WHEN COUNT(*) > 0
        THEN GREATEST(100 - COALESCE(SUM(dr.duration_min), 0)::numeric / 10, 40)
        ELSE 80 END as comp_pct
    FROM downtime_record dr
    JOIN production_line pl ON pl.id = dr.line_id
    WHERE pl.workshop_id = ${workshop_id}
      AND EXTRACT(YEAR FROM dr.occurred_at) = ${year}
      AND EXTRACT(MONTH FROM dr.occurred_at) = ${month}
      AND dr.downtime_type IN ('Plansız', 'Tedarik')
  `
  const complianceScore = Math.min(100, Math.max(0, Number(compRows[0]?.comp_pct ?? 80)))

  const composite = calcCompositeScore({
    efficiency: efficiencyScore,
    quality: qualityScore,
    delivery: deliveryScore,
    cost: costScore,
    compliance: complianceScore,
  })

  const tier = determineTier(composite)

  const prevRows = await sql`
    SELECT composite_sc FROM supplier_score
    WHERE workshop_id = ${workshop_id}
      AND (year * 12 + month) = (${year} * 12 + ${month} - 1)
  `
  const prevSc = prevRows[0]?.composite_sc ?? null
  const trend = determineTrend(composite, prevSc ? Number(prevSc) : null)

  await sql`
    INSERT INTO supplier_score (tenant_id, workshop_id, year, month, efficiency_sc, quality_sc, delivery_sc, cost_sc, compliance_sc, composite_sc, tier, prev_sc, trend)
    VALUES (${tenant.tenantId}, ${workshop_id}, ${year}, ${month}, ${efficiencyScore}, ${qualityScore}, ${deliveryScore}, ${costScore}, ${complianceScore}, ${composite}, ${tier}, ${prevSc}, ${trend})
    ON CONFLICT (workshop_id, year, month) DO UPDATE SET
      efficiency_sc = EXCLUDED.efficiency_sc, quality_sc = EXCLUDED.quality_sc,
      delivery_sc = EXCLUDED.delivery_sc, cost_sc = EXCLUDED.cost_sc,
      compliance_sc = EXCLUDED.compliance_sc, composite_sc = EXCLUDED.composite_sc,
      tier = EXCLUDED.tier, prev_sc = EXCLUDED.prev_sc, trend = EXCLUDED.trend
  `

  return NextResponse.json({
    score: { composite, tier, trend, efficiency_sc: efficiencyScore, quality_sc: qualityScore, delivery_sc: deliveryScore, cost_sc: costScore, compliance_sc: complianceScore },
    message: 'Skor hesaplandı',
  })
})
