/* Atölye yerleşimi (Yerleşim sekmesi) — saf fonksiyonlar, UI'sız.
   Süreç (mainOps/subOps) BİR KEZ tanımlanır; yerleşim onun üstüne kurulan ayrı
   bir katmandır: data.layouts = [{ id, name, floor:{w,h}, items:[...] }],
   data.activeLayoutId. Aynı süreçle birden çok yerleşim denemesi yapılabilir.

   Birim: METRE. Öğe (item) koordinatı = sol-üst köşe, rot = 0|90|180|270.
   Makine/tezgâh öğesi bir yaprak alt-operasyona bağlanabilir (subOpId + slot);
   slot, stationCount>1 olan operasyonun kaçıncı paralel istasyonu olduğunu söyler. */

import { uid, childNodes, isPassthrough, rootMainId } from './flow.js';

/* Sembol kataloğu. w×h = tabla/gövde ölçüsü (m). op: operatör alanı derinliği
   (m, rot=0'da gövdenin ALTINDA) — 0 ise operatörsüz öğe. */
export const SYMBOLS = {
  duz:    { kind: 'machine', name: 'Düz makine',      w: 1.2, h: 0.6, op: 0.7, seat: true },
  ov:     { kind: 'machine', name: 'Overlok',         w: 1.0, h: 0.6, op: 0.7, seat: true },
  rc:     { kind: 'machine', name: 'Reçme',           w: 1.2, h: 0.6, op: 0.7, seat: true },
  kl:     { kind: 'machine', name: 'Kollu',           w: 0.9, h: 0.6, op: 0.7, seat: true },
  il:     { kind: 'machine', name: 'İlik / düğme',    w: 1.2, h: 0.6, op: 0.7, seat: true },
  oto:    { kind: 'machine', name: 'Otomat / punterez', w: 1.2, h: 0.7, op: 0.7, seat: true },
  utu:    { kind: 'table',   name: 'Ütü masası',      w: 1.5, h: 0.5, op: 0.7, seat: false },
  kt:     { kind: 'table',   name: 'Kontrol tezgâhı', w: 1.8, h: 0.8, op: 0.7, seat: false },
  pk:     { kind: 'table',   name: 'Paket tezgâhı',   w: 1.9, h: 0.8, op: 0.7, seat: false },
  kesim:  { kind: 'table',   name: 'Kesim masası',    w: 6.0, h: 1.8, op: 0.7, seat: false },
  masa:   { kind: 'table',   name: 'El işi masası',   w: 1.2, h: 0.7, op: 0.7, seat: true },   // makinesiz: etiket, iplik temizleme, elde kontrol
  calisan:{ kind: 'person',  name: 'Serbest çalışan', w: 0.6, h: 0.6, op: 0 },              // meydancı, taşıyıcı, ütücü…
  raf:    { kind: 'buffer',  name: 'Ara stok alanı',  w: 1.5, h: 1.0, op: 0 },
  araba:  { kind: 'buffer',  name: 'Demet arabası',   w: 0.8, h: 0.5, op: 0 },
  palet:  { kind: 'buffer',  name: 'Palet',           w: 1.2, h: 1.0, op: 0 },
  bant:   { kind: 'belt',    name: 'Taşıma bandı',    w: 6.0, h: 0.35, op: 0 },
  koridor:{ kind: 'aisle',   name: 'Koridor',         w: 6.0, h: 1.2, op: 0 },
  kolon:  { kind: 'column',  name: 'Kolon',           w: 0.4, h: 0.4, op: 0 },
};

export const MIN_AISLE_M = 1.2;          // asgari koridor genişliği
export const SNAP_M = 0.25;              // varsayılan ızgara adımı
export const DEFAULT_FLOOR = { w: 20, h: 15 };

export const snap = (v, step = SNAP_M) => Math.round(v / step) * step;
const r2 = (v) => Math.round(v * 100) / 100;

/* ---------- süreçten sembol türü ---------- */
const RESOURCE_SYMBOL = {
  'düz dikiş': 'duz', 'overlok': 'ov', 'reçme': 'rc', 'punterez': 'oto',
  'otomat': 'oto', 'ütü': 'utu', 'kesim': 'kesim',
};
const OPTYPE_SYMBOL = {
  'DİKİM': 'duz', 'OVERLOK': 'ov', 'ÇİMA': 'duz', 'REÇME': 'rc', 'PUNTEREZ': 'oto',
  'OTOMAT': 'oto', 'ÜTÜ': 'utu', 'KESİM': 'kesim', 'KONTROL': 'kt', 'TEMİZLİK': 'masa',
  'AKSESUAR': 'masa', 'DESTEK': 'masa',
};
export function symbolForSubOp(subOp, machines = []) {
  const name = (subOp?.name || '').toLocaleLowerCase('tr');
  if (/ilik|düğme/.test(name)) return 'il';
  if (/paket|koli/.test(name)) return 'pk';
  const m = machines.find(x => x.id === subOp?.machineId);
  const byRes = m && RESOURCE_SYMBOL[(m.type || '').toLocaleLowerCase('tr')];
  if (byRes) return byRes;
  if (/kollu/.test(name)) return 'kl';
  // Makine atanmamış el işleri: masada yapılır (kalite kontrol ayakta tezgâhta)
  if (/kontrol|kalite/.test(name)) return 'kt';
  if (/etiket|iplik|temizl|katla|ayıkla|işaretle|el ile|elde/.test(name)) return 'masa';
  return OPTYPE_SYMBOL[subOp?.type] || 'duz';
}

/* ---------- öğe geometrisi ---------- */
/* Döndürülmüş gövde kutusu + operatör alanı dahil ayak izi. */
export function itemRect(it) {
  const vertical = it.rot === 90 || it.rot === 270;
  return vertical ? { x: it.x, y: it.y, w: it.h, h: it.w } : { x: it.x, y: it.y, w: it.w, h: it.h };
}
export function itemFootprint(it) {
  const s = SYMBOLS[it.type];
  const op = it.subOpId || s?.kind === 'table' || s?.kind === 'machine' ? (s?.op || 0) : 0;
  const b = itemRect(it);
  let f;
  switch (it.rot || 0) {
    case 180: f = { ...b, y: b.y - op, h: b.h + op }; break;
    case 90:  f = { ...b, x: b.x - op, w: b.w + op }; break;
    case 270: f = { ...b, w: b.w + op }; break;
    default:  f = { ...b, h: b.h + op };
  }
  return { x: r2(f.x), y: r2(f.y), w: r2(f.w), h: r2(f.h) };
}
export const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const overlap = (a, b, eps = 0.01) =>
  a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;

export function createItem(type, x, y, extra = {}) {
  const s = SYMBOLS[type] || SYMBOLS.duz;
  const it = { id: `li_${uid()}`, type, x: r2(x), y: r2(y), w: s.w, h: s.h, rot: 0, ...extra };
  if (s.kind === 'buffer' && it.capacity == null) it.capacity = type === 'araba' ? 10 : 60;
  return it;
}

export function newLayout(name = 'Deneme 1', floor = DEFAULT_FLOOR) {
  return { id: `ly_${uid()}`, name, floor: { ...floor }, items: [] };
}

/* ---------- süreç → istasyon ve akış ---------- */
const isLeaf = (d, s) => childNodes(d, s.id).length === 0 && !isPassthrough(s);

/* Yerleştirilebilir istasyon yuvaları: her yaprak alt-op × stationCount. */
export function stationSlots(data) {
  const d = { mainOps: data.mainOps || [], subOps: data.subOps || [] };
  const byMain = new Map(d.mainOps.map(m => [m.id, m]));
  const out = [];
  for (const s of d.subOps) {
    if (!isLeaf(d, s) || !((s.cycleTime || 0) > 0)) continue;
    const g = rootMainId(d, s.id);
    const n = Math.max(1, Math.round(s.stationCount || 1));
    for (let k = 0; k < n; k++) {
      out.push({ subOpId: s.id, slot: k, name: s.name || s.id, groupId: g, groupName: byMain.get(g)?.name || '', color: byMain.get(g)?.color || '#64748b', subOp: s });
    }
  }
  return out;
}

/* Yaprak düzeyinde akış kenarları. Konteyner (ana-op ya da alt-op) kenarı
   çıkış yapraklarından giriş yapraklarına açılır; input/output düğümleri
   geçirgendir. Döner: [{ from, to, key }] (tekrarsız). */
export function leafFlowEdges(data) {
  const d = { mainOps: data.mainOps || [], subOps: data.subOps || [] };
  const all = [...d.mainOps, ...d.subOps];
  const byId = new Map(all.map(n => [n.id, n]));
  const parentOf = (n) => (d.mainOps.includes(n) ? '__root__' : (n.parentId ?? n.mainOpId));
  const siblings = (n) => all.filter(x => parentOf(x) === parentOf(n));
  const kids = (id) => d.subOps.filter(s => (s.parentId ?? s.mainOpId) === id);

  const memoIn = new Map(), memoOut = new Map();
  function entry(id, seen = new Set()) {
    if (memoIn.has(id)) return memoIn.get(id);
    if (seen.has(id)) return [];
    seen.add(id);
    const n = byId.get(id);
    let res = [];
    if (!n) res = [];
    else if (isPassthrough(n)) res = (n.nextIds || []).flatMap(x => entry(x, seen));
    else {
      const ch = kids(id);
      if (ch.length === 0) res = d.mainOps.includes(n) ? [] : [id];
      else {
        const targeted = new Set(ch.flatMap(c => c.nextIds || []));
        res = ch.filter(c => !targeted.has(c.id)).flatMap(c => entry(c.id, seen));
      }
    }
    res = [...new Set(res)];
    memoIn.set(id, res);
    return res;
  }
  function exit(id, seen = new Set()) {
    if (memoOut.has(id)) return memoOut.get(id);
    if (seen.has(id)) return [];
    seen.add(id);
    const n = byId.get(id);
    let res = [];
    if (!n) res = [];
    else if (isPassthrough(n)) res = siblings(n).filter(x => (x.nextIds || []).includes(id)).flatMap(x => exit(x.id, seen));
    else {
      const ch = kids(id);
      if (ch.length === 0) res = d.mainOps.includes(n) ? [] : [id];
      else {
        const ids = new Set(ch.map(c => c.id));
        res = ch.filter(c => !(c.nextIds || []).some(x => ids.has(x))).flatMap(c => exit(c.id, seen));
      }
    }
    res = [...new Set(res)];
    memoOut.set(id, res);
    return res;
  }

  const edges = new Map();
  for (const n of all) {
    if (isPassthrough(n)) continue;
    for (const m of (n.nextIds || [])) {
      for (const a of exit(n.id)) for (const b of entry(m)) {
        if (a === b) continue;
        const key = `${a}>${b}`;
        if (!edges.has(key)) edges.set(key, { from: a, to: b, key });
      }
    }
  }
  return [...edges.values()];
}

/* ---------- rota geometrisi ---------- */
/* İki nokta arası dik (L) yol: önce yatay, sonra dikey. */
export const lPath = (a, b) => (a.x === b.x || a.y === b.y) ? [a, b] : [a, { x: b.x, y: a.y }, b];
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function segCross(p1, p2, p3, p4) {
  // Yalnız dik segmentler: biri yatay biri dikey ise kesişme; paralel çakışmayı saymayız.
  const h1 = p1.y === p2.y, h2 = p3.y === p4.y;
  if (h1 === h2) return false;
  const [H1, H2, V1, V2] = h1 ? [p1, p2, p3, p4] : [p3, p4, p1, p2];
  const x = V1.x, y = H1.y;
  const inH = x > Math.min(H1.x, H2.x) + 1e-6 && x < Math.max(H1.x, H2.x) - 1e-6;
  const inV = y > Math.min(V1.y, V2.y) + 1e-6 && y < Math.max(V1.y, V2.y) - 1e-6;
  return inH && inV;
}
export function countCrossings(paths) {
  let n = 0;
  const pts = [];
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      const A = paths[i], B = paths[j];
      for (let a = 0; a < A.length - 1; a++) for (let b = 0; b < B.length - 1; b++) {
        if (segCross(A[a], A[a + 1], B[b], B[b + 1])) {
          n++;
          const h = A[a].y === A[a + 1].y;
          pts.push(h ? { x: B[b].x, y: A[a].y } : { x: A[a].x, y: B[b].y });
        }
      }
    }
  }
  return { count: n, points: pts };
}

/* ---------- karne ---------- */
export function layoutMetrics(data, layout) {
  const items = layout?.items || [];
  const floor = layout?.floor || DEFAULT_FLOOR;
  const slots = stationSlots(data);
  const subById = new Map((data.subOps || []).map(s => [s.id, s]));
  const mainById = new Map((data.mainOps || []).map(m => [m.id, m]));

  // istasyon → yerleşik öğeler (paralel istasyonlar birden çok öğe olabilir)
  const placedBySub = new Map();
  for (const it of items) {
    if (!it.subOpId || !subById.has(it.subOpId)) continue;
    if (!placedBySub.has(it.subOpId)) placedBySub.set(it.subOpId, []);
    placedBySub.get(it.subOpId).push(it);
  }
  const placedKeys = new Set(items.filter(i => i.subOpId).map(i => `${i.subOpId}#${i.slot || 0}`));
  const unplaced = slots.filter(s => !placedKeys.has(`${s.subOpId}#${s.slot}`));

  const pointOf = (subId) => {
    const its = placedBySub.get(subId);
    if (!its || its.length === 0) return null;
    // paralel istasyonların ortalama merkezi — rota tek çizgi olarak görünür
    const cs = its.map(i => center(itemRect(i)));
    return { x: r2(cs.reduce((a, c) => a + c.x, 0) / cs.length), y: r2(cs.reduce((a, c) => a + c.y, 0) / cs.length) };
  };
  const buffers = items.filter(i => SYMBOLS[i.type]?.kind === 'buffer');
  const viaOf = (key) => buffers.find(b => (b.routeKeys || []).includes(key)) || null;

  const edges = leafFlowEdges(data);
  const routes = [];
  const incomingGroups = new Map();
  for (const e of edges) {
    const a = pointOf(e.from), b = pointOf(e.to);
    const g = rootMainId(data, e.from);
    const gTo = rootMainId(data, e.to);
    if (!incomingGroups.has(e.to)) incomingGroups.set(e.to, new Set());
    incomingGroups.get(e.to).add(g);
    if (!a || !b) continue;
    const via = viaOf(e.key);
    let path, dist;
    if (via) {
      const v = center(itemRect(via));
      const p1 = lPath(a, v), p2 = lPath(v, b);
      path = [...p1, ...p2.slice(1)];
      dist = manhattan(a, v) + manhattan(v, b);
    } else {
      path = lPath(a, b);
      dist = manhattan(a, b);
    }
    routes.push({
      key: e.key, from: e.from, to: e.to, groupId: g, crossGroup: g !== gTo,
      color: mainById.get(g)?.color || '#64748b', path, dist: r2(dist), viaId: via?.id || null,
    });
  }

  // parça (kök grup) başına yol — bir adet için o grubun tüm kenarları
  const perGroup = [];
  for (const m of (data.mainOps || [])) {
    const rs = routes.filter(r => r.groupId === m.id);
    if (rs.length === 0) continue;
    perGroup.push({ id: m.id, name: m.name || m.id, color: m.color || '#64748b', dist: r2(rs.reduce((a, r) => a + r.dist, 0)) });
  }
  const totalDist = r2(routes.reduce((a, r) => a + r.dist, 0));
  const crossings = countCrossings(routes.map(r => r.path));

  // birleşme noktaları: farklı gruplardan beslenen istasyonlar
  const merges = [];
  for (const [subId, gs] of incomingGroups) {
    if (gs.size < 2) continue;
    const p = pointOf(subId);
    if (p) merges.push({ subOpId: subId, name: subById.get(subId)?.name || subId, point: p, groups: [...gs] });
  }

  // alan: katı öğelerin sınır kutusu
  const solids = items.filter(i => ['machine', 'table', 'buffer', 'belt', 'column', 'person'].includes(SYMBOLS[i.type]?.kind));
  let usedArea = 0;
  if (solids.length) {
    const fps = solids.map(itemFootprint);
    const x0 = Math.min(...fps.map(f => f.x)), y0 = Math.min(...fps.map(f => f.y));
    const x1 = Math.max(...fps.map(f => f.x + f.w)), y1 = Math.max(...fps.map(f => f.y + f.h));
    usedArea = r2((x1 - x0) * (y1 - y0));
  }
  const operatorIds = new Set();
  const opItems = new Map();
  for (const it of items) {
    const s = it.subOpId && subById.get(it.subOpId);
    if (s?.operatorId) {
      operatorIds.add(s.operatorId);
      if (!opItems.has(s.operatorId)) opItems.set(s.operatorId, []);
      opItems.get(s.operatorId).push(it.id);
    }
  }
  // Paylaşımlı operatör (meydancı): aynı kişi FARKLI operasyonlarda. Aynı operasyonun
  // paralel istasyonları (stationCount>1) meydancı sayılmaz.
  const itemSub = new Map(items.map(i => [i.id, i.subOpId]));
  const freeWorkers = items.filter(i => SYMBOLS[i.type]?.kind === 'person').length;
  const shared = [...opItems].filter(([, ids]) => new Set(ids.map(id => itemSub.get(id))).size > 1).map(([operatorId, itemIds]) => ({ operatorId, itemIds }));
  const bufferCapacity = buffers.reduce((a, b) => a + (Number(b.capacity) || 0), 0);

  // uyarılar
  const warnings = [];
  const fp = new Map(items.map(i => [i.id, itemFootprint(i)]));
  const solidKinds = new Set(['machine', 'table', 'buffer', 'column']);
  const solidItems = items.filter(i => solidKinds.has(SYMBOLS[i.type]?.kind));
  for (let i = 0; i < solidItems.length; i++) {
    for (let j = i + 1; j < solidItems.length; j++) {
      if (overlap(fp.get(solidItems[i].id), fp.get(solidItems[j].id))) {
        warnings.push({ tone: 'danger', code: 'overlap', text: 'Öğeler üst üste biniyor', itemIds: [solidItems[i].id, solidItems[j].id] });
      }
    }
  }
  for (const a of items.filter(i => SYMBOLS[i.type]?.kind === 'aisle')) {
    const ar = itemRect(a);
    const width = Math.min(ar.w, ar.h);
    if (width < MIN_AISLE_M - 1e-6) {
      warnings.push({ tone: 'warn', code: 'aisle-narrow', text: `Koridor ${width.toFixed(1).replace('.', ',')} m · asgari ${String(MIN_AISLE_M).replace('.', ',')} m`, itemIds: [a.id] });
    }
    const blockers = solidItems.filter(s => overlap(fp.get(s.id), ar));
    if (blockers.length) warnings.push({ tone: 'danger', code: 'aisle-blocked', text: `Koridor ${blockers.length} öğe tarafından işgal ediliyor`, itemIds: [a.id, ...blockers.map(b => b.id)] });
  }
  for (const it of items) {
    const f = fp.get(it.id);
    if (f.x < -1e-6 || f.y < -1e-6 || f.x + f.w > floor.w + 1e-6 || f.y + f.h > floor.h + 1e-6) {
      warnings.push({ tone: 'warn', code: 'outside', text: 'Öğe zemin dışına taşıyor', itemIds: [it.id] });
    }
  }
  const seenSlot = new Map();
  for (const it of items) {
    if (!it.subOpId) continue;
    if (!subById.has(it.subOpId)) {
      warnings.push({ tone: 'warn', code: 'orphan', text: 'Bağlı olduğu operasyon süreçten silinmiş', itemIds: [it.id] });
      continue;
    }
    const k = `${it.subOpId}#${it.slot || 0}`;
    if (seenSlot.has(k)) warnings.push({ tone: 'warn', code: 'duplicate', text: `"${subById.get(it.subOpId).name || it.subOpId}" iki kez yerleştirilmiş`, itemIds: [seenSlot.get(k), it.id] });
    else seenSlot.set(k, it.id);
  }
  if (crossings.count > 0) warnings.push({ tone: 'warn', code: 'crossing', text: `Akış yolları ${crossings.count} yerde kesişiyor`, itemIds: [] });

  return {
    routes, perGroup, totalDist, crossings, merges, usedArea,
    floorArea: r2(floor.w * floor.h), persons: operatorIds.size + freeWorkers, freeWorkers,
    areaPerPerson: operatorIds.size + freeWorkers ? r2(usedArea / (operatorIds.size + freeWorkers)) : null,
    shared, bufferCapacity, warnings, unplaced, slotsTotal: slots.length,
  };
}

/* ---------- otomatik yerleşim ---------- */
/* Yerleşmemiş istasyonları bölge (kök ana-op) sırasıyla bloklar halinde dizer:
   her blok ortada bant olan karşılıklı iki sıradır (üst sıra rot 180, operatör
   dışta). Bloklar zemine soldan sağa, sığmazsa alt şeride, aralarında koridor
   bırakarak yerleşir. Mevcut öğelere dokunmaz; onların altındaki boş şeritten
   başlar. Döner: yeni öğeler. */
export function autoPlace(data, layout, opts = {}) {
  const GAP = opts.gap ?? 0.2;              // yan yana tezgâhlar arası boşluk (m)
  const AISLE = opts.aisle ?? MIN_AISLE_M;  // bloklar arası koridor
  const MARGIN = 0.5;
  const floor = layout?.floor || DEFAULT_FLOOR;
  const existing = layout?.items || [];
  const { unplaced } = layoutMetrics(data, layout);
  if (unplaced.length === 0) return [];
  const machines = data.machines || [];

  const groups = [];
  for (const s of unplaced) {
    let g = groups.find(x => x.id === s.groupId);
    if (!g) { g = { id: s.groupId, slots: [] }; groups.push(g); }
    g.slots.push({ ...s, type: symbolForSubOp(s.subOp, machines) });
  }
  const order = new Map((data.mainOps || []).map(m => [m.id, m.order ?? 0]));
  groups.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  // bir sıranın genişliği
  const rowW = (list) => list.reduce((a, s) => a + SYMBOLS[s.type].w, 0) + GAP * Math.max(0, list.length - 1);
  const maxW = floor.w - 2 * MARGIN;

  // grupları bloklara böl (her sıra zemine sığacak kadar)
  const blocks = [];
  for (const g of groups) {
    let rest = g.slots.slice();
    while (rest.length) {
      let k = rest.length;
      while (k > 1) {
        const top = rest.slice(0, Math.ceil(k / 2)), bot = rest.slice(Math.ceil(k / 2), k);
        if (rowW(top) <= maxW && rowW(bot) <= maxW) break;
        k--;
      }
      const chunk = rest.slice(0, k);
      rest = rest.slice(k);
      const top = chunk.slice(0, Math.ceil(chunk.length / 2)), bot = chunk.slice(Math.ceil(chunk.length / 2));
      const hTop = Math.max(0, ...top.map(s => SYMBOLS[s.type].h));
      const hBot = Math.max(0, ...bot.map(s => SYMBOLS[s.type].h));
      const opTop = Math.max(0, ...top.map(s => SYMBOLS[s.type].op));
      const opBot = Math.max(0, ...bot.map(s => SYMBOLS[s.type].op));
      const w = Math.max(rowW(top), rowW(bot));
      const h = opTop + hTop + 0.1 + SYMBOLS.bant.h + 0.1 + hBot + opBot;
      blocks.push({ top, bot, w, h, hTop, opTop });
    }
  }

  let y0 = MARGIN;
  if (existing.length) y0 = snap(Math.max(...existing.map(i => { const f = itemFootprint(i); return f.y + f.h; })) + AISLE, 0.25);
  let cx = MARGIN, cy = y0, rowH = 0;
  const out = [];
  for (const b of blocks) {
    if (cx > MARGIN && cx + b.w > floor.w - MARGIN + 1e-6) { cx = MARGIN; cy = r2(cy + rowH + AISLE); rowH = 0; }
    const beltY = r2(cy + b.opTop + b.hTop + 0.1);
    let x = cx;
    for (const s of b.top) {
      const sym = SYMBOLS[s.type];
      out.push(createItem(s.type, x, r2(beltY - 0.1 - sym.h), { rot: 180, subOpId: s.subOpId, slot: s.slot }));
      x = r2(x + sym.w + GAP);
    }
    out.push(createItem('bant', cx, beltY, { w: r2(b.w) }));
    x = cx;
    for (const s of b.bot) {
      const sym = SYMBOLS[s.type];
      out.push(createItem(s.type, x, r2(beltY + SYMBOLS.bant.h + 0.1), { rot: 0, subOpId: s.subOpId, slot: s.slot }));
      x = r2(x + sym.w + GAP);
    }
    cx = r2(cx + b.w + AISLE);
    rowH = Math.max(rowH, b.h);
  }
  return out;
}

/* ---------- yerleşimden süreç düzenleme (atölye sahibi kolaylığı) ---------- */
/* Yeni operasyonu akışta `afterId`'nin hemen ARKASINA ekler: yeni.nextIds = önceki.nextIds,
   önceki.nextIds = [yeni]. afterId yoksa grubun (mainOpId) başına, girdisiz eklenir ve
   grubun giriş operasyonlarını besler. Döner: { subOps, id }. Saf. */
export function insertSubOpAfter(data, { mainOpId, afterId, name, cycleTime, type, operatorId }) {
  const subOps = (data.subOps || []).map(s => ({ ...s }));
  const id = `s_${uid()}`;
  const node = { id, mainOpId, name: name || 'Yeni operasyon', type: type || 'DESTEK', cycleTime: Math.max(1, Number(cycleTime) || 1), nextIds: [], machineId: null, operatorId: operatorId || null, stationCount: 1 };
  const prev = afterId ? subOps.find(s => s.id === afterId) : null;
  if (prev) {
    node.mainOpId = prev.mainOpId;
    if (prev.parentId) node.parentId = prev.parentId;
    node.nextIds = [...(prev.nextIds || [])];
    prev.nextIds = [id];
  } else {
    // grubun girişleri: grup içinde kimsenin beslemediği operasyonlar
    const members = subOps.filter(s => (s.parentId ?? s.mainOpId) === mainOpId);
    const targeted = new Set(members.flatMap(s => s.nextIds || []));
    node.nextIds = members.filter(s => !targeted.has(s.id)).map(s => s.id);
  }
  subOps.push(node);
  return { subOps, id };
}

/* Denemeleri kıyas için kısa özet. */
export function layoutSummary(data, layout) {
  const m = layoutMetrics(data, layout);
  return {
    id: layout.id, name: layout.name,
    totalDist: m.totalDist, usedArea: m.usedArea, crossings: m.crossings.count,
    areaPerPerson: m.areaPerPerson, unplaced: m.unplaced.length,
    problems: m.warnings.filter(w => w.tone === 'danger').length,
  };
}
