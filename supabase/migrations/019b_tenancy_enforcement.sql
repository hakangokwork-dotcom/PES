-- ============================================================
-- Migration 019b — Multi-Tenancy Enforcement (Sıkı Aşama)
-- ProMode-A v3 SaaS pivot, Faz 1.1
-- ============================================================
--
-- ⚠️ DİKKAT — BU MIGRATION GERİ DÖNÜŞSÜZ DEĞİŞİKLİK GETİRİR:
--   - tenant_id NOT NULL (yeni INSERT'lerde tenant_id zorunlu)
--   - RLS aktif + FORCE (service role connection bile policy'ye tabi)
--
-- ÖN KOŞUL:
--   1. 019a apply edildi (tenant tabloları + nullable tenant_id + veri göçü)
--   2. TÜM API route'ları withTenantRoute() pattern'ine geçti
--      (eski getDB() doğrudan kullanan route'lar 0 satır görür)
--   3. Frontend tenant context cookie/header set ediyor
--
-- ROLLBACK PLANI:
--   - DROP POLICY (her tablo için)
--   - ALTER TABLE ... DISABLE ROW LEVEL SECURITY
--   - ALTER TABLE ... ALTER COLUMN tenant_id DROP NOT NULL
--   (mevcut tenant_id verisi silinmez — sadece enforcement geri alınır)
-- ============================================================

BEGIN;

-- ============================================================
-- 0. ESKİ MİGRATİON 005 POLİCİY'LERİNİ TEMİZLE
-- ============================================================
-- Migration 005 her tabloya pes_user_roles-bazlı policy'ler eklemiş.
-- Backend getDB() postgres pooler user'ı ile bağlandığı için auth.uid() NULL
-- → eski policy'ler pratikte kullanılmıyor (zaten BYPASSRLS).
-- 019b FORCE ekleyince eski policy'ler aktif olacak ve kafa karıştıracak.
-- Yenileri (tenant_isolation) bunlarla yan yana yaşar (OR), ama net olsun:

DROP POLICY IF EXISTS pes_roles_select_own ON pes_user_roles;
DROP POLICY IF EXISTS pes_roles_admin_all  ON pes_user_roles;
DROP POLICY IF EXISTS workshop_select      ON workshop;
DROP POLICY IF EXISTS workshop_insert      ON workshop;
DROP POLICY IF EXISTS workshop_update      ON workshop;
DROP POLICY IF EXISTS line_select          ON production_line;
DROP POLICY IF EXISTS line_insert          ON production_line;
DROP POLICY IF EXISTS line_update          ON production_line;
DROP POLICY IF EXISTS process_select       ON master_process;
DROP POLICY IF EXISTS process_admin        ON master_process;
DROP POLICY IF EXISTS category_select      ON product_category;
DROP POLICY IF EXISTS category_admin       ON product_category;
DROP POLICY IF EXISTS template_select      ON process_template;
DROP POLICY IF EXISTS template_admin       ON process_template;
DROP POLICY IF EXISTS wp_select            ON workshop_product;
DROP POLICY IF EXISTS wp_write             ON workshop_product;
DROP POLICY IF EXISTS model_select         ON model_library;
DROP POLICY IF EXISTS model_write          ON model_library;
DROP POLICY IF EXISTS expense_select       ON monthly_expense;
DROP POLICY IF EXISTS expense_write        ON monthly_expense;
DROP POLICY IF EXISTS production_select    ON monthly_production;
DROP POLICY IF EXISTS production_write     ON monthly_production;
DROP POLICY IF EXISTS capacity_select      ON line_process_capacity;
DROP POLICY IF EXISTS capacity_write       ON line_process_capacity;
DROP POLICY IF EXISTS quality_select       ON quality_record;
DROP POLICY IF EXISTS quality_write        ON quality_record;
DROP POLICY IF EXISTS downtime_select      ON downtime_record;
DROP POLICY IF EXISTS downtime_write       ON downtime_record;
DROP POLICY IF EXISTS changeover_select    ON changeover_record;
DROP POLICY IF EXISTS changeover_write     ON changeover_record;
DROP POLICY IF EXISTS turnover_select      ON workforce_turnover;
DROP POLICY IF EXISTS turnover_write       ON workforce_turnover;
DROP POLICY IF EXISTS score_select         ON supplier_score;
DROP POLICY IF EXISTS score_admin          ON supplier_score;
DROP POLICY IF EXISTS audit_admin          ON pes_audit_log;

-- ============================================================
-- 1. NOT NULL CONSTRAINT (33 operational tablo)
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
        -- Apply etmeden önce kontrol: NULL olan satır varsa hata
        EXECUTE format(
            'DO $check$ BEGIN
                IF EXISTS (SELECT 1 FROM %I WHERE tenant_id IS NULL LIMIT 1) THEN
                    RAISE EXCEPTION ''%I tablosunda tenant_id NULL satır var, 019a göçü tamamlanmamış'';
                END IF;
            END $check$;', t, t
        );
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', t);
    END LOOP;
END $$;

-- ============================================================
-- 2. TENANT + TENANT_USER İÇİN RLS
-- ============================================================
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_member_select ON tenant;
DROP POLICY IF EXISTS tenant_internal_all ON tenant;
CREATE POLICY tenant_member_select ON tenant
    FOR SELECT USING (is_tenant_member(id) OR is_internal_admin());
CREATE POLICY tenant_internal_all ON tenant
    FOR ALL USING (is_internal_admin());

ALTER TABLE tenant_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_user FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_user_self ON tenant_user;
DROP POLICY IF EXISTS tenant_user_admin ON tenant_user;
CREATE POLICY tenant_user_self ON tenant_user
    FOR SELECT USING (user_id = auth.uid() OR is_internal_admin());
CREATE POLICY tenant_user_admin ON tenant_user
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tenant_user tu
            WHERE tu.tenant_id = tenant_user.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner','admin')
        ) OR is_internal_admin()
    );

-- ============================================================
-- 3. OPERATIONAL TABLOLAR — RLS + FORCE + POLICIES
-- ============================================================
DO $$
DECLARE
    t TEXT;
    rls_tables TEXT[] := ARRAY[
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
    policy_name TEXT;
BEGIN
    FOREACH t IN ARRAY rls_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

        policy_name := t || '_tenant_isolation';
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, t);
        EXECUTE format(
            'CREATE POLICY %I ON %I
                FOR ALL USING (tenant_id = current_tenant_id() OR is_internal_admin())',
            policy_name, t
        );
    END LOOP;
END $$;

-- ============================================================
-- 4. HİBRİT TABLOLAR — model_library
-- ============================================================
ALTER TABLE model_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_library FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS model_library_hybrid ON model_library;
DROP POLICY IF EXISTS model_library_tenant_write ON model_library;
DROP POLICY IF EXISTS model_library_tenant_update ON model_library;
DROP POLICY IF EXISTS model_library_tenant_delete ON model_library;

CREATE POLICY model_library_hybrid ON model_library
    FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id() OR is_internal_admin());
CREATE POLICY model_library_tenant_write ON model_library
    FOR INSERT WITH CHECK (tenant_id = current_tenant_id() OR is_internal_admin());
CREATE POLICY model_library_tenant_update ON model_library
    FOR UPDATE USING (tenant_id = current_tenant_id() OR is_internal_admin());
CREATE POLICY model_library_tenant_delete ON model_library
    FOR DELETE USING (tenant_id = current_tenant_id() OR is_internal_admin());

-- ============================================================
-- 4b. GLOBAL REFERANS TABLOLAR (tenant_id YOK ama RLS aktif)
-- ============================================================
-- master_process, product_category, process_template
--   → tüm tenant'lar paylaşır (Konfeksiyon master katalog)
--   → SELECT: tenant context'inde olan herkes
--   → INSERT/UPDATE/DELETE: sadece internal admin
DO $$
DECLARE
    t TEXT;
    global_tables TEXT[] := ARRAY['master_process','product_category','process_template'];
BEGIN
    FOREACH t IN ARRAY global_tables LOOP
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY %I_global_read ON %I
                FOR SELECT USING (current_tenant_id() IS NOT NULL OR is_internal_admin())',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY %I_internal_write ON %I
                FOR ALL USING (is_internal_admin()) WITH CHECK (is_internal_admin())',
            t, t
        );
    END LOOP;
END $$;

-- pes_user_roles: deprecated, RLS açık, hiç policy yok → kimse erişemez (en sıkı)
ALTER TABLE pes_user_roles FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 5. HİBRİT TABLOLAR — pes_audit_log
-- ============================================================
ALTER TABLE pes_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pes_audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_tenant_read ON pes_audit_log;
DROP POLICY IF EXISTS audit_log_insert_anyone ON pes_audit_log;

CREATE POLICY audit_log_tenant_read ON pes_audit_log
    FOR SELECT USING (tenant_id = current_tenant_id() OR is_internal_admin());
CREATE POLICY audit_log_insert_anyone ON pes_audit_log
    FOR INSERT WITH CHECK (true);

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA (manuel)
-- ============================================================
-- 1. SELECT count(*) FROM workshop;
--    -- 0 olmalı (tenant context yok, RLS engelliyor)
--
-- 2. SELECT set_config('app.current_tenant_id',
--      (SELECT id::text FROM tenant WHERE slug='default'), true);
--    SELECT count(*) FROM workshop;
--    -- mevcut workshop sayısı (tenant context aktif)
--    RESET app.current_tenant_id;
--
-- 3. SELECT relname, relforcerowsecurity
--    FROM pg_class
--    WHERE relkind='r' AND relname IN ('workshop','work_order','eder_model','tenant');
--    -- relforcerowsecurity = true olmalı
