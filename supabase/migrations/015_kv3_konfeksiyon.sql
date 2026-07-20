-- ============================================================
-- 015: konfeksiyon_v3 — Kumaş > Ürün > Özellik > Parça > Grup > İşlem
-- Kaynak: konfeksiyon_v3_final.xlsx (URUN, ISLEM_KATALOGU, URUN_ISLEM)
-- ============================================================

-- Ürün kataloğu (Kumaş + Ürün + Özellik kombinasyonları)
CREATE TABLE IF NOT EXISTS kv3_urun (
  id             SERIAL PRIMARY KEY,
  kumas          VARCHAR(50)  NOT NULL,
  urun           VARCHAR(100) NOT NULL,
  ozellik        VARCHAR(100),
  parca_sayisi   INTEGER      DEFAULT 0,
  islem_sayisi   INTEGER      DEFAULT 0,
  created_at     TIMESTAMPTZ  DEFAULT now(),
  UNIQUE(kumas, urun, ozellik)
);
CREATE INDEX IF NOT EXISTS idx_kv3_urun_kumas ON kv3_urun(kumas);
CREATE INDEX IF NOT EXISTS idx_kv3_urun_urun ON kv3_urun(urun);

-- Atomik işlem kataloğu (makine tipi sahadan doldurulacak)
CREATE TABLE IF NOT EXISTS kv3_islem_katalogu (
  id             SERIAL PRIMARY KEY,
  islem_adi      VARCHAR(400) NOT NULL UNIQUE,
  makine_tipi    VARCHAR(100),
  created_at     TIMESTAMPTZ  DEFAULT now()
);

-- Ürün × Parça × Grup × İşlem kırılımı + MTM ölçümleri
CREATE TABLE IF NOT EXISTS kv3_urun_islem (
  id             BIGSERIAL PRIMARY KEY,
  urun_id        INTEGER      NOT NULL REFERENCES kv3_urun(id) ON DELETE CASCADE,
  parca          VARCHAR(400) NOT NULL,
  grup           VARCHAR(400),
  islem_adi      VARCHAR(400) NOT NULL,
  mtm_sn         DECIMAL(8,3),
  min_sn         DECIMAL(8,3),
  max_sn         DECIMAL(8,3),
  orneklem       INTEGER,
  guven          VARCHAR(20),         -- SAĞLAM | TEK | DOĞRULA
  created_at     TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kv3_ui_urun ON kv3_urun_islem(urun_id);
CREATE INDEX IF NOT EXISTS idx_kv3_ui_urun_parca ON kv3_urun_islem(urun_id, parca);
CREATE INDEX IF NOT EXISTS idx_kv3_ui_islem ON kv3_urun_islem(islem_adi);

-- eder_model → konfeksiyon_v3 bağlantısı
ALTER TABLE eder_model
  ADD COLUMN IF NOT EXISTS kv3_urun_id       INTEGER REFERENCES kv3_urun(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_parcalar JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_eder_model_kv3 ON eder_model(kv3_urun_id);

-- eder_model workshop_id zorunluluğu kaldırıldı (merkez tarafında da model açılabilir)
-- Zaten migration 007'de nullable olarak tanımlanmış — doğrulama
ALTER TABLE eder_model ALTER COLUMN workshop_id DROP NOT NULL;

-- v3 tabanlı model özet view
CREATE OR REPLACE VIEW v_eder_model_v3_ozet AS
WITH model_sure AS (
  SELECT
    em.id AS model_id,
    COALESCE(SUM(kui.mtm_sn), 0) AS toplam_sure_sn,
    COUNT(DISTINCT kui.parca) AS parca_sayisi,
    COUNT(*) AS islem_sayisi
  FROM eder_model em
  LEFT JOIN kv3_urun_islem kui ON kui.urun_id = em.kv3_urun_id
    AND (
      em.selected_parcalar = '[]'::jsonb
      OR em.selected_parcalar @> to_jsonb(kui.parca)
    )
  WHERE em.kv3_urun_id IS NOT NULL
  GROUP BY em.id
)
SELECT
  em.id AS model_id,
  em.workshop_id,
  em.model_adi,
  em.plm_id,
  em.siparis_adedi,
  em.bolge,
  em.donem,
  em.gunluk_calisma_sn,
  em.hedef_sure_sn,
  em.kv3_urun_id,
  em.selected_parcalar,
  em.created_at,
  em.updated_at,
  ku.kumas,
  ku.urun,
  ku.ozellik,
  ku.parca_sayisi AS katalog_parca_sayisi,
  ku.islem_sayisi AS katalog_islem_sayisi,
  COALESCE(ms.toplam_sure_sn, 0) AS toplam_sure_sn,
  COALESCE(ms.toplam_sure_sn, 0) / 60.0 AS toplam_sure_dk,
  COALESCE(ms.parca_sayisi, 0) AS secili_parca_sayisi,
  COALESCE(ms.islem_sayisi, 0) AS secili_islem_sayisi,
  dm.dk_maliyet_tl,
  (COALESCE(ms.toplam_sure_sn, 0) / 60.0) * COALESCE(dm.dk_maliyet_tl, 0) AS eder_maliyet_tl
FROM eder_model em
LEFT JOIN kv3_urun ku ON em.kv3_urun_id = ku.id
LEFT JOIN model_sure ms ON ms.model_id = em.id
LEFT JOIN dk_maliyet dm ON dm.donem = em.donem AND dm.bolge = em.bolge
WHERE em.kv3_urun_id IS NOT NULL;
