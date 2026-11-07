-- ============================================================
-- Migration 056 — İşgücü devir oranı tek yerde hesaplanır
-- ============================================================
--
-- SORUN (görsel tasarım incelemesi, 2026-11-07): aynı ayın devir oranı
-- ekrana göre farklı çıkıyordu.
--   atölye panosu          ayrılan / toplam
--   giriş ekranları, analiz (ayrılan + başlayan) / 2 / toplam
-- Eşikler de farklıydı (giriş ekranı 20/40, metrik sözlüğü ve kıyas 5/10).
--
-- KARAR: metrik sözlüğündeki tanım (lib/pes/metrics-ontology.ts
-- isgucu_devir): (ayrılan / toplam personel) × 100. Kolon tabloda
-- türetilir; ekranlar yeniden hesaplamaz, bu kolonu okur.
-- Toplam personel 0 ise NULL ("hesaplanamaz"), 0 değil.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

ALTER TABLE workforce_turnover
    ADD COLUMN IF NOT EXISTS devir_orani NUMERIC
    -- Kısıtsız NUMERIC: ayrılan toplamdan büyük girilirse kayıt reddedilmesin.
    GENERATED ALWAYS AS (
        CASE WHEN total_staff > 0
             THEN round(left_count::numeric / total_staff * 100, 1)
        END
    ) STORED;

COMMENT ON COLUMN workforce_turnover.devir_orani IS
'056: (left_count / total_staff) × 100, bir ondalık. Toplam 0 ise NULL. Tek tanım: metrics-ontology isgucu_devir.';

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT total_staff, left_count, devir_orani FROM workforce_turnover
--    ORDER BY year DESC, month DESC LIMIT 5;
--
-- ROLLBACK
--   ALTER TABLE workforce_turnover DROP COLUMN IF EXISTS devir_orani;
-- ============================================================
