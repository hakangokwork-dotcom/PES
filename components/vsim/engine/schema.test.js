import { describe, it, expect } from 'vitest';
import { validateV4 } from './schema.js';
import { migrateData } from './migrate.js';

const GOOD = migrateData({
  schemaVersion: 4, domainId: 'textile',
  mainOps: [{ id: 'a', name: 'A', nextIds: [], x: 0, y: 0, color: '#000', order: 0 }],
  subOps: [{ id: 's', mainOpId: 'a', name: 'S', cycleTime: 30, nextIds: [] }],
  machines: [], operators: [],
  settings: { netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 },
  scenarios: [], meta: {}, edges: [], infoNodes: [], infoEdges: [], kaizens: [],
});

describe('validateV4', () => {
  it('geçerli v4 verisi geçer', () => {
    expect(validateV4(GOOD)).toEqual({ ok: true, errors: [] });
  });

  it('null/dizi/ilkel reddedilir', () => {
    expect(validateV4(null).ok).toBe(false);
    expect(validateV4([]).ok).toBe(false);
    expect(validateV4('x').ok).toBe(false);
  });

  it('mainOps dizi değilse hata', () => {
    const r = validateV4({ ...GOOD, mainOps: 'bozuk' });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('mainOps'))).toBe(true);
  });

  it('mainOp id\'siz / nextIds dizi-değil reddedilir', () => {
    expect(validateV4({ ...GOOD, mainOps: [{ name: 'X' }] }).ok).toBe(false);
    expect(validateV4({ ...GOOD, mainOps: [{ id: 'a', nextIds: 'b' }] }).ok).toBe(false);
  });

  it('subOp cycleTime sayı-değilse hata; null/eksik SERBEST (opsiyonel)', () => {
    expect(validateV4({ ...GOOD, subOps: [{ id: 's', mainOpId: 'a', cycleTime: 'hızlı' }] }).ok).toBe(false);
    expect(validateV4({ ...GOOD, subOps: [{ id: 's', mainOpId: 'a' }] }).ok).toBe(true);
  });

  it('settings sayısal alanları tip-kontrollü', () => {
    expect(validateV4({ ...GOOD, settings: { ...GOOD.settings, demand: 'çok' } }).ok).toBe(false);
  });

  it('scenarios/edges/info*/kaizens dizi olmalı', () => {
    for (const k of ['scenarios', 'edges', 'infoNodes', 'infoEdges', 'kaizens']) {
      expect(validateV4({ ...GOOD, [k]: {} }).ok, k).toBe(false);
    }
  });

  it('bilinmeyen ekstra alanlar SERBEST (ileri sürüm toleransı)', () => {
    expect(validateV4({ ...GOOD, futureField: 123 }).ok).toBe(true);
  });

  it('geçerli processMaps geçer', () => {
    const pm = {
      id: 'pm_1', name: 'Sipariş Süreci', kind: 'akis',
      lanes: [], nodes: [{ id: 'nd_1', type: 'start', label: 'Başlangıç', x: 0, y: 0, laneId: null }],
      edges: [], tags: [],
    };
    expect(validateV4({ ...GOOD, processMaps: [pm] }).ok).toBe(true);
  });

  it('processMaps dizi değilse hata', () => {
    const r = validateV4({ ...GOOD, processMaps: {} });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('processMaps'))).toBe(true);
  });

  it('geçerli sketch geçer', () => {
    const pm = {
      id: 'pm_1', name: 'Sipariş Süreci', kind: 'akis',
      lanes: [], nodes: [], edges: [], tags: [],
      sketch: {
        strokes: [{ id: 'st_1', color: '#000', width: 3, opacity: 1, points: [[0, 0], [5, 5]] }],
        texts: [{ id: 'tx_1', x: 10, y: 10, text: 'Not', color: '#000' }],
      },
    };
    expect(validateV4({ ...GOOD, processMaps: [pm] }).ok).toBe(true);
  });

  it('geçerli sketch.shapes dizisi geçer', () => {
    const pm = {
      id: 'pm_1', name: 'Sipariş Süreci', kind: 'akis',
      lanes: [], nodes: [], edges: [], tags: [],
      sketch: {
        strokes: [], texts: [],
        shapes: [{ id: 'sh_1', type: 'rect', x1: 0, y1: 0, x2: 40, y2: 40, color: '#000', width: 2 }],
      },
    };
    expect(validateV4({ ...GOOD, processMaps: [pm] }).ok).toBe(true);
  });

  it('sketch.shapes dizi değilse (obje) reddedilir', () => {
    const pm = {
      id: 'pm_1', name: 'Sipariş Süreci', kind: 'akis',
      lanes: [], nodes: [], edges: [], tags: [],
      sketch: { strokes: [], texts: [], shapes: {} },
    };
    const r = validateV4({ ...GOOD, processMaps: [pm] });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('sketch'))).toBe(true);
  });

  it('geçerli sketch.stickies/stamps dizileri geçer', () => {
    const pm = {
      id: 'pm_1', name: 'Sipariş Süreci', kind: 'akis',
      lanes: [], nodes: [], edges: [], tags: [],
      sketch: {
        strokes: [], texts: [],
        stickies: [{ id: 'sr_1', x: 0, y: 0, w: 168, h: 168, text: 'Not', color: '#FEF08A' }],
        stamps: [{ id: 'sp_1', x: 5, y: 5, emoji: '👍', size: 40 }],
      },
    };
    expect(validateV4({ ...GOOD, processMaps: [pm] }).ok).toBe(true);
  });

  it('sketch.stickies dizi değilse (obje) reddedilir', () => {
    const pm = {
      id: 'pm_1', name: 'Sipariş Süreci', kind: 'akis',
      lanes: [], nodes: [], edges: [], tags: [],
      sketch: { strokes: [], texts: [], stickies: {} },
    };
    const r = validateV4({ ...GOOD, processMaps: [pm] });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('sketch'))).toBe(true);
  });

  it('sketch.stamps dizi değilse (obje) reddedilir', () => {
    const pm = {
      id: 'pm_1', name: 'Sipariş Süreci', kind: 'akis',
      lanes: [], nodes: [], edges: [], tags: [],
      sketch: { strokes: [], texts: [], stamps: {} },
    };
    const r = validateV4({ ...GOOD, processMaps: [pm] });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('sketch'))).toBe(true);
  });

  it('geçerli sketch.comments dizisi geçer', () => {
    const pm = {
      id: 'pm_1', name: 'Sipariş Süreci', kind: 'akis',
      lanes: [], nodes: [], edges: [], tags: [],
      sketch: {
        strokes: [], texts: [],
        comments: [{ id: 'cm_1', x: 5, y: 5, text: 'Not', done: false }],
      },
    };
    expect(validateV4({ ...GOOD, processMaps: [pm] }).ok).toBe(true);
  });

  it('sketch.comments dizi değilse (obje) reddedilir', () => {
    const pm = {
      id: 'pm_1', name: 'Sipariş Süreci', kind: 'akis',
      lanes: [], nodes: [], edges: [], tags: [],
      sketch: { strokes: [], texts: [], comments: {} },
    };
    const r = validateV4({ ...GOOD, processMaps: [pm] });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('sketch'))).toBe(true);
  });

  it('sketch.strokes dizi değilse reddedilir', () => {
    const pm = {
      id: 'pm_1', name: 'Sipariş Süreci', kind: 'akis',
      lanes: [], nodes: [], edges: [], tags: [],
      sketch: { strokes: {}, texts: [] },
    };
    const r = validateV4({ ...GOOD, processMaps: [pm] });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('sketch'))).toBe(true);
  });

  it('processMap node.x string ise reddedilir', () => {
    const pm = {
      id: 'pm_1', name: 'S', kind: 'akis',
      lanes: [], nodes: [{ id: 'nd_1', type: 'start', label: 'Başlangıç', x: 'sıfır', y: 0, laneId: null }],
      edges: [], tags: [],
    };
    expect(validateV4({ ...GOOD, processMaps: [pm] }).ok).toBe(false);
  });

  it('şablon seed doğrulaması: validateV4({...seed sarmalanmış}) deseniyle kullanılabilir', () => {
    // importUserTpl entegrasyon sözleşmesi: seed alanları aynı kurallarla kontrol edilir
    const r = validateV4({ ...GOOD, mainOps: [{ id: 1 }] });   // id string olmalı
    expect(r.ok).toBe(false);
  });

  it('geçerli süreç kartı geçer', () => {
    const pm = {
      id: 'pm_1', name: 'Sipariş Süreci', kind: 'akis',
      lanes: [], nodes: [{ id: 'nd_1', type: 'start', label: 'Başlangıç', x: 0, y: 0, laneId: null, owner: 'Depo', desc: 'Açıklama' }],
      edges: [], tags: [],
      card: { kod: 'K1', sahip: 'Grup Müdürü', metrikler: [{ id: 'mt_1', ad: 'Zamanında Teslim %', hedef: 95, birim: '%' }] },
    };
    expect(validateV4({ ...GOOD, processMaps: [pm] }).ok).toBe(true);
  });

  it('card.metrikler dizi değilse reddedilir', () => {
    const pm = {
      id: 'pm_1', name: 'S', kind: 'akis',
      lanes: [], nodes: [], edges: [], tags: [],
      card: { metrikler: {} },
    };
    expect(validateV4({ ...GOOD, processMaps: [pm] }).ok).toBe(false);
  });

  it('node.owner sayı ise reddedilir', () => {
    const pm = {
      id: 'pm_1', name: 'S', kind: 'akis',
      lanes: [], nodes: [{ id: 'nd_1', type: 'start', label: 'Başlangıç', x: 0, y: 0, laneId: null, owner: 5 }],
      edges: [], tags: [],
    };
    expect(validateV4({ ...GOOD, processMaps: [pm] }).ok).toBe(false);
  });
});
