// lib/pes/olcu-sartname.test.ts
import { describe, it, expect } from 'vitest'
import { kabulAraligi, sartnameYapistir } from './olcu-sartname'

/* Kullanıcının gönderdiği 32 beden tablosu (2026-11-17), sekmeyle ayrılmış. */
const TABLO = [
  'Measurement / Ölçü\tSize 32 nominal / 32 beden nominal\tNew tolerance − / + / Yeni tolerans − / +\tAcceptance range / Kabul aralığı',
  'Waist width / Bel genişliği ortadan\t43,00\t−1,50 / +1,00\t41,50–44,00',
  'Hip width / Basen genişliği\t53,50\t−1,50 / +1,00\t52,00–54,50',
  'Width labelled “Baldır” / Tablodaki adıyla “Baldır genişliği”\t32,50\t−1,00 / +1,00\t31,50–33,50',
  'Front rise, waistband included / Ön ağ, kemer dahil\t27,00\t−1,00 / +1,00\t26,00–28,00',
  'Back rise, waistband included / Arka ağ, kemer dahil\t40,50\t−1,00 / +1,00\t39,50–41,50',
  'Knee width / Diz genişliği\t22,00\t−0,70 / +0,70\t21,30–22,70',
  'Leg opening / Paça genişliği\t19,00\t−0,50 / +0,70\t18,50–19,70',
  'Inseam / İç boy\t78,70\t−1,50 / +1,50\t77,20–80,20',
  'Front pocket bag width / Ön cep torba eni\t18,00\t−0,50 / +0,50\t17,50–18,50',
  'Front pocket bag length / Ön cep torba boyu\t26,00\t−1,00 / +1,00\t25,00–27,00',
].join('\n')

describe('kabulAraligi', () => {
  it('nominalden eksi/artı toleransla, 2 haneye yuvarlı', () => {
    expect(kabulAraligi(43, 1.5, 1)).toEqual({ alt: 41.5, ust: 44 })
    expect(kabulAraligi(19, 0.5, 0.7)).toEqual({ alt: 18.5, ust: 19.7 })
  })
})

describe('sartnameYapistir', () => {
  it('başlığı atlar, 10 POM okur', () => {
    const r = sartnameYapistir(TABLO)
    expect(r.hatalar).toEqual([])
    expect(r.satirlar).toHaveLength(10)
  })

  it('Türkçe adı ayırır, müşteri adını tam tutar, virgüllü ondalık ve − işareti', () => {
    const [bel] = sartnameYapistir(TABLO).satirlar
    expect(bel).toEqual({
      kod: 'P01', ad: 'Bel genişliği ortadan', musteri_adi: 'Waist width / Bel genişliği ortadan',
      nominal: 43, tol_eksi: 1.5, tol_arti: 1,
    })
  })

  it('asimetrik tolerans (paça −0,50 / +0,70)', () => {
    const paca = sartnameYapistir(TABLO).satirlar[6]
    expect(paca.ad).toBe('Paça genişliği')
    expect([paca.tol_eksi, paca.tol_arti]).toEqual([0.5, 0.7])
  })

  it('kabul aralığı nominal ± toleransla uyuşmazsa satır hatası', () => {
    const r = sartnameYapistir('Bel\t43,00\t−1,50 / +1,00\t41,00–44,00')
    expect(r.satirlar).toHaveLength(1)
    expect(r.hatalar[0]).toMatch(/Satır 1: kabul aralığı/)
  })

  it('tolerans okunamazsa satır atlanır ve hata yazılır', () => {
    const r = sartnameYapistir('Bel\t43,00\t±1')
    expect(r.satirlar).toHaveLength(0)
    expect(r.hatalar[0]).toMatch(/Satır 1: tolerans/)
  })
})
