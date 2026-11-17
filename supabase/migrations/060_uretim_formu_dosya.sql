-- ============================================================
-- Migration 060 — Üretim formlarına fotoğraf / dosya eki
-- ============================================================
--
-- İHTİYAÇ: model resmi, iğne paketi fotoğrafı, ya da kâğıt formun
-- fotoğrafı (alanları doldurmadan yalnız fotoğrafla kayıt).
--
-- DEPO: Supabase Storage, kapalı kova 'uretim-formlari'. Dosyanın kendisi
-- veritabanında değil (ücretsiz planda DB 500 MB). Kovaya storage
-- politikası YAZILMAZ: istemci doğrudan erişemez; yalnız sunucu
-- (service role) yükler ve süreli imzalı bağlantı üretir. Kim neyi
-- görür kararı bu tablonun RLS'inden gelir — API önce satırı RLS'li
-- bağlantıyla okur, sonra depoya gider.
--
-- Yol: <tenant>/<atölye>/<form>/<uuid>.<uzantı>
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('uretim-formlari', 'uretim-formlari', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS uretim_formu_dosya (
    id           SERIAL PRIMARY KEY,
    tenant_id    UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    form_id      INTEGER NOT NULL REFERENCES uretim_formu(id) ON DELETE CASCADE,
    workshop_id  INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    yol          TEXT    NOT NULL UNIQUE,
    ad           TEXT    NOT NULL,
    tur          TEXT    NOT NULL,
    boyut        INTEGER NOT NULL,
    aciklama     TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    giren_taraf  TEXT CHECK (giren_taraf IN ('atolye', 'merkez')),
    giren_eposta TEXT,
    girildi_at   TIMESTAMPTZ
);

COMMENT ON TABLE uretim_formu_dosya IS
'060: üretim formu ekleri. Dosya Storage kovası uretim-formlari''nda (yol); satır silinince API depodan da siler.';

CREATE INDEX IF NOT EXISTS idx_ufd_form ON uretim_formu_dosya(form_id);

DROP TRIGGER IF EXISTS trg_kayit_giren ON uretim_formu_dosya;
CREATE TRIGGER trg_kayit_giren
    BEFORE INSERT OR UPDATE ON uretim_formu_dosya
    FOR EACH ROW EXECUTE FUNCTION kayit_giren_yaz();

ALTER TABLE uretim_formu_dosya ENABLE ROW LEVEL SECURITY;
ALTER TABLE uretim_formu_dosya FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uretim_formu_dosya_tenant_isolation ON uretim_formu_dosya;
CREATE POLICY uretim_formu_dosya_tenant_isolation ON uretim_formu_dosya FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin())
    AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()));

REVOKE ALL ON uretim_formu_dosya FROM anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON uretim_formu_dosya TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE uretim_formu_dosya_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'uretim-formlari';
--   SELECT form_id, count(*) FROM uretim_formu_dosya GROUP BY 1;
--
-- ROLLBACK (önce kovadaki nesneler Storage API ile silinmeli)
--   DROP TABLE IF EXISTS uretim_formu_dosya;
--   DELETE FROM storage.buckets WHERE id = 'uretim-formlari';
-- ============================================================
