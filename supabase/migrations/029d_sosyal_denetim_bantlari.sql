-- ============================================================
-- Migration 029d — Sosyal denetim: bantlı geçerlilik + türetilmiş sınıf
-- ============================================================
--
-- KARAR (kullanıcı, 2026-08-04) — 029'daki iki bantlı kural değişti:
--
--   SOSYAL UYGUNLUK
--     puan > 90        -> 12 ay   sınıf A
--     75 <= puan <= 90 ->  9 ay   sınıf B
--     60 <= puan <  75 ->  6 ay   sınıf C
--     puan < 60        ->  2 ay   sınıf D
--     puan yok         ->  2 ay   sınıf yok  (en kötü varsayılır)
--
--   WKYS: değişmedi — her zaman 12 ay.
--     Bant kuralı kullanıcı tarafından yalnız sosyal uygunluk için
--     verildi; WKYS'ye kendiliğinden genellemedim. WKYS için türetilmiş
--     sınıf da üretilmez (NULL).
--
-- SINIR SEÇİMİ: "75 ile 90 arası" iki uçtan da kapalı okundu; alt bant
--   60 <= puan < 75. Şu an veride tam 90 puanlı kayıt yok, yani bu
--   seçim mevcut hiçbir satırı etkilemiyor — ileriye dönük tanım.
--
-- SINIF NEDEN İKİ KOLON:
--   Kaynak Excel'in yazdığı harf puanla ÖRTÜŞMÜYOR. Ölçülen:
--     WKYS  'D' verilmiş 5 kayıt -> puanları 76.70-85.60
--     WKYS  'B' verilmiş 41 kayıt -> puanları 70.20-89.30   (D ile çakışık)
--     SOSYAL'B' verilmiş bir kayıt -> 90.70 (bandına göre A olurdu)
--   Yani kaynaktaki harf ya başka bir kritere ait ya da hatalı girilmiş.
--   Üzerine yazmak bilgiyi yok ederdi:
--     sinif       = kaynağın/kullanıcının yazdığı harf  (dokunulmaz)
--     sinif_hesap = puandan türetilen harf (GENERATED, sosyal için)
--   Çelişenler raporlanabilir (dosya sonundaki sorgu).
--
-- GENERATED KOLONLAR NEDEN DÜŞÜRÜLÜP YENİDEN KURULUYOR:
--   CREATE OR REPLACE FUNCTION, mevcut STORED generated değerleri
--   yeniden hesaplamaz — satırlar eski kuralla donmuş kalır ve tablo
--   sessizce iki kuralı birden taşır. Düşür/yeniden kur, her satırın
--   yeni kuralla üretilmesini garanti eder.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. GENERATED KOLONLARI GEÇİCİ OLARAK KALDIR
-- ============================================================
-- View kolonlara bağımlı; önce o düşmeli. Ayrıca CREATE OR REPLACE VIEW
-- kolon EKLEMEYE izin verse de araya kolon sokmaya izin vermez —
-- son_sinif_kaynak/son_sinif_hesap araya girdiği için zaten drop şart.
DROP VIEW IF EXISTS v_atolye_denetim_durum;
DROP INDEX IF EXISTS idx_wd_sonraki;
ALTER TABLE workshop_denetim
    DROP COLUMN IF EXISTS sonraki_tarih,
    DROP COLUMN IF EXISTS gecerlilik_ay,
    DROP COLUMN IF EXISTS sinif_hesap;

-- ============================================================
-- 2. KURALLAR
-- ============================================================
CREATE OR REPLACE FUNCTION denetim_gecerlilik_ay(p_tip TEXT, p_puan NUMERIC)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_tip = 'WKYS'   THEN 12::SMALLINT
        WHEN p_puan IS NULL   THEN  2::SMALLINT
        WHEN p_puan >  90     THEN 12::SMALLINT
        WHEN p_puan >= 75     THEN  9::SMALLINT
        WHEN p_puan >= 60     THEN  6::SMALLINT
        ELSE                        2::SMALLINT
    END;
$$;

COMMENT ON FUNCTION denetim_gecerlilik_ay(TEXT, NUMERIC) IS
'Denetim geçerlilik süresi (ay). WKYS=12. SOSYAL: >90 ->12, 75-90 ->9, 60-75 ->6, <60 veya puansız ->2. Kuralın tek kaynağı.';

CREATE OR REPLACE FUNCTION denetim_sinif_hesap(p_tip TEXT, p_puan NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_tip <> 'SOSYAL' THEN NULL   -- bant kuralı yalnız sosyal için verildi
        WHEN p_puan IS NULL    THEN NULL
        WHEN p_puan >  90      THEN 'A'
        WHEN p_puan >= 75      THEN 'B'
        WHEN p_puan >= 60      THEN 'C'
        ELSE                        'D'
    END;
$$;

COMMENT ON FUNCTION denetim_sinif_hesap(TEXT, NUMERIC) IS
'Sosyal uygunluk puanından türetilen sınıf: >90 A, 75-90 B, 60-75 C, <60 D. WKYS ve puansız kayıtlarda NULL.';

-- ============================================================
-- 3. KOLONLARI YENİ KURALLA GERİ EKLE
-- ============================================================
ALTER TABLE workshop_denetim
    ADD COLUMN gecerlilik_ay SMALLINT
        GENERATED ALWAYS AS (denetim_gecerlilik_ay(tip, puan)) STORED,
    ADD COLUMN sonraki_tarih DATE
        GENERATED ALWAYS AS
            ((tarih + make_interval(months => denetim_gecerlilik_ay(tip, puan)))::date) STORED,
    ADD COLUMN sinif_hesap TEXT
        GENERATED ALWAYS AS (denetim_sinif_hesap(tip, puan)) STORED;

CREATE INDEX idx_wd_sonraki ON workshop_denetim(sonraki_tarih);

COMMENT ON COLUMN workshop_denetim.sinif IS
'Kaynağın/kullanıcının yazdığı sınıf harfi. Puanla çelişebilir — kaynak veride çelişkiler ölçüldü; bilerek dokunulmuyor.';
COMMENT ON COLUMN workshop_denetim.sinif_hesap IS
'Puandan türetilen sınıf (yalnız SOSYAL). Rapor bunu kullanır; sinif kolonu kaynağın kaydı olarak durur.';

-- ============================================================
-- 4. DURUM VIEW'I — türetilmiş sınıf eklendi
-- ============================================================
CREATE VIEW v_atolye_denetim_durum
WITH (security_invoker = true) AS
WITH tipler AS (
    SELECT w.id AS workshop_id, w.tenant_id, t.tip
    FROM workshop w
    CROSS JOIN (VALUES ('WKYS'), ('SOSYAL')) AS t(tip)
),
son AS (
    SELECT DISTINCT ON (d.workshop_id, d.tip)
           d.workshop_id, d.tip, d.tarih, d.puan, d.sinif, d.sinif_hesap,
           d.gecerlilik_ay, d.sonraki_tarih
    FROM workshop_denetim d
    ORDER BY d.workshop_id, d.tip, d.tarih DESC
)
SELECT
    tp.workshop_id,
    tp.tenant_id,
    w.code                AS atolye_kodu,
    w.name                AS atolye_adi,
    w.is_active,
    p.tedarik_mudurlugu,
    p.teknik_mudur,
    p.fku,
    p.risk_seviyesi,
    tp.tip                AS denetim_tipi,
    s.tarih               AS son_denetim,
    s.puan                AS son_puan,
    -- Rapor türetilmişi tercih eder, yoksa kaynağınkine düşer.
    COALESCE(s.sinif_hesap, s.sinif) AS son_sinif,
    s.sinif               AS son_sinif_kaynak,
    s.sinif_hesap         AS son_sinif_hesap,
    s.gecerlilik_ay,
    s.sonraki_tarih,
    (s.sonraki_tarih - CURRENT_DATE) AS kalan_gun,
    CASE
        WHEN s.tarih IS NULL                      THEN 'YOK'
        WHEN s.sonraki_tarih <  CURRENT_DATE      THEN 'SURESI_DOLMUS'
        WHEN s.sonraki_tarih <= CURRENT_DATE + 90 THEN 'YAKLASIYOR'
        ELSE 'GECERLI'
    END AS durum
FROM tipler tp
JOIN workshop w        ON w.id = tp.workshop_id
LEFT JOIN son s        ON s.workshop_id = tp.workshop_id AND s.tip = tp.tip
LEFT JOIN workshop_profil p ON p.workshop_id = tp.workshop_id;

REVOKE ALL ON v_atolye_denetim_durum FROM anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT ON v_atolye_denetim_durum TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- Kural:
--   SELECT denetim_gecerlilik_ay('SOSYAL', 95),   -- 12
--          denetim_gecerlilik_ay('SOSYAL', 90),   --  9  (90 dahil değil >90'a)
--          denetim_gecerlilik_ay('SOSYAL', 75),   --  9
--          denetim_gecerlilik_ay('SOSYAL', 74),   --  6
--          denetim_gecerlilik_ay('SOSYAL', 60),   --  6
--          denetim_gecerlilik_ay('SOSYAL', 59),   --  2
--          denetim_gecerlilik_ay('SOSYAL', NULL), --  2
--          denetim_gecerlilik_ay('WKYS',   40);   -- 12
--
-- Kaynak sınıf ile hesaplanan sınıf çelişenler:
--   SELECT w.code, w.name, d.tip, d.tarih, d.puan, d.sinif, d.sinif_hesap
--     FROM workshop_denetim d JOIN workshop w ON w.id = d.workshop_id
--    WHERE d.sinif IS NOT NULL AND d.sinif_hesap IS NOT NULL
--      AND d.sinif <> d.sinif_hesap;
--
-- ROLLBACK: 029'daki iki bantlı kurala dönmek için —
--   DROP INDEX idx_wd_sonraki;
--   ALTER TABLE workshop_denetim
--     DROP COLUMN sonraki_tarih, DROP COLUMN gecerlilik_ay, DROP COLUMN sinif_hesap;
--   -- 029'daki denetim_gecerlilik_ay gövdesini geri koy, kolonları geri ekle.
-- ============================================================
