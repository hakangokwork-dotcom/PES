// app/api/pes/work-orders/[id]/adimlar/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute, idOku, gecersizKimlik } from '@/app/api/_lib/with-tenant'

/**
 * İş emrinin adımları: ilk plan / güncel plan / gerçek, kayma, gecikme, sorun
 * (v_is_emri_adim, 064) ve her adımın plan geçmişi. Atölye de okur (RLS).
 *
 *   GET /api/pes/work-orders/12/adimlar → { adimlar, gecmis, merkez }
 *   merkez: rota uygulayabilir mi (bkz. ../rota).
 */
export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, tenant, params }) => {
  const id = idOku(params.id)
  if (id === null) return gecersizKimlik()
  const adimlar = await sql`
    SELECT stage_kayit_id, stage_id, stage_code, stage_name, sira_no, is_ortagi_id, ortak_unvan, ortak_tipi,
           zorunlu_formlar, ilk_plan_baslangic::text, ilk_plan_bitis::text, plan_baslangic::text, plan_bitis::text,
           gercek_baslangic::text, gercek_bitis::text, durum, revizyon_sayisi, plan_kayma_gun, gecikme_gun,
           acik_sorun, toplam_sorun
      FROM v_is_emri_adim WHERE work_order_id = ${id} ORDER BY sira_no NULLS LAST, stage_kayit_id`
  const gecmis = await sql`
    SELECT g.id, g.stage_kayit_id, g.plan_baslangic::text, g.plan_bitis::text, g.is_ortagi_id,
           io.unvan AS ortak_unvan, g.gerekce_kodu, g.not_metni, g.giren_eposta, g.created_at
      FROM adim_plan_gecmisi g LEFT JOIN is_ortagi io ON io.id = g.is_ortagi_id
     WHERE g.work_order_id = ${id} ORDER BY g.stage_kayit_id, g.id`
  return NextResponse.json({ adimlar, gecmis, merkez: tenant.workshopId === null || tenant.atolyeSecimi })
})
