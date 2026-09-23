/**
 * Radar hesap katmanı — sıralama, istatistik, karne.
 *
 * Tüm fonksiyonlar saf (side-effect yok); client ve server bileşenlerinden
 * import edilebilir.
 *
 * Kural: hesaplanamayan her şey null. 0 ile null ayrı tutulur.
 */
import type { EkonomiRasyo } from './ekonomi-tipler'
import { SIRALANAN_RASYOLAR, RASYO_META } from './ekonomi-rasyo-meta'

/** Bir atölye-ay hesaplanmış rasyoları + kimlik. */
export type AtolyeRasyolari = {
  workshopId: number
  ad: string
  code: string
  bolge: number | null
  veri_var: boolean
  rasyolar: EkonomiRasyo & { marjSirasi: number | null; fiyatEndeksi: number | null }
}

/** Bir rasyo için çapraz-atölye istatistik. */
export type RasyoIstatistik = {
  alan: string
  ort: number | null
  /** Ağırlıksız aritmetik — her atölye eşit ağırlıklı. */
  medyan: number | null
  min: number | null
  max: number | null
  sd: number | null
  /** Standart sapma ÷ |ortalama|. Yüksek CV → ayrıştırıcı rasyo. */
  cv: number | null
  /** Yön 'yuksek-iyi' ise en büyük, 'dusuk-iyi' ise en küçük değerin atölye adı. */
  enIyi: string | null
  /** Tersi yönden en kötü atölyenin adı. */
  enKotu: string | null
}

/** Bir atölye için genel sıralama özeti. */
export type AtolyeSira = {
  workshopId: number
  ad: string
  code: string
  /** Sıralanan rasyolardaki sıraların ortalaması. */
  ortalamaSira: number | null
  /** Sıralama içinde kaçıncı (1 = en iyi ortalama sıra). */
  genelSira: number
  /** Kaç rasyoda ilk 3'e girdi. */
  ilk3Sayisi: number
  /** Kaç rasyoda son 3'te kaldı. */
  son3Sayisi: number
  /** Sıra 1–3 olan rasyolar (en fazla 3 adet). */
  guclu3: Array<{ alan: string; sira: number }>
  /** En yüksek sıraya sahip rasyolar (en fazla 3 adet). */
  zayif3: Array<{ alan: string; sira: number }>
}

/** alan → (workshopId → sıra numarası). */
export type RasyoSiralari = Record<string, Record<number, number>>

// ─────────────────────────────────────────────────────────────────────────────

/** Null'ları atlayarak ortalama. */
function ort(xs: Array<number | null>): number | null {
  const sayilar = xs.filter((x): x is number => x !== null && Number.isFinite(x))
  if (sayilar.length === 0) return null
  return sayilar.reduce((a, b) => a + b, 0) / sayilar.length
}

/** Null'ları atlayarak medyan. */
function medyanHesapla(xs: Array<number | null>): number | null {
  const sayilar = xs.filter((x): x is number => x !== null && Number.isFinite(x))
  if (sayilar.length === 0) return null
  const s = [...sayilar].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Null'ları atlayarak standart sapma (popülasyon). */
function stdSapma(xs: Array<number | null>): number | null {
  const sayilar = xs.filter((x): x is number => x !== null && Number.isFinite(x))
  if (sayilar.length < 2) return null
  const o = sayilar.reduce((a, b) => a + b, 0) / sayilar.length
  const varyans = sayilar.reduce((a, b) => a + (b - o) ** 2, 0) / sayilar.length
  return Math.sqrt(varyans)
}

/**
 * Her sıralanan rasyo için atölyelerin sırasını hesaplar.
 *
 * Yön:
 *   - yuksek-iyi → büyük değer küçük sıra alır (1 = en büyük)
 *   - dusuk-iyi  → küçük değer küçük sıra alır (1 = en küçük)
 *
 * Eşitlik: aynı değerde atölyeler aynı sırayı alır (dense rank değil, average rank).
 * Null değer → o atölye o rasyoda sıra almaz (undefined).
 *
 * @returns alan → (workshopId → sıra numarası)
 */
export function rasyoSiralari(veri: AtolyeRasyolari[]): RasyoSiralari {
  const sonuc: RasyoSiralari = {}

  for (const meta of SIRALANAN_RASYOLAR) {
    const alan = meta.alan as keyof (EkonomiRasyo & { marjSirasi: number | null; fiyatEndeksi: number | null })
    const noktalar: Array<{ workshopId: number; deger: number }> = []

    for (const a of veri) {
      const deger = a.rasyolar[alan]
      if (deger !== null && deger !== undefined && Number.isFinite(deger)) {
        noktalar.push({ workshopId: a.workshopId, deger })
      }
    }

    if (noktalar.length === 0) {
      sonuc[meta.alan] = {}
      continue
    }

    // Yüksek-iyi: büyükten küçüğe; düşük-iyi: küçükten büyüğe.
    const siralandi = [...noktalar].sort((a, b) =>
      meta.yon === 'yuksek-iyi' ? b.deger - a.deger : a.deger - b.deger
    )

    // Dense rank — eşit değerler aynı sırayı alır; sonraki farklı değer
    // boşluk vermeden bir sonraki tam sayıyı alır.
    const siralama: Record<number, number> = {}
    let denseRank = 0
    for (let i = 0; i < siralandi.length; i++) {
      if (i === 0 || siralandi[i].deger !== siralandi[i - 1].deger) {
        denseRank++
      }
      siralama[siralandi[i].workshopId] = denseRank
    }

    sonuc[meta.alan] = siralama
  }

  return sonuc
}

/**
 * Her atölye için ortalama sıra ve genel sıralama (1 = en iyi ortalama sıra).
 */
export function siralamaHesapla(veri: AtolyeRasyolari[]): AtolyeSira[] {
  if (veri.length === 0) return []

  const siralariTablosu = rasyoSiralari(veri)
  const n = veri.length

  const ozet = veri.map((a) => {
    const siralar: Array<{ alan: string; sira: number }> = []

    for (const meta of SIRALANAN_RASYOLAR) {
      const sira = siralariTablosu[meta.alan]?.[a.workshopId]
      if (sira !== undefined) {
        siralar.push({ alan: meta.alan, sira })
      }
    }

    const ortSira = siralar.length > 0
      ? siralar.reduce((s, x) => s + x.sira, 0) / siralar.length
      : null

    const ilk3Sayisi = siralar.filter(x => x.sira <= 3).length
    const son3Sayisi = siralar.filter(x => x.sira >= n - 2).length

    // En iyi 3: en düşük sıra numaralı
    const guclu3 = [...siralar]
      .sort((a, b) => a.sira - b.sira)
      .slice(0, 3)

    // En kötü 3: en yüksek sıra numaralı
    const zayif3 = [...siralar]
      .sort((a, b) => b.sira - a.sira)
      .slice(0, 3)

    return {
      workshopId: a.workshopId,
      ad: a.ad,
      code: a.code,
      ortalamaSira: ortSira,
      genelSira: 0, // sonradan doldurulur
      ilk3Sayisi,
      son3Sayisi,
      guclu3,
      zayif3,
    }
  })

  // ortalamaSira'ya göre sırala; null değerler sona.
  ozet.sort((a, b) => {
    if (a.ortalamaSira === null && b.ortalamaSira === null) return 0
    if (a.ortalamaSira === null) return 1
    if (b.ortalamaSira === null) return -1
    return a.ortalamaSira - b.ortalamaSira
  })

  // genelSira ata.
  for (let i = 0; i < ozet.length; i++) {
    ozet[i].genelSira = i + 1
  }

  return ozet
}

/**
 * Her rasyo için çapraz-atölye istatistik.
 * Nötr rasyolar dahil — gezgin istatistik şeridinde kullanılır.
 */
export function rasyoIstatistik(veri: AtolyeRasyolari[]): Record<string, RasyoIstatistik> {
  const sonuc: Record<string, RasyoIstatistik> = {}

  for (const meta of RASYO_META) {
    const alan = meta.alan as keyof (EkonomiRasyo & { marjSirasi: number | null; fiyatEndeksi: number | null })
    const noktalar: Array<{ ad: string; deger: number }> = []

    for (const a of veri) {
      const deger = a.rasyolar[alan]
      if (deger !== null && deger !== undefined && Number.isFinite(deger)) {
        noktalar.push({ ad: a.ad, deger })
      }
    }

    const degerler = noktalar.map(n => n.deger)

    const o = ort(degerler)
    const sd = stdSapma(degerler)
    const cv = o !== null && sd !== null && Math.abs(o) > 1e-9
      ? sd / Math.abs(o)
      : null

    let enIyi: string | null = null
    let enKotu: string | null = null

    if (meta.yon !== 'notr' && noktalar.length > 0) {
      if (meta.yon === 'yuksek-iyi') {
        const maxDeger = Math.max(...degerler)
        const minDeger = Math.min(...degerler)
        enIyi = noktalar.find(n => n.deger === maxDeger)?.ad ?? null
        enKotu = noktalar.find(n => n.deger === minDeger)?.ad ?? null
      } else {
        const minDeger = Math.min(...degerler)
        const maxDeger = Math.max(...degerler)
        enIyi = noktalar.find(n => n.deger === minDeger)?.ad ?? null
        enKotu = noktalar.find(n => n.deger === maxDeger)?.ad ?? null
      }
    }

    sonuc[meta.alan] = {
      alan: meta.alan,
      ort: o,
      medyan: medyanHesapla(degerler),
      min: degerler.length > 0 ? Math.min(...degerler) : null,
      max: degerler.length > 0 ? Math.max(...degerler) : null,
      sd,
      cv,
      enIyi,
      enKotu,
    }
  }

  return sonuc
}
