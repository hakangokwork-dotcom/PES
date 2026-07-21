/* Serbest çizim (karalama) saf işlemleri — immutable. Harita koordinat uzayında.
   sketch = { strokes: [{id,color,width,opacity,points:[[x,y]]}], texts: [{id,x,y,text,color}],
              shapes: [{id,type,x1,y1,x2,y2,color,width}],
              stickies: [{id,x,y,w,h,text,color}], stamps: [{id,x,y,emoji,size}] } */

const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 10);

export const DEFAULT_SKETCH = { strokes: [], texts: [], shapes: [], stickies: [], stamps: [], comments: [] };

/* Sabit çizim renkleri (durum rengi DEĞİL — kullanıcı seçer) */
export const SKETCH_COLORS = ['#1A2B32', '#B3402A', '#2F9E68', '#3E6B8C', '#DE7C3B', '#7A4A8C'];

/* Sticky not pastel renkleri (durum rengi DEĞİL — kullanıcı seçer). */
export const STICKY_COLORS = ['#FEF08A', '#FBCFE8', '#BBF7D0', '#BFDBFE', '#FED7AA', '#DDD6FE'];
const STICKY_W = 168, STICKY_H = 168;

/* Bu eşiğin altındaki sürüklemeler şekil sayılmaz (yanlışlıkla tık). */
const MIN_SHAPE_PX = 3;

const sk = (map) => map.sketch || DEFAULT_SKETCH;

/* Herhangi bir sketch'i tam alan setine normalize et (eski {strokes,texts} kayıtları güvenli). */
const norm = (s) => ({
  strokes: s.strokes || [], texts: s.texts || [], shapes: s.shapes || [],
  stickies: s.stickies || [], stamps: s.stamps || [], comments: s.comments || [],
});

/* (x,y) noktasının [a,b] köşeli bounding box'a en yakın mesafesinin karesi. */
const pointRectDist2 = (x, y, ax, ay, bx, by) => {
  const minx = Math.min(ax, bx), maxx = Math.max(ax, bx), miny = Math.min(ay, by), maxy = Math.max(ay, by);
  const cx = Math.max(minx, Math.min(x, maxx)), cy = Math.max(miny, Math.min(y, maxy));
  return (x - cx) ** 2 + (y - cy) ** 2;
};

export function addStroke(map, stroke) {
  const pts = stroke.points || [];
  if (pts.length < 2) return map;
  const s = norm(sk(map));
  const yeni = {
    id: uid('st'), color: stroke.color || '#1A2B32',
    width: stroke.width || 3, opacity: stroke.opacity ?? 1, points: pts,
  };
  return { ...map, sketch: { ...s, strokes: [...s.strokes, yeni] } };
}

export function addShape(map, shape) {
  const { x1, y1, x2, y2 } = shape;
  if ([x1, y1, x2, y2].some(v => v == null)) return map;
  if (Math.abs(x2 - x1) < MIN_SHAPE_PX && Math.abs(y2 - y1) < MIN_SHAPE_PX) return map;   // çok küçük = şekil değil
  const s = norm(sk(map));
  const yeni = { id: uid('sh'), type: shape.type || 'rect', x1, y1, x2, y2, color: shape.color || '#1A2B32', width: shape.width || 2 };
  return { ...map, sketch: { ...s, shapes: [...s.shapes, yeni] } };
}

/* (x,y) merkezli r yarıçapına giren stroke VE şekilleri siler. */
export function eraseStrokesAt(map, x, y, r) {
  const s = norm(sk(map));
  const r2 = r * r;
  const hitStroke = (st) => st.points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 <= r2);
  const hitShape = (sh) => pointRectDist2(x, y, sh.x1, sh.y1, sh.x2, sh.y2) <= r2;
  const strokes = s.strokes.filter(st => !hitStroke(st));
  const shapes = s.shapes.filter(sh => !hitShape(sh));
  if (strokes.length === s.strokes.length && shapes.length === s.shapes.length) return map;
  return { ...map, sketch: { ...s, strokes, shapes } };
}

export function clearSketch(map) {
  return { ...map, sketch: { strokes: [], texts: [], shapes: [], stickies: [], stamps: [], comments: [] } };
}

/* --- Sticky notlar (FigJam-tarzı yapışkan kartlar) --- */

export function addSticky(map, x, y, color = STICKY_COLORS[0], text = '') {
  const s = norm(sk(map));
  const yeni = { id: uid('sr'), x, y, w: STICKY_W, h: STICKY_H, text, color };
  return { ...map, sketch: { ...s, stickies: [...s.stickies, yeni] } };
}

export function moveSticky(map, id, x, y) {
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, stickies: s.stickies.map(n => n.id === id ? { ...n, x, y } : n) } };
}

/* Boş metin İZİNLİ — sticky silinmez (metin notunun aksine). */
export function updateSticky(map, id, text) {
  const t = String(text ?? '');
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, stickies: s.stickies.map(n => n.id === id ? { ...n, text: t } : n) } };
}

export function removeSticky(map, id) {
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, stickies: s.stickies.filter(n => n.id !== id) } };
}

/* --- Stamp (emoji reaksiyon damgaları) --- */

export function addStamp(map, x, y, emoji, size = 40) {
  if (!String(emoji ?? '').trim()) return map;
  const s = norm(sk(map));
  const yeni = { id: uid('sp'), x, y, emoji, size };
  return { ...map, sketch: { ...s, stamps: [...s.stamps, yeni] } };
}

export function moveStamp(map, id, x, y) {
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, stamps: s.stamps.map(n => n.id === id ? { ...n, x, y } : n) } };
}

export function removeStamp(map, id) {
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, stamps: s.stamps.filter(n => n.id !== id) } };
}

/* --- Comment (yorum iğnesi — konumlanan konuşma-balonu + not) --- */

export function addComment(map, x, y, text = '') {
  const s = norm(sk(map));
  const yeni = { id: uid('cm'), x, y, text: String(text ?? ''), done: false };
  return { ...map, sketch: { ...s, comments: [...s.comments, yeni] } };
}

/* Boş metin İZİNLİ — yorum silinmez (iğne boş bırakılabilir). */
export function updateComment(map, id, text) {
  const t = String(text ?? '');
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, comments: s.comments.map(c => c.id === id ? { ...c, text: t } : c) } };
}

export function moveComment(map, id, x, y) {
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, comments: s.comments.map(c => c.id === id ? { ...c, x, y } : c) } };
}

export function toggleCommentDone(map, id) {
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, comments: s.comments.map(c => c.id === id ? { ...c, done: !c.done } : c) } };
}

export function removeComment(map, id) {
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, comments: s.comments.filter(c => c.id !== id) } };
}

export function addTextNote(map, x, y, text, color = '#1A2B32') {
  const t = String(text ?? '').trim();
  if (!t) return map;
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, texts: [...s.texts, { id: uid('tx'), x, y, text: t, color }] } };
}

export function moveTextNote(map, id, x, y) {
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, texts: s.texts.map(t => t.id === id ? { ...t, x, y } : t) } };
}

export function updateTextNote(map, id, text) {
  const t = String(text ?? '').trim();
  if (!t) return removeTextNote(map, id);
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, texts: s.texts.map(x => x.id === id ? { ...x, text: t } : x) } };
}

export function removeTextNote(map, id) {
  const s = norm(sk(map));
  return { ...map, sketch: { ...s, texts: s.texts.filter(t => t.id !== id) } };
}

/* Normal dağılım (çan/Gauss) eğrisi — verilen kutuya oturan SVG path.
   g: { x, y, w, h, cx } (renderShape'in shapeGeom çıktısı).
   Eğri tabandan (sol alt) başlar, ortada üst kenara değer, tabanda (sağ alt) biter.

   Gauss'un kendisi bezier değildir; dört kübik parça ile yaklaşılır. Kontrol
   noktaları σ ölçeğinden türetilir: eğri ±1σ'da yüksekliğin ~%60'ına, ±2σ'da
   ~%13'üne düşer. Kutu genişliğini ±3σ kabul ederiz (dağılımın ~%99,7'si) →
   1σ = w/6. Bu, gerçek çan biçimini gözle ayırt edilemeyecek kadar iyi verir.

   Saf — UI'sız, test edilebilir (bkz. sketchOps.test.js). */
export function bellCurvePath(g) {
  const { x, y, w, h, cx } = g;
  const base = y + h;                 // taban çizgisi (kutunun altı)
  if (!(w > 0) || !(h > 0)) return `M${x},${base} L${x + (w || 0)},${base}`;  // dejenere → düz taban

  const s = w / 6;                    // 1σ — kutu genişliği ±3σ
  const yAt = (k) => base - h * Math.exp(-(k * k) / 2);   // k σ uzaklıkta yükseklik
  const r = (n) => Math.round(n * 100) / 100;             // path'i kısa tut

  const x0 = x,        y0 = base;             // -3σ (taban)
  const x1 = cx - 2 * s, y1 = yAt(2);         // -2σ
  const x2 = cx - s,     y2 = yAt(1);         // -1σ
  const x3 = cx,         y3 = y;              // tepe (0σ, üst kenar)
  const x4 = cx + s,     y4 = y2;             // +1σ (simetrik)
  const x5 = cx + 2 * s, y5 = y1;             // +2σ
  const x6 = x + w,      y6 = base;           // +3σ (taban)

  // Her parça için kontrol noktaları: yatay mesafenin üçte biri kadar teğet —
  // bu, komşu noktalar arasında düzgün (C1-benzeri) geçiş verir.
  const t = s / 3;
  return `M${r(x0)},${r(y0)}`
    + ` C${r(x0 + t)},${r(y0)} ${r(x1 - t)},${r(y1)} ${r(x1)},${r(y1)}`
    + ` C${r(x1 + t)},${r(y1)} ${r(x2 - t)},${r(y2)} ${r(x2)},${r(y2)}`
    + ` C${r(x2 + t)},${r(y2)} ${r(x3 - t)},${r(y3)} ${r(x3)},${r(y3)}`
    + ` C${r(x3 + t)},${r(y3)} ${r(x4 - t)},${r(y4)} ${r(x4)},${r(y4)}`
    + ` C${r(x4 + t)},${r(y4)} ${r(x5 - t)},${r(y5)} ${r(x5)},${r(y5)}`
    + ` C${r(x5 + t)},${r(y5)} ${r(x6 - t)},${r(y6)} ${r(x6)},${r(y6)}`;
}
