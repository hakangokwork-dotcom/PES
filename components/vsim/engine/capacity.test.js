import { describe, it, expect } from 'vitest';
import { computeCapacity } from './capacity.js';

const SAMPLE = {
  mainOps: [
    { id: 'a', name: 'A', color: '#000', order: 0, nextIds: ['b'], x: 0, y: 0 },
    { id: 'b', name: 'B', color: '#000', order: 1, nextIds: [], x: 100, y: 0 },
  ],
  subOps: [
    { id: 's1', mainOpId: 'a', name: 'Op1', cycleTime: 60, nextIds: [] },
    { id: 's2', mainOpId: 'b', name: 'Op2', cycleTime: 90, nextIds: [] },
  ],
  machines: [], operators: [],
  settings: { netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 },
  scenarios: [], meta: {},
};

describe('computeCapacity — golden master', () => {
  it('takt time doğru', () => {
    const c = computeCapacity(SAMPLE);
    expect(c.taktTimeMin).toBeCloseTo(1.125, 6);
    expect(c.taktTimeSec).toBeCloseTo(67.5, 6);
  });

  it('yaprak kapasiteleri ve hat kapasitesi doğru', () => {
    const c = computeCapacity(SAMPLE);
    expect(c.cap['s1']).toBeCloseTo(399.1304, 3);
    expect(c.cap['s2']).toBeCloseTo(266.0870, 3);
    expect(c.lineCapacity).toBeCloseTo(266.0870, 3);
  });

  it('darboğaz hat sonundaki yavaş istasyon', () => {
    const c = computeCapacity(SAMPLE);
    expect(c.bottleneckId).toBe('b');
  });

  it('perMain her ana op için özet üretir', () => {
    const c = computeCapacity(SAMPLE);
    expect(c.perMain).toHaveLength(2);
    expect(c.perMain[0].totalCycle).toBe(60);
    expect(c.perMain[1].slowest.id).toBe('s2');
  });

  it('DUP birleşme gelen değerleri toplar', () => {
    // p1 ve p2 (paralel) → j (DUP): giriş = 399.13 + 399.13 = 798.26, j kapasitesi sınırlar
    const dup = {
      ...SAMPLE,
      mainOps: [{ id: 'a', name: 'A', nextIds: [], order: 0, x: 0, y: 0, color: '#000' }],
      subOps: [
        { id: 'p1', mainOpId: 'a', cycleTime: 60, nextIds: ['j'] },
        { id: 'p2', mainOpId: 'a', cycleTime: 60, nextIds: ['j'] },
        { id: 'j',  mainOpId: 'a', cycleTime: 30, nextIds: [], joinType: 'DUP' },
      ],
    };
    const c = computeCapacity(dup);
    // j kapasitesi: smv = 0.5×1.15 = 0.575 → 459/0.575 = 798.2609; giriş 798.2609 → thru ≈ 798.26
    expect(c.thru['j']).toBeCloseTo(798.2609, 2);
  });

  it('boş subOps ile çökmeden 0 kapasite döner', () => {
    const empty = { ...SAMPLE, subOps: [] };
    const c = computeCapacity(empty);
    expect(c.lineCapacity).toBe(0);
    expect(c.taktTimeSec).toBeCloseTo(67.5, 6);
  });
});

describe('computeCapacity — kapsam ek testleri', () => {
  it('derin iç içe yapı (3 seviye) doğru hesaplanır', () => {
    const deep = {
      ...SAMPLE,
      mainOps: [{ id: 'a', name: 'A', color: '#000', order: 0, nextIds: [], x: 0, y: 0 }],
      subOps: [
        { id: 'c1', mainOpId: 'a', nextIds: [] },
        { id: 'g1', parentId: 'c1', cycleTime: 60, nextIds: [] },
      ],
    };
    const c = computeCapacity(deep);
    expect(c.cap['g1']).toBeCloseTo(399.1304, 3);
    expect(c.cap['c1']).toBeCloseTo(399.1304, 3);
    expect(c.cap['a']).toBeCloseTo(399.1304, 3);
    expect(c.lineCapacity).toBeCloseTo(399.1304, 3);
    expect(c.bottleneckByContainer['c1']).toBe('g1');
  });

  it('çok-öncüllü AND birleşme en yavaş girdiyi baz alır', () => {
    const andMerge = {
      ...SAMPLE,
      mainOps: [{ id: 'a', name: 'A', color: '#000', order: 0, nextIds: [], x: 0, y: 0 }],
      subOps: [
        { id: 'p1', mainOpId: 'a', cycleTime: 60, nextIds: ['j'] },
        { id: 'p2', mainOpId: 'a', cycleTime: 90, nextIds: ['j'] },
        { id: 'j', mainOpId: 'a', cycleTime: 30, nextIds: [] },
      ],
    };
    const c = computeCapacity(andMerge);
    expect(c.thru['p1']).toBeCloseTo(399.1304, 3);
    expect(c.thru['p2']).toBeCloseTo(266.0870, 3);
    expect(c.cap['j']).toBeCloseTo(798.2609, 3);
    expect(c.thru['j']).toBeCloseTo(266.0870, 3);
    expect(c.lineCapacity).toBeCloseTo(266.0870, 3);
    // t[p2] === t[j] (266.087) ama karşılaştırma "v < bnv" olduğundan
    // kids sırasında p2 (399.13'ten sonra) darboğaz kalır, j eşit değeri geçemez.
    expect(c.bottleneckByContainer['a']).toBe('p2');
  });

  it('stationCount istasyon kapasitesini ölçekler', () => {
    const scaled = {
      ...SAMPLE,
      subOps: [
        { id: 's1', mainOpId: 'a', name: 'Op1', cycleTime: 60, stationCount: 2, nextIds: [] },
        { id: 's2', mainOpId: 'b', name: 'Op2', cycleTime: 90, nextIds: [] },
      ],
    };
    const c = computeCapacity(scaled);
    expect(c.cap['s1']).toBeCloseTo(798.2609, 3);
    expect(c.lineCapacity).toBeCloseTo(266.0870, 3);
  });

  it('döngü içeren alt-graf çökmeden sonlu değer döner', () => {
    const cyclic = {
      ...SAMPLE,
      mainOps: [{ id: 'a', name: 'A', color: '#000', order: 0, nextIds: [], x: 0, y: 0 }],
      subOps: [
        { id: 'x', mainOpId: 'a', cycleTime: 60, nextIds: ['y'] },
        { id: 'y', mainOpId: 'a', cycleTime: 60, nextIds: ['x'] },
      ],
    };
    const c = computeCapacity(cyclic);
    expect(Number.isFinite(c.lineCapacity)).toBe(true);
    // Döngüde sink yok (her iki düğüm de birbirine bağlı) → çıkış 0.
    expect(c.lineCapacity).toBe(0);
  });

  it('SPLIT kaynak elmasta ÇİFT SAYMAZ (asıl hata)', () => {
    // A(60) → {B,C} → D(DUP). A böler: t[B]+t[C] = t[A], D iki katı görmez.
    const diamond = {
      ...SAMPLE,
      mainOps: [{ id: 'a', name: 'A', color: '#000', order: 0, nextIds: [], x: 0, y: 0 }],
      subOps: [
        { id: 'A', mainOpId: 'a', cycleTime: 60, nextIds: ['B', 'C'], splitType: 'SPLIT' },
        { id: 'B', mainOpId: 'a', cycleTime: 45, nextIds: ['D'] },
        { id: 'C', mainOpId: 'a', cycleTime: 90, nextIds: ['D'] },
        { id: 'D', mainOpId: 'a', cycleTime: 30, nextIds: [], joinType: 'DUP' },
      ],
    };
    const c = computeCapacity(diamond);
    expect(c.thru['A']).toBeCloseTo(399.1304, 2);
    // Orantılı: cap_B=532.17 (cyc45), cap_C=266.09 (cyc90) → 2:1 → 266.09 / 133.04
    expect(c.thru['B']).toBeCloseTo(266.0870, 2);
    expect(c.thru['C']).toBeCloseTo(133.0435, 2);
    // D girişi = 266.09 + 133.04 = 399.13 (t[A]) — 798.26 DEĞİL
    expect(c.thru['D']).toBeCloseTo(399.1304, 2);
  });

  it('SPLIT varsayılan DUP: splitType yoksa her dal TAM hız (geriye uyum)', () => {
    const dupDefault = {
      ...SAMPLE,
      mainOps: [{ id: 'a', name: 'A', color: '#000', order: 0, nextIds: [], x: 0, y: 0 }],
      subOps: [
        { id: 'A', mainOpId: 'a', cycleTime: 60, nextIds: ['B', 'C'] },   // splitType YOK
        { id: 'B', mainOpId: 'a', cycleTime: 60, nextIds: [] },
        { id: 'C', mainOpId: 'a', cycleTime: 60, nextIds: [] },
      ],
    };
    const c = computeCapacity(dupDefault);
    expect(c.thru['A']).toBeCloseTo(399.1304, 2);
    expect(c.thru['B']).toBeCloseTo(399.1304, 2);   // tam hız, bölünmez
    expect(c.thru['C']).toBeCloseTo(399.1304, 2);
  });

  it('SPLIT doyma: t_A > Σkap ise tüm dallar doyar, toplam = Σkap', () => {
    const sat = {
      ...SAMPLE,
      mainOps: [{ id: 'a', name: 'A', color: '#000', order: 0, nextIds: [], x: 0, y: 0 }],
      subOps: [
        { id: 'A', mainOpId: 'a', cycleTime: 15, nextIds: ['B', 'C'], splitType: 'SPLIT' },  // cap 1596.5
        { id: 'B', mainOpId: 'a', cycleTime: 60, nextIds: [] },   // cap 399.13
        { id: 'C', mainOpId: 'a', cycleTime: 60, nextIds: [] },   // cap 399.13
      ],
    };
    const c = computeCapacity(sat);
    expect(c.thru['B']).toBeCloseTo(399.1304, 2);   // doydu
    expect(c.thru['C']).toBeCloseTo(399.1304, 2);   // doydu
  });

  it('SPLIT tüm ardıl kapasitesi 0 → pay 0, NaN yok', () => {
    const zero = {
      ...SAMPLE,
      mainOps: [{ id: 'a', name: 'A', color: '#000', order: 0, nextIds: [], x: 0, y: 0 }],
      subOps: [
        { id: 'A', mainOpId: 'a', cycleTime: 60, nextIds: ['B'], splitType: 'SPLIT' },
        { id: 'B', mainOpId: 'a', cycleTime: 0, nextIds: [] },   // cyc 0 → cap 0
      ],
    };
    const c = computeCapacity(zero);
    expect(c.thru['B']).toBe(0);
    expect(Number.isNaN(c.thru['B'])).toBe(false);
  });
});
