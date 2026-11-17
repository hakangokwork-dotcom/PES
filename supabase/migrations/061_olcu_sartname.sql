-- ============================================================
-- Migration 061 — Ölçü şartnamesi (model × kumaş kategorisi × aşama × revizyon)
-- ============================================================
--
-- HEDEF (2026-11-17): Model × kumaş kategorisi × beden × ölçü noktası için
-- nominal, eksi/artı tolerans, ölçüm yöntemi ve revizyon. Tasarım:
-- docs/superpowers/specs/2026-11-17-is-emri-surec-akisi-design.md §4.1
--
-- KURALLAR:
--   - Kabul aralığı SAKLANMAZ: hedef nominaldir, aralık ortası hedef olmaz.
--   - 'Önerilen' sınırlar sevkiyat kabulü değildir; müşteri onayı ayrı durum.
--   - Onaylı/geçersiz şartname ve ölçüleri değişmez (PT422); değişiklik = yeni revizyon.
--   - Aynı model × kategori × aşama için tek 'Müşteri onaylı'.
--   - Rijit ve esnek toleransları aynı olsa da ayrı şartnamedir.
--   - Yazma yalnız merkez (current_workshop_id() IS NULL). Atölye, kendi
--     iş emirlerinin modeline ait şartnameyi okur.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS olcu_sartname (
    id               SERIAL PRIMARY KEY,
    tenant_id        UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    model_bulten_id  INTEGER NOT NULL REFERENCES model_bulten(id) ON DELETE CASCADE,
    kumas_kategorisi TEXT    NOT NULL CHECK (kumas_kategorisi IN ('Rijit', 'Esnek')),
    asama            TEXT    NOT NULL CHECK (asama IN ('FINAL', 'YIKAMA_ONCESI')),
    revizyon         INTEGER NOT NULL DEFAULT 1 CHECK (revizyon >= 1),
    durum            TEXT    NOT NULL DEFAULT 'Önerilen'
                     CHECK (durum IN ('Önerilen', 'Müşteri onaylı', 'Geçersiz')),
    onaylayan        TEXT,
    onay_tarihi      DATE,
    notlar           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    giren_taraf      TEXT CHECK (giren_taraf IN ('atolye', 'merkez')),
    giren_eposta     TEXT,
    girildi_at       TIMESTAMPTZ,
    UNIQUE (model_bulten_id, kumas_kategorisi, asama, revizyon),
    CONSTRAINT olcu_sartname_onay_chk CHECK (
        durum <> 'Müşteri onaylı' OR (onaylayan IS NOT NULL AND onay_tarihi IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_olcu_sartname_onayli
    ON olcu_sartname (model_bulten_id, kumas_kategorisi, asama) WHERE durum = 'Müşteri onaylı';

CREATE TABLE IF NOT EXISTS olcu_noktasi (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    sartname_id INTEGER NOT NULL REFERENCES olcu_sartname(id) ON DELETE CASCADE,
    kod         TEXT    NOT NULL,
    ad          TEXT    NOT NULL,
    musteri_adi TEXT,
    yontem      TEXT,   -- düğme, hizalama, referans mesafe, kemer dahil mi, serbest/yük altında
    kritik      BOOLEAN NOT NULL DEFAULT false,
    sira        INTEGER NOT NULL DEFAULT 0,
    UNIQUE (sartname_id, kod)
);
CREATE INDEX IF NOT EXISTS idx_olcu_noktasi_sartname ON olcu_noktasi(sartname_id);

CREATE TABLE IF NOT EXISTS olcu_degeri (
    tenant_id UUID         NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    nokta_id  INTEGER      NOT NULL REFERENCES olcu_noktasi(id) ON DELETE CASCADE,
    beden     TEXT         NOT NULL,
    nominal   NUMERIC(6,2) NOT NULL,
    tol_eksi  NUMERIC(5,2) NOT NULL CHECK (tol_eksi >= 0),
    tol_arti  NUMERIC(5,2) NOT NULL CHECK (tol_arti >= 0),
    PRIMARY KEY (nokta_id, beden)
);

COMMENT ON TABLE olcu_sartname IS
'061: ölçü şartnamesi başlığı. Kabul aralığı saklanmaz (nominal ± tolerans). Onaylı/geçersiz değişmez; değişiklik yeni revizyon.';

-- ---------- Kilitler ----------
CREATE OR REPLACE FUNCTION olcu_sartname_kilit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.durum <> 'Önerilen' THEN
            RAISE EXCEPTION 'Onaylı ya da geçersiz şartname silinemez.' USING ERRCODE = 'PT422';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.durum = 'Geçersiz' THEN
        RAISE EXCEPTION 'Geçersiz şartname değiştirilemez.' USING ERRCODE = 'PT422';
    END IF;
    IF OLD.durum = 'Müşteri onaylı' AND NOT (
        NEW.durum = 'Geçersiz'
        AND (NEW.model_bulten_id, NEW.kumas_kategorisi, NEW.asama, NEW.revizyon, NEW.onaylayan, NEW.onay_tarihi, NEW.notlar)
            IS NOT DISTINCT FROM
            (OLD.model_bulten_id, OLD.kumas_kategorisi, OLD.asama, OLD.revizyon, OLD.onaylayan, OLD.onay_tarihi, OLD.notlar)
    ) THEN
        RAISE EXCEPTION 'Müşteri onaylı şartname değiştirilemez; yeni revizyon açın.' USING ERRCODE = 'PT422';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_olcu_sartname_kilit ON olcu_sartname;
CREATE TRIGGER trg_olcu_sartname_kilit
    BEFORE UPDATE OR DELETE ON olcu_sartname
    FOR EACH ROW EXECUTE FUNCTION olcu_sartname_kilit();

-- Nokta ve değer: yalnız 'Önerilen' şartnamede değişir. Şartname silinirken
-- (yalnız Önerilen silinebilir) cascade bu kontrolden geçer.
CREATE OR REPLACE FUNCTION olcu_alt_kilit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
    sid INTEGER;
    d   TEXT;
BEGIN
    IF TG_TABLE_NAME = 'olcu_noktasi' THEN
        IF TG_OP = 'DELETE' THEN sid := OLD.sartname_id; ELSE sid := NEW.sartname_id; END IF;
    ELSE
        SELECT n.sartname_id INTO sid FROM olcu_noktasi n
         WHERE n.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.nokta_id ELSE NEW.nokta_id END;
    END IF;
    SELECT durum INTO d FROM olcu_sartname WHERE id = sid;
    IF d IS NOT NULL AND d <> 'Önerilen' THEN
        RAISE EXCEPTION 'Yalnız "Önerilen" şartnamenin ölçüleri değiştirilebilir; yeni revizyon açın.' USING ERRCODE = 'PT422';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_olcu_noktasi_kilit ON olcu_noktasi;
CREATE TRIGGER trg_olcu_noktasi_kilit
    BEFORE INSERT OR UPDATE OR DELETE ON olcu_noktasi
    FOR EACH ROW EXECUTE FUNCTION olcu_alt_kilit();
DROP TRIGGER IF EXISTS trg_olcu_degeri_kilit ON olcu_degeri;
CREATE TRIGGER trg_olcu_degeri_kilit
    BEFORE INSERT OR UPDATE OR DELETE ON olcu_degeri
    FOR EACH ROW EXECUTE FUNCTION olcu_alt_kilit();

-- 054/055: kim girdi + sürüm kontrolü (başlıkta)
DROP TRIGGER IF EXISTS trg_kayit_giren ON olcu_sartname;
CREATE TRIGGER trg_kayit_giren
    BEFORE INSERT OR UPDATE ON olcu_sartname
    FOR EACH ROW EXECUTE FUNCTION kayit_giren_yaz();

-- ---------- RLS ----------
-- İki politika OR'lanır: yazma yalnız merkez; okuma atölyeye kendi iş
-- emirlerinin modeli için de açık.
ALTER TABLE olcu_sartname ENABLE ROW LEVEL SECURITY;
ALTER TABLE olcu_sartname FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS olcu_sartname_merkez ON olcu_sartname;
CREATE POLICY olcu_sartname_merkez ON olcu_sartname FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin()) AND current_workshop_id() IS NULL);
DROP POLICY IF EXISTS olcu_sartname_atolye_oku ON olcu_sartname;
CREATE POLICY olcu_sartname_atolye_oku ON olcu_sartname FOR SELECT USING (
    (tenant_id = current_tenant_id() OR is_internal_admin())
    AND EXISTS (SELECT 1 FROM work_order wo
                 WHERE wo.model_bulten_id = olcu_sartname.model_bulten_id
                   AND wo.workshop_id = current_workshop_id()));

ALTER TABLE olcu_noktasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE olcu_noktasi FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS olcu_noktasi_merkez ON olcu_noktasi;
CREATE POLICY olcu_noktasi_merkez ON olcu_noktasi FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin()) AND current_workshop_id() IS NULL);
DROP POLICY IF EXISTS olcu_noktasi_atolye_oku ON olcu_noktasi;
CREATE POLICY olcu_noktasi_atolye_oku ON olcu_noktasi FOR SELECT USING (
    EXISTS (SELECT 1 FROM olcu_sartname s WHERE s.id = olcu_noktasi.sartname_id));

ALTER TABLE olcu_degeri ENABLE ROW LEVEL SECURITY;
ALTER TABLE olcu_degeri FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS olcu_degeri_merkez ON olcu_degeri;
CREATE POLICY olcu_degeri_merkez ON olcu_degeri FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin()) AND current_workshop_id() IS NULL);
DROP POLICY IF EXISTS olcu_degeri_atolye_oku ON olcu_degeri;
CREATE POLICY olcu_degeri_atolye_oku ON olcu_degeri FOR SELECT USING (
    EXISTS (SELECT 1 FROM olcu_noktasi n WHERE n.id = olcu_degeri.nokta_id));

REVOKE ALL ON olcu_sartname, olcu_noktasi, olcu_degeri FROM anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON olcu_sartname, olcu_noktasi, olcu_degeri TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE olcu_sartname_id_seq, olcu_noktasi_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT model_bulten_id, kumas_kategorisi, asama, revizyon, durum FROM olcu_sartname ORDER BY 1,2,3,4;
--
-- ROLLBACK
--   DROP TABLE IF EXISTS olcu_degeri, olcu_noktasi, olcu_sartname;
--   DROP FUNCTION IF EXISTS olcu_sartname_kilit(), olcu_alt_kilit();
-- ============================================================
