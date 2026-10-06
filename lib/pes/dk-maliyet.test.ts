import { describe, it, expect } from 'vitest'
import { kayitDogrula, matrise, degisimOrani, gecerlilikAraligi, gecmisiGrupla } from './dk-maliyet'

const tam = { 1: 6.45, 2: 6.05, 3: 6.05, 4: 6.05, 5: 5.87, 6: 5.3 }

describe('kayitDogrula', () => {
  it('geçerli girdiyi kabul eder, virgüllü metni sayıya çevirir', () => {
    const r = kayitDogrula({ donem: '2026-09', degerler: { ...tam, 1: '6,45' }, aciklama: ' Eylül ' })
    expect(r).toEqual({ ok: true, girdi: { donem: '2026-09', degerler: tam, aciklama: 'Eylül' } })
  })
  it('dönem biçimi yanlışsa reddeder', () => {
    for (const donem of ['2026-9', '2026-13', '26-09', '']) {
      expect(kayitDogrula({ donem, degerler: tam }).ok).toBe(false)
    }
  })
  it('eksik bölgeyi reddeder', () => {
    const { 6: _, ...bes } = tam
    const r = kayitDogrula({ donem: '2026-09', degerler: bes })
    expect(r).toEqual({ ok: false, hata: '6. bölge için değer girilmeli.' })
  })
  it('sıfır, negatif ve yazım hatası büyüklüğünü reddeder', () => {
    for (const v of [0, -1, 645]) {
      expect(kayitDogrula({ donem: '2026-09', degerler: { ...tam, 3: v } }).ok).toBe(false)
    }
  })
  it('iki ondalığa yuvarlar, boş açıklama null olur', () => {
    const r = kayitDogrula({ donem: '2026-09', degerler: { ...tam, 2: 6.054 }, aciklama: '  ' })
    expect(r.ok && r.girdi.degerler[2]).toBe(6.05)
    expect(r.ok && r.girdi.aciklama).toBeNull()
  })
})

describe('matrise', () => {
  it('dönem × bölge, en yeni önce, eksik bölge null', () => {
    const m = matrise([
      { donem: '2026-04', bolge: 1, dk_maliyet_tl: '6.30' },
      { donem: '2026-09', bolge: 1, dk_maliyet_tl: 6.45 },
      { donem: '2026-09', bolge: 2, dk_maliyet_tl: 6.05 },
    ])
    expect(m.map((d) => d.donem)).toEqual(['2026-09', '2026-04'])
    expect(m[0].degerler[2]).toBe(6.05)
    expect(m[1].degerler[2]).toBeNull()
    expect(m[1].degerler[1]).toBe(6.3)
  })
})

describe('degisimOrani', () => {
  it('önceki döneme göre oran', () => {
    expect(degisimOrani(6.45, 6.3)).toBeCloseTo(0.0238, 4)
    expect(degisimOrani(6.45, null)).toBeNull()
    expect(degisimOrani(null, 6.3)).toBeNull()
  })
})

describe('gecerlilikAraligi', () => {
  const d = ['2026-01', '2026-04', '2026-09']
  it('sonraki dönemin bir önceki ayına kadar', () => {
    expect(gecerlilikAraligi(d, '2026-04')).toEqual({ baslangic: '2026-04', bitis: '2026-08' })
  })
  it('son dönem açık uçlu', () => {
    expect(gecerlilikAraligi(d, '2026-09')).toEqual({ baslangic: '2026-09', bitis: null })
  })
  it('yeni (henüz olmayan) ara dönem', () => {
    expect(gecerlilikAraligi(d, '2026-06')).toEqual({ baslangic: '2026-06', bitis: '2026-08' })
  })
  it('ocak öncesi yıl geçişi', () => {
    expect(gecerlilikAraligi(['2027-01'], '2026-10')).toEqual({ baslangic: '2026-10', bitis: '2026-12' })
  })
})

describe('gecmisiGrupla', () => {
  const s = (id: number, bolge: number, at = '2026-10-06 16:06:00+03', islem: 'ekle' | 'guncelle' = 'guncelle') => ({
    id, donem: '2026-09', bolge, islem, eski_tl: 6, yeni_tl: 6.5, degistiren: 'a@b', aciklama: null, degisti_at: at,
  })
  it('aynı işlemin bölgelerini tek satırda toplar, sırayı korur', () => {
    const g = gecmisiGrupla([s(3, 1), s(2, 2), s(1, 1, '2026-10-01 10:00:00+03', 'ekle')])
    expect(g).toHaveLength(2)
    expect(Object.keys(g[0].bolgeler)).toEqual(['1', '2'])
    expect(g[1].islem).toBe('ekle')
  })
})
