-- ============================================================
-- PES (Production Efficiency System) — Veritabanı Şeması
-- Atölye Verimlilik Değerlendirme Sistemi
-- ============================================================

BEGIN;

-- ============================================================
-- PES Kullanıcı Rolleri (RBAC)
-- ============================================================
CREATE TABLE pes_user_roles (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('pes_admin','yonetim','analist','operator','izleyici')),
    workshop_id INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, role, workshop_id)
);

ALTER TABLE pes_user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pes_roles_select_own" ON pes_user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "pes_roles_admin_all" ON pes_user_roles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role = 'pes_admin')
  );

-- ============================================================
-- TABLO 1: ATÖLYE (Workshop)
-- ============================================================
CREATE TABLE workshop (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    city            VARCHAR(50),
    district        VARCHAR(50),
    type            CHAR(1) NOT NULL CHECK (type IN ('A','B','C')),
    total_staff     INTEGER NOT NULL DEFAULT 0,
    sewing_staff    INTEGER NOT NULL DEFAULT 0,
    ukp_staff       INTEGER NOT NULL DEFAULT 0,
    cutting_staff   INTEGER NOT NULL DEFAULT 0,
    management      INTEGER NOT NULL DEFAULT 0,
    indirect        INTEGER NOT NULL DEFAULT 0,
    line_count      SMALLINT NOT NULL DEFAULT 1,
    daily_target    INTEGER NOT NULL DEFAULT 0,
    net_hours_day   NUMERIC(4,1) NOT NULL DEFAULT 9.0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLO 2: BANT (ProductionLine)
-- ============================================================
CREATE TABLE production_line (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(30) UNIQUE NOT NULL,
    workshop_id     INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    name            VARCHAR(50) NOT NULL,
    line_type       VARCHAR(20) NOT NULL DEFAULT 'Normal' CHECK (line_type IN ('Normal','Küçük')),
    operator_count  INTEGER NOT NULL DEFAULT 0,
    daily_target    INTEGER NOT NULL DEFAULT 0,
    max_cycle_sec   NUMERIC(6,2),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLO 3: ANA SÜREÇ KATALOĞU (MasterProcess)
-- ============================================================
CREATE TABLE master_process (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(10) UNIQUE NOT NULL,
    name            VARCHAR(50) NOT NULL,
    group_type      VARCHAR(20) NOT NULL DEFAULT 'Her ikisi' CHECK (group_type IN ('Alt','Üst','Her ikisi')),
    description     TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- TABLO 4: ÜRÜN KATEGORİSİ (ProductCategory)
-- ============================================================
CREATE TABLE product_category (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(10) UNIQUE NOT NULL,
    name            VARCHAR(50) NOT NULL,
    group_type      VARCHAR(20) NOT NULL CHECK (group_type IN ('Alt','Üst')),
    notes           TEXT
);

-- ============================================================
-- TABLO 5: SÜREÇ ŞABLONU (ProcessTemplate)
-- ============================================================
CREATE TABLE process_template (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    category_id     INTEGER NOT NULL REFERENCES product_category(id) ON DELETE CASCADE,
    process_id      INTEGER NOT NULL REFERENCES master_process(id) ON DELETE CASCADE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_mandatory    BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(code, process_id)
);

-- ============================================================
-- TABLO 6: ATÖLYE–ÜRÜN KONFİGÜRASYONU (WorkshopProduct)
-- ============================================================
CREATE TABLE workshop_product (
    id              SERIAL PRIMARY KEY,
    workshop_id     INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    category_id     INTEGER NOT NULL REFERENCES product_category(id) ON DELETE CASCADE,
    template_code   VARCHAR(20) NOT NULL,
    line_id         INTEGER REFERENCES production_line(id) ON DELETE SET NULL,
    start_date      DATE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLO 7: MODEL / SAM KÜTÜPHANESİ (ModelLibrary)
-- ============================================================
CREATE TABLE model_library (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(30) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    category_id     INTEGER NOT NULL REFERENCES product_category(id) ON DELETE CASCADE,
    template_code   VARCHAR(20) NOT NULL,
    process_id      INTEGER NOT NULL REFERENCES master_process(id) ON DELETE CASCADE,
    sam_minutes     NUMERIC(6,3) NOT NULL,
    source          VARCHAR(20) NOT NULL DEFAULT 'Pratik' CHECK (source IN ('Pratik','MTM')),
    valid_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLO 8: AYLIK GİDER (MonthlyExpense)
-- ============================================================
CREATE TABLE monthly_expense (
    id              SERIAL PRIMARY KEY,
    workshop_id     INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    work_days       SMALLINT NOT NULL CHECK (work_days BETWEEN 15 AND 28),
    personnel       BIGINT NOT NULL DEFAULT 0,
    sgk             BIGINT NOT NULL DEFAULT 0,
    food            BIGINT NOT NULL DEFAULT 0,
    electricity     BIGINT NOT NULL DEFAULT 0,
    water           BIGINT NOT NULL DEFAULT 0,
    gas             BIGINT NOT NULL DEFAULT 0,
    transport       BIGINT NOT NULL DEFAULT 0,
    vehicle         BIGINT NOT NULL DEFAULT 0,
    cargo           BIGINT NOT NULL DEFAULT 0,
    machine_maint   BIGINT NOT NULL DEFAULT 0,
    thread          BIGINT NOT NULL DEFAULT 0,
    other           BIGINT NOT NULL DEFAULT 0,
    target_revenue  BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workshop_id, year, month)
);

-- ============================================================
-- TABLO 9: AYLIK ÜRETİM (MonthlyProduction)
-- ============================================================
CREATE TABLE monthly_production (
    id              SERIAL PRIMARY KEY,
    line_id         INTEGER NOT NULL REFERENCES production_line(id) ON DELETE CASCADE,
    workshop_id     INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    model_id        INTEGER REFERENCES model_library(id) ON DELETE SET NULL,
    model_code      VARCHAR(30),
    group_type      VARCHAR(20) CHECK (group_type IN ('Alt','Üst')),
    total_sam       NUMERIC(6,3),
    target_qty      INTEGER NOT NULL DEFAULT 0,
    actual_qty      INTEGER NOT NULL DEFAULT 0,
    work_days       SMALLINT NOT NULL DEFAULT 22,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (line_id, year, month, model_code)
);

-- ============================================================
-- TABLO 10: BANT SÜREÇ KAPASİTESİ (LineProcessCapacity)
-- ============================================================
CREATE TABLE line_process_capacity (
    id                  SERIAL PRIMARY KEY,
    line_id             INTEGER NOT NULL REFERENCES production_line(id) ON DELETE CASCADE,
    workshop_id         INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    process_id          INTEGER NOT NULL REFERENCES master_process(id) ON DELETE CASCADE,
    year                SMALLINT NOT NULL,
    month               SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    model_id            INTEGER REFERENCES model_library(id) ON DELETE SET NULL,
    bottleneck_op       VARCHAR(100),
    bottleneck_sec      NUMERIC(6,2),
    actual_daily        NUMERIC(8,1),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLO 11: KALİTE (QualityRecord)
-- ============================================================
CREATE TABLE quality_record (
    id              SERIAL PRIMARY KEY,
    workshop_id     INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    line_id         INTEGER REFERENCES production_line(id) ON DELETE SET NULL,
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    inspected_qty   INTEGER NOT NULL DEFAULT 0,
    first_pass_qty  INTEGER NOT NULL DEFAULT 0,
    rejected_qty    INTEGER NOT NULL DEFAULT 0,
    rework_qty      INTEGER NOT NULL DEFAULT 0,
    top_defect_cat  VARCHAR(100),
    customer_return INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLO 12: DURUŞ (DowntimeRecord)
-- ============================================================
CREATE TABLE downtime_record (
    id              SERIAL PRIMARY KEY,
    line_id         INTEGER NOT NULL REFERENCES production_line(id) ON DELETE CASCADE,
    occurred_at     TIMESTAMPTZ NOT NULL,
    duration_min    INTEGER NOT NULL CHECK (duration_min > 0),
    downtime_type   VARCHAR(30) NOT NULL CHECK (downtime_type IN ('Planlı','Plansız','Organizasyonel','Tedarik')),
    reason          TEXT,
    affected_ops    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLO 13: CHANGEOVER (ChangeoverRecord)
-- ============================================================
CREATE TABLE changeover_record (
    id              SERIAL PRIMARY KEY,
    line_id         INTEGER NOT NULL REFERENCES production_line(id) ON DELETE CASCADE,
    occurred_date   DATE NOT NULL,
    from_model_id   INTEGER REFERENCES model_library(id) ON DELETE SET NULL,
    to_model_id     INTEGER REFERENCES model_library(id) ON DELETE SET NULL,
    total_min       INTEGER NOT NULL DEFAULT 0,
    machine_adj_min INTEGER NOT NULL DEFAULT 0,
    balancing_min   INTEGER NOT NULL DEFAULT 0,
    first_batch_min INTEGER NOT NULL DEFAULT 0,
    warmup_min      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLO 14: İŞGÜCÜ DEVİR (WorkforceTurnover)
-- ============================================================
CREATE TABLE workforce_turnover (
    id              SERIAL PRIMARY KEY,
    workshop_id     INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    total_staff     INTEGER NOT NULL DEFAULT 0,
    left_count      INTEGER NOT NULL DEFAULT 0,
    joined_count    INTEGER NOT NULL DEFAULT 0,
    in_warmup       INTEGER NOT NULL DEFAULT 0,
    avg_tenure_mon  NUMERIC(5,1),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workshop_id, year, month)
);

-- ============================================================
-- TABLO 15: TEDARİKÇİ SKOR (SupplierScore)
-- ============================================================
CREATE TABLE supplier_score (
    id              SERIAL PRIMARY KEY,
    workshop_id     INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    efficiency_sc   NUMERIC(5,1) CHECK (efficiency_sc BETWEEN 0 AND 100),
    quality_sc      NUMERIC(5,1) CHECK (quality_sc BETWEEN 0 AND 100),
    delivery_sc     NUMERIC(5,1) CHECK (delivery_sc BETWEEN 0 AND 100),
    cost_sc         NUMERIC(5,1) CHECK (cost_sc BETWEEN 0 AND 100),
    compliance_sc   NUMERIC(5,1) CHECK (compliance_sc BETWEEN 0 AND 100),
    composite_sc    NUMERIC(5,1) CHECK (composite_sc BETWEEN 0 AND 100),
    tier            VARCHAR(20) CHECK (tier IN ('Stratejik','Gelişen','İzlemede','Risk','Kritik')),
    prev_sc         NUMERIC(5,1),
    trend           VARCHAR(10) CHECK (trend IN ('Artış','Sabit','Düşüş')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workshop_id, year, month)
);

-- ============================================================
-- DENETİM KAYDI (AuditLog)
-- ============================================================
CREATE TABLE pes_audit_log (
    id          SERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action      VARCHAR(20) NOT NULL,
    table_name  VARCHAR(50) NOT NULL,
    record_id   INTEGER,
    old_values  JSONB,
    new_values  JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GÖRÜNÜM: AYLIK VERİMLİLİK ÖZETİ
-- ============================================================
CREATE VIEW v_pes_monthly_summary AS
SELECT
    mp.workshop_id,
    w.code AS workshop_code,
    w.name AS workshop_name,
    w.type AS workshop_type,
    mp.year,
    mp.month,
    SUM(mp.actual_qty)                                  AS total_actual,
    SUM(mp.target_qty)                                  AS total_target,
    ROUND(
      SUM(mp.actual_qty)::NUMERIC /
      NULLIF(SUM(mp.target_qty), 0) * 100, 1
    )                                                   AS efficiency_pct,
    me.personnel + me.sgk + me.food + me.electricity
      + me.water + me.gas + me.transport + me.vehicle
      + me.cargo + me.machine_maint + me.thread
      + me.other                                        AS total_expense,
    me.target_revenue
FROM monthly_production mp
JOIN workshop w ON w.id = mp.workshop_id
LEFT JOIN monthly_expense me
       ON me.workshop_id = mp.workshop_id
      AND me.year = mp.year
      AND me.month = mp.month
GROUP BY mp.workshop_id, w.code, w.name, w.type,
         mp.year, mp.month,
         me.personnel, me.sgk, me.food, me.electricity,
         me.water, me.gas, me.transport, me.vehicle,
         me.cargo, me.machine_maint, me.thread, me.other,
         me.target_revenue;

-- ============================================================
-- UPDATED_AT TRİGGER FONKSİYONU
-- ============================================================
CREATE OR REPLACE FUNCTION pes_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workshop_updated_at
  BEFORE UPDATE ON workshop
  FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

CREATE TRIGGER production_line_updated_at
  BEFORE UPDATE ON production_line
  FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

CREATE TRIGGER monthly_expense_updated_at
  BEFORE UPDATE ON monthly_expense
  FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

CREATE TRIGGER monthly_production_updated_at
  BEFORE UPDATE ON monthly_production
  FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

CREATE TRIGGER quality_record_updated_at
  BEFORE UPDATE ON quality_record
  FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ============================================================
-- RLS POLİTİKALARI
-- ============================================================

ALTER TABLE workshop ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workshop_select" ON workshop FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "workshop_insert" ON workshop FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);
CREATE POLICY "workshop_update" ON workshop FOR UPDATE USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);

ALTER TABLE production_line ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_select" ON production_line FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "line_insert" ON production_line FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);
CREATE POLICY "line_update" ON production_line FOR UPDATE USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);

ALTER TABLE master_process ENABLE ROW LEVEL SECURITY;
CREATE POLICY "process_select" ON master_process FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "process_admin" ON master_process FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role = 'pes_admin')
);

ALTER TABLE product_category ENABLE ROW LEVEL SECURITY;
CREATE POLICY "category_select" ON product_category FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "category_admin" ON product_category FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role = 'pes_admin')
);

ALTER TABLE process_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY "template_select" ON process_template FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "template_admin" ON process_template FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role = 'pes_admin')
);

ALTER TABLE workshop_product ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wp_select" ON workshop_product FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "wp_write" ON workshop_product FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);

ALTER TABLE model_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_select" ON model_library FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "model_write" ON model_library FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);

ALTER TABLE monthly_expense ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_select" ON monthly_expense FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "expense_write" ON monthly_expense FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);

ALTER TABLE monthly_production ENABLE ROW LEVEL SECURITY;
CREATE POLICY "production_select" ON monthly_production FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "production_write" ON monthly_production FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);

ALTER TABLE line_process_capacity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capacity_select" ON line_process_capacity FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "capacity_write" ON line_process_capacity FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);

ALTER TABLE quality_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quality_select" ON quality_record FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "quality_write" ON quality_record FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);

ALTER TABLE downtime_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY "downtime_select" ON downtime_record FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "downtime_write" ON downtime_record FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);

ALTER TABLE changeover_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY "changeover_select" ON changeover_record FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "changeover_write" ON changeover_record FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);

ALTER TABLE workforce_turnover ENABLE ROW LEVEL SECURITY;
CREATE POLICY "turnover_select" ON workforce_turnover FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "turnover_write" ON workforce_turnover FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','operator'))
);

ALTER TABLE supplier_score ENABLE ROW LEVEL SECURITY;
CREATE POLICY "score_select" ON supplier_score FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "score_admin" ON supplier_score FOR ALL USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role = 'pes_admin')
);

ALTER TABLE pes_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin" ON pes_audit_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM pes_user_roles WHERE user_id = auth.uid() AND role IN ('pes_admin','yonetim'))
);

-- ============================================================
-- İNDEKSLER
-- ============================================================
CREATE INDEX idx_workshop_city ON workshop(city);
CREATE INDEX idx_workshop_type ON workshop(type);
CREATE INDEX idx_workshop_active ON workshop(is_active);
CREATE INDEX idx_line_workshop ON production_line(workshop_id);
CREATE INDEX idx_expense_workshop_month ON monthly_expense(workshop_id, year, month);
CREATE INDEX idx_production_workshop_month ON monthly_production(workshop_id, year, month);
CREATE INDEX idx_production_line_month ON monthly_production(line_id, year, month);
CREATE INDEX idx_capacity_line_month ON line_process_capacity(line_id, year, month);
CREATE INDEX idx_quality_workshop_month ON quality_record(workshop_id, year, month);
CREATE INDEX idx_downtime_line ON downtime_record(line_id, occurred_at);
CREATE INDEX idx_changeover_line ON changeover_record(line_id, occurred_date);
CREATE INDEX idx_turnover_workshop_month ON workforce_turnover(workshop_id, year, month);
CREATE INDEX idx_score_workshop_month ON supplier_score(workshop_id, year, month);
CREATE INDEX idx_audit_table ON pes_audit_log(table_name, created_at);
CREATE INDEX idx_pes_roles_user ON pes_user_roles(user_id);

COMMIT;
