import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { donemCoz } from '@/lib/pes/ekonomi-talep'

/**
 * Atölyenin kendi dönem verisini yazması.
 *
 * ATÖLYE OTURUMDAN GELİR, gövdeden DEĞİL. İstek `workshop_id` taşısaydı
 * atölye başka bir atölyenin satırını yazmayı deneyebilirdi; RLS bunu
 * zaten durdururdu ama saldırıyı politikaya bırakmak yerine hiç mümkün
 * kılmamak doğru. Merkez kullanıcısının (workshopId null) burada işi yok —
 * hangi atölye adına yazacağı belirsiz.
 *
 * source='atolye' yazılır: beyanın kaynağı güvenilirliğini belirler ve
 * ekranda anket/elle/türetilmiş'ten ayrı görünmeli (migration 040 CHECK'i
 * bu değeri kabul edecek şekilde genişletti).
 */

/** Formdan gelebilecek alanlar; başkası kabul edilmez. */
const SAYISAL_ALANLAR = [
  'revenue_declared', 'qty_declared', 'idle_days',
  'nominal_days', 'actual_days', 'hours_per_day',
  'cutting_staff', 'sewing_staff', 'ukp_staff', 'office_staff', 'area_m2',
] as const

/** Boş metni null'a çevirir; 0'ı KORUR ("0 kişi" geçerli bir cevap). */
function sayi(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  if (!tenant.workshopId) {
    return NextResponse.json(
      { error: 'Bu uç yalnız atölye kullanıcısı içindir' }, { status: 403 })
  }

  const b = await req.json()
  const d = donemCoz(String(b.donem ?? ''))
  if (!d) {
    return NextResponse.json({ error: 'donem YYYY-MM biçiminde olmalı' }, { status: 400 })
  }

  const v: Record<string, number | null> = {}
  for (const alan of SAYISAL_ALANLAR) v[alan] = sayi(b[alan])

  /* Negatif değer veri girişi hatasıdır; sessizce kaydedilirse rasyolar
     anlamsız çıkar ve nedeni günler sonra aranır. */
  const negatif = SAYISAL_ALANLAR.filter((a) => v[a] !== null && v[a]! < 0)
  if (negatif.length > 0) {
    return NextResponse.json(
      { error: `Negatif değer olamaz: ${negatif.join(', ')}` }, { status: 400 })
  }

  const [row] = await sql`
    INSERT INTO workshop_economy (
      workshop_id, tenant_id, year, month,
      revenue_declared, qty_declared, idle_days,
      nominal_days, actual_days, hours_per_day,
      cutting_staff, sewing_staff, ukp_staff, office_staff, area_m2,
      source, updated_at)
    VALUES (
      ${tenant.workshopId}, ${tenant.tenantId}, ${d.yil}, ${d.ay},
      ${v.revenue_declared}, ${v.qty_declared}, ${v.idle_days},
      ${v.nominal_days}, ${v.actual_days}, ${v.hours_per_day},
      ${v.cutting_staff}, ${v.sewing_staff}, ${v.ukp_staff}, ${v.office_staff},
      ${v.area_m2}, 'atolye', now())
    ON CONFLICT (workshop_id, year, month) DO UPDATE SET
      revenue_declared = EXCLUDED.revenue_declared,
      qty_declared     = EXCLUDED.qty_declared,
      idle_days        = EXCLUDED.idle_days,
      nominal_days     = EXCLUDED.nominal_days,
      actual_days      = EXCLUDED.actual_days,
      hours_per_day    = EXCLUDED.hours_per_day,
      cutting_staff    = EXCLUDED.cutting_staff,
      sewing_staff     = EXCLUDED.sewing_staff,
      ukp_staff        = EXCLUDED.ukp_staff,
      office_staff     = EXCLUDED.office_staff,
      area_m2          = EXCLUDED.area_m2,
      source           = 'atolye',
      updated_at       = now()
    RETURNING id, year, month, source, updated_at
  ` as unknown as Array<Record<string, unknown>>

  return NextResponse.json({ kayit: row })
})
