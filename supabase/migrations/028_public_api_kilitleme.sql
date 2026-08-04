-- ============================================================
-- Migration 028 — Public REST API kilitleme (Supabase güvenlik uyarısı)
-- ============================================================
--
-- SORUN (2026-07-29, Supabase security advisor maili + doğrulama):
--
--   A) 14 tabloda RLS hiç açılmamış. `anon` rolünün bu tablolarda
--      SELECT + INSERT/UPDATE/DELETE yetkisi var. Anon anahtarı
--      Next.js bundle'ında herkese açık olduğu için bu tablolar
--      internete açık okuma-YAZMA yüzeyi:
--        _yedek_line_capability_20260723 (3019 satır)
--        _yedek_production_line_20260723 (137)
--        pes_benchmark (8), production_stage (10), ref_* , kv3_* (boş)
--
--   B) Daha kritik: 9 view `postgres` sahipli ve security_invoker=false.
--      postgres rolü BYPASSRLS olduğu için bu view'lar 019b/019c'nin
--      RLS'ini DELİP GEÇİYOR. Doğrulandı — anon anahtarıyla:
--        GET /rest/v1/v_work_order_full   -> 14 iş emri
--        GET /rest/v1/v_expense_groups    -> 25 gider satırı
--        GET /rest/v1/v_pes_monthly_summary -> 24 satır
--      Aynı delik uygulama içinde de var: bir tenant bu view'lardan
--      başka tenant'ın verisini görebilir.
--
-- ÇÖZÜM:
--   1. Yedek tablolar public'ten `arsiv` şemasına (PostgREST görmez).
--   2. Kalan 12 katalog tablosuna RLS + politika.
--   3. View'lara security_invoker=true — RLS artık view'ları da bağlar.
--   4. pes_audit_log'un "herkes INSERT edebilir" politikası daraltılır.
--   5. Fonksiyonlara sabit search_path.
--   6. anon + authenticated rollerinin public şemasındaki TÜM nesne
--      yetkileri geri alınır; gelecekteki tablolar için de default
--      privileges kapatılır.
--
-- NEDEN 6 GÜVENLİ: uygulama veri için PostgREST kullanmıyor
--   (kodda tek bir supabase.from() yok). Supabase JS yalnız auth için
--   (auth şeması ayrı, dokunulmuyor). Veri yolu: pes_app -> Postgres.
--
-- POLİTİKA SEÇİMİ (2): katalog tablolarında yazma da tenant context'i
--   olan herkese açık bırakıldı — bugünkü davranış birebir korunuyor
--   (/api/pes/referans/import, /api/pes/benchmark hepsi withTenantRoute).
--   Yazmayı yalnız internal admin'e daraltmak ayrı bir karar; bu
--   migration'ın amacı davranışı değiştirmeden anon'u kesmek.
--
-- ROLLBACK: dosyanın sonundaki blok.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. YEDEK TABLOLAR -> arsiv ŞEMASI
-- ============================================================
-- PostgREST yalnız public (ve graphql_public) şemasını yayınlar.
-- Şema değişince tablolar API yüzeyinden tamamen çıkar; veri durur.
CREATE SCHEMA IF NOT EXISTS arsiv;
REVOKE ALL ON SCHEMA arsiv FROM PUBLIC, anon, authenticated;

ALTER TABLE IF EXISTS public._yedek_production_line_20260723  SET SCHEMA arsiv;
ALTER TABLE IF EXISTS public._yedek_line_capability_20260723  SET SCHEMA arsiv;

COMMENT ON SCHEMA arsiv IS
'API''ye açılmayan yedek/arşiv şeması. 2026-07-23 tablo yedekleri 028 ile buraya taşındı.';

-- ============================================================
-- 2. KATALOG TABLOLARI — RLS + POLİTİKA
-- ============================================================
-- Hepsinde tenant_id yok: global katalog/referans tablolar.
-- Okuma ve yazma: tenant context'i olan oturum ya da internal admin.
-- anon'da tenant context olmaz -> current_tenant_id() NULL -> erişim yok.
DO $$
DECLARE
    t TEXT;
    katalog TEXT[] := ARRAY[
        'pes_benchmark', 'production_stage',
        'ref_ek_parca_tipi', 'ref_ek_parca_varyant', 'ref_makine_tipi',
        'ref_operasyon', 'ref_operasyon_grup', 'ref_operasyon_zamani',
        'ref_urun_tipi',
        'kv3_islem_katalogu', 'kv3_urun', 'kv3_urun_islem'
    ];
BEGIN
    FOREACH t IN ARRAY katalog LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
        ) THEN
            RAISE WARNING '028: %  tablosu yok, atlandı', t;
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_katalog_oku', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT
                USING (current_tenant_id() IS NOT NULL OR is_internal_admin())',
            t || '_katalog_oku', t
        );

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_katalog_yaz', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL
                USING      (current_tenant_id() IS NOT NULL OR is_internal_admin())
                WITH CHECK (current_tenant_id() IS NOT NULL OR is_internal_admin())',
            t || '_katalog_yaz', t
        );
    END LOOP;
END $$;

-- ============================================================
-- 3. VIEW'LAR — security_invoker
-- ============================================================
-- PG15 varsayılanı: view sahibinin (postgres, BYPASSRLS) yetkisiyle
-- çalışır -> RLS atıl. security_invoker=true ile sorguyu YAPAN rolün
-- (pes_app / anon) yetkileri ve RLS'i uygulanır.
--
-- Uygulama etkisi: iş emri / gider / eder ekranları withTenantRoute
-- içinde çalışıyor, tenant context set -> kendi satırlarını görmeye
-- devam eder. DEĞİŞEN: başka tenant'ın satırları artık görünmez.
DO $$
DECLARE
    v TEXT;
    viewlar TEXT[] := ARRAY[
        'v_pes_monthly_summary',
        'v_eder_model_ozet', 'v_eder_model_v3_ozet', 'v_eder_model_ana_grup',
        'v_work_order_full', 'v_work_order_stages',
        'v_expense_groups', 'v_expense_groups_real', 'v_expense_revisions'
    ];
BEGIN
    FOREACH v IN ARRAY viewlar LOOP
        IF EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = v AND c.relkind = 'v'
        ) THEN
            EXECUTE format('ALTER VIEW %I SET (security_invoker = true)', v);
        ELSE
            RAISE WARNING '028: % view''ı yok, atlandı', v;
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- 4. pes_audit_log — SINIRSIZ INSERT KAPATILIR
-- ============================================================
-- 019b'deki WITH CHECK (true) her rolün denetim kaydı uydurmasına
-- izin veriyordu. Uygulama kodu bu tabloya hiç yazmıyor (grep: 0).
DROP POLICY IF EXISTS audit_log_insert_anyone ON pes_audit_log;
CREATE POLICY audit_log_insert_tenant ON pes_audit_log
    FOR INSERT WITH CHECK (tenant_id = current_tenant_id() OR is_internal_admin());

-- ============================================================
-- 5. FONKSİYONLAR — SABİT search_path
-- ============================================================
-- search_path'i sabitlenmemiş fonksiyonlarda çağıran rol, kendi
-- şemasına sahte bir tablo/fonksiyon koyup davranışı değiştirebilir.
-- Zaten SET search_path taşıyanlara (019c helper'ları) dokunulmaz.
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS imza
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
          AND (p.proconfig IS NULL
               OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f.imza);
    END LOOP;
END $$;

-- ============================================================
-- 6. anon / authenticated — PUBLIC ŞEMA YETKİLERİ GERİ ALINIR
-- ============================================================
-- Asıl kalkan bu. RLS bir savunma katmanı; yetkiyi hiç vermemek
-- daha kesin. Uygulama PostgREST'i veri için kullanmadığından
-- (supabase.from() kodda yok) davranış değişmez.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES  IN SCHEMA public FROM anon, authenticated;

-- Bundan sonra postgres rolüyle açılacak tablolar da otomatik açılmasın
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES  FROM anon, authenticated;

-- pes_app yetkileri 019c'de kuruldu; 5. adımdaki ALTER FUNCTION ve
-- 1. adımdaki şema taşıması onları etkilemez. Yine de garanti:
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pes_app';
        EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pes_app';
    ELSE
        RAISE WARNING '028: pes_app rolü yok — yetki tazeleme atlandı';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA
-- ============================================================
--   node scripts/verify_public_api.mjs
--     -> her uç nokta için 0 satır / 401 / permission denied beklenir
--
-- Ayrıca elle:
--   1. Uygulamada iş emirleri, giderler, benchmark, referans ekranları
--      hâlâ veri gösteriyor mu?  (view'lar security_invoker oldu)
--   2. Supabase Dashboard > Advisors > Security: rls_disabled_in_public
--      ve security_definer_view uyarıları kalkmış olmalı.
--
-- KALAN (bu migration kapsamı dışında, elle):
--   - Dashboard > Authentication > Policies: "Leaked password protection"
--     açılmalı (HaveIBeenPwned kontrolü).
--   - pes_user_roles: 0 satır, deprecated, RLS açık + politika yok.
--     Advisor INFO veriyor. Silmek isterseniz ayrı migration:
--       DROP TABLE pes_user_roles;
--
-- ROLLBACK (gerekirse):
--   BEGIN;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
--     TO anon, authenticated;
--   ALTER TABLE arsiv._yedek_production_line_20260723 SET SCHEMA public;
--   ALTER TABLE arsiv._yedek_line_capability_20260723 SET SCHEMA public;
--   -- view'lar için: ALTER VIEW <ad> SET (security_invoker = false);
--   -- katalog tabloları için: ALTER TABLE <ad> DISABLE ROW LEVEL SECURITY;
--   COMMIT;
-- ============================================================
