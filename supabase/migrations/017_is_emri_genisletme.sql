-- ============================================================
-- 017: İş Emri Genişletme — Aşamalar, Malzeme, Günlük, Takvim, Durum Geçmişi
-- Hedef: Atölye sipariş aldığı andan teslim edildiği ana kadar
-- her detayı tek yerden takip etsin. Materyal hazırlığı, plan vs gerçek
-- süreler, günlük problem kaydı, bant takvimi.
-- ============================================================

-- ===== Üretim Aşaması Kataloğu =====
CREATE TABLE IF NOT EXISTS production_stage (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  sira_no     INTEGER DEFAULT 0,
  zorunlu     BOOLEAN DEFAULT TRUE,
  renk        VARCHAR(20),
  created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO production_stage (code, name, sira_no, zorunlu, renk) VALUES
  ('KESIM',    'Kesim',           10, TRUE,  '#3b82f6'),
  ('NUMUNE',   'Numune Onayı',    15, FALSE, '#f97316'),
  ('DIKIM',    'Dikim',           20, TRUE,  '#10b981'),
  ('YIKAMA',   'Yıkama',          30, FALSE, '#06b6d4'),
  ('UTU',      'Ütü',             40, TRUE,  '#f59e0b'),
  ('KALITE',   'Kalite Kontrol',  50, TRUE,  '#a855f7'),
  ('PAKET',    'Paket',           60, TRUE,  '#ec4899'),
  ('SEVK',     'Sevkiyat',        70, FALSE, '#64748b')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sira_no = EXCLUDED.sira_no, renk = EXCLUDED.renk;

-- ===== İş Emri kolonları (genişletme) =====
ALTER TABLE work_order
  ADD COLUMN IF NOT EXISTS oncelik              VARCHAR(20) DEFAULT 'Normal' CHECK (oncelik IN ('Düşük','Normal','Yüksek','Kritik')),
  ADD COLUMN IF NOT EXISTS risk_seviyesi        VARCHAR(20) DEFAULT 'Düşük'  CHECK (risk_seviyesi IN ('Düşük','Orta','Yüksek','Kritik')),
  ADD COLUMN IF NOT EXISTS ilerleme_pct         INTEGER DEFAULT 0 CHECK (ilerleme_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS materyal_durumu_pct  INTEGER DEFAULT 0 CHECK (materyal_durumu_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS musteri_kodu         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS musteri_iletisim     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS sezon                VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sample_onaylandi     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tech_pack_onaylandi  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notlar_genel         TEXT,
  ADD COLUMN IF NOT EXISTS etiketler            JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS paylasim_admin       BOOLEAN DEFAULT FALSE;

-- Mevcut durum CHECK'ini genişlet (eski enum'a yeni değerler ekle)
ALTER TABLE work_order DROP CONSTRAINT IF EXISTS work_order_durum_check;
ALTER TABLE work_order
  ADD CONSTRAINT work_order_durum_check CHECK (durum IN (
    'Taslak','Planlandi','Bekleniyor','Devam','Duraklatildi','Tamamlandi','İptal','Sevk Edildi'
  ));

-- ===== Aşama Kayıtları (her WO için aşama satırları) =====
CREATE TABLE IF NOT EXISTS work_order_stage (
  id                  SERIAL PRIMARY KEY,
  work_order_id       INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  stage_id            INTEGER NOT NULL REFERENCES production_stage(id),
  sira_no             INTEGER,
  line_id             INTEGER REFERENCES production_line(id) ON DELETE SET NULL,
  plan_baslangic      DATE,
  plan_bitis          DATE,
  plan_sure_dk        INTEGER,
  gercek_baslangic    DATE,
  gercek_bitis        DATE,
  gercek_sure_dk      INTEGER,
  durum               VARCHAR(30) DEFAULT 'Beklemede' CHECK (durum IN (
                        'Beklemede','Hazır','Devam','Duraklatildi','Tamamlandi','İptal'
                      )),
  ilerleme_pct        INTEGER DEFAULT 0 CHECK (ilerleme_pct BETWEEN 0 AND 100),
  uretilen_adet       INTEGER DEFAULT 0,
  hatali_adet         INTEGER DEFAULT 0,
  notlar              TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(work_order_id, stage_id)
);
CREATE INDEX IF NOT EXISTS idx_wos_wo    ON work_order_stage(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wos_stage ON work_order_stage(stage_id);
CREATE INDEX IF NOT EXISTS idx_wos_line  ON work_order_stage(line_id);

-- ===== Malzeme Listesi =====
CREATE TABLE IF NOT EXISTS work_order_material (
  id                SERIAL PRIMARY KEY,
  work_order_id     INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  tip               VARCHAR(30) DEFAULT 'AKSESUAR' CHECK (tip IN ('KUMAŞ','AKSESUAR','ETİKET','AMBALAJ','İPLİK','DIGER')),
  kod               VARCHAR(50),
  ad                VARCHAR(200) NOT NULL,
  miktar            DECIMAL(10,3),
  birim             VARCHAR(20),
  durum             VARCHAR(30) DEFAULT 'Bekleniyor' CHECK (durum IN ('Bekleniyor','Sipariş Verildi','Yolda','Geldi','Eksik','İade')),
  beklenen_tarih    DATE,
  gelis_tarihi      DATE,
  tedarikci         VARCHAR(150),
  notlar            TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wom_wo ON work_order_material(work_order_id);

-- ===== Günlük Defteri (Problem/Not/Kaizen) =====
CREATE TABLE IF NOT EXISTS work_order_journal (
  id                SERIAL PRIMARY KEY,
  work_order_id     INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  stage_id          INTEGER REFERENCES production_stage(id) ON DELETE SET NULL,
  tarih             DATE NOT NULL DEFAULT CURRENT_DATE,
  vardiya           VARCHAR(20) DEFAULT 'Gündüz' CHECK (vardiya IN ('Gündüz','Gece','Tek')),
  tip               VARCHAR(20) DEFAULT 'NOT' CHECK (tip IN ('NOT','PROBLEM','KAIZEN','UYARI','BAŞARI','BLOKAJ')),
  kategori          VARCHAR(50),
  baslik            VARCHAR(200),
  aciklama          TEXT NOT NULL,
  oneri             TEXT,
  yazan             VARCHAR(100),
  paylasim_admin    BOOLEAN DEFAULT FALSE,
  resolved          BOOLEAN DEFAULT FALSE,
  resolved_at       TIMESTAMPTZ,
  resolved_notlar   TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_woj_wo    ON work_order_journal(work_order_id);
CREATE INDEX IF NOT EXISTS idx_woj_tarih ON work_order_journal(work_order_id, tarih DESC);

-- ===== Bant Takvim Slotları (Gantt için) =====
CREATE TABLE IF NOT EXISTS line_schedule (
  id                SERIAL PRIMARY KEY,
  line_id           INTEGER NOT NULL REFERENCES production_line(id) ON DELETE CASCADE,
  work_order_id     INTEGER REFERENCES work_order(id) ON DELETE CASCADE,
  stage_id          INTEGER REFERENCES production_stage(id) ON DELETE SET NULL,
  baslangic_tarihi  DATE NOT NULL,
  bitis_tarihi      DATE NOT NULL,
  baslangic_saat    TIME,
  bitis_saat        TIME,
  tip               VARCHAR(20) DEFAULT 'WO' CHECK (tip IN ('WO','CHANGEOVER','BAKIM','İZİN','BLOK')),
  notlar            TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lsch_line  ON line_schedule(line_id, baslangic_tarihi);
CREATE INDEX IF NOT EXISTS idx_lsch_wo    ON line_schedule(work_order_id);

-- ===== Durum Geçiş Geçmişi (audit) =====
CREATE TABLE IF NOT EXISTS work_order_status_history (
  id              SERIAL PRIMARY KEY,
  work_order_id   INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  eski_durum      VARCHAR(30),
  yeni_durum      VARCHAR(30) NOT NULL,
  sebep           TEXT,
  yapan           VARCHAR(100),
  tarih           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wosh_wo ON work_order_status_history(work_order_id, tarih DESC);

-- ===== Yardımcı Fonksiyon: WO için varsayılan zorunlu aşamaları aç =====
CREATE OR REPLACE FUNCTION wo_init_stages(p_wo_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  ins_count INTEGER := 0;
BEGIN
  INSERT INTO work_order_stage (work_order_id, stage_id, sira_no, durum)
  SELECT p_wo_id, ps.id, ps.sira_no, 'Beklemede'
  FROM production_stage ps
  WHERE ps.zorunlu = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM work_order_stage wos
      WHERE wos.work_order_id = p_wo_id AND wos.stage_id = ps.id
    );
  GET DIAGNOSTICS ins_count = ROW_COUNT;
  RETURN ins_count;
END;
$$ LANGUAGE plpgsql;

-- ===== Yardımcı: WO ilerleme yüzdesini aşamalardan otomatik hesapla =====
CREATE OR REPLACE FUNCTION wo_recompute_progress(p_wo_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  avg_pct INTEGER;
BEGIN
  SELECT ROUND(AVG(ilerleme_pct))::INTEGER
  INTO avg_pct
  FROM work_order_stage WHERE work_order_id = p_wo_id;

  UPDATE work_order
    SET ilerleme_pct = COALESCE(avg_pct, 0),
        updated_at = now()
    WHERE id = p_wo_id;
  RETURN COALESCE(avg_pct, 0);
END;
$$ LANGUAGE plpgsql;

-- ===== Yardımcı: WO materyal durumunu hesapla =====
CREATE OR REPLACE FUNCTION wo_recompute_material(p_wo_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  total INTEGER;
  ready INTEGER;
  pct INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE durum = 'Geldi')
    INTO total, ready
    FROM work_order_material WHERE work_order_id = p_wo_id;
  pct := CASE WHEN total > 0 THEN ROUND((ready::numeric / total) * 100)::INTEGER ELSE 0 END;
  UPDATE work_order
    SET materyal_durumu_pct = pct, updated_at = now()
    WHERE id = p_wo_id;
  RETURN pct;
END;
$$ LANGUAGE plpgsql;

-- ===== Auto-trigger: stage update -> WO progress yenile =====
CREATE OR REPLACE FUNCTION trg_wo_progress_after_stage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM wo_recompute_progress(COALESCE(NEW.work_order_id, OLD.work_order_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wos_progress ON work_order_stage;
CREATE TRIGGER trg_wos_progress
  AFTER INSERT OR UPDATE OR DELETE ON work_order_stage
  FOR EACH ROW EXECUTE FUNCTION trg_wo_progress_after_stage();

CREATE OR REPLACE FUNCTION trg_wo_material_after_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM wo_recompute_material(COALESCE(NEW.work_order_id, OLD.work_order_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wom_material ON work_order_material;
CREATE TRIGGER trg_wom_material
  AFTER INSERT OR UPDATE OR DELETE ON work_order_material
  FOR EACH ROW EXECUTE FUNCTION trg_wo_material_after_change();

-- ===== Auto-trigger: durum değişince history'ye yaz =====
CREATE OR REPLACE FUNCTION trg_wo_status_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.durum IS DISTINCT FROM NEW.durum THEN
    INSERT INTO work_order_status_history (work_order_id, eski_durum, yeni_durum, tarih)
    VALUES (NEW.id, OLD.durum, NEW.durum, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wo_status ON work_order;
CREATE TRIGGER trg_wo_status
  AFTER UPDATE OF durum ON work_order
  FOR EACH ROW EXECUTE FUNCTION trg_wo_status_history();

-- ===== Comprehensive view (UI için) =====
DROP VIEW IF EXISTS v_work_order_full CASCADE;
CREATE VIEW v_work_order_full AS
SELECT
  wo.*,
  w.code AS workshop_code,
  w.name AS workshop_name,
  pl.code AS line_code,
  pl.name AS line_name,
  COALESCE(stage_summary.toplam_asama, 0)         AS toplam_asama,
  COALESCE(stage_summary.tamamlanan_asama, 0)     AS tamamlanan_asama,
  COALESCE(stage_summary.devam_asama, 0)          AS devam_asama,
  COALESCE(material_summary.toplam_malzeme, 0)    AS toplam_malzeme,
  COALESCE(material_summary.gelen_malzeme, 0)     AS gelen_malzeme,
  COALESCE(material_summary.eksik_malzeme, 0)     AS eksik_malzeme,
  COALESCE(journal_summary.problem_sayisi, 0)     AS problem_sayisi,
  COALESCE(journal_summary.acik_problem, 0)       AS acik_problem,
  journal_summary.son_journal_tarih,
  CASE
    WHEN wo.teslim_tarihi IS NULL THEN NULL
    WHEN wo.durum = 'Tamamlandi' THEN 0
    ELSE (wo.teslim_tarihi - CURRENT_DATE)::INTEGER
  END AS teslim_kalan_gun,
  CASE
    WHEN wo.teslim_tarihi IS NULL OR wo.durum IN ('Tamamlandi','Sevk Edildi','İptal') THEN 'normal'
    WHEN wo.teslim_tarihi - CURRENT_DATE < 0 THEN 'kritik'
    WHEN wo.teslim_tarihi - CURRENT_DATE <= 3 THEN 'acil'
    WHEN wo.teslim_tarihi - CURRENT_DATE <= 7 THEN 'yakin'
    ELSE 'normal'
  END AS aciliyet
FROM work_order wo
LEFT JOIN workshop w ON wo.workshop_id = w.id
LEFT JOIN production_line pl ON wo.line_id = pl.id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS toplam_asama,
    COUNT(*) FILTER (WHERE durum = 'Tamamlandi') AS tamamlanan_asama,
    COUNT(*) FILTER (WHERE durum = 'Devam')      AS devam_asama
  FROM work_order_stage WHERE work_order_id = wo.id
) stage_summary ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS toplam_malzeme,
    COUNT(*) FILTER (WHERE durum = 'Geldi')  AS gelen_malzeme,
    COUNT(*) FILTER (WHERE durum = 'Eksik')  AS eksik_malzeme
  FROM work_order_material WHERE work_order_id = wo.id
) material_summary ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE tip = 'PROBLEM')                          AS problem_sayisi,
    COUNT(*) FILTER (WHERE tip = 'PROBLEM' AND NOT resolved)         AS acik_problem,
    MAX(tarih)                                                        AS son_journal_tarih
  FROM work_order_journal WHERE work_order_id = wo.id
) journal_summary ON TRUE;

-- ===== Detaylı stage view =====
CREATE OR REPLACE VIEW v_work_order_stages AS
SELECT
  wos.*,
  ps.code     AS stage_code,
  ps.name     AS stage_name,
  ps.renk     AS stage_renk,
  pl.code     AS line_code,
  pl.name     AS line_name,
  CASE
    WHEN wos.plan_bitis IS NULL OR wos.gercek_bitis IS NULL THEN NULL
    ELSE (wos.gercek_bitis - wos.plan_bitis)::INTEGER
  END AS gecikme_gun
FROM work_order_stage wos
LEFT JOIN production_stage ps ON wos.stage_id = ps.id
LEFT JOIN production_line pl ON wos.line_id = pl.id;
