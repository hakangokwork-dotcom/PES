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

import {
  ciroKisi, netGiderKisi, maasKisi, adetDikimci, ortFiyatAdet,
  nominalDikimDk, fiiliDikimDk, uretimKisiDk, kisiDkMaliyet,
  bolumDkMaliyet, dikimDkCiro, dakikaMarji, fiiliDikimDkMaliyet,
  asgariDkMaliyetNominal, asgariDkMaliyetEfektif, asgariDkCarpani, dikimDkAdet,
} from './ekonomi-hesap'

describe('kişi başı rasyolar', () => {
  it('ciro / kişi', () => {
    expect(ciroKisi(ORSSAN_EKONOMI, VARSAYILAN_PARAM)).toBeCloseTo(44228.9773920316, 8)
  })

  it('net gider / kişi', () => {
    expect(netGiderKisi(ORSSAN_GIDER, ORSSAN_EKONOMI)).toBeCloseTo(45642.3357664234, 8)
  })

  it('maaş / kişi', () => {
    expect(maasKisi(ORSSAN_GIDER, ORSSAN_EKONOMI)).toBeCloseTo(35766.4233576642, 8)
  })

  it('adet / dikimci', () => {
    expect(adetDikimci(ORSSAN_EKONOMI, null)).toBeCloseTo(478.185555555556, 8)
  })

  it('adet / dikimci PES gerçeği verilirse onu kullanır', () => {
    expect(adetDikimci(ORSSAN_EKONOMI, 36000)).toBe(400)
  })

  it('ortalama fiyat / adet', () => {
    expect(ortFiyatAdet(ORSSAN_EKONOMI, VARSAYILAN_PARAM, null))
      .toBeCloseTo(140.795411885863, 8)
  })
})

describe('dakika havuzları', () => {
  it('nominal dikim dakikası = dikim × saat × nominal gün × 60', () => {
    expect(nominalDikimDk(ORSSAN_EKONOMI)).toBe(1069200)
  })

  it('fiili dikim dakikası fiili günle', () => {
    expect(fiiliDikimDk(ORSSAN_EKONOMI)).toBe(741150)
  })

  it('üretim kişi-dakikası ofisi dışlar', () => {
    expect(uretimKisiDk(ORSSAN_EKONOMI)).toBe(1556280)
  })

  it('dikim kişi yoksa nominal dikim dakikası null', () => {
    const dikimsiz: EkonomiSatiri = { ...ORSSAN_EKONOMI, sewing_staff: null }
    expect(nominalDikimDk(dikimsiz)).toBeNull()
  })
})

describe('dakika maliyetleri', () => {
  it('kişi-dakika maliyeti = net gider ÷ üretim kişi-dakikası', () => {
    expect(kisiDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI)).toBeCloseTo(4.01791451409772, 12)
  })

  it('ağırlıklar eşitken üç bölüm aynı değeri alır', () => {
    const k = bolumDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, 'kesim')
    const d = bolumDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, 'dikim')
    const u = bolumDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, 'ukp')
    expect(k).toBeCloseTo(4.01791451409772, 12)
    expect(d).toBeCloseTo(4.01791451409772, 12)
    expect(u).toBeCloseTo(4.01791451409772, 12)
  })

  it('dikim ağırlığı artınca dikim pahalılaşır, kesim ucuzlar', () => {
    const agirlikli = { ...VARSAYILAN_PARAM, weight_sewing: 1.2 }
    const d = bolumDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI, agirlikli, 'dikim')!
    const k = bolumDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI, agirlikli, 'kesim')!
    expect(d).toBeGreaterThan(4.01791451409772)
    expect(k).toBeLessThan(4.01791451409772)
  })

  it('ağırlıklı kişi toplamı sıfırsa null', () => {
    const kadrosuz: EkonomiSatiri = {
      ...ORSSAN_EKONOMI, cutting_staff: 0, sewing_staff: 0, ukp_staff: 0,
    }
    expect(bolumDkMaliyet(ORSSAN_GIDER, kadrosuz, VARSAYILAN_PARAM, 'dikim')).toBeNull()
  })

  it('dikim dakika cirosu', () => {
    expect(dikimDkCiro(ORSSAN_EKONOMI, VARSAYILAN_PARAM)).toBeCloseTo(5.66719968453829, 12)
  })

  it('dakika marjı negatif', () => {
    expect(dakikaMarji(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM))
      .toBeCloseTo(-0.181098108203953, 12)
  })

  it('fiili dikim dakika maliyeti nominalden yüksek', () => {
    expect(fiiliDikimDkMaliyet(ORSSAN_GIDER, ORSSAN_EKONOMI))
      .toBeCloseTo(8.43688861903798, 12)
  })
})

describe('asgari ücret referansı', () => {
  it('nominal asgari dakika maliyeti', () => {
    expect(asgariDkMaliyetNominal(VARSAYILAN_PARAM)).toBeCloseTo(3.19470791245791, 12)
  })

  it('efektif dakika nominalden pahalı', () => {
    expect(asgariDkMaliyetEfektif(VARSAYILAN_PARAM))
      .toBeGreaterThan(asgariDkMaliyetNominal(VARSAYILAN_PARAM)!)
  })

  it('asgari dakika çarpanı', () => {
    expect(asgariDkCarpani(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM))
      .toBeCloseTo(1.83062049896221, 11)
  })
})

describe('dikim dakikası / adet', () => {
  it('nominal dakika ÷ adet', () => {
    expect(dikimDkAdet(ORSSAN_EKONOMI, null)).toBeCloseTo(24.843912288814, 10)
  })

  it('adet sıfırsa null', () => {
    const adetsiz: EkonomiSatiri = { ...ORSSAN_EKONOMI, qty_declared: 0 }
    expect(dikimDkAdet(adetsiz, null)).toBeNull()
  })
})

import { basabasFiyat, adilFiyat, fiyatSapmasi, dkMaliyet3DOran, hesapla } from './ekonomi-hesap'

describe('fiyat', () => {
  it('başabaş fiyat = net gider ÷ adet', () => {
    expect(basabasFiyat(ORSSAN_GIDER, ORSSAN_EKONOMI, null))
      .toBeCloseTo(145.294597401752, 9)
  })

  it('adil fiyat hedef marjla', () => {
    expect(adilFiyat(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, null))
      .toBeCloseTo(167.088787012015, 9)
  })

  it('Örssan adil fiyatın altında çalışıyor', () => {
    const sapma = fiyatSapmasi(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, null)!
    expect(sapma).toBeCloseTo(-0.157361697312826, 10)
    expect(sapma).toBeLessThan(0)
  })

  it('adet yoksa başabaş null', () => {
    const adetsiz: EkonomiSatiri = { ...ORSSAN_EKONOMI, qty_declared: null }
    expect(basabasFiyat(ORSSAN_GIDER, adetsiz, null)).toBeNull()
  })
})

describe('3D referans', () => {
  it('dikim dk maliyeti ÷ bölge 3D değeri', () => {
    expect(dkMaliyet3DOran(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, 5.05))
      .toBeCloseTo(0.795626636454994, 11)
  })

  it('bölge değeri yoksa null', () => {
    expect(dkMaliyet3DOran(ORSSAN_GIDER, ORSSAN_EKONOMI, VARSAYILAN_PARAM, null)).toBeNull()
  })
})

describe('hesapla — tam rasyo seti', () => {
  const r = hesapla({
    gider: ORSSAN_GIDER,
    ekonomi: ORSSAN_EKONOMI,
    param: VARSAYILAN_PARAM,
    dkMaliyet3D: 5.05,
    qtyActual: null,
  })

  it('36 alanın hepsini döndürür', () => {
    expect(Object.keys(r)).toHaveLength(36)
  })

  it('anahtar göstergeler Excel ile aynı', () => {
    expect(r.toplamKisi).toBe(137)
    expect(r.netGider).toBe(6253000)
    expect(r.marj).toBeCloseTo(-0.031955483887049, 12)
    expect(r.dikimDkMaliyet).toBeCloseTo(4.01791451409772, 12)
    expect(r.adilFiyat).toBeCloseTo(167.088787012015, 9)
  })

  it('tamamen boş girdide her alan null, hata atmaz', () => {
    const bosEkonomi: EkonomiSatiri = {
      revenue_declared: null, idle_days: null, qty_declared: null,
      nominal_days: null, actual_days: null, hours_per_day: null,
      cutting_staff: null, sewing_staff: null, ukp_staff: null, office_staff: null,
      area_m2: null, source: 'elle',
    }
    const bos = hesapla({
      gider: { incentive_amount: null },
      ekonomi: bosEkonomi,
      param: VARSAYILAN_PARAM,
      dkMaliyet3D: null,
      qtyActual: null,
    })
    expect(Object.values(bos).every(v => v === null)).toBe(true)
  })
})
