import { describe, it, expect } from 'vitest'
import {
  akranIstatistik, konum, ASGARI_ORNEKLEM, type AkranIstatistik,
} from './ekonomi-akran-ozet'

const ON = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

describe('küçük örneklem koruması', () => {
  it(`n < ${ASGARI_ORNEKLEM} ise özet DÖNMEZ`, () => {
    /* İki atölyede medyan doğrudan "öteki"dir; üçte de rakibin rakamı
       geri hesaplanır. Bu gizlilik şartı, sayısal bir incelik değil. */
    expect(akranIstatistik(10, [10, 20], 'yuksek-iyi')).toBeNull()
    expect(akranIstatistik(10, [10, 20, 30], 'yuksek-iyi')).toBeNull()
    expect(akranIstatistik(10, [10, 20, 30, 40], 'yuksek-iyi')).toBeNull()
  })

  it('tam sınırda döner', () => {
    expect(akranIstatistik(10, [10, 20, 30, 40, 50], 'yuksek-iyi')).not.toBeNull()
  })

  it('null değerler elendikten SONRA sayılır', () => {
    /* Beş eleman var ama üçü null — örneklem aslında 2. */
    expect(akranIstatistik(10, [10, 20, null, null, null], 'yuksek-iyi')).toBeNull()
  })
})

describe('istatistikler', () => {
  const ist = akranIstatistik(30, ON, 'yuksek-iyi')!

  it('medyan, çeyreklik ve uçlar', () => {
    expect(ist.n).toBe(10)
    expect(ist.medyan).toBeCloseTo(55, 10)
    expect(ist.q1).toBeCloseTo(32.5, 10)
    expect(ist.q3).toBeCloseTo(77.5, 10)
    expect(ist.enDusuk).toBe(10)
    expect(ist.enYuksek).toBe(100)
  })

  it('HİÇBİR kimlik alanı taşımıyor', () => {
    /* Özet atölye paneline gider; tek bir tanımlayıcı sızarsa anonimlik biter. */
    const anahtarlar = Object.keys(ist)
    for (const yasak of ['workshopId', 'ad', 'code', 'name', 'id', 'degerler', 'orneklem']) {
      expect(anahtarlar).not.toContain(yasak)
    }
    expect(anahtarlar.sort()).toEqual(
      ['enDusuk', 'enYuksek', 'kendiDeger', 'kendiSira', 'medyan', 'n', 'q1', 'q3'])
  })
})

describe('sıra', () => {
  it('yuksek-iyi: büyük değer 1. sırada', () => {
    expect(akranIstatistik(100, ON, 'yuksek-iyi')!.kendiSira).toBe(1)
    expect(akranIstatistik(10, ON, 'yuksek-iyi')!.kendiSira).toBe(10)
  })

  it('dusuk-iyi: küçük değer 1. sırada', () => {
    expect(akranIstatistik(10, ON, 'dusuk-iyi')!.kendiSira).toBe(1)
    expect(akranIstatistik(100, ON, 'dusuk-iyi')!.kendiSira).toBe(10)
  })

  it('eşitler aynı sırayı paylaşır', () => {
    const e = [50, 50, 50, 50, 50, 10]
    expect(akranIstatistik(50, e, 'yuksek-iyi')!.kendiSira).toBe(1)
  })

  it('kendi değeri yoksa sıra null ama özet yine döner', () => {
    const ist = akranIstatistik(null, ON, 'yuksek-iyi')!
    expect(ist.kendiSira).toBeNull()
    expect(ist.kendiDeger).toBeNull()
    expect(ist.medyan).toBeCloseTo(55, 10)
  })
})

describe('konum', () => {
  const ist = (v: number | null): AkranIstatistik => akranIstatistik(v, ON, 'yuksek-iyi')!

  it('yuksek-iyi yönünde çeyrekleri doğru okur', () => {
    expect(konum(ist(100), 'yuksek-iyi')).toBe('ust-ceyrek')
    expect(konum(ist(60), 'yuksek-iyi')).toBe('ust-orta')
    expect(konum(ist(40), 'yuksek-iyi')).toBe('alt-orta')
    expect(konum(ist(10), 'yuksek-iyi')).toBe('alt-ceyrek')
  })

  it('dusuk-iyi yönünde TERS okunur', () => {
    /* Maliyet göstergesinde düşük olmak iyidir; çeyreklikler aynı ama
       "üst çeyrek" karşılığı alt uçtur. */
    const d = (v: number) => konum(akranIstatistik(v, ON, 'dusuk-iyi')!, 'dusuk-iyi')
    expect(d(10)).toBe('ust-ceyrek')
    expect(d(100)).toBe('alt-ceyrek')
  })

  it('kendi değeri yoksa konum null', () => {
    expect(konum(ist(null), 'yuksek-iyi')).toBeNull()
  })
})
