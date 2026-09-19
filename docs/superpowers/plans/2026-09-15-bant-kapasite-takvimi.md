# Bant Kapasite Takvimi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/pes/takvim`'i doğru kaynaktan okuyan, kapasiteyi adet üzerinden hesaplayan ve üretim öncesi zinciri gösteren bir planlama ekranına dönüştürmek.

**Architecture:** Hesap kuralları `lib/pes/bant-doluluk.ts` içinde saf fonksiyonlar olarak yaşar; API ve ekran aynı modülden okur. Veri modeli migration 036 ile genişler. Ekran dört seviyeli katlanır gantt (tedarik → atölye → bant → PO) artı bir aylık matris görünümü. Giriş yetkisi ikiye ayrılır: merkez yerleştirir, atölye günlük plan/gerçek ve malzeme girer.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, postgres.js, Vitest, Tailwind (PES jetonları `app/globals.css`).

**Spec:** `docs/superpowers/specs/2026-09-15-bant-kapasite-takvimi-design.md`
**Maket (onaylanmış görsel referans):** https://claude.ai/artifact/VKqcZPWErSSEJVTjRRmKi1
**Dal:** `feat/bant-kapasite-takvimi`

---

## Durum — 2026-09-19

**11/16 görev bitti.** Sıradaki **Task 12** (aylık doluluk matrisi).

| Görev | Durum |
|---|---|
| 1 · Migration 036 | bitti — canlı şemaya uygulandı, doğrulandı |
| 2 · Kapasite ve bant payı | bitti — 16 test |
| 3 · Günlük plan, türetilmiş bitiş | bitti — 8 test |
| 4 · Doluluk, çakışma, aylık toplama | bitti — 7 test |
| 5 · Takvim okuma ucu | bitti |
| 6 · Gün bazlı atölye kapasitesi | bitti |
| 7 · Rezerve oluştur/sil | bitti |
| 8 · Günlük plan + gerçekleşen yazma | bitti |
| 9 · Sayfa iskeleti ve gantt satırları | bitti — gerçek veriyle tarayıcıda doğrulandı |
| 10 · PO satırı — aşama zinciri, malzeme | bitti — tarayıcıda doğrulandı |
| 11 · Beş sekmeli PO paneli | bitti — tarayıcıda doğrulandı |
| 12 · Aylık doluluk matrisi | **SIRADA** |

Son doğrulama: **1045/1045 test (52 dosya)**, `next build` dört yeni ucu
kaydediyor, `verify_public_api` ve `verify_workshop_isolation` temiz.
(Test sayısındaki sıçrama benden değil: 15–19 Eylül arasında başka
oturumlarda Atölye Ekonomi E0 tamamlanıp v1.2.0 kesilmiş.)

Faz C'de plan iki yerde YANLIŞTI, düzeltildi: `workshop_profil`'de kolon
`bolge_ad` (`bolge` değil) ve `line_capability` değere `value_code` ile
bağlanır (`value_id` değil).

Task 8'de mevcut `gunlukKaydet` ile çakışma çıktı: `adet=null` satırı
siliyordu, bu artık atölyenin yazdığı `plan_adet`'i de götürürdü. Ayrıca
`asamaToplamiTazele`'deki `COUNT(g.id)` plan-only satırları giriş sayıp
aşamayı sıfırlıyordu. İkisi de düzeltildi, altı test eklendi.

Task 1 uygulanırken plana göre iki ek yapıldı, ikisi de işlendi:
`scripts/verify_public_api.mjs`'e yeni tablolar eklendi, ve
`lib/pes/gunluk-uretim-izolasyon.test.ts` yazıldı — 033 boşluğunun
kapandığını kanıtlıyor (mevcut izolasyon betiği o tabloyu göremiyor,
çünkü yalnız `workshop_id` kolonu OLAN tabloları tarıyor).

---

## Mevcut kodda ne var — yeniden yazma

Bu plan üç yerde **mevcut modülü genişletir**, yenisini açmaz:

| Modül | Ne yapıyor | Bu planda |
|---|---|---|
| `lib/pes/yerlestirme.ts` | `bantPaylari(adet, bantlar)` bantlara `gunlukHedef` oranında paylaştırır; `gunEkle(tarih, gun)` tarih aritmetiği | Yeniden yazma — `gunEkle`'yi import et, `bantPaylari`'nın oranlama mantığını örnek al |
| `lib/pes/gunluk-uretim.ts` | `gunlukSatirlar()` / `gunlukKaydet()` — (atama, gün) satırları, atölye ayrımını `production_line.workshop_id` üzerinden yapar | Genişlet: `plan_adet` ekle |
| `lib/pes/plan-gercek.ts` | Aşama ve gün seviyesinde plan/gerçek eğrisi. "Girilmemiş günü 0 saymıyoruz" kuralı zaten var | Dokunma — Task 3'teki nullable `adet` kararı bu kuralla uyumlu |
| `lib/pes/malzeme-uyari.ts` | En geç malzeme vs ilk üretim aşaması çakışması | Task 10'da PO satırı rozetinde kullan |

Yeni açılan tek modül: `lib/pes/bant-doluluk.ts`.

---

## Dosya yapısı

**Yeni:**
- `supabase/migrations/036_bant_kapasite_takvimi.sql` — veri modeli
- `lib/pes/bant-doluluk.ts` — kapasite, pay, günlük plan, doluluk (saf)
- `lib/pes/bant-doluluk.test.ts` — birim testleri, veritabanı yok
- `app/api/pes/takvim/doluluk/route.ts` — takvimin tek okuma ucu
- `app/api/pes/workshops/[id]/kapasite-gun/route.ts` — gün bazlı kapasite (aralık yazar)
- `app/api/pes/rezerve/route.ts` — rezerve oluştur/sil
- `app/api/pes/atamalar/[id]/gunluk/route.ts` — günlük plan + gerçek (atölye yazar)
- `app/api/pes/work-orders/[id]/cekme-testi/route.ts` — çekme testi
- `components/pes/takvim/TakvimSayfasi.tsx` — kip yönetimi, filtreler, veri çekme
- `components/pes/takvim/GanttSatirlari.tsx` — tedarik/atölye/bant/PO satırları
- `components/pes/takvim/PoZinciri.tsx` — aşama çubukları + malzeme kilometre taşları
- `components/pes/takvim/PoPaneli.tsx` — beş sekmeli yan panel
- `components/pes/takvim/DolulukMatrisi.tsx` — atölye × ay
- `components/pes/takvim/tipler.ts` — paylaşılan tipler

**Değişen:**
- `lib/pes/gunluk-uretim.ts` — `plan_adet` desteği
- `app/pes/takvim/page.tsx` — 863 satırlık istemci bileşeni yerine ince sunucu sayfası
- `app/workshop/gunluk-uretim/page.tsx` — plan sütunu
- `app/workshop/is-emri/[id]/page.tsx` — malzemede `gelen_miktar`, çekme testi sekmesi

---

## Faz A — Veri modeli

### Task 1: Migration 036

**Files:**
- Create: `supabase/migrations/036_bant_kapasite_takvimi.sql`

- [x] **Step 1: Migration dosyasını yaz**

```sql
-- ============================================================
-- Migration 036 — Bant kapasite takvimi
-- ============================================================
-- Kaynak tasarım: docs/superpowers/specs/2026-09-15-bant-kapasite-takvimi-design.md
--
-- NE EKLİYOR:
--   1. line_schedule'a REZERVE tipi — sahip ve geçerlilik ZORUNLU (K5).
--   2. workshop_kapasite_gun — atölye toplam kapasitesinin gün bazlı sapması.
--   3. work_order_gunluk_uretim.plan_adet — atölyenin yazdığı günlük plan (K3).
--      adet nullable oluyor: NULL = girilmedi, 0 = girildi ve sıfır üretim.
--   4. work_order_material.gelen_miktar — sipariş edilenle gelen farkı (K10).
--   5. kumas_cekme_testi — altı alan (K11).
--   6. production_stage katalog düzeltmesi (K9).
--   7. work_order_gunluk_uretim'in 033 atölye kısıtı boşluğu kapanıyor.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. Rezerve ----------
ALTER TABLE line_schedule
    ADD COLUMN IF NOT EXISTS adet             INTEGER,
    ADD COLUMN IF NOT EXISTS sahip            TEXT,
    ADD COLUMN IF NOT EXISTS gecerlilik_bitis DATE;

ALTER TABLE line_schedule DROP CONSTRAINT IF EXISTS line_schedule_tip_check;
ALTER TABLE line_schedule ADD CONSTRAINT line_schedule_tip_check
    CHECK (tip IN ('WO','CHANGEOVER','BAKIM','İZİN','BLOK','REZERVE'));

ALTER TABLE line_schedule DROP CONSTRAINT IF EXISTS lsch_rezerve_sahipli;
ALTER TABLE line_schedule ADD CONSTRAINT lsch_rezerve_sahipli
    CHECK (tip <> 'REZERVE' OR (sahip IS NOT NULL AND gecerlilik_bitis IS NOT NULL));

ALTER TABLE line_schedule DROP CONSTRAINT IF EXISTS lsch_adet_pozitif;
ALTER TABLE line_schedule ADD CONSTRAINT lsch_adet_pozitif
    CHECK (adet IS NULL OR adet > 0);

CREATE INDEX IF NOT EXISTS idx_lsch_rezerve
    ON line_schedule(line_id, baslangic_tarihi) WHERE tip = 'REZERVE';

COMMENT ON COLUMN line_schedule.adet IS
'Bloğun kapladığı günlük adet. NULL = bandın tamamı.';
COMMENT ON COLUMN line_schedule.gecerlilik_bitis IS
'REZERVE için son geçerlilik. Geçmiş rezerve ölü sayılır ve panoda temizlenmesi istenir.';

-- ---------- 2. Atölye gün bazlı kapasite ----------
CREATE TABLE IF NOT EXISTS workshop_kapasite_gun (
    workshop_id      INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id        UUID    NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
    tarih            DATE    NOT NULL,
    gunluk_kapasite  INTEGER NOT NULL CHECK (gunluk_kapasite >= 0),
    sebep            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workshop_id, tarih)
);

COMMENT ON TABLE workshop_kapasite_gun IS
'Atölyenin TOPLAM günlük kapasitesinin sabitten saptığı günler (toplu izin, kısa vardiya). Kayıt yoksa aktif bantların daily_target toplamı geçerlidir — workshop_stage_capacity''de DIKIM satırı BİLEREK yoktur.';

-- ---------- 3. Günlük plan ----------
ALTER TABLE work_order_gunluk_uretim
    ADD COLUMN IF NOT EXISTS plan_adet INTEGER;

ALTER TABLE work_order_gunluk_uretim ALTER COLUMN adet DROP NOT NULL;
ALTER TABLE work_order_gunluk_uretim ALTER COLUMN adet DROP DEFAULT;

ALTER TABLE work_order_gunluk_uretim DROP CONSTRAINT IF EXISTS wogu_plan_adet_pozitif;
ALTER TABLE work_order_gunluk_uretim ADD CONSTRAINT wogu_plan_adet_pozitif
    CHECK (plan_adet IS NULL OR plan_adet >= 0);

COMMENT ON TABLE work_order_gunluk_uretim IS
'Bir bant tahsisinin bir günü. plan_adet = atölyenin o gün için yazdığı plan, adet = gerçekleşen. adet NULL ise GİRİLMEDİ; 0 ise girildi ve sıfır üretim — plan-gercek.ts bu ayrımı kullanır.';

-- ---------- 4. Gelen malzeme miktarı ----------
ALTER TABLE work_order_material
    ADD COLUMN IF NOT EXISTS gelen_miktar DECIMAL(10,3);

COMMENT ON COLUMN work_order_material.gelen_miktar IS
'Fiilen gelen miktar. miktar sipariş edilendir; fark eldeki eksik kumaşı gösterir.';

-- ---------- 5. Çekme testi ----------
CREATE TABLE IF NOT EXISTS kumas_cekme_testi (
    id              SERIAL PRIMARY KEY,
    work_order_id   INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
    tenant_id       UUID    NOT NULL REFERENCES tenant(id)     ON DELETE CASCADE,
    workshop_id     INTEGER REFERENCES workshop(id) ON DELETE SET NULL,
    tarih           DATE    NOT NULL,
    yikama_sayisi   SMALLINT CHECK (yikama_sayisi BETWEEN 0 AND 10),
    en_cekme_pct    NUMERIC(5,2),
    boy_cekme_pct   NUMERIC(5,2),
    may_kaymasi_pct NUMERIC(5,2),
    sonuc           VARCHAR(20) NOT NULL CHECK (sonuc IN ('UYGUN','RİSKLİ','RED','BEKLIYOR')),
    yapan           VARCHAR(100),
    notlar          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kct_wo ON kumas_cekme_testi(work_order_id);

COMMENT ON TABLE kumas_cekme_testi IS
'Kumaş çekme testi. Kumaş geldikten SONRA, kesim planlanmadan ÖNCE yapılır. Çekme yüzdeleri negatiftir (kumaş küçülür), işaret korunur.';

-- ---------- 6. Aşama kataloğu düzeltmesi ----------
-- Hazırlık kesimden SONRA gelir ve zorunludur.
UPDATE production_stage SET sira_no = 15, zorunlu = TRUE WHERE code = 'HAZIRLIK';

-- Dikim ile UKP arasına giren değişken aşamalar (yıkama zaten var).
INSERT INTO production_stage (code, name, sira_no, zorunlu, renk) VALUES
    ('BASKI', 'Baskı', 32, FALSE, '#0ea5e9'),
    ('NAKIS', 'Nakış', 34, FALSE, '#8b5cf6')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name, sira_no = EXCLUDED.sira_no, zorunlu = EXCLUDED.zorunlu;

-- ---------- 7. RLS ----------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['workshop_kapasite_gun','kumas_cekme_testi'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        -- 035 deseni: workshop_id NULL ise ortak satır sayılır.
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND (current_workshop_id() IS NULL
                      OR workshop_id IS NULL
                      OR workshop_id = current_workshop_id()))',
            t || '_tenant_isolation', t);
    END LOOP;
END $$;

-- 033 BOŞLUĞU: work_order_gunluk_uretim ne workshop_id ne line_id taşıyor,
-- yalnız atama_id. Atölye buraya YAZACAĞI için kısıt şart. Bağ:
--   atama_id → work_order_stage_atama.line_id → production_line.workshop_id
DROP POLICY IF EXISTS work_order_gunluk_uretim_tenant_isolation ON work_order_gunluk_uretim;
CREATE POLICY work_order_gunluk_uretim_tenant_isolation ON work_order_gunluk_uretim
    FOR ALL USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR EXISTS (
              SELECT 1
              FROM work_order_stage_atama a
              JOIN production_line pl ON pl.id = a.line_id
              WHERE a.id = work_order_gunluk_uretim.atama_id
                AND pl.workshop_id = current_workshop_id()))
    );

-- 028: public şemada anon/authenticated yetkisiz kalsın.
REVOKE ALL ON workshop_kapasite_gun, kumas_cekme_testi FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON
                 workshop_kapasite_gun, kumas_cekme_testi TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE kumas_cekme_testi_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT code, sira_no, zorunlu FROM production_stage
--   WHERE code IN ('KESIM','HAZIRLIK','DIKIM','YIKAMA','BASKI','NAKIS','UKP')
--   ORDER BY sira_no;
--   → KESIM 10 t | HAZIRLIK 15 t | DIKIM 20 t | YIKAMA 30 f
--     BASKI 32 f | NAKIS 34 f | UKP 50 t
--
-- Sahipsiz rezerve reddedilmeli:
-- INSERT INTO line_schedule (line_id, baslangic_tarihi, bitis_tarihi, tip)
--   VALUES (1, '2027-01-01', '2027-01-05', 'REZERVE');   -- CHECK hatası
--
-- node scripts/verify_public_api.mjs
-- node scripts/verify_workshop_isolation.mjs
--
-- ROLLBACK:
--   BEGIN;
--   DROP POLICY IF EXISTS work_order_gunluk_uretim_tenant_isolation ON work_order_gunluk_uretim;
--   CREATE POLICY work_order_gunluk_uretim_tenant_isolation ON work_order_gunluk_uretim
--       FOR ALL USING (tenant_id = current_tenant_id() OR is_internal_admin());
--   DROP TABLE IF EXISTS kumas_cekme_testi;
--   DROP TABLE IF EXISTS workshop_kapasite_gun;
--   ALTER TABLE work_order_material DROP COLUMN IF EXISTS gelen_miktar;
--   ALTER TABLE work_order_gunluk_uretim DROP COLUMN IF EXISTS plan_adet;
--   ALTER TABLE work_order_gunluk_uretim ALTER COLUMN adet SET DEFAULT 0;
--   UPDATE work_order_gunluk_uretim SET adet = 0 WHERE adet IS NULL;
--   ALTER TABLE work_order_gunluk_uretim ALTER COLUMN adet SET NOT NULL;
--   ALTER TABLE line_schedule DROP CONSTRAINT IF EXISTS lsch_rezerve_sahipli;
--   ALTER TABLE line_schedule DROP CONSTRAINT IF EXISTS lsch_adet_pozitif;
--   ALTER TABLE line_schedule DROP COLUMN IF EXISTS adet,
--       DROP COLUMN IF EXISTS sahip, DROP COLUMN IF EXISTS gecerlilik_bitis;
--   UPDATE production_stage SET sira_no = 5, zorunlu = FALSE WHERE code = 'HAZIRLIK';
--   DELETE FROM production_stage WHERE code IN ('BASKI','NAKIS');
--   COMMIT;
-- ============================================================
```

- [x] **Step 2: Migration'ı uygula**

Run: `node scripts/_migrate_one.mjs 036_bant_kapasite_takvimi.sql`
Expected: `OK   036_bant_kapasite_takvimi.sql`

- [x] **Step 3: Aşama kataloğunu doğrula**

Run:
```bash
node -e "
import('postgres').then(async ({default:pg})=>{
  const fs=await import('node:fs');
  const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
    .filter(l=>l.includes('=')&&!l.startsWith('#'))
    .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}));
  const sql=pg(env.DATABASE_URL,{max:1,prepare:false});
  console.table(await sql\`SELECT code, sira_no, zorunlu FROM production_stage
    WHERE code IN ('KESIM','HAZIRLIK','DIKIM','YIKAMA','BASKI','NAKIS','UKP')
    ORDER BY sira_no\`);
  await sql.end();
});"
```
Expected: yedi satır, sırasıyla KESIM 10 true, HAZIRLIK 15 true, DIKIM 20 true, YIKAMA 30 false, BASKI 32 false, NAKIS 34 false, UKP 50 true.

- [x] **Step 4: İzolasyon betiklerini çalıştır**

Run: `node scripts/verify_public_api.mjs && node scripts/verify_workshop_isolation.mjs`
Expected: iki betik de hatasız biter; yeni tablolar public API'de 401 döner ve atölye izolasyon taramasında sızıntı raporlanmaz.

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/036_bant_kapasite_takvimi.sql
git commit -m "feat(takvim): migration 036 — rezerve, gun bazli kapasite, gunluk plan, cekme testi"
```

---

## Faz B — Hesap modülü

Bu fazın tamamı saf fonksiyondur: veritabanı yok, tarih kütüphanesi yok, `Date` nesnesi taşınmaz. Girdi ve çıktı `YYYY-MM-DD` dizeleridir. Böylece testler hızlı ve deterministik kalır, saat dilimi hatası olmaz.

### Task 2: Kapasite ve bant payı

**Files:**
- Create: `lib/pes/bant-doluluk.ts`
- Test: `lib/pes/bant-doluluk.test.ts`

- [x] **Step 1: Başarısız testi yaz**

`lib/pes/bant-doluluk.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pazarMi, hamKapasite, efektifKapasite, bantPayi } from './bant-doluluk'
import type { BantTanim, BlokTanim } from './bant-doluluk'

/* 2027-01-04 Pazartesi, 2027-01-09 Cumartesi, 2027-01-10 Pazar. */
const BANTLAR: BantTanim[] = [
  { lineId: 101, dailyTarget: 2000, aktif: true },
  { lineId: 102, dailyTarget: 2000, aktif: true },
  { lineId: 103, dailyTarget: 1000, aktif: true },
  { lineId: 104, dailyTarget: 5000, aktif: false },
]
const BLOKLAR: BlokTanim[] = [
  { lineId: 103, tip: 'BAKIM', adet: null, baslangic: '2027-01-06', bitis: '2027-01-07' },
]

describe('pazarMi', () => {
  it('Pazar günü true, Cumartesi false', () => {
    expect(pazarMi('2027-01-10')).toBe(true)
    expect(pazarMi('2027-01-09')).toBe(false)
    expect(pazarMi('2027-01-04')).toBe(false)
  })
})

describe('hamKapasite', () => {
  it('yalnız aktif bantları toplar', () => {
    expect(hamKapasite(BANTLAR, [], '2027-01-04')).toBe(5000)
  })

  it('tam BAKIM bloğu olan bandı havuzdan çıkarır', () => {
    expect(hamKapasite(BANTLAR, BLOKLAR, '2027-01-06')).toBe(4000)
  })

  it('blok bittikten sonra bant havuza döner', () => {
    expect(hamKapasite(BANTLAR, BLOKLAR, '2027-01-08')).toBe(5000)
  })

  it('kısmi blok (adet dolu) bandı havuzdan çıkarmaz', () => {
    const kismi: BlokTanim[] = [
      { lineId: 103, tip: 'İZİN', adet: 400, baslangic: '2027-01-06', bitis: '2027-01-06' },
    ]
    expect(hamKapasite(BANTLAR, kismi, '2027-01-06')).toBe(5000)
  })
})

describe('efektifKapasite', () => {
  it('Pazar sıfır', () => {
    expect(efektifKapasite(BANTLAR, [], '2027-01-10', null)).toBe(0)
  })

  it('override yoksa ham kapasite', () => {
    expect(efektifKapasite(BANTLAR, [], '2027-01-04', null)).toBe(5000)
  })

  it('override varsa onu kullanır', () => {
    expect(efektifKapasite(BANTLAR, [], '2027-01-04', 2500)).toBe(2500)
  })

  it('override sıfır olabilir — atölye o gün kapalı', () => {
    expect(efektifKapasite(BANTLAR, [], '2027-01-04', 0)).toBe(0)
  })
})

describe('bantPayi', () => {
  it('override yokken bandın kendi daily_target’ı', () => {
    expect(bantPayi(101, BANTLAR, [], '2027-01-04', null)).toBe(2000)
    expect(bantPayi(103, BANTLAR, [], '2027-01-04', null)).toBe(1000)
  })

  it('eşit bölmez — 12 kişilik ile 30 kişilik bandın payı farklıdır', () => {
    expect(bantPayi(101, BANTLAR, [], '2027-01-04', null))
      .not.toBe(bantPayi(103, BANTLAR, [], '2027-01-04', null))
  })

  it('override varsa paylar daily_target oranında küçülür', () => {
    // ham 5000, override 2500 → oran 0.5
    expect(bantPayi(101, BANTLAR, [], '2027-01-04', 2500)).toBe(1000)
    expect(bantPayi(103, BANTLAR, [], '2027-01-04', 2500)).toBe(500)
  })

  it('bakımdaki bant sıfır alır, kalanlar havuzu paylaşır', () => {
    expect(bantPayi(103, BANTLAR, BLOKLAR, '2027-01-06', null)).toBe(0)
    expect(bantPayi(101, BANTLAR, BLOKLAR, '2027-01-06', null)).toBe(2000)
  })

  it('pasif bant sıfır alır', () => {
    expect(bantPayi(104, BANTLAR, [], '2027-01-04', null)).toBe(0)
  })

  it('Pazar sıfır', () => {
    expect(bantPayi(101, BANTLAR, [], '2027-01-10', null)).toBe(0)
  })
})
```

- [x] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npm test -- lib/pes/bant-doluluk.test.ts`
Expected: FAIL — `Failed to resolve import "./bant-doluluk"`

- [x] **Step 3: Modülü yaz**

`lib/pes/bant-doluluk.ts`:

```ts
/* Bant kapasite takvimi — hesap kuralları (tasarım K1, K2, K13).

   SAF MODÜL: veritabanı yok, Date nesnesi taşınmaz. Tarihler her yerde
   'YYYY-MM-DD' dizesidir; böylece saat dilimi hatası imkânsız.

   KAPASİTE ATÖLYENİNDİR. Bant başına ayrı kapasite tutulmaz; kaynak
   aktif bantların production_line.daily_target toplamıdır.
   workshop_stage_capacity'de DIKIM satırı BİLEREK yoktur — mevcut
   kapasite API'si bunu açıkça söylüyor ve o kural korunuyor. */

export type BantTanim = {
  lineId: number
  /** production_line.daily_target */
  dailyTarget: number
  aktif: boolean
}

export type BlokTip = 'REZERVE' | 'BAKIM' | 'İZİN' | 'BLOK' | 'CHANGEOVER' | 'WO'

export type BlokTanim = {
  lineId: number
  tip: BlokTip
  /** NULL = bandın tamamı. Dolu = yalnız o kadar adet düşer. */
  adet: number | null
  baslangic: string
  bitis: string
}

/** Pazar kapalı, Cumartesi çalışılır (K13). */
export function pazarMi(tarih: string): boolean {
  const [y, a, g] = tarih.split('-').map(Number)
  return new Date(Date.UTC(y, a - 1, g)).getUTCDay() === 0
}

function kapsiyorMu(blok: BlokTanim, tarih: string): boolean {
  return tarih >= blok.baslangic && tarih <= blok.bitis
}

/** Bandı o gün tamamen durduran blok var mı? adet dolu olan blok durdurmaz. */
function tamBlokluMu(lineId: number, bloklar: BlokTanim[], tarih: string): boolean {
  return bloklar.some(
    b => b.lineId === lineId && b.tip !== 'REZERVE' && b.adet === null && kapsiyorMu(b, tarih),
  )
}

export function calisanBantlar(
  bantlar: BantTanim[], bloklar: BlokTanim[], tarih: string,
): BantTanim[] {
  return bantlar.filter(b => b.aktif && !tamBlokluMu(b.lineId, bloklar, tarih))
}

export function hamKapasite(
  bantlar: BantTanim[], bloklar: BlokTanim[], tarih: string,
): number {
  return calisanBantlar(bantlar, bloklar, tarih).reduce((t, b) => t + b.dailyTarget, 0)
}

/**
 * Atölyenin o günkü efektif kapasitesi.
 * @param override workshop_kapasite_gun kaydı; yoksa null.
 */
export function efektifKapasite(
  bantlar: BantTanim[], bloklar: BlokTanim[], tarih: string, override: number | null,
): number {
  if (pazarMi(tarih)) return 0
  return override ?? hamKapasite(bantlar, bloklar, tarih)
}

/**
 * Bandın o günkü varsayılan payı.
 * Eşit bölme YAPILMAZ — fark zaten daily_target'ta duruyor (K2).
 * Atölye toplamı düşürdüğünde paylar daily_target oranında birlikte küçülür.
 */
export function bantPayi(
  lineId: number, bantlar: BantTanim[], bloklar: BlokTanim[],
  tarih: string, override: number | null,
): number {
  const calisan = calisanBantlar(bantlar, bloklar, tarih)
  const bant = calisan.find(b => b.lineId === lineId)
  if (!bant) return 0

  const ham = calisan.reduce((t, b) => t + b.dailyTarget, 0)
  if (ham === 0) return 0

  const efektif = efektifKapasite(bantlar, bloklar, tarih, override)
  return Math.round((bant.dailyTarget * efektif) / ham)
}
```

- [x] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npm test -- lib/pes/bant-doluluk.test.ts`
Expected: PASS — 15 test.

- [x] **Step 5: Commit**

```bash
git add lib/pes/bant-doluluk.ts lib/pes/bant-doluluk.test.ts
git commit -m "feat(takvim): kapasite ve bant payi hesabi"
```

---

### Task 3: Günlük plan ve türetilmiş bitiş

**Files:**
- Modify: `lib/pes/bant-doluluk.ts`
- Modify: `lib/pes/bant-doluluk.test.ts`

- [x] **Step 1: Başarısız testi yaz**

`lib/pes/bant-doluluk.test.ts` dosyasının sonuna ekle. Import satırını da genişlet:

```ts
import {
  pazarMi, hamKapasite, efektifKapasite, bantPayi, gunlukPlan, planBitisi,
} from './bant-doluluk'
import type { BantTanim, BlokTanim, AtamaTanim } from './bant-doluluk'
```

```ts
describe('gunlukPlan', () => {
  const atama: AtamaTanim = {
    atamaId: 1, lineId: 101, adet: 9000, planBaslangic: '2027-01-04', elleplan: {},
  }
  const ctx = { bantlar: BANTLAR, bloklar: [] as BlokTanim[], override: () => null }

  it('bandın payı kadar doldurur, son gün kalanı yazar', () => {
    const p = gunlukPlan(atama, ctx)
    expect(p.map(x => x.adet)).toEqual([2000, 2000, 2000, 2000, 1000])
    expect(p.map(x => x.tarih)).toEqual([
      '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08',
    ])
  })

  it('Pazar atlanır, Cumartesi çalışılır', () => {
    const uzun = { ...atama, adet: 13000 }
    const p = gunlukPlan(uzun, ctx)
    const tarihler = p.map(x => x.tarih)
    expect(tarihler).toContain('2027-01-09')   // Cumartesi
    expect(tarihler).not.toContain('2027-01-10') // Pazar
  })

  it('elle girilen gün sabit kalır, kalan arkaya kayar', () => {
    const elle = { ...atama, elleplan: { '2027-01-04': 1000, '2027-01-05': 1250 } }
    const p = gunlukPlan(elle, ctx)
    expect(p[0]).toMatchObject({ tarih: '2027-01-04', adet: 1000, elle: true })
    expect(p[1]).toMatchObject({ tarih: '2027-01-05', adet: 1250, elle: true })
    expect(p[2]).toMatchObject({ tarih: '2027-01-06', adet: 2000, elle: false })
    expect(p.reduce((t, x) => t + x.adet, 0)).toBe(9000)
  })

  it('elle girilen gün kalandan büyükse kalanla sınırlanır', () => {
    const kucuk = { ...atama, adet: 500, elleplan: { '2027-01-04': 9999 } }
    const p = gunlukPlan(kucuk, ctx)
    expect(p).toHaveLength(1)
    expect(p[0].adet).toBe(500)
  })

  it('kapasitesi sıfır olan gün atlanır, plan uzar', () => {
    const c = { ...ctx, override: (t: string) => (t === '2027-01-06' ? 0 : null) }
    const p = gunlukPlan(atama, c)
    expect(p.map(x => x.tarih)).not.toContain('2027-01-06')
    expect(p.reduce((t, x) => t + x.adet, 0)).toBe(9000)
  })

  it('toplam her zaman sipariş adedine eşittir', () => {
    for (const adet of [1, 999, 9000, 25000]) {
      const p = gunlukPlan({ ...atama, adet }, ctx)
      expect(p.reduce((t, x) => t + x.adet, 0)).toBe(adet)
    }
  })
})

describe('planBitisi', () => {
  it('adedin tükendiği son gündür', () => {
    const a: AtamaTanim = {
      atamaId: 1, lineId: 101, adet: 9000, planBaslangic: '2027-01-04', elleplan: {},
    }
    expect(planBitisi(a, { bantlar: BANTLAR, bloklar: [], override: () => null }))
      .toBe('2027-01-08')
  })

  it('elle girilen düşük plan bitişi ileri iter', () => {
    const a: AtamaTanim = {
      atamaId: 1, lineId: 101, adet: 9000, planBaslangic: '2027-01-04',
      elleplan: { '2027-01-04': 500, '2027-01-05': 500 },
    }
    const ctx = { bantlar: BANTLAR, bloklar: [] as BlokTanim[], override: () => null }
    expect(planBitisi(a, ctx) > '2027-01-08').toBe(true)
  })
})
```

- [x] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npm test -- lib/pes/bant-doluluk.test.ts`
Expected: FAIL — `gunlukPlan is not a function`

- [x] **Step 3: Modüle ekle**

Önce dosyanın **en üstüne** import satırını ekle — ESM'de import'lar dosya
başında olmak zorundadır, gövdeye yazarsan derleme kırılır. `gunEkle` mevcut
modülden gelir, yeniden yazma:

```ts
import { gunEkle } from './yerlestirme'
```

Sonra dosyanın **sonuna** ekle:

```ts
export type AtamaTanim = {
  atamaId: number
  lineId: number
  adet: number
  planBaslangic: string
  /** work_order_gunluk_uretim.plan_adet — atölyenin elle yazdığı günler */
  elleplan: Record<string, number>
}

export type PlanGunu = {
  tarih: string
  adet: number
  /** Atölye elle yazdı mı — blok taşınsa bile korunur */
  elle: boolean
  /** O günün bant payı (referans) */
  pay: number
}

export type HesapBaglami = {
  bantlar: BantTanim[]
  bloklar: BlokTanim[]
  /** O gün için workshop_kapasite_gun kaydı; yoksa null */
  override: (tarih: string) => number | null
}

/** Sonsuz döngüye karşı üst sınır — 200 iş günü ~9 aydır. */
const AZAMI_GUN = 200

/**
 * Bir atamanın gün gün planı (K3, K4).
 *
 *   1) O gün elle plan_adet girilmişse o kullanılır — SABİT kalır.
 *   2) Girilmemişse min(kalan, bandın o günkü payı).
 *
 * Kapasitesi sıfır olan gün (Pazar, bakım, atölye kapalı) atlanır; plan uzar.
 */
export function gunlukPlan(atama: AtamaTanim, ctx: HesapBaglami): PlanGunu[] {
  const cikti: PlanGunu[] = []
  let kalan = atama.adet
  let tarih = atama.planBaslangic

  for (let i = 0; kalan > 0 && i < AZAMI_GUN; i++) {
    const pay = bantPayi(atama.lineId, ctx.bantlar, ctx.bloklar, tarih, ctx.override(tarih))
    if (pay > 0) {
      const elleDeger = atama.elleplan[tarih]
      const istenen = elleDeger != null ? elleDeger : pay
      const adet = Math.max(0, Math.min(istenen, kalan))
      if (adet > 0) {
        cikti.push({ tarih, adet, elle: elleDeger != null, pay })
        kalan -= adet
      }
    }
    tarih = gunEkle(tarih, 1)
  }
  return cikti
}

/** Planlanan bitiş TÜRETİLİR — adedin tükendiği son gün (K4). */
export function planBitisi(atama: AtamaTanim, ctx: HesapBaglami): string {
  const p = gunlukPlan(atama, ctx)
  return p.length ? p[p.length - 1].tarih : atama.planBaslangic
}
```

- [x] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npm test -- lib/pes/bant-doluluk.test.ts`
Expected: PASS — 23 test.

- [x] **Step 5: Commit**

```bash
git add lib/pes/bant-doluluk.ts lib/pes/bant-doluluk.test.ts
git commit -m "feat(takvim): gunluk plan doldurma kurali ve turetilmis bitis"
```

---

### Task 4: Doluluk, çakışma ve aylık toplama

**Files:**
- Modify: `lib/pes/bant-doluluk.ts`
- Modify: `lib/pes/bant-doluluk.test.ts`

- [x] **Step 1: Başarısız testi yaz**

Import satırını `gunlukDoluluk, aylikDoluluk` ile genişlet, sonra ekle:

```ts
describe('gunlukDoluluk', () => {
  const ctx = { bantlar: BANTLAR, bloklar: [] as BlokTanim[], override: () => null }
  const atamalar: AtamaTanim[] = [
    { atamaId: 1, lineId: 101, adet: 9000, planBaslangic: '2027-01-04', elleplan: {} },
    { atamaId: 2, lineId: 102, adet: 4000, planBaslangic: '2027-01-04', elleplan: {} },
  ]

  it('plan toplamını kapasiteye böler', () => {
    const d = gunlukDoluluk('2027-01-04', atamalar, ctx, {})
    expect(d.plan).toBe(4000)      // 2000 + 2000
    expect(d.kapasite).toBe(5000)
    expect(d.oran).toBeCloseTo(0.8, 6)
    expect(d.asim).toBe(false)
  })

  it('rezerveyi plana ekler ama kapasiteyi düşürmez', () => {
    const rez: BlokTanim[] = [
      { lineId: 103, tip: 'REZERVE', adet: 1000, baslangic: '2027-01-04', bitis: '2027-01-08' },
    ]
    const d = gunlukDoluluk('2027-01-04', atamalar, { ...ctx, bloklar: rez }, {})
    expect(d.kapasite).toBe(5000)
    expect(d.rezerve).toBe(1000)
    expect(d.oran).toBeCloseTo(1.0, 6)
    expect(d.asim).toBe(false)     // tam dolu aşım değildir
  })

  it('kapasiteyi aşınca asim true', () => {
    const rez: BlokTanim[] = [
      { lineId: 103, tip: 'REZERVE', adet: 2000, baslangic: '2027-01-04', bitis: '2027-01-08' },
    ]
    const d = gunlukDoluluk('2027-01-04', atamalar, { ...ctx, bloklar: rez }, {})
    expect(d.asim).toBe(true)
  })

  it('gerçekleşeni ayrı toplar', () => {
    const d = gunlukDoluluk('2027-01-04', atamalar, ctx, { 1: { '2027-01-04': 1800 } })
    expect(d.gercek).toBe(1800)
  })

  it('kapasite sıfırken oran sıfır, aşım yok', () => {
    const d = gunlukDoluluk('2027-01-10', atamalar, ctx, {})  // Pazar
    expect(d.kapasite).toBe(0)
    expect(d.oran).toBe(0)
    expect(d.asim).toBe(false)
  })
})

describe('aylikDoluluk', () => {
  const ctx = { bantlar: BANTLAR, bloklar: [] as BlokTanim[], override: () => null }
  const atamalar: AtamaTanim[] = [
    { atamaId: 1, lineId: 101, adet: 9000, planBaslangic: '2027-01-04', elleplan: {} },
  ]

  it('ayın çalışılan günlerini toplayıp böler', () => {
    const a = aylikDoluluk('2027-01', atamalar, ctx, {})
    expect(a).not.toBeNull()
    expect(a!.plan).toBe(9000)
    expect(a!.kapasite).toBeGreaterThan(0)
    expect(a!.oran).toBeCloseTo(9000 / a!.kapasite, 6)
  })

  it('hiç çalışılan gün yoksa null döner — %0 ile veri yok aynı değildir', () => {
    const kapali = { ...ctx, override: () => 0 }
    expect(aylikDoluluk('2027-01', atamalar, kapali, {})).toBeNull()
  })
})
```

- [x] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npm test -- lib/pes/bant-doluluk.test.ts`
Expected: FAIL — `gunlukDoluluk is not a function`

- [x] **Step 3: Modüle ekle**

```ts
export type Doluluk = {
  tarih: string
  plan: number
  gercek: number
  rezerve: number
  kapasite: number
  /** (plan + rezerve) / kapasite. Kapasite 0 ise 0. */
  oran: number
  asim: boolean
}

/** atamaId → { tarih: gerçekleşen adet }. Girilmemiş gün ANAHTAR OLARAK YOKTUR. */
export type GercekHaritasi = Record<number, Record<string, number>>

/* TEK blok listesi: ctx.bloklar. REZERVE kapasiteyi düşürmez (tamBlokluMu
   onu atlar) ama doluluğa eklenir. İki ayrı liste taşımak, aynı bloğun bir
   yerde sayılıp öbüründe sayılmaması demekti. */
export function gunlukDoluluk(
  tarih: string,
  atamalar: AtamaTanim[],
  ctx: HesapBaglami,
  gercekler: GercekHaritasi,
): Doluluk {
  let plan = 0
  let gercek = 0
  for (const a of atamalar) {
    const g = gunlukPlan(a, ctx).find(x => x.tarih === tarih)
    if (!g) continue
    plan += g.adet
    const olcum = gercekler[a.atamaId]?.[tarih]
    if (olcum != null) gercek += olcum
  }

  let rezerve = 0
  for (const b of ctx.bloklar) {
    if (b.tip !== 'REZERVE') continue
    if (tarih < b.baslangic || tarih > b.bitis) continue
    rezerve += b.adet ?? bantPayi(b.lineId, ctx.bantlar, ctx.bloklar, tarih, ctx.override(tarih))
  }

  const kapasite = efektifKapasite(ctx.bantlar, ctx.bloklar, tarih, ctx.override(tarih))
  const oran = kapasite > 0 ? (plan + rezerve) / kapasite : 0
  return { tarih, plan, gercek, rezerve, kapasite, oran, asim: kapasite > 0 && plan + rezerve > kapasite }
}

export type AylikDoluluk = { ay: string; plan: number; gercek: number; kapasite: number; oran: number }

/** Ayın günlerini 'YYYY-MM' biçiminden üretir. */
function ayinGunleri(ay: string): string[] {
  const [y, a] = ay.split('-').map(Number)
  const sonGun = new Date(Date.UTC(y, a, 0)).getUTCDate()
  const cikti: string[] = []
  for (let g = 1; g <= sonGun; g++) {
    cikti.push(`${y}-${String(a).padStart(2, '0')}-${String(g).padStart(2, '0')}`)
  }
  return cikti
}

/**
 * Aylık doluluk (K14). Payda sıfırsa null döner — %0 ile "veri yok" aynı
 * görünmemeli; matris bu ayrımı gri hücreyle gösterir.
 */
export function aylikDoluluk(
  ay: string,
  atamalar: AtamaTanim[],
  ctx: HesapBaglami,
  gercekler: GercekHaritasi,
): AylikDoluluk | null {
  let plan = 0, gercek = 0, kapasite = 0
  for (const t of ayinGunleri(ay)) {
    const d = gunlukDoluluk(t, atamalar, ctx, gercekler)
    plan += d.plan + d.rezerve
    gercek += d.gercek
    kapasite += d.kapasite
  }
  if (kapasite === 0) return null
  return { ay, plan, gercek, kapasite, oran: plan / kapasite }
}
```

- [x] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npm test -- lib/pes/bant-doluluk.test.ts`
Expected: PASS — 30 test.

- [x] **Step 5: Tüm test paketini çalıştır — hiçbir şeyi bozmadığını doğrula**

Run: `npm test`
Expected: Mevcut testler geçmeye devam eder. `plan-gercek.test.ts` ve `gunluk-uretim.test.ts` özellikle yeşil olmalı; 036 `adet` kolonunu nullable yaptı.

- [x] **Step 6: Commit**

```bash
git add lib/pes/bant-doluluk.ts lib/pes/bant-doluluk.test.ts
git commit -m "feat(takvim): doluluk, cakisma ve aylik toplama"
```

---

## Faz C — API

### Task 5: Takvim okuma ucu

**Files:**
- Create: `app/api/pes/takvim/doluluk/route.ts`

- [x] **Step 1: Ucu yaz**

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Takvimin TEK okuma ucu.
 *
 *   GET /api/pes/takvim/doluluk?baslangic=2027-01-01&bitis=2027-01-31
 *       &tedarik=Tedarik%20395&bolge=Ege&yetkinlik=Denim
 *
 * Neden tek uç: eski ekran /workshops, /lines ve /work-orders'ı ayrı ayrı
 * çekip istemcide birleştiriyordu. 131 atölyede bu üç tur ağ gecikmesi
 * demek ve birleştirme mantığı istemciye sızıyor. Hesap lib/pes/bant-doluluk
 * içinde; bu uç YALNIZ ham satırları döndürür, oran hesaplamaz.
 */
export const GET = withTenantRoute(async (req, { sql }) => {
  const u = new URL(req.url)
  const baslangic = u.searchParams.get('baslangic')
  const bitis = u.searchParams.get('bitis')
  if (!baslangic || !bitis) {
    return NextResponse.json({ error: 'baslangic ve bitis gerekli' }, { status: 400 })
  }

  const tedarik = u.searchParams.get('tedarik')
  const bolge = u.searchParams.get('bolge')
  const yetkinlik = u.searchParams.get('yetkinlik')

  const atolyeler = await sql`
    SELECT w.id, w.code, w.name, w.is_active,
           p.tedarik_mudurlugu, p.bolge
    FROM workshop w
    LEFT JOIN workshop_profil p ON p.workshop_id = w.id
    WHERE w.is_active
      AND (${tedarik}::text IS NULL OR p.tedarik_mudurlugu = ${tedarik})
      AND (${bolge}::text   IS NULL OR p.bolge = ${bolge})
      AND (${yetkinlik}::text IS NULL OR EXISTS (
            SELECT 1 FROM line_capability lc
            JOIN production_line pl2 ON pl2.id = lc.line_id
            JOIN capability_value cv ON cv.id = lc.value_id
            WHERE pl2.workshop_id = w.id AND cv.label = ${yetkinlik}))
    ORDER BY p.tedarik_mudurlugu NULLS LAST, w.name`

  const bantlar = await sql`
    SELECT id, code, name, workshop_id, daily_target, is_active
    FROM production_line
    ORDER BY workshop_id, code`

  const atamalar = await sql`
    SELECT a.id, a.line_id, a.adet, a.plan_baslangic, a.plan_bitis,
           wo.id AS work_order_id, wo.is_emri_no, wo.model_adi, wo.musteri,
           wo.teslim_tarihi, wo.siparis_miktari
    FROM work_order_stage_atama a
    JOIN work_order_stage ws ON ws.id = a.stage_row_id
    JOIN work_order wo       ON wo.id = ws.work_order_id
    WHERE a.plan_bitis >= ${baslangic} AND a.plan_baslangic <= ${bitis}
      AND wo.durum NOT IN ('İptal','Tamamlandi','Sevk Edildi')`

  const bloklar = await sql`
    SELECT id, line_id, tip, adet, sahip, gecerlilik_bitis, notlar,
           baslangic_tarihi, bitis_tarihi
    FROM line_schedule
    WHERE bitis_tarihi >= ${baslangic} AND baslangic_tarihi <= ${bitis}`

  const kapasiteGun = await sql`
    SELECT workshop_id, tarih, gunluk_kapasite, sebep
    FROM workshop_kapasite_gun
    WHERE tarih BETWEEN ${baslangic} AND ${bitis}`

  /* plan_adet ve gerçekleşen adet aynı satırda durur (036). */
  const gunluk = await sql`
    SELECT g.atama_id, g.tarih, g.plan_adet, g.adet
    FROM work_order_gunluk_uretim g
    WHERE g.tarih BETWEEN ${baslangic} AND ${bitis}`

  const asamalar = await sql`
    SELECT ws.id, ws.work_order_id, ws.workshop_id, ps.code, ps.name, ps.sira_no, ps.zorunlu,
           ws.plan_baslangic, ws.plan_bitis, ws.gercek_baslangic, ws.gercek_bitis, ws.durum
    FROM work_order_stage ws
    JOIN production_stage ps ON ps.id = ws.stage_id
    ORDER BY ws.work_order_id, ps.sira_no`

  const malzemeler = await sql`
    SELECT work_order_id, tip, kod, ad, miktar, gelen_miktar, birim,
           durum, beklenen_tarih, gelis_tarihi, tedarikci
    FROM work_order_material`

  const testler = await sql`
    SELECT work_order_id, tarih, yikama_sayisi, en_cekme_pct, boy_cekme_pct,
           may_kaymasi_pct, sonuc, yapan
    FROM kumas_cekme_testi`

  return NextResponse.json({
    atolyeler, bantlar, atamalar, bloklar, kapasiteGun, gunluk, asamalar, malzemeler, testler,
  })
})
```

- [x] **Step 2: Uygulamayı başlat ve ucu çağır**

Run: `npm run dev` (ayrı terminalde), sonra
```bash
curl -s "http://localhost:3000/api/pes/takvim/doluluk?baslangic=2027-01-01&bitis=2027-01-31" | head -c 400
```
Expected: 401 (oturum yok) ya da oturum varsa dokuz anahtarlı JSON. 401 doğru davranıştır — `withTenantRoute` kimliksiz isteği reddeder.

- [x] **Step 3: Tarih kolonlarının metin döndüğünü doğrula**

`postgres.js` DATE kolonlarını `Date` nesnesine çevirir; istemcide `.slice(0,10)` çağrısı çöker ve TypeScript bunu yakalamaz. Sorgulardaki her DATE kolonunu `::text` ile döndür:

```sql
a.plan_baslangic::text, a.plan_bitis::text
wo.teslim_tarihi::text
b.baslangic_tarihi::text, b.bitis_tarihi::text, b.gecerlilik_bitis::text
k.tarih::text
g.tarih::text
ws.plan_baslangic::text, ws.plan_bitis::text, ws.gercek_baslangic::text, ws.gercek_bitis::text
m.beklenen_tarih::text, m.gelis_tarihi::text
t.tarih::text
```

Yukarıdaki route'taki tüm DATE seçimlerini bu biçime çevir.

- [x] **Step 4: Commit**

```bash
git add app/api/pes/takvim/doluluk/route.ts
git commit -m "feat(takvim): tek okuma ucu — atolye, bant, atama, blok, asama, malzeme"
```

---

### Task 6: Gün bazlı atölye kapasitesi

**Files:**
- Create: `app/api/pes/workshops/[id]/kapasite-gun/route.ts`

- [x] **Step 1: Ucu yaz**

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { gunEkle } from '@/lib/pes/yerlestirme'

/**
 * Atölyenin TOPLAM günlük kapasitesinin gün bazlı sapması.
 *
 *   GET /api/pes/workshops/12/kapasite-gun?baslangic=&bitis=
 *   PUT /api/pes/workshops/12/kapasite-gun
 *       { baslangic, bitis, gunlukKapasite, sebep }
 *   DELETE /api/pes/workshops/12/kapasite-gun?baslangic=&bitis=
 *
 * Giriş ARALIK olarak gelir, satırlara açılır. Kimse otuz günü tek tek yazmaz.
 * Kayıt yoksa aktif bantların daily_target toplamı geçerlidir.
 */
export const GET = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const wid = parseInt(params.id)
  if (!Number.isInteger(wid)) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })
  const u = new URL(req.url)
  const b = u.searchParams.get('baslangic'), s = u.searchParams.get('bitis')
  if (!b || !s) return NextResponse.json({ error: 'baslangic ve bitis gerekli' }, { status: 400 })

  const satirlar = await sql`
    SELECT tarih::text, gunluk_kapasite, sebep
    FROM workshop_kapasite_gun
    WHERE workshop_id = ${wid} AND tarih BETWEEN ${b} AND ${s}
    ORDER BY tarih`
  return NextResponse.json({ kapasiteler: satirlar })
})

export const PUT = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const wid = parseInt(params.id)
  if (!Number.isInteger(wid)) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })

  const body = await req.json()
  const { baslangic, bitis, sebep } = body
  const kapasite = Number(body.gunlukKapasite)

  if (!baslangic || !bitis || bitis < baslangic) {
    return NextResponse.json({ error: 'Geçerli bir tarih aralığı gerekli' }, { status: 400 })
  }
  if (!Number.isFinite(kapasite) || kapasite < 0) {
    return NextResponse.json({ error: 'Kapasite 0 ya da daha büyük olmalı' }, { status: 400 })
  }
  /* Bir yıldan uzun aralık büyük ihtimalle yazım hatasıdır; sessizce
     365 satır açmak yerine reddet. */
  const gunSayisi = Math.round(
    (Date.parse(bitis) - Date.parse(baslangic)) / 86_400_000) + 1
  if (gunSayisi > 366) {
    return NextResponse.json({ error: 'Aralık en fazla bir yıl olabilir' }, { status: 400 })
  }

  const satirlar: { workshop_id: number; tenant_id: string; tarih: string;
                    gunluk_kapasite: number; sebep: string | null }[] = []
  for (let t = baslangic; t <= bitis; t = gunEkle(t, 1)) {
    satirlar.push({
      workshop_id: wid, tenant_id: tenant.tenantId, tarih: t,
      gunluk_kapasite: Math.round(kapasite), sebep: sebep ? String(sebep) : null,
    })
  }

  await sql`
    INSERT INTO workshop_kapasite_gun ${sql(satirlar)}
    ON CONFLICT (workshop_id, tarih) DO UPDATE SET
      gunluk_kapasite = EXCLUDED.gunluk_kapasite,
      sebep = EXCLUDED.sebep`

  return NextResponse.json({ ok: true, gunSayisi: satirlar.length })
})

export const DELETE = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const wid = parseInt(params.id)
  if (!Number.isInteger(wid)) return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })
  const u = new URL(req.url)
  const b = u.searchParams.get('baslangic'), s = u.searchParams.get('bitis')
  if (!b || !s) return NextResponse.json({ error: 'baslangic ve bitis gerekli' }, { status: 400 })

  await sql`DELETE FROM workshop_kapasite_gun
            WHERE workshop_id = ${wid} AND tarih BETWEEN ${b} AND ${s}`
  return NextResponse.json({ ok: true })
})
```

- [x] **Step 2: Elle dene**

Run (oturumlu tarayıcı konsolundan ya da curl + çerez ile):
```js
await fetch('/api/pes/workshops/1/kapasite-gun', {
  method: 'PUT', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ baslangic: '2027-01-06', bitis: '2027-01-09',
                         gunlukKapasite: 2400, sebep: 'Eleman izni' }),
}).then(r => r.json())
```
Expected: `{ ok: true, gunSayisi: 4 }`

- [x] **Step 3: Aralık sınırının çalıştığını doğrula**

Aynı çağrıyı `baslangic: '2027-01-01', bitis: '2029-01-01'` ile yap.
Expected: 400, `"Aralık en fazla bir yıl olabilir"`

- [x] **Step 4: Commit**

```bash
git add "app/api/pes/workshops/[id]/kapasite-gun/route.ts"
git commit -m "feat(takvim): gun bazli atolye kapasitesi — aralik yazar"
```

---

### Task 7: Rezerve uçları

**Files:**
- Create: `app/api/pes/rezerve/route.ts`

- [x] **Step 1: Ucu yaz**

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Bant rezervasyonu (K5). line_schedule'da tip='REZERVE' olarak yaşar —
 * bakım ve izinle aynı tabloda durur, aynı çakışma kontrolünden geçer.
 *
 *   POST   /api/pes/rezerve  { lineId, baslangic, bitis, adet, sahip, gecerlilikBitis, notlar }
 *   DELETE /api/pes/rezerve?id=123
 *
 * SAHİP ve GEÇERLİLİK ZORUNLU. Veritabanında CHECK var; burada da
 * kontrol ediyoruz ki kullanıcı anlaşılır bir hata görsün, 500 değil.
 */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const lineId = Number(b.lineId)
  const { baslangic, bitis, sahip, gecerlilikBitis } = b
  const adet = b.adet == null || b.adet === '' ? null : Number(b.adet)

  if (!Number.isInteger(lineId)) {
    return NextResponse.json({ error: 'Bant seçilmedi' }, { status: 400 })
  }
  if (!baslangic || !bitis || bitis < baslangic) {
    return NextResponse.json({ error: 'Geçerli bir tarih aralığı gerekli' }, { status: 400 })
  }
  if (!sahip || !String(sahip).trim()) {
    return NextResponse.json({ error: 'Rezervenin sahibi yazılmalı' }, { status: 400 })
  }
  if (!gecerlilikBitis) {
    return NextResponse.json({ error: 'Geçerlilik bitiş tarihi yazılmalı' }, { status: 400 })
  }
  if (adet != null && (!Number.isFinite(adet) || adet <= 0)) {
    return NextResponse.json({ error: 'Adet 0’dan büyük olmalı ya da boş bırakılmalı' }, { status: 400 })
  }

  const [satir] = await sql`
    INSERT INTO line_schedule ${sql({
      line_id: lineId,
      tenant_id: tenant.tenantId,
      baslangic_tarihi: baslangic,
      bitis_tarihi: bitis,
      tip: 'REZERVE',
      adet: adet == null ? null : Math.round(adet),
      sahip: String(sahip).trim(),
      gecerlilik_bitis: gecerlilikBitis,
      notlar: b.notlar ? String(b.notlar) : null,
    })}
    RETURNING id`

  return NextResponse.json({ ok: true, id: satir.id })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })

  const silinen = await sql`
    DELETE FROM line_schedule WHERE id = ${id} AND tip = 'REZERVE' RETURNING id`
  if (!silinen.length) {
    return NextResponse.json({ error: 'Rezerve bulunamadı' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
})
```

- [x] **Step 2: Sahipsiz rezervenin reddedildiğini doğrula**

```js
await fetch('/api/pes/rezerve', { method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ lineId: 1, baslangic: '2027-02-01', bitis: '2027-02-05' }),
}).then(r => r.json())
```
Expected: `{ error: 'Rezervenin sahibi yazılmalı' }` — 400, 500 değil.

- [x] **Step 3: Geçerli rezervenin yazıldığını doğrula**

```js
await fetch('/api/pes/rezerve', { method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ lineId: 1, baslangic: '2027-02-01', bitis: '2027-02-05',
    adet: 1200, sahip: 'M. Aydın', gecerlilikBitis: '2027-02-10',
    notlar: 'Fast track sipariş için' }),
}).then(r => r.json())
```
Expected: `{ ok: true, id: <sayı> }`

- [x] **Step 4: Commit**

```bash
git add app/api/pes/rezerve/route.ts
git commit -m "feat(takvim): rezerve olustur/sil — sahip ve gecerlilik zorunlu"
```

---

### Task 8: Günlük plan ve gerçekleşen yazma

**Files:**
- Modify: `lib/pes/gunluk-uretim.ts`
- Create: `app/api/pes/atamalar/[id]/gunluk/route.ts`

- [x] **Step 1: `gunlukKaydet`'i plan_adet için genişlet**

`lib/pes/gunluk-uretim.ts` içindeki `gunlukKaydet` fonksiyonunu oku ve INSERT/UPDATE'ini `plan_adet` taşıyacak biçime getir. Mevcut imza `adet` ve `hatali_adet` yazıyor; yeni imza:

```ts
export type GunlukGiris = {
  atamaId: number
  tarih: string
  /** Atölyenin o gün için planı. undefined = dokunma, null = elle girişi kaldır. */
  planAdet?: number | null
  /** Gerçekleşen. undefined = dokunma, null = girilmedi durumuna döndür. */
  adet?: number | null
  hataliAdet?: number
}

export async function gunlukKaydet(
  sql: postgres.Sql, tenantId: string, giris: GunlukGiris,
): Promise<void> {
  const alanlar: Record<string, unknown> = {
    atama_id: giris.atamaId,
    tenant_id: tenantId,
    tarih: giris.tarih,
  }
  if (giris.planAdet !== undefined) alanlar.plan_adet = giris.planAdet
  if (giris.adet !== undefined) alanlar.adet = giris.adet
  if (giris.hataliAdet !== undefined) alanlar.hatali_adet = giris.hataliAdet

  await sql`
    INSERT INTO work_order_gunluk_uretim ${sql(alanlar)}
    ON CONFLICT (atama_id, tarih) DO UPDATE SET ${sql(
      Object.fromEntries(Object.entries(alanlar).filter(
        ([k]) => k !== 'atama_id' && k !== 'tenant_id' && k !== 'tarih')))}`
}
```

Çağıran yerler varsa yeni imzaya uyarla: `grep -rn "gunlukKaydet" app lib --include=*.ts --include=*.tsx`

- [x] **Step 2: Ucu yaz**

`app/api/pes/atamalar/[id]/gunluk/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { gunlukKaydet } from '@/lib/pes/gunluk-uretim'

/**
 * Bir bant tahsisinin günlük planı ve gerçekleşeni (K3).
 *
 *   PUT /api/pes/atamalar/57/gunluk
 *       { gunler: [{ tarih, planAdet?, adet? }] }
 *
 * ATÖLYE YAZAR, merkez okur. Yetki RLS'te: 036'nın politikası
 * atama_id → line_id → production_line.workshop_id zinciriyle atölye
 * kullanıcısını kendi bantlarına kilitler. Burada ayrıca kontrol
 * etmiyoruz — iki ayrı yetki kuralı zamanla birbirini tutmaz.
 *
 * planAdet null gönderilirse elle giriş KALDIRILIR ve gün varsayılan
 * paya döner. adet null ise "girilmedi" durumuna döner (0 DEĞİL).
 */
export const PUT = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const atamaId = parseInt(params.id)
  if (!Number.isInteger(atamaId)) {
    return NextResponse.json({ error: 'Geçersiz atama' }, { status: 400 })
  }

  const { gunler } = await req.json()
  if (!Array.isArray(gunler) || gunler.length === 0) {
    return NextResponse.json({ error: 'gunler dizisi gerekli' }, { status: 400 })
  }
  if (gunler.length > 400) {
    return NextResponse.json({ error: 'Tek seferde en fazla 400 gün' }, { status: 400 })
  }

  /* RLS atölyeyi zaten kısıtlıyor; atama gerçekten görünüyor mu diye
     bakmak, yetkisiz kullanıcıya 404 döndürmek için. */
  const [atama] = await sql`SELECT id FROM work_order_stage_atama WHERE id = ${atamaId}`
  if (!atama) return NextResponse.json({ error: 'Atama bulunamadı' }, { status: 404 })

  for (const g of gunler) {
    if (!g?.tarih || !/^\d{4}-\d{2}-\d{2}$/.test(g.tarih)) {
      return NextResponse.json({ error: `Geçersiz tarih: ${g?.tarih}` }, { status: 400 })
    }
    const say = (v: unknown) => (v === null ? null : v === undefined ? undefined : Number(v))
    const planAdet = say(g.planAdet)
    const adet = say(g.adet)
    if (planAdet != null && (!Number.isFinite(planAdet) || planAdet < 0)) {
      return NextResponse.json({ error: 'planAdet negatif olamaz' }, { status: 400 })
    }
    if (adet != null && (!Number.isFinite(adet) || adet < 0)) {
      return NextResponse.json({ error: 'adet negatif olamaz' }, { status: 400 })
    }
    await gunlukKaydet(sql, tenant.tenantId, {
      atamaId, tarih: g.tarih,
      planAdet: planAdet === undefined ? undefined : planAdet,
      adet: adet === undefined ? undefined : adet,
    })
  }

  return NextResponse.json({ ok: true, yazilan: gunler.length })
})
```

- [x] **Step 3: Mevcut günlük üretim testlerini çalıştır**

Run: `npm test -- lib/pes/gunluk-uretim.test.ts`
Expected: PASS. Kırılan varsa yeni `GunlukGiris` imzasına uyarla — `adet` artık isteğe bağlı.

- [x] **Step 4: Commit**

```bash
git add lib/pes/gunluk-uretim.ts "app/api/pes/atamalar/[id]/gunluk/route.ts"
git commit -m "feat(takvim): gunluk plan ve gerceklesen yazma ucu"
```

---

## Faz D — Ekran

Görsel referans onaylanmış makettir: https://claude.ai/artifact/VKqcZPWErSSEJVTjRRmKi1
Renkler `app/globals.css` jetonlarından gelir; yeni renk tanımlama.

### Task 9: Sayfa iskeleti ve satır bileşenleri

**Files:**
- Create: `components/pes/takvim/tipler.ts`
- Create: `components/pes/takvim/TakvimSayfasi.tsx`
- Create: `components/pes/takvim/GanttSatirlari.tsx`
- Modify: `app/pes/takvim/page.tsx`

- [x] **Step 1: Paylaşılan tipleri yaz**

`components/pes/takvim/tipler.ts`:

```ts
export type Atolye = {
  id: number; code: string; name: string; is_active: boolean
  tedarik_mudurlugu: string | null; bolge: string | null
}
export type Bant = {
  id: number; code: string; name: string; workshop_id: number
  daily_target: number; is_active: boolean
}
export type Atama = {
  id: number; line_id: number; adet: number
  plan_baslangic: string; plan_bitis: string
  work_order_id: number; is_emri_no: string; model_adi: string
  musteri: string | null; teslim_tarihi: string | null; siparis_miktari: number
}
export type Blok = {
  id: number; line_id: number; tip: string; adet: number | null
  sahip: string | null; gecerlilik_bitis: string | null; notlar: string | null
  baslangic_tarihi: string; bitis_tarihi: string
}
export type KapasiteGun = {
  workshop_id: number; tarih: string; gunluk_kapasite: number; sebep: string | null
}
export type GunlukSatirDto = {
  atama_id: number; tarih: string; plan_adet: number | null; adet: number | null
}
export type Asama = {
  id: number; work_order_id: number; workshop_id: number | null
  code: string; name: string; sira_no: number; zorunlu: boolean
  plan_baslangic: string | null; plan_bitis: string | null
  gercek_baslangic: string | null; gercek_bitis: string | null; durum: string
}
export type Malzeme = {
  work_order_id: number; tip: string; kod: string | null; ad: string
  miktar: number | null; gelen_miktar: number | null; birim: string | null
  durum: string; beklenen_tarih: string | null; gelis_tarihi: string | null
  tedarikci: string | null
}
export type CekmeTesti = {
  work_order_id: number; tarih: string; yikama_sayisi: number | null
  en_cekme_pct: number | null; boy_cekme_pct: number | null
  may_kaymasi_pct: number | null; sonuc: string; yapan: string | null
}
export type TakvimVerisi = {
  atolyeler: Atolye[]; bantlar: Bant[]; atamalar: Atama[]; bloklar: Blok[]
  kapasiteGun: KapasiteGun[]; gunluk: GunlukSatirDto[]; asamalar: Asama[]
  malzemeler: Malzeme[]; testler: CekmeTesti[]
}
export type Kip = 'ay' | 'hafta' | 'gun' | 'matris'
export type Rol = 'merkez' | 'atolye'
```

- [x] **Step 2: Sunucu sayfasını ince hale getir**

`app/pes/takvim/page.tsx` içeriğini tamamen şununla değiştir:

```tsx
import { PageHeader } from '@/components/ui'
import TakvimSayfasi from '@/components/pes/takvim/TakvimSayfasi'

export const dynamic = 'force-dynamic'

export default function PesTakvimPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        crumbs={[{ label: 'Merkez', href: '/pes' }, { label: 'Bant kapasite takvimi' }]}
        title="Bant kapasite takvimi"
        context="Kapasite atölyenin ve bantlar arasında ortak; bant satırı siparişin nerede durduğunu gösterir"
      />
      <TakvimSayfasi />
    </div>
  )
}
```

- [x] **Step 3: Kip yönetimi ve veri çekmeyi yaz**

`components/pes/takvim/TakvimSayfasi.tsx` — `'use client'` bileşeni. Sorumluluğu üç şey: dönem/kip durumu, filtreler, veri çekme. Çizim `GanttSatirlari`'na devredilir.

```tsx
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { TakvimVerisi, Kip } from './tipler'
import GanttSatirlari from './GanttSatirlari'

const BOS: TakvimVerisi = {
  atolyeler: [], bantlar: [], atamalar: [], bloklar: [],
  kapasiteGun: [], gunluk: [], asamalar: [], malzemeler: [], testler: [],
}

function ayAraligi(y: number, a: number) {
  const iki = (n: number) => String(n).padStart(2, '0')
  const son = new Date(Date.UTC(y, a + 1, 0)).getUTCDate()
  return { baslangic: `${y}-${iki(a + 1)}-01`, bitis: `${y}-${iki(a + 1)}-${iki(son)}` }
}

export default function TakvimSayfasi() {
  const [ay, setAy] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [kip, setKip] = useState<Kip>('ay')
  const [filtre, setFiltre] = useState({ tedarik: '', bolge: '', yetkinlik: '' })
  const [veri, setVeri] = useState<TakvimVerisi>(BOS)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  const aralik = useMemo(() => ayAraligi(ay.y, ay.m), [ay])

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata(null)
    try {
      const q = new URLSearchParams({ baslangic: aralik.baslangic, bitis: aralik.bitis })
      if (filtre.tedarik) q.set('tedarik', filtre.tedarik)
      if (filtre.bolge) q.set('bolge', filtre.bolge)
      if (filtre.yetkinlik) q.set('yetkinlik', filtre.yetkinlik)
      const r = await fetch(`/api/pes/takvim/doluluk?${q}`)
      if (!r.ok) throw new Error(`Takvim yüklenemedi (${r.status})`)
      setVeri(await r.json())
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Takvim yüklenemedi')
      setVeri(BOS)
    } finally {
      setYukleniyor(false)
    }
  }, [aralik, filtre])

  useEffect(() => { yukle() }, [yukle])

  return (
    <div className="space-y-3">
      {/* Araç çubuğu: dönem gezinme, kip, filtreler, uyarı sayaçları */}
      {/* Maketteki .toolbar bloğunun karşılığı */}
      {hata && (
        <p className="rounded-lg border border-danger-line bg-danger-soft/40 px-4 py-2.5 text-[13px] text-danger">
          {hata} Sayfayı yenileyin; sorun sürerse yöneticinize bildirin.
        </p>
      )}
      {yukleniyor
        ? <div className="p-10 text-center text-faint">Yükleniyor…</div>
        : <GanttSatirlari veri={veri} aralik={aralik} kip={kip} />}
    </div>
  )
}
```

Araç çubuğunu makete bakarak tamamla: dönem ‹ Bugün ›, kip düğmeleri (Ay/Hafta/Gün/Matris), üç filtre `select`'i, sağda üç uyarı sayacı. Sayacı sıfırken `a-nul` sınıfıyla nötr göster ve `disabled` yap — sıfır sayı alarm rengi taşımamalı.

- [x] **Step 4: Satır bileşenlerini yaz**

`components/pes/takvim/GanttSatirlari.tsx` — dört seviyeli katlanır gantt. Hesap için `lib/pes/bant-doluluk` kullanılır; bu dosyada oran hesabı yazma.

DTO'dan hesap bağlamına dönüşüm bu dosyanın en hata yapılası yeridir; kodu
aynen şu:

```ts
import { useMemo } from 'react'
import {
  gunlukDoluluk, gunlukPlan, planBitisi,
  type BantTanim, type BlokTanim, type AtamaTanim,
  type HesapBaglami, type GercekHaritasi,
} from '@/lib/pes/bant-doluluk'
import type { TakvimVerisi } from './tipler'

/** Bir atölyenin hesap bağlamı. Atölye başına kurulur — kapasite atölyenindir. */
function atolyeBaglami(veri: TakvimVerisi, atolyeId: number): HesapBaglami {
  const bantlar: BantTanim[] = veri.bantlar
    .filter(b => b.workshop_id === atolyeId)
    .map(b => ({ lineId: b.id, dailyTarget: b.daily_target, aktif: b.is_active }))

  const bantIdleri = new Set(bantlar.map(b => b.lineId))
  const bloklar: BlokTanim[] = veri.bloklar
    .filter(b => bantIdleri.has(b.line_id))
    .map(b => ({
      lineId: b.line_id,
      tip: b.tip as BlokTanim['tip'],
      adet: b.adet,
      baslangic: b.baslangic_tarihi,
      bitis: b.bitis_tarihi,
    }))

  /* Gün başına O(1) arama: 131 atölye × 31 gün için lineer tarama pahalı. */
  const override = new Map<string, number>()
  for (const k of veri.kapasiteGun) {
    if (k.workshop_id === atolyeId) override.set(k.tarih, k.gunluk_kapasite)
  }

  return { bantlar, bloklar, override: (t) => override.get(t) ?? null }
}

/** plan_adet dolu satırlar elle giriştir; adet dolu satırlar gerçekleşendir. */
function gunlukHaritalari(veri: TakvimVerisi) {
  const elle: Record<number, Record<string, number>> = {}
  const gercekler: GercekHaritasi = {}
  for (const g of veri.gunluk) {
    if (g.plan_adet != null) (elle[g.atama_id] ??= {})[g.tarih] = g.plan_adet
    /* adet NULL = GİRİLMEDİ. 0 yazmak duran bandı sıfır üretimle
       karıştırırdı — plan-gercek.ts ile aynı kural. */
    if (g.adet != null) (gercekler[g.atama_id] ??= {})[g.tarih] = g.adet
  }
  return { elle, gercekler }
}

function atamaTanimlari(veri: TakvimVerisi, bantIdleri: Set<number>,
                        elle: Record<number, Record<string, number>>): AtamaTanim[] {
  return veri.atamalar
    .filter(a => bantIdleri.has(a.line_id))
    .map(a => ({
      atamaId: a.id,
      lineId: a.line_id,
      adet: a.adet,
      planBaslangic: a.plan_baslangic,
      elleplan: elle[a.id] ?? {},
    }))
}
```

Bunları `useMemo` ile atölye başına önbellekle; her render'da yeniden kurmak
131 atölyede fark edilir gecikme yaratır.

Geri kalan çizim işi:
- Her atölye satırı için günler üzerinde `gunlukDoluluk` çağır; çubuğun
  yüksekliği `oran`, içindeki koyu dolgu `gercek / plan`.
- Bant satırında her atama için `gunlukPlan` ve `planBitisi` ile blok
  başlangıç/bitiş kolonlarını bul.
- CSS grid deseni: `grid-template-columns: var(--lbl) repeat(N, <kolon>px)`.
  Hücreler mutlak konumlu arka katman (`.bg`), bloklar akışta — böylece aynı
  bantta üst üste binen siparişler satırı büyütür.

- [x] **Step 5: Ekranı aç ve kontrol et**

Run: `npm run dev`, tarayıcıda `http://localhost:3000/pes/takvim`
Expected: Atölye satırları doluluk çubuklarıyla, bantlar açılınca sipariş blokları görünür. Konsolda hata yok.

- [x] **Step 6: Commit**

```bash
git add components/pes/takvim/tipler.ts components/pes/takvim/TakvimSayfasi.tsx \
        components/pes/takvim/GanttSatirlari.tsx app/pes/takvim/page.tsx
git commit -m "feat(takvim): sayfa iskeleti ve dort seviyeli gantt satirlari"
```

---

### Task 10: PO satırı — aşama zinciri ve malzeme

**Files:**
- Create: `components/pes/takvim/PoZinciri.tsx`
- Modify: `components/pes/takvim/GanttSatirlari.tsx`

- [x] **Step 1: PO satırını yaz**

`components/pes/takvim/PoZinciri.tsx`. İki şey çizer:

1. **Malzeme kilometre taşları** (grid satırı 1): her malzeme için `gelis_tarihi ?? beklenen_tarih` gününde bir eşkenar dörtgen. Dolu yeşil = geldi, içi boş sarı = bekleniyor, kırmızı = geciken ya da `durum === 'Eksik'`.
2. **Aşama çubukları** (grid satırı 2+): `asamalar` dizisinden `sira_no` sırayla. Her çubuk `plan_baslangic`–`plan_bitis` arasını kaplar; `gercek_baslangic` doluysa içinde ilerleme dolgusu.

Aşama sınıflandırması:
```ts
const ZORUNLU_KODLAR = new Set(['KESIM', 'HAZIRLIK', 'DIKIM', 'UKP'])
const DEGISKEN_KODLAR = new Set(['YIKAMA', 'BASKI', 'NAKIS'])

function asamaSinifi(a: Asama): 'pre' | 'sew' | 'opt' | 'post' {
  if (a.code === 'DIKIM') return 'sew'
  if (DEGISKEN_KODLAR.has(a.code)) return 'opt'
  if (a.code === 'UKP') return 'post'
  return 'pre'
}
```

Değişken aşama kesik çizgili çizilir. `a.workshop_id` doluysa ve siparişin atölyesinden farklıysa çubuğa `· dış` etiketi eklenir.

**Satır içi durum rozetleri** sol sütunda. Malzeme rozetinde mevcut modülü kullan, yeniden yazma:

```ts
import { malzemeUyarisi } from '@/lib/pes/malzeme-uyari'
```

Rozetler: malzeme durumu, çekme testi sonucu, risk dökümanı eksikliği (bu turda her zaman "yok" — K12, ayrı proje), açık konu sayısı.

- [x] **Step 2: `GanttSatirlari`'na bağla**

Bant satırının etiketinde caret ekle; açıkken o bandın atamaları için `PoZinciri` satırları render et.

- [x] **Step 3: Grift geçişi gözle doğrula**

Aynı banda iki sipariş yerleştir; ikincinin kesim tarihi birincinin dikim aralığına düşsün.
Expected: İkinci PO'nun kesim çubuğu, birincinin dikim bloğu hâlâ sürerken başlar ve ekranda yan yana görünür.

- [x] **Step 4: Commit**

```bash
git add components/pes/takvim/PoZinciri.tsx components/pes/takvim/GanttSatirlari.tsx
git commit -m "feat(takvim): PO satiri — asama zinciri, malzeme kilometre taslari, durum rozetleri"
```

---

### Task 11: Beş sekmeli yan panel

**Files:**
- Create: `components/pes/takvim/PoPaneli.tsx`
- Modify: `components/pes/takvim/GanttSatirlari.tsx`

- [x] **Step 1: Paneli yaz**

Sekmeler ve kaynakları:

| Sekme | Kaynak | Merkez | Atölye |
|---|---|---|---|
| Günlük plan | `gunlukPlan()` + `gunluk` satırları | okur | yazar |
| Zincir | `asamalar` | okur | okur |
| Malzeme | `malzemeler` | okur | `gelis_tarihi`, `gelen_miktar` yazar |
| Çekme testi | `testler` | okur | yazar |
| Konular | `work_order_journal` | yazar | yazar |

Günlük plan tablosu dört sütun: Gün, Plan, Gerçek, Fark. Geçmiş günlerde Gerçek alanı açılır, gelecek günlerde kapalı. Değişiklikte `PUT /api/pes/atamalar/<id>/gunluk` çağrılır ve `plan_adet` null gönderilerek elle giriş kaldırılabilir.

Panel açık değilken DOM'da tutulmasın; `aria-hidden` ve `hidden` birlikte kullanılsın.

- [x] **Step 2: Konular sekmesi için journal ucu ekle**

`work_order_journal` tablosu 017'de var ama okuma ucu yoksa `app/api/pes/work-orders/[id]/journal/route.ts` ekle:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const wo = parseInt(params.id)
  if (!Number.isInteger(wo)) return NextResponse.json({ error: 'Geçersiz iş emri' }, { status: 400 })
  const kayitlar = await sql`
    SELECT j.id, j.tip, j.kategori, j.baslik, j.aciklama, j.oneri, j.yazan,
           j.tarih::text, ps.code AS asama_kodu
    FROM work_order_journal j
    LEFT JOIN production_stage ps ON ps.id = j.stage_id
    WHERE j.work_order_id = ${wo}
    ORDER BY j.tarih DESC, j.id DESC`
  return NextResponse.json({ kayitlar })
})
```

Önce `grep -rn "work_order_journal" app/api` ile mevcut uç olup olmadığına bak; varsa bu adımı atla.

- [x] **Step 3: Panelde plan düzenlemeyi dene**

Atölye rolüyle bir siparişin gününe 1800 yaz.
Expected: Bitiş tarihi anında yeniden hesaplanır, kalan adet arkadaki günlere kayar, elle yazılan gün `elle` rozeti alır.

- [x] **Step 4: Commit**

```bash
git add components/pes/takvim/PoPaneli.tsx components/pes/takvim/GanttSatirlari.tsx \
        "app/api/pes/work-orders/[id]/journal/route.ts"
git commit -m "feat(takvim): bes sekmeli PO paneli — plan, zincir, malzeme, cekme testi, konular"
```

---

### Task 12: Aylık doluluk matrisi

**Files:**
- Create: `components/pes/takvim/DolulukMatrisi.tsx`
- Modify: `components/pes/takvim/TakvimSayfasi.tsx`

- [ ] **Step 1: Matrisi yaz**

Satırlar atölye (tedarik müdürlüğüne göre gruplu), kolonlar ay. Hücre `aylikDoluluk()` çağrısının `oran`'ı.

```tsx
const hucre = aylikDoluluk(ay, atamalar, ctx, gercekler)
// null → "veri yok", gri. %0 ile aynı görünmemeli.
```

Satır sonunda üç sayı: yıllık toplam kapasite, yerleşen adet, boş kalan adet. Boş adede göre sıralanabilir.

Hücreye tıklamak `kip`'i `'ay'` yapar ve dönemi o aya taşır.

Matris kipinde veri çekme aralığı bir aydan bir yıla çıkar; `TakvimSayfasi` içindeki `aralik` hesabı kipe göre dallanmalı:

```ts
const aralik = useMemo(() => (
  kip === 'matris'
    ? { baslangic: `${ay.y}-01-01`, bitis: `${ay.y}-12-31` }
    : ayAraligi(ay.y, ay.m)
), [ay, kip])
```

- [ ] **Step 2: Bir yıllık veri hacmini ölç**

Matris kipini aç, tarayıcı ağ sekmesinde `doluluk` isteğinin süresini ve gövde boyutunu not et.
Expected: 131 atölye × 12 ay için yanıt birkaç MB'ı aşmamalı ve 2 saniyenin altında dönmeli. Aşıyorsa uç tarafında aylık toplama yapmak gerekir — o zaman bu adımı bir görev olarak ayır, tahmin etme.

- [ ] **Step 3: Commit**

```bash
git add components/pes/takvim/DolulukMatrisi.tsx components/pes/takvim/TakvimSayfasi.tsx
git commit -m "feat(takvim): aylik doluluk matrisi"
```

---

### Task 13: Hücre menüsü ve sürükle-bırak

**Files:**
- Modify: `components/pes/takvim/GanttSatirlari.tsx`

- [ ] **Step 1: Boş hücre menüsünü ekle**

Yalnız merkez rolünde. Üç eylem:
- *Rezerve et* → `POST /api/pes/rezerve`, sahip ve geçerlilik zorunlu alan.
- *Sipariş yerleştir* → `/pes/siparis-yerlestir`'e atölye, bant ve tarih önseçili yönlendir. Sihirbazı kopyalama; aşama zinciri mantığı tek yerde kalmalı.
- *Kapasite gir* → `PUT /api/pes/workshops/<id>/kapasite-gun`, tarih aralığı ve sebep sorar.

- [ ] **Step 2: Blok taşımayı ekle**

HTML5 sürükle-bırak yeterli; kütüphane ekleme. Bırakma anında hedef günün doluluğunu `gunlukDoluluk` ile hesapla; aşıyorsa kırmızı gösterip onay iste.

Taşıma `work_order_stage_atama.line_id` ve `plan_baslangic`'i günceller; `plan_bitis` sunucuda `planBitisi()` ile yeniden hesaplanır. Elle girilen `plan_adet` satırlarına DOKUNMA — rampa korunur (4. bölüm varsayımı).

Bunun için `PATCH /api/pes/atamalar/[id]` ucu gerekir:

```ts
export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = parseInt(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz atama' }, { status: 400 })
  const { lineId, planBaslangic } = await req.json()

  const [g] = await sql`
    UPDATE work_order_stage_atama
    SET line_id = COALESCE(${lineId ?? null}, line_id),
        plan_baslangic = COALESCE(${planBaslangic ?? null}, plan_baslangic)
    WHERE id = ${id}
    RETURNING id, line_id, plan_baslangic::text, adet`
  if (!g) return NextResponse.json({ error: 'Atama bulunamadı' }, { status: 404 })

  /* plan_bitis TÜRETİLİR (K4) — istemciden gelen değere asla güvenilmez. */
  const ctx = await atolyeBaglamiYukle(sql, g.line_id)
  const elle = await elleplanYukle(sql, id)
  const yeniBitis = planBitisi(
    { atamaId: id, lineId: g.line_id, adet: g.adet, planBaslangic: g.plan_baslangic, elleplan: elle },
    ctx,
  )
  await sql`UPDATE work_order_stage_atama SET plan_bitis = ${yeniBitis} WHERE id = ${id}`

  return NextResponse.json({ ok: true, planBitis: yeniBitis })
})
```

Üstteki iki yardımcı `lib/pes/bant-doluluk-veri.ts` içinde yaşar; hem bu uç hem
`doluluk` ucu aynı koddan okusun:

```ts
import type postgres from 'postgres'
import type { HesapBaglami, BantTanim, BlokTanim } from './bant-doluluk'

/** Bandın atölyesinin hesap bağlamını veritabanından kurar. */
export async function atolyeBaglamiYukle(
  sql: postgres.Sql, lineId: number,
): Promise<HesapBaglami> {
  const [bant] = await sql`SELECT workshop_id FROM production_line WHERE id = ${lineId}`
  if (!bant) return { bantlar: [], bloklar: [], override: () => null }

  const bantSatirlari = await sql`
    SELECT id, daily_target, is_active FROM production_line
    WHERE workshop_id = ${bant.workshop_id}`
  const bantlar: BantTanim[] = bantSatirlari.map(b => ({
    lineId: b.id as number,
    dailyTarget: b.daily_target as number,
    aktif: b.is_active as boolean,
  }))

  const blokSatirlari = await sql`
    SELECT ls.line_id, ls.tip, ls.adet,
           ls.baslangic_tarihi::text, ls.bitis_tarihi::text
    FROM line_schedule ls
    JOIN production_line pl ON pl.id = ls.line_id
    WHERE pl.workshop_id = ${bant.workshop_id}`
  const bloklar: BlokTanim[] = blokSatirlari.map(b => ({
    lineId: b.line_id as number,
    tip: b.tip as BlokTanim['tip'],
    adet: b.adet as number | null,
    baslangic: b.baslangic_tarihi as string,
    bitis: b.bitis_tarihi as string,
  }))

  const kapasiteSatirlari = await sql`
    SELECT tarih::text, gunluk_kapasite FROM workshop_kapasite_gun
    WHERE workshop_id = ${bant.workshop_id}`
  const harita = new Map<string, number>(
    kapasiteSatirlari.map(k => [k.tarih as string, k.gunluk_kapasite as number]),
  )

  return { bantlar, bloklar, override: (t) => harita.get(t) ?? null }
}

/** Atamanın elle girilmiş günlük planları. */
export async function elleplanYukle(
  sql: postgres.Sql, atamaId: number,
): Promise<Record<string, number>> {
  const satirlar = await sql`
    SELECT tarih::text, plan_adet FROM work_order_gunluk_uretim
    WHERE atama_id = ${atamaId} AND plan_adet IS NOT NULL`
  return Object.fromEntries(
    satirlar.map(s => [s.tarih as string, s.plan_adet as number]),
  )
}
```

- [ ] **Step 3: Taşımanın rampayı koruduğunu doğrula**

Elle plan girilmiş bir siparişi başka banda taşı, paneli aç.
Expected: `elle` rozetli günler aynı değerlerle duruyor; yalnız otomatik günler yeni bant payına göre değişmiş.

- [ ] **Step 4: Commit**

```bash
git add components/pes/takvim/GanttSatirlari.tsx "app/api/pes/atamalar/[id]/route.ts" \
        lib/pes/bant-doluluk-veri.ts
git commit -m "feat(takvim): hucre menusu ve blok tasima"
```

---

## Faz E — Atölye girişleri

### Task 14: Atölye günlük plan ve gerçek girişi

**Files:**
- Modify: `app/workshop/gunluk-uretim/page.tsx`

- [ ] **Step 1: Plan sütununu ekle**

Ekran bugün yalnız gerçekleşeni alıyor. Plan sütunu eklenir; varsayılan değer `bantPayi()` sonucudur ve gri gösterilir. Atölye yazdığında koyulaşır ve `elle` rozeti alır.

`PUT /api/pes/atamalar/<id>/gunluk` çağrılır. `planAdet: null` göndermek elle girişi kaldırır.

- [ ] **Step 2: Sayfa metnini güncelle**

Mevcut metin "Girmek zorunlu değil — girilirse siparişin plan/gerçek karşılaştırması çıkar" diyor. Artık plan da buradan giriliyor; metni buna göre yaz: plan girilmezse bandın varsayılan payı kullanılır, gerçekleşen isteğe bağlı kalır.

- [ ] **Step 3: Atölye hesabıyla dene**

Atölye kullanıcısıyla gir, kendi bandına plan ve gerçek yaz, sonra başka atölyenin atama id'sine `PUT` dene.
Expected: Kendi bandı yazılır; başka atölyenin atamasında 404 (RLS satırı göstermiyor).

- [ ] **Step 4: Commit**

```bash
git add app/workshop/gunluk-uretim/page.tsx
git commit -m "feat(atolye): gunluk uretim ekranina plan sutunu"
```

---

### Task 15: Malzeme geliş tarihi ve gelen miktar

**Files:**
- Modify: `app/workshop/is-emri/[id]/page.tsx`
- Modify: `app/api/pes/work-orders/[id]/materials/route.ts`

- [ ] **Step 1: API'ye `gelen_miktar` ekle**

`app/api/pes/work-orders/[id]/materials/route.ts` içindeki INSERT'e ve `app/api/pes/work-orders/material/route.ts` içindeki UPDATE'e `gelen_miktar` alanını ekle. Mevcut `COALESCE(${body.x ?? null}, x)` desenini izle.

- [ ] **Step 2: Ekrana sütun ekle**

Malzeme tablosuna "Gelen" sütunu; `gelen_miktar < miktar` ve `gelis_tarihi` doluysa fark kırmızı gösterilir (`−1.200 m` gibi).

- [ ] **Step 3: Eksik gelen kumaşın işaretlendiğini doğrula**

Bir malzemeye `miktar: 3800`, `gelen_miktar: 2600`, `durum: 'Eksik'` yaz, takvimde o PO'nun satırına bak.
Expected: PO satırında `Kumaş eksik` rozeti kırmızı; panelde Malzeme sekmesinde `−1.200` görünüyor.

- [ ] **Step 4: Commit**

```bash
git add "app/workshop/is-emri/[id]/page.tsx" \
        "app/api/pes/work-orders/[id]/materials/route.ts" \
        app/api/pes/work-orders/material/route.ts
git commit -m "feat(atolye): malzemede gelen miktar ve eksik isaretlemesi"
```

---

### Task 16: Çekme testi girişi

**Files:**
- Create: `app/api/pes/work-orders/[id]/cekme-testi/route.ts`
- Modify: `app/workshop/is-emri/[id]/page.tsx`

- [ ] **Step 1: Ucu yaz**

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Kumaş çekme testi (K11). Kumaş geldikten SONRA, kesim planlanmadan
 * ÖNCE yapılır. Çekme yüzdeleri negatiftir — kumaş küçülür.
 */
const SONUCLAR = new Set(['UYGUN', 'RİSKLİ', 'RED', 'BEKLIYOR'])

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const wo = parseInt(params.id)
  if (!Number.isInteger(wo)) return NextResponse.json({ error: 'Geçersiz iş emri' }, { status: 400 })
  const testler = await sql`
    SELECT id, tarih::text, yikama_sayisi, en_cekme_pct, boy_cekme_pct,
           may_kaymasi_pct, sonuc, yapan, notlar
    FROM kumas_cekme_testi WHERE work_order_id = ${wo}
    ORDER BY tarih DESC, id DESC`
  return NextResponse.json({ testler })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const wo = parseInt(params.id)
  if (!Number.isInteger(wo)) return NextResponse.json({ error: 'Geçersiz iş emri' }, { status: 400 })

  const b = await req.json()
  if (!b.tarih || !/^\d{4}-\d{2}-\d{2}$/.test(b.tarih)) {
    return NextResponse.json({ error: 'Test tarihi gerekli' }, { status: 400 })
  }
  if (!SONUCLAR.has(b.sonuc)) {
    return NextResponse.json({ error: 'Sonuç UYGUN, RİSKLİ, RED ya da BEKLIYOR olmalı' }, { status: 400 })
  }

  const [w] = await sql`SELECT workshop_id FROM work_order WHERE id = ${wo}`
  if (!w) return NextResponse.json({ error: 'İş emri bulunamadı' }, { status: 404 })

  const sayi = (v: unknown) =>
    v === null || v === undefined || v === '' ? null : Number(String(v).replace(',', '.'))

  const [satir] = await sql`
    INSERT INTO kumas_cekme_testi ${sql({
      work_order_id: wo,
      tenant_id: tenant.tenantId,
      workshop_id: w.workshop_id,
      tarih: b.tarih,
      yikama_sayisi: sayi(b.yikamaSayisi),
      en_cekme_pct: sayi(b.enCekme),
      boy_cekme_pct: sayi(b.boyCekme),
      may_kaymasi_pct: sayi(b.mayKaymasi),
      sonuc: b.sonuc,
      yapan: b.yapan ? String(b.yapan) : null,
      notlar: b.notlar ? String(b.notlar) : null,
    })}
    RETURNING id`
  return NextResponse.json({ ok: true, id: satir.id })
})
```

- [ ] **Step 2: İş emri ekranına sekme ekle**

Altı alan: test tarihi, yıkama sayısı, en çekmesi, boy çekmesi, may kayması, sonuç, yapan. Renk haslığı ve gramaj YOK — K11 bu turda kapsam dışı bıraktı.

- [ ] **Step 3: Riskli testin takvimde göründüğünü doğrula**

`boyCekme: -5.6`, `mayKaymasi: 3.8`, `sonuc: 'RİSKLİ'` gir, takvimde o PO'ya bak.
Expected: PO satırında `Çekme riskli` rozeti kırmızı; panelde Çekme testi sekmesinde uyarı kutusu çıkıyor.

- [ ] **Step 4: Tüm testleri ve derlemeyi çalıştır**

Run: `npm test && npm run lint && npm run build`
Expected: Testler geçer, lint temiz, derleme başarılı.

- [ ] **Step 5: Commit**

```bash
git add "app/api/pes/work-orders/[id]/cekme-testi/route.ts" "app/workshop/is-emri/[id]/page.tsx"
git commit -m "feat(atolye): kumas cekme testi girisi"
```

---

## Kapanış

- [ ] **Tüm doğrulamaları son kez çalıştır**

```bash
npm test
npm run lint
npm run build
node scripts/verify_public_api.mjs
node scripts/verify_workshop_isolation.mjs
```

- [ ] **Dalı birleştirmeye hazırla**

`superpowers:finishing-a-development-branch` becerisini kullan.

---

## Spec kapsama kontrolü

| Spec bölümü | Görev |
|---|---|
| K1, K2 kapasite ve pay | Task 2 |
| K3 atölye girişi | Task 8, 14 |
| K4 türetilmiş bitiş | Task 3, 13 |
| K5 rezerve | Task 1, 7 |
| K6 blok görseli | Task 9 |
| K7 satır hiyerarşisi | Task 9 |
| K8, K9 aşama zinciri | Task 1 (katalog), 10 |
| K10 malzeme | Task 1, 15 |
| K11 çekme testi | Task 1, 16 |
| K12 risk dökümanı işareti | Task 10 (yalnız rozet) |
| K13 Pazar kapalı | Task 2 |
| K14 kompakt matris | Task 12 |
| §3.7 033 boşluğu | Task 1 |
| §4 hesap kuralları | Task 2, 3, 4 |
| §5.4 etkileşim | Task 11, 13 |
| §5.5 filtreler | Task 5, 9 |
| §6 roller | Task 8 (RLS), 14 |
| §8 doğrulama | Task 1, 16, Kapanış |
