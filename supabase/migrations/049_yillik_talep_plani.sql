-- 049 — Yıllık talep planı (forecast → atölye tahsisi)
--
-- Tedarikçi departmanı yıl başında tahmin verir ("bu kumaşla 1M pantolon").
-- Tahmin tipe göre kalemlere bölünür; her kalem künye taşır, böylece
-- yetenek uyumu iş emriyle AYNI kuralla sorulur (yetenek-uyum.ts).
-- Tahsis atölye × ay adettir. Günlük takvime (line_schedule) YAZILMAZ —
-- yumuşak rezervasyon aylık ızgaranın kendisidir.
--
-- İç ekip aracı: 043'teki gibi atölye kullanıcısı tamamen dışarıda.

BEGIN;

CREATE TABLE IF NOT EXISTS talep_tahmini (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    yil         INTEGER NOT NULL CHECK (yil BETWEEN 2020 AND 2100),
    departman   TEXT    NOT NULL,
    ad          TEXT    NOT NULL,
    kumas       TEXT,
    aciklama    TEXT,
    durum       TEXT    NOT NULL DEFAULT 'Taslak',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tt_durum_chk CHECK (durum IN ('Taslak', 'Onayli'))
);
CREATE INDEX IF NOT EXISTS tt_tenant_yil_idx ON talep_tahmini (tenant_id, yil);

-- SAM kalemde SAKLANIR (sam_kaynak ile). Referanstan her okumada yeniden
-- hesaplamak her yük sorgusunu JS'e taşırdı; referans değişirse kalem
-- kaydedilirken yenilenir.
CREATE TABLE IF NOT EXISTS talep_tahmini_kalem (
    id                SERIAL PRIMARY KEY,
    tahmin_id         INTEGER NOT NULL REFERENCES talep_tahmini(id) ON DELETE CASCADE,
    tenant_id         UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    ad                TEXT    NOT NULL,
    ana_grup_kodu     TEXT,
    klasman_kodu      TEXT,
    kumas_turu_kodu   TEXT,
    kumas_grubu_kodu  TEXT,
    cinsiyet_yas_kodu TEXT,
    kalite_kodu       TEXT,
    kumasci           TEXT,
    urun_tipi_id      INTEGER REFERENCES ref_urun_tipi(id),
    sam_dk            NUMERIC(10,3),
    sam_kaynak        TEXT,
    adet              INTEGER NOT NULL CHECK (adet > 0),
    aylik_profil      NUMERIC(6,2)[] NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ttk_profil_chk CHECK (array_length(aylik_profil, 1) = 12),
    CONSTRAINT ttk_sam_chk CHECK (sam_dk IS NULL OR sam_dk > 0),
    CONSTRAINT ttk_sam_kaynak_chk CHECK (sam_kaynak IS NULL OR sam_kaynak IN ('referans', 'elle'))
);
CREATE INDEX IF NOT EXISTS ttk_tahmin_idx ON talep_tahmini_kalem (tahmin_id);

CREATE TABLE IF NOT EXISTS talep_tahsis (
    id           SERIAL PRIMARY KEY,
    kalem_id     INTEGER NOT NULL REFERENCES talep_tahmini_kalem(id) ON DELETE CASCADE,
    tenant_id    UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    workshop_id  INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    ay           INTEGER NOT NULL CHECK (ay BETWEEN 1 AND 12),
    adet         INTEGER NOT NULL CHECK (adet > 0),
    kaynak       TEXT    NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (kalem_id, workshop_id, ay),
    CONSTRAINT tts_kaynak_chk CHECK (kaynak IN ('oneri', 'elle'))
);
CREATE INDEX IF NOT EXISTS tts_workshop_idx ON talep_tahsis (workshop_id, ay);

ALTER TABLE work_order
    ADD COLUMN IF NOT EXISTS tahmin_kalem_id INTEGER
        REFERENCES talep_tahmini_kalem(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS wo_tahmin_kalem_idx ON work_order (tahmin_kalem_id);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['talep_tahmini', 'talep_tahmini_kalem', 'talep_tahsis'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND current_workshop_id() IS NULL)
             WITH CHECK (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND current_workshop_id() IS NULL)',
            t || '_tenant_isolation', t);
    END LOOP;
END $$;

REVOKE ALL ON talep_tahmini, talep_tahmini_kalem, talep_tahsis FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON talep_tahmini, talep_tahmini_kalem, talep_tahsis TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE talep_tahmini_id_seq, talep_tahmini_kalem_id_seq, talep_tahsis_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;
