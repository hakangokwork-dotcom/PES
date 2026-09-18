import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { VARSAYILAN_PARAM } from '@/lib/pes/ekonomi-tipler'

const GECERLI_ANAHTARLAR = new Set(Object.keys(VARSAYILAN_PARAM))

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const tenantId = tenant.tenantId
  const b = await req.json()
  const donem = String(b.donem ?? '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(donem)) {
    return NextResponse.json({ error: 'donem YYYY-MM olmalı' }, { status: 400 })
  }

  const girdiler = Object.entries(b.degerler ?? {})
    .filter(([k]) => GECERLI_ANAHTARLAR.has(k))
    .map(([k, v]) => ({ k, v: Number(v) }))
    .filter(({ v }) => Number.isFinite(v))

  if (girdiler.length === 0) {
    return NextResponse.json({ error: 'Geçerli parametre yok' }, { status: 400 })
  }

  for (const { k, v } of girdiler) {
    await sql`
      INSERT INTO economy_param (tenant_id, donem, param_key, param_value)
      VALUES (${tenantId}, ${donem}, ${k}, ${v})
      ON CONFLICT (tenant_id, donem, param_key)
      DO UPDATE SET param_value = EXCLUDED.param_value, updated_at = now()`
  }

  // Bu dönem ve sonrası kaç ekonomi satırını etkiliyor?
  const [etki] = await sql`
    SELECT count(*)::int AS satir, count(DISTINCT workshop_id)::int AS atolye
    FROM workshop_economy
    WHERE (year::text || '-' || lpad(month::text, 2, '0')) >= ${donem}`

  return NextResponse.json({ yazilan: girdiler.length, etki })
})
