// app/api/pes/olcu-sartname/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Ölçü şartnamesi (061). Yazma yalnız merkez; RLS de atölye yazımını durdurur,
 * burada erken ve anlaşılır cevap verilir.
 *
 *   GET  /api/pes/olcu-sartname           → { sartnameler, modeller }
 *   POST /api/pes/olcu-sartname           { model_bulten_id, kumas_kategorisi, asama, notlar? }
 *        Aynı anahtarda en yüksek revizyon + 1 ile 'Önerilen' açar.
 */
const KATEGORILER = new Set(['Rijit', 'Esnek'])
const ASAMALAR = new Set(['FINAL', 'YIKAMA_ONCESI'])
const merkezDegil = () => NextResponse.json({ error: 'Ölçü şartnamesini yalnız merkez yönetir' }, { status: 403 })

export const GET = withTenantRoute(async (_req, { sql, tenant }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const sartnameler = await sql`
    SELECT s.id, s.model_bulten_id, mb.model_adi, mb.plm_id, s.kumas_kategorisi, s.asama, s.revizyon,
           s.durum, s.onaylayan, s.onay_tarihi::text, s.notlar,
           (SELECT count(*)::int FROM olcu_noktasi n WHERE n.sartname_id = s.id) AS nokta_sayisi
      FROM olcu_sartname s JOIN model_bulten mb ON mb.id = s.model_bulten_id
     ORDER BY mb.model_adi, s.kumas_kategorisi, s.asama, s.revizyon DESC`
  const modeller = await sql`SELECT id, model_adi, plm_id FROM model_bulten ORDER BY model_adi`
  return NextResponse.json({ sartnameler, modeller })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const b = await req.json()
  const model = Number(b.model_bulten_id)
  if (!Number.isInteger(model)) return NextResponse.json({ error: 'Model seçilmeli' }, { status: 400 })
  if (!KATEGORILER.has(b.kumas_kategorisi)) return NextResponse.json({ error: 'Kumaş kategorisi Rijit ya da Esnek olmalı' }, { status: 400 })
  if (!ASAMALAR.has(b.asama)) return NextResponse.json({ error: 'Aşama FINAL ya da YIKAMA_ONCESI olmalı' }, { status: 400 })
  const [m] = await sql`SELECT id FROM model_bulten WHERE id = ${model}`
  if (!m) return NextResponse.json({ error: 'Model bulunamadı' }, { status: 404 })
  const [s] = await sql`
    INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama, revizyon, notlar)
    SELECT ${tenant.tenantId}, ${model}, ${b.kumas_kategorisi}, ${b.asama},
           coalesce(max(revizyon), 0) + 1, ${b.notlar ? String(b.notlar).trim() : null}
      FROM olcu_sartname
     WHERE model_bulten_id = ${model} AND kumas_kategorisi = ${b.kumas_kategorisi} AND asama = ${b.asama}
    RETURNING id`
  return NextResponse.json({ id: s.id })
})
