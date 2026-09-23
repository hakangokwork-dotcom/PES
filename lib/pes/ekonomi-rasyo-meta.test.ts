import { describe, it, expect } from 'vitest'
import { RASYO_META, RASYO_META_MAP, SIRALANAN_RASYOLAR } from './ekonomi-rasyo-meta'
import type { Yon, Grup, Format } from './ekonomi-rasyo-meta'

const GECERLI_YONLER = new Set<Yon>(['yuksek-iyi', 'dusuk-iyi', 'notr'])
const GECERLI_GRUPLAR = new Set<Grup>(['karlilik', 'isgucu', 'birim-maliyet', 'referans'])
const GECERLI_FORMATLAR = new Set<Format>(['percent', 'int', 'dec2', 'dec4', 'tl'])

describe('RASYO_META bütünlük', () => {
  it('tam 38 kayıt içeriyor (36 EkonomiRasyo alanı + marjSirasi + fiyatEndeksi)', () => {
    expect(RASYO_META).toHaveLength(38)
  })

  it('her alan benzersiz', () => {
    const alanlar = RASYO_META.map(m => m.alan)
    const tekil = new Set(alanlar)
    expect(tekil.size).toBe(alanlar.length)
  })

  it('her yön geçerli değer', () => {
    for (const m of RASYO_META) {
      expect(GECERLI_YONLER.has(m.yon), `${m.alan}: geçersiz yön "${m.yon}"`).toBe(true)
    }
  })

  it('her grup geçerli değer', () => {
    for (const m of RASYO_META) {
      expect(GECERLI_GRUPLAR.has(m.grup), `${m.alan}: geçersiz grup "${m.grup}"`).toBe(true)
    }
  })

  it('her format geçerli değer', () => {
    for (const m of RASYO_META) {
      expect(GECERLI_FORMATLAR.has(m.format), `${m.alan}: geçersiz format "${m.format}"`).toBe(true)
    }
  })

  it('her kaydın etiket ve açıklaması dolu', () => {
    for (const m of RASYO_META) {
      expect(m.etiket.trim().length, `${m.alan} etiket boş`).toBeGreaterThan(0)
      expect(m.onemAciklama.trim().length, `${m.alan} açıklama boş`).toBeGreaterThan(0)
    }
  })

  it('marjSirasi bulunuyor', () => {
    expect(RASYO_META.some(m => m.alan === 'marjSirasi')).toBe(true)
  })

  it('dört grup mevcut', () => {
    const gruplar = new Set(RASYO_META.map(m => m.grup))
    expect(gruplar.size).toBe(4)
  })
})

describe('RASYO_META_MAP', () => {
  it('harita 38 giriş içeriyor', () => {
    expect(RASYO_META_MAP.size).toBe(38)
  })

  it('bilinen alanlara hızlı erişim çalışıyor', () => {
    expect(RASYO_META_MAP.get('marj')?.yon).toBe('yuksek-iyi')
    expect(RASYO_META_MAP.get('dikimDkMaliyet')?.yon).toBe('dusuk-iyi')
    expect(RASYO_META_MAP.get('referans3D')?.yon).toBe('notr')
  })
})

describe('SIRALANAN_RASYOLAR', () => {
  it('yalnız notr olmayan rasyolar içeriyor', () => {
    for (const m of SIRALANAN_RASYOLAR) {
      expect(m.yon).not.toBe('notr')
    }
  })

  it("notr sayısı RASYO_META - SIRALANAN arasındaki farka eşit", () => {
    const notrSayisi = RASYO_META.filter(m => m.yon === 'notr').length
    expect(notrSayisi).toBe(RASYO_META.length - SIRALANAN_RASYOLAR.length)
  })

  it('en az 20 sıralanan rasyo var (Atölye Radarı çalışır)', () => {
    expect(SIRALANAN_RASYOLAR.length).toBeGreaterThanOrEqual(20)
  })
})
