'use client'
import { AYLAR, ayToplamlari, hucreAdedi } from '@/lib/pes/yillik-plan'
import { ADET_HATASI, talepDurumuGoster, tr, type HataYaz, type Istek, type YillikPlanVerisi } from './ortak'

const topla = (a: number[]) => a.reduce((x, y) => x + y, 0)

/** Klasman × ay talep hedefi; her hücrenin altında yerleşen (Σ plan) ve açık/fazla. */
export default function TalepTablosu({ veri, istek, setHata }: {
  veri: YillikPlanVerisi; istek: Istek; setHata: HataYaz
}) {
  const satirlar = veri.klasman ? veri.katalog.filter((k) => k.code === veri.klasman) : veri.katalog

  /** Kayıtlı değerle aynıysa istek atılmaz; hata/başarısızlıkta girdi kayıtlı değere döner. */
  async function kaydet(girdi: HTMLInputElement, klasmanKodu: string, ay: number, kayitli: number) {
    const geri = () => { girdi.value = kayitli > 0 ? String(kayitli) : '' }
    const adet = hucreAdedi(girdi.value)
    if (adet === null) { setHata(ADET_HATASI); geri(); return }
    if (adet === kayitli) { geri(); return }
    const ok = await istek('/api/pes/yillik-plan/talep', 'PUT', { yil: veri.yil, ay, klasmanKodu, adet })
    if (!ok) geri()
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
              const yil = talepDurumuGoster(topla(talep), topla(yer))
              return (
                <tr key={k.code} className="border-t border-slate-100">
                  <td className="px-2 py-1 sticky left-0 z-10 bg-white whitespace-nowrap">
                    <div className="font-medium">{k.label}</div>
                    <div className="text-[10px] text-slate-400">{k.code}</div>
                  </td>
                  {talep.map((t, m) => {
                    const d = talepDurumuGoster(t, yer[m])
                    return (
                      <td key={m} className="px-1 py-1 w-24 min-w-24 text-center align-top">
                        <input aria-label={`${k.label} ${AYLAR[m]} talep`} key={`${k.code}-${m}-${t}`}
                               defaultValue={t > 0 ? String(t) : ''} inputMode="numeric"
                               className="w-20 rounded border border-slate-300 px-1 text-right"
                               onBlur={(e) => { kaydet(e.currentTarget, k.code, m + 1, t) }} />
                        <div className="text-[10px] text-slate-500">yer: {tr.format(yer[m])}</div>
                        <div className={`text-[10px] ${d.sinif}`}>{d.metin}</div>
                      </td>
                    )
                  })}
                  <td className="px-2 py-1 text-right align-top whitespace-nowrap">
                    <div>{tr.format(topla(talep))}</div>
                    <div className="text-[10px] text-slate-500">yer: {tr.format(topla(yer))}</div>
                    <div className={`text-[10px] ${yil.sinif}`}>{yil.metin}</div>
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
