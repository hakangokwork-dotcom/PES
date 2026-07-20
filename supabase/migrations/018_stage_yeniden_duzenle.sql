-- ============================================================
-- 018: Aşama kataloğu yeniden düzenle
-- Zorunlu = sadece Kesim, Dikim, UKP
-- Opsiyonel = Hazırlık, Yıkama, Numune Onayı, Sevkiyat (+ eski Ütü, Kalite, Paket)
-- ============================================================

-- UKP yoksa ekle
INSERT INTO production_stage (code, name, sira_no, zorunlu, renk) VALUES
  ('HAZIRLIK', 'Hazırlık',                 5, FALSE, '#8b5cf6'),
  ('UKP',      'UKP (Ütü-Kalite-Paket)',  50, TRUE,  '#a855f7')
ON CONFLICT (code) DO UPDATE SET
  name    = EXCLUDED.name,
  sira_no = EXCLUDED.sira_no,
  zorunlu = EXCLUDED.zorunlu,
  renk    = EXCLUDED.renk;

-- Eskiden zorunlu olanları opsiyonele çevir (Ütü, Kalite Kontrol, Paket, Sevk artık UKP altında)
UPDATE production_stage SET zorunlu = FALSE WHERE code IN ('UTU','KALITE','PAKET','SEVK','NUMUNE','YIKAMA');

-- Sıra numaralarını netleştir
UPDATE production_stage SET sira_no =
  CASE code
    WHEN 'NUMUNE'   THEN  3
    WHEN 'HAZIRLIK' THEN  5
    WHEN 'KESIM'    THEN 10
    WHEN 'DIKIM'    THEN 20
    WHEN 'YIKAMA'   THEN 30
    WHEN 'UTU'      THEN 40
    WHEN 'KALITE'   THEN 45
    WHEN 'UKP'      THEN 50
    WHEN 'PAKET'    THEN 60
    WHEN 'SEVK'     THEN 70
    ELSE sira_no
  END;
