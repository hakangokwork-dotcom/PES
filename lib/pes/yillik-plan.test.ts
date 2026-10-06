import { describe, expect, test } from 'vitest'
import {
  ayGunleri, aylikKapasiteDk, esitProfil, profilGecerli, aylikAdet, yukYuzdesi,
  oneriUret, type OneriAdayi,
} from './yillik-plan'

describe('ayGunleri', () => {
  test('şubat 2027 28 gün, ISO biçimli', () => {
    const g = ayGunleri(2027, 2)
    expect(g).toHaveLength(28)
    expect(g[0]).toBe('2027-02-01')
    expect(g[27]).toBe('2027-02-28')
  })
})

describe('aylikKapasiteDk', () => {
  test('pazarlar sıfır: ocak 2027 = 26 çalışma günü (5 pazar)', () => {
    const k = aylikKapasiteDk(2027, 100, {})
    expect(k).toHaveLength(12)
    expect(k[0]).toBe(2600)
  })
  test('override oranı o günü ölçekler', () => {
    // 2027-01-04 pazartesi; yarım gün
    const k = aylikKapasiteDk(2027, 100, { '2027-01-04': 0.5 })
    expect(k[0]).toBe(2550)
  })
})

describe('profil', () => {
  test('eşit profil 12 eleman, toplam 100', () => {
    const p = esitProfil()
    expect(p).toHaveLength(12)
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6)
    expect(profilGecerli(p)).toBe(true)
  })
  test('toplam 100 değilse ya da negatifse geçersiz', () => {
    expect(profilGecerli(Array(12).fill(8))).toBe(false)
    expect(profilGecerli([...Array(11).fill(10), -10])).toBe(false)
    expect(profilGecerli(Array(11).fill(100 / 11))).toBe(false)
  })
})

describe('aylikAdet', () => {
  test('toplam korunur (en büyük kalan)', () => {
    const a = aylikAdet(1000, esitProfil())
    expect(a.reduce((x, y) => x + y, 0)).toBe(1000)
    expect(Math.max(...a) - Math.min(...a)).toBeLessThanOrEqual(1)
  })
  test('sıfır aylar sıfır kalır', () => {
    const p = [50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    expect(aylikAdet(101, p)).toEqual([51, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })
})

describe('yukYuzdesi', () => {
  test('kapasite sıfırsa null', () => {
    expect(yukYuzdesi(10, 0)).toBeNull()
    expect(yukYuzdesi(50, 200)).toBe(25)
  })
})

const sifir = () => Array(12).fill(0)
const ay1 = (n: number) => { const a = sifir(); a[0] = n; return a }
const aday = (id: number, puan: number, bosOcak: number, uyum: OneriAdayi['uyum'] = 'uygun'): OneriAdayi =>
  ({ workshopId: id, puan, uyum, bosDk: ay1(bosOcak) })

describe('oneriUret', () => {
  test('yüksek puanlı atölye önce dolar, kalan sıradakine geçer', () => {
    const r = oneriUret({
      aylikAdet: ay1(150), samDk: 10,
      adaylar: [aday(1, 50, 1000), aday(2, 90, 1000)], elle: [],
    })
    expect(r.tahsisler).toEqual([
      { workshopId: 2, ay: 1, adet: 100 },
      { workshopId: 1, ay: 1, adet: 50 },
    ])
    expect(r.tahsisEdilemeyen[0]).toBe(0)
  })

  test('uygun olmayan atölye kullanılmaz; sığmayan tahsis edilemeyen olur', () => {
    const r = oneriUret({
      aylikAdet: ay1(300), samDk: 10,
      adaylar: [aday(1, 99, 99999, 'uyumsuz'), aday(2, 99, 99999, 'bilinmiyor'), aday(3, 10, 1000)],
      elle: [],
    })
    expect(r.tahsisler).toEqual([{ workshopId: 3, ay: 1, adet: 100 }])
    expect(r.tahsisEdilemeyen[0]).toBe(200)
  })

  test('elle tahsis ihtiyaçtan ve o atölyenin boşluğundan düşer', () => {
    const r = oneriUret({
      aylikAdet: ay1(150), samDk: 10,
      adaylar: [aday(1, 90, 1000), aday(2, 50, 1000)],
      elle: [{ workshopId: 1, ay: 1, adet: 80 }],
    })
    // ihtiyaç 70; atölye 1'de 1000-800=200 dk = 20 adet, kalan 50 atölye 2'ye
    expect(r.tahsisler).toEqual([
      { workshopId: 1, ay: 1, adet: 20 },
      { workshopId: 2, ay: 1, adet: 50 },
    ])
  })

  test('negatif boşluk (aşırı yük) sıfır sayılır', () => {
    const r = oneriUret({ aylikAdet: ay1(10), samDk: 1, adaylar: [aday(1, 1, -500)], elle: [] })
    expect(r.tahsisler).toEqual([])
    expect(r.tahsisEdilemeyen[0]).toBe(10)
  })

  test('SAM sıfır ya da negatifse hata', () => {
    expect(() => oneriUret({ aylikAdet: ay1(1), samDk: 0, adaylar: [], elle: [] })).toThrow('SAM')
  })
})
