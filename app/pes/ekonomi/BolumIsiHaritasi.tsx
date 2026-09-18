'use client'

/**
 * Bölüm 4 — Karne ısı haritası.
 *
 * Satır: rasyo. Sütun: atölye. Hücre: sıra numarası.
 * 4 renk kova: 1–3 (koyu mavi), 4–6, 7–8, 9+ (açık).
 * Hover tooltip: atölye · rasyo · değer · Sıra k/N.
 */
import type { AtolyeRasyolari, AtolyeSira } from '@/lib/pes/ekonomi-radar'
import { SIRALANAN_RASYOLAR } from '@/lib/pes/ekonomi-rasyo-meta'
import type { EkonomiRasyo } from '@/lib/pes/ekonomi-tipler'
import { fmtRasyo } from './formatlayici'

type Props = {
  veri: AtolyeRasyolari[]
  siralama: AtolyeSira[]
  siralarTablosu: Record<string, Record<number, number>>
}

function renkkovu(sira: number, n: number): string {
  if (sira <= 3) return 'bg-blue-700 text-white dark:bg-blue-800 dark:text-white'
  if (sira <= 6) return 'bg-blue-500 text-white dark:bg-blue-600'
  if (sira <= 8) return 'bg-blue-300 text-neutral-800 dark:bg-blue-400 dark:text-neutral-900'
  return 'bg-blue-100 text-neutral-700 dark:bg-blue-200 dark:text-neutral-800'
  void n
}

export default function BolumIsiHaritasi({ veri, siralama, siralarTablosu }: Props) {
  if (veri.length === 0) return null

  // Atölyeler genel sıralama sırasıyla
  const siralanmisWorkshoplar = siralama
    .map(s => veri.find(a => a.workshopId === s.workshopId))
    .filter((a): a is AtolyeRasyolari => !!a)

  const n = siralanmisWorkshoplar.length

  return (
    <section className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200/50 dark:border-neutral-800 rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">
          Karne ısı haritası
        </h2>
        <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 mt-0.5">
          Her hücre o rasyoda atölyenin sırası (1 = en iyi). Koyu ton = iyi sıra.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table
          className="border-separate text-[11.5px]"
          style={{ borderSpacing: '2px' }}
        >
          <thead>
            <tr>
              {/* Rasyo etiketi kolonu */}
              <th className="sticky left-0 z-10 bg-neutral-50 dark:bg-neutral-900 text-left font-normal text-neutral-400 dark:text-neutral-500 text-[11px] min-w-[180px] max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap px-1 py-1 align-bottom">
                &nbsp;
              </th>
              {siralanmisWorkshoplar.map(a => (
                <th
                  key={a.workshopId}
                  className="font-semibold text-neutral-500 dark:text-neutral-400 text-center px-1.5 py-1 align-bottom whitespace-nowrap"
                  title={a.ad}
                >
                  {a.code || a.ad.slice(0, 8)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SIRALANAN_RASYOLAR.map(meta => (
              <tr key={meta.alan}>
                {/* Rasyo adı */}
                <td
                  className="sticky left-0 z-10 bg-neutral-50 dark:bg-neutral-900 text-left text-neutral-500 dark:text-neutral-400 text-[11px] font-normal px-1 py-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-[180px]"
                  title={meta.etiket}
                >
                  {meta.etiket}
                </td>
                {siralanmisWorkshoplar.map(a => {
                  const sira = siralarTablosu[meta.alan]?.[a.workshopId]
                  const deger = a.rasyolar[meta.alan as keyof (EkonomiRasyo & { marjSirasi: number | null })] as number | null
                  const tooltipText = `${a.ad} · ${meta.etiket} · ${deger !== null ? fmtRasyo(meta, deger) : '—'} · Sıra: ${sira !== undefined ? `${sira}/${n}` : '—'}`
                  return (
                    <td
                      key={a.workshopId}
                      className={`w-12 h-6 text-center font-tabular-nums rounded-sm ${
                        sira !== undefined ? renkkovu(sira, n) : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-300'
                      }`}
                      title={tooltipText}
                    >
                      {sira ?? '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Renk skalası */}
      <div className="flex flex-wrap gap-4 items-center text-[11.5px] text-neutral-400 dark:text-neutral-500 mt-3">
        {[
          { cls: 'bg-blue-700', etiket: '1–3. sıra' },
          { cls: 'bg-blue-500', etiket: '4–6. sıra' },
          { cls: 'bg-blue-300', etiket: '7–8. sıra' },
          { cls: 'bg-blue-100', etiket: '9+. sıra' },
        ].map(s => (
          <span key={s.etiket} className="flex items-center gap-1.5">
            <span className={`inline-block w-3.5 h-3.5 rounded-sm ${s.cls}`} />
            {s.etiket}
          </span>
        ))}
      </div>
    </section>
  )
}
