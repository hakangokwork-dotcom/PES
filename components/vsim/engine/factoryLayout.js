/* Fabrika kuş bakışı görünümü — saf yerleşim/türetme fonksiyonları (UI'sız).
   Bölge = kök ana-op; istasyon = yaprak alt-op. Serpantin satırlara bölme
   deterministiktir (istasyon sayısına göre, ekran ölçüsünden bağımsız). */

import { childNodes, isPassthrough } from './flow.js';
import { buildGroupBridges } from './simulation.js';

/* Bölgeler: ana-op sırasına göre; her bölgede yaprak istasyonlar topolojik
   sırada (bölge-içi nextIds; döngüde/dış kenarda dizi sırasına düşer).
   personCount = bölgedeki FARKLI operatör sayısı (gerçek kafa sayısı). */
export function factoryZones(data) {
  const d = { mainOps: data.mainOps || [], subOps: data.subOps || [], settings: data.settings || {} };
  const bridges = buildGroupBridges(d);
  const leaves = d.subOps.filter(s =>
    childNodes(d, s.id).length === 0 && !isPassthrough(s) && (s.cycleTime || 0) > 0);

  const sorted = [...d.mainOps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sorted.map(m => {
    const members = leaves.filter(s => bridges.groupOf[s.id] === m.id);
    const stations = topoSort(members);
    const persons = new Set(stations.map(s => s.operatorId).filter(Boolean));
    return { id: m.id, name: m.name || m.id, color: m.color, stations, personCount: persons.size };
  }).filter(z => z.stations.length > 0);
}

/* Kahn topolojik sıra — yalnız liste-içi kenarlar; eşitlikte dizi sırası.
   Döngü kalırsa kalanlar dizi sırasıyla eklenir (asla eleman kaybetmez). */
function topoSort(members) {
  const ids = new Set(members.map(s => s.id));
  const indeg = new Map(members.map(s => [s.id, 0]));
  for (const s of members) {
    for (const n of (s.nextIds || [])) {
      if (ids.has(n)) indeg.set(n, indeg.get(n) + 1);
    }
  }
  const out = [];
  const done = new Set();
  let progress = true;
  while (out.length < members.length && progress) {
    progress = false;
    for (const s of members) {
      if (done.has(s.id) || indeg.get(s.id) > 0) continue;
      done.add(s.id);
      out.push(s);
      for (const n of (s.nextIds || [])) {
        if (ids.has(n)) indeg.set(n, indeg.get(n) - 1);
      }
      progress = true;
    }
  }
  for (const s of members) if (!done.has(s.id)) out.push(s);
  return out;
}

/* Bölgeleri serpantin satırlara böl: istasyon sayısı hedefe ulaşınca satır
   kapanır (her satırda en az 1 bölge). Tek satır sığarsa reverse yok. */
export function serpentineRows(zones, targetPerRow = 14) {
  const rows = [];
  let cur = [];
  let count = 0;
  for (const z of zones) {
    if (cur.length > 0 && count + z.stations.length > targetPerRow) {
      rows.push(cur);
      cur = [];
      count = 0;
    }
    cur.push(z);
    count += z.stations.length;
  }
  if (cur.length > 0) rows.push(cur);
  return rows.map((rz, i) => ({ zones: rz, reverse: i % 2 === 1 }));
}

/* İstasyon önündeki △ — yalnız pending (bölge-arası inbox ayrı üçgende
   gösterilir; motorun peakQueue'sundan farklı olarak çifte sayım yapmaz). */
export function stationQueue(simState, opId) {
  const pend = (simState.pending || {})[opId] || {};
  return Object.values(pend).reduce((a, v) => a + (v > 0 ? v : 0), 0);
}

/* Bölgeler arası △ — hedef bölgenin inbox toplamı (henüz istasyona girmemiş). */
export function zoneInbox(simState, zoneId) {
  const inbox = (simState.groupInbox || {})[zoneId] || {};
  return Object.values(inbox).reduce((a, v) => a + (v > 0 ? v : 0), 0);
}

/* Darboğaz istasyonu: en yüksek zirve kuyruk (eşitlikte ilk); hiç kuyruk
   oluşmadıysa null. */
export function bottleneckStationId(simState) {
  let best = null;
  let bestQ = 0;
  for (const [id, q] of Object.entries(simState.peakQueue || {})) {
    if (q > bestQ) { best = id; bestQ = q; }
  }
  return best;
}
