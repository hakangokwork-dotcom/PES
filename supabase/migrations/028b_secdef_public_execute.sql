-- ============================================================
-- Migration 028b — SECURITY DEFINER fonksiyonlarda PUBLIC EXECUTE
-- 028'in bıraktığı iki advisor uyarısının kapatılması
-- ============================================================
--
-- SORUN:
--   028'de `REVOKE ALL ON ALL ROUTINES ... FROM anon, authenticated`
--   yapıldı, ama is_internal_admin() ve is_tenant_member(uuid)
--   yetkilerini PUBLIC sözde-rolünden alıyorlar (proacl: "=X/postgres").
--   PUBLIC grant'i rol bazlı REVOKE ile kalkmaz; anon hâlâ
--   /rest/v1/rpc/is_internal_admin çağırabiliyor.
--
--   Sızıntı değil (anon için ikisi de false döner) ama gereksiz yüzey;
--   019c resolve_tenant_context için aynı REVOKE'u zaten yapmıştı.
--
-- GÜVENLİ Mİ: evet. pes_app'in AYRI, açık EXECUTE grant'i var
--   (019c §2 + 028 §6), PUBLIC'ten bağımsız. RLS politikaları bu iki
--   fonksiyonu çağırırken sorguyu yapan rolün yetkisiyle çalışır →
--   pes_app etkilenmez.
--
-- ROLLBACK:
--   GRANT EXECUTE ON FUNCTION is_internal_admin() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION is_tenant_member(UUID) TO PUBLIC;
-- ============================================================

BEGIN;

REVOKE ALL ON FUNCTION is_internal_admin()      FROM PUBLIC;
REVOKE ALL ON FUNCTION is_tenant_member(UUID)   FROM PUBLIC;

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT p.oid::regprocedure, p.proacl FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.prosecdef;
--   -- hiçbirinde "=X/postgres" (PUBLIC) kalmamalı
--
-- Uygulama: giriş yap, /pes/workshops aç — atölyeler görünmeli
-- (is_tenant_member/is_internal_admin RLS politikalarında çağrılıyor).
-- ============================================================
