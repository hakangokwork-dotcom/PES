import { ROOT_ID, childNodes, subParent, isPassthrough } from './flow.js';

/* Kapasite / darboğaz / takt hesabı — UI'sız saf fonksiyon.
   Dönüş şekli UretimSimulasyon'daki eski `calc` ile birebir aynıdır. */
export function computeCapacity(data) {
  const netMin = data.settings.netMinutes;
  const eff = data.settings.efficiency;
  const pfd = data.settings.pfd;
  const demand = data.settings.demand || 1;
  const taktTimeMin = netMin / demand;       // dk / adet
  const taktTimeSec = taktTimeMin * 60;      // sn / adet

  // --- Recursive throughput motoru ---
  // Her düğüm: yaprak ise çevrim süresinden kapasite; konteyner ise alt-grafın çıktısı.
  // Birleşme (join) tipi düğüme gelen çoklu girişi belirler: 'AND' → min, 'DUP' → toplam.
  const cap = {};       // düğüm id → kapasite (adet/vardiya)
  const thru = {};      // düğüm id → bulunduğu konteyner içindeki geçirgenlik
  const bottleneckByContainer = {}; // konteyner id → en yavaş çocuk id
  const totalCycleOf = {};          // konteyner id → doğrudan yaprak çocuk çevrim toplamı (sn)
  const effectiveCycleOf = {};      // konteyner id → efektif çevrim (yedek-paralel harmonik havuz)

  const leafCap = (node) => {
    if (isPassthrough(node)) return Infinity;     // input/output: geçirgen, sınırlamaz
    const cyc = node.cycleTime || 0;
    if (cyc <= 0) return 0;
    const smv = (cyc / 60) * (1 + pfd);
    const stations = node.stationCount || 1;
    return smv > 0 ? (netMin * eff * stations) / smv : 0;
  };

  const computeContainer = (cid) => {
    const kids = childNodes(data, cid);
    kids.forEach(k => {
      const isContainer = childNodes(data, k.id).length > 0;
      cap[k.id] = isContainer ? computeContainer(k.id) : leafCap(k);
    });
    totalCycleOf[cid] = kids.reduce(
      (a, k) => a + (childNodes(data, k.id).length > 0 ? 0 : (k.cycleTime || 0)), 0);
    if (kids.length === 0) return 0;

    const idset = new Set(kids.map(k => k.id));
    const incoming = {}; kids.forEach(k => { incoming[k.id] = []; });
    kids.forEach(k => (k.nextIds || []).forEach(n => { if (idset.has(n)) incoming[n].push(k.id); }));
    // Kahn topolojik sıra
    const indeg = {}; kids.forEach(k => { indeg[k.id] = incoming[k.id].length; });
    const queue = kids.filter(k => indeg[k.id] === 0).map(k => k.id);
    const order = [];
    while (queue.length) {
      const id = queue.shift(); order.push(id);
      const node = kids.find(k => k.id === id);
      (node.nextIds || []).forEach(n => { if (idset.has(n)) { indeg[n]--; if (indeg[n] === 0) queue.push(n); } });
    }
    kids.forEach(k => { if (!order.includes(k.id)) order.push(k.id); }); // döngü koruması

    const t = {};
    // Öncülden BU düğüme düşen hız: öncül çoğaltıyorsa (DUP, varsayılan) tam hız;
    // bölüyorsa (SPLIT) kapasiteye orantılı pay. cap[] döngüden önce hesaplandığından
    // (kids.forEach) topolojik sırada öncülün tüm ardıllarının kapasitesi hazırdır (spec §2).
    const rateFromPred = (pid, selfId) => {
      const pred = kids.find(k => k.id === pid);
      if ((pred.splitType || 'DUP') !== 'SPLIT') return t[pid] ?? 0;
      const succ = (pred.nextIds || []).filter(n => idset.has(n));
      // Pay STATİK kapasiteye orantılı (cap), aşağı-akış-kısıtlı gerçek geçirgenliğe değil.
      // Bir dal aşağıda boğuluyorsa fazla pay ona gider ve kırpılır; başka dala yeniden
      // dağıtılmaz (tek-geçiş ileri model — spec §6 Risk 2, bilinçli sınır).
      const sumCap = succ.reduce((a, n) => a + (cap[n] || 0), 0);
      return sumCap > 0 ? (t[pid] ?? 0) * (cap[selfId] || 0) / sumCap : 0;
    };
    order.forEach(id => {
      const node = kids.find(k => k.id === id);
      const preds = incoming[id];
      let inRate;
      if (preds.length === 0) inRate = Infinity;              // kaynak
      else {
        const join = node.joinType || 'AND';
        const vals = preds.map(p => rateFromPred(p, id));
        inRate = join === 'DUP' ? vals.reduce((a, b) => a + b, 0) : Math.min(...vals);
      }
      t[id] = Math.min(cap[id] || 0, inRate);
      thru[id] = t[id];
    });
    // Çıkış = sink'lerin (giden kenarı olmayan) birleşimi.
    // Yedek-paralel (redundant) sink'ler AYNI işi paylaşır → kapasiteleri TOPLANIR (havuz);
    // kalan sink'ler senkron tamamlama olduğundan havuz + normaller MİN ile birleşir.
    const sinks = kids.filter(k => !(k.nextIds || []).some(n => idset.has(n)));
    let containerThru = 0;
    if (sinks.length) {
      const parts = sinks.filter(k => !k.redundant).map(k => t[k.id] || 0);
      if (sinks.some(k => k.redundant)) {
        parts.push(sinks.filter(k => k.redundant).reduce((a, k) => a + (t[k.id] || 0), 0));
      }
      containerThru = Math.min(...parts);
    }
    // Darboğaz = en düşük geçirgenlikli çocuk
    let bn = null, bnv = Infinity;
    kids.forEach(k => {
      if (isPassthrough(k)) return;               // input/output darboğaz olamaz
      const v = t[k.id] ?? 0;
      if (v < bnv) { bnv = v; bn = k.id; }
    });
    bottleneckByContainer[cid] = bn;
    // Yamazumi efektif çevrim = sürecin sürdürebildiği tempo (kapasiteden türer):
    // paralel için harmonik, seri/pipelined için darboğaz CT'si. Özel-durum/pooling gerekmez.
    effectiveCycleOf[cid] = containerThru > 0 ? (netMin * eff * 60) / (containerThru * (1 + pfd)) : 0;
    return containerThru;
  };

  const lineCapacity = computeContainer(ROOT_ID);
  const bottleneckId = bottleneckByContainer[ROOT_ID];

  // OpsView / DashboardView uyumu için perMain
  const perMain = (data.mainOps || []).map(mo => {
    const subs = (data.subOps || []).filter(s => subParent(s) === mo.id);
    const opSubs = subs.filter(s => !isPassthrough(s));
    const stCount = (s) => Math.max(1, s.stationCount || 1);
    const totalCycle = opSubs.reduce((a, s) =>
      a + (childNodes(data, s.id).length > 0 ? 0 : (s.cycleTime || 0) * stCount(s)), 0);
    const totalCycleMin = totalCycle / 60;
    const smv = totalCycleMin * (1 + pfd);
    const stations = opSubs.reduce((a, s) => a + (childNodes(data, s.id).length > 0 ? 0 : stCount(s)), 0) || 1;
    const capacity = cap[mo.id] ?? 0;
    const slowest = opSubs.reduce((max, s) => ((s.cycleTime || 0) > (max?.cycleTime || 0) ? s : max), null);
    // Yamazumi efektif çevrim (sn): kapasiteden türer (computeContainer'da hesaplandı).
    const effectiveCycle = effectiveCycleOf[mo.id] ?? totalCycle;
    return { mainOp: mo, subs, totalCycle, totalCycleMin, smv, stations, capacity, slowest, effectiveCycle };
  });

  return {
    perMain, taktTime: taktTimeMin, taktTimeMin, taktTimeSec, lineCapacity, bottleneckId,
    netMin, eff, demand, cap, thru, bottleneckByContainer, totalCycleOf, effectiveCycleOf,
  };
}
