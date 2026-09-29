import { describe, it, expect } from 'vitest';
import { buildLogistics, bufferOccupancy } from './logistics.js';
import { initialSimState, advanceSimStep, buildGroupBridges } from './simulation.js';
import { createItem, newLayout } from './layout.js';

/* A grubu: a1 → a2 ; B grubu: b1 ; A → B (grup köprüsü). */
function fixture() {
  return {
    settings: { netMinutes: 600 },
    mainOps: [
      { id: 'A', name: 'A', nextIds: ['B'] },
      { id: 'B', name: 'B', nextIds: [] },
    ],
    subOps: [
      { id: 'a1', mainOpId: 'A', cycleTime: 10, nextIds: ['a2'] },
      { id: 'a2', mainOpId: 'A', cycleTime: 10, nextIds: [] },
      { id: 'b1', mainOpId: 'B', cycleTime: 10, nextIds: [] },
    ],
  };
}
function layoutFor(opts = {}) {
  const L = newLayout('T', { w: 40, h: 10 });
  L.items = [
    createItem('duz', 0, 0, { subOpId: 'a1' }),     // merkez (0.6, 0.3)
    createItem('duz', 4, 0, { subOpId: 'a2' }),     // merkez (4.6, 0.3)
    createItem('duz', 20, 0, { subOpId: 'b1' }),    // merkez (20.6, 0.3)
  ];
  L.transport = { speedMps: 1, bundle: 1, ...(opts.transport || {}) };
  if (opts.buffer) L.items.push(createItem('raf', 10, 3, { routeKeys: ['a2>b1'], capacity: opts.buffer }));
  return L;
}
const run = (d, sec, dt = 1) => {
  const st = initialSimState();
  for (let t = 0; t < sec; t += dt) advanceSimStep(st, d, dt);
  return st;
};

describe('buildLogistics', () => {
  it('yerleşim rotalarından motor anahtarlarına gecikme üretir', () => {
    const d = fixture();
    const lg = buildLogistics(d, layoutFor());
    expect(lg.links['a1>a2'].delaySec).toBeCloseTo(4);        // 4 m / 1 m/sn
    expect(lg.links['a2>>B'].delaySec).toBeCloseTo(16);       // grup köprüsü
    expect(lg.stations).toEqual({ a1: 1, a2: 1, b1: 1 });
  });
  it('ara stok üzerinden geçen akış tampona kaydedilir', () => {
    const lg = buildLogistics(fixture(), layoutFor({ buffer: 5 }));
    expect(lg.links['a2>>B'].bufferId).toBeTruthy();
    expect(Object.values(lg.buffers)[0].keys).toEqual(['a2>>B']);
  });
  it('yerleşim yoksa null', () => {
    expect(buildLogistics(fixture(), null)).toBeNull();
  });
});

describe('lojistikli simülasyon', () => {
  it('lojistik yokken durum alanları oluşmaz (eski davranış)', () => {
    const st = run(fixture(), 60);
    expect(st.transit).toBeUndefined();
    expect(st.exited).toBeGreaterThan(0);
  });
  it('taşıma süresi ilk çıkışı geciktirir', () => {
    const d = fixture();
    const base = run(d, 45).exited;
    const withLg = run({ ...d, logistics: buildLogistics(d, layoutFor()) }, 45).exited;
    expect(base).toBeGreaterThan(withLg);
  });
  it('demet dolmadan parça yola çıkmaz', () => {
    const d = fixture();
    d.logistics = buildLogistics(d, layoutFor({ transport: { bundle: 5 } }));
    const st = run(d, 35);
    // a1 3 parça bitirdi, demet 5 → a2'ye hiç parça gitmedi
    expect(st.completed.a1).toBe(3);
    expect(st.completed.a2 || 0).toBe(0);
    expect(st.outbox['a1>a2']).toBe(3);
  });
  it('ara stok dolunca kaynak istasyon bloke olur', () => {
    const d = fixture();
    d.subOps.find(s => s.id === 'b1').cycleTime = 100;          // tüketici çok yavaş
    d.logistics = buildLogistics(d, layoutFor({ buffer: 3 }));
    const st = run(d, 300);
    const bid = Object.keys(d.logistics.buffers)[0];
    const occ = bufferOccupancy(st, d.logistics, bid, buildGroupBridges(d));
    expect(occ).toBeLessThanOrEqual(3);
    expect(st.bufferPeak[bid]).toBeLessThanOrEqual(3);
    expect(st.blockedSec.a2).toBeGreaterThan(0);
    // tüketici yalnız ilk demet gelene kadar (≈ 20 sn işlem + 22 sn yol) aç kalır
    expect(st.starvedSec.b1 || 0).toBeLessThan(60);
  });
  it('yerleşimdeki paralel istasyon efektif çevrimi böler', () => {
    const d = fixture();
    const L = layoutFor();
    L.items.push(createItem('duz', 0, 3, { subOpId: 'a1', slot: 1 }));
    const single = run({ ...d, logistics: buildLogistics(d, layoutFor()) }, 20);
    d.logistics = buildLogistics(d, L);
    const st = run(d, 20);
    expect(single.completed.a1).toBe(1);   // 10 sn çevrim
    expect(st.completed.a1).toBe(3);       // 5 sn efektif çevrim
  });
});
