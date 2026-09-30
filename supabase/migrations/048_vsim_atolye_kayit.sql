-- ============================================================
-- Migration 048 — VSIM atölye kayıtları (hat/tesis + ürün grubu)
-- ============================================================
--
-- NE EKLİYOR:
--   1. vsim_tesis        — atölyenin kaydettiği hat/tesis yerleşimi
--                          (zemin, makineler, masalar, çalışanlar, taşıma ayarı)
--   2. vsim_urun_grubu   — atölyenin en sık ürettiği ürün grupları için
--                          adımlar ve MTM süreleri (akış + operasyonlar)
--
-- NEDEN: VSIM verisi bugün yalnız tarayıcıda (localStorage) duruyor; başka
--   cihazdan görülmüyor, tarayıcı temizlenince kayboluyor, merkez göremiyor.
--
-- GÖRÜNÜRLÜK: atölye yalnız KENDİ satırlarını görür/yazar; merkez oturumu
--   (current_workshop_id() NULL) kiracının tüm atölyelerini görür.
--   workshop_id NOT NULL — 035'in "OR workshop_id IS NULL" kalıbı YOK
--   (o kalıp NULL satırı her atölyeye açıyor, bkz. 037/038/039).
--
-- VERİ BİÇİMİ: JSONB — VSIM'in iç içe veri yapısı (mainOps/subOps/layouts)
--   olduğu gibi saklanır; şema sürümü satırda (sema_surum) durur.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS vsim_tesis (
    id                  SERIAL PRIMARY KEY,
    tenant_id           UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    workshop_id         INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    ad                  VARCHAR(120) NOT NULL,
    production_line_id  INTEGER REFERENCES production_line(id) ON DELETE SET NULL,
    varsayilan          BOOLEAN NOT NULL DEFAULT FALSE,
    sema_surum          INTEGER NOT NULL DEFAULT 1,
    -- { layout: {floor, items, transport, release, seed}, operators: [], machines: [] }
    veri                JSONB NOT NULL,
    oge_sayisi          INTEGER,
    olusturan           TEXT,
    guncelleyen         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vsim_tesis_boyut CHECK (octet_length(veri::text) < 3000000)
);
CREATE INDEX IF NOT EXISTS idx_vsim_tesis_ws ON vsim_tesis(workshop_id);
-- atölye başına en çok bir varsayılan
CREATE UNIQUE INDEX IF NOT EXISTS uq_vsim_tesis_varsayilan ON vsim_tesis(workshop_id) WHERE varsayilan;

CREATE TABLE IF NOT EXISTS vsim_urun_grubu (
    id                  SERIAL PRIMARY KEY,
    tenant_id           UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    workshop_id         INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    ad                  VARCHAR(120) NOT NULL,
    urun_tipi_id        INTEGER REFERENCES ref_urun_tipi(id) ON DELETE SET NULL,
    kaynak              VARCHAR(12) NOT NULL DEFAULT 'manuel'
                        CHECK (kaynak IN ('manuel', 'excel', 'referans')),
    varsayilan          BOOLEAN NOT NULL DEFAULT FALSE,
    sema_surum          INTEGER NOT NULL DEFAULT 1,
    -- { mainOps: [], subOps: [], settings: {}, meta: {} }
    veri                JSONB NOT NULL,
    adim_sayisi         INTEGER,
    toplam_sn           NUMERIC(10,2),
    olusturan           TEXT,
    guncelleyen         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vsim_urun_grubu_boyut CHECK (octet_length(veri::text) < 3000000)
);
CREATE INDEX IF NOT EXISTS idx_vsim_urun_grubu_ws ON vsim_urun_grubu(workshop_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vsim_urun_grubu_varsayilan ON vsim_urun_grubu(workshop_id) WHERE varsayilan;

-- ---------- RLS ----------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['vsim_tesis', 'vsim_urun_grubu'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_kapsam', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL
                USING ((tenant_id = current_tenant_id() OR is_internal_admin())
                       AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()))
                WITH CHECK ((tenant_id = current_tenant_id() OR is_internal_admin())
                       AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()))',
            t || '_kapsam', t);
    END LOOP;
END $$;

REVOKE ALL ON vsim_tesis, vsim_urun_grubu FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON vsim_tesis, vsim_urun_grubu TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE vsim_tesis_id_seq, vsim_urun_grubu_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK
-- BEGIN;
-- DROP TABLE IF EXISTS vsim_urun_grubu;
-- DROP TABLE IF EXISTS vsim_tesis;
-- COMMIT;
-- ============================================================
