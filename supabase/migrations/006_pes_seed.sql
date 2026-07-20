-- ============================================================
-- PES Seed Data — Ana Süreçler, Ürün Kategorileri, Şablonlar
-- ============================================================

-- Ana süreç kataloğu
INSERT INTO master_process (code, name, group_type, description, sort_order) VALUES
  ('HAZ', 'Hazırlık',           'Her ikisi', 'Parça hazırlama, ara işlemler',             1),
  ('ONB', 'Ön Bant',            'Alt',       'Ön panel dikişleri',                        2),
  ('ARB', 'Arka Bant',          'Alt',       'Arka panel dikişleri',                      3),
  ('ONA', 'Ön / Arka Montaj',   'Üst',       'Panel dikişleri ve birleştirme',            4),
  ('MON', 'Montaj',             'Alt',       'Ön-arka birleştirme, kemer, fermuvar',      5),
  ('UKP', 'UKP',                'Her ikisi', 'Ütü, kalite kontrol, paketleme',            6);

-- Ürün kategorileri
INSERT INTO product_category (code, name, group_type, notes) VALUES
  ('PNT',    'Pantolon', 'Alt', 'Baggy, Torino vb. varyantlar bu kategoride'),
  ('SORT',   'Şort',     'Alt', NULL),
  ('MONT',   'Mont',     'Üst', NULL),
  ('GOMLEK', 'Gömlek',   'Üst', NULL);

-- Süreç şablonları — Standart Pantolon
INSERT INTO process_template (code, name, category_id, process_id, sort_order, is_mandatory)
SELECT 'SABLON-PNT', 'Standart Pantolon Akışı', pc.id, mp.id,
  CASE mp.code
    WHEN 'HAZ' THEN 1
    WHEN 'ONB' THEN 2
    WHEN 'ARB' THEN 3
    WHEN 'MON' THEN 4
    WHEN 'UKP' THEN 5
  END,
  TRUE
FROM product_category pc, master_process mp
WHERE pc.code = 'PNT'
  AND mp.code IN ('HAZ','ONB','ARB','MON','UKP');

-- Süreç şablonları — Standart Mont
INSERT INTO process_template (code, name, category_id, process_id, sort_order, is_mandatory)
SELECT 'SABLON-MONT', 'Standart Mont Akışı', pc.id, mp.id,
  CASE mp.code
    WHEN 'HAZ' THEN 1
    WHEN 'ONA' THEN 2
    WHEN 'UKP' THEN 3
  END,
  TRUE
FROM product_category pc, master_process mp
WHERE pc.code = 'MONT'
  AND mp.code IN ('HAZ','ONA','UKP');

-- Süreç şablonları — Standart Gömlek
INSERT INTO process_template (code, name, category_id, process_id, sort_order, is_mandatory)
SELECT 'SABLON-GOMLEK', 'Standart Gömlek Akışı', pc.id, mp.id,
  CASE mp.code
    WHEN 'HAZ' THEN 1
    WHEN 'ONA' THEN 2
    WHEN 'UKP' THEN 3
  END,
  TRUE
FROM product_category pc, master_process mp
WHERE pc.code = 'GOMLEK'
  AND mp.code IN ('HAZ','ONA','UKP');

-- Süreç şablonları — Standart Şort
INSERT INTO process_template (code, name, category_id, process_id, sort_order, is_mandatory)
SELECT 'SABLON-SORT', 'Standart Şort Akışı', pc.id, mp.id,
  CASE mp.code
    WHEN 'HAZ' THEN 1
    WHEN 'ONB' THEN 2
    WHEN 'ARB' THEN 3
    WHEN 'MON' THEN 4
    WHEN 'UKP' THEN 5
  END,
  TRUE
FROM product_category pc, master_process mp
WHERE pc.code = 'SORT'
  AND mp.code IN ('HAZ','ONB','ARB','MON','UKP');
