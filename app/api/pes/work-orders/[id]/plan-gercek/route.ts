import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { planGercek } from '@/lib/pes/plan-gercek'

/**
 * Siparişin plan/gerçek karşılaştırması (tasarım K6, §6.2).
 *
 *   GET /api/pes/work-orders/12/plan-gercek
 *
 * Aşama seviyesi her siparişte vardır; gün seviyesi eğri yalnızca
 * günlük üretim girilmişse dolar.
 */
export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = parseInt(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz sipariş' }, { status: 400 })

  const veri = await planGercek(sql, id)
  if (!veri) return NextResponse.json({ error: 'Sipariş bulunamadı' }, { status: 404 })

  return NextResponse.json({ planGercek: veri })
})
