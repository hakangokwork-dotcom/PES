-- ============================================================
-- Migration 052 — Bölgesel 3D dakika maliyeti: değişiklik geçmişi
--                 ve yalnız merkezin yazması
-- ============================================================
--
-- NE EKLİYOR:
--   1. dk_maliyet_gecmis — her ekleme/güncelleme/silme için bir satır
--      (eski değer → yeni değer, kim, ne zaman, açıklama).
--      TETİKLEYİCİYLE yazılır: ekran dışından (betik, migration) yapılan
--      değişiklik de kayda girer. Kim/açıklama, API'nin işlem içinde
--      yazdığı pes.kullanici / pes.aciklama ayarlarından okunur; boşsa
--      'sistem'.
--   2. Mevcut 18 satır geçmişe 'ekle' olarak geri yazılır (tohum).
--   3. RLS ikiye bölünür: OKUMA kiracının herkesine (atölye maliyet
--      ekranı sektör referansını okur), YAZMA yalnız merkeze
--      (current_workshop_id() IS NULL). Önceki tek politika atölye
--      oturumunun da yazmasına izin veriyordu.
--
-- Dönem versiyonu değişmez: bir ay, kendisinden küçük/eşit en yakın
-- dönemle hesaplanır. Değer değişince bütün CANLI hesaplar (ekonomi,
-- referans fiyat, eder, atölye maliyet) bir sonraki açılışta yeni değeri
-- kullanır. model_fiyat'ta SAKLANMIŞ fiyatlar bilerek değişmez (039).
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS dk_maliyet_gecmis (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    donem       VARCHAR(7) NOT NULL,
    bolge       SMALLINT NOT NULL,
    islem       VARCHAR(10) NOT NULL CHECK (islem IN ('ekle', 'guncelle', 'sil')),
    eski_tl     NUMERIC(10,2),
    yeni_tl     NUMERIC(10,2),
    degistiren  TEXT NOT NULL DEFAULT 'sistem',
    aciklama    TEXT,
    degisti_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE dk_maliyet_gecmis IS
'dk_maliyet değişiklik günlüğü. Tetikleyiciyle yazılır, elle yazılmaz. Kim/açıklama işlem içi pes.kullanici / pes.aciklama ayarından.';

CREATE INDEX IF NOT EXISTS idx_dkmg_tenant_zaman ON dk_maliyet_gecmis(tenant_id, degisti_at DESC);

CREATE OR REPLACE FUNCTION dk_maliyet_gecmise_yaz() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    kim TEXT := coalesce(nullif(current_setting('pes.kullanici', true), ''), 'sistem');
    neden TEXT := nullif(current_setting('pes.aciklama', true), '');
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO dk_maliyet_gecmis (tenant_id, donem, bolge, islem, eski_tl, yeni_tl, degistiren, aciklama)
        VALUES (NEW.tenant_id, NEW.donem, NEW.bolge, 'ekle', NULL, NEW.dk_maliyet_tl, kim, neden);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Değer aynıysa kayıt yok: aynı formu tekrar kaydetmek günlüğü doldurmasın.
        IF NEW.dk_maliyet_tl IS DISTINCT FROM OLD.dk_maliyet_tl THEN
            INSERT INTO dk_maliyet_gecmis (tenant_id, donem, bolge, islem, eski_tl, yeni_tl, degistiren, aciklama)
            VALUES (NEW.tenant_id, NEW.donem, NEW.bolge, 'guncelle', OLD.dk_maliyet_tl, NEW.dk_maliyet_tl, kim, neden);
        END IF;
        RETURN NEW;
    ELSE
        INSERT INTO dk_maliyet_gecmis (tenant_id, donem, bolge, islem, eski_tl, yeni_tl, degistiren, aciklama)
        VALUES (OLD.tenant_id, OLD.donem, OLD.bolge, 'sil', OLD.dk_maliyet_tl, NULL, kim, neden);
        RETURN OLD;
    END IF;
END $$;

DROP TRIGGER IF EXISTS trg_dk_maliyet_gecmis ON dk_maliyet;
CREATE TRIGGER trg_dk_maliyet_gecmis
    AFTER INSERT OR UPDATE OR DELETE ON dk_maliyet
    FOR EACH ROW EXECUTE FUNCTION dk_maliyet_gecmise_yaz();

-- Tohum: bugünkü satırlar, eklendikleri tarihle.
INSERT INTO dk_maliyet_gecmis (tenant_id, donem, bolge, islem, eski_tl, yeni_tl, degistiren, aciklama, degisti_at)
SELECT d.tenant_id, d.donem, d.bolge, 'ekle', NULL, d.dk_maliyet_tl, 'sistem',
       CASE WHEN d.donem = '2026-09' THEN 'Migration 051' ELSE 'İlk yükleme (007)' END,
       coalesce(d.created_at, now())
FROM dk_maliyet d
WHERE NOT EXISTS (SELECT 1 FROM dk_maliyet_gecmis g WHERE g.donem = d.donem AND g.bolge = d.bolge);

-- ---------- RLS ----------
ALTER TABLE dk_maliyet_gecmis ENABLE ROW LEVEL SECURITY;
ALTER TABLE dk_maliyet_gecmis FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dk_maliyet_gecmis_merkez ON dk_maliyet_gecmis;
CREATE POLICY dk_maliyet_gecmis_merkez ON dk_maliyet_gecmis FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin())
    AND current_workshop_id() IS NULL);

DROP POLICY IF EXISTS dk_maliyet_tenant_isolation ON dk_maliyet;
DROP POLICY IF EXISTS dk_maliyet_oku ON dk_maliyet;
DROP POLICY IF EXISTS dk_maliyet_merkez_yaz ON dk_maliyet;
CREATE POLICY dk_maliyet_oku ON dk_maliyet FOR SELECT USING (
    tenant_id = current_tenant_id() OR is_internal_admin());
CREATE POLICY dk_maliyet_merkez_yaz ON dk_maliyet FOR ALL
    USING      ((tenant_id = current_tenant_id() OR is_internal_admin()) AND current_workshop_id() IS NULL)
    WITH CHECK ((tenant_id = current_tenant_id() OR is_internal_admin()) AND current_workshop_id() IS NULL);

REVOKE ALL ON dk_maliyet_gecmis FROM anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT ON dk_maliyet_gecmis TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE dk_maliyet_gecmis_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ROLLBACK:
--   DROP TRIGGER trg_dk_maliyet_gecmis ON dk_maliyet;
--   DROP FUNCTION dk_maliyet_gecmise_yaz();
--   DROP TABLE dk_maliyet_gecmis;
--   DROP POLICY dk_maliyet_oku ON dk_maliyet; DROP POLICY dk_maliyet_merkez_yaz ON dk_maliyet;
--   CREATE POLICY dk_maliyet_tenant_isolation ON dk_maliyet FOR ALL
--       USING (tenant_id = current_tenant_id() OR is_internal_admin());
