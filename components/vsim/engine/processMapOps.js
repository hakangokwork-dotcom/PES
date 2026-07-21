/* Süreç haritası saf işlemleri — UI'sız, immutable (her işlem yeni map döner).
   Şekil türleri: start/end (stadyum), step (dikdörtgen), decision (elmas), doc (belge).
   Kulvar: yatay şerit; düğümün laneId'si y'den türetilir (laneForY). */

const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 10);

export const LANE_H = 160;               // kulvar şerit yüksekliği (px)

export const TAG_TYPES = {
  risk:        { ad: 'Risk',         renk: 'danger' },
  problem:     { ad: 'Problem',      renk: 'warn' },
  firsat:      { ad: 'Fırsat',       renk: 'ok' },
  iyilestirme: { ad: 'İyileştirme',  renk: 'info' },
  not:         { ad: 'Not',          renk: 'faint' },
};

export const MAKRO_SABLON_ADIMLARI = ['Talep', 'Planlama', 'Üretim', 'Kalite', 'Teslimat'];

export const DEFAULT_CARD = {
  kod: '', ustSurec: '', sahip: '', ekip: '',
  amac: '', kapsam: '',
  girdiler: [], ciktilar: [], kaynaklar: [], dokumanlar: [],
  metrikler: [],
  stratejikHedef: '', yayinTarihi: '', revizyonNo: '',
};

/* Faaliyet listesi/çıktı için tür → Türkçe (LCW "Süreç Adımı Tipi") */
export const NODE_SHAPE_LABELS = {
  start: 'Başlangıç', end: 'Bitiş', step: 'Faaliyet',
  decision: 'Karar', doc: 'Doküman', subprocess: 'III. Seviye',
};

const NODE_DEFAULTS = {
  start: 'Başlangıç', end: 'Bitiş', step: 'Yeni Adım', decision: 'Karar?', doc: 'Belge',
  subprocess: 'Alt Süreç',
};

const mkNode = (type, x, y, laneId = null, label = null) =>
  ({ id: uid('nd'), type, label: label ?? NODE_DEFAULTS[type], x, y, laneId, owner: '', desc: '' });

export function createMap(kind, name) {
  const map = { id: uid('pm'), name, kind, lanes: [], nodes: [], edges: [], tags: [], card: structuredClone(DEFAULT_CARD), sketch: { strokes: [], texts: [], shapes: [] } };
  if (kind === 'swimlane') {
    map.lanes = [1, 2, 3].map((i) => ({ id: uid('ln'), name: `Kulvar ${i}`, order: i - 1 }));
  }
  const laneId = map.lanes[0]?.id ?? null;
  const start = mkNode('start', 60, kind === 'swimlane' ? LANE_H / 2 : 80, laneId);
  const end = mkNode('end', kind === 'makro' ? 1180 : 700, kind === 'swimlane' ? LANE_H / 2 : 80, laneId);
  map.nodes = [start, end];
  if (kind === 'makro') {
    const steps = MAKRO_SABLON_ADIMLARI.map((ad, i) => mkNode('step', 220 + i * 170, 80, null, ad));
    map.nodes = [start, end, ...steps];
    const zincir = [start, ...steps, end];
    map.edges = zincir.slice(0, -1).map((n, i) => ({ id: uid('ed'), from: n.id, to: zincir[i + 1].id, label: '' }));
  }
  return map;
}

export function addNode(map, type, x, y) {
  return { ...map, nodes: [...map.nodes, mkNode(type, x, y, laneForY(map, y))] };
}

export function moveNode(map, nodeId, x, y) {
  return { ...map, nodes: map.nodes.map(n => n.id === nodeId ? { ...n, x, y, laneId: laneForY(map, y) } : n) };
}

export function renameNode(map, nodeId, label) {
  const t = String(label ?? '').trim();
  if (!t) return map;
  return { ...map, nodes: map.nodes.map(n => n.id === nodeId ? { ...n, label: t } : n) };
}

export function removeNode(map, nodeId) {
  return {
    ...map,
    nodes: map.nodes.filter(n => n.id !== nodeId),
    edges: map.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
    tags: map.tags.filter(t => t.nodeId !== nodeId),
  };
}

export function connect(map, fromId, toId) {
  if (fromId === toId) return map;
  if (map.edges.some(e => e.from === fromId && e.to === toId)) return map;
  return { ...map, edges: [...map.edges, { id: uid('ed'), from: fromId, to: toId, label: '' }] };
}

export function disconnect(map, fromId, toId) {
  return { ...map, edges: map.edges.filter(e => !(e.from === fromId && e.to === toId)) };
}

export function addLane(map, name) {
  return { ...map, lanes: [...map.lanes, { id: uid('ln'), name, order: map.lanes.length }] };
}

export function renameLane(map, laneId, name) {
  const t = String(name ?? '').trim();
  if (!t) return map;
  return { ...map, lanes: map.lanes.map(l => l.id === laneId ? { ...l, name: t } : l) };
}

export function removeLane(map, laneId) {
  return {
    ...map,
    lanes: map.lanes.filter(l => l.id !== laneId).map((l, i) => ({ ...l, order: i })),
    nodes: map.nodes.map(n => n.laneId === laneId ? { ...n, laneId: null } : n),
  };
}

/* y konumundan kulvar id'si; kulvarsız haritada null; taşmada son kulvar. */
export function laneForY(map, y) {
  if (!map.lanes.length) return null;
  const idx = Math.min(Math.max(Math.floor(y / LANE_H), 0), map.lanes.length - 1);
  return map.lanes[idx].id;
}

export function addTag(map, nodeId, type, title, note = '', severity = null) {
  const t = String(title ?? '').trim();
  if (!t) return map;
  return { ...map, tags: [...map.tags, { id: uid('tg'), nodeId, type, title: t, note, severity }] };
}

export function updateTag(map, tagId, patch) {
  return { ...map, tags: map.tags.map(t => t.id === tagId ? { ...t, ...patch } : t) };
}

export function removeTag(map, tagId) {
  return { ...map, tags: map.tags.filter(t => t.id !== tagId) };
}

export function tagCounts(map, nodeId) {
  const out = Object.fromEntries(Object.keys(TAG_TYPES).map(k => [k, 0]));
  for (const t of map.tags) if (t.nodeId === nodeId && out[t.type] != null) out[t.type]++;
  return out;
}

// Legacy/eksik kartlı haritalarda fallback DAİMA taze klon — modül seviyesindeki DEFAULT_CARD'ın
// paylaşılan dizilerine (girdiler/metrikler…) referans sızmasın (aksi halde ilerideki bir
// in-place mutasyon tüm haritaları etkilerdi).
export function updateCard(map, patch) {
  return { ...map, card: { ...(map.card || structuredClone(DEFAULT_CARD)), ...patch } };
}

export function addMetric(map, ad, hedef = null, birim = '') {
  const t = String(ad ?? '').trim();
  if (!t) return map;
  const card = map.card || structuredClone(DEFAULT_CARD);
  const metrik = { id: uid('mt'), ad: t, hedef, birim: String(birim ?? '') };
  return { ...map, card: { ...card, metrikler: [...card.metrikler, metrik] } };
}

export function updateMetric(map, metricId, patch) {
  const card = map.card || structuredClone(DEFAULT_CARD);
  return { ...map, card: { ...card, metrikler: card.metrikler.map(m => m.id === metricId ? { ...m, ...patch } : m) } };
}

export function removeMetric(map, metricId) {
  const card = map.card || structuredClone(DEFAULT_CARD);
  return { ...map, card: { ...card, metrikler: card.metrikler.filter(m => m.id !== metricId) } };
}

/* Genel düğüm yaması (renameNode özel; bu owner/desc/label birlikte) */
export function updateNode(map, nodeId, patch) {
  return { ...map, nodes: map.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n) };
}
