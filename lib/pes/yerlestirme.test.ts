import { expect, test } from 'vitest'
import { bantPaylari } from './yerlestirme'

test('kapasiteye orantılı böler ve toplam adedi korur', () => {
  const paylar = bantPaylari(10_000, [
    { lineId: 1, gunlukHedef: 1000 },
    { lineId: 2, gunlukHedef: 500 },
  ])
  expect(paylar.map(p => p.adet)).toEqual([6667, 3333])
  expect(paylar.reduce((t, p) => t + p.adet, 0)).toBe(10_000)
})

test('yuvarlama artığı en büyük kapasiteli banda gider', () => {
  // 10 adet, 3 eşit bant: 3.33 -> 3/3/3 = 9, artan 1 ilk banda
  const paylar = bantPaylari(10, [
    { lineId: 1, gunlukHedef: 100 },
    { lineId: 2, gunlukHedef: 100 },
    { lineId: 3, gunlukHedef: 100 },
  ])
  expect(paylar.reduce((t, p) => t + p.adet, 0)).toBe(10)
  expect(paylar[0].adet).toBe(4)
})

test('tek bant hepsini alır', () => {
  expect(bantPaylari(500, [{ lineId: 7, gunlukHedef: 250 }]))
    .toEqual([{ lineId: 7, gunlukHedef: 250, adet: 500 }])
})

test('günlük hedefi 0 olan bant pay almaz', () => {
  const paylar = bantPaylari(100, [
    { lineId: 1, gunlukHedef: 100 },
    { lineId: 2, gunlukHedef: 0 },
  ])
  expect(paylar).toHaveLength(1)
  expect(paylar[0].lineId).toBe(1)
})

test('hiçbir bantta kapasite yoksa hata verir', () => {
  expect(() => bantPaylari(100, [{ lineId: 1, gunlukHedef: 0 }]))
    .toThrow('kapasitesi tanımlı bant yok')
})
