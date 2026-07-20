-- ============================================================
-- 016: Modele özel operasyon listesi + ana grup sınıflandırma
-- Kullanıcı modeli oluşturduğunda katalogdan otomatik kopyalanır
-- Sonra add / remove / edit yapılabilir
-- ============================================================

CREATE TABLE IF NOT EXISTS eder_model_islem (
  id              SERIAL       PRIMARY KEY,
  model_id        INTEGER      NOT NULL REFERENCES eder_model(id) ON DELETE CASCADE,
  kv3_ui_id       BIGINT       REFERENCES kv3_urun_islem(id) ON DELETE SET NULL,
  ana_grup        VARCHAR(50),                         -- Ön Bant / Arka Bant / Montaj / UKP / Son Montaj / Yıkama
  parca           VARCHAR(400),
  grup            VARCHAR(400),
  islem_adi       VARCHAR(400) NOT NULL,
  makine_tipi     VARCHAR(100),
  mtm_sn          DECIMAL(8,3),                        -- Teorik (v3 kaynağından)
  cevrim_sn       DECIMAL(8,3),                        -- Pratik (kullanıcı editable, default=mtm)
  kisi_sayisi     DECIMAL(4,2) DEFAULT 1 CHECK (kisi_sayisi > 0),
  sira_no         INTEGER      DEFAULT 0,
  aktif           BOOLEAN      DEFAULT TRUE,
  notlar          TEXT,
  created_at      TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emi_model   ON eder_model_islem(model_id);
CREATE INDEX IF NOT EXISTS idx_emi_anagrup ON eder_model_islem(model_id, ana_grup, sira_no);

-- Ana grup sınıflandırma (parça + grup + işlem adı üzerinden basit heuristik)
CREATE OR REPLACE FUNCTION kv3_classify_ana_grup(
  parca TEXT, grup TEXT, islem TEXT
) RETURNS VARCHAR(50) AS $$
DECLARE
  s TEXT := LOWER(COALESCE(parca,'') || ' ' || COALESCE(grup,'') || ' ' || COALESCE(islem,''));
BEGIN
  IF s ~ '(^|[^a-z])(yıkama|yikama|taş|ton)([^a-z]|$)' THEN
    RETURN 'Yıkama';
  ELSIF s ~ '(^|[^a-z])(paça|ütü|utu|köprü|kopru|ukp|kalite|temizleme|çevirme)([^a-z]|$)' THEN
    RETURN 'UKP';
  ELSIF s ~ '(^|[^a-z])(son|bağlama|baglama|etiket|paket|asorti)([^a-z]|$)' THEN
    RETURN 'Son Montaj';
  ELSIF s ~ '(^|[^a-z])(arka|cop|ağ|ag)([^a-z]|$)' THEN
    RETURN 'Arka Bant';
  ELSIF s ~ '(^|[^a-z])(ön|on|cep|fermuar|pat|patlet|patlett)([^a-z]|$)' THEN
    RETURN 'Ön Bant';
  ELSIF s ~ '(^|[^a-z])(kemer|bel|yan|montaj|çatım|catim|çima|cima|kollu|kol)([^a-z]|$)' THEN
    RETURN 'Montaj';
  ELSE
    RETURN 'Montaj';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Modele ait operasyonları katalogdan yükle (auto-populate)
CREATE OR REPLACE FUNCTION eder_populate_islemler(p_model_id INTEGER, p_urun_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  -- Mevcut operasyonları temizle (re-populate durumu için)
  DELETE FROM eder_model_islem WHERE model_id = p_model_id;

  INSERT INTO eder_model_islem (
    model_id, kv3_ui_id, ana_grup, parca, grup, islem_adi, makine_tipi,
    mtm_sn, cevrim_sn, kisi_sayisi, sira_no
  )
  SELECT
    p_model_id,
    kui.id,
    kv3_classify_ana_grup(kui.parca, kui.grup, kui.islem_adi),
    kui.parca,
    kui.grup,
    kui.islem_adi,
    ik.makine_tipi,
    kui.mtm_sn,
    kui.mtm_sn,
    1,
    ROW_NUMBER() OVER (ORDER BY kui.parca, kui.grup NULLS FIRST, kui.id)
  FROM kv3_urun_islem kui
  LEFT JOIN kv3_islem_katalogu ik ON ik.islem_adi = kui.islem_adi
  WHERE kui.urun_id = p_urun_id;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- View'ı yeni tabloya bağla (kolon sıralaması değişti, DROP şart)
DROP VIEW IF EXISTS v_eder_model_v3_ozet CASCADE;
DROP VIEW IF EXISTS v_eder_model_ana_grup CASCADE;

CREATE VIEW v_eder_model_v3_ozet AS
WITH aggr AS (
  SELECT
    emi.model_id,
    COUNT(*) FILTER (WHERE emi.aktif)                              AS islem_sayisi,
    COUNT(DISTINCT emi.parca) FILTER (WHERE emi.aktif)             AS parca_sayisi,
    COALESCE(SUM(emi.cevrim_sn) FILTER (WHERE emi.aktif), 0)       AS toplam_sure_sn,
    COALESCE(SUM(emi.mtm_sn)    FILTER (WHERE emi.aktif), 0)       AS toplam_teorik_sn
  FROM eder_model_islem emi
  GROUP BY emi.model_id
)
SELECT
  em.id              AS model_id,
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
  ku.parca_sayisi                                AS katalog_parca_sayisi,
  ku.islem_sayisi                                AS katalog_islem_sayisi,
  COALESCE(aggr.toplam_sure_sn, 0)               AS toplam_sure_sn,
  COALESCE(aggr.toplam_sure_sn, 0) / 60.0        AS toplam_sure_dk,
  COALESCE(aggr.toplam_teorik_sn, 0)             AS toplam_teorik_sn,
  COALESCE(aggr.parca_sayisi, 0)                 AS secili_parca_sayisi,
  COALESCE(aggr.islem_sayisi, 0)                 AS secili_islem_sayisi,
  dm.dk_maliyet_tl,
  (COALESCE(aggr.toplam_sure_sn, 0) / 60.0) * COALESCE(dm.dk_maliyet_tl, 0) AS eder_maliyet_tl
FROM eder_model em
LEFT JOIN kv3_urun ku   ON em.kv3_urun_id = ku.id
LEFT JOIN aggr          ON aggr.model_id = em.id
LEFT JOIN dk_maliyet dm ON dm.donem = em.donem AND dm.bolge = em.bolge
WHERE em.kv3_urun_id IS NOT NULL;

-- Ana grup bazlı özet view (yeşil/sarı toplam satırları için)
CREATE VIEW v_eder_model_ana_grup AS
SELECT
  emi.model_id,
  emi.ana_grup,
  COUNT(*) FILTER (WHERE emi.aktif)                           AS islem_sayisi,
  COALESCE(SUM(emi.cevrim_sn) FILTER (WHERE emi.aktif), 0)    AS toplam_sure_sn,
  COALESCE(SUM(emi.mtm_sn)    FILTER (WHERE emi.aktif), 0)    AS toplam_teorik_sn,
  MIN(emi.sira_no) FILTER (WHERE emi.aktif)                   AS min_sira
FROM eder_model_islem emi
GROUP BY emi.model_id, emi.ana_grup;
