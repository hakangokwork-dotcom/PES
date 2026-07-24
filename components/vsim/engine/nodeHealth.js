import { isPassthrough } from './flow.js';

/* Bir node'un akış sağlığı (calc'tan saf hesap). utilPct = çıktı/kapasite.
   Durum: gecirgen (input/output) · bos (cap 0) · darbogaz (container'ın en yavaşı) ·
   ac (kapasitesinin altında besleniyor, spare) · normal (tam kapasite, darboğaz değil). */
export function nodeHealth(node, calc, containerId) {
  const cap = calc.cap?.[node.id] ?? 0;
  const out = calc.thru?.[node.id] ?? 0;
  if (isPassthrough(node)) return { status: 'gecirgen', cap, out, utilPct: null };
  if (!(cap > 0)) return { status: 'bos', cap, out, utilPct: 0 };
  const utilPct = Number.isFinite(cap) ? (out / cap) * 100 : null;
  if (calc.bottleneckByContainer?.[containerId] === node.id) return { status: 'darbogaz', cap, out, utilPct };
  if (out < cap * 0.999) return { status: 'ac', cap, out, utilPct };
  return { status: 'normal', cap, out, utilPct };
}
