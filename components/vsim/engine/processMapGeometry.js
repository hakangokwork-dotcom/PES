/* Şekil geometrisi — hem canlı editör (ProcessMapStudio) hem salt-okunur SVG rapor
   (ProcessReport) aynı boyut/ankraj kurallarını kullansın diye ortak modülde. Saf, UI'sız. */

// Şekil türü → nominal genişlik/yükseklik (edge bağlantı noktaları da bunlardan türetilir)
export const DIMS = {
  start:    { w: 104, h: 48 },
  end:      { w: 104, h: 48 },
  step:     { w: 148, h: 64 },
  decision: { w: 96,  h: 96 },
  doc:      { w: 148, h: 64 },
  subprocess: { w: 148, h: 64 },
};
export const dimsOf = (type) => DIMS[type] || DIMS.step;

// Merkezden verilen yöne göre dikdörtgen sınırıyla kesişim noktası — ok uçları
// şekil merkezine değil kenarına dayansın diye (basit, port'suz yaklaşım).
export function rectEdgePoint(cx, cy, hw, hh, dx, dy) {
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export const nodeCenter = (n) => {
  const { w, h } = dimsOf(n.type);
  return { cx: n.x + w / 2, cy: n.y + h / 2, hw: w / 2, hh: h / 2 };
};

/* Düğümün 4 kenar-ortası bağlantı noktası — açık {w,h} ile. Akış tuvali gibi
   tip taşımayan sabit boyutlu kutular için çekirdek; tip tabanlı çağıranlar
   aşağıdaki sarmalayıcıları kullanır. */
export function handlePointsFor(node, d) {
  return {
    top:    { x: node.x + d.w / 2, y: node.y },
    right:  { x: node.x + d.w,     y: node.y + d.h / 2 },
    bottom: { x: node.x + d.w / 2, y: node.y + d.h },
    left:   { x: node.x,           y: node.y + d.h / 2 },
  };
}
export const handlePoints = (node) => handlePointsFor(node, dimsOf(node.type));

/* Bir kenar (ok) için kaynak/hedef ankraj noktaları — yön baskınlığına göre kutu
   KENAR-ORTASI seçilir. Yatay baskınsa sağ↔sol, dikey baskınsa alt↔üst.
   p1/p2 nokta, s1/s2 hangi kenar olduğu ('right'|'left'|'top'|'bottom') — yol
   çizen fonksiyonlar çıkış yönünü ankraj farkından TAHMİN ETMESİN diye (bkz. orthoPath). */
export function edgeAnchorsForDims(src, tgt, sd, td) {
  const scx = src.x + sd.w / 2, scy = src.y + sd.h / 2;
  const tcx = tgt.x + td.w / 2, tcy = tgt.y + td.h / 2;
  const dx = tcx - scx, dy = tcy - scy;
  const sh = handlePointsFor(src, sd), th = handlePointsFor(tgt, td);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { p1: sh.right, s1: 'right', p2: th.left, s2: 'left' }
                   : { p1: sh.left, s1: 'left', p2: th.right, s2: 'right' };
  }
  return dy >= 0 ? { p1: sh.bottom, s1: 'bottom', p2: th.top, s2: 'top' }
                 : { p1: sh.top, s1: 'top', p2: th.bottom, s2: 'bottom' };
}
export const edgeAnchors = (src, tgt) =>
  edgeAnchorsForDims(src, tgt, dimsOf(src.type), dimsOf(tgt.type));

/* Bir düğümün `side` yönünde açılacak yeni düğümün sol-üst konumu (gap boşlukla,
   kaynağa göre çapraz eksende ortalanmış). newType varsayılan 'step'. */
export function nextStepPos(node, side, newType = 'step', gap = 64) {
  const { w, h } = dimsOf(node.type);
  const nd = dimsOf(newType);
  switch (side) {
    case 'right':  return { x: node.x + w + gap,        y: node.y + (h - nd.h) / 2 };
    case 'left':   return { x: node.x - nd.w - gap,     y: node.y + (h - nd.h) / 2 };
    case 'bottom': return { x: node.x + (w - nd.w) / 2, y: node.y + h + gap };
    case 'top':    return { x: node.x + (w - nd.w) / 2, y: node.y - nd.h - gap };
    default:       return { x: node.x + w + gap,        y: node.y + (h - nd.h) / 2 };
  }
}

/* İki nokta arası yumuşak cubic bezier yol (d string). Kontrol noktaları baskın
   eksene göre teğet açar (yatay segment → yatay teğet, dikey → dikey) — n8n hissi. */
export function bezierPath(s, t) {
  const dx = t.x - s.x, dy = t.y - s.y;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  const k = Math.max(40, (horiz ? Math.abs(dx) : Math.abs(dy)) * 0.5);
  const c1 = horiz ? { x: s.x + Math.sign(dx || 1) * k, y: s.y } : { x: s.x, y: s.y + Math.sign(dy || 1) * k };
  const c2 = horiz ? { x: t.x - Math.sign(dx || 1) * k, y: t.y } : { x: t.x, y: t.y - Math.sign(dy || 1) * k };
  return `M${s.x},${s.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${t.x},${t.y}`;
}

// Kenar adı → dışa doğru birim normal
const SIDE_NORMAL = {
  right: { x: 1, y: 0 }, left: { x: -1, y: 0 },
  top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 },
};
/* Ankraj noktasını kenar normali boyunca `d` kadar dışarı iter (ok ucu kartın altında
   kalmasın / port noktası kenara teğet dursun diye). */
export const offsetAlongSide = (p, side, d) => {
  const n = SIDE_NORMAL[side] || SIDE_NORMAL.right;
  return { x: p.x + n.x * d, y: p.y + n.y * d };
};

/* n8n sabit-port modeli: çıkış DAİMA sağ, giriş DAİMA sol. Hedef kaynağın solunda
   (ya da yeterince sağında değil) kalırsa ok kendi üstünden geçmesin diye şerit
   üzerinden dolanır. Bu iki yardımcı hem yol çizimi hem de sil-rozeti konumu için
   TEK kaynak olsun diye dışa açık. */
export const ORTHO_MIN_GAP = 40;   // bu kadar sağda değilse geri-akış sayılır
export const isBackwardEdge = (p1, p2, minGap = ORTHO_MIN_GAP) => p2.x < p1.x + minGap;
/* Geri-akış ilmeğinin dolanacağı yatay şerit. Hedef aşağıdaysa alttan, yukarıdaysa
   üstten dolanır (kısa taraf). clearance kutu yarı-yüksekliğini aşmalı ki gövdeyi kesmesin. */
export const orthoBackwardLaneY = (p1, p2, clearance = 52) =>
  p2.y >= p1.y ? Math.max(p1.y, p2.y) + clearance : Math.min(p1.y, p2.y) - clearance;

/* Geri-akış rotası: sağa çık → şeride in/çık → sola git → hedefin soluna gir. */
function orthoLoop(p1, p2, r) {
  const STUB = 24;
  const laneY = orthoBackwardLaneY(p1, p2);
  const xA = p1.x + STUB;               // kaynaktan sağa çıkış payı
  const xB = p2.x - STUB;               // hedefin soluna yaklaşma payı
  const sy1 = Math.sign(laneY - p1.y) || 1;
  const sy2 = Math.sign(p2.y - laneY) || 1;
  const dxLane = Math.sign(xB - xA) || -1;   // şeritte daima sola
  const rr = Math.max(0, Math.min(
    r, STUB / 2,
    Math.abs(laneY - p1.y) / 2,
    Math.abs(xB - xA) / 2,
    Math.abs(p2.y - laneY) / 2,
  ));
  if (!(rr > 0)) {                       // dejenere (çok dar) → köşesiz dik rota
    return `M${p1.x},${p1.y} L${xA},${p1.y} L${xA},${laneY} L${xB},${laneY} L${xB},${p2.y} L${p2.x},${p2.y}`;
  }
  return `M${p1.x},${p1.y}`
    + ` L${xA - rr},${p1.y} Q${xA},${p1.y} ${xA},${p1.y + sy1 * rr}`
    + ` L${xA},${laneY - sy1 * rr} Q${xA},${laneY} ${xA + dxLane * rr},${laneY}`
    + ` L${xB - dxLane * rr},${laneY} Q${xB},${laneY} ${xB},${laneY + sy2 * rr}`
    + ` L${xB},${p2.y - sy2 * rr} Q${xB},${p2.y} ${xB + rr},${p2.y}`
    + ` L${p2.x},${p2.y}`;
}

/* Dik köşeli (ortogonal) yol, köşeleri yuvarlatılmış — VSM/Visio dili, "smoothstep".
   s1/s2 ÇIKIŞ KENARLARIDIR: yol o yönde başlar ve hedefe karşı kenardan girer, yani
   çıkış yönü ile yol yönü asla çelişmez (bezierPath'in aksine — o teğeti nokta farkından
   yeniden türetir ve sağdan çıkan oku dikey açabilir).
   Yatay kenarlarda orta X'te, dikey kenarlarda orta Y'de tek dönüş yapılır. Dönecek yer
   yoksa (kutular çakışık / eksen hizalı) düz çizgiye düşer. Saf — UI'sız. */
export function orthoPath(p1, s1, p2, s2, r = 14) {
  const horiz = s1 === 'right' || s1 === 'left';
  const straight = `M${p1.x},${p1.y} L${p2.x},${p2.y}`;
  // Sabit-port geri akışı (sağdan çıkıp sola girerken hedef solda) → dolanan ilmek
  if (s1 === 'right' && s2 === 'left' && isBackwardEdge(p1, p2)) return orthoLoop(p1, p2, r);
  if (horiz) {
    const dy = p2.y - p1.y, dx = p2.x - p1.x;
    if (Math.abs(dy) < 2) return straight;                    // aynı hizada → düz
    const midX = (p1.x + p2.x) / 2;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    // Dönüş yarıçapı: köşeler segmentlerden uzun olamaz. Yer yoksa düz çiz.
    const rr = Math.min(r, Math.abs(dy) / 2, Math.abs(midX - p1.x), Math.abs(p2.x - midX));
    if (!(rr > 0) || sx === 0) return straight;
    return `M${p1.x},${p1.y} L${midX - sx * rr},${p1.y}`
      + ` Q${midX},${p1.y} ${midX},${p1.y + sy * rr}`
      + ` L${midX},${p2.y - sy * rr}`
      + ` Q${midX},${p2.y} ${midX + sx * rr},${p2.y}`
      + ` L${p2.x},${p2.y}`;
  }
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  if (Math.abs(dx) < 2) return straight;
  const midY = (p1.y + p2.y) / 2;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const rr = Math.min(r, Math.abs(dx) / 2, Math.abs(midY - p1.y), Math.abs(p2.y - midY));
  if (!(rr > 0) || sy === 0) return straight;
  return `M${p1.x},${p1.y} L${p1.x},${midY - sy * rr}`
    + ` Q${p1.x},${midY} ${p1.x + sx * rr},${midY}`
    + ` L${p2.x - sx * rr},${midY}`
    + ` Q${p2.x},${midY} ${p2.x},${midY + sy * rr}`
    + ` L${p2.x},${p2.y}`;
}
