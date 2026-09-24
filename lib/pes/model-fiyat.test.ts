import { describe, it, expect } from 'vitest'
import { gercekDakika, bolumMaliyeti, modelFiyati } from './model-fiyat'
import type { FiyatGirdisi } from './model-fiyat'
import { VARSAYILAN_PARAM } from './ekonomi-tipler'

/* Excel MODEL_HESAP satır 4 — Netclass, "ÖRNEK — Klasik gömlek, uzun kol".
   Değerler Excel'in önbelleğinden okundu ve formüller elle doğrulandı. */
const GIRDI: FiyatGirdisi = {
  bolumSn: { KESIM: 150, DIKIM: 1380, UKP: 300 },
  bolumDkMaliyet: {
    KESIM: 3.322142950541009,
    DIKIM: 3.322142950541009,
    UKP: 3.322142950541009,
  },
  param: VARSAYILAN_PARAM,
  cmtFiyat: 377,
  gunlukAdet: 1200,
  dikimKapasiteDk: 32400,
  dkMaliyet3D: 5.05,
}

describe('gercekDakika', () => {
  it('MTM saniyesini verimlilikle bölerek dakikaya çevirir', () => {
    expect(gercekDakika(150, 0.75)).toBeCloseTo(3.3333333333, 9)
    expect(gercekDakika(1380, 0.65)).toBeCloseTo(35.3846153846, 9)
    expect(gercekDakika(300, 0.75)).toBeCloseTo(6.6666666667, 9)
  })

  it('verimlilik sıfırsa null — bölme yok', () => {
    expect(gercekDakika(150, 0)).toBeNull()
  })

  it('süre sıfırsa sıfır, null değil', () => {
    expect(gercekDakika(0, 0.65)).toBe(0)
  })
})

describe('bolumMaliyeti', () => {
  it('gerçek dakika × bölüm dakika maliyeti', () => {
    expect(bolumMaliyeti(3.3333333333333335, 3.322142950541009)).toBeCloseTo(11.0738098351, 8)
  })

  it('dakika maliyeti yoksa null', () => {
    expect(bolumMaliyeti(3.33, null)).toBeNull()
  })
})

describe('modelFiyati — Excel MODEL_HESAP satır 4', () => {
  const f = modelFiyati(GIRDI)

  it('bölüm gerçek dakikaları', () => {
    expect(f.kesimDk).toBeCloseTo(3.3333333333, 9)
    expect(f.dikimDk).toBeCloseTo(35.3846153846, 9)
    expect(f.ukpDk).toBeCloseTo(6.6666666667, 9)
  })

  it('bölüm maliyetleri', () => {
    expect(f.kesimTl).toBeCloseTo(11.0738098351, 8)
    expect(f.dikimTl).toBeCloseTo(117.5527505576, 8)
    expect(f.ukpTl).toBeCloseTo(22.1476196703, 8)
  })

  it('toplam maliyet / adet', () => {
    expect(f.toplamMaliyet).toBeCloseTo(150.7741800630, 8)
  })

  it('adil fiyat hedef marjla', () => {
    expect(f.adilFiyat).toBeCloseTo(173.3903070725, 8)
  })

  it('kâr ve marj', () => {
    expect(f.karAdet).toBeCloseTo(226.2258199370, 8)
    expect(f.marj).toBeCloseTo(0.6000684879, 9)
  })

  it('fiyat sapması — CMT adil fiyatın kaç katı üstünde', () => {
    expect(f.fiyatSapmasi).toBeCloseTo(1.1742853240, 8)
  })

  it('kapasite payı 1 üstünde — bu adet bu banda sığmıyor', () => {
    expect(f.gunlukDikimIhtiyaci).toBeCloseTo(42461.5384615385, 6)
    expect(f.kapasitePayi).toBeCloseTo(1.3105413105, 8)
    expect(f.kapasiteAsimi).toBe(true)
  })

  it('3D referans maliyet VERİMLİLİK DÜZELTMESİZ hesaplanır', () => {
    // (150 + 1380 + 300) / 60 × 5,05 = 30,5 × 5,05
    expect(f.referans3D).toBeCloseTo(154.025, 6)
    expect(f.cmt3dSapma).toBeCloseTo(1.4476546015, 8)
  })

  it('aylık sonuç = parça kârı × günlük adet × nominal gün', () => {
    expect(f.aylikSonuc).toBeCloseTo(5972361.6463364, 4)
  })
})

describe('modelFiyati — eksik veri', () => {
  it('bölüm dakika maliyeti yoksa o bölüm null, toplam da null', () => {
    const f = modelFiyati({ ...GIRDI, bolumDkMaliyet: { KESIM: null, DIKIM: 3.32, UKP: 3.32 } })
    expect(f.kesimTl).toBeNull()
    expect(f.toplamMaliyet).toBeNull()
    expect(f.adilFiyat).toBeNull()
  })

  it('CMT yoksa marj ve sapma null ama maliyet hesaplanır', () => {
    const f = modelFiyati({ ...GIRDI, cmtFiyat: null })
    expect(f.toplamMaliyet).toBeCloseTo(150.7741800630, 8)
    expect(f.karAdet).toBeNull()
    expect(f.marj).toBeNull()
  })

  it('3D değeri yoksa referans null, gerisi etkilenmez', () => {
    const f = modelFiyati({ ...GIRDI, dkMaliyet3D: null })
    expect(f.referans3D).toBeNull()
    expect(f.cmt3dSapma).toBeNull()
    expect(f.toplamMaliyet).toBeCloseTo(150.7741800630, 8)
  })

  it('kapasite sıfırsa pay null, aşım false değil null', () => {
    const f = modelFiyati({ ...GIRDI, dikimKapasiteDk: 0 })
    expect(f.kapasitePayi).toBeNull()
    expect(f.kapasiteAsimi).toBeNull()
  })
})
