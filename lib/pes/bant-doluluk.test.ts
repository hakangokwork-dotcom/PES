import { describe, it, expect } from 'vitest'
import { pazarMi, hamKapasite, efektifKapasite, bantPayi } from './bant-doluluk'
import type { BantTanim, BlokTanim } from './bant-doluluk'

/* 2027-01-04 Pazartesi, 2027-01-09 Cumartesi, 2027-01-10 Pazar. */
const BANTLAR: BantTanim[] = [
  { lineId: 101, dailyTarget: 2000, aktif: true },
  { lineId: 102, dailyTarget: 2000, aktif: true },
  { lineId: 103, dailyTarget: 1000, aktif: true },
  { lineId: 104, dailyTarget: 5000, aktif: false },
]
const BLOKLAR: BlokTanim[] = [
  { lineId: 103, tip: 'BAKIM', adet: null, baslangic: '2027-01-06', bitis: '2027-01-07' },
]

describe('pazarMi', () => {
  it('Pazar günü true, Cumartesi false', () => {
    expect(pazarMi('2027-01-10')).toBe(true)
    expect(pazarMi('2027-01-09')).toBe(false)
    expect(pazarMi('2027-01-04')).toBe(false)
  })
})

describe('hamKapasite', () => {
  it('yalnız aktif bantları toplar', () => {
    expect(hamKapasite(BANTLAR, [], '2027-01-04')).toBe(5000)
  })

  it('tam BAKIM bloğu olan bandı havuzdan çıkarır', () => {
    expect(hamKapasite(BANTLAR, BLOKLAR, '2027-01-06')).toBe(4000)
  })

  it('blok bittikten sonra bant havuza döner', () => {
    expect(hamKapasite(BANTLAR, BLOKLAR, '2027-01-08')).toBe(5000)
  })

  it('kısmi blok (adet dolu) bandı havuzdan çıkarmaz', () => {
    const kismi: BlokTanim[] = [
      { lineId: 103, tip: 'İZİN', adet: 400, baslangic: '2027-01-06', bitis: '2027-01-06' },
    ]
    expect(hamKapasite(BANTLAR, kismi, '2027-01-06')).toBe(5000)
  })

  it('REZERVE bandı havuzdan çıkarmaz — kapasite durur, tutulmuştur', () => {
    const rez: BlokTanim[] = [
      { lineId: 103, tip: 'REZERVE', adet: null, baslangic: '2027-01-06', bitis: '2027-01-08' },
    ]
    expect(hamKapasite(BANTLAR, rez, '2027-01-06')).toBe(5000)
  })
})

describe('efektifKapasite', () => {
  it('Pazar sıfır', () => {
    expect(efektifKapasite(BANTLAR, [], '2027-01-10', null)).toBe(0)
  })

  it('override yoksa ham kapasite', () => {
    expect(efektifKapasite(BANTLAR, [], '2027-01-04', null)).toBe(5000)
  })

  it('override varsa onu kullanır', () => {
    expect(efektifKapasite(BANTLAR, [], '2027-01-04', 2500)).toBe(2500)
  })

  it('override sıfır olabilir — atölye o gün kapalı', () => {
    expect(efektifKapasite(BANTLAR, [], '2027-01-04', 0)).toBe(0)
  })
})

describe('bantPayi', () => {
  it('override yokken bandın kendi daily_target’ı', () => {
    expect(bantPayi(101, BANTLAR, [], '2027-01-04', null)).toBe(2000)
    expect(bantPayi(103, BANTLAR, [], '2027-01-04', null)).toBe(1000)
  })

  it('eşit bölmez — 12 kişilik ile 30 kişilik bandın payı farklıdır', () => {
    expect(bantPayi(101, BANTLAR, [], '2027-01-04', null))
      .not.toBe(bantPayi(103, BANTLAR, [], '2027-01-04', null))
  })

  it('override varsa paylar daily_target oranında küçülür', () => {
    // ham 5000, override 2500 → oran 0.5
    expect(bantPayi(101, BANTLAR, [], '2027-01-04', 2500)).toBe(1000)
    expect(bantPayi(103, BANTLAR, [], '2027-01-04', 2500)).toBe(500)
  })

  it('bakımdaki bant sıfır alır, kalanlar havuzu paylaşır', () => {
    expect(bantPayi(103, BANTLAR, BLOKLAR, '2027-01-06', null)).toBe(0)
    expect(bantPayi(101, BANTLAR, BLOKLAR, '2027-01-06', null)).toBe(2000)
  })

  it('pasif bant sıfır alır', () => {
    expect(bantPayi(104, BANTLAR, [], '2027-01-04', null)).toBe(0)
  })

  it('Pazar sıfır', () => {
    expect(bantPayi(101, BANTLAR, [], '2027-01-10', null)).toBe(0)
  })
})
