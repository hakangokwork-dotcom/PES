import React, { useMemo, useRef, useState, useEffect } from 'react';
import { RotateCw, RotateCcw, Maximize, Tag } from 'lucide-react';
import { SYMBOLS, itemRect, DEFAULT_FLOOR } from '../engine/layout.js';
import { project, rotPoint, rotatedFloor, boxFaces, itemDrawables, sceneBounds, tri, ISO_COLORS } from '../engine/iso.js';

/* İzometrik sunum görünümü — salt okunur. Yerleşimle aynı ölçüler; kurulum
   üstten planda yapılır. overlay verilirse (canlı simülasyon) makine durumu,
   kuyruk demetleri, raf doluluğu, yoldaki demetler, duruş etiketleri ve
   izlenen parça gösterilir. Tüm geometri engine/iso.js'te. */

const pts = (arr) => arr.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');

function Box({ r, z0, z1, colors, stroke = 'rgba(31,42,51,0.35)' }) {
  const f = boxFaces(r, z0, z1);
  const [top, south, east] = colors;
  return (
    <g>
      <polygon points={pts(f.south)} fill={south} stroke={stroke} strokeWidth={0.015} />
      <polygon points={pts(f.east)} fill={east} stroke={stroke} strokeWidth={0.015} />
      <polygon points={pts(f.top)} fill={top} stroke={stroke} strokeWidth={0.015} />
    </g>
  );
}

/* Operatör figürü — ekran uzayında, taban noktasına göre */
function Person({ p, standing, color, ghost }) {
  const b = project(p.x, p.y, 0);
  if (ghost) return <ellipse cx={b.x} cy={b.y} rx={0.26} ry={0.13} fill="none" stroke="#8A857B" strokeWidth={0.03} strokeDasharray="0.06 0.05" />;
  const seat = standing ? 0 : 0.45;
  const bodyTop = standing ? 1.45 : 1.15;
  const chair = !standing && (
    <g>
      <Box r={{ x: p.x - 0.2, y: p.y - 0.2, w: 0.4, h: 0.4 }} z0={0.3} z1={0.45} colors={tri('#9CA3AA')} />
    </g>
  );
  return (
    <g>
      <ellipse cx={b.x} cy={b.y} rx={0.3} ry={0.15} fill="rgba(31,42,51,0.18)" />
      {chair}
      {standing && <rect x={b.x - 0.14} y={b.y - 0.66} width={0.28} height={0.64} rx={0.08} fill="#37414A" />}
      <rect x={b.x - 0.19} y={b.y - bodyTop} width={0.38} height={bodyTop - (standing ? 0.6 : seat) - 0.02} rx={0.16} fill={color} stroke="rgba(0,0,0,0.25)" strokeWidth={0.015} />
      <circle cx={b.x} cy={b.y - bodyTop - 0.13} r={0.15} fill="#E7C2A0" stroke="rgba(0,0,0,0.25)" strokeWidth={0.015} />
      <path d={`M${b.x - 0.15} ${b.y - bodyTop - 0.14} a0.15 0.15 0 0 1 0.3 0 z`} fill="#2B2420" />
    </g>
  );
}

export default function IsoView({ data, layout, overlay, height = 'calc(100vh - 230px)', minHeight = 560 }) {
  const floor0 = layout?.floor || DEFAULT_FLOOR;
  const [k, setK] = useState(0);
  const [labels, setLabels] = useState(true);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [size, setSize] = useState({ w: 900, h: 560 });
  const wrapRef = useRef(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const floor = rotatedFloor(floor0, k);
  const items = layout?.items || [];
  const subById = useMemo(() => new Map((data.subOps || []).map(s => [s.id, s])), [data.subOps]);
  const R = (p) => rotPoint(p, floor0, k);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const f = Math.exp(-e.deltaY * 0.0015);
      setView(v => {
        const zoom = Math.max(0.4, Math.min(6, v.zoom * f));
        const kk = zoom / v.zoom;
        return { zoom, x: sx - (sx - v.x) * kk, y: sy - (sy - v.y) * kk };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const b = sceneBounds(floor0, k, 1.5);

  /* çizim listesi: arkadan öne */
  const draws = [];
  for (const it of items) {
    const st = overlay?.headState?.(it);
    const d = itemDrawables(it, floor0, k, {
      headState: st,
      fill: overlay?.fill?.(it),
      noOperator: it.subOpId && !subById.get(it.subOpId)?.operatorId,
      personColor: overlay?.sharedIds?.has(it.id) ? '#7A4FB0' : '#2F6FB5',
    });
    d.parts.forEach((p, i) => {
      if (p.type === 'person') draws.push({ depth: p.p.x + p.p.y + 0.001, el: <Person key={`${it.id}p`} {...p} /> });
      else if (p.type === 'floor') draws.push({ depth: -1000, el: <polygon key={`${it.id}f`} points={pts(boxFaces(p.r, 0, 0.005).top)} fill={p.fill} stroke="#E9C7AE" strokeWidth={0.03} /> });
      else draws.push({ depth: d.depth - 0.5 + i * 1e-4, el: <Box key={`${it.id}b${i}`} r={p.r} z0={p.z0} z1={p.z1} colors={p.colors} /> });
    });
  }
  // kuyruk demetleri (küp yığını)
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

  const onPointerDown = (e) => { drag.current = { sx: e.clientX, sy: e.clientY, v: view }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onPointerMove = (e) => { const d = drag.current; if (d) setView({ ...d.v, x: d.v.x + e.clientX - d.sx, y: d.v.y + e.clientY - d.sy }); };
  const onPointerUp = () => { drag.current = null; };

  const floorPoly = pts([project(0, 0), project(floor.w, 0), project(floor.w, floor.h), project(0, floor.h)]);
  const gridLines = [];
  for (let x = 1; x < floor.w; x++) gridLines.push([project(x, 0), project(x, floor.h)]);
  for (let y = 1; y < floor.h; y++) gridLines.push([project(0, y), project(floor.w, y)]);

  const btn = 'h-9 w-9 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink flex items-center justify-center';
  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0 rounded-lg border border-line bg-[#EEF1F3] overflow-hidden" style={{ height, minHeight }}>
      <svg ref={svgRef} width="100%" height="100%" className="block select-none touch-none cursor-grab"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <defs>
          <radialGradient id="iso-heat">
            <stop offset="0%" stopColor="#C2410C" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#C2410C" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          <svg viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} width={size.w} height={size.h} preserveAspectRatio="xMidYMid meet" overflow="visible">
            {/* zemin + duvar kalınlığı */}
            <polygon points={pts([project(0, floor.h, 0), project(floor.w, floor.h, 0), project(floor.w, floor.h, -0.25), project(0, floor.h, -0.25)])} fill="#B9B3A8" />
            <polygon points={pts([project(floor.w, 0, 0), project(floor.w, floor.h, 0), project(floor.w, floor.h, -0.25), project(floor.w, 0, -0.25)])} fill="#A39D92" />
            <polygon points={floorPoly} fill="#F6F4F0" stroke="#1F2A33" strokeWidth={0.06} />
            {gridLines.map(([a, c], i) => <line key={i} x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke="#E6E2DA" strokeWidth={0.015} />)}

            {/* birikim ısısı (zemin üstünde) */}
            {(overlay?.heat || []).map((h, i) => {
              const c = project(R(h.at).x, R(h.at).y, 0);
              return <ellipse key={`h${i}`} cx={c.x} cy={c.y} rx={h.r * 1.2} ry={h.r * 0.6} fill="url(#iso-heat)" />;
            })}

            {/* spagetti (zeminde) */}
            {(overlay?.routes || []).map(r => (
              <polyline key={r.key} points={pts(r.path.map(p => { const q = R(p); return project(q.x, q.y, 0.02); }))}
                fill="none" stroke={r.color} strokeWidth={0.07} opacity={overlay?.routesOpacity ?? 0.8} strokeLinejoin="round" />
            ))}

            {/* izlenen parça */}
            {overlay?.tracePoint && (() => {
              const c = project(R(overlay.tracePoint).x, R(overlay.tracePoint).y, 0);
              return <ellipse cx={c.x} cy={c.y} rx={0.9} ry={0.45} fill="none" stroke="#0F1720" strokeWidth={0.06} strokeDasharray="0.15 0.1" />;
            })()}

            {draws.map(d => d.el)}

            {/* etiketler + duruş işaretleri (ekrana dönük) */}
            {items.map(it => {
              const r = itemRect(it);
              const c0 = R({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
              const top = project(c0.x, c0.y, 1.7);
              const dn = overlay?.downs?.[it.id];
              const s = it.subOpId ? subById.get(it.subOpId) : null;
              const kind = SYMBOLS[it.type]?.kind;
              const text = dn ? dn.text : labels ? (s?.name || (kind === 'buffer' ? (it.name || SYMBOLS[it.type].name) : it.isSpare ? 'YEDEK' : '')) : '';
              if (!text) return null;
              const extra = overlay?.bufferText?.(it);
              return (
                <g key={`l${it.id}`} style={{ pointerEvents: 'none' }}>
                  <text x={top.x} y={top.y} textAnchor="middle" fontSize={dn ? 0.3 : 0.24} fontWeight={dn ? 800 : 600}
                    fill={dn ? dn.color : '#1F2A33'} paintOrder="stroke" stroke="#FFFFFF" strokeWidth={0.08}>
                    {text.length > 18 ? text.slice(0, 17) + '…' : text}{extra ? ` · ${extra}` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        </g>
      </svg>
      <div className="absolute right-3 top-3 flex gap-1.5">
        <button className={btn} onClick={() => setK(v => (v + 3) % 4)} aria-label="Sola döndür" title="Sola döndür"><RotateCcw className="w-4 h-4" /></button>
        <button className={btn} onClick={() => setK(v => (v + 1) % 4)} aria-label="Sağa döndür" title="Sağa döndür"><RotateCw className="w-4 h-4" /></button>
        <button className={`${btn} ${labels ? 'bg-surface-2' : ''}`} onClick={() => setLabels(v => !v)} aria-label="Etiketler" title="Etiketleri göster/gizle"><Tag className="w-4 h-4" /></button>
        <button className={btn} onClick={() => setView({ zoom: 1, x: 0, y: 0 })} aria-label="Sığdır" title="Sığdır"><Maximize className="w-4 h-4" /></button>
      </div>
      <div className="absolute left-3 top-3 rounded-md bg-surface/95 border border-line px-2.5 py-1 text-[11px] text-ink-soft">
        İzometrik sunum · sürükle = kaydır · tekerlek = yakınlaştır · düzenleme üstten planda
      </div>
    </div>
  );
}
