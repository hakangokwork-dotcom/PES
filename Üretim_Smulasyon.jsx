import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus, Trash2, Edit2, X, Save, Settings as SettingsIcon,
  Cog, User, Users, Wrench, Network, BarChart3, Layers,
  AlertTriangle, RefreshCw, GripVertical, Package, Activity, ChevronRight,
  Move, Link2, Copy, FolderOpen, Sparkles, MousePointer2, Check,
  Play, Pause, RotateCcw, Clock, TrendingUp, Zap, CheckCircle2
} from 'lucide-react';
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

/* Örnek başlangıç verisi — dokümanınızdaki akıştan */
const DEFAULT_DATA = {
  mainOps: [
    { id: 'mo_hazir', name: 'Hazırlık',   color: '#7c3aed', order: 0, nextIds: ['mo_on', 'mo_arka'], x:  60, y: 200 },
    { id: 'mo_on',    name: 'Ön Bant',    color: '#2563eb', order: 1, nextIds: ['mo_mont'],          x: 320, y: 100 },
    { id: 'mo_arka',  name: 'Arka Bant',  color: '#16a34a', order: 2, nextIds: ['mo_mont'],          x: 320, y: 300 },
    { id: 'mo_mont',  name: 'Montaj',     color: '#d97706', order: 3, nextIds: ['mo_ukp'],           x: 600, y: 200 },
    { id: 'mo_ukp',   name: 'UKP',        color: '#dc2626', order: 4, nextIds: [],                   x: 880, y: 200 },
  ],
  subOps: [
    { id: 's1',  mainOpId: 'mo_hazir', name: 'Etiket Kesme',          cycleTime: 3.0,   machineId: null,  operatorId: null, type: 'KESİM',    order: 0, nextIds: ['s2'] },
    { id: 's2',  mainOpId: 'mo_hazir', name: 'Tela Yapıştırma',       cycleTime: 4.5,   machineId: null,  operatorId: null, type: 'AKSESUAR', order: 1, nextIds: ['s3', 's7'] },
    { id: 's3',  mainOpId: 'mo_on',    name: 'Kapalı Pat Overlok',    cycleTime: 8.55,  machineId: 'm1',  operatorId: 'o1', type: 'OVERLOK',  order: 0, nextIds: ['s4'] },
    { id: 's4',  mainOpId: 'mo_on',    name: 'Fermuar Takma',          cycleTime: 6.62,  machineId: 'm2',  operatorId: 'o2', type: 'DİKİM',    order: 1, nextIds: ['s5'] },
    { id: 's5',  mainOpId: 'mo_on',    name: 'Ön Bağlama',             cycleTime: 8.90,  machineId: 'm2',  operatorId: null, type: 'DİKİM',    order: 2, nextIds: ['s6'] },
    { id: 's6',  mainOpId: 'mo_on',    name: 'Ön Kontrol',             cycleTime: 13.48, machineId: null,  operatorId: null, type: 'KONTROL',  order: 3, nextIds: ['s10'] },
    { id: 's7',  mainOpId: 'mo_arka',  name: 'Arka Cep Otomatı',       cycleTime: 11.03, machineId: 'm3',  operatorId: null, type: 'OTOMAT',   order: 0, nextIds: ['s8'] },
    { id: 's8',  mainOpId: 'mo_arka',  name: 'Arka Ağ Çatım',          cycleTime: 5.68,  machineId: 'm1',  operatorId: null, type: 'OVERLOK',  order: 1, nextIds: ['s9'] },
    { id: 's9',  mainOpId: 'mo_arka',  name: 'Arka Kontrol',           cycleTime: 6.36,  machineId: null,  operatorId: null, type: 'KONTROL',  order: 2, nextIds: ['s10'] },
    { id: 's10', mainOpId: 'mo_mont',  name: 'İç Ağ Çatımı',           cycleTime: 9.13,  machineId: 'm1',  operatorId: null, type: 'OVERLOK',  order: 0, nextIds: ['s11'] },
    { id: 's11', mainOpId: 'mo_mont',  name: 'Yan Çatım',              cycleTime: 11.03, machineId: 'm1',  operatorId: null, type: 'OVERLOK',  order: 1, nextIds: ['s12'] },
    { id: 's12', mainOpId: 'mo_mont',  name: 'Kemer Takma',            cycleTime: 7.53,  machineId: 'm2',  operatorId: null, type: 'DİKİM',    order: 2, nextIds: ['s13'] },
    { id: 's13', mainOpId: 'mo_mont',  name: 'İç Kontrol',             cycleTime: 13.52, machineId: null,  operatorId: null, type: 'KONTROL',  order: 3, nextIds: ['s14'] },
    { id: 's14', mainOpId: 'mo_ukp',   name: 'Paça Kıvırma Otomatı',   cycleTime: 8.69,  machineId: 'm3',  operatorId: null, type: 'OTOMAT',   order: 0, nextIds: ['s15'] },
    { id: 's15', mainOpId: 'mo_ukp',   name: 'Genel Temizlik',         cycleTime: 11.80, machineId: null,  operatorId: null, type: 'TEMİZLİK', order: 1, nextIds: ['s16'] },
    { id: 's16', mainOpId: 'mo_ukp',   name: 'Genel Kalite Kontrol',   cycleTime: 28.26, machineId: null,  operatorId: null, type: 'KONTROL',  order: 2, nextIds: [] },
  ],
  machines: [
    { id: 'm1', name: 'OVR-01', type: 'Overlok 4 iplik', brand: 'Juki' },
    { id: 'm2', name: 'DDM-01', type: 'Düz Dikiş',       brand: 'Jack' },
    { id: 'm3', name: 'OTM-01', type: 'Cep Otomatı',     brand: 'Juki' },
    { id: 'm4', name: 'RCM-01', type: 'Reçme',           brand: 'Jack' },
    { id: 'm5', name: 'CIM-01', type: 'Çima',            brand: 'Siruba' },
    { id: 'm6', name: 'PNT-01', type: 'Punterez',        brand: 'Juki' },
  ],
  operators: [
    { id: 'o1', name: 'Ayşe K.',   skill: 4 },
    { id: 'o2', name: 'Mehmet Y.', skill: 5 },
    { id: 'o3', name: 'Fatma S.',  skill: 3 },
    { id: 'o4', name: 'Ali D.',    skill: 4 },
  ],
  settings: { netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 },
  scenarios: []
};

export default function AtolyePlatform() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('ops');
  const [editSubOp, setEditSubOp] = useState(null);      // form state for sub-op edit modal
  const [editMainOp, setEditMainOp] = useState(null);    // form state for main-op edit modal
  const [showSettings, setShowSettings] = useState(false);
  const [drag, setDrag] = useState(null);                // { type, id }
  const [dragOver, setDragOver] = useState(null);        // { type, id } drop target

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

  /* Simülasyon adım döngüsü: 100ms'de bir, speed çarpanıyla */
  useEffect(() => {
    if (!simState.running) return;
    const TICK_MS = 100;
    const id = setInterval(() => {
      setSimState(prev => {
        if (!prev.running) return prev;
        const d = dataRef.current;
        const maxSec = (d.settings?.netMinutes || 540) * 60;
        const dt = Math.min((TICK_MS / 1000) * prev.speed, 5); // dt'yi 5 sn ile kapa
        const elapsed = Math.min(prev.elapsed + dt, maxSec);
        const running = elapsed < maxSec;

        // Çalışma kopyaları
        const inProgress = {};
        for (const k of Object.keys(prev.inProgress)) inProgress[k] = { ...prev.inProgress[k] };
        const completed = { ...prev.completed };
        const pending = {};
        for (const k of Object.keys(prev.pending)) pending[k] = { ...prev.pending[k] };
        const peakQueue = { ...prev.peakQueue };
        let exited = prev.exited;

        // prev map: op.id → [precdecessor id'leri]
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
        for (const opId of Object.keys(inProgress)) {
          inProgress[opId].remainingSec -= dt;
          if (inProgress[opId].remainingSec <= 0) justDone.push(opId);
        }
        for (const opId of justDone) {
          delete inProgress[opId];
          completed[opId] = (completed[opId] || 0) + 1;
          const op = d.subOps.find(x => x.id === opId);
          if (!op || !op.nextIds || op.nextIds.length === 0) {
            exited += 1;
          } else {
            for (const nId of op.nextIds) {
              if (!pending[nId]) pending[nId] = {};
              pending[nId][opId] = (pending[nId][opId] || 0) + 1;
            }
          }
        }

        // 2) Boşta kalan istasyonları başlat
        for (const op of d.subOps) {
          if (inProgress[op.id]) continue;
          if (!op.cycleTime || op.cycleTime <= 0) continue;
          const prevs = prevMap[op.id] || [];
          let canStart = false;
          if (prevs.length === 0) {
            canStart = true; // giriş noktası — sonsuz tedarik varsay
          } else {
            const pend = pending[op.id] || {};
            canStart = prevs.every(pid => (pend[pid] || 0) >= 1);
          }
          if (canStart) {
            if (prevs.length > 0) {
              if (!pending[op.id]) pending[op.id] = {};
              for (const pid of prevs) pending[op.id][pid] = (pending[op.id][pid] || 0) - 1;
            }
            inProgress[op.id] = { remainingSec: op.cycleTime, totalSec: op.cycleTime };
          }
        }

        // 3) Zirve kuyruk boyutlarını güncelle (WIP birikim kaydı)
        for (const op of d.subOps) {
          const pend = pending[op.id] || {};
          const q = Object.values(pend).reduce((a, v) => a + (v > 0 ? v : 0), 0);
          if (q > (peakQueue[op.id] || 0)) peakQueue[op.id] = q;
        }

        // 4) Trend geçmişi: her 60 sim saniyesinde bir nokta
        let history = prev.history;
        const lastT = history.length > 0 ? history[history.length - 1].t : -9999;
        if (elapsed - lastT >= 60 || (!running && lastT !== elapsed)) {
          history = [...history, { t: elapsed, exited }];
        }

        return { ...prev, elapsed, inProgress, completed, pending, peakQueue, exited, history, running };
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [simState.running, simState.speed]);

  /* ---------- Kalıcı veri: yükle ve kaydet ---------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) setData(JSON.parse(res.value));
      } catch (e) { /* ilk kullanım */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
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

    // Her ana operasyon için: toplam çevrim süresi (saniye), SMV (dk), kapasite
    const perMain = data.mainOps.map(mo => {
      const subs = data.subOps.filter(s => s.mainOpId === mo.id);
      // Çevrim süreleri SANİYE olarak saklanır
      const totalCycle = subs.reduce((a, s) => a + (s.cycleTime || 0), 0); // saniye
      const totalCycleMin = totalCycle / 60;
      const smv = totalCycleMin * (1 + pfd); // dakika (SMV = Standart Minute Value)
      // İstasyon sayısı = alt operasyon sayısı (1 kişi 1 iş varsayımı)
      const stations = subs.length || 1;
      // Kapasite (adet/vardiya): netMin × verim × istasyon / SMV
      const capacity = smv > 0 ? (netMin * eff * stations) / smv : 0;
      // Darboğaz belirleme: en yavaş alt-op (max çevrim süresi)
      const slowest = subs.reduce((max, s) => (s.cycleTime > (max?.cycleTime || 0) ? s : max), null);
      return { mainOp: mo, subs, totalCycle, totalCycleMin, smv, stations, capacity, slowest };
    });

    // Hat çıktısı = en düşük kapasite (darboğaz)
    const lineCapacity = Math.min(...perMain.map(p => p.capacity).filter(c => c > 0));
    const bottleneckId = perMain.find(p => p.capacity === lineCapacity)?.mainOp.id;

    return { perMain, taktTime: taktTimeMin, taktTimeMin, taktTimeSec, lineCapacity, bottleneckId, netMin, eff, demand };
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

  /* ---------- Senaryo yönetimi ---------- */
  const saveScenario = (name) => {
    const sc = {
      id: `sc_${uid()}`,
      name: name || `Senaryo ${(data.scenarios?.length || 0) + 1}`,
      createdAt: new Date().toISOString(),
      snapshot: {
        mainOps: JSON.parse(JSON.stringify(data.mainOps)),
        subOps:  JSON.parse(JSON.stringify(data.subOps)),
      }
    };
    setData(d => ({ ...d, scenarios: [...(d.scenarios || []), sc] }));
  };
  const loadScenario = (id) => {
    const sc = (data.scenarios || []).find(s => s.id === id);
    if (!sc) return;
    if (!confirm(`"${sc.name}" senaryosu yüklenecek. Mevcut değişiklikler kaybolacak. Devam?`)) return;
    setData(d => ({ ...d, mainOps: sc.snapshot.mainOps, subOps: sc.snapshot.subOps }));
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

  const addSubOp = (mainOpId) => {
    const maxOrder = data.subOps.filter(s => s.mainOpId === mainOpId).reduce((m, s) => Math.max(m, s.order), -1);
    const so = {
      id: `s_${uid()}`, mainOpId, name: 'Yeni Alt Operasyon',
      cycleTime: 5, machineId: null, operatorId: null, type: 'DİKİM', order: maxOrder + 1, nextIds: []
    };
    setData(d => ({ ...d, subOps: [...d.subOps, so] }));
    setEditSubOp(so);
  };

  const saveSubOp = (so) => {
    setData(d => ({ ...d, subOps: d.subOps.map(x => x.id === so.id ? so : x) }));
    setEditSubOp(null);
  };

  const deleteSubOp = (id) => {
    setData(d => ({
      ...d,
      subOps: d.subOps
        .filter(s => s.id !== id)
        .map(s => ({ ...s, nextIds: (s.nextIds || []).filter(n => n !== id) }))
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
          subOps: d.subOps.map(s => s.id === drag.id ? { ...s, mainOpId, order: targetMax + 1 } : s)
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

  const addOperator = () => setData(d => ({ ...d, operators: [...d.operators, { id: `o_${uid()}`, name: 'Yeni Operatör', skill: 3 }] }));
  const updateOperator = (id, patch) => setData(d => ({ ...d, operators: d.operators.map(o => o.id === id ? { ...o, ...patch } : o) }));
  const deleteOperator = (id) => setData(d => ({
    ...d,
    operators: d.operators.filter(o => o.id !== id),
    subOps: d.subOps.map(s => s.operatorId === id ? { ...s, operatorId: null } : s)
  }));

  const resetDemo = () => {
    if (!confirm('Tüm veriler silinip örnek veri geri yüklensin mi?')) return;
    setData(DEFAULT_DATA);
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
              <h1 className="text-lg font-semibold tracking-tight">Atölye Simülasyon Platformu</h1>
              <p className="text-xs text-slate-400 font-mono">MTM · SMV · YAMAZUMI · DARBOĞAZ</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <KpiBadge label="Hat Çıktısı" value={`${calc.lineCapacity.toFixed(0)} adet`} tone="cyan" />
            <KpiBadge label="Takt" value={`${calc.taktTimeSec.toFixed(1)} sn`} tone="amber" />
            <KpiBadge label="Talep" value={`${calc.demand} ad`} tone="slate" />
            <button onClick={() => setShowSettings(true)} className="ml-2 p-2 bg-slate-800 hover:bg-slate-700 rounded transition" title="Ayarlar">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button onClick={resetDemo} className="p-2 bg-slate-800 hover:bg-slate-700 rounded transition" title="Demo veriyi sıfırla">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Sekmeler */}
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex gap-1 text-sm">
            <TabBtn active={tab === 'ops'} onClick={() => setTab('ops')} icon={Layers}>Operasyonlar</TabBtn>
            <TabBtn active={tab === 'resources'} onClick={() => setTab('resources')} icon={Wrench}>Kaynaklar</TabBtn>
            <TabBtn active={tab === 'flow'} onClick={() => setTab('flow')} icon={Network}>Akış</TabBtn>
            <TabBtn active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={BarChart3}>Hesaplama</TabBtn>
            <TabBtn active={tab === 'sim'} onClick={() => setTab('sim')} icon={Play}>Simülasyon</TabBtn>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {tab === 'ops' && (
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
            onUpdatePosition={updateMainOpPosition}
            onUpdateConnections={updateMainOpConnections}
            onAutoLayout={autoLayout}
            onEditMain={setEditMainOp}
            onAddMain={addMainOp}
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
            onAutoSetup={autoSetupSubOpPrecedence}
          />
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
          💡 İpucu: Operatör kartlarını sürükleyip alt operasyonlara atayabilirsiniz. Beceri: 1 (çırak) → 5 (usta).
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
function FlowView({ data, calc, onUpdatePosition, onUpdateConnections, onAutoLayout, onEditMain, onAddMain, onSaveScenario, onLoadScenario, onDeleteScenario, onDuplicateScenario }) {
  const [mode, setMode] = useState('move'); // 'move' | 'connect'
  const [dragNode, setDragNode] = useState(null);       // { id, offX, offY, moved }
  const [connectSrc, setConnectSrc] = useState(null);   // source node id when connecting
  const [hoverConn, setHoverConn] = useState(null);     // '{from}-{to}' for delete hover
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const svgRef = React.useRef(null);

  const NODE_W = 170;
  const NODE_H = 72;

  // Canvas boyutunu düğümlere göre dinamik ayarla
  const canvasW = Math.max(1000, ...data.mainOps.map(m => (m.x || 0) + NODE_W + 80));
  const canvasH = Math.max(520,  ...data.mainOps.map(m => (m.y || 0) + NODE_H + 80));

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
    setDragNode({ id: node.id, offX: x - (node.x || 0), offY: y - (node.y || 0), moved: false });
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
    // çember kontrolü (basit: doğrudan ters yön bağlantısı?)
    const tgt = data.mainOps.find(m => m.id === node.id);
    if (tgt?.nextIds.includes(connectSrc)) {
      alert('Bu iki operasyon arasında ters yönde bağlantı var — döngü oluşur.');
      setConnectSrc(null); return;
    }
    const src = data.mainOps.find(m => m.id === connectSrc);
    if (src && !src.nextIds.includes(node.id)) {
      onUpdateConnections(connectSrc, [...src.nextIds, node.id]);
    }
    setConnectSrc(null);
  };

  const removeConn = (fromId, toId) => {
    const src = data.mainOps.find(m => m.id === fromId);
    if (!src) return;
    onUpdateConnections(fromId, src.nextIds.filter(id => id !== toId));
  };

  /* --- Render yardımcı --- */
  const nodeRect = (m) => ({
    x: m.x ?? 0, y: m.y ?? 0,
    cx: (m.x ?? 0) + NODE_W / 2, cy: (m.y ?? 0) + NODE_H / 2,
    right: (m.x ?? 0) + NODE_W, bottom: (m.y ?? 0) + NODE_H
  });

  const connections = [];
  data.mainOps.forEach(src => {
    src.nextIds.forEach(nextId => {
      const tgt = data.mainOps.find(m => m.id === nextId);
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
        <button onClick={onAutoLayout}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50">
          <Sparkles className="w-3.5 h-3.5" />Otomatik Yerleştir
        </button>
        <button onClick={onAddMain}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50">
          <Plus className="w-3.5 h-3.5" />Ana Op Ekle
        </button>
        <div className="flex-1" />
        <button onClick={() => { setScenarioName(''); setShowSaveDialog(true); }}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-slate-900 text-white rounded hover:bg-slate-800">
          <Save className="w-3.5 h-3.5" />Bu Akışı Kaydet
        </button>
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
          {data.mainOps.map(mo => {
            const r = nodeRect(mo);
            const stats = calc.perMain.find(p => p.mainOp.id === mo.id);
            const isBottleneck = mo.id === calc.bottleneckId;
            const isSrc = connectSrc === mo.id;
            const strokeColor = isSrc ? '#0891b2' : (isBottleneck ? '#dc2626' : mo.color);
            const strokeWidth = isSrc ? 4 : (isBottleneck ? 3 : 1);
            return (
              <g key={mo.id}
                transform={`translate(${r.x}, ${r.y})`}
                style={{ cursor: mode === 'move' ? 'grab' : 'pointer' }}
                onPointerDown={(e) => onNodePointerDown(e, mo)}
                onClick={() => handleNodeClick(mo)}
                onDoubleClick={() => onEditMain(mo)}>
                <rect width={NODE_W} height={NODE_H} rx={8}
                  fill={mo.color} opacity={0.94}
                  stroke={strokeColor} strokeWidth={strokeWidth} />
                {/* opak üst bant */}
                <rect width={NODE_W} height={6} rx={8} ry={8} fill="white" opacity={0.25} />
                <text x={NODE_W / 2} y={26} textAnchor="middle" fill="white" fontSize={14} fontWeight={700}>
                  {mo.name}
                </text>
                <text x={NODE_W / 2} y={44} textAnchor="middle" fill="white" opacity={0.88} fontSize={10.5} fontFamily="ui-monospace, monospace">
                  Σ {stats?.totalCycle.toFixed(0)} sn · {stats?.capacity.toFixed(0)} ad/v
                </text>
                <text x={NODE_W / 2} y={60} textAnchor="middle" fill="white" opacity={0.7} fontSize={10} fontFamily="ui-monospace, monospace">
                  {stats?.subs.length} alt op · {stats?.stations} ist.
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
                {/* Bağla modunda küçük sağdaki "out" halkası */}
                {mode === 'connect' && !isSrc && (
                  <circle cx={NODE_W} cy={NODE_H / 2} r={5} fill="white" stroke={mo.color} strokeWidth={2} />
                )}
              </g>
            );
          })}

          {/* Boş alanda tıklayınca bağlantı modunu iptal et */}
          <rect x={0} y={0} width={canvasW} height={canvasH}
            fill="transparent"
            style={{ pointerEvents: mode === 'connect' && connectSrc ? 'auto' : 'none' }}
            onClick={() => setConnectSrc(null)} />
        </svg>
      </div>

      <div className="px-4 py-2 text-xs text-slate-600 bg-slate-50 border-t border-slate-200 flex items-center gap-3 flex-wrap">
        <span><b>İpuçları:</b></span>
        <span>• Çift tıklayın → ana operasyonu düzenleyin</span>
        <span>• Oka tıklayın → bağlantıyı silin</span>
        <span>• <span className="inline-block w-2 h-2 bg-red-600 rounded-full align-middle mr-1"></span>darboğaz</span>
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
          <select className={inputCls} value={form.mainOpId} onChange={e => up({ mainOpId: e.target.value })}>
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
function SimView({ data, calc, simState, onStart, onPause, onReset, onSpeed, onAutoSetup }) {
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

  // Beklenen çıktı (teorik darboğaz kapasitesi)
  const expectedOutput = calc.lineCapacity || 0;

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

  // Tahmini gün sonu çıktı (mevcut hıza göre projeksiyon)
  const projectedEOD = (() => {
    if (simState.elapsed < 60) return null;
    const remainingMin = (maxSec - simState.elapsed) / 60;
    return Math.round(simState.exited + currentRate * remainingMin);
  })();

  // Ana operasyonları sıraya göre dizelim
  const sortedMainOps = [...data.mainOps].sort((a, b) => a.order - b.order);

  // Darboğaz (en büyük zirve kuyruğa sahip istasyon)
  const topPeak = Object.entries(simState.peakQueue || {}).sort((a,b) => b[1] - a[1])[0];
  const worstStationId = topPeak?.[0];

  return (
    <div className="space-y-4">
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
            {[1, 10, 60].map(sp => (
              <button key={sp} onClick={() => onSpeed(sp)}
                className={`text-sm px-3 py-1.5 rounded font-mono transition
                  ${simState.speed === sp ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                {sp}x
              </button>
            ))}
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
        <SimKpi label="Üretilen" value={simState.exited} unit={`hedef ${expectedOutput.toFixed(0)}`} icon={CheckCircle2} tone="emerald" />
        <SimKpi label="Anlık Hız" value={currentRate.toFixed(2)} unit="adet/dk" icon={Zap} tone="cyan" />
        <SimKpi label="Toplam WIP" value={totalWIP} unit="parça hat içinde" icon={Package} tone="amber" />
        <SimKpi label="Gün Sonu Tahmin" value={projectedEOD ?? '—'} unit={projectedEOD != null ? `vs hedef ${expectedOutput.toFixed(0)}` : 'en az 1 dk sonra'} icon={TrendingUp} tone={projectedEOD != null && projectedEOD < expectedOutput * 0.9 ? 'red' : 'emerald'} />
      </div>

      {/* Canlı istasyon tablosu: ana op kolonu × alt op satırları */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Activity className="w-5 h-5 text-cyan-600" />Canlı Hat Durumu</h3>
            <p className="text-xs text-slate-600 mt-0.5">Her kutuda: <span className="inline-block w-2 h-2 bg-amber-400 rounded-sm align-middle mr-1"></span>bekleyen (WIP) · ilerleme barı · ✓ tamamlanan · ▲ zirve birikim</p>
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
                    <span className="ml-auto text-[10px] font-mono text-slate-600">WIP:{moTotalWIP} · ✓{moTotalCompleted}</span>
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
                              <div className="text-xs font-medium truncate">{s.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{s.cycleTime} sn</div>
                            </div>
                            {peak > 0 && (
                              <span className={`text-[9px] font-mono px-1 rounded flex items-center gap-0.5 flex-shrink-0 ${isWorst ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                ▲{peak}
                              </span>
                            )}
                          </div>

                          {/* Kuyruk görsel (max 8 kutu) */}
                          <div className="flex items-center gap-1 mt-1.5 h-4">
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
                            <span className="ml-auto text-[10px] font-mono text-amber-700 font-bold">{queue}</span>
                          </div>

                          {/* İlerleme barı */}
                          <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            {ip && (
                              <div className="h-full bg-cyan-500 transition-all"
                                style={{ width: `${pct}%` }} />
                            )}
                          </div>

                          <div className="flex justify-between mt-1 text-[10px] font-mono">
                            <span className="text-slate-400">
                              {ip ? `${ip.remainingSec.toFixed(1)}sn kaldı` : '—'}
                            </span>
                            <span className="text-emerald-700 font-bold">
                              ✓ {completed}
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
    </div>
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
