/**
 * Radar hesap katmanı testleri.
 *
 * 5 sahte atölye: yön duyarlılığı, eşitlik, null atlama ve CV doğrulaması.
 */
import { describe, it, expect } from 'vitest'
import {
  siralamaHesapla,
  rasyoIstatistik,
  rasyoSiralari,
} from './ekonomi-radar'
import type { AtolyeRasyolari } from './ekonomi-radar'

/** Boş EkonomiRasyo — testlerde yalnız ilgili alanlar doldurulur. */
function bosRasyo() {
  return {
    toplamKisi: null, uretimKisi: null, dikimPayi: null,
    aylikCiro: null, aylikAdet: null, ortFiyatAdet: null,
    brutGider: null, tesvik: null, netGider: null,
    karZarar: null, marj: null,
    iscilikToplam: null, iscilikPayi: null, iscilikDisiKisi: null,
    iscilikYukKatsayisi: null, ciroKisi: null, netGiderKisi: null,
    maasKisi: null, adetDikimci: null,
    nominalDikimDk: null, fiiliDikimDk: null, uretimKisiDk: null,
    kisiDkMaliyet: null, kesimDkMaliyet: null, dikimDkMaliyet: null,
    ukpDkMaliyet: null, dikimDkCiro: null, dakikaMarji: null,
    fiiliDikimDkMaliyet: null, asgariDkCarpani: null, dikimDkAdet: null,
    basabasFiyat: null, adilFiyat: null, fiyatSapmasi: null,
    referans3D: null, dkMaliyet3DOran: null,
    marjSirasi: null,
  }
}

function atolye(
  id: number,
  ad: string,
  kismıRasyolar: Partial<ReturnType<typeof bosRasyo>>,
): AtolyeRasyolari {
  return {
    workshopId: id,
    ad,
    code: `W${id}`,
    bolge: null,
    veri_var: true,
    rasyolar: { ...bosRasyo(), ...kismıRasyolar },
  }
}

// ─── yüksek-iyi rasyo: marj ──────────────────────────────────────────────────
const VERI_MARJ: AtolyeRasyolari[] = [
  atolye(1, 'A', { marj: 0.15 }),  // en kârlı → sıra 1
  atolye(2, 'B', { marj: 0.10 }),
  atolye(3, 'C', { marj: 0.05 }),
  atolye(4, 'D', { marj: -0.05 }),
  atolye(5, 'E', { marj: -0.20 }), // en zararlı → sıra 5
]

// ─── düşük-iyi rasyo: dikimDkMaliyet ─────────────────────────────────────────
const VERI_DK: AtolyeRasyolari[] = [
  atolye(1, 'A', { dikimDkMaliyet: 2.0 }),  // en ucuz → sıra 1
  atolye(2, 'B', { dikimDkMaliyet: 3.0 }),
  atolye(3, 'C', { dikimDkMaliyet: 4.0 }),
  atolye(4, 'D', { dikimDkMaliyet: 5.0 }),
  atolye(5, 'E', { dikimDkMaliyet: 6.0 }),  // en pahalı → sıra 5
]

// ─── eşitlik testi ────────────────────────────────────────────────────────────
const VERI_ESIT: AtolyeRasyolari[] = [
  atolye(1, 'A', { marj: 0.10 }),
  atolye(2, 'B', { marj: 0.10 }), // A ile aynı → dense rank = 1
  atolye(3, 'C', { marj: 0.05 }),
]

// ─── null atlama ──────────────────────────────────────────────────────────────
const VERI_NULL: AtolyeRasyolari[] = [
  atolye(1, 'A', { marj: 0.10 }),
  atolye(2, 'B', { marj: null }),  // verisi yok
  atolye(3, 'C', { marj: 0.05 }),
]

describe('rasyoSiralari — yüksek-iyi yön (marj)', () => {
  const siralama = rasyoSiralari(VERI_MARJ)

  it('en yüksek marjlı 1. sıra', () => {
    expect(siralama['marj'][1]).toBe(1) // A
  })

  it('en düşük marjlı son sıra', () => {
    expect(siralama['marj'][5]).toBe(5) // E
  })

  it('sıra monoton artar', () => {
    const s = [1, 2, 3, 4, 5].map(id => siralama['marj'][id])
    for (let i = 0; i < s.length - 1; i++) {
      expect(s[i]).toBeLessThan(s[i + 1])
    }
  })
})

describe('rasyoSiralari — düşük-iyi yön (dikimDkMaliyet)', () => {
  const siralama = rasyoSiralari(VERI_DK)

  it('en düşük maliyetli 1. sıra', () => {
    expect(siralama['dikimDkMaliyet'][1]).toBe(1) // A
  })

  it('en yüksek maliyetli son sıra', () => {
    expect(siralama['dikimDkMaliyet'][5]).toBe(5) // E
  })
})

describe('rasyoSiralari — eşitlik (dense rank)', () => {
  const siralama = rasyoSiralari(VERI_ESIT)

  it('aynı değerde iki atölye aynı sırayı alır', () => {
    expect(siralama['marj'][1]).toBe(1)
    expect(siralama['marj'][2]).toBe(1) // dense rank: her ikisi de 1
  })

  it('bir sonraki farklı değer sıra atlar', () => {
    expect(siralama['marj'][3]).toBe(2) // dense rank: 0.05 → 2. farklı değer
  })
})

describe('rasyoSiralari — null atlama', () => {
  const siralama = rasyoSiralari(VERI_NULL)

  it('null değerli atölye sıra almaz', () => {
    expect(siralama['marj'][2]).toBeUndefined()
  })

  it('null olmayan atölyeler sıralanır', () => {
    expect(siralama['marj'][1]).toBe(1)
    expect(siralama['marj'][3]).toBe(2)
  })
})

describe('siralamaHesapla', () => {
  it('ortalama sıraya göre sıralar', () => {
    const sonuc = siralamaHesapla(VERI_MARJ)
    // A en iyi → genelSira 1
    const a = sonuc.find(s => s.workshopId === 1)
    expect(a?.genelSira).toBe(1)
  })

  it('genelSira 1-n arası', () => {
    const sonuc = siralamaHesapla(VERI_MARJ)
    const siralar = sonuc.map(s => s.genelSira).sort((a, b) => a - b)
    expect(siralar[0]).toBe(1)
    expect(siralar[siralar.length - 1]).toBe(VERI_MARJ.length)
  })

  it('boş veri boş dizi döndürür', () => {
    expect(siralamaHesapla([])).toHaveLength(0)
  })

  it('ilk3Sayisi doğru sayar', () => {
    // A tek rasyoda 1. sıra (marj) — ilk3Sayisi ≥ 1
    const a = siralamaHesapla(VERI_MARJ).find(s => s.workshopId === 1)
    expect(a?.ilk3Sayisi).toBeGreaterThanOrEqual(1)
  })
})

describe('rasyoIstatistik', () => {
  it('ortalama doğru hesaplanır', () => {
    const ist = rasyoIstatistik(VERI_MARJ)
    const marjIst = ist['marj']
    // (0.15 + 0.10 + 0.05 + (-0.05) + (-0.20)) / 5 = 0.01
    expect(marjIst.ort).toBeCloseTo(0.01, 10)
  })

  it('medyan doğru hesaplanır', () => {
    const ist = rasyoIstatistik(VERI_MARJ)
    expect(ist['marj'].medyan).toBeCloseTo(0.05, 10) // ortadaki değer
  })

  it('CV hesaplanır ve > 0', () => {
    const ist = rasyoIstatistik(VERI_MARJ)
    // Marj 0 çevresinde, |ort| küçük olabilir → CV hesaplanamaz ya da yüksek.
    // dikimDkMaliyet testi daha güvenilir.
    const ist2 = rasyoIstatistik(VERI_DK)
    const cv = ist2['dikimDkMaliyet'].cv
    expect(cv).not.toBeNull()
    expect(cv!).toBeGreaterThan(0)
  })

  it('null değerler atlanır — istatistik kısmen hesaplanır', () => {
    const ist = rasyoIstatistik(VERI_NULL)
    const marjIst = ist['marj']
    // Yalnız A (0.10) ve C (0.05) var
    expect(marjIst.ort).toBeCloseTo(0.075, 10)
    expect(marjIst.min).toBeCloseTo(0.05, 10)
    expect(marjIst.max).toBeCloseTo(0.10, 10)
  })

  it('yüksek-iyi yönde en iyi en yüksek değer', () => {
    const ist = rasyoIstatistik(VERI_MARJ)
    expect(ist['marj'].enIyi).toBe('A')
    expect(ist['marj'].enKotu).toBe('E')
  })

  it('düşük-iyi yönde en iyi en düşük değer', () => {
    const ist = rasyoIstatistik(VERI_DK)
    expect(ist['dikimDkMaliyet'].enIyi).toBe('A')
    expect(ist['dikimDkMaliyet'].enKotu).toBe('E')
  })

  it('nötr rasyolarda enIyi/enKotu null', () => {
    const ist = rasyoIstatistik(VERI_MARJ)
    // referans3D nötr — tüm atölyelerde null olduğu için de null
    expect(ist['referans3D'].enIyi).toBeNull()
    expect(ist['referans3D'].enKotu).toBeNull()
  })
})
