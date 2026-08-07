import { expect, test } from 'vitest'
import { asamaYapabilirMi, disariCikanAsamalar } from './atolye-yetenek'

test('CMT her ana aşamayı yapar', () => {
  expect(asamaYapabilirMi('CMT', 'KESIM')).toBe(true)
  expect(asamaYapabilirMi('CMT', 'DIKIM')).toBe(true)
  expect(asamaYapabilirMi('CMT', 'UKP')).toBe(true)
})

test('yalnız DİKİM yapan atölye kesim ve UKP yapamaz', () => {
  expect(asamaYapabilirMi('DİKİM', 'DIKIM')).toBe(true)
  expect(asamaYapabilirMi('DİKİM', 'KESIM')).toBe(false)
  expect(asamaYapabilirMi('DİKİM', 'UKP')).toBe(false)
})

test('KESİM-DİKİM UKP yapamaz', () => {
  expect(asamaYapabilirMi('KESİM-DİKİM', 'KESIM')).toBe(true)
  expect(asamaYapabilirMi('KESİM-DİKİM', 'DIKIM')).toBe(true)
  expect(asamaYapabilirMi('KESİM-DİKİM', 'UKP')).toBe(false)
})

test('yıkama ayrı bir yetenek, CMT bile kendiliğinden yapmaz', () => {
  expect(asamaYapabilirMi('CMT', 'YIKAMA')).toBe(false)
  expect(asamaYapabilirMi('CMT+Yıkama', 'YIKAMA')).toBe(true)
})

test('UTU / KALITE / PAKET UKP yeteneğine bağlı', () => {
  expect(asamaYapabilirMi('UKP', 'UTU')).toBe(true)
  expect(asamaYapabilirMi('DİKİM', 'PAKET')).toBe(false)
})

test('SEVK her atölyede yapılabilir', () => {
  expect(asamaYapabilirMi('DİKİM', 'SEVK')).toBe(true)
})

test('üretim tipi bilinmiyorsa null döner — yasak değil, bilinmiyor', () => {
  expect(asamaYapabilirMi(null, 'UKP')).toBeNull()
  expect(asamaYapabilirMi('', 'UKP')).toBeNull()
  expect(asamaYapabilirMi('ANLAŞILMAYAN', 'UKP')).toBeNull()
})

test('dışarı çıkması gereken aşamaları listeler', () => {
  expect(disariCikanAsamalar('KESİM-DİKİM', ['KESIM', 'DIKIM', 'UKP', 'SEVK']))
    .toEqual(['UKP'])
  expect(disariCikanAsamalar('CMT', ['KESIM', 'DIKIM', 'UKP'])).toEqual([])
})

test('bilinmeyen üretim tipinde hiçbir aşama dışarı çıkarılmaz', () => {
  /* Bilmiyorsak varsayım yapıp kullanıcıyı gereksiz adıma sokmayız. */
  expect(disariCikanAsamalar(null, ['KESIM', 'DIKIM', 'UKP'])).toEqual([])
})
