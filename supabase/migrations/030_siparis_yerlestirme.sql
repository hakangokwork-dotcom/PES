-- ============================================================
-- Migration 030 — Sipariş yerleştirme çekirdeği
-- ============================================================
--
-- Kaynak tasarım: docs/superpowers/specs/2026-08-06-siparis-yerlestirme-design.md
--
-- NE EKLİYOR:
--   1. work_order_stage.workshop_id — aşama başka atölyede olabilir (K4).
--      NULL ise siparişin atölyesi; dolu ve farklıysa DIŞ ATÖLYE.
--   2. work_order_stage_atama — bir aşamanın bant tahsisleri (K1, K9).
--      3 banda bölünen dikim = 3 satır. Bant bazlı olmayan aşamalarda
--      hiç satır olmaz; tarihleri doğrudan work_order_stage'de durur.
--   3. work_order_gunluk_uretim — isteğe bağlı günlük adet girişi (K6).
--   4. workshop_stage_capacity — atölye x aşama günlük kapasite (K2).
--      ELLE girilir; sistem çıkarmaz.
--
-- line_schedule'IN ANLAMI DARALIYOR: bundan sonra yalnız iş emri DIŞI
-- bloklar (bakım, izin, tatil). İş emri doluluğu artık atama tablosundan
-- okunur. Aynı bilgi iki tabloda dursaydı zamanla birbirini tutmazdı.
-- Tablo boş olduğu için bu daraltmanın veri maliyeti yok.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. Aşama başka atölyede olabilir ----------
ALTER TABLE work_order_stage
    ADD COLUMN IF NOT EXISTS workshop_id INTEGER REFERENCES workshop(id) ON DELETE SET NULL;

COMMENT ON COLUMN work_order_stage.workshop_id IS
'Aşamayı yapan atölye. NULL = siparişin atölyesi. Farklı bir değer = dış atölye (UKP/yıkama dışarı çıktığında).';

CREATE INDEX IF NOT EXISTS idx_wos_workshop ON work_order_stage(workshop_id)
    WHERE workshop_id IS NOT NULL;

-- ---------- 2. Bant tahsisleri ----------
CREATE TABLE IF NOT EXISTS work_order_stage_atama (
    id                SERIAL PRIMARY KEY,
    stage_row_id      INTEGER NOT NULL REFERENCES work_order_stage(id) ON DELETE CASCADE,
    tenant_id         UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    line_id           INTEGER NOT NULL REFERENCES production_line(id) ON DELETE CASCADE,

    adet              INTEGER NOT NULL CHECK (adet > 0),
    plan_baslangic    DATE NOT NULL,
    plan_bitis        DATE NOT NULL,
    gercek_baslangic  DATE,
    gercek_bitis      DATE,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT wosa_tarih_sirasi CHECK (plan_bitis >= plan_baslangic),
    UNIQUE (stage_row_id, line_id)
);

COMMENT ON TABLE work_order_stage_atama IS
'Bir aşamanın bant tahsisi. Sipariş birden çok banda bölünürse her bant bir satır. Kesim/yıkama/UKP bant bazlı değil — onlarda satır olmaz.';

CREATE INDEX IF NOT EXISTS idx_wosa_line_tarih ON work_order_stage_atama(line_id, plan_baslangic, plan_bitis);
CREATE INDEX IF NOT EXISTS idx_wosa_stage ON work_order_stage_atama(stage_row_id);

DROP TRIGGER IF EXISTS trg_wosa_updated ON work_order_stage_atama;
CREATE TRIGGER trg_wosa_updated BEFORE UPDATE ON work_order_stage_atama
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 3. Günlük üretim (isteğe bağlı) ----------
CREATE TABLE IF NOT EXISTS work_order_gunluk_uretim (
    id           SERIAL PRIMARY KEY,
    atama_id     INTEGER NOT NULL REFERENCES work_order_stage_atama(id) ON DELETE CASCADE,
    tenant_id    UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    tarih        DATE NOT NULL,
    adet         INTEGER NOT NULL DEFAULT 0 CHECK (adet >= 0),
    hatali_adet  INTEGER NOT NULL DEFAULT 0 CHECK (hatali_adet >= 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (atama_id, tarih)
);

COMMENT ON TABLE work_order_gunluk_uretim IS
'Günlük gerçekleşen adet. İSTEĞE BAĞLI: girilirse plan/gerçek eğrisi çıkar, girilmezse aşamanın başla/bitir tarihleri yeterlidir.';

-- ---------- 4. Atölye x aşama kapasitesi ----------
CREATE TABLE IF NOT EXISTS workshop_stage_capacity (
    workshop_id      INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    stage_id         INTEGER NOT NULL REFERENCES production_stage(id) ON DELETE CASCADE,
    tenant_id        UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    gunluk_kapasite  INTEGER NOT NULL CHECK (gunluk_kapasite > 0),
    notlar           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workshop_id, stage_id)
);

COMMENT ON TABLE workshop_stage_capacity IS
'Atölyenin bir aşamadaki günlük kapasitesi (adet/gün). ELLE girilir. Kaydı yoksa o aşamanın tarihleri elle yazılır — sistem kapasite tahmin etmez.';

DROP TRIGGER IF EXISTS trg_wsc_updated ON workshop_stage_capacity;
CREATE TRIGGER trg_wsc_updated BEFORE UPDATE ON workshop_stage_capacity
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 5. line_schedule daralıyor ----------
COMMENT ON TABLE line_schedule IS
'YALNIZ iş emri DIŞI bloklar: bakım, izin, tatil, blok. İş emri doluluğu work_order_stage_atama''dan okunur (030).';

-- ---------- 6. RLS — 019b tenant_isolation deseni ----------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'work_order_stage_atama','work_order_gunluk_uretim','workshop_stage_capacity'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL
                USING (tenant_id = current_tenant_id() OR is_internal_admin())',
            t || '_tenant_isolation', t
        );
    END LOOP;
END $$;

-- 028: anon/authenticated public şemada yetkisiz; yeni tablolar da öyle kalsın.
REVOKE ALL ON work_order_stage_atama, work_order_gunluk_uretim, workshop_stage_capacity
    FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON
                 work_order_stage_atama, work_order_gunluk_uretim, workshop_stage_capacity
                 TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE
                 work_order_stage_atama_id_seq, work_order_gunluk_uretim_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT count(*) FROM workshop_stage_capacity;   -- 0 (elle doldurulacak)
-- node scripts/verify_public_api.mjs              -- yeni tablolar 401 dönmeli
--
-- ROLLBACK:
--   BEGIN;
--   DROP TABLE IF EXISTS work_order_gunluk_uretim;
--   DROP TABLE IF EXISTS work_order_stage_atama;
--   DROP TABLE IF EXISTS workshop_stage_capacity;
--   ALTER TABLE work_order_stage DROP COLUMN IF EXISTS workshop_id;
--   COMMIT;
-- ============================================================
