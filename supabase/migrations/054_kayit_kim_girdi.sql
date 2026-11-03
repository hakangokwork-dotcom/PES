-- ============================================================
-- Migration 054 — Kaydı kim girdi: atölye mi, merkez mi
-- ============================================================
--
-- SORUN (veri sahipliği matrisi, 2026-11-03): aylık üretim, kalite,
-- duruş, işgücü, gider, atölye profili, bantlar ve yetenekler HEM atölye
-- HEM merkez panelinden aynı API ile yazılıyor; kimin girdiği hiç
-- kaydedilmiyordu. "Atölye beyan eder, merkez doğrular" kuralı bu bilgi
-- olmadan uygulanamaz.
--
-- ÇÖZÜM: her yazmada (INSERT ve UPDATE) tetikleyici üç kolonu doldurur:
--   giren_taraf   'atolye' | 'merkez'   — oturumdaki atölye kapsamından
--   giren_eposta  kim                    — uygulamanın oturuma yazdığı e-posta
--   girildi_at    ne zaman
-- Tetikleyicide, çünkü yazma yolu tek değil (API, Excel içe aktarma,
-- eski uçlar). Uygulama kodu bu kolonlara hiç yazmaz; istemci ne gönderirse
-- göndersin tetikleyici üzerine yazar — taklit edilemez.
--
-- TARAF KURALI: current_workshop_id() doluysa 'atolye'. Merkez yöneticisi
-- "atölye adına çalış" ile girdiyse de 'atolye' yazılır (o atölyenin
-- hesabıyla girmekle birebir aynı, bkz. lib/auth/atolye-kapsam.ts); kim
-- olduğu giren_eposta'da görünür.
--
-- ESKİ SATIRLAR: NULL kalır = "054 öncesi, bilinmiyor".
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION kayit_giren_yaz()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.giren_taraf  := CASE WHEN current_workshop_id() IS NULL THEN 'merkez' ELSE 'atolye' END;
    NEW.giren_eposta := NULLIF(current_setting('app.current_user_email', true), '');
    NEW.girildi_at   := now();
    RETURN NEW;
END $$;

COMMENT ON FUNCTION kayit_giren_yaz() IS
'054: yazan tarafı (atolye/merkez), e-postayı ve zamanı kayda işler. Uygulama bu kolonlara yazmaz.';

DO $$
DECLARE
    t TEXT;
    tablolar TEXT[] := ARRAY[
        'monthly_production', 'quality_record', 'downtime_record',
        'workforce_turnover', 'monthly_expense',
        'workshop', 'production_line', 'line_capability', 'capability_value'
    ];
BEGIN
    FOREACH t IN ARRAY tablolar LOOP
        EXECUTE format('ALTER TABLE %I
            ADD COLUMN IF NOT EXISTS giren_taraf  TEXT,
            ADD COLUMN IF NOT EXISTS giren_eposta TEXT,
            ADD COLUMN IF NOT EXISTS girildi_at   TIMESTAMPTZ', t);
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_giren_taraf_chk') THEN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I
                CHECK (giren_taraf IN (''atolye'', ''merkez''))', t, t || '_giren_taraf_chk');
        END IF;
        EXECUTE format('DROP TRIGGER IF EXISTS trg_kayit_giren ON %I', t);
        EXECUTE format('CREATE TRIGGER trg_kayit_giren
            BEFORE INSERT OR UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION kayit_giren_yaz()', t);
        EXECUTE format('COMMENT ON COLUMN %I.giren_taraf IS %L', t,
            '054: son yazan taraf (atolye/merkez). NULL = 054 öncesi.');
    END LOOP;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT giren_taraf, giren_eposta, girildi_at FROM quality_record
--    ORDER BY id DESC LIMIT 5;
--
-- ROLLBACK
--   DO $$ DECLARE t TEXT; BEGIN
--     FOREACH t IN ARRAY ARRAY['monthly_production','quality_record',
--       'downtime_record','workforce_turnover','monthly_expense','workshop',
--       'production_line','line_capability','capability_value'] LOOP
--       EXECUTE format('DROP TRIGGER IF EXISTS trg_kayit_giren ON %I', t);
--       EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_giren_taraf_chk');
--       EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS giren_taraf,
--         DROP COLUMN IF EXISTS giren_eposta, DROP COLUMN IF EXISTS girildi_at', t);
--     END LOOP; END $$;
--   DROP FUNCTION IF EXISTS kayit_giren_yaz();
-- ============================================================
