import { describe, it, expect } from 'vitest';
import { factoryZones, serpentineRows, stationQueue, zoneInbox, bottleneckStationId } from './factoryLayout.js';

const sub = (id, mainOpId, over = {}) => ({ id, mainOpId, name: id, cycleTime: 10, nextIds: [], ...over });

describe('factoryZones', () => {
  it('bölgeleri ana-op sırasına dizer, yaprakları toplar', () => {
    const data = {
      mainOps: [
        { id: 'M2', name: 'Dikim', order: 2 },
        { id: 'M1', name: 'Kesim', order: 1 },
      ],
      subOps: [sub('a', 'M1'), sub('b', 'M2'), sub('c', 'M2')],
    };
    const zones = factoryZones(data);
    expect(zones.map(z => z.id)).toEqual(['M1', 'M2']);
    expect(zones[1].stations.map(s => s.id)).toEqual(['b', 'c']);
  });

  it('konteyner alt-oplar atlanır, torun yapraklar kök bölgeye sayılır', () => {
    const data = {
      mainOps: [{ id: 'M1', name: 'Kesim', order: 1 }],
      subOps: [
        sub('grup', 'M1', { cycleTime: 0 }),           // konteyner (yaprak değil)
        sub('a', null, { parentId: 'grup' }),
        sub('b', null, { parentId: 'grup' }),
      ],
    };
    const zones = factoryZones(data);
    expect(zones).toHaveLength(1);
    expect(zones[0].stations.map(s => s.id)).toEqual(['a', 'b']);
  });

  it('bölge içi topolojik sıra: öncül önce, dallar dizi sırasında', () => {
    const data = {
      mainOps: [{ id: 'M1', name: 'Kesim', order: 1 }],
      subOps: [
        sub('join', 'M1'),
        sub('b', 'M1', { nextIds: ['join'] }),
        sub('c', 'M1', { nextIds: ['join'] }),
        sub('a', 'M1', { nextIds: ['b', 'c'] }),
      ],
    };
    const zones = factoryZones(data);
    expect(zones[0].stations.map(s => s.id)).toEqual(['a', 'b', 'c', 'join']);
  });

  it('cycleTime=0 veya passthrough istasyon sayılmaz; boş bölge elenir', () => {
    const data = {
      mainOps: [{ id: 'M1', order: 1 }, { id: 'M2', order: 2 }],
      subOps: [
        sub('a', 'M1'),
        sub('x', 'M2', { cycleTime: 0 }),
        sub('y', 'M2', { kind: 'input' }),
      ],
    };
    const zones = factoryZones(data);
    expect(zones.map(z => z.id)).toEqual(['M1']);
  });

  it('personCount farklı operatörleri sayar', () => {
    const data = {
      mainOps: [{ id: 'M1', order: 1 }],
      subOps: [
        sub('a', 'M1', { operatorId: 'op1' }),
        sub('b', 'M1', { operatorId: 'op1' }),
        sub('c', 'M1', { operatorId: 'op2' }),
        sub('d', 'M1'),
      ],
    };
    expect(factoryZones(data)[0].personCount).toBe(2);
  });
});

describe('serpentineRows', () => {
  const zone = (id, n) => ({ id, stations: Array.from({ length: n }, (_, i) => ({ id: `${id}${i}` })) });

  it('hedef aşılınca satır kapanır, çift satırlar reverse', () => {
    const rows = serpentineRows([zone('A', 5), zone('B', 5), zone('C', 5)], 8);
    expect(rows.map(r => r.zones.map(z => z.id))).toEqual([['A'], ['B'], ['C']]);
    expect(rows.map(r => r.reverse)).toEqual([false, true, false]);
  });

  it('küçük bölgeler aynı satırda birleşir', () => {
    const rows = serpentineRows([zone('A', 3), zone('B', 3), zone('C', 10)], 8);
    expect(rows.map(r => r.zones.map(z => z.id))).toEqual([['A', 'B'], ['C']]);
  });

  it('tek satıra sığarsa reverse olmaz', () => {
    const rows = serpentineRows([zone('A', 3), zone('B', 3)], 14);
    expect(rows).toHaveLength(1);
    expect(rows[0].reverse).toBe(false);
  });

  it('hedeften büyük tek bölge kendi satırını alır (sonsuz döngü yok)', () => {
    const rows = serpentineRows([zone('A', 20), zone('B', 2)], 8);
    expect(rows.map(r => r.zones.map(z => z.id))).toEqual([['A'], ['B']]);
  });

  it('boş liste boş döner', () => {
    expect(serpentineRows([], 8)).toEqual([]);
  });
});

describe('stationQueue / zoneInbox', () => {
  it('pending pozitifleri toplar, negatifleri saymaz', () => {
    const simState = { pending: { x: { p: 3, q: -1, r: 2 } } };
    expect(stationQueue(simState, 'x')).toBe(5);
    expect(stationQueue(simState, 'yok')).toBe(0);
  });

  it('zoneInbox grup gelen kutusunu toplar', () => {
    const simState = { groupInbox: { M2: { M1: 4, M0: -2 } } };
    expect(zoneInbox(simState, 'M2')).toBe(4);
    expect(zoneInbox(simState, 'M9')).toBe(0);
    expect(zoneInbox({}, 'M2')).toBe(0);
  });
});

describe('bottleneckStationId', () => {
  it('en yüksek zirve kuyruğu seçer, kuyruk yoksa null', () => {
    expect(bottleneckStationId({ peakQueue: { a: 2, b: 7, c: 7 } })).toBe('b');
    expect(bottleneckStationId({ peakQueue: {} })).toBe(null);
    expect(bottleneckStationId({ peakQueue: { a: 0 } })).toBe(null);
  });
});
