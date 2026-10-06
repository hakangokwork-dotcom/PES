import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { donemKaydet, donemSil, donemleriOku, gecmisiOku, kayitDogrula } from '@/lib/pes/dk-maliyet'

/**
 * Bölgesel 3D dakika maliyeti yönetimi — YALNIZ MERKEZ.
 *   GET    → dönem matrisi + değişiklik geçmişi
 *   POST   { donem, degerler: {1..6}, aciklama } → dönemi ekler/günceller
 *   DELETE { donem, aciklama }                   → dönemi siler
 *
 * RLS de yazmayı merkeze kısıtlar (052); buradaki 403 açık hata mesajı içindir.
 * Atölye ekranlarının OKUMASI /api/pes/eder/dk-maliyet üzerinden sürer.
 */
const merkezDegil = () => NextResponse.json({ error: 'Yalnız merkez paneli' }, { status: 403 })

export const GET = withTenantRoute(async (_req, { sql, tenant }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  return NextResponse.json({ donemler: await donemleriOku(sql), gecmis: await gecmisiOku(sql) })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const d = kayitDogrula(await req.json().catch(() => null))
  if (!d.ok) return NextResponse.json({ error: d.hata }, { status: 400 })
  const sonuc = await donemKaydet(sql, tenant.tenantId, tenant.userEmail, d.girdi)
  return NextResponse.json({ ...sonuc, donem: d.girdi.donem })
})

export const DELETE = withTenantRoute(async (req, { sql, tenant }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const b = await req.json().catch(() => ({})) as { donem?: string; aciklama?: string }
  const r = await donemSil(sql, tenant.userEmail, String(b.donem ?? ''), b.aciklama?.trim() || null)
  if (!r.ok) return NextResponse.json({ error: r.hata }, { status: 400 })
  return NextResponse.json(r)
})
