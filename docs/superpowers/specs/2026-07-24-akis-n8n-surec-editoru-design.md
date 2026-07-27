# Akış (n8n) — Akış-Temelli Süreç Editörü + Süreç Sağlığı

**Tarih:** 2026-07-24
**Durum:** Tasarım (onaylandı, spec incelemesi bekliyor)
**Modül:** VSIM / ProVSM (`components/vsim/`)

## Problem

VSM'de bir sürecin (ana op) alt-süreçleri iki farklı şekilde bir araya gelebilir ve
matematikleri **zıt**:

- **usta + acami** — *aynı* işi farklı hızda paralel yapan işçiler → kapasite **TOPLANIR**,
  çevrim **harmonik**.
- **yaka + kol** — *farklı* ardışık işler (ayrı istasyon) → kapasite **darboğaz (min)**.

Bağlantısız iki alt-op ikisi de olabilir; grafik yapısı ayırt edemez. Denenen çözümler
(alt-op başına "Paralel/Yedek" checkbox; sonra süreç düzeyi tek anahtar) ya belirsiz ya da
çok kaba kaldı (süreç anahtarı, karışık süreçte her alt-op'u paralel sayar).

**Kök çözüm:** Paralellik/dağıtım/birleşme bir **bayrakla değil, akışın kendisiyle** ifade
edilsin — n8n gibi. Girdi bir süreçte alt-op'lara **dağıtılır**, alt-op'lar bir **çıktıda**
birleşir; dağıtım (böl/kopyala) ve birleşme (senkron/topla) **çizimle** belirlenir.

## Amaç

1. Süreç içi akışı görsel node-graf olarak kur: **INPUT → alt-op'lar → OUTPUT(lar)**.
2. Paralel/seri ayrımını **çizimle** yap; "Paralel/Yedek" ve süreç anahtarını **kaldır**.
3. Bir süreci seçince **süreç sağlığı**nı göster: kaç ad/v geliyor → süreç → kaç ad/v çıkıyor.
4. Mevcut motoru (computeCapacity, simulation) **yeniden kullan** — büyük yeniden yazım yok.

## Kapsam ve aşamalar

Mevcut Akış / ProcessMapStudio canvas'ına **dokunulmaz**; yeni görünüm **yanına** eklenir
(az riskli, aşamalı; oturumda büyük yeniden yazımın riski görüldü).

- **Faz 1a — Model + Motor (görselsiz):** subOp'a `kind` alanı; otomatik input/output;
  motor passthrough; testler. Mevcut canvas'ta bile doğrulanabilir.
- **Faz 1b — React Flow "Akış (n8n)" sekmesi:** node'lar (input/op/output), giriş-çıkış
  handle'ları, sürükle-bağla, otomatik I/O, otomatik yerleşim.
- **Faz 1c — Süreç sağlığı inspector'ı:** node seçince INPUT/OUTPUT ad/v paneli.
- **Faz 2 (sonra):** eski Akış canvas'ını emekliye ayır.

Bu spec **Faz 1**'i kapsar. Faz 2 ayrı ele alınır.

## Veri modeli

Yeni node türü, mevcut `subOps` dizisinde bir alan olarak:

- `kind?: 'input' | 'output' | 'op'` — varsayılan `'op'` (mevcut tüm alt-op'lar op).
- `input` / `output` node'ları: `cycleTime = 0`, **geçirgen** (kapasite üretmez, akışı taşır).
- Bir süreç (konteyner) ilk kez "Akış (n8n)" görünümünde açıldığında:
  - **1 input node** garanti edilir (yoksa oluşturulur).
  - En az **1 output node** garanti edilir; kullanıcı ek output ekleyebilir.
- Bağlantı: mevcut **`nextIds`** kullanılır. Dağıtım **`splitType`** (çıkışta: `DUP`=kopyala
  varsayılan, `SPLIT`=böl/dağıt), birleşme **`joinType`** (girişte: `AND`=senkron,
  `DUP`=topla) — hepsi zaten var.
- **Süreçler-arası:** bir sürecin **output** node'u, aşağı sürecin girişine bağlanır
  (mevcut ana-op `nextIds` + grup köprüsü mantığı). Çoklu output → her biri ayrı bir çıkış
  akışı; farklı aşağı-süreçlere bağlanabilir (ör. sağlam → paketleme, fire → tamir).

**Not — varsayılan dağıtım (önemli):** Motorun global `splitType` fallback'i geriye-uyum için
`DUP` (kopyala). Ama n8n-UX'te varsayılan **"böl"** olmalı. Çözüm: **FlowEditor**, input
node'unu (ve input'tan çıkan bağlantıları) açıkça `splitType: 'SPLIT'` ile kurar. Böylece yeni
görünümde varsayılan "böl/dağıt", eski veriler ise `DUP` fallback'iyle bozulmadan kalır.
İstenirse node "kopyala"ya (`DUP`) çevrilir → her parça tüm dallara (ardışık/senkron).

## Motor (computeCapacity + simulation)

- `input`/`output` (kind) node'ları **passthrough**: kapasite = ∞ gibi davranır, gelen hızı
  olduğu gibi geçirir; darboğaz/kapasite yalnız `op` node'larından gelir. (`leafCap`
  `kind !== 'op'` için passthrough döner; sink/pool birleşiminde nötr.)
- Dağıtım/birleşme zaten `splitType`/`joinType` ile hesaplanıyor → **bayrak gereksiz**.
  - usta+acami: input **böl** → iki op → output **topla** ⇒ kapasite = usta+acami (harmonik
    çevrim), bayraksız.
  - yaka+kol: input **kopyala** → iki op → output **senkron** ⇒ kapasite = min, bayraksız.
- **Yamazumi efektif çevrim (önemli):** Yeni modelde yaprakları toplamak yanlış olur
  (input 0 + usta 15 + acami 30 + output 0 = 45, harmonik değil). Bunun yerine efektif çevrim
  **kapasiteden türetilir**: `effCycleSec = (netMin · eff · 60) / (cap · (1 + pfd))`. Bu formül
  **paralel** için harmonik (usta+acami → 10 sn), **seri/pipelined** için darboğaz CT'sini
  verir — akıştan **tek biçimli**, özel-durum/pooling gerekmez. `effectiveCycleOf` bu şekilde
  yeniden tanımlanır (redundant-havuz kodu emekliye ayrılır). Tek-op süreçte formül aynı CT'yi
  geri verir (geriye-uyum).
- **`parallelSubs` / `redundant`**: motorda **geriye-uyum için okunmaya devam eder** (eski
  kayıtlar bozulmasın) ama **yeni UI'da yer almaz** ve önerilmez; efektif çevrim artık
  kapasiteden türediği için havuz-bayrağına ihtiyaç kalmaz.
- Simülasyon: mevcut `advanceSimStep` bağlantısız kardeşleri zaten yük-paylaşımıyla işliyor;
  input/output passthrough node'ları grup köprüleriyle uyumlu kalır (kind kontrolü eklenir).

## Süreç sağlığı inspector'ı

Node seçilince yan/alt panel (n8n düzeni):

- **INPUT** — bu node'a üst akıştan gelen hız (ad/v) ve besleyen node(lar).
- **Node** — ad, çevrim, istasyon, kapasite.
- **OUTPUT** — bu node'dan çıkan hız (ad/v) ve gittiği node(lar).
- **Sağlık rozeti:** çıkış < talep → darboğaz; giriş > kapasite → önünde birikme (boğulma);
  giriş < kapasite → aç (starved). `calc.thru`, `calc.cap` ile hesaplanır.

## Bileşenler (izolasyon)

- `components/vsim/engine/flow.js` — `kind` yardımcıları (`isFlowNode`, input/output bulma).
- `components/vsim/engine/capacity.js` — passthrough mantığı (küçük ekleme).
- `components/vsim/components/FlowEditor.jsx` (yeni) — React Flow canvas, node/edge tipleri,
  otomatik I/O, otomatik yerleşim. Salt bu dosyada React Flow'a bağımlılık.
- `components/vsim/components/NodeInspector.jsx` (yeni) — sağlık paneli.
- `components/vsim/UretimSimulasyon.jsx` — yeni "Akış (n8n)" sekmesi (küçük ekleme).
- Bağımlılık: `@xyflow/react` (MIT).

## Test

- Motor (vitest, `capacity.test.js`):
  - input **böl** → 2 op → output **topla** ⇒ kapasite toplam, çevrim harmonik (usta+acami).
  - input **kopyala** → 2 op → output **senkron** ⇒ kapasite min (yaka+kol).
  - passthrough input/output kapasiteyi bozmaz; tek-op süreç değişmez.
- **Kapasite (`cap`, `lineCapacity`) testleri değişmez** — kapasite mantığı aynı.
- **Efektif çevrim testleri güncellenir:** `effectiveCycleOf` artık kapasiteden türediği için
  eski "Σ-yaprak-toplamı" bekleyen testler kapasite-tutarlı değere geçer (pipelined süreçte
  darboğaz CT'si; tek-op'ta aynı CT). Bu bilinçli, daha tutarlı bir değişim; ilgili birkaç
  golden-master beklentisi yeni formülle güncellenir. `redundant`/`parallelSubs` özel-durum
  testleri kaldırılır (artık akışla ifade ediliyor).
- UI: FlowEditor render + otomatik I/O oluşumu; inspector doğru ad/v.

## Riskler / açık noktalar

- **React Flow ↔ mevcut x/y**: node konumları `subOps`'ta x/y ile tutulur; React Flow ile
  senkron (Faz 1b'de netleşir).
- **Çoklu output kapasitesi**: her output node'u ayrı sink → kapasite per-output izlenir;
  sürecin tek "kapasite" sayısı = darboğaz output (Faz 1b detay).
- **Geriye-uyum**: eski canvas ve eski veriler (kind'siz) çalışmaya devam eder.

## Kapsam dışı (YAGNI)

- Eski canvas'ın kaldırılması (Faz 2).
- Node içi zengin parametreler (n8n "Parameters" derinliği) — sadece VSM alanları.
- Gerçek-zaman yürütme animasyonu (sim zaten ayrı sekmede).
