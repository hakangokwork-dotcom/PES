-- ============================================================
-- 013: Is Emri, Operator, Yikama, UKP, Kaizen tablolari
-- ============================================================

-- IS EMRI (Work Order)
CREATE TABLE IF NOT EXISTS work_order (
  id                SERIAL PRIMARY KEY,
  is_emri_no        VARCHAR(30) UNIQUE NOT NULL,
  workshop_id       INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
  line_id           INTEGER REFERENCES production_line(id) ON DELETE SET NULL,
  musteri           VARCHAR(200),
  siparis_no        VARCHAR(50),
  model_adi         VARCHAR(100) NOT NULL,
  stil_kodu         VARCHAR(50),
  siparis_miktari   INTEGER NOT NULL DEFAULT 0,
  baslangic_tarihi  DATE,
  bitis_tarihi      DATE,
  teslim_tarihi     DATE,
  mtm_toplam_sn     NUMERIC(10,2) DEFAULT 0,
  sam_toplam_sn     NUMERIC(10,2) DEFAULT 0,
  darbogaz_op       VARCHAR(100),
  darbogaz_sure_sn  NUMERIC(8,2) DEFAULT 0,
  anlasmali_fiyat   NUMERIC(10,2) DEFAULT 0,
  yikama_fiyati     NUMERIC(10,2) DEFAULT 0,
  durum             VARCHAR(20) DEFAULT 'Planlandi' CHECK (durum IN ('Planlandi','Devam','Tamamlandi','Iptal')),
  tamamlanan_adet   INTEGER DEFAULT 0,
  notlar            TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wo_workshop ON work_order(workshop_id);
CREATE INDEX IF NOT EXISTS idx_wo_line ON work_order(line_id);
CREATE INDEX IF NOT EXISTS idx_wo_durum ON work_order(durum);

-- OPERATOR (bireysel performans takibi)
CREATE TABLE IF NOT EXISTS operator (
  id              SERIAL PRIMARY KEY,
  workshop_id     INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
  line_id         INTEGER REFERENCES production_line(id) ON DELETE SET NULL,
  sicil_no        VARCHAR(30),
  ad_soyad        VARCHAR(100) NOT NULL,
  operasyon       VARCHAR(150),
  makine_tipi     VARCHAR(100),
  giris_tarihi    DATE,
  skill_level     VARCHAR(20) DEFAULT 'JUNIOR' CHECK (skill_level IN ('JUNIOR','SENIOR','EXPERT')),
  aktif           BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_op_workshop ON operator(workshop_id);
CREATE INDEX IF NOT EXISTS idx_op_line ON operator(line_id);

-- OPERATOR GUNLUK PERFORMANS
CREATE TABLE IF NOT EXISTS operator_performance (
  id                SERIAL PRIMARY KEY,
  operator_id       INTEGER NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  work_order_id     INTEGER REFERENCES work_order(id) ON DELETE SET NULL,
  tarih             DATE NOT NULL DEFAULT CURRENT_DATE,
  uretilen_adet     INTEGER DEFAULT 0,
  sam_dk            NUMERIC(8,2) DEFAULT 0,
  calisma_dk        NUMERIC(8,2) DEFAULT 0,
  off_standard_dk   NUMERIC(8,2) DEFAULT 0,
  hata_adet         INTEGER DEFAULT 0,
  performans_pct    NUMERIC(5,1),
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opperf_op ON operator_performance(operator_id, tarih);

-- YIKAMA TAKIBI
CREATE TABLE IF NOT EXISTS yikama_record (
  id                SERIAL PRIMARY KEY,
  workshop_id       INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
  work_order_id     INTEGER REFERENCES work_order(id) ON DELETE SET NULL,
  tarih             DATE NOT NULL DEFAULT CURRENT_DATE,
  giren_adet        INTEGER DEFAULT 0,
  cikan_adet        INTEGER DEFAULT 0,
  hatali_adet       INTEGER DEFAULT 0,
  cevrim_sayisi     INTEGER DEFAULT 0,
  cevrim_sure_dk    NUMERIC(6,1) DEFAULT 85,
  enerji_kwh        NUMERIC(8,2),
  su_litre          NUMERIC(10,2),
  notlar            TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_yikama_ws ON yikama_record(workshop_id, tarih);

-- UKP TAKIBI
CREATE TABLE IF NOT EXISTS ukp_record (
  id                SERIAL PRIMARY KEY,
  workshop_id       INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
  work_order_id     INTEGER REFERENCES work_order(id) ON DELETE SET NULL,
  tarih             DATE NOT NULL DEFAULT CURRENT_DATE,
  utu_adet          INTEGER DEFAULT 0,
  kontrol_adet      INTEGER DEFAULT 0,
  paket_adet        INTEGER DEFAULT 0,
  hatali_adet       INTEGER DEFAULT 0,
  personel_sayisi   INTEGER DEFAULT 0,
  calisma_dk        NUMERIC(8,2) DEFAULT 540,
  notlar            TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ukp_ws ON ukp_record(workshop_id, tarih);

-- KAIZEN AKSIYON
CREATE TABLE IF NOT EXISTS kaizen_action (
  id                SERIAL PRIMARY KEY,
  workshop_id       INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
  baslik            VARCHAR(300) NOT NULL,
  kategori          VARCHAR(50) DEFAULT 'DARBOGAZ' CHECK (kategori IN ('DARBOGAZ','WIP','KALITE','MALIYET','CHANGEOVER','GENEL')),
  hedef_metrik      VARCHAR(100),
  mevcut_deger      NUMERIC(12,3),
  hedef_deger       NUMERIC(12,3),
  sorumlu           VARCHAR(200),
  baslangic_tarihi  DATE,
  bitis_tarihi      DATE,
  durum             VARCHAR(20) DEFAULT 'PLAN' CHECK (durum IN ('PLAN','UYGULA','KONTROL','STANDART','IPTAL')),
  sonuc_deger       NUMERIC(12,3),
  notlar            TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kaizen_ws ON kaizen_action(workshop_id);
CREATE INDEX IF NOT EXISTS idx_kaizen_durum ON kaizen_action(durum);
