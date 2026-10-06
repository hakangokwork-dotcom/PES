/**
 * /pes/yillik-plan — Yıllık Plan (v2, basit yapı)
 *
 * Atölyenin aylık kapasitesi belli; planlamacı her ay hangi atölyeye hangi
 * klasmandan kaç adet yaptıracağını kendisi yazar. Her şey ADET.
 * Doluluk yüzdesi PLAN üzerinden; fiili sipariş yalnız bilgi.
 * Panel yetkisi app/pes/layout.tsx'te (requirePanel('yonetim')).
 */
import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import {
  atolyeKapasiteleri, fiiliSiparisler, klasmanIzleniyor, klasmanKatalogu,
  planSatirlari, talepSatirlari,
} from '@/lib/pes/yillik-plan-veri'
import YillikPlan from './YillikPlan'
import type { YillikPlanVerisi } from './ortak'

export const dynamic = 'force-dynamic'

export default async function YillikPlanSayfasi({
  searchParams,
}: { searchParams: Promise<{ yil?: string; sekme?: string; klasman?: string; atolye?: string }> }) {
  const sp = await searchParams
  const yilHam = Number(sp.yil)
  const yil = Number.isInteger(yilHam) && yilHam >= 2020 && yilHam <= 2100
    ? yilHam
    : new Date().getFullYear() + 1

  const veri = await withServerTenant(async (sql) => {
    const katalog = await klasmanKatalogu(sql)
    const izleniyor = await klasmanIzleniyor(sql)
    const atolyeler = await atolyeKapasiteleri(sql, yil)
    const planlar = await planSatirlari(sql, yil)
    const talepler = await talepSatirlari(sql, yil)
    const fiili = await fiiliSiparisler(sql, yil)
    return { katalog, izleniyor, atolyeler, planlar, talepler, fiili }
  })
  if (!veri) redirect('/login')

  const klasman = sp.klasman && veri.katalog.some((k) => k.code === sp.klasman) ? sp.klasman : null
  const atolyeNo = Number(sp.atolye)
  const atolyeId = veri.atolyeler.some((a) => a.workshopId === atolyeNo) ? atolyeNo : null

  const props: YillikPlanVerisi = {
    yil,
    sekme: sp.sekme === 'talep' ? 'talep' : 'doluluk',
    klasman,
    atolyeId,
    klasmanIzleniyor: veri.izleniyor,
    katalog: veri.katalog,
    atolyeler: veri.atolyeler,
    planlar: veri.planlar,
    fiili: veri.fiili,
    talepler: veri.talepler,
  }
  return <YillikPlan veri={props} />
}
