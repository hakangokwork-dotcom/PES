/* Yerleşim → simülasyon köprüsü ("lojistik") — saf, UI'sız.
   Aktif yerleşimden simülasyon motorunun anlayacağı bir tablo türetir:
     links[simKey] = { delaySec, bufferId, path, dist }
     buffers[id]   = { name, capacity, keys: [simKey] }
   simKey motorun kendi aktarım adımlarıyla birebir eşleşir:
     'a>b'   alt-op a → alt-op b (pending[b][a])
     'a>>G'  terminal alt-op a → G grubunun inbox'ı (groupInbox[G][grup(a)])
   Motor d.logistics VARSA taşıma süresi, demet (bundle) ve ara stok kapasitesi
   uygular; yoksa eski davranış birebir korunur. */

import { layoutMetrics } from './layout.js';
import { buildGroupBridges } from './simulation.js';

export const DEFAULT_TRANSPORT = { speedMps: 0.8, bundle: 10, handlingSec: 0 };

export function buildLogistics(data, layout) {
  if (!layout) return null;
  const t = { ...DEFAULT_TRANSPORT, ...(layout.transport || {}) };
  const speed = Math.max(0.05, Number(t.speedMps) || DEFAULT_TRANSPORT.speedMps);
  const bundle = Math.max(1, Math.round(Number(t.bundle) || 1));
  const handling = Math.max(0, Number(t.handlingSec) || 0);
  const m = layoutMetrics(data, layout);
  const routeByKey = new Map(m.routes.map(r => [r.key, r]));
  const d = { mainOps: data.mainOps || [], subOps: data.subOps || [] };
  const bridges = buildGroupBridges(d);
  const links = {};
  const buffers = {};
  for (const it of layout.items || []) {
    // Kapasite demetten küçükse demet hiç yola çıkamaz (kilit) → en az bir demet sığar.
    if (it.routeKeys && it.capacity != null) {
      const cap = Math.max(1, Number(it.capacity) || 1);
      buffers[it.id] = { name: it.name || 'Ara stok', capacity: Math.max(cap, bundle), requested: cap, keys: [] };
    }
  }
  const put = (simKey, routes) => {
    if (!routes.length) return;
    const dist = routes.reduce((a, r) => a + r.dist, 0) / routes.length;
    const via = routes.find(r => r.viaId && buffers[r.viaId])?.viaId || null;
    links[simKey] = { delaySec: Math.round((dist / speed + handling) * 10) / 10, dist, bufferId: via, path: routes[0].path };
    if (via) buffers[via].keys.push(simKey);
  };

  for (const s of d.subOps) {
    // grup içi doğrudan aktarımlar
    for (const n of (s.nextIds || [])) {
      const r = routeByKey.get(`${s.id}>${n}`);
      if (r) put(`${s.id}>${n}`, [r]);
    }
    // grup köprüsü: terminal alt-op → ardıl grupların giriş alt-opları
    const g = bridges.groupOf[s.id];
    if (g == null || (s.nextIds || []).length) continue;
    const main = d.mainOps.find(x => x.id === g);
    for (const G of (main?.nextIds || [])) {
      const entries = new Set(bridges.entrySubs[G] || []);
      const rs = m.routes.filter(r => r.from === s.id && (entries.has(r.to) || bridges.groupOf[r.to] === G));
      put(`${s.id}>>${G}`, rs);
    }
  }

  // yerleşimde bir operasyonun kaç fiziksel istasyonu var (paralel)
  const stations = {};
  for (const it of layout.items || []) if (it.subOpId) stations[it.subOpId] = (stations[it.subOpId] || 0) + 1;

  return { speedMps: speed, bundle, links, buffers, stations, layoutId: layout.id };
}

// Doluluk hesabı motorla aynı yerde yaşar (döngüsel import olmasın diye).
export { bufferOccupancy } from './simulation.js';
