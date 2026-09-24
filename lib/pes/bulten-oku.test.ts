import { describe, it, expect } from 'vitest'
import { bilgiCoz, operasyonlariCoz, bultenOzeti } from './bulten-oku'
import type { BultenSatiri } from './bulten-bolum'
import fixture from './__fixtures__/bulten-ornek.json'

const HAM_BILGI: Array<[string, string]> = [
  ['Model Adı', 'Erkek 5 Cep Denim Jean (regular fit)'],
  ['Model No / PLM ID', 'JN-2026-001'],
  ['Kumaş Tipi', 'Denim %100 pamuk ~12 oz'],
  ['Sipariş Adedi', '10000'],
  ['Sezon', '2026'],
  ['Notlar', 'Toplam SMV ~22.33 dk'],
]

describe('bilgiCoz', () => {
  const b = bilgiCoz(HAM_BILGI)

  it('model adını ve PLM kodunu okur', () => {
    expect(b.model_adi).toBe('Erkek 5 Cep Denim Jean (regular fit)')
    expect(b.plm_id).toBe('JN-2026-001')
  })

  it('sipariş adedini sayıya çevirir', () => {
    expect(b.siparis_adedi).toBe(10000)
  })

  it('kumaş ve sezonu taşır', () => {
    expect(b.kumas_tipi).toContain('Denim')
    expect(b.sezon).toBe('2026')
  })

  it('model adı yoksa hata atar — bültenin kimliği budur', () => {
    expect(() => bilgiCoz([['Sezon', '2026']])).toThrow(/Model Adı/)
  })

  it('tanınmayan alanları yok sayar', () => {
    const b2 = bilgiCoz([...HAM_BILGI, ['Uydurma Alan', 'x']])
    expect(b2.model_adi).toBe(HAM_BILGI[0][1])
  })
})

describe('operasyonlariCoz', () => {
  const ham = [
    { 'Sıra': 1, '1.Seviye Süreç': 'Kesim', '2.Seviye Süreç': 'Serme', '3.Seviye Süreç': null,
      'Çevrim (sn)': 4, 'Tip': 'Serme', 'Makine Kodu': 'Serme', 'Operatör': null, 'Öncesi': null },
    { 'Sıra': 2, '1.Seviye Süreç': 'Ön Hazırlık', '2.Seviye Süreç': 'Cep takma', '3.Seviye Süreç': null,
      'Çevrim (sn)': 18, 'Tip': 'Düz Dikiş', 'Makine Kodu': 'SNLS', 'Operatör': null, 'Öncesi': 'Kesim' },
  ]

  it('başlıkları alanlara eşler', () => {
    const o = operasyonlariCoz(ham)
    expect(o[0]).toMatchObject({
      sira_no: 1, seviye1: 'Kesim', seviye2: 'Serme', seviye3: null,
      cevrim_sn: 4, tip: 'Serme', makine_kodu: 'Serme', oncesi: null,
    })
    expect(o[1].oncesi).toBe('Kesim')
  })

  it('sırası olmayan satırı atar', () => {
    expect(operasyonlariCoz([...ham, { 'Sıra': null, 'Çevrim (sn)': 9 }])).toHaveLength(2)
  })

  it('çevrim süresi okunamıyorsa 0 yazar, satırı atmaz', () => {
    const o = operasyonlariCoz([{ 'Sıra': 5, 'Çevrim (sn)': 'yok', '1.Seviye Süreç': 'X' }])
    expect(o[0].cevrim_sn).toBe(0)
  })

  it('boş 3.seviye null kalır', () => {
    expect(operasyonlariCoz(ham)[0].seviye3).toBeNull()
  })

  it('gerçek dosyanın 70 satırını çözer', () => {
    const o = operasyonlariCoz(
      (fixture.operasyonlar as BultenSatiri[]).map(x => ({
        'Sıra': x.sira_no, '1.Seviye Süreç': x.seviye1, '2.Seviye Süreç': x.seviye2,
        '3.Seviye Süreç': x.seviye3, 'Çevrim (sn)': x.cevrim_sn, 'Tip': x.tip,
        'Makine Kodu': x.makine_kodu, 'Öncesi': x.oncesi,
      })),
    )
    expect(o).toHaveLength(70)
    expect(o.reduce((a, s) => a + s.cevrim_sn, 0)).toBe(1368)
  })
})

describe('bultenOzeti', () => {
  it('toplam saniye ve operasyon sayısı', () => {
    const o = bultenOzeti(fixture.operasyonlar as BultenSatiri[])
    expect(o.operasyonSayisi).toBe(70)
    expect(o.toplamSn).toBe(1368)
    expect(o.toplamDk).toBeCloseTo(22.8, 4)
  })

  it('boş bültende sıfır, null değil', () => {
    expect(bultenOzeti([])).toEqual({ operasyonSayisi: 0, toplamSn: 0, toplamDk: 0 })
  })
})
