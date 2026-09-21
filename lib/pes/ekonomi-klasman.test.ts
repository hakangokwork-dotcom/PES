import { describe, it, expect } from 'vitest'
import {
  klasmanlariGrupla, klasmanOzeti, klasmanOzetleri, atolyeKlasmanlari,
} from './ekonomi-klasman'
import type { KlasmanAtolyesi } from './ekonomi-klasman'

/* 11 pilotun gerçek PES yetenek klasmanları (line_capability,
   dimension_code='klasman'). Marjlar HESAP sayfasından yuvarlanmış. */
function a(
  id: number, ad: string, klasmanlar: string[], marj: number | null,
  dikimDkCiro: number | null = null,
): KlasmanAtolyesi {
  return { workshopId: id, ad, klasmanlar, marj, dikimDkCiro }
}

const PILOTLAR: KlasmanAtolyesi[] = [
  a(1, 'Örssan', ['ETEK', 'PANTOLON', 'SORT', 'SORTETEK'], -0.032, 5.667),
  a(2, 'Hediye', ['PANTOLON', 'SALOPET', 'SORT', 'TAKIM', 'TUNIK'], -0.045, 5.629),
  a(3, 'İmkot', ['BLUZ', 'ETEK', 'GOMLEK', 'KAPRI', 'PANTOLON', 'SORT', 'SORTETEK'], -0.209, 3.390),
  a(4, 'Netclas', ['GOMLEK'], 0.080, 7.100),
  a(5, 'Bagisan', ['GOMLEK'], 0.030, 6.200),
  a(6, 'Bese', ['ATLET', 'BLUZ', 'ELBISE', 'ETEK', 'PANTOLON', 'SALOPET', 'TAKIM'], 0.110, 8.400),
  a(7, 'Veri Yok', ['GOMLEK'], null, null),
]

describe('atolyeKlasmanlari', () => {
  it('bant satırlarını atölye başına benzersiz listeye çevirir', () => {
    const harita = atolyeKlasmanlari([
      { workshop_id: 1, value_code: 'PANTOLON' },
      { workshop_id: 1, value_code: 'SORT' },
      { workshop_id: 1, value_code: 'PANTOLON' },   // ikinci bant, aynı klasman
      { workshop_id: 2, value_code: 'GOMLEK' },
    ])
    expect(harita.get(1)).toEqual(['PANTOLON', 'SORT'])
    expect(harita.get(2)).toEqual(['GOMLEK'])
  })

  it('alfabetik sıralar — ekranda kararlı görünsün', () => {
    const harita = atolyeKlasmanlari([
      { workshop_id: 1, value_code: 'SORT' },
      { workshop_id: 1, value_code: 'ETEK' },
    ])
    expect(harita.get(1)).toEqual(['ETEK', 'SORT'])
  })

  it('boş girdide boş harita', () => {
    expect(atolyeKlasmanlari([]).size).toBe(0)
  })
})

describe('klasmanlariGrupla', () => {
  const gruplar = klasmanlariGrupla(PILOTLAR)

  it('her klasman kendi atölye listesini taşır', () => {
    // İmkot da GOMLEK dikiyor — çok klasmanlı atölye her listede görünür.
    expect(gruplar.get('GOMLEK')?.map(x => x.ad).sort())
      .toEqual(['Bagisan', 'Netclas', 'Veri Yok', 'İmkot'])
  })

  it('bir atölye birden fazla klasmanda görünür — veri böyle', () => {
    expect(gruplar.get('PANTOLON')?.some(x => x.ad === 'Örssan')).toBe(true)
    expect(gruplar.get('SORT')?.some(x => x.ad === 'Örssan')).toBe(true)
  })

  it('PANTOLON dört pilotu topluyor', () => {
    expect(gruplar.get('PANTOLON')?.map(x => x.ad).sort())
      .toEqual(['Bese', 'Hediye', 'Örssan', 'İmkot'])
  })

  it('klasmanı olmayan atölye hiçbir gruba girmez', () => {
    const g = klasmanlariGrupla([a(9, 'Klasmansız', [], 0.1)])
    expect(g.size).toBe(0)
  })
})

describe('klasmanOzeti', () => {
  it('yalnız marjı olan atölyeleri sayar', () => {
    const o = klasmanOzeti('GOMLEK', PILOTLAR)
    expect(o.klasman).toBe('GOMLEK')
    expect(o.atolyeSayisi).toBe(4)        // Netclas, Bagisan, İmkot, Veri Yok
    expect(o.marjliAtolyeSayisi).toBe(3)  // Veri Yok sayılmaz
  })

  it('medyanı marjı olanlar üzerinden hesaplar', () => {
    const o = klasmanOzeti('GOMLEK', PILOTLAR)
    // [-0.209, 0.030, 0.080] → ortadaki
    expect(o.medyanMarj).toBeCloseTo(0.030, 10)
  })

  it('en iyi ve en kötüyü bulur', () => {
    const o = klasmanOzeti('PANTOLON', PILOTLAR)
    expect(o.enIyi?.ad).toBe('Bese')
    expect(o.enKotu?.ad).toBe('İmkot')
  })

  it('zarardaki atölyeleri sayar', () => {
    const o = klasmanOzeti('PANTOLON', PILOTLAR)
    expect(o.zarardaSayisi).toBe(3)       // Örssan, Hediye, İmkot
  })

  it('marjı olan hiç atölye yoksa medyan null, en iyi/kötü null', () => {
    const o = klasmanOzeti('GOMLEK', [a(7, 'Veri Yok', ['GOMLEK'], null)])
    expect(o.medyanMarj).toBeNull()
    expect(o.enIyi).toBeNull()
    expect(o.enKotu).toBeNull()
    expect(o.marjliAtolyeSayisi).toBe(0)
  })

  it('yayılım en iyi ile en kötü arasındaki marj farkı', () => {
    const o = klasmanOzeti('PANTOLON', PILOTLAR)
    expect(o.yayilim).toBeCloseTo(0.110 - (-0.209), 10)
  })

  it('tek atölyeli klasmanda yayılım sıfır, null değil', () => {
    const o = klasmanOzeti('KIMONO', [a(1, 'Tek', ['KIMONO'], 0.05)])
    expect(o.yayilim).toBe(0)
  })
})

describe('klasmanOzetleri', () => {
  const hepsi = klasmanOzetleri(PILOTLAR)

  it('her klasman için bir özet üretir', () => {
    expect(hepsi.map(o => o.klasman)).toContain('PANTOLON')
    expect(hepsi.map(o => o.klasman)).toContain('GOMLEK')
  })

  it('varsayılan sıra: en çok atölyeli klasman önce', () => {
    expect(hepsi[0].atolyeSayisi).toBeGreaterThanOrEqual(hepsi[1].atolyeSayisi)
  })

  it('eşit atölye sayısında alfabetik — sıra kararlı olsun', () => {
    const esit = klasmanOzetleri([
      a(1, 'A', ['ZETA'], 0.1),
      a(2, 'B', ['ALFA'], 0.2),
    ])
    expect(esit.map(o => o.klasman)).toEqual(['ALFA', 'ZETA'])
  })

  it('marjı olmayan atölyelerden ibaret klasman yine listelenir', () => {
    const o = klasmanOzetleri([a(7, 'Veri Yok', ['KIMONO'], null)])
    expect(o).toHaveLength(1)
    expect(o[0].marjliAtolyeSayisi).toBe(0)
  })
})
