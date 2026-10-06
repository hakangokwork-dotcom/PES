import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { adetGecerli } from '@/lib/pes/yillik-plan'
import { klasmanVarMi } from '@/lib/pes/yillik-plan-veri'
import { atolyeyseReddet } from '../_yetki'
import { atolyeTenant, govdeOku, hata, idCoz, metinCoz, yilAyCoz } from '../_dogrula'

/**
 * Atölye × ay × klasman plan hücresi.
 *   PUT    { workshopId, yil, ay, klasmanKodu, adet, notMetni? }   adet 0 → satır silinir
 *   DELETE ?id=…
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
  const adet = adetGecerli(b.adet)
  if (adet === null) return hata('adet negatif olmayan tam sayı olmalı')
  const klasmanKodu = metinCoz(b.klasmanKodu, 50)
  if (!klasmanKodu || !(await klasmanVarMi(sql, klasmanKodu))) {
    return hata(`Klasman katalogda yok: ${klasmanKodu ?? '(boş)'}`)
  }
  const tenantId = await atolyeTenant(sql, workshopId)
  if (!tenantId) return hata('Atölye bulunamadı', 404)

  if (adet === 0) {
    await sql`
      DELETE FROM plan_atolye_ay
       WHERE workshop_id = ${workshopId} AND yil = ${ya.yil} AND ay = ${ya.ay}
         AND klasman_kodu = ${klasmanKodu}`
    return NextResponse.json({ ok: true, silindi: true })
  }
  const [r] = await sql`
    INSERT INTO plan_atolye_ay (tenant_id, workshop_id, yil, ay, klasman_kodu, adet, not_metni)
    VALUES (${tenantId}, ${workshopId}, ${ya.yil}, ${ya.ay}, ${klasmanKodu}, ${adet},
            ${metinCoz(b.notMetni, 300)})
    ON CONFLICT (workshop_id, yil, ay, klasman_kodu)
    DO UPDATE SET adet = EXCLUDED.adet, not_metni = EXCLUDED.not_metni, updated_at = now()
    RETURNING id
  ` as unknown as Array<{ id: number }>
  return NextResponse.json({ id: r.id })
})

export const DELETE = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const id = idCoz(new URL(req.url).searchParams.get('id'))
  if (id === null) return hata('id zorunlu')
  const silinen = await sql`DELETE FROM plan_atolye_ay WHERE id = ${id} RETURNING id`
  if (silinen.length === 0) return hata('Plan satırı bulunamadı', 404)
  return NextResponse.json({ ok: true })
})
