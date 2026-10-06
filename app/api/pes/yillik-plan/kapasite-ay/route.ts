import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { adetGecerli } from '@/lib/pes/yillik-plan'
import { atolyeyseReddet } from '../_yetki'
import { atolyeTenant, govdeOku, hata, idCoz, metinCoz, yilAyCoz } from '../_dogrula'

/**
 * Atölye × ay kapasite düzeltmesi.
 *   PUT { workshopId, yil, ay, adet: number | null, sebep? }
 *   adet null → düzeltme kaldırılır; 0 geçerli ("o ay kapalı").
 */
export const PUT = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const b = await govdeOku(req)
  if (!b) return hata('Gövde JSON nesnesi olmalı')
  const ya = yilAyCoz(b)
  if (!ya) return hata('yil (2020-2100) ve ay (1-12) tam sayı olmalı')
  const workshopId = idCoz(b.workshopId)
  if (workshopId === null) return hata('workshopId zorunlu')
  if (!('adet' in b)) return hata('adet zorunlu (düzeltmeyi kaldırmak için null)')
  const ham = b.adet ?? null
  const adet = ham === null ? null : adetGecerli(ham)
  if (ham !== null && adet === null) return hata('adet negatif olmayan tam sayı ya da null olmalı')
  const tenantId = await atolyeTenant(sql, workshopId)
  if (!tenantId) return hata('Atölye bulunamadı', 404)

  if (adet === null) {
    await sql`
      DELETE FROM atolye_kapasite_ay
       WHERE workshop_id = ${workshopId} AND yil = ${ya.yil} AND ay = ${ya.ay}`
    return NextResponse.json({ ok: true, silindi: true })
  }
  await sql`
    INSERT INTO atolye_kapasite_ay (tenant_id, workshop_id, yil, ay, adet, sebep)
    VALUES (${tenantId}, ${workshopId}, ${ya.yil}, ${ya.ay}, ${adet}, ${metinCoz(b.sebep, 200)})
    ON CONFLICT (workshop_id, yil, ay)
    DO UPDATE SET adet = EXCLUDED.adet, sebep = EXCLUDED.sebep, updated_at = now()`
  return NextResponse.json({ ok: true })
})
