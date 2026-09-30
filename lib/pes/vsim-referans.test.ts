import { describe, expect, it } from 'vitest'
import { referansSureci, opTuru, type RefParca, type RefOperasyon } from './vsim-referans'

const P = (bolge: string, ekParca: string, varyantId: number | null, gorulme: number, snMedyan = 30): RefParca => ({ bolge, ekParca, varyantId, gorulme, snMedyan })
const O = (varyantId: number, ad: string, mtm: number, sira: number, makine: string | null = null): RefOperasyon => ({ varyantId, ad, mtm, sira, makine })

describe('referansSureci', () => {
  const parcalar = [
    P('Kol', 'Kol Takma', 1, 8),
    P('Kol', 'Kol Takma (Çimalı)', 2, 3),     // aynı base, daha az → seçilmez
    P('Kol', 'Kol Yırtmacı', 3, 2),           // 2/11 < 0.5 → girmez
    P('Ön Beden', 'Pat', 4, 10),
    P('Ön Beden', 'Etiket', null, 6, 12),     // operasyonu yok → tek adım
  ]
  const ops = [
    O(1, 'Kol Takma Overlok', 40, 2, 'Overlok 4 İplik'),
    O(1, 'Kol Hazırlık', 20, 1, 'Düz Makine'),
    O(2, 'Kol Takma Çimalı', 55, 1),
    O(4, 'Pat Ütü', 15, 1, 'Buhar Ütü'),
  ]
  const r = referansSureci(parcalar, ops)

  it('bölgeleri sıralı parça hatlarına ve sondaki birleştirmeye çevirir', () => {
    expect(r.mainOps.map(m => m.name)).toEqual(['Ön Beden', 'Kol', 'Birleştirme'])
    expect(r.mainOps.slice(0, -1).every(m => m.nextIds[0] === 'g_son')).toBe(true)
    expect(r.mainOps[r.mainOps.length - 1].joinType).toBe('AND')
  })
  it('base başına en sık varyantı ve eşik üstünü alır, operasyonları sırayla bağlar', () => {
    const kol = r.subOps.filter(s => s.mainOpId === r.mainOps[1].id)
    expect(kol.map(s => s.name)).toEqual(['Kol Hazırlık', 'Kol Takma Overlok'])
    expect(kol[0].nextIds).toEqual([kol[1].id])
    expect(kol[1].type).toBe('OVERLOK')
  })
  it('operasyonu olmayan parça medyan süresiyle tek adım olur', () => {
    const on = r.subOps.filter(s => s.mainOpId === r.mainOps[0].id)
    expect(on.map(s => [s.name, s.cycleTime])).toEqual([['Pat Ütü', 15], ['Etiket', 12]])
    expect(on[0].type).toBe('ÜTÜ')
  })
  it('özet toplamları', () => {
    expect(r.ozet.adimSayisi).toBe(5)
    expect(r.ozet.toplamSn).toBeCloseTo(15 + 12 + 20 + 40 + 10)
  })
  it('veri yoksa boş süreç', () => {
    expect(referansSureci([], []).mainOps).toEqual([])
  })
  it('makine türü eşlemesi', () => {
    expect(opTuru('Reçme', 'x')).toBe('REÇME')
    expect(opTuru('Fason / El İşi', 'x')).toBe('DESTEK')
    expect(opTuru(null, 'Ara ütü')).toBe('ÜTÜ')
    expect(opTuru(null, 'Dikiş')).toBe('DİKİM')
  })
})
