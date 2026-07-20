import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { parseWorkshopCSV } from '@/lib/pes/csv-parser'

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'CSV dosyası gerekli' }, { status: 400 })

  const text = await file.text()
  const { workshops, duplicates, skipped } = parseWorkshopCSV(text)

  if (workshops.length === 0) {
    return NextResponse.json({ error: 'Geçerli atölye verisi bulunamadı' }, { status: 400 })
  }

  const values = workshops.map(w => ({
    tenant_id: tenant.tenantId,
    code: w.code,
    name: w.name,
    city: w.city,
    district: w.district,
    type: w.type,
    line_count: w.line_count,
    is_active: w.is_active,
    total_staff: w.total_staff,
    daily_target: w.aylik_kapasite > 0 ? Math.round(w.aylik_kapasite / 22) : 0,
  }))

  const result = await sql`
    INSERT INTO workshop ${sql(values, 'tenant_id', 'code', 'name', 'city', 'district', 'type', 'line_count', 'is_active', 'total_staff', 'daily_target')}
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      city = EXCLUDED.city,
      district = EXCLUDED.district,
      type = EXCLUDED.type,
      line_count = EXCLUDED.line_count,
      is_active = EXCLUDED.is_active,
      total_staff = EXCLUDED.total_staff,
      daily_target = EXCLUDED.daily_target
    RETURNING id
  `

  return NextResponse.json({
    message: 'Import tamamlandı',
    stats: {
      total_parsed: workshops.length,
      inserted: result.length,
      updated: 0,
      failed: 0,
      duplicates_in_csv: duplicates,
      skipped_rows: skipped,
    },
  })
})
