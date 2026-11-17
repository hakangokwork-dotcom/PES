import { describe, expect, it } from 'vitest'
import { dosyaHatasi, dosyaYolu, DOSYA_SINIRI } from './form-dosya'

describe('dosyaHatasi', () => {
  it('fotoğraf ve PDF kabul, diğerleri ve sınır dışı ret', () => {
    expect(dosyaHatasi('image/jpeg', 1000)).toBeNull()
    expect(dosyaHatasi('application/pdf', DOSYA_SINIRI)).toBeNull()
    expect(dosyaHatasi('image/svg+xml', 1000)).not.toBeNull()
    expect(dosyaHatasi('text/html', 1000)).not.toBeNull()
    expect(dosyaHatasi('image/png', 0)).not.toBeNull()
    expect(dosyaHatasi('image/png', DOSYA_SINIRI + 1)).not.toBeNull()
  })
})

describe('dosyaYolu', () => {
  it('kullanıcı adını yola koymaz, uzantıyı türden alır', () => {
    expect(dosyaYolu('t1', 5, 9, 'u-u', 'image/webp')).toBe('t1/5/9/u-u.webp')
  })
})
