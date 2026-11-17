import { describe, expect, it } from 'vitest'
import { dosyaHatasi, dosyaYolu, surecYolu, DOSYA_SINIRI } from './form-dosya'

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

describe('surecYolu', () => {
  it('surec/ öneki, kullanıcı dosya adı yola girmez', () => {
    expect(surecYolu('t1', 270, 'KUMAS', 'u-1', 'image/jpeg')).toBe('surec/t1/270/KUMAS/u-1.jpg')
  })
})
