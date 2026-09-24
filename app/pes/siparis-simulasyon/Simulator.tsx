'use client'

import { useMemo, useState } from 'react'
import {
  senaryoHesapla, karsilastir, mtmDuyarliligi,
  type SenaryoParam,
} from '@/lib/pes/siparis-senaryo'
import { fastTrackTesvik, garantiDegeri, gecikmeKesintisi } from '@/lib/pes/tesvik'

export type AtolyeSecenegi = {
  id: number
  ad: string
  dikimDkMaliyet: number | null
  dakikaMarji: number | null
  dikimKisi: number | null
  gunlukKapasiteDk: number | null
}

export type BultenSecenegi = {
  id: number
  ad: string
  kesimSn: number
  dikimSn: number
  ukpSn: number
}

type UretimParam = {
  workshopId: number
  degisimDk: number | null
  ogrenmeOrani: number | null
  ilkBirimCarpani: number | null
  kaynak: string
}

const tl = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const tl2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 1 })
const f = (v: number | null, n = tl) => (v === null || !Number.isFinite(v) ? '—' : n.format(v))

/** Varsayım rozeti — ölçülmüş sayıdan ayırt edilsin. */
function Varsayim({ kaynak }: { kaynak?: string }) {
  const olcum = kaynak === 'olcum'
  return (
    <span className={`ml-1 align-middle text-[10px] px-1 py-0.5 rounded ${
      olcum ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
      {olcum ? 'ölçüm' : kaynak === 'beyan' ? 'beyan' : 'varsayım'}
    </span>
  )
}

export default function Simulator({
  atolyeler, bultenler, uretimParam, effSewing, hedefMarj, varsayilan,
}: {
  atolyeler: AtolyeSecenegi[]
  bultenler: BultenSecenegi[]
  uretimParam: UretimParam[]
  effSewing: number
  hedefMarj: number
  varsayilan: SenaryoParam
}) {
  const [atolyeId, setAtolyeId] = useState(atolyeler[0]?.id ?? 0)
  const [bultenId, setBultenId] = useState(bultenler[0]?.id ?? 0)
  const [toplamAdet, setToplamAdet] = useState(50_000)
  const [partiA, setPartiA] = useState(1)
  const [partiB, setPartiB] = useState(10)

  /* Fast-track girdileri */
  const [ftBant, setFtBant] = useState(3)
  const [ftParti, setFtParti] = useState(2)
  const [normalPay, setNormalPay] = useState(0.4)
  const [ftPay, setFtPay] = useState(1)
  const [mesaiDk, setMesaiDk] = useState(5_000)
  const [mesaiZam, setMesaiZam] = useState(0.5)
  const [otelenen, setOtelenen] = useState(1)
  const [garantiGun, setGarantiGun] = useState(10)
  const [gecikenGun, setGecikenGun] = useState(0)
  const [gecikmeOran, setGecikmeOran] = useState(0.01)

  const atolye = atolyeler.find((a) => a.id === atolyeId) ?? atolyeler[0]
  const bulten = bultenler.find((b) => b.id === bultenId) ?? bultenler[0]
  const wp = uretimParam.find((u) => u.workshopId === atolyeId)

  /* Atölyeye özel parametre varsa o, yoksa varsayılan. */
  const param: SenaryoParam = {
    degisimDk: wp?.degisimDk ?? varsayilan.degisimDk,
    ogrenmeOrani: wp?.ogrenmeOrani ?? varsayilan.ogrenmeOrani,
    ilkBirimCarpani: wp?.ilkBirimCarpani ?? varsayilan.ilkBirimCarpani,
  }
  const paramKaynak = wp?.kaynak ?? 'varsayim'

  /* Kararlı birim dakika: DİKİM SAM'i ÷ dikim verimliliği. Bu GERÇEK —
     E3'ün MTM ölçümünden ve E0'ın parametresinden geliyor. */
  const kararliBirimDk = effSewing > 0 ? bulten.dikimSn / 60 / effSewing : 0

  const ortak = {
    toplamAdet,
    kararliBirimDk,
    gunlukKapasiteDk: atolye.gunlukKapasiteDk ?? 0,
    dikimDkMaliyet: atolye.dikimDkMaliyet,
    param,
  }

  const sA = useMemo(() => senaryoHesapla({ ...ortak, partiSayisi: partiA, bantSayisi: 1 }),
    [toplamAdet, partiA, kararliBirimDk, atolye, param])
  const sB = useMemo(() => senaryoHesapla({ ...ortak, partiSayisi: partiB, bantSayisi: 1 }),
    [toplamAdet, partiB, kararliBirimDk, atolye, param])
  const kars = karsilastir(sA, sB)

  /* Normal: siparişe atölyenin bir kısmı ayrılmış. Fast-track: daha büyük
     pay (başka iş ötelenir) + mesai. Bant bölmek kapasiteyi ARTIRMAZ,
     yalnız kurulum kaybını katlar. */
  const ftNormal = useMemo(
    () => senaryoHesapla({ ...ortak, partiSayisi: 1, bantSayisi: 1, kapasitePayi: normalPay }),
    [toplamAdet, normalPay, kararliBirimDk, atolye, param])
  const ftHizli = useMemo(
    () => senaryoHesapla({
      ...ortak, partiSayisi: ftParti, bantSayisi: ftBant,
      kapasitePayi: ftPay, ekGunlukKapasiteDk: mesaiDk,
    }),
    [toplamAdet, ftParti, ftBant, ftPay, mesaiDk, kararliBirimDk, atolye, param])

  const tesvik = fastTrackTesvik({
    normal: ftNormal, hizli: ftHizli, adet: toplamAdet,
    dikimDkMaliyet: atolye.dikimDkMaliyet,
    mesaiDk: mesaiDk * (ftHizli.gun ?? 0), mesaiZamOrani: mesaiZam,
    otelenenDegisimSayisi: otelenen, degisimDk: param.degisimDk,
    hedefMarj,
  })

  const garanti = garantiDegeri(garantiGun, atolye.gunlukKapasiteDk ?? 0, atolye.dakikaMarji)
  const siparisTutar = (ftNormal.maliyet ?? 0) * (1 + hedefMarj)
  const kesinti = gecikmeKesintisi(gecikenGun, siparisTutar, gecikmeOran)

  const Sayi = ({ etiket, deger, birim, ipucu }: {
    etiket: string; deger: string; birim?: string; ipucu?: string
  }) => (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{etiket}</div>
      <div className="text-lg font-semibold tabular-nums">
        {deger}{birim && <span className="text-sm font-normal text-slate-500"> {birim}</span>}
      </div>
      {ipucu && <div className="text-[11px] text-slate-400">{ipucu}</div>}
    </div>
  )

  const Alan = ({ etiket, deger, setDeger, adim = 1, ek }: {
    etiket: string; deger: number; setDeger: (n: number) => void; adim?: number; ek?: React.ReactNode
  }) => (
    <label className="block text-sm">
      <span className="block text-slate-600 text-xs">{etiket}{ek}</span>
      <input type="number" min={0} step={adim} value={deger}
             onChange={(e) => setDeger(Number(e.target.value))}
             className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 tabular-nums" />
    </label>
  )

  return (
    <div className="space-y-6">
      {/* ——— Seçim ——— */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded border border-slate-200 p-4">
        <label className="block text-sm">
          <span className="block text-xs text-slate-600">Atölye</span>
          <select value={atolyeId} onChange={(e) => setAtolyeId(Number(e.target.value))}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1">
            {atolyeler.map((a) => <option key={a.id} value={a.id}>{a.ad}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="block text-xs text-slate-600">Model bülteni</span>
          <select value={bultenId} onChange={(e) => setBultenId(Number(e.target.value))}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1">
            {bultenler.map((b) => <option key={b.id} value={b.id}>{b.ad}</option>)}
          </select>
        </label>
        <Alan etiket="Toplam adet" deger={toplamAdet} setDeger={setToplamAdet} adim={1000} />
        <div className="text-sm">
          <div className="text-xs text-slate-600">Kararlı birim süre</div>
          <div className="mt-1 font-semibold tabular-nums">{tl2.format(kararliBirimDk)} dk</div>
          <div className="text-[11px] text-slate-400">
            {tl.format(bulten.dikimSn)} sn ÷ 60 ÷ {pct.format(effSewing)}
            <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-800">ölçüm</span>
          </div>
        </div>
      </section>

      {/* ——— Varsayımlar ——— */}
      <section className="rounded border border-amber-200 bg-amber-50 p-4 text-sm">
        <div className="font-medium mb-2">
          Varsayımlar — PES&apos;te gerçek model değişim ölçümü yok
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <span className="text-xs text-slate-600">Model değişim süresi</span>
            <div className="font-semibold tabular-nums">
              {tl2.format(param.degisimDk)} dk<Varsayim kaynak={paramKaynak} />
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-600">Öğrenme oranı</span>
            <div className="font-semibold tabular-nums">
              {pct.format(param.ogrenmeOrani)}<Varsayim kaynak={paramKaynak} />
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-600">İlk birim çarpanı</span>
            <div className="font-semibold tabular-nums">
              {tl2.format(param.ilkBirimCarpani)}×<Varsayim kaynak={paramKaynak} />
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Dakika maliyeti ve MTM süresi gerçek ölçümdür; bu üç sayı değildir.
          Atölye bazında düzenlenebilir (<code>workshop_uretim_param</code>).
        </p>
      </section>

      {/* ——— Soru 1: parti büyüklüğü ——— */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Parti büyüklüğünün etkisi
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[{ s: sA, p: partiA, set: setPartiA, ad: 'A' }, { s: sB, p: partiB, set: setPartiB, ad: 'B' }]
            .map(({ s, p, set, ad }) => (
            <div key={ad} className="rounded border border-slate-200 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Senaryo {ad}</span>
                <input type="number" min={1} value={p} onChange={(e) => set(Math.max(1, Number(e.target.value)))}
                       className="w-16 rounded border border-slate-300 px-2 py-0.5 text-sm tabular-nums" />
                <span className="text-xs text-slate-500">
                  parti × {tl.format(Math.round(toplamAdet / Math.max(1, p)))} adet
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Sayi etiket="Toplam bant dakikası" deger={f(s.toplamDk)} birim="dk" />
                <Sayi etiket="Süre" deger={f(s.gun, tl2)} birim="gün" />
                <Sayi etiket="Değişim kaybı" deger={f(s.degisimKaybiDk)} birim="dk"
                      ipucu={`${s.degisimSayisi} değişim`} />
                <Sayi etiket="Öğrenme kaybı" deger={f(s.ogrenmeKaybiDk)} birim="dk" />
                <Sayi etiket="Toplam maliyet" deger={f(s.maliyet)} birim="₺" />
                <Sayi etiket="Birim maliyet" deger={f(s.birimMaliyet, tl2)} birim="₺/adet" />
              </div>
              <div className="text-xs text-slate-500">
                Kayıp payı: <strong>{pct.format(s.kayipPayi)}</strong>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded border border-slate-900 p-4">
          <div className="text-sm font-medium mb-2">
            B, A&apos;ya göre ne kadar pahalı?
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Sayi etiket="Fazla dakika" deger={f(kars.farkDk)} birim="dk" />
            <Sayi etiket="Fazla gün" deger={f(kars.farkGun, tl2)} birim="gün" />
            <Sayi etiket="Fazla maliyet" deger={f(kars.farkMaliyet)} birim="₺" />
            <Sayi etiket="Oran" deger={kars.farkOran === null ? '—' : pct.format(kars.farkOran)} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Saf dikim dakikası iki senaryoda AYNI ({f(sA.dikimDk)} dk). Bütün fark
            değişim ve öğrenme kaybından geliyor — ve kayıp parti sayısıyla doğrusal artıyor.
          </p>
        </div>
      </section>

      {/* ——— Soru 3: MTM duyarlılığı ——— */}
      <section className="rounded border border-slate-200 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
          MTM değişimi ↔ çıktı
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[-0.2, -0.1, -0.05, 0.05, 0.1].map((d) => {
            const c = mtmDuyarliligi(d)
            return (
              <div key={d}>
                <div className="text-[11px] text-slate-400">
                  süre {d > 0 ? '+' : ''}{pct.format(d)}
                </div>
                <div className={`text-lg font-semibold tabular-nums ${
                  (c ?? 0) > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {c === null ? '—' : `${c > 0 ? '+' : ''}${pct.format(c)}`}
                </div>
                <div className="text-[11px] text-slate-400">çıktı</div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          İlişki ters orantılı: süre %10 düşerse çıktı %11,1 artar. Simetrik değildir.
        </p>
      </section>

      {/* ——— Soru 4: fast-track teşvik ——— */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Fast-track ve adil teşvik
        </h2>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 rounded border border-slate-200 p-4">
          <Alan etiket="Normal kapasite payı" deger={normalPay} setDeger={setNormalPay} adim={0.05} />
          <Alan etiket="Fast-track payı" deger={ftPay} setDeger={setFtPay} adim={0.05} />
          <Alan etiket="Günlük mesai dk" deger={mesaiDk} setDeger={setMesaiDk} adim={500} />
          <Alan etiket="Mesai zammı" deger={mesaiZam} setDeger={setMesaiZam} adim={0.05} />
          <Alan etiket="Parti sayısı" deger={ftParti} setDeger={setFtParti} />
          <Alan etiket="Paralel bant" deger={ftBant} setDeger={setFtBant} />
          <Alan etiket="Ötelenen değişim" deger={otelenen} setDeger={setOtelenen} />
          <Alan etiket="Garanti gün" deger={garantiGun} setDeger={setGarantiGun} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded border border-slate-200 p-4 space-y-3">
            <div className="text-sm font-medium">Fast-track atölyeye neye mal oluyor</div>
            <div className="grid grid-cols-2 gap-3">
              <Sayi etiket="Ek bant dakikası" deger={f(tesvik.ekDakika)} birim="dk"
                    ipucu={`${ftHizli.degisimSayisi} değişim (${ftBant} bant × ${ftParti} parti)`} />
              <Sayi etiket="Ek dakika maliyeti" deger={f(tesvik.ekDakikaMaliyeti)} birim="₺" />
              <Sayi etiket="Mesai zammı" deger={f(tesvik.mesaiZamMaliyeti)} birim="₺" />
              <Sayi etiket="Öteleme maliyeti" deger={f(tesvik.otelemeMaliyeti)} birim="₺" />
            </div>
            <div className="pt-2 border-t border-slate-200">
              <Sayi etiket="Toplam ek maliyet" deger={f(tesvik.toplamEkMaliyet)} birim="₺" />
            </div>
            <p className="text-xs text-slate-500">
              Süre {f(ftNormal.gun, tl2)} günden {f(ftHizli.gun, tl2)} güne iniyor.
              Bunu sağlayan <strong>kapasite payı</strong> ({pct.format(normalPay)} →{' '}
              {pct.format(ftPay)}) ve <strong>mesai</strong>; bant bölmek süreyi
              kısaltmaz, aynı kadro bölünür — yalnız kurulum kaybını katlar
              ({ftHizli.degisimSayisi} kurulum).
            </p>
          </div>

          <div className="rounded border border-slate-900 p-4 space-y-3">
            <div className="text-sm font-medium">Adil teşvik</div>
            <div className="grid grid-cols-2 gap-3">
              <Sayi etiket="Adil prim" deger={f(tesvik.adilPrimAdet, tl2)} birim="₺/adet"
                    ipucu={`ek maliyet ÷ adet × (1 + ${pct.format(hedefMarj)})`} />
              <Sayi etiket="Prim oranı"
                    deger={tesvik.adilPrimOran === null ? '—' : pct.format(tesvik.adilPrimOran)}
                    ipucu="normal birim maliyete göre" />
              <Sayi etiket="Garantili hacim değeri" deger={f(garanti)} birim="₺"
                    ipucu={`${garantiGun} gün × dakika marjı`} />
              <Sayi etiket="Prim toplamı"
                    deger={f(tesvik.adilPrimAdet === null ? null : tesvik.adilPrimAdet * toplamAdet)}
                    birim="₺" />
            </div>
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="flex gap-3 items-end">
                <Alan etiket="Geciken gün" deger={gecikenGun} setDeger={setGecikenGun} />
                <Alan etiket="Günlük kesinti oranı" deger={gecikmeOran} setDeger={setGecikmeOran} adim={0.005} />
              </div>
              <Sayi etiket="Gecikme kesintisi" deger={f(kesinti)} birim="₺"
                    ipucu="tavan: sipariş tutarının %10'u" />
            </div>
            <p className="text-xs text-slate-500">
              Prim keyfi bir yüzde değil: atölyenin uğradığı ölçülebilir kaybın
              karşılığı + hedef marj payı.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
