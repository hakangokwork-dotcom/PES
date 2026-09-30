import React, { useMemo, useRef, useState, useEffect } from 'react';
import { RotateCw, RotateCcw, Maximize, Tag } from 'lucide-react';
import { SYMBOLS, itemRect, itemFootprint, snap, DEFAULT_FLOOR } from '../engine/layout.js';
import { rootMainId } from '../engine/flow.js';
import { project, unproject, rotPoint, rotRect, rotatedFloor, boxFaces, itemDrawables, tri, ISO_COLORS } from '../engine/iso.js';

/* İzometrik görünüm. Yerleşimle aynı ölçüler.
   editable verilirse: tıkla = seç (Shift ile çoklu), sürükle = taşı (25 cm ızgara,
   Alt = serbest), paletten bırak = ekle; R/Delete gibi tuşlar üst bileşende.
   overlay verilirse (canlı simülasyon) makine durumu, kuyruk, raf doluluğu,
   yoldaki demetler, duruş etiketleri ve izlenen parça çizilir. */

const MIME = 'application/x-vsim-layout';
const pts = (arr) => arr.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');

function Box({ r, z0, z1, colors, stroke = 'rgba(31,42,51,0.3)' }) {
  const f = boxFaces(r, z0, z1);
  const [top, south, east] = colors;
  return (
    <g>
      <polygon points={pts(f.south)} fill={south} stroke={stroke} strokeWidth={0.012} />
      <polygon points={pts(f.east)} fill={east} stroke={stroke} strokeWidth={0.012} />
      <polygon points={pts(f.top)} fill={top} stroke={stroke} strokeWidth={0.012} />
    </g>
  );
}

/* Operatör figürü — ekran uzayında, taban noktasına göre (kollu, pantolonlu) */
function Person({ p, standing, color, ghost }) {
  const b = project(p.x, p.y, 0);
  if (ghost) return <ellipse cx={b.x} cy={b.y} rx={0.26} ry={0.13} fill="none" stroke="#8A857B" strokeWidth={0.03} strokeDasharray="0.06 0.05" />;
  const seat = standing ? 0 : 0.45;
  const top = standing ? 1.5 : 1.12;
  const hip = standing ? 0.78 : seat + 0.02;
  return (
    <g>
      <ellipse cx={b.x} cy={b.y} rx={0.3} ry={0.15} fill="rgba(31,42,51,0.16)" />
      {!standing && <Box r={{ x: p.x - 0.2, y: p.y - 0.2, w: 0.4, h: 0.4 }} z0={0.38} z1={0.45} colors={tri('#8A949E')} />}
      {!standing && <Box r={{ x: p.x - 0.03, y: p.y - 0.03, w: 0.06, h: 0.06 }} z0={0} z1={0.38} colors={tri('#6F7780')} />}
      {standing && (
        <g fill="#37414A">
          <rect x={b.x - 0.13} y={b.y - hip} width={0.11} height={hip} rx={0.04} />
          <rect x={b.x + 0.02} y={b.y - hip} width={0.11} height={hip} rx={0.04} />
        </g>
      )}
      {/* kollar */}
      <rect x={b.x - 0.27} y={b.y - top + 0.12} width={0.09} height={standing ? 0.5 : 0.36} rx={0.045} fill={color} stroke="rgba(0,0,0,0.2)" strokeWidth={0.012} />
      <rect x={b.x + 0.18} y={b.y - top + 0.12} width={0.09} height={standing ? 0.5 : 0.36} rx={0.045} fill={color} stroke="rgba(0,0,0,0.2)" strokeWidth={0.012} />
      <rect x={b.x - 0.19} y={b.y - top} width={0.38} height={top - hip} rx={0.14} fill={color} stroke="rgba(0,0,0,0.22)" strokeWidth={0.012} />
      <circle cx={b.x} cy={b.y - top - 0.14} r={0.14} fill="#E7C2A0" stroke="rgba(0,0,0,0.2)" strokeWidth={0.012} />
      <path d={`M${b.x - 0.145} ${b.y - top - 0.14} a0.145 0.145 0 0 1 0.29 0 q-0.145 -0.05 -0.29 0 z`} fill="#2B2420" />
    </g>
  );
}

export default function IsoView({ data, layout, overlay, editable, height = 'calc(100vh - 230px)', minHeight = 560 }) {
  const floor0 = layout?.floor || DEFAULT_FLOOR;
  const [k, setK] = useState(0);
  const [labels, setLabels] = useState(true);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [fitAll, setFitAll] = useState(false);
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const innerRef = useRef(null);
  const drag = useRef(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const floor = rotatedFloor(floor0, k);
  const items = layout?.items || [];
  const subById = useMemo(() => new Map((data.subOps || []).map(s => [s.id, s])), [data.subOps]);
  const mainById = useMemo(() => new Map((data.mainOps || []).map(m => [m.id, m])), [data.mainOps]);
  const R = (p) => rotPoint(p, floor0, k);
  const selSet = new Set(editable?.selection || []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const f = Math.exp(-e.deltaY * 0.0015);
      setView(v => {
        const zoom = Math.max(0.4, Math.min(8, v.zoom * f));
        const kk = zoom / v.zoom;
        return { zoom, x: sx - (sx - v.x) * kk, y: sy - (sy - v.y) * kk };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* Görüş kutusu: varsayılan olarak öğelerin çevresine sığar (boş zemin küçültmesin) */
  const bounds = useMemo(() => {
    const ps = [];
    const src = (!fitAll && items.length) ? items.map(it => rotRect(itemFootprint(it), floor0, k)) : [{ x: 0, y: 0, w: floor.w, h: floor.h }];
    for (const r of src) {
      for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        ps.push(project(x, y, 0)); ps.push(project(x, y, 2));
      }
    }
    const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
    const pad = 1.2;
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, fitAll, floor0.w, floor0.h, items.length, layout?.id]);

  /* ekran → zemin metresi */
  const toFloor = (clientX, clientY) => {
    const svg = innerRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const u = pt.matrixTransform(m.inverse());
    return unproject(u.x, u.y, floor0, k);
  };

  /* bölüm zeminleri: aynı kök ana-opa bağlı istasyonların kapsadığı alan */
  const zones = useMemo(() => {
    const byG = new Map();
    for (const it of items) {
      if (!it.subOpId) continue;
      const g = rootMainId({ mainOps: data.mainOps || [], subOps: data.subOps || [] }, it.subOpId);
      if (!g) continue;
      const f = itemFootprint(it);
      const b = byG.get(g) || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      b.x0 = Math.min(b.x0, f.x); b.y0 = Math.min(b.y0, f.y); b.x1 = Math.max(b.x1, f.x + f.w); b.y1 = Math.max(b.y1, f.y + f.h);
      byG.set(g, b);
    }
    return [...byG].map(([g, b]) => ({ g, name: mainById.get(g)?.name || '', color: mainById.get(g)?.color || '#64748b', r: { x: b.x0 - 0.25, y: b.y0 - 0.25, w: b.x1 - b.x0 + 0.5, h: b.y1 - b.y0 + 0.5 } }));
  }, [items, data.mainOps, data.subOps, mainById]);

  /* ---- etkileşim ---- */
  function onItemDown(e, it) {
    if (e.button !== 0) return;
    e.stopPropagation();
    editable.focus?.();
    if (editable.connectMode) { editable.onConnectClick?.(it); return; }
    let sel = editable.selection || [];
    if (e.shiftKey) sel = sel.includes(it.id) ? sel.filter(x => x !== it.id) : [...sel, it.id];
    else if (!sel.includes(it.id)) sel = [it.id];
    editable.onSelect(sel);
    if (!sel.includes(it.id)) return;
    const start = toFloor(e.clientX, e.clientY);
    if (!start) return;
    drag.current = { mode: 'move', start, primary: it, dx: 0, dy: 0 };
    svgRef.current.setPointerCapture(e.pointerId);
  }

  /* çizim listesi: arkadan öne */
  const draws = [];
  for (const it of items) {
    const st = overlay?.headState?.(it);
    const d = itemDrawables(it, floor0, k, {
      headState: st,
      fill: overlay?.fill?.(it),
      personColor: overlay?.sharedIds?.has(it.id) ? '#7A4FB0'
        : (it.operatorId || (it.subOpId && subById.get(it.subOpId)?.operatorId)) ? '#2F6FB5' : '#9CA3AF',
    });
    const grab = editable ? { onPointerDown: (e) => onItemDown(e, it), style: { cursor: 'move' } } : {};
    d.parts.forEach((p, i) => {
      if (p.type === 'person') draws.push({ depth: p.p.x + p.p.y + 0.001, el: <g key={`${it.id}p${i}`} {...grab}><Person {...p} /></g> });
      else if (p.type === 'floor') draws.push({ depth: -1000, el: <polygon key={`${it.id}f`} {...grab} points={pts(boxFaces(p.r, 0, 0.005).top)} fill={p.fill} stroke="#E9C7AE" strokeWidth={0.03} /> });
      else draws.push({ depth: d.depth - 0.5 + i * 1e-4, el: <g key={`${it.id}b${i}`} {...grab}><Box r={p.r} z0={p.z0} z1={p.z1} colors={p.colors} /></g> });
    });
  }
  for (const q of overlay?.queues || []) {
    const n = Math.min(8, Math.ceil(q.q / (overlay.bundle || 1)));
    for (let i = 0; i < n; i++) {
      const c = R({ x: q.at.x - (i % 2) * 0.3, y: q.at.y + (Math.floor(i / 2) % 2) * 0.3 });
      const z = Math.floor(i / 4) * 0.22;
      draws.push({ depth: c.x + c.y, el: <Box key={`q${q.subId}${i}`} r={{ x: c.x, y: c.y, w: 0.26, h: 0.26 }} z0={z} z1={z + 0.2} colors={ISO_COLORS.bundle} /> });
    }
  }
  for (const [i, t] of (overlay?.transit || []).entries()) {
    const c = R(t.p);
    draws.push({ depth: c.x + c.y, el: <Box key={`t${i}`} r={{ x: c.x - 0.16, y: c.y - 0.16, w: 0.32, h: 0.32 }} z0={0.9} z1={1.15} colors={tri(t.color)} stroke={t.traced ? '#0F1720' : undefined} /> });
  }
  draws.sort((a, b2) => a.depth - b2.depth);

  const onPointerDown = (e) => {
    editable?.focus?.();
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, v: view, moved: false };
    svgRef.current.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pan') {
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
      setView({ ...d.v, x: d.v.x + e.clientX - d.sx, y: d.v.y + e.clientY - d.sy });
    } else {
      const p = toFloor(e.clientX, e.clientY);
      if (!p) return;
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!e.altKey) { dx = snap(d.primary.x + dx) - d.primary.x; dy = snap(d.primary.y + dy) - d.primary.y; }
      d.dx = Math.round(dx * 100) / 100; d.dy = Math.round(dy * 100) / 100;
      editable.onDragPreview({ dx: d.dx, dy: d.dy });
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === 'move') editable.onDragEnd(d.dx, d.dy);
    else if (!d.moved && editable) editable.onSelect([]);
  };
  const onDrop = (e) => {
    if (!editable) return;
    const raw = e.dataTransfer.getData(MIME);
    if (!raw) return;
    e.preventDefault();
    const p = toFloor(e.clientX, e.clientY);
    try { if (p) editable.onDrop(JSON.parse(raw), p.x, p.y); } catch { /* bozuk yük */ }
  };

  const floorPoly = pts([project(0, 0), project(floor.w, 0), project(floor.w, floor.h), project(0, floor.h)]);
  const gridLines = [];
  for (let x = 1; x < floor.w; x++) gridLines.push([project(x, 0), project(x, floor.h)]);
  for (let y = 1; y < floor.h; y++) gridLines.push([project(0, y), project(floor.w, y)]);

  const btn = 'h-9 w-9 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink flex items-center justify-center';
  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0 rounded-lg border border-line bg-[#EAEEF1] overflow-hidden" style={{ height, minHeight }}>
      <svg ref={svgRef} width="100%" height="100%" className={`block select-none touch-none ${editable ? '' : 'cursor-grab'}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onDragOver={e => { if (editable && e.dataTransfer.types.includes(MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
        onDrop={onDrop}>
        <defs>
          <radialGradient id="iso-heat">
            <stop offset="0%" stopColor="#C2410C" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#C2410C" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          <svg ref={innerRef} viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} width={size.w} height={size.h} preserveAspectRatio="xMidYMid meet" overflow="visible">
            {/* zemin kalınlığı + zemin */}
            <polygon points={pts([project(0, floor.h, 0), project(floor.w, floor.h, 0), project(floor.w, floor.h, -0.25), project(0, floor.h, -0.25)])} fill="#B9B3A8" />
            <polygon points={pts([project(floor.w, 0, 0), project(floor.w, floor.h, 0), project(floor.w, floor.h, -0.25), project(floor.w, 0, -0.25)])} fill="#A39D92" />
            <polygon points={floorPoly} fill="#F7F5F1" stroke="#1F2A33" strokeWidth={0.06} />
            {gridLines.map(([a, c], i) => <line key={i} x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke="#E8E4DC" strokeWidth={0.015} />)}
            {/* arka duvarlar (alçak) */}
            <polygon points={pts([project(0, 0, 0), project(floor.w, 0, 0), project(floor.w, 0, 0.35), project(0, 0, 0.35)])} fill="#DDD8CF" stroke="#B9B3A8" strokeWidth={0.02} />
            <polygon points={pts([project(0, 0, 0), project(0, floor.h, 0), project(0, floor.h, 0.35), project(0, 0, 0.35)])} fill="#D2CCC2" stroke="#B9B3A8" strokeWidth={0.02} />

            {/* bölüm zeminleri */}
            {zones.map(z => {
              const r = rotRect(z.r, floor0, k);
              const corner = project(r.x + 0.15, r.y + r.h - 0.15, 0);
              return (
                <g key={z.g} style={{ pointerEvents: 'none' }}>
                  <polygon points={pts(boxFaces(r, 0, 0.004).top)} fill={z.color} fillOpacity={0.1} stroke={z.color} strokeOpacity={0.55} strokeWidth={0.03} strokeDasharray="0.2 0.1" />
                  {labels && <text x={corner.x} y={corner.y} fontSize={0.34} fontWeight={800} fill={z.color} transform={`rotate(26.565 ${corner.x} ${corner.y})`} style={{ letterSpacing: '0.04em' }}>{z.name.toLocaleUpperCase('tr')}</text>}
                </g>
              );
            })}

            {(overlay?.heat || []).map((h, i) => {
              const c = project(R(h.at).x, R(h.at).y, 0);
              return <ellipse key={`h${i}`} cx={c.x} cy={c.y} rx={h.r * 1.2} ry={h.r * 0.6} fill="url(#iso-heat)" />;
            })}

            {(overlay?.routes || []).map(r => (
              <polyline key={r.key} points={pts(r.path.map(p => { const q = R(p); return project(q.x, q.y, 0.02); }))}
                fill="none" stroke={r.color} strokeWidth={0.07} opacity={overlay?.routesOpacity ?? 0.8} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
            ))}

            {/* seçim çerçevesi (zeminde) */}
            {items.filter(it => selSet.has(it.id)).map(it => (
              <polygon key={`s${it.id}`} points={pts(boxFaces(rotRect(itemFootprint(it), floor0, k), 0, 0.01).top)}
                fill="rgba(25,122,86,0.12)" stroke="#197A56" strokeWidth={0.05} strokeDasharray="0.15 0.08" style={{ pointerEvents: 'none' }} />
            ))}

            {overlay?.tracePoint && (() => {
              const c = project(R(overlay.tracePoint).x, R(overlay.tracePoint).y, 0);
              return <ellipse cx={c.x} cy={c.y} rx={0.9} ry={0.45} fill="none" stroke="#0F1720" strokeWidth={0.06} strokeDasharray="0.15 0.1" />;
            })()}

            {draws.map(d => d.el)}

            {/* etiketler: rozet biçiminde, ekrana dönük */}
            {items.map(it => {
              const r = itemRect(it);
              const c0 = R({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
              const top = project(c0.x, c0.y, 1.95);
              const dn = overlay?.downs?.[it.id];
              const s = it.subOpId ? subById.get(it.subOpId) : null;
              const kind = SYMBOLS[it.type]?.kind;
              const base = s?.name || (kind === 'buffer' ? (it.name || SYMBOLS[it.type].name) : it.isSpare ? 'YEDEK' : kind === 'person' ? (it.name || 'Çalışan') : '');
              const text = dn ? dn.text : labels ? base : '';
              if (!text) return null;
              const extra = overlay?.bufferText?.(it);
              const t = `${text.length > 18 ? text.slice(0, 17) + '…' : text}${extra ? ` · ${extra}` : ''}`;
              const w = Math.max(0.8, t.length * 0.13 + 0.3);
              return (
                <g key={`l${it.id}`} style={{ pointerEvents: 'none' }}>
                  <rect x={top.x - w / 2} y={top.y - 0.26} width={w} height={0.36} rx={0.18}
                    fill={dn ? dn.color : 'rgba(255,255,255,0.92)'} stroke={dn ? 'none' : 'rgba(31,42,51,0.18)'} strokeWidth={0.02} />
                  <text x={top.x} y={top.y} textAnchor="middle" fontSize={0.22} fontWeight={dn ? 800 : 600} fill={dn ? '#FFFFFF' : '#1F2A33'}>{t}</text>
                </g>
              );
            })}
          </svg>
        </g>
      </svg>
      <div className="absolute right-3 top-3 flex gap-1.5">
        <button className={btn} onClick={() => setK(v => (v + 3) % 4)} aria-label="Sola döndür" title="Görünümü sola döndür"><RotateCcw className="w-4 h-4" /></button>
        <button className={btn} onClick={() => setK(v => (v + 1) % 4)} aria-label="Sağa döndür" title="Görünümü sağa döndür"><RotateCw className="w-4 h-4" /></button>
        <button className={`${btn} ${labels ? 'bg-surface-2' : ''}`} onClick={() => setLabels(v => !v)} aria-label="Etiketler" title="Etiketleri göster/gizle"><Tag className="w-4 h-4" /></button>
        <button className={btn} onClick={() => { setView({ zoom: 1, x: 0, y: 0 }); setFitAll(v => !v); }} aria-label="Sığdır" title="Yerleşime / tüm zemine sığdır"><Maximize className="w-4 h-4" /></button>
      </div>
      <div className="absolute left-3 top-3 rounded-md bg-surface/95 border border-line px-2.5 py-1 text-[11px] text-ink-soft">
        {editable
          ? 'Tıkla = seç · sürükle = taşı · R = döndür · Delete = sil · boşlukta sürükle = kaydır · tekerlek = yakınlaştır'
          : 'Sürükle = kaydır · tekerlek = yakınlaştır'}
      </div>
    </div>
  );
}
