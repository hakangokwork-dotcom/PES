-- ============================================================
-- Migration 059 — Üretim formları (kâğıt formların dijitali)
-- ============================================================
--
-- KAYNAK: "Tutulması Gereken Formlar Family.xlsx" — 19 sayfa: risk analizi,
-- makine bakım, kırık iğne, hat içi kalite, ara/final ölçü, düğme çekme,
-- çakım, metal dedektör (4), hata formları, AQL, çeki listesi.
--
-- TEK TABLO, JSONB GÖVDE: formların alanları lib/pes/formlar.ts'te tanımlı.
-- 19 ayrı tablo yerine bir tablo; form değişince migration gerekmez.
-- Sunucu kaydetmeden önce gövdeyi tanıma göre süzer (bilinmeyen alan girmez).
--
-- PO BAĞI: work_order_id seçmeli. Doluysa form o siparişe ait (ölçü, AQL,
-- çeki listesi…); boşsa atölyenin süreç kaydı (makine bakım, metal alan
-- giriş-çıkış…). Sipariş no / model / müşteri iş emrinden okunur, kopyalanmaz.
--
-- ORTAK KAYIT (054/055): atölye de merkez de yazar; kim girdi tetikleyiciyle
-- yazılır, araya giren değişiklik 409 ile durur.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS uretim_formu (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    workshop_id   INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    work_order_id INTEGER REFERENCES work_order(id) ON DELETE SET NULL,
    form_kodu     TEXT    NOT NULL,
    tarih         DATE    NOT NULL DEFAULT CURRENT_DATE,
    veri          JSONB   NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    giren_taraf   TEXT CHECK (giren_taraf IN ('atolye', 'merkez')),
    giren_eposta  TEXT,
    girildi_at    TIMESTAMPTZ
);

COMMENT ON TABLE uretim_formu IS
'059: atölye üretim formları. form_kodu ve veri yapısı lib/pes/formlar.ts. work_order_id NULL = süreç kaydı (PO dışı).';

CREATE INDEX IF NOT EXISTS idx_uf_atolye ON uretim_formu(workshop_id, form_kodu, tarih DESC);
CREATE INDEX IF NOT EXISTS idx_uf_po     ON uretim_formu(work_order_id) WHERE work_order_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_kayit_giren ON uretim_formu;
CREATE TRIGGER trg_kayit_giren
    BEFORE INSERT OR UPDATE ON uretim_formu
    FOR EACH ROW EXECUTE FUNCTION kayit_giren_yaz();

-- 035 deseni; workshop_id NOT NULL olduğundan "IS NULL" istisnası yok.
ALTER TABLE uretim_formu ENABLE ROW LEVEL SECURITY;
ALTER TABLE uretim_formu FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uretim_formu_tenant_isolation ON uretim_formu;
CREATE POLICY uretim_formu_tenant_isolation ON uretim_formu FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin())
    AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()));

REVOKE ALL ON uretim_formu FROM anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON uretim_formu TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE uretim_formu_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT form_kodu, count(*) FROM uretim_formu GROUP BY 1;
--
-- ROLLBACK
--   DROP TABLE IF EXISTS uretim_formu;
-- ============================================================
