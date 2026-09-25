'use client'

import { useState, useTransition, useMemo, Fragment } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  boyutUyumlari, uyumOzeti, genelUyum, uyariMetni,
  type AtolyeYetenegi, type GenelUyum,
} from '@/lib/pes/yetenek-uyum'
import { boyutAdi } from '@/lib/pes/yetenek-filtre'
import type { Kunye } from '@/lib/pes/kunye'

/**
 * Sürükle-bırak tezgâhı.
 *
 * YEREL HTML5 SÜRÜKLE-BIRAK kullanılıyor, kütüphane eklenmedi. Etkileşim
 * "kartı hücreye bırak"tan ibaret ve tarayıcı bunu zaten yapıyor; React 19
 * ile uyum riski olan bir bağımlılık taşımaya değmez.
 *
 * Çakışma ENGELLENMEZ, kırmızı gösterilir — planlamacı bilerek üst üste
 * koyabilmeli. Tezgâhın işi karar vermek değil, sonucu görünür kılmak.
 */

export type BantSatiri = {
  lineId: number
  bantAdi: string
  workshopId: number
  atolyeAdi: string
  atolyeKodu: string
  gunlukHedef: number
  /** tarih → o günkü kapasite */
  kapasite: Record<string, number>
}

export type HavuzKarti = {
  workOrderId: number
  isEmriNo: string
  modelAdi: string
  musteri: string
  adet: number
  teslim: string | null
  durum: string
  atolyeAdi: string | null
}

export type YerlesikKalem = {
  id: number
  workOrderId: number
  lineId: number
  baslangic: string
  bitis: string
  adet: number
  sigmadi: boolean
  isEmriNo: string
  modelAdi: string
  musteri: string
  teslim: string | null
  gunler: Array<{ tarih: string; adet: number }>
}

type Cakisma = { lineId: number; tarih: string; toplam: number; kapasite: number; kalemIdler: number[] }
type CitUyarisi = { kalemId: number; workOrderId: number; baslangic: string; kalanGun: number }

const GUN_ADI = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const tr = new Intl.NumberFormat('tr-TR')

function gunEtiketi(t: string) {
  const d = new Date(`${t}T00:00:00Z`)
  return { gun: d.getUTCDate(), ad: GUN_ADI[d.getUTCDay()], pazar: d.getUTCDay() === 0 }
}

export default function Tezgah({
  taslaklar, seciliTaslak, bantlar, gunler, havuz, yerlesik,
  cakismalar, atolyeYetenekleri, kunyeler, izlenenBoyutlar,
  citUyarilari, citGun, bugun,
}: {
  taslaklar: Array<{ id: number; ad: string; kalem: number }>
  seciliTaslak: number
  bantlar: BantSatiri[]
  gunler: string[]
  havuz: HavuzKarti[]
  yerlesik: YerlesikKalem[]
  cakismalar: Cakisma[]
  atolyeYetenekleri: Record<number, AtolyeYetenegi[]>
  kunyeler: Record<number, Kunye>
  izlenenBoyutlar: string[]
  citUyarilari: CitUyarisi[]
  citGun: number
  bugun: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [bekliyor, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [suruklenen, setSuruklenen] = useState<
    { tip: 'havuz'; wo: HavuzKarti } | { tip: 'yerlesik'; kalem: YerlesikKalem } | null
  >(null)
  const [hedef, setHedef] = useState<string | null>(null)
  const [yeniAd, setYeniAd] = useState('')
  const [arama, setArama] = useState('')

  const cakismaHucre = useMemo(() => {
    const s = new Set<string>()
    for (const c of cakismalar) s.add(`${c.lineId}|${c.tarih}`)
    return s
  }, [cakismalar])

  const citKalem = useMemo(
    () => new Map(citUyarilari.map((u) => [u.kalemId, u.kalanGun])),
    [citUyarilari])

  const izlenen = useMemo(() => new Set(izlenenBoyutlar), [izlenenBoyutlar])

  /* (iş emri, atölye) -> uyum. ENGELLEMEZ, gösterir: planlamacı bilerek
     uyumsuz atölyeye verebilmeli (numune olabilir, atölye yeni yetenek
     kazanmış ama katalog güncellenmemiş olabilir). */
  const uyum = useMemo(() => {
    const f = (woId: number, wsId: number): GenelUyum => {
      const k = kunyeler[woId]
      if (!k) return 'bilinmiyor'
      return genelUyum(uyumOzeti(boyutUyumlari(k, atolyeYetenekleri[wsId] ?? [], izlenen)))
    }
    return f
  }, [kunyeler, atolyeYetenekleri, izlenen])

  const uyariyi = useMemo(() => {
    return (woId: number, wsId: number): string | null => {
      const k = kunyeler[woId]
      if (!k) return null
      return uyariMetni(
        uyumOzeti(boyutUyumlari(k, atolyeYetenekleri[wsId] ?? [], izlenen)), boyutAdi)
    }
  }, [kunyeler, atolyeYetenekleri, izlenen])

  /* Sürüklenen işin bu atölyeye uyumu — grup başlığını boyamak için. */
  const suruklenenWoId = suruklenen
    ? (suruklenen.tip === 'havuz' ? suruklenen.wo.workOrderId : suruklenen.kalem.workOrderId)
    : null

  const gorunenHavuz = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr')
    if (!q) return havuz
    return havuz.filter((h) =>
      `${h.isEmriNo} ${h.modelAdi} ${h.musteri}`.toLocaleLowerCase('tr').includes(q))
  }, [havuz, arama])

  async function cagir(yol: string, yontem: string, govde: unknown) {
    setHata(null)
    const c = await fetch(yol, {
      method: yontem,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
    })
    if (!c.ok) {
      const g = await c.json().catch(() => ({}))
      setHata(g.error ?? `İşlem başarısız (${c.status})`)
      return false
    }
    basla(() => router.refresh())
    return true
  }

  async function birak(lineId: number, tarih: string) {
    setHedef(null)
    if (!suruklenen) return
    if (!seciliTaslak) { setHata('Önce bir taslak oluşturun'); return }

    if (suruklenen.tip === 'havuz') {
      await cagir('/api/pes/plan-tezgahi/kalem', 'POST', {
        taslak_id: seciliTaslak,
        work_order_id: suruklenen.wo.workOrderId,
        line_id: lineId,
        baslangic: tarih,
        adet: suruklenen.wo.adet || 1,
      })
    } else {
      await cagir('/api/pes/plan-tezgahi/kalem', 'PATCH', {
        id: suruklenen.kalem.id, line_id: lineId, baslangic: tarih,
      })
    }
    setSuruklenen(null)
  }

  const bag = (ek: Record<string, string>) => {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(ek)) p.set(k, v)
    return `/pes/plan-tezgahi?${p.toString()}`
  }

  /* Atölyeye göre gruplu bant satırları. */
  const gruplar = useMemo(() => {
    const m = new Map<number, { ad: string; kod: string; bantlar: BantSatiri[] }>()
    for (const b of bantlar) {
      if (!m.has(b.workshopId)) m.set(b.workshopId, { ad: b.atolyeAdi, kod: b.atolyeKodu, bantlar: [] })
      m.get(b.workshopId)!.bantlar.push(b)
    }
    return [...m.entries()]
  }, [bantlar])

  if (taslaklar.length === 0) {
    return (
      <div className="rounded border border-slate-200 p-6 space-y-3">
        <h2 className="font-medium">Henüz taslak yok</h2>
        <p className="text-sm text-slate-500 max-w-prose">
          Tezgâh bir taslak üzerinde çalışır. Taslak atölyeye görünmez ve
          kapasite tüketmez; denemelerinizi serbestçe yapabilirsiniz.
        </p>
        <div className="flex gap-2">
          <input value={yeniAd} onChange={(e) => setYeniAd(e.target.value)}
                 placeholder="Taslak adı — örn. Ekim A planı"
                 className="rounded border border-slate-300 px-3 py-1.5 text-sm w-72" />
          <button
            disabled={bekliyor || !yeniAd.trim()}
            onClick={() => cagir('/api/pes/plan-tezgahi', 'POST', { ad: yeniAd })}
            className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
            Oluştur
          </button>
        </div>
        {hata && <p className="text-sm text-red-600">{hata}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ——— Taslak seçimi ve uyarılar ——— */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={seciliTaslak}
          onChange={(e) => router.push(bag({ taslak: e.target.value }))}
          className="rounded border border-slate-300 px-2 py-1 text-sm">
          {taslaklar.map((t) => (
            <option key={t.id} value={t.id}>{t.ad} ({t.kalem})</option>
          ))}
        </select>

        <div className="flex gap-2 items-center">
          <input value={yeniAd} onChange={(e) => setYeniAd(e.target.value)}
                 placeholder="yeni taslak"
                 className="rounded border border-slate-300 px-2 py-1 text-sm w-44" />
          <button
            disabled={bekliyor || !yeniAd.trim()}
            onClick={() => cagir('/api/pes/plan-tezgahi', 'POST', { ad: yeniAd })}
            className="px-2 py-1 rounded border border-slate-300 text-sm disabled:opacity-50">
            + ekle
          </button>
        </div>

        {cakismalar.length > 0 && (
          <span className="text-sm px-2 py-1 rounded bg-red-100 text-red-800">
            {cakismalar.length} gün kapasite aşımı
          </span>
        )}
        {citUyarilari.length > 0 && (
          <span className="text-sm px-2 py-1 rounded bg-amber-100 text-amber-800"
                title={`Başlangıcına ${citGun} günden az kalan işler`}>
            {citUyarilari.length} iş zaman çitinde
          </span>
        )}
        {hata && <span className="text-sm text-red-600">{hata}</span>}
      </div>

      <div className="flex gap-3 items-start">
        {/* ——— Sol panel: havuz ——— */}
        <aside className="w-64 shrink-0 space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Yerleştirilmemiş</h2>
            <span className="text-xs text-slate-400">{gorunenHavuz.length}</span>
          </div>
          <input value={arama} onChange={(e) => setArama(e.target.value)}
                 placeholder="ara: iş emri, model, müşteri"
                 className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />

          <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
            {gorunenHavuz.map((h) => (
              <article
                key={h.workOrderId}
                draggable
                onDragStart={() => setSuruklenen({ tip: 'havuz', wo: h })}
                onDragEnd={() => { setSuruklenen(null); setHedef(null) }}
                className="rounded border border-slate-200 bg-white p-2 cursor-grab active:cursor-grabbing hover:border-slate-400">
                <div className="text-xs font-medium truncate">{h.isEmriNo}</div>
                <div className="text-[11px] text-slate-500 truncate">{h.modelAdi}</div>
                <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                  <span>{tr.format(h.adet)} adet</span>
                  {h.teslim && <span>{h.teslim.slice(5)}</span>}
                </div>
                {h.atolyeAdi && (
                  <div className="text-[10px] text-slate-400 truncate">{h.atolyeAdi}</div>
                )}
              </article>
            ))}
            {gorunenHavuz.length === 0 && (
              <p className="text-xs text-slate-400 py-4 text-center">
                {arama ? 'eşleşen iş emri yok' : 'yerleştirilecek iş emri yok'}
              </p>
            )}
          </div>
        </aside>

        {/* ——— Sağ: ızgara ——— */}
        <div className="flex-1 min-w-0 overflow-x-auto rounded border border-slate-200">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 border-b border-r border-slate-200 px-2 py-1 text-left font-medium w-44">
                  Bant
                </th>
                {gunler.map((g) => {
                  const e = gunEtiketi(g)
                  return (
                    <th key={g}
                        className={`border-b border-slate-200 px-1 py-1 w-10 font-normal ${
                          e.pazar ? 'bg-slate-100 text-slate-400' : 'bg-slate-50'} ${
                          g === bugun ? 'ring-1 ring-inset ring-slate-900' : ''}`}>
                      <div className="font-medium">{e.gun}</div>
                      <div className="text-[10px] text-slate-400">{e.ad}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {gruplar.map(([wsId, grup]) => (
                <Fragment key={wsId}>
                  <tr>
                    <td colSpan={gunler.length + 1}
                        className={`sticky left-0 border-b border-slate-200 px-2 py-1 font-medium ${
                          suruklenenWoId !== null && uyum(suruklenenWoId, wsId) === 'uyumsuz'
                            ? 'bg-amber-100' : 'bg-slate-100'}`}>
                      {grup.ad} {grup.kod && <span className="text-slate-400">· {grup.kod}</span>}
                      {/* Sürüklenen iş bu atölyeye uymuyorsa söyler, ENGELLEMEZ. */}
                      {suruklenenWoId !== null && (() => {
                        const u = uyum(suruklenenWoId, wsId)
                        if (u === 'uyumsuz') {
                          return (
                            <span className="ml-2 text-xs font-normal text-amber-800">
                              {uyariyi(suruklenenWoId, wsId)}
                            </span>
                          )
                        }
                        if (u === 'bilinmiyor') {
                          return (
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              uygunluk kontrol edilemedi — künye ya da yetenek kaydı eksik
                            </span>
                          )
                        }
                        return (
                          <span className="ml-2 text-xs font-normal text-emerald-700">
                            yetenek uyumlu
                          </span>
                        )
                      })()}
                    </td>
                  </tr>
                  {grup.bantlar.map((b) => {
                    const kalemler = yerlesik.filter((y) => y.lineId === b.lineId)
                    return (
                      <tr key={b.lineId}>
                        <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-2 py-1">
                          <div className="font-medium truncate">{b.bantAdi}</div>
                          <div className="text-[10px] text-slate-400">{tr.format(b.gunlukHedef)}/gün</div>
                        </td>
                        {gunler.map((g) => {
                          const kap = b.kapasite[g] ?? 0
                          const uzerinde = hedef === `${b.lineId}|${g}`
                          const cakisik = cakismaHucre.has(`${b.lineId}|${g}`)
                          const buGun = kalemler.filter((k) => k.gunler.some((x) => x.tarih === g))
                          const dolu = buGun.length > 0
                          const citli = buGun.some((k) => citKalem.has(k.id))

                          return (
                            <td
                              key={g}
                              onDragOver={(e) => { e.preventDefault(); setHedef(`${b.lineId}|${g}`) }}
                              onDragLeave={() => setHedef(null)}
                              onDrop={(e) => { e.preventDefault(); birak(b.lineId, g) }}
                              title={
                                dolu
                                  ? buGun.map((k) => `${k.isEmriNo} · ${tr.format(
                                      k.gunler.find((x) => x.tarih === g)?.adet ?? 0)} adet`).join('\n')
                                  : kap > 0 ? `kapasite ${tr.format(kap)}` : 'kapasite yok'
                              }
                              className={`border-b border-slate-100 h-9 align-middle text-center cursor-pointer ${
                                uzerinde ? 'bg-slate-900/10 outline outline-1 outline-slate-900' :
                                cakisik ? 'bg-red-200' :
                                dolu ? (citli ? 'bg-amber-200' : 'bg-emerald-200') :
                                kap === 0 ? 'bg-slate-100' : 'bg-white hover:bg-slate-50'
                              }`}>
                              {dolu && (
                                <span className="text-[10px] text-slate-700">
                                  {tr.format(buGun.reduce((t, k) =>
                                    t + (k.gunler.find((x) => x.tarih === g)?.adet ?? 0), 0))}
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>

          {bantlar.length === 0 && (
            <p className="p-4 text-sm text-slate-500">
              Tahtada gösterilecek aktif bant yok.
            </p>
          )}
        </div>
      </div>

      {/* ——— Yerleşik kalemler listesi (taşı / kaldır) ——— */}
      {yerlesik.length > 0 && (
        <section className="rounded border border-slate-200">
          <h2 className="px-3 py-2 text-sm font-semibold border-b border-slate-200">
            Bu taslakta yerleşenler ({yerlesik.length})
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {yerlesik.map((k) => {
                const cit = citKalem.get(k.id)
                return (
                  <tr key={k.id} className="border-b border-slate-100 last:border-0"
                      draggable
                      onDragStart={() => setSuruklenen({ tip: 'yerlesik', kalem: k })}
                      onDragEnd={() => { setSuruklenen(null); setHedef(null) }}>
                    <td className="px-3 py-1.5 cursor-grab">
                      <span className="font-medium">{k.isEmriNo}</span>
                      <span className="text-slate-400"> · {k.modelAdi}</span>
                    </td>
                    <td className="px-3 py-1.5 tabular-nums">{tr.format(k.adet)}</td>
                    <td className="px-3 py-1.5 text-slate-600">{k.baslangic} → {k.bitis}</td>
                    <td className="px-3 py-1.5">
                      {k.sigmadi && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-800"
                              title="Bandın kapasitesi yok ya da adet 200 iş gününe sığmadı">
                          yerleşmedi
                        </span>
                      )}
                      {cit !== undefined && (
                        <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          {cit < 0 ? `${-cit} gün geçmişte` : `${cit} gün kaldı`}
                        </span>
                      )}
                      {k.teslim && k.bitis > k.teslim && (
                        <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-800"
                              title={`Teslim ${k.teslim}`}>
                          teslimi aşıyor
                        </span>
                      )}
                      {(() => {
                        const bant = bantlar.find((b) => b.lineId === k.lineId)
                        if (!bant) return null
                        const u = uyum(k.workOrderId, bant.workshopId)
                        if (u !== 'uyumsuz') return null
                        return (
                          <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"
                                title={uyariyi(k.workOrderId, bant.workshopId) ?? ''}>
                            yetenek uyumsuz
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        disabled={bekliyor}
                        onClick={() => cagir('/api/pes/plan-tezgahi/kalem', 'DELETE', { id: k.id })}
                        className="text-xs underline text-slate-500 hover:text-red-700 disabled:opacity-50">
                        kaldır
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-xs text-slate-400">
        Kartı ızgaraya sürükleyin. Bitiş tarihi bandın kapasitesinden türetilir.
        Kırmızı hücre kapasite aşımıdır — engellenmez, yalnız gösterilir.
      </p>
    </div>
  )
}
