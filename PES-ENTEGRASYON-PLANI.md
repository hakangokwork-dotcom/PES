# PES Entegrasyon Planı — Atölye 360 + Benchmark v2

**Versiyon:** v0.1
**Referans:** ATOLYE-BENCHMARK-SISTEMI.md (v0.2) × PES repo (github.com/hakangokwork-dotcom/PES, migration 001–019b durumu)
**İlke:** Yeniden yazma yok. Mevcut tablolar genişletilir, boşluklar yeni migration'larla doldurulur. Tenancy mimarisi (019a/b) korunur.

---

## 1. Boşluk Analizi Özeti

| Katman | PES durumu | Yapılacak |
|---|---|---|
| K1 Atölye 360 | `workshop` çekirdek var | Uzatma tabloları: account, iletişim, müşteri paylaşımı, etkileşim günlüğü |
| K1 Yetenek | `line_capability` binary (var/yok) | Seviye (0–3) + onay + körelme alanları |
| K1 Gider | `monthly_expense` 12 kalem | 30 kaleme genişletme + staging |
| K2 Güven skoru | **yok** | `declaration_quality` + validasyon fonksiyonları |
| K3 Normalizasyon | `dk_maliyet` bölge bazlı sabit | Atölye bazlı hesap + çift defter (brüt/net) |
| K4 Peer benchmark | `pes_benchmark` mutlak eşik | `benchmark_peer_snapshot` percentile katmanı (mutlak eşikler korunur, yanına eklenir) |
| K5 ASE | `supplier_score` 5 boyut | Percentile bazlı hesap + `data_confidence` çarpanı |

---

## 2. Migration Planı (020–025)

### 020_workshop_account.sql — Atölye 360 Halka 1+3
`workshop` tablosu şişirilmez; 1:1 uzatma + çocuk tablolar:

```sql
CREATE TABLE workshop_account (
  workshop_id       INTEGER PRIMARY KEY REFERENCES workshop(id) ON DELETE CASCADE,
  tenant_id         UUID REFERENCES tenant(id),
  legal_name        TEXT,           -- tam ünvan
  tax_no            VARCHAR(20),
  founded_date      DATE,
  relationship_start DATE,          -- firmayla çalışma başlangıcı → ilişki yaşı
  production_area_m2 INTEGER,
  building_ownership TEXT CHECK (building_ownership IN ('kira','mulk')),
  incentive_zone    SMALLINT CHECK (incentive_zone BETWEEN 1 AND 6),  -- workshop.bolge ile senkron
  address_full      TEXT,
  notes             TEXT,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE workshop_contact (
  id SERIAL PRIMARY KEY, workshop_id INTEGER REFERENCES workshop(id) ON DELETE CASCADE,
  tenant_id UUID, name TEXT, role TEXT, phone TEXT, email TEXT, is_primary BOOLEAN DEFAULT false
);

CREATE TABLE workshop_customer_share (   -- diğer müşteriler / bize ayrılan kapasite
  id SERIAL PRIMARY KEY, workshop_id INTEGER REFERENCES workshop(id) ON DELETE CASCADE,
  tenant_id UUID, customer_label TEXT, share_pct NUMERIC(5,2),
  valid_from DATE DEFAULT CURRENT_DATE, valid_to DATE     -- SCD-2
);

CREATE TABLE workshop_interaction (      -- etkileşim günlüğü (CRM activity log)
  id SERIAL PRIMARY KEY, workshop_id INTEGER REFERENCES workshop(id) ON DELETE CASCADE,
  tenant_id UUID, kind TEXT CHECK (kind IN ('ziyaret','denetim','olay','dmaic','fiyat_revizyonu','not')),
  occurred_at DATE, summary TEXT, detail JSONB, created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);
```
UI: `app/pes/workshops/[id]` detay sayfası sekmelere ayrılır: Kimlik · Yetkinlik · İlişki · Zaman Çizgisi. Mevcut sayfa Kimlik sekmesinin çekirdeği olur.

### 021_expense_v2.sql — Gider beyanı genişletme + staging
- `monthly_expense`e ek kolonlar: `rent, building_depr, machine_depr, insurance, overtime, bonus, severance_reserve, incentive_amount, isg, consulting, official_fees, communication, stationery, needle, consumables` (formdaki 30 kalemin tam karşılığı).
- `expense_declaration_staging`: ham form satırı `raw JSONB` olarak dokunulmadan saklanır (izlenebilirlik ilkesi); kaynak (`forms_xlsx`,`manual`,`api`), dönem, workshop eşleme durumu.
- Kanonik 8 grup (G1–G8) tablo değil **view/fonksiyon** olarak tanımlanır: `v_expense_groups` — ham kalemler değişse de rasyo katmanı sabit kalır.
- Import: `app/pes/workshops/import` parser deseni `app/pes/expenses/import`a kopyalanır; Forms xlsx kolon sözlüğü `lib/pes/expense-mapping.ts`te tutulur.

### 022_declaration_quality.sql — Güven skoru (en kritik yenilik)
```sql
CREATE TABLE declaration_quality (
  id SERIAL PRIMARY KEY,
  staging_id INTEGER REFERENCES expense_declaration_staging(id),
  workshop_id INTEGER, tenant_id UUID, donem VARCHAR(20),
  completeness_sc NUMERIC(5,1), consistency_sc NUMERIC(5,1),
  plausibility_sc NUMERIC(5,1), crosscheck_sc NUMERIC(5,1),
  total_sc NUMERIC(5,1),                    -- 0–100
  flags JSONB,                               -- [{field, rule, severity, suggested_fix}]
  status TEXT CHECK (status IN ('accepted','winsorized','rejected','pending_fix'))
);
```
Validasyon kuralları Postgres fonksiyonu + `lib/pes/validation-rules.ts` (Zod zaten bağımlılıkta — bant tanımları Zod şeması olarak yazılır, hem client hem server aynı kuralı kullanır). Kural parametreleri (kişi başı maaş bandı vb.) `pes_benchmark` benzeri bir `validation_param` tablosunda dönemsel tutulur; asgari ücret değişince tek satır güncellenir.
Çapraz kontrol kancaları PES'te hazır: bant sayısı × operatör normu ↔ `workshop.sewing_staff`; `work_order` sevkiyatı ↔ beyan edilen kapasite; `dk_maliyet` bölge değeri ↔ hesaplanan atölye değeri.

### 023_capability_proficiency.sql — Yetenek matrisi v2
`line_capability` korunur, üç kolon eklenir:
```sql
ALTER TABLE line_capability
  ADD COLUMN proficiency SMALLINT DEFAULT 1 CHECK (proficiency BETWEEN 0 AND 3),
  ADD COLUMN approved_by UUID, ADD COLUMN approved_at DATE,
  ADD COLUMN last_production_at DATE;
```
- Atölye seviyesi yetkinlik = bantlarının max'ı: `v_workshop_capability` view.
- Körelme: aylık job — `last_production_at` 18 aydan eskiyse proficiency bir düşür (min 1), `workshop_interaction`a otomatik not.
- `work_order` kapanışında ilgili bant×klasman hücresinin `last_production_at`i güncellenir (trigger) — matris kendini besler, manuel bakım gerektirmez.

### 024_peer_benchmark.sql — Percentile katmanı
`pes_benchmark` (mutlak hedefler) SİLİNMEZ — yönetim hedefi olarak kalır. Yanına göreli katman:
```sql
CREATE TABLE benchmark_peer_snapshot (
  id SERIAL PRIMARY KEY, donem VARCHAR(20), metric_key VARCHAR(50),
  peer_level SMALLINT CHECK (peer_level BETWEEN 1 AND 4),   -- S1 tüm ağ … S4 bölge×klasman×ölçek
  peer_key TEXT,                                             -- örn. 'dogu|dokuma_alt|100-200'
  n INTEGER, p25 NUMERIC, median NUMERIC, p75 NUMERIC,
  computed_at TIMESTAMPTZ DEFAULT now(), UNIQUE(donem, metric_key, peer_level, peer_key)
);
```
- Hesap: dönem kapanışında Edge Function / cron; yalnız `declaration_quality.status='accepted'` (winsorized kırpılmış değerle) girer.
- Peer anahtarı `v_workshop_capability`den (proficiency ≥ 2 klasmanlar) türetilir — beyan yerine kanıtlanmış yetkinlik.
- Fallback: n < 5 ise bir üst seviyeye çık; snapshot'ta hangi seviyede kaldığı yazar, UI şeffaf gösterir.
- `app/pes/benchmark` sayfası: mevcut mutlak hedef görünümüne "peer konumu" kolonu (değer · medyan · percentile · n) eklenir.

### 025_supplier_score_v2.sql — ASE
`supplier_score` yapısı ve tier isimleri (Stratejik…Kritik) korunur; hesap mantığı değişir:
```sql
ALTER TABLE supplier_score
  ADD COLUMN data_confidence NUMERIC(5,1),    -- declaration_quality.total_sc
  ADD COLUMN raw_composite NUMERIC(5,1);      -- çarpan öncesi
-- composite_sc = raw_composite × LEAST(1, data_confidence/70)
```
- `cost_sc` ve `efficiency_sc` artık peer percentile'dan (024 snapshot); `quality_sc`, `delivery_sc` mevcut objektif kayıtlardan (değişmez); `compliance_sc`ye kayıtlılık oranı (SGK/maaş) girer.
- `app/pes/scoring` sayfasına güven rozeti + "veri kalitesi sınırlı" durumu eklenir.

---

## 3. Tenancy ile Kesişim (kritik tasarım kararı)

Benchmark havuzu **tenant'lar arası** veridir; v3 multi-tenant modelde bu dikkatle kurulmalı:
- Ham peer verisi hiçbir tenant'a sızmaz. `benchmark_peer_snapshot` yalnız **anonim agregat** (n, medyan, çeyrekler) taşır ve n ≥ 5 kuralı k-anonimlik görevi görür (n<5 hücre servis edilmez, üst seviyeye düşer).
- Snapshot hesabı `internal` tenant yetkisiyle çalışır (019a'daki `is_internal_admin` helper hazır).
- Parent tenant (ana üretici) kendi fasonlarının ham verisini görür + ağ geneli anonim peer'i görür. Bireysel tenant yalnız kendi verisi + anonim peer.
- **Ticari açı:** peer benchmark, MODULE_CATALOG'a yeni modül olarak girer (`code: 'BENCH'`) — ana üretici segmentinin (Segment 2) en güçlü satın alma gerekçesi: "100 fasonumun tamamını tek endekste, güvenilirlik süzgeciyle görüyorum". Bireysel atölyeye de satılır: "sektörde neredeyim?"

## 4. Eder Sistemi ile Bağlantı

- `dk_maliyet` bugün bölge×dönem sabiti. v2: atölye bazlı dakika maliyeti `monthly_expense` + çalışan×gün×saat üzerinden hesaplanır (`v_workshop_dk_maliyet`); bölge değeri, beyanı olmayan atölyeler için fallback olur. Aynı view güven skoru çapraz kontrolünde de kullanılır (hesaplanan ↔ bölge normu sapması).
- `eder_atolye_teklif` + hesaplanan eder → fiyat koridoru: teklif/eder oranı marj konumunu verir, F1 koridoruna (%8–18) bağlanır. Aşırı sapma `workshop_interaction`a "fiyat_revizyonu" önerisi düşer.

## 5. Uygulama Sırası (önerilen sprint akışı)

1. **Sprint 1:** 020 + 021 (account + gider genişletme + staging + import ekranı). Mevcut 26 formluk xlsx ilk gerçek veri seti olarak yüklenir.
2. **Sprint 2:** 022 güven skoru + validasyon kuralları; 26 kaydın skorlanması → ilk "kullanılabilir veri" raporu.
3. **Sprint 3:** 023 yetkinlik seviyeleri + körelme trigger'ı; 024 peer snapshot + benchmark UI.
4. **Sprint 4:** 025 ASE v2 + scoring UI güncellemesi; BENCH modülünün katalog/fiyat tanımı.

Her sprint sonunda sistem çalışır durumda kalır (019a'daki "güvenli aşama" migration disiplini aynen sürdürülür).
