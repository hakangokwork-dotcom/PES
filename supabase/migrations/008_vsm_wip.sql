-- ============================================================
-- 008: VSM — WIP Kayıtları & Operasyon Ölçüm Tablosu
-- ============================================================

-- WIP (Work In Process) kayıtları — bantlar arası yarı mamul stok
CREATE TABLE IF NOT EXISTS wip_record (
  id              SERIAL PRIMARY KEY,
  workshop_id     INTEGER        NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
  line_id         INTEGER        REFERENCES production_line(id) ON DELETE SET NULL,
  model_code      VARCHAR(30),
  operation_name  VARCHAR(150),
  recorded_date   DATE           NOT NULL DEFAULT CURRENT_DATE,
  wip_qty         INTEGER        NOT NULL CHECK (wip_qty >= 0),
  notes           TEXT,
  created_at      TIMESTAMPTZ    DEFAULT now()
);

-- Operasyon Cycle Time ölçümleri (zaman etüdü)
CREATE TABLE IF NOT EXISTS operation_measurement (
  id              SERIAL PRIMARY KEY,
  workshop_id     INTEGER        NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
  line_id         INTEGER        REFERENCES production_line(id) ON DELETE SET NULL,
  model_code      VARCHAR(30),
  operation_name  VARCHAR(150)   NOT NULL,
  cycle_time_sn   DECIMAL(10,3)  NOT NULL CHECK (cycle_time_sn > 0),
  operator_count  DECIMAL(4,2)   DEFAULT 1,
  measured_date   DATE           NOT NULL DEFAULT CURRENT_DATE,
  observer_name   VARCHAR(100),
  notes           TEXT,
  created_at      TIMESTAMPTZ    DEFAULT now()
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_wip_workshop_date ON wip_record(workshop_id, recorded_date);
CREATE INDEX IF NOT EXISTS idx_wip_line ON wip_record(line_id);
CREATE INDEX IF NOT EXISTS idx_opmeas_workshop ON operation_measurement(workshop_id, measured_date);
CREATE INDEX IF NOT EXISTS idx_opmeas_line ON operation_measurement(line_id);
