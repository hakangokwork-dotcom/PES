-- 053 — Yıllık talep planı v1 (049) nesnelerini kaldır
--
-- v2 (050, basit yapı) yerini aldı. 050'den ayrı çünkü geliştirme ve canlı
-- aynı veritabanı: canlı v1.8.0 Planlama Masası work_order.tahmin_kalem_id
-- ve talep_tahmini_kalem'i okuyordu. v1.9.0 yayına çıktıktan sonra
-- uygulandı (2026-10-06). 049'da yalnız 2 deneme tahmini vardı, tahsis ve
-- bağlı PO yoktu. (Planda 051 olarak geçiyordu; 051/052 dk_maliyet işine
-- gitti.)
--
-- CASCADE YOK: beklenmedik bir bağımlılık varsa hata verip dursun.

BEGIN;

DROP INDEX IF EXISTS wo_tahmin_kalem_idx;
ALTER TABLE work_order DROP COLUMN IF EXISTS tahmin_kalem_id;

DROP TABLE IF EXISTS talep_tahsis;
DROP TABLE IF EXISTS talep_tahmini_kalem;
DROP TABLE IF EXISTS talep_tahmini;

COMMIT;
