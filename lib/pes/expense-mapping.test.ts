import { describe, it, expect } from 'vitest'
import { matchExpenseColumn, EXPENSE_LABELS, INTEGER_EXPENSE_COLUMNS } from './expense-mapping'

describe('yeni kalemler', () => {
  it('UKP sarf ayrı kolona düşer, genel sarfa değil', () => {
    expect(matchExpenseColumn('UKP sarf')).toBe('ukp_consumables')
    expect(matchExpenseColumn('Genel üretim sarf')).toBe('consumables')
  })

  it('taşıt amortismanı araç yakıtından ayrı', () => {
    expect(matchExpenseColumn('Taşıt / demirbaş amortismanı')).toBe('vehicle_depr')
    expect(matchExpenseColumn('Araç yakıt ve bakım')).toBe('vehicle')
  })

  it('iki yeni kolonun etiketi var', () => {
    expect(EXPENSE_LABELS.ukp_consumables).toBeTruthy()
    expect(EXPENSE_LABELS.vehicle_depr).toBeTruthy()
  })

  it('yeni kolonlar NUMERIC — yuvarlanacak listede olmamalı', () => {
    expect(INTEGER_EXPENSE_COLUMNS.has('ukp_consumables')).toBe(false)
    expect(INTEGER_EXPENSE_COLUMNS.has('vehicle_depr')).toBe(false)
  })
})

describe('Excel VERI_GIRIS başlıkları', () => {
  const beklenen: Array<[string, string]> = [
    ['Maaş (net, TL/ay)', 'personnel'],
    ['Fazla mesai', 'overtime'],
    ['Prim ve ikramiye', 'bonus'],
    ['SGK', 'sgk'],
    ['Kıdem karşılığı', 'severance_reserve'],
    ['Yemek', 'food'],
    ['Servis', 'transport'],
    ['Nakliye', 'cargo'],
    ['Kira', 'rent'],
    ['Bina amortismanı', 'building_depr'],
    ['Elektrik', 'electricity'],
    ['Su', 'water'],
    ['Isıtma', 'gas'],
    ['İğne ve iplik', 'thread'],
    ['UKP sarf', 'ukp_consumables'],
    ['Genel üretim sarf', 'consumables'],
    ['Bakım ve yedek parça', 'machine_maint'],
    ['Makine amortismanı', 'machine_depr'],
    ['Taşıt / demirbaş amortismanı', 'vehicle_depr'],
    ['Araç yakıt ve bakım', 'vehicle'],
    ['Kırtasiye', 'stationery'],
    ['İSG', 'isg'],
    ['Danışmanlık', 'consulting'],
    ['Ek resmi giderler', 'official_fees'],
    ['Sigorta', 'insurance'],
    ['Alınan teşvik (TL/ay)', 'incentive_amount'],
  ]

  for (const [baslik, kolon] of beklenen) {
    it(`"${baslik}" → ${kolon}`, () => {
      expect(matchExpenseColumn(baslik)).toBe(kolon)
    })
  }

  it('parantezli "Diğer" başlığı burada other a düşer — VERI_GIRIS özel durumu Task 7 de çözülür', () => {
    expect(matchExpenseColumn('Diğer (telefon, internet)')).toBe('other')
  })

  it('ekonomi alanları gider sayılmaz', () => {
    expect(matchExpenseColumn('Dikim kişi')).toBeNull()
    expect(matchExpenseColumn('Aylık adet (bant kapasitesi)')).toBeNull()
    expect(matchExpenseColumn('Üretim alanı (m²)')).toBeNull()
  })
})
