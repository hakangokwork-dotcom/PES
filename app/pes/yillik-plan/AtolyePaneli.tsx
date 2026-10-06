'use client'
import { useState } from 'react'
import {
  AYLAR, KAYNAK_ACIKLAMA, KAYNAK_ETIKET,
  ayToplamlari, dolulukYuzdesi, hucreAdedi, klasmanUyumu, yuzdeMetni,
  type AtolyeKapasitesi, type PlanSatiri,
} from '@/lib/pes/yillik-plan'
import { ADET_HATASI, btn, gonder, inp, tr, type HataYaz, type Istek, type YillikPlanVerisi } from './ortak'

type Ortak = { atolye: AtolyeKapasitesi; veri: YillikPlanVerisi; istek: Istek; setHata: HataYaz }

const UYUMSUZ_UYARI = 'Bu atölyede bu klasman yeteneği kayıtlı değil — yine de planlanabilir'

export default function AtolyePaneli({ atolye, veri, istek, setHata, kapat }: Ortak & { kapat: () => void }) {
  const planlar = veri.planlar.filter((p) => p.workshopId === atolye.workshopId)
  const toplam = ayToplamlari(planlar)

  async function bazKaydet(f: FormData) {
    const ham = String(f.get('baz') ?? '').trim()
    const n = ham === '' ? null : hucreAdedi(ham)
    if (ham !== '' && n === null) { setHata(ADET_HATASI); return }
    await istek('/api/pes/yillik-plan/kapasite', 'PUT', { workshopId: atolye.workshopId, aylikKapasite: n })
  }

  return (
    <aside className="self-start space-y-3 rounded border border-slate-200 bg-white p-3 text-sm xl:sticky xl:top-4 xl:max-h-[85vh] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{atolye.kod} — {atolye.ad}</div>
          <div className="text-xs text-slate-500">
            Hat hedefi toplamı: {tr.format(atolye.gunlukHedef)}/gün · baz:{' '}
            <span title={KAYNAK_ACIKLAMA[atolye.bazKaynak]}>{KAYNAK_ETIKET[atolye.bazKaynak]}</span>
          </div>
        </div>
        <button type="button" onClick={kapat} aria-label="Paneli kapat"
                className="text-slate-500 hover:text-slate-900">✕</button>
      </div>

      <form key={`baz-${atolye.profilKapasite ?? ''}`} onSubmit={gonder(bazKaydet)} className="flex items-end gap-2">
        <label className="flex-1 text-xs text-slate-600">
          Baz aylık kapasite (adet)
          <input name="baz" defaultValue={atolye.profilKapasite ?? ''} inputMode="numeric" className={inp}
                 placeholder={atolye.atolyeKapasite ? `boş: beyan (${tr.format(atolye.atolyeKapasite)})` : atolye.gunlukHedef > 0 ? 'boş: hat hedefinden tahmin' : 'boş: kapasite yok'} />
        </label>
        <button className={btn}>Kaydet</button>
      </form>
      <p className="text-[11px] text-slate-500">
        Atölye profiline yazılır. Profil içe aktarımı bu değeri sonradan ezebilir.
      </p>

      <div className="space-y-2">
        {AYLAR.map((ad, m) => (
          <AyBolumu key={m} ay={m + 1} ad={ad} atolye={atolye} veri={veri} istek={istek} setHata={setHata}
                    planlar={planlar.filter((p) => p.ay === m + 1)} toplam={toplam[m]} />
        ))}
      </div>
    </aside>
  )
}

function AyBolumu({ ay, ad, atolye, veri, istek, setHata, planlar, toplam }: Ortak & {
  ay: number; ad: string; planlar: PlanSatiri[]; toplam: number
}) {
  const dolu = new Set(planlar.map((p) => p.klasmanKodu))
  const [yeni, setYeni] = useState(veri.klasman && !dolu.has(veri.klasman) ? veri.klasman : '')
  const kap = atolye.kapasite[ay - 1]
  const kaynak = atolye.kaynak[ay - 1]
  const duz = atolye.duzeltme[ay - 1]
  const y = dolulukYuzdesi(toplam, kap)
  const etiket = (kod: string) => veri.katalog.find((k) => k.code === kod)?.label ?? kod
  const uyumsuz = (kod: string) =>
    kod !== '' && klasmanUyumu(kod, atolye.klasmanlar, veri.klasmanIzleniyor) === 'uyumsuz'
  const govde = (klasmanKodu: string, adet: number, notMetni: string) =>
    ({ workshopId: atolye.workshopId, yil: veri.yil, ay, klasmanKodu, adet, notMetni })

  function oku(ham: string): number | null {
    const n = hucreAdedi(ham)
    if (n === null) setHata(ADET_HATASI)
    return n
  }

  async function satirKaydet(p: PlanSatiri, f: FormData) {
    const n = oku(String(f.get('adet') ?? ''))
    if (n === null) return
    await istek('/api/pes/yillik-plan/plan', 'PUT', govde(p.klasmanKodu, n, String(f.get('not') ?? '')))
  }

  async function ekle(f: FormData, form: HTMLFormElement) {
    if (!yeni) { setHata('Klasman seçin'); return }
    const n = oku(String(f.get('adet') ?? ''))
    if (n === null) return
    if (n === 0) { setHata('Adet sıfırdan büyük olmalı'); return }
    if (await istek('/api/pes/yillik-plan/plan', 'PUT', govde(yeni, n, String(f.get('not') ?? '')))) {
      form.reset()
      setYeni('')
    }
  }

  async function duzeltmeKaydet(f: FormData) {
    const ham = String(f.get('adet') ?? '').trim()
    const n = ham === '' ? null : oku(ham)
    if (ham !== '' && n === null) return
    await istek('/api/pes/yillik-plan/kapasite-ay', 'PUT', {
      workshopId: atolye.workshopId, yil: veri.yil, ay, adet: n, sebep: String(f.get('sebep') ?? ''),
    })
  }

  return (
    <section className="space-y-1.5 rounded border border-slate-200 p-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">{ad}</span>
        <span className="text-slate-600">
          plan {tr.format(toplam)} / {kap === null ? 'kapasite yok' : tr.format(kap)} · {yuzdeMetni(y)}
          <span className="ml-1 text-[10px] text-slate-400" title={KAYNAK_ACIKLAMA[kaynak]}>
            ({KAYNAK_ETIKET[kaynak]})
          </span>
        </span>
      </div>

      {planlar.map((p) => (
        <form key={`${p.id}-${p.adet}-${p.notMetni ?? ''}`} onSubmit={gonder((f) => satirKaydet(p, f))}
              className="grid grid-cols-[1fr_5.5rem_1fr_auto_auto] items-center gap-1">
          <span className={`truncate text-xs ${uyumsuz(p.klasmanKodu) ? 'text-amber-700' : ''}`}
                title={uyumsuz(p.klasmanKodu) ? UYUMSUZ_UYARI : p.klasmanKodu}>
            {etiket(p.klasmanKodu)}{uyumsuz(p.klasmanKodu) && ' ⚠'}
          </span>
          <input name="adet" aria-label={`${ad} ${etiket(p.klasmanKodu)} adet`} defaultValue={p.adet}
                 inputMode="numeric" className={`${inp} text-right`} />
          <input name="not" aria-label={`${ad} ${etiket(p.klasmanKodu)} not`} defaultValue={p.notMetni ?? ''}
                 placeholder="not" className={inp} />
          <button className={btn}>Kaydet</button>
          <button type="button" className="text-xs text-red-600 underline"
                  onClick={() => istek(`/api/pes/yillik-plan/plan?id=${p.id}`, 'DELETE')}>Sil</button>
        </form>
      ))}

      <form onSubmit={gonder(ekle)} className="grid grid-cols-[1fr_5.5rem_1fr_auto] items-center gap-1">
        <select aria-label={`${ad} yeni klasman`} value={yeni} onChange={(e) => setYeni(e.target.value)} className={inp}>
          <option value="">Klasman…</option>
          {veri.katalog.filter((k) => !dolu.has(k.code)).map((k) => (
            <option key={k.code} value={k.code}>{k.label}</option>
          ))}
        </select>
        <input name="adet" aria-label={`${ad} yeni adet`} inputMode="numeric" placeholder="adet"
               className={`${inp} text-right`} />
        <input name="not" aria-label={`${ad} yeni not`} placeholder="not" className={inp} />
        <button className={btn}>Ekle</button>
      </form>
      {uyumsuz(yeni) && <p className="text-[11px] text-amber-700">{UYUMSUZ_UYARI}</p>}

      <form key={`duz-${duz?.adet ?? ''}-${duz?.sebep ?? ''}`} onSubmit={gonder(duzeltmeKaydet)}
            className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-1"
            title="Bu ayın kapasitesini ezer; 0 = kapalı. Boş bırakıp kaydetmek düzeltmeyi kaldırır.">
        <input name="adet" aria-label={`${ad} kapasite düzeltmesi`} defaultValue={duz?.adet ?? ''}
               inputMode="numeric" placeholder="düzeltme" className={`${inp} text-right`} />
        <input name="sebep" aria-label={`${ad} düzeltme sebebi`} defaultValue={duz?.sebep ?? ''}
               placeholder="sebep (ör. bayram)" className={inp} />
        <button className={btn}>{duz ? 'Güncelle' : 'Düzelt'}</button>
      </form>
    </section>
  )
}
