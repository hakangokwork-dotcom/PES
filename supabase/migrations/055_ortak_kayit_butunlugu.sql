-- ============================================================
-- Migration 055 — Ortak kayıt bütünlüğü: iki panel, tek gerçek
-- ============================================================
--
-- KARAR (Hakan, 2026-11-03): merkez onayı yok. Atölye de merkez de aynı
-- kaydı değiştirebilir; kim değiştirirse değiştirsin iki panel aynı değeri
-- görür. İleride "yalnız atölye yazar" ya da "onaydan sonra değişir"
-- kuralı gelebilir; bugün öncelik veri bütünlüğü.
--
-- ÜÇ DEĞİŞİKLİK
--
-- 1. SESSİZ ÜZERİNE YAZMA YOK. Bir ekran kaydı açar, bu arada diğer taraf
--    aynı kaydı değiştirir, ilk ekran kaydedince diğerinin değişikliği
--    kayboluyordu. Uygulama, kaydı açtığında gördüğü sürümü
--    (girildi_at) app.beklenen_surum olarak verir; UPDATE anında kayıt
--    başka bir sürümdeyse tetikleyici PT409 ile durdurur, API 409 döner.
--      ''      kontrol yok (betikler, eski uçlar)
--      'yok'   ekran kayıt görmedi; bu arada biri eklediyse çakışma
--      'eski'  ekran 054 öncesi (girildi_at NULL) kaydı gördü
--      zaman   ekranın gördüğü girildi_at
--    girildi_at milisaniyeye kırpılır: tarayıcı (JS Date) mikrosaniye taşımaz.
--
-- 2. MODEL DEĞİŞİMİ ORTAK VERİ. changeover_record artık atölye panelinden
--    de yazılıyor; 054'teki "kim girdi" kolonları ona da eklenir.
--
-- 3. KÜNYE ↔ ATÖLYE KAYDI EŞİTLENİR. Bant sayısı ve çalışan sayısı iki
--    yerde tutuluyordu: merkezin künyesi (workshop_profil.bant_sayisi,
--    calisan_sayisi; Excel'den) ve atölyenin kaydı (workshop.line_count,
--    total_staff; atölye profilinden). 2026-11-03'te 79 künyeli atölyenin
--    50'sinde bant, 77'sinde çalışan sayısı iki panelde farklıydı.
--    Artık hangisi yazılırsa diğeri aynı değere çekilir (tetikleyici,
--    iki yön). IS DISTINCT FROM koşulu ikinci adımda zinciri keser.
--    Aylık kapasite BİLEREK dışarıda: yıllık plan künye ile atölye beyanını
--    ayrı kaynak olarak gösteriyor (lib/pes/yillik-plan.ts).
--
--    Bugünkü farkların uzlaştırılması (tek seferlik):
--      - 054'ten sonra workshop satırına biri yazdıysa (girildi_at dolu)
--        atölye kaydı kazanır — daha yeni bilgi.
--      - Aksi halde künye doluysa künye kazanır (Excel; workshop
--        değerleri çoğunlukla varsayılan 0/1).
--      - Künye boşsa atölye kaydındaki değer künyeye yazılır.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. Sürüm kontrolü + milisaniye ----------
CREATE OR REPLACE FUNCTION kayit_giren_yaz()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    beklenen TEXT := NULLIF(current_setting('app.beklenen_surum', true), '');
    cakisti  BOOLEAN := false;
BEGIN
    -- pg_trigger_depth() = 1: yalnız ekranın doğrudan yazdığı satır.
    -- Eşitleme tetikleyicisinin zincirdeki yazımı kontrole takılmaz.
    IF TG_OP = 'UPDATE' AND beklenen IS NOT NULL AND pg_trigger_depth() = 1 THEN
        cakisti := CASE beklenen
            WHEN 'yok'  THEN true
            WHEN 'eski' THEN OLD.girildi_at IS NOT NULL
            ELSE date_trunc('milliseconds', OLD.girildi_at) IS DISTINCT FROM beklenen::timestamptz
        END;
        IF cakisti THEN
            RAISE EXCEPTION 'Bu kayıt siz açtıktan sonra değiştirildi (% · %). Sayfayı yenileyip tekrar deneyin.',
                CASE OLD.giren_taraf WHEN 'atolye' THEN 'atölye' WHEN 'merkez' THEN 'merkez' ELSE 'bilinmeyen' END,
                coalesce(OLD.giren_eposta, '—')
                USING ERRCODE = 'PT409';
        END IF;
    END IF;

    NEW.giren_taraf  := CASE WHEN current_workshop_id() IS NULL THEN 'merkez' ELSE 'atolye' END;
    NEW.giren_eposta := NULLIF(current_setting('app.current_user_email', true), '');
    NEW.girildi_at   := date_trunc('milliseconds', clock_timestamp());
    RETURN NEW;
END $$;

COMMENT ON FUNCTION kayit_giren_yaz() IS
'054/055: yazan tarafı, e-postayı ve zamanı kayda işler; app.beklenen_surum verilmişse araya giren değişikliği PT409 ile durdurur.';

-- ---------- 2. Model değişimi ortak veri ----------
ALTER TABLE changeover_record
    ADD COLUMN IF NOT EXISTS giren_taraf  TEXT,
    ADD COLUMN IF NOT EXISTS giren_eposta TEXT,
    ADD COLUMN IF NOT EXISTS girildi_at   TIMESTAMPTZ;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'changeover_record_giren_taraf_chk') THEN
        ALTER TABLE changeover_record ADD CONSTRAINT changeover_record_giren_taraf_chk
            CHECK (giren_taraf IN ('atolye', 'merkez'));
    END IF;
END $$;
DROP TRIGGER IF EXISTS trg_kayit_giren ON changeover_record;
CREATE TRIGGER trg_kayit_giren
    BEFORE INSERT OR UPDATE ON changeover_record
    FOR EACH ROW EXECUTE FUNCTION kayit_giren_yaz();

-- ---------- 3. Künye ↔ atölye kaydı ----------
-- Tek seferlik uzlaştırma (tetikleyiciler kurulmadan önce).
UPDATE workshop w SET
    line_count  = coalesce(p.bant_sayisi, w.line_count),
    total_staff = coalesce(p.calisan_sayisi, w.total_staff)
FROM workshop_profil p
WHERE p.workshop_id = w.id
  AND w.girildi_at IS NULL
  AND (p.bant_sayisi IS NOT NULL AND p.bant_sayisi IS DISTINCT FROM w.line_count
    OR p.calisan_sayisi IS NOT NULL AND p.calisan_sayisi IS DISTINCT FROM w.total_staff);

UPDATE workshop_profil p SET
    bant_sayisi    = w.line_count,
    calisan_sayisi = w.total_staff
FROM workshop w
WHERE p.workshop_id = w.id
  AND (p.bant_sayisi IS DISTINCT FROM w.line_count OR p.calisan_sayisi IS DISTINCT FROM w.total_staff);

CREATE OR REPLACE FUNCTION atolye_kunyeye_esitle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE workshop_profil
       SET bant_sayisi = NEW.line_count, calisan_sayisi = NEW.total_staff
     WHERE workshop_id = NEW.id
       AND (bant_sayisi IS DISTINCT FROM NEW.line_count OR calisan_sayisi IS DISTINCT FROM NEW.total_staff);
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION kunye_atolyeye_esitle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Künyede boş bırakılan alan atölye kaydını silmez (workshop kolonları NOT NULL).
    UPDATE workshop
       SET line_count  = coalesce(NEW.bant_sayisi, line_count),
           total_staff = coalesce(NEW.calisan_sayisi, total_staff)
     WHERE id = NEW.workshop_id
       AND (coalesce(NEW.bant_sayisi, line_count) IS DISTINCT FROM line_count
         OR coalesce(NEW.calisan_sayisi, total_staff) IS DISTINCT FROM total_staff);
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_atolye_kunyeye ON workshop;
CREATE TRIGGER trg_atolye_kunyeye
    AFTER UPDATE OF line_count, total_staff ON workshop
    FOR EACH ROW EXECUTE FUNCTION atolye_kunyeye_esitle();

DROP TRIGGER IF EXISTS trg_kunye_atolyeye ON workshop_profil;
CREATE TRIGGER trg_kunye_atolyeye
    AFTER INSERT OR UPDATE OF bant_sayisi, calisan_sayisi ON workshop_profil
    FOR EACH ROW EXECUTE FUNCTION kunye_atolyeye_esitle();

COMMENT ON COLUMN workshop_profil.bant_sayisi IS
'055: workshop.line_count ile eşit tutulur (tetikleyici, iki yön).';
COMMENT ON COLUMN workshop_profil.calisan_sayisi IS
'055: workshop.total_staff ile eşit tutulur (tetikleyici, iki yön).';

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT count(*) FROM workshop w JOIN workshop_profil p ON p.workshop_id = w.id
--    WHERE p.bant_sayisi IS DISTINCT FROM w.line_count
--       OR p.calisan_sayisi IS DISTINCT FROM w.total_staff;   -- 0
--
-- ROLLBACK (uzlaştırılan değerler geri alınmaz)
--   DROP TRIGGER IF EXISTS trg_atolye_kunyeye ON workshop;
--   DROP TRIGGER IF EXISTS trg_kunye_atolyeye ON workshop_profil;
--   DROP FUNCTION IF EXISTS atolye_kunyeye_esitle();
--   DROP FUNCTION IF EXISTS kunye_atolyeye_esitle();
--   DROP TRIGGER IF EXISTS trg_kayit_giren ON changeover_record;
--   ALTER TABLE changeover_record DROP CONSTRAINT IF EXISTS changeover_record_giren_taraf_chk,
--     DROP COLUMN IF EXISTS giren_taraf, DROP COLUMN IF EXISTS giren_eposta,
--     DROP COLUMN IF EXISTS girildi_at;
--   -- kayit_giren_yaz(): 054'teki tanıma geri dönülür.
-- ============================================================
