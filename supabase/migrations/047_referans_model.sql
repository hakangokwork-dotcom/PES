-- ============================================================
-- Migration 047 — Referans model parça süreleri
-- ============================================================
--
-- NE EKLİYOR:
--   ref_parca_sure — (ürün tipi, bölge, ek parça) başına görülme sayısı ve
--   görünüm süresi medyanı. Ham MTM dosyasından türetilir:
--   scripts/import_referans_model.mjs. Hesap: lib/pes/referans-model.ts.
--
-- NEDEN YENİ TABLO: ref_operasyon_zamani tekrarları medyanla birleştirmiş
--   ve 3.805 tam tekrar satırı atmış; "bu parça kaç modelde vardı" bilgisi
--   orada yok. Ortalama model bu sayıya dayanır.
--
-- GÖRÜNÜRLÜK: diğer ref_* tabloları gibi GLOBAL KATALOG (tenant_id yok),
--   028'in katalog politikası. Referans FİYAT ise yalnız merkez ekranında
--   hesaplanır (/pes/model/referans); API atölye oturumunu 403 ile keser.
--
-- ROLLBACK: DROP TABLE ref_parca_sure;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ref_parca_sure (
    id                   SERIAL PRIMARY KEY,
    urun_tipi_id         INTEGER NOT NULL REFERENCES ref_urun_tipi(id),
    bolge                VARCHAR(100) NOT NULL,
    ek_parca_ad          VARCHAR(400) NOT NULL,
    ek_parca_varyant_id  INTEGER REFERENCES ref_ek_parca_varyant(id),
    gorulme              INTEGER NOT NULL CHECK (gorulme > 0),
    sn_medyan            NUMERIC(10,3) NOT NULL,
    sn_min               NUMERIC(10,3) NOT NULL,
    sn_max               NUMERIC(10,3) NOT NULL,
    op_sayisi            INTEGER NOT NULL,
    son_guncelleme       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (urun_tipi_id, bolge, ek_parca_ad)
);

COMMENT ON TABLE ref_parca_sure IS
'Ham MTM dosyasında bir modelin bir parçası ardışık satırlardır (görünüm). gorulme = görünüm sayısı (yaygınlık), sn_medyan = görünüm toplamlarının medyanı. Ortalama model: lib/pes/referans-model.ts#bolgeSureleri.';

CREATE INDEX IF NOT EXISTS idx_rps_urun ON ref_parca_sure(urun_tipi_id);

ALTER TABLE ref_parca_sure ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_parca_sure FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ref_parca_sure_katalog_oku ON ref_parca_sure;
CREATE POLICY ref_parca_sure_katalog_oku ON ref_parca_sure FOR SELECT
    USING (current_tenant_id() IS NOT NULL OR is_internal_admin());

-- Yazma yalnız import betiğiyle (DATABASE_URL). Uygulama okur.
REVOKE ALL ON ref_parca_sure FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT ON ref_parca_sure TO pes_app';
    END IF;
END $$;

COMMIT;
