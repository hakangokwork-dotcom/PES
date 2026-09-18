'use client'

/**
 * Bölüm 3 — Rasyo gezgini.
 *
 * Sol: grup chip + rasyo listesi.
 * Sağ: seçili rasyo detayı — statstrip, bar grafik, en iyi/en kötü callout.
 */
import { useState } from 'react'
import type { AtolyeRasyolari, RasyoIstatistik } from '@/lib/pes/ekonomi-radar'
import type { Grup, RasyoMeta } from '@/lib/pes/ekonomi-rasyo-meta'
import { RASYO_META } from '@/lib/pes/ekonomi-rasyo-meta'
import type { EkonomiRasyo } from '@/lib/pes/ekonomi-tipler'
import { fmtRasyo } from './formatlayici'

type Props = {
  veri: AtolyeRasyolari[]
  istatistik: Record<string, RasyoIstatistik>
  siralarTablosu: Record<string, Record<number, number>>
}

const GRUPLAR: Array<{ id: Grup | 'tumu'; etiket: string }> = [
  { id: 'tumu', etiket: 'Tümü' },
  { id: 'karlilik', etiket: 'Kârlılık' },
  { id: 'isgucu', etiket: 'İşgücü' },
  { id: 'birim-maliyet', etiket: 'Birim Maliyet' },
  { id: 'referans', etiket: 'Referans' },
]

export default function BolumRasyoGezgini({ veri, istatistik, siralarTablosu }: Props) {
  const [seciliGrup, setSeciliGrup] = useState<Grup | 'tumu'>('tumu')
  const [seciliAlan, setSeciliAlan] = useState<string>(RASYO_META[0].alan)

  const gorunenRasyolar = seciliGrup === 'tumu'
    ? RASYO_META
    : RASYO_META.filter(m => m.grup === seciliGrup)

  // Seçili alan görünür listede yoksa listedeki ilke düş
  const gercekAlan = gorunenRasyolar.some(m => m.alan === seciliAlan)
    ? seciliAlan
    : gorunenRasyolar[0]?.alan ?? RASYO_META[0].alan

  const meta = RASYO_META.find(m => m.alan === gercekAlan)!
  const ist = istatistik[gercekAlan]
  const siralariStr = siralarTablosu[gercekAlan] ?? {}
  const n = veri.length

  // Atölye verisi: sıralı (yöne göre)
  type Nokta = { workshopId: number; ad: string; code: string; deger: number | null; sira: number | null }
  const noktalar: Nokta[] = veri.map(a => ({
    workshopId: a.workshopId,
    ad: a.ad,
    code: a.code,
    deger: a.rasyolar[gercekAlan as keyof (EkonomiRasyo & { marjSirasi: number | null })] as number | null,
    sira: siralariStr[a.workshopId] ?? null,
  }))

  const sirali = [...noktalar].sort((a, b) => {
    if (a.deger === null && b.deger === null) return 0
    if (a.deger === null) return 1
    if (b.deger === null) return -1
    return meta.yon === 'yuksek-iyi' ? b.deger - a.deger : a.deger - b.deger
  })

  const gecerliDegerler = noktalar.map(n => n.deger).filter((d): d is number => d !== null)
  const lo = Math.min(0, ...gecerliDegerler)
  const hi = Math.max(0, ...gecerliDegerler)
  const pad = (hi - lo) * 0.04
  const span = Math.max(hi + pad - lo, 1e-9)
  const toX = (v: number) => ((v - lo) / span) * 100

  return (
    <section className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200/50 dark:border-neutral-800 rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">
          Rasyo gezgini
        </h2>
        <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 mt-0.5">
          Soldan bir rasyo seç — atölyeler en iyiden en kötüye sıralanır.
        </p>
      </div>

      {/* Grup chipler */}
      <div className="flex flex-wrap gap-2 mb-4">
        {GRUPLAR.map(g => (
          <button
            key={g.id}
            onClick={() => setSeciliGrup(g.id)}
            aria-pressed={seciliGrup === g.id}
            className={`text-xs rounded-full px-3 py-1 border transition-colors ${
              seciliGrup === g.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-transparent hover:border-neutral-300'
            }`}
          >
            {g.etiket}
          </button>
        ))}
      </div>

      {/* Explorer grid */}
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        {/* Rasyo listesi */}
        <div className="max-h-[500px] overflow-auto border border-neutral-200/50 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-950">
          {gorunenRasyolar.map(m => (
            <button
              key={m.alan}
              onClick={() => { setSeciliAlan(m.alan) }}
              aria-current={m.alan === gercekAlan}
              className={`block w-full text-left text-[12.5px] px-3 py-2.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0 transition-colors ${
                m.alan === gercekAlan
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
            >
              <span className="float-right text-[11px] opacity-60 ml-2">{m.birim}</span>
              {m.etiket}
            </button>
          ))}
        </div>

        {/* Detay */}
        {meta && (
          <div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">
              {meta.etiket}
            </h3>
            <p className="text-[12px] text-neutral-400 dark:text-neutral-500 mt-0.5 mb-3">
              {meta.onemAciklama}
            </p>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-4 text-[11.5px] text-neutral-500 dark:text-neutral-400">
              {[
                meta.grup,
                meta.birim,
                meta.yon === 'yuksek-iyi' ? 'Yüksek iyi' : meta.yon === 'dusuk-iyi' ? 'Düşük iyi' : 'Nötr',
                ist?.cv !== null && ist?.cv !== undefined ? `CV ${(ist.cv * 100).toFixed(0)}%` : null,
              ].filter(Boolean).map(b => (
                <span key={b} className="bg-neutral-100 dark:bg-neutral-800 rounded-md px-2 py-0.5">{b}</span>
              ))}
            </div>

            {/* Statstrip */}
            {ist && (
              <div className="grid grid-cols-3 sm:grid-cols-6 border border-neutral-200/50 dark:border-neutral-700 rounded-lg overflow-hidden mb-4 divide-x divide-neutral-200/50 dark:divide-neutral-700">
                {[
                  { k: 'Ortalama', v: ist.ort },
                  { k: 'Medyan', v: ist.medyan },
                  { k: 'Min', v: ist.min },
                  { k: 'Maks', v: ist.max },
                  { k: 'Std. Sapma', v: ist.sd },
                  { k: 'CV', v: ist.cv !== null && ist.cv !== undefined ? ist.cv : null },
                ].map(s => (
                  <div key={s.k} className="bg-white dark:bg-neutral-950 px-2.5 py-2">
                    <p className="text-[10.5px] tracking-wider uppercase text-neutral-400 dark:text-neutral-500">{s.k}</p>
                    <p className="text-[14px] font-tabular-nums mt-0.5 text-neutral-800 dark:text-neutral-200">
                      {s.k === 'CV'
                        ? (s.v !== null ? `${(s.v * 100).toFixed(0)}%` : '—')
                        : (s.v !== null ? fmtRasyo(meta, s.v) : '—')}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Bar grafik */}
            <div className="space-y-1">
              {sirali.map(s => {
                const hasDeger = s.deger !== null
                const pctA = hasDeger ? toX(Math.min(s.deger!, 0)) : 0
                const pctB = hasDeger ? toX(Math.max(s.deger!, 0)) : 0
                const pozitif = hasDeger && s.deger! >= 0

                return (
                  <div
                    key={s.workshopId}
                    className="grid items-center gap-2"
                    style={{ gridTemplateColumns: '88px 1fr 88px' }}
                    title={`${s.ad} · ${meta.etiket} · ${hasDeger ? fmtRasyo(meta, s.deger!) : '—'} · Sıra: ${s.sira !== null ? `${s.sira}/${n}` : '–'}`}
                  >
                    <span
                      className="text-[12px] text-neutral-400 dark:text-neutral-500 text-right pr-1 overflow-hidden text-ellipsis whitespace-nowrap"
                      title={s.ad}
                    >
                      {s.code || s.ad}
                    </span>
                    <span className="relative h-5">
                      {lo < 0 && (
                        <span
                          className="absolute top-0 bottom-0 w-px bg-neutral-300 dark:bg-neutral-700"
                          style={{ left: `${toX(0)}%` }}
                        />
                      )}
                      {ist?.ort !== null && ist?.ort !== undefined && (
                        <span
                          className="absolute top-[-3px] bottom-[-3px] w-px bg-neutral-300 dark:bg-neutral-600 opacity-70"
                          style={{ left: `${toX(ist.ort)}%` }}
                          title={`Ortalama: ${fmtRasyo(meta, ist.ort)}`}
                        />
                      )}
                      {hasDeger && (
                        <span
                          className={`absolute top-1.5 h-2 ${pozitif ? 'rounded-r' : 'rounded-l'} ${
                            pozitif ? 'bg-blue-600 dark:bg-blue-500' : 'bg-red-500 dark:bg-red-400'
                          }`}
                          style={{
                            left: `${pctA}%`,
                            width: `${Math.max(pctB - pctA, 0.4)}%`,
                          }}
                        />
                      )}
                    </span>
                    <span className="text-[12px] font-tabular-nums text-neutral-700 dark:text-neutral-300">
                      {hasDeger ? fmtRasyo(meta, s.deger!) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* En iyi / En kötü callout */}
            {ist && meta.yon !== 'notr' && (ist.enIyi || ist.enKotu) && (
              <div className="grid grid-cols-2 gap-3 mt-4">
                {ist.enIyi && (
                  <div className="border border-neutral-200/50 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-950">
                    <p className="text-[10px] tracking-wider uppercase text-neutral-400">En iyi</p>
                    <p className="text-[14px] font-medium text-neutral-900 dark:text-neutral-100 mt-1">{ist.enIyi}</p>
                    <p className="text-[11.5px] text-neutral-400 dark:text-neutral-500 font-tabular-nums">
                      {ist.max !== null ? fmtRasyo(meta, meta.yon === 'yuksek-iyi' ? ist.max : ist.min!) : '—'}
                    </p>
                  </div>
                )}
                {ist.enKotu && (
                  <div className="border border-neutral-200/50 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-950">
                    <p className="text-[10px] tracking-wider uppercase text-neutral-400">En kötü</p>
                    <p className="text-[14px] font-medium text-neutral-900 dark:text-neutral-100 mt-1">{ist.enKotu}</p>
                    <p className="text-[11.5px] text-neutral-400 dark:text-neutral-500 font-tabular-nums">
                      {ist.max !== null ? fmtRasyo(meta, meta.yon === 'yuksek-iyi' ? ist.min! : ist.max) : '—'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
