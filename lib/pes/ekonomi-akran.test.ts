import { describe, it, expect } from 'vitest'
import {
  medyan, yuzdelikSkor, buyuklukBandi, akranGrubu, marjSirasi,
  fiyatEndeksi, endeksOkumasi,
} from './ekonomi-akran'
import type { AkranAdayi } from './ekonomi-akran'

function aday(
  ad: string, marj: number | null, klasman: string[], dikim: number,
): AkranAdayi {
  return { workshopId: ad.length, ad, klasmanlar: klasman, sewingStaff: dikim, marj }
}

const ORNEKLEM: AkranAdayi[] = [
  aday('A', 0.10, ['315 - Erkek Çocuk'], 40),
  aday('BB', 0.05, ['315 - Erkek Çocuk'], 45),
  aday('CCC', -0.03, ['315 - Erkek Çocuk'], 90),
  aday('DDDD', -0.20, ['300 - Kız Çocuk 1'], 95),
  aday('EEEEE', 0.02, ['300 - Kız Çocuk 1'], 120),
  aday('FFFFFF', null, ['315 - Erkek Çocuk'], 50),
]

describe('medyan', () => {
  it('tek sayıda ortadaki', () => {
    expect(medyan([3, 1, 2])).toBe(2)
  })

  it('çift sayıda iki ortancanın ortalaması', () => {
    expect(medyan([4, 1, 3, 2])).toBe(2.5)
  })

  it('null değerleri atlar', () => {
    expect(medyan([1, null, 3])).toBe(2)
  })

  it('hiç sayı yoksa null', () => {
    expect(medyan([null, null])).toBeNull()
  })

  it('boş dizide null', () => {
    expect(medyan([])).toBeNull()
  })
})

describe('yuzdelikSkor', () => {
  it('en iyi 100', () => {
    expect(yuzdelikSkor(10, [2, 4, 6, 8, 10])).toBe(100)
  })

  it('en kötü 0', () => {
    expect(yuzdelikSkor(2, [2, 4, 6, 8, 10])).toBe(0)
  })

  it('ortadaki 50', () => {
    expect(yuzdelikSkor(6, [2, 4, 6, 8, 10])).toBe(50)
  })

  it('tek elemanlı örneklemde null — kıyas yok', () => {
    expect(yuzdelikSkor(5, [5])).toBeNull()
  })

  it('değer null ise null', () => {
    expect(yuzdelikSkor(null, [2, 4, 6])).toBeNull()
  })
})

describe('buyuklukBandi', () => {
  it('50 altı kucuk', () => {
    expect(buyuklukBandi(40)).toBe('kucuk')
  })

  it('50 dahil orta', () => {
    expect(buyuklukBandi(50)).toBe('orta')
  })

  it('100 üstü buyuk', () => {
    expect(buyuklukBandi(120)).toBe('buyuk')
  })

  it('bilinmiyorsa null', () => {
    expect(buyuklukBandi(null)).toBeNull()
  })
})

describe('akranGrubu', () => {
  it('yeterli örneklem yoksa klasmana düşer', () => {
    const hedef = ORNEKLEM[2] // CCC, 315 klasman, 90 kişi = orta
    const g = akranGrubu(hedef, ORNEKLEM, 5)
    expect(g.kademe).toBe('klasman')
    expect(g.uyeler.map(u => u.ad).sort()).toEqual(['A', 'BB', 'CCC'])
  })

  it('klasmanda da yetmezse tüm örnekleme düşer', () => {
    const hedef = ORNEKLEM[3] // DDDD, 300 klasman — yalnız 2 üye
    const g = akranGrubu(hedef, ORNEKLEM, 5)
    expect(g.kademe).toBe('tumu')
    expect(g.uyeler).toHaveLength(5) // marjı null olan FFFFFF dışarıda
  })

  it('cirosu olmayan atölye örnekleme girmez', () => {
    const hedef = ORNEKLEM[0]
    const g = akranGrubu(hedef, ORNEKLEM, 1)
    expect(g.uyeler.some(u => u.ad === 'FFFFFF')).toBe(false)
  })

  it('n her zaman raporlanır', () => {
    const g = akranGrubu(ORNEKLEM[0], ORNEKLEM, 5)
    expect(g.n).toBe(g.uyeler.length)
  })

  it('eşik düşükse en dar kademede kalır', () => {
    const hedef = ORNEKLEM[0] // A, 315, 40 kişi = kucuk
    const g = akranGrubu(hedef, ORNEKLEM, 2)
    expect(g.kademe).toBe('klasman+buyukluk')
    expect(g.uyeler.map(u => u.ad).sort()).toEqual(['A', 'BB'])
  })
})

describe('marjSirasi', () => {
  it('en kârlı 1', () => {
    expect(marjSirasi(0.10, ORNEKLEM)).toBe(1)
  })

  it('en zararlı sonuncu', () => {
    expect(marjSirasi(-0.20, ORNEKLEM)).toBe(5)
  })

  it('marjı olmayan sıralanmaz', () => {
    expect(marjSirasi(null, ORNEKLEM)).toBeNull()
  })
})

describe('fiyatEndeksi', () => {
  it('medyana eşitse 100', () => {
    expect(fiyatEndeksi(5, [3, 5, 7])).toBe(100)
  })

  it('medyanın %20 üstü 120', () => {
    expect(fiyatEndeksi(6, [3, 5, 7])).toBeCloseTo(120, 10)
  })

  it('medyanın altı 100 altında', () => {
    expect(fiyatEndeksi(4, [3, 5, 7])).toBeCloseTo(80, 10)
  })

  it('değer null ise null', () => {
    expect(fiyatEndeksi(null, [3, 5, 7])).toBeNull()
  })

  it('örneklemde hiç sayı yoksa null', () => {
    expect(fiyatEndeksi(5, [null, null])).toBeNull()
  })

  it('medyan sıfırsa null — bölme yok', () => {
    expect(fiyatEndeksi(5, [0, 0, 0])).toBeNull()
  })

  it('null değerleri atlayarak medyan alır', () => {
    expect(fiyatEndeksi(5, [3, null, 7])).toBe(100)
  })
})

describe('endeksOkumasi', () => {
  it('115 üstü pahalı', () => {
    expect(endeksOkumasi(120)).toBe('pahali')
    expect(endeksOkumasi(115.1)).toBe('pahali')
  })

  it('85 altı ucuz', () => {
    expect(endeksOkumasi(80)).toBe('ucuz')
    expect(endeksOkumasi(84.9)).toBe('ucuz')
  })

  it('85-115 arası ortalama — sınırlar dahil', () => {
    expect(endeksOkumasi(100)).toBe('ortalama')
    expect(endeksOkumasi(85)).toBe('ortalama')
    expect(endeksOkumasi(115)).toBe('ortalama')
  })

  it('null ise null', () => {
    expect(endeksOkumasi(null)).toBeNull()
  })
})
