
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ROOT_ID, uid, subParent, childNodes, isMainNode, findNode, rootMainId, descendantIds, wouldCreateCycle } from './engine/flow.js';
import { levelLayout, LANE_X_GAP, LAYOUT_X0, LAYOUT_Y0 } from './engine/flowLayout.js';
import { computeCapacity } from './engine/capacity.js';
import { initialSimState, cloneSimState, advanceSimStep, fastForward } from './engine/simulation.js';
import { migrateData, deriveEdges } from './engine/migrate.js';
import { validateV4 } from './engine/schema.js';
import { zoomAt, pan as panView, clampZoom, screenToCanvas, ZOOM_MIN, ZOOM_MAX } from './engine/viewport.js';
import { orthoPath, offsetAlongSide, isBackwardEdge, orthoBackwardLaneY } from './engine/processMapGeometry.js';
import {
  balancingEfficiencyPct, balanceLossPct, requiredOperators,
  lineEfficiencyPct, lineEfficiencyBand,
} from './engine/metrics.js';
import { analyzeSharedStations } from './engine/sharedStations.js';
import { yamazumiBars } from './engine/yamazumiBars.js';
import { NODE_PALETTE as PALETTE } from './engine/palette.js';
import { getDomain } from './domains/index.js';
import { DomainContext, useDomain, useLabels, lower } from './domains/DomainContext.jsx';
import textileBasic from './templates/textile-basic.js';
import blankTemplate from './templates/blank.js';
import { buildDataFromTemplate, templateFromData } from './templates/apply.js';
import {
  Plus, Trash2, Edit2, X, Save, Settings as SettingsIcon,
  Cog, User, Users, Wrench, Network, BarChart3, Layers,
  AlertTriangle, RefreshCw, GripVertical, Package, Activity, ChevronRight,
  Copy, FolderOpen, Sparkles, Check,
  Play, Pause, RotateCcw, Clock, TrendingUp, Zap, CheckCircle2,
  Download, Upload, FileSpreadsheet, LayoutGrid, Star, Scale,
  Map as MapIcon, Route, HelpCircle, GitBranch,
} from 'lucide-react';
import { downloadTemplate, parseSimFile, validateRows, buildSimDataFromRows } from './sim-excel';
import Gallery from './components/Gallery.jsx';
import { confirmDialog, alertDialog, promptDialog } from './components/dialogs/dialogService.js';
import VsmView from './components/VsmView.jsx';
import InfoTip from './components/InfoTip.jsx';
import FlowEditor from './components/FlowEditor.jsx';
import { GUIDES } from './help/guides.js';
import { GLOSSARY } from './help/glossary.js';
import { CALCULATIONS } from './help/calculations.js';
import ProcessMapStudio from './components/ProcessMapStudio.jsx';
import DialogHost from './components/dialogs/DialogHost.jsx';
import { listUserTemplates, saveUserTemplate, deleteUserTemplate } from './templates/userStore.js';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine, Cell, LabelList
} from 'recharts';

/* ============================================================
   Depolama anahtarı — verileri tarayıcıda kalıcı tutar
   ============================================================ */
const DEFAULT_STORAGE_KEY = 'provsm_studio_blank_v1';
const STORAGE_KEY_V3 = 'atolye_sim_v3';   // eski veri; migrasyon sonrası da silinmez (geri dönüş güvenliği)

/* "Gerçek iş var mı?" — şablon iskeleti (mainOps) tek başına iş sayılmaz. */
const hasMeaningfulWork = (d) =>
  (d.subOps?.length ?? 0) > 0 || (d.machines?.length ?? 0) > 0 ||
  (d.operators?.length ?? 0) > 0 || !!d.meta?.modelAdi;

/* Bayatlık imzası (A6): yalnız simülasyonu etkileyen alanların JSON'u. Simülasyon
   başlarken (start/fastForward) simState.signature = simSignature(data) kaydedilir;
   imza sonradan değişirse (`simStale`) sonuçlar artık geçerli model karşılığı değildir. */
const simSignature = (d) => JSON.stringify({
  s: (d.subOps || []).map(({ id, cycleTime, nextIds, parentId, mainOpId, stationCount }) =>
    ({ id, cycleTime, nextIds, parentId, mainOpId, stationCount })),
  m: (d.mainOps || []).map(({ id, nextIds, joinType }) => ({ id, nextIds, joinType })),
  n: d.settings?.netMinutes,
});

/* Kalıcılık: varsa gömülü window.storage, yoksa localStorage.
   (Bu Next.js uygulamasında window.storage tanımsız olduğundan localStorage'a düşer.) */
const flowStore = {
  onSaveError: null,   // B4: AtolyePlatform mount'ta atanır — kaydetme başarısız olunca banner tetikler
  async get(k) {
    try {
      if (typeof window !== 'undefined' && window.storage?.get) return await window.storage.get(k);
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
      return v == null ? null : { value: v };
    } catch { return null; }
  },
  async set(k, v) {
    // Dönüş: başarı boolean'ı — karantina gibi kritik yazımlar doğrulanabilsin
    // (depolama doluyken "yazıldı" sanıp tek kopyanın üzerine yazma riski).
    try {
      if (typeof window !== 'undefined' && window.storage?.set) { await window.storage.set(k, v); return true; }
      if (typeof localStorage !== 'undefined') { localStorage.setItem(k, v); return true; }
      return false;
    } catch (e) {
      flowStore.onSaveError?.(k, e);
      return false;
    }
  },
};

/* Boş çalışma sayfası — temel akış zinciri kurulu, içler boş.
   Kullanıcı kart isimlerini düzenleyebilir, alt operasyonları Excel'den ya da
   manuel olarak doldurur. Sıfırla butonu da bu yapıya döner.
   (Eski davranış korunur: kayıtlı veri yoksa tekstil şablonu açılır.) */
const DEFAULT_DATA = buildDataFromTemplate(blankTemplate);

/* `storageKey`: gömen uygulama kendi kapsamını verebilir (ör. PES'te atölye başına
   `provsm_studio_w<wid>_v1`). Verilmezse standalone sürümün sabit anahtarı kullanılır.
   Anahtar değişince bileşen REMOUNT edilmeli (React `key`) — yükleme effect'i yalnız
   mount'ta çalışır, çalışırken anahtar değiştirmek veriyi karıştırır. */
export default function AtolyePlatform({ storageKey } = {}) {
  const STORAGE_KEY = storageKey || DEFAULT_STORAGE_KEY;
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('flow');
  // Akış (n8n) sekmesi ile mevcut Akış sekmesinin paylaştığı drill-in konteyner yığını
  // (aynı süreci iki görünümde de gösterebilmek için FlowView'dan buraya taşındı).
  const [flowPath, setFlowPath] = useState([]);
  const [view, setView] = useState('work');            // 'gallery' | 'work'
  const [galleryFromWork, setGalleryFromWork] = useState(false); // galeri çalışma alanından mı açıldı? (dönüş butonu)
  const [userTemplates, setUserTemplates] = useState([]);
  const [editSubOp, setEditSubOp] = useState(null);      // form state for sub-op edit modal
  const [editMainOp, setEditMainOp] = useState(null);    // form state for main-op edit modal
  const [showSettings, setShowSettings] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [drag, setDrag] = useState(null);                // { type, id }
  const [dragOver, setDragOver] = useState(null);        // { type, id } drop target
  const [dataAlert, setDataAlert] = useState(null);       // { tone:'danger'|'warn', text } — kapatılabilir banner (B1/B4)

  /* ---------- Excel import state ---------- */
  const [importPreview, setImportPreview] = useState(null);  // { validated: [...], fileName }
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const { rows, meta } = await parseSimFile(file, domain);
      const allowedAnaGruplar = (data.mainOps || []).map(m => m.name).filter(Boolean);
      const validated = validateRows(rows, allowedAnaGruplar, domain.opTypes);
      setImportPreview({ validated, meta: meta || {}, fileName: file.name });
    } catch (err) {
      alertDialog({ message: 'Dosya okunamadı: ' + (err?.message || err), danger: true });
    } finally {
      setImporting(false);
      e.target.value = '';  // aynı dosyayı tekrar seçebilmek için
    }
  }

  function applyImport(mode) {
    if (!importPreview) return;
    const validRows = importPreview.validated.filter(v => v.ok);
    if (validRows.length === 0) { alertDialog({ message: 'Geçerli satır yok', danger: true }); return; }

    captureUndo('Excel içe aktarma');
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
      edges: deriveEdges({ mainOps: built.mainOps, edges: prev.edges }),
    }));
    setImportPreview(null);
    // Simülasyonu sıfırla ki eski state'ten etkilenmesin
    setSimState(initialSimState());
    setTab('ops');
    // Akış türetme uyarıları (döngü atlama, bilinmeyen öncül grubu) — bloklamaz
    if (built.warnings?.length) alertDialog('Akış uyarıları:\n• ' + built.warnings.join('\n• '));
  }

  /* ---------- Simülasyon state ---------- */
  const [simState, setSimState] = useState(initialSimState);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const simStartSim  = () => setSimState(s => ({ ...s, running: true, signature: simSignature(data) }));
  const simPauseSim  = () => setSimState(s => ({ ...s, running: false }));
  const simResetSim  = () => setSimState(initialSimState());
  const simRestartSim = () => setSimState({ ...initialSimState(), running: true, signature: simSignature(data) });
  const simSetSpeed  = (sp) => setSimState(s => ({ ...s, speed: sp }));
  // A6: sonuçlar model değiştikten sonra da ekranda kalabiliyordu (bayat) — imza karşılaştırması
  // bunu görünür kılar (SimView: uyarı bandı + KPI soluklaşma + Yeniden Başlat).
  const simStale = simState.elapsed > 0 && simState.signature !== simSignature(data);

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
  const simFastForward = () => setSimState(prev => ({
    ...fastForward(prev, dataRef.current),
    signature: simSignature(dataRef.current),
  }));

  /* B4: kaydetme hataları artık sessiz değil — banner tetikler (aynı metin tekrar set edilmez). */
  useEffect(() => {
    flowStore.onSaveError = () => {
      const text = 'Kaydetme başarısız — tarayıcı depolama alanı dolu olabilir. Model silerek yer açın veya JSON dışa aktarın.';
      setDataAlert(prev => (prev?.text === text ? prev : { tone: 'warn', text }));
    };
    return () => { flowStore.onSaveError = null; };
  }, []);

  /* ---------- B3: tek-seviye geri alma (yıkıcı işlemler) ---------- */
  const [undoToast, setUndoToast] = useState(null);   // { label }
  const undoRef = useRef(null);                        // { label, snapshot, simSnapshot }
  const undoTimerRef = useRef(null);

  const captureUndo = (label) => {
    undoRef.current = { label, snapshot: structuredClone(data), simSnapshot: structuredClone(simState) };
    setUndoToast({ label });
    clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 15000);
  };

  const performUndo = () => {
    if (!undoRef.current) return;
    setData(undoRef.current.snapshot);
    setSimState(undoRef.current.simSnapshot);
    undoRef.current = null;
    clearTimeout(undoTimerRef.current);
    setUndoToast(null);
  };

  useEffect(() => () => clearTimeout(undoTimerRef.current), []);

  /* B1: bozuk/doğrulanamayan ham veri render katmanına ulaşmadan karantinaya alınır
     (ham metin `<prefix><epoch>` anahtarına kopyalanır, prefix başına en fazla 3 tutulur).
     Yazım DOĞRULANIR: depolama doluysa null döner — çağıran taraf sahte "karantinaya
     alındı" iddiasında bulunmaz ve kaydetmeyi durdurur (persistPaused). */
  const quarantine = async (raw, reason, prefix = 'vsim_v4_karantina_') => {
    try {
      console.warn('ProVSM veri karantinası:', reason);
      const key = `${prefix}${Date.now()}`;
      const ok = await flowStore.set(key, typeof raw === 'string' ? raw : JSON.stringify(raw));
      if (!ok) return null;
      const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix)).sort();
      while (keys.length > 3) localStorage.removeItem(keys.shift());
      return key;
    } catch { return null; }
  };

  /* I2: karantina kopyası yazılamadıysa (depolama dolu) otomatik kaydetme DURUR —
     yoksa save effect bozuk-ama-tek `vsim_v4` kopyasının üzerine varsayılanı yazar.
     Banner'da "sürdür" düğmesi gerekmez: sayfa yenilendiğinde durum sıfırlanır ve
     yer açıldıysa yükleme/karantina akışı baştan, bu kez başarıyla çalışır. */
  const [persistPaused, setPersistPaused] = useState(false);

  /* ---------- Kalıcı veri: yükle ve kaydet ---------- */
  useEffect(() => {
    (async () => {
      let found = false;
      let v4QuarantineFailed = false;   // "kaydetme durduruldu" banner'ı v3 mesajıyla ezilmesin
      try {
        const res = await flowStore.get(STORAGE_KEY);
        if (res && res.value) {
          let raw, parseOk = true;
          try { raw = JSON.parse(res.value); } catch { parseOk = false; }
          const check = parseOk ? validateV4(raw) : { ok: false, errors: ['JSON parse hatası'] };

          if (parseOk && check.ok) {
            const migrated = migrateData(raw);
            if (migrated) { setData(migrated); found = true; }
          } else {
            // Bozuk JSON veya şema doğrulaması başarısız — sessiz kısmi-bozuk render yerine
            // ENGELLE: ham veri karantinaya alınır, kullanıcıya bildirilir, v3 yedeği denenir.
            const key = await quarantine(res.value, check.errors[0] || 'bilinmeyen hata');
            if (key) {
              setDataAlert({
                tone: 'danger',
                text: `Kayıtlı veri okunamadı — bozuk kopya karantinaya alındı (${key}). Eski sürüm yedeği deneniyor.`,
              });
            } else {
              // Karantina YAZILAMADI (depolama dolu): sahte güvence verme; tek kopyanın
              // üzerine yazılmaması için otomatik kaydetme durdurulur (reload sıfırlar).
              v4QuarantineFailed = true;
              setPersistPaused(true);
              setDataAlert({
                tone: 'danger',
                text: 'Kayıtlı veri okunamadı; depolama dolu olduğu için karantina kopyası ALINAMADI — vsim_v4 anahtarını elle yedekleyin. Üzerine yazılmaması için kaydetme durduruldu.',
              });
            }
          }
        }

        if (!found) {
          const old = await flowStore.get(STORAGE_KEY_V3);
          if (old && old.value) {
            try {
              // I1: v3 yedeği de doğrulamadan geçmeden render'a ulaşmasın — bozuk v3
              // aksi halde her reload'da yeniden yüklenip çökme döngüsü kurar.
              const migrated = migrateData(JSON.parse(old.value));
              const checkV3 = migrated ? validateV4(migrated) : { ok: false, errors: ['veri obje değil'] };
              if (migrated && checkV3.ok) {
                setData(migrated);
                found = true;
                await flowStore.set(STORAGE_KEY, JSON.stringify(migrated));
              } else {
                const keyV3 = await quarantine(old.value, checkV3.errors[0] || 'bilinmeyen hata', 'vsim_v3_karantina_');
                // v4 karantinası yazılamadıysa "kaydetme durduruldu" mesajı daha kritik — ezme.
                if (!v4QuarantineFailed) {
                  setDataAlert({
                    tone: 'danger',
                    text: `Eski sürüm (v3) yedeği de okunamadı${keyV3 ? ` — bozuk kopya karantinaya alındı (${keyV3})` : ' (depolama dolu olduğundan karantina kopyası alınamadı; atolye_sim_v3 anahtarını elle yedekleyin)'}. Varsayılan şablonla devam ediliyor.`,
                  });
                }
              }
            } catch { /* v3 de okunamadı (parse hatası) — varsayılana düş */ }
          }
        }
      } catch (e) { /* ilk kullanım */ }
      setUserTemplates(listUserTemplates());
      if (!found) { setGalleryFromWork(false); setView('gallery'); }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    // I2: karantina kopyası alınamadıysa bozuk-ama-tek vsim_v4 kopyasının üzerine yazma.
    if (persistPaused) return;
    // Debounce (~300ms): hızlı ardışık setData dalgalarında (ör. sürükleme, seri düzenleme)
    // her ara durumu değil yalnız SON durumu yaz — JSON.stringify + localStorage maliyeti
    // hareket başına değil durulma başına ödenir; cleanup önceki zamanlayıcıyı iptal eder.
    const t = setTimeout(() => {
      try { flowStore.set(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
    }, 300);
    return () => clearTimeout(t);
  }, [data, loaded, persistPaused]);

  /* Debounce kayıp penceresi kapağı: sekme kapanış/gizlenmesinde bekleyen
     durumu senkron yaz (dataRef her data değişiminde güncelleniyor). */
  useEffect(() => {
    if (!loaded) return;
    const flush = () => {
      if (persistPaused) return;
      try { flowStore.set(STORAGE_KEY, JSON.stringify(dataRef.current)); } catch (e) {}
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [loaded, persistPaused]);

  /* ---------- Hesaplamalar ---------- */
  const calc = useMemo(() => computeCapacity(data), [data]);

  /* ---------- Yardımcı güncelleme fonksiyonları ---------- */
  const updateSettings = (patch) => setData(d => ({ ...d, settings: { ...d.settings, ...patch } }));

  /* ---------- Süreç haritaları — VSM'den bağımsız stüdyo artefaktı ---------- */
  const updateProcessMaps = (fn) => setData(d => ({ ...d, processMaps: fn(d.processMaps || []) }));
  const deleteProcessMap = async (id) => {
    const pm = (data.processMaps || []).find(m => m.id === id);
    if (!pm) return;
    if (!(await confirmDialog({ message: `"${pm.name}" haritası silinsin mi?`, danger: true }))) return;
    captureUndo('Harita silme');
    updateProcessMaps(list => list.filter(m => m.id !== id));
  };

  /* ---------- Akış düzenleme yardımcıları ---------- */

  /* ---------- Senaryo (Model) yönetimi ---------- */
  const saveScenario = async (name, opts = {}) => {
    if ((data.scenarios?.length ?? 0) >= 15 &&
        !(await confirmDialog('15+ kayıtlı model var; depolama şişebilir. Yine de kaydedilsin mi?'))) return;
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
        settings:  clone(data.settings || {}),
        edges:     clone(data.edges || []),
        infoNodes: clone(data.infoNodes || []),
        infoEdges: clone(data.infoEdges || []),
        kaizens:   clone(data.kaizens || []),
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
  const loadScenario = async (id) => {
    const sc = (data.scenarios || []).find(s => s.id === id);
    if (!sc) return;
    if (!(await confirmDialog({ message: `"${sc.name}" modeli yüklenecek. Mevcut değişiklikler kaybolacak. Devam?`, danger: true }))) return;
    captureUndo('Model yükleme');
    setData(d => ({
      ...d,
      mainOps:   sc.snapshot.mainOps,
      subOps:    sc.snapshot.subOps,
      machines:  sc.snapshot.machines  || d.machines,
      operators: sc.snapshot.operators || d.operators,
      meta:      sc.snapshot.meta      || {},
      settings:  sc.snapshot.settings  ?? d.settings,
      infoNodes: sc.snapshot.infoNodes ?? d.infoNodes,
      infoEdges: sc.snapshot.infoEdges ?? d.infoEdges,
      kaizens:   sc.snapshot.kaizens   ?? d.kaizens,
      // Eski senaryolar edges taşımaz — yüklenen mainOps'un nextIds'inden deriveEdges ile senkronla
      edges: deriveEdges({ mainOps: sc.snapshot.mainOps, edges: sc.snapshot.edges ?? d.edges }),
    }));
    setSimState(initialSimState());  // simülasyon state'ini sıfırla
  };
  const deleteScenario = (id) => {
    captureUndo('Model silme');
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
    // Şerit sonu: en sağdaki düğümün sağına, onunla aynı hizada (spec §2) — 4'lü ızgara kalktı
    const rightmost = data.mainOps.reduce(
      (best, m) => ((m.x ?? 0) > ((best?.x) ?? -Infinity) ? m : best), null);
    const mo = {
      id: `mo_${uid()}`, name: `Yeni Ana Op ${order + 1}`, color, order, nextIds: [],
      x: rightmost ? (rightmost.x ?? LAYOUT_X0) + LANE_X_GAP : LAYOUT_X0,
      y: rightmost ? (rightmost.y ?? LAYOUT_Y0) : LAYOUT_Y0,
    };
    setData(d => ({ ...d, mainOps: [...d.mainOps, mo] }));
    setEditMainOp(mo);
  };

  const saveMainOp = (mo) => {
    setData(d => {
      const mainOps = d.mainOps.map(x => x.id === mo.id ? mo : x);
      // Modaldaki ardıl checkbox'ları nextIds'i değiştirir — edges'i senkronla
      return { ...d, mainOps, edges: deriveEdges({ mainOps, edges: d.edges }) };
    });
    setEditMainOp(null);
  };

  const deleteMainOp = async (id) => {
    if (!(await confirmDialog({ message: 'Bu 1.Seviye süreci ve içindeki tüm alt seviye süreçleri silmek istiyor musunuz?', danger: true }))) return;
    captureUndo('Grup silme');
    setData(d => {
      const mainOps = d.mainOps.filter(x => x.id !== id).map(m => ({ ...m, nextIds: m.nextIds.filter(n => n !== id) }));
      return {
        ...d,
        mainOps,
        subOps: d.subOps.filter(s => s.mainOpId !== id),
        edges: deriveEdges({ mainOps, edges: d.edges }),
      };
    });
  };

  // VSM: iki ana op arasındaki edge meta'sını güncelle (envanter adedi/bekleme vb.) — VsmView (Task 3) tüketecek
  const updateEdgeMeta = (from, to, patch) => {
    setData(d => ({
      ...d,
      edges: (d.edges || []).map(e => e.from === from && e.to === to ? { ...e, ...patch } : e),
    }));
  };

  const normalizeSubOpOrders = (subOps, mainOpIds = null) => {
    const scope = mainOpIds ? new Set(mainOpIds) : null;
    const counters = {};
    return subOps
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(s => {
        if (scope && !scope.has(s.mainOpId)) return s;
        const nextOrder = counters[s.mainOpId] ?? 0;
        counters[s.mainOpId] = nextOrder + 1;
        return { ...s, order: nextOrder };
      });
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
      name: 'Yeni 2.Seviye Süreç',
      cycleTime: 5, machineId: null, operatorId: null, stationCount: 1,
      type: domain.opTypes[0] || '', order: maxOrder + 1, nextIds: [], joinType: 'AND',
      x: pos?.x ?? (60 + (n % 4) * 210),
      y: pos?.y ?? (60 + Math.floor(n / 4) * 120),
    };
    setData(d => ({ ...d, subOps: normalizeSubOpOrders([...d.subOps, so], [so.mainOpId]) }));
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
  const updateNodeConnections = (fromId, nextIds) => setData(d => {
    const mainOps = d.mainOps.map(m => m.id === fromId ? { ...m, nextIds } : m);
    return {
      ...d,
      mainOps,
      subOps: d.subOps.map(s => s.id === fromId ? { ...s, nextIds } : s),
      // fromId bir mainOp ise edges'i nextIds ile yeniden senkronla (kopan bağlantının
      // envanter meta'sı düşer, korunanınki kalır) — subOp değişikliklerinde no-op.
      edges: deriveEdges({ mainOps, edges: d.edges }),
    };
  });
  const setNodeJoinType = (id, joinType) => setData(d => ({
    ...d,
    mainOps: d.mainOps.map(m => m.id === id ? { ...m, joinType } : m),
    subOps: d.subOps.map(s => s.id === id ? { ...s, joinType } : s),
  }));
  const setNodeSplitType = (id, splitType) => setData(d => ({
    ...d,
    mainOps: d.mainOps.map(m => m.id === id ? { ...m, splitType } : m),
    subOps: d.subOps.map(s => s.id === id ? { ...s, splitType } : s),
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
  // Verilen konteynerin çocuklarını topolojik otomatik yerleştir (flowLayout.levelLayout)
  const autoLayoutLevel = (containerId) => {
    const nodes = childNodes(data, containerId);
    if (nodes.length === 0) return;
    const pos = levelLayout(nodes);
    setData(d => ({
      ...d,
      mainOps: d.mainOps.map(m => pos[m.id] ? { ...m, ...pos[m.id] } : m),
      subOps: d.subOps.map(s => pos[s.id] ? { ...s, ...pos[s.id] } : s),
    }));
  };

  /* ---------- Alt operasyon öncelik DAG'ı otomatik kurulumu ---------- */
  const autoSetupSubOpPrecedence = async () => {
    if (!(await confirmDialog({ message: 'Mevcut alt-op öncelik ilişkileri (nextIds) silinip ana op DAG\'ı + alt-op sırasına göre otomatik kurulsun mu?', danger: true }))) return;
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
        const changed = d.subOps.map(s => {
          if (s.id === drag.id) return { ...s, mainOpId: target.mainOpId, parentId: target.mainOpId, order: target.order };
          if (s.mainOpId === target.mainOpId && s.order >= target.order && s.id !== drag.id) {
            return { ...s, order: s.order + 1 };
          }
          return s;
        });
        return { ...d, subOps: normalizeSubOpOrders(changed, [source.mainOpId, target.mainOpId]) };
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
  const addMachine = () => setData(d => ({ ...d, machines: [...d.machines, { id: `m_${uid()}`, name: `Yeni ${L.resource}`, type: domain.resourceTypes[0] || '', brand: '' }] }));
  const updateMachine = (id, patch) => setData(d => ({ ...d, machines: d.machines.map(m => m.id === id ? { ...m, ...patch } : m) }));
  const deleteMachine = (id) => setData(d => ({
    ...d,
    machines: d.machines.filter(m => m.id !== id),
    subOps: d.subOps.map(s => s.machineId === id ? { ...s, machineId: null } : s)
  }));

  const addOperator = () => setData(d => ({ ...d, operators: [...d.operators, { id: `o_${uid()}`, name: `Yeni ${L.person}`, skill: 3, skills: [] }] }));
  const updateOperator = (id, patch) => setData(d => ({ ...d, operators: d.operators.map(o => o.id === id ? { ...o, ...patch } : o) }));
  const deleteOperator = (id) => setData(d => ({
    ...d,
    operators: d.operators.filter(o => o.id !== id),
    subOps: d.subOps.map(s => s.operatorId === id ? { ...s, operatorId: null } : s)
  }));

  const resetWorkbench = async () => {
    const hasWork = hasMeaningfulWork(data);
    const msg = hasWork
      ? `Çalışma sayfası sıfırlanacak — alt seviye süreçler, ${lower(L.resourcePlural)}, ${lower(L.personPlural)} ve model bilgisi silinecek. Boş kanvas açılacak. Devam edilsin mi?`
      : 'Akışı temel zincire döndür?'
    if (!(await confirmDialog({ message: msg, danger: true }))) return;
    captureUndo('Sıfırlama');
    // TODO(Faz 2+): domain sayısı artınca varsayılan şablonu domain pack'ten al
    setData(buildDataFromTemplate(blankTemplate));
    setSimState(initialSimState());
    setTab('flow');
  };

  /* ---------- Galeri: şablon uygulama + kullanıcı şablonları ---------- */
  const applyTemplate = async (tpl) => {
    /* Boş kanvasta kullanıcının çizdiği mainOps gerçek iştir; tekstil şablon iskeleti ise değildir
       (istasyon adı değiştirmek iş sayılmaz — bilinçli, belgelenmiş ödünleşim). */
    const isUserFlow = data.domainId === 'blank' && (data.mainOps?.length ?? 0) > 0;
    if ((hasMeaningfulWork(data) || isUserFlow) && !(await confirmDialog({ message: `"${tpl.name}" şablonu yüklenecek. Mevcut çalışmanın üzerine yazılır (önce "Şablon olarak kaydet" ile saklayabilirsin). Devam?`, danger: true }))) return;
    captureUndo('Şablon uygulama');
    setData(buildDataFromTemplate(tpl));
    setSimState(initialSimState());
    setTab('flow');
    setView('work');
  };

  const saveAsTemplate = async () => {
    const name = await promptDialog({ message: 'Şablon adı:', defaultValue: data.meta?.modelAdi ? `${data.meta.modelAdi} şablonu` : 'Şablonum' });
    if (!name) return;
    const ok = saveUserTemplate(templateFromData(name, data));
    setUserTemplates(listUserTemplates());
    alertDialog(ok ? { message: `"${name}" galeriye eklendi.` } : { message: 'Şablon kaydedilemedi — tarayıcı depolama alanı dolu veya erişilemiyor.', danger: true });
  };

  const deleteUserTpl = async (tpl) => {
    if (!(await confirmDialog({ message: `"${tpl.name}" şablonu silinsin mi?`, danger: true }))) return;
    deleteUserTemplate(tpl.templateId);
    setUserTemplates(listUserTemplates());
  };

  const exportUserTpl = (tpl) => {
    const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vsim-sablon-${tpl.name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importUserTpl = async (file) => {
    try {
      const tpl = JSON.parse(await file.text());
      if (!tpl?.seed || !tpl?.name) { alertDialog({ message: 'Geçersiz şablon dosyası', danger: true }); return; }
      // B5: seed'i mevcut data iskeletiyle sarmalayıp validateV4'ten geçir — bozuk şablon
      // (ör. mainOps[i].id sayısal) sessizce galeriye girmesin. Not: migrateData'yı DEVREYE
      // SOKMADAN doğrudan validateV4'e veriyoruz — migrateData/deriveEdges bozuk seed'lerde
      // (ör. mainOps: [null]) istisna fırlatabilir; validateV4 ise tasarım gereği çökmez.
      const seed = tpl.seed || {};
      const wrapped = {
        schemaVersion: 4,
        domainId: tpl.domainId,
        mainOps: seed.mainOps || [],
        subOps: seed.subOps || [],
        machines: seed.machines || [],
        operators: seed.operators || [],
        settings: seed.settings || {},
        scenarios: [], meta: seed.meta || {}, edges: seed.edges || [],
        infoNodes: [], infoEdges: [], kaizens: [],
      };
      const check = validateV4(wrapped);
      if (!check.ok) { alertDialog({ message: 'Şablon dosyası geçersiz: ' + (check.errors[0] || 'bilinmeyen hata'), danger: true }); return; }
      saveUserTemplate({ ...tpl, templateId: 'user_' + uid(), custom: true });
      setUserTemplates(listUserTemplates());
    } catch { alertDialog({ message: 'Dosya okunamadı — geçerli bir şablon JSON\'u değil', danger: true }); }
  };

  /* ---------- Render ---------- */
  const domain = getDomain(data.domainId);
  const L = domain.labels;
  return (
    <DomainContext.Provider value={domain}>
    {/* B1/B4: kapatılabilir uyarı şeridi — hem galeri hem çalışma alanında görünür olmalı
        (bozuk veri karantinaya alındığında kullanıcı çoğu zaman galeriye yönlendirilir). */}
    {dataAlert && (
      <div className={`sticky top-0 z-40 border-b ${dataAlert.tone === 'danger' ? 'bg-danger-tint border-danger/30 text-danger' : 'bg-warn-tint border-warn/30 text-warn'}`}
        role="alert">
        <div className="max-w-[1600px] mx-auto px-6 py-2 flex items-center justify-between gap-3 text-xs font-medium">
          <span className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{dataAlert.text}</span>
          <button onClick={() => setDataAlert(null)} className="opacity-70 hover:opacity-100 flex-shrink-0 px-1" aria-label="Bildirimi kapat">✕</button>
        </div>
      </div>
    )}
    {/* B3: tek-seviye geri alma toast'ı — galeri veya çalışma alanı, hangisindeyse orada görünür */}
    {undoToast && (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-header text-header-ink rounded-lg shadow-card px-4 py-2.5 flex items-center gap-3 text-sm">
        <span>«{undoToast.label}» uygulandı</span>
        <button onClick={performUndo} className="font-semibold text-brand-bright hover:underline">Geri Al</button>
        <button onClick={() => setUndoToast(null)} className="text-header-ink/60 hover:text-header-ink" aria-label="Kapat">✕</button>
      </div>
    )}
    {view === 'gallery' ? (
      <Gallery
        userTemplates={userTemplates}
        onSelect={applyTemplate}
        onDeleteUser={deleteUserTpl}
        onExportUser={exportUserTpl}
        onImportUser={importUserTpl}
        onClose={() => setView('work')}
        hasWork={galleryFromWork}
      />
    ) : (
    <div className="min-h-screen bg-paper text-ink font-sans">
      {/* Başlık */}
      <header className="bg-header text-header-ink">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-header-ink flex-shrink-0" aria-hidden="true">
              <circle cx="18" cy="18" r="14.5" stroke="currentColor" strokeWidth="2.5" />
              <circle cx="18" cy="18" r="5" fill="#DE7C3B" />
            </svg>
            <div>
              <h1 className="text-lg font-display font-bold tracking-tight">
                <span className="text-header-ink">Pro</span><span className="text-brand-bright">VSM</span>{data.meta?.modelAdi ? <span className="font-sans font-semibold text-header-ink/80"> · {data.meta.modelAdi}</span> : null}
              </h1>
              <p className="text-[11px] tracking-[0.08em] uppercase text-header-ink/60 font-mono truncate max-w-[560px]">
                {data.meta?.modelAdi ? (
                  [data.meta.modelNo, data.meta.atolyeAdi, data.meta.musteri, data.meta.tarih, data.meta.sezon]
                    .filter(Boolean).join(' · ')
                ) : `${L.facility} · SMV · YAMAZUMI · DARBOĞAZ`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => downloadTemplate(data.mainOps, domain)} className="ml-2 p-2 border border-header-ink/25 text-header-ink hover:bg-header-ink/10 rounded transition flex items-center gap-1.5 text-xs" title="Excel şablonunu indir">
              <Download className="w-4 h-4" /> Şablon
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={importing}
              className="p-2 bg-accent hover:bg-accent-strong text-white rounded transition flex items-center gap-1.5 text-xs disabled:opacity-50"
              title="Excel yükle">
              <Upload className="w-4 h-4" /> {importing ? 'Okunuyor...' : 'Excel Yükle'}
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelected} className="hidden" />
            <button onClick={() => setHelpOpen(true)} title="Nasıl kullanılır & terimler"
              className="p-2 border border-header-ink/25 text-header-ink hover:bg-header-ink/10 rounded transition">
              <HelpCircle className="w-4 h-4" />
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 border border-header-ink/25 text-header-ink hover:bg-header-ink/10 rounded transition" title="Ayarlar">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button onClick={resetWorkbench} className="p-2 border border-header-ink/25 text-header-ink hover:bg-header-ink/10 rounded transition flex items-center gap-1.5 text-xs" title="Sayfayı sıfırla — temel akış kalır">
              <RefreshCw className="w-4 h-4" /> Sıfırla
            </button>
            <button onClick={() => { setUserTemplates(listUserTemplates()); setGalleryFromWork(true); setView('gallery'); }}
              className="p-2 border border-header-ink/25 text-header-ink hover:bg-header-ink/10 rounded transition flex items-center gap-1.5 text-xs" title="Şablon galerisi">
              <LayoutGrid className="w-4 h-4" /> Şablonlar
            </button>
            <button onClick={saveAsTemplate}
              className="p-2 border border-header-ink/25 text-header-ink hover:bg-header-ink/10 rounded transition flex items-center gap-1.5 text-xs" title="Bu akışı galeriye şablon olarak kaydet">
              <Star className="w-4 h-4" /> Şablon olarak kaydet
            </button>
          </div>
        </div>
        {/* Sekmeler */}
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex gap-1 text-sm">
            {/* Sıra = çalışma akışı: Çiz → Modelle → Kaynakla → Detaylandır → Hesapla →
                Çalıştır → Haritala → Raporla. Bağımlılık sırasını izler: Kaynaklar,
                onu tüketen Operasyonlar'dan ÖNCE gelir (makine tanımlanmadan atanamaz). */}
            <TabBtn active={tab === 'surec'} onClick={() => setTab('surec')} icon={Route}>Süreç</TabBtn>
            <TabBtn active={tab === 'flow'} onClick={() => setTab('flow')} icon={Network}>Akış</TabBtn>
            <TabBtn active={tab === 'flown8n'} onClick={() => setTab('flown8n')} icon={GitBranch}>Akış (n8n)</TabBtn>
            <TabBtn active={tab === 'resources'} onClick={() => setTab('resources')} icon={Wrench}>Kaynaklar</TabBtn>
            <TabBtn active={tab === 'ops'} onClick={() => setTab('ops')} icon={Layers}>Operasyonlar</TabBtn>
            <TabBtn active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={BarChart3}>Hesaplama</TabBtn>
            <TabBtn active={tab === 'sim'} onClick={() => setTab('sim')} icon={Play}>Simülasyon</TabBtn>
            <TabBtn active={tab === 'vsm'} onClick={() => setTab('vsm')} icon={MapIcon}>VSM</TabBtn>
            <TabBtn active={tab === 'rapor'} onClick={() => setTab('rapor')} icon={FileSpreadsheet}>Rapor</TabBtn>
          </div>
        </div>
      </header>

      <main className={tab === 'surec' ? 'w-full px-3 py-4' : 'max-w-[1600px] mx-auto px-6 py-6'}>
        {tab === 'ops' && (
          (data.mainOps || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Network className="w-16 h-16 text-ink-faint mb-4" />
              <h2 className="font-display text-xl font-semibold text-ink mb-2">Önce akışı kur</h2>
              <p className="text-sm text-ink-soft mb-5 max-w-md">
                2.Seviye süreçleri doldurmadan önce <b>Akış</b> sekmesinde 1.Seviye süreç adımlarını tanımla. 1.Seviye süreçler burada otomatik görünecek.
              </p>
              <button onClick={() => setTab('flow')}
                className="px-5 py-2.5 bg-accent hover:bg-accent-strong text-white rounded-lg text-sm font-medium flex items-center gap-2 transition">
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
            path={flowPath}
            setPath={setFlowPath}
            onUpdatePosition={updateNodePosition}
            onUpdateConnections={updateNodeConnections}
            onAutoLayout={autoLayoutLevel}
            onAddChild={addChildNode}
            onDeleteNode={deleteNode}
            onEditNode={editNode}
            onSetJoin={setNodeJoinType}
            onSetSplit={setNodeSplitType}
            onSaveScenario={saveScenario}
            onLoadScenario={loadScenario}
            onDeleteScenario={deleteScenario}
            onDuplicateScenario={duplicateScenario}
          />
        )}
        {tab === 'flown8n' && (
          <FlowN8nView
            data={data}
            calc={calc}
            onChange={setData}
            path={flowPath}
            setPath={setFlowPath}
          />
        )}
        {tab === 'vsm' && (
          <VsmView
            data={data}
            calc={calc}
            scenarios={data.scenarios}
            onEditMainOp={(id) => setEditMainOp(data.mainOps.find(m => m.id === id))}
            onUpdateEdge={updateEdgeMeta}
            // Genel yama prop'u — yalnız infoNodes/infoEdges/kaizens için kullanılır (VsmView Task 3/4)
            onPatch={(fn) => setData(d => ({ ...d, ...fn(d) }))}
          />
        )}
        {tab === 'surec' && (
          <ProcessMapStudio
            maps={data.processMaps || []}
            onUpdate={updateProcessMaps}
            onDeleteMap={deleteProcessMap}
          />
        )}
        {tab === 'dashboard' && <DashboardView data={data} calc={calc} />}
        {tab === 'sim' && (
          <SimView
            data={data}
            calc={calc}
            simState={simState}
            simStale={simStale}
            onStart={simStartSim}
            onPause={simPauseSim}
            onReset={simResetSim}
            onRestart={simRestartSim}
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
      <HelpDrawer
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        tab={tab}
        onGoTab={(t) => { setTab(t); setHelpOpen(false); }}
      />
      <DialogHost />
    </div>
    )}
    </DomainContext.Provider>
  );
}

/* ============================================================
   Excel import önizleme modali
   ============================================================ */
function MetaItem({ label, value, className = '' }) {
  return (
    <div className={className}>
      <span className="text-accent font-semibold">{label}:</span>{' '}
      <span className="text-ink-soft">{value}</span>
    </div>
  );
}

function ImportPreviewModal({ preview, onApply, onClose }) {
  const L = useLabels();
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

  // Evrensel modal standardı (B2): ESC + backdrop tıklama ile kapanış.
  // (IME koruması: kompozisyon sırasında ESC girişi iptal eder, modalı kapatmasın.)
  useEffect(() => {
    const onKey = (e) => { if (e.isComposing) return; if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Excel Önizleme"
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-[14px] shadow-card w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-accent" />
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Excel Önizleme</h2>
              <p className="text-xs text-ink-soft mt-0.5">{preview.fileName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-2 rounded text-ink-soft">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meta bilgisi (varsa) */}
        {preview.meta && Object.keys(preview.meta).length > 0 && (
          <div className="px-6 py-3 bg-surface-2 border-b border-line">
            <div className="text-[11px] uppercase tracking-[0.08em] text-ink-soft font-semibold mb-1.5">Doküman Bilgisi</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
              {preview.meta.modelAdi && <MetaItem label="Model" value={preview.meta.modelAdi} />}
              {preview.meta.modelNo && <MetaItem label="Model No" value={preview.meta.modelNo} />}
              {preview.meta.atolyeAdi && <MetaItem label={L.facility} value={preview.meta.atolyeAdi} />}
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
        <div className="px-6 py-3 bg-surface-2 border-b border-line flex items-center gap-5 text-sm">
          <span><span className="font-mono font-semibold text-ink">{total}</span> <span className="text-ink-soft">satır</span></span>
          <span className="text-accent-ink"><span className="font-mono font-semibold">{valid}</span> geçerli</span>
          <span className={invalid > 0 ? 'text-danger' : 'text-ink-faint'}>
            <span className="font-mono font-semibold">{invalid}</span> hatalı
          </span>
          <span className="text-ink-soft ml-auto">
            Toplam çevrim: <span className="font-mono font-semibold text-ink">{toplamCevrim.toFixed(2)} sn</span>
            {' · '}
            {Object.entries(byGroup).map(([g, n]) => `${g}: ${n}`).join(' · ')}
          </span>
        </div>

        {/* Tablo */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-ink-soft uppercase tracking-[0.08em] text-[11px] sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-semibold w-14">Satır</th>
                <th className="px-3 py-2 text-left font-semibold">1.Seviye Süreç</th>
                <th className="px-3 py-2 text-left font-semibold">Operasyon</th>
                <th className="px-3 py-2 text-right font-semibold">Çevrim (sn)</th>
                <th className="px-3 py-2 text-left font-semibold">Tip</th>
                <th className="px-3 py-2 text-left font-semibold">Öncesi</th>
                <th className="px-3 py-2 text-left font-semibold">{L.resource}</th>
                <th className="px-3 py-2 text-left font-semibold">{L.person}</th>
                <th className="px-3 py-2 text-left font-semibold">Durum</th>
              </tr>
            </thead>
            <tbody>
              {preview.validated.map((v, i) => (
                <tr key={i} className={`border-b border-line ${v.ok ? '' : 'bg-danger-tint'}`}>
                  <td className="px-3 py-1.5 text-ink-faint font-mono">{v.rowNo}</td>
                  <td className="px-3 py-1.5 text-ink">{v.anaGrup || <span className="text-danger italic">boş</span>}</td>
                  <td className="px-3 py-1.5 text-ink">{v.opAdi || <span className="text-danger italic">boş</span>}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-ink">{v.cevrim || '—'}</td>
                  <td className="px-3 py-1.5 text-ink-soft">
                    {v.tip}
                    {v.tipUyari && (
                      <span className="ml-1.5 text-[11px] bg-warn-tint text-warn px-1.5 py-0.5 rounded-sm uppercase tracking-wide" title={v.tipUyari}>⚠ listede yok</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-ink-soft whitespace-nowrap">
                    {v.oncesi || '—'}
                    {v.oncesiUyari && (
                      <span className="ml-1.5 text-[11px] bg-warn-tint text-warn px-1.5 py-0.5 rounded-sm uppercase tracking-wide" title={v.oncesiUyari}>⚠ bilinmeyen</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-ink-soft">{v.makineKodu || '—'}</td>
                  <td className="px-3 py-1.5 text-ink-soft">{v.operator || '—'}</td>
                  <td className="px-3 py-1.5">
                    {v.ok ? (
                      <span className="inline-flex items-center gap-1 text-ok">
                        <Check className="w-3 h-3" /> OK
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-danger" title={v.errors.join('; ')}>
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
        <div className="px-6 py-4 border-t border-line flex items-center justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-ink-soft hover:bg-surface-2 rounded-lg">
            İptal
          </button>
          <button
            onClick={() => onApply('merge')}
            disabled={valid === 0}
            className="px-4 py-2 text-sm bg-surface border border-line text-ink hover:bg-surface-2 rounded-lg disabled:opacity-50"
            title={`Mevcut ${lower(L.resource)}/${lower(L.person)} kayıtları korunur; üzerine yeni operasyonlar yazılır`}
          >
            Birleştir ve Uygula
          </button>
          <button
            onClick={() => onApply('replace')}
            disabled={valid === 0}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-strong text-white rounded-lg disabled:opacity-50"
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
      className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition font-medium
        ${active ? 'border-accent text-header-ink' : 'border-transparent text-header-ink/55 hover:text-header-ink'}`}>
      <Icon className="w-4 h-4" />{children}
    </button>
  );
}

/* ============================================================
   Sekme 1: OPERASYONLAR — Kanban tarzı, sürükle-bırak
   ============================================================ */
function OpsView({ data, calc, drag, dragOver, onDragStart, onDragEnd, onDragOver, onDropMain, onDropSub, onAddMain, onEditMain, onDeleteMain, onAddSub, onEditSub, onDeleteSub }) {
  const L = useLabels();
  const sortedMainOps = [...data.mainOps].sort((a, b) => a.order - b.order);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">1.Seviye Süreçler</h2>
          <p className="text-sm text-ink-soft mt-0.5">
            Sütunlara tıklayıp düzenleyin · 2.Seviye süreçleri <span className="font-mono bg-surface-2 text-ink-soft px-1 rounded">sürükleyip</span> gruplar arası taşıyın · Kaynaklar sekmesinden {lower(L.resourcePlural)} sürükleyip kartlara bırakın
          </p>
        </div>
        <button onClick={onAddMain}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-strong transition">
          <Plus className="w-4 h-4" />1.Seviye Süreç Ekle
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
              className={`flex-shrink-0 w-80 bg-surface rounded-[10px] border shadow-card transition
                ${isOver ? 'border-accent ring-2 ring-accent/20' : 'border-line'}
                ${isBottleneck ? 'ring-2 ring-danger/30' : ''}`}
              onDragOver={(e) => onDragOver(e, 'mainOp', mo.id)}
              onDrop={() => onDropMain(mo.id)}>
              {/* Kolon başlığı: 4px renk şeridi + renkli başlık (Görev B düğüm kartı örüntüsü) */}
              <div className="rounded-t-[10px] overflow-hidden">
                <div style={{ backgroundColor: mo.color, height: 4 }} />
                <div className="p-3 border-b border-line flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-display font-semibold truncate" style={{ color: mo.color }}>{mo.name}</h3>
                      {mo.isShared && <span title="Ortak istasyon — birden fazla akış besler" className="text-sm leading-none">🔗</span>}
                      {isBottleneck && <AlertTriangle className="w-3.5 h-3.5 text-danger" title="Darboğaz" />}
                    </div>
                    <div className="text-xs text-ink-soft font-mono tabular-nums mt-0.5">
                      {subs.length} alt op · Σ {stats?.totalCycle.toFixed(0)} sn · {stats?.capacity.toFixed(0)} adet/v
                    </div>
                  </div>
                  <button onClick={() => onEditMain(mo)} className="p-1 text-ink-faint hover:text-ink rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => onDeleteMain(mo.id)} className="p-1 text-ink-faint hover:text-danger rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
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
                  className="w-full py-2 text-sm bg-surface text-ink-soft hover:text-ink hover:bg-surface-2 rounded-lg border border-dashed border-line-strong transition flex items-center justify-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />2.Seviye Süreç
                </button>
              </div>
            </div>
          );
        })}
        {sortedMainOps.length === 0 && (
          <div className="w-full text-center py-20 text-ink-faint">
            Henüz 1.Seviye süreç yok. Yukarıdaki “1.Seviye Süreç Ekle” butonuyla başlayın.
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
      className={`group bg-surface border rounded-lg p-2 cursor-move transition
        ${isDragging ? 'opacity-40 scale-95' : 'hover:border-line-strong hover:shadow-card'}
        ${isSlowest ? 'border-warn/50 bg-warn-tint/40' : 'border-line'}`}>
      <div className="flex items-start gap-1.5">
        <GripVertical className="w-3.5 h-3.5 text-ink-faint mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <span className="text-sm font-medium leading-tight text-ink">{subOp.name}</span>
            <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
              <span className="text-xs font-mono tabular-nums bg-surface-2 text-ink px-1.5 py-0.5 rounded">{subOp.cycleTime} sn</span>
              {subOp.cycleTime > 0 && (
                <span className="text-[10px] font-mono tabular-nums text-ink-soft" title="Bu operasyonda dakikada max çıktı">
                  {(60 / subOp.cycleTime).toFixed(1)} ad/dk
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-[10px] bg-surface-2 text-ink-soft px-1.5 py-0.5 rounded-sm font-mono uppercase tracking-wide">{subOp.type}</span>
            {machine && (
              <span className="text-[10px] bg-info-tint text-info border border-info/20 px-1.5 py-0.5 rounded-sm font-mono flex items-center gap-0.5">
                <Cog className="w-2.5 h-2.5" />{machine.name}
              </span>
            )}
            {operator && (
              <span className="text-[10px] bg-warn-tint text-warn border border-warn/20 px-1.5 py-0.5 rounded-sm font-mono flex items-center gap-0.5">
                <User className="w-2.5 h-2.5" />{operator.name}
              </span>
            )}
          </div>
          <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-[10px] px-1.5 py-0.5 text-ink-soft hover:text-ink flex items-center gap-0.5">
              <Edit2 className="w-2.5 h-2.5" />Düzenle
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-[10px] px-1.5 py-0.5 text-danger hover:opacity-75 flex items-center gap-0.5">
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
  const { opTypes } = useDomain();
  const L = useLabels();
  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Makineler */}
      <div className="bg-surface rounded-[10px] border border-line shadow-card">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cog className="w-5 h-5 text-info" />
            <h3 className="font-display font-semibold text-ink">{L.resource} Havuzu</h3>
            <span className="text-xs text-ink-soft font-mono tabular-nums">({data.machines.length})</span>
          </div>
          <button onClick={onAddMachine} className="flex items-center gap-1 text-sm px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-strong transition">
            <Plus className="w-3.5 h-3.5" />Ekle
          </button>
        </div>
        <p className="mx-4 mt-3 px-3 py-2 text-xs bg-info-tint text-info rounded-lg">
          💡 İpucu: {L.resource} kartlarını <b>Operasyonlar</b> sekmesindeki 2.Seviye süreç kartlarına sürükleyerek atama yapabilirsiniz.
        </p>
        <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          {data.machines.map(m => (
            <div key={m.id}
              draggable
              onDragStart={() => onDragStart('machine', m.id)}
              onDragEnd={onDragEnd}
              className={`bg-surface border border-line rounded-lg p-3 cursor-move transition hover:border-accent/40 hover:shadow-card
                ${drag?.type === 'machine' && drag.id === m.id ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-ink-faint" />
                <div className="flex-1 grid grid-cols-3 gap-2 text-sm">
                  <input className="border border-line rounded px-2 py-1 font-mono text-sm text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                    value={m.name} onChange={e => onUpdateMachine(m.id, { name: e.target.value })} placeholder="Kod" />
                  <input className="border border-line rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                    value={m.type} onChange={e => onUpdateMachine(m.id, { type: e.target.value })} placeholder="Tip" />
                  <input className="border border-line rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                    value={m.brand} onChange={e => onUpdateMachine(m.id, { brand: e.target.value })} placeholder="Marka" />
                </div>
                <button onClick={() => onDeleteMachine(m.id)} className="p-1.5 text-ink-faint hover:text-danger rounded"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Operatörler */}
      <div className="bg-surface rounded-[10px] border border-line shadow-card">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-warn" />
            <h3 className="font-display font-semibold text-ink">{L.person} Havuzu</h3>
            <span className="text-xs text-ink-soft font-mono tabular-nums">({data.operators.length})</span>
          </div>
          <button onClick={onAddOperator} className="flex items-center gap-1 text-sm px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-strong transition">
            <Plus className="w-3.5 h-3.5" />Ekle
          </button>
        </div>
        <p className="mx-4 mt-3 px-3 py-2 text-xs bg-info-tint text-info rounded-lg">
          💡 İpucu: {L.person} kartlarını sürükleyip 2.Seviye süreçlere atayabilirsiniz. <b>Yetenekler</b> = yapılabilecek op tipleri (çoklu beceri için gerekli).
        </p>
        <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          {data.operators.map(o => (
            <div key={o.id}
              draggable
              onDragStart={() => onDragStart('operator', o.id)}
              onDragEnd={onDragEnd}
              className={`bg-surface border border-line rounded-lg p-3 cursor-move transition hover:border-accent/40 hover:shadow-card
                ${drag?.type === 'operator' && drag.id === o.id ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-ink-faint" />
                <User className="w-4 h-4 text-warn" />
                <input className="flex-1 border border-line rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                  value={o.name} onChange={e => onUpdateOperator(o.id, { name: e.target.value })} placeholder="İsim" />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-ink-soft">Beceri</span>
                  <select className="border border-line rounded px-1.5 py-1 text-sm font-mono text-ink focus:outline-none focus:border-accent"
                    value={o.skill} onChange={e => onUpdateOperator(o.id, { skill: parseInt(e.target.value) })}>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button onClick={() => onDeleteOperator(o.id)} className="p-1.5 text-ink-faint hover:text-danger rounded"><Trash2 className="w-4 h-4" /></button>
              </div>
              {/* Yetenek chip'leri */}
              <div className="mt-2 flex items-center gap-1 flex-wrap">
                <span className="text-[11px] text-ink-soft uppercase tracking-[0.08em] font-semibold mr-1">Yetenekler:</span>
                {opTypes.map(t => {
                  const selected = (o.skills || []).includes(t);
                  return (
                    <button key={t}
                      onClick={() => {
                        const curr = o.skills || [];
                        const next = selected ? curr.filter(x => x !== t) : [...curr, t];
                        onUpdateOperator(o.id, { skills: next });
                      }}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition border ${
                        selected
                          ? 'bg-accent-tint text-accent-ink border-accent'
                          : 'bg-surface-2 text-ink-soft border-line hover:bg-line/40'
                      }`}>
                      {t}
                    </button>
                  );
                })}
                {(o.skills || []).length === 0 && (
                  <span className="text-[10px] text-ink-faint italic ml-2">yetenek seçilmedi — her yerde çalışabilir varsayılır</span>
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
function FlowView({ data, calc, path, setPath, onUpdatePosition, onUpdateConnections, onAutoLayout, onAddChild, onDeleteNode, onEditNode, onSetJoin, onSetSplit, onSaveScenario, onLoadScenario, onDeleteScenario, onDuplicateScenario }) {
  const L = useLabels();
  // Modsuz tuval (Süreç'teki n8n deseni): Taşı/Bağla modu YOK — gövde sürükle = taşı,
  // kenar handle'ından sürükle = bağla. Mod seçimi gerektirmediğinden buton da gerekmiyor.
  const [dragNode, setDragNode] = useState(null);       // { id, offX, offY, moved }
  const [connecting, setConnecting] = useState(null);   // { fromId, side, fromPt, curX, curY, targetId }
  const [hoverConn, setHoverConn] = useState(null);     // '{from}-{to}' for delete hover
  const [hoverNode, setHoverNode] = useState(null);     // düğüm üstünde → handle + aksiyon ikonları
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  // path (drill-in konteyner id yığını) artık üst bileşenden geliyor — Akış (n8n) sekmesiyle
  // aynı aktif konteyneri paylaşmak için (bkz. AtolyePlatform: flowPath/setFlowPath).
  const wrapRef = React.useRef(null);                       // viewport (overflow-hidden) kabı
  const svgRef = React.useRef(null);                        // bağlama sürüklemesinde pointer capture
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 }); // pan px + zoom (viewport.js sözleşmesi)

  const NODE_W = 200;
  const NODE_H = 64;
  const FLOW_DIMS = { w: NODE_W, h: NODE_H };

  // Aktif katman: kök (ROOT) → ana op'lar; değilse → o konteynerin çocukları
  const current = path.length ? path[path.length - 1] : ROOT_ID;
  const atRoot = current === ROOT_ID;
  const nodes = childNodes(data, current);
  const enterNode = (id) => setPath(p => [...p, id]);

  // x/y'si olmayan düğümler için topolojik yedek konum (kalıcı değil, kullanıcı taşıyınca sabitlenir)
  const posMap = React.useMemo(() => {
    const fallback = levelLayout(nodes);
    const p = {};
    nodes.forEach(n => { p[n.id] = { x: n.x ?? fallback[n.id].x, y: n.y ?? fallback[n.id].y }; });
    return p;
  }, [nodes]);
  const PX = (n) => posMap[n.id]?.x ?? 0;
  const PY = (n) => posMap[n.id]?.y ?? 0;

  // Canvas boyutunu düğümlere göre dinamik ayarla
  const canvasW = Math.max(1000, ...nodes.map(n => PX(n) + NODE_W + 80));
  const canvasH = Math.max(480,  ...nodes.map(n => PY(n) + NODE_H + 90));

  /* --- Pointer → canvas koordinatı. getScreenCTM yerine viewport matematiği:
     CSS zoom + translate altında CTM'e güvenilmez (spec Risk 1/2) — kendi
     dönüşümümüz her durumda doğru: canvas = (ekran - pan) / zoom. --- */
  const toCanvasXY = (clientX, clientY) => {
    const el = wrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return screenToCanvas(view, clientX - rect.left, clientY - rect.top);
  };

  /* --- Düğüm sürükleme (gövdeden) --- */
  const onNodePointerDown = (e, node) => {
    e.stopPropagation();
    const { x, y } = toCanvasXY(e.clientX, e.clientY);
    setDragNode({ id: node.id, offX: x - PX(node), offY: y - PY(node), moved: false });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  /* --- Bağlama: kenar handle'ından sürükle → hedef kutunun üstünde bırak --- */
  // Hangi düğüm bu canvas noktasının altında? Sondan başa: üstte çizilen kazanır.
  const nodeAtPoint = (x, y) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i], nx = PX(n), ny = PY(n);
      if (x >= nx && x <= nx + NODE_W && y >= ny && y <= ny + NODE_H) return n;
    }
    return null;
  };
  const HANDLE_PT = {
    top: { x: NODE_W / 2, y: 0 }, right: { x: NODE_W, y: NODE_H / 2 },
    bottom: { x: NODE_W / 2, y: NODE_H }, left: { x: 0, y: NODE_H / 2 },
  };
  const startConnect = (e, node, side) => {
    e.stopPropagation();
    const h = HANDLE_PT[side];
    const fromPt = { x: PX(node) + h.x, y: PY(node) + h.y };
    const { x, y } = toCanvasXY(e.clientX, e.clientY);
    setConnecting({ fromId: node.id, side, fromPt, curX: x, curY: y, targetId: null });
    // Capture SVG'de: imleç kutuların üstüne gelse de move/up buraya düşsün (hedefi
    // tarayıcı hover'ı değil, nodeAtPoint geometrisi belirler — Süreç'teki desen).
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  const finishConnect = () => {
    const c = connecting;
    setConnecting(null);
    if (!c || !c.targetId || c.targetId === c.fromId) return;   // boşluğa/kendine bırakma = iptal
    // Döngü kontrolü: evren kardeş alt-küme değil TÜM eş-tip düğümler — alt-op kenarları
    // konteynerler arası gidebilir; alt-küme kontrolü konteyner-aşan döngüyü kaçırır.
    const cycleUniverse = atRoot ? data.mainOps : data.subOps;
    if (wouldCreateCycle(cycleUniverse, c.fromId, c.targetId)) {
      alertDialog({ message: 'Bu bağlantı bir döngü oluşturur — akış hep ileri gitmeli.', danger: true });
      return;
    }
    const src = nodes.find(m => m.id === c.fromId);
    if (src && !(src.nextIds || []).includes(c.targetId)) {
      onUpdateConnections(c.fromId, [...(src.nextIds || []), c.targetId]);
    }
  };

  const onSvgPointerMove = (e) => {
    const { x, y } = toCanvasXY(e.clientX, e.clientY);
    if (connecting) {
      const t = nodeAtPoint(x, y);
      setConnecting(c => c && { ...c, curX: x, curY: y, targetId: t && t.id !== c.fromId ? t.id : null });
      return;
    }
    if (!dragNode) return;
    const nx = Math.max(4, Math.min(canvasW - NODE_W - 4, x - dragNode.offX));
    const ny = Math.max(4, Math.min(canvasH - NODE_H - 4, y - dragNode.offY));
    onUpdatePosition(dragNode.id, nx, ny);
    if (!dragNode.moved) setDragNode(d => ({ ...d, moved: true }));
  };
  const onSvgPointerUp = () => {
    if (connecting) finishConnect();
    setDragNode(null);
  };

  const removeConn = (fromId, toId) => {
    const src = nodes.find(m => m.id === fromId);
    if (!src) return;
    onUpdateConnections(fromId, (src.nextIds || []).filter(id => id !== toId));
  };

  /* --- Yüzer zoom kontrolleri + sığdır (ProcessMapStudio deseni) --- */
  const zoomBy = (factor) => {
    const el = wrapRef.current;
    if (!el) return;
    setView(v => zoomAt(v, el.clientWidth / 2, el.clientHeight / 2, factor, ZOOM_MIN, ZOOM_MAX));
  };
  const resetView = () => setView({ x: 0, y: 0, zoom: 1 });
  const fitView = () => {
    const el = wrapRef.current;
    if (!el || nodes.length === 0) { resetView(); return; }
    const minX = Math.min(...nodes.map(n => PX(n)));
    const minY = Math.min(...nodes.map(n => PY(n)));
    const maxX = Math.max(...nodes.map(n => PX(n) + NODE_W));
    const maxY = Math.max(...nodes.map(n => PY(n) + NODE_H));
    const contentW = maxX - minX, contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) { resetView(); return; }
    const zoom = clampZoom(
      Math.min(1, (el.clientWidth - 80) / contentW, (el.clientHeight - 80) / contentH),
      ZOOM_MIN, ZOOM_MAX);
    setView({
      x: (el.clientWidth - contentW * zoom) / 2 - minX * zoom,
      y: (el.clientHeight - contentH * zoom) / 2 - minY * zoom,
      zoom,
    });
  };

  // Seviyeye ilk girişte otomatik sığdır (mount + drill-in/out). Her düğüm
  // hareketinde yeniden sığdırmasın diye deps bilerek yalnız [current].
  // useLayoutEffect: seviye değişiminde eski view ile bir kare çizilip zıplamasın (paint öncesi fit)
  React.useLayoutEffect(() => { fitView(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current]);

  /* Tekerlek: Ctrl/Cmd → imlece zoom, düz → pan. React onWheel passive olabildiğinden
     preventDefault için native (non-passive) listener (ProcessMapStudio :670 deseni). */
  useEffect(() => {
    const el = wrapRef.current;
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

  /* --- Render yardımcı --- */
  const nodeRect = (m) => { const x = PX(m), y = PY(m); return { x, y, cx: x + NODE_W / 2, cy: y + NODE_H / 2, right: x + NODE_W, bottom: y + NODE_H }; };

  const bottleneckHere = calc.bottleneckByContainer?.[current];
  // Sol yük şeridi: değer kartın gösterdiği EFEKTİF çevrim (yedek-paralel harmonik
  // birleşir → kapasiteyle tutarlı), payda görünen seviyenin maksimumu.
  // Darboğaz her zaman danger — eşikten bağımsız (spec §4).
  const totalCycleOfNode = (n) =>
    childNodes(data, n.id).length > 0
      ? (calc.effectiveCycleOf?.[n.id] ?? calc.totalCycleOf?.[n.id] ?? 0)
      : (n.cycleTime || 0);
  const maxCycleHere = Math.max(1, ...nodes.map(totalCycleOfNode));
  const incomingCount = {}; nodes.forEach(n => { incomingCount[n.id] = 0; });
  nodes.forEach(src => (src.nextIds || []).forEach(nid => { if (incomingCount[nid] != null) incomingCount[nid]++; }));
  const outgoingCount = {};
  nodes.forEach(n => { outgoingCount[n.id] = (n.nextIds || []).filter(x => nodes.some(m => m.id === x)).length; });

  const connections = [];
  nodes.forEach(src => {
    (src.nextIds || []).forEach(nextId => {
      const tgt = nodes.find(m => m.id === nextId);
      if (tgt) connections.push({ src, tgt, key: `${src.id}-${tgt.id}` });
    });
  });

  return (
    <div className="bg-surface rounded-[10px] border border-line shadow-card">
      {/* Toolbar */}
      <div className="p-3 border-b border-line flex items-center gap-2 flex-wrap">
        <button onClick={() => onAutoLayout(current)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-surface border border-line rounded-lg text-ink hover:bg-surface-2">
          <Sparkles className="w-3.5 h-3.5" />Otomatik Yerleştir
        </button>
        <button onClick={() => onAddChild(current)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-surface border border-line rounded-lg text-ink hover:bg-surface-2">
          <Plus className="w-3.5 h-3.5" />{atRoot ? 'Ana Op Ekle' : 'Alt Op Ekle'}
        </button>
        <div className="flex-1" />
        {/* Hat metrikleri — üst bardan taşındı (header sade); ayrıntı Hesaplama sekmesinde */}
        <div className="hidden md:flex items-center gap-1.5 mr-1 text-[11px]" title="Ayrıntılı hesap Hesaplama sekmesinde">
          <span className="px-2 py-1 rounded-md border border-line bg-surface-2 text-ink-soft">
            Hat Çıktısı <b className="font-mono text-ink">{calc.lineCapacity.toFixed(0)} ad</b>
          </span>
          <span className="px-2 py-1 rounded-md border border-accent/40 bg-accent-tint text-accent-ink">
            Takt <b className="font-mono">{calc.taktTimeSec.toFixed(1)} sn</b>
          </span>
          <span className="px-2 py-1 rounded-md border border-line bg-surface-2 text-ink-soft">
            Talep <b className="font-mono text-ink">{calc.demand} ad</b>
          </span>
        </div>
        <button onClick={() => { setScenarioName(''); setShowSaveDialog(true); }}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-strong">
          <Save className="w-3.5 h-3.5" />Bu Akışı Kaydet
        </button>
      </div>

      {/* Breadcrumb — katman gezinme */}
      <div className="px-4 py-2 border-b border-line flex items-center gap-1.5 text-xs flex-wrap">
        <button onClick={() => setPath([])}
          className={`px-2.5 py-0.5 rounded-full border flex items-center gap-1 text-[11px] transition ${atRoot ? 'bg-accent-tint text-accent-ink border-accent/40' : 'bg-surface text-ink-soft border-line hover:border-accent/40 hover:text-accent'}`}>
          <Network className="w-3 h-3" />Ana Akış
        </button>
        {path.map((cid, i) => (
          <React.Fragment key={cid}>
            <ChevronRight className="w-3 h-3 text-ink-faint" />
            <button onClick={() => setPath(path.slice(0, i + 1))}
              className={`px-2.5 py-0.5 rounded-full border text-[11px] transition ${i === path.length - 1 ? 'bg-accent-tint text-accent-ink border-accent/40' : 'bg-surface text-ink-soft border-line hover:border-accent/40 hover:text-accent'}`}>
              {findNode(data, cid)?.name || '—'}
            </button>
          </React.Fragment>
        ))}
        <span className="ml-2 text-[11px] text-ink-faint">düğüme çift tıkla → içine gir · breadcrumb ile geri dön</span>
      </div>

      {/* Etkileşim ipucu — mod yok, bırakma hedefi varken vurgulanır */}
      <div className={`px-4 py-1.5 text-[11px] border-b transition ${
        connecting ? (connecting.targetId ? 'bg-accent-tint border-accent/30 text-accent-ink' : 'bg-warn-tint border-warn/30 text-warn')
          : 'border-line text-ink-faint'
      }`}>
        {!connecting && <>Kutuyu sürükle → taşı · kutunun üstüne gel, <b>kenardaki noktadan</b> sürükle → bağla · oka tıkla → sil</>}
        {connecting && !connecting.targetId && <>Hedef kutunun üstünde bırakın · boşluğa bırakmak iptal eder</>}
        {connecting && connecting.targetId && <>Bırakın → <b>{nodes.find(n => n.id === connecting.targetId)?.name}</b> bağlanacak</>}
      </div>

      {/* Senaryo şeridi */}
      {(data.scenarios || []).length > 0 && (
        <div className="px-3 py-2 border-b border-line bg-surface-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
              <FolderOpen className="w-3.5 h-3.5 inline mr-1" />Kayıtlı Senaryolar
            </span>
            {(data.scenarios || []).map(sc => (
              <div key={sc.id} className="group flex items-center gap-1 bg-surface border border-line rounded pl-2 pr-0.5 py-0.5 text-xs">
                <button onClick={() => onLoadScenario(sc.id)} className="text-ink hover:text-accent py-1 pr-1 font-medium flex items-center gap-1">
                  <Layers className="w-3 h-3" />{sc.name}
                </button>
                <span className="text-ink-faint font-mono">
                  {sc.snapshot.mainOps.length}·{sc.snapshot.subOps.length}
                </span>
                <button onClick={() => onDuplicateScenario(sc.id)} title="Kopyala"
                  className="p-1 text-ink-faint hover:text-ink rounded">
                  <Copy className="w-3 h-3" />
                </button>
                <button onClick={async () => { if (await confirmDialog({ message: `"${sc.name}" silinsin mi?`, danger: true })) onDeleteScenario(sc.id); }} title="Sil"
                  className="p-1 text-ink-faint hover:text-danger rounded">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Canvas — dış katman pan (translate), iç katman CSS zoom (keskin metin,
          ProcessMapStudio :862 deseni). Nokta ızgara pan/zoom ile akar. */}
      <div ref={wrapRef}
        className="relative overflow-hidden h-[600px]"
        style={{
          background: 'radial-gradient(circle, color-mix(in srgb, var(--color-line) 40%, transparent) 1px, transparent 1px), var(--color-surface)',
          backgroundPosition: `${view.x}px ${view.y}px`,
          backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px`,
        }}>
        <div style={{ transform: `translate(${view.x}px, ${view.y}px)`, transformOrigin: '0 0' }}>
          <div style={{ width: canvasW, height: canvasH, zoom: view.zoom }}>
            <svg
              ref={svgRef}
              width={canvasW}
              height={canvasH}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              onPointerLeave={onSvgPointerUp}
              className="select-none"
              style={{ touchAction: 'none', overflow: 'visible' }}
            >
          <defs>
            {/* refX=9 → uç TAM yol sonunda (yol kenardan 4px önce bittiği için uç hep kart dışında) */}
            <marker id="arrowhead-flow" markerWidth="11" markerHeight="9" refX="9" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L10,3.5 z" fill="#52646C" />
            </marker>
            <marker id="arrowhead-flow-red" markerWidth="11" markerHeight="9" refX="9" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L10,3.5 z" fill="#B3402A" />
            </marker>
            <clipPath id="node-card-clip">
              <rect width={NODE_W} height={NODE_H} rx={9} />
            </clipPath>
            <filter id="node-card-shadow" x="-30%" y="-60%" width="160%" height="220%">
              <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#1A2B32" floodOpacity="0.06" />
              <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#1A2B32" floodOpacity="0.10" />
            </filter>
          </defs>

          {/* Bağlantılar (düğümlerin altında çizilsin) */}
          {connections.map(({ src, tgt, key }) => {
            // SABİT PORT (n8n modeli): çıkış DAİMA sağ kenar, giriş DAİMA sol kenar.
            // Eskiden kenar konuma göre seçiliyordu; o yüzden bir kutunun aynı kenarı
            // hem giriş hem çıkış olabiliyor ve okun yönü okunamıyordu. Artık sol kenar
            // "buraya girer", sağ kenar "buradan çıkar" — belirsizlik imkânsız.
            const pStart = { x: PX(src) + NODE_W, y: PY(src) + NODE_H / 2 };
            const pTgt = { x: PX(tgt), y: PY(tgt) + NODE_H / 2 };
            // Yol, hedef kenarından 4px önce biter → ok ucu tamamen kart DIŞINDA kalır
            // (kartlar oklardan SONRA çizilir; kenarda biten uç altta kalıyordu).
            const pEnd = offsetAlongSide(pTgt, 'left', 4);
            const d = orthoPath(pStart, 'right', pEnd, 'left');
            // Geri akışta yol şeritten dolanır → sil rozeti de şeride otursun,
            // yoksa kartın altında kalırdı (yol ile rozet aynı kaynaktan hesaplanır).
            const backward = isBackwardEdge(pStart, pEnd);
            const mx = (pStart.x + pEnd.x) / 2;
            const my = backward ? orthoBackwardLaneY(pStart, pEnd) : (pStart.y + pEnd.y) / 2;
            const isHover = hoverConn === key;
            const edgeColor = isHover ? '#B3402A' : '#52646C';
            return (
              <g key={key}
                onMouseEnter={() => setHoverConn(key)}
                onMouseLeave={() => setHoverConn(null)}>
                <path d={d} stroke={edgeColor} strokeWidth={isHover ? 3 : 2}
                  fill="none" markerEnd={isHover ? 'url(#arrowhead-flow-red)' : 'url(#arrowhead-flow)'} />
                {/* Kaynak port noktası — bağlantının nereden çıktığı net görünsün (kenara teğet, kart dışında) */}
                {(() => { const sp = offsetAlongSide(pStart, 'right', 3); return (
                  <circle cx={sp.x} cy={sp.y} r={3} fill={edgeColor} stroke="white" strokeWidth={1} />
                ); })()}
                {/* hit area (görünmez geniş şerit) */}
                <path d={d} stroke="transparent" strokeWidth={16} fill="none"
                  style={{ cursor: 'pointer' }}
                  onClick={async () => { if (await confirmDialog({ message: `"${src.name}" → "${tgt.name}" bağlantısı silinsin mi?`, danger: true })) removeConn(src.id, tgt.id); }} />
                {/* Delete button mid-point */}
                {isHover && (
                  <g style={{ cursor: 'pointer' }}
                    onClick={async () => { if (await confirmDialog({ message: `"${src.name}" → "${tgt.name}" bağlantısı silinsin mi?`, danger: true })) removeConn(src.id, tgt.id); }}>
                    <circle cx={mx} cy={my} r={10} fill="#B3402A" />
                    <path d={`M ${mx - 4} ${my - 4} L ${mx + 4} ${my + 4} M ${mx + 4} ${my - 4} L ${mx - 4} ${my + 4}`}
                      stroke="white" strokeWidth={2} strokeLinecap="round" />
                  </g>
                )}
              </g>
            );
          })}

          {/* Bağlama sürüklemesi: kaynak handle'dan imlece kesikli lastik bant */}
          {connecting && (
            <g style={{ pointerEvents: 'none' }}>
              <path d={`M ${connecting.fromPt.x} ${connecting.fromPt.y} L ${connecting.curX} ${connecting.curY}`}
                fill="none" className="stroke-accent" strokeWidth={2} strokeDasharray="6 4" />
              <circle cx={connecting.curX} cy={connecting.curY} r={4} className="fill-accent" />
            </g>
          )}

          {/* Düğümler */}
          {nodes.map(mo => {
            const r = nodeRect(mo);
            const color = mo.color || '#0891b2';
            const childCount = childNodes(data, mo.id).length;
            const isContainer = childCount > 0;
            const capV = calc.cap?.[mo.id] ?? 0;
            const totalCycle = totalCycleOfNode(mo);
            const isBottleneck = mo.id === bottleneckHere;
            const isDropTarget = connecting?.targetId === mo.id;
            const isHovered = hoverNode === mo.id && !isBottleneck && !isDropTarget;
            const strokeClass = isDropTarget ? 'stroke-accent' : (isBottleneck ? 'stroke-danger' : (isHovered ? 'stroke-accent' : 'stroke-line'));
            const strokeWidth = (isDropTarget || isBottleneck) ? 2 : (isHovered ? 1.5 : 1);
            const loadClass = isBottleneck ? 'fill-danger'
              : (totalCycle / maxCycleHere > 0.6 ? 'fill-warn' : 'fill-ok');
            const inCount = incomingCount[mo.id] || 0;
            const joinIsDup = (mo.joinType || 'AND') === 'DUP';
            // Handle'lar ve aksiyon toolbar'ı: üstüne gelince (bağlama sürüklerken gizli)
            const showToolbar = hoverNode === mo.id && !connecting;
            const showHandles = hoverNode === mo.id && !connecting && !dragNode;
            const tbW = isContainer ? 92 : 64;
            return (
              <g key={mo.id}
                transform={`translate(${r.x}, ${r.y})`}
                style={{ cursor: 'grab' }}
                onPointerDown={(e) => onNodePointerDown(e, mo)}
                onDoubleClick={() => enterNode(mo.id)}
                onMouseEnter={() => setHoverNode(mo.id)}
                onMouseLeave={() => setHoverNode(h => h === mo.id ? null : h)}>
                {/* kart gövdesi: beyaz yüzey + gölge + SOL yük şeridi (spec §4) */}
                <g style={{ filter: 'url(#node-card-shadow)' }}>
                  <g clipPath="url(#node-card-clip)">
                    <rect width={NODE_W} height={NODE_H} className="fill-surface" />
                    <rect width={6} height={NODE_H} className={loadClass} />
                  </g>
                </g>
                <rect width={NODE_W} height={NODE_H} rx={9} fill="none" className={strokeClass} strokeWidth={strokeWidth} />
                {/* op kimlik rengi — küçük nokta (renk şeridi anlamı artık yük) */}
                <circle cx={22} cy={22} r={3.5} fill={color} />
                <text x={32} y={26} textAnchor="start" fontSize={14} fontWeight={600}
                  className="fill-ink" style={{ fontFamily: 'var(--font-display)' }}>
                  {mo.name.length > 24 ? mo.name.slice(0, 23) + '…' : mo.name}
                </text>
                <text x={32} y={42} textAnchor="start" fontSize={11.5}
                  className="fill-ink-soft" style={{ fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums' }}>
                  {totalCycle.toFixed(0)} sn · {capV.toFixed(0)} ad/v
                </text>
                {isBottleneck && (
                  <g>
                    <circle cx={NODE_W - 15} cy={15} r={9} className="fill-danger" stroke="white" strokeWidth={1.5} />
                    <text x={NODE_W - 15} y={19} textAnchor="middle" fill="white" fontSize={11} fontWeight={700}>!</text>
                  </g>
                )}
                {/* Join tipi rozeti — SOL alt (gelen kenarlar; tıkla: VE ↔ Çoğaltma) */}
                {inCount > 1 && (
                  <g style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onSetJoin(mo.id, joinIsDup ? 'AND' : 'DUP'); }}>
                    {/* Açıklama: metin SÖZLÜKTEN türer (tek kaynak) + mevcut durum + tıklama ipucu.
                        SVG içinde HTML InfoTip kullanılamadığı için native <title>. */}
                    <title>
                      {`${GLOSSARY.joinType.term} — ${GLOSSARY.joinType.short}\n\nŞu an: ${joinIsDup ? 'ÇOĞALT (hızlar toplanır)' : 'VE (en yavaş giriş belirler)'}\nTıkla → ${joinIsDup ? 'VE' : 'ÇOĞALT'}`}
                    </title>
                    <rect x={8} y={NODE_H - 20} width={joinIsDup ? 42 : 28} height={15} rx={7}
                      className="fill-surface-2 stroke-line" strokeWidth={1} />
                    <text x={8 + (joinIsDup ? 21 : 14)} y={NODE_H - 9} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
                      {joinIsDup ? 'ÇOĞALT' : 'VE'}
                    </text>
                  </g>
                )}
                {/* Split tipi rozeti — SAĞ alt (giden kenarlar; tıkla: ÇOĞALT ↔ BÖL) */}
                {outgoingCount[mo.id] > 1 && (() => {
                  const splitIsSplit = (mo.splitType || 'DUP') === 'SPLIT';
                  const sw = splitIsSplit ? 28 : 42;   // 'BÖL'=28, 'ÇOĞALT'=42
                  return (
                    <g style={{ cursor: 'pointer' }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onSetSplit(mo.id, splitIsSplit ? 'DUP' : 'SPLIT'); }}>
                      <title>
                        {`${GLOSSARY.splitType.term} — ${GLOSSARY.splitType.short}\n\nŞu an: ${splitIsSplit ? 'BÖL (kapasiteye orantılı paylaşılır)' : 'ÇOĞALT (her dal tam hız)'}\nTıkla → ${splitIsSplit ? 'ÇOĞALT' : 'BÖL'}`}
                      </title>
                      <rect x={NODE_W - sw - 8} y={NODE_H - 20} width={sw} height={15} rx={7}
                        className="fill-surface-2 stroke-line" strokeWidth={1} />
                      <text x={NODE_W - sw / 2 - 8} y={NODE_H - 9} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
                        {splitIsSplit ? 'BÖL' : 'ÇOĞALT'}
                      </text>
                    </g>
                  );
                })()}
                {/* Bağlama handle'ları — 4 kenar ortası. Üstüne gelince çıkar, sürükle → bağla.
                    Mod butonu yerine bunlar var (Süreç'teki n8n deseni). */}
                {showHandles && Object.entries(HANDLE_PT).map(([side, p]) => (
                  <g key={side} style={{ cursor: 'crosshair' }}
                    onPointerDown={(e) => startConnect(e, mo, side)}>
                    {/* görünmez geniş vuruş alanı — 6px'lik noktayı yakalamak zor olmasın */}
                    <circle cx={p.x} cy={p.y} r={10} fill="transparent" />
                    <circle cx={p.x} cy={p.y} r={5} className="fill-surface stroke-accent" strokeWidth={2} />
                  </g>
                ))}
                {/* Hover toolbar — kartın ÜSTÜNDE (düzenle / içine gir / sil), gövde boş kalır (spec §4) */}
                {showToolbar && (
                  <g transform={`translate(${NODE_W - tbW}, -30)`}>
                    {/* görünmez köprü: kart ↔ toolbar arası 6px boşlukta mouseleave tetiklenmesin */}
                    <rect x={-(NODE_W - tbW)} y={24} width={NODE_W} height={6} fill="transparent" />
                    <rect width={tbW} height={24} rx={12} className="fill-surface stroke-line" strokeWidth={1}
                      style={{ filter: 'url(#node-card-shadow)' }} />
                    <g style={{ cursor: 'pointer' }} onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onEditNode(mo.id); }}>
                      <circle cx={18} cy={12} r={10} fill="transparent" />
                      <path d="M 13 15 l4 -4 2 2 -4 4 z M 18 9 l1.5 -1.5 2 2 -1.5 1.5 z" className="fill-ink-soft" />
                    </g>
                    {isContainer && (
                      <g style={{ cursor: 'pointer' }} onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); enterNode(mo.id); }}>
                        <circle cx={46} cy={12} r={10} fill="transparent" />
                        <path d="M 42 8 h6 v6 M 42 14 l7 -7" fill="none" className="stroke-ink-soft"
                          strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    )}
                    <g style={{ cursor: 'pointer' }} onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onDeleteNode(mo.id); }}>
                      <circle cx={tbW - 18} cy={12} r={10} fill="transparent" />
                      <path d={`M ${tbW - 22} 8 L ${tbW - 14} 16 M ${tbW - 14} 8 L ${tbW - 22} 16`}
                        className="stroke-danger" strokeWidth={2} strokeLinecap="round" />
                    </g>
                  </g>
                )}
              </g>
            );
          })}

            </svg>
          </div>
        </div>
        {/* Yüzer zoom kontrolleri — transform DIŞI, ekranda sabit */}
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

      <div className="px-4 py-1.5 text-[11px] text-ink-faint border-t border-line flex items-center gap-2 flex-wrap">
        <span>Kenardaki nokta → sürükle & bağla</span>
        <span>·</span>
        <span>Çift tıklayın → içine girin (alt akış)</span>
        <span>·</span>
        <span>Kalem → düzenle · Ok → bağlantı sil</span>
        <span>·</span>
        <span>VE/ÇOĞALT rozeti → birleşme tipi</span>
        <span>·</span>
        <span><span className="inline-block w-2 h-2 bg-danger rounded-full align-middle mr-1"></span>darboğaz</span>
        {nodes.length === 0 && <><span>·</span><span className="text-warn font-medium">Bu katman boş — "Alt Op Ekle" ile başlayın</span></>}
      </div>

      {/* Kaydet diyaloğu */}
      {showSaveDialog && (
        <Modal title="Bu Akışı Senaryo Olarak Kaydet" onClose={() => setShowSaveDialog(false)}>
          <Field label="Senaryo Adı" hint="Örn: 'Mevcut durum', 'Otomat eklenmiş', 'İkinci istasyon eklenmiş'">
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
          <div className="bg-accent-tint border border-accent/20 rounded-lg p-3 text-xs text-accent-ink">
            <b>Kaydedilenler:</b> {data.mainOps.length} 1.Seviye süreç, {data.subOps.length} alt seviye süreç, tüm pozisyon ve bağlantılar, {lower(L.resource)}/{lower(L.person)} atamaları, ayarlar ve VSM verileri (envanter, bilgi akışı, kaizen) — bu modelle daha sonra karşılaştırma yapılabilir.
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-line">
            <button onClick={() => setShowSaveDialog(false)} className="px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2 rounded">İptal</button>
            <button onClick={() => { onSaveScenario(scenarioName.trim() || 'Senaryo'); setShowSaveDialog(false); }}
              className="px-4 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent-strong flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />Kaydet
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
   Sekme 3b: AKIŞ (n8n) — React Flow canvas (Faz 1b)
   INPUT → alt-op'lar → OUTPUT; sürükle-bağla ile akış kur. Aynı drill-in
   konteyner yığınını (path/setPath) Akış sekmesiyle paylaşır.
   ============================================================ */
function FlowN8nView({ data, calc, onChange, path, setPath }) {
  const current = path.length ? path[path.length - 1] : ROOT_ID;
  const atRoot = current === ROOT_ID;

  return (
    <div className="bg-surface rounded-[10px] border border-line shadow-card">
      {/* Breadcrumb — Akış sekmesiyle aynı aktif konteyneri gösterir */}
      <div className="px-4 py-2 border-b border-line flex items-center gap-1.5 text-xs flex-wrap">
        <button onClick={() => setPath([])}
          className={`px-2.5 py-0.5 rounded-full border flex items-center gap-1 text-[11px] transition ${atRoot ? 'bg-accent-tint text-accent-ink border-accent/40' : 'bg-surface text-ink-soft border-line hover:border-accent/40 hover:text-accent'}`}>
          <GitBranch className="w-3 h-3" />Ana Akış
        </button>
        {path.map((cid, i) => (
          <React.Fragment key={cid}>
            <ChevronRight className="w-3 h-3 text-ink-faint" />
            <button onClick={() => setPath(path.slice(0, i + 1))}
              className={`px-2.5 py-0.5 rounded-full border text-[11px] transition ${i === path.length - 1 ? 'bg-accent-tint text-accent-ink border-accent/40' : 'bg-surface text-ink-soft border-line hover:border-accent/40 hover:text-accent'}`}>
              {findNode(data, cid)?.name || '—'}
            </button>
          </React.Fragment>
        ))}
        <span className="ml-2 text-[11px] text-ink-faint">düğüme çift tıkla → içine gir · sürükle-bağla ile akışı kur</span>
      </div>
      <FlowEditor
        data={data}
        containerId={current}
        calc={calc}
        onChange={onChange}
        onEnter={(id) => setPath(p => [...p, id])}
      />
    </div>
  );
}

/* ============================================================
   Sekme 4: HESAPLAMA — dashboard, yamazumi, kapasite tablosu
   ============================================================ */
function DashboardView({ data, calc }) {
  const L = useLabels();
  const { opTypes, adviceHints } = useDomain();
  // Standart Yamazumi/OBC: her çubuk bir operatör/istasyon, iş elemanları yığılı (bkz. yamazumiBars.js).
  const yBars = yamazumiBars(data, calc.taktTimeSec);
  const chartData = yBars.map(b => ({ name: b.label, total: Number(b.total.toFixed(1)), status: b.status }));
  const yamazumiFill = { darbogaz: '#B3402A', risk: '#B45309', normal: '#2F9E68' };

  // Hat geneli dengeleme: yaprak istasyonların (çocuksuz alt op) CT'leri üzerinden.
  // stationCount kadar tekrarla — her paralel istasyon ΣCT ve N'ye ayrı katkı verir.
  const leafCts = (data.subOps || [])
    .filter(s => childNodes(data, s.id).length === 0)
    .flatMap(s => Array(Math.max(1, s.stationCount || 1)).fill(s.cycleTime || 0))
    .filter(c => c > 0);
  const totalCt = leafCts.reduce((a, b) => a + b, 0);
  const maxCt = leafCts.length ? Math.max(...leafCts) : 0;
  const be = balancingEfficiencyPct({ totalCtSec: totalCt, stationCount: leafCts.length, maxCtSec: maxCt });
  const bl = balanceLossPct({ totalCtSec: totalCt, stationCount: leafCts.length, maxCtSec: maxCt });
  const totalSmvMin = (totalCt / 60) * (1 + (data.settings.pfd ?? 0));
  const reqOp = requiredOperators(totalSmvMin, calc.taktTimeSec);
  const beTone = leafCts.length === 0 ? 'slate' : be >= 85 ? 'emerald' : be >= 80 ? 'amber' : 'red';

  const sharedList = analyzeSharedStations(data, calc);

  return (
    <div className="space-y-6">
      {/* Üst kutucuklar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigKpi label="Hat Çıktısı (Darboğaz)" term="darbogaz" value={`${calc.lineCapacity.toFixed(0)}`} unit="adet/vardiya" tone="cyan" icon={Activity} />
        <BigKpi label="Takt Time" term="takt" value={calc.taktTimeSec.toFixed(1)} unit="sn/adet" tone="amber" icon={ChevronRight} />
        <BigKpi label="Toplam Alt Op" value={data.subOps.length} unit="operasyon" tone="slate" icon={Package} />
        <BigKpi label="Net Vardiya" value={data.settings.netMinutes} unit={`dk · verim ${(data.settings.efficiency*100).toFixed(0)}%`} tone="slate" icon={SettingsIcon} />
        <BigKpi
          label="Dengeleme Verimi"
          term="dengeleme"
          value={leafCts.length ? `%${be.toFixed(1)}` : '—'}
          unit={leafCts.length ? `kayıp %${bl.toFixed(1)}` : 'yaprak istasyon yok'}
          tone={beTone}
          icon={Scale}
        />
        <BigKpi
          label={`Gerekli ${L.person}`}
          value={leafCts.length && Number.isFinite(reqOp.raw) ? `${reqOp.count}` : '—'}
          unit={leafCts.length && Number.isFinite(reqOp.raw) ? `hesap: ${reqOp.raw.toFixed(2)} (ΣSMV/Takt)` : 'veri yok'}
          tone="slate"
          icon={Users}
        />
      </div>

      {/* Yamazumi */}
      <div className="bg-surface rounded-[10px] border border-line shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display font-semibold text-ink flex items-center gap-2"><BarChart3 className="w-5 h-5 text-accent" />Yamazumi — Operatör/İstasyon Bazında İş Yükü<InfoTip term="yamazumi" /></h3>
            <p className="text-xs text-ink-soft mt-0.5">Standart Yamazumi — her çubuk bir operatör/istasyon; iş elemanları yığılı; Takt çizgisiyle kıyas. Kesikli çizgi = Takt Time. Kırmızı = Takt aşımı (toplam &gt; Takt), sarı = risk (Takt'ın %80-100'ü), yeşil = normal.</p>
          </div>
        </div>
        <div style={{ height: 340 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E0D6" />
              <XAxis dataKey="name" tick={{ fill: '#52646C', fontSize: 11 }} axisLine={{ stroke: '#D5CCBD' }} tickLine={{ stroke: '#D5CCBD' }} />
              <YAxis tick={{ fill: '#52646C', fontSize: 11 }} axisLine={{ stroke: '#D5CCBD' }} tickLine={{ stroke: '#D5CCBD' }}
                label={{ value: 'saniye', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#52646C' }} />
              <Tooltip
                contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E0D6', borderRadius: 10, boxShadow: '0 1px 2px rgba(26,43,50,0.06), 0 8px 24px rgba(26,43,50,0.08)', fontSize: 12 }}
                labelStyle={{ color: '#1A2B32', fontFamily: 'var(--font-sans)', fontWeight: 600, marginBottom: 2 }}
                itemStyle={{ fontFamily: 'var(--font-mono)', color: '#1A2B32' }}
                formatter={(v) => [Number(v).toFixed(1) + ' sn', 'Toplam İş İçeriği']}
              />
              <ReferenceLine y={calc.taktTimeSec} stroke="#B3402A" strokeDasharray="5 5" label={{ value: `Takt ${calc.taktTimeSec.toFixed(1)} sn`, fontSize: 11, fill: '#B3402A', position: 'right' }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={yamazumiFill[entry.status] || '#2F9E68'} />
                ))}
                <LabelList dataKey="total" position="top" fontSize={11} fontFamily="var(--font-mono)" fill="#1A2B32" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ortak İstasyonlar */}
      {sharedList.length > 0 && (
        <div className="bg-surface border border-line rounded-[10px] shadow-card p-4">
          <h3 className="font-display text-lg font-semibold text-ink mb-1">🔗 Ortak İstasyonlar</h3>
          <p className="text-[12px] text-ink-soft mb-3">
            Kapasite akışlara bölüşülür · %85 üstü kullanım kapasite aşımı uyarısı tetikler (M/D/1 kuyruk modeli)<InfoTip term="mdq1" />
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sharedList.map(st => {
              const tone = st.utilizationPct > 85 ? 'danger' : st.utilizationPct > 70 ? 'warn' : 'ok';
              const toneText = { danger: 'text-danger', warn: 'text-warn', ok: 'text-ok' }[tone];
              const toneBg = { danger: 'bg-danger', warn: 'bg-warn', ok: 'bg-ok' }[tone];
              return (
                <div key={st.id} className={`border rounded-lg p-3 ${st.isBottleneck ? 'border-danger bg-danger-tint/30' : 'border-line'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm" style={{ color: st.color }}>{st.name}</span>
                    <span className={`font-mono tabular-nums text-sm font-semibold ${toneText}`}>
                      %{st.utilizationPct.toFixed(1)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-2 rounded-full mt-2 overflow-hidden">
                    <div className={`h-full rounded-full ${toneBg}`} style={{ width: `${Math.min(st.utilizationPct, 100)}%` }} />
                  </div>
                  <div className="mt-2 space-y-0.5 text-[11px] text-ink-soft tabular-nums">
                    <div>Besleyen akış: {st.bands.length ? st.bands.map(b => b.name).join(', ') : '—'}</div>
                    <div>Kullanım: {st.totalUseMin.toFixed(0)} dk / {(st.machineCount * (data.settings.netMinutes ?? 540)).toFixed(0)} dk · {st.machineCount} {lower(L.resource)}</div>
                    <div>Ort. bekleme (M/D/1): {st.queueWaitSec === Infinity ? '∞ — kapasite aşımı' : `${st.queueWaitSec.toFixed(1)} sn`}</div>
                  </div>
                  {st.extraMachines > 0 && (
                    <div className="mt-2 text-[11px] font-semibold text-danger">
                      ⚠ Öneri: +{st.extraMachines} {lower(L.resource)} ekleyin (gereken: {st.neededMachines}) veya kapasiteyi akışlara yeniden dağıtın.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tablo */}
      <div className="bg-surface rounded-[10px] border border-line shadow-card overflow-hidden">
        <div className="p-4 border-b border-line">
          <h3 className="font-display font-semibold text-ink">1.Seviye Süreç — Kapasite Tablosu</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-ink-soft text-[11px] uppercase tracking-[0.08em]">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Ana Op</th>
                <th className="px-4 py-2 text-right font-semibold">Alt Op</th>
                <th className="px-4 py-2 text-right font-semibold">Σ Çevrim (sn)<InfoTip term="cevrim" placement="bottom" /></th>
                <th className="px-4 py-2 text-right font-semibold">SMV (dk, +PF&D)<InfoTip term="smv" placement="bottom" /></th>
                <th className="px-4 py-2 text-right font-semibold">İstasyon</th>
                <th className="px-4 py-2 text-right font-semibold">Kapasite (ad/v)</th>
                <th className="px-4 py-2 text-right font-semibold">Kapasite Temposu (sn)<InfoTip text="Sürecin sürdürebildiği birim tempo (kapasiteden türer); Yamazumi iş-içeriği DEĞİL." placement="bottom" /></th>
                <th className="px-4 py-2 text-left font-semibold">En Yavaş Alt Op</th>
                <th className="px-4 py-2 text-center font-semibold">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono tabular-nums">
              {calc.perMain.map(p => (
                <tr key={p.mainOp.id} className={`transition hover:bg-surface-2/50 ${p.mainOp.id === calc.bottleneckId ? 'bg-danger-tint/40' : ''}`}>
                  <td className="px-4 py-2 font-sans text-ink">
                    <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ backgroundColor: p.mainOp.color }}></span>
                    {p.mainOp.name}
                  </td>
                  <td className="px-4 py-2 text-right">{p.subs.length}</td>
                  <td className="px-4 py-2 text-right">{p.totalCycle.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right">{p.smv.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{p.stations}</td>
                  <td className="px-4 py-2 text-right font-semibold">{p.capacity.toFixed(0)}</td>
                  <td className="px-4 py-2 text-right">{(p.effectiveCycle ?? p.totalCycle).toFixed(1)}</td>
                  <td className="px-4 py-2 text-left font-sans text-xs text-ink-soft">{p.slowest?.name ?? '—'} {p.slowest && <span className="text-ink-faint">({p.slowest.cycleTime}sn)</span>}</td>
                  <td className="px-4 py-2 text-center">
                    {p.mainOp.id === calc.bottleneckId
                      ? <span className="text-[10px] uppercase tracking-wider bg-danger-tint text-danger px-2 py-0.5 rounded-sm font-sans font-semibold">DARBOĞAZ</span>
                      : <span className="text-[10px] uppercase tracking-wider bg-ok-tint text-ok px-2 py-0.5 rounded-sm font-sans font-semibold">uygun</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Öneriler */}
      <div className="bg-warn-tint border border-warn/30 rounded-[10px] p-5">
        <h3 className="font-display font-semibold text-ink flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-warn" />Hat Dengeleme Önerileri</h3>
        <ul className="text-sm space-y-1.5 text-ink">
          {calc.perMain.map(p => {
            if (p.mainOp.id === calc.bottleneckId) {
              return p.slowest
                ? <li key={p.mainOp.id}>🔴 <b>{p.mainOp.name}</b> darboğazı oluşturuyor. En yavaş alt op: <b>{p.slowest.name} ({p.slowest.cycleTime} sn)</b>. {adviceHints.bottleneckFix}</li>
                : <li key={p.mainOp.id}>🔴 <b>{p.mainOp.name}</b> sürecinde henüz 2.Seviye süreç tanımlı değil — kapasitesi 0 göründüğü için darboğaz sayılıyor. Operasyonlar sekmesinden 2.Seviye süreç ekleyin.</li>;
            }
            if (p.capacity > calc.lineCapacity * 1.5) {
              return <li key={p.mainOp.id}>🟢 <b>{p.mainOp.name}</b> kapasitesi fazla ({p.capacity.toFixed(0)}/v). Buradan 1 {lower(L.person)} darboğaz grubuna kaydırabilirsiniz.</li>;
            }
            return null;
          })}
          {opTypes.length > 0 && calc.perMain.some(p => p.subs.some(s => !s.machineId && opTypes.includes(s.type))) && (
            <li>⚙️ {adviceHints.assignResources}</li>
          )}
          {calc.perMain.some(p => p.subs.some(s => !s.operatorId)) && (
            <li>👤 Bazı alt seviye süreçlerde {lower(L.person)} atanmamış. Kaynaklar sekmesinden sürükleyin.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function BigKpi({ label, value, unit, tone, icon: Icon, term }) {
  const tones = {
    cyan:    { tint: 'bg-accent-tint', ink: 'text-accent-ink' },
    amber:   { tint: 'bg-warn-tint',   ink: 'text-warn' },
    slate:   { tint: 'bg-surface-2',   ink: 'text-ink-soft' },
    emerald: { tint: 'bg-ok-tint',     ink: 'text-ok' },
    red:     { tint: 'bg-danger-tint', ink: 'text-danger' },
  };
  const t = tones[tone] || tones.slate;
  return (
    <div className="bg-surface rounded-[10px] border border-line shadow-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ink-soft">{label}{term && <> <InfoTip term={term} /></>}</span>
        <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${t.tint}`}>
          <Icon className={`w-4 h-4 ${t.ink}`} />
        </span>
      </div>
      <div className="text-3xl font-mono font-semibold leading-tight text-ink tabular-nums">{value}</div>
      <div className="text-xs text-ink-soft mt-0.5">{unit}</div>
    </div>
  );
}

/* ============================================================
   Modallar: alt-op, ana-op, ayarlar
   ============================================================ */
function ModelSaveDialog({ defaultName, meta, statCount, hasResult, onClose, onSave }) {
  const L = useLabels();
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
        <div className="bg-surface-2 rounded-lg border border-line p-3 text-xs text-ink-soft mb-3">
          <div className="font-semibold text-ink mb-1">Meta bilgiler (otomatik dahil)</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {meta.modelAdi   && <div>Model: <b>{meta.modelAdi}</b></div>}
            {meta.modelNo    && <div>PLM: <b>{meta.modelNo}</b></div>}
            {meta.atolyeAdi  && <div>{L.facility}: <b>{meta.atolyeAdi}</b></div>}
            {meta.musteri    && <div>Müşteri: <b>{meta.musteri}</b></div>}
            {meta.tarih      && <div>Tarih: <b>{String(meta.tarih)}</b></div>}
            {meta.siparisAdedi != null && <div>Adet: <b>{meta.siparisAdedi}</b></div>}
          </div>
        </div>
      )}
      <div className="bg-accent-tint border border-accent/20 rounded-lg p-3 text-xs text-accent-ink mb-3">
        <b>Kaydedilenler:</b> {statCount.mainOps} ana op · {statCount.subOps} alt op · {statCount.machines} {lower(L.resource)} · {statCount.operators} {lower(L.person)} · meta bilgileri · bağlantılar ve pozisyonlar.
      </div>
      {hasResult && (
        <label className="flex items-start gap-2 text-xs text-ink-soft mb-3 cursor-pointer">
          <input type="checkbox" checked={includeResult} onChange={e => setIncludeResult(e.target.checked)} className="mt-0.5" />
          <span>
            <b>Simülasyon sonucunu da kaydet</b> — mevcut zirve kuyruklar, tamamlanan sayılar, çıkış kaydedilir; sonradan karşılaştırabilirsin.
          </span>
        </label>
      )}
      <div className="flex justify-end gap-2 mt-1 pt-3 border-t border-line">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2 rounded">İptal</button>
        <button onClick={() => canSave && onSave(name.trim(), includeResult)}
          disabled={!canSave}
          className="px-4 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent-strong flex items-center gap-1.5 disabled:opacity-40">
          <Save className="w-3.5 h-3.5" />Kaydet
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children, width = 'max-w-lg' }) {
  // Evrensel modal standardı (B2): ESC ile kapanış + panel içi kaydırma —
  // küçük pencerede içerik taşarsa Kaydet/İptal her zaman erişilebilir kalsın.
  // (IME koruması: kompozisyon sırasında ESC girişi iptal eder, modalı kapatmasın.)
  useEffect(() => {
    const onKey = (e) => { if (e.isComposing) return; if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-surface rounded-[14px] shadow-card w-full ${width} max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-line flex items-center justify-between sticky top-0 bg-surface">
          <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-surface-2 rounded text-ink-soft"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ============================================================
   Yardım paneli — sağdan açılan drawer.
   Nasıl-kullanılır kılavuzları (view-aware, sekme köprüsü) + terim sözlüğü.
   ============================================================ */
const HELP_SWITCHABLE_TABS = ['flow', 'vsm', 'surec', 'ops', 'dashboard', 'sim', 'resources', 'rapor'];

function HelpDrawer({ open, onClose, tab, onGoTab }) {
  const [q, setQ] = useState('');
  // ESC ile kapanış (IME koruması: kompozisyon sırasında ESC modalı kapatmasın).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.isComposing) return; if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Kapanınca terim aramasını sıfırla (yeniden açılışta önceki filtre kalmasın).
  useEffect(() => { if (!open) setQ(''); }, [open]);

  if (!open) return null;

  // Mevcut sekmenin kılavuzunu öne al ve vurgula (view-aware).
  const current = GUIDES.find((g) => g.tab === tab);
  const ordered = current ? [current, ...GUIDES.filter((g) => g !== current)] : GUIDES;

  const terms = Object.values(GLOSSARY);
  const query = q.trim().toLocaleLowerCase('tr');
  const filteredTerms = query
    ? terms.filter((t) =>
        t.term.toLocaleLowerCase('tr').includes(query) ||
        t.short.toLocaleLowerCase('tr').includes(query))
    : terms;

  // Hesaplamalar: aynı arama sorgusu; bulunulan sekmeninkiler öne alınır.
  const filteredCalcs = query
    ? CALCULATIONS.filter((c) =>
        c.term.toLocaleLowerCase('tr').includes(query) ||
        c.formula.toLocaleLowerCase('tr').includes(query) ||
        c.plain.toLocaleLowerCase('tr').includes(query) ||
        c.example.toLocaleLowerCase('tr').includes(query))
    : CALCULATIONS;
  const orderedCalcs = [
    ...filteredCalcs.filter((c) => c.tab === tab),
    ...filteredCalcs.filter((c) => c.tab !== tab),
  ];

  return (
    <div role="dialog" aria-modal="true" aria-label="Yardım"
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] flex justify-end" onClick={onClose}>
      <div className="h-full w-full max-w-md bg-surface shadow-card overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        {/* Sticky başlık */}
        <div className="p-4 border-b border-line flex items-center justify-between sticky top-0 bg-surface z-10">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-accent" />
            <h3 className="font-display text-lg font-semibold text-ink">Yardım &amp; Kılavuz</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-2 rounded text-ink-soft" title="Kapat" aria-label="Kapat">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Arama — hesaplama ve terimleri birlikte filtreler */}
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ara — hesaplama veya terim…"
            aria-label="Hesaplama veya terim ara"
            className="w-full px-3 py-1.5 text-sm bg-surface-2 border border-line rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent"
          />

          {/* Bölüm 1: Nasıl Kullanılır — arama aktifken gizle (arama yalnız hesaplama+terim filtreler) */}
          {!query && (
          <section>
            <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-soft mb-3">Nasıl Kullanılır</h4>
            <div className="space-y-3">
              {ordered.map((g) => {
                const isCurrent = g === current;
                const canGo = HELP_SWITCHABLE_TABS.includes(g.tab);
                return (
                  <div key={g.id}
                    className={`rounded-[12px] border p-3.5 ${isCurrent ? 'border-accent bg-accent-tint' : 'border-line bg-surface'}`}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h5 className={`font-display font-semibold text-sm ${isCurrent ? 'text-accent-ink' : 'text-ink'}`}>{g.title}</h5>
                      {isCurrent && (
                        <span className="text-[10px] font-mono uppercase tracking-wide text-accent-ink bg-surface/70 border border-accent/40 rounded px-1.5 py-0.5 flex-shrink-0">Şu an buradasın</span>
                      )}
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-[13px] text-ink-soft marker:text-ink-faint marker:font-mono">
                      {g.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                    {g.tip && (
                      <p className="mt-2 text-[12px] text-ink-soft/90 flex items-start gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                        <span>{g.tip}</span>
                      </p>
                    )}
                    {canGo && !isCurrent && (
                      <button onClick={() => onGoTab(g.tab)}
                        className="mt-2.5 text-[12px] font-medium text-accent-ink hover:text-accent-strong hover:underline">
                        Bu sekmeye git →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          )}

          {/* Bölüm: Nasıl Hesaplanır */}
          <section>
            <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-soft mb-3">Nasıl Hesaplanır</h4>
            <div className="space-y-3">
              {orderedCalcs.map((c) => {
                const isCurrent = c.tab === tab;
                return (
                  <div key={c.id}
                    className={`rounded-[12px] border p-3.5 ${isCurrent ? 'border-accent bg-accent-tint' : 'border-line bg-surface'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h5 className={`font-display font-semibold text-sm ${isCurrent ? 'text-accent-ink' : 'text-ink'}`}>{c.term}</h5>
                      {isCurrent && (
                        <span className="text-[10px] font-mono uppercase tracking-wide text-accent-ink bg-surface/70 border border-accent/40 rounded px-1.5 py-0.5 flex-shrink-0">Bu sekmede</span>
                      )}
                    </div>
                    <div className="font-mono text-[12px] text-ink bg-surface-2 border border-line rounded-md px-2.5 py-1.5 mb-2 overflow-x-auto whitespace-nowrap">
                      {c.formula}
                    </div>
                    <p className="text-[13px] text-ink-soft leading-snug">{c.plain}</p>
                    <p className="text-[12px] text-ink-soft/90 mt-1.5 flex items-start gap-1.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <span className="text-ink-faint font-mono flex-shrink-0">örn.</span>
                      <span>{c.example}</span>
                    </p>
                  </div>
                );
              })}
              {orderedCalcs.length === 0 && (
                <p className="text-[13px] text-ink-faint">Eşleşen hesaplama yok.</p>
              )}
            </div>
          </section>

          {/* Bölüm 2: Terimler Sözlüğü */}
          <section>
            <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-soft mb-3">Terimler Sözlüğü</h4>
            <dl className="space-y-2.5">
              {filteredTerms.map((t) => (
                <div key={t.term} className="border-b border-line/60 pb-2.5 last:border-0">
                  <dt className="font-semibold text-[13px] text-ink">{t.term}</dt>
                  <dd className="text-[12px] text-ink-soft mt-0.5 leading-snug">{t.short}</dd>
                </div>
              ))}
              {filteredTerms.length === 0 && (
                <p className="text-[13px] text-ink-faint">Eşleşen terim yok.</p>
              )}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block mb-3">
      <span className="text-[12px] font-semibold text-ink-soft uppercase tracking-wider">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-faint mt-0.5 block">{hint}</span>}
    </label>
  );
}

const inputCls = 'mt-1 w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25';

function SubOpModal({ subOp, data, onSave, onClose }) {
  const { opTypes } = useDomain();
  const L = useLabels();
  const [form, setForm] = useState(subOp);
  const up = (patch) => setForm(f => ({ ...f, ...patch }));
  return (
    <Modal title="2.Seviye Süreç Düzenle" onClose={onClose}>
      <Field label="Ad">
        <input className={inputCls} value={form.name} onChange={e => up({ name: e.target.value })} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="1.Seviye Süreç">
          <select className={inputCls} value={subParent(form)} onChange={e => up({ mainOpId: e.target.value, parentId: e.target.value })}>
            {data.mainOps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Operasyon Tipi">
          {opTypes.length > 0 ? (
            <select className={inputCls} value={form.type} onChange={e => up({ type: e.target.value })}>
              {opTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : (
            <input className={inputCls} value={form.type || ''} onChange={e => up({ type: e.target.value })}
              placeholder="Operasyon tipi (serbest)" />
          )}
        </Field>
      </div>
      <Field label="Çevrim Süresi (saniye)" hint="Saha ölçümü girin (sn).">
        <input type="number" step="0.01" className={inputCls} value={form.cycleTime} onChange={e => up({ cycleTime: parseFloat(e.target.value) || 0 })} />
      </Field>
      {form.cycleTime > 0 && (
        <div className="-mt-1 mb-3 rounded-lg border border-accent/25 bg-accent-tint overflow-hidden">
          <div className="px-3 py-1.5 bg-accent/10 border-b border-accent/20 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-accent-ink uppercase tracking-wider">Tek {L.person} Max Çıktısı</span>
            <span className="text-[10px] text-accent-ink/80 font-mono">formül: N = Süre / Çevrim</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-2 font-mono">
            <div className="bg-surface rounded px-2 py-1.5 border border-line">
              <div className="text-[9px] text-accent-ink uppercase tracking-wider">Dakikada</div>
              <div className="text-lg font-bold text-ink leading-tight">{(60 / form.cycleTime).toFixed(1)}</div>
              <div className="text-[10px] text-ink-faint">adet/dk</div>
            </div>
            <div className="bg-surface rounded px-2 py-1.5 border border-line">
              <div className="text-[9px] text-accent-ink uppercase tracking-wider">Saatte</div>
              <div className="text-lg font-bold text-ink leading-tight">{(3600 / form.cycleTime).toFixed(0)}</div>
              <div className="text-[10px] text-ink-faint">adet/saat</div>
            </div>
            <div className="bg-surface rounded px-2 py-1.5 border border-line">
              <div className="text-[9px] text-accent-ink uppercase tracking-wider">540 dk · η 85%</div>
              <div className="text-lg font-bold text-ink leading-tight">{((540 * 60 * 0.85) / form.cycleTime).toFixed(0)}</div>
              <div className="text-[10px] text-ink-faint">adet/vardiya</div>
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={L.resource}>
          <select className={inputCls} value={form.machineId ?? ''} onChange={e => up({ machineId: e.target.value || null })}>
            <option value="">— (yok)</option>
            {data.machines.map(m => <option key={m.id} value={m.id}>{m.name} · {m.type}</option>)}
          </select>
        </Field>
        <Field label={L.person}>
          <select className={inputCls} value={form.operatorId ?? ''} onChange={e => up({ operatorId: e.target.value || null })}>
            <option value="">— (yok)</option>
            {data.operators.map(o => <option key={o.id} value={o.id}>{o.name} · L{o.skill}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`${L.station} / Paralel ${L.person}`} hint={`Aynı işi kaç ${lower(L.person)} paralel yapıyor? Kapasiteyi çarpar.`}>
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

      <div className="mb-3 rounded-lg border border-line bg-surface-2 p-2.5">
        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
          <input type="checkbox" checked={!!form.redundant}
            onChange={e => up({ redundant: e.target.checked || null })}
            className="accent-accent w-4 h-4" />
          <span className="font-semibold">Paralel / Yedek istasyon (aynı iş)</span>
        </label>
        <p className="text-[11px] text-ink-faint mt-1 leading-snug">
          Bu op, aynı 1.Seviye süreçteki başka op'larla <b>aynı işi</b> paralel yapıyorsa işaretle
          (ör. usta + acami). İşaretli kardeşlerin <b>kapasiteleri toplanır</b> ve çevrim
          <b> harmonik</b> birleşir — senkron (min) değil. Farklı hızlar için kullanın; aynı hızdaki
          tek kişiler için yukarıdaki “{`${L.station} / Paralel ${L.person}`}” sayısı yeterli.
        </p>
      </div>

      <Field label="Sonraki Alt Seviye Süreçler (Simülasyon Akışı)" hint={`Bu süreç bitince hangi alt seviye süreçlere ${lower(L.item)} akacak? Birden fazla seçim = FORK. Başkalarının bu süreci seçmesi = MERGE (birleşme).`}>
        <div className="mt-1 max-h-48 overflow-y-auto border border-line rounded-lg p-2 space-y-0.5 bg-surface-2">
          {data.subOps.filter(s => s.id !== form.id).length === 0 && <div className="text-sm text-ink-faint px-2 py-1">Başka alt seviye süreç yok.</div>}
          {data.mainOps.map(mo => {
            const subs = data.subOps.filter(s => s.mainOpId === mo.id && s.id !== form.id).sort((a,b) => a.order - b.order);
            if (subs.length === 0) return null;
            return (
              <div key={mo.id} className="bg-surface rounded border border-line p-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 mb-1" style={{ color: mo.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: mo.color }} />{mo.name}
                </div>
                {subs.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-surface-2 px-1 py-0.5 rounded">
                    <input type="checkbox"
                      checked={(form.nextIds || []).includes(s.id)}
                      onChange={() => {
                        const curr = form.nextIds || [];
                        if (!curr.includes(s.id)) {
                          const effective = data.subOps.map(x => x.id === form.id ? { ...x, nextIds: curr } : x);
                          if (wouldCreateCycle(effective, form.id, s.id)) {
                            alertDialog({ message: 'Bu bağlantı bir döngü oluşturur — akış hep ileri gitmeli.', danger: true });
                            return;
                          }
                        }
                        up({ nextIds: curr.includes(s.id) ? curr.filter(x => x !== s.id) : [...curr, s.id] });
                      }} />
                    <span className="text-ink">{s.name}</span>
                    <span className="ml-auto text-[10px] text-ink-faint font-mono">{s.cycleTime} sn</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </Field>
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-line">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2 rounded">İptal</button>
        <button onClick={() => onSave(form)} className="px-4 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent-strong flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" />Kaydet
        </button>
      </div>
    </Modal>
  );
}

function MainOpModal({ mainOp, allMainOps, onSave, onClose }) {
  const L = useLabels();
  const [form, setForm] = useState(mainOp);
  const others = allMainOps.filter(m => m.id !== mainOp.id);
  const toggleNext = (id) => {
    if (!(form.nextIds || []).includes(id)) {
      // pending nextIds dahil etkin graf üzerinde kontrol — modal içi çoklu seçim de yakalanır
      const effective = allMainOps.map(m => m.id === form.id ? { ...m, nextIds: form.nextIds || [] } : m);
      if (wouldCreateCycle(effective, form.id, id)) {
        alertDialog({ message: 'Bu bağlantı bir döngü oluşturur — akış hep ileri gitmeli.', danger: true });
        return;
      }
    }
    setForm(f => {
      const curr = f.nextIds || [];   // guard'la simetrik — nextIds hiç yoksa da çökmesin
      return { ...f, nextIds: curr.includes(id) ? curr.filter(x => x !== id) : [...curr, id] };
    });
  };
  return (
    <Modal title="1.Seviye Süreç Düzenle" onClose={onClose}>
      <Field label="Ad">
        <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Renk">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {PALETTE.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                className={`w-7 h-7 rounded-md transition ${form.color === c ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface scale-105' : 'ring-1 ring-line'}`}
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
          {others.length === 0 && <div className="text-sm text-ink-faint">Başka 1.Seviye süreç yok.</div>}
          {others.map(o => (
            <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surface-2 p-1.5 rounded text-ink">
              <input type="checkbox" checked={form.nextIds.includes(o.id)} onChange={() => toggleNext(o.id)} />
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: o.color }}></span>
              {o.name}
            </label>
          ))}
        </div>
      </Field>
      <div className="mt-4 pt-3 border-t border-line">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft mb-2">
          VSM Alanları <span className="normal-case font-normal text-ink-faint">(opsiyonel — haritada görünür; kapasite hesabına dahil değildir)</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="C/O — Model Değişimi (sn)">
            <input type="number" min="0" className={inputCls} value={form.changeoverSec ?? ''}
              onChange={e => setForm(f => ({ ...f, changeoverSec: e.target.value === '' ? null : Number(e.target.value) }))} />
          </Field>
          <Field label="Uptime (%)">
            <input type="number" min="0" max="100" className={inputCls} value={form.uptimePct ?? ''}
              onChange={e => setForm(f => ({ ...f, uptimePct: e.target.value === '' ? null : Number(e.target.value) }))} />
          </Field>
          <Field label="FPY — İlk Geçiş Kalitesi (%)">
            <input type="number" min="0" max="100" className={inputCls} value={form.fpyPct ?? ''}
              onChange={e => setForm(f => ({ ...f, fpyPct: e.target.value === '' ? null : Number(e.target.value) }))} />
          </Field>
          <Field label="Vardiya Sayısı">
            <input type="number" min="1" className={inputCls} value={form.shifts ?? ''}
              onChange={e => setForm(f => ({ ...f, shifts: e.target.value === '' ? null : Number(e.target.value) }))} />
          </Field>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-line">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={!!form.isShared}
            onChange={e => setForm(f => ({ ...f, isShared: e.target.checked || null }))}
            className="accent-accent w-4 h-4" />
          <span className="font-semibold">Ortak istasyon</span>
          <span className="text-[11px] text-ink-faint">— birden fazla {lower(L.mainGroup)} bu istasyonu kullanır</span>
        </label>
        {form.isShared && (
          <div className="mt-2 max-w-40">
            <Field label={`${L.resource} Sayısı`}>
              <input type="number" min="1" className={inputCls} value={form.machineCount ?? 1}
                onChange={e => setForm(f => ({ ...f, machineCount: Math.max(1, Number(e.target.value) || 1) }))} />
            </Field>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-line">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2 rounded">İptal</button>
        <button onClick={() => onSave({
          ...form,
          // Negatif VSM değerlerini kaydetme (veri kutusunu/lead time'ı bozar)
          changeoverSec: form.changeoverSec != null ? Math.max(0, form.changeoverSec) : null,
          uptimePct: form.uptimePct != null ? Math.max(0, form.uptimePct) : null,
          fpyPct: form.fpyPct != null ? Math.max(0, form.fpyPct) : null,
          shifts: form.shifts != null ? Math.max(0, form.shifts) : null,
        })} className="px-4 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent-strong flex items-center gap-1.5">
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
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-line">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2 rounded">İptal</button>
        <button onClick={() => onSave(form)} className="px-4 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent-strong flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" />Kaydet
        </button>
      </div>
    </Modal>
  );
}

/* ============================================================
   Sekme 5: SİMÜLASYON — Discrete-event, canlı WIP birikimi ve gün sonu tahmini
   ============================================================ */
function SimView({ data, calc, simState, simStale, onStart, onPause, onReset, onRestart, onSpeed, onFastForward, onAutoSetup,
                   onSaveScenario, onLoadScenario, onDeleteScenario, onDuplicateScenario, onRenameScenario }) {
  const L = useLabels();
  const itemLower = lower(L.item);            // 100ms tick döngüsünde tekrar tekrar hesaplamamak için hoist
  const itemPluralLower = lower(L.itemPlural);
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

  // Vardiya sonu Hat Verimliliği (§5.2.1) — DashboardView'daki dengeleme hesabıyla aynı ΣSMV formülü
  const leafSubsForSmv = data.subOps.filter(s => childNodes(data, s.id).length === 0 && (s.cycleTime || 0) > 0);
  const totalCtForSmv = leafSubsForSmv.reduce((a, s) => a + (s.cycleTime || 0), 0);
  const totalSmvMin = (totalCtForSmv / 60) * (1 + (data.settings.pfd ?? 0));
  const opCount = (data.operators?.length || 0) || leafSubsForSmv.length || 1;
  const simFinished = !simState.running && simState.elapsed > 0 && simState.exited > 0;
  const effPct = simFinished ? lineEfficiencyPct({
    totalSmvMin,
    producedQty: simState.exited,
    workMinutes: simState.elapsed / 60,
    operatorCount: opCount,
  }) : 0;
  const effBand = simFinished ? lineEfficiencyBand(effPct) : null;
  const effTone = effBand === 'mükemmel' || effBand === 'iyi' ? 'emerald' : effBand === 'ortalama' ? 'amber' : 'red';

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
      <div className="bg-surface rounded-[10px] border border-line shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center gap-2 flex-wrap">
          <FolderOpen className="w-4 h-4 text-accent" />
          <span className="text-sm font-display font-semibold text-ink">Kayıtlı Modeller ({scenarios.length})</span>
          {data.meta?.modelAdi && (
            <span className="text-[11px] text-ink-soft">
              · Mevcut: <span className="font-medium text-ink">{data.meta.modelAdi}</span>
            </span>
          )}
          <div className="flex-1" />
          <button onClick={() => {
              setSaveModelName(data.meta?.modelAdi || '');
              setShowSaveModelDialog(true);
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-strong font-medium transition">
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
                    isLoaded ? 'bg-accent-tint border-accent/30' : 'bg-surface border-line'
                  }`}>
                  <button onClick={() => onLoadScenario(sc.id)}
                    className="hover:text-accent-strong py-1 pr-1 font-medium flex items-center gap-1 truncate max-w-[220px] text-ink"
                    title={`${sc.name} · ${sc.snapshot.mainOps.length} ana op · ${sc.snapshot.subOps.length} alt op`}>
                    <Layers className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{sc.name}</span>
                  </button>
                  <span className="text-ink-faint font-mono text-[10px]">
                    {sc.snapshot.subOps.length}op
                  </span>
                  {sc.result && (
                    <span className="text-ok font-mono text-[10px]" title={`Simülasyon çıktısı: ${sc.result.exited} adet`}>
                      ✓{sc.result.exited}
                    </span>
                  )}
                  <button onClick={() => onDuplicateScenario(sc.id)} title="Kopyala"
                    className="p-1 text-ink-faint hover:text-ink rounded">
                    <Copy className="w-3 h-3" />
                  </button>
                  <button onClick={async () => {
                      const newName = await promptDialog({ message: 'Yeni ad:', defaultValue: sc.name });
                      if (newName && newName.trim()) onRenameScenario(sc.id, newName.trim());
                    }} title="Yeniden adlandır"
                    className="p-1 text-ink-faint hover:text-ink rounded">
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button onClick={async () => { if (await confirmDialog({ message: `"${sc.name}" silinsin mi?`, danger: true })) onDeleteScenario(sc.id); }} title="Sil"
                    className="p-1 text-ink-faint hover:text-danger rounded">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {scenarios.length === 0 && (
          <div className="px-4 py-2 text-[11px] text-ink-faint italic">
            Henüz kayıtlı model yok. Bir model üzerinde çalış, Excel yükle veya operasyonları ekle, sonra <b className="text-ink-soft">Bu Modeli Kaydet</b>'e bas.
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
      <div className="bg-surface rounded-[10px] border border-line shadow-card overflow-hidden">
        {simStale && (
          <div className="px-4 py-2 bg-warn-tint border-b border-warn/30 text-xs font-semibold text-warn flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            ⚠ Sonuçlar güncel değil — model değişti. Yeniden başlatın.
          </div>
        )}
        <div className="p-4 flex items-center gap-3 flex-wrap">
          {simStale ? (
            <>
              <button onClick={onRestart}
                className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-strong font-semibold shadow-card transition">
                <RotateCcw className="w-5 h-5" />Yeniden Başlat
              </button>
              {/* Bayat + koşan sim yine durdurulabilmeli (Yeniden Başlat state'i sıfırlar, duraklatmaz) */}
              {simState.running && (
                <button onClick={onPause}
                  className="flex items-center gap-2 px-3 py-2.5 bg-surface border border-line rounded-lg hover:bg-surface-2 text-ink transition">
                  <Pause className="w-4 h-4" fill="currentColor" />Duraklat
                </button>
              )}
            </>
          ) : !simState.running ? (
            <button onClick={onStart}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-strong font-semibold shadow-card transition">
              <Play className="w-5 h-5" fill="currentColor" />{simState.elapsed > 0 ? 'Devam Et' : 'Başla'}
            </button>
          ) : (
            <button onClick={onPause}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-strong font-semibold shadow-card transition">
              <Pause className="w-5 h-5" fill="currentColor" />Duraklat
            </button>
          )}
          <button onClick={onReset}
            className="flex items-center gap-2 px-3 py-2.5 bg-surface border border-line rounded-lg hover:bg-surface-2 text-ink transition">
            <RotateCcw className="w-4 h-4" />Sıfırla
          </button>
          <div className="h-8 w-px bg-line" />
          <div className="flex items-center gap-1.5 bg-surface-2 rounded-lg p-0.5">
            <span className="text-xs text-ink-soft mr-1 pl-1.5">Hız:</span>
            {[1, 10, 60, 300, 1000].map(sp => (
              <button key={sp} onClick={() => onSpeed(sp)}
                className={`text-sm px-2.5 py-1.5 rounded-md font-mono border transition
                  ${simState.speed === sp ? 'bg-accent-tint text-accent-ink border-accent' : 'bg-surface text-ink-soft border-line hover:bg-surface-2'}`}>
                {sp}x
              </button>
            ))}
          </div>
          {/* Bayatken GİZLİ: bayat state'i yeni modelle koşturup taze imza basmak
              hibrit (yarı eski yarı yeni) sonucu "güncel" gösterirdi — tek çıkış Yeniden Başlat */}
          {!simStale && (
            <button onClick={onFastForward}
              className="flex items-center gap-1.5 text-sm px-3 py-2 bg-surface border border-line rounded-lg hover:bg-surface-2 text-ink transition font-medium"
              title="Vardiyanın sonuna koş (anında bitir)">
              <Zap className="w-3.5 h-3.5 text-accent" /> Bitir
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onAutoSetup}
            className="flex items-center gap-1.5 text-sm px-3 py-2 bg-surface border border-line rounded-lg hover:bg-surface-2 text-ink">
            <Sparkles className="w-3.5 h-3.5 text-accent" />Otomatik Öncelik Kur
          </button>
        </div>

        {/* İlerleme barı */}
        <div className="h-1.5 bg-surface-2">
          <div className="h-full bg-accent transition-all"
            style={{ width: `${pctElapsed}%` }} />
        </div>
      </div>

      {/* Anlık KPI'lar — model bayatsa (simStale) soluklaşır: yanlış sonuç güven vermesin */}
      <div className={`grid grid-cols-2 md:grid-cols-5 gap-3 transition-opacity ${simStale ? 'opacity-50' : ''}`}>
        <SimKpi label="Vardiya Saati" value={simClock} unit={`${Math.floor(simState.elapsed/60)} / ${data.settings.netMinutes} dk`} icon={Clock} tone="slate" />
        <SimKpi label="Üretilen" value={simState.exited} unit={`fiziksel üst sınır ${expectedOutput.toLocaleString('tr-TR')}`} icon={CheckCircle2} tone="emerald" />
        <SimKpi label="Anlık Hız" value={currentRate.toFixed(2)} unit={`max ${(60/bottleneckCycleSn).toFixed(2)} ad/dk`} icon={Zap} tone="cyan" />
        <SimKpi label="Toplam WIP" term="wip" value={totalWIP} unit={`${itemLower} hat içinde`} icon={Package} tone="amber" />
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

      {/* En yavaş istasyon bilgi şeridi (ham max çevrim — kanonik darboğaz tanımı DEĞİL) */}
      {bottleneckOp && (
        <div className="bg-warn-tint border border-warn/30 rounded-lg px-4 py-2 text-xs flex items-center gap-3 flex-wrap">
          <AlertTriangle className="w-4 h-4 text-warn flex-shrink-0" />
          <span className="text-ink">
            <b>En yavaş istasyon:</b> <span className="font-medium text-warn">{bottleneckOp.name}</span>
            {bottleneckMainOp && <span className="text-ink-soft"> ({bottleneckMainOp.name})</span>}
            <span className="text-ink-soft ml-1">· {bottleneckCycleSn.toFixed(2)} sn çevrim</span>
          </span>
          <span className="text-ink-soft">→</span>
          <span className="font-mono tabular-nums">max {(60/bottleneckCycleSn).toFixed(2)} ad/dk × {data.settings.netMinutes} dk = <b className="text-ink">{bottleneckDailyMax.toLocaleString('tr-TR')}</b> adet/vardiya</span>
          {smvBasedOutput !== bottleneckDailyMax && (
            <span className="text-ink-faint text-[10px] ml-auto">
              SMV formülü: {smvBasedOutput.toLocaleString('tr-TR')} (dengeli akış varsayar, daha optimist)
            </span>
          )}
        </div>
      )}

      {/* Vardiya sonu — Hat Verimliliği (model bayatsa gösterilmez — yanlış %977 türü sonuç asla görünmesin) */}
      {simFinished && !simStale && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="col-span-2" title="Hat Verimliliği = (ΣSMV × üretim) / (süre × operatör) × 100">
            <SimKpi
              label="Hat Verimliliği (Vardiya Sonu)"
              term="hatVerimliligi"
              value={`%${effPct.toFixed(1)}`}
              unit={`bant: ${effBand}`}
              icon={Scale}
              tone={effTone}
            />
          </div>
        </div>
      )}

      {/* Canlı istasyon tablosu: ana op kolonu × alt op satırları */}
      <div className="bg-surface rounded-[10px] border border-line shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display font-semibold text-ink flex items-center gap-2"><Activity className="w-5 h-5 text-accent" />Canlı Hat Durumu</h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft mt-1">
              <span className="inline-flex items-center gap-1">
                <span className="font-mono bg-warn-tint text-warn px-1 rounded-sm">▲ zirve</span>
                <span className="text-ink-soft">bugünkü en yüksek kuyruk</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="font-mono bg-warn-tint text-warn px-1 rounded-sm">kuyruk</span>
                <span className="text-ink-soft">şu an bekleyen WIP</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="font-mono bg-accent-tint text-accent-ink px-1 rounded-sm">kaldı</span>
                <span className="text-ink-soft">işlenmekte olana</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="font-mono bg-ok-tint text-ok px-1 rounded-sm">✓ çıkan</span>
                <span className="text-ink-soft">istasyondan geçen toplam</span>
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
                    <span className="font-display font-semibold text-sm text-ink">{mo.name}</span>
                    <span className="ml-auto text-[10px] font-mono tabular-nums text-ink-soft flex items-baseline gap-1.5">
                      <span title={`Bu 1.Seviye süreçte şu an hat içinde olan ${itemLower} sayısı`}>
                        <span className="text-[8px] text-ink-faint font-normal mr-0.5">hat içi</span>
                        <span className="font-bold">{moTotalWIP}</span>
                      </span>
                      <span className="text-ink-faint">·</span>
                      <span title={`Bu 1.Seviye süreçten tamamlanmış olarak geçen toplam ${itemLower} (tüm alt istasyonların toplamı)`}>
                        <span className="text-[8px] text-ink-faint font-normal mr-0.5">çıkan</span>
                        <span className="font-bold text-ok">✓{moTotalCompleted}</span>
                      </span>
                    </span>
                  </div>
                  {/* Alt op kartları */}
                  <div className="border border-line border-t-0 rounded-b p-1.5 space-y-1.5 bg-surface">
                    {subs.map(s => {
                      const queue = queueOf(s.id);
                      const ip = simState.inProgress[s.id];
                      const completed = simState.completed[s.id] || 0;
                      const peak = simState.peakQueue[s.id] || 0;
                      const pct = ip ? (1 - ip.remainingSec / ip.totalSec) * 100 : 0;
                      const isWorst = worstStationId === s.id && peak > 3;
                      // Kuyruk renk durumu
                      const qColor = queue === 0 ? 'bg-surface-2' : queue < 3 ? 'bg-ok' : queue < 8 ? 'bg-warn' : 'bg-danger';
                      return (
                        <div key={s.id}
                          className={`relative border rounded p-2 transition ${isWorst ? 'border-danger/50 bg-danger-tint/40 shadow-card' : 'border-line bg-surface'}`}>
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium truncate text-ink" title={s.name}>{s.name}</div>
                              <div className="text-[10px] text-ink-soft font-mono tabular-nums">
                                <span className="text-ink-faint">çevrim</span> {s.cycleTime} sn
                              </div>
                            </div>
                            {peak > 0 && (
                              <span
                                title={`Zirve birikim: bu istasyonda şimdiye kadar aynı anda en fazla ${peak} ${itemLower} birikti`}
                                className={`text-[9px] font-mono px-1 rounded-sm flex items-center gap-0.5 flex-shrink-0 ${isWorst ? 'bg-danger-tint text-danger' : 'bg-surface-2 text-ink-soft'}`}>
                                <span className="text-[8px] opacity-70">zirve</span>
                                <span className="font-bold">▲{peak}</span>
                              </span>
                            )}
                          </div>

                          {/* Kuyruk görsel (max 8 kutu) */}
                          <div className="flex items-center gap-1 mt-1.5 h-4" title={`Kuyrukta bekleyen ${itemPluralLower} (her kutu 1 ${itemLower})`}>
                            {[...Array(Math.min(queue, 8))].map((_, i) => (
                              <div key={i} className={`${qColor} w-2 h-4 rounded-sm transition-all`} />
                            ))}
                            {queue > 8 && (
                              <span className="text-[10px] text-ink-soft font-mono font-bold ml-0.5">+{queue - 8}</span>
                            )}
                            {queue === 0 && !ip && (
                              <span className="text-[9px] text-ink-faint italic">boş</span>
                            )}
                            {queue === 0 && ip && (
                              <span className="text-[9px] text-accent italic">işleniyor</span>
                            )}
                            <span className="ml-auto text-[10px] font-mono tabular-nums text-warn font-bold flex items-baseline gap-0.5"
                              title="Şu anki toplam kuyruk (bekleyen + işlenen)">
                              <span className="text-[8px] font-normal text-ink-soft">kuyruk</span>
                              {queue}
                            </span>
                          </div>

                          {/* İlerleme barı */}
                          <div className="h-1.5 bg-surface-2 rounded-full mt-1 overflow-hidden"
                            title={ip ? `İşlemin %${pct.toFixed(0)}'ı tamamlandı` : 'Şu an işlem yok'}>
                            {ip && (
                              <div className="h-full bg-accent transition-all"
                                style={{ width: `${pct}%` }} />
                            )}
                          </div>

                          <div className="flex justify-between mt-1 text-[10px] font-mono tabular-nums">
                            <span className="text-ink-faint" title="İşlemin bitmesine kalan saniye">
                              {ip ? (
                                <><span className="text-[8px] font-normal opacity-70">kaldı</span> {ip.remainingSec.toFixed(1)}sn</>
                              ) : '—'}
                            </span>
                            <span className="text-ok font-bold flex items-baseline gap-0.5"
                              title={`Bu istasyondan tamamlanmış olarak geçen ${itemLower} sayısı`}>
                              <span className="text-[8px] font-normal text-ink-soft">çıkan</span>
                              ✓{completed}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {subs.length === 0 && (
                      <div className="text-xs text-ink-faint italic text-center py-4">alt op yok</div>
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
        <div className="bg-surface rounded-[10px] border border-line shadow-card p-4">
          <h3 className="font-display font-semibold text-ink flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-accent" />
            Kümülatif Çıktı — Vardiya Boyunca
          </h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              {/* Kümülatif zaman-serisi → dolgulu alan (çok sayıda bitişik çubuk birbirine
                  karışıyordu; alan grafiği eğriyi düzgün "dolarak" gösterir — dataviz doğrusu). */}
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <defs>
                  <linearGradient id="pm-cumfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2F9E68" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#2F9E68" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E0D6" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#52646C', fontSize: 10 }} axisLine={{ stroke: '#D5CCBD' }} tickLine={{ stroke: '#D5CCBD' }}
                  interval="preserveStartEnd" minTickGap={40} />
                <YAxis tick={{ fill: '#52646C', fontSize: 11 }} axisLine={{ stroke: '#D5CCBD' }} tickLine={{ stroke: '#D5CCBD' }}
                  label={{ value: 'adet', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#52646C' }} />
                <Tooltip
                  contentStyle={{ background: '#FFFFFF', border: '1px solid #E7E0D6', borderRadius: 10, boxShadow: '0 1px 2px rgba(26,43,50,0.06), 0 8px 24px rgba(26,43,50,0.08)', fontSize: 12 }}
                  labelStyle={{ color: '#1A2B32', fontFamily: 'var(--font-sans)', fontWeight: 600, marginBottom: 2 }}
                  itemStyle={{ fontFamily: 'var(--font-mono)', color: '#1A2B32' }}
                  formatter={(v) => [v + ' adet', 'Toplam Çıktı']} />
                <ReferenceLine y={expectedOutput} stroke="#B3402A" strokeDasharray="5 5"
                  label={{ value: `Hedef ${expectedOutput.toFixed(0)}`, fontSize: 10, fill: '#B3402A', position: 'right' }} />
                <Area type="monotone" dataKey="exited" stroke="#0F6B5C" strokeWidth={2}
                  fill="url(#pm-cumfill)" dot={false} activeDot={{ r: 4, fill: '#0F6B5C' }} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* WIP birikim özeti */}
      {Object.keys(simState.peakQueue || {}).length > 0 && (
        <div className="bg-danger-tint border border-danger/30 rounded-[10px] p-4">
          <h3 className="font-display font-semibold text-ink flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-danger" />
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
                  <div key={opId} className="bg-surface rounded-lg border border-line px-3 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: mo?.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate text-ink">{op.name}</div>
                      <div className="text-[11px] text-ink-soft">{mo?.name} · {op.cycleTime} sn çevrim</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold font-mono tabular-nums text-danger">{peak}</div>
                      <div className="text-[9px] text-ink-soft uppercase tracking-[0.08em]">zirve WIP</div>
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="mt-3 text-xs text-ink-soft">
            💡 <b className="text-ink">Yorum:</b> Yüksek birikim = kuyruk yoğunluğu — önceki adım bu istasyondan daha hızlı üretiyor, bu istasyon yetişemiyor. Çözüm: daha hızlı {lower(L.resource)} / ek {lower(L.person)} / iş bölme.
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
  const L = useLabels();
  const maxSec = (data.settings?.netMinutes || 540) * 60;
  const elapsed = Math.max(1, simState.elapsed);
  const taktTarget = calc.taktTimeSec;  // hedef takt
  const siparis = Number(data.meta?.siparisAdedi) || 10000;

  // Her alt seviye süreç için metrikler
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
          title: `Kritik kuyruk yoğunluğu — ${a.name}`,
          body: `Çevrim ${a.cycleTime.toFixed(2)} sn, hedef takt ${taktTarget.toFixed(2)} sn. Bu istasyon tek başına **hedef hıza yetişemez**.`,
          action: `Öneri: ${paralelSayisi} paralel istasyon (aynı op için ${paralelSayisi - 1} ek ${lower(L.resource)}/${lower(L.person)}) VEYA operasyonu ${paralelSayisi} alt adıma böl.`,
          impact: `Açılırsa bu istasyonun etkin çevrim süresi ~${(a.cycleTime / paralelSayisi).toFixed(2)} sn'ye düşer.`,
        });
      } else {
        recs.push({
          sev: 'high',
          tone: 'amber',
          station: a.name,
          main: a.mainName,
          title: `Yoğun kuyruk yoğunluğu — ${a.name}`,
          body: `Kullanım %${a.utilPct.toFixed(0)}, zirve kuyruk ${a.peak}. Çevrim (${a.cycleTime.toFixed(2)} sn) takt (${taktTarget.toFixed(2)} sn) altında ama yine de birikim var — önceki istasyonlar daha hızlı besliyor.`,
          action: `Öneri: one-piece flow kurulumu (küçük parti), önceki istasyonun hızını bu istasyona uyarla veya buraya +1 ${lower(L.person)} ekle.`,
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
        body: `Bu istasyonlar zamanlarının yarısından azını çalışarak geçiriyor. ${L.person} boşta.`,
        action: `Öneri: Yüksek yüklü istasyonla birleştir (multi-skill ${lower(L.person)}), ya da paralel bir sipariş için kullan.`,
        impact: `Gereksiz ${lower(L.person)} maliyeti düşer.`,
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
          body: `Bu 1.Seviye süreç içinde en yavaş ve en hızlı istasyon arasında %${g.imbalance.toFixed(0)} fark var. Ortalama yük %${g.avgUtil.toFixed(0)}.`,
          action: `Öneri: İstasyonlar arası iş bölümünü yeniden dengele (line balancing). Yavaş istasyondaki işin bir kısmını hızlıya aktar.`,
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
        action: kayipGun > 0.5 ? `Yukarıdaki kuyruk yoğunluklarını açarsan hedef ${hedefGun.toFixed(1)} güne yaklaşırsın.` : 'Mevcut akış yeterli.',
        impact: '',
      });
    }

    return recs;
  }, [bottlenecks, idleStations, mainGroupAnalysis, siparis, tahminiGun, hedefGun, kayipGun, hedefGunlukCikti, taktTarget]);

  return (
    <div className="bg-surface rounded-[10px] border border-line shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-line">
        <h3 className="font-display font-semibold text-ink flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          Hat Analizi ve Tavsiyeler
        </h3>
        <p className="text-[11px] text-ink-soft mt-0.5">
          Vardiyanın %{Math.round((simState.elapsed / maxSec) * 100)}'i ilerledi. Tavsiyeler canlı güncellenir; simülasyon sonunda en doğru tablo çıkar.
        </p>
      </div>

      {/* Üst özet şeridi */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-line">
        <SummaryBox
          label="Sipariş"
          value={siparis.toLocaleString('tr-TR')}
          sub={`tahmini ${Number.isFinite(tahminiGun) ? tahminiGun.toFixed(1) : '—'} gün`}
          tone="slate"
        />
        <SummaryBox
          label="Kuyruk Yoğunluğu"
          value={bottlenecks.length}
          sub={bottlenecks[0] ? `en kötü: ${bottlenecks[0].name}` : 'yok'}
          tone={bottlenecks.length > 0 ? 'red' : 'emerald'}
        />
        <SummaryBox
          label="Boşta İstasyon"
          value={idleStations.length}
          sub={idleStations.length > 0 ? `${lower(L.person)} yetersiz kullanım` : 'iyi'}
          tone={idleStations.length > 3 ? 'amber' : 'slate'}
        />
        <SummaryBox
          label="Teorik Hedef Fark"
          value={!Number.isFinite(kayipGun) ? '—' : kayipGun > 0 ? `+${kayipGun.toFixed(1)} gün` : '≈ 0'}
          sub={!Number.isFinite(kayipGun) ? 'henüz üretim yok' : kayipGun > 0 ? 'iyileştirme potansiyeli' : 'kapasite sınırında'}
          tone={!Number.isFinite(kayipGun) ? 'slate' : kayipGun > 2 ? 'red' : kayipGun > 0.5 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Ana grup yük dengesi */}
      <div className="px-4 py-3 border-b border-line">
        <div className="text-[11px] uppercase tracking-[0.08em] text-ink-soft font-semibold mb-2">1.Seviye Süreç Yük Dengesi</div>
        <div className="space-y-1.5">
          {mainGroupAnalysis.map(g => {
            const barColor = g.imbalance > 40 ? 'bg-danger' : g.imbalance > 20 ? 'bg-warn' : 'bg-ok';
            return (
              <div key={g.id} className="flex items-center gap-3 text-xs">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                <span className="w-24 font-medium truncate text-ink">{g.name}</span>
                <div className="flex-1 h-4 bg-surface-2 rounded-full overflow-hidden relative">
                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(100, g.avgUtil)}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono tabular-nums font-semibold text-ink mix-blend-difference text-white">
                    %{g.avgUtil.toFixed(0)}
                  </span>
                </div>
                <span className="w-28 text-right text-ink-soft text-[11px] font-mono tabular-nums">
                  {g.subCount} op · fark %{g.imbalance.toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tavsiye kartları */}
      <div className="px-4 py-3 space-y-2">
        <div className="text-[11px] uppercase tracking-[0.08em] text-ink-soft font-semibold mb-1">Aksiyon Önerileri ({recommendations.length})</div>
        {recommendations.length === 0 && (
          <div className="text-xs text-ink-faint italic py-4 text-center">Henüz yeterli veri yok — simülasyonu biraz daha ilerlet.</div>
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
    slate:   'bg-surface text-ink',
    red:     'bg-danger-tint text-danger',
    amber:   'bg-warn-tint text-warn',
    emerald: 'bg-ok-tint text-ok',
  };
  return (
    <div className={`px-4 py-3 border-r border-line last:border-r-0 ${tones[tone] || tones.slate}`}>
      <div className="text-[10px] uppercase tracking-[0.08em] opacity-70 font-semibold">{label}</div>
      <div className="text-lg font-bold font-mono tabular-nums mt-0.5">{value}</div>
      <div className="text-[11px] opacity-80 mt-0.5 truncate">{sub}</div>
    </div>
  );
}

function RecCard({ rec }) {
  const tones = {
    red:     { bg: 'bg-danger-tint', border: 'border-danger/30', icon: 'text-danger', tag: 'bg-danger text-white' },
    amber:   { bg: 'bg-warn-tint',   border: 'border-warn/30',   icon: 'text-warn',   tag: 'bg-warn text-white' },
    slate:   { bg: 'bg-surface-2',   border: 'border-line',      icon: 'text-ink-soft', tag: 'bg-line-strong text-ink' },
    emerald: { bg: 'bg-ok-tint',     border: 'border-ok/30',     icon: 'text-ok',     tag: 'bg-ok text-white' },
  };
  const t = tones[rec.tone] || tones.slate;
  const sevLabel = rec.sev === 'critical' ? 'KRİTİK' : rec.sev === 'high' ? 'ÖNEMLİ' : rec.sev === 'medium' ? 'ORTA' : 'BİLGİ';
  return (
    <div className={`border rounded-[10px] p-3 ${t.bg} ${t.border}`}>
      <div className="flex items-start gap-2">
        <span className={`text-[9px] uppercase tracking-[0.08em] font-bold px-1.5 py-0.5 rounded-sm ${t.tag} flex-shrink-0 mt-0.5`}>
          {sevLabel}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-display font-semibold text-ink">{rec.title}</div>
          <div className="text-xs text-ink-soft mt-1" dangerouslySetInnerHTML={{
            __html: rec.body.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
          }} />
          {rec.action && (
            <div className="text-xs text-ink mt-1.5 pl-2 border-l-2 border-line-strong">
              <span className="font-semibold text-accent">→ </span>{rec.action}
            </div>
          )}
          {rec.impact && (
            <div className="text-[11px] text-ink-soft italic mt-1">{rec.impact}</div>
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
  const L = useLabels();
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
      // Max-çevrim×0.95 tabanlı — KANONİK darboğaz (calc.bottleneckId) değil, bu yüzden "En yavaş"
      if (s.cycleTime >= bottleneckCycleSn * 0.95) { state = 'bottleneck'; stateLabel = 'En yavaş'; stateColor = 'red'; }
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
      ['1.Seviye Süreç', 'İstasyon', 'Tip', 'Çevrim (sn)', L.resource, L.person,
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
      <div className="bg-surface-2 border border-line rounded-[10px] p-10 text-center">
        <FileSpreadsheet className="w-12 h-12 text-ink-faint mx-auto mb-3" />
        <h3 className="font-display font-semibold text-ink">Henüz rapor yok</h3>
        <p className="text-sm text-ink-soft mt-1">
          Simülasyon sekmesinden başlat (veya <b>⚡ Bitir</b>'e bas). Sonrasında istasyon bazlı performans raporu burada görünür.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Başlık ve meta */}
      <div className="bg-surface rounded-[10px] border border-line shadow-card p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-display font-semibold text-ink">
              {data.meta?.modelAdi || 'Simülasyon Raporu'}
            </h2>
            <div className="text-xs text-ink-soft font-mono tabular-nums mt-1 flex flex-wrap gap-x-3">
              {data.meta?.modelNo && <span>PLM: {data.meta.modelNo}</span>}
              {data.meta?.atolyeAdi && <span>{L.facility}: {data.meta.atolyeAdi}</span>}
              {data.meta?.musteri && <span>Müşteri: {data.meta.musteri}</span>}
              <span>Vardiya: {data.settings.netMinutes} dk</span>
              <span>İlerleme: %{pctElapsed.toFixed(0)} {finished ? '(tamamlandı)' : ''}</span>
            </div>
          </div>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-line hover:bg-surface-2 rounded-lg text-sm text-ink transition">
            <Download className="w-4 h-4" /> CSV İndir
          </button>
        </div>
      </div>

      {/* Genel Özet */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <ReportCard label="Toplam Çıkan" value={totalExited.toLocaleString('tr-TR')} sub={`${((totalExited/bottleneckDailyMax)*100).toFixed(0)}% fiziksel üst sınırın`} tone="emerald" />
        <ReportCard label="Fiziksel Üst Sınır" value={bottleneckDailyMax.toLocaleString('tr-TR')} sub={`${bottleneckCycleSn.toFixed(2)} sn max çevrim`} tone="slate" />
        <ReportCard label="Kayıp" value={`%${kayipPct.toFixed(0)}`} sub={kayipPct > 10 ? 'iyileştirme gerekli' : 'iyi'} tone={kayipPct > 30 ? 'red' : kayipPct > 10 ? 'amber' : 'emerald'} />
        <ReportCard label="En Yavaş İstasyon" value={bottleneckStations.length} sub={bottleneckStations[0]?.name || 'yok'} tone={bottleneckStations.length > 0 ? 'red' : 'emerald'} />
        <ReportCard label="Boşta İstasyon" value={idleStations.length} sub={idleStations.length > 3 ? 'çok atıl' : 'normal'} tone={idleStations.length > 3 ? 'amber' : 'slate'} />
      </div>

      {/* 1.Seviye Süreç Özeti */}
      <div className="bg-surface border border-line rounded-[10px] shadow-card">
        <div className="px-4 py-3 border-b border-line">
          <h3 className="font-display font-semibold text-sm text-ink flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent" /> 1.Seviye Süreç Performansı
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-2">
              <tr className="text-left text-ink-soft uppercase tracking-[0.08em] text-[10px]">
                <th className="px-4 py-2">1.Seviye Süreç</th>
                <th className="px-4 py-2 text-right">Op Sayısı</th>
                <th className="px-4 py-2 text-right">Tamamlanan</th>
                <th className="px-4 py-2 text-right">Ort. Kullanım</th>
                <th className="px-4 py-2">Denge (Min→Max)</th>
                <th className="px-4 py-2 text-right">En Yavaş/Yoğun</th>
                <th className="px-4 py-2 text-right">Boşta</th>
                <th className="px-4 py-2 text-right">Anlık WIP</th>
                <th className="px-4 py-2 text-right">Zirve WIP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {mainGroupStats.map(g => (
                <tr key={g.id} className="hover:bg-surface-2/50 transition">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                      <span className="font-medium text-ink">{g.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-ink">{g.subCount}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-ok">{g.totalCompleted.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-ink">%{g.avgUtil.toFixed(0)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-ink-soft font-mono tabular-nums w-8">%{g.minUtil.toFixed(0)}</span>
                      <div className="flex-1 h-2 bg-surface-2 rounded-full relative min-w-[80px]">
                        <div className="absolute h-full bg-line-strong rounded-full"
                          style={{ left: `${g.minUtil}%`, width: `${Math.max(2, g.maxUtil - g.minUtil)}%` }} />
                      </div>
                      <span className="text-[10px] text-ink-soft font-mono tabular-nums w-8">%{g.maxUtil.toFixed(0)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {g.bottleneckCount > 0
                      ? <span className="font-bold text-danger">{g.bottleneckCount}</span>
                      : <span className="text-ink-faint">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {g.idleCount > 0
                      ? <span className="font-bold text-ink-soft">{g.idleCount}</span>
                      : <span className="text-ink-faint">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-ink">{g.totalCurrentQueue}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-warn">{g.totalPeakQueue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detaylı Istasyon Tablosu */}
      <div className="bg-surface border border-line rounded-[10px] shadow-card">
        <div className="px-4 py-3 border-b border-line flex items-center gap-3 flex-wrap">
          <h3 className="font-display font-semibold text-sm text-ink flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent" /> İstasyon Detayları ({filteredStations.length}/{stations.length})
          </h3>
          <select value={filterMain} onChange={e => setFilterMain(e.target.value)}
            className="text-xs bg-surface border border-line rounded px-2 py-1 text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25">
            <option value="">Tüm 1.Seviye süreçler</option>
            {data.mainOps.map(mo => <option key={mo.id} value={mo.id}>{mo.name}</option>)}
          </select>
          <select value={filterState} onChange={e => setFilterState(e.target.value)}
            className="text-xs bg-surface border border-line rounded px-2 py-1 text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25">
            <option value="">Tüm durumlar</option>
            <option value="bottleneck">En Yavaş/Yoğun</option>
            <option value="balanced">Dengeli</option>
            <option value="light">Hafif Yük</option>
            <option value="idle">Boşta</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 sticky top-0">
              <tr className="text-left text-ink-soft uppercase tracking-[0.08em] text-[10px]">
                <th className="px-3 py-2">1.Seviye Süreç</th>
                <SortHeader active={sortBy==='name'} dir={sortDir} onClick={() => toggleSort('name')}>İstasyon</SortHeader>
                <th className="px-3 py-2">{L.resource}/{L.person}</th>
                <SortHeader active={sortBy==='cycle'} dir={sortDir} onClick={() => toggleSort('cycle')} className="text-right">Çevrim</SortHeader>
                <SortHeader active={sortBy==='completed'} dir={sortDir} onClick={() => toggleSort('completed')} className="text-right">Tamamlanan</SortHeader>
                <th className="px-3 py-2 text-right">Teorik / Eksik</th>
                <SortHeader active={sortBy==='util'} dir={sortDir} onClick={() => toggleSort('util')} className="text-right">Kullanım</SortHeader>
                <SortHeader active={sortBy==='queue'} dir={sortDir} onClick={() => toggleSort('queue')} className="text-right">Anlık Kuyruk</SortHeader>
                <SortHeader active={sortBy==='peak'} dir={sortDir} onClick={() => toggleSort('peak')} className="text-right">Zirve</SortHeader>
                <th className="px-3 py-2">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredStations.map(s => (
                <tr key={s.id} className="hover:bg-surface-2/50 transition">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.mainColor }} />
                      <span className="text-ink-soft text-[11px]">{s.mainName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="font-medium truncate max-w-[240px] text-ink" title={s.name}>{s.name}</div>
                    {s.type && <div className="text-[10px] text-ink-faint">{s.type}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-ink-soft">
                    {s.machineName && <div>{s.machineName}</div>}
                    {s.operatorName && <div className="text-ink-faint">{s.operatorName}</div>}
                    {!s.machineName && !s.operatorName && <span className="text-ink-faint">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-ink">{s.cycleTime.toFixed(2)} sn</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold text-ok">{s.completed}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] text-ink-soft">
                    {s.teorikAdet}
                    {s.eksik > 0 && <span className="text-danger ml-1">(-{s.eksik})</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <div className="w-14 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${
                          s.utilPct >= 90 ? 'bg-danger' :
                          s.utilPct >= 70 ? 'bg-ok' :
                          s.utilPct >= 40 ? 'bg-warn' : 'bg-line-strong'
                        }`} style={{ width: `${s.utilPct}%` }} />
                      </div>
                      <span className="font-mono tabular-nums text-[11px] w-10 text-right text-ink">%{s.utilPct.toFixed(0)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-ink">{s.currentQueue}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold text-warn">{s.peak}</td>
                  <td className="px-3 py-1.5">
                    <StateBadge tone={s.stateColor}>{s.stateLabel}</StateBadge>
                  </td>
                </tr>
              ))}
              {filteredStations.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-ink-faint italic text-xs">Filtrelere uyan istasyon yok</td></tr>
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
      <div className="text-[11px] text-ink-soft flex flex-wrap gap-3 px-2">
        <span><b className="text-ink">Çevrim:</b> 1 {lower(L.item)} işleme süresi</span>
        <span><b className="text-ink">Teorik / Eksik:</b> tek başına ideal durumda yapabileceği / bugün yetişemediği</span>
        <span><b className="text-ink">Kullanım %:</b> çalıştığı süre / toplam geçen süre</span>
        <span><b className="text-ink">Zirve:</b> bugüne kadar gözlenen en yüksek kuyruk</span>
      </div>
    </div>
  );
}

/* ============================================================
   Operatör Optimizasyon Paneli — Seviye 1: eşleştirme önerileri
   ============================================================ */
function OperatorOptimizationPanel({ stations, data, maxSec, elapsed, bottleneckDailyMax }) {
  const L = useLabels();
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
      <div className="bg-surface-2 border border-line rounded-[10px] p-5 text-center">
        <Users className="w-8 h-8 text-ink-faint mx-auto mb-2" />
        <h3 className="font-display font-semibold text-sm text-ink">{L.person} Optimizasyonu</h3>
        <p className="text-xs text-ink-soft mt-1">
          {!anyBottleneck
            ? 'Bu modelde darboğaz istasyon yok — hat iyi dengelenmiş.'
            : !anyDonor
              ? `Darboğaz var ama boş kapasiteli ${lower(L.person)} yok. Yeni kaynak eklemek gerekli.`
              : 'Eşleştirilebilir öneri yok.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-[10px] shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center gap-3">
        <Users className="w-4 h-4 text-accent" />
        <div className="flex-1">
          <h3 className="font-display font-semibold text-sm text-ink">{L.person} Optimizasyon Önerileri</h3>
          <p className="text-[11px] text-ink-soft mt-0.5">
            Boş zamanı olan {lower(L.person)} kaynağını darboğaz istasyonlara yönlendir. Tavsiyeler hat dengesini iyileştirir.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.08em] text-ink-soft font-semibold">Potansiyel Kazanç</div>
          <div className="text-lg font-bold text-ok font-mono tabular-nums">+{totalDailyExtra.toLocaleString('tr-TR')} adet</div>
          <div className="text-[10px] text-ink-soft">tüm öneriler uygulanırsa</div>
        </div>
      </div>

      <div className="divide-y divide-line">
        {recommendations.pairs.map((p, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-start gap-3">
              {/* Öncelik badge */}
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent-tint text-accent-ink flex items-center justify-center text-xs font-bold font-mono">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                {/* Darboğaz istasyonu */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.recipient.mainColor }} />
                  <span className="font-display font-semibold text-sm text-danger">{p.recipient.name}</span>
                  <span className="text-[11px] text-ink-soft">
                    {p.recipient.mainName} · %{p.recipient.utilPct.toFixed(0)} meşgul · zirve {p.recipient.peak} · {p.recipient.cycleTime.toFixed(2)} sn
                  </span>
                  <StateBadge tone="red">Darboğaz</StateBadge>
                </div>

                {/* Transfer öneri */}
                <div className="mt-2 pl-4 border-l-2 border-line-strong space-y-0.5">
                  <div className="text-xs text-ink flex items-center gap-2 flex-wrap">
                    <ChevronRight className="w-3.5 h-3.5 text-accent" />
                    <span>
                      <b>{p.donor.operatorName}</b> <span className="text-ink-soft">({p.donor.name}, %{p.donor.utilPct.toFixed(0)} meşgul)</span>
                      {' '}yarı zamanını buraya yönlendir
                    </span>
                    {p.matchLevel === 'skill' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-ok-tint text-ok rounded-sm text-[10px] font-medium"
                        title={`${L.person} yetenekleri: ${(p.donor.operatorSkills || []).join(', ') || '—'}`}>
                        <Check className="w-2.5 h-2.5" /> Yetenek var ({p.recipient.type})
                      </span>
                    )}
                    {p.matchLevel === 'type' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-info-tint text-info rounded-sm text-[10px] font-medium"
                        title="Zaten aynı op tipinde çalışıyor — yetenek tanımsız ama deneyim var">
                        <Check className="w-2.5 h-2.5" /> Deneyim ({p.donor.type})
                      </span>
                    )}
                    {p.matchLevel === 'unknown' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-surface-2 text-ink-soft rounded-sm text-[10px] font-medium"
                        title={`${L.person} yetenekleri henüz tanımlanmamış — Kaynaklar sekmesinde yetenek seçerek güvenliği arttırabilirsin`}>
                        ? Yetenek tanımsız
                      </span>
                    )}
                    {p.matchLevel === 'mismatch' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-warn-tint text-warn rounded-sm text-[10px] font-medium"
                        title={`${L.person} yetenekleri: ${(p.donor.operatorSkills || []).join(', ') || '—'} — ${p.recipient.type} bilmiyor. Çapraz eğitim (%${((1 - p.effectiveness) * 100).toFixed(0)} verim kaybı) gerek.`}>
                        <AlertTriangle className="w-2.5 h-2.5" /> Eğitim gerek ({p.recipient.type})
                      </span>
                    )}
                  </div>
                  {/* Etki */}
                  <div className="text-xs text-ink-soft flex flex-wrap gap-x-4 gap-y-0.5 pl-5 font-mono tabular-nums">
                    <span>
                      <span className="text-ink-faint font-sans">Transfer:</span>{' '}
                      <b className="text-ink">~%{p.transferPct.toFixed(0)} vardiya</b>
                    </span>
                    <span>
                      <span className="text-ink-faint font-sans">Etkin çevrim:</span>{' '}
                      <b className="text-ok">-%{p.cycleReductionPct.toFixed(0)}</b>
                    </span>
                    <span>
                      <span className="text-ink-faint font-sans">Günlük kazanç:</span>{' '}
                      <b className="text-ok">+{p.dailyExtra.toLocaleString('tr-TR')} adet</b>
                    </span>
                    {p.donor.cycleTime > 0 && (
                      <span className="text-ink-faint font-sans" title="Donör istasyonda eksilme olmaz çünkü zaten boştu">
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
          <div className="px-4 py-2.5 bg-warn-tint text-xs text-warn border-t border-warn/30">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
            <b>{recommendations.unmatched} darboğaz istasyon</b> için boş kapasiteli {lower(L.person)} kalmadı — ek kaynak veya paralel {lower(L.resource)} gerekli.
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 bg-surface-2 text-[11px] text-ink-soft border-t border-line flex items-center gap-2 flex-wrap">
        <span><b className="text-ink">Nasıl uygula:</b></span>
        <span>1) <b className="text-ink">Kaynaklar</b> sekmesine git</span>
        <ChevronRight className="w-3 h-3" />
        <span>2) Önerilen {lower(L.person)} için darboğaz istasyona ek atama yap (veya şu anki istasyonuyla paylaştır)</span>
        <ChevronRight className="w-3 h-3" />
        <span>3) Yeniden simüle et, raporu karşılaştır</span>
      </div>
    </div>
  );
}

function ReportCard({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate:   { tint: 'bg-surface-2',   ink: 'text-ink-soft' },
    cyan:    { tint: 'bg-accent-tint', ink: 'text-accent-ink' },
    amber:   { tint: 'bg-warn-tint',   ink: 'text-warn' },
    emerald: { tint: 'bg-ok-tint',     ink: 'text-ok' },
    red:     { tint: 'bg-danger-tint', ink: 'text-danger' },
  };
  const t = tones[tone] || tones.slate;
  return (
    <div className="bg-surface rounded-[10px] border border-line shadow-card p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.08em] text-ink-soft font-semibold">{label}</div>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.tint}`} />
      </div>
      <div className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${t.ink}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-soft mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function SortHeader({ active, dir, onClick, children, className = '' }) {
  return (
    <th className={`px-3 py-2 cursor-pointer select-none hover:bg-line/40 ${className}`} onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active && <span className="text-[9px] text-ink-soft">{dir === 'desc' ? '▼' : '▲'}</span>}
      </span>
    </th>
  );
}

function StateBadge({ tone, children }) {
  const tones = {
    red: 'bg-danger-tint text-danger',
    amber: 'bg-warn-tint text-warn',
    emerald: 'bg-ok-tint text-ok',
    slate: 'bg-surface-2 text-ink-soft',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded-[6px] text-[10px] font-semibold uppercase tracking-wider ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

function SimKpi({ label, value, unit, icon: Icon, tone, term }) {
  const tones = {
    slate:   { tint: 'bg-surface-2',   ink: 'text-ink-soft' },
    cyan:    { tint: 'bg-accent-tint', ink: 'text-accent-ink' },
    amber:   { tint: 'bg-warn-tint',   ink: 'text-warn' },
    emerald: { tint: 'bg-ok-tint',     ink: 'text-ok' },
    red:     { tint: 'bg-danger-tint', ink: 'text-danger' },
  };
  const t = tones[tone] || tones.slate;
  return (
    <div className="bg-surface rounded-[10px] border border-line shadow-card p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-[0.08em] text-ink-soft font-semibold">{label}{term && <> <InfoTip term={term} /></>}</span>
        {Icon && (
          <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${t.tint}`}>
            <Icon className={`w-3.5 h-3.5 ${t.ink}`} />
          </span>
        )}
      </div>
      <div className="text-xl font-mono tabular-nums font-bold leading-tight text-ink">{value}</div>
      <div className="text-[10px] text-ink-soft mt-0.5">{unit}</div>
    </div>
  );
}
