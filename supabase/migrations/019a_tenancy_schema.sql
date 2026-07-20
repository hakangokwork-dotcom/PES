-- ============================================================
-- Migration 019a — Multi-Tenancy Schema (Güvenli Aşama)
-- ProMode-A v3 SaaS pivot, Faz 1.1
-- Audit ref: vault/audit/2026-04-27-faz0-inventory.md
-- ============================================================
--
-- BU MIGRATION GÜVENLİDİR — apply edildikten sonra mevcut sistem çalışmaya devam eder.
-- (tenant_id NULL, RLS pasif. Eski route'lar getDB() ile sorunsuz çalışır.)
--
-- İçerik:
--   1. tenant + tenant_user tabloları
--   2. Tenant context helpers (current_tenant_id, is_tenant_member, is_internal_admin)
--   3. Default tenant + 33 operational tabloya tenant_id (NULLABLE)
--   4. Hibrit tablolar: model_library, pes_audit_log
--   5. Mevcut data göçü (default tenant'a UPDATE)
--   6. pes_user_roles → tenant_user göçü
--   7. tenant_id INDEX'leri
--
-- 019b (enforcement) ROUTE REFACTOR'I TAMAMLANDIKTAN SONRA apply edilir:
--   - NOT NULL constraint
--   - RLS enable + FORCE + policies
--
-- ÖN KOŞUL: 007/008 duplicate _clean dosyaları silinmiş. ✓
-- ============================================================

BEGIN;

-- ============================================================
-- 1. TENANT TABLOSU
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug              TEXT UNIQUE NOT NULL,
    name              TEXT NOT NULL,
    type              TEXT NOT NULL CHECK (type IN ('individual','parent','internal')),
    parent_tenant_id  UUID REFERENCES tenant(id) ON DELETE SET NULL,
    plan_id           INTEGER,  -- Migration 020'de subscription_plan FK
    locale            TEXT NOT NULL DEFAULT 'tr' CHECK (locale IN ('tr','en')),
    status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled','trial')),
    trial_ends_at     TIMESTAMPTZ,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_parent ON tenant(parent_tenant_id) WHERE parent_tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_status ON tenant(status);

COMMENT ON TABLE  tenant IS 'Multi-tenant root. type=individual (bireysel atölye), parent (ana üretici), internal (ProMode-A şirketi).';
COMMENT ON COLUMN tenant.parent_tenant_id IS 'Alt-tenant ise üst parent tenant referansı. Bireysel tenant''larda NULL.';

-- ============================================================
-- 2. TENANT_USER TABLOSU
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_user (
    id           SERIAL PRIMARY KEY,
    tenant_id    UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
    workshop_id  INTEGER,
    is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_user_user   ON tenant_user(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_user_tenant ON tenant_user(tenant_id);

COMMENT ON TABLE tenant_user IS 'Bir kullanıcı birden fazla tenant''a bağlı olabilir (parent admin + alt fason owner gibi).';

-- ============================================================
-- 3. TENANT CONTEXT HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION is_tenant_member(tid UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant_user
        WHERE tenant_id = tid AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION is_internal_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT
        COALESCE(current_setting('app.is_internal', true) = 'true', false)
        OR EXISTS (
            SELECT 1 FROM tenant_user tu
            JOIN tenant t ON t.id = tu.tenant_id
            WHERE tu.user_id = auth.uid()
              AND t.type = 'internal'
              AND tu.role IN ('owner','admin')
        );
$$;

-- Faz 5 (parent görünürlük) için hazırlık
CREATE OR REPLACE FUNCTION current_tenant_or_children() RETURNS UUID[]
LANGUAGE sql STABLE AS $$
    WITH ctx AS (SELECT current_tenant_id() AS tid)
    SELECT ARRAY(
        SELECT id FROM tenant
        WHERE id = (SELECT tid FROM ctx)
           OR parent_tenant_id = (SELECT tid FROM ctx)
    );
$$;

-- ============================================================
-- 4. DEFAULT TENANT
-- ============================================================
INSERT INTO tenant (slug, name, type, locale, status)
VALUES ('default', 'Default Tenant (göç edilmiş veri)', 'internal', 'tr', 'active')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 5. OPERATIONAL TABLOLARA tenant_id (NULLABLE)
-- ============================================================
DO $$
DECLARE
    t TEXT;
    operational_tables TEXT[] := ARRAY[
        'workshop','production_line','workshop_product',
        'monthly_expense','monthly_production','line_process_capacity',
        'quality_record','downtime_record','changeover_record',
        'workforce_turnover','supplier_score',
        'dk_maliyet','eder_model','eder_operasyon_grubu',
        'eder_alt_operasyon','eder_atolye_teklif',
        'wip_record','operation_measurement',
        'work_order','operator','operator_performance',
        'yikama_record','ukp_record','kaizen_action',
        'capability_dimension','capability_value','line_capability',
        'eder_model_islem',
        'work_order_stage','work_order_material','work_order_journal',
        'line_schedule','work_order_status_history'
    ];
BEGIN
    FOREACH t IN ARRAY operational_tables LOOP
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id) ON DELETE CASCADE',
            t
        );
    END LOOP;
END $$;

-- ============================================================
-- 6. HİBRİT TABLOLAR (tenant_id NULLABLE — kalıcı olarak)
-- ============================================================
ALTER TABLE model_library  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE pes_audit_log  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id) ON DELETE SET NULL;

-- ============================================================
-- 7. MEVCUT VERİ GÖÇÜ → DEFAULT TENANT
-- ============================================================
DO $$
DECLARE
    default_tid UUID;
    t TEXT;
    operational_tables TEXT[] := ARRAY[
        'workshop','production_line','workshop_product',
        'monthly_expense','monthly_production','line_process_capacity',
        'quality_record','downtime_record','changeover_record',
        'workforce_turnover','supplier_score',
        'dk_maliyet','eder_model','eder_operasyon_grubu',
        'eder_alt_operasyon','eder_atolye_teklif',
        'wip_record','operation_measurement',
        'work_order','operator','operator_performance',
        'yikama_record','ukp_record','kaizen_action',
        'capability_dimension','capability_value','line_capability',
        'eder_model_islem',
        'work_order_stage','work_order_material','work_order_journal',
        'line_schedule','work_order_status_history'
    ];
BEGIN
    SELECT id INTO default_tid FROM tenant WHERE slug = 'default';
    IF default_tid IS NULL THEN
        RAISE EXCEPTION 'Default tenant bulunamadı';
    END IF;

    FOREACH t IN ARRAY operational_tables LOOP
        EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL', t, default_tid);
    END LOOP;
END $$;

-- ============================================================
-- 8. PES_USER_ROLES → TENANT_USER GÖÇÜ
-- ============================================================
-- Eğer pes_user_roles dolu ise: en yüksek role mapping ile göç
-- Eğer pes_user_roles boş (dev ortam) ise: fallback — tüm auth.users'ı
--   default tenant'a 'owner' olarak ekle (manuel müdahale gerektirmez)
DO $$
DECLARE
    default_tid UUID;
    role_count  INTEGER;
BEGIN
    SELECT id INTO default_tid FROM tenant WHERE slug = 'default';
    SELECT count(*) INTO role_count FROM pes_user_roles;

    IF role_count > 0 THEN
        INSERT INTO tenant_user (tenant_id, user_id, role, workshop_id, is_primary, created_at)
        SELECT DISTINCT ON (pur.user_id)
            default_tid,
            pur.user_id,
            CASE pur.role
                WHEN 'pes_admin' THEN 'owner'
                WHEN 'yonetim'   THEN 'admin'
                WHEN 'analist'   THEN 'editor'
                WHEN 'operator'  THEN 'editor'
                WHEN 'izleyici'  THEN 'viewer'
                ELSE 'viewer'
            END,
            pur.workshop_id,
            true,
            pur.created_at
        FROM pes_user_roles pur
        ORDER BY pur.user_id,
            CASE pur.role
                WHEN 'pes_admin' THEN 1
                WHEN 'yonetim'   THEN 2
                WHEN 'analist'   THEN 3
                WHEN 'operator'  THEN 4
                WHEN 'izleyici'  THEN 5
                ELSE 6
            END
        ON CONFLICT (tenant_id, user_id) DO NOTHING;
    ELSE
        -- pes_user_roles boş: dev ortamı, mevcut tüm auth user'ları owner olarak ekle
        INSERT INTO tenant_user (tenant_id, user_id, role, is_primary, created_at)
        SELECT default_tid, u.id, 'owner', true, NOW()
        FROM auth.users u
        ON CONFLICT (tenant_id, user_id) DO NOTHING;
    END IF;
END $$;

COMMENT ON TABLE pes_user_roles IS 'DEPRECATED v3 (2026-04-27). tenant_user tablosuna göç edildi. Yeni kayıt eklemeyin.';

-- ============================================================
-- 9. PERFORMANS — tenant_id INDEX'LERİ
-- ============================================================
DO $$
DECLARE
    t TEXT;
    all_tenant_tables TEXT[] := ARRAY[
        'workshop','production_line','workshop_product',
        'monthly_expense','monthly_production','line_process_capacity',
        'quality_record','downtime_record','changeover_record',
        'workforce_turnover','supplier_score',
        'dk_maliyet','eder_model','eder_operasyon_grubu',
        'eder_alt_operasyon','eder_atolye_teklif',
        'wip_record','operation_measurement',
        'work_order','operator','operator_performance',
        'yikama_record','ukp_record','kaizen_action',
        'capability_dimension','capability_value','line_capability',
        'eder_model_islem',
        'work_order_stage','work_order_material','work_order_journal',
        'line_schedule','work_order_status_history',
        'model_library','pes_audit_log'
    ];
BEGIN
    FOREACH t IN ARRAY all_tenant_tables LOOP
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_tenant ON %I(tenant_id)', t, t);
    END LOOP;
END $$;

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA (manuel)
-- ============================================================
-- 1. SELECT count(*) FROM tenant;                                -- en az 1 (default)
-- 2. SELECT count(*) FROM workshop WHERE tenant_id IS NULL;       -- 0
-- 3. SELECT count(*) FROM tenant_user;                            -- pes_user_roles uniq user kadar
-- 4. SELECT * FROM workshop LIMIT 5;                              -- mevcut data hâlâ erişilebilir (RLS yok)
