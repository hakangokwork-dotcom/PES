import { describe, it, expect } from 'vitest'
import { grupPaylari, dnaProfili, dnaProfilleri, enAyirtEdiciGrup } from './ekonomi-dna'
import type { GiderGrupSatiri } from './ekonomi-dna'

/** Toplamı 1.000.000 olan temiz bir satır — paylar kolay okunsun. */
function satir(
  workshopId: number, ad: string, p: Partial<Record<string, number>>,
): GiderGrupSatiri {
  return {
    workshopId, ad,
    g1_iscilik: p.g1 ?? 0, g2_personel_yan: p.g2 ?? 0,
    g3_enerji: p.g3 ?? 0, g4_mekan: p.g4 ?? 0,
    g5_makine: p.g5 ?? 0, g6_sarf: p.g6 ?? 0,
    g7_dis_hizmet: p.g7 ?? 0, g8_diger: p.g8 ?? 0,
  }
}

/* İşçilik ağırlıklı tipik bir atölye ve ondan sapan iki tane. */
const TIPIK = satir(1, 'Tipik', { g1: 700000, g2: 100000, g3: 60000, g4: 50000, g5: 40000, g6: 30000, g7: 15000, g8: 5000 })
const KIRACI = satir(2, 'Kiracı', { g1: 600000, g2: 100000, g3: 60000, g4: 150000, g5: 40000, g6: 30000, g7: 15000, g8: 5000 })
const YALIN  = satir(3, 'Yalın',  { g1: 750000, g2: 100000, g3: 60000, g4: 50000, g5: 20000, g6: 10000, g7: 8000, g8: 2000 })

describe('grupPaylari', () => {
  it('her grubun payını toplama böler', () => {
    const p = grupPaylari(TIPIK)
    expect(p.g1_iscilik).toBeCloseTo(0.70, 10)
    expect(p.g4_mekan).toBeCloseTo(0.05, 10)
  })

  it('paylar toplamı 1', () => {
    const p = grupPaylari(TIPIK)
    const toplam = Object.values(p).reduce<number>((a, b) => a + (b ?? 0), 0)
    expect(toplam).toBeCloseTo(1, 10)
  })

  it('toplam sıfırsa her pay null — sıfır değil', () => {
    const bos = satir(9, 'Boş', {})
    const p = grupPaylari(bos)
    expect(p.g1_iscilik).toBeNull()
    expect(p.g8_diger).toBeNull()
  })

  it('tek grubu dolu satırda o grup 1, diğerleri 0', () => {
    const tek = satir(9, 'Tek', { g1: 500 })
    const p = grupPaylari(tek)
    expect(p.g1_iscilik).toBe(1)
    expect(p.g3_enerji).toBe(0)
  })
})

describe('dnaProfili', () => {
  const orneklem = [TIPIK, KIRACI, YALIN]

  it('her grup için pay, medyan ve sapma verir', () => {
    const d = dnaProfili(KIRACI, orneklem)
    const mekan = d.gruplar.find(g => g.grup === 'g4_mekan')!
    expect(mekan.pay).toBeCloseTo(0.15, 10)
    expect(mekan.medyanPay).toBeCloseTo(0.05, 10)
    expect(mekan.sapma).toBeCloseTo(0.10, 10)
  })

  it('kiracı atölyenin en ayırt edici grubu mekân', () => {
    const d = dnaProfili(KIRACI, orneklem)
    expect(d.gruplar[0].grup).toBe('g4_mekan')
  })

  it('gruplar mutlak sapmaya göre sıralı — en ayırt edici başta', () => {
    const d = dnaProfili(KIRACI, orneklem)
    const mutlak = d.gruplar.map(g => Math.abs(g.sapma ?? 0))
    for (let i = 1; i < mutlak.length; i++) {
      expect(mutlak[i - 1]).toBeGreaterThanOrEqual(mutlak[i])
    }
  })

  it('sekiz grubun hepsi döner, sapması sıfır olanlar dahil', () => {
    expect(dnaProfili(TIPIK, orneklem).gruplar).toHaveLength(8)
  })

  it('toplamı sıfır olan atölyede paylar null, sapma null', () => {
    const bos = satir(9, 'Boş', {})
    const d = dnaProfili(bos, [...orneklem, bos])
    expect(d.gruplar.every(g => g.pay === null && g.sapma === null)).toBe(true)
  })

  it('tek atölyelik örneklemde sapma sıfır — kendisi medyandır', () => {
    const d = dnaProfili(TIPIK, [TIPIK])
    expect(d.gruplar.every(g => g.sapma === 0)).toBe(true)
  })
})

describe('enAyirtEdiciGrup', () => {
  const orneklem = [TIPIK, KIRACI, YALIN]

  it('en büyük mutlak sapmalı grubu döner', () => {
    expect(enAyirtEdiciGrup(dnaProfili(KIRACI, orneklem))?.grup).toBe('g4_mekan')
  })

  it('hiç payı olmayan atölyede null', () => {
    const bos = satir(9, 'Boş', {})
    expect(enAyirtEdiciGrup(dnaProfili(bos, [...orneklem, bos]))).toBeNull()
  })
})

describe('dnaProfilleri', () => {
  it('her atölye için profil üretir', () => {
    const hepsi = dnaProfilleri([TIPIK, KIRACI, YALIN])
    expect(hepsi).toHaveLength(3)
    expect(hepsi.map(d => d.ad)).toEqual(['Tipik', 'Kiracı', 'Yalın'])
  })

  it('medyan bütün örneklemden, atölyenin kendi payından değil', () => {
    const hepsi = dnaProfilleri([TIPIK, KIRACI, YALIN])
    const kiraci = hepsi.find(d => d.ad === 'Kiracı')!
    const tipik = hepsi.find(d => d.ad === 'Tipik')!
    const kMekan = kiraci.gruplar.find(g => g.grup === 'g4_mekan')!
    const tMekan = tipik.gruplar.find(g => g.grup === 'g4_mekan')!
    expect(kMekan.medyanPay).toBeCloseTo(tMekan.medyanPay!, 12)
  })
})
