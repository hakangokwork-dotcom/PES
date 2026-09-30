/* İzometrik sunum görünümü — saf geometri (UI'sız).
   Yerleşim metre cinsinden üstten tanımlıdır; burada her öğe basit kutulara
   (gövde, makine kafası, raf, bant…) ve operatör "figürlerine" ayrılır, sonra
   izometrik izdüşümle ekrana düşürülür. Görünüm 90° adımlarla döndürülebilir
   (k = 0..3); döndürme dünyayı zemin merkezi etrafında çevirir.

   İzdüşüm: sx = (x − y)·cos30°, sy = (x + y)·sin30° − z. Görünür yüzler: üst,
   +y (güney) ve +x (doğu). Çizim sırası: arkadan öne (x + y küçükten büyüğe). */

import { SYMBOLS, itemRect, itemFootprint } from './layout.js';

const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;

export const project = (x, y, z = 0) => ({ x: (x - y) * C30, y: (x + y) * S30 - z });

/* Ekran noktasını (izdüşüm uzayı) zemin düzlemine (z=0) geri çevirir, sonra
   döndürmeyi geri alır → yerleşimin METRE koordinatı. Sürükle-bırak için. */
export function unproject(sx, sy, floor0, k) {
  const a = sx / C30, b = sy / S30;          // a = x − y, b = x + y
  const p = { x: (a + b) / 2, y: (b - a) / 2 };
  return rotPoint(p, rotatedFloor(floor0, k), (4 - (((k % 4) + 4) % 4)) % 4);
}

/* Zemin boyutu döndürmeyle yer değiştirir (90°/270°). */
export const rotatedFloor = (floor, k) => (k % 2 ? { w: floor.h, h: floor.w } : { w: floor.w, h: floor.h });

/* Dünya noktasını k·90° döndür (zemin sol-üst köşesi yeni orijin). */
export function rotPoint(p, floor, k) {
  switch (((k % 4) + 4) % 4) {
    case 1: return { x: floor.h - p.y, y: p.x };
    case 2: return { x: floor.w - p.x, y: floor.h - p.y };
    case 3: return { x: p.y, y: floor.w - p.x };
    default: return { x: p.x, y: p.y };
  }
}
export function rotRect(r, floor, k) {
  const a = rotPoint({ x: r.x, y: r.y }, floor, k);
  const b = rotPoint({ x: r.x + r.w, y: r.y + r.h }, floor, k);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/* Kutunun görünür üç yüzü (ekran koordinatlı çokgenler). */
export function boxFaces(r, z0, z1) {
  const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  const P = (x, y, z) => project(x, y, z);
  return {
    top: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)],
    south: [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)],
    east: [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)],
  };
}

/* Öğe türüne göre yükseklikler (m) ve renkler */
const H = { machineTop: 0.75, head: 0.3, table: 0.9, kesim: 0.9, raf: 1.4, araba: 0.8, palet: 0.15, bant: 0.8, kolon: 2.6 };
export const ISO_COLORS = {
  table: ['#FFFFFF', '#D5DADF', '#BCC3C9'],
  top: ['#F7F5F0', '#D9D4CA', '#C4BEB2'],
  wood: ['#E2C79B', '#C7AA7A', '#B09366'],
  fabric: ['#F2CF5B', '#D9B23E', '#C49F31'],
  head: { idle: '#37414A', work: '#1F7A4D', starved: '#9CA3AA', blocked: '#C2410C', down: '#A61B1B', maint: '#B7791F' },
  rack: ['#E7E1D6', '#C9C0AF', '#B3A994'],
  belt: ['#CFCAC0', '#A9A398', '#948E83'],
  column: ['#4A525A', '#2F363C', '#262B30'],
  pallet: ['#E8DCC6', '#C9B48E', '#B39E78'],
  bundle: ['#F2CF5B', '#D9B23E', '#C49F31'],
};
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c).map(v => v.toString(16).padStart(2, '0')).join('')}`;
};
export const tri = (hex) => [hex, shade(hex, 0.82), shade(hex, 0.7)];

/* Bir öğeyi çizilebilir parçalara ayır. states: { head: 'work'|… } (canlı simülasyon).
   Döner: { depth, parts: [{ type:'box', r, z0, z1, colors } | { type:'person', p, standing, color } | { type:'floor', r, fill }] } */
export function itemDrawables(it, floor, k, opts = {}) {
  const s = SYMBOLS[it.type] || SYMBOLS.duz;
  const body = rotRect(itemRect(it), floor, k);
  const fp = rotRect(itemFootprint(it), floor, k);
  const parts = [];
  const headState = opts.headState || 'idle';
  const box = (r, z0, z1, colors) => parts.push({ type: 'box', r, z0, z1, colors });
  const inset = (r, d) => ({ x: r.x + d, y: r.y + d, w: Math.max(0.02, r.w - 2 * d), h: Math.max(0.02, r.h - 2 * d) });
  // tezgâh: dört ince ayak + tabla (içi dolu blok yerine — sahne hafif ve okunur kalır)
  const table = (r, top, colors = ISO_COLORS.table) => {
    const L = 0.05, t = 0.05;
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b]) =>
      box({ x: r.x + 0.04 + a * (r.w - 0.08 - L), y: r.y + 0.04 + b * (r.h - 0.08 - L), w: L, h: L }, 0, top - t, tri('#8A949E')));
    box(r, top - t, top, colors);
  };

  if (s.kind === 'machine') {
    table(body, H.machineTop, ISO_COLORS.top);
    box({ x: body.x + body.w * 0.55, y: body.y + body.h * 0.3, w: 0.22, h: 0.24 }, 0.12, H.machineTop - 0.06, tri('#6F7780'));   // motor
    const st = tri(ISO_COLORS.head[headState] || ISO_COLORS.head.idle);
    // makine: yatak + sağda dikme + üstte kol + solda iğne başı (dönüş yönünden bağımsız: gövdenin uzun ekseni boyunca)
    const long = body.w >= body.h;
    const L = long ? body.w : body.h, Wd = long ? body.h : body.w;
    const at = (u, v, du, dv) => (long
      ? { x: body.x + u * L, y: body.y + v * Wd, w: du * L, h: dv * Wd }
      : { x: body.x + v * Wd, y: body.y + u * L, w: dv * Wd, h: du * L });
    const t0 = H.machineTop;
    if (it.type === 'ov') {
      box(at(0.25, 0.25, 0.4, 0.5), t0, t0 + 0.26, st);                       // overlok gövdesi (blok)
      ['#E8B931', '#2A9D8F', '#C8553D', '#264653'].forEach((c, i) => box(at(0.3 + i * 0.08, 0.12, 0.05, 0.1), t0 + 0.26, t0 + 0.42, tri(c)));
    } else if (it.type === 'oto') {
      box(at(0.15, 0.2, 0.7, 0.6), t0, t0 + 0.45, st);
    } else {
      box(at(0.15, 0.35, 0.6, 0.3), t0, t0 + 0.06, st);                      // yatak
      box(at(0.62, 0.35, 0.12, 0.3), t0 + 0.06, t0 + 0.34, st);              // dikme
      box(at(0.2, 0.38, 0.54, 0.24), t0 + 0.28, t0 + 0.38, st);              // kol
      box(at(0.18, 0.4, 0.08, 0.2), t0 + 0.14, t0 + 0.38, st);               // iğne başı
      if (it.type === 'kl') box(at(0.05, 0.4, 0.2, 0.2), t0 - 0.2, t0 + 0.06, st);   // kol (silindir) makinesi çıkıntısı
      box(at(0.66, 0.25, 0.05, 0.06), t0 + 0.34, t0 + 0.48, tri('#E8B931'));  // makara
    }
  } else if (s.kind === 'table') {
    table(body, it.type === 'kesim' ? H.kesim : it.type === 'masa' ? H.machineTop : H.table, it.type === 'masa' ? ISO_COLORS.wood : ISO_COLORS.top);
    if (it.type === 'masa') {
      box({ x: body.x + body.w * 0.15, y: body.y + body.h * 0.2, w: body.w * 0.3, h: body.h * 0.5 }, H.machineTop, H.machineTop + 0.05, tri('#DCE7F5'));   // parça
      box({ x: body.x + body.w * 0.6, y: body.y + body.h * 0.25, w: 0.2, h: 0.15 }, H.machineTop, H.machineTop + 0.08, tri('#C8553D'));                  // etiket kutusu
    }
    if (it.type === 'kesim') box(inset(body, 0.12), H.kesim, H.kesim + 0.08, ISO_COLORS.fabric);
    if (it.type === 'utu') box({ x: body.x + body.w * 0.55, y: body.y + body.h * 0.3, w: 0.25, h: body.h * 0.4 }, H.table, H.table + 0.12, tri(ISO_COLORS.head[headState] || ISO_COLORS.head.idle));
    if (it.type === 'kt' || it.type === 'pk') box(inset(body, 0.15), H.table, H.table + 0.04, tri('#DCE7F5'));
    if (it.type === 'pk') box({ x: body.x + 0.1, y: body.y + 0.1, w: 0.4, h: 0.35 }, H.table, H.table + 0.3, tri('#C9A36B'));
  } else if (s.kind === 'buffer') {
    if (it.type === 'palet') box(body, 0, H.palet, ISO_COLORS.pallet);
    else if (it.type === 'araba') box(body, 0.25, H.araba, tri('#FFFFFF'));
    else box(body, 0, 0.08, ISO_COLORS.rack);             // raf tabanı; dolu kısım aşağıda
    const fill = opts.fill;                                // 0..1 doluluk (canlı)
    const h = it.type === 'raf' ? H.raf : it.type === 'araba' ? 0.5 : 0.8;
    const base = it.type === 'araba' ? H.araba : it.type === 'palet' ? H.palet : 0.08;
    if (fill > 0) box(inset(body, 0.08), base, base + h * Math.min(1, fill), fill >= 0.9 ? tri('#E36A6A') : ISO_COLORS.bundle);
    if (it.type === 'raf') {
      // köşe dikmeleri
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b]) => box({ x: body.x + a * (body.w - 0.06), y: body.y + b * (body.h - 0.06), w: 0.06, h: 0.06 }, 0, H.raf, ISO_COLORS.rack));
    }
  } else if (s.kind === 'belt') {
    box(body, 0.6, H.bant, ISO_COLORS.belt);
  } else if (s.kind === 'column') {
    box(body, 0, H.kolon, ISO_COLORS.column);
  } else if (s.kind === 'aisle') {
    parts.push({ type: 'floor', r: body, fill: '#FBE9DC' });
  } else if (s.kind === 'person') {
    parts.push({ type: 'person', p: { x: body.x + body.w / 2, y: body.y + body.h / 2 }, standing: true, color: it.color || '#7A4FB0' });
  }

  // operatör: gövde dışındaki ayak izi bandının ortası
  // her makine/masa başında bir kişi (yedek hariç); yardımcılar yanında ayakta
  const withOp = (s.kind === 'machine' || s.kind === 'table') && !it.isSpare;
  if (withOp) {
    const cx = fp.x + fp.w / 2, cy = fp.y + fp.h / 2;
    const bx = body.x + body.w / 2, by = body.y + body.h / 2;
    const p = { x: cx + (cx - bx) * 0.9, y: cy + (cy - by) * 0.9 };
    parts.push({ type: 'person', p, standing: !s.seat, color: opts.personColor || '#2F6FB5' });
    // yardımcılar: operatör hizasında, gövdenin uzun ekseni boyunca yana
    const long = body.w >= body.h;
    (it.helpers || []).forEach((h, i) => {
      const d = 0.62 * (i + 1);
      parts.push({ type: 'person', p: long ? { x: p.x + d, y: p.y } : { x: p.x, y: p.y + d }, standing: true, color: '#2A9D8F' });
    });
  }
  const depth = fp.x + fp.w / 2 + fp.y + fp.h / 2 + (s.kind === 'aisle' ? -1000 : 0);
  return { id: it.id, depth, parts, body, fp };
}

/* Tüm sahnenin ekran sınırları (viewBox için). */
export function sceneBounds(floor, k, pad = 1) {
  const f = rotatedFloor(floor, k);
  const pts = [project(0, 0, 0), project(f.w, 0, 0), project(0, f.h, 0), project(f.w, f.h, 0), project(0, 0, 3)];
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
}
