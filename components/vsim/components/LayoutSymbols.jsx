import React from 'react';
import { SYMBOLS, itemRect } from '../engine/layout.js';

/* Yerleşim sembolleri — ÜSTTEN görünüş, birim METRE (SVG kullanıcı uzayı).
   Her sembol yerel eksende çizilir: gövde (0,0)-(w,h), operatör alanı gövdenin
   ALTINDA (h … h+op). Döndürme gövde merkezi etrafında uygulanır; böylece
   engine/layout.js'teki itemFootprint ile birebir aynı kutu çıkar. */

export const INK = '#1F2A33';
const LINE = '#6F7780';
const HEAD = { idle: '#37414A', down: '#A61B1B', maint: '#B7791F', neck: '#37414A',
  work: '#1F7A4D', starved: '#B9B3A8', blocked: '#C2410C' };   // son üçü: canlı simülasyon
const HAIR = '#2B2420';

/* SVG <defs> — sayfada bir kez */
export function LayoutDefs() {
  return (
    <defs>
      <pattern id="ly-hatch" width="0.2" height="0.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="0.2" height="0.2" fill="#FFFFFF" />
        <line x1="0" y1="0" x2="0" y2="0.2" stroke="#8A857B" strokeWidth="0.05" opacity="0.55" />
      </pattern>
      <pattern id="ly-aisle" width="0.3" height="0.3" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <rect width="0.3" height="0.3" fill="#FBF3EC" />
        <line x1="0" y1="0" x2="0" y2="0.3" stroke="#E9C7AE" strokeWidth="0.08" />
      </pattern>
      <pattern id="ly-belt" width="0.3" height="1" patternUnits="userSpaceOnUse">
        <rect width="0.3" height="1" fill="#E3DFD7" />
        <rect width="0.15" height="1" fill="#CFCAC0" />
      </pattern>
      <pattern id="ly-grid" width="1" height="1" patternUnits="userSpaceOnUse">
        <path d="M1 0 L0 0 0 1" fill="none" stroke="#E6E9EC" strokeWidth="0.02" />
        <path d="M0.5 0 L0.5 1 M0 0.5 L1 0.5" fill="none" stroke="#F1F3F5" strokeWidth="0.015" />
      </pattern>
    </defs>
  );
}

/* Oturan / ayakta operatör (yerel eksende, gövdenin altına) */
function Operator({ w, h, seat, color, ghost }) {
  const cx = w / 2;
  if (ghost) {
    return <circle cx={cx} cy={h + 0.3} r={0.2} fill="none" stroke="#8A857B" strokeWidth="0.03" strokeDasharray="0.06 0.05" />;
  }
  return (
    <g>
      {seat && <rect x={cx - 0.18} y={h + 0.22} width={0.36} height={0.3} rx={0.08} fill="#C9CED3" />}
      <rect x={cx - 0.27} y={h - 0.1} width={0.1} height={0.26} rx={0.05} fill={color} />
      <rect x={cx + 0.17} y={h - 0.1} width={0.1} height={0.26} rx={0.05} fill={color} />
      <ellipse cx={cx} cy={h + 0.26} rx={0.28} ry={0.14} fill={color} />
      <circle cx={cx} cy={h + 0.19} r={0.12} fill={HAIR} stroke="#FFFFFF" strokeWidth="0.03" />
    </g>
  );
}

function Body({ type, w, h, state }) {
  const head = HEAD[state] || HEAD.idle;
  const table = <rect x={0} y={0} width={w} height={h} rx={0.05} fill="#FFFFFF" stroke={LINE} strokeWidth="0.03" />;
  const s = SYMBOLS[type];
  if (!s) return table;
  if (s.kind === 'machine') {
    const hw = type === 'ov' ? 0.36 : type === 'kl' ? 0.28 : type === 'oto' ? 0.62 : 0.48;
    const hx = w / 2 - hw / 2 + 0.06;
    return (
      <g>
        {table}
        <rect x={hx} y={0.08} width={hw} height={type === 'oto' ? 0.34 : 0.2} rx={0.05} fill={head} />
        <circle cx={hx - 0.03} cy={0.18} r={0.07} fill={head} />
        {type === 'ov' && (
          <g>
            <circle cx={w - 0.12} cy={0.12} r={0.05} fill="#E8B931" />
            <circle cx={w - 0.12} cy={0.26} r={0.05} fill="#2A9D8F" />
            <circle cx={w - 0.12} cy={0.40} r={0.05} fill="#C8553D" />
          </g>
        )}
        {type === 'kl' && <rect x={0.1} y={h - 0.2} width={w - 0.2} height={0.1} rx={0.05} fill="#8A949E" />}
        {type === 'il' && <g fill="#8A949E"><circle cx={w - 0.2} cy={h - 0.16} r={0.04} /><circle cx={w - 0.32} cy={h - 0.16} r={0.04} /></g>}
      </g>
    );
  }
  switch (type) {
    case 'utu':
      return (
        <g>
          <path d={`M0 0.05 Q0 0 0.05 0 H${w - h / 2} A${h / 2} ${h / 2} 0 0 1 ${w - h / 2} ${h} H0.05 Q0 ${h} 0 ${h - 0.05} Z`} fill="#FFFFFF" stroke={LINE} strokeWidth="0.03" />
          <path d={`M${w - 0.62} ${h * 0.25} h0.26 q0.1 0 0.1 ${h * 0.25} q0 ${h * 0.25} -0.1 ${h * 0.25} h-0.26 z`} fill={head} />
        </g>
      );
    case 'kt':
    case 'pk':
      return (
        <g>
          {table}
          <rect x={0.14} y={0.12} width={0.42} height={h - 0.24} rx={0.03} fill="#DCE7F5" stroke="#9FB6D3" strokeWidth="0.02" />
          <rect x={0.64} y={0.16} width={0.34} height={h - 0.32} rx={0.03} fill="#DCE7F5" stroke="#9FB6D3" strokeWidth="0.02" />
          {type === 'pk' && <rect x={w - 0.56} y={0.1} width={0.44} height={h - 0.2} fill="#C9A36B" stroke="#91703F" strokeWidth="0.02" />}
        </g>
      );
    case 'kesim':
      return (
        <g>
          {table}
          <rect x={0.12} y={0.12} width={w - 0.24} height={h - 0.24} fill="#F2CF5B" />
          <rect x={0.2} y={0.2} width={(w - 0.4) * 0.62} height={h - 0.4} fill="#E8B931" />
        </g>
      );
    case 'raf':
      return <rect x={0} y={0} width={w} height={h} rx={0.04} fill="url(#ly-hatch)" stroke="#6F6A61" strokeWidth="0.04" />;
    case 'araba':
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} rx={0.06} fill="#FFFFFF" stroke="#6F6A61" strokeWidth="0.04" />
          {[[0.08, 0.08], [w - 0.08, 0.08], [0.08, h - 0.08], [w - 0.08, h - 0.08]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.04} fill="#6F6A61" />)}
        </g>
      );
    case 'palet':
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} fill="#E8DCC6" stroke="#91703F" strokeWidth="0.04" />
          {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} stroke="#91703F" strokeWidth="0.025" />)}
        </g>
      );
    case 'bant':
      return <rect x={0} y={0} width={w} height={h} rx={0.04} fill="url(#ly-belt)" stroke="#8A857B" strokeWidth="0.03" />;
    case 'koridor':
      return <rect x={0} y={0} width={w} height={h} fill="url(#ly-aisle)" stroke="#C2410C" strokeWidth="0.025" strokeDasharray="0.12 0.08" opacity="0.9" />;
    case 'kolon':
      return <rect x={0} y={0} width={w} height={h} fill={INK} />;
    default:
      return table;
  }
}

/* Tek öğe. station: bağlı operasyon bilgisi {label, title, hasOperator, shared, color} */
export function LayoutItem({ item, station, selected, dim, onPointerDown }) {
  const s = SYMBOLS[item.type] || SYMBOLS.duz;
  const r = itemRect(item);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const w = item.w, h = item.h;
  const withOp = s.kind === 'machine' || s.kind === 'table';
  const label = station?.label ?? (s.kind === 'buffer' ? (item.name || s.name) : '');
  const fontSize = Math.min(0.2, Math.max(0.12, w / 9));
  // Metin daima dik okunur: 180°'de gövde ters döner, yazıyı geri çeviriyoruz.
  const upright = item.rot === 180 ? 180 : item.rot === 90 ? -90 : item.rot === 270 ? 90 : 0;
  return (
    <g
      transform={`translate(${cx} ${cy}) rotate(${item.rot || 0}) translate(${-w / 2} ${-h / 2})`}
      onPointerDown={onPointerDown}
      style={{ cursor: 'move', opacity: dim ? 0.35 : 1 }}
      data-item-id={item.id}
    >
      <title>{station?.title || item.name || s.name}</title>
      {/* görünmez tutma alanı — operatör alanı dahil */}
      <rect x={0} y={0} width={w} height={h + (withOp ? s.op : 0)} fill="transparent" />
      <Body type={item.type} w={w} h={h} state={station?.state} />
      {withOp && (item.subOpId || s.kind === 'table') && (
        <Operator w={w} h={h} seat={s.seat} color={station?.shared ? '#7A4FB0' : '#2F6FB5'} ghost={item.subOpId && !station?.hasOperator} />
      )}
      {label && (
        <g transform={`translate(${w / 2} ${h / 2}) rotate(${upright})`}>
          <text
            x={0} y={s.kind === 'buffer' ? -0.02 : fontSize * 0.35}
            textAnchor="middle" fontSize={fontSize} fontWeight="600"
            fill={INK} style={{ fontFamily: 'var(--font-mono, monospace)', pointerEvents: 'none' }}
            paintOrder="stroke" stroke="#FFFFFF" strokeWidth={0.04}
          >
            {label}
          </text>
        </g>
      )}
      {s.kind === 'buffer' && item.capacity != null && (
        <g transform={`translate(${w / 2} ${h / 2}) rotate(${upright})`}>
          <text x={0} y={0.26} textAnchor="middle" fontSize={0.14} fill="#5E5A52" style={{ pointerEvents: 'none' }}>kap. {item.capacity}</text>
        </g>
      )}
      {s.kind === 'aisle' && (
        <g transform={`translate(${w / 2} ${h / 2}) rotate(${upright})`}>
          <text x={0} y={0.06} textAnchor="middle" fontSize={0.18} fontWeight="700" fill="#9A3A0B" style={{ pointerEvents: 'none' }}>
            {`${Math.min(w, h).toFixed(1).replace('.', ',')} m`}
          </text>
        </g>
      )}
      {selected && (
        <rect x={-0.06} y={-0.06} width={w + 0.12} height={h + (withOp ? s.op : 0) + 0.12}
          fill="none" stroke="#197A56" strokeWidth="0.05" strokeDasharray="0.12 0.08" rx={0.06} />
      )}
    </g>
  );
}

/* Paletteki küçük önizleme */
export function SymbolIcon({ type, size = 34 }) {
  const s = SYMBOLS[type];
  if (!s) return null;
  const w = Math.min(s.w, 2.2), h = Math.min(s.h, 1.2);
  const op = s.kind === 'machine' || s.kind === 'table' ? s.op : 0;
  const pad = 0.1;
  const vw = w + pad * 2, vh = h + op + pad * 2;
  return (
    <svg width={size} height={size * 0.75} viewBox={`${-pad} ${-pad} ${Math.max(vw, vh * 1.33)} ${Math.max(vh, vw * 0.75)}`} aria-hidden="true">
      <LayoutDefs />
      <Body type={type} w={w} h={h} />
      {op > 0 && <Operator w={w} h={h} seat={s.seat} color="#2F6FB5" />}
    </svg>
  );
}
