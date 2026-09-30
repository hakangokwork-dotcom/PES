import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Copy, Trash2, RotateCw, RotateCcw, Wand2, Undo2, Redo2, Maximize, Pencil, GitCompare,
  AlignStartVertical, AlignStartHorizontal, AlignCenterHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, AlertTriangle,
} from 'lucide-react';
import {
  SYMBOLS, snap, createItem, symbolForSubOp, newLayout, layoutMetrics, autoPlace, layoutSummary,
  itemRect, itemFootprint, stationSlots, DEFAULT_FLOOR, insertSubOpAfter,
  stationAt, mergeWorkerIntoStation,
} from '../engine/layout.js';
import { uid } from '../engine/flow.js';
import { DEFAULT_TRANSPORT } from '../engine/logistics.js';
import { LayoutDefs, LayoutItem, SymbolIcon, INK } from './LayoutSymbols.jsx';
import IsoView from './IsoView.jsx';
import { promptDialog, confirmDialog } from './dialogs/dialogService.js';

/* Yerleşim sekmesi — atölyeyi gerçek ölçüde kur, spagetti haritasını ve
   yerleşim karnesini gör, denemeleri kıyasla. Tüm hesap engine/layout.js'te;
   burası yalnız çizim ve etkileşim. Veri: data.layouts + data.activeLayoutId
   (onPatch ile yazılır; süreç verisine dokunulmaz). */

const PX_PER_M = 40;
const MIME = 'application/x-vsim-layout';
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d).replace('.', ','));

const CATALOG = [
  { title: 'Makineler', types: ['duz', 'ov', 'rc', 'kl', 'il', 'oto'] },
  { title: 'Masa ve tezgâhlar', types: ['masa', 'kt', 'utu', 'pk', 'kesim'] },
  { title: 'Çalışan', types: ['calisan'] },
  { title: 'Ara stok', types: ['raf', 'araba', 'palet'] },
  { title: 'Altyapı', types: ['bant', 'koridor', 'kolon'] },
];
/* Boş masaya süreçte operasyon açılırken varsayılan operasyon türü */
const OPTYPE_OF_SYMBOL = { duz: 'DİKİM', ov: 'OVERLOK', rc: 'REÇME', kl: 'DİKİM', il: 'DİKİM', oto: 'OTOMAT', utu: 'ÜTÜ', kt: 'KONTROL', pk: 'AKSESUAR', kesim: 'KESİM', masa: 'DESTEK' };
const MACHINE_TABLE_TYPES = [...CATALOG[0].types, ...CATALOG[1].types];

function rotateItem(it, delta) {
  const r = itemRect(it);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const rot = (((it.rot || 0) + delta) % 360 + 360) % 360;
  const n = itemRect({ ...it, rot });
  return { ...it, rot, x: r2(cx - n.w / 2), y: r2(cy - n.h / 2) };
}
const shortName = (s, n = 14) => (!s ? '' : s.length > n ? s.slice(0, n - 1) + '…' : s);

export default function LayoutView({ data, onPatch }) {
  const layouts = data.layouts || [];
  const active = layouts.find(l => l.id === data.activeLayoutId) || layouts[0] || null;
  const activeId = active?.id || null;

  const [selection, setSelection] = useState([]);
  const [view, setView] = useState({ x: 40, y: 40, zoom: 1 });
  const [drag, setDrag] = useState(null);           // { dx, dy } hareket önizlemesi
  const [marquee, setMarquee] = useState(null);     // { x0,y0,x1,y1 } metre
  const [layers, setLayers] = useState({ routes: true, dims: false });
  const [compareOpen, setCompareOpen] = useState(false);
  const [viewMode, setViewMode] = useState('plan');      // 'plan' | 'iso'
  const [allRoutesInInspector, setAllRoutesInInspector] = useState(false);
  const wrapRef = useRef(null);
  const isoWrapRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const spaceRef = useRef(false);
  const hist = useRef({ id: null, past: [], future: [] });

  const scale = PX_PER_M * view.zoom;
  const floor = active?.floor || DEFAULT_FLOOR;
  const items = active?.items || [];

  /* ---------- yazma ---------- */
  const setItems = useCallback((fn) => onPatch(d => {
    const ls = d.layouts || [];
    const aid = (ls.find(l => l.id === d.activeLayoutId) || ls[0])?.id;
    return { layouts: ls.map(l => (l.id === aid ? { ...l, items: fn(l.items || []) } : l)) };
  }), [onPatch]);

  if (hist.current.id !== activeId) hist.current = { id: activeId, past: [], future: [] };
  const commit = useCallback((fn) => {
    const h = hist.current;
    h.past.push(items);
    if (h.past.length > 60) h.past.shift();
    h.future = [];
    setItems(fn);
  }, [items, setItems]);
  const undo = () => {
    const h = hist.current;
    if (!h.past.length) return;
    h.future.push(items);
    const prev = h.past.pop();
    setItems(() => prev);
  };
  const redo = () => {
    const h = hist.current;
    if (!h.future.length) return;
    h.past.push(items);
    const nxt = h.future.pop();
    setItems(() => nxt);
  };

  /* ---------- türetmeler ---------- */
  const selSet = useMemo(() => new Set(selection), [selection]);
  const displayItems = useMemo(() => (drag
    ? items.map(it => (selSet.has(it.id) ? { ...it, x: r2(it.x + drag.dx), y: r2(it.y + drag.dy) } : it))
    : items), [items, drag, selSet]);
  const displayLayout = useMemo(() => (active ? { ...active, items: displayItems } : null), [active, displayItems]);
  const metrics = useMemo(() => (displayLayout ? layoutMetrics(data, displayLayout) : null), [data, displayLayout]);

  const subById = useMemo(() => new Map((data.subOps || []).map(s => [s.id, s])), [data.subOps]);
  const opById = useMemo(() => new Map((data.operators || []).map(o => [o.id, o])), [data.operators]);
  const mcById = useMemo(() => new Map((data.machines || []).map(m => [m.id, m])), [data.machines]);
  const mainById = useMemo(() => new Map((data.mainOps || []).map(m => [m.id, m])), [data.mainOps]);
  const slots = useMemo(() => stationSlots(data), [data]);
  const sharedItemIds = useMemo(() => new Set((metrics?.shared || []).flatMap(s => s.itemIds)), [metrics]);

  const stationInfo = (it) => {
    if (!it.subOpId) return null;
    const s = subById.get(it.subOpId);
    if (!s) return { label: '?', title: 'Bağlı operasyon süreçten silinmiş', hasOperator: false };
    const op = opById.get(s.operatorId);
    const n = Math.max(1, Math.round(s.stationCount || 1));
    return {
      label: shortName(s.name || s.id) + (n > 1 ? ` ·${(it.slot || 0) + 1}` : ''),
      title: [s.name, `çevrim ${s.cycleTime} sn`, op ? `operatör: ${op.name}` : 'operatör atanmamış'].join(' · '),
      hasOperator: !!s.operatorId,
      shared: sharedItemIds.has(it.id),
    };
  };

  // seçili istasyonun rotaları öne çıkar
  const focusSubIds = useMemo(() => new Set(displayItems.filter(i => selSet.has(i.id) && i.subOpId).map(i => i.subOpId)), [displayItems, selSet]);

  /* ---------- görünüm ---------- */
  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    const zoom = Math.max(0.2, Math.min(3, Math.min((cw - 60) / (floor.w * PX_PER_M), (ch - 60) / (floor.h * PX_PER_M))));
    setView({ zoom, x: (cw - floor.w * PX_PER_M * zoom) / 2, y: (ch - floor.h * PX_PER_M * zoom) / 2 });
  }, [floor.w, floor.h]);
  useEffect(() => { fit(); setSelection([]); }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const f = Math.exp(-e.deltaY * 0.0015);
        setView(v => {
          const zoom = Math.max(0.2, Math.min(4, v.zoom * f));
          const k = zoom / v.zoom;
          return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
        });
      } else {
        setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [activeId]);

  const toM = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left - view.x) / scale, y: (e.clientY - rect.top - view.y) / scale };
  };

  /* ---------- işaretçi ---------- */
  const onItemPointerDown = (e, it) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    wrapRef.current?.focus({ preventScroll: true });
    let sel = selection;
    if (e.shiftKey) sel = selSet.has(it.id) ? selection.filter(x => x !== it.id) : [...selection, it.id];
    else if (!selSet.has(it.id)) sel = [it.id];
    setSelection(sel);
    if (!sel.includes(it.id)) return;
    dragRef.current = { mode: 'move', start: toM(e), primary: it, moved: false, noSnap: e.altKey };
    svgRef.current.setPointerCapture(e.pointerId);
  };
  const onBgPointerDown = (e) => {
    wrapRef.current?.focus({ preventScroll: true });
    if (e.button === 1 || spaceRef.current) {
      dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, v: view };
    } else if (e.button === 0) {
      const m = toM(e);
      if (!e.shiftKey) setSelection([]);
      dragRef.current = { mode: 'marquee', start: m, add: e.shiftKey };
      setMarquee({ x0: m.x, y0: m.y, x1: m.x, y1: m.y });
    } else return;
    svgRef.current.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === 'pan') {
      setView({ ...d.v, x: d.v.x + e.clientX - d.sx, y: d.v.y + e.clientY - d.sy });
    } else if (d.mode === 'move') {
      const m = toM(e);
      let dx = m.x - d.start.x, dy = m.y - d.start.y;
      if (!d.noSnap && !e.altKey) {
        dx = r2(snap(d.primary.x + dx) - d.primary.x);
        dy = r2(snap(d.primary.y + dy) - d.primary.y);
      }
      if (dx || dy) d.moved = true;
      setDrag({ dx, dy });
    } else if (d.mode === 'marquee') {
      const m = toM(e);
      setMarquee({ x0: d.start.x, y0: d.start.y, x1: m.x, y1: m.y });
    }
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.mode === 'move') {
      if (d.moved && drag && (drag.dx || drag.dy)) finishMove(drag.dx, drag.dy);
      setDrag(null);
    } else if (d.mode === 'marquee' && marquee) {
      const x0 = Math.min(marquee.x0, marquee.x1), x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1), y1 = Math.max(marquee.y0, marquee.y1);
      if (x1 - x0 > 0.05 || y1 - y0 > 0.05) {
        const hit = items.filter(it => {
          const f = itemFootprint(it);
          return f.x < x1 && f.x + f.w > x0 && f.y < y1 && f.y + f.h > y0;
        }).map(i => i.id);
        setSelection(s => (d.add ? [...new Set([...s, ...hit])] : hit));
      }
      setMarquee(null);
    }
  };

  /* ---------- düzenleme işlemleri ---------- */
  const removeSelected = () => {
    if (!selection.length) return;
    commit(its => its.filter(i => !selSet.has(i.id)));
    setSelection([]);
  };
  const rotateSelected = (delta) => selection.length && commit(its => its.map(i => (selSet.has(i.id) ? rotateItem(i, delta) : i)));
  const duplicateSelected = () => {
    if (!selection.length) return;
    const copies = items.filter(i => selSet.has(i.id)).map(i => {
      const { subOpId, slot, routeKeys, ...rest } = i;
      return { ...rest, id: `li_${uid()}`, x: r2(i.x + 0.5), y: r2(i.y + 0.5) };
    });
    commit(its => [...its, ...copies]);
    setSelection(copies.map(c => c.id));
  };
  const nudge = (dx, dy) => selection.length && commit(its => its.map(i => (selSet.has(i.id) ? { ...i, x: r2(i.x + dx), y: r2(i.y + dy) } : i)));
  const patchItem = (id, patch) => commit(its => its.map(i => (i.id === id ? { ...i, ...patch } : i)));
  const align = (mode) => {
    const sel = items.filter(i => selSet.has(i.id));
    if (sel.length < 2) return;
    const rects = new Map(sel.map(i => [i.id, itemRect(i)]));
    let next = {};
    if (mode === 'left') { const x = Math.min(...sel.map(i => rects.get(i.id).x)); sel.forEach(i => { next[i.id] = { x }; }); }
    if (mode === 'top') { const y = Math.min(...sel.map(i => rects.get(i.id).y)); sel.forEach(i => { next[i.id] = { y }; }); }
    if (mode === 'middle') {
      const cy = sel.reduce((a, i) => a + rects.get(i.id).y + rects.get(i.id).h / 2, 0) / sel.length;
      sel.forEach(i => { next[i.id] = { y: r2(snap(cy - rects.get(i.id).h / 2, 0.05)) }; });
    }
    if (mode === 'distX' || mode === 'distY') {
      const k = mode === 'distX' ? 'x' : 'y', kw = mode === 'distX' ? 'w' : 'h';
      const sorted = [...sel].sort((a, b) => rects.get(a.id)[k] - rects.get(b.id)[k]);
      const c0 = rects.get(sorted[0].id)[k] + rects.get(sorted[0].id)[kw] / 2;
      const last = sorted[sorted.length - 1];
      const c1 = rects.get(last.id)[k] + rects.get(last.id)[kw] / 2;
      const step = (c1 - c0) / (sorted.length - 1);
      sorted.forEach((i, n) => { next[i.id] = { [k]: r2(c0 + step * n - rects.get(i.id)[kw] / 2) }; });
    }
    commit(its => its.map(i => (next[i.id] ? { ...i, ...next[i.id] } : i)));
  };

  /* Seçili öğeleri taşı. Tek bir serbest çalışan bir makine/masanın üstüne
     bırakıldıysa o istasyona yardımcı (ikinci kişi) olarak katılır. */
  const finishMove = (dx, dy) => {
    const moved = items.map(it => (selSet.has(it.id) ? { ...it, x: r2(it.x + dx), y: r2(it.y + dy) } : it));
    if (selection.length === 1) {
      const w = moved.find(i => i.id === selection[0]);
      if (w && SYMBOLS[w.type]?.kind === 'person') {
        const f = itemFootprint(w);
        const st = stationAt(moved, { x: f.x + f.w / 2, y: f.y + f.h / 2 }, w.id);
        if (st) { commit(() => mergeWorkerIntoStation(moved, w.id, st.id)); setSelection([st.id]); return; }
      }
    }
    commit(() => moved);
  };
  const addAt = (payload, x, y) => {
    const sym = SYMBOLS[payload.type];
    if (!sym) return;
    // paletten serbest çalışan bir istasyonun üstüne bırakıldı → o istasyona yardımcı
    if (sym.kind === 'person') {
      const st = stationAt(items, { x, y });
      if (st) {
        commit(its => its.map(i => (i.id === st.id ? { ...i, helpers: [...(i.helpers || []), { id: `h_${uid()}`, name: '', operatorId: null }] } : i)));
        setSelection([st.id]);
        return;
      }
    }
    const it = createItem(payload.type, snap(x - sym.w / 2), snap(y - sym.h / 2),
      payload.subOpId ? { subOpId: payload.subOpId, slot: payload.slot || 0 } : {});
    commit(its => [...its, it]);
    setSelection([it.id]);
  };
  const addAtCenter = (payload) => {
    if (viewMode === 'iso') {
      // izometrikte: seçili öğenin yanına, yoksa zemin ortasına
      const ref = items.find(i => selSet.has(i.id));
      if (ref) { const f = itemFootprint(ref); addAt(payload, f.x + f.w + 1, f.y + f.h / 2); } else addAt(payload, floor.w / 2, floor.h / 2);
      return;
    }
    const el = wrapRef.current;
    const x = el ? (el.clientWidth / 2 - view.x) / scale : floor.w / 2;
    const y = el ? (el.clientHeight / 2 - view.y) / scale : floor.h / 2;
    addAt(payload, x, y);
  };
  const onDrop = (e) => {
    const raw = e.dataTransfer.getData(MIME);
    if (!raw) return;
    e.preventDefault();
    try { const p = JSON.parse(raw); const m = toM(e); addAt(p, m.x, m.y); } catch { /* bozuk yük */ }
  };
  const autoPlaceRest = () => {
    const add = autoPlace(data, active);
    if (add.length) commit(its => [...its, ...add]);
  };

  const onKeyDown = (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ') { spaceRef.current = true; e.preventDefault(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelection(items.map(i => i.id)); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
    if (e.key === 'r' || e.key === 'R') { rotateSelected(e.shiftKey ? -90 : 90); return; }
    if (e.key === 'Escape') { setSelection([]); return; }
    const step = e.shiftKey ? 0.5 : 0.1;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (arrows[e.key]) { e.preventDefault(); nudge(...arrows[e.key]); }
  };
  const onKeyUp = (e) => { if (e.key === ' ') spaceRef.current = false; };

  /* ---------- deneme yönetimi ---------- */
  const startLayout = (auto) => onPatch(d => {
    const L = newLayout(`Deneme ${(d.layouts || []).length + 1}`);
    if (auto) L.items = autoPlace(d, L);
    return { layouts: [...(d.layouts || []), L], activeLayoutId: L.id };
  });
  const duplicateLayout = () => active && onPatch(d => {
    const copy = JSON.parse(JSON.stringify(active));
    copy.id = `ly_${uid()}`;
    copy.name = `${active.name} (kopya)`;
    return { layouts: [...(d.layouts || []), copy], activeLayoutId: copy.id };
  });
  const renameLayout = async () => {
    if (!active) return;
    const name = await promptDialog({ message: 'Deneme adı:', defaultValue: active.name });
    if (!name) return;
    onPatch(d => ({ layouts: (d.layouts || []).map(l => (l.id === active.id ? { ...l, name } : l)) }));
  };
  const deleteLayout = async () => {
    if (!active) return;
    if (!(await confirmDialog({ message: `"${active.name}" silinecek. Emin misin?`, danger: true }))) return;
    onPatch(d => {
      const rest = (d.layouts || []).filter(l => l.id !== active.id);
      return { layouts: rest, activeLayoutId: rest[0]?.id || null };
    });
  };
  const setFloor = (patch) => active && onPatch(d => ({
    layouts: (d.layouts || []).map(l => (l.id === active.id ? { ...l, floor: { ...l.floor, ...patch } } : l)),
  }));
  const setTransport = (patch) => active && onPatch(d => ({
    layouts: (d.layouts || []).map(l => (l.id === active.id ? { ...l, transport: { ...DEFAULT_TRANSPORT, ...(l.transport || {}), ...patch } } : l)),
  }));
  /* --- süreçle ilgili hızlı işlemler (atölye sahibi için) --- */
  const assignOperator = (subOpId, operatorId) => onPatch(d => ({
    subOps: (d.subOps || []).map(s => (s.id === subOpId ? { ...s, operatorId: operatorId || null } : s)),
  }));
  const addOperator = async (subOpId) => {
    const name = await promptDialog({ message: 'Yeni çalışanın adı:', defaultValue: '' });
    if (!name) return;
    const id = `o_${uid()}`;
    onPatch(d => ({
      operators: [...(d.operators || []), { id, name }],
      subOps: subOpId ? (d.subOps || []).map(s => (s.id === subOpId ? { ...s, operatorId: id } : s)) : d.subOps,
    }));
  };
  const newOperator = async () => {
    const name = await promptDialog({ message: 'Yeni çalışanın adı:', defaultValue: '' });
    if (!name) return null;
    const id = `o_${uid()}`;
    onPatch(d => ({ operators: [...(d.operators || []), { id, name }] }));
    return id;
  };
  const createOpForItem = (itemId, args) => onPatch(d => {
    const { subOps, id } = insertSubOpAfter(d, args);
    const ls = (d.layouts || []).map(l => (l.id === activeId
      ? { ...l, items: (l.items || []).map(i => (i.id === itemId ? { ...i, subOpId: id, slot: 0 } : i)) } : l));
    return { subOps, layouts: ls };
  });

  const setLayoutField = (patch) => active && onPatch(d => ({
    layouts: (d.layouts || []).map(l => (l.id === active.id ? { ...l, ...patch } : l)),
  }));
  // çoklu seçimde ilk seçili makinenin arıza/bakım ayarını diğer makinelere kopyala
  const copyReliability = () => {
    const sel = items.filter(i => selSet.has(i.id) && (SYMBOLS[i.type]?.kind === 'machine' || SYMBOLS[i.type]?.kind === 'table'));
    const src = sel.find(i => i.reliability);
    if (!src) return;
    commit(its => its.map(i => (selSet.has(i.id) && i.id !== src.id && sel.includes(i) ? { ...i, reliability: { ...src.reliability } } : i)));
  };

  /* ---------- boş durum ---------- */
  if (!active) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="font-display text-xl font-semibold text-ink mb-2">Atölyeni gerçek ölçüde kur</h2>
        <p className="text-sm text-ink-soft mb-2 max-w-lg">
          Makineleri, tezgâhları, ara stok alanlarını ve koridorları zemine yerleştir. Her istasyonu süreçteki
          operasyona bağla; parçaların nereden gelip nerede birleştiğini spagetti haritasında gör, yerleşim
          denemelerini karşılaştır.
        </p>
        <p className="text-xs text-ink-soft mb-6">
          {slots.length > 0 ? `Süreçte yerleştirilecek ${slots.length} istasyon var.` : 'Süreçte henüz istasyon yok — zemini yine de serbestçe kurabilirsin.'}
        </p>
        <div className="flex gap-3">
          {slots.length > 0 && (
            <button onClick={() => startLayout(true)} className="px-5 py-2.5 bg-accent hover:bg-accent-strong text-white rounded-lg text-sm font-medium flex items-center gap-2">
              <Wand2 className="w-4 h-4" /> Otomatik yerleşimle başla
            </button>
          )}
          <button onClick={() => startLayout(false)} className="px-5 py-2.5 border border-line bg-surface hover:bg-surface-2 text-ink rounded-lg text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> Boş zeminle başla
          </button>
        </div>
      </div>
    );
  }

  const single = selection.length === 1 ? items.find(i => i.id === selection[0]) : null;
  const summaries = compareOpen ? layouts.map(l => layoutSummary(data, l)) : [];
  const maxGroupDist = Math.max(1, ...(metrics.perGroup || []).map(g => g.dist));
  const unplacedByGroup = [];
  for (const s of metrics.unplaced) {
    let g = unplacedByGroup.find(x => x.id === s.groupId);
    if (!g) { g = { id: s.groupId, name: s.groupName, color: s.color, slots: [] }; unplacedByGroup.push(g); }
    g.slots.push(s);
  }

  const btn = 'h-9 px-3 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink text-xs font-medium flex items-center gap-1.5 disabled:opacity-40';
  const iconBtn = 'h-9 w-9 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink flex items-center justify-center disabled:opacity-40';

  return (
    <div className="flex flex-col gap-3">
      {/* ÜST ARAÇ ÇUBUĞU */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          Deneme
          <select value={active.id} onChange={e => onPatch(() => ({ activeLayoutId: e.target.value }))}
            className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink">
            {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <button className={btn} onClick={duplicateLayout} title="Bu denemeyi çoğalt, kopyada değişiklik dene"><Copy className="w-4 h-4" /> Çoğalt</button>
        <button className={btn} onClick={() => startLayout(false)}><Plus className="w-4 h-4" /> Boş deneme</button>
        <button className={iconBtn} onClick={renameLayout} aria-label="Yeniden adlandır" title="Yeniden adlandır"><Pencil className="w-4 h-4" /></button>
        <button className={iconBtn} onClick={deleteLayout} aria-label="Denemeyi sil" title="Denemeyi sil"><Trash2 className="w-4 h-4" /></button>
        <button className={`${btn} ${compareOpen ? 'bg-surface-2' : ''}`} onClick={() => setCompareOpen(o => !o)} disabled={layouts.length < 2}><GitCompare className="w-4 h-4" /> Kıyasla</button>
        <div className="w-px h-6 bg-line mx-1" />
        <label className="flex items-center gap-1 text-xs text-ink-soft">
          Zemin
          <input type="number" min={4} max={200} step={0.5} value={floor.w} onChange={e => setFloor({ w: Math.max(4, Number(e.target.value) || floor.w) })}
            className="h-9 w-16 rounded-lg border border-line bg-surface px-2 text-sm text-ink font-mono" aria-label="Zemin genişliği (m)" />
          ×
          <input type="number" min={4} max={200} step={0.5} value={floor.h} onChange={e => setFloor({ h: Math.max(4, Number(e.target.value) || floor.h) })}
            className="h-9 w-16 rounded-lg border border-line bg-surface px-2 text-sm text-ink font-mono" aria-label="Zemin derinliği (m)" />
          m
        </label>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5">
          {[['plan', 'Üstten plan'], ['iso', 'İzometrik']].map(([m, ad]) => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`h-8 px-3 rounded-md text-xs font-medium border ${viewMode === m ? 'bg-accent-tint text-accent-ink border-accent' : 'bg-surface text-ink-soft border-line hover:bg-surface-2'}`}>{ad}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink min-h-9"><input type="checkbox" checked={layers.routes} onChange={e => setLayers(l => ({ ...l, routes: e.target.checked }))} />Spagetti</label>
        <label className="flex items-center gap-1.5 text-xs text-ink min-h-9"><input type="checkbox" checked={layers.dims} onChange={e => setLayers(l => ({ ...l, dims: e.target.checked }))} />Mesafeler</label>
        <button className={iconBtn} onClick={undo} disabled={!hist.current.past.length} aria-label="Geri al" title="Geri al (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
        <button className={iconBtn} onClick={redo} disabled={!hist.current.future.length} aria-label="Yinele" title="Yinele (Ctrl+Y)"><Redo2 className="w-4 h-4" /></button>
        <button className={iconBtn} onClick={fit} aria-label="Zemini sığdır" title="Zemini sığdır"><Maximize className="w-4 h-4" /></button>
        <span className="text-xs font-mono text-ink-soft w-12 text-right">%{Math.round(view.zoom * 100)}</span>
      </div>

      {compareOpen && (
        <div className="rounded-lg border border-line bg-surface overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-ink-soft">
              <tr className="border-b border-line">
                <th className="text-left px-3 py-2 font-semibold">Deneme</th>
                <th className="text-right px-3 py-2 font-semibold">Taşıma / adet</th>
                <th className="text-right px-3 py-2 font-semibold">Kullanılan alan</th>
                <th className="text-right px-3 py-2 font-semibold">m² / kişi</th>
                <th className="text-right px-3 py-2 font-semibold">Kesişme</th>
                <th className="text-right px-3 py-2 font-semibold">Yerleşmemiş</th>
                <th className="text-right px-3 py-2 font-semibold">Sorun</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(s => {
                const best = (k) => s[k] === Math.min(...summaries.map(x => x[k] ?? Infinity));
                const cell = (k, v) => <td className={`text-right px-3 py-2 font-mono ${best(k) ? 'font-bold text-accent' : 'text-ink'}`}>{v}</td>;
                return (
                  <tr key={s.id} className={`border-b border-line last:border-0 ${s.id === active.id ? 'bg-surface-2' : ''}`}>
                    <td className="px-3 py-2">
                      <button className="text-left font-semibold text-ink hover:underline" onClick={() => onPatch(() => ({ activeLayoutId: s.id }))}>{s.name}</button>
                    </td>
                    {cell('totalDist', `${fmt(s.totalDist)} m`)}
                    {cell('usedArea', `${fmt(s.usedArea, 0)} m²`)}
                    {cell('areaPerPerson', s.areaPerPerson == null ? '—' : fmt(s.areaPerPerson))}
                    {cell('crossings', s.crossings)}
                    {cell('unplaced', s.unplaced)}
                    {cell('problems', s.problems)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-3 items-stretch" style={{ height: 'calc(100vh - 230px)', minHeight: 560 }}>
        {/* SOL: PALET */}
        <aside className="w-60 flex-shrink-0 rounded-lg border border-line bg-surface p-3 overflow-y-auto flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold tracking-wider text-ink-soft">YERLEŞMEMİŞ İSTASYON · {metrics.unplaced.length}/{metrics.slotsTotal}</h3>
            </div>
            {metrics.unplaced.length > 0 ? (
              <>
                <button className="h-9 rounded-lg bg-accent hover:bg-accent-strong text-white text-xs font-semibold flex items-center justify-center gap-1.5" onClick={autoPlaceRest}>
                  <Wand2 className="w-4 h-4" /> Kalanları otomatik diz
                </button>
                {unplacedByGroup.map(g => (
                  <div key={g.id || 'x'} className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: g.color }} />{g.name || 'Grup'}</div>
                    {g.slots.map(s => {
                      const type = symbolForSubOp(s.subOp, data.machines || []);
                      const payload = { type, subOpId: s.subOpId, slot: s.slot };
                      return (
                        <button key={`${s.subOpId}#${s.slot}`} draggable
                          onDragStart={e => { e.dataTransfer.setData(MIME, JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'copy'; }}
                          onClick={() => addAtCenter(payload)}
                          title="Zemine sürükle ya da tıkla"
                          className="flex items-center gap-2 min-h-9 px-2 rounded-md border border-line bg-surface hover:bg-surface-2 text-left">
                          <SymbolIcon type={type} size={28} />
                          <span className="text-xs text-ink truncate flex-1">{s.name}{s.slot > 0 ? ` · ${s.slot + 1}` : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </>
            ) : (
              <p className="text-xs text-ink-soft">{metrics.slotsTotal ? 'Tüm istasyonlar yerleşik.' : 'Süreçte istasyon yok.'}</p>
            )}
          </section>
          {CATALOG.map(c => (
            <section key={c.title} className="flex flex-col gap-1.5">
              <h3 className="text-[11px] font-bold tracking-wider text-ink-soft">{c.title.toLocaleUpperCase('tr')}</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {c.types.map(t => (
                  <button key={t} draggable
                    onDragStart={e => { e.dataTransfer.setData(MIME, JSON.stringify({ type: t })); e.dataTransfer.effectAllowed = 'copy'; }}
                    onClick={() => addAtCenter({ type: t })}
                    title={`${SYMBOLS[t].name} · ${fmt(SYMBOLS[t].w)}×${fmt(SYMBOLS[t].h)} m`}
                    className="flex flex-col items-center gap-0.5 py-1.5 rounded-md border border-line bg-surface hover:bg-surface-2">
                    <SymbolIcon type={t} size={36} />
                    <span className="text-[10px] text-ink leading-tight text-center">{SYMBOLS[t].name}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <p className="text-[11px] text-ink-soft leading-relaxed">
            Sürükle-bırak ya da tıkla · <b>R</b> döndür · <b>Ctrl+D</b> çoğalt · ok tuşları 10 cm (Shift 50 cm) · <b>Alt</b> ızgarasız taşı · boşlukta sürükle = çoklu seçim · Ctrl+tekerlek yakınlaştır
          </p>
        </aside>

        {/* ORTA: ZEMİN */}
        {viewMode === 'iso' && (
          <div ref={isoWrapRef} tabIndex={0} onKeyDown={onKeyDown} onKeyUp={onKeyUp} className="flex-1 min-w-0 flex outline-none" aria-label="İzometrik atölye">
            <IsoView data={data} layout={displayLayout} height="100%" minHeight={0}
              overlay={{ routes: layers.routes ? metrics.routes : [], sharedIds: sharedItemIds, routesOpacity: 0.85 }}
              editable={{
                selection,
                onSelect: setSelection,
                focus: () => isoWrapRef.current?.focus({ preventScroll: true }),
                onDragPreview: setDrag,
                onDragEnd: (dx, dy) => {
                  if (dx || dy) finishMove(dx, dy);
                  setDrag(null);
                },
                onDrop: (payload, x, y) => addAt(payload, x, y),
              }} />
          </div>
        )}
        <div ref={wrapRef} tabIndex={0} style={viewMode === 'iso' ? { display: 'none' } : undefined} onKeyDown={onKeyDown} onKeyUp={onKeyUp}
          className="relative flex-1 min-w-0 rounded-lg border border-line bg-[#EEF1F3] overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Atölye zemini">
          <svg ref={svgRef} width="100%" height="100%" className="block touch-none select-none"
            onPointerDown={onBgPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            onDragOver={e => { if (e.dataTransfer.types.includes(MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
            onDrop={onDrop}>
            <LayoutDefs />
            <g transform={`translate(${view.x} ${view.y}) scale(${scale})`}>
              <rect x={0} y={0} width={floor.w} height={floor.h} fill="#FFFFFF" />
              <rect x={0} y={0} width={floor.w} height={floor.h} fill="url(#ly-grid)" />
              <rect x={0} y={0} width={floor.w} height={floor.h} fill="none" stroke={INK} strokeWidth={0.12} />
              {/* ölçü */}
              <text x={floor.w / 2} y={-0.35} textAnchor="middle" fontSize={0.35} fill="#5B6874">{fmt(floor.w)} m</text>
              <text x={-0.35} y={floor.h / 2} textAnchor="middle" fontSize={0.35} fill="#5B6874" transform={`rotate(-90 ${-0.35} ${floor.h / 2})`}>{fmt(floor.h)} m</text>

              {/* altyapı önce (koridor, bant), sonra katılar */}
              {[...displayItems].sort((a, b) => zOrder(a) - zOrder(b)).map(it => (
                <LayoutItem key={it.id} item={it} station={stationInfo(it)} selected={selSet.has(it.id)}
                  onPointerDown={(e) => onItemPointerDown(e, it)} />
              ))}

              {/* meydancı / paylaşımlı operatör halkaları */}
              {(metrics.shared || []).map(sh => {
                const fps = sh.itemIds.map(id => displayItems.find(i => i.id === id)).filter(Boolean).map(itemFootprint);
                if (!fps.length) return null;
                const x0 = Math.min(...fps.map(f => f.x)) - 0.12, y0 = Math.min(...fps.map(f => f.y)) - 0.12;
                const x1 = Math.max(...fps.map(f => f.x + f.w)) + 0.12, y1 = Math.max(...fps.map(f => f.y + f.h)) + 0.12;
                return (
                  <g key={sh.operatorId} style={{ pointerEvents: 'none' }}>
                    <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={0.3} fill="none" stroke="#7A4FB0" strokeWidth={0.06} strokeDasharray="0.2 0.12" />
                    <text x={x0 + 0.1} y={y0 - 0.1} fontSize={0.22} fontWeight="700" fill="#5B3A8A">{opById.get(sh.operatorId)?.name || 'Operatör'} · {sh.itemIds.length} makine</text>
                  </g>
                );
              })}

              {/* spagetti */}
              {layers.routes && (
                <g style={{ pointerEvents: 'none' }}>
                  {metrics.routes.map(r => {
                    const focused = focusSubIds.size === 0 || focusSubIds.has(r.from) || focusSubIds.has(r.to);
                    const pts = r.path.map(p => `${p.x},${p.y}`).join(' ');
                    const a = r.path[r.path.length - 2], b = r.path[r.path.length - 1];
                    const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
                    const t = 0.55;
                    const ax = a.x + (b.x - a.x) * t, ay = a.y + (b.y - a.y) * t;
                    let mid = null;
                    if (layers.dims) {
                      let best = 0;
                      for (let i = 0; i < r.path.length - 1; i++) {
                        const L = Math.abs(r.path[i + 1].x - r.path[i].x) + Math.abs(r.path[i + 1].y - r.path[i].y);
                        if (L >= best) { best = L; mid = { x: (r.path[i].x + r.path[i + 1].x) / 2, y: (r.path[i].y + r.path[i + 1].y) / 2 }; }
                      }
                    }
                    return (
                      <g key={r.key} opacity={focused ? 0.9 : 0.12}>
                        <polyline points={pts} fill="none" stroke={r.color} strokeWidth={focused && focusSubIds.size ? 4 : 2.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                        <path d="M-0.16 -0.13 L0.12 0 L-0.16 0.13 Z" fill={r.color} transform={`translate(${ax} ${ay}) rotate(${ang})`} />
                        {mid && (
                          <text x={mid.x} y={mid.y - 0.08} textAnchor="middle" fontSize={0.2} fontWeight="700" fill={r.color} paintOrder="stroke" stroke="#FFFFFF" strokeWidth={0.06}>{fmt(r.dist)} m</text>
                        )}
                      </g>
                    );
                  })}
                  {metrics.crossings.points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={0.2} fill="none" stroke="#A61B1B" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  ))}
                  {metrics.merges.map(m => (
                    <g key={m.subOpId} transform={`translate(${m.point.x} ${m.point.y - 0.55})`}>
                      <rect x={-0.16} y={-0.16} width={0.32} height={0.32} transform="rotate(45)" fill="#FFFFFF" stroke={INK} strokeWidth={0.05} />
                      <title>{`Birleşme: ${m.name} · ${m.groups.map(g => mainById.get(g)?.name || g).join(' + ')}`}</title>
                    </g>
                  ))}
                </g>
              )}

              {marquee && (
                <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
                  width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
                  fill="rgba(25,122,86,0.08)" stroke="#197A56" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="4 3" />
              )}
            </g>
          </svg>
          {/* ölçek çubuğu */}
          <div className="absolute left-3 bottom-3 flex items-end gap-2 pointer-events-none">
            <div className="flex flex-col gap-0.5">
              <div className="flex">
                <div style={{ width: scale, height: 5, background: INK }} />
                <div style={{ width: scale, height: 5, border: `1px solid ${INK}`, background: '#fff' }} />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-ink-soft" style={{ width: scale * 2 }}><span>0</span><span>1</span><span>2 m</span></div>
            </div>
          </div>
          {drag && (
            <div className="absolute right-3 bottom-3 px-2 py-1 rounded bg-ink text-white text-[11px] font-mono pointer-events-none">
              Δ {fmt(drag.dx, 2)} · {fmt(drag.dy, 2)} m
            </div>
          )}
        </div>

        {/* SAĞ: ÖZELLİK + KARNE */}
        <aside className="w-80 flex-shrink-0 rounded-lg border border-line bg-surface p-3 overflow-y-auto flex flex-col gap-4">
          {single && (
            <Inspector
              it={single} data={data} slots={slots} metrics={metrics} items={items}
              subById={subById} opById={opById} mcById={mcById} mainById={mainById}
              allRoutes={allRoutesInInspector} setAllRoutes={setAllRoutesInInspector}
              onPatch={(p) => patchItem(single.id, p)}
              onAssignOperator={assignOperator} onAddOperator={addOperator} onNewOperator={newOperator}
              onCreateOp={(args) => createOpForItem(single.id, args)}
              onRotate={rotateSelected} onDuplicate={duplicateSelected} onDelete={removeSelected}
            />
          )}
          {selection.length > 1 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-ink">{selection.length} öğe seçili</h3>
              <div className="flex flex-wrap gap-1.5">
                <button className={iconBtn} onClick={() => align('left')} aria-label="Sola hizala" title="Sola hizala"><AlignStartVertical className="w-4 h-4" /></button>
                <button className={iconBtn} onClick={() => align('top')} aria-label="Üste hizala" title="Üste hizala"><AlignStartHorizontal className="w-4 h-4" /></button>
                <button className={iconBtn} onClick={() => align('middle')} aria-label="Ortaya hizala" title="Dikeyde ortala"><AlignCenterHorizontal className="w-4 h-4" /></button>
                <button className={iconBtn} onClick={() => align('distX')} aria-label="Yatay eşit dağıt" title="Yatay eşit dağıt"><AlignHorizontalDistributeCenter className="w-4 h-4" /></button>
                <button className={iconBtn} onClick={() => align('distY')} aria-label="Dikey eşit dağıt" title="Dikey eşit dağıt"><AlignVerticalDistributeCenter className="w-4 h-4" /></button>
                <button className={iconBtn} onClick={() => rotateSelected(90)} aria-label="Döndür" title="Döndür (R)"><RotateCw className="w-4 h-4" /></button>
                <button className={iconBtn} onClick={duplicateSelected} aria-label="Çoğalt" title="Çoğalt (Ctrl+D)"><Copy className="w-4 h-4" /></button>
                <button className={iconBtn} onClick={removeSelected} aria-label="Sil" title="Sil (Delete)"><Trash2 className="w-4 h-4" /></button>
              </div>
              <button className={btn} onClick={copyReliability} title="Arıza/bakım ayarı olan ilk seçili makinenin değerleri diğer seçili makinelere yazılır">Arıza/bakım ayarını seçilenlere kopyala</button>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-ink">Yerleşim karnesi</h3>
            <div className="grid grid-cols-2 gap-2">
              <Tile label="Taşıma / adet" value={`${fmt(metrics.totalDist)} m`} hint={`${metrics.routes.length} akış`} />
              <Tile label="Kullanılan alan" value={`${fmt(metrics.usedArea, 0)} m²`} hint={`zemin ${fmt(metrics.floorArea, 0)} m²`} />
              <Tile label="m² / kişi" value={metrics.areaPerPerson == null ? '—' : fmt(metrics.areaPerPerson)} hint={`${metrics.persons} kişi`} />
              <Tile label="Kesişme" value={metrics.crossings.count} hint="akış yolu" tone={metrics.crossings.count ? 'warn' : null} />
              <Tile label="Ara stok kap." value={metrics.bufferCapacity} hint="adet" />
              <Tile label="Yerleşmemiş" value={`${metrics.unplaced.length}`} hint={`/${metrics.slotsTotal} istasyon`} tone={metrics.unplaced.length ? 'warn' : null} />
            </div>
          </section>

          {metrics.perGroup.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-[11px] font-bold tracking-wider text-ink-soft">PARÇA BAŞINA YOL (1 ADET)</h3>
              {metrics.perGroup.map(g => (
                <div key={g.id} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs"><span className="font-semibold text-ink">{g.name}</span><span className="font-mono text-ink">{fmt(g.dist)} m</span></div>
                  <div className="h-1.5 rounded bg-surface-2"><div className="h-1.5 rounded" style={{ width: `${(g.dist / maxGroupDist) * 100}%`, background: g.color }} /></div>
                </div>
              ))}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-bold tracking-wider text-ink-soft">TAŞIMA (SİMÜLASYONA GİRER)</h3>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Yürüme hızı (m/sn)
                <input type="number" step={0.1} min={0.1} max={3} value={(active.transport || DEFAULT_TRANSPORT).speedMps}
                  onChange={e => { const v = Number(e.target.value); if (v > 0) setTransport({ speedMps: v }); }}
                  className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink font-mono" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Demet (adet)
                <input type="number" step={1} min={1} max={200} value={(active.transport || DEFAULT_TRANSPORT).bundle}
                  onChange={e => { const v = Math.round(Number(e.target.value)); if (v >= 1) setTransport({ bundle: v }); }}
                  className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink font-mono" />
              </label>
            </div>
            <p className="text-[10px] text-ink-soft leading-snug">Parçalar demet dolunca taşınır; yol süresi = mesafe ÷ hız. Ara stok alanının kapasitesi dolunca besleyen istasyon durur.</p>
            <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Kesim / giriş kontrolü
              <select value={active.release?.mode || 'free'} onChange={e => setLayoutField({ release: { ...(active.release || {}), mode: e.target.value } })}
                className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink">
                <option value="free">Sınırsız (her kaynak hep üretir)</option>
                <option value="rate">Sabit hız (saatte N parça)</option>
                <option value="conwip">WIP sınırı (hat çektikçe)</option>
              </select>
            </label>
            {active.release?.mode === 'rate' && (
              <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Her kaynaktan saatte (adet)
                <input type="number" min={1} step={1} value={active.release?.perHour ?? 60}
                  onChange={e => setLayoutField({ release: { ...active.release, perHour: Math.max(1, Number(e.target.value) || 1) } })}
                  className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink font-mono" />
              </label>
            )}
            {active.release?.mode === 'conwip' && (
              <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Her parça hattında en çok (adet)
                <input type="number" min={1} step={1} value={active.release?.wipCap ?? 60}
                  onChange={e => setLayoutField({ release: { ...active.release, wipCap: Math.max(1, Number(e.target.value) || 1) } })}
                  className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink font-mono" />
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Yedek kurulum (dk)
                <input type="number" min={0} step={1} value={(active.transport || DEFAULT_TRANSPORT).spareSetupMin ?? DEFAULT_TRANSPORT.spareSetupMin}
                  onChange={e => setTransport({ spareSetupMin: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink font-mono" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Arıza tohumu
                <input type="number" min={1} step={1} value={active.seed ?? 1}
                  onChange={e => setLayoutField({ seed: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                  className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink font-mono" />
              </label>
            </div>
            <p className="text-[10px] text-ink-soft leading-snug">Tohumu değiştirmek arızaların zamanlamasını değiştirir (başka bir "gün" oynatır); aynı tohum hep aynı sonucu verir.</p>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-bold tracking-wider text-ink-soft">UYARILAR · {metrics.warnings.length}</h3>
            {metrics.warnings.length === 0 && <p className="text-xs text-ink-soft">Sorun yok.</p>}
            {metrics.warnings.slice(0, 12).map((w, i) => (
              <button key={i} onClick={() => w.itemIds.length && setSelection(w.itemIds)}
                className={`text-left text-xs leading-snug px-2.5 py-2 rounded-md flex gap-2 ${w.tone === 'danger' ? 'bg-danger-tint text-danger' : 'bg-warn-tint text-warn'}`}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{w.text}
              </button>
            ))}
            {metrics.warnings.length > 12 && <p className="text-[11px] text-ink-soft">+{metrics.warnings.length - 12} uyarı daha</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

const Z = { aisle: 0, belt: 1, buffer: 2, column: 3, table: 4, machine: 5 };
const zOrder = (it) => Z[SYMBOLS[it.type]?.kind] ?? 3;

function Tile({ label, value, hint, tone }) {
  const c = tone === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 px-2.5 py-2">
      <div className="text-[11px] text-ink-soft">{label}</div>
      <div className={`font-mono text-base font-semibold ${c}`}>{value}</div>
      {hint && <div className="text-[10px] text-ink-soft">{hint}</div>}
    </div>
  );
}

function Inspector({ it, data, slots, metrics, items, subById, opById, mcById, mainById, allRoutes, setAllRoutes, onPatch, onRotate, onDuplicate, onDelete, onAssignOperator, onAddOperator, onNewOperator, onCreateOp }) {
  const sym = SYMBOLS[it.type] || SYMBOLS.duz;
  const s = it.subOpId ? subById.get(it.subOpId) : null;
  const canBind = sym.kind === 'machine' || sym.kind === 'table';
  const taken = new Set(items.filter(i => i.subOpId && i.id !== it.id).map(i => `${i.subOpId}#${i.slot || 0}`));
  const input = 'h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink w-full';
  const typeOptions = canBind ? MACHINE_TABLE_TYPES : sym.kind === 'buffer' ? CATALOG[3].types : [it.type];
  const numField = (label, key, min = 0.1) => (
    <label className="flex flex-col gap-1 text-[11px] text-ink-soft">{label}
      <input type="number" step={0.1} min={min} value={it[key]} className={`${input} font-mono`}
        onChange={e => { const v = Number(e.target.value); if (v >= min) onPatch({ [key]: Math.round(v * 100) / 100 }); }} />
    </label>
  );

  const routeCands = sym.kind === 'buffer'
    ? metrics.routes.filter(r => allRoutes || r.crossGroup || (it.routeKeys || []).includes(r.key))
    : [];
  const toggleRoute = (key) => {
    const cur = new Set(it.routeKeys || []);
    cur.has(key) ? cur.delete(key) : cur.add(key);
    onPatch({ routeKeys: [...cur] });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-ink truncate">{s?.name || it.name || sym.name}</h3>
        <span className="text-[11px] text-ink-soft flex-shrink-0">{sym.name}</span>
      </div>

      {typeOptions.length > 1 && (
        <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Tür
          <select className={input} value={it.type} onChange={e => {
            const n = SYMBOLS[e.target.value];
            onPatch({ type: e.target.value, w: n.w, h: n.h });
          }}>
            {typeOptions.map(t => <option key={t} value={t}>{SYMBOLS[t].name}</option>)}
          </select>
        </label>
      )}

      {canBind && (
        <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Süreçteki istasyon
          <select className={input} value={it.subOpId ? `${it.subOpId}#${it.slot || 0}` : ''}
            onChange={e => {
              if (!e.target.value) { onPatch({ subOpId: undefined, slot: undefined }); return; }
              const [sid, sl] = e.target.value.split('#');
              onPatch({ subOpId: sid, slot: Number(sl) || 0 });
            }}>
            <option value="">— bağlı değil —</option>
            {slots.map(sl => {
              const k = `${sl.subOpId}#${sl.slot}`;
              return <option key={k} value={k} disabled={taken.has(k)}>{sl.groupName ? `${sl.groupName} · ` : ''}{sl.name}{sl.slot ? ` (${sl.slot + 1})` : ''}{taken.has(k) ? ' · yerleşik' : ''}</option>;
            })}
          </select>
        </label>
      )}

      {s && (
        <div className="rounded-lg bg-surface-2/50 px-3 py-2 text-xs flex flex-col gap-1">
          <Row k="Bölüm" v={mainById.get(slots.find(x => x.subOpId === s.id)?.groupId)?.name || '—'} />
          <Row k="Çevrim" v={`${s.cycleTime} sn`} mono />
          <Row k="Makine" v={mcById.get(s.machineId)?.name || (sym.kind === 'table' ? 'makinesiz (masa)' : '—')} />
        </div>
      )}
      {canBind && !it.isSpare && (
        <StaffFields it={it} s={s} data={data} input={input} onPatch={onPatch}
          onAssignOperator={onAssignOperator} onAddOperator={onAddOperator} onNewOperator={onNewOperator} />
      )}
      {canBind && !it.subOpId && !it.isSpare && <NewOpForm data={data} sym={it.type} onCreate={onCreateOp} />}
      {sym.kind === 'person' && (
        <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Ad / görev
          <input className={input} value={it.name || ''} placeholder="ör. Derya · meydancı" onChange={e => onPatch({ name: e.target.value })} />
        </label>
      )}

      {canBind && it.subOpId && (
        <ReliabilityFields rel={it.reliability || {}} onChange={(r) => onPatch({ reliability: r })} />
      )}
      {sym.kind === 'machine' && !it.subOpId && (
        <label className="flex items-center gap-2 text-xs text-ink min-h-9">
          <input type="checkbox" checked={!!it.isSpare} onChange={e => onPatch({ isSpare: e.target.checked || undefined })} />
          Yedek makine (aynı türden arızalı/bakımdaki makinenin yerine geçer)
        </label>
      )}

      {sym.kind === 'buffer' && (
        <>
          <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Ad
            <input className={input} value={it.name || ''} placeholder={sym.name} onChange={e => onPatch({ name: e.target.value })} />
          </label>
          {numField('Kapasite (adet)', 'capacity', 1)}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-ink-soft">Bu alandan geçen akışlar</span>
              <label className="flex items-center gap-1 text-[11px] text-ink-soft"><input type="checkbox" checked={allRoutes} onChange={e => setAllRoutes(e.target.checked)} />tümü</label>
            </div>
            {routeCands.length === 0 && <p className="text-[11px] text-ink-soft">Bölümler arası akış yok ya da istasyonlar yerleşmemiş.</p>}
            <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
              {routeCands.map(r => (
                <label key={r.key} className="flex items-center gap-2 text-xs text-ink min-h-7">
                  <input type="checkbox" checked={(it.routeKeys || []).includes(r.key)} onChange={() => toggleRoute(r.key)} />
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: r.color }} />
                  <span className="truncate">{subById.get(r.from)?.name || r.from} → {subById.get(r.to)?.name || r.to}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        {numField('Genişlik (m)', 'w')}
        {numField('Derinlik (m)', 'h')}
      </div>

      <div className="flex gap-1.5">
        <button className="h-9 w-9 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink flex items-center justify-center" onClick={() => onRotate(-90)} aria-label="Sola döndür" title="Sola döndür (Shift+R)"><RotateCcw className="w-4 h-4" /></button>
        <button className="h-9 w-9 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink flex items-center justify-center" onClick={() => onRotate(90)} aria-label="Sağa döndür" title="Sağa döndür (R)"><RotateCw className="w-4 h-4" /></button>
        <div className="flex-1" />
        <button className="h-9 px-3 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink text-xs flex items-center gap-1.5" onClick={onDuplicate}><Copy className="w-4 h-4" /> Çoğalt</button>
        <button className="h-9 px-3 rounded-lg border border-line bg-surface hover:bg-danger-tint text-danger text-xs flex items-center gap-1.5" onClick={onDelete}><Trash2 className="w-4 h-4" /> Sil</button>
      </div>
    </section>
  );
}

/* İstasyondaki kişiler: operatör (bağlıysa süreçteki operasyonun çalışanı, değilse
   istasyonun kendi çalışanı) + yardımcılar (ürün çevirme vb. için ikinci kişi).
   Yardımcılar şimdilik simülasyon hızını değiştirmez; kişi sayısına ve alana girer. */
function StaffFields({ it, s, data, input, onPatch, onAssignOperator, onAddOperator, onNewOperator }) {
  const ops = (data.operators || []).filter((o, i, arr) => arr.findIndex(x => x.id === o.id) === i);
  const helpers = it.helpers || [];
  const setHelper = (i, patch) => onPatch({ helpers: helpers.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  const smallBtn = 'h-9 px-2.5 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink text-xs font-medium flex-shrink-0';
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line px-3 py-2">
      <div className="text-[11px] font-bold tracking-wider text-ink-soft">ÇALIŞANLAR · {1 + helpers.length} KİŞİ</div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-soft">Operatör</span>
        <div className="flex gap-1.5">
          <select className={`${input} flex-1 min-w-0`} aria-label="Operatör"
            value={(s ? s.operatorId : it.operatorId) || ''}
            onChange={e => (s ? onAssignOperator(s.id, e.target.value) : onPatch({ operatorId: e.target.value || undefined }))}>
            <option value="">— atanmamış —</option>
            {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button className={smallBtn} title="Yeni çalışan oluştur ve buraya ata"
            onClick={async () => { if (s) onAddOperator(s.id); else { const id = await onNewOperator(); if (id) onPatch({ operatorId: id }); } }}>+ Yeni</button>
        </div>
      </div>
      {helpers.map((h, i) => (
        <div key={h.id || i} className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-soft">Yardımcı {i + 1}</span>
          <div className="flex gap-1.5">
            <select className={`${input} flex-1 min-w-0`} aria-label={`Yardımcı ${i + 1}`} value={h.operatorId || ''}
              onChange={e => setHelper(i, { operatorId: e.target.value || null })}>
              <option value="">{h.name ? `${h.name} (listede yok)` : '— atanmamış —'}</option>
              {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button className={smallBtn} aria-label={`Yardımcı ${i + 1} kaldır`} title="Yardımcıyı kaldır"
              onClick={() => onPatch({ helpers: helpers.filter((_, j) => j !== i) })}>✕</button>
          </div>
        </div>
      ))}
      <button className={`${smallBtn} self-start`} onClick={() => onPatch({ helpers: [...helpers, { id: `h_${Math.random().toString(36).slice(2, 8)}`, name: '', operatorId: null }] })}>
        + Yardımcı kişi ekle
      </button>
      <p className="text-[10px] text-ink-soft leading-snug">Serbest çalışanı paletten ya da zeminden bu istasyonun üstüne sürükleyince de yardımcı olur. Aynı çalışanı iki istasyona atarsan meydancı görünür.</p>
    </div>
  );
}

/* Süreçte olmayan bir iş için boş masaya/makineye yeni operasyon aç — akışta
   seçilen adımın ARKASINA girer (ör. etiket takma, ara kontrol). */
function NewOpForm({ data, sym, onCreate }) {
  const mains = [...(data.mainOps || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const [open, setOpen] = useState(false);
  const [mainOpId, setMainOpId] = useState(mains[0]?.id || '');
  const [afterId, setAfterId] = useState('');
  const [name, setName] = useState('');
  const [ct, setCt] = useState(30);
  const input = 'h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink w-full';
  const members = (data.subOps || []).filter(s => (s.parentId ?? s.mainOpId) === mainOpId && s.kind !== 'input' && s.kind !== 'output');
  if (!mains.length) return <p className="text-[11px] text-ink-soft">Süreçte bölüm yok — önce Akış sekmesinde bir bölüm oluştur.</p>;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-9 rounded-lg border border-dashed border-accent text-accent-ink bg-accent-tint/40 hover:bg-accent-tint text-xs font-semibold">
        + Bu masaya süreçte yeni iş ekle
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line px-3 py-2">
      <div className="text-[11px] font-bold tracking-wider text-ink-soft">YENİ İŞ</div>
      <label className="flex flex-col gap-1 text-[11px] text-ink-soft">İşin adı
        <input className={input} value={name} placeholder="ör. Etiket takma" onChange={e => setName(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Bölüm
          <select className={input} value={mainOpId} onChange={e => { setMainOpId(e.target.value); setAfterId(''); }}>
            {mains.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Süre (sn)
          <input type="number" min={1} className={`${input} font-mono`} value={ct} onChange={e => setCt(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Akışta hangi işten sonra?
        <select className={input} value={afterId} onChange={e => setAfterId(e.target.value)}>
          <option value="">Bölümün başına</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <button disabled={!name.trim()} onClick={() => { onCreate({ mainOpId, afterId: afterId || null, name: name.trim(), cycleTime: Number(ct) || 30, type: OPTYPE_OF_SYMBOL[sym] || 'DESTEK' }); setOpen(false); setName(''); }}
          className="h-9 flex-1 rounded-lg bg-accent hover:bg-accent-strong text-white text-xs font-semibold disabled:opacity-40">Ekle ve bağla</button>
        <button onClick={() => setOpen(false)} className="h-9 px-3 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink text-xs">Vazgeç</button>
      </div>
    </div>
  );
}

/* Vardiya 08:00'de başlar; bakım saati vardiya başından dakika olarak saklanır. */
const SHIFT_START_MIN = 8 * 60;
const toClock = (min) => {
  if (min == null || min === '') return '';
  const t = SHIFT_START_MIN + Number(min);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(Math.round(t % 60)).padStart(2, '0')}`;
};
const fromClock = (v) => {
  if (!v) return undefined;
  const [h, m] = v.split(':').map(Number);
  return Math.max(0, h * 60 + (m || 0) - SHIFT_START_MIN);
};
function ReliabilityFields({ rel, onChange }) {
  const input = 'h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink w-full font-mono';
  const num = (label, key, step = 1) => (
    <label className="flex flex-col gap-1 text-[11px] text-ink-soft">{label}
      <input type="number" min={0} step={step} value={rel[key] ?? ''} placeholder="—" className={input}
        onChange={e => onChange({ ...rel, [key]: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} />
    </label>
  );
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line px-3 py-2">
      <div className="text-[11px] font-bold tracking-wider text-ink-soft">ARIZA &amp; BAKIM</div>
      <div className="grid grid-cols-2 gap-2">
        {num('Arızalar arası ort. (saat)', 'mtbfH', 0.5)}
        {num('Onarım süresi (dk)', 'mttrMin')}
        <label className="flex flex-col gap-1 text-[11px] text-ink-soft">Bakım saati
          <input type="time" value={toClock(rel.maintAtMin)} className={input}
            onChange={e => onChange({ ...rel, maintAtMin: fromClock(e.target.value) })} />
        </label>
        {num('Bakım süresi (dk)', 'maintDurMin')}
      </div>
      <p className="text-[10px] text-ink-soft leading-snug">Boş bırakılan alan hesaba girmez. Arızalar tohuma bağlı rastgele gelir; bakım vardiyada bir kez, verilen saatte yapılır.</p>
    </div>
  );
}

const Row = ({ k, v, mono }) => (
  <div className="flex justify-between gap-2"><span className="text-ink-soft">{k}</span><span className={`text-ink font-medium truncate ${mono ? 'font-mono' : ''}`}>{v}</span></div>
);
