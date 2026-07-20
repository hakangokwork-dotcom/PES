-- ============================================================
-- 007: Eder Maliyet Hesaplama Tabloları
-- ============================================================

-- Dakika Maliyet Değerleri (Bölgesel, Dönemsel)
CREATE TABLE IF NOT EXISTS dk_maliyet (
  id            SERIAL PRIMARY KEY,
  donem         VARCHAR(20)    NOT NULL,        -- '2026-04'
  bolge         SMALLINT       NOT NULL CHECK (bolge BETWEEN 1 AND 6),
  dk_maliyet_tl DECIMAL(6,2)   NOT NULL,
  created_at    TIMESTAMPTZ    DEFAULT now(),
  UNIQUE(donem, bolge)
);

-- Eder Modelleri (her model = bir maliyet hesaplama birimi)
CREATE TABLE IF NOT EXISTS eder_model (
  id              SERIAL PRIMARY KEY,
  workshop_id     INTEGER        REFERENCES workshop(id) ON DELETE CASCADE,
  model_adi       VARCHAR(100)   NOT NULL,
  plm_id          VARCHAR(50),
  siparis_adedi   INTEGER        DEFAULT 0,
  bolge           SMALLINT       NOT NULL CHECK (bolge BETWEEN 1 AND 6),
  donem           VARCHAR(20)    NOT NULL,        -- '2026-04'
  gunluk_calisma_sn INTEGER      DEFAULT 32400,   -- 9 saat
  hedef_sure_sn   DECIMAL(8,2)   DEFAULT 30,      -- hedef çevrim süresi
  created_at      TIMESTAMPTZ    DEFAULT now(),
  updated_at      TIMESTAMPTZ    DEFAULT now()
);

-- Operasyon Grupları
CREATE TABLE IF NOT EXISTS eder_operasyon_grubu (
  id          SERIAL PRIMARY KEY,
  model_id    INTEGER        NOT NULL REFERENCES eder_model(id) ON DELETE CASCADE,
  grup_adi    VARCHAR(100)   NOT NULL,
  sira_no     INTEGER        DEFAULT 0,
  created_at  TIMESTAMPTZ    DEFAULT now()
);

-- Alt Operasyonlar
CREATE TABLE IF NOT EXISTS eder_alt_operasyon (
  id             SERIAL PRIMARY KEY,
  grup_id        INTEGER        NOT NULL REFERENCES eder_operasyon_grubu(id) ON DELETE CASCADE,
  operasyon_adi  VARCHAR(150)   NOT NULL,
  sure_sn        DECIMAL(8,3)   NOT NULL CHECK (sure_sn > 0),
  kisi_sayisi    DECIMAL(4,2)   NOT NULL DEFAULT 1 CHECK (kisi_sayisi > 0),
  sira_no        INTEGER        DEFAULT 0,
  makine_tipi    VARCHAR(100),
  notlar         TEXT,
  created_at     TIMESTAMPTZ    DEFAULT now()
);

-- Atölye Teklifleri (fiyat karşılaştırma)
CREATE TABLE IF NOT EXISTS eder_atolye_teklif (
  id              SERIAL PRIMARY KEY,
  model_id        INTEGER        NOT NULL REFERENCES eder_model(id) ON DELETE CASCADE,
  atolye_adi      VARCHAR(100)   NOT NULL,
  teklif_fiyat_tl DECIMAL(10,2)  NOT NULL,
  notlar          TEXT,
  created_at      TIMESTAMPTZ    DEFAULT now()
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_eder_model_workshop ON eder_model(workshop_id);
CREATE INDEX IF NOT EXISTS idx_eder_model_donem ON eder_model(donem);
CREATE INDEX IF NOT EXISTS idx_eder_op_grup_model ON eder_operasyon_grubu(model_id);
CREATE INDEX IF NOT EXISTS idx_eder_alt_op_grup ON eder_alt_operasyon(grup_id);
CREATE INDEX IF NOT EXISTS idx_eder_teklif_model ON eder_atolye_teklif(model_id);

-- Seed: Nisan 2026 DK Maliyet Değerleri
INSERT INTO dk_maliyet (donem, bolge, dk_maliyet_tl) VALUES
  ('2026-04', 1, 6.30),
  ('2026-04', 2, 5.82),
  ('2026-04', 3, 5.82),
  ('2026-04', 4, 5.82),
  ('2026-04', 5, 5.62),
  ('2026-04', 6, 5.05),
  ('2026-01', 1, 6.00),
  ('2026-01', 2, 5.50),
  ('2026-01', 3, 5.50),
  ('2026-01', 4, 5.50),
  ('2026-01', 5, 5.31),
  ('2026-01', 6, 4.76)
ON CONFLICT (donem, bolge) DO UPDATE SET dk_maliyet_tl = EXCLUDED.dk_maliyet_tl;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_eder_model_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eder_model_updated ON eder_model;
CREATE TRIGGER trg_eder_model_updated
  BEFORE UPDATE ON eder_model
  FOR EACH ROW EXECUTE FUNCTION update_eder_model_updated_at();

-- View: Model Maliyet Özet
CREATE OR REPLACE VIEW v_eder_model_ozet AS
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
  COALESCE(SUM(eao.sure_sn), 0) AS toplam_sure_sn,
  COALESCE(SUM(eao.sure_sn), 0) / 60.0 AS toplam_sure_dk,
  COALESCE(SUM(eao.kisi_sayisi), 0) AS toplam_kisi,
  COALESCE(MAX(eao.sure_sn / eao.kisi_sayisi), 0) AS bottleneck_sn,
  dm.dk_maliyet_tl,
  (COALESCE(SUM(eao.sure_sn), 0) / 60.0) * COALESCE(dm.dk_maliyet_tl, 0) AS eder_maliyet_tl,
  CASE WHEN MAX(eao.sure_sn / eao.kisi_sayisi) > 0
    THEN em.gunluk_calisma_sn / MAX(eao.sure_sn / eao.kisi_sayisi)
    ELSE 0
  END AS gunluk_kapasite_bottleneck,
  CASE WHEN em.hedef_sure_sn > 0
    THEN em.gunluk_calisma_sn / em.hedef_sure_sn
    ELSE 0
  END AS gunluk_kapasite_hedef,
  CASE WHEN MAX(eao.sure_sn / eao.kisi_sayisi) > 0 AND SUM(eao.kisi_sayisi) > 0
    THEN (SUM(eao.sure_sn) / (MAX(eao.sure_sn / eao.kisi_sayisi) * SUM(eao.kisi_sayisi))) * 100
    ELSE 0
  END AS bant_verimlilik_pct
FROM eder_model em
LEFT JOIN eder_operasyon_grubu eog ON eog.model_id = em.id
LEFT JOIN eder_alt_operasyon eao ON eao.grup_id = eog.id
LEFT JOIN dk_maliyet dm ON dm.donem = em.donem AND dm.bolge = em.bolge
GROUP BY em.id, em.workshop_id, em.model_adi, em.plm_id, em.siparis_adedi,
         em.bolge, em.donem, em.gunluk_calisma_sn, em.hedef_sure_sn, dm.dk_maliyet_tl;
