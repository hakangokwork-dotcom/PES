-- ============================================================
-- Migration 029c — Aktiflik tek kaynağa iner
-- ============================================================
--
-- KARAR (kullanıcı, 2026-08-04):
--   "aktif demek şu anda çalışıyorum, pasif demek çalışmıyorum; bu bir
--    buton gibi, zamanla açıp kapatabilirim. Raporlarımda aktif atölye
--    dikkate alınır."
--
-- SORUN: 029 Excel'in AKTİF/PASİF kolonunu workshop_profil.aktiflik'e
--   kopyalamıştı. Artık iki alan aynı şeyi söylüyor: workshop.is_active
--   (canlı, kullanıcı çeviriyor) ve workshop_profil.aktiflik (Excel'in
--   o günkü fotoğrafı, donuk). İki kaynak = raporun hangisine baktığı
--   belirsiz. Kullanıcı butonu çevirdiğinde donuk kopya yalan söylemeye
--   başlar.
--
-- ÇÖZÜM:
--   1. workshop_profil.aktiflik SİLİNİR. Tek doğru: workshop.is_active.
--   2. Excel'in PASİF dediği 8 atölye bir kereye mahsus pasife alınır
--      (kullanıcı onayı alındı).
--   3. Ham Excel değeri workshop_profil_staging.aktiflik'te DURUYOR —
--      "kaynak o gün ne diyordu" sorusu hâlâ cevaplanabilir.
--
-- BUNDAN SONRA: import scripti is_active'e ASLA dokunmaz. Yeni bir Excel
--   geldiğinde kullanıcının elle çevirdiği anahtarı ezmesi, düzeltmeyi
--   sessizce geri almak olurdu. Fark görülmek istenirse staging ile
--   karşılaştırılır.
--
-- ROLLBACK:
--   ALTER TABLE workshop_profil ADD COLUMN aktiflik TEXT;
--   UPDATE workshop SET is_active = true WHERE code IN (...aşağıdaki 8...);
-- ============================================================

BEGIN;

-- ---- 1. Excel'in PASİF dediği atölyeler (tek seferlik senkron) ----
-- Kaynak: workshop_profil.aktiflik, kolon silinmeden önce okunuyor.
UPDATE workshop w
   SET is_active = false, updated_at = now()
  FROM workshop_profil p
 WHERE p.workshop_id = w.id
   AND p.aktiflik = 'PASİF'
   AND w.is_active;

-- ---- 2. Donuk kopyayı kaldır ----
ALTER TABLE workshop_profil DROP COLUMN IF EXISTS aktiflik;

COMMENT ON COLUMN workshop_profil_staging.aktiflik IS
'Excel''in AKTİF/PASİF kolonu, HAM. Canlı durum workshop.is_active''tir — bu yalnız kaynağın o günkü fotoğrafı.';

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT is_active, count(*) FROM workshop w
--   JOIN tenant t ON t.id=w.tenant_id AND t.slug='default' GROUP BY 1;
--   -- 123 aktif / 8 pasif beklenir
--
-- Kaynakla fark (ileride):
--   SELECT w.code, w.name, w.is_active, s.aktiflik
--     FROM workshop w
--     JOIN workshop_profil_staging s ON s.eslesen_workshop_id = w.id
--    WHERE (s.aktiflik = 'PASİF') <> (NOT w.is_active);
-- ============================================================
