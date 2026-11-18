// lib/pes/is-emri-adim.test.ts
import { describe, it, expect } from 'vitest'
import { ORTAK_TIPLERI, PLAN_GEREKCELERI, SORUN_ETKILERI, gerekceGerekli, iletisimAlanlari } from './is-emri-adim'

describe('is-emri-adim', () => {
  it('ortak tipleri migration CHECK listesiyle aynı', () => {
    expect(ORTAK_TIPLERI).toEqual(['Kumaşçı', 'Aksesuar', 'Kesimhane', 'Atölye', 'Yıkamacı', 'UKP', 'Baskı', 'Nakış', 'Diğer'])
  })
  it('gerekçe kodları 044 kodlarını içerir', () => {
    for (const k of ['KAPASITE_YOK', 'MALZEME_GEC', 'DIGER']) expect(PLAN_GEREKCELERI.map(g => g.kod)).toContain(k)
  })
  it('ilk plan girişi gerekçesiz, sonraki değişiklik gerekçeli', () => {
    expect(gerekceGerekli({ plan_baslangic: null, plan_bitis: null }, { plan_bitis: '2026-12-01' })).toBe(false)
    expect(gerekceGerekli({ plan_baslangic: null, plan_bitis: '2026-12-01' }, { plan_bitis: '2026-12-05' })).toBe(true)
    expect(gerekceGerekli({ plan_baslangic: '2026-11-20', plan_bitis: '2026-12-01' }, { plan_bitis: '2026-12-01' })).toBe(false)
  })
  it('etki listesi', () => { expect(SORUN_ETKILERI).toEqual(['Gecikme', 'Kalite', 'Maliyet', 'Diğer']) })
  it('iletişim alanları: kırpar, boşu null yapar, unvan/tip almaz', () => {
    expect(iletisimAlanlari({ il: ' İzmir ', telefon: '', unvan: 'X', tip: 'UKP' })).toEqual({ il: 'İzmir', telefon: null })
  })
})
