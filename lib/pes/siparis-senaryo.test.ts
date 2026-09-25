import { describe, it, expect } from 'vitest'
import {
  ogrenmeKaybi, senaryoHesapla, karsilastir, mtmDuyarliligi,
  VARSAYILAN_SENARYO_PARAM, type SenaryoGirdi,
} from './siparis-senaryo'

const P = VARSAYILAN_SENARYO_PARAM

/* 50.000 adet, 20 dk/adet kararlı, 70 dikimci × 540 dk = 37.800 dk/gün. */
const TEMEL: Omit<SenaryoGirdi, 'partiSayisi'> = {
  toplamAdet: 50_000,
  kararliBirimDk: 20,
  gunlukKapasiteDk: 70 * 540,
  dikimDkMaliyet: 4.5,
  param: P,
}

describe('öğrenme kaybı', () => {
  it('parti büyüdükçe kayıp ARTMAZ — doyuma ulaşır', () => {
    /* Öğrenme sonsuza kadar sürmez: kararlı hıza ulaşıldıktan sonra
       ek adet ek kayıp getirmez. */
    const k1000 = ogrenmeKaybi(1000, 20, P)
    const k100000 = ogrenmeKaybi(100_000, 20, P)
    expect(k100000).toBeCloseTo(k1000, 6)
  })

  it('ASLA negatif olmaz', () => {
    /* max(t_s, ...) olmasaydı büyük partide birim süresi kararlının
       altına iner ve kayıp negatife dönerdi — model "parti ne kadar
       büyükse o kadar bedava" derdi. */
    for (const q of [1, 10, 100, 5_000, 50_000, 1_000_000]) {
      expect(ogrenmeKaybi(q, 20, P)).toBeGreaterThanOrEqual(0)
    }
  })

  it('küçük partide kayıp daha az (henüz doyuma varmamış)', () => {
    expect(ogrenmeKaybi(10, 20, P)).toBeLessThan(ogrenmeKaybi(1000, 20, P))
  })

  it('ilk birim çarpanı 1 ise öğrenme kaybı yok', () => {
    expect(ogrenmeKaybi(5000, 20, { ...P, ilkBirimCarpani: 1 })).toBe(0)
  })

  it('öğrenme oranı 1 ise (hiç öğrenme yok) kayıp hesaplanmaz', () => {
    expect(ogrenmeKaybi(5000, 20, { ...P, ogrenmeOrani: 1 })).toBe(0)
  })

  it('sıfır veya negatif adette 0', () => {
    expect(ogrenmeKaybi(0, 20, P)).toBe(0)
    expect(ogrenmeKaybi(-5, 20, P)).toBe(0)
  })
})

describe('50.000 tek parti ↔ 10 × 5.000 — kullanıcının asıl sorusu', () => {
  const tek = senaryoHesapla({ ...TEMEL, partiSayisi: 1 })
  const on = senaryoHesapla({ ...TEMEL, partiSayisi: 10 })

  it('saf dikim dakikası AYNI — fark yalnız kayıptan gelir', () => {
    expect(tek.dikimDk).toBe(on.dikimDk)
    expect(tek.dikimDk).toBe(50_000 * 20)
  })

  it('10 parti 10 değişim demek', () => {
    expect(tek.degisimSayisi).toBe(1)
    expect(on.degisimSayisi).toBe(10)
    expect(on.degisimKaybiDk).toBeCloseTo(10 * P.degisimDk, 6)
  })

  it('10 parti daha pahalı ve daha uzun', () => {
    expect(on.toplamDk).toBeGreaterThan(tek.toplamDk)
    expect(on.gun!).toBeGreaterThan(tek.gun!)
    expect(on.maliyet!).toBeGreaterThan(tek.maliyet!)
  })

  it('karşılaştırma farkı pozitif ve tutarlı', () => {
    const k = karsilastir(tek, on)
    expect(k.farkDk).toBeCloseTo(on.toplamDk - tek.toplamDk, 6)
    expect(k.farkMaliyet).toBeCloseTo(k.farkDk * 4.5, 6)
    expect(k.farkOran!).toBeGreaterThan(0)
  })

  it('kayıp parti sayısıyla DOĞRUSAL artar', () => {
    const p1 = senaryoHesapla({ ...TEMEL, partiSayisi: 1 })
    const p2 = senaryoHesapla({ ...TEMEL, partiSayisi: 2 })
    const p4 = senaryoHesapla({ ...TEMEL, partiSayisi: 4 })
    const kayip = (s: typeof p1) => s.degisimKaybiDk
    expect(kayip(p2)).toBeCloseTo(2 * kayip(p1), 6)
    expect(kayip(p4)).toBeCloseTo(4 * kayip(p1), 6)
  })
})

describe('bant bölme — kapasiteyi ARTIRMAZ', () => {
  const tekBant = senaryoHesapla({ ...TEMEL, partiSayisi: 1, bantSayisi: 1 })
  const dortBant = senaryoHesapla({ ...TEMEL, partiSayisi: 1, bantSayisi: 4 })

  it('bant bölmek süreyi KISALTMAZ — aynı kadro bölünüyor, çoğalmıyor', () => {
    /* İlk sürümde kapasite bant sayısıyla çarpılıyordu ve simülatör
       "3 banda böl, 55,6 gün 18,6 güne insin" diyordu. Bir atölyenin 53
       dikimcisini üç banda bölmek üç katı insan yaratmaz. */
    expect(dortBant.etkinGunlukKapasiteDk).toBe(tekBant.etkinGunlukKapasiteDk)
    expect(dortBant.gun!).toBeGreaterThan(tekBant.gun!)
  })

  it('yalnız kaybı KATLAR — her bant ayrı kurulum ve ayrı öğrenme', () => {
    expect(dortBant.degisimSayisi).toBe(4)
    expect(dortBant.degisimKaybiDk).toBeCloseTo(4 * tekBant.degisimKaybiDk, 6)
    expect(dortBant.toplamDk).toBeGreaterThan(tekBant.toplamDk)
    expect(dortBant.maliyet!).toBeGreaterThan(tekBant.maliyet!)
  })
})

describe('süreyi gerçekten kısaltan iki şey', () => {
  const temelS = senaryoHesapla({ ...TEMEL, partiSayisi: 1 })

  it('kapasite payı — sıra atlamak (başka işi ötelemek)', () => {
    const yarim = senaryoHesapla({ ...TEMEL, partiSayisi: 1, kapasitePayi: 0.5 })
    expect(yarim.gun!).toBeCloseTo(temelS.gun! * 2, 6)
  })

  it('mesai — kapasiteyi GERÇEKTEN artırır', () => {
    const mesaili = senaryoHesapla({
      ...TEMEL, partiSayisi: 1, ekGunlukKapasiteDk: TEMEL.gunlukKapasiteDk,
    })
    expect(mesaili.gun!).toBeCloseTo(temelS.gun! / 2, 6)
  })

  it('kapasite payı 0-1 aralığına kırpılır', () => {
    const asiri = senaryoHesapla({ ...TEMEL, partiSayisi: 1, kapasitePayi: 5 })
    expect(asiri.etkinGunlukKapasiteDk).toBe(TEMEL.gunlukKapasiteDk)
  })
})

describe('maliyet', () => {
  it('dikim dk maliyeti yoksa maliyet null — SIFIR DEĞİL', () => {
    const s = senaryoHesapla({ ...TEMEL, partiSayisi: 1, dikimDkMaliyet: null })
    expect(s.maliyet).toBeNull()
    expect(s.birimMaliyet).toBeNull()
    /* Dakika hesabı yine de yapılır: maliyet bilinmese de süre bilinir. */
    expect(s.toplamDk).toBeGreaterThan(0)
  })

  it('birim maliyet toplamdan türer', () => {
    const s = senaryoHesapla({ ...TEMEL, partiSayisi: 1 })
    expect(s.birimMaliyet!).toBeCloseTo(s.maliyet! / 50_000, 10)
  })

  it('sıfır adette birim maliyet null (bölme yok)', () => {
    const s = senaryoHesapla({ ...TEMEL, toplamAdet: 0, partiSayisi: 1 })
    expect(s.birimMaliyet).toBeNull()
  })
})

describe('MTM duyarlılığı', () => {
  it('süre %10 düşerse çıktı %11,1 artar', () => {
    expect(mtmDuyarliligi(-0.1)!).toBeCloseTo(1 / 0.9 - 1, 10)
  })

  it('süre %10 artarsa çıktı %9,1 düşer', () => {
    expect(mtmDuyarliligi(0.1)!).toBeCloseTo(1 / 1.1 - 1, 10)
  })

  it('süre sıfıra inerse tanımsız', () => {
    expect(mtmDuyarliligi(-1)).toBeNull()
    expect(mtmDuyarliligi(-2)).toBeNull()
  })
})
