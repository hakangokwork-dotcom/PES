/* Süreç Haritalama Stüdyosu — VSM'den bağımsız serbest süreç şeması editörü.
   Katman: bu dosya ince UI kabuğu — tüm harita mutasyonları processMapOps.js'ten
   saf fonksiyonlarla yapılır (onChange(opsFn(map, ...)) deseni).
   Şekil türleri kimlik rengi TAŞIMAZ (nötr surface) — tür, biçim/ikonla ayrışır. */

import React, { useEffect, useRef, useState } from 'react';
// NOT: `xlsx` bilinçli olarak STATİK import EDİLMEZ — exportExcel içinde dinamik `import('xlsx')`
// ile lazy-load edilir; böylece ~1MB'lık SheetJS ana bundle'a girmez, yalnız Excel'e ilk basışta
// yüklenir. build:standalone tek dosya üretiminde dinamik import inline'lanır (davranış korunur).
import {
  Route, Layers3, Rows3, MousePointer2, Square, Diamond, Frame,
  PlayCircle, CircleStop, FileText, X, Trash2, PlusCircle, ArrowLeft, Pencil, ClipboardList,
  FileSpreadsheet, Printer, Highlighter, Eraser, Type,
  Circle, Triangle, Minus, ArrowRight, Hand, StickyNote, Smile, MessageSquare, Check,
} from 'lucide-react';
import {
  createMap, addNode, moveNode, removeNode,
  connect, disconnect, addLane, renameLane, removeLane, LANE_H,
  addTag, updateTag, removeTag, tagCounts, TAG_TYPES,
  updateNode, updateCard, addMetric, updateMetric, removeMetric, DEFAULT_CARD,
} from '../engine/processMapOps.js';
import {
  addStroke, eraseStrokesAt, clearSketch, addTextNote, addShape, DEFAULT_SKETCH, SKETCH_COLORS,
  addSticky, moveSticky, updateSticky, removeSticky, addStamp, moveStamp, removeStamp, STICKY_COLORS,
  addComment, updateComment, moveComment, toggleCommentDone, removeComment, bellCurvePath,
} from '../engine/sketchOps.js';
import { buildKartAOA, buildFaaliyetlerAOA, buildIyilestirmeAOA } from '../engine/processMapExport.js';
import { dimsOf, handlePoints, bezierPath, nextStepPos, edgeAnchors } from '../engine/processMapGeometry.js';
import { screenToCanvas, canvasToScreen, zoomAt, pan as panView, clampZoom, ZOOM_MIN, ZOOM_MAX } from '../engine/viewport.js';
import ProcessReport from './ProcessReport.jsx';
import { confirmDialog, promptDialog } from './dialogs/dialogService.js';

// Stamp (emoji reaksiyon damgası) seti — bar üstü popover grid'inde gösterilir.
const STAMP_EMOJIS = ['👍', '⭐', '❤️', '⚠️', '✅', '❌', '🔥', '💡', '❓', '🎯'];
// Handle basıp-bırakmada tık↔sürükleme ayrımı için EKRAN-piksel eşiği (zoom'dan bağımsız).
const CLICK_PX = 6;
const KIND_LABEL = { akis: 'Boş Akış', makro: 'Makro Şablon', swimlane: 'Yüzme Kulvarlı' };
const KIND_OPTS = [
  { kind: 'akis', label: 'Boş Akış', icon: Route },
  { kind: 'makro', label: 'Makro Şablon', icon: Layers3 },
  { kind: 'swimlane', label: 'Yüzme Kulvarlı', icon: Rows3 },
];

// TAG_TYPES.renk (anlamsal renk adı) → rozet/nokta sınıfları. 'faint' tür kimlik rengi
// taşımaz (Not) — nötr surface-2/ink-faint.
const RENK_CLS = {
  danger: 'bg-danger-tint text-danger',
  warn: 'bg-warn-tint text-warn',
  ok: 'bg-ok-tint text-ok',
  info: 'bg-info-tint text-info',
  faint: 'bg-surface-2 text-ink-faint',
};

// Elle düzenlenmiş/bozuk JSON'daki bilinmeyen tag.type UI'yı çökertmesin — 'not' türüne düş.
const tagTypeOf = (t) => TAG_TYPES[t] ?? TAG_TYPES.not;

const SEVERITY_LABEL = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };
const SEVERITY_DOT = { dusuk: 'bg-ink-faint', orta: 'bg-warn', yuksek: 'bg-danger' };
const SEVERITY_ORDER = [null, 'dusuk', 'orta', 'yuksek'];
const nextSeverity = (s) => SEVERITY_ORDER[(SEVERITY_ORDER.indexOf(s ?? null) + 1) % SEVERITY_ORDER.length];

/* ------------------------------------------------------------------ */

// Şeklin gövdesi: type'a göre biçim. Not: decision'ın döndürülmüş (rotate-45) iç div'i
// dışında, dıştaki taşıyıcı HİÇBİR ZAMAN döndürülmez — rozet/kalem eklentileri (aşağıda)
// bu yüzden döndürülmüş elmasın üstüne bindirilse bile bozulmadan okunur kalır.
function NodeBody({ node, ring }) {
  if (node.type === 'decision') {
    // İç kare inset-[15%] ile küçültülür: 96×0.7 kenar × √2 ≈ 95px köşegen → elmas nominal
    // 96×96 kutuya SIĞAR ve rectEdgePoint ok ankrajı elmasın gerçek kenarına denk gelir.
    return (
      <>
        <div className={`absolute inset-[15%] rotate-45 border-2 border-line-strong bg-surface shadow-card ${ring}`} />
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <span className="text-[11px] leading-tight text-center line-clamp-2 text-ink font-medium pointer-events-none">
            {node.label}
          </span>
        </div>
      </>
    );
  }
  if (node.type === 'doc') {
    return (
      <div className={`absolute inset-0 flex items-center justify-center text-center px-3
        border border-line bg-surface shadow-card rounded-t-lg rounded-b-[40%_15%] ${ring}`}>
        <span className="text-[12px] leading-tight line-clamp-2 text-ink font-medium">{node.label}</span>
      </div>
    );
  }
  if (node.type === 'subprocess') {
    // III. Seviye (alt-süreç): çift-çerçeve dikdörtgen — dış kenar + iç inset kenar.
    // Basit rect olduğu için decision'daki gibi rotasyon yok; rozet/kalem eklentileri sorunsuz oturur.
    return (
      <div className={`absolute inset-0 rounded-md border border-line bg-surface shadow-card ${ring}`}>
        <div className="absolute inset-[3px] rounded-[3px] border border-line pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-center text-center px-3">
          <span className="text-[12px] leading-tight line-clamp-2 text-ink font-medium">{node.label}</span>
        </div>
      </div>
    );
  }
  if (node.type === 'start' || node.type === 'end') {
    return (
      <div className={`absolute inset-0 flex items-center justify-center text-center px-4
        rounded-full border-2 border-ink-soft/50 bg-surface font-display font-semibold ${ring}`}>
        <span className="text-[12px] leading-tight line-clamp-1 text-ink">{node.label}</span>
      </div>
    );
  }
  // step (varsayılan)
  return (
    <div className={`absolute inset-0 flex items-center justify-center text-center px-3
      rounded-lg border border-line bg-surface shadow-card ${ring}`}>
      <span className="text-[12px] leading-tight line-clamp-2 text-ink font-medium">{node.label}</span>
    </div>
  );
}

// 4 kenar-ortası handle konumu — NodeShape'in kendi yerel kutusuna göre (0..w, 0..h).
// handlePoints (geometri modülü) mutlak koordinat döner; burada yüzde bazlı yerel konum yeter.
const HANDLE_SIDES = [
  { side: 'top',    style: { left: '50%', top: 0 } },
  { side: 'right',  style: { left: '100%', top: '50%' } },
  { side: 'bottom', style: { left: '50%', top: '100%' } },
  { side: 'left',   style: { left: 0, top: '50%' } },
];

function NodeShape({ node, tool, selected, showHandles, isDropTarget, counts, onPointerDown, onClick, onDoubleClick, onOpenModal, onPointerEnter, onPointerLeave, onStartConnect, onHandleEnter, onHandleLeave }) {
  const { w, h } = dimsOf(node.type);
  const ring = selected ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : '';
  const cursor = tool === 'move' ? 'grab' : tool.startsWith('add:') ? 'inherit' : 'pointer';
  const style = { left: node.x, top: node.y, width: w, height: h, cursor };
  const activeCounts = Object.entries(counts || {}).filter(([, n]) => n > 0);

  return (
    <div style={style}
      className={`absolute select-none rounded-lg transition-shadow duration-150
        ${!selected ? 'hover:shadow-md hover:ring-1 hover:ring-accent/40' : ''}`}
      onPointerDown={onPointerDown} onClick={onClick} onDoubleClick={onDoubleClick}
      onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <NodeBody node={node} ring={ring} />

      {isDropTarget && (
        <div className="absolute inset-0 rounded-lg ring-2 ring-accent bg-accent-tint/40 pointer-events-none" />
      )}

      {activeCounts.length > 0 && (
        <div className="absolute -top-2 -right-2 flex gap-0.5 z-10">
          {activeCounts.map(([key, n]) => (
            <span key={key} title={`${TAG_TYPES[key].ad}: ${n}`}
              className={`min-w-[15px] h-[15px] px-1 rounded-full text-[9px] leading-[15px] text-center font-mono font-bold tabular-nums shadow-card ${RENK_CLS[TAG_TYPES[key].renk]}`}>
              {n}
            </span>
          ))}
        </div>
      )}

      {selected && tool === 'move' && (
        <button onClick={(e) => { e.stopPropagation(); onOpenModal(node.id); }} title="Şekli düzenle (Enter)"
          className="absolute -top-2 -left-2 z-10 p-0.5 rounded-full bg-accent hover:bg-accent-strong text-white shadow-card">
          <Pencil className="w-3 h-3" />
        </button>
      )}

      {showHandles && HANDLE_SIDES.map(({ side, style: hs }) => (
        <div key={side} title="Tıkla: bu yönde yeni adım · Sürükle: bağla"
          onPointerDown={(e) => { e.stopPropagation(); onStartConnect(node.id, side, e); }}
          onPointerEnter={(e) => { e.stopPropagation(); onHandleEnter?.(node.id, side); }}
          onPointerLeave={(e) => { e.stopPropagation(); onHandleLeave?.(); }}
          style={{ ...hs, transform: 'translate(-50%, -50%)', cursor: 'crosshair' }}
          className="absolute z-20 w-[11px] h-[11px] rounded-full bg-surface border-2 border-accent
            hover:w-[15px] hover:h-[15px] hover:bg-accent transition-all" />
      ))}
    </div>
  );
}

// Yüzer araç çubuğu ikon düğmesi — FigJam tarzı yuvarlak, aktif → accent-tint.
function BarBtn({ active, onClick, icon: Icon, title }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-9 h-9 flex items-center justify-center rounded-full transition
        ${active ? 'bg-accent-tint text-accent-ink' : 'text-ink-soft hover:bg-surface-2'}`}>
      <Icon className="w-4 h-4" />
    </button>
  );
}

/* ------------------------------------------------------------------ */

const SKETCH_WIDTHS = [[2, 'İnce'], [4, 'Orta'], [8, 'Kalın']];
const ERASER_RADIUS = 10;

// Karalama şekilleri için açılır menü satırları (tür → etiket + ikon).
/* Çan eğrisi ikonu — lucide'de yok. Şeklin KENDİ geometrisinden çizilir, yani
   buton birebir çizeceğin şekli gösterir (ikon ile çıktı asla ayrışmaz).
   lucide sözleşmesi: className alır, currentColor ile boyanır. */
function BellCurveIcon({ className }) {
  const g = { x: 1, y: 3, w: 22, h: 16, cx: 12 };
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={bellCurvePath(g)} />
    </svg>
  );
}

const SHAPE_MENU = [
  { type: 'rect', label: 'Kare', icon: Square },
  { type: 'ellipse', label: 'Daire', icon: Circle },
  { type: 'triangle', label: 'Üçgen', icon: Triangle },
  { type: 'line', label: 'Çizgi', icon: Minus },
  { type: 'arrow', label: 'Ok', icon: ArrowRight },
  { type: 'bell', label: 'Normal Dağılım (Çan Eğrisi)', icon: BellCurveIcon },
];

// Sürükleme kutusundan normalleştirilmiş geometri (sol-üst köşe + genişlik/yükseklik + merkez).
function shapeGeom(sh) {
  const x = Math.min(sh.x1, sh.x2), y = Math.min(sh.y1, sh.y2);
  const w = Math.abs(sh.x2 - sh.x1), h = Math.abs(sh.y2 - sh.y1);
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

// Şekil nesnesini SVG öğesine çevir. opts.dashed → canlı önizleme için kesik-çizgi.
function renderShape(sh, key, opts = {}) {
  const { color, width } = sh;
  const common = {
    fill: 'none', stroke: color, strokeWidth: width,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    ...(opts.dashed ? { strokeDasharray: '6 4' } : {}),
  };
  const g = shapeGeom(sh);
  switch (sh.type) {
    case 'ellipse': return <ellipse key={key} cx={g.cx} cy={g.cy} rx={g.w / 2} ry={g.h / 2} {...common} />;
    case 'triangle': return <polygon key={key} points={`${g.cx},${g.y} ${g.x},${g.y + g.h} ${g.x + g.w},${g.y + g.h}`} {...common} />;
    // Normal dağılım (çan) eğrisi — yol saf geometriden (sketchOps.bellCurvePath, testli).
    case 'bell': return <path key={key} d={bellCurvePath(g)} {...common} />;
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

function MapEditor({ map, onChange, onBack }) {
  const [tool, setTool] = useState('move');           // 'move' | 'add:step' | 'add:decision' | 'draw:pen' | ...
  const [selectedId, setSelectedId] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(null);
  // n8n-tarzı doğrudan bağlama: bir düğüm handle'ından sürükleme sırasındaki geçici (lokal, hiç
  // persist edilmeyen) durum. fromPt mutlak tuval koordinatı (handlePoints); curX/curY imleç.
  const [connecting, setConnecting] = useState(null);  // { fromId, side, fromPt:{x,y}, startPt:{x,y}, curX, curY }
  // FigJam ghost: bir handle üzerinde hover → o yönde açılacak yeni adımın soluk önizlemesi.
  const [hoverHandle, setHoverHandle] = useState(null);  // { nodeId, side } | null
  // Hem "hangi düğüm hover'da (handle'ları göster)" hem "connect-drag sırasında imlecin
  // üstünde olduğu düğüm (drop-target vurgusu)" için tek state — bkz. handleCanvasPointerMove.
  const [hoverNodeId, setHoverNodeId] = useState(null);
  const [modalNodeId, setModalNodeId] = useState(null);   // NodeModal (etiketleme) açık şekil
  const [cardOpen, setCardOpen] = useState(false);        // Süreç Kartı editörü açık mı
  const [reportOpen, setReportOpen] = useState(false);    // Rapor (Yazdır/PDF) tam ekran görünümü açık mı
  // Sürükleme sırasında konum LOKAL tutulur (persist fırtınası önlemi): her pointermove'da
  // kök setData çağırmak tüm workspace'in stringify+localStorage yazımı ve computeCapacity
  // demek olurdu. moveNode YALNIZ pointerup'ta çağrılır; dragPos yalnız görsel override'dır.
  const [dragPos, setDragPos] = useState(null);           // { id, x, y }
  const [sketchColor, setSketchColor] = useState(SKETCH_COLORS[0]);
  const [sketchWidth, setSketchWidth] = useState(4);   // Orta (kalınlık düğmeleri: 2/4/8)
  // Kalem/fosforlu: aktif (henüz commit edilmemiş) stroke — pointerup'ta tek onChange(addStroke).
  const [drawing, setDrawing] = useState(null);           // { color, width, opacity, points:[[x,y]] }
  // Silgi: sürükleme boyunca gezilen noktalar lokal biriktirilir; her render'da bu noktalar
  // map üstünde ANLIK önizleme için uygulanır (eraseStrokesAt saf, çağırmak veri yazmaz),
  // fakat onChange yalnız pointerup'ta TEK SEFER çağrılır (persist/save-debounce fırtınası önlenir).
  const [erasing, setErasing] = useState(null);           // { points:[[x,y]] }
  // Karalama şekilleri: sürükle-çiz sırasındaki geçici (lokal, persist edilmeyen) kutu.
  // Ekle/Karalama/Not seçenek barları artık aktif `tool`e göre açılır (toggle state yok);
  // yalnız Damga emoji seçici açık kalma için ayrı bir bayrak tutar.
  const [stampMenuOpen, setStampMenuOpen] = useState(false);   // emoji seçici (Damga) açık mı
  const [shaping, setShaping] = useState(null);           // { type, x1, y1, x2, y2 }
  // Sticky/stamp: seçili renk + hangi sticky düzenlemeye (autofocus) açık + sürükleme lokal durumu.
  const [stickyColor, setStickyColor] = useState(STICKY_COLORS[0]);
  const [editingStickyId, setEditingStickyId] = useState(null);
  const [stickyDraft, setStickyDraft] = useState('');   // odaklı sticky metni lokal tampon — blur'da commit
  const [sketchDragPos, setSketchDragPos] = useState(null);   // { id, x, y } — lokal görsel override
  // Yorum iğnesi: açık düzenleme pop-over'ının comment id'si + metin blur-commit taslak tamponu.
  const [openCommentId, setOpenCommentId] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const commentTextRef = useRef(null);   // pop-over textarea el (autofocus için)
  const scrollRef = useRef(null);
  const dragRef = useRef(null);   // { id, startX, startY, origX, origY, curX, curY, moved }
  // Sticky/stamp sürükleme ref'i (node dragRef deseninin aynısı, ayrı öğe tipi için).
  const sketchDragRef = useRef(null);   // { kind:'sticky'|'stamp', id, startX, startY, origX, origY, curX, curY, moved }
  const stickyTextRefs = useRef({});    // id → textarea el (autofocus için)
  // Sonsuz tuval viewport: view.x/y = pan piksel ofseti (ekran uzayı), zoom = ölçek.
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [panning, setPanning] = useState(null);   // { sx, sy, ox, oy } — pan sürüklemesi sırasında
  const spaceRef = useRef(false);                  // Space basılı mı (pan modu) — re-render tetiklemez
  const [spaceDown, setSpaceDown] = useState(false);   // yalnız imleç için (grab) — pointerdown kontrolü spaceRef ile
  const isSwim = map.kind === 'swimlane';

  /* Harita değişince (map.id) görünümü %100/orijine sıfırla — yeni harita başlangıçta hizalı açılsın. */
  useEffect(() => { setView({ x: 0, y: 0, zoom: 1 }); }, [map.id]);

  /* Açık yorum pop-over'ının taslağını (varsa, değiştiyse) tek onChange ile commit et. */
  const commitOpenComment = () => {
    if (openCommentId == null) return;
    const c = (map.sketch?.comments || []).find(x => x.id === openCommentId);
    if (c && c.text !== commentDraft) onChange(updateComment(map, openCommentId, commentDraft));
  };
  const closeCommentPopover = () => { commitOpenComment(); setOpenCommentId(null); setCommentDraft(''); };

  const selectTool = (t) => {
    commitOpenComment();
    setTool(t); setSelectedId(null); setDrawing(null); setErasing(null); setShaping(null);
    setStampMenuOpen(false); setHoverHandle(null);
    setOpenCommentId(null); setCommentDraft('');
  };
  // Karalama seçenek barından araç seç: bar `tool`e bağlı olduğundan seçince AÇIK kalır.
  const pickDraw = (t) => { selectTool(t); };

  /* İmleç altındaki düğüm — hem hover (handle görünürlüğü) hem connect-drag drop-target
     hedefi tespiti için basit AABB hit-test (nodesView: sürüklenen düğümün lokal konumu dahil).
     findLast: örtüşmede EN ÜSTTE boyanan (dizide son) düğüm hedef olsun (z-order tutarlı). */
  const nodeAtPoint = (x, y) => nodesView.findLast(n => {
    const { w, h } = dimsOf(n.type);
    return x >= n.x && x <= n.x + w && y >= n.y && y <= n.y + h;
  });

  const handleClearSketch = async () => {
    if (!(await confirmDialog({ message: 'Karalama (tüm çizgi, şekil ve notlar) temizlensin mi?', danger: true }))) return;
    onChange(clearSketch(map));
  };

  /* Fare/dokunmatik istemci koordinatını tuval-içi (pan/zoom'dan bağımsız) koordinata çevir.
     Tek chokepoint: view transform'unu tersine çevirir → tüm araç handler'ları canvas uzayında
     değişmeden çalışır. */
  const toCanvasXY = (e) => {
    const el = scrollRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return screenToCanvas(view, e.clientX - rect.left, e.clientY - rect.top);
  };

  /* --- Sürükleme (eşiksiz tıklama = seçim) --- */
  const handleNodePointerDown = (node) => (e) => {
    if (tool !== 'move') return;
    e.stopPropagation();
    const { x, y } = toCanvasXY(e);
    dragRef.current = { id: node.id, startX: x, startY: y, origX: node.x, origY: node.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  /* --- n8n-tarzı doğrudan bağlama: handle'dan sürükleme başlangıcı ---
     Pointer capture TUVAL (scrollRef) üzerine alınır (handle üstüne değil) — böylece imleç
     başka bir düğümün üstüne gitse bile move/up olayları hep tuvalde yakalanır ve hedef
     düğüm hit-test ile (nodeAtPoint) belirlenir, tarayıcının doğal hover/capture'ına güvenilmez. */
  const startConnect = (nodeId, side, e) => {
    const node = map.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const fromPt = handlePoints(node)[side];
    const { x, y } = toCanvasXY(e);
    // startPt = GERÇEK pointer-down noktası (handle geometrik merkezi DEĞİL) — tık/sürükleme
    // eşiği bundan ölçülür (kenardan tıklama da tık sayılsın, merkezden sapma yanıltmasın).
    setConnecting({ fromId: nodeId, side, fromPt, startPt: { x, y }, curX: x, curY: y });
    setHoverHandle(null);   // sürükleme/tık başlarken ghost'u gizle (canlı çizgi devralır)
    scrollRef.current?.setPointerCapture?.(e.pointerId);
  };

  /* --- Karalama: kalem/fosforlu (drawing) + silgi (erasing) pointer başlangıcı ---
     Yalnız tuvalin kendisinde (node'lar draw aracı aktifken pointer-events:none) tetiklenir. */
  const handleCanvasPointerDown = (e) => {
    // Tuvale dokununca açık yüzer popover'ları kapat (click-outside + ilk çizimi engellememesi).
    // return YOK — olay kendi normal dalına (pan/draw/shape/drag) devam etsin.
    if (stampMenuOpen) setStampMenuOpen(false);
    // Açık yorum pop-over'ı: boş tuvale dokununca taslağı commit edip kapat (pin/pop-over kendi pointerdown'ını durdurur).
    if (openCommentId != null) closeCommentPopover();
    // Pan: orta fare tuşu / Space basılı / El aracı → tüm araç dallarından ÖNCE.
    if (e.button === 1 || spaceRef.current || tool === 'hand') {
      e.preventDefault();   // orta-tuş: tarayıcı autoscroll balonunu bastır
      setPanning({ sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool.startsWith('shape:')) {
      const { x, y } = toCanvasXY(e);
      setShaping({ type: tool.slice(6), x1: x, y1: y, x2: x, y2: y });
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === 'draw:pen' || tool === 'draw:highlighter') {
      const { x, y } = toCanvasXY(e);
      const highlighter = tool === 'draw:highlighter';
      setDrawing({
        color: sketchColor,
        width: highlighter ? sketchWidth * 3 : sketchWidth,
        opacity: highlighter ? 0.35 : 1,
        points: [[x, y]],
      });
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === 'draw:eraser') {
      const { x, y } = toCanvasXY(e);
      setErasing({ points: [[x, y]] });
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
  };
  const handleCanvasPointerMove = (e) => {
    if (panning) {
      setView(v => ({ ...v, x: panning.ox + (e.clientX - panning.sx), y: panning.oy + (e.clientY - panning.sy) }));
      return;
    }
    if (connecting) {
      const { x, y } = toCanvasXY(e);
      setConnecting(c => c && { ...c, curX: x, curY: y });   // lokal — persist yok
      const hit = nodeAtPoint(x, y);
      setHoverNodeId(hit && hit.id !== connecting.fromId ? hit.id : null);
      return;
    }
    if (drawing) {
      const { x, y } = toCanvasXY(e);
      setDrawing(d => d && { ...d, points: [...d.points, [x, y]] });
      return;
    }
    if (erasing) {
      const { x, y } = toCanvasXY(e);
      setErasing(er => er && { ...er, points: [...er.points, [x, y]] });
      return;
    }
    if (shaping) {
      const { x, y } = toCanvasXY(e);
      setShaping(s => s && { ...s, x2: x, y2: y });
      return;
    }
    // Sticky/stamp sürükleme — node dragRef'ten ÖNCE (kendi ref'i).
    if (sketchDragRef.current) {
      const { x, y } = toCanvasXY(e);
      const d = sketchDragRef.current;
      const dx = x - d.startX, dy = y - d.startY;
      if (!d.moved && Math.hypot(dx, dy) * view.zoom < CLICK_PX) return;   // ekran-uzayı eşiği
      d.moved = true;
      d.curX = Math.max(0, d.origX + dx);
      d.curY = Math.max(0, d.origY + dy);
      setSketchDragPos({ id: d.id, x: d.curX, y: d.curY });
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = toCanvasXY(e);
    const dx = x - d.startX, dy = y - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;   // sürükleme eşiği — altında kalırsa tıklama sayılır
    d.moved = true;
    d.curX = Math.max(0, d.origX + dx);
    d.curY = Math.max(0, d.origY + dy);
    setDragPos({ id: d.id, x: d.curX, y: d.curY });   // lokal görsel — kalıcı yazım pointerup'ta
  };
  const handleCanvasPointerUp = () => {
    if (panning) { setPanning(null); return; }
    if (connecting) {
      const { fromId, side, startPt, curX, curY } = connecting;
      // Tık mı sürükleme mi? GERÇEK pointer-down noktasından (startPt) sapma EKRAN pikselinde
      // ölçülür (canvas mesafesi × zoom) → eşik zoom'dan bağımsız + kenardan tıklama da tık sayılır.
      // Eşik altında → TIK: FigJam ghost yönünde yeni "Adım" oluştur + kaynağa bağla + seç.
      if (Math.hypot(curX - startPt.x, curY - startPt.y) * view.zoom < CLICK_PX) {
        const src = map.nodes.find(n => n.id === fromId);
        if (src) {
          const pos = nextStepPos(src, side);
          const m = addNode(map, 'step', Math.max(0, pos.x), Math.max(0, pos.y));
          const newId = m.nodes[m.nodes.length - 1].id;
          onChange(connect(m, fromId, newId));
          setSelectedId(newId);
        }
        setConnecting(null);
        setHoverNodeId(null);
        setHoverHandle(null);
        return;
      }
      // Hedefi bırakma anındaki gerçek imleç konumundan hit-test et (hoverNodeId'e güvenme).
      const target = nodeAtPoint(curX, curY);
      if (target && target.id !== fromId) {
        onChange(connect(map, fromId, target.id));                 // başka düğüme bırak → bağla
      } else if (!target) {
        // GERÇEK boş tuval → yeni "Adım" düğümü o konumda oluşturulur ve hemen bağlanır.
        // Negatif konum olmasın (kenara yakın bırakıldığında tam görünsün): 0'a clamp.
        let m = addNode(map, 'step', Math.max(0, curX - 74), Math.max(0, curY - 32));
        const newId = m.nodes[m.nodes.length - 1].id;
        onChange(connect(m, fromId, newId));
      }
      // else (target === fromId): kaynağın kendi üstüne bırakıldı → iptal, hiçbir şey yapma.
      setConnecting(null);
      setHoverNodeId(null);
      setHoverHandle(null);
      return;
    }
    if (drawing) {
      if (drawing.points.length >= 2) onChange(addStroke(map, drawing));   // tek commit
      setDrawing(null);
      return;
    }
    if (erasing) {
      // Gezilen tüm noktalar üstünden TEK sefer geçilir → tek onChange (persist fırtınası yok),
      // ama görsel önizleme (aşağıda sketchView) sürüklerken canlı zaten güncel görünür.
      let m = map;
      erasing.points.forEach(([px, py]) => { m = eraseStrokesAt(m, px, py, ERASER_RADIUS); });
      if (m !== map) onChange(m);
      setErasing(null);
      return;
    }
    if (shaping) {
      const m = addShape(map, { ...shaping, color: sketchColor, width: sketchWidth });
      if (m !== map) onChange(m);   // <3px → aynı map referansı → gereksiz persist/render önle (silgi/kalem deseniyle tutarlı)
      setShaping(null);
      return;
    }
    // Sticky/stamp sürükleme commit'i — node dragRef'ten ÖNCE.
    if (sketchDragRef.current) {
      const d = sketchDragRef.current;
      if (d.moved && d.curX != null) {
        onChange(d.kind === 'sticky' ? moveSticky(map, d.id, d.curX, d.curY)
          : d.kind === 'comment' ? moveComment(map, d.id, d.curX, d.curY)
          : moveStamp(map, d.id, d.curX, d.curY));
      } else if (!d.moved && d.kind === 'comment') {
        // Eşik-altı = tık → düzenleme pop-over'ını aç. Önce açık başka pop-over'ın taslağını commit et
        // + araç çubuğu popover'larını kapat (tek yüzer popover ilkesi — pin stopPropagation menü-close'u atlar).
        commitOpenComment();
        setStampMenuOpen(false);
        setOpenCommentId(d.id);   // [openCommentId] effect'i taslağı c.text'ten seed eder (tek seed noktası)
      }
      sketchDragRef.current = null;
      setSketchDragPos(null);
      return;
    }
    const d = dragRef.current;
    if (d) {
      if (d.moved && d.curX != null) onChange(moveNode(map, d.id, d.curX, d.curY));  // tek commit
      else if (!d.moved) setSelectedId(d.id);          // sürüklenmediyse → seçim
    }
    dragRef.current = null;
    setDragPos(null);
  };

  /* Pointer iptali (tarayıcı capture'ı düşürdü / kesinti): commit YOK — her geçici durumu
     temiz sıfırla. pointerUp'a bağlanırsa connect-drag iptali yanlışlıkla boş-tuval quick-add'i
     tetikler (istenmeyen "Yeni Adım"); Escape ile aynı davranış. */
  const handleCanvasPointerCancel = () => {
    if (panning) { setPanning(null); return; }
    setConnecting(null); setHoverNodeId(null); setHoverHandle(null);
    setDrawing(null); setErasing(null); setShaping(null);
    dragRef.current = null; setDragPos(null);
    sketchDragRef.current = null; setSketchDragPos(null);
  };

  const handleNodeClick = (node) => (e) => {
    if (tool.startsWith('add:')) return;               // boşluğa taşınsın — tuval tıklamasıyla yerleştirme
    e.stopPropagation();
    // 'move': seçim zaten pointerup'ta yapıldı; bağlama artık handle sürüklemesiyle (startConnect)
  };

  const handleNodeDoubleClick = (node) => (e) => {
    e.stopPropagation();
    setModalNodeId(node.id);
  };

  const handleCanvasClick = async (e) => {
    const { x, y } = toCanvasXY(e);
    if (tool.startsWith('add:')) {
      const type = tool.slice(4);
      onChange(addNode(map, type, x, y));
      setTool('move');
      return;
    }
    if (tool === 'draw:text') {
      const t = await promptDialog({ message: 'Not:' });
      if (t && t.trim()) onChange(addTextNote(map, x, y, t, sketchColor));
      return;
    }
    if (tool === 'sticky') {
      // İmleci merkezle (168×168) + negatif olmasın; yerleştir, düzenlemeye aç, move'a dön.
      const m = addSticky(map, Math.max(0, x - 84), Math.max(0, y - 84), stickyColor);
      onChange(m);
      const id = m.sketch.stickies[m.sketch.stickies.length - 1].id;
      setEditingStickyId(id);
      setTool('move');
      return;
    }
    if (tool.startsWith('stamp:')) {
      // İmleci merkezle (varsayılan size 40 → x-20, y-20); negatif olmasın.
      onChange(addStamp(map, Math.max(0, x - 20), Math.max(0, y - 20), tool.slice(6)));
      setTool('move');
      return;
    }
    if (tool === 'comment') {
      // İğneyi bırak, düzenleme pop-over'ını aç (boş taslak), move'a dön.
      const m = addComment(map, Math.max(0, x), Math.max(0, y));
      onChange(m);
      const id = m.sketch.comments[m.sketch.comments.length - 1].id;
      setOpenCommentId(id);
      setCommentDraft('');
      setTool('move');
      return;
    }
    setSelectedId(null);
  };

  /* --- Kulvar --- */
  const handleAddLane = () => onChange(addLane(map, `Kulvar ${map.lanes.length + 1}`));
  const handleRenameLane = async (lane) => {
    const v = await promptDialog({ message: 'Kulvar adı:', defaultValue: lane.name });
    if (v == null) return;
    onChange(renameLane(map, lane.id, v));
  };
  const handleRemoveLane = async (lane) => {
    if (!(await confirmDialog({ message: `"${lane.name}" kulvarı silinsin mi? İçindeki şekiller kulvarsız kalır (silinmez).`, danger: true }))) return;
    onChange(removeLane(map, lane.id));
  };

  /* --- Harita adı --- */
  const handleRenameMap = async () => {
    const v = await promptDialog({ message: 'Harita adı:', defaultValue: map.name });
    if (v == null || !v.trim()) return;
    onChange({ ...map, name: v.trim() });
  };

  /* --- Excel dışa aktarma (LCW formatı: Süreç Kartı + Faaliyetler + İyileştirme Kaydı) ---
     SheetJS community sürümü hücre stili (renk/font) DESTEKLEMEZ — bilinçli sınır; görsel
     zenginlik Rapor (Yazdır/PDF) tarafında. Burada yalnız sütun genişliği (!cols) ve kart
     başlığının birleştirilmesi (!merges) uygulanır. */
  const exportExcel = async () => {
    // Lazy-load: SheetJS CJS namespace/default farkını güvene al (bazı bundle biçimlerinde
    // named export'lar `.default` altında toplanır).
    const mod = await import('xlsx');
    const XLSX = mod.default ?? mod;
    const wb = XLSX.utils.book_new();
    const kart = XLSX.utils.aoa_to_sheet(buildKartAOA(map));
    kart['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 12 }, { wch: 10 }];
    kart['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];   // başlık birleşik
    XLSX.utils.book_append_sheet(wb, kart, 'Süreç Kartı');
    const faal = XLSX.utils.aoa_to_sheet(buildFaaliyetlerAOA(map));
    faal['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 50 }, { wch: 20 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, faal, 'Faaliyetler');
    const iyi = XLSX.utils.aoa_to_sheet(buildIyilestirmeAOA(map));
    iyi['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 24 }, { wch: 10 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, iyi, 'İyileştirme Kaydı');
    // Dosya adı: yol/geçersiz karakterleri ve boşlukları '-' yap; boş/whitespace ada karşı 'surec' fallback.
    const safeName = (map.name || 'surec').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-') || 'surec';
    XLSX.writeFile(wb, `${safeName}-surec-karti.xlsx`);
  };

  /* --- Klavye: Escape (araç iptali) / Delete (seçili şekli sil) --- */
  useEffect(() => {
    const onKey = async (e) => {
      if (e.isComposing) return;   // IME koruması
      if (e.key === 'Escape') {
        commitOpenComment();
        setTool('move'); setConnecting(null); setHoverNodeId(null); setHoverHandle(null);
        setStampMenuOpen(false);
        setEditingStickyId(null);
        setOpenCommentId(null); setCommentDraft('');
        return;
      }
      if (modalNodeId) return;     // NodeModal açıkken tuval kısayolları devre dışı (kendi Escape'i var)
      const tagName = document.activeElement?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
      if (e.key === 'Enter') {
        if (selectedId && tool === 'move') setModalNodeId(selectedId);
        return;
      }
      if (e.key === 'Delete') {
        if (!selectedId) return;
        const node = map.nodes.find(n => n.id === selectedId);
        if (!node) return;
        if (!(await confirmDialog({ message: `"${node.label}" şekli silinsin mi? Bağlı ok ve etiketler de silinir.`, danger: true }))) return;
        onChange(removeNode(map, selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, tool, modalNodeId, map, onChange, openCommentId, commentDraft]);

  /* --- Tekerlek: Ctrl/Cmd → imlece zoom, aksi → pan. React onWheel passive olabildiğinden
     preventDefault güvence altına almak için native (non-passive) listener bağlanır.
     Handler view'i functional updater ile okur → effect deps [] (yalnız element değişince). */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) setView(v => zoomAt(v, sx, sy, e.deltaY < 0 ? 1.1 : 0.9, ZOOM_MIN, ZOOM_MAX));
      else setView(v => panView(v, -e.deltaX, -e.deltaY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* --- Space tuşu: basılıyken pan modu (spaceRef). Input/textarea/select veya modal açıkken
     devre dışı — normal metin girişini bozmaz. Mevcut Escape/Delete/Enter handler'ından ayrı. */
  useEffect(() => {
    const onDown = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (modalNodeId) return;
      const tagName = document.activeElement?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
      spaceRef.current = true;
      setSpaceDown(true);
      e.preventDefault();
    };
    const onUp = (e) => { if (e.code === 'Space') { spaceRef.current = false; setSpaceDown(false); } };
    // Pencere odağı kaybedilince (Alt-Tab vb.) Space basılı kalmasın — pan armed takılmasın.
    const onBlur = () => { spaceRef.current = false; setSpaceDown(false); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [modalNodeId]);

  /* Yeni yerleştirilen sticky'nin textarea'sını otomatik odakla (yaz-hemen deneyimi).
     Taslağı da o sticky'nin mevcut metniyle başlat (odak → onFocus zaten yapar, burada garanti). */
  useEffect(() => {
    if (!editingStickyId) return;
    const s = (map.sketch?.stickies || []).find(x => x.id === editingStickyId);
    setStickyDraft(s?.text || '');
    const el = stickyTextRefs.current[editingStickyId];
    if (el) { el.focus(); el.select?.(); }
  }, [editingStickyId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Yorum pop-over'ı açılınca: taslağı iğnenin mevcut metniyle başlat + textarea'yı odakla. */
  useEffect(() => {
    if (openCommentId == null) return;
    const c = (map.sketch?.comments || []).find(x => x.id === openCommentId);
    setCommentDraft(c?.text || '');
    const el = commentTextRef.current;
    if (el) { el.focus(); el.select?.(); }
  }, [openCommentId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Sürüklenen şeklin lokal (henüz commit edilmemiş) konumu uygulanmış görünüm listesi —
     oklar ve tuval boyutu da sürükleme sırasında canlı takip etsin. */
  const nodesView = dragPos
    ? map.nodes.map(n => n.id === dragPos.id ? { ...n, x: dragPos.x, y: dragPos.y } : n)
    : map.nodes;

  /* FigJam ghost önizleme verisi — yalnız move aracında, handle hover'ında ve aktif
     bağlama sürüklemesi YOKKEN. Kaynak handle noktasından ghost kutuya bezier + kutu. */
  const ghostSrc = hoverHandle && tool === 'move' && !connecting
    ? nodesView.find(n => n.id === hoverHandle.nodeId) : null;
  const ghost = ghostSrc && {
    from: handlePoints(ghostSrc)[hoverHandle.side],
    pos: nextStepPos(ghostSrc, hoverHandle.side),
    gd: dimsOf('step'),
  };

  /* Silgi sürüklenirken ANLIK önizleme: gezilen noktalar map üstünde saf eraseStrokesAt ile
     uygulanır (veri yazılmaz, yalnız render) — pointerup'ta gerçek commit yapılır (yukarıda). */
  let sketchView = map.sketch || DEFAULT_SKETCH;
  if (erasing) {
    let m = map;
    erasing.points.forEach(([px, py]) => { m = eraseStrokesAt(m, px, py, ERASER_RADIUS); });
    sketchView = m.sketch || DEFAULT_SKETCH;   // eraseStrokesAt hit yoksa map'i (sketch'siz) değişmeden döndürür → guard
  }
  const isDrawTool = tool.startsWith('draw:');
  const isSketchTool = isDrawTool || tool.startsWith('shape:');   // karalama = çizim + şekil araçları

  /* Aktif aracın kısa ipucu — tuval üstünde yüzer pill'de gösterilir (eski palet ipuçlarının yerini alır). */
  const toolHint =
    tool === 'move' ? (selectedId
        ? 'Seçili şekil · Delete ile sil, çift tık veya Enter ile düzenle/etiketle'
        : 'Şekil kenarındaki noktadan sürükleyip başka şekle bırakın · boş alana bırakınca yeni adım oluşur')
    : tool === 'hand' ? 'Tuvali sürükleyerek kaydırın'
    : tool.startsWith('add:') ? 'Tuvale tıklayarak yerleştirin'
    : tool === 'sticky' ? 'Tuvale tıklayarak yapışkan not ekleyin'
    : tool.startsWith('stamp:') ? 'Tuvale tıklayarak damga ekleyin'
    : tool === 'comment' ? 'Tuvale tıklayarak yorum iğnesi ekleyin'
    : tool === 'draw:text' ? 'Tuvale tıklayarak not ekleyin'
    : (tool === 'draw:pen' || tool === 'draw:highlighter') ? 'Tuval üzerinde sürükleyerek çizin'
    : tool === 'draw:eraser' ? 'Çizgi üzerinde sürükleyerek silin'
    : tool.startsWith('shape:') ? 'Tuval üzerinde sürükleyerek şekil çizin'
    : null;

  /* --- Tuval boyutu --- */
  const maxNodeX = Math.max(0, ...nodesView.map(n => n.x + dimsOf(n.type).w));
  const maxNodeY = Math.max(0, ...nodesView.map(n => n.y + dimsOf(n.type).h));
  const canvasW = Math.max(900, maxNodeX + 80);
  const canvasH = isSwim
    ? Math.max(map.lanes.length * LANE_H, maxNodeY + 40, 560)
    : Math.max(maxNodeY + 120, 560);

  /* --- Yüzer zoom kontrolleri --- */
  const zoomBy = (factor) => {
    const el = scrollRef.current;
    if (!el) return;
    setView(v => zoomAt(v, el.clientWidth / 2, el.clientHeight / 2, factor, ZOOM_MIN, ZOOM_MAX));
  };
  const resetView = () => setView({ x: 0, y: 0, zoom: 1 });
  const fitView = () => {
    const el = scrollRef.current;
    if (!el || nodesView.length === 0) { resetView(); return; }
    const elW = el.clientWidth, elH = el.clientHeight;
    // İçerik sınırlayıcı kutusu (origin'den değil, gerçek min/max) — offset düğümler doğru ortalanır.
    const minNodeX = Math.min(...nodesView.map(n => n.x));
    const minNodeY = Math.min(...nodesView.map(n => n.y));
    const contentW = maxNodeX - minNodeX, contentH = maxNodeY - minNodeY;
    if (contentW <= 0 || contentH <= 0) { resetView(); return; }
    const zoom = clampZoom(Math.min(1, (elW - 80) / contentW, (elH - 80) / contentH), ZOOM_MIN, ZOOM_MAX);
    setView({
      x: (elW - contentW * zoom) / 2 - minNodeX * zoom,
      y: (elH - contentH * zoom) / 2 - minNodeY * zoom,
      zoom,
    });
  };

  return (
    <div className="space-y-3">
      {/* Üst şerit */}
      <div className="flex items-center gap-3 bg-surface border border-line rounded-[10px] shadow-card px-4 py-2.5 flex-wrap">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink px-2 py-1 rounded-lg hover:bg-surface-2">
          <ArrowLeft className="w-4 h-4" />Geri
        </button>
        <div className="w-px h-5 bg-line" />
        <button onClick={handleRenameMap} title="Harita adını değiştir"
          className="font-display font-semibold text-ink hover:text-accent-ink">
          {map.name}
        </button>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-2 text-ink-soft">
          {KIND_LABEL[map.kind] || map.kind}
        </span>
        <div className="flex-1" />
        <button onClick={() => setCardOpen(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-line bg-surface text-ink-soft hover:bg-surface-2 hover:text-ink font-medium">
          <ClipboardList className="w-3.5 h-3.5" />Süreç Kartı
        </button>
        <button onClick={exportExcel} title="Süreç Kartı + Faaliyetler + İyileştirme Kaydı (xlsx)"
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-line bg-surface text-ink-soft hover:bg-surface-2 hover:text-ink font-medium">
          <FileSpreadsheet className="w-3.5 h-3.5" />Excel
        </button>
        <button onClick={() => setReportOpen(true)} title="Basılabilir profesyonel rapor (Yazdır/PDF)"
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-line bg-surface text-ink-soft hover:bg-surface-2 hover:text-ink font-medium">
          <Printer className="w-3.5 h-3.5" />Rapor
        </button>
        {isSketchTool && (
          <button onClick={handleClearSketch} title="Tüm karalamayı (çizgi + not) temizle"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-line bg-surface text-ink-soft hover:bg-danger-tint hover:text-danger font-medium">
            <Trash2 className="w-3.5 h-3.5" />Temizle
          </button>
        )}
        <span className="text-[11px] text-ink-faint font-mono tabular-nums">
          {map.nodes.length} şekil · {map.edges.length} bağlantı
        </span>
      </div>

      <div className="flex items-start">
        {/* Tuval — tam genişlik (sol palet yüzer araç çubuğuna taşındı) */}
        <div ref={scrollRef}
          onClick={handleCanvasClick}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerLeave={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerCancel}
          className="flex-1 min-w-0 relative overflow-hidden border border-line rounded-[10px] shadow-card select-none"
          style={{
            minHeight: '72vh', maxHeight: '84vh',
            cursor: panning ? 'grabbing'
              : (spaceDown || tool === 'hand') ? 'grab'
              : (tool.startsWith('add:') || isSketchTool || tool === 'sticky' || tool.startsWith('stamp:') || tool === 'comment') ? 'crosshair' : 'default',
            background: 'radial-gradient(circle, color-mix(in srgb, var(--color-line) 40%, transparent) 1px, transparent 1px), var(--color-surface)',
            backgroundPosition: `${view.x}px ${view.y}px`,
            backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px`,
          }}>
          {/* İki katman: DIŞ pan (translate — asla bulanıklaştırmaz) + İÇ zoom (CSS zoom —
              içeriği hedef boyutta yeniden yerleştirip rasterize eder → metin her seviyede net,
              transform:scale'in bitmap-ölçekleme bulanıklığı yok). Matematik değişmez: pan zoom'un
              DIŞINDA olduğundan bir canvas noktası cx hâlâ divLeft + view.x + cx*zoom'a düşer. */}
          <div style={{
            transform: `translate(${view.x}px, ${view.y}px)`,
            transformOrigin: '0 0',
          }}>
          <div className="relative" style={{
            width: canvasW, height: canvasH,
            zoom: view.zoom,
          }}>
            {/* Kulvar şeritleri */}
            {isSwim && map.lanes.map((lane, i) => (
              <div key={lane.id} className={`absolute left-0 right-0 border-b border-line group ${i % 2 === 1 ? 'bg-surface-2/30' : ''}`}
                style={{ top: lane.order * LANE_H, height: LANE_H }}>
                <div className="absolute left-0 top-0 bottom-0 w-7 border-r border-line bg-surface-2/60 flex items-center justify-center overflow-hidden">
                  <button onClick={(e) => { e.stopPropagation(); handleRenameLane(lane); }}
                    title="Kulvar adını değiştir"
                    className="text-[11px] font-semibold text-ink-soft hover:text-accent-ink whitespace-nowrap"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    {lane.name}
                  </button>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleRemoveLane(lane); }}
                  title="Kulvarı sil"
                  className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition p-0.5 rounded hover:bg-danger-tint text-ink-faint hover:text-danger">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* Karalama katmanı — node/edge overlay'inin ALTINDA (şekiller okunur kalır,
                fosforlu yarı saydam). Salt-görsel: pointer-events yok, olaylar tuval div'inde. */}
            <svg className="absolute inset-0 pointer-events-none" width={canvasW} height={canvasH} style={{ overflow: 'visible' }}>
              {sketchView.strokes.map(st => (
                <polyline key={st.id}
                  points={st.points.map(p => p.join(',')).join(' ')}
                  fill="none" stroke={st.color} strokeWidth={st.width} opacity={st.opacity}
                  strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {/* Aktif (henüz commit edilmemiş) kalem/fosforlu stroke'u */}
              {drawing && drawing.points.length >= 2 && (
                <polyline points={drawing.points.map(p => p.join(',')).join(' ')}
                  fill="none" stroke={drawing.color} strokeWidth={drawing.width} opacity={drawing.opacity}
                  strokeLinecap="round" strokeLinejoin="round" />
              )}
              {(sketchView.shapes || []).map(sh => renderShape(sh, sh.id))}
              {/* Aktif (henüz commit edilmemiş) şekil önizlemesi — kesik-çizgi. */}
              {shaping && renderShape({ ...shaping, color: sketchColor, width: sketchWidth }, 'shaping-preview', { dashed: true })}
              {sketchView.texts.map(t => (
                <text key={t.id} x={t.x} y={t.y} fill={t.color} fontSize="14">{t.text}</text>
              ))}
            </svg>

            {/* Ok overlay */}
            <svg className="absolute inset-0 pointer-events-none" width={canvasW} height={canvasH} style={{ overflow: 'visible' }}>
              <defs>
                <marker id="pm-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L9,3 z" fill="#52646C" />
                </marker>
                <marker id="pm-arrow-danger" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L9,3 z" fill="#B3402A" />
                </marker>
              </defs>
              {map.edges.map(edge => {
                const src = nodesView.find(n => n.id === edge.from);
                const tgt = nodesView.find(n => n.id === edge.to);
                if (!src || !tgt) return null;
                const { p1, p2 } = edgeAnchors(src, tgt);   // kutu kenar-ortası ankraj (merkez hizalı)
                const hover = hoverEdge === edge.id;
                const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
                const d = bezierPath(p1, p2);
                const doDisconnect = (e) => { e.stopPropagation(); onChange(disconnect(map, edge.from, edge.to)); };
                return (
                  <g key={edge.id}>
                    <path d={d} fill="none"
                      stroke={hover ? '#B3402A' : '#52646C'} strokeWidth={hover ? 2.5 : 1.5}
                      markerEnd={hover ? 'url(#pm-arrow-danger)' : 'url(#pm-arrow)'} />
                    {/* görünmez geniş hit-alanı — ince oku fareyle yakalamayı kolaylaştırır */}
                    <path d={d} fill="none" stroke="transparent" strokeWidth={14}
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      onMouseEnter={() => setHoverEdge(edge.id)}
                      onMouseLeave={() => setHoverEdge(h => h === edge.id ? null : h)}
                      onClick={doDisconnect} />
                    {hover && (
                      <g style={{ pointerEvents: 'auto', cursor: 'pointer' }} onClick={doDisconnect}>
                        <circle cx={mx} cy={my} r={8} fill="#B3402A" />
                        <text x={mx} y={my + 3} textAnchor="middle" fontSize="10" fill="white">✕</text>
                      </g>
                    )}
                  </g>
                );
              })}
              {/* Canlı sürükleme çizgisi — handle'dan başlayıp imleci takip eden kesik-çizgi önizleme. */}
              {connecting && (
                <path d={bezierPath(connecting.fromPt, { x: connecting.curX, y: connecting.curY })}
                  fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="6 4"
                  style={{ pointerEvents: 'none' }} />
              )}
              {/* FigJam ghost sonraki-adım: handle hover'ında (sürükleme YOKKEN) o yönde
                  açılacak yeni adımın soluk kesik-çizgi önizlemesi + bağlayıcı + '+' işareti.
                  Salt ipucu — pointer-events yok; gerçek tık handle üzerinde gerçekleşir. */}
              {ghost && (
                <g style={{ pointerEvents: 'none' }}>
                  <path d={bezierPath(ghost.from, { x: ghost.pos.x + ghost.gd.w / 2, y: ghost.pos.y + ghost.gd.h / 2 })}
                    fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="5 4"
                    strokeOpacity={0.7} />
                  <rect x={ghost.pos.x} y={ghost.pos.y} width={ghost.gd.w} height={ghost.gd.h} rx={8}
                    fill="var(--color-surface-2)" fillOpacity={0.5}
                    stroke="var(--color-accent)" strokeDasharray="5 4" strokeWidth={1.5} />
                  <text x={ghost.pos.x + ghost.gd.w / 2} y={ghost.pos.y + ghost.gd.h / 2 + 6}
                    textAnchor="middle" fontSize="18" fontWeight="600" fill="var(--color-accent)">+</text>
                </g>
              )}
            </svg>

            {/* Şekiller — karalama aracı aktifken pointer-events:none (üstüne serbest çizim). */}
            <div style={{ pointerEvents: isSketchTool ? 'none' : 'auto' }}>
              {nodesView.map(n => (
                <NodeShape key={n.id} node={n} tool={tool}
                  selected={selectedId === n.id}
                  showHandles={tool === 'move' && (hoverNodeId === n.id || selectedId === n.id)}
                  isDropTarget={!!connecting && hoverNodeId === n.id && n.id !== connecting.fromId}
                  counts={tagCounts(map, n.id)}
                  onPointerDown={handleNodePointerDown(n)}
                  onClick={handleNodeClick(n)}
                  onDoubleClick={handleNodeDoubleClick(n)}
                  onOpenModal={setModalNodeId}
                  onPointerEnter={() => !connecting && setHoverNodeId(n.id)}
                  onPointerLeave={() => !connecting && setHoverNodeId(h => h === n.id ? null : h)}
                  onStartConnect={startConnect}
                  onHandleEnter={(nodeId, side) => !connecting && setHoverHandle({ nodeId, side })}
                  onHandleLeave={() => setHoverHandle(null)} />
              ))}
            </div>

            {/* Sticky notes — transform'lu wrapper içinde mutlak-konumlu HTML kart (zoom ile ölçeklenir).
                Karalama aracı aktifken pointer-events:none → üstüne serbest çizim geçer. */}
            {(sketchView.stickies || []).map(s => {
              const dp = sketchDragPos?.id === s.id ? sketchDragPos : null;
              const sx = dp ? dp.x : s.x, sy = dp ? dp.y : s.y;
              return (
                <div key={s.id}
                  style={{ left: sx, top: sy, width: s.w, height: s.h, background: s.color,
                    pointerEvents: tool === 'move' ? 'auto' : 'none' }}
                  className="absolute rounded-lg shadow-md group flex flex-col">
                  {/* Sürükleme başlığı (tutamak) — yalnız move aracında sürükler. */}
                  <div
                    onPointerDown={(e) => {
                      if (tool !== 'move') return;
                      e.stopPropagation();
                      const { x, y } = toCanvasXY(e);
                      sketchDragRef.current = { kind: 'sticky', id: s.id, startX: x, startY: y, origX: s.x, origY: s.y, moved: false };
                      scrollRef.current?.setPointerCapture?.(e.pointerId);
                    }}
                    style={{ cursor: tool === 'move' ? 'grab' : 'default' }}
                    className="h-4 shrink-0 flex items-center justify-center">
                    <span className="w-6 h-0.5 rounded-full bg-ink/15" />
                  </div>
                  <textarea
                    ref={(el) => { if (el) stickyTextRefs.current[s.id] = el; else delete stickyTextRefs.current[s.id]; }}
                    value={editingStickyId === s.id ? stickyDraft : s.text}
                    onFocus={() => { setEditingStickyId(s.id); setStickyDraft(s.text); }}
                    onChange={(e) => setStickyDraft(e.target.value)}
                    onPointerDown={(e) => { if (tool === 'move') e.stopPropagation(); }}
                    onBlur={() => {
                      if (editingStickyId === s.id) onChange(updateSticky(map, s.id, stickyDraft));   // tek commit
                      setEditingStickyId(id => id === s.id ? null : id);
                    }}
                    readOnly={tool !== 'move'}
                    placeholder="Not…"
                    className="flex-1 w-full bg-transparent resize-none border-0 outline-none px-2.5 pb-2.5 text-[13px] leading-snug text-ink placeholder:text-ink/30" />
                  {/* Sil — hover'da sağ-üstte. */}
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onChange(removeSticky(map, s.id)); }}
                    title="Notu sil"
                    className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition p-0.5 rounded-full bg-surface border border-line text-ink-faint hover:text-danger hover:bg-danger-tint shadow-card">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            {/* Stamp (emoji reaksiyon damgası) — mutlak-konumlu, zoom ile ölçeklenir. */}
            {(sketchView.stamps || []).map(st => {
              const dp = sketchDragPos?.id === st.id ? sketchDragPos : null;
              const stx = dp ? dp.x : st.x, sty = dp ? dp.y : st.y;
              return (
                <div key={st.id}
                  onPointerDown={(e) => {
                    if (tool !== 'move') return;
                    e.stopPropagation();
                    const { x, y } = toCanvasXY(e);
                    sketchDragRef.current = { kind: 'stamp', id: st.id, startX: x, startY: y, origX: st.x, origY: st.y, moved: false };
                    scrollRef.current?.setPointerCapture?.(e.pointerId);
                  }}
                  style={{ left: stx, top: sty, fontSize: st.size, lineHeight: 1,
                    cursor: tool === 'move' ? 'grab' : 'default',
                    pointerEvents: tool === 'move' ? 'auto' : 'none' }}
                  className="absolute select-none group">
                  {st.emoji}
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onChange(removeStamp(map, st.id)); }}
                    title="Damgayı sil"
                    style={{ fontSize: 12 }}
                    className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition p-0.5 rounded-full bg-surface border border-line text-ink-faint hover:text-danger hover:bg-danger-tint shadow-card leading-none">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            {/* Yorum iğneleri — transform'lu wrapper içinde mutlak-konumlu konuşma-balonu rozeti (zoom
                ile ölçeklenir). Düzenleme pop-over'ı transform DIŞI (aşağıda, screen-space). Karalama
                aracı aktifken pointer-events:none. Move'da sürükle (moveComment) / eşik-altı tık → pop-over. */}
            {(sketchView.comments || []).map((c, i) => {
              const dp = sketchDragPos?.id === c.id ? sketchDragPos : null;
              const cx = dp ? dp.x : c.x, cy = dp ? dp.y : c.y;
              return (
                <div key={c.id}
                  onPointerDown={(e) => {
                    if (tool !== 'move') return;
                    e.stopPropagation();
                    const { x, y } = toCanvasXY(e);
                    sketchDragRef.current = { kind: 'comment', id: c.id, startX: x, startY: y, origX: c.x, origY: c.y, moved: false };
                    scrollRef.current?.setPointerCapture?.(e.pointerId);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title={c.done ? `Çözüldü — ${c.text || 'yorum'}` : (c.text || 'Yorum')}
                  style={{ left: cx, top: cy,
                    cursor: tool === 'move' ? 'grab' : 'default',
                    pointerEvents: tool === 'move' ? 'auto' : 'none',
                    opacity: c.done ? 0.5 : 1 }}
                  className={`absolute w-6 h-6 rounded-full rounded-bl-none bg-accent text-white shadow-md flex items-center justify-center text-[11px] font-bold tabular-nums
                    ${openCommentId === c.id ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`}>
                  {/* Rapor "Yorumlar" listesiyle aynı 1-tabanlı numara → tuval↔rapor çapraz-referans */}
                  {i + 1}
                  {c.done && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-ok text-white flex items-center justify-center shadow-card">
                      <Check className="w-2.5 h-2.5" strokeWidth={3} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          </div>

          {/* Yorum düzenleme pop-over'ı — content wrapper KARDEŞİ (transform DIŞI, screen-space):
              iğnenin ekran konumunun (canvasToScreen) yanında sabit-okunur boyutta açılır (her zoom).
              Metin blur-commit taslak tamponuyla; Çözüldü toggle + Sil + kapat. Kenara sığmazsa sola çevrilir. */}
          {openCommentId != null && (() => {
            const c = (sketchView.comments || []).find(x => x.id === openCommentId);
            if (!c) return null;
            const dp = sketchDragPos?.id === c.id ? sketchDragPos : null;
            const px = dp ? dp.x : c.x, py = dp ? dp.y : c.y;
            const sp = canvasToScreen(view, px, py);
            const el = scrollRef.current;
            const cw = el?.clientWidth ?? 900, ch = el?.clientHeight ?? 600;
            const POP_W = 224, POP_H = 150, GAP = 30;
            let left = sp.x + GAP;
            if (left + POP_W > cw - 8) left = sp.x - POP_W - 12;   // sağa sığmazsa iğnenin soluna
            left = Math.max(8, Math.min(left, cw - POP_W - 8));
            const top = Math.max(8, Math.min(sp.y - 8, ch - POP_H - 8));
            return (
              <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
                style={{ left, top }}
                className="absolute z-30 w-56 bg-surface border border-line rounded-xl shadow-card p-2">
                <textarea
                  ref={commentTextRef}
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onBlur={commitOpenComment}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur(); closeCommentPopover(); } }}
                  placeholder="Yorum yaz…"
                  rows={3}
                  className="w-full bg-surface border border-line rounded-lg px-2.5 py-2 text-[13px] leading-snug text-ink resize-none outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 placeholder:text-ink/30" />
                <div className="flex items-center gap-1 mt-2">
                  <button
                    onClick={() => onChange(toggleCommentDone(updateComment(map, c.id, commentDraft), c.id))}
                    title={c.done ? 'Çözüldü işaretini kaldır' : 'Çözüldü olarak işaretle'}
                    className={`flex items-center gap-1 text-[12px] px-2 py-1 rounded-lg border transition font-medium
                      ${c.done ? 'bg-ok-tint text-ok border-ok/40' : 'bg-surface text-ink-soft border-line hover:bg-surface-2'}`}>
                    <Check className="w-3.5 h-3.5" strokeWidth={c.done ? 3 : 2} />Çözüldü
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => { onChange(removeComment(map, c.id)); setOpenCommentId(null); setCommentDraft(''); }}
                    title="Yorumu sil"
                    className="p-1.5 rounded-lg border border-line text-ink-faint hover:text-danger hover:bg-danger-tint transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={closeCommentPopover}
                    title="Kapat"
                    className="p-1.5 rounded-lg border border-line text-ink-faint hover:text-ink hover:bg-surface-2 transition">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Aktif araç ipucu — üst-orta yüzer pill (content wrapper KARDEŞİ → ekranda sabit). */}
          {toolHint && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none
              text-[11px] text-ink-soft bg-surface/90 border border-line rounded-full px-3 py-1 shadow-card max-w-[90%] text-center">
              {toolHint}
            </div>
          )}

          {/* Yüzer araç çubuğu — alt-orta FigJam pill (content wrapper KARDEŞİ → transform DIŞI).
              Toolbar/popover'lar scrollRef içinde olduğundan pointerdown TUVALE sızmasın (popover'ı
              kapatıp butonu unmount ederek onClick'i düşürür + draw/hand'de altta iz/pan başlatır).
              stopPropagation popover'ları da kapsar (bu div'in çocukları). */}
          <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-surface border border-line rounded-full shadow-card px-2 py-1.5 flex items-center gap-1">

            {/* Bağlama-duyarlı SEÇENEK BARI — ana barın hemen ÜSTÜNDE, aktif araç grubuna göre
                açık durur (toggle değil). Aynı anda yalnız TEK grup gösterilir (öncelik zinciri).
                Ana barın çocuğu → pointerdown/click stopPropagation kalıtımıyla korunur. */}
            {(stampMenuOpen || tool.startsWith('add:') || isSketchTool || tool === 'sticky') && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-surface border border-line rounded-2xl shadow-card px-2 py-1.5 flex items-center gap-1 max-w-[95vw]">
                {stampMenuOpen ? (
                  /* Damga grubu — emoji seçici (araç seçilse de açık kalır): düzgün 5×2 grid. */
                  <div className="grid grid-cols-5 gap-1">
                    {STAMP_EMOJIS.map(emoji => (
                      <button key={emoji} onClick={() => { selectTool('stamp:' + emoji); setStampMenuOpen(true); }}
                        title={emoji}
                        className={`w-8 h-8 flex items-center justify-center text-xl rounded-lg transition
                          ${tool === 'stamp:' + emoji ? 'bg-accent-tint' : 'hover:bg-surface-2'}`}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : tool.startsWith('add:') ? (
                  /* Ekle grubu — süreç düğümü araçları (seçmek düğüm barını açık tutar). */
                  <>
                    <BarBtn active={tool === 'add:step'} onClick={() => selectTool('add:step')} icon={Square} title="Adım" />
                    <BarBtn active={tool === 'add:decision'} onClick={() => selectTool('add:decision')} icon={Diamond} title="Karar" />
                    <BarBtn active={tool === 'add:start'} onClick={() => selectTool('add:start')} icon={PlayCircle} title="Başlangıç" />
                    <BarBtn active={tool === 'add:end'} onClick={() => selectTool('add:end')} icon={CircleStop} title="Bitiş" />
                    <BarBtn active={tool === 'add:doc'} onClick={() => selectTool('add:doc')} icon={FileText} title="Belge" />
                    <BarBtn active={tool === 'add:subprocess'} onClick={() => selectTool('add:subprocess')} icon={Frame} title="Alt Süreç" />
                    {isSwim && (
                      <>
                        <div className="w-px h-6 bg-line mx-0.5" />
                        <BarBtn onClick={handleAddLane} icon={Rows3} title="Kulvar Ekle" />
                      </>
                    )}
                  </>
                ) : isSketchTool ? (
                  /* Karalama grubu — kalem/şekil araçları + şekiller (inline) + renk + kalınlık,
                     hepsi tek satırlı barda; araç açıkken görünür kalır ("kalem menüsü açık dursun"). */
                  <>
                    <BarBtn active={tool === 'draw:pen'} onClick={() => pickDraw('draw:pen')} icon={Pencil} title="Kalem" />
                    <BarBtn active={tool === 'draw:highlighter'} onClick={() => pickDraw('draw:highlighter')} icon={Highlighter} title="Fosforlu" />
                    <BarBtn active={tool === 'draw:eraser'} onClick={() => pickDraw('draw:eraser')} icon={Eraser} title="Silgi" />
                    <BarBtn active={tool === 'draw:text'} onClick={() => pickDraw('draw:text')} icon={Type} title="Metin" />
                    <div className="w-px h-6 bg-line mx-0.5" />
                    {SHAPE_MENU.map(({ type, label, icon: Icon }) => (
                      <BarBtn key={type} active={tool === `shape:${type}`}
                        onClick={() => pickDraw(`shape:${type}`)} icon={Icon} title={label} />
                    ))}
                    <div className="w-px h-6 bg-line mx-0.5" />
                    <div className="flex items-center gap-1.5 px-0.5">
                      {SKETCH_COLORS.map(c => (
                        <button key={c} onClick={() => setSketchColor(c)} title={c}
                          className={`w-5 h-5 rounded-full border-2 transition ${sketchColor === c ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface border-surface' : 'border-line'}`}
                          style={{ background: c }} />
                      ))}
                    </div>
                    <div className="w-px h-6 bg-line mx-0.5" />
                    <div className="flex items-center gap-1">
                      {SKETCH_WIDTHS.map(([w, label]) => (
                        <button key={w} onClick={() => setSketchWidth(w)}
                          className={`text-[11px] px-2 py-1 rounded-md border transition
                            ${sketchWidth === w ? 'bg-accent-tint text-accent-ink border-accent' : 'bg-surface text-ink-soft border-line hover:bg-surface-2'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  /* Not grubu — yapışkan not renkleri. */
                  <div className="flex items-center gap-1.5 px-0.5">
                    {STICKY_COLORS.map(c => (
                      <button key={c} onClick={() => setStickyColor(c)} title={c}
                        className={`w-5 h-5 rounded-full border-2 transition ${stickyColor === c ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface border-surface' : 'border-line'}`}
                        style={{ background: c }} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Ana bar — Seç / El / Ekle / Kalem / Not / Damga / Yorum */}
            <BarBtn active={tool === 'move' && !stampMenuOpen} onClick={() => selectTool('move')} icon={MousePointer2} title="Seç / Taşı" />
            <BarBtn active={tool === 'hand'} onClick={() => selectTool('hand')} icon={Hand} title="El · tuvali kaydır" />
            <div className="w-px h-6 bg-line mx-0.5" />
            <BarBtn active={tool.startsWith('add:')} title="Şekil Ekle" icon={Square}
              onClick={() => { if (!tool.startsWith('add:')) selectTool('add:step'); }} />
            <BarBtn active={isSketchTool} title="Karalama" icon={Pencil}
              onClick={() => { if (!isSketchTool) selectTool('draw:pen'); }} />
            <BarBtn active={tool === 'sticky'} title="Yapışkan Not" icon={StickyNote}
              onClick={() => selectTool('sticky')} />
            <BarBtn active={tool.startsWith('stamp:') || stampMenuOpen} title="Damga (emoji)" icon={Smile}
              onClick={() => {
                closeCommentPopover();
                if (stampMenuOpen) { setStampMenuOpen(false); return; }
                // Picker'ı açarken başka bir grubun aracı (ekle/karalama/not) asılı kalmasın —
                // yalnız Damga vurgulansın (tek aktif grup). selectTool stampMenuOpen'ı sıfırlar → sonra aç.
                if (!tool.startsWith('stamp:') && tool !== 'move') selectTool('move');
                setStampMenuOpen(true);
              }} />
            <BarBtn active={tool === 'comment'} onClick={() => selectTool('comment')} icon={MessageSquare} title="Yorum · konumlu not" />
          </div>

          {/* Yüzer zoom kontrolleri — content wrapper'ın KARDEŞİ (transform DIŞI) → ekranda sabit.
              stopPropagation: pointerdown tuvale sızıp draw/hand aracında iz/pan başlatmasın. */}
          <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
            className="absolute bottom-3 right-3 z-20 bg-surface border border-line rounded-lg shadow-card flex items-center overflow-hidden text-ink-soft">
            <button onClick={() => zoomBy(1 / 1.2)} title="Uzaklaştır"
              className="px-2.5 py-1.5 text-base leading-none hover:bg-surface-2 hover:text-ink">−</button>
            <button onClick={resetView} title="%100'e sıfırla"
              className="px-2 py-1.5 text-[12px] font-mono tabular-nums border-x border-line hover:bg-surface-2 hover:text-ink min-w-[46px]">
              {Math.round(view.zoom * 100)}%
            </button>
            <button onClick={() => zoomBy(1.2)} title="Yakınlaştır"
              className="px-2.5 py-1.5 text-base leading-none hover:bg-surface-2 hover:text-ink">+</button>
            <button onClick={fitView} title="İçeriği ekrana sığdır"
              className="px-2.5 py-1.5 text-[12px] font-medium border-l border-line hover:bg-surface-2 hover:text-ink">Sığdır</button>
          </div>
        </div>
      </div>

      <TagLogPanel map={map} onChange={onChange} onEditNode={setModalNodeId} />

      {modalNodeId && (
        <NodeModal map={map} nodeId={modalNodeId} onChange={onChange} onClose={() => setModalNodeId(null)} />
      )}

      {cardOpen && (
        <CardModal map={map} onChange={onChange} onClose={() => setCardOpen(false)} />
      )}

      {reportOpen && (
        <ProcessReport map={map} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/* Şekli düzenleme modalı: ad + etiketleme (Risk/Problem/Fırsat/İyileştirme/Not) + şekli sil.
   Çift tıkla, seçiliyken Enter, veya kalem/İyileştirme Kaydı "düzenle" ile açılır. */
function NodeModal({ map, nodeId, onChange, onClose }) {
  const node = map.nodes.find(n => n.id === nodeId);
  const tags = map.tags.filter(t => t.nodeId === nodeId);
  const [label, setLabel] = useState(node?.label || '');
  const [owner, setOwner] = useState(node?.owner || '');
  const [desc, setDesc] = useState(node?.desc || '');
  const [type, setType] = useState('risk');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [severity, setSeverity] = useState('');

  // Modal başka bir şekil için yeniden açılırsa (İyileştirme Kaydı'ndan) alanları tazele.
  useEffect(() => {
    setLabel(node?.label || ''); setOwner(node?.owner || ''); setDesc(node?.desc || '');
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Şekil başka bir yoldan (ör. Delete tuşu) silinirse modal kendini kapatsın.
  useEffect(() => { if (!node) onClose(); }, [node, onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.isComposing) return;   // IME koruması
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!node) return null;

  // Ad/İşi Yapan/Açıklama tek yamada birlikte kaydedilir (updateNode) — ad boşsa mevcut ad korunur.
  const commitNode = () => {
    const t = label.trim();
    if (!t) setLabel(node.label);
    onChange(updateNode(map, node.id, { label: t || node.label, owner, desc }));
  };

  const submitTag = () => {
    if (!title.trim()) return;
    onChange(addTag(map, node.id, type, title, note, severity || null));
    setTitle(''); setNote(''); setSeverity('');
  };

  const handleDeleteShape = async () => {
    if (!(await confirmDialog({ message: `"${node.label}" şekli silinsin mi? Bağlı ok ve etiketler de silinir.`, danger: true }))) return;
    onChange(removeNode(map, node.id));
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Şekli düzenle"
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface rounded-[14px] shadow-card p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-ink">Şekli Düzenle</h3>
          <button onClick={onClose} title="Kapat" className="p-1 rounded hover:bg-surface-2 text-ink-faint hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block text-[12px] font-semibold text-ink-soft mb-1">Ad</label>
        <input type="text" autoFocus value={label}
          onChange={e => setLabel(e.target.value)}
          onBlur={commitNode}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />

        <label className="block text-[12px] font-semibold text-ink-soft mb-1">İşi Yapan</label>
        <input type="text" value={owner}
          onChange={e => setOwner(e.target.value)}
          onBlur={commitNode}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          placeholder="Örn. Depo Personeli"
          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />

        <label className="block text-[12px] font-semibold text-ink-soft mb-1">Açıklama</label>
        <textarea rows={2} value={desc}
          onChange={e => setDesc(e.target.value)}
          onBlur={commitNode}
          placeholder="Bu adımda ne yapılır?"
          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />

        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2">
          Etiketler <span className="font-mono text-ink-faint/70">({tags.length})</span>
        </div>
        {tags.length === 0 ? (
          <div className="text-[12px] text-ink-faint mb-3">Henüz etiket yok — aşağıdan ekleyin.</div>
        ) : (
          <ul className="space-y-1.5 mb-3">
            {tags.map(tag => (
              <li key={tag.id} className="flex items-start gap-2 bg-surface-2/50 rounded-lg px-2.5 py-1.5">
                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${RENK_CLS[tagTypeOf(tag.type).renk]}`}>
                  {tagTypeOf(tag.type).ad}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => onChange(updateTag(map, tag.id, { severity: nextSeverity(tag.severity) }))}
                      title={`Önem: ${tag.severity ? SEVERITY_LABEL[tag.severity] : '—'} (değiştirmek için tıklayın)`}
                      className="shrink-0 w-3 h-3 rounded-full border border-line-strong/40 flex items-center justify-center">
                      {tag.severity && <span className={`w-full h-full rounded-full ${SEVERITY_DOT[tag.severity]}`} />}
                    </button>
                    <span className="text-[12px] font-medium text-ink truncate">{tag.title}</span>
                  </div>
                  {tag.note && <div className="text-[11px] text-ink-faint truncate" title={tag.note}>{tag.note}</div>}
                </div>
                <button onClick={() => onChange(removeTag(map, tag.id))} title="Etiketi sil"
                  className="shrink-0 p-0.5 rounded hover:bg-danger-tint text-ink-faint hover:text-danger">
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border border-line rounded-lg p-3 space-y-2 mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Etiket Ekle</div>
          <div className="flex gap-2">
            <select value={type} onChange={e => setType(e.target.value)}
              className="flex-1 bg-surface border border-line rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent">
              {Object.entries(TAG_TYPES).map(([k, v]) => <option key={k} value={k}>{v.ad}</option>)}
            </select>
            <select value={severity} onChange={e => setSeverity(e.target.value)}
              className="w-28 bg-surface border border-line rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent">
              <option value="">— önem —</option>
              <option value="dusuk">Düşük</option>
              <option value="orta">Orta</option>
              <option value="yuksek">Yüksek</option>
            </select>
          </div>
          <input type="text" placeholder="Başlık" value={title} onChange={e => setTitle(e.target.value)}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />
          <textarea rows={2} placeholder="Not (opsiyonel)" value={note} onChange={e => setNote(e.target.value)}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />
          <button onClick={submitTag} disabled={!title.trim()}
            className="w-full flex items-center justify-center gap-1.5 text-sm px-3 py-1.5 bg-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium">
            <PlusCircle className="w-3.5 h-3.5" />Etiket Ekle
          </button>
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-line">
          <button onClick={handleDeleteShape}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-danger hover:bg-danger-tint font-medium">
            <Trash2 className="w-4 h-4" />Şekli Sil
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg text-ink-soft hover:bg-surface-2">Kapat</button>
        </div>
      </div>
    </div>
  );
}

/* Satır-başı-ayrık metni diziye çevirir (Girdiler/Çıktılar/Kaynaklar/Dokümanlar için). */
const linesToArr = (s) => String(s ?? '').split('\n').map(x => x.trim()).filter(Boolean);

function LabeledField({ label, children }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-soft mb-1">{label}</label>
      {children}
    </div>
  );
}

const fieldCls = 'w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25';

/* Süreç Kartı editörü: LCW-tarzı alanlar (kod/sahip/ekip/amaç/kapsam/girdi-çıktı/kaynak-doküman)
   + performans göstergeleri (metrik) tablosu + salt-okunur haritadaki riskler özeti.
   Metin/dizi alanları lokal form state'inde tutulur, yalnız Kaydet'te updateCard ile tek yamada
   commit edilir. Metrikler ise addMetric/updateMetric/removeMetric ile HARİTAYA DOĞRUDAN ve ANINDA
   yazılır (onChange) — bu yüzden Kaydet'in patch'i metrikler alanına DOKUNMAZ (mevcut halini korur,
   iki mekanizma birbirini ezmez). */
function CardModal({ map, onChange, onClose }) {
  const card = map.card || DEFAULT_CARD;
  const [kod, setKod] = useState(card.kod || '');
  const [ustSurec, setUstSurec] = useState(card.ustSurec || '');
  const [sahip, setSahip] = useState(card.sahip || '');
  const [yayinTarihi, setYayinTarihi] = useState(card.yayinTarihi || '');
  const [revizyonNo, setRevizyonNo] = useState(card.revizyonNo || '');
  const [ekip, setEkip] = useState(card.ekip || '');
  const [amac, setAmac] = useState(card.amac || '');
  const [kapsam, setKapsam] = useState(card.kapsam || '');
  const [girdiler, setGirdiler] = useState((card.girdiler || []).join('\n'));
  const [ciktilar, setCiktilar] = useState((card.ciktilar || []).join('\n'));
  const [kaynaklar, setKaynaklar] = useState((card.kaynaklar || []).join('\n'));
  const [dokumanlar, setDokumanlar] = useState((card.dokumanlar || []).join('\n'));
  const [stratejikHedef, setStratejikHedef] = useState(card.stratejikHedef || '');

  // Metrik ekleme satırı taslağı (mevcut metrikler haritaya doğrudan bağlı — bkz. üst not).
  const [newAd, setNewAd] = useState('');
  const [newHedef, setNewHedef] = useState('');
  const [newBirim, setNewBirim] = useState('');

  const riskTags = map.tags.filter(t => t.type === 'risk');

  useEffect(() => {
    const onKey = (e) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    onChange(updateCard(map, {
      kod: kod.trim(), ustSurec: ustSurec.trim(), sahip: sahip.trim(),
      yayinTarihi: yayinTarihi.trim(), revizyonNo: revizyonNo.trim(),
      ekip, amac, kapsam,
      girdiler: linesToArr(girdiler), ciktilar: linesToArr(ciktilar),
      kaynaklar: linesToArr(kaynaklar), dokumanlar: linesToArr(dokumanlar),
      stratejikHedef: stratejikHedef.trim(),
      // metrikler kasten dahil değil — kendi ops'larıyla zaten canlı güncel.
    }));
    onClose();
  };

  const handleAddMetric = () => {
    if (!newAd.trim()) return;
    onChange(addMetric(map, newAd, newHedef === '' ? null : Number(newHedef), newBirim));
    setNewAd(''); setNewHedef(''); setNewBirim('');
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Süreç Kartı"
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface rounded-[14px] shadow-card p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-ink flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-ink-faint" />Süreç Kartı
          </h3>
          <button onClick={onClose} title="Kapat" className="p-1 rounded hover:bg-surface-2 text-ink-faint hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <LabeledField label="Kod">
              <input type="text" value={kod} onChange={e => setKod(e.target.value)} className={fieldCls} />
            </LabeledField>
            <LabeledField label="Üst Süreç">
              <input type="text" value={ustSurec} onChange={e => setUstSurec(e.target.value)} className={fieldCls} />
            </LabeledField>
            <LabeledField label="Sahip">
              <input type="text" value={sahip} onChange={e => setSahip(e.target.value)} className={fieldCls} />
            </LabeledField>
            <LabeledField label="Yayın Tarihi">
              <input type="text" value={yayinTarihi} onChange={e => setYayinTarihi(e.target.value)} placeholder="gg.aa.yyyy" className={fieldCls} />
            </LabeledField>
            <LabeledField label="Revizyon No">
              <input type="text" value={revizyonNo} onChange={e => setRevizyonNo(e.target.value)} className={fieldCls} />
            </LabeledField>
          </div>

          <LabeledField label="Ekip">
            <textarea rows={2} value={ekip} onChange={e => setEkip(e.target.value)} className={fieldCls} />
          </LabeledField>
          <LabeledField label="Amaç">
            <textarea rows={2} value={amac} onChange={e => setAmac(e.target.value)} className={fieldCls} />
          </LabeledField>
          <LabeledField label="Kapsam">
            <textarea rows={2} value={kapsam} onChange={e => setKapsam(e.target.value)} className={fieldCls} />
          </LabeledField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <LabeledField label="Girdiler (her satıra bir tane)">
              <textarea rows={4} value={girdiler} onChange={e => setGirdiler(e.target.value)} className={fieldCls} />
            </LabeledField>
            <LabeledField label="Çıktılar (her satıra bir tane)">
              <textarea rows={4} value={ciktilar} onChange={e => setCiktilar(e.target.value)} className={fieldCls} />
            </LabeledField>
            <LabeledField label="Kaynaklar (her satıra bir tane)">
              <textarea rows={4} value={kaynaklar} onChange={e => setKaynaklar(e.target.value)} className={fieldCls} />
            </LabeledField>
            <LabeledField label="Dokümanlar (her satıra bir tane)">
              <textarea rows={4} value={dokumanlar} onChange={e => setDokumanlar(e.target.value)} className={fieldCls} />
            </LabeledField>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2">
              Performans Göstergeleri <span className="font-mono text-ink-faint/70">({card.metrikler.length})</span>
            </div>
            <div className="border border-line rounded-lg overflow-hidden">
              {card.metrikler.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint bg-surface-2/50">
                      <th className="px-2.5 py-1.5 font-semibold">Gösterge</th>
                      <th className="px-2.5 py-1.5 font-semibold w-24">Hedef</th>
                      <th className="px-2.5 py-1.5 font-semibold w-24">Birim</th>
                      <th className="px-2.5 py-1.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {card.metrikler.map(m => (
                      <tr key={m.id} className="border-t border-line">
                        <td className="px-2.5 py-1.5 text-ink font-medium">{m.ad}</td>
                        <td className="px-2.5 py-1.5">
                          <input type="number" defaultValue={m.hedef ?? ''}
                            onBlur={e => onChange(updateMetric(map, m.id, { hedef: e.target.value === '' ? null : Number(e.target.value) }))}
                            className="w-full bg-surface border border-line rounded px-1.5 py-1 text-sm focus:outline-none focus:border-accent" />
                        </td>
                        <td className="px-2.5 py-1.5">
                          <input type="text" defaultValue={m.birim || ''}
                            onBlur={e => onChange(updateMetric(map, m.id, { birim: e.target.value }))}
                            className="w-full bg-surface border border-line rounded px-1.5 py-1 text-sm focus:outline-none focus:border-accent" />
                        </td>
                        <td className="px-2.5 py-1.5 text-right">
                          <button onClick={() => onChange(removeMetric(map, m.id))} title="Göstergeyi sil"
                            className="p-0.5 rounded hover:bg-danger-tint text-ink-faint hover:text-danger">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex gap-1.5 p-2 bg-surface-2/30">
                <input type="text" placeholder="Gösterge adı" value={newAd} onChange={e => setNewAd(e.target.value)}
                  className="flex-1 min-w-0 bg-surface border border-line rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent" />
                <input type="number" placeholder="Hedef" value={newHedef} onChange={e => setNewHedef(e.target.value)}
                  className="w-20 bg-surface border border-line rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent" />
                <input type="text" placeholder="Birim" value={newBirim} onChange={e => setNewBirim(e.target.value)}
                  className="w-16 bg-surface border border-line rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent" />
                <button onClick={handleAddMetric} disabled={!newAd.trim()} title="Gösterge ekle"
                  className="shrink-0 flex items-center justify-center px-2.5 rounded-lg bg-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed text-white">
                  <PlusCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <LabeledField label="İlişkili Stratejik Hedef">
            <input type="text" value={stratejikHedef} onChange={e => setStratejikHedef(e.target.value)} className={fieldCls} />
          </LabeledField>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2">
              Haritadaki Riskler <span className="font-mono text-ink-faint/70">({riskTags.length})</span>
            </div>
            {riskTags.length === 0 ? (
              <div className="text-[12px] text-ink-faint">Haritada risk etiketi yok — şekillere çift tıklayıp ekleyebilirsiniz.</div>
            ) : (
              <ul className="text-[12px] text-ink-soft list-disc list-inside space-y-0.5">
                {riskTags.map(t => <li key={t.id}>{t.title}</li>)}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-line">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg text-ink-soft hover:bg-surface-2">İptal</button>
          <button onClick={handleSave}
            className="px-4 py-1.5 text-sm bg-accent hover:bg-accent-strong text-white rounded-lg font-medium">Kaydet</button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition
        ${active ? 'bg-accent-tint text-accent-ink border-accent' : 'bg-surface text-ink-soft border-line hover:bg-surface-2'}`}>
      {children}
    </button>
  );
}

/* İyileştirme Kaydı: haritadaki tüm etiketlerin filtrelenebilir tablosu. */
function TagLogPanel({ map, onChange, onEditNode }) {
  const [filter, setFilter] = useState(null);   // null = Tümü, aksi halde TAG_TYPES anahtarı
  const tags = map.tags;
  const shown = filter ? tags.filter(t => t.type === filter) : tags;

  return (
    <div className="bg-surface border border-line rounded-[10px] shadow-card p-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h3 className="font-display font-semibold text-ink">
          İyileştirme Kaydı <span className="font-mono tabular-nums text-ink-faint font-normal">({tags.length})</span>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === null} onClick={() => setFilter(null)}>Tümü</FilterChip>
          {Object.entries(TAG_TYPES).map(([key, v]) => (
            <FilterChip key={key} active={filter === key} onClick={() => setFilter(key)}>{v.ad}</FilterChip>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="text-center text-ink-faint text-sm py-8">
          {tags.length === 0
            ? 'Şekillere çift tıklayıp Risk/Problem/Fırsat/İyileştirme etiketleri ekleyin.'
            : 'Bu türde etiket yok.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint border-b border-line">
                <th className="pb-2 pr-2 font-semibold">Tür</th>
                <th className="pb-2 pr-2 font-semibold">Başlık</th>
                <th className="pb-2 pr-2 font-semibold">Şekil</th>
                <th className="pb-2 pr-2 font-semibold">Önem</th>
                <th className="pb-2 pr-2 font-semibold">Not</th>
                <th className="pb-2 pr-2 font-semibold text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(tag => {
                const node = map.nodes.find(n => n.id === tag.nodeId);
                return (
                  <tr key={tag.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-2 align-top">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${RENK_CLS[tagTypeOf(tag.type).renk]}`}>
                        {tagTypeOf(tag.type).ad}
                      </span>
                    </td>
                    <td className="py-2 pr-2 align-top text-ink font-medium max-w-[160px] truncate" title={tag.title}>{tag.title}</td>
                    <td className="py-2 pr-2 align-top text-ink-soft max-w-[140px] truncate">{node?.label || '—'}</td>
                    <td className="py-2 pr-2 align-top">
                      {tag.severity ? (
                        <span className="inline-flex items-center gap-1.5 text-ink-soft whitespace-nowrap">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[tag.severity]}`} />
                          {SEVERITY_LABEL[tag.severity]}
                        </span>
                      ) : <span className="text-ink-faint">—</span>}
                    </td>
                    <td className="py-2 pr-2 align-top text-ink-faint max-w-[200px] truncate" title={tag.note || ''}>{tag.note || '—'}</td>
                    <td className="py-2 pr-2 align-top text-right whitespace-nowrap">
                      <button onClick={() => onEditNode(tag.nodeId)} title="Düzenle"
                        className="p-1 rounded hover:bg-surface-2 text-ink-faint hover:text-accent-ink">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onChange(removeTag(map, tag.id))} title="Etiketi sil"
                        className="p-1 rounded hover:bg-danger-tint text-ink-faint hover:text-danger">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MapList({ maps, onCreate, onOpen, onDelete }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('akis');

  const submit = () => {
    onCreate(kind, name.trim() || 'Yeni Harita');
    setName('');
  };

  return (
    <div className="space-y-5">
      <div className="bg-surface border border-line rounded-[10px] shadow-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft mb-3">Yeni Harita</div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="Harita adı"
            className="bg-surface border border-line rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />
          <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5">
            {KIND_OPTS.map(({ kind: k, label, icon: Icon }) => (
              <button key={k} onClick={() => setKind(k)}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border transition ${kind === k ? 'bg-accent-tint text-accent-ink border-accent' : 'bg-surface text-ink-soft border-line hover:bg-surface-2'}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
          <button onClick={submit}
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-accent hover:bg-accent-strong text-white rounded-lg font-medium">
            <PlusCircle className="w-4 h-4" />Oluştur
          </button>
        </div>
      </div>

      {maps.length === 0 ? (
        <div className="bg-surface border border-line rounded-[10px] shadow-card p-10 text-center text-ink-faint">
          Henüz süreç haritası yok — yukarıdan bir tür seçip oluşturun.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {maps.map(m => (
            <div key={m.id} className="bg-surface border border-line rounded-[10px] shadow-card p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display font-semibold text-ink truncate">{m.name}</div>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-2 text-ink-soft">
                  {KIND_LABEL[m.kind] || m.kind}
                </span>
              </div>
              <div className="text-[12px] text-ink-faint">
                {m.nodes.length} şekil · {m.tags?.length || 0} etiket
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={() => onOpen(m.id)}
                  className="flex-1 text-sm px-3 py-1.5 bg-accent hover:bg-accent-strong text-white rounded-lg font-medium">
                  Aç
                </button>
                <button onClick={() => onDelete(m.id)} title="Haritayı sil"
                  className="px-3 py-1.5 text-sm rounded-lg text-ink-faint hover:bg-danger-tint hover:text-danger">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function ProcessMapStudio({ maps, onUpdate, onDeleteMap }) {
  const [activeId, setActiveId] = useState(null);
  const activeMap = maps.find(m => m.id === activeId) || null;

  const handleCreate = (kind, name) => {
    const m = createMap(kind, name);
    onUpdate(list => [...list, m]);
    setActiveId(m.id);
  };

  const handleChange = (updated) => {
    onUpdate(list => list.map(m => m.id === updated.id ? updated : m));
  };

  if (!activeMap) {
    return <MapList maps={maps} onCreate={handleCreate} onOpen={setActiveId} onDelete={onDeleteMap} />;
  }
  return <MapEditor map={activeMap} onChange={handleChange} onBack={() => setActiveId(null)} />;
}
