-- ============================================================
-- Migration 022 — Beyan Güven Skoru
-- PES Entegrasyon Planı v0.1, Sprint 2
-- Ref: PES-ENTEGRASYON-PLANI.md §2 / 022_declaration_quality.sql
-- ============================================================
--
-- BU MIGRATION GÜVENLİDİR — yalnız additive DDL.
--
-- İçerik:
--   1. validation_param — dönemsel kural parametreleri
--   2. declaration_quality — 4 boyutlu güven skoru + bayraklar
--   3. RLS + FORCE + tenant_isolation (019b kalıbı)
--   4. Başlangıç parametreleri (2025-11'den itibaren)
--
-- TASARIM NOTU — kural mantığı nerede:
--   Plan §2/022 hem Postgres fonksiyonu hem Zod şeması öngörüyor.
--   Aynı kuralı iki dilde tutmak sapma riski yaratır (biri güncellenir,
--   diğeri unutulur) ve planın kendi gerekçesi "hem client hem server
--   aynı kuralı kullansın". Bu yüzden kural mantığı TEK yerde:
--     lib/pes/validation-rules.ts
--   Bu tablo yalnız parametreleri ve sonuçları saklar; hesap yapmaz.
--   Parametre değişince (asgari ücret vb.) tek satır eklenir, kod
--   dokunulmaz.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. VALIDATION_PARAM — dönemsel kural parametreleri
-- ============================================================
-- Dönem bazlı: yeni dönem için satır eklenir, eskisi tarihte kalır.
-- Bir parametrenin bir dönemdeki değeri = donem_from <= hedef dönem
-- olan en güncel satır.
CREATE TABLE IF NOT EXISTS validation_param (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID REFERENCES tenant(id) ON DELETE CASCADE,  -- NULL = global varsayılan
    param_key   TEXT NOT NULL,
    donem_from  VARCHAR(20) NOT NULL,        -- 'YYYY-MM' — bu dönemden itibaren geçerli
    value_num   NUMERIC(14,4),
    value_text  TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, param_key, donem_from)
);

CREATE INDEX IF NOT EXISTS idx_validation_param_lookup
    ON validation_param(param_key, donem_from DESC);
CREATE INDEX IF NOT EXISTS idx_validation_param_tenant ON validation_param(tenant_id);

COMMENT ON TABLE  validation_param IS 'Güven skoru kural parametreleri, dönem bazlı. tenant_id NULL = global varsayılan; tenant kendi satırıyla ezebilir.';
COMMENT ON COLUMN validation_param.donem_from IS 'Bu dönemden itibaren geçerli. Asgari ücret değişince yeni satır eklenir, eski değer geçmiş dönemler için korunur.';

-- ============================================================
-- 2. DECLARATION_QUALITY — 4 boyutlu güven skoru
-- ============================================================
CREATE TABLE IF NOT EXISTS declaration_quality (
    id             SERIAL PRIMARY KEY,
    tenant_id      UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    staging_id     INTEGER REFERENCES expense_declaration_staging(id) ON DELETE SET NULL,
    expense_id     INTEGER REFERENCES monthly_expense(id) ON DELETE CASCADE,
    workshop_id    INTEGER REFERENCES workshop(id) ON DELETE CASCADE,
    donem          VARCHAR(20) NOT NULL,

    completeness_sc NUMERIC(5,1) CHECK (completeness_sc BETWEEN 0 AND 100),
    consistency_sc  NUMERIC(5,1) CHECK (consistency_sc  BETWEEN 0 AND 100),
    plausibility_sc NUMERIC(5,1) CHECK (plausibility_sc BETWEEN 0 AND 100),
    crosscheck_sc   NUMERIC(5,1) CHECK (crosscheck_sc   BETWEEN 0 AND 100),
    total_sc        NUMERIC(5,1) CHECK (total_sc        BETWEEN 0 AND 100),

    flags          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{field, rule, severity, message, suggested_fix}]
    status         TEXT NOT NULL DEFAULT 'pending_fix'
                   CHECK (status IN ('accepted','winsorized','rejected','pending_fix')),
    rule_version   TEXT,                                 -- hangi kural setiyle skorlandı
    computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Bir gider satırının tek güncel skoru olur
    UNIQUE (expense_id)
);

CREATE INDEX IF NOT EXISTS idx_declq_tenant  ON declaration_quality(tenant_id);
CREATE INDEX IF NOT EXISTS idx_declq_donem   ON declaration_quality(donem);
CREATE INDEX IF NOT EXISTS idx_declq_ws      ON declaration_quality(workshop_id);
CREATE INDEX IF NOT EXISTS idx_declq_status  ON declaration_quality(status);
-- 024 peer snapshot yalnız accepted satırları alacak
CREATE INDEX IF NOT EXISTS idx_declq_accepted
    ON declaration_quality(donem, workshop_id) WHERE status = 'accepted';

COMMENT ON TABLE  declaration_quality IS 'Beyan güven skoru. 024 peer snapshot yalnız status=accepted satırları havuza alır; 025 ASE composite_sc bunu çarpan olarak kullanır.';
COMMENT ON COLUMN declaration_quality.flags IS 'Kural ihlalleri: [{field, rule, severity: info|warn|error, message, suggested_fix}]. Hesap lib/pes/validation-rules.ts içinde.';
COMMENT ON COLUMN declaration_quality.status IS 'accepted >= kabul eşiği | winsorized: aykırı değer kırpıldı | pending_fix: düzeltme bekliyor | rejected: havuza girmez.';

-- ============================================================
-- 3. RLS + FORCE + TENANT ISOLATION (019b kalıbı)
-- ============================================================
-- validation_param hibrit: global varsayılan (tenant_id NULL) + tenant ezmesi
ALTER TABLE validation_param ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_param FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS validation_param_hybrid_read ON validation_param;
CREATE POLICY validation_param_hybrid_read ON validation_param
    FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id() OR is_internal_admin());
DROP POLICY IF EXISTS validation_param_tenant_write ON validation_param;
CREATE POLICY validation_param_tenant_write ON validation_param
    FOR INSERT WITH CHECK (tenant_id = current_tenant_id() OR is_internal_admin());
DROP POLICY IF EXISTS validation_param_tenant_update ON validation_param;
CREATE POLICY validation_param_tenant_update ON validation_param
    FOR UPDATE USING (tenant_id = current_tenant_id() OR is_internal_admin());
DROP POLICY IF EXISTS validation_param_tenant_delete ON validation_param;
CREATE POLICY validation_param_tenant_delete ON validation_param
    FOR DELETE USING (tenant_id = current_tenant_id() OR is_internal_admin());

ALTER TABLE declaration_quality ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaration_quality FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS declaration_quality_tenant_isolation ON declaration_quality;
CREATE POLICY declaration_quality_tenant_isolation ON declaration_quality
    FOR ALL USING (tenant_id = current_tenant_id() OR is_internal_admin());

-- ============================================================
-- 4. BAŞLANGIÇ PARAMETRELERİ (global, tenant_id NULL)
-- ============================================================
-- ⚠️ DEĞERLER MEVCUT SEED VERİSİNDEN TÜRETİLDİ, RESMİ KAYNAK DEĞİL.
-- Gözlenen: kişi başı maaş 29-35k TL, SGK/maaş ~%34, kişi başı yemek ~2.400 TL.
-- Gerçek formlar geldiğinde ve asgari ücret güncellendiğinde yeni
-- donem_from satırı eklenmeli.
INSERT INTO validation_param (tenant_id, param_key, donem_from, value_num, notes) VALUES
    (NULL, 'wage_per_person_min',   '2025-11', 20000,  'Kişi başı aylık maaş alt sınır (TL). Asgari ücret altına inerse şüpheli.'),
    (NULL, 'wage_per_person_max',   '2025-11', 60000,  'Kişi başı aylık maaş üst sınır (TL).'),
    (NULL, 'sgk_ratio_min',         '2025-11', 0.15,   'SGK / personel gideri alt oran.'),
    (NULL, 'sgk_ratio_max',         '2025-11', 0.50,   'SGK / personel gideri üst oran.'),
    (NULL, 'food_per_person_max',   '2025-11', 8000,   'Kişi başı aylık yemek gideri üst sınır (TL).'),
    (NULL, 'work_days_min',         '2025-11', 15,     'Aylık çalışma günü alt sınır.'),
    (NULL, 'work_days_max',         '2025-11', 31,     'Aylık çalışma günü üst sınır.'),
    (NULL, 'headcount_tolerance',   '2025-11', 0.30,   'Beyandan türetilen kişi sayısı ile workshop.total_staff arasındaki kabul edilebilir sapma oranı.'),
    (NULL, 'accept_threshold',      '2025-11', 70,     'total_sc bu değerin üstündeyse status=accepted. 025 ASE çarpanı da bu eşiği referans alır.'),
    (NULL, 'winsorize_threshold',   '2025-11', 50,     'total_sc bu değerin üstünde ama kabul eşiğinin altındaysa winsorized.')
ON CONFLICT (tenant_id, param_key, donem_from) DO NOTHING;

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA (manuel)
-- ============================================================
-- 1. SELECT count(*) FROM validation_param WHERE tenant_id IS NULL;  -- 10
-- 2. SELECT relforcerowsecurity FROM pg_class
--    WHERE relname IN ('validation_param','declaration_quality');    -- true, true
-- 3. Skorlama: POST /api/pes/expenses/quality  {"donem":"2026-01"}
--    SELECT status, count(*) FROM declaration_quality GROUP BY status;
