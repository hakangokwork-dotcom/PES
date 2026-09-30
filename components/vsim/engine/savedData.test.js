import { describe, it, expect } from 'vitest';
import { rebindItems, facilityPayload, applyFacility, productPayload, applyProduct } from './savedData.js';

const sub = (id, name, extra = {}) => ({ id, name, mainOpId: 'G', cycleTime: 30, nextIds: [], ...extra });
const item = (id, subOpId, extra = {}) => ({ id, type: 'duz', x: 0, y: 0, w: 1.2, h: 0.6, rot: 0, subOpId, ...extra });

describe('rebindItems', () => {
  it('geçerli kimlik kalır, kayıp olan adla yeni adıma bağlanır, bulunamayan çözülür', () => {
    const oldSubs = [sub('a', 'Yaka takma'), sub('b', 'Kol takma'), sub('c', 'Etiket')];
    const newSubs = [sub('a', 'Yaka takma'), sub('x', ' kol  TAKMA ')];
    const out = rebindItems([item('1', 'a'), item('2', 'b'), item('3', 'c')], newSubs, oldSubs);
    expect(out[0].subOpId).toBe('a');
    expect(out[1].subOpId).toBe('x');
    expect(out[2].subOpId).toBeUndefined();
    expect(out[2].bindName).toBe('Etiket');
  });
  it('paralel istasyon sayısı kadar yuva doldurur', () => {
    const newSubs = [sub('k', 'Kol takma', { stationCount: 2 })];
    const out = rebindItems([item('1', 'o1', { bindName: 'Kol takma' }), item('2', 'o2', { bindName: 'Kol takma' }), item('3', 'o3', { bindName: 'Kol takma' })], newSubs);
    expect(out.map(i => [i.subOpId, i.slot])).toEqual([['k', 0], ['k', 1], [undefined, undefined]]);
  });
});

describe('hat ve ürün grubu', () => {
  const data = {
    mainOps: [{ id: 'G', name: 'Montaj', nextIds: [] }],
    subOps: [sub('a', 'Yaka takma'), sub('b', 'Kol takma')],
    operators: [{ id: 'o1', name: 'Ayşe' }], machines: [],
    layouts: [{ id: 'L1', name: 'Deneme', floor: { w: 20, h: 15 }, items: [item('1', 'a'), item('2', 'b')] }],
    activeLayoutId: 'L1', settings: { netMinutes: 540 }, meta: {},
  };
  it('hat kaydı öğelere adı yazar; yüklenince etkin deneme olur ve adla bağlanır', () => {
    const p = facilityPayload(data, data.layouts[0]);
    expect(p.layout.items.map(i => i.bindName)).toEqual(['Yaka takma', 'Kol takma']);
    const other = { ...data, subOps: [sub('y', 'Yaka takma')], layouts: [], operators: [{ id: 'o2', name: 'Can' }] };
    const patch = applyFacility(other, p, { id: 7, ad: 'Bant 1' });
    expect(patch.activeLayoutId).toBe('ly_srv_7');
    const L = patch.layouts[0];
    expect(L.items[0].subOpId).toBe('y');
    expect(L.items[1].subOpId).toBeUndefined();
    expect(patch.operators.map(o => o.id).sort()).toEqual(['o1', 'o2']);
    // tekrar yüklemek aynı denemenin üzerine yazar
    const again = applyFacility({ ...other, ...patch }, p, { id: 7, ad: 'Bant 1' });
    expect(again.layouts).toHaveLength(1);
  });
  it('ürün grubu kaydı özet verir; yüklenince yerleşim yeni adımlara bağlanır', () => {
    const p = productPayload(data);
    expect(p.adimSayisi).toBe(2);
    expect(p.toplamSn).toBe(60);
    const yeni = { mainOps: [{ id: 'M', name: 'Montaj', nextIds: [] }], subOps: [sub('n1', 'Kol takma', { mainOpId: 'M' })], settings: {}, meta: {} };
    const patch = applyProduct(data, yeni, { ad: 'Polo' });
    expect(patch.subOps.map(s => s.id)).toEqual(['n1']);
    expect(patch.layouts[0].items.map(i => i.subOpId)).toEqual([undefined, 'n1']);
    expect(patch.meta.modelAdi).toBe('Polo');
  });
});
