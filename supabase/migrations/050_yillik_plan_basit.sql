-- 050 — Yıllık plan, basit yapı (v2)
--
-- Kullanıcı planı ters yönden kuruyor: atölyenin aylık kapasitesi belli,
-- planlamacı her ay hangi atölyeye hangi klasmandan kaç adet
-- yaptıracağını kendisi yazıyor. Her şey ADET; dakika/SAM yok.
--
-- Kapasite çözümü (lib/pes/yillik-plan.ts kapasiteCoz):
--   1. atolye_kapasite_ay düzeltmesi (0 = o ay kapalı)
--   2. workshop_profil.aylik_kapasite (> 0)
--   3. aktif bantların daily_target toplamı × çalışma günü
--   4. yok
--
-- 049 (talep_tahmini…) BURADA DÜŞÜRÜLMEZ: canlı v1.8.0 Planlama Masası
-- o nesneleri okuyor. v1.9.0 yayına çıkınca 051 düşürür.
--
-- İç ekip aracı: 043'teki gibi atölye kullanıcısı tamamen dışarıda.

BEGIN;

-- Ay bazında kapasite düzeltmesi (bayram, bakım, geçici bant ekleme…).
CREATE TABLE IF NOT EXISTS atolye_kapasite_ay (
    id           SERIAL PRIMARY KEY,
    tenant_id    UUID    NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
    workshop_id  INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    yil          INTEGER NOT NULL CHECK (yil BETWEEN 2020 AND 2100),
    ay           INTEGER NOT NULL CHECK (ay BETWEEN 1 AND 12),
    adet         INTEGER NOT NULL CHECK (adet >= 0),
    sebep        TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workshop_id, yil, ay)
);
CREATE INDEX IF NOT EXISTS aka_tenant_yil_idx ON atolye_kapasite_ay (tenant_id, yil);

-- Planlamacının yazdığı hücre: atölye × ay × klasman → adet.
-- klasman_kodu katalogda (capability_value, boyut 'klasman') olmalı;
-- katalog (dimension_id, code) tekil olduğu için FK kurulamıyor —
-- API doğrular (kunye.ts ile aynı gerekçe).
CREATE TABLE IF NOT EXISTS plan_atolye_ay (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID    NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
    workshop_id   INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    yil           INTEGER NOT NULL CHECK (yil BETWEEN 2020 AND 2100),
    ay            INTEGER NOT NULL CHECK (ay BETWEEN 1 AND 12),
    klasman_kodu  TEXT    NOT NULL,
    adet          INTEGER NOT NULL CHECK (adet > 0),
    not_metni     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workshop_id, yil, ay, klasman_kodu)
);
CREATE INDEX IF NOT EXISTS paa_tenant_yil_idx ON plan_atolye_ay (tenant_id, yil);

-- Klasman × ay talep hedefi (tenant geneli).
CREATE TABLE IF NOT EXISTS plan_talep_ay (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    yil           INTEGER NOT NULL CHECK (yil BETWEEN 2020 AND 2100),
    ay            INTEGER NOT NULL CHECK (ay BETWEEN 1 AND 12),
    klasman_kodu  TEXT    NOT NULL,
    adet          INTEGER NOT NULL CHECK (adet >= 0),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, yil, ay, klasman_kodu)
);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['atolye_kapasite_ay', 'plan_atolye_ay', 'plan_talep_ay'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
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

REVOKE ALL ON atolye_kapasite_ay, plan_atolye_ay, plan_talep_ay FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON atolye_kapasite_ay, plan_atolye_ay, plan_talep_ay TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE atolye_kapasite_ay_id_seq, plan_atolye_ay_id_seq, plan_talep_ay_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;
