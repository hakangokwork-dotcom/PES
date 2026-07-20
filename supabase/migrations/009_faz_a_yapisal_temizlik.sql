-- ============================================================
-- 009: Faz A - Yapisal Temizlik
-- Model Birlestirme, FK Guclendirme, Scoring Alanlari
-- ============================================================

-- 1. MODEL BIRLESTIRME
ALTER TABLE model_library ADD COLUMN IF NOT EXISTS eder_model_id INTEGER REFERENCES eder_model(id) ON DELETE SET NULL;
ALTER TABLE model_library ADD COLUMN IF NOT EXISTS workshop_id INTEGER REFERENCES workshop(id) ON DELETE CASCADE;
ALTER TABLE model_library ADD COLUMN IF NOT EXISTS bottleneck_sec NUMERIC(6,2);
ALTER TABLE model_library ADD COLUMN IF NOT EXISTS plm_id VARCHAR(50);
ALTER TABLE eder_model ADD COLUMN IF NOT EXISTS model_library_id INTEGER REFERENCES model_library(id) ON DELETE SET NULL;

-- 2. URETIM FK GUCLENDIRME
ALTER TABLE monthly_production ADD COLUMN IF NOT EXISTS eder_model_id INTEGER REFERENCES eder_model(id) ON DELETE SET NULL;
ALTER TABLE quality_record ADD COLUMN IF NOT EXISTS model_code VARCHAR(30);
ALTER TABLE quality_record ADD COLUMN IF NOT EXISTS process_id INTEGER REFERENCES master_process(id) ON DELETE SET NULL;
ALTER TABLE downtime_record ADD COLUMN IF NOT EXISTS workshop_id INTEGER REFERENCES workshop(id) ON DELETE CASCADE;

-- 3. SCORING ALANLARI
ALTER TABLE supplier_score ADD COLUMN IF NOT EXISTS on_time_delivery_pct NUMERIC(5,1);
ALTER TABLE supplier_score ADD COLUMN IF NOT EXISTS cost_efficiency_pct NUMERIC(5,1);

-- 4. INDEKSLER
CREATE INDEX IF NOT EXISTS idx_model_library_eder ON model_library(eder_model_id);
CREATE INDEX IF NOT EXISTS idx_model_library_workshop ON model_library(workshop_id);
CREATE INDEX IF NOT EXISTS idx_monthly_prod_eder ON monthly_production(eder_model_id);
CREATE INDEX IF NOT EXISTS idx_quality_model ON quality_record(model_code);
CREATE INDEX IF NOT EXISTS idx_downtime_workshop ON downtime_record(workshop_id);

-- 5. SYNC TRIGGER: eder_model kayit olunca model_library guncelle
CREATE OR REPLACE FUNCTION sync_eder_to_model_library()
RETURNS TRIGGER AS $$
DECLARE
  v_total_sam_min NUMERIC(6,3);
  v_bottleneck_sec NUMERIC(6,2);
  v_ml_id INTEGER;
BEGIN
  SELECT
    COALESCE(SUM(eao.sure_sn), 0) / 60.0,
    COALESCE(MAX(eao.sure_sn / NULLIF(eao.kisi_sayisi, 0)), 0)
  INTO v_total_sam_min, v_bottleneck_sec
  FROM eder_operasyon_grubu eog
  JOIN eder_alt_operasyon eao ON eao.grup_id = eog.id
  WHERE eog.model_id = NEW.id;

  SELECT id INTO v_ml_id FROM model_library WHERE eder_model_id = NEW.id LIMIT 1;

  IF v_ml_id IS NOT NULL THEN
    UPDATE model_library SET
      sam_minutes = v_total_sam_min,
      bottleneck_sec = v_bottleneck_sec,
      name = NEW.model_adi,
      plm_id = NEW.plm_id,
      workshop_id = NEW.workshop_id
    WHERE id = v_ml_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_eder_to_ml ON eder_model;
CREATE TRIGGER trg_sync_eder_to_ml
  AFTER INSERT OR UPDATE ON eder_model
  FOR EACH ROW EXECUTE FUNCTION sync_eder_to_model_library();
