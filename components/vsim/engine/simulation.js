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
  return clone;
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
    state.inProgress[opId].remainingSec -= dt;
    if (state.inProgress[opId].remainingSec <= 0) justDone.push(opId);
  }
  for (const opId of justDone) {
    delete state.inProgress[opId];
    state.completed[opId] = (state.completed[opId] || 0) + 1;
    const op = d.subOps.find(x => x.id === opId);
    if (!op || !op.nextIds || op.nextIds.length === 0) {
      // Grup-içi ardıl yok (terminal alt-op): grup köprüsüne bak.
      const g = bridges.hasGroups && op ? bridges.groupOf[op.id] : null;
      const mainOp = g != null ? (d.mainOps || []).find(m => m.id === g) : null;
      const groupNexts = mainOp?.nextIds || [];
      if (groupNexts.length === 0) {
        state.exited += 1;                 // grup ardılı da yok → hattan çıkış (eski davranış)
      } else {
        // Kaynak grup böler mi? SPLIT + >1 ardıl → tek hedefe (en kısa inbox); değilse hepsi (DUP).
        const gSplit = (bridges.splitType[g] || 'DUP') === 'SPLIT' && groupNexts.length > 1;
        const dests = gSplit ? [pickShortest(groupNexts, inboxQueue)] : groupNexts;
        for (const t of dests) {           // parça hatta devam ediyor → ardıl grupların inbox'ına
          if (!state.groupInbox[t]) state.groupInbox[t] = {};
          state.groupInbox[t][g] = (state.groupInbox[t][g] || 0) + 1;
        }
      }
    } else {
      // op böler mi? SPLIT + >1 ardıl → tek hedefe (en kısa kuyruk); değilse hepsi (DUP).
      const opSplit = (op.splitType || 'DUP') === 'SPLIT' && op.nextIds.length > 1;
      const dests = opSplit ? [pickShortest(op.nextIds, pendQueue)] : op.nextIds;
      for (const nId of dests) {
        if (!state.pending[nId]) state.pending[nId] = {};
        state.pending[nId][opId] = (state.pending[nId][opId] || 0) + 1;
      }
    }
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

    if (gate1 && gate2) {
      if (needsInbox) {
        const inbox = state.groupInbox[g];             // gate1 açık → mutlaka mevcut
        if (jt === 'DUP') inbox[dupPid] -= 1;
        else for (const pid of groupPreds) inbox[pid] -= 1;
      }
      if (prevs.length > 0) {
        if (!state.pending[op.id]) state.pending[op.id] = {};
        if (subJt === 'DUP') {
          state.pending[op.id][subDupPid] = (state.pending[op.id][subDupPid] || 0) - 1;
        } else {
          for (const pid of prevs) state.pending[op.id][pid] = (state.pending[op.id][pid] || 0) - 1;
        }
      }
      state.inProgress[op.id] = { remainingSec: op.cycleTime, totalSec: op.cycleTime };
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
