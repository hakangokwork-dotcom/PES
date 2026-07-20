import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const id = Number(params.id)
  const body = await req.json()

  const [grup] = await sql`
    INSERT INTO eder_operasyon_grubu (tenant_id, model_id, grup_adi, sira_no)
    VALUES (${tenant.tenantId}, ${id}, ${body.grup_adi}, ${body.sira_no ?? 0})
    RETURNING *
  `

  let ops: Record<string, unknown>[] = []
  if (body.operasyonlar && body.operasyonlar.length > 0) {
    const rows = body.operasyonlar.map((op: Record<string, unknown>, i: number) => ({
      tenant_id: tenant.tenantId,
      grup_id: grup.id,
      operasyon_adi: op.operasyon_adi,
      sure_sn: op.sure_sn,
      kisi_sayisi: op.kisi_sayisi ?? 1,
      sira_no: op.sira_no ?? i + 1,
      makine_tipi: op.makine_tipi ?? null,
      notlar: op.notlar ?? null,
    }))

    ops = await sql`
      INSERT INTO eder_alt_operasyon ${sql(rows, 'tenant_id', 'grup_id', 'operasyon_adi', 'sure_sn', 'kisi_sayisi', 'sira_no', 'makine_tipi', 'notlar')}
      RETURNING *
    `
  }

  return NextResponse.json({ grup: { ...grup, alt_operasyonlar: ops } })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const grupId = req.nextUrl.searchParams.get('grup_id')
  if (!grupId) return NextResponse.json({ error: 'grup_id gerekli' }, { status: 400 })
  await sql`DELETE FROM eder_operasyon_grubu WHERE id = ${Number(grupId)}`
  return NextResponse.json({ ok: true })
})
