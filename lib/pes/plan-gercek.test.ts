import { expect, test } from 'vitest'
import { egriHesapla } from './plan-gercek'

/* Saf hesap — veritabanı yok. Eğri bu işin yanlış anlaşılmaya en açık
   kısmı: "gerçek" çizgisinin nerede BİTTİĞİ, nerede sıfır olduğu kadar
   önemli. Veri girilmemiş günü 0 çizmek, bandı durmuş göstermek olurdu. */

const ATAMA = [{ adet: 4000, planBaslangic: '2026-08-10', planBitis: '2026-08-13' }]

test('plan eğrisi günlük hedefle doğrusal ilerler ve tahsiste durur', () => {
  const e = egriHesapla(ATAMA, [])
  expect(e.map(p => p.tarih)).toEqual(['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'])
  expect(e.map(p => p.plan)).toEqual([1000, 2000, 3000, 4000])
})

test('veri girilmemişse gerçek çizgisi hiç çizilmez', () => {
  const e = egriHesapla(ATAMA, [])
  expect(e.every(p => p.gercek === null)).toBe(true)
})

test('gerçek kümülatiftir ve SON girişten sonrası boş kalır', () => {
  const e = egriHesapla(ATAMA, [
    { tarih: '2026-08-10', adet: 800 },
    { tarih: '2026-08-11', adet: 900 },
  ])
  expect(e.map(p => p.gercek)).toEqual([800, 1700, null, null])
})

test('girilmemiş ara gün önceki toplamı korur, sıfırlamaz', () => {
  /* 11 Agustos'ta giris yok ama uretim 12'sinde devam etmis. Ara gunu
     0 gostermek, egriyi asagi kirip yanlis alarm uretirdi. */
  const e = egriHesapla(ATAMA, [
    { tarih: '2026-08-10', adet: 800 },
    { tarih: '2026-08-12', adet: 700 },
  ])
  expect(e.map(p => p.gercek)).toEqual([800, 800, 1500, null])
})

test('plan penceresi dışına taşan giriş eğriyi uzatır', () => {
  const e = egriHesapla(ATAMA, [{ tarih: '2026-08-15', adet: 4000 }])
  expect(e[e.length - 1].tarih).toBe('2026-08-15')
  // Plan bitmis sayilir, tahsisin uzerine cikmaz
  expect(e[e.length - 1].plan).toBe(4000)
  expect(e[e.length - 1].gercek).toBe(4000)
})

test('birden çok bant tek eğride toplanır', () => {
  const e = egriHesapla([
    { adet: 4000, planBaslangic: '2026-08-10', planBitis: '2026-08-13' },
    { adet: 2000, planBaslangic: '2026-08-12', planBitis: '2026-08-13' },
  ], [])
  // 12 Agustos: 3000 (birinci) + 1000 (ikinci)
  expect(e.find(p => p.tarih === '2026-08-12')!.plan).toBe(4000)
  expect(e[e.length - 1].plan).toBe(6000)
})

test('tahsis yoksa eğri boştur', () => {
  expect(egriHesapla([], [])).toEqual([])
})
