-- ============================================================
-- Migration 051 — Bölgesel 3D dakika maliyeti, 2026 Eylül
-- ============================================================
--
-- Kaynak: "Türkiye - Dk Maliyet Değerleri - 3D" tablosu (2026 Eylül satırı).
--   1. Bölge 6,45 · 2.–4. Bölge 6,05 · 5. Bölge 5,87 · 6. Bölge 5,30
--
-- Dönem versiyonludur: 2026-04 satırları SİLİNMEZ. Bir ay, kendisinden
-- küçük/eşit en yakın dönemin değeriyle hesaplanır; Mayıs–Ağustos eski
-- (Nisan) değerle kalır, Eylül ve sonrası bu değerlerle.
--
-- tenant_id: tablo tek kiracılı tohumlandı (007); yeni satırlar mevcut
-- satırların kiracısına yazılır.
--
-- ROLLBACK: DELETE FROM dk_maliyet WHERE donem = '2026-09';
-- ============================================================

BEGIN;

INSERT INTO dk_maliyet (tenant_id, donem, bolge, dk_maliyet_tl)
SELECT (SELECT tenant_id FROM dk_maliyet WHERE donem = '2026-04' LIMIT 1), v.donem, v.bolge, v.tl
FROM (VALUES
    ('2026-09', 1, 6.45),
    ('2026-09', 2, 6.05),
    ('2026-09', 3, 6.05),
    ('2026-09', 4, 6.05),
    ('2026-09', 5, 5.87),
    ('2026-09', 6, 5.30)
) AS v(donem, bolge, tl)
ON CONFLICT (donem, bolge) DO UPDATE SET dk_maliyet_tl = EXCLUDED.dk_maliyet_tl;

COMMIT;
