import { describe, it, expect } from 'vitest'
import {
  pazarMi, hamKapasite, efektifKapasite, bantPayi, gunlukPlan, planBitisi,
  gunlukDoluluk, aylikDoluluk,
} from './bant-doluluk'
import type { BantTanim, BlokTanim, AtamaTanim } from './bant-doluluk'

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

describe('gunlukPlan', () => {
  const atama: AtamaTanim = {
    atamaId: 1, lineId: 101, adet: 9000, planBaslangic: '2027-01-04', elleplan: {},
  }
  const ctx = { bantlar: BANTLAR, bloklar: [] as BlokTanim[], override: () => null }

  it('bandın payı kadar doldurur, son gün kalanı yazar', () => {
    const p = gunlukPlan(atama, ctx)
    expect(p.map(x => x.adet)).toEqual([2000, 2000, 2000, 2000, 1000])
    expect(p.map(x => x.tarih)).toEqual([
      '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08',
    ])
  })

  it('Pazar atlanır, Cumartesi çalışılır', () => {
    const uzun = { ...atama, adet: 13000 }
    const tarihler = gunlukPlan(uzun, ctx).map(x => x.tarih)
    expect(tarihler).toContain('2027-01-09')     // Cumartesi
    expect(tarihler).not.toContain('2027-01-10') // Pazar
  })

  it('elle girilen gün sabit kalır, kalan arkaya kayar', () => {
    const elle = { ...atama, elleplan: { '2027-01-04': 1000, '2027-01-05': 1250 } }
    const p = gunlukPlan(elle, ctx)
    expect(p[0]).toMatchObject({ tarih: '2027-01-04', adet: 1000, elle: true })
    expect(p[1]).toMatchObject({ tarih: '2027-01-05', adet: 1250, elle: true })
    expect(p[2]).toMatchObject({ tarih: '2027-01-06', adet: 2000, elle: false })
    expect(p.reduce((t, x) => t + x.adet, 0)).toBe(9000)
  })

  it('elle girilen gün kalandan büyükse kalanla sınırlanır', () => {
    const kucuk = { ...atama, adet: 500, elleplan: { '2027-01-04': 9999 } }
    const p = gunlukPlan(kucuk, ctx)
    expect(p).toHaveLength(1)
    expect(p[0].adet).toBe(500)
  })

  it('kapasitesi sıfır olan gün atlanır, plan uzar', () => {
    const c = { ...ctx, override: (t: string) => (t === '2027-01-06' ? 0 : null) }
    const p = gunlukPlan(atama, c)
    expect(p.map(x => x.tarih)).not.toContain('2027-01-06')
    expect(p.reduce((t, x) => t + x.adet, 0)).toBe(9000)
  })

  it('toplam her zaman sipariş adedine eşittir', () => {
    for (const adet of [1, 999, 9000, 25000]) {
      const p = gunlukPlan({ ...atama, adet }, ctx)
      expect(p.reduce((t, x) => t + x.adet, 0)).toBe(adet)
    }
  })
})

describe('planBitisi', () => {
  const ctx = { bantlar: BANTLAR, bloklar: [] as BlokTanim[], override: () => null }

  it('adedin tükendiği son gündür', () => {
    const a: AtamaTanim = {
      atamaId: 1, lineId: 101, adet: 9000, planBaslangic: '2027-01-04', elleplan: {},
    }
    expect(planBitisi(a, ctx)).toBe('2027-01-08')
  })

  it('elle girilen düşük plan bitişi ileri iter', () => {
    const a: AtamaTanim = {
      atamaId: 1, lineId: 101, adet: 9000, planBaslangic: '2027-01-04',
      elleplan: { '2027-01-04': 500, '2027-01-05': 500 },
    }
    expect(planBitisi(a, ctx) > '2027-01-08').toBe(true)
  })
})

describe('gunlukDoluluk', () => {
  const ctx = { bantlar: BANTLAR, bloklar: [] as BlokTanim[], override: () => null }
  const atamalar: AtamaTanim[] = [
    { atamaId: 1, lineId: 101, adet: 9000, planBaslangic: '2027-01-04', elleplan: {} },
    { atamaId: 2, lineId: 102, adet: 4000, planBaslangic: '2027-01-04', elleplan: {} },
  ]

  it('plan toplamını kapasiteye böler', () => {
    const d = gunlukDoluluk('2027-01-04', atamalar, ctx, {})
    expect(d.plan).toBe(4000)      // 2000 + 2000
    expect(d.kapasite).toBe(5000)
    expect(d.oran).toBeCloseTo(0.8, 6)
    expect(d.asim).toBe(false)
  })

  it('rezerveyi plana ekler ama kapasiteyi düşürmez', () => {
    const rez: BlokTanim[] = [
      { lineId: 103, tip: 'REZERVE', adet: 1000, baslangic: '2027-01-04', bitis: '2027-01-08' },
    ]
    const d = gunlukDoluluk('2027-01-04', atamalar, { ...ctx, bloklar: rez }, {})
    expect(d.kapasite).toBe(5000)
    expect(d.rezerve).toBe(1000)
    expect(d.oran).toBeCloseTo(1.0, 6)
    expect(d.asim).toBe(false)     // tam dolu aşım değildir
  })

  it('kapasiteyi aşınca asim true', () => {
    const rez: BlokTanim[] = [
      { lineId: 103, tip: 'REZERVE', adet: 2000, baslangic: '2027-01-04', bitis: '2027-01-08' },
    ]
    const d = gunlukDoluluk('2027-01-04', atamalar, { ...ctx, bloklar: rez }, {})
    expect(d.asim).toBe(true)
  })

  it('gerçekleşeni ayrı toplar', () => {
    const d = gunlukDoluluk('2027-01-04', atamalar, ctx, { 1: { '2027-01-04': 1800 } })
    expect(d.gercek).toBe(1800)
  })

  it('kapasite sıfırken oran sıfır, aşım yok', () => {
    const d = gunlukDoluluk('2027-01-10', atamalar, ctx, {})  // Pazar
    expect(d.kapasite).toBe(0)
    expect(d.oran).toBe(0)
    expect(d.asim).toBe(false)
  })
})

describe('aylikDoluluk', () => {
  const ctx = { bantlar: BANTLAR, bloklar: [] as BlokTanim[], override: () => null }
  const atamalar: AtamaTanim[] = [
    { atamaId: 1, lineId: 101, adet: 9000, planBaslangic: '2027-01-04', elleplan: {} },
  ]

  it('ayın çalışılan günlerini toplayıp böler', () => {
    const a = aylikDoluluk('2027-01', atamalar, ctx, {})
    expect(a).not.toBeNull()
    expect(a!.plan).toBe(9000)
    expect(a!.kapasite).toBeGreaterThan(0)
    expect(a!.oran).toBeCloseTo(9000 / a!.kapasite, 6)
  })

  it('hiç çalışılan gün yoksa null döner — %0 ile veri yok aynı değildir', () => {
    const kapali = { ...ctx, override: () => 0 }
    expect(aylikDoluluk('2027-01', atamalar, kapali, {})).toBeNull()
  })
})
