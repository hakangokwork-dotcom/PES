/* Tick tabanlı simülasyon motoru — UI'sız saf fonksiyonlar.
   advanceSimStep verilen state'i MUTATE eder (performans için kasıtlı);
   React tarafı önce cloneSimState ile kopya almalıdır. */

import { subParent } from './flow.js';

export const initialSimState = () => ({
  running: false,
  speed: 10,          // 1x, 10x, 60x
  elapsed: 0,         // sim saniye
  pending: {},        // { [subOpId]: { [prevSubOpId]: count } } — merge için per-predecessor
  inProgress: {},     // { [subOpId]: { remainingSec, totalSec } }
  completed: {},      // { [subOpId]: count } — o istasyondan geçen parça sayısı
  exited: 0,          // hattın sonundan çıkan tamamlanmış parça
  history: [{ t: 0, exited: 0 }],  // çıktı trendi
  peakQueue: {},      // { [subOpId]: maxQueue } — en fazla ne kadar biriktiği
  // groupInbox: { [groupId]: { [predGroupId]: count } } — grup köprüleri (A2).
  // advanceSimStep başındaki `state.groupInbox ??= {}` guard'ı ile tembel kurulur;
  // eski kayıtlı state'ler ve eski şekil-testleri (toEqual) böylece bozulmaz.
});

/* Bir state kopyası hazırla (her key için derin) */
export function cloneSimState(prev) {
  const inProgress = {};
  for (const k of Object.keys(prev.inProgress)) inProgress[k] = { ...prev.inProgress[k] };
  const completed = { ...prev.completed };
  const pending = {};
  for (const k of Object.keys(prev.pending)) pending[k] = { ...prev.pending[k] };
  const peakQueue = { ...prev.peakQueue };
  const clone = { ...prev, inProgress, completed, pending, peakQueue, history: [...prev.history] };
  if (prev.groupInbox) {
    const groupInbox = {};
    for (const k of Object.keys(prev.groupInbox)) groupInbox[k] = { ...prev.groupInbox[k] };
    clone.groupInbox = groupInbox;
  }
  // Lojistik alanları (yalnız yerleşimli simülasyonda var)
  if (prev.transit) clone.transit = prev.transit.map(t => ({ ...t }));
  if (prev.outbox) clone.outbox = { ...prev.outbox };
  if (prev.blocked) clone.blocked = { ...prev.blocked };
  if (prev.blockedSec) clone.blockedSec = { ...prev.blockedSec };
  if (prev.starvedSec) clone.starvedSec = { ...prev.starvedSec };
  if (prev.bufferPeak) clone.bufferPeak = { ...prev.bufferPeak };
  if (prev.released) clone.released = { ...prev.released };
  if (prev.gatedSec) clone.gatedSec = { ...prev.gatedSec };
  if (prev.trace) clone.trace = { ...prev.trace, pos: { ...prev.trace.pos }, events: [...prev.trace.events] };
  if (prev.traces) clone.traces = [...prev.traces];
  if (prev.mstate) {
    const ms = {};
    for (const k of Object.keys(prev.mstate)) ms[k] = { ...prev.mstate[k], down: prev.mstate[k].down ? { ...prev.mstate[k].down } : null };
    clone.mstate = ms;
  }
  if (prev.downSec) clone.downSec = { ...prev.downSec };
  if (prev.spareBusy) clone.spareBusy = { ...prev.spareBusy };
  if (prev.events) clone.events = [...prev.events];
  return clone;
}

/* Tohumlu, saf rastgele sayı (0,1): aynı tohum + makine + sıra → aynı değer.
   Simülasyon tekrarlanabilir kalır; tohum değişince farklı bir "şans" oynanır. */
export function seededRandom(seed, key, k) {
  let h = 2166136261 >>> 0;
  const str = `${seed}|${key}|${k}`;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let t = (h + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return Math.min(1 - 1e-9, Math.max(1e-9, r));
}
const expSample = (mean, u) => -Math.log(u) * mean;

/* Ara stok alanının anlık doluluğu (lojistik): demet bekleyen + yoldaki +
   teslim edilip henüz tüketilmemiş parçalar. Görünüm de bunu kullanır. */
export function bufferOccupancy(state, lg, bufferId, bridges) {
  const b = lg?.buffers?.[bufferId];
  if (!b) return 0;
  let n = 0;
  const seenInbox = new Set();
  for (const key of b.keys) {
    n += state.outbox?.[key] || 0;
    for (const tr of state.transit || []) if (tr.key === key) n += tr.count;
    if (key.includes('>>')) {
      const [a, G] = key.split('>>');
      const g = bridges?.groupOf?.[a];
      const k2 = `${G}|${g}`;
      if (!seenInbox.has(k2)) { seenInbox.add(k2); n += Math.max(0, state.groupInbox?.[G]?.[g] || 0); }
    } else {
      const [a, bb] = key.split('>');
      n += Math.max(0, state.pending?.[bb]?.[a] || 0);
    }
  }
  return n;
}

/* Grup köprüleri (A2): ana-op DAG'ını simülasyona bağlar.
   entrySubs[G]  = G içinde grup-içi öncülü olmayan alt-oplar (giriş)
   terminalSubs[G] = G içinde grup-içi ardılı olmayan alt-oplar (çıkış)
   groupPreds[G] = G'yi besleyen ana-oplar
   groupOf[subId] = alt-opun KÖK grubu (iç içe alt-oplar kök ana-opa sayılır) */
export function buildGroupBridges(d) {
  const mainOps = d.mainOps || [];
  const subOps = d.subOps || [];
  const bridges = { entrySubs: {}, terminalSubs: {}, groupPreds: {}, groupOf: {}, joinType: {}, splitType: {}, hasGroups: mainOps.length > 0 };
  if (!bridges.hasGroups) return bridges;

  const mainIds = new Set(mainOps.map(m => m.id));
  // kök grup: parentId zinciri ana-opa çıkana dek (flow.rootMainId eşleniği; sadeleştirilmiş)
  const rootOf = (s) => {
    let cur = s, guard = 0;
    while (guard++ < 100) {
      const pid = subParent(cur);
      if (pid == null || mainIds.has(pid)) return pid ?? null;
      const parent = subOps.find(x => x.id === pid);
      if (!parent) return null;
      cur = parent;
    }
    return null;
  };
  subOps.forEach(s => { bridges.groupOf[s.id] = rootOf(s); });

  mainOps.forEach(m => {
    const members = subOps.filter(s => bridges.groupOf[s.id] === m.id);
    const memberIds = new Set(members.map(s => s.id));
    bridges.entrySubs[m.id] = members
      .filter(s => !members.some(x => (x.nextIds || []).includes(s.id)))
      .map(s => s.id);
    bridges.terminalSubs[m.id] = members
      .filter(s => !(s.nextIds || []).some(n => memberIds.has(n)))
      .map(s => s.id);
    bridges.groupPreds[m.id] = mainOps
      .filter(o => o.id !== m.id && (o.nextIds || []).includes(m.id))
      .map(o => o.id);
    bridges.joinType[m.id] = m.joinType || 'AND';
    bridges.splitType[m.id] = m.splitType || 'DUP';
  });
  return bridges;
}

/* Tek fiziksel adım — state'i MUTATE eder, yeniden ata */
export function advanceSimStep(state, d, dt) {
  state.groupInbox ??= {};   // eski kayıtlı state'lerde alan olmayabilir
  const maxSec = (d.settings?.netMinutes || 540) * 60;
  state.elapsed = Math.min(state.elapsed + dt, maxSec);

  // Grup köprüleri: mainOps yoksa hasGroups=false → köprüsüz eski davranış
  const bridges = buildGroupBridges(d);

  /* Lojistik (yerleşimli simülasyon): d.logistics varsa parçalar demet dolunca
     taşınır, yolda delaySec kadar kalır; ara stok doluysa kaynak istasyon BLOKE olur.
     Yoksa aktarım anlıktır (eski davranış, alanlar hiç oluşmaz). */
  const lg = d.logistics || null;
  const deliver = (tr) => {
    if (tr.kind === 'inbox') {
      if (!state.groupInbox[tr.target]) state.groupInbox[tr.target] = {};
      state.groupInbox[tr.target][tr.src] = (state.groupInbox[tr.target][tr.src] || 0) + tr.count;
    } else {
      if (!state.pending[tr.target]) state.pending[tr.target] = {};
      state.pending[tr.target][tr.src] = (state.pending[tr.target][tr.src] || 0) + tr.count;
    }
  };
  /* İzlenen parça (trace): kümelenmiş sayımlar üzerinde FIFO konumu tutulur —
     kuyrukta önündeki parça sayısı (ahead) tüketildikçe azalır. */
  const tr0 = state.trace && !state.trace.done ? state.trace : null;
  const tEvent = (kind, at, extra) => { if (tr0) tr0.events.push({ t: state.elapsed, kind, at, ...(extra || {}) }); };
  const queueNow = (kind, target, src) => Math.max(0, kind === 'inbox'
    ? (state.groupInbox[target]?.[src] || 0) : (state.pending[target]?.[src] || 0));
  const deliverTracked = (tr) => {
    if (tr0 && tr.traced) {
      const ahead = queueNow(tr.kind, tr.target, tr.src) + tr.count - 1;
      tr0.pos = { where: tr.kind, target: tr.target, src: tr.src, ahead };
      tEvent('queue', tr.target, { ahead });
    }
    deliver(tr);
  };
  if (lg) {
    state.transit ??= []; state.outbox ??= {}; state.blocked ??= {};
    state.blockedSec ??= {}; state.starvedSec ??= {}; state.bufferPeak ??= {};
    state.released ??= {}; state.gatedSec ??= {};
    const arrived = state.transit.filter(t => t.due <= state.elapsed);
    if (arrived.length) {
      state.transit = state.transit.filter(t => t.due > state.elapsed);
      arrived.forEach(deliverTracked);
    }
  }

  /* Arıza / planlı bakım / yedek makine (lojistik + lg.machines).
     Makine duruşu o operasyonun çalışan paralel istasyon sayısını düşürür;
     yedek makine uyumluysa (aynı tür) taşınıp kurulunca (swapSec) boşluğu kapatır. */
  const upFrac = {};
  if (lg?.machines && Object.keys(lg.machines).length) {
    state.mstate ??= {}; state.downSec ??= {}; state.spareBusy ??= {}; state.events ??= [];
    const ev = (e) => { state.events.push({ t: state.elapsed, ...e }); if (state.events.length > 80) state.events.shift(); };
    const seed = lg.seed ?? 1;
    const downBySub = {};
    for (const [id, m] of Object.entries(lg.machines)) {
      const ms = state.mstate[id] ??= { fails: 0, nextFail: m.mtbfSec > 0 ? expSample(m.mtbfSec, seededRandom(seed, id, 0)) : Infinity, maintDone: false, down: null };
      if (!ms.down) {
        let kind = null, until = 0;
        if (m.maintAtSec != null && !ms.maintDone && state.elapsed >= m.maintAtSec) {
          kind = 'bakim'; until = state.elapsed + (m.maintDurSec || 0); ms.maintDone = true;
        } else if (state.elapsed >= ms.nextFail) {
          kind = 'ariza'; until = state.elapsed + (m.mttrSec || 0); ms.fails += 1;
        }
        if (kind) {
          ms.down = { kind, since: state.elapsed, until, spareId: null, coverAt: null, covered: false };
          ev({ kind, itemId: id, subOpId: m.subOpId });
          // en yakın boşta uyumlu yedek
          const cands = (m.spares || []).filter(sp => !state.spareBusy[sp.id]).sort((a, b) => a.swapSec - b.swapSec);
          if (cands.length && until - state.elapsed > cands[0].swapSec) {
            ms.down.spareId = cands[0].id; ms.down.coverAt = state.elapsed + cands[0].swapSec;
            state.spareBusy[cands[0].id] = id;
            ev({ kind: 'yedek-yolda', itemId: id, spareId: cands[0].id, subOpId: m.subOpId });
          }
        }
      } else {
        const dn = ms.down;
        if (state.elapsed >= dn.until) {
          if (dn.spareId) delete state.spareBusy[dn.spareId];
          ev({ kind: dn.kind === 'bakim' ? 'bakim-bitti' : 'onarildi', itemId: id, subOpId: m.subOpId });
          if (dn.kind === 'ariza') ms.nextFail = state.elapsed + (m.mtbfSec > 0 ? expSample(m.mtbfSec, seededRandom(seed, id, ms.fails)) : Infinity);
          ms.down = null;
        } else if (dn.spareId && !dn.covered && state.elapsed >= dn.coverAt) {
          dn.covered = true;
          ev({ kind: 'yedek-devrede', itemId: id, spareId: dn.spareId, subOpId: m.subOpId });
        }
      }
      if (ms.down && !ms.down.covered) {
        state.downSec[id] = (state.downSec[id] || 0) + dt;
        downBySub[m.subOpId] = (downBySub[m.subOpId] || 0) + 1;
      }
    }
    for (const [sub, n] of Object.entries(downBySub)) {
      const total = Math.max(1, lg.stations?.[sub] || 1);
      upFrac[sub] = Math.max(0, (total - n) / total);
    }
  }
  // Bir aktarımı gönder: lojistik yoksa anında; varsa demete ekle, demet dolunca yola çıkar.
  const send = (key, kind, target, src) => {
    const tracedHere = !!(tr0 && tr0.pos.where === 'outbox' && tr0.pos.key === key);
    if (!lg) { deliverTracked({ kind, target, src, count: 1, traced: tracedHere }); return; }
    const link = lg.links?.[key];
    const bundle = lg.bundle || 1;
    state.outbox[key] = (state.outbox[key] || 0) + 1;
    if (state.outbox[key] < bundle) return;
    const count = state.outbox[key];
    state.outbox[key] = 0;
    const delay = link?.delaySec || 0;
    if (delay <= 0) deliverTracked({ kind, target, src, count, traced: tracedHere });
    else {
      state.transit.push({ key, kind, target, src, count, start: state.elapsed, due: state.elapsed + delay, traced: tracedHere || undefined });
      if (tracedHere) { tr0.pos = { where: 'transit', key }; tEvent('transit', key); }
    }
  };
  const bufferFull = (key) => {
    const bid = lg?.links?.[key]?.bufferId;
    if (!bid) return false;
    return bufferOccupancy(state, lg, bid, bridges) + 1 > lg.buffers[bid].capacity;
  };

  // Bir hedefin kuyruk uzunluğu (SPLIT en-kısa-kuyruk seçimi için) — negatifler sayılmaz.
  const pendQueue = (nId) => Object.values(state.pending[nId] || {}).reduce((a, v) => a + (v > 0 ? v : 0), 0);
  const inboxQueue = (gId) => Object.values(state.groupInbox[gId] || {}).reduce((a, v) => a + (v > 0 ? v : 0), 0);
  // Adaylardan en kısa kuyruklu; eşitlikte listedeki İLK (deterministik).
  const pickShortest = (cands, qFn) => cands.reduce((best, n) => qFn(n) < qFn(best) ? n : best);

  // prev map: op.id → [predecessor id'leri]
  const prevMap = {};
  for (const op of d.subOps) {
    if (!prevMap[op.id]) prevMap[op.id] = [];
  }
  for (const op of d.subOps) {
    for (const nId of (op.nextIds || [])) {
      if (!prevMap[nId]) prevMap[nId] = [];
      prevMap[nId].push(op.id);
    }
  }

  // 1) İşlenen parçaları ilerlet ve biterse sonraki istasyonlara geçir
  const justDone = [];
  for (const opId of Object.keys(state.inProgress)) {
    state.inProgress[opId].remainingSec -= dt * (upFrac[opId] ?? 1);   // makine duruşu ilerlemeyi yavaşlatır/durdurur
    if (state.inProgress[opId].remainingSec <= 0) justDone.push(opId);
  }
  for (const opId of justDone) {
    const op = d.subOps.find(x => x.id === opId);
    // Hedefleri belirle: [{ key, kind, target, src }] — boşsa hattan çıkış
    let sends = [];
    if (!op || !op.nextIds || op.nextIds.length === 0) {
      // Grup-içi ardıl yok (terminal alt-op): grup köprüsüne bak.
      const g = bridges.hasGroups && op ? bridges.groupOf[op.id] : null;
      const mainOp = g != null ? (d.mainOps || []).find(m => m.id === g) : null;
      const groupNexts = mainOp?.nextIds || [];
      if (groupNexts.length > 0) {
        // Kaynak grup böler mi? SPLIT + >1 ardıl → tek hedefe (en kısa inbox); değilse hepsi (DUP).
        const gSplit = (bridges.splitType[g] || 'DUP') === 'SPLIT' && groupNexts.length > 1;
        const dests = gSplit ? [pickShortest(groupNexts, inboxQueue)] : groupNexts;
        sends = dests.map(t => ({ key: `${opId}>>${t}`, kind: 'inbox', target: t, src: g }));
      }
    } else {
      // op böler mi? SPLIT + >1 ardıl → tek hedefe (en kısa kuyruk); değilse hepsi (DUP).
      const opSplit = (op.splitType || 'DUP') === 'SPLIT' && op.nextIds.length > 1;
      const dests = opSplit ? [pickShortest(op.nextIds, pendQueue)] : op.nextIds;
      sends = dests.map(nId => ({ key: `${opId}>${nId}`, kind: 'pend', target: nId, src: opId }));
    }
    // Ara stok dolu → istasyon parçayı elinde tutar (bloke), bir sonraki adımda yeniden dener.
    if (lg && sends.some(x => bufferFull(x.key))) {
      state.inProgress[opId].remainingSec = 0;
      if (!state.blocked[opId] && tr0 && tr0.pos.where === 'process' && tr0.pos.op === opId) tEvent('blocked', opId);
      state.blocked[opId] = true;
      state.blockedSec[opId] = (state.blockedSec[opId] || 0) + dt;
      continue;
    }
    if (lg) delete state.blocked[opId];
    delete state.inProgress[opId];
    state.completed[opId] = (state.completed[opId] || 0) + 1;
    const isTraced = !!(tr0 && tr0.pos.where === 'process' && tr0.pos.op === opId);
    if (sends.length === 0) {
      state.exited += 1;          // hattan çıkış (eski davranış)
      if (isTraced) {
        tEvent('exit', opId);
        tr0.done = true;
        tr0.pos = { where: 'exit' };
        state.traces = [...(state.traces || []), tr0].slice(-5);
      }
    }
    sends.forEach((x, i) => {
      if (isTraced && i === 0) { tr0.pos = { where: 'outbox', key: x.key }; }
      send(x.key, x.kind, x.target, x.src);
      if (isTraced && i === 0 && tr0.pos.where === 'outbox') tEvent('bundle', x.key);
    });
  }

  // 2) Boşta kalan istasyonları başlat
  for (const op of d.subOps) {
    if (state.inProgress[op.id]) continue;
    if (!op.cycleTime || op.cycleTime <= 0) continue;
    const prevs = prevMap[op.id] || [];               // GLOBAL — mevcut davranış
    const g = bridges.hasGroups ? bridges.groupOf[op.id] : null;
    const groupPreds = g != null ? (bridges.groupPreds[g] || []) : [];
    const needsInbox = g != null
      && (bridges.entrySubs[g] || []).includes(op.id)
      && groupPreds.length > 0;

    /* İKİ KAPI birlikte (çapraz-grup doğrudan bağ + grup kenarı aynı girişte
       birleşebilir — SubOpModal buna izin veriyor):
       Kapı 1 (grup kutusu): needsInbox ise joinType'a göre inbox koşulu.
       Kapı 2 (doğrudan öncüller): prevs varsa mevcut pending koşulu.
       canStart = kapı1 VE kapı2; başlarken İKİSİNDEN de tüketilir —
       hiçbir taraf sınırsız birikmez (sessiz parça kaybı yok). */
    const jt = g != null ? (bridges.joinType[g] || 'AND') : 'AND';
    let gate1 = true;
    let dupPid = null;
    if (needsInbox) {
      const inbox = state.groupInbox[g] || {};
      if (jt === 'DUP') {
        dupPid = groupPreds.find(p => (inbox[p] || 0) >= 1) ?? null;
        gate1 = dupPid != null;
      } else {
        // AND (kit mantığı): HER öncül gruptan ≥1 parça
        gate1 = groupPreds.every(pid => (inbox[pid] || 0) >= 1);
      }
    }

    const pend = state.pending[op.id] || {};
    // Alt-op join'i grup köprüsüyle aynı mantık (§3b): DUP → herhangi bir öncülden ≥1;
    // AND (varsayılan) → her öncülden ≥1. Başlarken yalnız tüketilen öncül(ler) düşülür.
    const subJt = op.joinType || 'AND';
    let subDupPid = null;
    let gate2;
    if (prevs.length === 0) {
      gate2 = true;                                    // serbest kaynak / köprüsüz eski davranış
    } else if (subJt === 'DUP') {
      subDupPid = prevs.find(pid => (pend[pid] || 0) >= 1) ?? null;
      gate2 = subDupPid != null;
    } else {
      gate2 = prevs.every(pid => (pend[pid] || 0) >= 1);
    }

    // Tüm makineleri duruşta olan operasyon başlayamaz.
    const machinesDown = upFrac[op.id] === 0;
    // Giriş (kesim serbest bırakma) kontrolü — yalnız kaynak istasyonlar (girdisi olmayan).
    const isSource = prevs.length === 0 && !needsInbox;
    let gated = false;
    if (lg && isSource && lg.release && lg.release.mode !== 'free') {
      const rel = state.released[op.id] || 0;
      if (lg.release.mode === 'rate') {
        const allowed = Math.floor(state.elapsed * (lg.release.perHour || 0) / 3600) + 1;
        gated = rel >= allowed;
      } else if (lg.release.mode === 'conwip') {
        gated = rel - state.exited >= (lg.release.wipCap || 1);
      }
    }

    if (gate1 && gate2 && !gated && !machinesDown) {
      // izlenen parça bu tüketimle işleme girdi mi?
      const consumeTrace = (where, target, src) => {
        if (!tr0 || tr0.pos.where !== where || tr0.pos.target !== target || tr0.pos.src !== src) return;
        tr0.pos.ahead -= 1;
        if (tr0.pos.ahead < 0) { tr0.pos = { where: 'process', op: op.id }; tEvent('process', op.id); }
      };
      if (needsInbox) {
        const inbox = state.groupInbox[g];             // gate1 açık → mutlaka mevcut
        if (jt === 'DUP') { inbox[dupPid] -= 1; consumeTrace('inbox', g, dupPid); }
        else for (const pid of groupPreds) { inbox[pid] -= 1; consumeTrace('inbox', g, pid); }
      }
      if (prevs.length > 0) {
        if (!state.pending[op.id]) state.pending[op.id] = {};
        if (subJt === 'DUP') {
          state.pending[op.id][subDupPid] = (state.pending[op.id][subDupPid] || 0) - 1;
          consumeTrace('pend', op.id, subDupPid);
        } else {
          for (const pid of prevs) { state.pending[op.id][pid] = (state.pending[op.id][pid] || 0) - 1; consumeTrace('pend', op.id, pid); }
        }
      }
      if (lg && isSource) {
        state.released[op.id] = (state.released[op.id] || 0) + 1;
        // izleme isteği bu kaynaktaysa yeni parçayı izlemeye al
        if (state.traceReq === op.id && !(state.trace && !state.trace.done)) {
          state.trace = { id: `${op.id}@${Math.round(state.elapsed)}`, src: op.id, startedAt: state.elapsed, done: false,
            pos: { where: 'process', op: op.id }, events: [{ t: state.elapsed, kind: 'process', at: op.id }] };
          state.traceReq = null;
        }
      }
      // Yerleşimde aynı operasyonun N paralel istasyonu varsa efektif çevrim ct/N.
      const par = lg ? Math.max(1, lg.stations?.[op.id] || Math.round(op.stationCount || 1)) : 1;
      const ct = op.cycleTime / par;
      state.inProgress[op.id] = { remainingSec: ct, totalSec: ct };
    } else if (lg) {
      if (gated && gate1 && gate2) state.gatedSec[op.id] = (state.gatedSec[op.id] || 0) + dt;   // giriş kontrolü bekletti
      else if (!machinesDown) state.starvedSec[op.id] = (state.starvedSec[op.id] || 0) + dt;   // girdi bekliyor (aç)
    }
  }

  // 3) Zirve kuyruk boyutlarını güncelle (giriş alt-oplarında inbox da kuyruğa dahil)
  for (const op of d.subOps) {
    const pend = state.pending[op.id] || {};
    let q = Object.values(pend).reduce((a, v) => a + (v > 0 ? v : 0), 0);
    const g = bridges.hasGroups ? bridges.groupOf[op.id] : null;
    if (g != null && (bridges.entrySubs[g] || []).includes(op.id)) {
      const inbox = state.groupInbox[g] || {};
      q += Object.values(inbox).reduce((a, v) => a + (v > 0 ? v : 0), 0);
    }
    if (q > (state.peakQueue[op.id] || 0)) state.peakQueue[op.id] = q;
  }
  if (lg) {
    for (const bid of Object.keys(lg.buffers || {})) {
      const occ = bufferOccupancy(state, lg, bid, bridges);
      if (occ > (state.bufferPeak[bid] || 0)) state.bufferPeak[bid] = occ;
    }
  }

  return state;
}

/* Hızlı Bitir — vardiyanın sonuna koş; prev'i değiştirmez, yeni state döner */
export function fastForward(prev, d) {
  const maxSec = (d.settings?.netMinutes || 540) * 60;
  const state = cloneSimState(prev);
  state.running = true;
  const DT = 5;
  const maxIterations = Math.ceil((maxSec - state.elapsed) / DT) + 10;
  for (let i = 0; i < maxIterations; i++) {
    if (state.elapsed >= maxSec) break;
    advanceSimStep(state, d, DT);
    // Her 60 sim saniyesinde bir history noktası
    const lastT = state.history.length > 0 ? state.history[state.history.length - 1].t : -9999;
    if (state.elapsed - lastT >= 60) {
      state.history.push({ t: state.elapsed, exited: state.exited });
    }
  }
  state.running = false;
  // Son nokta
  const lastT = state.history.length > 0 ? state.history[state.history.length - 1].t : -1;
  if (lastT !== state.elapsed) {
    state.history.push({ t: state.elapsed, exited: state.exited });
  }
  return state;
}
