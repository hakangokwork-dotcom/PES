-- ============================================================
-- Migration 035 — 033'teki atölye kısıtının iki boşluğu
-- ============================================================
--
-- BOŞLUK 1: ÇOKLU POLİTİKA
--   PostgreSQL'de aynı tablodaki PERMISSIVE politikalar OR'lanır.
--   033 atölye kısıtını yalnız *_tenant_isolation politikasına ekledi;
--   model_library'nin ise beş politikası var ve SELECT'i ayrı bir
--   politikadan (model_library_hybrid) geliyor. Kısıt OR'un bir tarafında
--   kalınca hiçbir şey ifade etmedi: atölye kullanıcısı tüm tenant'ın
--   modellerini görmeye devam etti (ölçüldü: 10 satırın 10'u görünüyordu).
--
--   Etkilenen TEK tablo model_library — atölyeye bağlı 34 tablo içinde
--   birden fazla politikası olan başka tablo yok. Yine de asıl güvence
--   verify_workshop_isolation.mjs'in artık ÖRNEKLEME DEĞİL, tüm tabloları
--   taraması: bu sınıf hata bir daha sessizce geçemez.
--
-- BOŞLUK 2: GLOBAL SATIRLAR
--   model_library gibi tablolarda workshop_id NULL olabiliyor; bunlar
--   atölyeye ait değil, ORTAK katalog satırları. 033'ün kuralı
--   (workshop_id = current_workshop_id()) bunları atölyeden gizliyordu.
--   Ortak katalogu gizlemek, atölyenin kendi modelini bile tanımlayamaması
--   demek. Kural artık "workshop_id IS NULL OR ..." ile başlıyor.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. GLOBAL SATIRLAR HER YERDE GÖRÜNÜR
-- ============================================================
-- workshop_id NOT NULL olan tablolarda bu ek koşul hiçbir şeyi değiştirmez;
-- yalnız NULL'a izin veren tablolarda ortak satırları geri açar.
DO $$
DECLARE
    t TEXT;
    dogrudan TEXT[] := ARRAY[
        'declaration_quality','downtime_record','eder_model',
        'expense_declaration_staging','kaizen_action','line_process_capacity',
        'model_library','monthly_expense','monthly_production','olgunluk_denetim',
        'operation_measurement','operator','production_line','quality_record',
        'supplier_score','ukp_record','wip_record','work_order','work_order_stage',
        'workforce_turnover','workshop_account','workshop_contact',
        'workshop_customer_share','workshop_denetim','workshop_interaction',
        'workshop_product','workshop_profil','workshop_stage_capacity','yikama_record'
    ];
BEGIN
    FOREACH t IN ARRAY dogrudan LOOP
        IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND (current_workshop_id() IS NULL
                      OR workshop_id IS NULL
                      OR workshop_id = current_workshop_id()))',
            t || '_tenant_isolation', t);
    END LOOP;
END $$;

-- ============================================================
-- 2. model_library — DİĞER DÖRT POLİTİKA
-- ============================================================
-- Her birine aynı atölye koşulu ekleniyor; tenant kuralları aynen korunuyor.
DROP POLICY IF EXISTS model_library_hybrid ON model_library;
CREATE POLICY model_library_hybrid ON model_library
    FOR SELECT USING (
        (tenant_id IS NULL OR tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL
             OR workshop_id IS NULL
             OR workshop_id = current_workshop_id()));

DROP POLICY IF EXISTS model_library_tenant_update ON model_library;
CREATE POLICY model_library_tenant_update ON model_library
    FOR UPDATE USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL
             OR workshop_id IS NULL
             OR workshop_id = current_workshop_id()));

DROP POLICY IF EXISTS model_library_tenant_delete ON model_library;
CREATE POLICY model_library_tenant_delete ON model_library
    FOR DELETE USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL
             OR workshop_id IS NULL
             OR workshop_id = current_workshop_id()));

-- INSERT politikası USING değil WITH CHECK kullanır: yazılacak satır
-- atölyenin kendisine ait olmalı.
DROP POLICY IF EXISTS model_library_tenant_write ON model_library;
CREATE POLICY model_library_tenant_write ON model_library
    FOR INSERT WITH CHECK (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL
             OR workshop_id IS NULL
             OR workshop_id = current_workshop_id()));

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   node scripts/verify_workshop_isolation.mjs
--   (artık atölyeye bağlı TÜM tabloları tarar, örneklem değil)
--
-- ROLLBACK: 033'teki gövdeye dönmek için aynı DO döngüsünü
--   "OR workshop_id IS NULL" olmadan çalıştırın ve model_library'nin
--   dört politikasını 016/019b'deki hallerine geri koyun.
-- ============================================================
