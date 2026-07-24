import { describe, it, expect } from 'vitest';
import { nodeHealth } from './nodeHealth.js';

const calc = {
  cap: { in: Infinity, usta: 1483.6, acami: 741.8, out: Infinity },
  thru: { in: Infinity, usta: 1483.6, acami: 741.8, out: 2225.4 },
  bottleneckByContainer: { op2: 'acami' },
};

describe('nodeHealth', () => {
  it('geçirgen input/output → gecirgen durumu', () => {
    expect(nodeHealth({ id: 'in', kind: 'input' }, calc, 'op2').status).toBe('gecirgen');
    expect(nodeHealth({ id: 'out', kind: 'output' }, calc, 'op2').status).toBe('gecirgen');
  });

  it('container darboğazı → darbogaz', () => {
    const h = nodeHealth({ id: 'acami', kind: 'op' }, calc, 'op2');
    expect(h.status).toBe('darbogaz');
    expect(h.out).toBeCloseTo(741.8, 1);
    expect(h.cap).toBeCloseTo(741.8, 1);
  });

  it('kapasitesinin altında çalışan op → normal (tam kapasite) veya ac (spare)', () => {
    // usta tam kapasitede (thru==cap) ama darboğaz değil → normal
    expect(nodeHealth({ id: 'usta', kind: 'op' }, calc, 'op2').status).toBe('normal');
    // spare: thru < cap
    const c2 = { ...calc, thru: { ...calc.thru, usta: 700 } };
    expect(nodeHealth({ id: 'usta', kind: 'op' }, c2, 'op2').status).toBe('ac');
  });

  it('kapasite 0 → bos', () => {
    expect(nodeHealth({ id: 'x', kind: 'op' }, { cap: { x: 0 }, thru: {}, bottleneckByContainer: {} }, 'op2').status).toBe('bos');
  });
});
