'use client'

/**
 * Bölüm 5 — Atölye karneleri.
 *
 * Genel sıralama ile sıralı kartlar. Her kart:
 *   - Atölye adı + genel sıralama
 *   - Ortalama sıra + ilk3/son3 özeti
 *   - Güçlü olduğu rasyo listesi (sıra 1–3)
 *   - Zayıf olduğu rasyo listesi (en yüksek sıralar)
 *
 * Karta tıklanınca `/pes/ekonomi/[workshopId]` açılır (Task 16).
 */
import Link from 'next/link'
import type { AtolyeSira, RasyoIstatistik } from '@/lib/pes/ekonomi-radar'
import { RASYO_META_MAP } from '@/lib/pes/ekonomi-rasyo-meta'

type Props = {
  siralama: AtolyeSira[]
  istatistik: Record<string, RasyoIstatistik>
  odakId: number | null
  onSecim: (id: number | null) => void
}

export default function BolumAtolyeKarneleri({ siralama, istatistik: _istatistik, odakId, onSecim }: Props) {
  if (siralama.length === 0) return null

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">
          Atölye karneleri
        </h2>
        <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 mt-0.5">
          Her atölyenin en güçlü ve en zayıf üç rasyosu.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {siralama.map(s => {
          const secinli = s.workshopId === odakId

          return (
            <div
              key={s.workshopId}
              id={`karne-${s.workshopId}`}
              onClick={() => onSecim(secinli ? null : s.workshopId)}
              className={`bg-neutral-50 dark:bg-neutral-900 border rounded-xl px-4 py-3.5 cursor-pointer transition-all ${
                secinli
                  ? 'border-blue-500 ring-1 ring-blue-500'
                  : 'border-neutral-200/50 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
              }`}
            >
              {/* Başlık */}
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span
                  className="text-[15px] font-medium text-neutral-900 dark:text-neutral-50 overflow-hidden text-ellipsis whitespace-nowrap"
                  title={s.ad}
                >
                  {s.ad}
                </span>
                <span className="text-[22px] font-bold font-tabular-nums text-neutral-900 dark:text-neutral-50 shrink-0 leading-none">
                  {s.genelSira}.
                </span>
              </div>

              {/* Özet */}
              <p className="text-[11.5px] text-neutral-400 dark:text-neutral-500">
                Ort. sıra {s.ortalamaSira?.toFixed(2) ?? '—'} · {' '}
                İlk 3: <span className="text-emerald-600 dark:text-emerald-400 font-medium">{s.ilk3Sayisi}</span> · {' '}
                Son 3: <span className="text-red-500 dark:text-red-400 font-medium">{s.son3Sayisi}</span>
              </p>

              {/* Güçlü */}
              {s.guclu3.length > 0 && (
                <>
                  <p className="text-[10.5px] tracking-wider uppercase text-neutral-400 dark:text-neutral-500 mt-3 mb-1">
                    Güçlü
                  </p>
                  <ul className="space-y-1">
                    {s.guclu3.map(g => {
                      const meta = RASYO_META_MAP.get(g.alan)
                      return (
                        <li key={g.alan} className="flex gap-2 text-[11.5px] text-neutral-500 dark:text-neutral-400">
                          <b className="font-semibold font-tabular-nums min-w-[20px] text-neutral-800 dark:text-neutral-200">
                            {g.sira}.
                          </b>
                          <span>{meta?.etiket ?? g.alan}</span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}

              {/* Zayıf */}
              {s.zayif3.length > 0 && (
                <>
                  <p className="text-[10.5px] tracking-wider uppercase text-neutral-400 dark:text-neutral-500 mt-3 mb-1">
                    Zayıf
                  </p>
                  <ul className="space-y-1">
                    {s.zayif3.map(z => {
                      const meta = RASYO_META_MAP.get(z.alan)
                      return (
                        <li key={z.alan} className="flex gap-2 text-[11.5px] text-neutral-500 dark:text-neutral-400">
                          <b className="font-semibold font-tabular-nums min-w-[20px] text-neutral-800 dark:text-neutral-200">
                            {z.sira}.
                          </b>
                          <span>{meta?.etiket ?? z.alan}</span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}

              {/* Task 16 bağlantısı */}
              <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <Link
                  href={`/pes/ekonomi/${s.workshopId}`}
                  onClick={e => e.stopPropagation()}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Detaylı karne →
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
