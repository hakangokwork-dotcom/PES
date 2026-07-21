/* Basılabilir profesyonel Süreç Kartı raporu (Yazdır/PDF). Salt-okunur: haritayı SVG olarak
   yeniden çizer (div-canvas'tan bağımsız — baskıda net, ileride SVG export'a temel). Kart bloğu
   LCW şablonunu izler; İyileştirme tablosu haritanın tag'lerinden (buildIyilestirmeAOA ile aynı
   alan seti). Ekranda tam ekran önizleme; @media print kuralları (src/index.css) yalnız
   #process-report'u basılabilir bırakır. html2canvas gibi bağımlılık YOK — saf SVG + CSS. */
import React, { useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import { NODE_SHAPE_LABELS, DEFAULT_CARD, TAG_TYPES, LANE_H, tagCounts } from '../engine/processMapOps.js';
import { dimsOf, bezierPath, edgeAnchors } from '../engine/processMapGeometry.js';

const SEV_LABEL = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };

// TAG_TYPES.renk (anlamsal renk adı) → CSS custom property. Uygulamanın index.css'inde
// tanımlı --color-* değişkenlerine dayanır; inline SVG/HTML bu belge içinde render edildiği
// için var(--color-x) doğrudan çalışır (ayrı pencere/export değil).
const RENK_FG = {
  danger: 'var(--color-danger)', warn: 'var(--color-warn)', ok: 'var(--color-ok)',
  info: 'var(--color-info)', faint: 'var(--color-ink-faint)',
};
const RENK_TINT = {
  danger: 'var(--color-danger-tint)', warn: 'var(--color-warn-tint)', ok: 'var(--color-ok-tint)',
  info: 'var(--color-info-tint)', faint: 'var(--color-surface-2)',
};

/* Uzun etiketleri basit kelime-sarma ile en fazla 2 satıra böler — SVG <text> otomatik
   satır sarmaz; 3. satıra taşan içerik "…" ile kırpılır. */
function wrapLabel(label, maxChars) {
  const words = String(label || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length === 0) lines.push('');
  if (lines.length > 2) {
    const kept = lines.slice(0, 2);
    const last = kept[1];
    kept[1] = last.length > maxChars - 1 ? last.slice(0, maxChars - 1) + '…' : last + '…';
    return kept;
  }
  return lines;
}

/* Tek şeklin salt-okunur SVG render'ı: tür → biçim (stadyum/kare/elmas/dalga/çift-çerçeve),
   ortalanmış sarmalı etiket, sağ üst köşede aktif etiket türleri için küçük sayı rozetleri. */
function NodeShapeSvg({ node, counts }) {
  const { w, h } = dimsOf(node.type);
  const isDecision = node.type === 'decision';
  const lines = wrapLabel(node.label, isDecision ? 11 : 17);
  const lineH = 12;
  const startY = h / 2 - ((lines.length - 1) * lineH) / 2 + 4;

  let shape;
  if (isDecision) {
    const cx = w / 2, cy = h / 2;
    shape = (
      <polygon points={`${cx},0 ${w},${cy} ${cx},${h} 0,${cy}`}
        fill="var(--color-surface)" stroke="var(--color-line-strong)" strokeWidth="1.5" />
    );
  } else if (node.type === 'doc') {
    const d = `M0,0 H${w} V${h - 10} Q${w * 0.75},${h + 8} ${w / 2},${h - 4} Q${w * 0.25},${h - 16} 0,${h - 10} Z`;
    shape = <path d={d} fill="var(--color-surface)" stroke="var(--color-line)" strokeWidth="1.25" />;
  } else if (node.type === 'subprocess') {
    shape = (
      <>
        <rect x="0" y="0" width={w} height={h} rx="6" fill="var(--color-surface)" stroke="var(--color-line)" strokeWidth="1.25" />
        <rect x="4" y="4" width={Math.max(0, w - 8)} height={Math.max(0, h - 8)} rx="3" fill="none" stroke="var(--color-line)" strokeWidth="1" />
      </>
    );
  } else if (node.type === 'start' || node.type === 'end') {
    shape = <rect x="0" y="0" width={w} height={h} rx={h / 2} fill="var(--color-surface)" stroke="var(--color-ink-soft)" strokeWidth="2" />;
  } else {
    shape = <rect x="0" y="0" width={w} height={h} rx="8" fill="var(--color-surface)" stroke="var(--color-line)" strokeWidth="1.25" />;
  }

  const activeCounts = Object.entries(counts || {}).filter(([, n]) => n > 0);

  return (
    <g transform={`translate(${node.x},${node.y})`}>
      {shape}
      <text textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--color-ink)" fontFamily="var(--font-sans, sans-serif)">
        {lines.map((ln, i) => <tspan key={i} x={w / 2} y={startY + i * lineH}>{ln}</tspan>)}
      </text>
      {activeCounts.map(([key, n], i) => (
        <g key={key} transform={`translate(${w - 6 - i * 14},-6)`}>
          <circle r="7" fill={RENK_FG[TAG_TYPES[key].renk]} />
          <text textAnchor="middle" y="3" fontSize="8" fontWeight="700" fill="#fff">{n}</text>
        </g>
      ))}
    </g>
  );
}

/* Sürükleme kutusundan normalleştirilmiş geometri — ProcessMapStudio.jsx'teki shapeGeom'un
   salt-okunur kopyası (editör↔rapor görsel tutarlılığı için birebir aynı). */
function shapeGeom(sh) {
  const x = Math.min(sh.x1, sh.x2), y = Math.min(sh.y1, sh.y2);
  const w = Math.abs(sh.x2 - sh.x1), h = Math.abs(sh.y2 - sh.y1);
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/* Tek karalama-şeklini SVG öğesine çevirir — ProcessMapStudio.jsx'teki renderShape'in
   salt-okunur kopyası (editör↔rapor tutarlılığı için birebir; ortak yardımcı çıkarmaya
   değecek kadar büyük değil, bilinçli kopya). Şekiller yalnız kontur (fill=none). */
function renderShape(sh, key) {
  const { color, width } = sh;
  const common = {
    fill: 'none', stroke: color, strokeWidth: width,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  const g = shapeGeom(sh);
  switch (sh.type) {
    case 'ellipse': return <ellipse key={key} cx={g.cx} cy={g.cy} rx={g.w / 2} ry={g.h / 2} {...common} />;
    case 'triangle': return <polygon key={key} points={`${g.cx},${g.y} ${g.x},${g.y + g.h} ${g.x + g.w},${g.y + g.h}`} {...common} />;
    case 'line': return <line key={key} x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2} {...common} />;
    case 'arrow': {
      const ang = Math.atan2(sh.y2 - sh.y1, sh.x2 - sh.x1), sz = Math.max(8, width * 3);
      const a1 = ang + Math.PI - 0.45, a2 = ang + Math.PI + 0.45;
      const head = `${sh.x2},${sh.y2} ${sh.x2 + sz * Math.cos(a1)},${sh.y2 + sz * Math.sin(a1)} ${sh.x2 + sz * Math.cos(a2)},${sh.y2 + sz * Math.sin(a2)}`;
      return <g key={key}><line x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2} {...common} /><polygon points={head} fill={color} stroke="none" /></g>;
    }
    default: return <rect key={key} x={g.x} y={g.y} width={g.w} height={g.h} rx={2} {...common} />;   // rect
  }
}

/* Sticky metnini kutuya sığacak satırlara böler: önce \n ile paragraflara, sonra her
   paragrafı karakter-genişliği tahminiyle yumuşak-sarar; kutuya (yükseklik) sığan satır
   sayısıyla sınırlar. Aşırı içerik kırpılır — rapor okunur kalsın diye basit yaklaşım. */
function wrapStickyText(text, maxChars, maxLines) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); if (out.length >= maxLines) break; continue; }
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length > maxChars && cur) { out.push(cur); cur = w; } else cur = next;
      if (out.length >= maxLines) break;
    }
    if (out.length >= maxLines) break;
    if (cur) out.push(cur);
    if (out.length >= maxLines) break;
  }
  return out.slice(0, maxLines);
}

/* Tek sticky'nin salt-okunur SVG render'ı (editör↔rapor tutarlılığı): renkli yuvarlak kutu +
   koyu mürekkep metni. Editördeki başlık-şeridi + iç dolgu yerleşimini kabaca yansıtır. */
function renderSticky(s, key) {
  const padX = 10, padTop = 22, lineH = 16, fontSize = 13;
  const maxChars = Math.max(1, Math.floor((s.w - 20) / 7));
  const maxLines = Math.max(1, Math.floor((s.h - padTop) / lineH));
  const lines = wrapStickyText(s.text, maxChars, maxLines);
  return (
    <g key={key}>
      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={8} fill={s.color} stroke="#00000018" strokeWidth={1} />
      <text fontSize={fontSize} fill="#1A2B32" fontFamily="var(--font-sans, sans-serif)">
        {lines.map((ln, i) => <tspan key={i} x={s.x + padX} y={s.y + padTop + i * lineH}>{ln}</tspan>)}
      </text>
    </g>
  );
}

/* Tek stamp'in (emoji reaksiyon damgası) salt-okunur SVG render'ı; baseline kaydırması emoji'yi
   editördeki mutlak-konumlu div'in sol-üst köşesine yakın oturtur. Emoji SVG <text> baskıda çalışır. */
function renderStamp(st, key) {
  return <text key={key} x={st.x} y={st.y + st.size * 0.8} fontSize={st.size}>{st.emoji}</text>;
}

/* Haritanın tamamının read-only SVG render'ı: kulvar şeritleri (varsa) + ok overlay
   (ProcessMapStudio'daki edgeAnchors kenar-ortası ankraj mantığıyla aynı, ortak processMapGeometry.js'ten) + şekiller. */
function MapSvg({ map }) {
  const isSwim = map.kind === 'swimlane';
  const nodes = map.nodes;
  const PAD = 32;
  // Karalama (sketch) haritanın node'larının çok altına/sağına taşabilir (serbest çizim) —
  // içerik kutusu yalnız şekillere göre hesaplanırsa sketch viewBox dışında kalıp GÖRÜNMEZ
  // olur (SVG varsayılan olarak viewBox dışını kırpar). Bu yüzden sketch noktaları/metinleri
  // de sınır hesaplamasına dahil edilir.
  const sketch = map.sketch || { strokes: [], texts: [], shapes: [], stickies: [], stamps: [], comments: [] };
  const shapes = sketch.shapes || [];   // eski haritalar bu alandan yoksun olabilir
  const stickies = sketch.stickies || [];   // eski haritalar bu alanlardan yoksun olabilir
  const stamps = sketch.stamps || [];
  const comments = sketch.comments || [];   // eski haritalar bu alandan yoksun olabilir
  const sketchXs = sketch.strokes.flatMap(s => s.points.map(p => p[0]))
    .concat(sketch.texts.map(t => t.x))
    .concat(shapes.flatMap(sh => [sh.x1, sh.x2]))   // şekil uçları da sınıra dahil — yoksa node dışı şekil kırpılır
    .concat(stickies.flatMap(s => [s.x, s.x + s.w]))   // sticky sınırları — node dışı sticky kırpılmasın
    .concat(stamps.flatMap(st => [st.x, st.x + st.size]))   // stamp sınırları — node dışı stamp kırpılmasın
    .concat(comments.flatMap(c => [c.x, c.x + 22]));   // comment iğne sınırları — node dışı iğne kırpılmasın
  const sketchYs = sketch.strokes.flatMap(s => s.points.map(p => p[1]))
    .concat(sketch.texts.map(t => t.y))
    .concat(shapes.flatMap(sh => [sh.y1, sh.y2]))
    .concat(stickies.flatMap(s => [s.y, s.y + s.h]))
    .concat(stamps.flatMap(st => [st.y, st.y + st.size]))
    .concat(comments.flatMap(c => [c.y, c.y + 22]));
  const maxSketchX = sketchXs.length ? Math.max(...sketchXs) : 0;
  const maxSketchY = sketchYs.length ? Math.max(...sketchYs) : 0;
  const maxNodeX = Math.max(0, maxSketchX, ...nodes.map(n => n.x + dimsOf(n.type).w));
  const maxNodeY = Math.max(0, maxSketchY, ...nodes.map(n => n.y + dimsOf(n.type).h));
  const contentW = Math.max(500, maxNodeX + 40);
  const contentH = isSwim
    ? Math.max(map.lanes.length * LANE_H, maxNodeY + 30)
    : Math.max(maxNodeY + 60, 260);
  const vbW = contentW + PAD * 2, vbH = contentH + PAD * 2;

  return (
    <svg viewBox={`${-PAD} ${-PAD} ${vbW} ${vbH}`} width="100%" style={{ maxHeight: '620px', display: 'block' }}
      preserveAspectRatio="xMinYMin meet">
      <defs>
        <marker id="rp-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill="var(--color-ink-soft)" />
        </marker>
      </defs>

      {isSwim && map.lanes.map((lane, i) => (
        <g key={lane.id}>
          <rect x={-PAD} y={lane.order * LANE_H} width={vbW} height={LANE_H}
            fill={i % 2 === 1 ? 'var(--color-surface-2)' : 'transparent'} />
          <line x1={-PAD} y1={lane.order * LANE_H} x2={vbW - PAD} y2={lane.order * LANE_H}
            stroke="var(--color-line)" strokeWidth="1" />
          <text x={-PAD + 6} y={lane.order * LANE_H + 16} fontSize="10.5" fontWeight="700" fill="var(--color-ink-soft)">
            {lane.name}
          </text>
        </g>
      ))}

      {/* Karalama katmanı — kulvar şeritlerinin ÜSTÜNDE, şekillerin ALTINDA (ProcessMapStudio'daki
          salt-görsel sketch-layer render'ının okunur kopyası; ortak yardımcı çıkarmaya değecek kadar
          büyük değil — burada bilinçli kopya). Rapor/PDF çıktısında karalama görünür olsun diye. */}
      <g className="sketch-layer">
        {sketch.strokes.map(st => (
          <polyline key={st.id}
            points={st.points.map(p => p.join(',')).join(' ')}
            fill="none" stroke={st.color} strokeWidth={st.width} opacity={st.opacity}
            strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {sketch.texts.map(t => (
          <text key={t.id} x={t.x} y={t.y} fill={t.color} fontSize="14">{t.text}</text>
        ))}
        {shapes.map(sh => renderShape(sh, sh.id))}
        {stickies.map(s => renderSticky(s, s.id))}
        {stamps.map(st => renderStamp(st, st.id))}
      </g>

      {map.edges.map(edge => {
        const src = nodes.find(n => n.id === edge.from);
        const tgt = nodes.find(n => n.id === edge.to);
        if (!src || !tgt) return null;
        const { p1, p2 } = edgeAnchors(src, tgt);   // kutu kenar-ortası ankraj (editörle aynı)
        return (
          <path key={edge.id} d={bezierPath(p1, p2)} fill="none"
            stroke="var(--color-ink-soft)" strokeWidth="1.5" markerEnd="url(#rp-arrow)" />
        );
      })}

      {nodes.map(n => <NodeShapeSvg key={n.id} node={n} counts={tagCounts(map, n.id)} />)}

      {/* Comment (yorum) iğneleri — düğümlerin ÜSTÜNDE, 1-tabanlı numaralı konuşma-balonu
          rozeti. Editördeki sol-üst ankrajlı 24px rozetle örtüşsün diye görsel merkez
          (x+11, y+11). done ise soluk (muted) dolgu. Numara aşağıdaki Yorumlar listesiyle eşleşir. */}
      {comments.map((c, i) => {
        const cx = c.x + 11, cy = c.y + 11;
        return (
          <g key={c.id}>
            <circle cx={cx} cy={cy} r={11} fill={c.done ? '#94A3B8' : 'var(--color-accent)'}
              opacity={c.done ? 0.75 : 1} stroke="#ffffff" strokeWidth="1.5" />
            {/* konuşma-balonu kuyruğu (sol-alt) */}
            <path d={`M${cx - 7},${cy + 8} L${cx - 2},${cy + 4} L${cx - 2},${cy + 12} Z`}
              fill={c.done ? '#94A3B8' : 'var(--color-accent)'} opacity={c.done ? 0.75 : 1} />
            <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#ffffff"
              fontFamily="var(--font-sans, sans-serif)">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

function FieldRow({ label, value, className = '' }) {
  return (
    <tr className={className}>
      <th className="w-[26%] text-left align-top bg-surface-2 border border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </th>
      <td className="border border-line px-3 py-1.5 text-[13px] text-ink" colSpan={3}>{value || '—'}</td>
    </tr>
  );
}

function ListBlock({ label, items }) {
  return (
    <div className="border border-line">
      <div className="bg-surface-2 border-b border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </div>
      {items && items.length ? (
        <ul className="px-3 py-1.5 space-y-0.5 text-[12.5px] text-ink list-disc list-inside">
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      ) : (
        <div className="px-3 py-1.5 text-[12.5px] text-ink-faint">—</div>
      )}
    </div>
  );
}

/* Kart bloğu: LCW-tarzı çerçeveli tablo. Riskler map.tags'ten türer (kartın kendi alanı DEĞİL —
   çift veri girişini önlemek için haritadaki risk etiketleri tek doğruluk kaynağı). */
function KartBlok({ map }) {
  const c = map.card || DEFAULT_CARD;
  const riskler = map.tags.filter(t => t.type === 'risk');

  return (
    <section className="border border-line-strong">
      <div className="px-4 py-2.5" style={{ background: 'var(--color-header)', color: 'var(--color-header-ink)' }}>
        <div className="font-display font-bold tracking-wide text-[15px]">SÜREÇ KARTI</div>
        <div className="text-[12px] opacity-90">{map.name}</div>
      </div>

      <table className="w-full border-collapse">
        <tbody>
          <FieldRow label="Süreç Adı" value={map.name} />
          <FieldRow label="Süreç Kodu" value={c.kod} />
          <FieldRow label="Üst Süreç" value={c.ustSurec} />
          <FieldRow label="Süreç Sahibi" value={c.sahip} />
          <tr>
            <th className="w-[26%] text-left align-top bg-surface-2 border border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
              Yayın Tarihi
            </th>
            <td className="border border-line px-3 py-1.5 text-[13px] text-ink w-[24%]">{c.yayinTarihi || '—'}</td>
            <th className="w-[24%] text-left align-top bg-surface-2 border border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
              Revizyon No
            </th>
            <td className="border border-line px-3 py-1.5 text-[13px] text-ink">{c.revizyonNo || '—'}</td>
          </tr>
          <FieldRow label="Süreç Ekibi" value={<span style={{ whiteSpace: 'pre-line' }}>{c.ekip}</span>} />
          <FieldRow label="Amaç" value={<span style={{ whiteSpace: 'pre-line' }}>{c.amac}</span>} />
          <FieldRow label="Kapsam" value={<span style={{ whiteSpace: 'pre-line' }}>{c.kapsam}</span>} />
        </tbody>
      </table>

      <div className="grid grid-cols-2 gap-0 border-t border-line-strong">
        <ListBlock label="Girdiler" items={c.girdiler} />
        <ListBlock label="Çıktılar" items={c.ciktilar} />
        <ListBlock label="Kaynaklar" items={c.kaynaklar} />
        <ListBlock label="Dokümanlar" items={c.dokumanlar} />
      </div>

      <div className="border-t border-line-strong">
        <div className="bg-surface-2 border-b border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Performans Göstergeleri
        </div>
        {c.metrikler.length ? (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left border border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Gösterge</th>
                <th className="text-left border border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft w-24">Hedef</th>
                <th className="text-left border border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft w-24">Birim</th>
              </tr>
            </thead>
            <tbody>
              {c.metrikler.map(m => (
                <tr key={m.id}>
                  <td className="border border-line px-3 py-1 text-[12.5px] text-ink">{m.ad}</td>
                  <td className="border border-line px-3 py-1 text-[12.5px] text-ink tabular-nums">{m.hedef ?? '—'}</td>
                  <td className="border border-line px-3 py-1 text-[12.5px] text-ink">{m.birim || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-3 py-1.5 text-[12.5px] text-ink-faint">—</div>
        )}
      </div>

      <div className="border-t border-line-strong">
        <div className="bg-surface-2 border-b border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Riskler <span className="font-mono text-ink-faint/70">(haritadan)</span>
        </div>
        {riskler.length ? (
          <ul className="px-3 py-1.5 space-y-0.5 text-[12.5px] text-ink list-disc list-inside">
            {riskler.map(t => <li key={t.id}>{t.title}{t.severity ? ` — ${SEV_LABEL[t.severity]}` : ''}</li>)}
          </ul>
        ) : (
          <div className="px-3 py-1.5 text-[12.5px] text-ink-faint">—</div>
        )}
      </div>

      <table className="w-full border-collapse border-t border-line-strong">
        <tbody>
          <FieldRow label="İlişkili Stratejik Hedef" value={c.stratejikHedef} />
        </tbody>
      </table>
    </section>
  );
}

/* İyileştirme tablosu: haritanın tüm etiketleri (buildIyilestirmeAOA ile aynı alan seti —
   Tür/Başlık/Şekil/Önem/Not); renkli tür rozeti map.tags üzerinden doğrudan üretilir. */
function IyilestirmeTablosu({ map }) {
  const nodeLabel = (id) => map.nodes.find(n => n.id === id)?.label || '—';
  if (!map.tags.length) return null;

  return (
    <section className="border border-line-strong">
      <div className="px-4 py-2 bg-surface-2 border-b border-line-strong">
        <div className="font-display font-semibold text-ink text-[13px]">İYİLEŞTİRME KAYDI</div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {['Tür', 'Başlık', 'Şekil', 'Önem', 'Not'].map(h => (
              <th key={h} className="text-left border border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {map.tags.map(t => {
            const tt = TAG_TYPES[t.type] || TAG_TYPES.not;
            return (
              <tr key={t.id}>
                <td className="border border-line px-3 py-1.5">
                  <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: RENK_TINT[tt.renk], color: RENK_FG[tt.renk] }}>
                    {tt.ad}
                  </span>
                </td>
                <td className="border border-line px-3 py-1.5 text-[12.5px] text-ink">{t.title}</td>
                <td className="border border-line px-3 py-1.5 text-[12.5px] text-ink-soft">{nodeLabel(t.nodeId)}</td>
                <td className="border border-line px-3 py-1.5 text-[12.5px] text-ink-soft">{t.severity ? SEV_LABEL[t.severity] : '—'}</td>
                <td className="border border-line px-3 py-1.5 text-[12.5px] text-ink-faint">{t.note || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/* Yorumlar listesi: haritadaki comment iğnelerinin numaralı okunur dökümü (baskıda iğneler
   küçük kalabildiği için metin burada tam görünür). Numaralar harita iğneleriyle (1-tabanlı)
   birebir eşleşir; çözülen yorumlar soluk "✓ Çözüldü" işaretiyle gösterilir. Yorum yoksa null. */
function YorumlarBlok({ map }) {
  const comments = map.sketch?.comments || [];
  if (!comments.length) return null;

  return (
    <section className="border border-line-strong">
      <div className="px-4 py-2 bg-surface-2 border-b border-line-strong">
        <div className="font-display font-semibold text-ink text-[13px]">YORUMLAR</div>
      </div>
      <ol className="px-3 py-1.5 space-y-1 text-[12.5px] text-ink">
        {comments.map((c, i) => (
          <li key={c.id} className="flex gap-2">
            <span className="font-semibold tabular-nums text-ink-soft shrink-0">{i + 1}.</span>
            <span className={c.done ? 'text-ink-faint' : 'text-ink'} style={{ whiteSpace: 'pre-line' }}>
              {c.text || '—'}
              {c.done && <span className="ml-2 text-[11px] font-semibold text-ink-faint">✓ Çözüldü</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function ProcessReport({ map, onClose }) {
  // Print CSS (index.css) yalnız `body.printing-report` altında etkin — sınıfı YALNIZ rapor
  // mount'ken ekle. Böylece rapor kapalıyken tarayıcının normal Ctrl+P davranışı korunur
  // (aksi halde #process-report DOM'da yokken tüm sayfa gizli → boş baskı olurdu).
  useEffect(() => {
    document.body.classList.add('printing-report');
    return () => document.body.classList.remove('printing-report');
  }, []);

  return (
    <div id="process-report" className="fixed inset-0 z-[70] bg-paper overflow-y-auto">
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 bg-surface border-b border-line shadow-card px-4 py-2.5">
        <button onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink px-2 py-1 rounded-lg hover:bg-surface-2">
          <X className="w-4 h-4" />← Kapat
        </button>
        <div className="flex-1" />
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-accent hover:bg-accent-strong text-white rounded-lg font-medium">
          <Printer className="w-3.5 h-3.5" />Yazdır / PDF
        </button>
      </div>

      <div className="max-w-[900px] mx-auto p-6 space-y-5 print:p-0 print:max-w-none">
        <KartBlok map={map} />

        <section className="border border-line-strong">
          <div className="px-4 py-2 bg-surface-2 border-b border-line-strong">
            <div className="font-display font-semibold text-ink text-[13px]">SÜREÇ HARİTASI</div>
          </div>
          <div className="p-3">
            <MapSvg map={map} />
          </div>
        </section>

        <YorumlarBlok map={map} />

        <IyilestirmeTablosu map={map} />
      </div>
    </div>
  );
}
