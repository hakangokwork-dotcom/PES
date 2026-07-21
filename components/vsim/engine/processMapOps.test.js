import { describe, it, expect } from 'vitest';
import {
  createMap, MAKRO_SABLON_ADIMLARI, addNode, moveNode, renameNode, removeNode,
  connect, disconnect, addLane, renameLane, removeLane, laneForY, LANE_H,
  addTag, updateTag, removeTag, tagCounts, TAG_TYPES,
  DEFAULT_CARD, updateCard, addMetric, updateMetric, removeMetric, NODE_SHAPE_LABELS, updateNode,
} from './processMapOps.js';

describe('createMap fabrikaları', () => {
  it('akis: boş harita + start/end çekirdeği', () => {
    const m = createMap('akis', 'Test');
    expect(m.kind).toBe('akis');
    expect(m.name).toBe('Test');
    expect(m.lanes).toEqual([]);
    expect(m.nodes.map(n => n.type)).toEqual(['start', 'end']);
    expect(m.edges).toEqual([]);
    expect(m.tags).toEqual([]);
    expect(m.sketch).toEqual({ strokes: [], texts: [], shapes: [] });
  });

  it('makro: 5 büyük adım zinciri hazır (start→5 adım→end, bağlı)', () => {
    const m = createMap('makro', 'M');
    const steps = m.nodes.filter(n => n.type === 'step');
    expect(steps).toHaveLength(5);
    expect(steps.map(s => s.label)).toEqual(MAKRO_SABLON_ADIMLARI);
    expect(m.edges).toHaveLength(6);                    // start→s1→...→s5→end
  });

  it('swimlane: 3 kulvar hazır, start ilk kulvarda', () => {
    const m = createMap('swimlane', 'S');
    expect(m.lanes.map(l => l.name)).toEqual(['Kulvar 1', 'Kulvar 2', 'Kulvar 3']);
    expect(m.nodes[0].laneId).toBe(m.lanes[0].id);
  });
});

describe('düğüm işlemleri (immutable)', () => {
  const m = createMap('akis', 'T');

  it('addNode yeni harita döner, orijinal değişmez', () => {
    const m2 = addNode(m, 'step', 200, 100);
    expect(m2).not.toBe(m);
    expect(m2.nodes).toHaveLength(3);
    expect(m.nodes).toHaveLength(2);
    const n = m2.nodes[2];
    expect(n.type).toBe('step');
    expect(n.label).toBe('Yeni Adım');
    expect({ x: n.x, y: n.y }).toEqual({ x: 200, y: 100 });
  });

  it('tür bazlı varsayılan etiketler', () => {
    expect(addNode(m, 'decision', 0, 0).nodes[2].label).toBe('Karar?');
    expect(addNode(m, 'doc', 0, 0).nodes[2].label).toBe('Belge');
  });

  it('moveNode/renameNode', () => {
    let m2 = addNode(m, 'step', 10, 10);
    const id = m2.nodes[2].id;
    m2 = moveNode(m2, id, 300, 200);
    expect(m2.nodes[2]).toMatchObject({ x: 300, y: 200 });
    m2 = renameNode(m2, id, '  Kesim  ');
    expect(m2.nodes[2].label).toBe('Kesim');            // trim
    expect(renameNode(m2, id, '  ').nodes[2].label).toBe('Kesim');  // boş ad reddedilir
  });

  it('removeNode kaskad: bağlı edge ve tag\'ler de silinir', () => {
    let m2 = addNode(m, 'step', 0, 0);
    const id = m2.nodes[2].id;
    m2 = connect(m2, m2.nodes[0].id, id);
    m2 = connect(m2, id, m2.nodes[1].id);
    m2 = addTag(m2, id, 'risk', 'Tehlike');
    expect(m2.edges).toHaveLength(2);
    expect(m2.tags).toHaveLength(1);
    const m3 = removeNode(m2, id);
    expect(m3.nodes).toHaveLength(2);
    expect(m3.edges).toHaveLength(0);
    expect(m3.tags).toHaveLength(0);
  });
});

describe('bağlantı işlemleri', () => {
  let m = createMap('akis', 'T');
  const [start, end] = [m.nodes[0].id, m.nodes[1].id];

  it('connect edge ekler; aynı çift ikinci kez eklenmez; self-loop reddedilir', () => {
    m = connect(m, start, end);
    expect(m.edges).toHaveLength(1);
    expect(connect(m, start, end).edges).toHaveLength(1);
    expect(connect(m, start, start).edges).toHaveLength(1);
  });

  it('disconnect kaldırır', () => {
    expect(disconnect(m, start, end).edges).toHaveLength(0);
  });
});

describe('kulvar işlemleri', () => {
  it('addLane sona ekler; removeLane düğümleri kulvarsız bırakır (silmez)', () => {
    let m = createMap('swimlane', 'S');
    m = addLane(m, 'Kalite');
    expect(m.lanes).toHaveLength(4);
    expect(m.lanes[3].name).toBe('Kalite');
    const firstLane = m.lanes[0].id;
    const m2 = removeLane(m, firstLane);
    expect(m2.lanes).toHaveLength(3);
    expect(m2.nodes[0].laneId).toBeNull();              // start ilk kulvardaydı
  });

  it('laneForY: y konumundan kulvar bulur (LANE_H şeritleri)', () => {
    const m = createMap('swimlane', 'S');
    expect(laneForY(m, LANE_H * 0.5)).toBe(m.lanes[0].id);
    expect(laneForY(m, LANE_H * 1.5)).toBe(m.lanes[1].id);
    expect(laneForY(m, LANE_H * 99)).toBe(m.lanes[2].id);   // taşma → son kulvar
    expect(laneForY(createMap('akis', 'A'), 50)).toBeNull(); // kulvarsız harita
  });
});

describe('etiket işlemleri', () => {
  let m = createMap('akis', 'T');
  const nid = m.nodes[0].id;

  it('TAG_TYPES beş tür tanımlar', () => {
    expect(Object.keys(TAG_TYPES)).toEqual(['risk', 'problem', 'firsat', 'iyilestirme', 'not']);
  });

  it('addTag/updateTag/removeTag + tagCounts', () => {
    m = addTag(m, nid, 'risk', 'Gecikme riski', 'Tedarik belirsiz', 'yuksek');
    m = addTag(m, nid, 'firsat', 'Otomasyon');
    expect(m.tags).toHaveLength(2);
    expect(m.tags[0]).toMatchObject({ type: 'risk', severity: 'yuksek', note: 'Tedarik belirsiz' });
    expect(m.tags[1].severity).toBeNull();
    expect(tagCounts(m, nid)).toEqual({ risk: 1, problem: 0, firsat: 1, iyilestirme: 0, not: 0 });
    m = updateTag(m, m.tags[0].id, { severity: 'orta', title: 'Gecikme' });
    expect(m.tags[0]).toMatchObject({ severity: 'orta', title: 'Gecikme' });
    m = removeTag(m, m.tags[0].id);
    expect(m.tags).toHaveLength(1);
  });

  it('boş başlıklı etiket eklenmez', () => {
    expect(addTag(m, nid, 'not', '  ').tags).toHaveLength(m.tags.length);
  });
});

describe('süreç kartı', () => {
  it('createMap boş kartla gelir', () => {
    const m = createMap('akis', 'T');
    expect(m.card).toEqual(DEFAULT_CARD);
    expect(m.card.metrikler).toEqual([]);
    expect(m.card.girdiler).toEqual([]);
  });

  it('updateCard alanları yamalar (immutable)', () => {
    const m = createMap('akis', 'T');
    const m2 = updateCard(m, { sahip: 'Grup Müdürü', girdiler: ['Sipariş'] });
    expect(m2).not.toBe(m);
    expect(m2.card.sahip).toBe('Grup Müdürü');
    expect(m2.card.girdiler).toEqual(['Sipariş']);
    expect(m.card.sahip).toBe('');
  });

  it('metrik ekle/güncelle/sil', () => {
    let m = createMap('akis', 'T');
    m = addMetric(m, 'Zamanında Teslim %', 95, '%');
    expect(m.card.metrikler).toHaveLength(1);
    expect(m.card.metrikler[0]).toMatchObject({ ad: 'Zamanında Teslim %', hedef: 95, birim: '%' });
    const id = m.card.metrikler[0].id;
    m = updateMetric(m, id, { hedef: 98 });
    expect(m.card.metrikler[0].hedef).toBe(98);
    m = removeMetric(m, id);
    expect(m.card.metrikler).toEqual([]);
  });

  it('boş adlı metrik eklenmez', () => {
    const m = addMetric(createMap('akis', 'T'), '  ', 0, '');
    expect(m.card.metrikler).toEqual([]);
  });
});

describe('düğüm owner/desc + subprocess', () => {
  it('addNode subprocess türü + owner/desc boş başlar', () => {
    const m = addNode(createMap('akis', 'T'), 'subprocess', 0, 0);
    const n = m.nodes[2];
    expect(n.type).toBe('subprocess');
    expect(n.label).toBe('Alt Süreç');
    expect(n.owner).toBe('');
    expect(n.desc).toBe('');
  });

  it('updateNode owner/desc yamalar', () => {
    let m = addNode(createMap('akis', 'T'), 'step', 0, 0);
    const id = m.nodes[2].id;
    m = updateNode(m, id, { owner: 'Depo Personeli', desc: 'El terminaliyle okutulur' });
    expect(m.nodes[2]).toMatchObject({ owner: 'Depo Personeli', desc: 'El terminaliyle okutulur' });
  });

  it('NODE_SHAPE_LABELS tüm türler için Türkçe etiket', () => {
    expect(NODE_SHAPE_LABELS.subprocess).toBe('III. Seviye');
    expect(NODE_SHAPE_LABELS.decision).toBe('Karar');
    expect(NODE_SHAPE_LABELS.doc).toBe('Doküman');
  });
});
