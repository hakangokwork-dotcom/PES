-- ============================================================
-- 027_matris_katalog_ve_bant_alanlari.sql
-- MATRIS master verisinin (bant düzeyi yetenek matrisi) girebilmesi için
-- katalog genişletmesi ve bant düzeyi alanlar.
--
-- KAYNAK: bant_kapasite_formu_MATRIS_mevcut_durum (1).xlsx, sayfa (4).
--
-- İKİ YENİ BOYUT: kalite, sezon — dosyada var, katalogda yoktu.
-- 10 YENİ DEĞER: mevcut boyutlara (yaka_turu, kalip_turu, siluet).
-- BANT KOLONLARI: bant_turu ve saha alanları — line_type'a sığmayan kavramlar.
--
-- NEDEN bant_turu AYRI KOLON: mevcut line_type yalnız Normal/Küçük (bandın
--   boyutu). CMT/UKP/DİKİM üretim tipidir, farklı kavram — 023c'de
--   workshop.type için aynı gerekçeyle production_type açılmıştı.
--
-- İDEMPOTENT: ON CONFLICT DO NOTHING / ADD COLUMN IF NOT EXISTS.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. YENİ BOYUTLAR: kalite, sezon (global katalog, tenant_id = NULL)
-- ============================================================
INSERT INTO capability_dimension (code, label, applies_to, sort_order, tenant_id) VALUES
  ('kalite', 'Kalite Segmenti', NULL, 11, NULL),
  ('sezon',  'Sezon',           NULL, 12, NULL)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. YENİ DEĞERLER
-- ============================================================
-- code = norm(label): TR harf sadeleştir, boşluk/ayraç → _, büyük harf.
-- sort_order boyut içinde mevcut max'tan devam eder.
INSERT INTO capability_value (dimension_id, code, label, sort_order, tenant_id)
SELECT d.id, v.code, v.label, v.sort_order, NULL
FROM capability_dimension d
JOIN (VALUES
  -- kalite (yeni boyut, 1'den)
  ('kalite', 'PREMIUM_KLASIK',  'Premium Klasik',   1),
  ('kalite', 'STANDART_VISION', 'Standart Vision',  2),
  ('kalite', 'CASUAL_TRENDY',   'Casual Trendy',    3),
  ('kalite', 'BEBEK_COCUK',     'Bebek/Çocuk',      4),
  ('kalite', 'GELENEKSEL',      'Geleneksel',       5),
  ('kalite', 'MODEST',          'Modest',           6),
  ('kalite', 'OUTLET',          'Outlet',           7),
  -- sezon (yeni boyut, 1'den)
  ('sezon',  'YIL_BOYU',        'Yıl Boyu',         1),
  ('sezon',  'YAZ_AGIRLIKLI',   'Yaz Ağırlıklı',    2),
  ('sezon',  'KIS_AGIRLIKLI',   'Kış Ağırlıklı',    3),
  ('sezon',  'SEZONLUK_ESNEK',  'Sezonluk-Esnek',   4),
  -- yaka_turu (mevcut max sort 9 → 10)
  ('yaka_turu', 'DUGMELI_GOMLEK_YAKA', 'Düğmeli Gömlek Yaka', 10),
  -- kalip_turu (mevcut max sort 8 → 9,10)
  ('kalip_turu', 'LOOSE_BOL', 'Loose & Bol', 9),
  ('kalip_turu', 'SIGARET',   'Sigaret',     10),
  -- siluet (mevcut max sort 6 → 7..13)
  ('siluet', 'FLARE',      'Flare',       7),
  ('siluet', 'JUPITER',    'Jüpiter',     8),
  ('siluet', 'MARS',       'Mars',        9),
  ('siluet', 'MERCURY',    'Mercury',     10),
  ('siluet', 'BALIK_ETEK', 'Balık Etek',  11),
  ('siluet', 'BALON',      'Balon',       12),
  ('siluet', 'FIRFIRLI',   'Fırfırlı',    13)
) AS v(dim, code, label, sort_order) ON v.dim = d.code
ON CONFLICT (dimension_id, code) DO NOTHING;

-- ============================================================
-- 3. BANT DÜZEYİ ALANLAR
-- ============================================================
-- Çalışan sayısı → mevcut operator_count, kapasite → mevcut daily_target.
-- Kalanlar yeni:
-- Not: production_line.name VARCHAR(50) bir view'da kullanıldığı için
-- genişletilemiyor. Uzun bant adları betikte 50'ye kırpılır (import-matris.mjs).
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS bant_turu        VARCHAR(20);
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS makine_sayisi    INTEGER;
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS min_siparis_adet INTEGER;
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS doluluk_pct      NUMERIC(5,2);
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS gorusulen_kisi   VARCHAR(120);
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS gorusme_tarihi   DATE;
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS notlar           TEXT;

COMMENT ON COLUMN production_line.bant_turu IS
  'Üretim tipi: CMT / UKP / DİKİM / DİKİM-UKP / KESİM-DİKİM. line_type (Normal/Küçük) ile karıştırılmaz.';

COMMIT;
