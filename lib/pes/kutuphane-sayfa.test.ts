import { describe, it, expect } from 'vitest'
import { SAYFALAR, satirlariCoz, adDuzelt } from './kutuphane-sayfa'

describe('SAYFALAR', () => {
  it('yedi sayfa tanımlı', () => {
    expect(Object.keys(SAYFALAR)).toHaveLength(7)
  })

  it('04_operasyon_grup başlığı 1. satırda — diğerlerinden farklı', () => {
    expect(SAYFALAR['04_operasyon_grup'].baslikSatiri).toBe(1)
  })

  it('diğer altı sayfanın başlığı 3. satırda', () => {
    for (const [ad, t] of Object.entries(SAYFALAR)) {
      if (ad === '04_operasyon_grup') continue
      expect(t.baslikSatiri, `${ad} başlık satırı`).toBe(3)
    }
  })

  it('her sayfa bir ref_ tablosuna gidiyor', () => {
    for (const t of Object.values(SAYFALAR)) {
      expect(t.tablo).toMatch(/^ref_/)
    }
  })

  it('operasyon_zamani 13 kolon taşıyor', () => {
    expect(SAYFALAR['07_operasyon_zamani'].kolonlar).toHaveLength(13)
    expect(SAYFALAR['07_operasyon_zamani'].kolonlar).toContain('guven_seviyesi')
  })
})

describe('satirlariCoz', () => {
  it('kolon adlarını değerlerle eşler', () => {
    const k = ['id', 'ad']
    expect(satirlariCoz(k, [['1', 'Apolet'], ['2', 'Ara Parça']]))
      .toEqual([{ id: '1', ad: 'Apolet' }, { id: '2', ad: 'Ara Parça' }])
  })

  it('tamamen boş satırı atar', () => {
    expect(satirlariCoz(['id', 'ad'], [['1', 'A'], [null, null], ['2', 'B']]))
      .toHaveLength(2)
  })

  it('id boş olan satırı atar — yabancı anahtar kurulamaz', () => {
    expect(satirlariCoz(['id', 'ad'], [[null, 'Adı var ama id yok']])).toHaveLength(0)
  })

  it('eksik hücreleri null yapar, kolon sayısını korur', () => {
    expect(satirlariCoz(['id', 'ad', 'aciklama'], [['1', 'A']]))
      .toEqual([{ id: '1', ad: 'A', aciklama: null }])
  })
})

describe('adDuzelt', () => {
  it('boş adı yer tutucuyla doldurur', () => {
    expect(adDuzelt(null, 1)).toBe('(adsız #1)')
    expect(adDuzelt('', 7)).toBe('(adsız #7)')
    expect(adDuzelt('   ', 7)).toBe('(adsız #7)')
  })

  it('dolu adı olduğu gibi bırakır', () => {
    expect(adDuzelt('2 Yan Ekstrafor', 2)).toBe('2 Yan Ekstrafor')
  })

  it('baştaki ve sondaki boşluğu kırpar', () => {
    expect(adDuzelt('  Apolet  ', 3)).toBe('Apolet')
  })
})
