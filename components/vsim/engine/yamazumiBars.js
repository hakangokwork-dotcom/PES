import { childNodes, isPassthrough } from './flow.js';

/* Standart Yamazumi/OBC çubukları: her çubuk bir operatör/istasyon, iş elemanları yığılı.
   operatorId varsa aynı operatör tek çubukta toplanır; yoksa her yaprak (stationCount kadar)
   ayrı çubuk. Takt ile kıyas: total>takt darbogaz, ≥%80 risk, altı normal. */
export function yamazumiBars(data, taktSec) {
  const ops = data.operators || [];
  const opName = (id) => ops.find(o => o.id === id)?.name || id;
  const leaves = (data.subOps || []).filter(s =>
    childNodes(data, s.id).length === 0 && !isPassthrough(s) && (s.cycleTime || 0) > 0);

  const byOp = new Map();   // operatorId → bar
  const bars = [];
  for (const s of leaves) {
    const seg = { id: s.id, name: s.name || s.id, sec: s.cycleTime || 0, color: s.color };
    if (s.operatorId) {
      let bar = byOp.get(s.operatorId);
      if (!bar) { bar = { id: `op:${s.operatorId}`, label: opName(s.operatorId), segments: [] }; byOp.set(s.operatorId, bar); bars.push(bar); }
      bar.segments.push(seg);
    } else {
      const n = Math.max(1, s.stationCount || 1);
      for (let i = 0; i < n; i++) {
        bars.push({ id: n > 1 ? `${s.id}#${i + 1}` : s.id,
          label: (s.name || s.id) + (n > 1 ? ` #${i + 1}` : ''), segments: [seg] });
      }
    }
  }
  const status = (total) => {
    if (!taktSec || taktSec === Infinity) return 'normal';
    if (total > taktSec) return 'darbogaz';
    if (total >= taktSec * 0.8) return 'risk';
    return 'normal';
  };
  return bars.map(b => {
    const total = b.segments.reduce((a, x) => a + x.sec, 0);
    return { ...b, total, status: status(total) };
  });
}
