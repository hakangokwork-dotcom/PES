import { describe, it, expect } from 'vitest'
import {
  eksikAlanlar, doluluk, tamamlanmaOrani, donemCoz, ZORUNLU_ALANLAR,
} from './ekonomi-talep'

const TAM = {
  revenue_declared: 4_500_000, qty_declared: 30_000,
  nominal_days: 22, actual_days: 20, hours_per_day: 9,
  cutting_staff: 10, sewing_staff: 70, ukp_staff: 15, office_staff: 5,
}

describe('eksik alanlar', () => {
  it('kayıt yoksa hepsi eksik', () => {
    expect(eksikAlanlar(null)).toHaveLength(ZORUNLU_ALANLAR.length)
    expect(eksikAlanlar(undefined)).toHaveLength(ZORUNLU_ALANLAR.length)
  })

  it('tam kayıtta eksik yok', () => {
    expect(eksikAlanlar(TAM)).toEqual([])
  })

  it('SIFIR eksik sayılmaz', () => {
    /* 0 kişilik ofis kadrosu geçerli bir cevap. `!deger` kullanılsaydı
       sıfır eksik görünür ve atölye asla "tam" olamazdı. */
    expect(eksikAlanlar({ ...TAM, office_staff: 0 })).toEqual([])
    expect(eksikAlanlar({ ...TAM, revenue_declared: 0 })).toEqual([])
  })

  it('null ve undefined eksik sayılır', () => {
    expect(eksikAlanlar({ ...TAM, sewing_staff: null })).toEqual(['Dikim kişi'])
    const { hours_per_day: _, ...eksikli } = TAM
    expect(eksikAlanlar(eksikli)).toEqual(['Günlük saat'])
  })

  it('birden çok eksik alanı etiketleriyle sayar', () => {
    expect(eksikAlanlar({ ...TAM, qty_declared: null, ukp_staff: null }))
      .toEqual(['Aylık adet', 'UKP kişi'])
  })
})

describe('doluluk', () => {
  it('kayıt yoksa veri-yok', () => {
    expect(doluluk(null, false)).toBe('veri-yok')
    expect(doluluk(null, true)).toBe('veri-yok')
  })

  it('alan eksikse eksik', () => {
    expect(doluluk({ ...TAM, sewing_staff: null }, true)).toBe('eksik')
  })

  it('alanlar tam ama gider yoksa gider-yok', () => {
    /* Gider gelmeden marj ve dakika maliyeti hesaplanamaz; "tam" demek
       rasyoların boş çıkmasını açıklanamaz hâle getirirdi. */
    expect(doluluk(TAM, false)).toBe('gider-yok')
  })

  it('ikisi de varsa tam', () => {
    expect(doluluk(TAM, true)).toBe('tam')
  })

  it('eksik alan, gider yokluğundan ÖNCE bildirilir', () => {
    expect(doluluk({ ...TAM, qty_declared: null }, false)).toBe('eksik')
  })
})

describe('tamamlanma oranı', () => {
  it('yok → 0, tam → 1', () => {
    expect(tamamlanmaOrani(null)).toBe(0)
    expect(tamamlanmaOrani(TAM)).toBe(1)
  })

  it('bir eksikte orantılı düşer', () => {
    const o = tamamlanmaOrani({ ...TAM, ukp_staff: null })
    expect(o).toBeCloseTo((ZORUNLU_ALANLAR.length - 1) / ZORUNLU_ALANLAR.length, 10)
  })
})

describe('dönem çözümü', () => {
  it('geçerli dönemi ayırır', () => {
    expect(donemCoz('2026-01')).toEqual({ yil: 2026, ay: 1 })
    expect(donemCoz('2026-12')).toEqual({ yil: 2026, ay: 12 })
  })

  it('geçersiz aya null döner', () => {
    expect(donemCoz('2026-00')).toBeNull()
    expect(donemCoz('2026-13')).toBeNull()
    expect(donemCoz('202601')).toBeNull()
    expect(donemCoz('')).toBeNull()
  })
})
