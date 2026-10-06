/**
 * /pes/yillik-plan — Yıllık Talep Planı
 *
 * Tedarikçi departmanının yıllık tahmini kalemlere bölünür; her kalem
 * yetenek uyumlu atölyelere aylık boş kapasiteye göre dağıtılır.
 * Izgara atölye × ay; hücre yükü = gerçek PO + tüm tahsisler (dk) ÷ kapasite.
 * Takvime günlük rezerve YAZILMAZ — yumuşak rezervasyon bu ızgaradır.
 */
import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { aylikAdet, yukYuzdesi } from '@/lib/pes/yillik-plan'
import {
  atolyeKapasiteleri, poAylikYuk, tahsisAylikYuk, atolyeUyumlari,
} from '@/lib/pes/yillik-plan-veri'
import type { Kunye } from '@/lib/pes/kunye'
import type { KapasiteKaynagi } from '@/lib/pes/yillik-plan'
import YillikPlan, { type TahminOzet, type KalemDetay, type IzgaraSatiri } from './YillikPlan'

export const dynamic = 'force-dynamic'

export default async function YillikPlanSayfasi({
  searchParams,
}: { searchParams: Promise<{ yil?: string; tahmin?: string; kalem?: string }> }) {
  const sp = await searchParams
  const yil = Number(sp.yil) || new Date().getFullYear() + 1

  const veri = await withServerTenant(async (sql) => {
    const tahminler = await sql`
      SELECT h.id, h.departman, h.ad, h.kumas, h.durum,
             COALESCE(SUM(k.adet), 0)::int AS toplam
        FROM talep_tahmini h
        LEFT JOIN talep_tahmini_kalem k ON k.tahmin_id = h.id
       WHERE h.yil = ${yil}
       GROUP BY h.id ORDER BY h.departman, h.ad
    ` as unknown as TahminOzet[]
    const tahminId = Number(sp.tahmin) || tahminler[0]?.id || 0

    const kalemSatirlari = tahminId ? await sql`
      SELECT k.id, k.ad, k.adet, k.sam_dk::float AS "samDk", k.sam_kaynak AS "samKaynak",
             k.urun_tipi_id AS "urunTipiId", k.aylik_profil::float8[] AS profil,
             k.ana_grup_kodu, k.klasman_kodu, k.kumas_turu_kodu, k.kumas_grubu_kodu,
             k.cinsiyet_yas_kodu, k.kalite_kodu, k.kumasci,
             COALESCE((SELECT SUM(siparis_miktari) FROM work_order w
                        WHERE w.tahmin_kalem_id = k.id AND w.durum <> 'Iptal'), 0)::int AS tuketilen,
             COALESCE((SELECT SUM(adet) FROM talep_tahsis t WHERE t.kalem_id = k.id), 0)::int AS tahsisli
        FROM talep_tahmini_kalem k
       WHERE k.tahmin_id = ${tahminId}
       ORDER BY k.id
    ` as unknown as Array<Record<string, unknown>> : []
    const kalemId = Number(sp.kalem) || (kalemSatirlari[0]?.id as number | undefined) || 0
    const kalem = kalemSatirlari.find((k) => k.id === kalemId) ?? null

    const kap = await atolyeKapasiteleri(sql, yil, kalem ? (kalem.samDk as number | null) : null)
    const po = await poAylikYuk(sql, yil)
    const tahsisYuk = await tahsisAylikYuk(sql, yil, null)
    const uyumlar = kalem ? await atolyeUyumlari(sql, kalem as unknown as Kunye) : null
    const kalemTahsis = kalem ? await sql`
      SELECT workshop_id AS "workshopId", ay, adet, kaynak FROM talep_tahsis WHERE kalem_id = ${kalemId}
    ` as unknown as Array<{ workshopId: number; ay: number; adet: number; kaynak: 'oneri' | 'elle' }> : []
    const urunTipleri = await sql`
      SELECT DISTINCT ut.id, ut.klasman_ad AS ad, ut.urun_grubu AS grup
        FROM ref_urun_tipi ut JOIN ref_parca_sure p ON p.urun_tipi_id = ut.id
       ORDER BY ut.urun_grubu NULLS LAST, ut.klasman_ad
    ` as unknown as Array<{ id: number; ad: string; grup: string | null }>

    return { tahminler, tahminId, kalemSatirlari, kalemId, kalem, kap, po, tahsisYuk,
             uyumlar, kalemTahsis, urunTipleri }
  })
  if (!veri) redirect('/login')

  const izgara: IzgaraSatiri[] = veri.kap.map((a) => {
    const p = veri.po.yuk.get(a.workshopId) ?? []
    const t = veri.tahsisYuk.get(a.workshopId) ?? []
    const u = veri.uyumlar?.get(a.workshopId)
    return {
      workshopId: a.workshopId, kod: a.kod, ad: a.ad,
      kaynak: a.kaynak,
      yuzde: a.kapasiteDk === null
        ? Array<null>(12).fill(null)
        : a.kapasiteDk.map((c, m) => yukYuzdesi((p[m] ?? 0) + (t[m] ?? 0), c)),
      uyum: u?.uyum ?? null, neden: u?.neden ?? null,
      hucre: Array.from({ length: 12 }, (_, m) => {
        const x = veri.kalemTahsis.find((r) => r.workshopId === a.workshopId && r.ay === m + 1)
        return x ? { adet: x.adet, kaynak: x.kaynak } : null
      }),
    }
  })

  const kalemler: KalemDetay[] = veri.kalemSatirlari.map((k) => ({
    id: k.id as number, ad: k.ad as string, adet: k.adet as number,
    samDk: k.samDk as number | null, samKaynak: k.samKaynak as string | null,
    urunTipiId: k.urunTipiId as number | null, profil: k.profil as number[],
    klasman_kodu: k.klasman_kodu as string | null, kumas_turu_kodu: k.kumas_turu_kodu as string | null,
    kumas_grubu_kodu: k.kumas_grubu_kodu as string | null, cinsiyet_yas_kodu: k.cinsiyet_yas_kodu as string | null,
    tuketilen: k.tuketilen as number, tahsisli: k.tahsisli as number,
  }))

  const secili = kalemler.find((k) => k.id === veri.kalemId) ?? null
  /* Bağlı PO'lar tüketilen kadar ihtiyacı küçültür (tahsisAylikYuk ile aynı oran). */
  const ihtiyac = secili ? aylikAdet(Math.max(0, secili.adet - secili.tuketilen), secili.profil) : null

  return (
    <YillikPlan
      yil={yil} tahminler={veri.tahminler} tahminId={veri.tahminId}
      kalemler={kalemler} kalemId={veri.kalemId} ihtiyac={ihtiyac}
      izgara={izgara} samsizPo={veri.po.samsizPo} urunTipleri={veri.urunTipleri}
    />
  )
}
