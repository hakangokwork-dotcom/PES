# Akış (n8n) — Faz 1a: Model + Motor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Motorun (computeCapacity) akış-temelli süreç modelini desteklemesi — input/output geçirgen node'ları + dağıtım/birleşme bağlantıyla, "Paralel/Yedek" bayrağı olmadan; efektif çevrim kapasiteden türetilir.

**Architecture:** subOp'a `kind: 'input'|'output'|'op'` eklenir. input/output node'ları geçirgen (kapasite ∞). Dağıtım mevcut `splitType`, birleşme mevcut `joinType` ile. Yamazumi efektif çevrim `(netMin·eff·60)/(cap·(1+pfd))` formülüyle kapasiteden türetilir → paralelde harmonik, seride darboğaz. Görsel (React Flow) YOK — bu faz sadece motor + testler; veri elle kurulup vitest ile doğrulanır.

**Tech Stack:** Vanilla JS (ES modules), Vitest. Dosyalar: `components/vsim/engine/capacity.js`, `flow.js`, `capacity.test.js`.

**Referans spec:** `docs/superpowers/specs/2026-07-24-akis-n8n-surec-editoru-design.md`

---

## Dosya yapısı

- `components/vsim/engine/flow.js` — Modify: `isPassthrough(node)` yardımcısı eklenir.
- `components/vsim/engine/capacity.js` — Modify: leafCap geçirgen; effectiveCycleOf kapasiteden; bottleneck geçirgeni atlar; redundant-havuz effectiveCycle kodu kaldırılır.
- `components/vsim/engine/capacity.test.js` — Modify: parallelSubs/redundant test bloğu → akış-temelli (kind + split/join) testlerle değişir.

---

### Task 1: Temiz tabana dön (commit'siz parallelSubs deneyini geri al)

Bu oturumda `capacity.js`, `capacity.test.js`, `UretimSimulasyon.jsx`'e commit'siz `parallelSubs` değişiklikleri yapıldı. Yeni model bunları emekliye ayırıyor. Temiz commit'li tabandan (6dc7df5) başla.

**Files:**
- Modify: `components/vsim/engine/capacity.js`, `capacity.test.js`, `components/vsim/UretimSimulasyon.jsx`

- [ ] **Step 1: Commit'siz değişiklikleri geri al**

Run:
```bash
git checkout -- components/vsim/engine/capacity.js components/vsim/engine/capacity.test.js components/vsim/UretimSimulasyon.jsx
```

- [ ] **Step 2: Testlerin temiz tabanda yeşil olduğunu doğrula**

Run: `npx vitest run components/vsim/engine/capacity.test.js`
Expected: PASS (6dc7df5 hali — 19 test)

- [ ] **Step 3: Commit gerektirmez** (yalnızca çalışma ağacını temizler)

---

### Task 2: `isPassthrough` yardımcısı (flow.js)

**Files:**
- Modify: `components/vsim/engine/flow.js`
- Test: `components/vsim/engine/flow.test.js`

- [ ] **Step 1: Failing test yaz**

`flow.test.js` içine ekle:
```js
import { isPassthrough } from './flow.js';

describe('isPassthrough', () => {
  it('input/output kind geçirgendir, op ve tanımsız değildir', () => {
    expect(isPassthrough({ kind: 'input' })).toBe(true);
    expect(isPassthrough({ kind: 'output' })).toBe(true);
    expect(isPassthrough({ kind: 'op' })).toBe(false);
    expect(isPassthrough({})).toBe(false);
    expect(isPassthrough(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Test'in başarısız olduğunu doğrula**

Run: `npx vitest run components/vsim/engine/flow.test.js -t isPassthrough`
Expected: FAIL — "isPassthrough is not exported / not a function"

- [ ] **Step 3: Minimal implementasyon**

`flow.js` sonuna ekle:
```js
// Akış node türü: input/output geçirgen (kapasite üretmez, akışı taşır); op gerçek istasyon.
export const isPassthrough = (node) => node?.kind === 'input' || node?.kind === 'output';
```

- [ ] **Step 4: Test'in geçtiğini doğrula**

Run: `npx vitest run components/vsim/engine/flow.test.js -t isPassthrough`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/vsim/engine/flow.js components/vsim/engine/flow.test.js
git commit -m "feat(vsim): isPassthrough — akış input/output node yardimcisi"
```

---

### Task 3: Geçirgen node kapasitesi + kapasiteden efektif çevrim (capacity.js)

Bu görev tek bir bütün: input **böl** (SPLIT) → op'lar → output **topla** (DUP) senaryosunun kapasitesini bayraksız doğru hesaplar; efektif çevrimi kapasiteden türetir.

**Files:**
- Modify: `components/vsim/engine/capacity.js`
- Test: `components/vsim/engine/capacity.test.js`

- [ ] **Step 1: Failing testleri yaz** (mevcut `describe('computeCapacity — yedek-paralel ...')` bloğunun YERİNE)

```js
describe('computeCapacity — akış modeli (input/output node, bayraksız)', () => {
  // Op1(5) → Op2{ input → usta(15), acami(30) → output }. net 480·eff 0.85·pfd 0.10·demand 100.
  //   usta cap = 408/((15/60)·1.1) = 1483.6 · acami = 741.8
  const build = (splitType, joinType) => ({
    mainOps: [
      { id: 'op1', name: 'Op1', color: '#000', order: 0, nextIds: ['op2'], x: 0, y: 0 },
      { id: 'op2', name: 'Op2', color: '#000', order: 1, nextIds: [], x: 100, y: 0 },
    ],
    subOps: [
      { id: 'src', mainOpId: 'op1', cycleTime: 5, nextIds: [] },
      { id: 'in',  mainOpId: 'op2', kind: 'input',  cycleTime: 0, nextIds: ['usta', 'acami'], splitType },
      { id: 'usta',  mainOpId: 'op2', kind: 'op', cycleTime: 15, nextIds: ['out'] },
      { id: 'acami', mainOpId: 'op2', kind: 'op', cycleTime: 30, nextIds: ['out'] },
      { id: 'out', mainOpId: 'op2', kind: 'output', cycleTime: 0, nextIds: [], joinType },
    ],
    machines: [], operators: [],
    settings: { netMinutes: 480, efficiency: 0.85, pfd: 0.10, demand: 100 },
    scenarios: [], meta: {},
  });

  it('BÖL girdi + TOPLA çıktı = paralel/yedek: kapasite toplam, çevrim harmonik', () => {
    const c = computeCapacity(build('SPLIT', 'DUP'));
    expect(c.cap['op2']).toBeCloseTo(2225.45, 1);        // usta + acami
    expect(c.lineCapacity).toBeCloseTo(2225.45, 1);
    const p2 = c.perMain.find(p => p.mainOp.id === 'op2');
    expect(p2.effectiveCycle).toBeCloseTo(10, 4);        // 1/(1/15+1/30) — kapasiteden türer
  });

  it('KOPYALA girdi + SENKRON çıktı = ardışık: kapasite min, çevrim darboğaz', () => {
    const c = computeCapacity(build('DUP', 'AND'));
    expect(c.cap['op2']).toBeCloseTo(741.82, 1);         // min(usta, acami)
    const p2 = c.perMain.find(p => p.mainOp.id === 'op2');
    expect(p2.effectiveCycle).toBeCloseTo(30, 4);        // darboğaz (acami 30) — kapasiteden türer
  });

  it('geçirgen input/output kapasiteyi sınırlamaz (∞)', () => {
    const c = computeCapacity(build('SPLIT', 'DUP'));
    expect(c.cap['in']).toBe(Infinity);
    expect(c.cap['out']).toBe(Infinity);
  });

  it('bottleneck geçirgen node değil, gerçek op olur', () => {
    const c = computeCapacity(build('SPLIT', 'DUP'));
    expect(c.bottleneckByContainer['op2']).toBe('acami'); // en yavaş op (in/out değil)
  });

  it('tek op süreç değişmez: efektif çevrim = CT', () => {
    const single = build('SPLIT', 'DUP');
    single.subOps = [
      { id: 'src', mainOpId: 'op1', cycleTime: 5, nextIds: [] },
      { id: 'solo', mainOpId: 'op2', kind: 'op', cycleTime: 30, nextIds: [] },
    ];
    const c = computeCapacity(single);
    const p2 = c.perMain.find(p => p.mainOp.id === 'op2');
    expect(p2.effectiveCycle).toBeCloseTo(30, 4);
    expect(c.cap['op2']).toBeCloseTo(741.82, 1);
  });
});
```

- [ ] **Step 2: Test'lerin başarısız olduğunu doğrula**

Run: `npx vitest run components/vsim/engine/capacity.test.js -t "akış modeli"`
Expected: FAIL — cap['in'] Infinity değil (0), effectiveCycle yanlış (toplam-tabanlı)

- [ ] **Step 3: capacity.js — geçirgen kapasite**

`import` satırına `isPassthrough` ekle:
```js
import { ROOT_ID, childNodes, subParent, isPassthrough } from './flow.js';
```

`leafCap`'i değiştir:
```js
  const leafCap = (node) => {
    if (isPassthrough(node)) return Infinity;     // input/output: geçirgen, sınırlamaz
    const cyc = node.cycleTime || 0;
    if (cyc <= 0) return 0;
    const smv = (cyc / 60) * (1 + pfd);
    const stations = node.stationCount || 1;
    return smv > 0 ? (netMin * eff * stations) / smv : 0;
  };
```

- [ ] **Step 4: capacity.js — efektif çevrim kapasiteden; eski havuz kodunu kaldır**

Eski effectiveCycle bloğunu (leafKids/seqCyc/poolR) SİL:
```js
    // (SİLİNECEK)
    // {
    //   const leafKids = kids.filter(...);
    //   const seqCyc = ...; const poolR = ...;
    //   effectiveCycleOf[cid] = seqCyc + (poolR > 0 ? 1 / poolR : 0);
    // }
```

`return containerThru;`'dan HEMEN ÖNCE ekle (containerThru hesaplandıktan sonra):
```js
    // Yamazumi efektif çevrim = sürecin sürdürebildiği tempo (kapasiteden türer):
    // paralel için harmonik, seri/pipelined için darboğaz CT'si. Özel-durum/pooling gerekmez.
    effectiveCycleOf[cid] = containerThru > 0 ? (netMin * eff * 60) / (containerThru * (1 + pfd)) : 0;
```

Ayrıca sink birleşimindeki `redundant` havuzunu sadeleştir (geriye-uyum için `redundant` desteği kalır ama yeni model gerektirmez — mevcut haliyle bırak, DEĞİŞTİRME).

- [ ] **Step 5: capacity.js — bottleneck geçirgeni atlar**

Bottleneck döngüsünü değiştir:
```js
    let bn = null, bnv = Infinity;
    kids.forEach(k => {
      if (isPassthrough(k)) return;               // input/output darboğaz olamaz
      const v = t[k.id] ?? 0;
      if (v < bnv) { bnv = v; bn = k.id; }
    });
    bottleneckByContainer[cid] = bn;
```

- [ ] **Step 6: Test'lerin geçtiğini doğrula**

Run: `npx vitest run components/vsim/engine/capacity.test.js -t "akış modeli"`
Expected: PASS (5 test)

- [ ] **Step 7: Commit**

```bash
git add components/vsim/engine/capacity.js components/vsim/engine/capacity.test.js
git commit -m "feat(vsim): akis-temelli kapasite — gecirgen input/output + kapasiteden efektif cevrim"
```

---

### Task 4: Golden-master efektif çevrim beklentilerini yeni formüle güncelle

`effectiveCycleOf` artık kapasiteden türediği için, eski "Σ-yaprak-toplamı" bekleyen testler değişir. Kapasite (`cap`, `lineCapacity`) testleri DEĞİŞMEZ.

**Files:**
- Modify: `components/vsim/engine/capacity.test.js`, `components/vsim/engine/vsm.test.js`

- [ ] **Step 1: Tam test paketini çalıştır, kırılanları gör**

Run: `npx vitest run`
Expected: Yalnız `effectiveCycle`/`totalCycle`-türevi beklentiler kırılır (kapasite testleri geçer). Kırılan her testi listele.

- [ ] **Step 2: Kırılan efektif çevrim beklentilerini kapasite-türevi değere güncelle**

Her kırılan `expect(...effectiveCycle).toBe(X)` için yeni değer = `(netMin·eff·60)/(cap·(1+pfd))`. Örn. Dikim (yaka90+kol30, pipelined, cap≈266, net540·eff0.85·pfd0.15): `effectiveCycle ≈ 90` (eski toplam 120 değil). Testi `toBeCloseTo(90, 1)` yap ve yorumu güncelle.

- [ ] **Step 3: Tam paket yeşil**

Run: `npx vitest run`
Expected: PASS (tümü)

- [ ] **Step 4: Commit**

```bash
git add components/vsim/engine/capacity.test.js components/vsim/engine/vsm.test.js
git commit -m "test(vsim): efektif cevrim beklentilerini kapasite-turevi formule guncelle"
```

---

### Task 5: perMain — geçirgen node'ları istasyon/çevrim sayımından çıkar

`perMain.stations` ve `totalCycle` input/output node'larını saymamalı (yoksa istasyon sayısı ve Σ çevrim şişer).

**Files:**
- Modify: `components/vsim/engine/capacity.js`
- Test: `components/vsim/engine/capacity.test.js`

- [ ] **Step 1: Failing test yaz** (akış modeli describe bloğuna ekle)

```js
  it('perMain geçirgen node'ları saymaz (istasyon = gerçek op sayısı)', () => {
    const c = computeCapacity(build('SPLIT', 'DUP'));
    const p2 = c.perMain.find(p => p.mainOp.id === 'op2');
    expect(p2.stations).toBe(2);          // usta + acami (in/out hariç)
    expect(p2.totalCycle).toBe(45);       // 15 + 30 (in/out cyc 0 zaten katkısız ama sayım net)
  });
```

- [ ] **Step 2: Test'in başarısız olduğunu doğrula**

Run: `npx vitest run components/vsim/engine/capacity.test.js -t "geçirgen node'ları saymaz"`
Expected: FAIL — stations 4 (in+usta+acami+out) döner

- [ ] **Step 3: perMain'i güncelle**

`perMain` içinde `subs`'u gerçek op'larla say:
```js
    const opSubs = subs.filter(s => !isPassthrough(s));
    const totalCycle = opSubs.reduce((a, s) => a + (childNodes(data, s.id).length > 0 ? 0 : (s.cycleTime || 0)), 0);
    const totalCycleMin = totalCycle / 60;
    const smv = totalCycleMin * (1 + pfd);
    const stations = opSubs.length || 1;
    const capacity = cap[mo.id] ?? 0;
    const slowest = opSubs.reduce((max, s) => ((s.cycleTime || 0) > (max?.cycleTime || 0) ? s : max), null);
    const effectiveCycle = effectiveCycleOf[mo.id] ?? totalCycle;
    return { mainOp: mo, subs, totalCycle, totalCycleMin, smv, stations, capacity, slowest, effectiveCycle };
```

- [ ] **Step 4: Test'in geçtiğini doğrula + tam paket**

Run: `npx vitest run`
Expected: PASS (tümü)

- [ ] **Step 5: Commit**

```bash
git add components/vsim/engine/capacity.js components/vsim/engine/capacity.test.js
git commit -m "feat(vsim): perMain gecirgen node'lari istasyon/cevrim sayimindan cikar"
```

---

## Self-Review

- **Spec coverage:** Faz 1a maddeleri (kind alanı, geçirgen motor, kapasiteden efektif çevrim, bayraksız usta/acami & yaka/kol) → Task 2-5 karşılıyor. React Flow canvas (1b) ve inspector (1c) bu planda YOK (ayrı planlar).
- **Placeholder:** Yok — her adımda gerçek kod/komut var.
- **Tip tutarlılığı:** `isPassthrough` (flow.js) Task 2'de tanımlı, Task 3-5'te kullanılır. `kind`/`splitType`/`joinType`/`effectiveCycleOf` tutarlı.
- **Not:** `redundant`/`parallelSubs` sink-havuzu geriye-uyum için capacity.js'te bırakılır (silinmez); yeni model bunları gerektirmez, UI'dan (Faz 1b) çıkarılır.

## Sonraki fazlar (bu plan dışı)
- **Faz 1b:** React Flow "Akış (n8n)" sekmesi + otomatik I/O + bağlama → ayrı plan.
- **Faz 1c:** Süreç sağlığı inspector'ı → ayrı plan.
