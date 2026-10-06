'use client'
import { AYLAR, ayToplamlari, hucreAdedi, talepAcigi } from '@/lib/pes/yillik-plan'
import { ADET_HATASI, tr, type HataYaz, type Istek, type YillikPlanVerisi } from './ortak'

const topla = (a: number[]) => a.reduce((x, y) => x + y, 0)

/** Klasman × ay talep hedefi; her hücrenin altında yerleşen (Σ plan) ve açık/fazla. */
export default function TalepTablosu({ veri, istek, setHata }: {
  veri: YillikPlanVerisi; istek: Istek; setHata: HataYaz
}) {
  const satirlar = veri.klasman ? veri.katalog.filter((k) => k.code === veri.klasman) : veri.katalog

  async function kaydet(klasmanKodu: string, ay: number, ham: string) {
    const adet = hucreAdedi(ham)
    if (adet === null) { setHata(ADET_HATASI); return }
    await istek('/api/pes/yillik-plan/talep', 'PUT', { yil: veri.yil, ay, klasmanKodu, adet })
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-max">
          <thead>
            <tr>
              <th className="text-left px-2 py-1 sticky left-0 z-10 bg-white">Klasman</th>
              {AYLAR.map((ad) => <th key={ad} className="px-1 py-1 w-24">{ad}</th>)}
              <th className="px-2 py-1">Yıl</th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((k) => {
              const talep = ayToplamlari(veri.talepler, { klasman: k.code })
              const yer = ayToplamlari(veri.planlar, { klasman: k.code })
              const yil = talepAcigi(topla(talep), topla(yer))
              return (
                <tr key={k.code} className="border-t border-slate-100">
                  <td className="px-2 py-1 sticky left-0 z-10 bg-white whitespace-nowrap">
                    <div className="font-medium">{k.label}</div>
                    <div className="text-[10px] text-slate-400">{k.code}</div>
                  </td>
                  {talep.map((t, m) => {
                    const { acik, fazla } = talepAcigi(t, yer[m])
                    const eski = t > 0 ? String(t) : ''
                    return (
                      <td key={m} className="px-1 py-1 w-24 min-w-24 text-center align-top">
                        <input aria-label={`${k.label} ${AYLAR[m]} talep`} key={`${k.code}-${m}-${t}`}
                               defaultValue={eski} inputMode="numeric"
                               className="w-20 rounded border border-slate-300 px-1 text-right"
                               onBlur={(e) => { if (e.target.value.trim() !== eski) kaydet(k.code, m + 1, e.target.value) }} />
                        <div className="text-[10px] text-slate-500">yer: {tr.format(yer[m])}</div>
                        {(t > 0 || yer[m] > 0) && (
                          <div className={`text-[10px] ${acik > 0 ? 'text-red-600' : fazla > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                            {acik > 0 ? `açık ${tr.format(acik)}` : fazla > 0 ? `fazla ${tr.format(fazla)}` : 'tamam'}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-2 py-1 text-right align-top whitespace-nowrap">
                    <div>{tr.format(topla(talep))}</div>
                    <div className="text-[10px] text-slate-500">yer: {tr.format(topla(yer))}</div>
                    <div className={`text-[10px] ${yil.acik > 0 ? 'text-red-600' : yil.fazla > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {yil.acik > 0 ? `açık ${tr.format(yil.acik)}` : yil.fazla > 0 ? `fazla ${tr.format(yil.fazla)}` : 'tamam'}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Hücreye talep adedini yazın (20000 ya da 20.000); boş ya da 0 talebi siler.
        “yer”: o klasmanın tüm atölyelerdeki planı. Açık = talep − yerleşen.
      </p>
    </div>
  )
}
