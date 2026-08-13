-- ============================================================
-- Migration 034 — Öz değerlendirme, denetimden ayrı kayıt
-- ============================================================
--
-- KARAR (kullanıcı, 2026-08-13): atölyenin kendi doldurduğu kayıt AYRI bir
-- öz değerlendirme olacak; denetçinin yaptığı denetim asıl olan.
--
-- NEDEN AYRI: kendi notunu kendi veren bir sistemde A/B/C/D sınıfı hiçbir
-- şey ifade etmez. Ayrı tutulunca hem filo skoru bozulmaz hem de asıl
-- değerli sinyal ortaya çıkar: "atölye kendini 2,8 görüyor, denetçi 1,9
-- verdi" farkı, tek başına bir olgunluk göstergesidir.
--
-- KİM HANGİSİNİ AÇAR:
--   merkez kullanıcısı (current_workshop_id() NULL) -> DENETIM
--   atölye kullanıcısı                              -> OZ_DEGERLENDIRME
-- Bu kural trigger'da: atölyenin kendine resmi denetim açması, yukarıdaki
-- ayrımı tek satırlık bir istekle geçersiz kılardı.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

ALTER TABLE olgunluk_denetim
    ADD COLUMN IF NOT EXISTS tur TEXT NOT NULL DEFAULT 'DENETIM';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'od_tur_chk') THEN
        ALTER TABLE olgunluk_denetim
            ADD CONSTRAINT od_tur_chk CHECK (tur IN ('DENETIM','OZ_DEGERLENDIRME'));
    END IF;
END $$;

COMMENT ON COLUMN olgunluk_denetim.tur IS
'DENETIM = denetçinin yaptığı, rapora giren asıl kayıt. OZ_DEGERLENDIRME = atölyenin kendi beyanı; filo skorunu etkilemez, denetimle karşılaştırılır.';

-- Aynı gün hem denetim hem öz değerlendirme olabilmeli: eski anahtar
-- (workshop_id, sablon_id, tarih) ikisinden birini engelliyordu.
ALTER TABLE olgunluk_denetim
    DROP CONSTRAINT IF EXISTS olgunluk_denetim_workshop_id_sablon_id_tarih_key;
DROP INDEX IF EXISTS uq_olgunluk_denetim_kayit;
CREATE UNIQUE INDEX uq_olgunluk_denetim_kayit
    ON olgunluk_denetim(workshop_id, sablon_id, tarih, tur);

-- ============================================================
-- ATÖLYE KENDİNE RESMİ DENETİM AÇAMAZ
-- ============================================================
CREATE OR REPLACE FUNCTION olgunluk_denetim_tur_kontrol()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_workshop_id() IS NOT NULL AND NEW.tur <> 'OZ_DEGERLENDIRME' THEN
        RAISE EXCEPTION
            'Atölye kullanıcısı yalnız öz değerlendirme açabilir; resmi denetimi denetçi yapar.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

COMMENT ON FUNCTION olgunluk_denetim_tur_kontrol() IS
'Atölyeye bağlı kullanıcının açtığı kaydı öz değerlendirmeye zorlar. Kural burada çünkü uygulamada tutulsaydı tek bir API isteğiyle aşılabilirdi.';

DROP TRIGGER IF EXISTS trg_od_tur_kontrol ON olgunluk_denetim;
CREATE TRIGGER trg_od_tur_kontrol
    BEFORE INSERT OR UPDATE OF tur ON olgunluk_denetim
    FOR EACH ROW EXECUTE FUNCTION olgunluk_denetim_tur_kontrol();

-- ============================================================
-- FİLO GÖRÜNÜMÜ YALNIZ RESMİ DENETİMİ SAYAR
-- ============================================================
-- Kolon listesi değişmiyor, yalnız WHERE ekleniyor — OR REPLACE yeterli.
CREATE OR REPLACE VIEW v_atolye_olgunluk
WITH (security_invoker = true) AS
WITH son AS (
    SELECT DISTINCT ON (o.workshop_id) o.*
    FROM v_olgunluk_denetim_ozet o
    JOIN olgunluk_denetim d ON d.id = o.denetim_id
    WHERE o.durum = 'tamamlandi' AND d.tur = 'DENETIM'
    ORDER BY o.workshop_id, o.tarih DESC, o.denetim_id DESC
)
SELECT w.id            AS workshop_id,
       w.tenant_id,
       w.code          AS atolye_kodu,
       w.name          AS atolye_adi,
       w.is_active,
       p.tedarik_mudurlugu,
       p.teknik_mudur,
       p.risk_seviyesi,
       s.denetim_id,
       s.sablon_id,
       s.tarih         AS son_denetim,
       s.denetci,
       s.puan,
       s.max_puan,
       s.yuzde,
       s.degerlendirilen,
       s.degerlendirilmeyen,
       CASE
           WHEN s.tarih IS NULL   THEN 'YOK'
           WHEN s.yuzde >= 85     THEN 'A'
           WHEN s.yuzde >= 70     THEN 'B'
           WHEN s.yuzde >= 50     THEN 'C'
           ELSE                        'D'
       END AS sinif
FROM workshop w
LEFT JOIN son s             ON s.workshop_id = w.id
LEFT JOIN workshop_profil p ON p.workshop_id = w.id;

COMMENT ON VIEW v_atolye_olgunluk IS
'Atölye başına son TAMAMLANMIŞ RESMİ denetim. Öz değerlendirmeler bilerek dışarıda: atölyenin kendi beyanı filo skorunu ve A/B/C/D sınıfını belirlememeli.';

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
--   npx vitest run lib/pes/olgunluk-oz.test.ts
--
-- Elle:
--   SELECT set_config('app.current_workshop_id','12',false);
--   INSERT INTO olgunluk_denetim (...) VALUES (..., 'DENETIM');
--   -- beklenen: ERROR  Atölye kullanıcısı yalnız öz değerlendirme açabilir
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_od_tur_kontrol ON olgunluk_denetim;
--   DROP FUNCTION IF EXISTS olgunluk_denetim_tur_kontrol();
--   DROP INDEX IF EXISTS uq_olgunluk_denetim_kayit;
--   ALTER TABLE olgunluk_denetim DROP CONSTRAINT od_tur_chk, DROP COLUMN tur;
--   -- ve 031'deki v_atolye_olgunluk gövdesini geri koy.
-- ============================================================
