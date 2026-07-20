'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus, Trash2, Edit2, X, Save, Settings as SettingsIcon,
  Cog, User, Users, Wrench, Network, BarChart3, Layers,
  AlertTriangle, RefreshCw, GripVertical, Package, Activity, ChevronRight,
  Move, Link2, Copy, FolderOpen, Sparkles, MousePointer2, Check,
  Play, Pause, RotateCcw, Clock, TrendingUp, Zap, CheckCircle2,
  Download, Upload, FileSpreadsheet
} from 'lucide-react';
import { downloadTemplate, parseSimFile, validateRows, buildSimDataFromRows } from '@/lib/pes/sim-excel';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine, Cell, LabelList
} from 'recharts';

/* ============================================================
   Depolama anahtarı — verileri tarayıcıda kalıcı tutar
   ============================================================ */
const STORAGE_KEY = 'atolye_sim_v3';
const uid = () => Math.random().toString(36).slice(2, 10);

/* İş akışı renk paleti */
const PALETTE = ['#0891b2', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0d9488'];

/* Operasyon tipi seçenekleri */
const OP_TYPES = [
  'DİKİM', 'OVERLOK', 'ÇİMA', 'REÇME', 'PUNTEREZ',
  'OTOMAT', 'ÜTÜ', 'KESİM', 'KONTROL', 'TEMİZLİK', 'AKSESUAR', 'DESTEK'
];

/* ============================================================
   İÇ İÇE (recursive) AKIŞ — paylaşılan traversal yardımcıları
   Ana op'lar sanal kök (ROOT_ID) altında; alt op'lar parentId ile
   bir ana op'a VEYA başka bir alt op'a bağlanır (sınırsız derinlik).
   Eski veri: alt op'ta parentId yoksa mainOpId kullanılır.
   ============================================================ */
const ROOT_ID = '__root__';
const subParent = (s) => s.parentId ?? s.mainOpId;
const childNodes = (data, cid) =>
  cid === ROOT_ID ? (data.mainOps || []) : (data.subOps || []).filter(s => subParent(s) === cid);
const isMainNode = (data, id) => (data.mainOps || []).some(m => m.id === id);
const findNode = (data, id) =>
  (data.mainOps || []).find(m => m.id === id) || (data.subOps || []).find(s => s.id === id) || null;
// Bir konteynerin (alt op olabilir) ait olduğu kök ana op id'si
const rootMainId = (data, cid) => {
  let c = cid, guard = 0;
  while (c && c !== ROOT_ID && guard++ < 100) {
    if (isMainNode(data, c)) return c;
    const s = (data.subOps || []).find(x => x.id === c);
    c = s ? subParent(s) : ROOT_ID;
  }
  return null;
};
// id'nin tüm alt-ağaç torunları (kendisi hariç)
const descendantIds = (data, id) => {
  const out = [];
  const walk = (cid) => childNodes(data, cid).forEach(k => { out.push(k.id); walk(k.id); });
  walk(id);
  return out;
};

/* Kalıcılık: varsa gömülü window.storage, yoksa localStorage.
   (Bu Next.js uygulamasında window.storage tanımsız olduğundan localStorage'a düşer.) */
const flowStore = {
  async get(k) {
    try {
      if (typeof window !== 'undefined' && window.storage?.get) return await window.storage.get(k);
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
      return v == null ? null : { value: v };
    } catch { return null; }
  },
  async set(k, v) {
    try {
      if (typeof window !== 'undefined' && window.storage?.set) return await window.storage.set(k, v);
      if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
    } catch { /* yok say */ }
  },
};

/* Boş çalışma sayfası — temel akış zinciri kurulu, içler boş.
   Kullanıcı kart isimlerini düzenleyebilir, alt operasyonları Excel'den ya da
   manuel olarak doldurur. Sıfırla butonu da bu yapıya döner. */
const DEFAULT_DATA = {
  mainOps: [
    { id: 'mo_hazir', name: 'Hazırlık',   color: '#7c3aed', order: 0, nextIds: ['mo_on', 'mo_arka'], x:  60, y: 200 },
    { id: 'mo_on',    name: 'Ön Bant',    color: '#2563eb', order: 1, nextIds: ['mo_mont'],          x: 340, y: 100 },
    { id: 'mo_arka',  name: 'Arka Bant',  color: '#16a34a', order: 2, nextIds: ['mo_mont'],          x: 340, y: 300 },
    { id: 'mo_mont',  name: 'Montaj',     color: '#d97706', order: 3, nextIds: ['mo_yik'],           x: 620, y: 200 },
    { id: 'mo_yik',   name: 'Yıkama',     color: '#0891b2', order: 4, nextIds: ['mo_ukp'],           x: 900, y: 200 },
    { id: 'mo_ukp',   name: 'UKP',        color: '#dc2626', order: 5, nextIds: [],                   x:1180, y: 200 },
  ],
  subOps: [],
  machines: [],
  operators: [],
  settings: { netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 },
  scenarios: [],
  meta: {},
};

export default function AtolyePlatform() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('flow');
  const [editSubOp, setEditSubOp] = useState(null);      // form state for sub-op edit modal
  const [editMainOp, setEditMainOp] = useState(null);    // form state for main-op edit modal
  const [showSettings, setShowSettings] = useState(false);
  const [drag, setDrag] = useState(null);                // { type, id }
  const [dragOver, setDragOver] = useState(null);        // { type, id } drop target

  /* ---------- Excel import state ---------- */
  const [importPreview, setImportPreview] = useState(null);  // { validated: [...], fileName }
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const { rows, meta } = await parseSimFile(file);
      const allowedAnaGruplar = (data.mainOps || []).map(m => m.name).filter(Boolean);
      const validated = validateRows(rows, allowedAnaGruplar);
      setImportPreview({ validated, meta: meta || {}, fileName: file.name });
    } catch (err) {
      alert('Dosya okunamadı: ' + (err?.message || err));
    } finally {
      setImporting(false);
      e.target.value = '';  // aynı dosyayı tekrar seçebilmek için
    }
  }

  function applyImport(mode) {
    if (!importPreview) return;
    const validRows = importPreview.validated.filter(v => v.ok);
    if (validRows.length === 0) { alert('Geçerli satır yok'); return; }

    // Akış sekmesinde tanımlı mainOps her durumda korunur — Excel sadece subOps doldurur
    const existing = mode === 'replace'
      ? { machines: [], operators: [], mainOps: data.mainOps }
      : { machines: data.machines, operators: data.operators, mainOps: data.mainOps };
    const built = buildSimDataFromRows(validRows, existing);

    setData(prev => ({
      ...prev,
      mainOps: built.mainOps,
      subOps: built.subOps,
      machines: built.machines,
      operators: built.operators,
      meta: { ...(prev.meta || {}), ...(importPreview.meta || {}) },
    }));
    setImportPreview(null);
    // Simülasyonu sıfırla ki eski state'ten etkilenmesin
    setSimState(initialSimState());
    setTab('ops');
  }

  /* ---------- Simülasyon state ---------- */
  const initialSimState = () => ({
    running: false,
    speed: 10,          // 1x, 10x, 60x
    elapsed: 0,         // sim saniye
    pending: {},        // { [subOpId]: { [prevSubOpId]: count } } — merge için per-predecessor
    inProgress: {},     // { [subOpId]: { remainingSec, totalSec } }
    completed: {},      // { [subOpId]: count } — o istasyondan geçen parça sayısı
    exited: 0,          // hattın sonundan çıkan tamamlanmış parça (garment)
    history: [{ t: 0, exited: 0 }],  // çıktı trendi
    peakQueue: {},      // { [subOpId]: maxQueue } — en fazla ne kadar biriktiği
  });
  const [simState, setSimState] = useState(initialSimState);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const simStartSim  = () => setSimState(s => ({ ...s, running: true }));
  const simPauseSim  = () => setSimState(s => ({ ...s, running: false }));
  const simResetSim  = () => setSimState(initialSimState());
  const simSetSpeed  = (sp) => setSimState(s => ({ ...s, speed: sp }));

  /* Tek fiziksel adım — state'i MUTATE eder, yeniden ata */
  function advanceSimStep(state, d, dt) {
    const maxSec = (d.settings?.netMinutes || 540) * 60;
    state.elapsed = Math.min(state.elapsed + dt, maxSec);

    // prev map: op.id → [predecessor id'leri]
    const prevMap = {};
    for (const op of d.subOps) {
      if (!prevMap[op.id]) prevMap[op.id] = [];
    }
    for (const op of d.subOps) {
      for (const nId of (op.nextIds || [])) {
        if (!prevMap[nId]) prevMap[nId] = [];
        prevMap[nId].push(op.id);
      }
    }

    // 1) İşlenen parçaları ilerlet ve biterse sonraki istasyonlara geçir
    const justDone = [];
    for (const opId of Object.keys(state.inProgress)) {
      state.inProgress[opId].remainingSec -= dt;
      if (state.inProgress[opId].remainingSec <= 0) justDone.push(opId);
    }
    for (const opId of justDone) {
      delete state.inProgress[opId];
      state.completed[opId] = (state.completed[opId] || 0) + 1;
      const op = d.subOps.find(x => x.id === opId);
      if (!op || !op.nextIds || op.nextIds.length === 0) {
        state.exited += 1;
      } else {
        for (const nId of op.nextIds) {
          if (!state.pending[nId]) state.pending[nId] = {};
          state.pending[nId][opId] = (state.pending[nId][opId] || 0) + 1;
        }
      }
    }

    // 2) Boşta kalan istasyonları başlat
    for (const op of d.subOps) {
      if (state.inProgress[op.id]) continue;
      if (!op.cycleTime || op.cycleTime <= 0) continue;
      const prevs = prevMap[op.id] || [];
      let canStart = false;
      if (prevs.length === 0) {
        canStart = true;
      } else {
        const pend = state.pending[op.id] || {};
        canStart = prevs.every(pid => (pend[pid] || 0) >= 1);
      }
      if (canStart) {
        if (prevs.length > 0) {
          if (!state.pending[op.id]) state.pending[op.id] = {};
          for (const pid of prevs) state.pending[op.id][pid] = (state.pending[op.id][pid] || 0) - 1;
        }
        state.inProgress[op.id] = { remainingSec: op.cycleTime, totalSec: op.cycleTime };
      }
    }

    // 3) Zirve kuyruk boyutlarını güncelle
    for (const op of d.subOps) {
      const pend = state.pending[op.id] || {};
      const q = Object.values(pend).reduce((a, v) => a + (v > 0 ? v : 0), 0);
      if (q > (state.peakQueue[op.id] || 0)) state.peakQueue[op.id] = q;
    }

    return state;
  }

  /* Bir state kopyası hazırla (her key için derin) */
  function cloneSimState(prev) {
    const inProgress = {};
    for (const k of Object.keys(prev.inProgress)) inProgress[k] = { ...prev.inProgress[k] };
    const completed = { ...prev.completed };
    const pending = {};
    for (const k of Object.keys(prev.pending)) pending[k] = { ...prev.pending[k] };
    const peakQueue = { ...prev.peakQueue };
    return { ...prev, inProgress, completed, pending, peakQueue, history: [...prev.history] };
  }

  /* Simülasyon adım döngüsü — yüksek hız için tick içi iterasyon */
  useEffect(() => {
    if (!simState.running) return;
    const TICK_MS = 100;
    const MAX_DT = 5; // fizik kararlılığı için
    const id = setInterval(() => {
      setSimState(prev => {
        if (!prev.running) return prev;
        const d = dataRef.current;
        const maxSec = (d.settings?.netMinutes || 540) * 60;
        const speed = prev.speed;
        const totalTime = (TICK_MS / 1000) * speed;
        const steps = Math.max(1, Math.min(Math.ceil(totalTime / MAX_DT), 200));
        const dt = Math.min(totalTime / steps, MAX_DT);

        const state = cloneSimState(prev);
        for (let i = 0; i < steps; i++) {
          if (state.elapsed >= maxSec) break;
          advanceSimStep(state, d, dt);
        }

        // History kaydı
        const lastT = state.history.length > 0 ? state.history[state.history.length - 1].t : -9999;
        if (state.elapsed - lastT >= 60) {
          state.history.push({ t: state.elapsed, exited: state.exited });
        }

        const running = state.elapsed < maxSec;
        state.running = running;
        if (!running && lastT !== state.elapsed) {
          state.history.push({ t: state.elapsed, exited: state.exited });
        }
        return state;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [simState.running, simState.speed]);

  /* Hızlı Bitir — vardiyanın sonuna koş, tek setSimState */
  const simFastForward = () => {
    setSimState(prev => {
      const d = dataRef.current;
      const maxSec = (d.settings?.netMinutes || 540) * 60;
      const state = cloneSimState(prev);
      state.running = true;
      const DT = 5;
      const maxIterations = Math.ceil((maxSec - state.elapsed) / DT) + 10;
      for (let i = 0; i < maxIterations; i++) {
        if (state.elapsed >= maxSec) break;
        advanceSimStep(state, d, DT);
        // Her 60 sim saniyesinde bir history noktası
        const lastT = state.history.length > 0 ? state.history[state.history.length - 1].t : -9999;
        if (state.elapsed - lastT >= 60) {
          state.history.push({ t: state.elapsed, exited: state.exited });
        }
      }
      state.running = false;
      // Son nokta
      const lastT = state.history.length > 0 ? state.history[state.history.length - 1].t : -1;
      if (lastT !== state.elapsed) {
        state.history.push({ t: state.elapsed, exited: state.exited });
      }
      return state;
    });
  };

  /* ---------- Kalıcı veri: yükle ve kaydet ---------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await flowStore.get(STORAGE_KEY);
        if (res && res.value) setData(JSON.parse(res.value));
      } catch (e) { /* ilk kullanım */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try { await flowStore.set(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
    })();
  }, [data, loaded]);

  /* ---------- Hesaplamalar ---------- */
  const calc = useMemo(() => {
    const netMin = data.settings.netMinutes;
    const eff = data.settings.efficiency;
    const pfd = data.settings.pfd;
    const demand = data.settings.demand || 1;
    const taktTimeMin = netMin / demand;       // dk / adet
    const taktTimeSec = taktTimeMin * 60;      // sn / adet

    // --- Recursive throughput motoru ---
    // Her düğüm: yaprak ise çevrim süresinden kapasite; konteyner ise alt-grafın çıktısı.
    // Birleşme (join) tipi düğüme gelen çoklu girişi belirler: 'AND' → min, 'DUP' → toplam.
    const cap = {};       // düğüm id → kapasite (adet/vardiya)
    const thru = {};      // düğüm id → bulunduğu konteyner içindeki geçirgenlik
    const bottleneckByContainer = {}; // konteyner id → en yavaş çocuk id
    const totalCycleOf = {};          // konteyner id → doğrudan yaprak çocuk çevrim toplamı (sn)

    const leafCap = (node) => {
      const cyc = node.cycleTime || 0;
      if (cyc <= 0) return 0;
      const smv = (cyc / 60) * (1 + pfd);
      const stations = node.stationCount || 1;
      return smv > 0 ? (netMin * eff * stations) / smv : 0;
    };

    const computeContainer = (cid) => {
      const kids = childNodes(data, cid);
      kids.forEach(k => {
        const isContainer = childNodes(data, k.id).length > 0;
        cap[k.id] = isContainer ? computeContainer(k.id) : leafCap(k);
      });
      totalCycleOf[cid] = kids.reduce(
        (a, k) => a + (childNodes(data, k.id).length > 0 ? 0 : (k.cycleTime || 0)), 0);
      if (kids.length === 0) return 0;

      const idset = new Set(kids.map(k => k.id));
      const incoming = {}; kids.forEach(k => { incoming[k.id] = []; });
      kids.forEach(k => (k.nextIds || []).forEach(n => { if (idset.has(n)) incoming[n].push(k.id); }));
      // Kahn topolojik sıra
      const indeg = {}; kids.forEach(k => { indeg[k.id] = incoming[k.id].length; });
      const queue = kids.filter(k => indeg[k.id] === 0).map(k => k.id);
      const order = [];
      while (queue.length) {
        const id = queue.shift(); order.push(id);
        const node = kids.find(k => k.id === id);
        (node.nextIds || []).forEach(n => { if (idset.has(n)) { indeg[n]--; if (indeg[n] === 0) queue.push(n); } });
      }
      kids.forEach(k => { if (!order.includes(k.id)) order.push(k.id); }); // döngü koruması

      const t = {};
      order.forEach(id => {
        const node = kids.find(k => k.id === id);
        const preds = incoming[id];
        let inRate;
        if (preds.length === 0) inRate = Infinity;              // kaynak
        else {
          const join = node.joinType || 'AND';
          const vals = preds.map(p => t[p] ?? 0);
          inRate = join === 'DUP' ? vals.reduce((a, b) => a + b, 0) : Math.min(...vals);
        }
        t[id] = Math.min(cap[id] || 0, inRate);
        thru[id] = t[id];
      });
      // Çıkış = sink'lerin (giden kenarı olmayan) min'i (senkron tamamlama)
      const sinks = kids.filter(k => !(k.nextIds || []).some(n => idset.has(n)));
      const containerThru = sinks.length ? Math.min(...sinks.map(k => t[k.id] || 0)) : 0;
      // Darboğaz = en düşük geçirgenlikli çocuk
      let bn = null, bnv = Infinity;
      kids.forEach(k => { const v = t[k.id] ?? 0; if (v < bnv) { bnv = v; bn = k.id; } });
      bottleneckByContainer[cid] = bn;
      return containerThru;
    };

    const lineCapacity = computeContainer(ROOT_ID);
    const bottleneckId = bottleneckByContainer[ROOT_ID];

    // OpsView / DashboardView uyumu için perMain
    const perMain = (data.mainOps || []).map(mo => {
      const subs = (data.subOps || []).filter(s => subParent(s) === mo.id);
      const totalCycle = subs.reduce((a, s) => a + (childNodes(data, s.id).length > 0 ? 0 : (s.cycleTime || 0)), 0);
      const totalCycleMin = totalCycle / 60;
      const smv = totalCycleMin * (1 + pfd);
      const stations = subs.length || 1;
      const capacity = cap[mo.id] ?? 0;
      const slowest = subs.reduce((max, s) => ((s.cycleTime || 0) > (max?.cycleTime || 0) ? s : max), null);
      return { mainOp: mo, subs, totalCycle, totalCycleMin, smv, stations, capacity, slowest };
    });

    return {
      perMain, taktTime: taktTimeMin, taktTimeMin, taktTimeSec, lineCapacity, bottleneckId,
      netMin, eff, demand, cap, thru, bottleneckByContainer, totalCycleOf,
    };
  }, [data]);

  /* ---------- Yardımcı güncelleme fonksiyonları ---------- */
  const updateSettings = (patch) => setData(d => ({ ...d, settings: { ...d.settings, ...patch } }));

  /* ---------- Akış düzenleme yardımcıları ---------- */
  const updateMainOpPosition = (id, x, y) => {
    setData(d => ({ ...d, mainOps: d.mainOps.map(m => m.id === id ? { ...m, x, y } : m) }));
  };
  const updateMainOpConnections = (fromId, nextIds) => {
    setData(d => ({ ...d, mainOps: d.mainOps.map(m => m.id === fromId ? { ...m, nextIds } : m) }));
  };
  const autoLayout = () => {
    // Topolojik sıralama tabanlı yatay otomatik yerleşim
    const ops = data.mainOps;
    const inDeg = Object.fromEntries(ops.map(m => [m.id, 0]));
    ops.forEach(m => m.nextIds.forEach(n => { if (inDeg[n] !== undefined) inDeg[n]++; }));
    const levels = {};
    let q = ops.filter(m => inDeg[m.id] === 0).map(m => m.id);
    let lvl = 0;
    const visited = {};
    while (q.length) {
      const next = [];
      q.forEach(id => {
        if (visited[id]) return;
        visited[id] = true;
        levels[id] = lvl;
        const m = ops.find(o => o.id === id);
        m?.nextIds.forEach(n => { if (!visited[n]) next.push(n); });
      });
      q = [...new Set(next)];
      lvl++;
    }
    const byLevel = {};
    Object.entries(levels).forEach(([id, l]) => { (byLevel[l] = byLevel[l] || []).push(id); });
    const newOps = ops.map(m => {
      const l = levels[m.id] ?? 0;
      const siblings = byLevel[l] || [m.id];
      const idx = siblings.indexOf(m.id);
      const centerY = 50 + idx * 140;
      return { ...m, x: 60 + l * 240, y: centerY };
    });
    setData(d => ({ ...d, mainOps: newOps }));
  };

  /* ---------- Senaryo (Model) yönetimi ---------- */
  const saveScenario = (name, opts = {}) => {
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const sc = {
      id: `sc_${uid()}`,
      name: name || data.meta?.modelAdi || `Model ${(data.scenarios?.length || 0) + 1}`,
      createdAt: new Date().toISOString(),
      snapshot: {
        mainOps:   clone(data.mainOps),
        subOps:    clone(data.subOps),
        machines:  clone(data.machines || []),
        operators: clone(data.operators || []),
        meta:      clone(data.meta || {}),
      },
      // Simülasyon özet skoru (eğer simülasyon çalıştıysa)
      result: opts.includeResult ? {
        elapsed: simState.elapsed,
        exited: simState.exited,
        peakQueue: { ...simState.peakQueue },
        completed: { ...simState.completed },
      } : null,
    };
    setData(d => ({ ...d, scenarios: [...(d.scenarios || []), sc] }));
    return sc;
  };
  const loadScenario = (id) => {
    const sc = (data.scenarios || []).find(s => s.id === id);
    if (!sc) return;
    if (!confirm(`"${sc.name}" modeli yüklenecek. Mevcut değişiklikler kaybolacak. Devam?`)) return;
    setData(d => ({
      ...d,
      mainOps:   sc.snapshot.mainOps,
      subOps:    sc.snapshot.subOps,
      machines:  sc.snapshot.machines  || d.machines,
      operators: sc.snapshot.operators || d.operators,
      meta:      sc.snapshot.meta      || {},
    }));
    setSimState(initialSimState());  // simülasyon state'ini sıfırla
  };
  const deleteScenario = (id) => {
    setData(d => ({ ...d, scenarios: (d.scenarios || []).filter(s => s.id !== id) }));
  };
  const duplicateScenario = (id) => {
    const sc = (data.scenarios || []).find(s => s.id === id);
    if (!sc) return;
    const copy = { ...sc, id: `sc_${uid()}`, name: sc.name + ' (kopya)', createdAt: new Date().toISOString() };
    setData(d => ({ ...d, scenarios: [...(d.scenarios || []), copy] }));
  };
  const renameScenario = (id, newName) => {
    setData(d => ({
      ...d,
      scenarios: (d.scenarios || []).map(s => s.id === id ? { ...s, name: newName } : s),
    }));
  };

  const addMainOp = () => {
    const order = data.mainOps.length;
    const color = PALETTE[order % PALETTE.length];
    // Grid-benzeri yerleşim: yan yana 4'erli, aşağı doğru
    const col = order % 4;
    const row = Math.floor(order / 4);
    const mo = {
      id: `mo_${uid()}`, name: `Yeni Ana Op ${order + 1}`, color, order, nextIds: [],
      x: 60 + col * 260, y: 80 + row * 180
    };
    setData(d => ({ ...d, mainOps: [...d.mainOps, mo] }));
    setEditMainOp(mo);
  };

  const saveMainOp = (mo) => {
    setData(d => ({ ...d, mainOps: d.mainOps.map(x => x.id === mo.id ? mo : x) }));
    setEditMainOp(null);
  };

  const deleteMainOp = (id) => {
    if (!confirm('Bu ana operasyonu ve içindeki tüm alt operasyonları silmek istiyor musunuz?')) return;
    setData(d => ({
      ...d,
      mainOps: d.mainOps.filter(x => x.id !== id).map(m => ({ ...m, nextIds: m.nextIds.filter(n => n !== id) })),
      subOps: d.subOps.filter(s => s.mainOpId !== id)
    }));
  };

  // containerId: bir ana op VEYA başka bir alt op (iç içe). pos: opsiyonel konum.
  const addSubOp = (containerId, pos) => {
    const siblings = childNodes(data, containerId);
    const maxOrder = siblings.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
    const n = siblings.length;
    const so = {
      id: `s_${uid()}`,
      parentId: containerId,
      mainOpId: rootMainId(data, containerId) || containerId,   // OpsView/geri uyumluluk
      name: 'Yeni Alt Operasyon',
      cycleTime: 5, machineId: null, operatorId: null, stationCount: 1,
      type: 'DİKİM', order: maxOrder + 1, nextIds: [], joinType: 'AND',
      x: pos?.x ?? (60 + (n % 4) * 210),
      y: pos?.y ?? (60 + Math.floor(n / 4) * 120),
    };
    setData(d => ({ ...d, subOps: [...d.subOps, so] }));
    setEditSubOp(so);
  };

  const saveSubOp = (so) => {
    setData(d => ({ ...d, subOps: d.subOps.map(x => x.id === so.id ? so : x) }));
    setEditSubOp(null);
  };

  const deleteSubOp = (id) => {
    setData(d => {
      const rm = new Set([id, ...descendantIds(d, id)]);   // kendisi + tüm torunları
      return {
        ...d,
        subOps: d.subOps
          .filter(s => !rm.has(s.id))
          .map(s => ({ ...s, nextIds: (s.nextIds || []).filter(n => !rm.has(n)) })),
      };
    });
  };

  /* ---------- Generic düğüm handler'ları (her katmanda çalışır) ---------- */
  const updateNodePosition = (id, x, y) => setData(d => ({
    ...d,
    mainOps: d.mainOps.map(m => m.id === id ? { ...m, x, y } : m),
    subOps: d.subOps.map(s => s.id === id ? { ...s, x, y } : s),
  }));
  const updateNodeConnections = (fromId, nextIds) => setData(d => ({
    ...d,
    mainOps: d.mainOps.map(m => m.id === fromId ? { ...m, nextIds } : m),
    subOps: d.subOps.map(s => s.id === fromId ? { ...s, nextIds } : s),
  }));
  const setNodeJoinType = (id, joinType) => setData(d => ({
    ...d,
    mainOps: d.mainOps.map(m => m.id === id ? { ...m, joinType } : m),
    subOps: d.subOps.map(s => s.id === id ? { ...s, joinType } : s),
  }));
  const addChildNode = (containerId, pos) =>
    containerId === ROOT_ID ? addMainOp() : addSubOp(containerId, pos);
  const deleteNode = (id) => (isMainNode(data, id) ? deleteMainOp(id) : deleteSubOp(id));
  const editNode = (id) => {
    const m = data.mainOps.find(x => x.id === id);
    if (m) return setEditMainOp(m);
    const s = data.subOps.find(x => x.id === id);
    if (s) return setEditSubOp(s);
  };
  // Verilen konteynerin çocuklarını topolojik otomatik yerleştir
  const autoLayoutLevel = (containerId) => {
    const nodes = childNodes(data, containerId);
    if (nodes.length === 0) return;
    const idset = new Set(nodes.map(n => n.id));
    const inDeg = Object.fromEntries(nodes.map(n => [n.id, 0]));
    nodes.forEach(n => (n.nextIds || []).forEach(x => { if (idset.has(x)) inDeg[x]++; }));
    const levels = {}; let q = nodes.filter(n => inDeg[n.id] === 0).map(n => n.id); let lvl = 0; const visited = {};
    while (q.length) {
      const nx = [];
      q.forEach(id => {
        if (visited[id]) return; visited[id] = true; levels[id] = lvl;
        const n = nodes.find(o => o.id === id);
        (n.nextIds || []).forEach(m => { if (idset.has(m) && !visited[m]) nx.push(m); });
      });
      q = [...new Set(nx)]; lvl++;
    }
    const byLevel = {}; Object.entries(levels).forEach(([id, l]) => { (byLevel[l] = byLevel[l] || []).push(id); });
    const pos = {};
    nodes.forEach(n => { const l = levels[n.id] ?? 0; const sib = byLevel[l] || [n.id]; const idx = sib.indexOf(n.id); pos[n.id] = { x: 60 + l * 240, y: 50 + idx * 130 }; });
    setData(d => ({
      ...d,
      mainOps: d.mainOps.map(m => pos[m.id] ? { ...m, ...pos[m.id] } : m),
      subOps: d.subOps.map(s => pos[s.id] ? { ...s, ...pos[s.id] } : s),
    }));
  };

  /* ---------- Alt operasyon öncelik DAG'ı otomatik kurulumu ---------- */
  const autoSetupSubOpPrecedence = () => {
    if (!confirm('Mevcut alt-op öncelik ilişkileri (nextIds) silinip ana op DAG\'ı + alt-op sırasına göre otomatik kurulsun mu?')) return;
    const newSubOps = data.subOps.map(s => ({ ...s, nextIds: [] }));
    const byMainOp = {};
    newSubOps.forEach(s => {
      if (!byMainOp[s.mainOpId]) byMainOp[s.mainOpId] = [];
      byMainOp[s.mainOpId].push(s);
    });
    Object.values(byMainOp).forEach(arr => arr.sort((a, b) => a.order - b.order));

    data.mainOps.forEach(mo => {
      const subs = byMainOp[mo.id] || [];
      // zincir içinde
      for (let i = 0; i < subs.length - 1; i++) {
        subs[i].nextIds.push(subs[i + 1].id);
      }
      // son alt-op → her sonraki ana op'un ilk alt-op'u
      if (subs.length > 0) {
        const last = subs[subs.length - 1];
        (mo.nextIds || []).forEach(nextMainId => {
          const nextSubs = byMainOp[nextMainId] || [];
          if (nextSubs.length > 0) last.nextIds.push(nextSubs[0].id);
        });
      }
    });
    setData(d => ({ ...d, subOps: newSubOps }));
  };

  /* ---------- Sürükle-bırak mantığı ---------- */
  const handleDragStart = (type, id) => setDrag({ type, id });
  const handleDragEnd = () => { setDrag(null); setDragOver(null); };
  const handleDragOver = (e, type, id) => {
    e.preventDefault();
    if (dragOver?.type !== type || dragOver?.id !== id) setDragOver({ type, id });
  };

  const handleDropOnMainOp = (mainOpId) => {
    if (!drag) return;
    if (drag.type === 'subOp') {
      // Sub-op'u bu ana operasyona taşı
      setData(d => {
        const targetMax = d.subOps.filter(s => s.mainOpId === mainOpId).reduce((m, s) => Math.max(m, s.order), -1);
        return {
          ...d,
          subOps: d.subOps.map(s => s.id === drag.id ? { ...s, mainOpId, parentId: mainOpId, order: targetMax + 1 } : s)
        };
      });
    }
    handleDragEnd();
  };

  const handleDropOnSubOp = (targetSubOpId) => {
    if (!drag) return;
    const target = data.subOps.find(s => s.id === targetSubOpId);
    if (!target) return;
    if (drag.type === 'subOp' && drag.id !== targetSubOpId) {
      // Sıralamayı değiştir (aynı kolon veya farklı kolon)
      setData(d => {
        const source = d.subOps.find(s => s.id === drag.id);
        if (!source) return d;
        return {
          ...d,
          subOps: d.subOps.map(s => {
            if (s.id === drag.id) return { ...s, mainOpId: target.mainOpId, order: target.order };
            if (s.mainOpId === target.mainOpId && s.order >= target.order && s.id !== drag.id) {
              return { ...s, order: s.order + 1 };
            }
            return s;
          })
        };
      });
    } else if (drag.type === 'machine') {
      // Makineyi alt-op'a ata
      setData(d => ({ ...d, subOps: d.subOps.map(s => s.id === targetSubOpId ? { ...s, machineId: drag.id } : s) }));
    } else if (drag.type === 'operator') {
      setData(d => ({ ...d, subOps: d.subOps.map(s => s.id === targetSubOpId ? { ...s, operatorId: drag.id } : s) }));
    }
    handleDragEnd();
  };

  /* ---------- Kaynak CRUD ---------- */
  const addMachine = () => setData(d => ({ ...d, machines: [...d.machines, { id: `m_${uid()}`, name: 'Yeni Makine', type: 'Düz Dikiş', brand: '' }] }));
  const updateMachine = (id, patch) => setData(d => ({ ...d, machines: d.machines.map(m => m.id === id ? { ...m, ...patch } : m) }));
  const deleteMachine = (id) => setData(d => ({
    ...d,
    machines: d.machines.filter(m => m.id !== id),
    subOps: d.subOps.map(s => s.machineId === id ? { ...s, machineId: null } : s)
  }));

  const addOperator = () => setData(d => ({ ...d, operators: [...d.operators, { id: `o_${uid()}`, name: 'Yeni Operatör', skill: 3, skills: [] }] }));
  const updateOperator = (id, patch) => setData(d => ({ ...d, operators: d.operators.map(o => o.id === id ? { ...o, ...patch } : o) }));
  const deleteOperator = (id) => setData(d => ({
    ...d,
    operators: d.operators.filter(o => o.id !== id),
    subOps: d.subOps.map(s => s.operatorId === id ? { ...s, operatorId: null } : s)
  }));

  const resetWorkbench = () => {
    const hasWork = (data.subOps?.length ?? 0) > 0 || (data.machines?.length ?? 0) > 0 || (data.operators?.length ?? 0) > 0 || data.meta?.modelAdi
    const msg = hasWork
      ? 'Çalışma sayfası sıfırlanacak — alt operasyonlar, makineler, operatörler ve model bilgisi silinecek. Sadece temel akış zinciri kalacak. Devam edilsin mi?'
      : 'Akışı temel zincire döndür?'
    if (!confirm(msg)) return;
    setData(DEFAULT_DATA);
    setSimState(initialSimState());
    setTab('flow');
  };

  /* ---------- Render ---------- */
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      {/* Başlık */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-500 flex items-center justify-center rounded">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                {data.meta?.modelAdi || 'Atölye Simülasyon Platformu'}
              </h1>
              <p className="text-xs text-slate-400 font-mono truncate max-w-[560px]">
                {data.meta?.modelAdi ? (
                  [data.meta.modelNo, data.meta.atolyeAdi, data.meta.musteri, data.meta.tarih, data.meta.sezon]
                    .filter(Boolean).join(' · ')
                ) : 'MTM · SMV · YAMAZUMI · DARBOĞAZ'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <KpiBadge label="Hat Çıktısı" value={`${calc.lineCapacity.toFixed(0)} adet`} tone="cyan" />
            <KpiBadge label="Takt" value={`${calc.taktTimeSec.toFixed(1)} sn`} tone="amber" />
            <KpiBadge label="Talep" value={`${calc.demand} ad`} tone="slate" />
            <button onClick={() => downloadTemplate(data.mainOps)} className="ml-2 p-2 bg-slate-800 hover:bg-slate-700 rounded transition flex items-center gap-1.5 text-xs" title="Excel şablonunu indir">
              <Download className="w-4 h-4" /> Şablon
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={importing}
              className="p-2 bg-emerald-700 hover:bg-emerald-600 rounded transition flex items-center gap-1.5 text-xs disabled:opacity-50"
              title="Excel yükle">
              <Upload className="w-4 h-4" /> {importing ? 'Okunuyor...' : 'Excel Yükle'}
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelected} className="hidden" />
            <button onClick={() => setShowSettings(true)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded transition" title="Ayarlar">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button onClick={resetWorkbench} className="p-2 bg-slate-800 hover:bg-slate-700 rounded transition flex items-center gap-1.5 text-xs" title="Sayfayı sıfırla — temel akış kalır">
              <RefreshCw className="w-4 h-4" /> Sıfırla
            </button>
          </div>
        </div>
        {/* Sekmeler */}
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex gap-1 text-sm">
            <TabBtn active={tab === 'flow'} onClick={() => setTab('flow')} icon={Network}>Akış</TabBtn>
            <TabBtn active={tab === 'ops'} onClick={() => setTab('ops')} icon={Layers}>Operasyonlar</TabBtn>
            <TabBtn active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={BarChart3}>Hesaplama</TabBtn>
            <TabBtn active={tab === 'sim'} onClick={() => setTab('sim')} icon={Play}>Simülasyon</TabBtn>
            <TabBtn active={tab === 'resources'} onClick={() => setTab('resources')} icon={Wrench}>Kaynaklar</TabBtn>
            <TabBtn active={tab === 'rapor'} onClick={() => setTab('rapor')} icon={FileSpreadsheet}>Rapor</TabBtn>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {tab === 'ops' && (
          (data.mainOps || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Network className="w-16 h-16 text-slate-300 mb-4" />
              <h2 className="text-xl font-semibold text-slate-700 mb-2">Önce akışı kur</h2>
              <p className="text-sm text-slate-500 mb-5 max-w-md">
                Alt operasyonları doldurmadan önce <b>Akış</b> sekmesinde ana operasyon adımlarını tanımla. Ana operasyonlar burada otomatik görünecek.
              </p>
              <button onClick={() => setTab('flow')}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                <Network className="w-4 h-4" /> Akış sekmesine git
              </button>
            </div>
          ) : (
            <OpsView
              data={data}
              calc={calc}
              drag={drag}
              dragOver={dragOver}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDropMain={handleDropOnMainOp}
              onDropSub={handleDropOnSubOp}
              onAddMain={addMainOp}
              onEditMain={setEditMainOp}
              onDeleteMain={deleteMainOp}
              onAddSub={addSubOp}
              onEditSub={setEditSubOp}
              onDeleteSub={deleteSubOp}
            />
          )
        )}
        {tab === 'resources' && (
          <ResourcesView
            data={data}
            drag={drag}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onAddMachine={addMachine}
            onUpdateMachine={updateMachine}
            onDeleteMachine={deleteMachine}
            onAddOperator={addOperator}
            onUpdateOperator={updateOperator}
            onDeleteOperator={deleteOperator}
          />
        )}
        {tab === 'flow' && (
          <FlowView
            data={data}
            calc={calc}
            onUpdatePosition={updateNodePosition}
            onUpdateConnections={updateNodeConnections}
            onAutoLayout={autoLayoutLevel}
            onAddChild={addChildNode}
            onDeleteNode={deleteNode}
            onEditNode={editNode}
            onSetJoin={setNodeJoinType}
            onSaveScenario={saveScenario}
            onLoadScenario={loadScenario}
            onDeleteScenario={deleteScenario}
            onDuplicateScenario={duplicateScenario}
          />
        )}
        {tab === 'dashboard' && <DashboardView data={data} calc={calc} />}
        {tab === 'sim' && (
          <SimView
            data={data}
            calc={calc}
            simState={simState}
            onStart={simStartSim}
            onPause={simPauseSim}
            onReset={simResetSim}
            onSpeed={simSetSpeed}
            onFastForward={simFastForward}
            onAutoSetup={autoSetupSubOpPrecedence}
            onSaveScenario={saveScenario}
            onLoadScenario={loadScenario}
            onDeleteScenario={deleteScenario}
            onDuplicateScenario={duplicateScenario}
            onRenameScenario={renameScenario}
          />
        )}
        {tab === 'rapor' && (
          <RaporView data={data} calc={calc} simState={simState} />
        )}
      </main>

      {/* Modals */}
      {editSubOp && (
        <SubOpModal
          subOp={editSubOp}
          data={data}
          onSave={saveSubOp}
          onClose={() => setEditSubOp(null)}
        />
      )}
      {editMainOp && (
        <MainOpModal
          mainOp={editMainOp}
          allMainOps={data.mainOps}
          onSave={saveMainOp}
          onClose={() => setEditMainOp(null)}
        />
      )}
      {showSettings && (
        <SettingsModal
          settings={data.settings}
          onSave={(s) => { updateSettings(s); setShowSettings(false); }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          onApply={applyImport}
          onClose={() => setImportPreview(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Excel import önizleme modali
   ============================================================ */
function MetaItem({ label, value, className = '' }) {
  return (
    <div className={className}>
      <span className="text-emerald-600 font-medium">{label}:</span>{' '}
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

function ImportPreviewModal({ preview, onApply, onClose }) {
  const total = preview.validated.length;
  const valid = preview.validated.filter(v => v.ok).length;
  const invalid = total - valid;
  const byGroup = {};
  for (const v of preview.validated) {
    if (!v.ok) continue;
    byGroup[v.anaGrup] = (byGroup[v.anaGrup] || 0) + 1;
  }
  const toplamCevrim = preview.validated
    .filter(v => v.ok)
    .reduce((s, v) => s + (Number(v.cevrim) || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="font-semibold text-slate-900">Excel Önizleme</h2>
              <p className="text-xs text-slate-500 mt-0.5">{preview.fileName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meta bilgisi (varsa) */}
        {preview.meta && Object.keys(preview.meta).length > 0 && (
          <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-100">
            <div className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold mb-1.5">Doküman Bilgisi</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
              {preview.meta.modelAdi && <MetaItem label="Model" value={preview.meta.modelAdi} />}
              {preview.meta.modelNo && <MetaItem label="Model No" value={preview.meta.modelNo} />}
              {preview.meta.atolyeAdi && <MetaItem label="Atölye" value={preview.meta.atolyeAdi} />}
              {preview.meta.musteri && <MetaItem label="Müşteri" value={preview.meta.musteri} />}
              {preview.meta.tarih && <MetaItem label="Tarih" value={String(preview.meta.tarih)} />}
              {preview.meta.siparisAdedi != null && <MetaItem label="Adet" value={String(preview.meta.siparisAdedi)} />}
              {preview.meta.sezon && <MetaItem label="Sezon" value={preview.meta.sezon} />}
              {preview.meta.kumas && <MetaItem label="Kumaş" value={preview.meta.kumas} />}
              {preview.meta.hazirlayan && <MetaItem label="Hazırlayan" value={preview.meta.hazirlayan} />}
              {preview.meta.revizyon && <MetaItem label="Revizyon" value={preview.meta.revizyon} />}
              {preview.meta.notlar && <MetaItem label="Notlar" value={preview.meta.notlar} className="col-span-2 md:col-span-4" />}
            </div>
          </div>
        )}

        {/* Ozet */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-5 text-sm">
          <span><span className="font-semibold text-slate-900">{total}</span> <span className="text-slate-500">satır</span></span>
          <span className="text-emerald-700"><span className="font-semibold">{valid}</span> geçerli</span>
          <span className={invalid > 0 ? 'text-red-700' : 'text-slate-400'}>
            <span className="font-semibold">{invalid}</span> hatalı
          </span>
          <span className="text-slate-500 ml-auto">
            Toplam çevrim: <span className="font-semibold text-slate-900">{toplamCevrim.toFixed(2)} sn</span>
            {' · '}
            {Object.entries(byGroup).map(([g, n]) => `${g}: ${n}`).join(' · ')}
          </span>
        </div>

        {/* Tablo */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-14">Satır</th>
                <th className="px-3 py-2 text-left font-medium">Ana Grup</th>
                <th className="px-3 py-2 text-left font-medium">Operasyon</th>
                <th className="px-3 py-2 text-right font-medium">Çevrim (sn)</th>
                <th className="px-3 py-2 text-left font-medium">Tip</th>
                <th className="px-3 py-2 text-left font-medium">Makine</th>
                <th className="px-3 py-2 text-left font-medium">Operatör</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {preview.validated.map((v, i) => (
                <tr key={i} className={v.ok ? '' : 'bg-red-50'}>
                  <td className="px-3 py-1.5 text-slate-400 font-mono">{v.rowNo}</td>
                  <td className="px-3 py-1.5">{v.anaGrup || <span className="text-red-500 italic">boş</span>}</td>
                  <td className="px-3 py-1.5">{v.opAdi || <span className="text-red-500 italic">boş</span>}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{v.cevrim || '—'}</td>
                  <td className="px-3 py-1.5 text-slate-600">{v.tip}</td>
                  <td className="px-3 py-1.5 text-slate-600">{v.makineKodu || '—'}</td>
                  <td className="px-3 py-1.5 text-slate-600">{v.operator || '—'}</td>
                  <td className="px-3 py-1.5">
                    {v.ok ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <Check className="w-3 h-3" /> OK
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700" title={v.errors.join('; ')}>
                        <AlertTriangle className="w-3 h-3" /> {v.errors[0]}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            İptal
          </button>
          <button
            onClick={() => onApply('merge')}
            disabled={valid === 0}
            className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
            title="Mevcut makine ve operatörleri koru, üzerine yeni operasyonları yaz"
          >
            Birleştir ve Uygula
          </button>
          <button
            onClick={() => onApply('replace')}
            disabled={valid === 0}
            className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50"
            title="Tüm mevcut veriyi sil, sadece Excel'deki kalsın"
          >
            Tamamen Değiştir ({valid} satır)
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Küçük yardımcı bileşenler
   ============================================================ */
function TabBtn({ active, onClick, icon: Icon, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition
        ${active ? 'border-cyan-400 text-white bg-slate-800/50' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
      <Icon className="w-4 h-4" />{children}
    </button>
  );
}

function KpiBadge({ label, value, tone = 'slate' }) {
  const tones = {
    cyan:  'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    slate: 'bg-slate-500/10 border-slate-500/30 text-slate-300',
  };
  return (
    <div className={`px-3 py-1.5 border rounded ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-mono font-semibold">{value}</div>
    </div>
  );
}

/* ============================================================
   Sekme 1: OPERASYONLAR — Kanban tarzı, sürükle-bırak
   ============================================================ */
function OpsView({ data, calc, drag, dragOver, onDragStart, onDragEnd, onDragOver, onDropMain, onDropSub, onAddMain, onEditMain, onDeleteMain, onAddSub, onEditSub, onDeleteSub }) {
  const sortedMainOps = [...data.mainOps].sort((a, b) => a.order - b.order);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Ana Operasyon Bantları</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Sütunlara tıklayıp düzenleyin · Alt operasyonları <span className="font-mono bg-slate-200 px-1 rounded">sürükleyip</span> bantlar arası taşıyın · Makineleri Kaynaklar sekmesinden sürükleyip kartlara bırakın
          </p>
        </div>
        <button onClick={onAddMain}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded hover:bg-slate-800 transition">
          <Plus className="w-4 h-4" />Ana Operasyon Ekle
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
        {sortedMainOps.map(mo => {
          const subs = data.subOps.filter(s => s.mainOpId === mo.id).sort((a, b) => a.order - b.order);
          const stats = calc.perMain.find(p => p.mainOp.id === mo.id);
          const isBottleneck = mo.id === calc.bottleneckId;
          const isOver = dragOver?.type === 'mainOp' && dragOver.id === mo.id;
          return (
            <div key={mo.id}
              className={`flex-shrink-0 w-80 bg-white rounded-lg border-2 transition
                ${isOver ? 'border-cyan-500 ring-2 ring-cyan-200' : 'border-slate-200'}
                ${isBottleneck ? 'shadow-lg shadow-red-200' : ''}`}
              onDragOver={(e) => onDragOver(e, 'mainOp', mo.id)}
              onDrop={() => onDropMain(mo.id)}>
              {/* Kolon başlığı */}
              <div className="p-3 rounded-t-lg border-b border-slate-200 flex items-center gap-2"
                style={{ backgroundColor: mo.color + '12', borderTopColor: mo.color, borderTopWidth: 3 }}>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: mo.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold truncate">{mo.name}</h3>
                    {isBottleneck && <AlertTriangle className="w-3.5 h-3.5 text-red-500" title="Darboğaz" />}
                  </div>
                  <div className="text-xs text-slate-600 font-mono mt-0.5">
                    {subs.length} alt op · Σ {stats?.totalCycle.toFixed(0)} sn · {stats?.capacity.toFixed(0)} adet/v
                  </div>
                </div>
                <button onClick={() => onEditMain(mo)} className="p-1 text-slate-500 hover:text-slate-900 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => onDeleteMain(mo.id)} className="p-1 text-slate-500 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>

              {/* Kartlar */}
              <div className="p-2 space-y-1.5 min-h-[200px]">
                {subs.map(s => (
                  <SubOpCard key={s.id}
                    subOp={s}
                    machine={data.machines.find(m => m.id === s.machineId)}
                    operator={data.operators.find(o => o.id === s.operatorId)}
                    isSlowest={stats?.slowest?.id === s.id}
                    isDragging={drag?.type === 'subOp' && drag.id === s.id}
                    onDragStart={() => onDragStart('subOp', s.id)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => onDragOver(e, 'subOp', s.id)}
                    onDrop={() => onDropSub(s.id)}
                    onEdit={() => onEditSub(s)}
                    onDelete={() => onDeleteSub(s.id)}
                  />
                ))}
                <button onClick={() => onAddSub(mo.id)}
                  className="w-full py-2 text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded border border-dashed border-slate-300 transition flex items-center justify-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />Alt Operasyon
                </button>
              </div>
            </div>
          );
        })}
        {sortedMainOps.length === 0 && (
          <div className="w-full text-center py-20 text-slate-400">
            Henüz ana operasyon yok. Yukarıdaki “Ana Operasyon Ekle” butonuyla başlayın.
          </div>
        )}
      </div>
    </div>
  );
}

function SubOpCard({ subOp, machine, operator, isSlowest, isDragging, onDragStart, onDragEnd, onDragOver, onDrop, onEdit, onDelete }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={(e) => { e.stopPropagation(); onDrop(); }}
      className={`group bg-white border rounded p-2 cursor-move transition
        ${isDragging ? 'opacity-40 scale-95' : 'hover:border-slate-400 hover:shadow-sm'}
        ${isSlowest ? 'border-red-400 bg-red-50/30' : 'border-slate-200'}`}>
      <div className="flex items-start gap-1.5">
        <GripVertical className="w-3.5 h-3.5 text-slate-300 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <span className="text-sm font-medium leading-tight">{subOp.name}</span>
            <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
              <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded">{subOp.cycleTime} sn</span>
              {subOp.cycleTime > 0 && (
                <span className="text-[10px] font-mono text-slate-500" title="Bu operasyonda dakikada max çıktı">
                  {(60 / subOp.cycleTime).toFixed(1)} ad/dk
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-[10px] bg-slate-900 text-white px-1.5 py-0.5 rounded-sm font-mono">{subOp.type}</span>
            {machine && (
              <span className="text-[10px] bg-cyan-600/10 text-cyan-700 border border-cyan-600/20 px-1.5 py-0.5 rounded-sm font-mono flex items-center gap-0.5">
                <Cog className="w-2.5 h-2.5" />{machine.name}
              </span>
            )}
            {operator && (
              <span className="text-[10px] bg-amber-600/10 text-amber-700 border border-amber-600/20 px-1.5 py-0.5 rounded-sm font-mono flex items-center gap-0.5">
                <User className="w-2.5 h-2.5" />{operator.name}
              </span>
            )}
          </div>
          <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-[10px] px-1.5 py-0.5 text-slate-600 hover:text-slate-900 flex items-center gap-0.5">
              <Edit2 className="w-2.5 h-2.5" />Düzenle
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-[10px] px-1.5 py-0.5 text-red-600 hover:text-red-800 flex items-center gap-0.5">
              <Trash2 className="w-2.5 h-2.5" />Sil
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Sekme 2: KAYNAKLAR — makine ve operatör havuzu (sürüklenebilir)
   ============================================================ */
function ResourcesView({ data, drag, onDragStart, onDragEnd, onAddMachine, onUpdateMachine, onDeleteMachine, onAddOperator, onUpdateOperator, onDeleteOperator }) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Makineler */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cog className="w-5 h-5 text-cyan-600" />
            <h3 className="font-semibold">Makine Havuzu</h3>
            <span className="text-xs text-slate-500 font-mono">({data.machines.length})</span>
          </div>
          <button onClick={onAddMachine} className="flex items-center gap-1 text-sm px-3 py-1.5 bg-slate-900 text-white rounded hover:bg-slate-800">
            <Plus className="w-3.5 h-3.5" />Ekle
          </button>
        </div>
        <p className="px-4 py-2 text-xs text-slate-600 bg-cyan-50/50 border-b border-cyan-100">
          💡 İpucu: Makine kartlarını <b>Operasyonlar</b> sekmesindeki alt operasyon kartlarına sürükleyerek atama yapabilirsiniz.
        </p>
        <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          {data.machines.map(m => (
            <div key={m.id}
              draggable
              onDragStart={() => onDragStart('machine', m.id)}
              onDragEnd={onDragEnd}
              className={`border border-slate-200 rounded p-3 cursor-move transition hover:border-cyan-400 hover:shadow-sm
                ${drag?.type === 'machine' && drag.id === m.id ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-slate-300" />
                <div className="flex-1 grid grid-cols-3 gap-2 text-sm">
                  <input className="border border-slate-200 rounded px-2 py-1 font-mono text-sm focus:outline-none focus:border-cyan-400"
                    value={m.name} onChange={e => onUpdateMachine(m.id, { name: e.target.value })} placeholder="Kod" />
                  <input className="border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-cyan-400"
                    value={m.type} onChange={e => onUpdateMachine(m.id, { type: e.target.value })} placeholder="Tip" />
                  <input className="border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-cyan-400"
                    value={m.brand} onChange={e => onUpdateMachine(m.id, { brand: e.target.value })} placeholder="Marka" />
                </div>
                <button onClick={() => onDeleteMachine(m.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Operatörler */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold">Operatör Havuzu</h3>
            <span className="text-xs text-slate-500 font-mono">({data.operators.length})</span>
          </div>
          <button onClick={onAddOperator} className="flex items-center gap-1 text-sm px-3 py-1.5 bg-slate-900 text-white rounded hover:bg-slate-800">
            <Plus className="w-3.5 h-3.5" />Ekle
          </button>
        </div>
        <p className="px-4 py-2 text-xs text-slate-600 bg-amber-50/50 border-b border-amber-100">
          💡 İpucu: Operatör kartlarını sürükleyip alt operasyonlara atayabilirsiniz. <b>Yetenekler</b> = operatörün yapabileceği op tipleri (çoklu beceri için gerekli).
        </p>
        <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          {data.operators.map(o => (
            <div key={o.id}
              draggable
              onDragStart={() => onDragStart('operator', o.id)}
              onDragEnd={onDragEnd}
              className={`border border-slate-200 rounded p-3 cursor-move transition hover:border-amber-400 hover:shadow-sm
                ${drag?.type === 'operator' && drag.id === o.id ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-slate-300" />
                <User className="w-4 h-4 text-amber-600" />
                <input className="flex-1 border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-400"
                  value={o.name} onChange={e => onUpdateOperator(o.id, { name: e.target.value })} placeholder="İsim" />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">Beceri</span>
                  <select className="border border-slate-200 rounded px-1.5 py-1 text-sm font-mono"
                    value={o.skill} onChange={e => onUpdateOperator(o.id, { skill: parseInt(e.target.value) })}>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button onClick={() => onDeleteOperator(o.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
              </div>
              {/* Yetenek chip'leri */}
              <div className="mt-2 flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mr-1">Yetenekler:</span>
                {OP_TYPES.map(t => {
                  const selected = (o.skills || []).includes(t);
                  return (
                    <button key={t}
                      onClick={() => {
                        const curr = o.skills || [];
                        const next = selected ? curr.filter(x => x !== t) : [...curr, t];
                        onUpdateOperator(o.id, { skills: next });
                      }}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition ${
                        selected
                          ? 'bg-amber-500 text-white border border-amber-600'
                          : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                      }`}>
                      {t}
                    </button>
                  );
                })}
                {(o.skills || []).length === 0 && (
                  <span className="text-[10px] text-slate-400 italic ml-2">yetenek seçilmedi — her yerde çalışabilir varsayılır</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Sekme 3: AKIŞ — İnteraktif canvas + senaryo yönetimi
   ============================================================ */
function FlowView({ data, calc, onUpdatePosition, onUpdateConnections, onAutoLayout, onAddChild, onDeleteNode, onEditNode, onSetJoin, onSaveScenario, onLoadScenario, onDeleteScenario, onDuplicateScenario }) {
  const [mode, setMode] = useState('move'); // 'move' | 'connect'
  const [dragNode, setDragNode] = useState(null);       // { id, offX, offY, moved }
  const [connectSrc, setConnectSrc] = useState(null);   // source node id when connecting
  const [hoverConn, setHoverConn] = useState(null);     // '{from}-{to}' for delete hover
  const [hoverNode, setHoverNode] = useState(null);     // düğüm üstünde → aksiyon ikonları
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [path, setPath] = useState([]);                 // drill-in konteyner id yığını
  const svgRef = React.useRef(null);

  const NODE_W = 170;
  const NODE_H = 72;

  // Aktif katman: kök (ROOT) → ana op'lar; değilse → o konteynerin çocukları
  const current = path.length ? path[path.length - 1] : ROOT_ID;
  const atRoot = current === ROOT_ID;
  const nodes = childNodes(data, current);
  const enterNode = (id) => setPath(p => [...p, id]);

  // x/y'si olmayan düğümler için topolojik yedek konum (kalıcı değil, kullanıcı taşıyınca sabitlenir)
  const posMap = React.useMemo(() => {
    const idset = new Set(nodes.map(n => n.id));
    const inDeg = Object.fromEntries(nodes.map(n => [n.id, 0]));
    nodes.forEach(n => (n.nextIds || []).forEach(x => { if (idset.has(x)) inDeg[x]++; }));
    const levels = {}; let q = nodes.filter(n => inDeg[n.id] === 0).map(n => n.id); let lvl = 0; const seen = {};
    while (q.length) { const nx = []; q.forEach(id => { if (seen[id]) return; seen[id] = true; levels[id] = lvl; const n = nodes.find(o => o.id === id); (n.nextIds || []).forEach(m => { if (idset.has(m) && !seen[m]) nx.push(m); }); }); q = [...new Set(nx)]; lvl++; }
    const byLevel = {}; Object.entries(levels).forEach(([id, l]) => { (byLevel[l] = byLevel[l] || []).push(id); });
    const p = {};
    nodes.forEach(n => { const l = levels[n.id] ?? 0; const sib = byLevel[l] || [n.id]; const idx = sib.indexOf(n.id); p[n.id] = { x: n.x ?? (60 + l * 240), y: n.y ?? (50 + idx * 130) }; });
    return p;
  }, [nodes]);
  const PX = (n) => posMap[n.id]?.x ?? 0;
  const PY = (n) => posMap[n.id]?.y ?? 0;

  // Canvas boyutunu düğümlere göre dinamik ayarla
  const canvasW = Math.max(1000, ...nodes.map(n => PX(n) + NODE_W + 80));
  const canvasH = Math.max(480,  ...nodes.map(n => PY(n) + NODE_H + 90));

  /* --- Pointer (fare/dokunmatik) → SVG koordinatı dönüşümü --- */
  const toSvgXY = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x, y: loc.y };
  };

  /* --- Düğüm sürükleme --- */
  const onNodePointerDown = (e, node) => {
    if (mode !== 'move') return;
    e.stopPropagation();
    const { x, y } = toSvgXY(e.clientX, e.clientY);
    setDragNode({ id: node.id, offX: x - PX(node), offY: y - PY(node), moved: false });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onSvgPointerMove = (e) => {
    if (!dragNode) return;
    const { x, y } = toSvgXY(e.clientX, e.clientY);
    const nx = Math.max(4, Math.min(canvasW - NODE_W - 4, x - dragNode.offX));
    const ny = Math.max(4, Math.min(canvasH - NODE_H - 4, y - dragNode.offY));
    onUpdatePosition(dragNode.id, nx, ny);
    if (!dragNode.moved) setDragNode(d => ({ ...d, moved: true }));
  };
  const onSvgPointerUp = () => { setDragNode(null); };

  /* --- Bağlantı kurma --- */
  const handleNodeClick = (node) => {
    // sürükleme sırasında click tetiklenmesin
    if (dragNode?.moved) return;
    if (mode !== 'connect') return;
    if (!connectSrc) { setConnectSrc(node.id); return; }
    if (connectSrc === node.id) { setConnectSrc(null); return; } // iptal
    // döngü kontrolü: hedef → kaynak bağlantısı varsa ters yön olur
    const tgt = nodes.find(m => m.id === node.id);
    if ((tgt?.nextIds || []).includes(connectSrc)) {
      alert('Bu iki operasyon arasında ters yönde bağlantı var — döngü oluşur.');
      setConnectSrc(null); return;
    }
    const src = nodes.find(m => m.id === connectSrc);
    if (src && !(src.nextIds || []).includes(node.id)) {
      onUpdateConnections(connectSrc, [...(src.nextIds || []), node.id]);
    }
    setConnectSrc(null);
  };

  const removeConn = (fromId, toId) => {
    const src = nodes.find(m => m.id === fromId);
    if (!src) return;
    onUpdateConnections(fromId, (src.nextIds || []).filter(id => id !== toId));
  };

  /* --- Render yardımcı --- */
  const nodeRect = (m) => { const x = PX(m), y = PY(m); return { x, y, cx: x + NODE_W / 2, cy: y + NODE_H / 2, right: x + NODE_W, bottom: y + NODE_H }; };

  const bottleneckHere = calc.bottleneckByContainer?.[current];
  const incomingCount = {}; nodes.forEach(n => { incomingCount[n.id] = 0; });
  nodes.forEach(src => (src.nextIds || []).forEach(nid => { if (incomingCount[nid] != null) incomingCount[nid]++; }));

  const connections = [];
  nodes.forEach(src => {
    (src.nextIds || []).forEach(nextId => {
      const tgt = nodes.find(m => m.id === nextId);
      if (tgt) connections.push({ src, tgt, key: `${src.id}-${tgt.id}` });
    });
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      {/* Toolbar */}
      <div className="p-3 border-b border-slate-200 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded p-0.5">
          <button onClick={() => { setMode('move'); setConnectSrc(null); }}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition ${mode === 'move' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
            <MousePointer2 className="w-3.5 h-3.5" />Taşı
          </button>
          <button onClick={() => { setMode('connect'); setConnectSrc(null); }}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition ${mode === 'connect' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
            <Link2 className="w-3.5 h-3.5" />Bağla
          </button>
        </div>
        <button onClick={() => onAutoLayout(current)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50">
          <Sparkles className="w-3.5 h-3.5" />Otomatik Yerleştir
        </button>
        <button onClick={() => onAddChild(current)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50">
          <Plus className="w-3.5 h-3.5" />{atRoot ? 'Ana Op Ekle' : 'Alt Op Ekle'}
        </button>
        <div className="flex-1" />
        <button onClick={() => { setScenarioName(''); setShowSaveDialog(true); }}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-slate-900 text-white rounded hover:bg-slate-800">
          <Save className="w-3.5 h-3.5" />Bu Akışı Kaydet
        </button>
      </div>

      {/* Breadcrumb — katman gezinme */}
      <div className="px-4 py-1.5 border-b border-slate-200 bg-slate-50/70 flex items-center gap-1 text-xs flex-wrap">
        <button onClick={() => setPath([])}
          className={`px-1.5 py-0.5 rounded hover:bg-slate-200 flex items-center gap-1 ${atRoot ? 'font-semibold text-slate-900' : 'text-cyan-700'}`}>
          <Network className="w-3 h-3" />Ana Akış
        </button>
        {path.map((cid, i) => (
          <React.Fragment key={cid}>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <button onClick={() => setPath(path.slice(0, i + 1))}
              className={`px-1.5 py-0.5 rounded hover:bg-slate-200 ${i === path.length - 1 ? 'font-semibold text-slate-900' : 'text-cyan-700'}`}>
              {findNode(data, cid)?.name || '—'}
            </button>
          </React.Fragment>
        ))}
        <span className="ml-2 text-slate-400">· düğüme çift tıkla → içine gir · breadcrumb ile geri dön</span>
      </div>

      {/* Mode açıklaması */}
      <div className={`px-4 py-2 text-xs border-b transition ${
        mode === 'connect'
          ? (connectSrc ? 'bg-cyan-50 border-cyan-200 text-cyan-800' : 'bg-amber-50 border-amber-200 text-amber-800')
          : 'bg-slate-50 border-slate-100 text-slate-600'
      }`}>
        {mode === 'move' && <><b>Taşıma modu:</b> Kutuları sürükleyip istediğiniz yere yerleştirin. Oklara tıklayarak silebilirsiniz.</>}
        {mode === 'connect' && !connectSrc && <><b>Bağlama modu:</b> Kaynak kutuya tıklayın, sonra hedef kutuya tıklayın. Aynı kutuya tekrar tıklamak iptal eder.</>}
        {mode === 'connect' && connectSrc && <><b>Hedef seçin:</b> Hangi ana operasyona bağlansın? Aynı kutuya tekrar tıklamak iptal eder.</>}
      </div>

      {/* Senaryo şeridi */}
      {(data.scenarios || []).length > 0 && (
        <div className="px-3 py-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <FolderOpen className="w-3.5 h-3.5 inline mr-1" />Kayıtlı Senaryolar
            </span>
            {(data.scenarios || []).map(sc => (
              <div key={sc.id} className="group flex items-center gap-1 bg-white border border-slate-200 rounded pl-2 pr-0.5 py-0.5 text-xs">
                <button onClick={() => onLoadScenario(sc.id)} className="hover:text-cyan-700 py-1 pr-1 font-medium flex items-center gap-1">
                  <Layers className="w-3 h-3" />{sc.name}
                </button>
                <span className="text-slate-400 font-mono">
                  {sc.snapshot.mainOps.length}·{sc.snapshot.subOps.length}
                </span>
                <button onClick={() => onDuplicateScenario(sc.id)} title="Kopyala"
                  className="p-1 text-slate-400 hover:text-slate-900 rounded">
                  <Copy className="w-3 h-3" />
                </button>
                <button onClick={() => { if (confirm(`"${sc.name}" silinsin mi?`)) onDeleteScenario(sc.id); }} title="Sil"
                  className="p-1 text-slate-400 hover:text-red-600 rounded">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="overflow-auto p-2" style={{ background: 'radial-gradient(circle, #e2e8f0 1px, transparent 1px) 0 0 / 20px 20px, #fafbfc' }}>
        <svg
          ref={svgRef}
          width={canvasW}
          height={canvasH}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerLeave={onSvgPointerUp}
          className="select-none"
          style={{ touchAction: 'none' }}
        >
          <defs>
            <marker id="arrowhead-flow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="#475569" />
            </marker>
            <marker id="arrowhead-flow-red" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="#dc2626" />
            </marker>
          </defs>

          {/* Arka plan — boşluğa tıklayınca bağlantı modunu iptal et.
              DÜĞÜMLERİN ARKASINDA olmalı; aksi halde hedef tıklamasını yutar (bkz. bağlantı bug'ı). */}
          <rect x={0} y={0} width={canvasW} height={canvasH}
            fill="transparent"
            style={{ pointerEvents: mode === 'connect' && connectSrc ? 'auto' : 'none' }}
            onClick={() => setConnectSrc(null)} />

          {/* Bağlantılar (düğümlerin altında çizilsin) */}
          {connections.map(({ src, tgt, key }) => {
            const s = nodeRect(src), t = nodeRect(tgt);
            // kaynak sağ-orta, hedef sol-orta
            const fromX = s.right, fromY = s.cy;
            const toX = t.x, toY = t.cy;
            const midX = (fromX + toX) / 2;
            const d = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX - 4} ${toY}`;
            const mx = (fromX + toX) / 2, my = (fromY + toY) / 2;
            const isHover = hoverConn === key;
            return (
              <g key={key}
                onMouseEnter={() => setHoverConn(key)}
                onMouseLeave={() => setHoverConn(null)}>
                <path d={d} stroke={isHover ? '#dc2626' : '#475569'} strokeWidth={isHover ? 3 : 2}
                  fill="none" markerEnd={isHover ? 'url(#arrowhead-flow-red)' : 'url(#arrowhead-flow)'} />
                {/* hit area (görünmez geniş şerit) */}
                <path d={d} stroke="transparent" strokeWidth={16} fill="none"
                  style={{ cursor: 'pointer' }}
                  onClick={() => { if (confirm(`"${src.name}" → "${tgt.name}" bağlantısı silinsin mi?`)) removeConn(src.id, tgt.id); }} />
                {/* Delete button mid-point */}
                {isHover && (
                  <g style={{ cursor: 'pointer' }}
                    onClick={() => { if (confirm(`"${src.name}" → "${tgt.name}" bağlantısı silinsin mi?`)) removeConn(src.id, tgt.id); }}>
                    <circle cx={mx} cy={my} r={10} fill="#dc2626" />
                    <path d={`M ${mx - 4} ${my - 4} L ${mx + 4} ${my + 4} M ${mx + 4} ${my - 4} L ${mx - 4} ${my + 4}`}
                      stroke="white" strokeWidth={2} strokeLinecap="round" />
                  </g>
                )}
              </g>
            );
          })}

          {/* Bağlama modunda: kaynaktan fareye doğru geçici çizgi (basit değil — atlıyoruz) */}

          {/* Düğümler */}
          {nodes.map(mo => {
            const r = nodeRect(mo);
            const color = mo.color || '#0891b2';
            const childCount = childNodes(data, mo.id).length;
            const isContainer = childCount > 0;
            const capV = calc.cap?.[mo.id] ?? 0;
            const thruV = calc.thru?.[mo.id] ?? capV;
            const totalCycle = isContainer ? (calc.totalCycleOf?.[mo.id] ?? 0) : (mo.cycleTime || 0);
            const isBottleneck = mo.id === bottleneckHere;
            const isSrc = connectSrc === mo.id;
            const strokeColor = isSrc ? '#0891b2' : (isBottleneck ? '#dc2626' : color);
            const strokeWidth = isSrc ? 4 : (isBottleneck ? 3 : 1);
            const inCount = incomingCount[mo.id] || 0;
            const joinIsDup = (mo.joinType || 'AND') === 'DUP';
            return (
              <g key={mo.id}
                transform={`translate(${r.x}, ${r.y})`}
                style={{ cursor: mode === 'move' ? 'grab' : 'pointer' }}
                onPointerDown={(e) => onNodePointerDown(e, mo)}
                onClick={() => handleNodeClick(mo)}
                onDoubleClick={() => enterNode(mo.id)}
                onMouseEnter={() => setHoverNode(mo.id)}
                onMouseLeave={() => setHoverNode(h => h === mo.id ? null : h)}>
                <rect width={NODE_W} height={NODE_H} rx={8}
                  fill={color} opacity={0.94}
                  stroke={strokeColor} strokeWidth={strokeWidth} />
                {/* opak üst bant */}
                <rect width={NODE_W} height={6} rx={8} ry={8} fill="white" opacity={0.25} />
                <text x={NODE_W / 2} y={26} textAnchor="middle" fill="white" fontSize={14} fontWeight={700}>
                  {mo.name}
                </text>
                <text x={NODE_W / 2} y={44} textAnchor="middle" fill="white" opacity={0.88} fontSize={10.5} fontFamily="ui-monospace, monospace">
                  Σ {totalCycle.toFixed(0)} sn · {capV.toFixed(0)} ad/v
                </text>
                <text x={NODE_W / 2} y={60} textAnchor="middle" fill="white" opacity={0.7} fontSize={10} fontFamily="ui-monospace, monospace">
                  {isContainer ? `${childCount} alt op` : `çevrim ${(mo.cycleTime || 0)} sn`} · {mo.stationCount || 1} ist.
                </text>
                {isBottleneck && (
                  <g>
                    <circle cx={NODE_W - 10} cy={10} r={9} fill="#dc2626" stroke="white" strokeWidth={1.5} />
                    <text x={NODE_W - 10} y={14} textAnchor="middle" fill="white" fontSize={11} fontWeight={700}>!</text>
                  </g>
                )}
                {isSrc && (
                  <g>
                    <circle cx={10} cy={10} r={9} fill="#0891b2" stroke="white" strokeWidth={1.5} />
                    <path d="M 6 10 L 9 13 L 14 7" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                )}
                {/* Join tipi rozeti — birden fazla giriş varsa (tıkla: VE ↔ Çoğaltma) */}
                {inCount > 1 && (
                  <g style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onSetJoin(mo.id, joinIsDup ? 'AND' : 'DUP'); }}>
                    <rect x={6} y={NODE_H - 20} width={joinIsDup ? 42 : 28} height={15} rx={7}
                      fill="white" opacity={0.92} />
                    <text x={6 + (joinIsDup ? 21 : 14)} y={NODE_H - 9} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
                      {joinIsDup ? 'ÇOĞALT' : 'VE'}
                    </text>
                  </g>
                )}
                {/* İçine gir işareti (konteyner) */}
                {isContainer && mode === 'move' && hoverNode === mo.id && (
                  <g style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); enterNode(mo.id); }}>
                    <circle cx={NODE_W - 30} cy={NODE_H - 10} r={9} fill="rgba(255,255,255,0.9)" />
                    <path d={`M ${NODE_W - 34} ${NODE_H - 14} h6 v6 M ${NODE_W - 34} ${NODE_H - 8} l7 -7`} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                )}
                {/* Düzenle (kalem) */}
                {mode === 'move' && hoverNode === mo.id && (
                  <g style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onEditNode(mo.id); }}>
                    <circle cx={NODE_W - 50} cy={NODE_H - 10} r={9} fill="rgba(255,255,255,0.9)" />
                    <path d={`M ${NODE_W - 54} ${NODE_H - 7} l4 -4 2 2 -4 4 z M ${NODE_W - 49} ${NODE_H - 13} l1.5 -1.5 2 2 -1.5 1.5 z`} fill={color} />
                  </g>
                )}
                {/* Bağla modunda küçük sağdaki "out" halkası */}
                {mode === 'connect' && !isSrc && (
                  <circle cx={NODE_W} cy={NODE_H / 2} r={5} fill="white" stroke={color} strokeWidth={2} />
                )}
                {/* Sil butonu — kart sağ alt */}
                {mode === 'move' && hoverNode === mo.id && (
                  <g style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); onDeleteNode(mo.id); }}>
                    <circle cx={NODE_W - 10} cy={NODE_H - 10} r={9} fill="rgba(0,0,0,0.45)" stroke="white" strokeWidth={1.2} />
                    <path d={`M ${NODE_W - 14} ${NODE_H - 14} L ${NODE_W - 6} ${NODE_H - 6} M ${NODE_W - 6} ${NODE_H - 14} L ${NODE_W - 14} ${NODE_H - 6}`}
                      stroke="white" strokeWidth={2} strokeLinecap="round" />
                  </g>
                )}
              </g>
            );
          })}

        </svg>
      </div>

      <div className="px-4 py-2 text-xs text-slate-600 bg-slate-50 border-t border-slate-200 flex items-center gap-3 flex-wrap">
        <span><b>İpuçları:</b></span>
        <span>• Çift tıklayın → içine girin (alt akış)</span>
        <span>• Kalem → düzenle · Ok → bağlantı sil</span>
        <span>• VE/ÇOĞALT rozeti → birleşme tipi</span>
        <span>• <span className="inline-block w-2 h-2 bg-red-600 rounded-full align-middle mr-1"></span>darboğaz</span>
        {nodes.length === 0 && <span className="text-amber-600 font-medium">• Bu katman boş — “Alt Op Ekle” ile başlayın</span>}
      </div>

      {/* Kaydet diyaloğu */}
      {showSaveDialog && (
        <Modal title="Bu Akışı Senaryo Olarak Kaydet" onClose={() => setShowSaveDialog(false)}>
          <Field label="Senaryo Adı" hint="Örn: 'Mevcut durum', 'Otomat eklenmiş', 'Ön bant ikiye bölünmüş'">
            <input
              className={inputCls}
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="Senaryo adı"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSaveScenario(scenarioName.trim() || 'Senaryo');
                  setShowSaveDialog(false);
                }
              }}
            />
          </Field>
          <div className="bg-slate-50 rounded p-3 text-xs text-slate-600 border border-slate-200">
            <b>Kaydedilenler:</b> {data.mainOps.length} ana operasyon, {data.subOps.length} alt operasyon, tüm pozisyon ve bağlantılar, makine/operatör atamaları. Ayarlar dahil edilmez — onlar hep güncel kalır.
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
            <button onClick={() => setShowSaveDialog(false)} className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded">İptal</button>
            <button onClick={() => { onSaveScenario(scenarioName.trim() || 'Senaryo'); setShowSaveDialog(false); }}
              className="px-4 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />Kaydet
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
   Sekme 4: HESAPLAMA — dashboard, yamazumi, kapasite tablosu
   ============================================================ */
function DashboardView({ data, calc }) {
  const chartData = calc.perMain.map(p => ({
    name: p.mainOp.name,
    CycleSum: Number(p.totalCycle.toFixed(2)),
    SMV: Number(p.smv.toFixed(2)),
    color: p.mainOp.color,
    kapasite: Number(p.capacity.toFixed(0)),
    isBottleneck: p.mainOp.id === calc.bottleneckId,
  }));

  return (
    <div className="space-y-6">
      {/* Üst kutucuklar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigKpi label="Hat Çıktısı (Darboğaz)" value={`${calc.lineCapacity.toFixed(0)}`} unit="adet/vardiya" tone="cyan" icon={Activity} />
        <BigKpi label="Takt Time" value={calc.taktTimeSec.toFixed(1)} unit="sn/adet" tone="amber" icon={ChevronRight} />
        <BigKpi label="Toplam Alt Op" value={data.subOps.length} unit="operasyon" tone="slate" icon={Package} />
        <BigKpi label="Net Vardiya" value={data.settings.netMinutes} unit={`dk · verim ${(data.settings.efficiency*100).toFixed(0)}%`} tone="slate" icon={SettingsIcon} />
      </div>

      {/* Yamazumi */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-cyan-600" />Yamazumi — Ana Operasyon Bazında İş Yükü</h3>
            <p className="text-xs text-slate-600 mt-0.5">Toplam çevrim süresi (saniye). Kırmızı kesikli çizgi = Takt Time. Takt’ı aşan bantlar darboğazdır.</p>
          </div>
        </div>
        <div style={{ height: 340 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} label={{ value: 'saniye', angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 4 }}
                formatter={(v, k) => [Number(v).toFixed(1) + ' sn', k === 'CycleSum' ? 'Toplam Çevrim' : 'SMV']}
              />
              <ReferenceLine y={calc.taktTimeSec} stroke="#dc2626" strokeDasharray="5 5" label={{ value: `Takt ${calc.taktTimeSec.toFixed(1)} sn`, fontSize: 11, fill: '#dc2626', position: 'right' }} />
              <Bar dataKey="CycleSum" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.isBottleneck ? '#dc2626' : entry.color} />
                ))}
                <LabelList dataKey="CycleSum" position="top" fontSize={11} fontFamily="monospace" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-semibold">Ana Operasyon — Kapasite Tablosu</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Ana Op</th>
                <th className="px-4 py-2 text-right font-semibold">Alt Op</th>
                <th className="px-4 py-2 text-right font-semibold">Σ Çevrim (sn)</th>
                <th className="px-4 py-2 text-right font-semibold">SMV (dk, +PF&D)</th>
                <th className="px-4 py-2 text-right font-semibold">İstasyon</th>
                <th className="px-4 py-2 text-right font-semibold">Kapasite (ad/v)</th>
                <th className="px-4 py-2 text-left font-semibold">En Yavaş Alt Op</th>
                <th className="px-4 py-2 text-center font-semibold">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {calc.perMain.map(p => (
                <tr key={p.mainOp.id} className={p.mainOp.id === calc.bottleneckId ? 'bg-red-50/40' : ''}>
                  <td className="px-4 py-2 font-sans">
                    <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ backgroundColor: p.mainOp.color }}></span>
                    {p.mainOp.name}
                  </td>
                  <td className="px-4 py-2 text-right">{p.subs.length}</td>
                  <td className="px-4 py-2 text-right">{p.totalCycle.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right">{p.smv.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{p.stations}</td>
                  <td className="px-4 py-2 text-right font-semibold">{p.capacity.toFixed(0)}</td>
                  <td className="px-4 py-2 text-left font-sans text-xs text-slate-600">{p.slowest?.name ?? '—'} {p.slowest && <span className="text-slate-400">({p.slowest.cycleTime}sn)</span>}</td>
                  <td className="px-4 py-2 text-center">
                    {p.mainOp.id === calc.bottleneckId
                      ? <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded font-sans">DARBOĞAZ</span>
                      : <span className="text-[10px] bg-emerald-600/15 text-emerald-700 px-2 py-0.5 rounded font-sans">uygun</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Öneriler */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-5">
        <h3 className="font-semibold flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-amber-600" />Hat Dengeleme Önerileri</h3>
        <ul className="text-sm space-y-1.5 text-slate-700">
          {calc.perMain.map(p => {
            if (p.mainOp.id === calc.bottleneckId) {
              return <li key={p.mainOp.id}>🔴 <b>{p.mainOp.name}</b> darboğazı oluşturuyor. En yavaş alt op: <b>{p.slowest?.name} ({p.slowest?.cycleTime} sn)</b>. Burayı bölmek / otomat eklemek / ikinci operatör atamak hat çıktısını artırır.</li>;
            }
            if (p.capacity > calc.lineCapacity * 1.5) {
              return <li key={p.mainOp.id}>🟢 <b>{p.mainOp.name}</b> kapasitesi fazla ({p.capacity.toFixed(0)}/v). Buradan 1 operatörü darboğaz bandına kaydırabilirsiniz.</li>;
            }
            return null;
          })}
          {calc.perMain.some(p => p.subs.some(s => !s.machineId && ['DİKİM','OVERLOK','ÇİMA','REÇME','PUNTEREZ','OTOMAT','ÜTÜ'].includes(s.type))) && (
            <li>⚙️ Bazı dikim/overlok alt operasyonlarına makine atanmamış — Kaynaklar sekmesinden sürükleyip atayın.</li>
          )}
          {calc.perMain.some(p => p.subs.some(s => !s.operatorId)) && (
            <li>👤 Bazı alt operasyonlarda operatör atanmamış. Kaynaklar sekmesinden operatör sürükleyin.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function BigKpi({ label, value, unit, tone, icon: Icon }) {
  const tones = {
    cyan:  'from-cyan-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
    slate: 'from-slate-600 to-slate-800',
  };
  return (
    <div className={`bg-gradient-to-br ${tones[tone]} text-white rounded-lg p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wider opacity-80">{label}</span>
        <Icon className="w-4 h-4 opacity-70" />
      </div>
      <div className="text-3xl font-mono font-semibold leading-tight">{value}</div>
      <div className="text-xs opacity-80 mt-0.5">{unit}</div>
    </div>
  );
}

/* ============================================================
   Modallar: alt-op, ana-op, ayarlar
   ============================================================ */
function ModelSaveDialog({ defaultName, meta, statCount, hasResult, onClose, onSave }) {
  const [name, setName] = useState(defaultName || '');
  const [includeResult, setIncludeResult] = useState(hasResult);
  const canSave = name.trim().length > 0;

  return (
    <Modal title="Bu Modeli Kaydet" onClose={onClose} width="max-w-xl">
      <Field label="Model Adı *" hint="Örn: 'Erkek 5 Cep Denim', 'Kadın Ceket — Arka Otomat 2x', 'Capri v2'">
        <input
          className={inputCls}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Model adı veya senaryo adı"
          onKeyDown={(e) => { if (e.key === 'Enter' && canSave) { onSave(name.trim(), includeResult); } }}
        />
      </Field>
      {meta && Object.keys(meta).length > 0 && (
        <div className="bg-slate-50 rounded border border-slate-200 p-3 text-xs text-slate-700 mb-3">
          <div className="font-semibold text-slate-800 mb-1">Meta bilgiler (otomatik dahil)</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {meta.modelAdi   && <div>Model: <b>{meta.modelAdi}</b></div>}
            {meta.modelNo    && <div>PLM: <b>{meta.modelNo}</b></div>}
            {meta.atolyeAdi  && <div>Atölye: <b>{meta.atolyeAdi}</b></div>}
            {meta.musteri    && <div>Müşteri: <b>{meta.musteri}</b></div>}
            {meta.tarih      && <div>Tarih: <b>{String(meta.tarih)}</b></div>}
            {meta.siparisAdedi != null && <div>Adet: <b>{meta.siparisAdedi}</b></div>}
          </div>
        </div>
      )}
      <div className="bg-cyan-50 border border-cyan-200 rounded p-3 text-xs text-slate-700 mb-3">
        <b>Kaydedilenler:</b> {statCount.mainOps} ana op · {statCount.subOps} alt op · {statCount.machines} makine · {statCount.operators} operatör · meta bilgileri · bağlantılar ve pozisyonlar.
      </div>
      {hasResult && (
        <label className="flex items-start gap-2 text-xs text-slate-700 mb-3 cursor-pointer">
          <input type="checkbox" checked={includeResult} onChange={e => setIncludeResult(e.target.checked)} className="mt-0.5" />
          <span>
            <b>Simülasyon sonucunu da kaydet</b> — mevcut zirve kuyruklar, tamamlanan sayılar, çıkış kaydedilir; sonradan karşılaştırabilirsin.
          </span>
        </label>
      )}
      <div className="flex justify-end gap-2 mt-1 pt-3 border-t border-slate-100">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded">İptal</button>
        <button onClick={() => canSave && onSave(name.trim(), includeResult)}
          disabled={!canSave}
          className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1.5 disabled:opacity-40">
          <Save className="w-3.5 h-3.5" />Kaydet
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children, width = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-lg shadow-xl w-full ${width}`} onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500 mt-0.5 block">{hint}</span>}
    </label>
  );
}

const inputCls = 'mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500';

function SubOpModal({ subOp, data, onSave, onClose }) {
  const [form, setForm] = useState(subOp);
  const up = (patch) => setForm(f => ({ ...f, ...patch }));
  return (
    <Modal title="Alt Operasyon Düzenle" onClose={onClose}>
      <Field label="Ad">
        <input className={inputCls} value={form.name} onChange={e => up({ name: e.target.value })} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ana Operasyon">
          <select className={inputCls} value={subParent(form)} onChange={e => up({ mainOpId: e.target.value, parentId: e.target.value })}>
            {data.mainOps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Operasyon Tipi">
          <select className={inputCls} value={form.type} onChange={e => up({ type: e.target.value })}>
            {OP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Çevrim Süresi (saniye)" hint="Pratik, saha ölçümü. Boşsa MTM teoriği kullanılır.">
        <input type="number" step="0.01" className={inputCls} value={form.cycleTime} onChange={e => up({ cycleTime: parseFloat(e.target.value) || 0 })} />
      </Field>
      {form.cycleTime > 0 && (
        <div className="-mt-1 mb-3 rounded-lg border border-cyan-200 bg-cyan-50/60 overflow-hidden">
          <div className="px-3 py-1.5 bg-cyan-600/10 border-b border-cyan-200 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-cyan-900 uppercase tracking-wider">Tek Operatörün Max Çıktısı</span>
            <span className="text-[10px] text-cyan-700 font-mono">formül: N = Süre / Çevrim</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-2 font-mono">
            <div className="bg-white rounded px-2 py-1.5 border border-cyan-100">
              <div className="text-[9px] text-cyan-700 uppercase tracking-wider">Dakikada</div>
              <div className="text-lg font-bold text-cyan-900 leading-tight">{(60 / form.cycleTime).toFixed(1)}</div>
              <div className="text-[10px] text-slate-500">adet/dk</div>
            </div>
            <div className="bg-white rounded px-2 py-1.5 border border-cyan-100">
              <div className="text-[9px] text-cyan-700 uppercase tracking-wider">Saatte</div>
              <div className="text-lg font-bold text-cyan-900 leading-tight">{(3600 / form.cycleTime).toFixed(0)}</div>
              <div className="text-[10px] text-slate-500">adet/saat</div>
            </div>
            <div className="bg-white rounded px-2 py-1.5 border border-cyan-100">
              <div className="text-[9px] text-cyan-700 uppercase tracking-wider">540 dk · η 85%</div>
              <div className="text-lg font-bold text-cyan-900 leading-tight">{((540 * 60 * 0.85) / form.cycleTime).toFixed(0)}</div>
              <div className="text-[10px] text-slate-500">adet/vardiya</div>
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Makine">
          <select className={inputCls} value={form.machineId ?? ''} onChange={e => up({ machineId: e.target.value || null })}>
            <option value="">— (yok)</option>
            {data.machines.map(m => <option key={m.id} value={m.id}>{m.name} · {m.type}</option>)}
          </select>
        </Field>
        <Field label="Operatör">
          <select className={inputCls} value={form.operatorId ?? ''} onChange={e => up({ operatorId: e.target.value || null })}>
            <option value="">— (yok)</option>
            {data.operators.map(o => <option key={o.id} value={o.id}>{o.name} · L{o.skill}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="İstasyon / Paralel Operatör" hint="Aynı işi kaç operatör paralel yapıyor? Kapasiteyi çarpar.">
          <input type="number" min="1" className={inputCls} value={form.stationCount ?? 1}
            onChange={e => up({ stationCount: Math.max(1, parseInt(e.target.value) || 1) })} />
        </Field>
        <Field label="Birleşme Tipi (gelen bağlantılar)" hint="Bu op'a birden fazla giriş varsa: VE = en yavaşa göre (senkron), Çoğaltma = kapasiteler toplanır.">
          <select className={inputCls} value={form.joinType || 'AND'} onChange={e => up({ joinType: e.target.value })}>
            <option value="AND">VE — senkron (min)</option>
            <option value="DUP">Çoğaltma — toplam</option>
          </select>
        </Field>
      </div>

      <Field label="Sonraki Alt Operasyonlar (Simülasyon Akışı)" hint="Bu operasyon bitince hangi alt operasyonlara parça akacak? Birden fazla seçim = FORK. Başkalarının bu op'u seçmesi = MERGE (birleşme).">
        <div className="mt-1 max-h-48 overflow-y-auto border border-slate-200 rounded p-2 space-y-0.5 bg-slate-50">
          {data.subOps.filter(s => s.id !== form.id).length === 0 && <div className="text-sm text-slate-500 px-2 py-1">Başka alt operasyon yok.</div>}
          {data.mainOps.map(mo => {
            const subs = data.subOps.filter(s => s.mainOpId === mo.id && s.id !== form.id).sort((a,b) => a.order - b.order);
            if (subs.length === 0) return null;
            return (
              <div key={mo.id} className="bg-white rounded border border-slate-100 p-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 mb-1" style={{ color: mo.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: mo.color }} />{mo.name}
                </div>
                {subs.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded">
                    <input type="checkbox"
                      checked={(form.nextIds || []).includes(s.id)}
                      onChange={() => {
                        const curr = form.nextIds || [];
                        up({ nextIds: curr.includes(s.id) ? curr.filter(x => x !== s.id) : [...curr, s.id] });
                      }} />
                    <span>{s.name}</span>
                    <span className="ml-auto text-[10px] text-slate-400 font-mono">{s.cycleTime} sn</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </Field>
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded">İptal</button>
        <button onClick={() => onSave(form)} className="px-4 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" />Kaydet
        </button>
      </div>
    </Modal>
  );
}

function MainOpModal({ mainOp, allMainOps, onSave, onClose }) {
  const [form, setForm] = useState(mainOp);
  const others = allMainOps.filter(m => m.id !== mainOp.id);
  const toggleNext = (id) => {
    setForm(f => ({
      ...f,
      nextIds: f.nextIds.includes(id) ? f.nextIds.filter(x => x !== id) : [...f.nextIds, id]
    }));
  };
  return (
    <Modal title="Ana Operasyon Düzenle" onClose={onClose}>
      <Field label="Ad">
        <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Renk">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {PALETTE.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                className={`w-7 h-7 rounded border-2 transition ${form.color === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </Field>
        <Field label="Sıra" hint="Akışta yatay pozisyon.">
          <input type="number" className={inputCls} value={form.order} onChange={e => setForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))} />
        </Field>
      </div>
      <Field label="Sonraki Operasyonlar (Ardıllar)" hint="Bu operasyon bittikten sonra hangi operasyonları besler?">
        <div className="space-y-1 mt-1">
          {others.length === 0 && <div className="text-sm text-slate-500">Başka ana operasyon yok.</div>}
          {others.map(o => (
            <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1.5 rounded">
              <input type="checkbox" checked={form.nextIds.includes(o.id)} onChange={() => toggleNext(o.id)} />
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: o.color }}></span>
              {o.name}
            </label>
          ))}
        </div>
      </Field>
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded">İptal</button>
        <button onClick={() => onSave(form)} className="px-4 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" />Kaydet
        </button>
      </div>
    </Modal>
  );
}

function SettingsModal({ settings, onSave, onClose }) {
  const [form, setForm] = useState(settings);
  return (
    <Modal title="Hat Ayarları" onClose={onClose}>
      <Field label="Net Vardiya Dakikası" hint="Toplam çalışma − molalar (tipik: 540 dk).">
        <input type="number" className={inputCls} value={form.netMinutes} onChange={e => setForm(f => ({ ...f, netMinutes: parseInt(e.target.value) || 0 }))} />
      </Field>
      <Field label="Verim (Efficiency)" hint="0.0 – 1.0 arası. Tipik hedef 0.85.">
        <input type="number" step="0.01" min="0" max="1" className={inputCls} value={form.efficiency} onChange={e => setForm(f => ({ ...f, efficiency: parseFloat(e.target.value) || 0 }))} />
      </Field>
      <Field label="PF&D Allowance" hint="Personal/Fatigue/Delay; tipik 0.10 – 0.20.">
        <input type="number" step="0.01" min="0" max="0.5" className={inputCls} value={form.pfd} onChange={e => setForm(f => ({ ...f, pfd: parseFloat(e.target.value) || 0 }))} />
      </Field>
      <Field label="Günlük Talep" hint="Takt = NetDk / Talep.">
        <input type="number" className={inputCls} value={form.demand} onChange={e => setForm(f => ({ ...f, demand: parseInt(e.target.value) || 1 }))} />
      </Field>
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded">İptal</button>
        <button onClick={() => onSave(form)} className="px-4 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" />Kaydet
        </button>
      </div>
    </Modal>
  );
}

/* ============================================================
   Sekme 5: SİMÜLASYON — Discrete-event, canlı WIP birikimi ve gün sonu tahmini
   ============================================================ */
function SimView({ data, calc, simState, onStart, onPause, onReset, onSpeed, onFastForward, onAutoSetup,
                   onSaveScenario, onLoadScenario, onDeleteScenario, onDuplicateScenario, onRenameScenario }) {
  const [showSaveModelDialog, setShowSaveModelDialog] = useState(false);
  const [saveModelName, setSaveModelName] = useState('');
  const scenarios = data.scenarios || [];
  const maxSec = (data.settings?.netMinutes || 540) * 60;
  const pctElapsed = Math.min(100, (simState.elapsed / maxSec) * 100);

  // Saat gösterimi: vardiyanın 08:00'da başladığını varsay
  const shiftStartHour = 8;
  const simClock = (() => {
    const totalMin = shiftStartHour * 60 + simState.elapsed / 60;
    const h = Math.floor(totalMin / 60) % 24;
    const m = Math.floor(totalMin % 60);
    const s = Math.floor(simState.elapsed % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  })();

  // Alt op başına toplam kuyruk (tüm predecessor'lerden gelen bekleyen parçalar toplamı)
  const queueOf = (opId) => {
    const pend = simState.pending[opId] || {};
    return Object.values(pend).reduce((a, v) => a + (v > 0 ? v : 0), 0);
  };

  // Toplam WIP = tüm kuyruklar + tüm işlenmekte olanlar
  const totalWIP = data.subOps.reduce((sum, op) => {
    return sum + queueOf(op.id) + (simState.inProgress[op.id] ? 1 : 0);
  }, 0);

  // Darboğaz cycle time — tüm alt opların maksimum çevrim süresi (fiziksel limit)
  const bottleneckCycleSn = Math.max(...data.subOps.map(s => s.cycleTime || 0), 0.001);
  const bottleneckOp = data.subOps.find(s => s.cycleTime === bottleneckCycleSn);
  const bottleneckMainOp = bottleneckOp ? data.mainOps.find(m => m.id === bottleneckOp.mainOpId) : null;

  // Darboğaz-tabanlı gün sonu: netMin × (60 / maxCycle)
  const bottleneckDailyMax = Math.floor((data.settings.netMinutes * 60) / bottleneckCycleSn);
  // Beklenen çıktı (darboğaz-tabanlı — gerçek fiziksel üst sınır)
  const expectedOutput = bottleneckDailyMax;
  // SMV-tabanlı teorik (eski formül — bant dengeli ve parallel operatör varsayar, daha optimist)
  const smvBasedOutput = Math.floor(calc.lineCapacity || 0);

  // Saat bazlı çıktı trendi için history'yi işle
  const chartData = simState.history.map(h => ({
    time: h.t / 60, // dakika
    exited: h.exited,
    label: (() => {
      const totalMin = shiftStartHour * 60 + h.t / 60;
      const hr = Math.floor(totalMin / 60) % 24;
      const mn = Math.floor(totalMin % 60);
      return `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;
    })()
  }));

  // Güncel çıktı hızı (adet/dakika) — son 5 dk ortalaması
  const currentRate = (() => {
    if (chartData.length < 2) return 0;
    const last = chartData[chartData.length - 1];
    const ref = chartData.reverse().find(p => last.time - p.time >= 5) || chartData[0];
    chartData.reverse();
    const dt = last.time - ref.time;
    if (dt <= 0) return 0;
    return (last.exited - ref.exited) / dt;
  })();

  // Tahmini gün sonu çıktı (mevcut hıza göre projeksiyon — darboğaz üst sınırıyla CLAMP'lenmiş)
  const rawProjection = (() => {
    if (simState.elapsed < 60) return null;
    const remainingMin = (maxSec - simState.elapsed) / 60;
    return Math.round(simState.exited + currentRate * remainingMin);
  })();
  // Fiziksel gerçeklik: hiçbir üretim darboğaz limitini aşamaz (her parça en yavaş istasyondan geçer)
  const projectedEOD = rawProjection != null ? Math.min(rawProjection, bottleneckDailyMax) : null;
  const projectionClamped = rawProjection != null && rawProjection > bottleneckDailyMax;

  // Ana operasyonları sıraya göre dizelim
  const sortedMainOps = [...data.mainOps].sort((a, b) => a.order - b.order);

  // Darboğaz (en büyük zirve kuyruğa sahip istasyon)
  const topPeak = Object.entries(simState.peakQueue || {}).sort((a,b) => b[1] - a[1])[0];
  const worstStationId = topPeak?.[0];

  return (
    <div className="space-y-4">
      {/* Kayıtlı Modeller şeridi */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-white flex items-center gap-2 flex-wrap">
          <FolderOpen className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-semibold text-slate-800">Kayıtlı Modeller ({scenarios.length})</span>
          {data.meta?.modelAdi && (
            <span className="text-[11px] text-slate-500">
              · Mevcut: <span className="font-medium text-slate-800">{data.meta.modelAdi}</span>
            </span>
          )}
          <div className="flex-1" />
          <button onClick={() => {
              setSaveModelName(data.meta?.modelAdi || '');
              setShowSaveModelDialog(true);
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 font-medium">
            <Save className="w-3.5 h-3.5" /> Bu Modeli Kaydet
          </button>
        </div>
        {scenarios.length > 0 && (
          <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
            {scenarios.map(sc => {
              const isLoaded = sc.snapshot?.meta?.modelAdi && sc.snapshot.meta.modelAdi === data.meta?.modelAdi;
              return (
                <div key={sc.id}
                  className={`group flex items-center gap-1 rounded pl-2 pr-0.5 py-0.5 text-xs transition border ${
                    isLoaded ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'
                  }`}>
                  <button onClick={() => onLoadScenario(sc.id)}
                    className="hover:text-cyan-700 py-1 pr-1 font-medium flex items-center gap-1 truncate max-w-[220px]"
                    title={`${sc.name} · ${sc.snapshot.mainOps.length} ana op · ${sc.snapshot.subOps.length} alt op`}>
                    <Layers className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{sc.name}</span>
                  </button>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {sc.snapshot.subOps.length}op
                  </span>
                  {sc.result && (
                    <span className="text-emerald-600 font-mono text-[10px]" title={`Simülasyon çıktısı: ${sc.result.exited} adet`}>
                      ✓{sc.result.exited}
                    </span>
                  )}
                  <button onClick={() => onDuplicateScenario(sc.id)} title="Kopyala"
                    className="p-1 text-slate-400 hover:text-slate-900 rounded">
                    <Copy className="w-3 h-3" />
                  </button>
                  <button onClick={() => {
                      const newName = prompt('Yeni ad:', sc.name);
                      if (newName && newName.trim()) onRenameScenario(sc.id, newName.trim());
                    }} title="Yeniden adlandır"
                    className="p-1 text-slate-400 hover:text-slate-900 rounded">
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button onClick={() => { if (confirm(`"${sc.name}" silinsin mi?`)) onDeleteScenario(sc.id); }} title="Sil"
                    className="p-1 text-slate-400 hover:text-red-600 rounded">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {scenarios.length === 0 && (
          <div className="px-4 py-2 text-[11px] text-slate-400 italic">
            Henüz kayıtlı model yok. Bir model üzerinde çalış, Excel yükle veya operasyonları ekle, sonra <b className="text-slate-600">Bu Modeli Kaydet</b>'e bas.
          </div>
        )}
      </div>

      {/* Model kaydet diyaloğu */}
      {showSaveModelDialog && (
        <ModelSaveDialog
          defaultName={saveModelName}
          meta={data.meta}
          statCount={{ mainOps: data.mainOps.length, subOps: data.subOps.length, machines: (data.machines || []).length, operators: (data.operators || []).length }}
          hasResult={simState.elapsed > 60}
          onClose={() => setShowSaveModelDialog(false)}
          onSave={(name, includeResult) => {
            onSaveScenario(name, { includeResult });
            setShowSaveModelDialog(false);
          }}
        />
      )}

      {/* Kontrol paneli */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-4 flex items-center gap-3 flex-wrap">
          {!simState.running ? (
            <button onClick={onStart}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold shadow-sm transition">
              <Play className="w-5 h-5" fill="currentColor" />{simState.elapsed > 0 ? 'Devam Et' : 'Başla'}
            </button>
          ) : (
            <button onClick={onPause}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold shadow-sm transition">
              <Pause className="w-5 h-5" fill="currentColor" />Duraklat
            </button>
          )}
          <button onClick={onReset}
            className="flex items-center gap-2 px-3 py-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
            <RotateCcw className="w-4 h-4" />Sıfırla
          </button>
          <div className="h-8 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 mr-1">Hız:</span>
            {[1, 10, 60, 300, 1000].map(sp => (
              <button key={sp} onClick={() => onSpeed(sp)}
                className={`text-sm px-2.5 py-1.5 rounded font-mono transition
                  ${simState.speed === sp ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                {sp}x
              </button>
            ))}
            <button onClick={onFastForward}
              className="ml-1.5 flex items-center gap-1 text-sm px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition font-medium"
              title="Vardiyanın sonuna koş (anında bitir)">
              <Zap className="w-3.5 h-3.5" /> Bitir
            </button>
          </div>
          <div className="flex-1" />
          <button onClick={onAutoSetup}
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-slate-200 rounded hover:bg-slate-50 text-slate-700">
            <Sparkles className="w-3.5 h-3.5" />Otomatik Öncelik Kur
          </button>
        </div>

        {/* İlerleme barı */}
        <div className="h-1.5 bg-slate-100">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
            style={{ width: `${pctElapsed}%` }} />
        </div>
      </div>

      {/* Anlık KPI'lar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SimKpi label="Vardiya Saati" value={simClock} unit={`${Math.floor(simState.elapsed/60)} / ${data.settings.netMinutes} dk`} icon={Clock} tone="slate" />
        <SimKpi label="Üretilen" value={simState.exited} unit={`darboğaz limiti ${expectedOutput.toLocaleString('tr-TR')}`} icon={CheckCircle2} tone="emerald" />
        <SimKpi label="Anlık Hız" value={currentRate.toFixed(2)} unit={`max ${(60/bottleneckCycleSn).toFixed(2)} ad/dk`} icon={Zap} tone="cyan" />
        <SimKpi label="Toplam WIP" value={totalWIP} unit="parça hat içinde" icon={Package} tone="amber" />
        <SimKpi
          label="Gün Sonu Tahmin"
          value={projectedEOD ?? '—'}
          unit={projectedEOD != null
            ? `vs limit ${expectedOutput.toLocaleString('tr-TR')}${projectionClamped ? ' (sınırlandı)' : ''}`
            : 'en az 1 dk sonra'}
          icon={TrendingUp}
          tone={projectedEOD != null && projectedEOD < expectedOutput * 0.9 ? 'red' : 'emerald'}
        />
      </div>

      {/* Darboğaz bilgi şeridi */}
      {bottleneckOp && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs flex items-center gap-3 flex-wrap">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-slate-700">
            <b>Darboğaz:</b> <span className="font-medium text-amber-900">{bottleneckOp.name}</span>
            {bottleneckMainOp && <span className="text-slate-500"> ({bottleneckMainOp.name})</span>}
            <span className="text-slate-500 ml-1">· {bottleneckCycleSn.toFixed(2)} sn çevrim</span>
          </span>
          <span className="text-slate-500">→</span>
          <span className="font-mono">max {(60/bottleneckCycleSn).toFixed(2)} ad/dk × {data.settings.netMinutes} dk = <b className="text-slate-900">{bottleneckDailyMax.toLocaleString('tr-TR')}</b> adet/vardiya</span>
          {smvBasedOutput !== bottleneckDailyMax && (
            <span className="text-slate-400 text-[10px] ml-auto">
              SMV formülü: {smvBasedOutput.toLocaleString('tr-TR')} (bant dengeli varsayar, daha optimist)
            </span>
          )}
        </div>
      )}

      {/* Canlı istasyon tablosu: ana op kolonu × alt op satırları */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Activity className="w-5 h-5 text-cyan-600" />Canlı Hat Durumu</h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 mt-1">
              <span className="inline-flex items-center gap-1">
                <span className="font-mono bg-amber-100 text-amber-800 px-1 rounded">▲ zirve</span>
                <span className="text-slate-500">bugünkü en yüksek kuyruk</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="font-mono bg-amber-50 text-amber-700 px-1 rounded">kuyruk</span>
                <span className="text-slate-500">şu an bekleyen WIP</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="font-mono bg-cyan-50 text-cyan-700 px-1 rounded">kaldı</span>
                <span className="text-slate-500">işlenen parçaya</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="font-mono bg-emerald-50 text-emerald-700 px-1 rounded">✓ çıkan</span>
                <span className="text-slate-500">istasyondan geçen toplam</span>
              </span>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-3 min-w-max pb-2">
            {sortedMainOps.map(mo => {
              const subs = data.subOps.filter(s => s.mainOpId === mo.id).sort((a,b) => a.order - b.order);
              const moTotalCompleted = subs.reduce((a, s) => a + (simState.completed[s.id] || 0), 0);
              const moTotalWIP = subs.reduce((a, s) => a + queueOf(s.id) + (simState.inProgress[s.id] ? 1 : 0), 0);
              return (
                <div key={mo.id} className="w-64 flex-shrink-0">
                  {/* Kolon başlığı */}
                  <div className="rounded-t border-b-2 px-3 py-2 flex items-center gap-2"
                    style={{ backgroundColor: mo.color + '10', borderBottomColor: mo.color }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: mo.color }} />
                    <span className="font-semibold text-sm">{mo.name}</span>
                    <span className="ml-auto text-[10px] font-mono text-slate-600 flex items-baseline gap-1.5">
                      <span title="Bu ana grupta şu an hat içinde olan parça sayısı">
                        <span className="text-[8px] text-slate-400 font-normal mr-0.5">hat içi</span>
                        <span className="font-bold">{moTotalWIP}</span>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span title="Bu ana gruptan tamamlanmış olarak geçen toplam parça (tüm alt istasyonların toplamı)">
                        <span className="text-[8px] text-slate-400 font-normal mr-0.5">çıkan</span>
                        <span className="font-bold text-emerald-700">✓{moTotalCompleted}</span>
                      </span>
                    </span>
                  </div>
                  {/* Alt op kartları */}
                  <div className="border border-slate-200 border-t-0 rounded-b p-1.5 space-y-1.5 bg-white">
                    {subs.map(s => {
                      const queue = queueOf(s.id);
                      const ip = simState.inProgress[s.id];
                      const completed = simState.completed[s.id] || 0;
                      const peak = simState.peakQueue[s.id] || 0;
                      const pct = ip ? (1 - ip.remainingSec / ip.totalSec) * 100 : 0;
                      const isWorst = worstStationId === s.id && peak > 3;
                      // Kuyruk renk durumu
                      const qColor = queue === 0 ? 'bg-slate-200' : queue < 3 ? 'bg-emerald-400' : queue < 8 ? 'bg-amber-400' : 'bg-red-500';
                      return (
                        <div key={s.id}
                          className={`relative border rounded p-2 transition ${isWorst ? 'border-red-400 bg-red-50/30 shadow-sm' : 'border-slate-200 bg-white'}`}>
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium truncate" title={s.name}>{s.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                <span className="text-slate-400">çevrim</span> {s.cycleTime} sn
                              </div>
                            </div>
                            {peak > 0 && (
                              <span
                                title={`Zirve birikim: bu istasyonda şimdiye kadar aynı anda en fazla ${peak} parça birikti`}
                                className={`text-[9px] font-mono px-1 rounded flex items-center gap-0.5 flex-shrink-0 ${isWorst ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                <span className="text-[8px] opacity-70">zirve</span>
                                <span className="font-bold">▲{peak}</span>
                              </span>
                            )}
                          </div>

                          {/* Kuyruk görsel (max 8 kutu) */}
                          <div className="flex items-center gap-1 mt-1.5 h-4" title="Kuyrukta bekleyen parçalar (her kutu 1 parça)">
                            {[...Array(Math.min(queue, 8))].map((_, i) => (
                              <div key={i} className={`${qColor} w-2 h-4 rounded-sm transition-all`} />
                            ))}
                            {queue > 8 && (
                              <span className="text-[10px] text-slate-600 font-mono font-bold ml-0.5">+{queue - 8}</span>
                            )}
                            {queue === 0 && !ip && (
                              <span className="text-[9px] text-slate-400 italic">boş</span>
                            )}
                            {queue === 0 && ip && (
                              <span className="text-[9px] text-cyan-600 italic">işleniyor</span>
                            )}
                            <span className="ml-auto text-[10px] font-mono text-amber-700 font-bold flex items-baseline gap-0.5"
                              title="Şu anki toplam kuyruk (bekleyen + işlenen)">
                              <span className="text-[8px] font-normal text-slate-500">kuyruk</span>
                              {queue}
                            </span>
                          </div>

                          {/* İlerleme barı */}
                          <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden"
                            title={ip ? `İşlenen parçanın %${pct.toFixed(0)}'ı tamamlandı` : 'Şu an işlenen parça yok'}>
                            {ip && (
                              <div className="h-full bg-cyan-500 transition-all"
                                style={{ width: `${pct}%` }} />
                            )}
                          </div>

                          <div className="flex justify-between mt-1 text-[10px] font-mono">
                            <span className="text-slate-400" title="İşlenmekte olan parçanın bitmesine kalan saniye">
                              {ip ? (
                                <><span className="text-[8px] font-normal opacity-70">kaldı</span> {ip.remainingSec.toFixed(1)}sn</>
                              ) : '—'}
                            </span>
                            <span className="text-emerald-700 font-bold flex items-baseline gap-0.5"
                              title="Bu istasyondan tamamlanmış olarak geçen parça sayısı">
                              <span className="text-[8px] font-normal text-slate-500">çıkan</span>
                              ✓{completed}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {subs.length === 0 && (
                      <div className="text-xs text-slate-400 italic text-center py-4">alt op yok</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Çıktı trendi grafiği */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            Kümülatif Çıktı — Vardiya Boyunca
          </h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} label={{ value: 'adet', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4 }}
                  formatter={(v) => [v + ' adet', 'Toplam Çıktı']} />
                <ReferenceLine y={expectedOutput} stroke="#dc2626" strokeDasharray="5 5"
                  label={{ value: `Hedef ${expectedOutput.toFixed(0)}`, fontSize: 10, fill: '#dc2626', position: 'right' }} />
                <Bar dataKey="exited" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* WIP birikim özeti */}
      {Object.keys(simState.peakQueue || {}).length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-red-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            WIP Birikim Sıralaması (En Çok Biriktiren İstasyonlar)
          </h3>
          <div className="grid md:grid-cols-2 gap-2">
            {Object.entries(simState.peakQueue)
              .sort((a,b) => b[1] - a[1])
              .slice(0, 6)
              .filter(([,v]) => v > 0)
              .map(([opId, peak]) => {
                const op = data.subOps.find(s => s.id === opId);
                const mo = data.mainOps.find(m => m.id === op?.mainOpId);
                if (!op) return null;
                return (
                  <div key={opId} className="bg-white rounded border border-slate-200 px-3 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: mo?.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{op.name}</div>
                      <div className="text-[11px] text-slate-500">{mo?.name} · {op.cycleTime} sn çevrim</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold font-mono text-red-700">{peak}</div>
                      <div className="text-[9px] text-slate-500 uppercase">zirve WIP</div>
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="mt-3 text-xs text-slate-600">
            💡 <b>Yorum:</b> Yüksek birikim noktaları darboğazdır — bir önceki adım bu istasyondan daha hızlı üretiyor, bu istasyon yetişemiyor. Çözüm: daha hızlı makine / ek operatör / iş bölme.
          </div>
        </div>
      )}

      {/* Tavsiye paneli — vardiya analizi + aksiyon önerileri */}
      {simState.elapsed > 60 && (
        <AdvicePanel
          data={data}
          calc={calc}
          simState={simState}
          bottleneckDailyMax={bottleneckDailyMax}
          bottleneckCycleSn={bottleneckCycleSn}
        />
      )}
    </div>
  );
}

/* ============================================================
   Tavsiye paneli — simülasyon sonu darboğaz analizi ve aksiyon önerileri
   ============================================================ */
function AdvicePanel({ data, calc, simState, bottleneckDailyMax, bottleneckCycleSn }) {
  const maxSec = (data.settings?.netMinutes || 540) * 60;
  const elapsed = Math.max(1, simState.elapsed);
  const taktTarget = calc.taktTimeSec;  // hedef takt
  const siparis = Number(data.meta?.siparisAdedi) || 10000;

  // Her alt operasyon için metrikler
  const analysis = useMemo(() => {
    return data.subOps.map(s => {
      const mo = data.mainOps.find(m => m.id === s.mainOpId);
      const completed = simState.completed[s.id] || 0;
      const peak = simState.peakQueue[s.id] || 0;
      const pend = simState.pending[s.id] || {};
      const currentQueue = Object.values(pend).reduce((a, v) => a + (v > 0 ? v : 0), 0);

      // Utilization: çalıştığı süre / toplam geçen süre
      const busySec = completed * s.cycleTime;
      const utilPct = Math.min(100, (busySec / elapsed) * 100);

      // Takt aşımı: çevrim süresi takt'tan büyükse istasyon tek başına hedef hıza yetişemez
      const taktBreach = s.cycleTime > taktTarget;
      const taktRatio = s.cycleTime / Math.max(1, taktTarget);

      let state = 'balanced';      // dengeli
      if (taktBreach) state = 'bottleneck_critical';  // takt aşımı — kritik
      else if (utilPct >= 95) state = 'bottleneck_soft'; // tam dolu — darboğaz
      else if (peak >= 20 && utilPct >= 80) state = 'bottleneck_soft';
      else if (utilPct < 40) state = 'idle';           // boşta
      else if (utilPct < 70) state = 'lightly_loaded';

      return {
        id: s.id, name: s.name, mainOpId: s.mainOpId, mainName: mo?.name, mainColor: mo?.color,
        cycleTime: s.cycleTime, completed, peak, currentQueue,
        busySec, utilPct, taktBreach, taktRatio, state,
      };
    }).sort((a, b) => b.peak - a.peak || b.utilPct - a.utilPct);
  }, [data, simState, elapsed, taktTarget]);

  // Özet metrikler
  const bottlenecks = analysis.filter(a => a.state === 'bottleneck_critical' || a.state === 'bottleneck_soft');
  const idleStations = analysis.filter(a => a.state === 'idle');
  const lightlyLoaded = analysis.filter(a => a.state === 'lightly_loaded');

  // Ana grup bazlı yük dengesi
  const mainGroupAnalysis = useMemo(() => {
    return data.mainOps.map(mo => {
      const subs = analysis.filter(a => a.mainOpId === mo.id);
      if (subs.length === 0) return null;
      const avgUtil = subs.reduce((s, x) => s + x.utilPct, 0) / subs.length;
      const maxUtil = Math.max(...subs.map(x => x.utilPct));
      const minUtil = Math.min(...subs.map(x => x.utilPct));
      const imbalance = maxUtil - minUtil;
      const totalQueue = subs.reduce((s, x) => s + x.currentQueue, 0);
      return { id: mo.id, name: mo.name, color: mo.color, subCount: subs.length, avgUtil, maxUtil, minUtil, imbalance, totalQueue };
    }).filter(Boolean);
  }, [data, analysis]);

  // Sipariş tamamlama projeksiyonu
  // Gerçek günlük çıktı (sim'den, darboğaz üst sınırıyla clamp'lenmiş)
  const rawGunlukCikti = (simState.exited / elapsed) * maxSec || 0;
  const gunlukCikti = Math.min(rawGunlukCikti, bottleneckDailyMax);
  const tahminiGun = gunlukCikti > 0 ? siparis / gunlukCikti : Infinity;
  // Hedef günlük çıktı = darboğaz-tabanlı üst sınır (fiziksel maksimum)
  const hedefGunlukCikti = bottleneckDailyMax || 1;
  const hedefGun = hedefGunlukCikti > 0 ? siparis / hedefGunlukCikti : Infinity;
  const kayipGun = Math.max(0, tahminiGun - hedefGun);

  // Tavsiyeler üret
  const recommendations = useMemo(() => {
    const recs = [];

    for (const a of bottlenecks.slice(0, 5)) {
      if (a.state === 'bottleneck_critical') {
        const paralelSayisi = Math.ceil(a.taktRatio);
        recs.push({
          sev: 'critical',
          tone: 'red',
          station: a.name,
          main: a.mainName,
          title: `Kritik darboğaz — ${a.name}`,
          body: `Çevrim ${a.cycleTime.toFixed(2)} sn, hedef takt ${taktTarget.toFixed(2)} sn. Bu istasyon tek başına **hedef hıza yetişemez**.`,
          action: `Öneri: ${paralelSayisi} paralel istasyon (aynı op için ${paralelSayisi - 1} ek makine/operatör) VEYA operasyonu ${paralelSayisi} alt parçaya böl.`,
          impact: `Açılırsa bu istasyonun etkin çevrim süresi ~${(a.cycleTime / paralelSayisi).toFixed(2)} sn'ye düşer.`,
        });
      } else {
        recs.push({
          sev: 'high',
          tone: 'amber',
          station: a.name,
          main: a.mainName,
          title: `Yoğun darboğaz — ${a.name}`,
          body: `Kullanım %${a.utilPct.toFixed(0)}, zirve kuyruk ${a.peak}. Çevrim (${a.cycleTime.toFixed(2)} sn) takt (${taktTarget.toFixed(2)} sn) altında ama yine de birikim var — önceki istasyonlar daha hızlı besliyor.`,
          action: `Öneri: one-piece flow kurulumu (küçük parti), önceki istasyonun hızını bu istasyona uyarla veya buraya +1 operatör ekle.`,
          impact: `Kuyruk azalır, sonraki istasyonların beklemesi azalır.`,
        });
      }
    }

    // Boşta istasyonlar
    if (idleStations.length > 0) {
      const top = idleStations.slice(0, 3);
      recs.push({
        sev: 'medium',
        tone: 'slate',
        station: top.map(s => s.name).join(', '),
        main: 'Boşta kalan istasyonlar',
        title: `${idleStations.length} istasyon düşük yükte (<%40)`,
        body: `Bu istasyonlar zamanlarının yarısından azını çalışarak geçiriyor. Operatör idle.`,
        action: `Öneri: Yüksek yüklü istasyonla birleştir (multi-skill operatör), ya da paralel bir sipariş için kullan.`,
        impact: `Gereksiz operatör maliyeti düşer.`,
      });
    }

    // Hat dengesi
    const dengesizAnaGruplar = mainGroupAnalysis.filter(g => g.imbalance > 40);
    if (dengesizAnaGruplar.length > 0) {
      for (const g of dengesizAnaGruplar) {
        recs.push({
          sev: 'medium',
          tone: 'amber',
          station: g.name,
          main: g.name,
          title: `${g.name} — hat dengesiz`,
          body: `Bu ana grup içinde en yavaş ve en hızlı istasyon arasında %${g.imbalance.toFixed(0)} fark var. Ortalama yük %${g.avgUtil.toFixed(0)}.`,
          action: `Öneri: İstasyonlar arası iş bölümünü yeniden dengele (line balancing). Yavaş istasyonun bir parçasını hızlıya aktar.`,
          impact: `Ortalama yük ~%${((g.avgUtil + g.maxUtil) / 2).toFixed(0)}'a çıkar, akış düzelir.`,
        });
      }
    }

    // Sipariş özeti
    if (Number.isFinite(tahminiGun)) {
      const kayipAdet = (tahminiGun - hedefGun) * hedefGunlukCikti;
      recs.push({
        sev: 'info',
        tone: 'emerald',
        station: '—',
        main: 'Genel',
        title: `${siparis.toLocaleString('tr-TR')} adet sipariş için proje süresi`,
        body: `Mevcut hızla: **${tahminiGun.toFixed(1)} gün**. Teorik hedef kapasiteyle: **${hedefGun.toFixed(1)} gün**. ` +
              (kayipGun > 0.5 ? `Kayıp: ~${kayipGun.toFixed(1)} gün (yaklaşık ${Math.round(kayipAdet).toLocaleString('tr-TR')} adet üretim eksiği).` : 'Hat teorik kapasiteye yakın.'),
        action: kayipGun > 0.5 ? `Yukarıdaki darboğazları açarsan hedef ${hedefGun.toFixed(1)} güne yaklaşırsın.` : 'Mevcut akış yeterli.',
        impact: '',
      });
    }

    return recs;
  }, [bottlenecks, idleStations, mainGroupAnalysis, siparis, tahminiGun, hedefGun, kayipGun, hedefGunlukCikti, taktTarget]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          Hat Analizi ve Tavsiyeler
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Vardiyanın %{Math.round((simState.elapsed / maxSec) * 100)}'i ilerledi. Tavsiyeler canlı güncellenir; simülasyon sonunda en doğru tablo çıkar.
        </p>
      </div>

      {/* Üst özet şeridi */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-slate-200">
        <SummaryBox
          label="Sipariş"
          value={siparis.toLocaleString('tr-TR')}
          sub={`tahmini ${Number.isFinite(tahminiGun) ? tahminiGun.toFixed(1) : '—'} gün`}
          tone="slate"
        />
        <SummaryBox
          label="Darboğaz"
          value={bottlenecks.length}
          sub={bottlenecks[0] ? `en kötü: ${bottlenecks[0].name}` : 'yok'}
          tone={bottlenecks.length > 0 ? 'red' : 'emerald'}
        />
        <SummaryBox
          label="Boşta İstasyon"
          value={idleStations.length}
          sub={idleStations.length > 0 ? 'operatör yetersiz kullanım' : 'iyi'}
          tone={idleStations.length > 3 ? 'amber' : 'slate'}
        />
        <SummaryBox
          label="Teorik Hedef Fark"
          value={kayipGun > 0 ? `+${kayipGun.toFixed(1)} gün` : '≈ 0'}
          sub={kayipGun > 0 ? 'iyileştirme potansiyeli' : 'kapasite sınırında'}
          tone={kayipGun > 2 ? 'red' : kayipGun > 0.5 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Ana grup yük dengesi */}
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Ana Grup Yük Dengesi</div>
        <div className="space-y-1.5">
          {mainGroupAnalysis.map(g => {
            const barColor = g.avgUtil > 90 ? 'bg-red-500' : g.avgUtil > 70 ? 'bg-emerald-500' : g.avgUtil > 40 ? 'bg-amber-500' : 'bg-slate-300';
            return (
              <div key={g.id} className="flex items-center gap-3 text-xs">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                <span className="w-24 font-medium truncate">{g.name}</span>
                <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden relative">
                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(100, g.avgUtil)}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-semibold text-slate-900 mix-blend-difference text-white">
                    %{g.avgUtil.toFixed(0)}
                  </span>
                </div>
                <span className="w-28 text-right text-slate-500 text-[11px] font-mono">
                  {g.subCount} op · fark %{g.imbalance.toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tavsiye kartları */}
      <div className="px-4 py-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Aksiyon Önerileri ({recommendations.length})</div>
        {recommendations.length === 0 && (
          <div className="text-xs text-slate-400 italic py-4 text-center">Henüz yeterli veri yok — simülasyonu biraz daha ilerlet.</div>
        )}
        {recommendations.map((r, i) => (
          <RecCard key={i} rec={r} />
        ))}
      </div>
    </div>
  );
}

function SummaryBox({ label, value, sub, tone }) {
  const tones = {
    slate: 'bg-slate-50',
    red: 'bg-red-50 text-red-900',
    amber: 'bg-amber-50 text-amber-900',
    emerald: 'bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={`px-4 py-3 border-r border-slate-200 last:border-r-0 ${tones[tone] || tones.slate}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-60 font-semibold">{label}</div>
      <div className="text-lg font-bold font-mono mt-0.5">{value}</div>
      <div className="text-[11px] opacity-70 mt-0.5 truncate">{sub}</div>
    </div>
  );
}

function RecCard({ rec }) {
  const tones = {
    red: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600', tag: 'bg-red-100 text-red-800' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600', tag: 'bg-amber-100 text-amber-800' },
    slate: { bg: 'bg-slate-50', border: 'border-slate-200', icon: 'text-slate-600', tag: 'bg-slate-200 text-slate-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', tag: 'bg-emerald-100 text-emerald-800' },
  };
  const t = tones[rec.tone] || tones.slate;
  const sevLabel = rec.sev === 'critical' ? 'KRİTİK' : rec.sev === 'high' ? 'ÖNEMLİ' : rec.sev === 'medium' ? 'ORTA' : 'BİLGİ';
  return (
    <div className={`border rounded-lg p-3 ${t.bg} ${t.border}`}>
      <div className="flex items-start gap-2">
        <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${t.tag} flex-shrink-0 mt-0.5`}>
          {sevLabel}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900">{rec.title}</div>
          <div className="text-xs text-slate-600 mt-1" dangerouslySetInnerHTML={{
            __html: rec.body.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
          }} />
          {rec.action && (
            <div className="text-xs text-slate-800 mt-1.5 pl-2 border-l-2 border-slate-300">
              <span className="font-semibold text-purple-700">→ </span>{rec.action}
            </div>
          )}
          {rec.impact && (
            <div className="text-[11px] text-slate-500 italic mt-1">{rec.impact}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Rapor sekmesi — simülasyon sonrası/sırasında detaylı istasyon analizi
   ============================================================ */
function RaporView({ data, calc, simState }) {
  const [sortBy, setSortBy] = useState('peak'); // peak | util | completed | cycle | queue | name
  const [sortDir, setSortDir] = useState('desc');
  const [filterMain, setFilterMain] = useState('');  // '' = all
  const [filterState, setFilterState] = useState('');

  const elapsed = Math.max(1, simState.elapsed);
  const maxSec = (data.settings?.netMinutes || 540) * 60;
  const bottleneckCycleSn = Math.max(...data.subOps.map(s => s.cycleTime || 0), 0.001);
  const bottleneckDailyMax = Math.floor((data.settings.netMinutes * 60) / bottleneckCycleSn);
  const pctElapsed = (elapsed / maxSec) * 100;
  const finished = elapsed >= maxSec - 0.5;

  // Per-station analysis
  const stations = useMemo(() => {
    return data.subOps.map(s => {
      const mo = data.mainOps.find(m => m.id === s.mainOpId);
      const machine = data.machines?.find(m => m.id === s.machineId);
      const operator = data.operators?.find(o => o.id === s.operatorId);
      const completed = simState.completed[s.id] || 0;
      const peak = simState.peakQueue[s.id] || 0;
      const pend = simState.pending[s.id] || {};
      const currentQueue = Object.values(pend).reduce((a, v) => a + (v > 0 ? v : 0), 0);
      const busySec = completed * s.cycleTime;
      const utilPct = Math.min(100, (busySec / elapsed) * 100);
      const idleSec = Math.max(0, elapsed - busySec);
      const teorikAdet = Math.floor(elapsed / s.cycleTime);   // bu sürede tek başına max ne kadar üretir

      let state = 'balanced';
      let stateLabel = 'Dengeli';
      let stateColor = 'emerald';
      if (s.cycleTime >= bottleneckCycleSn * 0.95) { state = 'bottleneck'; stateLabel = 'Darboğaz'; stateColor = 'red'; }
      else if (utilPct >= 95 || peak >= 20) { state = 'bottleneck'; stateLabel = 'Yoğun'; stateColor = 'red'; }
      else if (utilPct < 40) { state = 'idle'; stateLabel = 'Boşta'; stateColor = 'slate'; }
      else if (utilPct < 70) { state = 'light'; stateLabel = 'Hafif Yük'; stateColor = 'amber'; }

      return {
        id: s.id, name: s.name, type: s.type,
        mainOpId: s.mainOpId, mainName: mo?.name || '—', mainColor: mo?.color || '#64748b',
        cycleTime: s.cycleTime,
        machineName: machine?.name || '',
        operatorName: operator?.name || '',
        operatorId: operator?.id || null,
        operatorSkills: operator?.skills || [],
        completed, peak, currentQueue, busySec, idleSec, utilPct, teorikAdet,
        eksik: Math.max(0, teorikAdet - completed),
        state, stateLabel, stateColor,
      };
    });
  }, [data, simState, elapsed, bottleneckCycleSn]);

  // Ana grup özeti
  const mainGroupStats = useMemo(() => {
    return data.mainOps
      .map(mo => {
        const subs = stations.filter(s => s.mainOpId === mo.id);
        if (subs.length === 0) return null;
        const totalCompleted = subs.reduce((a, s) => a + s.completed, 0);
        const avgUtil = subs.reduce((a, s) => a + s.utilPct, 0) / subs.length;
        const maxUtil = Math.max(...subs.map(s => s.utilPct));
        const minUtil = Math.min(...subs.map(s => s.utilPct));
        const bottleneckCount = subs.filter(s => s.state === 'bottleneck').length;
        const idleCount = subs.filter(s => s.state === 'idle').length;
        const totalCurrentQueue = subs.reduce((a, s) => a + s.currentQueue, 0);
        const totalPeakQueue = subs.reduce((a, s) => a + s.peak, 0);
        return {
          id: mo.id, name: mo.name, color: mo.color, order: mo.order,
          subCount: subs.length, totalCompleted, avgUtil, maxUtil, minUtil,
          imbalance: maxUtil - minUtil, bottleneckCount, idleCount,
          totalCurrentQueue, totalPeakQueue,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);
  }, [data, stations]);

  // Filter + sort
  const filteredStations = useMemo(() => {
    let list = stations;
    if (filterMain) list = list.filter(s => s.mainOpId === filterMain);
    if (filterState) list = list.filter(s => s.state === filterState);
    const dir = sortDir === 'desc' ? -1 : 1;
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name':  return a.name.localeCompare(b.name, 'tr') * dir;
        case 'cycle': return (a.cycleTime - b.cycleTime) * dir;
        case 'util':  return (a.utilPct - b.utilPct) * dir;
        case 'queue': return (a.currentQueue - b.currentQueue) * dir;
        case 'completed': return (a.completed - b.completed) * dir;
        case 'peak':
        default:       return (a.peak - b.peak) * dir;
      }
    });
    return list;
  }, [stations, sortBy, sortDir, filterMain, filterState]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const totalExited = simState.exited;
  const kayipPct = bottleneckDailyMax > 0 ? Math.max(0, 100 - (totalExited / bottleneckDailyMax) * 100) : 0;
  const bottleneckStations = stations.filter(s => s.state === 'bottleneck');
  const idleStations = stations.filter(s => s.state === 'idle');

  // Export CSV
  function exportCsv() {
    const rows = [
      ['Ana Grup', 'İstasyon', 'Tip', 'Çevrim (sn)', 'Makine', 'Operatör',
       'Tamamlanan', 'Teorik Kapasite', 'Eksik', 'Kullanım %', 'Boşta (sn)',
       'Zirve Kuyruk', 'Anlık Kuyruk', 'Durum'],
      ...stations.map(s => [
        s.mainName, s.name, s.type || '', s.cycleTime.toFixed(2),
        s.machineName, s.operatorName,
        s.completed, s.teorikAdet, s.eksik,
        s.utilPct.toFixed(1), s.idleSec.toFixed(0),
        s.peak, s.currentQueue, s.stateLabel,
      ]),
    ];
    const csv = rows.map(r => r.map(c => {
      const v = String(c ?? '');
      return /[";,\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(';')).join('\n');
    const modelAdi = data.meta?.modelAdi || 'model';
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sim_rapor_${modelAdi.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (simState.elapsed < 5) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-10 text-center">
        <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="font-semibold text-slate-700">Henüz rapor yok</h3>
        <p className="text-sm text-slate-500 mt-1">
          Simülasyon sekmesinden başlat (veya <b>⚡ Bitir</b>'e bas). Sonrasında istasyon bazlı performans raporu burada görünür.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Başlık ve meta */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-lg p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {data.meta?.modelAdi || 'Simülasyon Raporu'}
            </h2>
            <div className="text-xs text-slate-300 font-mono mt-1 flex flex-wrap gap-x-3">
              {data.meta?.modelNo && <span>PLM: {data.meta.modelNo}</span>}
              {data.meta?.atolyeAdi && <span>Atölye: {data.meta.atolyeAdi}</span>}
              {data.meta?.musteri && <span>Müşteri: {data.meta.musteri}</span>}
              <span>Vardiya: {data.settings.netMinutes} dk</span>
              <span>İlerleme: %{pctElapsed.toFixed(0)} {finished ? '(tamamlandı)' : ''}</span>
            </div>
          </div>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded text-sm backdrop-blur">
            <Download className="w-4 h-4" /> CSV İndir
          </button>
        </div>
      </div>

      {/* Genel Özet */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <ReportCard label="Toplam Çıkan" value={totalExited.toLocaleString('tr-TR')} sub={`${((totalExited/bottleneckDailyMax)*100).toFixed(0)}% darboğaz limitinin`} tone="emerald" />
        <ReportCard label="Darboğaz Limit" value={bottleneckDailyMax.toLocaleString('tr-TR')} sub={`${bottleneckCycleSn.toFixed(2)} sn max çevrim`} tone="slate" />
        <ReportCard label="Kayıp" value={`%${kayipPct.toFixed(0)}`} sub={kayipPct > 10 ? 'iyileştirme gerekli' : 'iyi'} tone={kayipPct > 30 ? 'red' : kayipPct > 10 ? 'amber' : 'emerald'} />
        <ReportCard label="Darboğaz İstasyon" value={bottleneckStations.length} sub={bottleneckStations[0]?.name || 'yok'} tone={bottleneckStations.length > 0 ? 'red' : 'emerald'} />
        <ReportCard label="Boşta İstasyon" value={idleStations.length} sub={idleStations.length > 3 ? 'çok atıl' : 'normal'} tone={idleStations.length > 3 ? 'amber' : 'slate'} />
      </div>

      {/* Ana Grup Özeti */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-600" /> Ana Grup Performansı
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-500 uppercase tracking-wider text-[10px]">
                <th className="px-4 py-2">Ana Grup</th>
                <th className="px-4 py-2 text-right">Op Sayısı</th>
                <th className="px-4 py-2 text-right">Tamamlanan</th>
                <th className="px-4 py-2 text-right">Ort. Kullanım</th>
                <th className="px-4 py-2">Denge (Min→Max)</th>
                <th className="px-4 py-2 text-right">Darboğaz</th>
                <th className="px-4 py-2 text-right">Boşta</th>
                <th className="px-4 py-2 text-right">Anlık WIP</th>
                <th className="px-4 py-2 text-right">Zirve WIP</th>
              </tr>
            </thead>
            <tbody>
              {mainGroupStats.map(g => (
                <tr key={g.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                      <span className="font-medium">{g.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{g.subCount}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-emerald-700">{g.totalCompleted.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-2 text-right font-mono">%{g.avgUtil.toFixed(0)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 font-mono w-8">%{g.minUtil.toFixed(0)}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full relative min-w-[80px]">
                        <div className="absolute h-full bg-gradient-to-r from-slate-300 to-slate-400 rounded-full"
                          style={{ left: `${g.minUtil}%`, width: `${Math.max(2, g.maxUtil - g.minUtil)}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono w-8">%{g.maxUtil.toFixed(0)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {g.bottleneckCount > 0
                      ? <span className="font-bold text-red-600">{g.bottleneckCount}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {g.idleCount > 0
                      ? <span className="font-bold text-slate-500">{g.idleCount}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{g.totalCurrentQueue}</td>
                  <td className="px-4 py-2 text-right font-mono text-amber-700">{g.totalPeakQueue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detaylı Istasyon Tablosu */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-600" /> İstasyon Detayları ({filteredStations.length}/{stations.length})
          </h3>
          <select value={filterMain} onChange={e => setFilterMain(e.target.value)}
            className="text-xs border border-slate-200 rounded px-2 py-1">
            <option value="">Tüm ana gruplar</option>
            {data.mainOps.map(mo => <option key={mo.id} value={mo.id}>{mo.name}</option>)}
          </select>
          <select value={filterState} onChange={e => setFilterState(e.target.value)}
            className="text-xs border border-slate-200 rounded px-2 py-1">
            <option value="">Tüm durumlar</option>
            <option value="bottleneck">Darboğaz</option>
            <option value="balanced">Dengeli</option>
            <option value="light">Hafif Yük</option>
            <option value="idle">Boşta</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-left text-slate-500 uppercase tracking-wider text-[10px]">
                <th className="px-3 py-2">Ana Grup</th>
                <SortHeader active={sortBy==='name'} dir={sortDir} onClick={() => toggleSort('name')}>İstasyon</SortHeader>
                <th className="px-3 py-2">Makine/Operatör</th>
                <SortHeader active={sortBy==='cycle'} dir={sortDir} onClick={() => toggleSort('cycle')} className="text-right">Çevrim</SortHeader>
                <SortHeader active={sortBy==='completed'} dir={sortDir} onClick={() => toggleSort('completed')} className="text-right">Tamamlanan</SortHeader>
                <th className="px-3 py-2 text-right">Teorik / Eksik</th>
                <SortHeader active={sortBy==='util'} dir={sortDir} onClick={() => toggleSort('util')} className="text-right">Kullanım</SortHeader>
                <SortHeader active={sortBy==='queue'} dir={sortDir} onClick={() => toggleSort('queue')} className="text-right">Anlık Kuyruk</SortHeader>
                <SortHeader active={sortBy==='peak'} dir={sortDir} onClick={() => toggleSort('peak')} className="text-right">Zirve</SortHeader>
                <th className="px-3 py-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {filteredStations.map(s => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.mainColor }} />
                      <span className="text-slate-600 text-[11px]">{s.mainName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="font-medium truncate max-w-[240px]" title={s.name}>{s.name}</div>
                    {s.type && <div className="text-[10px] text-slate-400">{s.type}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-slate-600">
                    {s.machineName && <div>{s.machineName}</div>}
                    {s.operatorName && <div className="text-slate-400">{s.operatorName}</div>}
                    {!s.machineName && !s.operatorName && <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-700">{s.cycleTime.toFixed(2)} sn</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold text-emerald-700">{s.completed}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-[11px] text-slate-500">
                    {s.teorikAdet}
                    {s.eksik > 0 && <span className="text-red-600 ml-1">(-{s.eksik})</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${
                          s.utilPct >= 90 ? 'bg-red-500' :
                          s.utilPct >= 70 ? 'bg-emerald-500' :
                          s.utilPct >= 40 ? 'bg-amber-500' : 'bg-slate-300'
                        }`} style={{ width: `${s.utilPct}%` }} />
                      </div>
                      <span className="font-mono text-[11px] w-10 text-right">%{s.utilPct.toFixed(0)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{s.currentQueue}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold text-amber-700">{s.peak}</td>
                  <td className="px-3 py-1.5">
                    <StateBadge tone={s.stateColor}>{s.stateLabel}</StateBadge>
                  </td>
                </tr>
              ))}
              {filteredStations.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-400 italic text-xs">Filtrelere uyan istasyon yok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Operatör Optimizasyon Önerileri */}
      <OperatorOptimizationPanel
        stations={stations}
        data={data}
        maxSec={maxSec}
        elapsed={elapsed}
        bottleneckDailyMax={bottleneckDailyMax}
      />

      {/* Lejant */}
      <div className="text-[11px] text-slate-500 flex flex-wrap gap-3 px-2">
        <span><b className="text-slate-700">Çevrim:</b> 1 parçayı işleme süresi</span>
        <span><b className="text-slate-700">Teorik / Eksik:</b> tek başına ideal durumda yapabileceği / bugün yetişemediği</span>
        <span><b className="text-slate-700">Kullanım %:</b> çalıştığı süre / toplam geçen süre</span>
        <span><b className="text-slate-700">Zirve:</b> bugüne kadar gözlenen en yüksek kuyruk</span>
      </div>
    </div>
  );
}

/* ============================================================
   Operatör Optimizasyon Paneli — Seviye 1: eşleştirme önerileri
   ============================================================ */
function OperatorOptimizationPanel({ stations, data, maxSec, elapsed, bottleneckDailyMax }) {
  const recommendations = useMemo(() => {
    // Donörler: düşük kullanımlı + operatör atanmış
    const donors = stations
      .filter(s => s.utilPct < 60 && s.operatorName)
      .map(s => ({
        ...s,
        idlePct: 100 - s.utilPct,
        transferable: Math.min(60, 100 - s.utilPct),  // boşta olan kapasitenin yarısını tavsiye
      }))
      .sort((a, b) => a.utilPct - b.utilPct);  // en boş olandan başla

    // Alıcılar: darboğaz (kritik → yoğun)
    const recipients = stations
      .filter(s => s.state === 'bottleneck')
      .sort((a, b) => b.peak - a.peak || b.utilPct - a.utilPct);

    const pairs = [];
    const pairedDonors = new Set();

    // Yetenek skoru: yüksek olan daha uygun donör
    //   3: recipient.type donörün skills listesinde (doğrudan yetenek)
    //   2: donörün skills listesi boş (henüz tanımsız — her işe uygun varsayılır)
    //   1: donörün mevcut station type'ı recipient.type ile aynı (geçmiş deneyim)
    //   0: skills listesinde yok, type da farklı (eğitim gerekli)
    function skillScore(d, r) {
      const skills = d.operatorSkills || [];
      if (r.type && skills.includes(r.type)) return 3;
      if (skills.length === 0) return 2;
      if (d.type && d.type === r.type) return 1;
      return 0;
    }

    for (const r of recipients) {
      const candidates = donors
        .filter(d => !pairedDonors.has(d.id))
        .map(d => ({ d, score: skillScore(d, r) }))
        .sort((a, b) => b.score - a.score || a.d.utilPct - b.d.utilPct);
      if (candidates.length === 0) break;
      const { d: donor, score } = candidates[0];
      pairedDonors.add(donor.id);

      // Eşleşme seviyesi
      let matchLevel, effectiveness, matchLabel;
      if (score === 3)      { matchLevel = 'skill';    effectiveness = 1.0; matchLabel = 'Yetenek eşleşti'; }
      else if (score === 2) { matchLevel = 'unknown';  effectiveness = 0.85; matchLabel = 'Yetenek tanımsız — varsayılan'; }
      else if (score === 1) { matchLevel = 'type';     effectiveness = 0.9; matchLabel = 'Aynı op tipi deneyimi'; }
      else                  { matchLevel = 'mismatch'; effectiveness = 0.5; matchLabel = 'Eğitim gerekli — düşük verim'; }

      const skillMatch = matchLevel === 'skill';

      // Transfer edilen zaman: donörün boş zamanının yarısı (yüzde cinsinden)
      const transferPct = donor.transferable * 0.5 / 100;
      const baseRate = 60 / r.cycleTime;
      const extraPerMin = baseRate * transferPct * effectiveness;
      const dailyExtra = Math.floor(extraPerMin * (maxSec / 60));
      const currentRate = baseRate;
      const newRate = baseRate + extraPerMin;
      const cycleReductionPct = currentRate === 0 ? 0 : ((newRate - currentRate) / newRate) * 100;

      pairs.push({
        recipient: r,
        donor,
        skillMatch,
        matchLevel,
        matchLabel,
        effectiveness,
        transferPct: transferPct * 100,
        dailyExtra,
        cycleReductionPct,
        donorLossPct: 0,
      });
    }

    return { pairs, unmatched: recipients.length - pairs.length };
  }, [stations, maxSec]);

  const totalDailyExtra = recommendations.pairs.reduce((s, p) => s + p.dailyExtra, 0);

  if (recommendations.pairs.length === 0) {
    // Boş durum — ya darboğaz yok ya da donör yok
    const anyBottleneck = stations.some(s => s.state === 'bottleneck');
    const anyDonor = stations.some(s => s.utilPct < 60 && s.operatorName);
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 text-center">
        <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <h3 className="font-semibold text-sm text-slate-700">Operatör Optimizasyonu</h3>
        <p className="text-xs text-slate-500 mt-1">
          {!anyBottleneck
            ? 'Bu modelde darboğaz istasyon yok — hat iyi dengelenmiş.'
            : !anyDonor
              ? 'Darboğaz var ama boş kapasiteli operatör yok. Yeni kaynak eklemek gerekli.'
              : 'Eşleştirilebilir öneri yok.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-white flex items-center gap-3">
        <Users className="w-4 h-4 text-purple-600" />
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Operatör Optimizasyon Önerileri</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Boş zamanlı operatörleri darboğaz istasyonlara yönlendir. Tavsiyeler hat dengesini iyileştirir.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Potansiyel Kazanç</div>
          <div className="text-lg font-bold text-emerald-700 font-mono">+{totalDailyExtra.toLocaleString('tr-TR')} adet</div>
          <div className="text-[10px] text-slate-500">tüm öneriler uygulanırsa</div>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {recommendations.pairs.map((p, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-start gap-3">
              {/* Öncelik badge */}
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                {/* Darboğaz istasyonu */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.recipient.mainColor }} />
                  <span className="font-semibold text-sm text-red-800">{p.recipient.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {p.recipient.mainName} · %{p.recipient.utilPct.toFixed(0)} meşgul · zirve {p.recipient.peak} · {p.recipient.cycleTime.toFixed(2)} sn
                  </span>
                  <StateBadge tone="red">Darboğaz</StateBadge>
                </div>

                {/* Transfer öneri */}
                <div className="mt-2 pl-4 border-l-2 border-purple-200 space-y-0.5">
                  <div className="text-xs text-slate-700 flex items-center gap-2 flex-wrap">
                    <ChevronRight className="w-3.5 h-3.5 text-purple-600" />
                    <span>
                      <b>{p.donor.operatorName}</b> <span className="text-slate-500">({p.donor.name}, %{p.donor.utilPct.toFixed(0)} meşgul)</span>
                      {' '}yarı zamanını buraya yönlendir
                    </span>
                    {p.matchLevel === 'skill' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-medium"
                        title={`Operatörün yetenekleri: ${(p.donor.operatorSkills || []).join(', ') || '—'}`}>
                        <Check className="w-2.5 h-2.5" /> Yetenek var ({p.recipient.type})
                      </span>
                    )}
                    {p.matchLevel === 'type' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-cyan-100 text-cyan-800 rounded text-[10px] font-medium"
                        title="Zaten aynı op tipinde çalışıyor — yetenek tanımsız ama deneyim var">
                        <Check className="w-2.5 h-2.5" /> Deneyim ({p.donor.type})
                      </span>
                    )}
                    {p.matchLevel === 'unknown' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium"
                        title="Operatörün yetenekleri henüz tanımlanmamış — Kaynaklar sekmesinde yetenek seçerek güvenliği arttırabilirsin">
                        ? Yetenek tanımsız
                      </span>
                    )}
                    {p.matchLevel === 'mismatch' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-medium"
                        title={`Operatör yetenekleri: ${(p.donor.operatorSkills || []).join(', ') || '—'} — ${p.recipient.type} bilmiyor. Çapraz eğitim (%${((1 - p.effectiveness) * 100).toFixed(0)} verim kaybı) gerek.`}>
                        <AlertTriangle className="w-2.5 h-2.5" /> Eğitim gerek ({p.recipient.type})
                      </span>
                    )}
                  </div>
                  {/* Etki */}
                  <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-0.5 pl-5">
                    <span>
                      <span className="text-slate-400">Transfer:</span>{' '}
                      <b className="text-slate-800">~%{p.transferPct.toFixed(0)} vardiya</b>
                    </span>
                    <span>
                      <span className="text-slate-400">Etkin çevrim:</span>{' '}
                      <b className="text-emerald-700">-%{p.cycleReductionPct.toFixed(0)}</b>
                    </span>
                    <span>
                      <span className="text-slate-400">Günlük kazanç:</span>{' '}
                      <b className="text-emerald-700">+{p.dailyExtra.toLocaleString('tr-TR')} adet</b>
                    </span>
                    {p.donor.cycleTime > 0 && (
                      <span className="text-slate-400" title="Donör istasyonda eksilme olmaz çünkü zaten boştu">
                        Donör kaybı: yok (idle zamandan alındı)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
        {recommendations.unmatched > 0 && (
          <div className="px-4 py-2.5 bg-amber-50 text-xs text-amber-800 border-t border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
            <b>{recommendations.unmatched} darboğaz istasyon</b> için boş kapasiteli operatör kalmadı — ek kaynak veya paralel makine gerekli.
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 bg-slate-50 text-[11px] text-slate-600 border-t border-slate-200 flex items-center gap-2 flex-wrap">
        <span><b>Nasıl uygula:</b></span>
        <span>1) <b>Kaynaklar</b> sekmesine git</span>
        <ChevronRight className="w-3 h-3" />
        <span>2) Önerilen operatörü darboğaz istasyona ek atama yap (veya şu an ki istasyonunu paylaş)</span>
        <ChevronRight className="w-3 h-3" />
        <span>3) Yeniden simüle et, raporu karşılaştır</span>
      </div>
    </div>
  );
}

function ReportCard({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate:   'bg-slate-50 border-slate-200',
    cyan:    'bg-cyan-50 border-cyan-200',
    amber:   'bg-amber-50 border-amber-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    red:     'bg-red-50 border-red-200',
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-xl font-bold font-mono mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function SortHeader({ active, dir, onClick, children, className = '' }) {
  return (
    <th className={`px-3 py-2 cursor-pointer select-none hover:bg-slate-100 ${className}`} onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active && <span className="text-[9px] text-slate-600">{dir === 'desc' ? '▼' : '▲'}</span>}
      </span>
    </th>
  );
}

function StateBadge({ tone, children }) {
  const tones = {
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

function SimKpi({ label, value, unit, icon: Icon, tone }) {
  const tones = {
    slate:   'bg-slate-100 border-slate-200 text-slate-900',
    cyan:    'bg-cyan-50 border-cyan-200 text-cyan-900',
    amber:   'bg-amber-50 border-amber-200 text-amber-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    red:     'bg-red-50 border-red-200 text-red-900',
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] uppercase tracking-wider opacity-70 font-semibold">{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5 opacity-60" />}
      </div>
      <div className="text-xl font-mono font-bold leading-tight">{value}</div>
      <div className="text-[10px] opacity-70 mt-0.5">{unit}</div>
    </div>
  );
}
