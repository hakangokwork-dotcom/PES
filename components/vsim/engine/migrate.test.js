import { describe, it, expect } from 'vitest';
import { migrateData, deriveEdges, SCHEMA_VERSION } from './migrate.js';

const V3 = {
  mainOps: [
    { id: 'm1', name: 'A', nextIds: ['m2'], x: 0, y: 0 },
    { id: 'm2', name: 'B', nextIds: [], x: 100, y: 0 },
  ],
  subOps: [{ id: 's1', mainOpId: 'm1', cycleTime: 60, nextIds: [] }],
  machines: [{ id: 'mc1', name: 'Overlok' }],
  operators: [],
  settings: { netMinutes: 500 },      // eksik alanlar var — varsayılanla tamamlanmalı
  scenarios: [{ id: 'sc1', name: 'Model 1', snapshot: { mainOps: [], subOps: [] }, result: null }],
  meta: { modelAdi: 'Gömlek' },
};

describe('migrateData v3 → v4', () => {
  it('v4 alanlarını ekler, mevcut veriyi korur', () => {
    const out = migrateData(V3);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.domainId).toBe('textile');
    expect(out.mainOps).toEqual(V3.mainOps);
    expect(out.subOps).toEqual(V3.subOps);
    expect(out.machines).toEqual(V3.machines);
    expect(out.meta).toEqual(V3.meta);
    expect(out.infoNodes).toEqual([]);
    expect(out.infoEdges).toEqual([]);
    expect(out.kaizens).toEqual([]);
    expect(out.processMaps).toEqual([]);
  });

  it('eksik settings alanlarını varsayılanla tamamlar, mevcutları ezmez', () => {
    const out = migrateData(V3);
    expect(out.settings).toEqual({ netMinutes: 500, efficiency: 0.85, pfd: 0.15, demand: 480 });
  });

  it('edges nextIds\'ten türetilir', () => {
    const out = migrateData(V3);
    expect(out.edges).toEqual([
      { from: 'm1', to: 'm2', inventoryCount: null, inventoryWaitSec: null, flowType: 'push' },
    ]);
  });

  it('senaryolar olduğu gibi taşınır (snapshot yapısal dönüşüm gerektirmez)', () => {
    const out = migrateData(V3);
    expect(out.scenarios).toEqual(V3.scenarios);
  });

  it('null/geçersiz girişte null döner', () => {
    expect(migrateData(null)).toBeNull();
    expect(migrateData('bozuk')).toBeNull();
  });

  it('sketch\'siz processMap\'e sketch geri-doldurulur (backfill)', () => {
    const raw = { ...V3, processMaps: [
      { id: 'x', name: 'Eski', kind: 'akis', nodes: [], edges: [], lanes: [], tags: [] },   // sketch yok
    ]};
    const out = migrateData(raw);
    expect(out.processMaps[0].sketch).toEqual({ strokes: [], texts: [], shapes: [], stickies: [], stamps: [], comments: [] });
    expect(out.processMaps[0].name).toBe('Eski');   // diğer alanlar korunur
  });

  it('stickies/stamps\'siz sketch normalize edilir: her ikisi [] eklenir', () => {
    const raw = { ...V3, processMaps: [
      { id: 'z', name: 'YeniYok', kind: 'akis', nodes: [], edges: [], lanes: [], tags: [],
        sketch: { strokes: [{ id: 'st_1', points: [[0, 0], [1, 1]] }], texts: [] } },
    ]};
    const out = migrateData(raw);
    expect(out.processMaps[0].sketch.stickies).toEqual([]);
    expect(out.processMaps[0].sketch.stamps).toEqual([]);
    expect(out.processMaps[0].sketch.strokes).toHaveLength(1);
  });

  it('comments\'siz sketch normalize edilir: comments [] eklenir', () => {
    const raw = { ...V3, processMaps: [
      { id: 'c', name: 'CommentsYok', kind: 'akis', nodes: [], edges: [], lanes: [], tags: [],
        sketch: { strokes: [], texts: [] } },
    ]};
    const out = migrateData(raw);
    expect(out.processMaps[0].sketch.comments).toEqual([]);
  });

  it('shapes\'siz sketch normalize edilir: shapes [] eklenir, strokes/texts korunur', () => {
    const raw = { ...V3, processMaps: [
      { id: 'y', name: 'ShapesYok', kind: 'akis', nodes: [], edges: [], lanes: [], tags: [],
        sketch: { strokes: [{ id: 'st_1', points: [[0, 0], [1, 1]] }], texts: [{ id: 'tx_1', x: 5, y: 5, text: 'N' }] } },
    ]};
    const out = migrateData(raw);
    expect(out.processMaps[0].sketch.shapes).toEqual([]);
    expect(out.processMaps[0].sketch.strokes).toHaveLength(1);
    expect(out.processMaps[0].sketch.texts).toHaveLength(1);
  });
});

describe('migrateData v4 → v4 (idempotent)', () => {
  it('ikinci geçiş aynı sonucu verir', () => {
    const once = migrateData(V3);
    const twice = migrateData(once);
    expect(twice).toEqual(once);
  });

  it('bağlantı yerinde kalırsa kullanıcının girdiği edge metası korunur', () => {
    const v4 = migrateData(V3);
    v4.edges[0].inventoryCount = 12;
    v4.edges[0].flowType = 'fifo';
    const kept = migrateData({ ...v4 });
    expect(kept.edges[0].inventoryCount).toBe(12);
    expect(kept.edges[0].flowType).toBe('fifo');
  });

  it('kopan bağlantının edge\'i düşer, yeni bağlantı varsayılan meta ile gelir', () => {
    const v4 = migrateData(V3);
    v4.edges[0].inventoryCount = 12;
    v4.edges[0].flowType = 'fifo';
    // m1→m2 bağlantısı koptu, m2→m1 eklendi senaryosu:
    const changed = { ...v4, mainOps: [
      { ...v4.mainOps[0], nextIds: [] },
      { ...v4.mainOps[1], nextIds: ['m1'] },
    ]};
    const re = migrateData(changed);
    expect(re.edges).toEqual([
      { from: 'm2', to: 'm1', inventoryCount: null, inventoryWaitSec: null, flowType: 'push' },
    ]);
  });

  it('korunan edge kopyalanır (referans paylaşılmaz)', () => {
    const v4 = migrateData(V3);
    v4.edges[0].inventoryCount = 7;
    const re = migrateData(v4);
    expect(re.edges[0]).toEqual(v4.edges[0]);
    expect(re.edges[0]).not.toBe(v4.edges[0]);
  });

  it('v4 passthrough\'ta da sketch\'siz processMap geri-doldurulur, mevcut sketch korunur', () => {
    const v4 = { ...migrateData(V3), processMaps: [
      { id: 'a', name: 'Sketchsiz', kind: 'akis', nodes: [], edges: [], lanes: [], tags: [] },
      { id: 'b', name: 'Sketchli', kind: 'akis', nodes: [], edges: [], lanes: [], tags: [],
        sketch: { strokes: [{ id: 'st_1', color: '#000', width: 3, opacity: 1, points: [[0, 0], [1, 1]] }], texts: [] } },
    ]};
    const out = migrateData(v4);   // schemaVersion set → passthrough dalı
    expect(out.processMaps[0].sketch).toEqual({ strokes: [], texts: [], shapes: [], stickies: [], stamps: [], comments: [] });
    expect(out.processMaps[1].sketch.strokes).toHaveLength(1);   // mevcut sketch ezilmez
  });

  it('bilinmeyen gelecek sürüm alan kaybı olmadan geçer', () => {
    const v5 = { ...migrateData(V3), schemaVersion: 5, futureField: 'x' };
    const out = migrateData(v5);
    expect(out.schemaVersion).toBe(5);
    expect(out.futureField).toBe('x');
    expect(out.edges).toHaveLength(1);
  });
});

describe('deriveEdges', () => {
  it('root mainOps bağlantılarından edge listesi üretir', () => {
    const edges = deriveEdges({ mainOps: V3.mainOps, edges: [] });
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe('m1');
  });
});
