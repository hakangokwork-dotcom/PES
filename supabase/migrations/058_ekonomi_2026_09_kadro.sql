-- ============================================================
-- Migration 058 — Atölye ekonomi satırı 2026-09 + boş kadrolar
-- ============================================================
--
-- 057 yalnız gider kalemlerini yazdı. Aynı Excel'in (VERİLER sayfası)
-- giderde olmayan alanları burada: ciro, üretim adedi, çalışma günü/saati,
-- kadro kırılımı, üretim alanı → workshop_economy (monthly_expense ile aynı
-- anahtar, 037).
--
-- Sorun: Gider Panosu'nda TOPRAK, ŞİRİN, DEMA, KARTAL, ENVER personeli 0,
-- alan m² herkeste boş görünüyordu.
--
-- 1. workshop_economy 2026-09 — 20 atölye, source='anket'.
--    actual_days / idle_days NULL: Excel boş gün bilgisi taşımıyor, uydurulmaz.
--    ENVER'in cirosu ve adedi beyan edilmemiş → NULL.
-- 2. workshop kadrosu — YALNIZ total_staff = 0 olan atölyeler doldurulur.
--    Kadrosu zaten girilmiş atölyeye dokunulmaz (Excel ile farklı olanlar:
--    ÖRSSAN, HEDİYE, NEEDLES, TEKNİK, BAGİSAN, BAHYEZEN, EYÜP — karar Hakan'da).
--
-- Tekrar çalıştırılabilir.
--
-- ROLLBACK:
--   DELETE FROM workshop_economy WHERE year = 2026 AND month = 9;
--   UPDATE workshop SET total_staff = 0, sewing_staff = 0, ukp_staff = 0,
--          cutting_staff = 0, management = 0
--   WHERE code IN ('B048','B034','B017','B056','B072');
-- ============================================================

BEGIN;

CREATE TEMP TABLE _beyan ON COMMIT DROP AS
SELECT * FROM (VALUES
    ('B013', 4929656.87, 43037, 22, 9, 6, 90, 35, 6, 5000),  -- ÖRSSAN
    ('B024', 4963744.78, 38500, 22, 9, 4, 75, 35, 5, 2000),  -- HEDİYE GROUP
    ('B093', 3295381.01, 34721, 24, 9, 7, 75, 15, 4, 3000),  -- İMKOT
    ('B081', 2957355.33, 24455, 22, 9, 3, 45, 19, 5, 1800),  -- NEEDLES
    ('B038', 4604997.26, 31507, 22, 9, 4, 55, 20, 4, 1200),  -- TEKNİK TEKSTİL
    ('B063', 2957355.33, 25583, 22, 9, 3, 60, 40, 7, 1500),  -- NETCLASS
    ('B083', 2924952.18, 35567, 22, 9, 0, 35, 14, 3, 400),  -- BESE
    ('B089', 3606900.39, 23440, 22, 9, 3, 55, 15, 3, 1999),  -- SRTTEKS
    ('B026', 6369757.13, 44011, 22, 9, 6, 110, 30, 3, 1800),  -- SİMAYTEKS
    ('B073', 2470649.16, 19742, 22, 9, 4, 53, 23, 4, 1600),  -- BAGİSAN
    ('B084', 4391566.67, 25047, 22, 9, 0, 30, 15, 2, 500),  -- BOZ MODA
    ('B048', 4142852.53, 22395, 24, 9, 4, 65, 45, 14, 1500),  -- TOPRAK
    ('B034', 5307085.04, 29547, 24, 9, 4, 70, 40, 10, 1300),  -- ŞİRİN TEKSTİL
    ('B017', 2623141.51, 28782, 24, 9, 3, 78, 33, 9, 1200),  -- DEMA
    ('B115', 3945637.82, 33541, 22, 9, 6, 58, 35, 7, 1300),  -- KARATUR
    ('B068', 2771302.51, 17600, 24, 9, 4, 43, 29, 3, 700),  -- BAHYEZEN
    ('B056', 906923.88, 3182, 24, 9, 3, 50, 10, 3, 2000),  -- KARTAL FASHION
    ('B072', NULL, NULL, 24, 9, 3, 35, 25, 5, 600),  -- ENVER
    ('B010', 4928597.60, 44754, 22, 10, 2, 45, 32, 3, 700),  -- EYÜP TEKSTİL
    ('B116', 1161508.78, 9072, 22, 9, 5, 40, 25, 5, 800)  -- AYAZ EFE
) AS v(code, ciro, adet, gun, saat, kesim, dikim, ukp, ofis, alan);

INSERT INTO workshop_economy
    (workshop_id, tenant_id, year, month, revenue_declared, qty_declared,
     nominal_days, hours_per_day, cutting_staff, sewing_staff, ukp_staff, office_staff,
     area_m2, source, note)
SELECT w.id, w.tenant_id, 2026, 9, b.ciro, b.adet,
       b.gun, b.saat, b.kesim, b.dikim, b.ukp, b.ofis,
       b.alan, 'anket', 'Atolye_Performans_Kiyas_Asgari_Ucret_Analizi.xlsx › VERİLER'
FROM _beyan b JOIN workshop w ON w.code = b.code
ON CONFLICT (workshop_id, year, month) DO NOTHING;

UPDATE workshop w
SET total_staff   = b.kesim + b.dikim + b.ukp + b.ofis,
    sewing_staff  = b.dikim,
    ukp_staff     = b.ukp,
    cutting_staff = b.kesim,
    management    = b.ofis
FROM _beyan b
WHERE w.code = b.code AND w.total_staff = 0;

DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM workshop_economy WHERE year = 2026 AND month = 9;
    IF n <> 20 THEN
        RAISE EXCEPTION '2026-09 ekonomi satırı % adet, 20 bekleniyordu', n;
    END IF;
END $$;

COMMIT;
