import { describe, it, expect } from 'vitest';
import { analyzeSharedStations } from './sharedStations.js';
import { computeCapacity } from './capacity.js';
import { migrateData } from './migrate.js';

/* İki bant → ortak overlok. Temiz sayılar için eff=1, pfd=0:
   b1 (ct 60 → smv 1 dk)  → kap/thru = 420 ad/v
   b2 (ct 90 → smv 1,5 dk) → kap/thru = 280 ad/v
   ov (ct 12, ortak, 1 makine): kullanım = (420+280)×12 sn = 8400 sn = 140 dk
   util = 140/420 = %33,33 · M/D/1 bekleme = (0,3333×12)/(2×0,6667) = 3 sn */
const RAW = {
  schemaVersion: 4, domainId: 'textile',
  mainOps: [
    { id: 'b1', name: 'Bant 1',  color: '#0F6B5C', order: 0, nextIds: ['ov'], x: 0, y: 0 },
    { id: 'b2', name: 'Bant 2',  color: '#3E6B8C', order: 1, nextIds: ['ov'], x: 0, y: 0 },
    { id: 'ov', name: 'Overlok', color: '#B45309', order: 2, nextIds: [], x: 0, y: 0,
      isShared: true, machineCount: 1 },
  ],
  subOps: [
    { id: 's1', mainOpId: 'b1', name: 'Dik1', cycleTime: 60, nextIds: [] },
    { id: 's2', mainOpId: 'b2', name: 'Dik2', cycleTime: 90, nextIds: [] },
    { id: 's3', mainOpId: 'ov', name: 'Ovl',  cycleTime: 12, nextIds: [] },
  ],
  machines: [], operators: [],
  settings: { netMinutes: 420, efficiency: 1, pfd: 0, demand: 350 },
  scenarios: [], meta: {}, edges: [], infoNodes: [], infoEdges: [], kaizens: [],
};
const DATA = migrateData(RAW);
const CALC = computeCapacity(DATA);

describe('analyzeSharedStations', () => {
  const list = analyzeSharedStations(DATA, CALC);
  const ov = list[0];

  it('yalnız isShared istasyonları analiz eder', () => {
    expect(list).toHaveLength(1);
    expect(ov.id).toBe('ov');
    expect(ov.name).toBe('Overlok');
  });

  it('bantlar öncül zincirlerden türetilir (thru ile)', () => {
    expect(ov.bands.map(b => b.id).sort()).toEqual(['b1', 'b2']);
    expect(ov.bands.find(b => b.id === 'b1').qty).toBeCloseTo(420, 4);
    expect(ov.bands.find(b => b.id === 'b2').qty).toBeCloseTo(280, 4);
  });

  it('doc §5.5.1: kullanım oranı ve toplam kullanım', () => {
    expect(ov.totalUseMin).toBeCloseTo(140, 4);       // 8400 sn
    expect(ov.utilizationPct).toBeCloseTo(33.333, 2);
    expect(ov.isBottleneck).toBe(false);              // eşik %85
  });

  it('doc §5.5.2: M/D/1 ortalama bekleme', () => {
    expect(ov.queueWaitSec).toBeCloseTo(3.0, 3);      // (0,3333×12)/(2×0,6667)
  });

  it('makine sayısı kullanım oranını böler', () => {
    const d2 = structuredClone(DATA);
    d2.mainOps.find(m => m.id === 'ov').machineCount = 2;
    const r = analyzeSharedStations(d2, computeCapacity(d2))[0];
    expect(r.utilizationPct).toBeCloseTo(16.667, 2);
    expect(r.machineCount).toBe(2);
  });

  it('aşırı yük: darboğaz bayrağı, sonsuz kuyruk, ek makine önerisi', () => {
    const d3 = structuredClone(DATA);
    d3.subOps.find(s => s.id === 's3').cycleTime = 40;   // kullanım (700×40)=28000sn=466,7dk → %111
    const r = analyzeSharedStations(d3, computeCapacity(d3))[0];
    expect(r.utilizationPct).toBeGreaterThan(85);
    expect(r.isBottleneck).toBe(true);
    expect(r.queueWaitSec).toBe(Infinity);
    expect(r.neededMachines).toBe(2);                    // ⌈466,7/(420×0,85)⌉
    expect(r.extraMachines).toBe(1);
  });

  it('öncülü olmayan ortak istasyon: boş bant, %0 kullanım, çökme yok', () => {
    const d4 = structuredClone(DATA);
    d4.mainOps.forEach(m => { m.nextIds = []; });
    const r = analyzeSharedStations(d4, computeCapacity(d4))[0];
    expect(r.bands).toEqual([]);
    expect(r.utilizationPct).toBe(0);
    expect(r.queueWaitSec).toBe(0);
  });

  it('isShared yoksa boş liste', () => {
    const d5 = structuredClone(DATA);
    d5.mainOps.forEach(m => { delete m.isShared; });
    expect(analyzeSharedStations(d5, computeCapacity(d5))).toEqual([]);
  });
});
