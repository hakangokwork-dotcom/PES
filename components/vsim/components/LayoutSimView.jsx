import React, { useMemo, useRef, useState, useEffect } from 'react';
import { SYMBOLS, itemRect, itemFootprint, layoutMetrics, DEFAULT_FLOOR } from '../engine/layout.js';
import { buildGroupBridges, bufferOccupancy } from '../engine/simulation.js';
import { LayoutDefs, LayoutItem, INK } from './LayoutSymbols.jsx';

/* Simülasyon sekmesi · Yerleşim görünümü — canlı zemin.
   Salt okunur: aktif yerleşimi çizer, simState'ten istasyon durumu, kuyruk
   (demet kareleri), yarım demet, yoldaki demetler, ara stok doluluğu, birikim
   ısısı ve birleşme noktasında bekleneni gösterir. Tick'le yeniden render olur. */

const PX_PER_M = 40;
const fmt = (v, d = 0) => Number(v || 0).toFixed(d).replace('.', ',');

/* Çoklu doğru üzerinde t∈[0,1] konumundaki nokta */
function pointAlong(path, t) {
  if (!path || path.length < 2) return path?.[0] || { x: 0, y: 0 };
  const seg = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const L = Math.abs(path[i + 1].x - path[i].x) + Math.abs(path[i + 1].y - path[i].y);
    seg.push(L); total += L;
  }
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? d / seg[i] : 0;
      return { x: path[i].x + (path[i + 1].x - path[i].x) * f, y: path[i].y + (path[i + 1].y - path[i].y) * f };
    }
    d -= seg[i];
  }
  return path[path.length - 1];
}

export default function LayoutSimView({ data, layout, simState, onTrace, onClearTrace }) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const lg = data.logistics;
  const floor = layout?.floor || DEFAULT_FLOOR;
  const items = layout?.items || [];
  const bundle = lg?.bundle || 1;

  const statics = useMemo(() => {
    const m = layoutMetrics(data, layout);
    const bridges = buildGroupBridges({ mainOps: data.mainOps || [], subOps: data.subOps || [] });
    const mainById = new Map((data.mainOps || []).map(x => [x.id, x]));
    const subById = new Map((data.subOps || []).map(x => [x.id, x]));
    const itemsBySub = new Map();
    for (const it of items) if (it.subOpId) {
      if (!itemsBySub.has(it.subOpId)) itemsBySub.set(it.subOpId, []);
      itemsBySub.get(it.subOpId).push(it);
    }
    return { m, bridges, mainById, subById, itemsBySub };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.mainOps, data.subOps, layout]);
  const { m, bridges, mainById, subById, itemsBySub } = statics;

  const zoom = Math.min((size.w - 40) / (floor.w * PX_PER_M), (size.h - 40) / (floor.h * PX_PER_M));
  const scale = PX_PER_M * Math.max(0.1, zoom);
  const ox = (size.w - floor.w * scale) / 2, oy = (size.h - floor.h * scale) / 2;

  /* --- canlı türetmeler --- */
  const queueOf = (subId) => {
    let q = Object.values(simState.pending?.[subId] || {}).reduce((a, v) => a + (v > 0 ? v : 0), 0);
    const g = bridges.groupOf[subId];
    if (g != null && (bridges.entrySubs[g] || []).includes(subId)) {
      q += Object.values(simState.groupInbox?.[g] || {}).reduce((a, v) => a + (v > 0 ? v : 0), 0);
    }
    return q;
  };
  const stateOf = (subId) => {
    if (simState.blocked?.[subId]) return 'blocked';
    if (simState.inProgress?.[subId]) return 'work';
    return simState.elapsed > 0 ? 'starved' : undefined;
  };
  // makine (öğe) bazında durum: arıza/bakım (yedekle kapanmadıysa) önce gelir
  const itemState = (it) => {
    const dn = simState.mstate?.[it.id]?.down;
    if (dn && !dn.covered) return dn.kind === 'bakim' ? 'maint' : 'down';
    if (it.isSpare && simState.spareBusy?.[it.id]) return 'work';
    return it.subOpId ? stateOf(it.subOpId) : undefined;
  };
  const clock = (sec) => {
    const t = 8 * 60 + sec / 60;
    return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  };
  const itemById = new Map(items.map(i => [i.id, i]));
  const nameOfItem = (id) => { const it = itemById.get(id); const s = it?.subOpId && subById.get(it.subOpId); return s?.name || it?.name || SYMBOLS[it?.type]?.name || id; };
  const EVENT_TEXT = {
    ariza: 'arızalandı', bakim: 'bakıma girdi', 'bakim-bitti': 'bakımdan çıktı', onarildi: 'onarıldı',
    'yedek-yolda': 'için yedek yola çıktı', 'yedek-devrede': 'yerine yedek devrede',
  };
  const sources = (data.subOps || []).filter(s => itemsBySub.has(s.id) && !(data.subOps || []).some(x => (x.nextIds || []).includes(s.id))
    && !((bridges.groupPreds[bridges.groupOf[s.id]] || []).length && (bridges.entrySubs[bridges.groupOf[s.id]] || []).includes(s.id)));
  const [traceSrc, setTraceSrc] = useState('');
  const nameOfNode = (id) => subById.get(id)?.name || mainById.get(id)?.name || id;
  const trace = simState.trace || null;
  const traceRows = (() => {
    if (!trace) return [];
    const ev = trace.events;
    const rows = [];
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      const end = i + 1 < ev.length ? ev[i + 1].t : (trace.done ? e.t : simState.elapsed);
      const dur = Math.max(0, end - e.t);
      let label = '', wait = false;
      if (e.kind === 'process') label = `İşlem · ${nameOfNode(e.at)}`;
      else if (e.kind === 'bundle') { label = 'Demet dolmasını bekliyor'; wait = true; }
      else if (e.kind === 'transit') label = 'Yolda';
      else if (e.kind === 'queue') { label = `Kuyruk · ${nameOfNode(e.at)} (önünde ${e.ahead})`; wait = true; }
      else if (e.kind === 'blocked') { label = 'Bloke (ara stok dolu)'; wait = true; }
      else if (e.kind === 'exit') label = 'Hattan çıktı';
      rows.push({ t: e.t, label, dur, wait, kind: e.kind });
    }
    return rows;
  })();
  const traceTotal = trace ? ((trace.done ? trace.events[trace.events.length - 1].t : simState.elapsed) - trace.startedAt) : 0;
  const traceWait = traceRows.filter(r => r.wait).reduce((a, r) => a + r.dur, 0);
  const fmtDur = (sec) => sec >= 3600 ? `${Math.floor(sec / 3600)} sa ${Math.round((sec % 3600) / 60)} dk` : sec >= 60 ? `${Math.round(sec / 60)} dk` : `${Math.round(sec)} sn`;
  // izlenen parçanın zemindeki yeri
  const tracePoint = (() => {
    if (!trace || trace.done) return null;
    const pos = trace.pos;
    const atSub = (sub) => { const its = itemsBySub.get(sub); if (!its) return null; const r = itemRect(its[0]); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
    if (pos.where === 'process') return atSub(pos.op);
    if (pos.where === 'pend') return atSub(pos.target);
    if (pos.where === 'inbox') { const e = (bridges.entrySubs[pos.target] || [])[0]; return e ? atSub(e) : null; }
    if (pos.where === 'outbox') return atSub(pos.key.split('>')[0]);
    if (pos.where === 'transit') { const tr = (simState.transit || []).find(x => x.traced); if (tr) { const lk = lg?.links?.[tr.key]; return pointAlong(lk?.path, tr.due > tr.start ? (simState.elapsed - tr.start) / (tr.due - tr.start) : 1); } }
    return null;
  })();
  // AND birleşmesinde eksik olan öncül grup(lar)
  const waitingFor = (subId) => {
    const g = bridges.groupOf[subId];
    if (g == null || !(bridges.entrySubs[g] || []).includes(subId)) return null;
    const preds = bridges.groupPreds[g] || [];
    if (preds.length < 2 || (bridges.joinType[g] || 'AND') !== 'AND') return null;
    const inbox = simState.groupInbox?.[g] || {};
    const have = preds.filter(p => (inbox[p] || 0) > 0);
    const miss = preds.filter(p => (inbox[p] || 0) <= 0);
    if (!have.length || !miss.length) return null;
    return { miss: miss.map(p => mainById.get(p)?.name || p), have: have.map(p => ({ name: mainById.get(p)?.name || p, n: inbox[p] })) };
  };

  const stationRows = [];
  for (const [subId, its] of itemsBySub) {
    const s = subById.get(subId);
    if (!s) continue;
    const r = itemRect(its[0]);
    stationRows.push({ subId, s, its, q: queueOf(subId), st: stateOf(subId), fp: itemFootprint(its[0]), center: { x: r.x + r.w / 2, y: r.y + r.h / 2 } });
  }
  const outboxBySub = {};
  for (const [key, n] of Object.entries(simState.outbox || {})) {
    if (!n) continue;
    const a = key.split('>')[0];
    outboxBySub[a] = (outboxBySub[a] || 0) + n;
  }
  const transit = (simState.transit || []).map(tr => {
    const link = lg?.links?.[tr.key];
    const t = tr.due > tr.start ? (simState.elapsed - tr.start) / (tr.due - tr.start) : 1;
    const src = tr.key.split('>')[0];
    const g = bridges.groupOf[src];
    return { ...tr, p: pointAlong(link?.path, t), color: mainById.get(g)?.color || '#64748b' };
  });
  const buffers = Object.entries(lg?.buffers || {}).map(([id, b]) => {
    const it = items.find(i => i.id === id);
    const occ = bufferOccupancy(simState, lg, id, bridges);
    return { id, it, name: b.name, cap: b.capacity, occ, peak: simState.bufferPeak?.[id] || 0 };
  });
  const totals = {
    queue: stationRows.reduce((a, r) => a + r.q, 0),
    transit: transit.reduce((a, t) => a + t.count, 0),
    outbox: Object.values(outboxBySub).reduce((a, v) => a + v, 0),
    working: Object.keys(simState.inProgress || {}).length,
    blocked: Object.keys(simState.blocked || {}).length,
  };
  const wip = totals.queue + totals.transit + totals.outbox + totals.working;
  const maxQ = Math.max(1, ...stationRows.map(r => r.q));
  const topQueues = [...stationRows].filter(r => r.q > 0).sort((a, b) => b.q - a.q).slice(0, 6);
  const downBySub = {};
  for (const [id, sec] of Object.entries(simState.downSec || {})) {
    const sub = itemById.get(id)?.subOpId;
    if (sub) downBySub[sub] = Math.max(downBySub[sub] || 0, sec);
  }
  const lostRows = [...stationRows]
    .map(r => ({ ...r, blockedSec: simState.blockedSec?.[r.subId] || 0, starvedSec: simState.starvedSec?.[r.subId] || 0, downSec: downBySub[r.subId] || 0 }))
    .filter(r => r.blockedSec > 0 || r.starvedSec > 0 || r.downSec > 0)
    .sort((a, b) => (b.blockedSec + b.starvedSec + b.downSec) - (a.blockedSec + a.starvedSec + a.downSec)).slice(0, 6);
  const elapsed = Math.max(1, simState.elapsed);

  if (!layout) {
    return <div className="py-16 text-center text-sm text-ink-soft">Yerleşim yok — önce Yerleşim sekmesinde atölyeyi kur.</div>;
  }

  return (
    <div className="flex gap-3" style={{ height: 'calc(100vh - 330px)', minHeight: 520 }}>
      <div ref={wrapRef} className="relative flex-1 min-w-0 rounded-lg border border-line bg-[#EEF1F3] overflow-hidden">
        <svg width="100%" height="100%" className="block select-none">
          <LayoutDefs />
          <defs>
            <radialGradient id="ly-heat">
              <stop offset="0%" stopColor="#C2410C" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#C2410C" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g transform={`translate(${ox} ${oy}) scale(${scale})`}>
            <rect x={0} y={0} width={floor.w} height={floor.h} fill="#FFFFFF" />
            <rect x={0} y={0} width={floor.w} height={floor.h} fill="url(#ly-grid)" />
            <rect x={0} y={0} width={floor.w} height={floor.h} fill="none" stroke={INK} strokeWidth={0.12} />

            {/* birikim ısısı */}
            {stationRows.filter(r => r.q > 0).map(r => {
              const rad = 0.8 + 2.2 * Math.sqrt(r.q / maxQ);
              return <circle key={`h${r.subId}`} cx={r.center.x} cy={r.center.y} r={rad} fill="url(#ly-heat)" />;
            })}

            {/* soluk spagetti */}
            <g opacity={0.25} style={{ pointerEvents: 'none' }}>
              {m.routes.map(r => (
                <polyline key={r.key} points={r.path.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={r.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              ))}
            </g>

            {[...items].sort((a, b) => (SYMBOLS[a.type]?.kind === 'machine' ? 1 : 0) - (SYMBOLS[b.type]?.kind === 'machine' ? 1 : 0)).map(it => {
              const st = itemState(it);
              const s = it.subOpId ? subById.get(it.subOpId) : null;
              return (
                <LayoutItem key={it.id} item={it}
                  station={s ? { label: '', title: `${s.name} · kuyruk ${queueOf(it.subOpId)}`, hasOperator: !!s.operatorId, state: st } : (it.isSpare ? { label: '', state: st } : null)} />
              );
            })}

            {/* ara stok doluluğu */}
            {buffers.filter(b => b.it).map(b => {
              const r = itemRect(b.it);
              const f = Math.min(1, b.occ / b.cap);
              const c = f >= 0.9 ? '#A61B1B' : f >= 0.7 ? '#C2410C' : '#197A56';
              return (
                <g key={b.id} style={{ pointerEvents: 'none' }}>
                  <rect x={r.x} y={r.y + r.h - 0.14} width={r.w} height={0.14} fill="#E6E9EC" />
                  <rect x={r.x} y={r.y + r.h - 0.14} width={r.w * f} height={0.14} fill={c} />
                  <text x={r.x + r.w / 2} y={r.y - 0.12} textAnchor="middle" fontSize={0.26} fontWeight="700" fill={c} paintOrder="stroke" stroke="#fff" strokeWidth={0.06}>
                    {b.occ}/{b.cap}
                  </text>
                </g>
              );
            })}

            {/* kuyruk demetleri (giriş tarafı) + yarım demet (çıkış tarafı) */}
            {stationRows.map(r => {
              const bundles = Math.ceil(r.q / bundle);
              const shown = Math.min(bundles, 8);
              const x0 = r.fp.x - 0.1;
              const waiting = waitingFor(r.subId);
              const out = outboxBySub[r.subId] || 0;
              return (
                <g key={`q${r.subId}`} style={{ pointerEvents: 'none' }}>
                  {Array.from({ length: shown }).map((_, i) => (
                    <rect key={i} x={x0 - 0.3 - (i % 2) * 0.28} y={r.fp.y + 0.05 + Math.floor(i / 2) * 0.28} width={0.24} height={0.24} rx={0.03}
                      fill="#F2CF5B" stroke="#8A6A12" strokeWidth={0.02} />
                  ))}
                  {r.q > 0 && (
                    <text x={x0 - 0.3} y={r.fp.y - 0.05} textAnchor="middle" fontSize={0.24} fontWeight="700" fill={r.q >= maxQ * 0.8 && r.q > bundle ? '#A61B1B' : INK} paintOrder="stroke" stroke="#fff" strokeWidth={0.06}>
                      {r.q}
                    </text>
                  )}
                  {out > 0 && (
                    <g>
                      <rect x={r.fp.x + r.fp.w + 0.08} y={r.fp.y + 0.05} width={0.24} height={0.24} rx={0.03} fill="#fff" stroke="#8A6A12" strokeWidth={0.02} />
                      <rect x={r.fp.x + r.fp.w + 0.08} y={r.fp.y + 0.05 + 0.24 * (1 - Math.min(1, out / bundle))} width={0.24} height={0.24 * Math.min(1, out / bundle)} fill="#F2CF5B" />
                    </g>
                  )}
                  {waiting && (
                    <g>
                      <rect x={r.center.x - 1.6} y={Math.max(0.1, r.fp.y - 0.75)} width={3.2} height={0.42} rx={0.08} fill="#fff" stroke="#A61B1B" strokeWidth={0.04} />
                      <text x={r.center.x} y={Math.max(0.1, r.fp.y - 0.75) + 0.28} textAnchor="middle" fontSize={0.22} fontWeight="700" fill="#7A1414">
                        ◆ {waiting.miss.join(', ')} bekleniyor
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* duruş işaretleri + yedek bağlantısı */}
            {items.map(it => {
              const dn = simState.mstate?.[it.id]?.down;
              if (!dn) return null;
              const r = itemRect(it);
              const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
              const col = dn.kind === 'bakim' ? '#B7791F' : '#A61B1B';
              const sp = dn.spareId && itemById.get(dn.spareId);
              const spc = sp ? (() => { const q = itemRect(sp); return { x: q.x + q.w / 2, y: q.y + q.h / 2 }; })() : null;
              return (
                <g key={`d${it.id}`} style={{ pointerEvents: 'none' }}>
                  <rect x={r.x - 0.12} y={r.y - 0.12} width={r.w + 0.24} height={r.h + 0.24} rx={0.08} fill="none" stroke={dn.covered ? '#1F5FAE' : col} strokeWidth={0.07} />
                  <text x={c.x} y={r.y - 0.2} textAnchor="middle" fontSize={0.22} fontWeight="800" fill={dn.covered ? '#15457F' : col} paintOrder="stroke" stroke="#fff" strokeWidth={0.06}>
                    {dn.covered ? 'YEDEK DEVREDE' : dn.kind === 'bakim' ? 'BAKIM' : 'ARIZA'} · {Math.max(0, Math.ceil((dn.until - simState.elapsed) / 60))} dk
                  </text>
                  {spc && <line x1={spc.x} y1={spc.y} x2={c.x} y2={c.y} stroke="#1F5FAE" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
                </g>
              );
            })}

            {/* izlenen parça */}
            {tracePoint && (
              <g transform={`translate(${tracePoint.x} ${tracePoint.y})`} style={{ pointerEvents: 'none' }}>
                <circle r={0.5} fill="none" stroke={INK} strokeWidth={0.08} />
                <circle r={0.72} fill="none" stroke={INK} strokeWidth={0.03} strokeDasharray="0.1 0.08" />
              </g>
            )}

            {/* yoldaki demetler */}
            {transit.map((t, i) => (
              <g key={i} transform={`translate(${t.p.x} ${t.p.y})`} style={{ pointerEvents: 'none' }}>
                <rect x={-0.16} y={-0.16} width={0.32} height={0.32} rx={0.04} fill={t.color} stroke={t.traced ? INK : '#fff'} strokeWidth={t.traced ? 0.08 : 0.04} />
              </g>
            ))}
          </g>
        </svg>
        <div className="absolute left-3 bottom-3 flex flex-wrap gap-3 rounded-md bg-surface/95 border border-line px-3 py-1.5 text-[11px] text-ink">
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ background: '#1F7A4D' }} />çalışıyor</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ background: '#B9B3A8' }} />aç (girdi bekliyor)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ background: '#C2410C' }} />bloke (ara stok dolu)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ background: '#A61B1B' }} />arıza</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ background: '#B7791F' }} />bakım</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border" style={{ background: '#F2CF5B', borderColor: '#8A6A12' }} />1 kare = {bundle} adetlik demet</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#1f5fae' }} />yoldaki demet</span>
        </div>
      </div>

      <aside className="w-72 flex-shrink-0 rounded-lg border border-line bg-surface p-3 overflow-y-auto flex flex-col gap-4">
        <section className="grid grid-cols-2 gap-2">
          <Tile label="Toplam ara mamul" value={wip} hint="adet (kuyruk+yol+demet+işlenen)" />
          <Tile label="Yolda" value={totals.transit} hint={`${transit.length} demet`} />
          <Tile label="Demet bekleyen" value={totals.outbox} hint="yarım demetler" />
          <Tile label="Bloke istasyon" value={totals.blocked} hint="ara stok dolu" tone={totals.blocked ? 'warn' : null} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold tracking-wider text-ink-soft">PARÇA TAKİBİ</h3>
          {onTrace && (
            <div className="flex gap-1.5">
              <select value={traceSrc} onChange={e => setTraceSrc(e.target.value)} aria-label="İzlenecek parçanın çıktığı kaynak istasyon"
                className="h-9 flex-1 min-w-0 rounded-lg border border-line bg-surface px-2 text-xs text-ink">
                <option value="">Kaynak seç…</option>
                {sources.map(s => <option key={s.id} value={s.id}>{mainById.get(bridges.groupOf[s.id])?.name ? `${mainById.get(bridges.groupOf[s.id]).name} · ` : ''}{s.name}</option>)}
              </select>
              <button disabled={!traceSrc} onClick={() => onTrace(traceSrc)}
                className="h-9 px-3 rounded-lg bg-accent hover:bg-accent-strong text-white text-xs font-semibold disabled:opacity-40">İzle</button>
            </div>
          )}
          {simState.traceReq && <p className="text-[11px] text-ink-soft">Sıradaki parça kesimden çıkınca izlenecek — simülasyonu başlat.</p>}
          {trace && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-ink">{trace.done ? 'Tamamlandı' : 'Yolda'} · {fmtDur(traceTotal)}</span>
                <span className="font-mono text-warn">bekleme %{fmt(traceTotal ? 100 * traceWait / traceTotal : 0)}</span>
              </div>
              <ol className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
                {traceRows.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2 text-[11px]">
                    <span className={`truncate ${r.wait ? 'text-warn' : 'text-ink'}`}><span className="font-mono text-ink-soft mr-1">{clock(r.t)}</span>{r.label}</span>
                    {r.kind !== 'exit' && <span className="font-mono text-ink-soft flex-shrink-0">{fmtDur(r.dur)}</span>}
                  </li>
                ))}
              </ol>
              {onClearTrace && <button onClick={onClearTrace} className="self-start text-[11px] text-ink-soft underline">İzlemeyi temizle</button>}
            </div>
          )}
          {(simState.traces || []).length > 1 && (
            <p className="text-[10px] text-ink-soft">Son {(simState.traces || []).length} izlenen parça ort. {fmtDur((simState.traces || []).reduce((a, t) => a + (t.events[t.events.length - 1].t - t.startedAt), 0) / (simState.traces || []).length)}</p>
          )}
        </section>

        {(simState.events || []).length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[11px] font-bold tracking-wider text-ink-soft">OLAYLAR</h3>
            {[...(simState.events || [])].reverse().slice(0, 8).map((e, i) => (
              <div key={i} className="text-[11px] text-ink leading-snug">
                <span className="font-mono text-ink-soft mr-1">{clock(e.t)}</span>{nameOfItem(e.itemId)} {EVENT_TEXT[e.kind] || e.kind}
              </div>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold tracking-wider text-ink-soft">ARA STOKLAR</h3>
          {buffers.length === 0 && <p className="text-xs text-ink-soft">Akış geçen ara stok alanı yok. Yerleşim sekmesinde bir ara stok alanı seçip içinden geçen akışları işaretle.</p>}
          {buffers.map(b => {
            const f = Math.min(1, b.occ / b.cap);
            const c = f >= 0.9 ? 'bg-danger' : f >= 0.7 ? 'bg-warn' : 'bg-ok';
            return (
              <div key={b.id} className="flex flex-col gap-1">
                <div className="flex justify-between text-xs"><span className="font-semibold text-ink truncate">{b.name}</span><span className="font-mono text-ink">{b.occ} / {b.cap}</span></div>
                <div className="h-1.5 rounded bg-surface-2"><div className={`h-1.5 rounded ${c}`} style={{ width: `${f * 100}%` }} /></div>
                <div className="text-[10px] text-ink-soft">zirve {b.peak}{b.peak >= b.cap ? ' · doldu, besleyen bloke oldu' : ''}</div>
              </div>
            );
          })}
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-bold tracking-wider text-ink-soft">EN ÇOK BİRİKEN</h3>
          {topQueues.length === 0 && <p className="text-xs text-ink-soft">Kuyruk yok.</p>}
          {topQueues.map(r => (
            <div key={r.subId} className="flex justify-between text-xs gap-2"><span className="text-ink truncate">{r.s.name}</span><span className="font-mono text-ink">{r.q}</span></div>
          ))}
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-bold tracking-wider text-ink-soft">KAYIP SÜRE (vardiya payı)</h3>
          {lostRows.length === 0 && <p className="text-xs text-ink-soft">Henüz yok.</p>}
          {lostRows.map(r => (
            <div key={r.subId} className="flex flex-col gap-0.5">
              <div className="flex justify-between text-xs gap-2"><span className="text-ink truncate">{r.s.name}</span>
                <span className="font-mono text-ink-soft">aç %{fmt(100 * r.starvedSec / elapsed)} · bloke %{fmt(100 * r.blockedSec / elapsed)}{r.downSec ? ` · duruş %${fmt(100 * r.downSec / elapsed)}` : ''}</span></div>
              <div className="h-1 rounded bg-surface-2 flex overflow-hidden">
                <div style={{ width: `${100 * r.starvedSec / elapsed}%`, background: '#B9B3A8' }} />
                <div style={{ width: `${100 * r.blockedSec / elapsed}%`, background: '#C2410C' }} />
                <div style={{ width: `${100 * r.downSec / elapsed}%`, background: '#A61B1B' }} />
              </div>
            </div>
          ))}
        </section>
        <p className="text-[10px] text-ink-soft leading-relaxed">
          Taşıma: {fmt(lg?.speedMps, 1)} m/sn · demet {bundle} adet. Bu ayarlar Yerleşim sekmesindeki karnenin altındadır.
        </p>
      </aside>
    </div>
  );
}

function Tile({ label, value, hint, tone }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 px-2.5 py-2">
      <div className="text-[11px] text-ink-soft">{label}</div>
      <div className={`font-mono text-base font-semibold ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{value}</div>
      {hint && <div className="text-[10px] text-ink-soft leading-tight">{hint}</div>}
    </div>
  );
}
