import { subParent } from './flow.js';
import { inventoryLeadTimeSec, pcePct, pceBand, yamazumiStatus } from './metrics.js';

/* Kök ana operasyonları topolojik sıraya dizer (Kahn).
   Döngüde kalanlar orijinal sırayla sona eklenir — asla düğüm kaybolmaz. */
export function topoOrderMainOps(mainOps) {
  const ops = mainOps || [];
  const ids = new Set(ops.map(m => m.id));
  const indeg = {};
  ops.forEach(m => { indeg[m.id] = 0; });
  ops.forEach(m => (m.nextIds || []).forEach(n => { if (ids.has(n)) indeg[n]++; }));
  const queue = ops.filter(m => indeg[m.id] === 0).map(m => m.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    const m = ops.find(x => x.id === id);
    (m.nextIds || []).forEach(n => { if (ids.has(n) && --indeg[n] === 0) queue.push(n); });
  }
  ops.forEach(m => { if (!order.includes(m.id)) order.push(m.id); });
  return order.map(id => ops.find(m => m.id === id));
}

/* Haritalık VSM modeli. CT kararı: grubun darboğaz (en yavaş yaprak) CT'si (spec §13/1).
   Toplamlar (A1): KRİTİK YOL üzerinden — paralel dallar seri toplanmaz. Kritik yol,
   düğüm ağırlığı ctSec ve kenar ağırlığı edgeWait olan DAG üzerinde en uzun yoldur
   (klasik CPM/PERT). Kritik yol DIŞI tüm kenarlar (beklemeleriyle) otherLinks'e gider;
   toplam altında ayrıca "yol dışı bekleme" (offPathWaitSec) raporlanır. */
export function buildVsmModel(data, calc) {
  const ordered = topoOrderMainOps(data.mainOps || []);
  const edges = data.edges || [];
  const subOps = data.subOps || [];

  const processes = ordered.map(mo => {
    const pm = (calc.perMain || []).find(p => p.mainOp.id === mo.id);
    const ctSec = pm?.slowest?.cycleTime || 0;
    return {
      id: mo.id,
      name: mo.name,
      color: mo.color,
      isShared: !!mo.isShared,
      ctSec,
      totalCycleSec: pm?.totalCycle || 0,
      changeoverSec: mo.changeoverSec ?? null,
      uptimePct: mo.uptimePct ?? null,
      fpyPct: mo.fpyPct ?? null,
      shifts: mo.shifts ?? null,
      subOpCount: pm?.subs?.length || 0,
      operatorCount: subOps.filter(s => subParent(s) === mo.id && s.operatorId).length,
      taktStatus: yamazumiStatus(ctSec, calc.taktTimeSec),
    };
  });
  const ctById = {};
  processes.forEach(p => { ctById[p.id] = p.ctSec; });

  // ILT etkin aralığı (A4): darboğaz takt'tan yavaşsa Little tahmini takt yerine
  // ETKİN ARALIKLA (max(takt, netSec/lineCapacity)) yapılır — "(tahmini · darboğaz
  // hızıyla)" etiketi bottleneckLimited ile UI'ya taşınır.
  const netSec = (data.settings?.netMinutes || 0) * 60;
  const effectiveIntervalSec = calc.lineCapacity > 0
    ? Math.max(calc.taktTimeSec, netSec / calc.lineCapacity)
    : calc.taktTimeSec;
  const bottleneckLimited = effectiveIntervalSec > calc.taktTimeSec;

  // Edge bekleme kuralı: girilmiş süre > Little tahmini (adet × etkin aralık) > null
  // Envanter üçgenleri ve otherLinks (yol dışı bağlantılar) aynı kuralı kullanır.
  const edgeWait = (e) => {
    const entered = e.inventoryWaitSec ?? null;
    if (entered != null) return { waitSec: entered, estimated: false, bottleneckLimited: false };
    if (e.inventoryCount != null && effectiveIntervalSec !== Infinity) {
      return {
        waitSec: inventoryLeadTimeSec(e.inventoryCount, effectiveIntervalSec),
        estimated: true,
        bottleneckLimited,
      };
    }
    return { waitSec: null, estimated: false, bottleneckLimited: false };
  };

  // Kritik yol DP'si (A1): topolojik sırada dist[v] = ctSec(v) + max(0, max_p(dist[p] + wait(p→v))).
  const dist = {};
  const prev = {};
  ordered.forEach(mo => {
    const id = mo.id;
    const incoming = edges.filter(e => e.to === id && ctById[e.from] !== undefined);
    if (incoming.length === 0) {
      dist[id] = ctById[id] || 0;
      prev[id] = null;
      return;
    }
    let bestFrom = null, bestVal = -Infinity;
    incoming.forEach(e => {
      const w = edgeWait(e).waitSec ?? 0;
      const val = (dist[e.from] ?? 0) + w;
      if (val > bestVal) { bestVal = val; bestFrom = e.from; }
    });
    dist[id] = (ctById[id] || 0) + Math.max(0, bestVal);
    prev[id] = bestFrom;
  });
  let endId = null, endVal = -Infinity;
  ordered.forEach(mo => { if (dist[mo.id] > endVal) { endVal = dist[mo.id]; endId = mo.id; } });
  // Döngü koruması: topoOrderMainOps döngü üyelerini düşürmez (vsm.js:20), bu yüzden
  // prev zinciri döngüde kendi içine kapanabilir — ziyaret edilen düğümde yürüyüş durur.
  const criticalPath = [];
  const walked = new Set();
  for (let cur = endId; cur != null && !walked.has(cur); cur = prev[cur]) {
    walked.add(cur);
    criticalPath.unshift(cur);
  }

  const pathEdgeSet = new Set();
  for (let i = 0; i < criticalPath.length - 1; i++) pathEdgeSet.add(`${criticalPath[i]}->${criticalPath[i + 1]}`);

  // Kritik yol ARDIŞIK ÇİFTLERİ arası envanter (doğrudan edge varsa); yoksa null (üçgen çizilmez)
  const inventories = [];
  for (let i = 0; i < criticalPath.length - 1; i++) {
    const fromId = criticalPath[i], toId = criticalPath[i + 1];
    const e = edges.find(x => x.from === fromId && x.to === toId);
    if (!e) { inventories.push(null); continue; }
    const count = e.inventoryCount ?? null;
    const { waitSec, estimated, bottleneckLimited: bl } = edgeWait(e);
    inventories.push({
      from: fromId, to: toId, count, waitSec, estimated, bottleneckLimited: bl,
      flowType: e.flowType || 'push',
    });
  }

  // Kritik yol DIŞI TÜM kenarlar (beklemeleriyle) — merdivende çizilmez, offPathWaitSec'e girer.
  const otherLinks = edges
    .filter(e => !pathEdgeSet.has(`${e.from}->${e.to}`))
    .map(e => ({
      from: e.from, to: e.to, count: e.inventoryCount ?? null,
      flowType: e.flowType || 'push', ...edgeWait(e),
    }));

  const processSec = criticalPath.reduce((a, id) => a + (ctById[id] || 0), 0);
  const waitSec = inventories.reduce((a, inv) => a + (inv?.waitSec || 0), 0);
  const offPathWaitSec = otherLinks.reduce((a, l) => a + (l.waitSec || 0), 0);
  const leadSec = processSec + waitSec;
  // PCE kapısı YALNIZ kritik yol envanterlerine bakar: totals yol-kapsamlı olduğundan,
  // yalnız yol DIŞI bekleme verisiyle PCE hesaplamak waitSec=0 üzerinden sahte
  // %100/'mükemmel' üretirdi (P0'ın kapatmaya geldiği yanılsamanın ta kendisi).
  const hasWaitData = inventories.some(inv => inv?.waitSec != null);
  const pce = hasWaitData && leadSec > 0 ? pcePct(processSec / 60, leadSec / 60) : null;

  // Merdiven (UI için hazır sıra): kritik yol boyunca alternatif process/wait segmentleri.
  const ladder = [];
  criticalPath.forEach((id, i) => {
    const proc = processes.find(p => p.id === id);
    ladder.push({ type: 'process', id, label: proc?.name ?? id, sec: proc?.ctSec ?? 0 });
    if (i < criticalPath.length - 1) {
      const inv = inventories[i];
      ladder.push({ type: 'wait', from: id, to: criticalPath[i + 1], sec: inv?.waitSec ?? 0 });
    }
  });

  return {
    processes,
    criticalPath,
    inventories,
    otherLinks,
    ladder,
    totals: {
      taktSec: calc.taktTimeSec,
      processSec,
      waitSec,
      offPathWaitSec,
      leadSec,
      pcePct: pce,
      pceBand: pce != null ? pceBand(pce) : null,
      bottleneckId: calc.bottleneckId,
    },
  };
}

/* İki harita toplamının karşılaştırması (mevcut → hedef). Delta = hedef − mevcut. */
export function compareVsmTotals(current, target) {
  const d = (a, b) => (a == null || b == null) ? null : b - a;
  return {
    current, target,
    deltas: {
      processSec: d(current.processSec, target.processSec),
      waitSec: d(current.waitSec, target.waitSec),
      leadSec: d(current.leadSec, target.leadSec),
      pcePct: d(current.pcePct, target.pcePct),
    },
  };
}
