'use client'
import { Fragment, useMemo } from 'react'
import {
  AYLAR, KAYNAK_ACIKLAMA, KAYNAK_ETIKET, UYUM_GRUP_ETIKET, UYUM_SIRASI,
  ayToplamlari, dolulukRengi, dolulukYuzdesi, klasmanUyumu, talepAcigi, yuzdeMetni,
  type AtolyeKapasitesi, type DolulukRengi,
} from '@/lib/pes/yillik-plan'
import type { GenelUyum } from '@/lib/pes/yetenek-uyum'
import { tr, type YillikPlanVerisi } from './ortak'

const RENK: Record<DolulukRengi, string> = {
  yok: 'bg-slate-50 text-slate-400',
  yesil: 'bg-emerald-50 text-emerald-800',
  sari: 'bg-amber-100 text-amber-800',
  kirmizi: 'bg-red-100 text-red-700',
}

type Satir = {
  a: AtolyeKapasitesi
  /** Hücrede gösterilen plan: klasman seçiliyse yalnız o klasman. */
  gorunen: number[]
  /** Yüzde HER ZAMAN atölyenin toplam planından (kapasite paylaşılır). */
  yuzde: (number | null)[]
  sip: number[]
  uyum: GenelUyum | null
}

export default function DolulukTablosu({ veri, sec }: {
  veri: YillikPlanVerisi
  sec: (workshopId: number) => void
}) {
  const k = veri.klasman
  const satirlar = useMemo(() => {
    const s: Satir[] = veri.atolyeler.map((a) => {
      const toplam = ayToplamlari(veri.planlar, { workshopId: a.workshopId })
      return {
        a,
        gorunen: k ? ayToplamlari(veri.planlar, { workshopId: a.workshopId, klasman: k }) : toplam,
        yuzde: toplam.map((p, m) => dolulukYuzdesi(p, a.kapasite[m])),
        sip: ayToplamlari(veri.fiili, { workshopId: a.workshopId, klasman: k }),
        uyum: k ? klasmanUyumu(k, a.klasmanlar, veri.klasmanIzleniyor) : null,
      }
    })
    if (k) {
      s.sort((x, y) =>
        UYUM_SIRASI[x.uyum as GenelUyum] - UYUM_SIRASI[y.uyum as GenelUyum]
        || x.a.kod.localeCompare(y.a.kod, 'tr'))
    }
    return s
  }, [veri, k])

  const talep = k ? ayToplamlari(veri.talepler, { klasman: k }) : null
  const yerlesen = k ? ayToplamlari(veri.planlar, { klasman: k }) : null

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-max">
          <thead>
            <tr>
              <th className="text-left px-2 py-1 sticky left-0 z-10 bg-white">Atölye</th>
              {AYLAR.map((ad) => <th key={ad} className="px-1 py-1 w-24">{ad}</th>)}
            </tr>
            {talep && yerlesen && (
              <tr className="border-b text-slate-600">
                <th className="text-left px-2 py-1 sticky left-0 z-10 bg-white font-normal">
                  Talep / yerleşen / açık
                </th>
                {talep.map((t, m) => {
                  const { acik, fazla } = talepAcigi(t, yerlesen[m])
                  return (
                    <td key={m} className="px-1 py-1 text-center align-top">
                      <div>{tr.format(t)}</div>
                      <div>{tr.format(yerlesen[m])}</div>
                      <div className={acik > 0 ? 'text-red-600' : fazla > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                        {acik > 0 ? `açık ${tr.format(acik)}` : fazla > 0 ? `fazla ${tr.format(fazla)}` : 'tamam'}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {satirlar.map((s, i) => {
              const grupBasi = s.uyum !== null && (i === 0 || satirlar[i - 1].uyum !== s.uyum)
              const secili = veri.atolyeId === s.a.workshopId
              return (
                <Fragment key={s.a.workshopId}>
                  {grupBasi && (
                    <tr>
                      <td colSpan={13} className="px-2 pt-3 pb-1 text-[11px] font-semibold text-slate-500">
                        {UYUM_GRUP_ETIKET[s.uyum as GenelUyum]}
                      </td>
                    </tr>
                  )}
                  <tr onClick={() => sec(s.a.workshopId)}
                      className={`cursor-pointer hover:bg-slate-50 ${s.uyum === 'uyumsuz' ? 'opacity-50' : ''}`}>
                    <td className={`px-2 py-1 sticky left-0 z-10 whitespace-nowrap max-w-[16rem] ${secili ? 'bg-slate-200' : 'bg-white'}`}>
                      <div className="flex items-center gap-1">
                        <span className="font-medium shrink-0">{s.a.kod}</span>
                        <span className="truncate" title={s.a.ad}>{s.a.ad}</span>
                        <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-500"
                              title={KAYNAK_ACIKLAMA[s.a.bazKaynak]}>
                          {KAYNAK_ETIKET[s.a.bazKaynak]}
                        </span>
                      </div>
                    </td>
                    {s.yuzde.map((y, m) => {
                      const kap = s.a.kapasite[m]
                      const duz = s.a.kaynak[m] === 'duzeltme'
                      const sebep = s.a.duzeltme[m]?.sebep
                      return (
                        <td key={m}
                            className={`px-1 py-1 w-24 min-w-24 text-center align-top ${RENK[dolulukRengi(y)]}`}
                            title={duz ? `Kapasite düzeltmesi${sebep ? `: ${sebep}` : ''}` : undefined}>
                          <div className="font-medium">
                            {yuzdeMetni(y)}
                            {duz && <sup className="ml-0.5 text-[9px]">d</sup>}
                          </div>
                          <div className="text-[10px]">
                            {tr.format(s.gorunen[m])} / {kap === null ? '—' : tr.format(kap)}
                          </div>
                          {s.sip[m] > 0 && (
                            <div className="text-[10px] text-slate-500">sip: {tr.format(s.sip[m])}</div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Hücre: plan / kapasite (adet). Yüzde atölyenin TOPLAM planından hesaplanır — klasman seçiliyken
        de (kapasite klasmanlar arasında paylaşılır). Yeşil ≤ %85, sarı ≤ %100, kırmızı &gt; %100.
        “sip”: atanmış gerçek siparişler (bitiş, yoksa teslim ayı; bilgi amaçlı). “d”: ay düzeltmesi.
        Satıra tıklayın: atölye paneli.
      </p>
    </div>
  )
}
