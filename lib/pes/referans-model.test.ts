import { describe, it, expect } from 'vitest'
import {
  adNormalize, baseAd, gorunumleriCikar, parcaSureleri, modelSayisiTahmini,
  bolgeSureleri, referansDikimSn, bolumSureleri, referansFiyat, guvenEtiketi, type HamSatir,
} from './referans-model'

const s = (klasman: string, bolge: string, ekParca: string, operasyon: string, mtm: number): HamSatir =>
  ({ klasman, bolge, ekParca, operasyon, mtm })

describe('adNormalize / baseAd', () => {
  it('boşluk ve BASİC yazımını düzeltir', () => {
    expect(adNormalize('  BASİC  DENIM\tPANTOLON ')).toBe('BASIC DENIM PANTOLON')
  })
  it('parantezli özellikleri atar', () => {
    expect(baseAd('Kol Takma (Çimalı)')).toBe('Kol Takma')
    expect(baseAd('Gömlek Manşet (Çimalı)(Ekoseli)')).toBe('Gömlek Manşet')
    expect(baseAd('(Parçası Dikey)')).toBe('(Parçası Dikey)')
  })
})

describe('gorunumleriCikar', () => {
  it('ardışık blok bir görünümdür; anahtar değişince yenisi başlar', () => {
    const { gorunumler } = gorunumleriCikar([
      s('G', 'Kol', 'Kol Takma', 'Kol Takma', 20),
      s('G', 'Kol', 'Kol Takma', 'Regula', 10),
      s('G', 'Yaka', 'Gömlek Yaka', 'Yaka Takma', 15),
      s('G', 'Kol', 'Kol Takma', 'Kol Takma', 22),
    ])
    expect(gorunumler.map((g) => [g.ekParca, g.sn])).toEqual([
      ['Kol Takma', 30], ['Gömlek Yaka', 15], ['Kol Takma', 22],
    ])
  })
  it('görünüm içindeki tam tekrarı bir kez sayar, sıfırı atlar ve bloğu bölmez', () => {
    const { gorunumler, atlanan } = gorunumleriCikar([
      s('G', 'Kol', 'Kol Takma', 'Kol Takma', 20),
      s('G', 'Kol', 'Kol Takma', 'Kol Takma', 20),
      s('G', 'Kol', 'Kol Takma', 'Boş', 0),
      s('G', 'Kol', 'Kol Takma', 'Regula', 10),
    ])
    expect(gorunumler).toHaveLength(1)
    expect(gorunumler[0].sn).toBe(30)
    expect(gorunumler[0].opSayisi).toBe(2)
    expect(atlanan).toBe(2)
  })
})

describe('parcaSureleri', () => {
  it('görünüm toplamlarının medyanını ve görülme sayısını verir', () => {
    const { gorunumler } = gorunumleriCikar([
      s('G', 'Kol', 'Kol Takma', 'a', 20), s('G', 'Yaka', 'Y', 'b', 1),
      s('G', 'Kol', 'Kol Takma', 'a', 30), s('G', 'Yaka', 'Y', 'b', 1),
      s('G', 'Kol', 'Kol Takma', 'a', 100),
    ])
    const kol = parcaSureleri(gorunumler).find((p) => p.ekParca === 'Kol Takma')!
    expect(kol).toMatchObject({ gorulme: 3, snMedyan: 30, snMin: 20, snMax: 100 })
  })
})

describe('ortalama model', () => {
  const adaylar = [
    { bolge: 'Kol', ekParca: 'Kol Takma', gorulme: 7, snMedyan: 25 },
    { bolge: 'Kol', ekParca: 'Kol Takma (Çimalı)', gorulme: 8, snMedyan: 50 },
    { bolge: 'Kol', ekParca: 'Manşet', gorulme: 5, snMedyan: 150 },
    { bolge: 'Yaka', ekParca: 'Gömlek Yaka', gorulme: 6, snMedyan: 150 },
    { bolge: 'Yaka', ekParca: 'Ayaksız Gömlek Yaka', gorulme: 2, snMedyan: 120 },
  ]
  it('model sayısını en yaygın base üzerinden tahmin eder (varyantlar toplanır)', () => {
    expect(modelSayisiTahmini(adaylar)).toBe(15)
  })
  it('bölge süresi = Σ min(1, görülme ÷ N_bölge) × medyan', () => {
    const b = bolgeSureleri(adaylar)
    const kol = b.find((x) => x.bolge === 'Kol')!
    expect(kol.modelSayisi).toBe(15)
    expect(kol.sn).toBeCloseTo((7 / 15) * 25 + (8 / 15) * 50 + (5 / 15) * 150, 9)
    // Yaka'nın N'i kendi en yaygın parçası: 6. Alternatif yakalar oranla girer.
    const yaka = b.find((x) => x.bolge === 'Yaka')!
    expect(yaka.modelSayisi).toBe(6)
    expect(yaka.sn).toBeCloseTo(150 + (2 / 6) * 120, 9)
  })
  it('referans dikim = bölgelerin toplamı', () => {
    const b = bolgeSureleri(adaylar)
    expect(referansDikimSn(adaylar)).toBeCloseTo(b[0].sn + b[1].sn, 9)
  })
  it('boş girdide 0', () => {
    expect(referansDikimSn([])).toBe(0)
  })
})

describe('bolumSureleri', () => {
  const p = {
    ref_kesim_personel_orani: 0.067, ref_ukp_personel_orani: 0.4,
    eff_cutting: 0.75, eff_sewing: 0.65, eff_ukp: 0.75,
  }
  it('personel oranı × verimlilik oranı', () => {
    const b = bolumSureleri(1000, p)
    expect(b.dikimSn).toBe(1000)
    expect(b.kesimSn).toBeCloseTo(1000 * 0.067 * 0.75 / 0.65, 9)
    expect(b.ukpSn).toBeCloseTo(1000 * 0.4 * 0.75 / 0.65, 9)
  })
  it('dikim verimliliği 0 ise kesim/UKP hesaplanamaz (null, 0 değil)', () => {
    const b = bolumSureleri(1000, { ...p, eff_sewing: 0 })
    expect(b.kesimSn).toBeNull()
    expect(b.ukpSn).toBeNull()
  })
})

describe('referansFiyat', () => {
  it('standart dakika × 3D, verimlilik düzeltmesiz', () => {
    const f = referansFiyat({ kesimSn: 60, dikimSn: 1200, ukpSn: 120 }, 6)
    expect(f).toEqual({ kesimTl: 6, dikimTl: 120, ukpTl: 12, toplamTl: 138 })
  })
  it('3D yoksa her şey null', () => {
    expect(referansFiyat({ kesimSn: 60, dikimSn: 1200, ukpSn: 120 }, null).toplamTl).toBeNull()
  })
  it('bir bölüm hesaplanamıyorsa toplam da hesaplanamaz', () => {
    const f = referansFiyat({ kesimSn: null, dikimSn: 1200, ukpSn: 120 }, 6)
    expect(f.dikimTl).toBe(120)
    expect(f.toplamTl).toBeNull()
  })
})

describe('guvenEtiketi', () => {
  it('model sayısına göre', () => {
    expect([15, 8, 5, 4, 3, 2, 1, 0].map(guvenEtiketi))
      .toEqual(['YUKSEK', 'YUKSEK', 'ORTA', 'ORTA', 'DUSUK', 'DUSUK', 'ZAYIF', 'ZAYIF'])
  })
})
