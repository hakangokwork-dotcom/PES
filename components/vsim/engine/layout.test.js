import { describe, it, expect } from 'vitest';
import {
  SYMBOLS, symbolForSubOp, itemRect, itemFootprint, createItem, newLayout,
  stationSlots, leafFlowEdges, lPath, countCrossings, layoutMetrics, autoPlace, snap, insertSubOpAfter,
  stationAt, mergeWorkerIntoStation,
} from './layout.js';

const main = (id, extra = {}) => ({ id, name: id, color: '#123456', nextIds: [], ...extra });
const sub = (id, parent, extra = {}) => ({ id, mainOpId: parent, cycleTime: 30, nextIds: [], ...extra });

/* Beden bandı (b1→b2) ve kol bandı (k1) montajda (m1) birleşir. */
function fixture() {
  return {
    mainOps: [
      main('BEDEN', { nextIds: ['MONT'], order: 0, color: '#1f5fae' }),
      main('KOL', { nextIds: ['MONT'], order: 1, color: '#c2410c' }),
      main('MONT', { order: 2 }),
    ],
    subOps: [
      sub('b1', 'BEDEN', { nextIds: ['b2'], type: 'DİKİM' }),
      sub('b2', 'BEDEN', { type: 'OVERLOK' }),
      sub('k1', 'KOL', { type: 'DİKİM', stationCount: 2 }),
      sub('m1', 'MONT', { type: 'OVERLOK', operatorId: 'op1' }),
    ],
    machines: [], operators: [{ id: 'op1', name: 'A' }],
  };
}

describe('sembol ve geometri', () => {
  it('kaynak türü ve adı sembole çevirir', () => {
    expect(symbolForSubOp({ type: 'OVERLOK' })).toBe('ov');
    expect(symbolForSubOp({ name: 'İlik açma', type: 'DİKİM' })).toBe('il');
    expect(symbolForSubOp({ machineId: 'x' }, [{ id: 'x', type: 'Reçme' }])).toBe('rc');
    expect(symbolForSubOp({ type: 'BİLİNMEYEN' })).toBe('duz');
  });
  it('döndürme gövdeyi çevirir, ayak izi operatör alanını ekler', () => {
    const it0 = createItem('duz', 1, 1, { subOpId: 's' });
    expect(itemRect(it0)).toEqual({ x: 1, y: 1, w: 1.2, h: 0.6 });
    expect(itemFootprint(it0)).toEqual({ x: 1, y: 1, w: 1.2, h: 1.3 });
    const it180 = { ...it0, rot: 180 };
    expect(itemFootprint(it180).y).toBeCloseTo(0.3);
    const it90 = { ...it0, rot: 90 };
    expect(itemRect(it90)).toEqual({ x: 1, y: 1, w: 0.6, h: 1.2 });
    expect(itemFootprint(it90).x).toBeCloseTo(0.3);
  });
  it('ara stok varsayılan kapasite alır, snap ızgaraya yuvarlar', () => {
    expect(createItem('raf', 0, 0).capacity).toBe(60);
    expect(snap(1.13)).toBe(1.25);
    expect(SYMBOLS.koridor.kind).toBe('aisle');
  });
});

describe('süreç → istasyon ve akış', () => {
  it('stationCount kadar yuva üretir', () => {
    const slots = stationSlots(fixture());
    expect(slots.map(s => `${s.subOpId}#${s.slot}`)).toEqual(['b1#0', 'b2#0', 'k1#0', 'k1#1', 'm1#0']);
    expect(slots[0].groupId).toBe('BEDEN');
  });
  it('grup köprülerini yaprak kenarlarına açar', () => {
    const keys = leafFlowEdges(fixture()).map(e => e.key).sort();
    expect(keys).toEqual(['b1>b2', 'b2>m1', 'k1>m1']);
  });
  it('input/output geçirgen düğümlerini atlar ve iç içe konteyneri açar', () => {
    const d = {
      mainOps: [main('A', { nextIds: ['B'] }), main('B')],
      subOps: [
        sub('in', 'A', { kind: 'input', cycleTime: 0, nextIds: ['x', 'y'] }),
        sub('x', 'A', { nextIds: ['out'] }),
        sub('y', 'A', { nextIds: ['out'] }),
        sub('out', 'A', { kind: 'output', cycleTime: 0 }),
        sub('c', 'B'),
        sub('c1', 'B', { parentId: 'c', nextIds: ['c2'] }),
        sub('c2', 'B', { parentId: 'c' }),
      ],
    };
    const keys = leafFlowEdges(d).map(e => e.key).sort();
    expect(keys).toEqual(['c1>c2', 'x>c1', 'y>c1']);
  });
});

describe('rota ve kesişme', () => {
  it('L yol önce yatay gider', () => {
    expect(lPath({ x: 0, y: 0 }, { x: 2, y: 3 })).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }]);
    expect(lPath({ x: 0, y: 0 }, { x: 0, y: 3 })).toHaveLength(2);
  });
  it('yatay ve dikey segmentin kesişmesini sayar, uç teması saymaz', () => {
    const h = [{ x: 0, y: 1 }, { x: 4, y: 1 }];
    const v = [{ x: 2, y: 0 }, { x: 2, y: 3 }];
    const touch = [{ x: 4, y: 1 }, { x: 4, y: 5 }];
    expect(countCrossings([h, v]).count).toBe(1);
    expect(countCrossings([h, touch]).count).toBe(0);
  });
});

describe('karne', () => {
  function placed() {
    const d = fixture();
    const L = newLayout('T', { w: 20, h: 10 });
    L.items = [
      createItem('duz', 0, 0, { subOpId: 'b1' }),       // merkez (0.6, 0.3)
      createItem('ov', 3, 0, { subOpId: 'b2' }),        // merkez (3.5, 0.3)
      createItem('duz', 0, 4, { subOpId: 'k1', slot: 0 }),
      createItem('ov', 6, 0, { subOpId: 'm1' }),        // merkez (6.5, 0.3)
    ];
    return { d, L };
  }
  it('mesafe, parça başı yol, yerleşmemiş ve birleşme', () => {
    const { d, L } = placed();
    const m = layoutMetrics(d, L);
    const byKey = Object.fromEntries(m.routes.map(r => [r.key, r.dist]));
    expect(byKey['b1>b2']).toBeCloseTo(2.9);
    expect(byKey['b2>m1']).toBeCloseTo(3.0);
    expect(byKey['k1>m1']).toBeCloseTo(5.9 + 4);
    expect(m.perGroup.find(g => g.id === 'BEDEN').dist).toBeCloseTo(5.9);
    expect(m.unplaced.map(u => `${u.subOpId}#${u.slot}`)).toEqual(['k1#1']);
    expect(m.merges.map(x => x.subOpId)).toEqual(['m1']);
    expect(m.persons).toBe(4);   // her istasyonda bir kişi: 1 atanmış (op1) + 3 atanmamış
  });
  it('ara stok üzerinden geçen rota yolu uzatır', () => {
    const { d, L } = placed();
    L.items.push(createItem('raf', 3, 4, { routeKeys: ['k1>m1'] }));  // merkez (3.75, 4.5)
    const r = layoutMetrics(d, L).routes.find(x => x.key === 'k1>m1');
    expect(r.viaId).toBeTruthy();
    expect(r.dist).toBeCloseTo((3.75 - 0.6) + (4.5 - 4.3) + (6.5 - 3.75) + (4.5 - 0.3));
  });
  it('çakışma, dar/işgal edilmiş koridor ve zemin dışı uyarıları', () => {
    const d = fixture();
    const L = newLayout('T', { w: 5, h: 5 });
    L.items = [
      createItem('duz', 0, 0), createItem('duz', 0.5, 0.2),
      createItem('koridor', 0, 3, { w: 4, h: 1 }),
      createItem('kolon', 1, 3.2),
      createItem('kt', 4, 4),
    ];
    const codes = layoutMetrics(d, L).warnings.map(w => w.code).sort();
    expect(codes).toEqual(['aisle-blocked', 'aisle-narrow', 'outside', 'overlap']);
  });
  it('silinmiş operasyona bağlı ve çift yerleştirilmiş öğeleri uyarır', () => {
    const { d, L } = placed();
    L.items.push(createItem('duz', 10, 5, { subOpId: 'b1' }));
    L.items.push(createItem('duz', 10, 8, { subOpId: 'yok' }));
    const codes = layoutMetrics(d, L).warnings.map(w => w.code);
    expect(codes).toContain('duplicate');
    expect(codes).toContain('orphan');
  });
  it('aynı operatör iki öğede ise paylaşımlı (meydancı) sayılır', () => {
    const d = fixture();
    d.subOps.find(s => s.id === 'b2').operatorId = 'op1';
    const { L } = placed();
    const m = layoutMetrics(d, L);
    expect(m.shared).toHaveLength(1);
    expect(m.shared[0].itemIds).toHaveLength(2);
  });
});

describe('otomatik yerleşim', () => {
  it('yerleşmemiş tüm yuvaları çakışmasız yerleştirir', () => {
    const d = fixture();
    const L = newLayout('T');
    const items = autoPlace(d, L);
    const bound = items.filter(i => i.subOpId);
    expect(bound).toHaveLength(5);
    const m = layoutMetrics(d, { ...L, items });
    expect(m.unplaced).toHaveLength(0);
    expect(m.warnings.filter(w => w.code === 'overlap' || w.code === 'outside')).toEqual([]);
  });
  it('mevcut öğelerin altına yerleşir, tekrar çağrılınca boş döner', () => {
    const d = fixture();
    const L = newLayout('T');
    L.items = autoPlace(d, L);
    expect(autoPlace(d, L)).toEqual([]);
  });
});

describe('otomatik yerleşim · geniş tezgâh ve zemin', () => {
  it('geniş tezgâhları çakıştırmaz, küçük bölümleri yan yana koyar, zeminde kalır', () => {
    const d = {
      mainOps: [
        { id: 'A', name: 'A', order: 0, nextIds: ['B'] },
        { id: 'B', name: 'B', order: 1, nextIds: ['C'] },
        { id: 'C', name: 'C', order: 2, nextIds: [] },
      ],
      subOps: [
        { id: 'a1', mainOpId: 'A', cycleTime: 30, type: 'DİKİM', nextIds: ['a2'] },
        { id: 'a2', mainOpId: 'A', cycleTime: 30, type: 'OVERLOK', nextIds: [] },
        { id: 'b1', mainOpId: 'B', cycleTime: 30, type: 'ÜTÜ', stationCount: 3, nextIds: ['b2'] },
        { id: 'b2', mainOpId: 'B', cycleTime: 30, type: 'KONTROL', stationCount: 2, nextIds: [] },
        { id: 'c1', mainOpId: 'C', cycleTime: 30, type: 'DİKİM', nextIds: [] },
      ],
    };
    const L = newLayout('T', { w: 20, h: 15 });
    L.items = autoPlace(d, L);
    const m = layoutMetrics(d, L);
    expect(m.unplaced).toHaveLength(0);
    expect(m.warnings.filter(w => ['overlap', 'outside'].includes(w.code))).toEqual([]);
    const belts = L.items.filter(i => i.type === 'bant');
    const ys = belts.map(b => b.y);
    expect(belts).toHaveLength(3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.3);   // üç blok aynı şeritte
  });
  it('aynı operasyonun paralel istasyonları meydancı sayılmaz', () => {
    const d = fixture();
    d.subOps.find(s => s.id === 'k1').operatorId = 'op9';
    const L = newLayout('T');
    L.items = autoPlace(d, L);
    expect(layoutMetrics(d, L).shared).toEqual([]);
  });
});

describe('makinesiz masa, serbest çalışan, süreçe ekleme', () => {
  it('makine atanmamış el işleri masaya, kalite kontrol tezgâha düşer', () => {
    expect(symbolForSubOp({ name: 'Etiket takma', type: 'DİKİM' })).toBe('masa');
    expect(symbolForSubOp({ name: 'İplik temizleme', type: 'TEMİZLİK' })).toBe('masa');
    expect(symbolForSubOp({ name: 'Ara kalite kontrol', type: 'DİKİM' })).toBe('kt');
    // makine atanmışsa makine kazanır
    expect(symbolForSubOp({ name: 'Etiket takma', machineId: 'm' }, [{ id: 'm', type: 'Düz Dikiş' }])).toBe('duz');
  });
  it('serbest çalışan kişi sayısına girer, çakışma üretmez', () => {
    const d = fixture();
    const L = newLayout('T');
    L.items = [createItem('duz', 0, 0, { subOpId: 'm1' }), createItem('calisan', 0.3, 0.2)];
    const m = layoutMetrics(d, L);
    expect(m.persons).toBe(2);
    expect(m.freeWorkers).toBe(1);
    expect(m.warnings.filter(w => w.code === 'overlap')).toEqual([]);
  });
  it('seçilen adımın arkasına yeni operasyon ekler, akış korunur', () => {
    const d = fixture();
    const { subOps, id } = insertSubOpAfter(d, { afterId: 'b1', name: 'Etiket takma', cycleTime: 20 });
    const b1 = subOps.find(s => s.id === 'b1');
    const n = subOps.find(s => s.id === id);
    expect(b1.nextIds).toEqual([id]);
    expect(n.nextIds).toEqual(['b2']);
    expect(n.mainOpId).toBe('BEDEN');
    const keys = leafFlowEdges({ ...d, subOps }).map(e => e.key).sort();
    expect(keys).toEqual([`${id}>b2`, `b1>${id}`, 'b2>m1', 'k1>m1'].sort());
    expect(d.subOps.find(s => s.id === 'b1').nextIds).toEqual(['b2']);   // girdi değişmedi
  });
  it('adım seçilmezse grubun başına eklenir ve girişleri besler', () => {
    const d = fixture();
    const { subOps, id } = insertSubOpAfter(d, { mainOpId: 'BEDEN', name: 'Hazırlık', cycleTime: 10 });
    expect(subOps.find(s => s.id === id).nextIds).toEqual(['b1']);
  });
});

describe('istasyondaki kişiler', () => {
  it('her makine/masa bir kişi sayılır; aynı çalışan iki istasyonda bir kez; yedek sayılmaz; yardımcılar eklenir', () => {
    const d = fixture();
    const L = newLayout('T');
    L.items = [
      createItem('duz', 0, 0, { operatorId: 'x' }),
      createItem('duz', 2, 0, { operatorId: 'x' }),
      createItem('masa', 4, 0),
      createItem('duz', 6, 0, { isSpare: true }),
      createItem('ov', 8, 0, { helpers: [{ id: 'h1' }, { id: 'h2', operatorId: 'x' }] }),
      createItem('calisan', 10, 0),
    ];
    // x (bir kez) + masa + ov + h1 + serbest çalışan = 5 ; h2 = x zaten sayıldı
    expect(layoutMetrics(d, L).persons).toBe(5);
  });
  it('serbest çalışan istasyonun üstüne bırakılınca yardımcı olur', () => {
    const st = createItem('duz', 2, 2);
    const w = createItem('calisan', 2.3, 2.9, { name: 'Derya' });
    const f = itemFootprint(w);
    const hit = stationAt([st, w], { x: f.x + f.w / 2, y: f.y + f.h / 2 }, w.id);
    expect(hit.id).toBe(st.id);
    const out = mergeWorkerIntoStation([st, w], w.id, st.id);
    expect(out).toHaveLength(1);
    expect(out[0].helpers.map(h => h.name)).toEqual(['Derya']);
  });
  it('yedek makine ve boş zemin istasyon sayılmaz', () => {
    const sp = createItem('duz', 0, 0, { isSpare: true });
    expect(stationAt([sp], { x: 0.5, y: 0.3 })).toBeNull();
    expect(stationAt([sp], { x: 9, y: 9 })).toBeNull();
  });
});
