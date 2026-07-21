import { migrateData, SCHEMA_VERSION } from '../engine/migrate.js';
import { getDomain } from '../domains/index.js';

/* Şablondan çalışma verisi üret. Ayar önceliği: seed.settings > domain.defaults.
   migrateData'dan geçirilir ki edges nextIds ile senkron başlasın. */
export function buildDataFromTemplate(tpl) {
  const seed = tpl.seed || {};
  const domain = getDomain(tpl.domainId);
  return migrateData({
    schemaVersion: SCHEMA_VERSION,
    domainId: domain.id,
    mainOps: seed.mainOps || [],
    subOps: seed.subOps || [],
    machines: seed.machines || [],
    operators: seed.operators || [],
    settings: { ...domain.defaults, ...(seed.settings || {}) },
    scenarios: [],
    meta: seed.meta || {},
    edges: seed.edges || [],
    infoNodes: [], infoEdges: [], kaizens: [],
    processMaps: [],
  });
}

/* Mevcut çalışmadan kullanıcı şablonu üret (senaryolar ve sim durumu hariç). */
export function templateFromData(name, data) {
  return {
    templateId: 'user_' + Math.random().toString(36).slice(2, 10),
    domainId: data.domainId,
    name,
    description: data.meta?.modelAdi ? `"${data.meta.modelAdi}" çalışmasından` : '',
    custom: true,
    seed: {
      mainOps: data.mainOps, subOps: data.subOps,
      machines: data.machines, operators: data.operators,
      settings: data.settings, meta: data.meta, edges: data.edges,
    },
  };
}
