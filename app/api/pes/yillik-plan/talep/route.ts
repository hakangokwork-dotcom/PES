import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { adetGecerli } from '@/lib/pes/yillik-plan'
import { klasmanVarMi } from '@/lib/pes/yillik-plan-veri'
import { atolyeyseReddet } from '../_yetki'
import { govdeOku, hata, metinCoz, yilAyCoz } from '../_dogrula'

/**
 * Klasman × ay talep hedefi.
 *   PUT { yil, ay, klasmanKodu, adet }   adet 0 → satır silinir (talep yok = 0)
 */
export const PUT = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const b = await govdeOku(req)
  if (!b) return hata('Gövde JSON nesnesi olmalı')
  const ya = yilAyCoz(b)
  if (!ya) return hata('yil (2020-2100) ve ay (1-12) tam sayı olmalı')
  const adet = adetGecerli(b.adet)
  if (adet === null) return hata('adet negatif olmayan tam sayı olmalı')
  const klasmanKodu = metinCoz(b.klasmanKodu, 50)
  if (!klasmanKodu || !(await klasmanVarMi(sql, klasmanKodu))) {
    return hata(`Klasman katalogda yok: ${klasmanKodu ?? '(boş)'}`)
  }

  if (adet === 0) {
    await sql`
      DELETE FROM plan_talep_ay
       WHERE tenant_id = ${tenant.tenantId} AND yil = ${ya.yil} AND ay = ${ya.ay}
         AND klasman_kodu = ${klasmanKodu}`
    return NextResponse.json({ ok: true, silindi: true })
  }
  await sql`
    INSERT INTO plan_talep_ay (tenant_id, yil, ay, klasman_kodu, adet)
    VALUES (${tenant.tenantId}, ${ya.yil}, ${ya.ay}, ${klasmanKodu}, ${adet})
    ON CONFLICT (tenant_id, yil, ay, klasman_kodu)
    DO UPDATE SET adet = EXCLUDED.adet, updated_at = now()`
  return NextResponse.json({ ok: true })
})
