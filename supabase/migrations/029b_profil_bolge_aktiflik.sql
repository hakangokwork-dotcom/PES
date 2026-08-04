-- ============================================================
-- Migration 029b — workshop_profil'e iki eksik alan
-- ============================================================
--
-- 029 yazılırken atlanan iki Excel kolonu:
--
--   AKTİF/PASİF -> aktiflik
--     workshop.is_active zaten var; bu ONUN KOPYASI DEĞİL. Excel
--     tedarik ekibinin kaydı, is_active sistemin kaydı. İkisini ayrı
--     tutmak "Excel pasif diyor ama sistemde aktif" tutarsızlığını
--     raporlanabilir kılar. Birleştirirsek o sinyal kaybolur.
--
--   BÖLGE -> bolge_ad
--     workshop.bolge SMALLINT(1-6) ve o TEŞVİK bölgesi (011).
--     Excel'deki BÖLGE ise TEDARİK bölgesi (MARMARA/KARADENİZ/ANADOLU).
--     Aynı isim, farklı kavram — aynı kolona yazmak veriyi bozardı.
-- ============================================================

BEGIN;

ALTER TABLE workshop_profil ADD COLUMN IF NOT EXISTS aktiflik  TEXT;
ALTER TABLE workshop_profil ADD COLUMN IF NOT EXISTS bolge_ad  TEXT;

COMMENT ON COLUMN workshop_profil.aktiflik IS
'Excel''deki AKTİF/PASİF. workshop.is_active''in kopyası değil — tedarik kaydı ile sistem kaydı arasındaki farkı görebilmek için ayrı tutulur.';
COMMENT ON COLUMN workshop_profil.bolge_ad IS
'Tedarik bölgesi (MARMARA/KARADENİZ/ANADOLU). workshop.bolge ile karıştırma: o teşvik bölgesi (1-6).';

COMMIT;
