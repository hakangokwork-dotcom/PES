'use client'

/**
 * Bölüm 1 — Üst kutucuklar (5 KPI).
 *
 * 1. Havuz kâr marjı
 * 2. Zarar eden atölye sayısı
 * 3. Genel lider (en iyi ortalama sıra)
 * 4. En ayrıştırıcı rasyo (en yüksek CV)
 * 5. En benzeştiren rasyo (en düşük CV)
 */
import type { AtolyeRasyolari, AtolyeSira, RasyoIstatistik } from '@/lib/pes/ekonomi-radar'
import { RASYO_META } from '@/lib/pes/ekonomi-rasyo-meta'

type Props = {
  veri: AtolyeRasyolari[]
  siralama: AtolyeSira[]
  istatistik: Record<string, RasyoIstatistik>
}

function pct1(v: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(v)
}

export default function BolumTiles({ veri, siralama, istatistik }: Props) {
  // Havuz kâr marjı: ∑karZarar ÷ ∑ciro
  const toplamKarZarar = veri.reduce<number>((acc, a) => acc + (a.rasyolar.karZarar ?? 0), 0)
  const toplamCiro = veri.reduce<number>((acc, a) => acc + (a.rasyolar.aylikCiro ?? 0), 0)
  const havuzMarj = toplamCiro > 0 ? toplamKarZarar / toplamCiro : null

  // Zarar eden atölye: marj < 0
  const zararEden = veri.filter(a => a.rasyolar.marj !== null && a.rasyolar.marj < 0).length

  // Genel lider: genelSira === 1
  const lider = siralama.find(s => s.genelSira === 1)

  // CV'li rasyolar (sıralanan, yön ≠ notr)
  const cvli = RASYO_META
    .filter(m => m.yon !== 'notr')
    .map(m => ({ meta: m, cv: istatistik[m.alan]?.cv ?? null }))
    .filter(x => x.cv !== null && Number.isFinite(x.cv))

  const cvSirali = [...cvli].sort((a, b) => (b.cv! - a.cv!))
  const enAyristirici = cvSirali[0] ?? null
  const enBenzestiren = cvSirali[cvSirali.length - 1] ?? null

  const tiles = [
    {
      k: 'Havuz kâr marjı',
      v: havuzMarj !== null ? pct1(havuzMarj) : '—',
      alt: `${veri.filter(a => a.veri_var).length} atölyenin toplam kârı ÷ toplam cirosu`,
      pos: havuzMarj !== null ? (havuzMarj >= 0 ? 'pos' : 'neg') : 'neu',
    },
    {
      k: 'Zarar eden atölye',
      v: `${zararEden} / ${veri.length}`,
      alt: `Marj < 0 olan atölye sayısı`,
      pos: zararEden > 0 ? 'neg' : 'pos',
    },
    {
      k: 'Genel lider',
      v: lider?.ad ?? '—',
      alt: lider
        ? `Ort. sıra ${lider.ortalamaSira?.toFixed(2) ?? '—'} · ${lider.ilk3Sayisi} rasyoda ilk 3`
        : 'Sıralama hesaplanamadı',
      pos: 'neu',
      small: true,
    },
    {
      k: 'En ayrıştırıcı rasyo',
      v: enAyristirici?.meta.etiket ?? '—',
      alt: enAyristirici
        ? `Değişkenlik %${Math.round(enAyristirici.cv! * 100)} — atölyeler burada en uzak`
        : '',
      pos: 'neu',
      small: true,
    },
    {
      k: 'En benzeştiren rasyo',
      v: enBenzestiren?.meta.etiket ?? '—',
      alt: enBenzestiren
        ? `Değişkenlik %${Math.round(enBenzestiren.cv! * 100)} — herkes neredeyse aynı`
        : '',
      pos: 'neu',
      small: true,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {tiles.map(t => (
        <div
          key={t.k}
          className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200/50 dark:border-neutral-800 rounded-xl px-4 py-3.5"
        >
          <p className="text-[11px] tracking-widest uppercase text-neutral-400 dark:text-neutral-500">{t.k}</p>
          <p
            className={`font-bold leading-tight mt-1.5 ${t.small ? 'text-base' : 'text-2xl tracking-tight'} ${
              t.pos === 'pos'
                ? 'text-emerald-700 dark:text-emerald-400'
                : t.pos === 'neg'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-neutral-900 dark:text-neutral-50'
            }`}
          >
            {t.v}
          </p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">{t.alt}</p>
        </div>
      ))}
    </div>
  )
}
