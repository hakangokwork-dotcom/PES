import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const modelId = Number(params.id)
  if (!modelId) return NextResponse.json({ error: 'Geçersiz id' }, { status: 400 })

  const islemler = await sql`
    SELECT id, kv3_ui_id, ana_grup, parca, grup, islem_adi, makine_tipi,
           mtm_sn, cevrim_sn, kisi_sayisi, sira_no, aktif, notlar
    FROM eder_model_islem
    WHERE model_id = ${modelId}
    ORDER BY
      CASE ana_grup
        WHEN 'Ön Bant' THEN 1
        WHEN 'Arka Bant' THEN 2
        WHEN 'Montaj' THEN 3
        WHEN 'UKP' THEN 4
        WHEN 'Yıkama' THEN 5
        WHEN 'Son Montaj' THEN 6
        ELSE 99
      END,
      sira_no, id
  `

  const anaGruplar = await sql`
    SELECT ana_grup, islem_sayisi, toplam_sure_sn, toplam_teorik_sn
    FROM v_eder_model_ana_grup
    WHERE model_id = ${modelId}
    ORDER BY
      CASE ana_grup
        WHEN 'Ön Bant' THEN 1
        WHEN 'Arka Bant' THEN 2
        WHEN 'Montaj' THEN 3
        WHEN 'UKP' THEN 4
        WHEN 'Yıkama' THEN 5
        WHEN 'Son Montaj' THEN 6
        ELSE 99
      END
  `
  return NextResponse.json({ islemler, anaGruplar })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const modelId = Number(params.id)
  if (!modelId) return NextResponse.json({ error: 'Geçersiz id' }, { status: 400 })

  const body = await req.json()
  const [row] = await sql`
    INSERT INTO eder_model_islem (
      tenant_id, model_id, ana_grup, parca, grup, islem_adi, makine_tipi,
      mtm_sn, cevrim_sn, kisi_sayisi, sira_no, aktif, notlar
    )
    VALUES (
      ${tenant.tenantId},
      ${modelId},
      ${body.ana_grup ?? 'Montaj'},
      ${body.parca ?? null},
      ${body.grup ?? null},
      ${body.islem_adi},
      ${body.makine_tipi ?? null},
      ${body.mtm_sn ?? null},
      ${body.cevrim_sn ?? body.mtm_sn ?? 0},
      ${body.kisi_sayisi ?? 1},
      ${body.sira_no ?? 9999},
      ${body.aktif ?? true},
      ${body.notlar ?? null}
    )
    RETURNING *
  `
  return NextResponse.json({ islem: row })
})
