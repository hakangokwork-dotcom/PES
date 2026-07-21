/* v3 (atolye_sim_v3) → v4 şema migrasyonu.
   Kural: nextIds tek gerçek kaynaktır; edges yalnızca meta zenginleştirme
   katmanıdır ve her migrasyon/yükleme geçişinde nextIds ile senkronlanır. */

export const SCHEMA_VERSION = 4;

const SETTINGS_DEFAULTS = { netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 };

/* Kök mainOps bağlantılarından edge listesi türet; var olan meta korunur,
   artık var olmayan bağlantıların edge kayıtları düşer. */
export function deriveEdges(data) {
  const existing = data.edges || [];
  const out = [];
  for (const m of data.mainOps || []) {
    for (const to of m.nextIds || []) {
      const kept = existing.find(e => e.from === m.id && e.to === to);
      out.push(kept ? { ...kept } : {
        from: m.id, to,
        inventoryCount: null, inventoryWaitSec: null, flowType: 'push',
      });
    }
  }
  return out;
}

/* Her processMap'e sketch (karalama) alanını geri-doldur — bu branch öncesi kaydedilmiş
   haritalarda sketch undefined'dır; Silgi/çizim katmanı render'ı sketch.strokes okuduğundan
   yokluğu beyaz ekrana yol açardı. Var olan sketch korunur, yalnız eksikse eklenir. */
function backfillSketch(processMaps) {
  return (processMaps || []).map(m => ({
    ...m,
    sketch: {
      strokes: m.sketch?.strokes || [], texts: m.sketch?.texts || [], shapes: m.sketch?.shapes || [],
      stickies: m.sketch?.stickies || [], stamps: m.sketch?.stamps || [], comments: m.sketch?.comments || [],
    },
  }));
}

export function migrateData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  // v4 ve gelecekteki sürümler: alanlara dokunma, sadece edges'i nextIds ile
  // senkronla (bilinmeyen/gelecek sürümlerde alan kaybını önlemek için passthrough)
  // + eski v4 kayıtlarında eksik sketch'i geri-doldur (backfill).
  if (raw.schemaVersion != null) {
    return { ...raw, edges: deriveEdges(raw), processMaps: backfillSketch(raw.processMaps) };
  }

  // v3 (schemaVersion alanı yok) → v4
  const migrated = {
    schemaVersion: SCHEMA_VERSION,
    domainId: 'textile',            // mevcut tüm eski veriler konfeksiyon çalışmasıdır
    mainOps: raw.mainOps || [],
    subOps: raw.subOps || [],
    machines: raw.machines || [],
    operators: raw.operators || [],
    settings: { ...SETTINGS_DEFAULTS, ...(raw.settings || {}) },
    // snapshot'lar yalnızca mainOps/subOps/machines/operators/meta içerir;
    // v4'ün yeni alanları opsiyonel olduğundan yapısal dönüşüm gerekmez.
    scenarios: raw.scenarios || [],
    meta: raw.meta || {},
    infoNodes: raw.infoNodes || [],
    infoEdges: raw.infoEdges || [],
    kaizens: raw.kaizens || [],
    processMaps: backfillSketch(raw.processMaps),
  };
  migrated.edges = deriveEdges({ mainOps: migrated.mainOps, edges: raw.edges || [] });
  return migrated;
}
