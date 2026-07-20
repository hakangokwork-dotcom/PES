import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const PATCH = withTenantRoute<{ opId: string }>(async (req, { sql, params }) => {
  const opId = Number(params.opId)
  const body = await req.json()
  const [row] = await sql`
    UPDATE eder_alt_operasyon SET
      operasyon_adi = COALESCE(${body.operasyon_adi ?? null}, operasyon_adi),
      sure_sn = COALESCE(${body.sure_sn ?? null}, sure_sn),
      kisi_sayisi = COALESCE(${body.kisi_sayisi ?? null}, kisi_sayisi),
      sira_no = COALESCE(${body.sira_no ?? null}, sira_no),
      makine_tipi = COALESCE(${body.makine_tipi ?? null}, makine_tipi),
      notlar = COALESCE(${body.notlar ?? null}, notlar)
    WHERE id = ${opId}
    RETURNING *
  `
  return NextResponse.json({ operasyon: row })
})

export const DELETE = withTenantRoute<{ opId: string }>(async (_req, { sql, params }) => {
  const opId = Number(params.opId)
  await sql`DELETE FROM eder_alt_operasyon WHERE id = ${opId}`
  return NextResponse.json({ ok: true })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const body = await req.json()
  const [row] = await sql`
    INSERT INTO eder_alt_operasyon (tenant_id, grup_id, operasyon_adi, sure_sn, kisi_sayisi, sira_no, makine_tipi, notlar)
    VALUES (
      ${tenant.tenantId},
      ${body.grup_id},
      ${body.operasyon_adi},
      ${body.sure_sn},
      ${body.kisi_sayisi ?? 1},
      ${body.sira_no ?? 0},
      ${body.makine_tipi ?? null},
      ${body.notlar ?? null}
    )
    RETURNING *
  `
  return NextResponse.json({ operasyon: row })
})
