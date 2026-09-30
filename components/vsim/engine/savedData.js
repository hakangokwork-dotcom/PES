/* Atölye kayıtları (sunucu) ↔ VSIM verisi — saf dönüşümler, UI'sız.
   İki ayrı kayıt:
     HAT / TESİS   = yerleşim (zemin, öğeler, taşıma/giriş/tohum) + çalışanlar + makineler
     ÜRÜN GRUBU    = süreç (mainOps, subOps, ayarlar, meta)
   Hat ile ürün grubu bağımsız saklanır; biri yüklenince yerleşimdeki makineler
   yeni sürecin adımlarına OPERASYON ADIYLA yeniden bağlanır (rebind). */

import { deriveEdges } from './migrate.js';

const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

export const activeLayoutOf = (d) => (d.layouts || []).find(l => l.id === d.activeLayoutId) || (d.layouts || [])[0] || null;

/* Öğeleri verilen sürecin adımlarına bağla. Kimliği hâlâ geçerli olan kalır;
   değilse öğedeki bindName (ya da eski sürecteki ad) ile eşleşen adıma geçer;
   bulunamazsa bağ kalkar (öğe "bağlı değil" olur, adı bindName'de saklı kalır). */
export function rebindItems(items, subOps, oldSubOps = []) {
  const ids = new Set((subOps || []).map(s => s.id));
  const oldById = new Map((oldSubOps || []).map(s => [s.id, s]));
  const byName = new Map();
  for (const s of subOps || []) {
    const k = norm(s.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(s);
  }
  const used = new Map();          // subOpId → kullanılan yuva sayısı
  const out = (items || []).map(it => {
    if (!it.subOpId) return it;
    if (ids.has(it.subOpId)) { used.set(it.subOpId, (used.get(it.subOpId) || 0) + 1); return it; }
    return { ...it, __pending: true };
  });
  return out.map(it => {
    if (!it.__pending) return it;
    const { __pending, ...rest } = it;
    const name = rest.bindName || oldById.get(rest.subOpId)?.name;
    const cands = byName.get(norm(name)) || [];
    const hit = cands.find(s => (used.get(s.id) || 0) < Math.max(1, Math.round(s.stationCount || 1))) || null;
    if (!hit) { const { subOpId, slot, ...unbound } = rest; return { ...unbound, bindName: name || rest.bindName }; }
    const slot = used.get(hit.id) || 0;
    used.set(hit.id, slot + 1);
    return { ...rest, subOpId: hit.id, slot, bindName: hit.name };
  });
}

/* ---------- HAT / TESİS ---------- */
export function facilityPayload(data, layout) {
  const subById = new Map((data.subOps || []).map(s => [s.id, s]));
  const items = (layout?.items || []).map(it => (it.subOpId && subById.get(it.subOpId)
    ? { ...it, bindName: subById.get(it.subOpId).name }
    : it));
  return {
    layout: clone({ floor: layout?.floor, items, transport: layout?.transport, release: layout?.release, seed: layout?.seed }),
    operators: clone(data.operators || []),
    machines: clone(data.machines || []),
  };
}

/* Sunucudaki hattı veriye uygula: aynı kayıttan gelen yerleşim varsa üzerine
   yazılır, yoksa yeni deneme olarak eklenip etkin yapılır. Çalışan/makine
   listeleri kimliğe göre birleşir (mevcutlar korunur). Döner: veri yaması. */
export function applyFacility(data, veri, { id, ad }) {
  const lid = `ly_srv_${id}`;
  const L = veri?.layout || {};
  const items = rebindItems(L.items || [], data.subOps || []);
  const layout = { id: lid, name: ad, floor: L.floor || { w: 20, h: 15 }, items, transport: L.transport, release: L.release, seed: L.seed, serverId: id };
  const layouts = (data.layouts || []).some(l => l.id === lid)
    ? data.layouts.map(l => (l.id === lid ? layout : l))
    : [...(data.layouts || []), layout];
  const unionById = (a, b) => {
    const m = new Map((a || []).map(x => [x.id, x]));
    for (const x of b || []) if (!m.has(x.id)) m.set(x.id, x);
    return [...m.values()];
  };
  return {
    layouts, activeLayoutId: lid,
    operators: unionById(data.operators, veri?.operators),
    machines: unionById(data.machines, veri?.machines),
  };
}

/* ---------- ÜRÜN GRUBU ---------- */
export function productPayload(data) {
  const subOps = data.subOps || [];
  const leafSn = subOps.filter(s => !subOps.some(x => (x.parentId ?? x.mainOpId) === s.id) && s.kind !== 'input' && s.kind !== 'output')
    .reduce((a, s) => a + (Number(s.cycleTime) || 0), 0);
  return {
    veri: clone({ mainOps: data.mainOps || [], subOps, settings: data.settings || {}, meta: data.meta || {} }),
    adimSayisi: subOps.filter(s => s.kind !== 'input' && s.kind !== 'output').length,
    toplamSn: Math.round(leafSn * 10) / 10,
  };
}

/* Ürün grubunun sürecini yükle; tüm denemelerdeki makineler yeni adımlara
   adla yeniden bağlanır. Döner: veri yaması. */
export function applyProduct(data, veri, { ad } = {}) {
  const mainOps = clone(veri?.mainOps || []);
  const subOps = clone(veri?.subOps || []);
  const layouts = (data.layouts || []).map(l => ({ ...l, items: rebindItems(l.items || [], subOps, data.subOps || []) }));
  return {
    mainOps, subOps, layouts,
    settings: { ...(data.settings || {}), ...(veri?.settings || {}) },
    meta: { ...(veri?.meta || {}), modelAdi: ad || veri?.meta?.modelAdi || data.meta?.modelAdi },
    edges: deriveEdges({ mainOps, edges: [] }),
  };
}
