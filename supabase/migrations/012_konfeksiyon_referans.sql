-- ============================================================
-- 012: Konfeksiyon Operasyon Referans Kutuphanesi
-- 7 tablo, 30K+ MTM referans kaydi
-- ============================================================

CREATE TABLE IF NOT EXISTS ref_urun_tipi (
    id           SERIAL PRIMARY KEY,
    klasman_ad   VARCHAR(200) NOT NULL UNIQUE,
    segment      VARCHAR(20),
    kumas_grubu  VARCHAR(30),
    urun_grubu   VARCHAR(30),
    kol_tipi     VARCHAR(20),
    ozellik      VARCHAR(20),
    aktif        BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_urun_segment ON ref_urun_tipi(segment);
CREATE INDEX IF NOT EXISTS idx_ref_urun_grubu ON ref_urun_tipi(urun_grubu);

CREATE TABLE IF NOT EXISTS ref_ek_parca_tipi (
    id        SERIAL PRIMARY KEY,
    ad        VARCHAR(200) NOT NULL UNIQUE,
    aktif     BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ref_ek_parca_varyant (
    id                 SERIAL PRIMARY KEY,
    ek_parca_tipi_id   INTEGER NOT NULL REFERENCES ref_ek_parca_tipi(id),
    tam_ad             VARCHAR(400) NOT NULL UNIQUE,
    ozellikler         TEXT,
    aktif              BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_ref_varyant_tipi ON ref_ek_parca_varyant(ek_parca_tipi_id);

CREATE TABLE IF NOT EXISTS ref_operasyon_grup (
    id     SERIAL PRIMARY KEY,
    ad     VARCHAR(200) NOT NULL UNIQUE,
    aktif  BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ref_makine_tipi (
    id         SERIAL PRIMARY KEY,
    ad         VARCHAR(100) NOT NULL UNIQUE,
    aciklama   TEXT,
    aktif      BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ref_operasyon (
    id              SERIAL PRIMARY KEY,
    ad              VARCHAR(200) NOT NULL UNIQUE,
    makine_tipi_id  INTEGER REFERENCES ref_makine_tipi(id),
    skill_level     VARCHAR(20),
    setup_suresi    NUMERIC(8,2),
    aciklama        TEXT,
    aktif           BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_ref_op_makine ON ref_operasyon(makine_tipi_id);

CREATE TABLE IF NOT EXISTS ref_operasyon_zamani (
    id                     SERIAL PRIMARY KEY,
    urun_tipi_id           INTEGER NOT NULL REFERENCES ref_urun_tipi(id),
    ek_parca_varyant_id    INTEGER NOT NULL REFERENCES ref_ek_parca_varyant(id),
    operasyon_grup_id      INTEGER NOT NULL REFERENCES ref_operasyon_grup(id),
    operasyon_id           INTEGER NOT NULL REFERENCES ref_operasyon(id),
    mtm                    NUMERIC(10,3) NOT NULL,
    mtm_min                NUMERIC(10,3),
    mtm_max                NUMERIC(10,3),
    mtm_ortalama           NUMERIC(10,3),
    mtm_std                NUMERIC(10,3),
    orneklem               INTEGER DEFAULT 1,
    varyasyon_yuzde        NUMERIC(6,2),
    guven_seviyesi         VARCHAR(20),
    son_guncelleme         TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (urun_tipi_id, ek_parca_varyant_id, operasyon_grup_id, operasyon_id)
);
CREATE INDEX IF NOT EXISTS idx_ref_oz_urun ON ref_operasyon_zamani(urun_tipi_id);
CREATE INDEX IF NOT EXISTS idx_ref_oz_varyant ON ref_operasyon_zamani(ek_parca_varyant_id);
CREATE INDEX IF NOT EXISTS idx_ref_oz_op ON ref_operasyon_zamani(operasyon_id);
CREATE INDEX IF NOT EXISTS idx_ref_oz_guven ON ref_operasyon_zamani(guven_seviyesi);
