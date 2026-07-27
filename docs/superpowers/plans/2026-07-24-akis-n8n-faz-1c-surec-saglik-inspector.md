# Akış (n8n) — Faz 1c: Süreç Sağlık Inspector'ı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** "Akış (n8n)" canvas'ında bir node'a tıklayınca n8n NDV benzeri **GİRDİ → node → ÇIKTI (ad/v)** sağlık paneli aç; panelde **böl/birleş (splitType/joinType)** düzenlenebilsin; input node'u **"Tetikleyici"** olarak etiketlensin.

**Architecture:** Saf `nodeHealth(node, calc, containerId)` yardımcısı node durumunu (kapasite, çıktı, kullanım, darboğaz/aç/normal) hesaplar. `NodeInspector.jsx` bunu + besleyen node'ları (girdi) + split/join toggle'ını render eder; toggle `onChange` ile node'u günceller. `FlowEditor.jsx` seçili node'u tutar, tıklayınca inspector'ı gösterir. Motora dokunulmaz (calc.thru/cap/bottleneckByContainer zaten var).

**Tech Stack:** React, `@xyflow/react`, Vitest (nodeHealth için).

**Referans:** spec `2026-07-24-akis-n8n-surec-editoru-design.md`; n8n analizi (trigger=input, split/join=branch/merge — motorda hazır). Faz 1a/1b commit'li.

---

## Dosya yapısı

- Create: `components/vsim/engine/nodeHealth.js` + `nodeHealth.test.js` — saf sağlık hesabı.
- Create: `components/vsim/components/NodeInspector.jsx` — sağlık paneli + toggle'lar.
- Modify: `components/vsim/components/FlowEditor.jsx` — seçili node state, onNodeClick, NodeInspector mount, "Tetikleyici" etiketi.

---

### Task 1: `nodeHealth` saf yardımcısı

Bir node'un sağlığını calc'tan hesaplar. Girdi rate'i (Infinity-kaynak modeli yüzünden) BU yardımcıda hesaplanmaz — inspector besleyen node'ların `thru`'sunu gösterir. Burada: kapasite, çıktı (thru), kullanım, durum.

**Files:** Create: `components/vsim/engine/nodeHealth.js`, `nodeHealth.test.js`

- [ ] **Step 1: Failing test yaz**

`nodeHealth.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { nodeHealth } from './nodeHealth.js';

const calc = {
  cap: { in: Infinity, usta: 1483.6, acami: 741.8, out: Infinity },
  thru: { in: Infinity, usta: 1483.6, acami: 741.8, out: 2225.4 },
  bottleneckByContainer: { op2: 'acami' },
};

describe('nodeHealth', () => {
  it('geçirgen input/output → gecirgen durumu', () => {
    expect(nodeHealth({ id: 'in', kind: 'input' }, calc, 'op2').status).toBe('gecirgen');
    expect(nodeHealth({ id: 'out', kind: 'output' }, calc, 'op2').status).toBe('gecirgen');
  });

  it('container darboğazı → darbogaz', () => {
    const h = nodeHealth({ id: 'acami', kind: 'op' }, calc, 'op2');
    expect(h.status).toBe('darbogaz');
    expect(h.out).toBeCloseTo(741.8, 1);
    expect(h.cap).toBeCloseTo(741.8, 1);
  });

  it('kapasitesinin altında çalışan op → normal (tam kapasite) veya ac (spare)', () => {
    // usta tam kapasitede (thru==cap) ama darboğaz değil → normal
    expect(nodeHealth({ id: 'usta', kind: 'op' }, calc, 'op2').status).toBe('normal');
    // spare: thru < cap
    const c2 = { ...calc, thru: { ...calc.thru, usta: 700 } };
    expect(nodeHealth({ id: 'usta', kind: 'op' }, c2, 'op2').status).toBe('ac');
  });

  it('kapasite 0 → bos', () => {
    expect(nodeHealth({ id: 'x', kind: 'op' }, { cap: { x: 0 }, thru: {}, bottleneckByContainer: {} }, 'op2').status).toBe('bos');
  });
});
```

- [ ] **Step 2: Test'in başarısız olduğunu doğrula**

Run: `npx vitest run components/vsim/engine/nodeHealth.test.js`
Expected: FAIL — "nodeHealth is not a function"

- [ ] **Step 3: Implementasyon**

`nodeHealth.js`:
```js
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
```

- [ ] **Step 4: Test geçer**

Run: `npx vitest run components/vsim/engine/nodeHealth.test.js`
Expected: PASS (4 test)

- [ ] **Step 5: Commit**

```bash
git add components/vsim/engine/nodeHealth.js components/vsim/engine/nodeHealth.test.js
git commit -m "feat(vsim): nodeHealth — node akis sagligi (kapasite/cikti/durum)"
```

---

### Task 2: `NodeInspector.jsx` — sağlık paneli + böl/birleş toggle + trigger etiketi

**Files:** Create: `components/vsim/components/NodeInspector.jsx`

- [ ] **Step 1: Bileşeni yaz**

`NodeInspector.jsx` (props: `node`, `data`, `calc`, `containerId`, `onChange`, `onClose`):
```jsx
'use client';
import { nodeHealth } from '../engine/nodeHealth.js';
import { subParent } from '../engine/flow.js';

const STATUS = {
  gecirgen: { label: 'Geçirgen', color: '#64748b' },
  bos: { label: 'Boş', color: '#94a3b8' },
  darbogaz: { label: 'Darboğaz', color: '#dc2626' },
  ac: { label: 'Aç (kapasite fazla)', color: '#d97706' },
  normal: { label: 'Normal', color: '#0F6B5C' },
};
const fmt = (v) => (v == null ? '—' : v === Infinity ? '∞' : Number(v).toFixed(0));

export default function NodeInspector({ node, data, calc, containerId, onChange, onClose }) {
  if (!node) return null;
  const kind = node.kind || 'op';
  const h = nodeHealth(node, calc, containerId);
  const st = STATUS[h.status] || STATUS.normal;
  const kids = (data.subOps || []).filter(s => subParent(s) === containerId);
  const feeders = kids.filter(s => (s.nextIds || []).includes(node.id));
  const label = kind === 'input' ? 'Tetikleyici / Girdi' : kind === 'output' ? 'Çıktı (birleşme)' : node.name || node.id;

  const patch = (p) => onChange({ ...data, subOps: (data.subOps || []).map(s => s.id === node.id ? { ...s, ...p } : s) });

  return (
    <div style={{ position: 'absolute', top: 8, right: 8, width: 260, background: '#fff',
      border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
      padding: 12, fontSize: 12, zIndex: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <b>{label}</b>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>

      {/* GİRDİ */}
      <div style={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10, marginTop: 6 }}>Girdi</div>
      {kind === 'input'
        ? <div>Talep / üst süreç (sınırsız kaynak)</div>
        : feeders.length
          ? feeders.map(f => <div key={f.id} style={{ fontFamily: 'monospace' }}>{f.name || f.id}: {fmt(calc.thru?.[f.id])} ad/v</div>)
          : <div>— (bağlı besleyen yok)</div>}

      {/* NODE */}
      {kind === 'op' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10 }}>Node</div>
          <div>Çevrim: {node.cycleTime ?? 0} sn · Kapasite: {fmt(h.cap)} ad/v</div>
        </div>
      )}

      {/* ÇIKTI + sağlık */}
      <div style={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10, marginTop: 8 }}>Çıktı</div>
      <div style={{ fontFamily: 'monospace' }}>{fmt(h.out)} ad/v{h.utilPct != null ? ` · %${h.utilPct.toFixed(0)} kullanım` : ''}</div>
      <div style={{ marginTop: 6, display: 'inline-block', padding: '2px 8px', borderRadius: 999,
        background: st.color + '22', color: st.color, fontWeight: 600 }}>{st.label}</div>

      {/* BÖL/BİRLEŞ toggle */}
      <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10 }}>Dağıtım (çıkış)</div>
        <select value={node.splitType || 'DUP'} onChange={e => patch({ splitType: e.target.value })} style={{ width: '100%' }}>
          <option value="SPLIT">Böl — her parça bir dala (paralel/yedek)</option>
          <option value="DUP">Kopyala — her parça tüm dallara (ardışık)</option>
        </select>
        <div style={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10, marginTop: 6 }}>Birleşme (giriş)</div>
        <select value={node.joinType || 'AND'} onChange={e => patch({ joinType: e.target.value })} style={{ width: '100%' }}>
          <option value="DUP">Topla — kapasiteler toplanır (aynı iş)</option>
          <option value="AND">Senkron — en yavaşa göre (farklı iş)</option>
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Parse-check**

Run: `npx esbuild components/vsim/components/NodeInspector.jsx --loader:.jsx=jsx --bundle --external:react --external:../* --format=esm --outfile=/dev/null`
Expected: hata yok.

- [ ] **Step 3: Commit**

```bash
git add components/vsim/components/NodeInspector.jsx
git commit -m "feat(vsim): NodeInspector — surec saglik paneli + bol/birles toggle + trigger etiketi"
```

---

### Task 3: FlowEditor entegrasyonu — seçili node + inspector + trigger etiketi

**Files:** Modify: `components/vsim/components/FlowEditor.jsx`

- [ ] **Step 1: Seçili node state + onNodeClick + inspector mount**

FlowEditor içinde:
- `import NodeInspector from './NodeInspector.jsx';` ekle.
- `const [selectedId, setSelectedId] = useState(null);`
- `<ReactFlow ... onNodeClick={(_e, n) => setSelectedId(n.id)} onPaneClick={() => setSelectedId(null)}>`
- Canvas sarmalayıcı `<div style={{ position:'relative', height:520 }}>` içine ReactFlow'dan SONRA:
```jsx
{selectedId && (
  <NodeInspector
    node={(data.subOps || []).find(s => s.id === selectedId)}
    data={data} calc={calc} containerId={containerId}
    onChange={onChange} onClose={() => setSelectedId(null)}
  />
)}
```
(Sarmalayıcı `div` zaten `position:relative` değilse yap — NodeInspector `position:absolute`.)

- [ ] **Step 2: Trigger etiketi (FlowNode)**

`FlowNode` içinde input node'un başlığını "Tetikleyici" göster:
```jsx
const kindLabel = kind === 'input' ? '⚡ Tetikleyici' : kind === 'output' ? 'Çıktı' : label;
// başlık div'inde {kindLabel} kullan (op için label = node adı)
```

- [ ] **Step 3: Parse-check + tam test**

Run: `npx esbuild components/vsim/components/FlowEditor.jsx --loader:.jsx=jsx --bundle --external:react --external:@xyflow/react --external:../* --format=esm --outfile=/dev/null && npx vitest run`
Expected: esbuild hata yok; vitest tümü PASS (350 + nodeHealth 4).

- [ ] **Step 4: Kullanıcı görsel doğrular**

Not: `npm run dev` → "Akış (n8n)" → node'a tıkla → sağ üstte panel: Girdi/Çıktı ad/v + durum + böl/birleş toggle. Toggle değişince Hesaplama güncellenir. **Kullanıcı görsel onaylar.**

- [ ] **Step 5: Commit**

```bash
git add components/vsim/components/FlowEditor.jsx
git commit -m "feat(vsim): FlowEditor — node secince saglik inspector'i + trigger etiketi"
```

---

## Self-Review

- **Spec coverage:** Faz 1c (INPUT|node|OUTPUT sağlık paneli + n8n NDV) → Task 1-3. n8n analizindeki 3 boşluktan 2'si kapanır: satır-içi böl/birleş toggle (Task 2) + trigger etiketi (Task 2-3). Üçüncü boşluk (cross-container çoklu-çıktı zinciri) bu planın DIŞINDA — ayrı Faz 1d.
- **Placeholder:** Yok — nodeHealth ve NodeInspector tam kod. FlowEditor entegrasyonu mevcut dosyaya net referanslarla.
- **Tip tutarlılığı:** `nodeHealth(node, calc, containerId)` (Task 1) → NodeInspector (Task 2) → FlowEditor (Task 3) tutarlı. `calc.thru/cap/bottleneckByContainer`, `splitType`/`joinType` motorla uyumlu. `subParent`/`isPassthrough` flow.js'ten.

## Sonraki faz (bu plan dışı)
- **Faz 1d:** Cross-container zincir — bir sürecin çoklu output'u farklı aşağı-süreçlere (sağlam→paketleme, fire→tamir).
