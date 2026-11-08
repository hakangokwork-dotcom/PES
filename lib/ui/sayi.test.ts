import { describe, expect, it } from 'vitest'
import { sayi, tl, yuzde } from './sayi'

describe('sayi', () => {
  it('Türkçe binlik ve ondalık', () => {
    expect(sayi(1234567)).toBe('1.234.567')
    expect(sayi('12.345', 1)).toBe('12,3')
    expect(yuzde(85.34)).toBe('%85,3')
    expect(yuzde('97')).toBe('%97')
    expect(tl(0.854, 2)).toBe('0,85 TL')
    expect(tl(1500000)).toBe('1.500.000 TL')
  })

  it('boş ya da geçersiz değer tek işaretle', () => {
    for (const v of [null, undefined, '', 'abc', NaN, Infinity]) {
      expect(sayi(v)).toBe('—')
      expect(yuzde(v)).toBe('—')
      expect(tl(v)).toBe('—')
    }
  })
})
