-- ============================================================
-- Migration 019c — RLS Enforcement Düzeltmesi (rol sertleştirme)
-- 019a/019b tenancy serisinin tamamlayıcısı
-- ============================================================
--
-- SORUN:
--   019b tüm operasyonel tablolara RLS + FORCE kurdu, ama uygulama
--   veritabanına `postgres` rolüyle bağlanıyordu ve o rolde
--   rolbypassrls = true. FORCE ROW LEVEL SECURITY tablo sahibini bağlar,
--   BYPASSRLS yetkisine sahip rolü BAĞLAMAZ.
--   Sonuç: 019b'nin bütün politikaları uygulama yolunda atıl kaldı.
--   (tenant-db.ts'teki "service role bile satır göremez" yorumu yanlıştı.)
--
-- ÇÖZÜM:
--   1. pes_app rolü — LOGIN, NOBYPASSRLS. Uygulama bununla bağlanır.
--   2. Tenant bootstrap'i SECURITY DEFINER fonksiyona taşı.
--      Gerekçe: tenant_user politikaları auth.uid()'e bağlı; uygulama
--      DB rolüyle bağlandığı için auth.uid() daima NULL olur ve
--      tenant çözümlemesi kendi kendini kilitler (tavuk-yumurta).
--   3. pes_app'e tablo/sequence yetkileri + gelecekteki tablolar için
--      default privileges.
--
-- ⚠️ pes_app PAROLASI BU DOSYADA YOKTUR.
--    Rol scripts/_setup_app_role.mjs ile oluşturulur; parola üretilip
--    yalnız .env.local (APP_DATABASE_URL) içine yazılır.
--    Bu migration rol zaten varsa yetkileri kurar, yoksa uyarıp geçer.
--
-- ROLLBACK:
--   DATABASE_URL'i (postgres rolü) tekrar kullanmak yeterli — şema
--   değişikliği geri alınmadan eski davranışa dönülür.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. TENANT BOOTSTRAP — SECURITY DEFINER
-- ============================================================
-- Yalnız verilen user_id'nin ÜYE OLDUĞU tenant'ları döndürür.
-- Cross-tenant sızıntı riski yok: sonuç her zaman tu.user_id = p_user_id
-- ile sınırlı. search_path sabitlenerek fonksiyon ele geçirme engellenir.
CREATE OR REPLACE FUNCTION resolve_tenant_context(
    p_user_id        UUID,
    p_claimed_tenant UUID DEFAULT NULL
)
RETURNS TABLE (tenant_id UUID, role TEXT, tenant_type TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT tu.tenant_id, tu.role, t.type
    FROM tenant_user tu
    JOIN tenant t ON t.id = tu.tenant_id
    WHERE tu.user_id = p_user_id
      AND (p_claimed_tenant IS NULL OR tu.tenant_id = p_claimed_tenant)
    ORDER BY tu.is_primary DESC, tu.created_at ASC
    LIMIT 1;
$$;

COMMENT ON FUNCTION resolve_tenant_context(UUID, UUID) IS
'Tenant bootstrap. SECURITY DEFINER — RLS öncesi çalışır (tavuk-yumurta çözümü). Sadece p_user_id''nin kendi üyeliklerini döndürür.';

-- Herkese açık olmasın; yalnız uygulama rolü çağırabilsin.
REVOKE ALL ON FUNCTION resolve_tenant_context(UUID, UUID) FROM PUBLIC;

-- ============================================================
-- 1b. auth.uid() KULLANAN HELPER'LAR → SECURITY DEFINER
-- ============================================================
-- 019a'da bu iki fonksiyon SECURITY INVOKER'dı. RLS politikaları onları
-- çağırıyor; uygulama pes_app rolüne geçince "permission denied for
-- schema auth" hatası veriyorlar.
--
-- Neden GRANT ile çözülmedi: auth şemasının sahibi supabase_admin,
-- `postgres` rolünün grant yetkisi yok — GRANT sessizce no-op oluyor
-- ("no privileges were granted for auth" uyarısı).
--
-- SECURITY DEFINER ile fonksiyon sahibi (postgres) yetkisiyle çalışır,
-- pes_app'in auth şemasına hiç erişmesi gerekmez. Mantık DEĞİŞMEDİ —
-- yalnız çalışma bağlamı değişti. Parametre almadıkları için yetki
-- yükseltme yüzeyi yok.
CREATE OR REPLACE FUNCTION is_tenant_member(tid UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant_user
        WHERE tenant_id = tid AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION is_internal_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

-- ============================================================
-- 2. PES_APP YETKİLERİ
-- ============================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    SELECT rolsuper, rolbypassrls INTO r FROM pg_roles WHERE rolname = 'pes_app';

    IF NOT FOUND THEN
        RAISE WARNING 'pes_app rolü yok — önce scripts/_setup_app_role.mjs çalıştırın. Yetkiler atlandı.';
        RETURN;
    END IF;

    -- Güvenlik ağı: baypas yetkisi varsa RLS yine atıl kalır — sessizce geçme, durdur.
    -- (Düzeltme burada ALTER ROLE ile yapılamaz: NOSUPERUSER superuser yetkisi ister.
    --  Rol scripts/_setup_app_role.mjs tarafından NOBYPASSRLS olarak oluşturulur.)
    IF r.rolsuper OR r.rolbypassrls THEN
        RAISE EXCEPTION 'pes_app rolü RLS baypas edebiliyor (rolsuper=%, rolbypassrls=%) — 019c''nin amacı boşa çıkar. Rolü NOBYPASSRLS NOSUPERUSER olarak yeniden oluşturun.',
            r.rolsuper, r.rolbypassrls;
    END IF;

    EXECUTE 'GRANT USAGE ON SCHEMA public TO pes_app';

    -- NOT: auth şemasına GRANT verilmez — sahibi supabase_admin, postgres'in
    -- grant yetkisi yok. auth.uid() erişimi §1b'deki SECURITY DEFINER
    -- helper'lar üzerinden sağlanır.
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pes_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pes_app';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pes_app';

    -- Bundan sonra oluşturulacak tablolar için de otomatik yetki
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
             GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pes_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
             GRANT USAGE, SELECT ON SEQUENCES TO pes_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
             GRANT EXECUTE ON FUNCTIONS TO pes_app';
END $$;

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA (manuel)
-- ============================================================
-- 1. SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='pes_app';
--    -- rolsuper=false, rolbypassrls=false  (aksi halde RLS yine atıl)
--
-- 2. pes_app bağlantısıyla, tenant context'i AYARLAMADAN:
--      SELECT count(*) FROM workshop;   -- 0 olmalı
--
-- 3. pes_app bağlantısıyla, tenant context'i ayarlayarak:
--      SELECT set_config('app.current_tenant_id', '<default tenant uuid>', false);
--      SELECT count(*) FROM workshop;   -- atölye sayısı
--
-- 4. Başka tenant'ın uuid'si ile 3'ü tekrarla -- 0 dönmeli (izolasyon kanıtı)
