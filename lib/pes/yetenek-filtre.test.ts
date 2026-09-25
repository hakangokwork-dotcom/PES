import { describe, it, expect } from 'vitest'
import {
  cozumle, metinle, bosMu, boyutSayisi, ciftler, degistir, eslesirMi, boyutAdi,
} from './yetenek-filtre'

describe('çözümleme', () => {
  it('boyut:değer çiftlerini ayırır', () => {
    expect(cozumle('klasman:PANTOLON,ana_grup:DENIM'))
      .toEqual({ klasman: ['PANTOLON'], ana_grup: ['DENIM'] })
  })

  it('aynı boyutun birden çok değerini toplar', () => {
    expect(cozumle('ana_grup:DENIM,ana_grup:DOKUMA_ALT'))
      .toEqual({ ana_grup: ['DENIM', 'DOKUMA_ALT'] })
  })

  it('boş ve null güvenli', () => {
    expect(cozumle(null)).toEqual({})
    expect(cozumle(undefined)).toEqual({})
    expect(cozumle('')).toEqual({})
  })

  it('BOZUK parçayı sessizce atar', () => {
    /* URL'den gelen her şeyi sorguya taşımak olmaz. */
    expect(cozumle('klasman:PANTOLON,bozuk,:BOS,boyutsuz:'))
      .toEqual({ klasman: ['PANTOLON'] })
  })

  it('kod alfabesi dışındakini REDDEDER', () => {
    expect(cozumle("klasman:PANTOLON';DROP TABLE--")).toEqual({})
    expect(cozumle('klasman:PAN TOLON')).toEqual({})
    expect(cozumle('kla-sman:X')).toEqual({})
  })

  it('yinelenen değeri tekilleştirir', () => {
    /* HAVING sayımı bozulmasın. */
    expect(cozumle('klasman:PANTOLON,klasman:PANTOLON'))
      .toEqual({ klasman: ['PANTOLON'] })
  })
})

describe('metne çevirme', () => {
  it('gidiş-dönüş korunur', () => {
    const s = cozumle('ana_grup:DENIM,klasman:PANTOLON')
    expect(cozumle(metinle(s))).toEqual(s)
  })

  it('sıra KARARLI — aynı seçim aynı URL', () => {
    const a = metinle({ klasman: ['SORT', 'PANTOLON'], ana_grup: ['DENIM'] })
    const b = metinle({ ana_grup: ['DENIM'], klasman: ['PANTOLON', 'SORT'] })
    expect(a).toBe(b)
    expect(a).toBe('ana_grup:DENIM,klasman:PANTOLON,klasman:SORT')
  })

  it('boş seçim boş metin', () => {
    expect(metinle({})).toBe('')
  })
})

describe('sayım ve çiftler', () => {
  it('boyut sayısı HAVING ile eşleşecek biçimde', () => {
    expect(boyutSayisi({ klasman: ['A'], ana_grup: ['B', 'C'] })).toBe(2)
  })

  it('boş dizili boyut sayılmaz', () => {
    expect(boyutSayisi({ klasman: [], ana_grup: ['B'] })).toBe(1)
    expect(bosMu({ klasman: [] })).toBe(true)
  })

  it('çiftler düzleştirilir', () => {
    expect(ciftler({ klasman: ['A', 'B'] })).toEqual([['klasman', 'A'], ['klasman', 'B']])
  })
})

describe('değiştir', () => {
  it('yoksa ekler, varsa çıkarır', () => {
    const bir = degistir({}, 'klasman', 'PANTOLON')
    expect(bir).toEqual({ klasman: ['PANTOLON'] })
    expect(degistir(bir, 'klasman', 'PANTOLON')).toEqual({})
  })

  it('son değer çıkınca boyut da düşer', () => {
    const s = { klasman: ['A'], ana_grup: ['B'] }
    expect(degistir(s, 'klasman', 'A')).toEqual({ ana_grup: ['B'] })
  })

  it('girdiyi DEĞİŞTİRMEZ', () => {
    const s = { klasman: ['A'] }
    degistir(s, 'klasman', 'B')
    expect(s).toEqual({ klasman: ['A'] })
  })
})

describe('eşleşme — boyut içinde VEYA, boyutlar arasında VE', () => {
  const atolye = [
    { boyut: 'klasman', deger: 'PANTOLON' },
    { boyut: 'klasman', deger: 'SORT' },
    { boyut: 'ana_grup', deger: 'DENIM' },
  ]

  it('boş seçim her şeye uyar', () => {
    expect(eslesirMi(atolye, {})).toBe(true)
  })

  it('boyut içinde VEYA: biri yetiyor', () => {
    expect(eslesirMi(atolye, { klasman: ['PANTOLON', 'ETEK'] })).toBe(true)
  })

  it('boyutlar arasında VE: ikisi de gerekli', () => {
    expect(eslesirMi(atolye, { klasman: ['PANTOLON'], ana_grup: ['DENIM'] })).toBe(true)
    expect(eslesirMi(atolye, { klasman: ['PANTOLON'], ana_grup: ['TAKIM'] })).toBe(false)
  })

  it('hiçbiri tutmuyorsa eşleşmez', () => {
    expect(eslesirMi(atolye, { klasman: ['ETEK'] })).toBe(false)
  })

  it('yeteneği olmayan atölye yalnız boş seçime uyar', () => {
    expect(eslesirMi([], {})).toBe(true)
    expect(eslesirMi([], { klasman: ['PANTOLON'] })).toBe(false)
  })
})

describe('boyut adı', () => {
  it('bilinen boyutu Türkçeleştirir', () => {
    expect(boyutAdi('kumas_turu')).toBe('Kumaş türü')
  })

  it('BİLİNMEYEN boyutta susmaz', () => {
    /* Katalog büyürse ekran yeni boyutu da göstermeli. */
    expect(boyutAdi('yeni_boyut')).toBe('yeni boyut')
  })
})
