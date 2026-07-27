# VSM Global Standart — stationCount Bug + Standart Yamazumi + Temizlik

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** VSM hesaplarını global Lean/IE standardına getir: (A) `stationCount`'un dengeleme/operatör KPI'larında yok sayılması bug'ını düzelt, (B) Yamazumi'yi **operatör/istasyon başına iş-içeriği çubuğu** olarak yeniden yap (standart OBC), (C) `pceBand` etiketini düzelt, (D) n8n tab'ını kaldır.

**Architecture:** Motorda `perMain` aggregate'i `stationCount` ile ölçekler. Yeni saf `yamazumiBars` yardımcısı standart operatör-başına çubukları üretir; DashboardView bunu çizer. `effectiveCycle` "Kapasite Temposu" olarak kalır (Yamazumi değil). Denetim raporu: `docs/superpowers/` (session).

**Tech Stack:** Vanilla JS, Vitest, React/Recharts.

---

### Task 1: `stationCount` aggregate bug (dengeleme/operatör/SMV)

`capacity.js:leafCap` kapasiteyi `stationCount` ile çarpıyor ama `perMain` (`totalCycle`,`stations`,`smv`) ve DashboardView dengeleme tile'ı yaprak sayısını sayıp `stationCount`'u atlıyor.

**Files:** Modify: `components/vsim/engine/capacity.js`, `components/vsim/UretimSimulasyon.jsx`; Test: `capacity.test.js`

- [ ] **Step 1: Failing test** (capacity.test.js'e ekle)

```js
it('stationCount perMain toplamlarına yansır (ΣCT, istasyon, SMV)', () => {
  const d = {
    mainOps: [{ id: 'a', name: 'A', color: '#000', order: 0, nextIds: [], x: 0, y: 0 }],
    subOps: [
      { id: 's1', mainOpId: 'a', cycleTime: 60, stationCount: 2, nextIds: [] }, // 2 istasyon
      { id: 's2', mainOpId: 'a', cycleTime: 30, nextIds: [] },                   // 1 istasyon
    ],
    machines: [], operators: [],
    settings: { netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 },
    scenarios: [], meta: {},
  };
  const c = computeCapacity(d);
  const p = c.perMain[0];
  expect(p.stations).toBe(3);            // 2 + 1
  expect(p.totalCycle).toBe(150);        // 60×2 + 30
});
```

- [ ] **Step 2: FAIL doğrula** — `npx vitest run components/vsim/engine/capacity.test.js -t "stationCount perMain"`

- [ ] **Step 3: perMain'i düzelt** (`capacity.js` perMain bloğu)

`opSubs` üzerinden `stationCount` ile ölçekle:
```js
    const opSubs = subs.filter(s => !isPassthrough(s));
    const stCount = (s) => Math.max(1, s.stationCount || 1);
    const totalCycle = opSubs.reduce((a, s) =>
      a + (childNodes(data, s.id).length > 0 ? 0 : (s.cycleTime || 0) * stCount(s)), 0);
    const totalCycleMin = totalCycle / 60;
    const smv = totalCycleMin * (1 + pfd);
    const stations = opSubs.reduce((a, s) => a + (childNodes(data, s.id).length > 0 ? 0 : stCount(s)), 0) || 1;
```

- [ ] **Step 4: DashboardView dengeleme tile'ını düzelt** (`UretimSimulasyon.jsx`, "Dengeleme Verimi" / `leafCts` bloğu)

`leafCts`'i `stationCount` kadar tekrarla (her istasyon ΣCT ve N'ye katkı verir):
```js
  const leafCts = (data.subOps || [])
    .filter(s => childNodes(data, s.id).length === 0)
    .flatMap(s => Array(Math.max(1, s.stationCount || 1)).fill(s.cycleTime || 0))
    .filter(c => c > 0);
```

- [ ] **Step 5: PASS + tam paket** — `npx vitest run`  Expected: tümü PASS.

- [ ] **Step 6: Commit**
```bash
git add components/vsim/engine/capacity.js components/vsim/engine/capacity.test.js components/vsim/UretimSimulasyon.jsx
git commit -m "fix(vsim): stationCount dengeleme/operator/SMV toplamlarina yansisin (standart line-balancing)"
```

---

### Task 2: `pceBand` etiket düzeltmesi (%5-15 → 'ortalama')

**Files:** Modify: `components/vsim/engine/metrics.js`; Test: `metrics.test.js`

- [ ] **Step 1: Failing test** (metrics.test.js'e ekle)
```js
it('pceBand %5-15 ortalama (doküman §6.3)', () => {
  expect(pceBand(10)).toBe('ortalama');
});
```
(`pceBand` import edilmeli.)

- [ ] **Step 2: FAIL** — `npx vitest run components/vsim/engine/metrics.test.js -t "pceBand"`

- [ ] **Step 3: Düzelt** (`metrics.js:pceBand`)
```js
export function pceBand(pct) {
  if (pct < 5) return 'kritik';
  if (pct < 15) return 'ortalama';
  if (pct <= 25) return 'iyi';
  return 'mükemmel';
}
```
Ayrıca UI'da bu etikete renk/metin eşleyen yer varsa (`grep -n "zayıf" components/vsim/UretimSimulasyon.jsx` ile bak) 'ortalama' anahtarını da desteklediğinden emin ol.

- [ ] **Step 4: PASS + tam paket** — `npx vitest run`

- [ ] **Step 5: Commit**
```bash
git add components/vsim/engine/metrics.js components/vsim/engine/metrics.test.js
git commit -m "fix(vsim): pceBand %5-15 'ortalama' (dokuman uyumu)"
```

---

### Task 3: `yamazumiBars` — standart operatör/istasyon başına çubuklar

**Standart OBC:** her çubuk bir operatör/istasyon; o operatöre atanan iş elemanlarının CT'leri yığılı. Kural:
- Yaprak op'lar (kind op/undefined, cyc>0, geçirgen değil).
- `operatorId` VARSA: aynı operatör → tek çubuk, elemanları segment olarak yığılır (stationCount grup için 1 sayılır — bir operatör bir çubuk).
- `operatorId` YOKSA: her yaprak kendi çubuğu; `stationCount=n` → n ayrı çubuk (n paralel istasyon), her biri CT.
- Çubuk toplamı Takt ile kıyaslanır (durum: darbogaz CT>Takt, risk ≥%80, normal).

**Files:** Create: `components/vsim/engine/yamazumiBars.js`, `yamazumiBars.test.js`

- [ ] **Step 1: Failing test**
```js
import { describe, it, expect } from 'vitest';
import { yamazumiBars } from './yamazumiBars.js';

const data = (subOps) => ({ subOps, operators: [{ id: 'o1', name: 'Ali' }] });

describe('yamazumiBars', () => {
  it('operatörsüz iki yaprak → iki ayrı çubuk (usta 15, acami 30)', () => {
    const bars = yamazumiBars(data([
      { id: 'usta', mainOpId: 'a', cycleTime: 15, nextIds: [] },
      { id: 'acami', mainOpId: 'a', cycleTime: 30, nextIds: [] },
    ]), 288);
    expect(bars).toHaveLength(2);
    expect(bars.map(b => b.total).sort((x,y)=>x-y)).toEqual([15, 30]);
  });

  it('stationCount=2 operatörsüz → iki ayrı çubuk', () => {
    const bars = yamazumiBars(data([
      { id: 's', mainOpId: 'a', name: 'Dik', cycleTime: 20, stationCount: 2, nextIds: [] },
    ]), 288);
    expect(bars).toHaveLength(2);
    expect(bars.every(b => b.total === 20)).toBe(true);
  });

  it('aynı operatöre iki eleman → tek çubuk, yığılı (15+30=45)', () => {
    const bars = yamazumiBars(data([
      { id: 'e1', mainOpId: 'a', cycleTime: 15, operatorId: 'o1', nextIds: [] },
      { id: 'e2', mainOpId: 'a', cycleTime: 30, operatorId: 'o1', nextIds: [] },
    ]), 288);
    expect(bars).toHaveLength(1);
    expect(bars[0].total).toBe(45);
    expect(bars[0].segments).toHaveLength(2);
    expect(bars[0].label).toBe('Ali');
  });

  it('durum: total>takt darbogaz', () => {
    const bars = yamazumiBars(data([{ id: 'x', mainOpId: 'a', cycleTime: 300, nextIds: [] }]), 288);
    expect(bars[0].status).toBe('darbogaz');
  });
});
```

- [ ] **Step 2: FAIL** — `npx vitest run components/vsim/engine/yamazumiBars.test.js`

- [ ] **Step 3: Implementasyon**
```js
import { childNodes, isPassthrough } from './flow.js';

/* Standart Yamazumi/OBC çubukları: her çubuk bir operatör/istasyon, iş elemanları yığılı.
   operatorId varsa aynı operatör tek çubukta toplanır; yoksa her yaprak (stationCount kadar)
   ayrı çubuk. Takt ile kıyas: total>takt darbogaz, ≥%80 risk, altı normal. */
export function yamazumiBars(data, taktSec) {
  const ops = data.operators || [];
  const opName = (id) => ops.find(o => o.id === id)?.name || id;
  const leaves = (data.subOps || []).filter(s =>
    childNodes(data, s.id).length === 0 && !isPassthrough(s) && (s.cycleTime || 0) > 0);

  const byOp = new Map();   // operatorId → bar
  const bars = [];
  for (const s of leaves) {
    const seg = { id: s.id, name: s.name || s.id, sec: s.cycleTime || 0, color: s.color };
    if (s.operatorId) {
      let bar = byOp.get(s.operatorId);
      if (!bar) { bar = { id: `op:${s.operatorId}`, label: opName(s.operatorId), segments: [] }; byOp.set(s.operatorId, bar); bars.push(bar); }
      bar.segments.push(seg);
    } else {
      const n = Math.max(1, s.stationCount || 1);
      for (let i = 0; i < n; i++) {
        bars.push({ id: n > 1 ? `${s.id}#${i + 1}` : s.id,
          label: (s.name || s.id) + (n > 1 ? ` #${i + 1}` : ''), segments: [seg] });
      }
    }
  }
  const status = (total) => {
    if (!taktSec || taktSec === Infinity) return 'normal';
    if (total > taktSec) return 'darbogaz';
    if (total >= taktSec * 0.8) return 'risk';
    return 'normal';
  };
  return bars.map(b => {
    const total = b.segments.reduce((a, x) => a + x.sec, 0);
    return { ...b, total, status: status(total) };
  });
}
```

- [ ] **Step 4: PASS** — `npx vitest run components/vsim/engine/yamazumiBars.test.js`

- [ ] **Step 5: Commit**
```bash
git add components/vsim/engine/yamazumiBars.js components/vsim/engine/yamazumiBars.test.js
git commit -m "feat(vsim): yamazumiBars — standart operator/istasyon basina is-icerigi cubuklari"
```

---

### Task 4: Yamazumi grafiğini standart çubuklarla çiz + effectiveCycle'ı yeniden etiketle

**Files:** Modify: `components/vsim/UretimSimulasyon.jsx` (DashboardView Yamazumi bloğu)

- [ ] **Step 1: chartData'yı yamazumiBars'tan üret**

DashboardView'da mevcut `chartData` (perMain/effectiveCycle) yerine:
```jsx
import { yamazumiBars } from './engine/yamazumiBars.js'; // dosya başına
// DashboardView içinde:
const yBars = yamazumiBars(data, calc.taktTimeSec);
const chartData = yBars.map(b => ({ name: b.label, total: Number(b.total.toFixed(1)), status: b.status }));
```
BarChart'ı `dataKey="total"` ile çiz; Cell rengi `status`'a göre (`darbogaz`=#B3402A, `risk`=#B45309, `normal`=#2F9E68). Takt ReferenceLine aynen kalır. Alt yazı: "Standart Yamazumi — her çubuk bir operatör/istasyon; iş elemanları yığılı; Takt çizgisiyle kıyas."

Segment yığını (opsiyonel v1): tek `total` bar yeter; segment-stack (her eleman ayrı renk) v1.1'e bırakılabilir — ama en az `total` doğru olmalı.

- [ ] **Step 2: effectiveCycle'ı Yamazumi'den ayır, "Kapasite Temposu" yap**

Kapasite Tablosu'na (perMain tablosu) yeni kolon **"Kapasite Temposu (sn)"** = `p.effectiveCycle.toFixed(1)`, InfoTip: "sürecin sürdürebildiği birim tempo (kapasiteden); Yamazumi iş-içeriği DEĞİL". Yamazumi başlığındaki "efektif çevrim" ifadelerini kaldır.

- [ ] **Step 3: Parse-check + tam test**

Run: `npx esbuild components/vsim/UretimSimulasyon.jsx --loader:.jsx=jsx --bundle --external:react --external:recharts --external:lucide-react --external:./* --external:../* --format=esm --outfile=/dev/null && npx vitest run`
Expected: esbuild temiz; vitest tümü PASS.

- [ ] **Step 4: Kullanıcı görsel doğrular** (Yamazumi artık operatör/istasyon çubukları; usta 15 & acami 30 ayrı; Takt çizgisi).

- [ ] **Step 5: Commit**
```bash
git add components/vsim/UretimSimulasyon.jsx
git commit -m "feat(vsim): standart Yamazumi (operator/istasyon cubuklari); effectiveCycle -> Kapasite Temposu kolonu"
```

---

### Task 5: n8n "Akış (n8n)" tab'ını kaldır

Kullanıcı kararı: geliştirme ana akışta devam. n8n tab'ı kaldırılır (motor/dosyalar git'te kalır, sadece sekme kapatılır).

**Files:** Modify: `components/vsim/UretimSimulasyon.jsx`

- [ ] **Step 1: Tab butonunu ve içerik bloğunu kaldır**

`grep -n "flow\|FlowN8nView\|Akış (n8n)\|flowPath" components/vsim/UretimSimulasyon.jsx` ile bul; şunları kaldır:
- `<TabBtn active={tab === 'flow'} ...>Akış (n8n)</TabBtn>`
- `{tab === 'flow' && ( <FlowN8nView ... /> )}` bloğu
- `FlowN8nView` fonksiyonu (varsa) ve `flowPath`/`setFlowPath` state'i (başka yerde kullanılmıyorsa)
- Kullanılmayan importlar (`FlowEditor` vb.) — lint temizliği.
(FlowEditor/NodeInspector/flowNodes/nodeHealth dosyaları silinmez; ileride gerekebilir.)

- [ ] **Step 2: Parse-check + tam test**

Run: `npx esbuild components/vsim/UretimSimulasyon.jsx --loader:.jsx=jsx --bundle --external:react --external:recharts --external:lucide-react --external:@xyflow/react --external:./* --external:../* --format=esm --outfile=/dev/null && npx vitest run`
Expected: temiz + PASS.

- [ ] **Step 3: Commit**
```bash
git add components/vsim/UretimSimulasyon.jsx
git commit -m "chore(vsim): n8n Akis sekmesini kaldir — gelistirme ana akista devam"
```

---

## Self-Review
- **Spec/denetim coverage:** A (Task 1) · B (Task 3-4) · C (Task 2) · D (Task 5). Denetimin #14/#8 bug'ları ve Yamazumi standart-uyumu karşılanır. effectiveCycle korunur ama "Kapasite Temposu" olarak ayrılır (denetim önerisi #4).
- **Placeholder:** Yok — test/impl kodları tam; UI adımları net referanslı.
- **Tip tutarlılığı:** `yamazumiBars(data, taktSec)` (Task 3) → DashboardView (Task 4). `stationCount` ölçekleme perMain + tile tutarlı.
- **Kapsam dışı:** SPLIT doyma UI-caveat (denetim #5), takt DRY (#6), Yamazumi segment-stack renkleri (v1.1).
