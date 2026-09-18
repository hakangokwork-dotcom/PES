import { describe, it, expect } from 'vitest'
import {
  bol, toplamKisi, uretimKisi, dikimPayi,
  aylikCiro, brutGider, netGider, marj,
  iscilikToplam, iscilikPayi, iscilikDisiKisi, iscilikYukKatsayisi,
} from './ekonomi-hesap'
import { VARSAYILAN_PARAM } from './ekonomi-tipler'
import type { GiderSatiri, EkonomiSatiri } from './ekonomi-tipler'

/* Örssan — Atolye_Gider_Model.xlsx VERI_GIRIS satır 4.
   Beklenen değerler HESAP satır 4'ten; üçü elle yeniden hesaplandı. */
export const ORSSAN_GIDER: GiderSatiri = {
  personnel: 4900000, overtime: 200000, bonus: 0, sgk: 200000, severance_reserve: 0,
  food: 200000, transport: 350000, cargo: 150000, rent: 0, building_depr: 100000,
  electricity: 150000, water: 30000, gas: 50000, thread: 300000, needle: null,
  ukp_consumables: 200000, consumables: 250000, machine_maint: 50000, machine_depr: 20000,
  vehicle_depr: 20000, vehicle: 40000, stationery: 10000, isg: 30000, consulting: 50000,
  official_fees: 150000, insurance: 100000, communication: 3000, other: null,
  incentive_amount: 1300000,
}

export const ORSSAN_EKONOMI: EkonomiSatiri = {
  revenue_declared: 14788970.61 / 3,
  idle_days: 5.5,
  qty_declared: 43036.7,
  nominal_days: 22,
  actual_days: 15.25,
  hours_per_day: 9,
  cutting_staff: 6, sewing_staff: 90, ukp_staff: 35, office_staff: 6,
  area_m2: 5000,
  source: 'anket',
}

describe('bol', () => {
  it('normal bölme', () => {
    expect(bol(10, 4)).toBe(2.5)
  })

  it('payda sıfırsa null — 0 değil', () => {
    expect(bol(10, 0)).toBeNull()
  })

  it('payda null ise null', () => {
    expect(bol(10, null)).toBeNull()
  })

  it('pay null ise null', () => {
    expect(bol(null, 4)).toBeNull()
  })

  it('pay sıfırsa sonuç sıfır — null değil', () => {
    expect(bol(0, 4)).toBe(0)
  })
})

describe('kadro', () => {
  it('toplam kişi = kesim + dikim + UKP + ofis', () => {
    expect(toplamKisi(ORSSAN_EKONOMI)).toBe(137)
  })

  it('üretim kişi ofisi dışlar', () => {
    expect(uretimKisi(ORSSAN_EKONOMI)).toBe(131)
  })

  it('dikim payı toplam kişiye göre', () => {
    expect(dikimPayi(ORSSAN_EKONOMI)).toBeCloseTo(0.656934306569343, 12)
  })

  it('kadro tamamen boşsa toplam null', () => {
    const bos: EkonomiSatiri = {
      ...ORSSAN_EKONOMI,
      cutting_staff: null, sewing_staff: null, ukp_staff: null, office_staff: null,
    }
    expect(toplamKisi(bos)).toBeNull()
  })
})

describe('aylikCiro', () => {
  it('boş gün düzeltmesi uygulanır', () => {
    expect(aylikCiro(ORSSAN_EKONOMI, VARSAYILAN_PARAM)).toBeCloseTo(6059369.90270833, 6)
  })

  it('düzeltme kapalıysa ham ciro döner', () => {
    const kapali = { ...VARSAYILAN_PARAM, revenue_adj_on: 0 }
    expect(aylikCiro(ORSSAN_EKONOMI, kapali)).toBeCloseTo(14788970.61 / 3, 6)
  })

  it('boş gün yoksa düzeltme etkisiz', () => {
    const bosGunsuz: EkonomiSatiri = { ...ORSSAN_EKONOMI, idle_days: 0 }
    expect(aylikCiro(bosGunsuz, VARSAYILAN_PARAM)).toBeCloseTo(14788970.61 / 3, 6)
  })

  it('ciro beyanı yoksa null', () => {
    const cirosuz: EkonomiSatiri = { ...ORSSAN_EKONOMI, revenue_declared: null }
    expect(aylikCiro(cirosuz, VARSAYILAN_PARAM)).toBeNull()
  })
})

describe('gider', () => {
  it('brüt gider 28 kalemin toplamı, teşvik dahil DEĞİL', () => {
    expect(brutGider(ORSSAN_GIDER)).toBe(7553000)
  })

  it('net gider = brüt − teşvik', () => {
    expect(netGider(ORSSAN_GIDER)).toBe(6253000)
  })

  it('teşvik null ise net = brüt', () => {
    expect(netGider({ ...ORSSAN_GIDER, incentive_amount: null })).toBe(7553000)
  })

  it('işçilik beş kalemin toplamı', () => {
    expect(iscilikToplam(ORSSAN_GIDER)).toBe(5300000)
  })
})

describe('marj', () => {
  it('Örssan zararda', () => {
    expect(marj(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM))
      .toBeCloseTo(-0.031955483887049, 12)
  })

  it('ciro sıfırsa null', () => {
    const cirosuz: EkonomiSatiri = { ...ORSSAN_EKONOMI, revenue_declared: 0 }
    expect(marj(ORSSAN_GIDER, cirosuz, VARSAYILAN_PARAM)).toBeNull()
  })
})

describe('işçilik rasyoları', () => {
  it('işçilik payı teşvik düşülmüş işçilik ÷ net gider', () => {
    expect(iscilikPayi(ORSSAN_GIDER)).toBeCloseTo(0.639692947385255, 12)
  })

  it('işçilik dışı / kişi kirayı dışlar', () => {
    expect(iscilikDisiKisi(ORSSAN_GIDER, ORSSAN_EKONOMI)).toBeCloseTo(16445.2554744526, 8)
  })

  it('işçilik yük katsayısı net maaşa göre', () => {
    expect(iscilikYukKatsayisi(ORSSAN_GIDER)).toBeCloseTo(0.816326530612245, 12)
  })
})
