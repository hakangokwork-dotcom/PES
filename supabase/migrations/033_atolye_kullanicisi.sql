-- ============================================================
-- Migration 033 — Atölye kullanıcısı ve satır seviyesi kısıtı
-- ============================================================
--
-- HEDEF (kullanıcı, 2026-08-13): "bir atölye kendine ait bir tabletten
-- girsin, kendi kullanıcısı ile kendi alanlarını doldursun… atölye panelini
-- gerçekten atölyenin kendisinin kullanacağı versiyona çevirmek istiyoruz."
--
-- BUGÜNKÜ DURUM VE RİSK:
--   /workshop ekranları atölyeyi URL'den alıyor (`?wid=12`). Kullanıcı ile
--   atölye arasında hiçbir bağ yok. Bugün sorun değil çünkü oraya yalnız
--   merkez ekibi giriyor; atölyelere hesap açıldığı an `wid` değiştirilerek
--   başka atölyenin verisi okunur.
--
-- NEDEN EKRANDA DEĞİL, BURADA:
--   Atölyeye bağlı 34 tablo var; panelde 17 ekran ve onlarca API ucu bunlara
--   dokunuyor. Kontrolü uygulama katmanına yaymak, her yeni ekranda yeniden
--   hatırlanması gereken bir kural demek — 019b'de aynı ders alınmıştı
--   (46 sayfanın 35'inde oturum kontrolü unutulmuştu). Kısıt veritabanında
--   olursa yeni bir ekran yanlışlıkla açık gelemez.
--
-- KURAL:
--   current_workshop_id() NULL  -> merkez kullanıcısı, kısıt yok (bugünkü
--                                  davranış birebir korunur)
--   NULL değil                  -> yalnız o atölyenin satırları
--
--   Yani bu migration tek başına HİÇBİR ŞEYİ DEĞİŞTİRMEZ: workshop_user
--   tablosu boş olduğu sürece herkes merkez kullanıcısıdır. Kısıt ancak bir
--   kullanıcı bir atölyeye bağlandığında devreye girer.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. KULLANICI -> ATÖLYE BAĞI
-- ============================================================
-- Bir kullanıcı BİR atölyeye bağlanır. Çok atölyeli kullanıcı (grup sahibi)
-- bilinçli olarak kapsam dışı: current_workshop_id() tek değer döndürmek
-- zorunda, çoklu üyelik "hangisi aktif" sorusunu ve bir atölye seçici
-- getirir. İhtiyaç doğarsa PK genişletilir.
CREATE TABLE IF NOT EXISTS workshop_user (
    user_id     UUID PRIMARY KEY,
    workshop_id INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE workshop_user IS
'Kullanıcıyı bir atölyeye bağlar. Kaydı OLMAYAN kullanıcı merkez kullanıcısıdır ve her atölyeyi görür; kaydı olan yalnız kendi atölyesini.';

CREATE INDEX IF NOT EXISTS idx_wu_workshop ON workshop_user(workshop_id);

-- ============================================================
-- 2. AKTİF ATÖLYE
-- ============================================================
-- Uygulama her transaction'da app.current_workshop_id ayarını yazar
-- (lib/supabase/tenant-db.ts). Ayar yoksa ya da boşsa NULL = kısıt yok.
CREATE OR REPLACE FUNCTION current_workshop_id()
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT NULLIF(current_setting('app.current_workshop_id', true), '')::int;
$$;

COMMENT ON FUNCTION current_workshop_id() IS
'Oturumdaki atölye. NULL ise merkez kullanıcısı — atölye kısıtı uygulanmaz.';

-- Kullanıcının atölyesini çözen SECURITY DEFINER fonksiyon.
-- resolve_tenant_context() ile aynı gerekçe (019c): uygulama pes_app
-- rolüyle bağlanıyor, auth.uid() NULL, doğrudan sorgu 0 satır döndürür.
CREATE OR REPLACE FUNCTION resolve_workshop_id(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT workshop_id FROM workshop_user WHERE user_id = p_user_id;
$$;

COMMENT ON FUNCTION resolve_workshop_id(UUID) IS
'Kullanıcının bağlı olduğu atölye, yoksa NULL (merkez kullanıcısı).';

REVOKE ALL ON FUNCTION resolve_workshop_id(UUID) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION resolve_workshop_id(UUID) TO pes_app';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON workshop_user TO pes_app';
    END IF;
END $$;

ALTER TABLE workshop_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_user FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workshop_user_tenant_isolation ON workshop_user;
CREATE POLICY workshop_user_tenant_isolation ON workshop_user
    FOR ALL USING (tenant_id = current_tenant_id() OR is_internal_admin());
REVOKE ALL ON workshop_user FROM anon, authenticated;

-- ============================================================
-- 3. ATÖLYE KISITI — mevcut tenant politikalarına eklenir
-- ============================================================
-- Politikalar YENİDEN yazılıyor; tenant kuralı aynen korunuyor, üstüne
-- atölye kuralı AND'leniyor. Tenant izolasyonu hiçbir yerde gevşemiyor.
DO $$
DECLARE
    t TEXT;
    -- workshop_id kolonu taşıyanlar.
    -- tenant_user ve pes_user_roles BİLEREK DIŞARIDA: ikisi de kimlik
    -- çözümleme tabloları, kısıtlanırsa context'in kendisi çözülemez.
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
    -- Yalnız line_id taşıyanlar — atölyeye bant üzerinden bağlılar.
    dolayli TEXT[] := ARRAY[
        'changeover_record','line_capability','line_schedule','work_order_stage_atama'
    ];
BEGIN
    FOREACH t IN ARRAY dogrudan LOOP
        IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()))',
            t || '_tenant_isolation', t);
    END LOOP;

    FOREACH t IN ARRAY dolayli LOOP
        IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND (current_workshop_id() IS NULL OR EXISTS (
                       SELECT 1 FROM production_line pl
                        WHERE pl.id = %I.line_id AND pl.workshop_id = current_workshop_id())))',
            t || '_tenant_isolation', t, t);
    END LOOP;
END $$;

-- ATÖLYENİN KENDİSİ: workshop tablosunda kolon adı workshop_id değil id.
DROP POLICY IF EXISTS workshop_tenant_isolation ON workshop;
CREATE POLICY workshop_tenant_isolation ON workshop
    FOR ALL USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR id = current_workshop_id()));

-- OLGUNLUK CEVAPLARI: workshop_id yok, denetim üzerinden bağlı.
DROP POLICY IF EXISTS olgunluk_denetim_kriter_tenant_isolation ON olgunluk_denetim_kriter;
CREATE POLICY olgunluk_denetim_kriter_tenant_isolation ON olgunluk_denetim_kriter
    FOR ALL USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR EXISTS (
              SELECT 1 FROM olgunluk_denetim d
               WHERE d.id = olgunluk_denetim_kriter.denetim_id
                 AND d.workshop_id = current_workshop_id())));

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
--   node scripts/verify_workshop_isolation.mjs
--
-- Elle:
--   SELECT set_config('app.current_tenant_id', '<tenant>', false);
--   SELECT count(*) FROM workshop;                       -- hepsi
--   SELECT set_config('app.current_workshop_id', '12', false);
--   SELECT count(*) FROM workshop;                       -- 1
--   SELECT count(*) FROM workshop_denetim;               -- yalnız 12'ninki
--
-- KATALOG KISITLANMADI: olgunluk_sablon / kategori / surec / kriter tüm
-- atölyeler için ortaktır, atölye kendi sorularını görmeli.
--
-- ROLLBACK: politikaları 029/019b'deki sade hallerine döndürmek için
--   aynı DO döngüsünü "AND (current_workshop_id() ...)" kısmı olmadan
--   çalıştırın, sonra:
--   DROP FUNCTION IF EXISTS resolve_workshop_id(UUID);
--   DROP FUNCTION IF EXISTS current_workshop_id();
--   DROP TABLE IF EXISTS workshop_user;
-- ============================================================
