import { describe, it, expect } from 'vitest';
import { fmtSecShared } from './format.js';

describe('fmtSecShared — karşılaştırmada ortak birim (D4)', () => {
  it('en büyük büyüklüğe göre birim; a ve b aynı birim', () => {
    const f = fmtSecShared([5400, 2700, 2700]);
    expect(f(5400)).toBe('1.5 sa'); expect(f(2700)).toBe('0.8 sa');
  });
  it('hepsi dk altındaysa sn (tam sayı)', () => {
    const f = fmtSecShared([30, 10]); expect(f(30)).toBe('30 sn'); expect(f(10)).toBe('10 sn');
  });
  it('dk aralığı', () => { const f = fmtSecShared([300, 120]); expect(f(300)).toBe('5.0 dk'); });
  it('null grupta yok sayılır, delta a/b ile aynı birim', () => {
    const f = fmtSecShared([7200, null, 3600]); expect(f(3600)).toBe('1.0 sa'); expect(f(null)).toBe('—');
  });
});
