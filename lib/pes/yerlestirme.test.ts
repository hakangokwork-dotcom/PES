import { expect, test } from 'vitest'
import { bantPaylari, asamaGunu, geriyePlanla, bosPencereBul, type AsamaGirdi } from './yerlestirme'

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

test('süre yukarı yuvarlanır', () => {
  expect(asamaGunu(10_000, 1000)).toBe(10)
  expect(asamaGunu(10_001, 1000)).toBe(11)
  expect(asamaGunu(1, 1000)).toBe(1)
})

test('kapasite yoksa null döner — tarih elle girilecek', () => {
  expect(asamaGunu(10_000, null)).toBeNull()
  expect(asamaGunu(10_000, 0)).toBeNull()
})

const ASAMALAR: AsamaGirdi[] = [
  { stageId: 1, kod: 'KESIM', siraNo: 10, gun: 2 },
  { stageId: 3, kod: 'DIKIM', siraNo: 20, gun: 5 },
  { stageId: 10, kod: 'UKP', siraNo: 50, gun: 1 },
]

test('teslimden geriye kurar, son aşama teslimde biter', () => {
  const p = geriyePlanla('2026-09-30', ASAMALAR, '2026-08-06')
  const ukp = p.pencereler.find(x => x.kod === 'UKP')!
  expect(ukp.bitis).toBe('2026-09-30')
  expect(ukp.baslangic).toBe('2026-09-30')
})

test('aşamalar sıra_no tersine dizilir ve çakışmaz', () => {
  const p = geriyePlanla('2026-09-30', ASAMALAR, '2026-08-06')
  const kesim = p.pencereler.find(x => x.kod === 'KESIM')!
  const dikim = p.pencereler.find(x => x.kod === 'DIKIM')!
  const ukp = p.pencereler.find(x => x.kod === 'UKP')!
  expect(dikim.bitis! < ukp.baslangic!).toBe(true)
  expect(kesim.bitis! < dikim.baslangic!).toBe(true)
  expect(dikim.baslangic).toBe('2026-09-25')
  expect(dikim.bitis).toBe('2026-09-29')
})

test('bugünden önceye düşen zincir yetişmiyor olarak işaretlenir', () => {
  const p = geriyePlanla('2026-08-10', ASAMALAR, '2026-08-06')
  expect(p.yetisiyor).toBe(false)
  expect(p.pencereler[0].baslangic! < '2026-08-06').toBe(true)
})

test('bol zaman varsa yetişiyor', () => {
  const p = geriyePlanla('2026-12-31', ASAMALAR, '2026-08-06')
  expect(p.yetisiyor).toBe(true)
})

test('süresi bilinmeyen aşama pencere almaz', () => {
  const p = geriyePlanla('2026-09-30', [
    { stageId: 3, kod: 'DIKIM', siraNo: 20, gun: 5 },
    { stageId: 4, kod: 'YIKAMA', siraNo: 30, gun: null },
  ], '2026-08-06')
  const yikama = p.pencereler.find(x => x.kod === 'YIKAMA')!
  expect(yikama.baslangic).toBeNull()
  expect(yikama.bitis).toBeNull()
  expect(p.elleTarihGereken).toEqual(['YIKAMA'])
})

// ---- Faz 2: bant çakışma kontrolü ----

test('boş bantta istenen pencere aynen döner', () => {
  expect(bosPencereBul([], 5, '2026-09-29')).toEqual({
    baslangic: '2026-09-25', bitis: '2026-09-29', kaydirilanGun: 0,
  })
})

test('çakışma varsa pencere geriye kayar', () => {
  // 20-29 Eylül dolu; 5 günlük iş 29'da bitemez, 19'da bitmeli
  const p = bosPencereBul(
    [{ baslangic: '2026-09-20', bitis: '2026-09-29' }], 5, '2026-09-29')
  expect(p.bitis).toBe('2026-09-19')
  expect(p.baslangic).toBe('2026-09-15')
  expect(p.kaydirilanGun).toBe(10)
})

test('birden fazla dolu aralık arasındaki boşluğa oturur', () => {
  const p = bosPencereBul([
    { baslangic: '2026-09-25', bitis: '2026-09-29' },
    { baslangic: '2026-09-10', bitis: '2026-09-18' },
  ], 3, '2026-09-29')
  // 19-24 arası boş, 3 gün oraya sığar: 22-24
  expect(p.bitis).toBe('2026-09-24')
  expect(p.baslangic).toBe('2026-09-22')
})

test('kenarda bitisik aralik cakisma sayilmaz', () => {
  // 25-29 dolu; 5 gunluk is 20-24'e tam oturur
  const p = bosPencereBul(
    [{ baslangic: '2026-09-25', bitis: '2026-09-29' }], 5, '2026-09-29')
  expect(p.bitis).toBe('2026-09-24')
  expect(p.baslangic).toBe('2026-09-20')
  expect(p.kaydirilanGun).toBe(5)
})
