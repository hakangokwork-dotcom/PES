# Akış (n8n) — Faz 1b: React Flow Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** VSIM'e "Akış (n8n)" sekmesi ekle — bir sürece girince otomatik **INPUT → alt-op'lar → OUTPUT** node'larını React Flow ile göster; sürükle-bağla ile akışı kur (bağlantı = `nextIds`, girdi çıkışları varsayılan `SPLIT`). Faz 1a motoru bunu zaten doğru hesaplıyor.

**Architecture:** Yeni `FlowEditor.jsx` (React Flow) mevcut `data` (mainOps/subOps) üzerinde çalışır. Bir konteyner açılınca `ensureFlowNodes` ile 1 input + ≥1 output node (kind) garanti edilir. Node konumları subOp `x`/`y`'de tutulur. Bağlantı `nextIds`'i günceller; input'tan çıkanlar `splitType:'SPLIT'`. Mevcut Akış/ProcessMapStudio'ya **dokunulmaz**.

**Tech Stack:** React, `@xyflow/react` (React Flow, MIT), Vitest (veri yardımcıları için).

**Referans:** spec `docs/superpowers/specs/2026-07-24-akis-n8n-surec-editoru-design.md`; motor Faz 1a (commit'li: isPassthrough, kind, split/join).

---

## Dosya yapısı

- Modify: `package.json` — `@xyflow/react` bağımlılığı.
- Create: `components/vsim/engine/flowNodes.js` — `ensureFlowNodes(data, containerId)`, `flowNodeDefaults` (saf, test edilebilir veri yardımcıları).
- Create: `components/vsim/engine/flowNodes.test.js` — birim testler.
- Create: `components/vsim/components/FlowEditor.jsx` — React Flow canvas + custom node'lar (input/op/output) + onConnect.
- Modify: `components/vsim/UretimSimulasyon.jsx` — "Akış (n8n)" sekmesi + FlowEditor mount.

---

### Task 1: `@xyflow/react` bağımlılığını ekle

**Files:** Modify: `package.json`

- [ ] **Step 1: Kur**

Run: `npm install @xyflow/react`
Expected: `package.json`/`package-lock.json` güncellenir, hata yok.

- [ ] **Step 2: Import edilebildiğini doğrula**

Run: `node -e "import('@xyflow/react').then(m=>console.log(!!m.ReactFlow)).catch(e=>{console.error(e);process.exit(1)})"`
Expected: `true`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(vsim): @xyflow/react bagimliligi (Akis n8n gorunumu)"
```

---

### Task 2: `ensureFlowNodes` — otomatik input/output node'ları (saf veri)

Bir konteyner (ana op veya alt-op) için 1 input + (yoksa) 1 output node garanti eder. Var olanları çoğaltmaz. İçindeki gerçek op'lar (kind yok/'op') input'a ve output'a otomatik bağlanmaz — bağlamayı kullanıcı yapar; yalnız node'lar oluşturulur.

**Files:** Create: `components/vsim/engine/flowNodes.js`, `flowNodes.test.js`

- [ ] **Step 1: Failing test yaz**

`flowNodes.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { ensureFlowNodes } from './flowNodes.js';

const base = () => ({
  mainOps: [{ id: 'op2', name: 'Op2', nextIds: [] }],
  subOps: [{ id: 'usta', mainOpId: 'op2', kind: 'op', cycleTime: 15, nextIds: [] }],
});

describe('ensureFlowNodes', () => {
  it('input ve output node yoksa birer tane ekler', () => {
    const d = ensureFlowNodes(base(), 'op2');
    const kids = d.subOps.filter(s => (s.parentId ?? s.mainOpId) === 'op2');
    expect(kids.filter(s => s.kind === 'input')).toHaveLength(1);
    expect(kids.filter(s => s.kind === 'output')).toHaveLength(1);
    expect(kids.filter(s => s.kind === 'op' || !s.kind)).toHaveLength(1); // usta korunur
  });

  it('var olan input/output çoğaltılmaz (idempotent)', () => {
    let d = ensureFlowNodes(base(), 'op2');
    d = ensureFlowNodes(d, 'op2');
    const kids = d.subOps.filter(s => (s.parentId ?? s.mainOpId) === 'op2');
    expect(kids.filter(s => s.kind === 'input')).toHaveLength(1);
    expect(kids.filter(s => s.kind === 'output')).toHaveLength(1);
  });

  it('input splitType SPLIT (böl), output joinType DUP (topla) varsayılan', () => {
    const d = ensureFlowNodes(base(), 'op2');
    const kids = d.subOps.filter(s => (s.parentId ?? s.mainOpId) === 'op2');
    expect(kids.find(s => s.kind === 'input').splitType).toBe('SPLIT');
    expect(kids.find(s => s.kind === 'output').joinType).toBe('DUP');
  });
});
```

- [ ] **Step 2: Test'in başarısız olduğunu doğrula**

Run: `npx vitest run components/vsim/engine/flowNodes.test.js`
Expected: FAIL — "ensureFlowNodes is not a function"

- [ ] **Step 3: Implementasyon**

`flowNodes.js`:
```js
import { uid, subParent } from './flow.js';

/* Bir konteyner için varsayılan akış node'ları garanti eder (idempotent).
   input: girdi (SPLIT=böl varsayılan) · output: çıktı (DUP=topla varsayılan).
   Gerçek op'lara otomatik bağlanmaz — bağlamayı kullanıcı çizer. Saf: yeni data döner. */
export function ensureFlowNodes(data, containerId) {
  const kids = (data.subOps || []).filter(s => subParent(s) === containerId);
  const has = (kind) => kids.some(s => s.kind === kind);
  const add = [];
  if (!has('input')) {
    add.push({ id: uid(), mainOpId: containerId, parentId: containerId, kind: 'input',
      name: 'Girdi', cycleTime: 0, nextIds: [], splitType: 'SPLIT', x: 40, y: 120 });
  }
  if (!has('output')) {
    add.push({ id: uid(), mainOpId: containerId, parentId: containerId, kind: 'output',
      name: 'Çıktı', cycleTime: 0, nextIds: [], joinType: 'DUP', x: 520, y: 120 });
  }
  if (add.length === 0) return data;
  return { ...data, subOps: [...(data.subOps || []), ...add] };
}
```

- [ ] **Step 4: Test'lerin geçtiğini doğrula**

Run: `npx vitest run components/vsim/engine/flowNodes.test.js`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add components/vsim/engine/flowNodes.js components/vsim/engine/flowNodes.test.js
git commit -m "feat(vsim): ensureFlowNodes — otomatik input/output akis node'lari"
```

---

### Task 3: `FlowEditor.jsx` — React Flow canvas (input/op/output + bağlama)

Bir konteynerin (breadcrumb'daki aktif süreç) alt-op'larını React Flow node'ları olarak gösterir. input sol, output sağ; op'lar ortada. Handle'larla sürükle-bağla → `nextIds` günceller. input'tan çıkan bağlantı `splitType:'SPLIT'` (zaten input'ta). Node sürükleyince `x`/`y` kaydeder.

**Files:** Create: `components/vsim/components/FlowEditor.jsx`

- [ ] **Step 1: Bileşeni yaz**

`FlowEditor.jsx` (React Flow controlled; `data`, `containerId`, `calc`, `onChange` props):
```jsx
'use client';
import { useMemo, useCallback } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { subParent } from '../engine/flowNodes.js'; // re-export subParent from flowNodes or import from flow.js
import { ensureFlowNodes } from '../engine/flowNodes.js';

// Custom node: input/op/output — n8n benzeri kutu + sol/sağ handle
function FlowNode({ data }) {
  const { label, kind, sub, rate } = data;
  const tone = kind === 'input' ? '#0F6B5C' : kind === 'output' ? '#B45309' : '#3E6B8C';
  return (
    <div style={{ border: `2px solid ${tone}`, borderRadius: 10, background: '#fff',
      padding: '8px 12px', minWidth: 120, fontSize: 12, boxShadow: '0 1px 4px rgba(0,0,0,.1)' }}>
      {kind !== 'input' && <Handle type="target" position={Position.Left} />}
      <div style={{ fontWeight: 600 }}>{label}</div>
      {kind === 'op' && <div style={{ color: '#64748b' }}>{sub?.cycleTime ?? 0} sn</div>}
      {rate != null && <div style={{ color: '#64748b', fontFamily: 'monospace' }}>{rate.toFixed(0)} ad/v</div>}
      {kind !== 'output' && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
const nodeTypes = { flow: FlowNode };

export default function FlowEditor({ data, containerId, calc, onChange }) {
  // Konteyner açılınca input/output garanti (yan-etki değil: eksikse onChange ile yaz)
  const ensured = useMemo(() => ensureFlowNodes(data, containerId), [data, containerId]);
  const kids = useMemo(
    () => (ensured.subOps || []).filter(s => subParent(s) === containerId),
    [ensured, containerId]);

  const nodes = useMemo(() => kids.map(s => ({
    id: s.id, type: 'flow',
    position: { x: s.x ?? 0, y: s.y ?? 0 },
    data: { label: s.name || s.id, kind: s.kind || 'op', sub: s, rate: calc?.thru?.[s.id] },
  })), [kids, calc]);

  const edges = useMemo(() => {
    const idset = new Set(kids.map(k => k.id));
    return kids.flatMap(s => (s.nextIds || [])
      .filter(n => idset.has(n))
      .map(n => ({ id: `${s.id}-${n}`, source: s.id, target: n })));
  }, [kids]);

  const writeKids = useCallback((updater) => {
    const next = ensured.subOps.map(s => subParent(s) === containerId ? updater(s) : s);
    onChange({ ...ensured, subOps: next });
  }, [ensured, containerId, onChange]);

  const onConnect = useCallback((c) => {
    writeKids(s => s.id === c.source
      ? { ...s, nextIds: [...new Set([...(s.nextIds || []), c.target])] } : s);
  }, [writeKids]);

  const onNodeDragStop = useCallback((_e, node) => {
    writeKids(s => s.id === node.id ? { ...s, x: node.position.x, y: node.position.y } : s);
  }, [writeKids]);

  // ensure eksik node yazdıysa üst state'e taşı (bir kez)
  if (ensured !== data) onChange(ensured);

  return (
    <div style={{ height: 520 }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onConnect={onConnect} onNodeDragStop={onNodeDragStop} fitView>
        <Background /><Controls /><MiniMap />
      </ReactFlow>
    </div>
  );
}
```

Note: `subParent`'ı `flowNodes.js`'ten re-export et (`export { subParent } from './flow.js';`) veya doğrudan `../engine/flow.js`'ten import et — hangisi projede temizse.

- [ ] **Step 2: Parse/derleme doğrula**

Run: `npx esbuild components/vsim/components/FlowEditor.jsx --loader:.jsx=jsx --bundle --external:react --external:@xyflow/react --external:../* --format=esm --outfile=/dev/null`
Expected: hata yok.

- [ ] **Step 3: Commit**

```bash
git add components/vsim/components/FlowEditor.jsx components/vsim/engine/flowNodes.js
git commit -m "feat(vsim): FlowEditor — React Flow akis canvas (input/op/output + baglama)"
```

---

### Task 4: "Akış (n8n)" sekmesi (UretimSimulasyon.jsx)

Mevcut sekme çubuğuna "Akış (n8n)" ekle; seçilince FlowEditor'ı aktif konteynerle mount et. Mevcut "Akış" sekmesi durur.

**Files:** Modify: `components/vsim/UretimSimulasyon.jsx`

- [ ] **Step 1: Sekme ekle**

Mevcut `TabBtn`'lerin yanına (Akış sekmesinin hemen sonrası) ekle:
```jsx
<TabBtn active={tab === 'flow'} onClick={() => setTab('flow')} icon={GitBranch}>Akış (n8n)</TabBtn>
```
(`GitBranch` lucide-react'ten import edilir; yoksa mevcut bir akış ikonu kullan.)

- [ ] **Step 2: İçeriği render et**

Tab içerik bloklarına ekle (aktif konteyner = mevcut breadcrumb `current`/kök; kök için ROOT_ID yerine ana-op seçili değilse ilk ana-op ya da kök gösterimi — mevcut Akış'ın `current` state'ini kullan):
```jsx
{tab === 'flow' && (
  <FlowEditor
    data={data}
    containerId={current /* mevcut Akış'ın aktif konteyner id'si */}
    calc={calc}
    onChange={setData}
  />
)}
```
`FlowEditor`'ı dosya başında `import FlowEditor from './components/FlowEditor';` ile getir.

- [ ] **Step 3: Dev sunucuda render doğrula (kullanıcı)**

Not: React Flow görseli birim-test edilmez. Doğrulama: `npm run dev` → `/pes/uretim-simulasyon` → "Akış (n8n)" sekmesi → bir süreç açınca Girdi/Çıktı node'ları + op'lar görünür, sürükle-bağla çalışır, bağlantı kaydolur. **Bu adımı kullanıcı görsel onaylar.**

- [ ] **Step 4: Tam test paketi yeşil kalır (motor/veri bozulmadı)**

Run: `npx vitest run`
Expected: PASS (tümü — 347 + yeni flowNodes testleri).

- [ ] **Step 5: Commit**

```bash
git add components/vsim/UretimSimulasyon.jsx
git commit -m "feat(vsim): Akis (n8n) sekmesi — FlowEditor mount"
```

---

## Self-Review

- **Spec coverage:** Faz 1b (React Flow sekmesi, otomatik I/O, bağlama, splitType SPLIT varsayılan) → Task 1-4. Motor Faz 1a'da hazır. Inspector = Faz 1c (ayrı).
- **Placeholder:** `subParent` import kaynağı Task 3'te iki seçenekle netleştirildi — implementer projedeki temiz olanı seçer (bu bir stil kararı, mantık değil).
- **Tip tutarlılığı:** `ensureFlowNodes`/`subParent`/`kind`/`splitType:'SPLIT'`/`joinType:'DUP'` Faz 1a ve bu plan boyunca tutarlı. `calc.thru` node hızları için (motor döndürüyor).
- **Risk:** React Flow controlled-mode + `onChange(ensured)` render-içi çağrısı sonsuz döngü yapabilir → implementer `useEffect` ile bir-kez yazsın (Task 3 Step 1 not: render-içi `if (ensured !== data) onChange` yerine `useEffect([containerId])` tercih edilir). **Implementer bunu useEffect'e taşımalı.**

## Sonraki faz
- **Faz 1c:** Node seçince süreç sağlığı inspector'ı (INPUT/OUTPUT ad/v paneli) → ayrı plan.
