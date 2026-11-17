import { describe, expect, it } from 'vitest'
import { FORMLAR, formTanimi, formVerisiniSuz, bosFormVerisi } from './formlar'

describe('form tanımları', () => {
  it('kodlar ve her formdaki alan/sütun adları tekil', () => {
    expect(new Set(FORMLAR.map(f => f.kod)).size).toBe(FORMLAR.length)
    for (const f of FORMLAR) {
      expect(new Set(f.alanlar.map(a => a.ad)).size, f.kod).toBe(f.alanlar.length)
      for (const t of f.tablolar) expect(new Set(t.sutunlar.map(a => a.ad)).size, `${f.kod}.${t.ad}`).toBe(t.sutunlar.length)
    }
  })
})

describe('formVerisiniSuz', () => {
  it('bilinmeyen alanı atar, tipleri düzeltir, sabit satır sayısını korur', () => {
    const t = formTanimi('hata_ust')!
    const v = formVerisiniSuz(t, {
      alanlar: { kontrol_adedi: '12,5', bolum: 'Dikim', sahte: 'x' },
      tablolar: { hatalar: [{ sokuk: '3', zararli: 1 }], yok: [{}] },
    })
    expect(v.alanlar).toEqual({ bolum: 'Dikim', kontrol_adedi: 12.5, operator: null })
    expect(v.tablolar.hatalar).toHaveLength(20)
    expect(v.tablolar.hatalar[0].sokuk).toBe(3)
    expect(v.tablolar.hatalar[0]).not.toHaveProperty('zararli')
    expect(v.tablolar).not.toHaveProperty('yok')
  })

  it('serbest tabloda boş satırı atar; seçim ve evet/hayır dışı değer null', () => {
    const t = formTanimi('kirik_igne')!
    const v = formVerisiniSuz(t, { tablolar: { kayitlar: [{}, { makine_no: 'M1', parcalar_bulundu: 'belki' }] } })
    expect(v.tablolar.kayitlar).toHaveLength(1)
    expect(v.tablolar.kayitlar[0].parcalar_bulundu).toBeNull()
    const a = formVerisiniSuz(formTanimi('aql_inspection')!, { alanlar: { sonuc: 'Belki' } })
    expect(a.alanlar.sonuc).toBeNull()
  })

  it('boş gövde süzmeden aynen geçer (sabit tablolar için)', () => {
    const t = formTanimi('ara_olcu_ust')!
    expect(formVerisiniSuz(t, bosFormVerisi(t))).toEqual(bosFormVerisi(t))
  })
})
