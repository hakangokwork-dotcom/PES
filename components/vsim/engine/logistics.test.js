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

describe('giriş kontrolü (kesim serbest bırakma)', () => {
  it('sabit hız kaynağı saatte N parça ile sınırlar', () => {
    const d = fixture();
    const L = layoutFor();
    L.release = { mode: 'rate', perHour: 60 };             // dakikada 1
    d.logistics = buildLogistics(d, L);
    const st = run(d, 600);
    expect(st.released.a1).toBeLessThanOrEqual(11);
    expect(st.released.a1).toBeGreaterThanOrEqual(10);
    expect(st.gatedSec.a1).toBeGreaterThan(0);
  });
  it('WIP sınırı hattaki (çıkmamış) parça sayısını tutar', () => {
    const d = fixture();
    d.subOps.find(s => s.id === 'b1').cycleTime = 60;       // yavaş son istasyon
    const L = layoutFor();
    L.release = { mode: 'conwip', wipCap: 5 };
    d.logistics = buildLogistics(d, L);
    const st = run(d, 1200);
    expect(st.released.a1 - st.exited).toBeLessThanOrEqual(5);
    const free = run({ ...d, logistics: buildLogistics(d, layoutFor()) }, 1200);
    expect(free.released.a1 - free.exited).toBeGreaterThan(20);
  });
});

describe('parça takibi', () => {
  it('izleme isteği sonraki parçayı çıkışa kadar izler', () => {
    const d = fixture();
    d.logistics = buildLogistics(d, layoutFor());
    const st = initialSimState();
    st.traceReq = 'a1';
    for (let t = 0; t < 300; t++) advanceSimStep(st, d, 1);
    expect(st.trace.done).toBe(true);
    const kinds = st.trace.events.map(e => e.kind);
    expect(kinds[0]).toBe('process');
    expect(kinds).toContain('transit');
    expect(kinds).toContain('queue');
    expect(kinds[kinds.length - 1]).toBe('exit');
    const procAt = st.trace.events.filter(e => e.kind === 'process').map(e => e.at);
    expect(procAt).toEqual(['a1', 'a2', 'b1']);
    expect(st.traces).toHaveLength(1);
  });
  it('demet dolana kadar bekleyişi kaydeder', () => {
    const d = fixture();
    d.logistics = buildLogistics(d, layoutFor({ transport: { bundle: 3 } }));
    const st = initialSimState();
    st.traceReq = 'a1';
    for (let t = 0; t < 200; t++) advanceSimStep(st, d, 1);
    expect(st.trace.events.map(e => e.kind)).toContain('bundle');
  });
});

describe('arıza, bakım ve yedek', () => {
  const withRel = (rel, extra = []) => {
    const L = layoutFor();
    L.items.find(i => i.subOpId === 'a2').reliability = rel;
    L.items.push(...extra);
    return L;
  };
  it('planlı bakım süresince operasyon durur ve olay kaydı düşer', () => {
    const d = fixture();
    d.logistics = buildLogistics(d, withRel({ maintAtMin: 2, maintDurMin: 5 }));
    const st = run(d, 600);
    const base = run({ ...d, logistics: buildLogistics(d, layoutFor()) }, 600);
    expect(st.completed.a2).toBeLessThan(base.completed.a2);
    const kinds = st.events.map(e => e.kind);
    expect(kinds).toContain('bakim');
    expect(kinds).toContain('bakim-bitti');
    const id = Object.keys(d.logistics.machines)[0];
    expect(st.downSec[id]).toBeCloseTo(300, -1);
  });
  it('arızalar tohuma bağlı, tekrarlanabilir', () => {
    const d = fixture();
    const L = withRel({ mtbfH: 0.05, mttrMin: 2 });         // ~3 dk'da bir arıza
    L.seed = 7;
    d.logistics = buildLogistics(d, L);
    const a = run(d, 1800), b = run(d, 1800);
    expect(a.events).toEqual(b.events);
    expect(a.events.filter(e => e.kind === 'ariza').length).toBeGreaterThan(2);
    L.seed = 8;
    const c = run({ ...d, logistics: buildLogistics(d, L) }, 1800);
    expect(c.events).not.toEqual(a.events);
  });
  it('uyumlu yedek makine duruşu kısaltır', () => {
    const d = fixture();
    const spare = createItem('duz', 6, 3, { isSpare: true });   // aynı tür, yakın
    const rel = { maintAtMin: 1, maintDurMin: 60 };
    const noSpare = buildLogistics(d, withRel(rel));
    const withSpare = buildLogistics(d, { ...withRel(rel, [spare]), transport: { speedMps: 1, bundle: 1, spareSetupMin: 2 } });
    const m = Object.values(withSpare.machines)[0];
    expect(m.spares).toHaveLength(1);
    const s1 = run({ ...d, logistics: noSpare }, 1800);
    const s2 = run({ ...d, logistics: withSpare }, 1800);
    expect(s2.completed.a2).toBeGreaterThan(s1.completed.a2);
    expect(s2.events.map(e => e.kind)).toContain('yedek-devrede');
  });
});
