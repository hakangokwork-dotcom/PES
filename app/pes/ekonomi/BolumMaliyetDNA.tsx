'use client'

/**
 * Bölüm 6 — Maliyet DNA
 *
 * Rasyolar "ne kadar" der; DNA "neye harcıyor" der. İki atölyenin kişi
 * başı gideri aynı olabilir ama biri kirada, öteki işçilikte ağırdır —
 * pazarlıkta ve iyileştirmede bakılacak yer farklıdır.
 *
 * Asıl bilgi payların kendisinde değil örneklemden sapmada: herkesin
 * işçiliği %65-75'tir, ayırt edici olan birinin mekânı %15 iken medyanın
 * %5 olması. Şerit paylari gösterir, sağdaki rozet sapmayı.
 */
import { useState } from 'react'
import { G_ETIKET, G_ICERIK, G_KEYS, G_RENK } from '@/lib/pes/gider-gruplari'
import type { DnaProfili } from '@/lib/pes/ekonomi-dna'

const yuzde1 = new Intl.NumberFormat('tr-TR', {
  style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
})
const puan1 = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always',
})

export default function BolumMaliyetDNA({ profiller }: { profiller: DnaProfili[] }) {
  const [secili, setSecili] = useState<number | null>(null)
  const verili = profiller.filter(p => p.toplam !== null)

  if (verili.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Maliyet DNA</h2>
        <p className="text-sm text-neutral-500 border rounded p-4">
          Bu dönemde gider kompozisyonu hesaplanabilen atölye yok.
        </p>
      </section>
    )
  }

  const seciliProfil = verili.find(p => p.workshopId === secili) ?? null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Maliyet DNA</h2>
        <p className="text-sm text-neutral-500">
          Gider kompozisyonu: her atölye brüt giderini neye harcıyor.
          Sağdaki rozet, atölyeyi örneklemden en çok ayıran grubu ve medyandan
          kaç puan saptığını söyler. n={verili.length}
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {G_KEYS.map(k => (
          <span key={k} className="inline-flex items-center gap-1.5" title={G_ICERIK[k]}>
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: G_RENK[k] }} />
            {G_ETIKET[k]}
          </span>
        ))}
      </div>

      <div className="border rounded divide-y">
        {verili.map(p => {
          const ilk = p.gruplar[0]
          const acik = p.workshopId === secili
          return (
            <div key={p.workshopId}>
              <button
                onClick={() => setSecili(acik ? null : p.workshopId)}
                className="w-full text-left px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                aria-expanded={acik}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-sm font-medium">{p.ad}</span>
                  {ilk?.sapma !== null && ilk !== undefined && (
                    <span className="text-xs whitespace-nowrap">
                      <span className="text-neutral-500">en ayırt edici: </span>
                      <span style={{ color: G_RENK[ilk.grup] }}>{G_ETIKET[ilk.grup]}</span>
                      <span className={ilk.sapma > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                        {' '}{puan1.format(ilk.sapma * 100)} puan
                      </span>
                    </span>
                  )}
                </div>

                {/* Şerit: grup sırası sabit, sapma sırası değil — gözle
                    atölyeler arası karşılaştırılabilsin. */}
                <div className="flex h-5 rounded overflow-hidden" role="img"
                     aria-label={`${p.ad} gider kompozisyonu`}>
                  {G_KEYS.map(k => {
                    const g = p.gruplar.find(x => x.grup === k)!
                    const pay = g.pay ?? 0
                    if (pay <= 0) return null
                    return (
                      <div key={k} style={{ width: `${pay * 100}%`, background: G_RENK[k] }}
                           title={`${G_ETIKET[k]}: ${yuzde1.format(pay)}`} />
                    )
                  })}
                </div>
              </button>

              {acik && seciliProfil && (
                <table className="w-full text-sm border-t">
                  <thead className="bg-neutral-50 dark:bg-neutral-900">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Grup</th>
                      <th className="text-right px-3 py-1.5 font-medium">Payı</th>
                      <th className="text-right px-3 py-1.5 font-medium">Örneklem medyanı</th>
                      <th className="text-right px-3 py-1.5 font-medium">Sapma</th>
                      <th className="text-left px-3 py-1.5 font-medium">İçerik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seciliProfil.gruplar.map(g => (
                      <tr key={g.grup} className="border-t">
                        <td className="px-3 py-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2"
                                style={{ background: G_RENK[g.grup] }} />
                          {G_ETIKET[g.grup]}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {g.pay === null ? '—' : yuzde1.format(g.pay)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">
                          {g.medyanPay === null ? '—' : yuzde1.format(g.medyanPay)}
                        </td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${
                          g.sapma === null ? 'text-neutral-300'
                            : Math.abs(g.sapma) < 0.02 ? 'text-neutral-400'
                            : g.sapma > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {g.sapma === null ? '—' : `${puan1.format(g.sapma * 100)} puan`}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-neutral-500">{G_ICERIK[g.grup]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-neutral-400">
        Paylar <strong>brüt</strong> gider üzerinden — teşvik düşülmemiştir;
        teşvik bir gider kalemi değil mahsuptur ve kompozisyonu bozardı.
        Sapma “puan” cinsinden: %15 mekân ile %5 medyan arasındaki fark
        +10 puandır. Kırmızı bu grupta örneklemden ağır, yeşil hafif demek —
        tek başına iyi ya da kötü değil, nereye bakılacağını söyler.
      </p>
    </section>
  )
}
