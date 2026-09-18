'use client'

/**
 * Bölüm 2 — Genel sıralama.
 *
 * Yatay bar grafik: her atölye için ortalama sıra değeri.
 * Düşük = iyi. Grup ortalaması gri dikey çizgi.
 * Tıklanınca bölüm 5'teki atölye karnesine odaklanır.
 */
import type { AtolyeSira } from '@/lib/pes/ekonomi-radar'

type Props = {
  siralama: AtolyeSira[]
  odakId: number | null
  onSecim: (id: number | null) => void
}

export default function BolumGenelSiralama({ siralama, odakId, onSecim }: Props) {
  if (siralama.length === 0) return null

  const gecerliler = siralama.filter(s => s.ortalamaSira !== null)
  if (gecerliler.length === 0) return null

  // ortalamaSira'ya göre sıralı (zaten öyle geliyor ama emin olalım)
  const sirali = [...gecerliler].sort((a, b) => (a.ortalamaSira ?? 99) - (b.ortalamaSira ?? 99))

  const ortMean = gecerliler.reduce((s, x) => s + (x.ortalamaSira ?? 0), 0) / gecerliler.length
  const maxSira = Math.max(...gecerliler.map(x => x.ortalamaSira ?? 0))
  const sira2Yuzde = (s: number) => Math.max((s / (maxSira * 1.04)) * 100, 1)
  const refYuzde = sira2Yuzde(ortMean)

  return (
    <section className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200/50 dark:border-neutral-800 rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">
          Genel sıralama
        </h2>
        <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 mt-0.5">
          Her atölyenin sıralanan rasyolardaki ortalama sırası. Düşük = iyi.
        </p>
      </div>

      {/* Lejant */}
      <div className="flex items-center gap-3 text-[11px] text-neutral-400 dark:text-neutral-500 mb-3 ml-[110px]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-[10px] h-px bg-neutral-400 dark:bg-neutral-500" />
          Grup ort. {ortMean.toFixed(2)}
        </span>
      </div>

      <div className="space-y-1.5">
        {sirali.map(s => {
          const ort = s.ortalamaSira!
          const pct = sira2Yuzde(ort)
          const secinli = s.workshopId === odakId

          return (
            <button
              key={s.workshopId}
              className={`w-full text-left grid items-center gap-2.5 cursor-pointer rounded group ${
                secinli ? 'ring-1 ring-blue-500' : ''
              }`}
              style={{ gridTemplateColumns: '110px 1fr 72px' }}
              onClick={() => onSecim(secinli ? null : s.workshopId)}
              title={`${s.ad} — Genel sıra: ${s.genelSira}. · Ort. sıra: ${ort.toFixed(2)} · İlk 3: ${s.ilk3Sayisi} · Son 3: ${s.son3Sayisi}`}
            >
              <span
                className="text-[12px] text-neutral-500 dark:text-neutral-400 text-right overflow-hidden text-ellipsis whitespace-nowrap pr-1 group-hover:text-neutral-700 dark:group-hover:text-neutral-200"
                title={s.ad}
              >
                {s.code || s.ad}
              </span>
              <span className="relative h-5 bg-transparent">
                {/* Referans çizgisi */}
                <span
                  className="absolute top-0 bottom-0 w-px bg-neutral-300 dark:bg-neutral-600"
                  style={{ left: `${refYuzde}%` }}
                />
                {/* Bar */}
                <span
                  className={`absolute top-1 h-3 rounded-r transition-all ${
                    secinli ? 'bg-blue-700' : 'bg-blue-500 group-hover:bg-blue-600'
                  }`}
                  style={{ left: 0, width: `${pct}%` }}
                />
              </span>
              <span className="text-[12.5px] font-tabular-nums text-neutral-700 dark:text-neutral-300">
                <span className="font-medium">{s.genelSira}.</span>
                <span className="text-neutral-400 dark:text-neutral-500 ml-1 text-[11px]">
                  ({ort.toFixed(2)})
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
