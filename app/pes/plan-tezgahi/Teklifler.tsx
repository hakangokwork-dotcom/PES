'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DURUM_ETIKET, GEREKCE_ETIKET, kalemFarklari, farkOzeti,
  type TeklifDurumu, type GerekceKodu, type TeklifKalem,
} from '@/lib/pes/plan-onay'

export type TeklifSatiri = {
  id: number
  workshopId: number
  atolyeAdi: string
  turNo: number
  durum: TeklifDurumu
  gonderildi: string
  gerekceKodu: GerekceKodu | null
  cevapNotu: string | null
  kalemler: TeklifKalem[]
}

const tr = new Intl.NumberFormat('tr-TR')

/**
 * Gönderilen tekliflerin durumu ve uygulama.
 *
 * Karşı öneri geldiğinde FARK gösterilir: planlamacı "3 gün kaydı, 200 adet
 * düştü" diye görür. Uygulandığında ATÖLYENİN tarihleri yazılır — kendi ilk
 * teklifi değil; aksi halde kabul ettiğini söyleyip tutturulamaz bir tarih
 * yazmış olur.
 */
export default function Teklifler({
  teklifler, taslakId, kalemVar,
}: {
  teklifler: TeklifSatiri[]
  taslakId: number
  kalemVar: boolean
}) {
  const router = useRouter()
  const [bekliyor, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [mesaj, setMesaj] = useState<string | null>(null)

  async function cagir(yol: string, govde: unknown, basarili: (v: unknown) => string) {
    setHata(null); setMesaj(null)
    const c = await fetch(yol, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
    })
    const g = await c.json().catch(() => ({}))
    if (!c.ok) { setHata(g.error ?? `İşlem başarısız (${c.status})`); return }
    setMesaj(basarili(g))
    basla(() => router.refresh())
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Teklifler
        </h2>
        <button
          disabled={bekliyor || !kalemVar || !taslakId}
          onClick={() => cagir('/api/pes/plan-tezgahi/gonder', { taslak_id: taslakId },
            (g) => {
              const t = (g as { teklifler?: unknown[] }).teklifler ?? []
              return `${t.length} atölyeye teklif gönderildi`
            })}
          className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-40"
          title={kalemVar ? 'Taslağı ilgili atölyelere gönder' : 'Önce iş yerleştirin'}>
          Atölyelere gönder
        </button>
        {mesaj && <span className="text-sm text-emerald-700">{mesaj}</span>}
        {hata && <span className="text-sm text-red-600">{hata}</span>}
      </div>

      {teklifler.length === 0 ? (
        <p className="text-sm text-slate-500">
          Henüz teklif gönderilmedi. Taslak sizde kaldığı sürece atölye hiçbir şey görmez.
        </p>
      ) : (
        <div className="space-y-2">
          {teklifler.map((t) => {
            const farklar = kalemFarklari(t.kalemler)
            const ozet = farkOzeti(farklar)
            const uygulanabilir = t.durum === 'kabul' || t.durum === 'revizyon'

            return (
              <article key={t.id} className="rounded border border-slate-200 p-3">
                <div className="flex justify-between gap-3 flex-wrap items-baseline">
                  <div>
                    <span className="font-medium">{t.atolyeAdi}</span>
                    <span className="text-xs text-slate-400"> · {t.turNo}. tur · {t.kalemler.length} iş</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    t.durum === 'kabul' ? 'bg-emerald-100 text-emerald-800'
                    : t.durum === 'ret' ? 'bg-red-100 text-red-800'
                    : t.durum === 'revizyon' ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-600'}`}>
                    {DURUM_ETIKET[t.durum]}
                  </span>
                </div>

                {t.gerekceKodu && (
                  <div className="mt-1 text-sm text-slate-600">
                    <strong>{GEREKCE_ETIKET[t.gerekceKodu]}</strong>
                    {t.cevapNotu && <> — {t.cevapNotu}</>}
                  </div>
                )}

                {t.durum === 'revizyon' && (
                  <div className="mt-2 text-sm">
                    {ozet.degisenKalem === 0 ? (
                      <span className="text-slate-500">
                        Tarih/adet değişikliği önerilmedi; yalnız gerekçe bildirildi.
                      </span>
                    ) : (
                      <>
                        <div className="text-slate-700">
                          {ozet.degisenKalem}/{ozet.toplamKalem} işte değişiklik ·
                          en büyük kayma <strong>{ozet.enBuyukKayma} gün</strong>
                          {ozet.toplamAdetFarki !== 0 && (
                            <> · adet farkı <strong>{tr.format(ozet.toplamAdetFarki)}</strong></>
                          )}
                        </div>
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                          {farklar.filter((f) => f.degisti).map((f) => {
                            const k = t.kalemler.find((x) => x.id === f.kalemId)!
                            return (
                              <li key={f.kalemId}>
                                #{f.workOrderId}: {k.baslangic} → {k.karsiBaslangic ?? k.baslangic}
                                {f.gunKaymasi !== null && f.gunKaymasi !== 0 && (
                                  <> ({f.gunKaymasi > 0 ? '+' : ''}{f.gunKaymasi} gün)</>
                                )}
                                {f.adetFarki !== null && f.adetFarki !== 0 && (
                                  <>, adet {tr.format(k.adet)} → {tr.format(k.karsiAdet!)}</>
                                )}
                                {k.karsiNot && <span className="text-slate-400"> — {k.karsiNot}</span>}
                              </li>
                            )
                          })}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                {uygulanabilir && (
                  <div className="mt-2">
                    <button
                      disabled={bekliyor}
                      onClick={() => cagir('/api/pes/plan-tezgahi/uygula', { teklif_id: t.id },
                        (g) => {
                          const u = (g as { uygulanan?: unknown[] }).uygulanan ?? []
                          return `${u.length} iş emri atölyenin planına yazıldı`
                        })}
                      className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">
                      {t.durum === 'revizyon' ? 'Revizyonu uygula' : 'Planı uygula'}
                    </button>
                    <span className="ml-2 text-xs text-slate-500">
                      {t.durum === 'revizyon'
                        ? 'Atölyenin önerdiği tarihler yazılır'
                        : 'İş emri atölyenin takvimine düşer'}
                    </span>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
