import { describe, it, expect } from 'vitest';
import { yamazumiBars } from './yamazumiBars.js';

const data = (subOps) => ({ subOps, operators: [{ id: 'o1', name: 'Ali' }] });

describe('yamazumiBars', () => {
  it('operatörsüz iki yaprak → iki ayrı çubuk (usta 15, acami 30)', () => {
    const bars = yamazumiBars(data([
      { id: 'usta', mainOpId: 'a', cycleTime: 15, nextIds: [] },
      { id: 'acami', mainOpId: 'a', cycleTime: 30, nextIds: [] },
    ]), 288);
    expect(bars).toHaveLength(2);
    expect(bars.map(b => b.total).sort((x,y)=>x-y)).toEqual([15, 30]);
  });

  it('stationCount=2 operatörsüz → iki ayrı çubuk', () => {
    const bars = yamazumiBars(data([
      { id: 's', mainOpId: 'a', name: 'Dik', cycleTime: 20, stationCount: 2, nextIds: [] },
    ]), 288);
    expect(bars).toHaveLength(2);
    expect(bars.every(b => b.total === 20)).toBe(true);
  });

  it('aynı operatöre iki eleman → tek çubuk, yığılı (15+30=45)', () => {
    const bars = yamazumiBars(data([
      { id: 'e1', mainOpId: 'a', cycleTime: 15, operatorId: 'o1', nextIds: [] },
      { id: 'e2', mainOpId: 'a', cycleTime: 30, operatorId: 'o1', nextIds: [] },
    ]), 288);
    expect(bars).toHaveLength(1);
    expect(bars[0].total).toBe(45);
    expect(bars[0].segments).toHaveLength(2);
    expect(bars[0].label).toBe('Ali');
  });

  it('durum: total>takt darbogaz', () => {
    const bars = yamazumiBars(data([{ id: 'x', mainOpId: 'a', cycleTime: 300, nextIds: [] }]), 288);
    expect(bars[0].status).toBe('darbogaz');
  });
});
