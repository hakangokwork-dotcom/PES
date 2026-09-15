-- ============================================================
-- Migration 036 — Bant kapasite takvimi
-- ============================================================
--
-- Kaynak tasarım: docs/superpowers/specs/2026-09-15-bant-kapasite-takvimi-design.md
-- Uygulama planı:  docs/superpowers/plans/2026-09-15-bant-kapasite-takvimi.md
--
-- NE EKLİYOR:
--   1. line_schedule'a REZERVE tipi — sahip ve geçerlilik ZORUNLU (K5).
--   2. workshop_kapasite_gun — atölye TOPLAM kapasitesinin gün bazlı sapması.
--   3. work_order_gunluk_uretim.plan_adet — atölyenin yazdığı günlük plan (K3).
--      adet nullable oluyor: NULL = girilmedi, 0 = girildi ve sıfır üretim.
--   4. work_order_material.gelen_miktar — sipariş edilenle gelen farkı (K10).
--   5. kumas_cekme_testi — altı alan (K11).
--   6. production_stage katalog düzeltmesi (K9).
--   7. work_order_gunluk_uretim'in 033 atölye kısıtı boşluğu kapanıyor.
--
-- KAPASİTE KAYNAĞI DEĞİŞMİYOR: dikim kapasitesi bantların daily_target
-- toplamıdır. workshop_stage_capacity'de DIKIM satırı BİLEREK yoktur ve
-- bu migration onu eklemez.
--
-- UYGULAMA ÖNCESİ DURUM (ölçüldü):
--   work_order_gunluk_uretim 0 satır → DROP NOT NULL tamamen geri alınabilir
--   line_schedule            0 satır → 030'un daraltması veri maliyetsiz kaldı
--   BASKI/NAKIS              yok
--   zincir kurulmuş iş emri  1 tane  → katalog düzeltmesi mevcut zincirleri
--                                      değiştirmez, yalnız yeni kurulanları
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

-- Sahipsiz ya da süresiz rezerve YAZILAMAZ. Bu kısıt olmadan tablo birkaç
-- ay içinde kimsenin silmeye cesaret edemediği bloklarla dolar.
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
COMMENT ON COLUMN line_schedule.sahip IS
'REZERVE için rezerveyi açan kişi — kime sorulacağı belli olsun.';
COMMENT ON COLUMN line_schedule.gecerlilik_bitis IS
'REZERVE için son geçerlilik. Geçmiş rezerve ölü sayılır, panoda temizlenmesi istenir.';

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
'Atölyenin TOPLAM günlük kapasitesinin sabitten saptığı günler (toplu izin, kısa vardiya). Kayıt yoksa aktif bantların daily_target toplamı geçerlidir.';

-- ---------- 3. Günlük plan ----------
ALTER TABLE work_order_gunluk_uretim
    ADD COLUMN IF NOT EXISTS plan_adet INTEGER;

-- adet nullable OLMALI: plan satırları üretimden ÖNCE yazılır ve 0 ile
-- "henüz girilmedi" aynı şeye benzer. plan-gercek.ts'in "girilmemiş günü
-- 0 saymıyoruz" kuralı bu ayrımı kullanır.
ALTER TABLE work_order_gunluk_uretim ALTER COLUMN adet DROP NOT NULL;
ALTER TABLE work_order_gunluk_uretim ALTER COLUMN adet DROP DEFAULT;

ALTER TABLE work_order_gunluk_uretim DROP CONSTRAINT IF EXISTS wogu_plan_adet_pozitif;
ALTER TABLE work_order_gunluk_uretim ADD CONSTRAINT wogu_plan_adet_pozitif
    CHECK (plan_adet IS NULL OR plan_adet >= 0);

COMMENT ON TABLE work_order_gunluk_uretim IS
'Bir bant tahsisinin bir günü. plan_adet = atölyenin o gün için yazdığı plan, adet = gerçekleşen. adet NULL ise GİRİLMEDİ; 0 ise girildi ve sıfır üretim.';
COMMENT ON COLUMN work_order_gunluk_uretim.plan_adet IS
'Atölyenin elle yazdığı günlük plan. NULL ise bandın varsayılan payı kullanılır.';

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
-- Zincir: kesim → hazırlık → dikim → (yıkama/baskı/nakış) → UKP.
-- İlk dördü zorunlu; aradaki değişken aşamadan ürüne göre BİRİ girer ya da
-- hiçbiri. HAZIRLIK kesimden SONRA gelir — katalogda tersiydi.
UPDATE production_stage SET sira_no = 15, zorunlu = TRUE WHERE code = 'HAZIRLIK';

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
-- INSERT INTO line_schedule (line_id, tenant_id, baslangic_tarihi, bitis_tarihi, tip)
--   VALUES (1, '<tenant>', '2027-01-01', '2027-01-05', 'REZERVE');  -- CHECK hatası
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
--   ALTER TABLE work_order_gunluk_uretim DROP CONSTRAINT IF EXISTS wogu_plan_adet_pozitif;
--   ALTER TABLE work_order_gunluk_uretim DROP COLUMN IF EXISTS plan_adet;
--   UPDATE work_order_gunluk_uretim SET adet = 0 WHERE adet IS NULL;
--   ALTER TABLE work_order_gunluk_uretim ALTER COLUMN adet SET DEFAULT 0;
--   ALTER TABLE work_order_gunluk_uretim ALTER COLUMN adet SET NOT NULL;
--   ALTER TABLE line_schedule DROP CONSTRAINT IF EXISTS lsch_rezerve_sahipli;
--   ALTER TABLE line_schedule DROP CONSTRAINT IF EXISTS lsch_adet_pozitif;
--   DROP INDEX IF EXISTS idx_lsch_rezerve;
--   DELETE FROM line_schedule WHERE tip = 'REZERVE';
--   ALTER TABLE line_schedule DROP CONSTRAINT IF EXISTS line_schedule_tip_check;
--   ALTER TABLE line_schedule ADD CONSTRAINT line_schedule_tip_check
--       CHECK (tip IN ('WO','CHANGEOVER','BAKIM','İZİN','BLOK'));
--   ALTER TABLE line_schedule DROP COLUMN IF EXISTS adet,
--       DROP COLUMN IF EXISTS sahip, DROP COLUMN IF EXISTS gecerlilik_bitis;
--   UPDATE production_stage SET sira_no = 5, zorunlu = FALSE WHERE code = 'HAZIRLIK';
--   DELETE FROM production_stage WHERE code IN ('BASKI','NAKIS');
--   COMMIT;
-- ============================================================
