import { expect, test } from 'vitest'
import { girenMetni } from './giren'

test('kaynak yoksa eski kayıt', () => {
  expect(girenMetni(null)).toBe('Kaynak bilinmiyor (eski kayıt)')
  expect(girenMetni({ giren_taraf: null })).toBe('Kaynak bilinmiyor (eski kayıt)')
})

test('taraf, e-posta ve tarih', () => {
  expect(girenMetni({ giren_taraf: 'atolye', giren_eposta: 'a@b', girildi_at: '2026-11-03T10:00:00Z' }))
    .toBe('Atölye beyanı · a@b · 03.11.2026')
  expect(girenMetni({ giren_taraf: 'merkez' })).toBe('Merkez kaydı')
})
