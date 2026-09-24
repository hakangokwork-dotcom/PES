-- ============================================================
-- Migration 039 — Model fiyatlama
-- ============================================================
--
-- Kaynak tasarım: docs/superpowers/specs/2026-09-24-model-fiyatlama-e3-design.md
-- Uygulama planı:  docs/superpowers/plans/2026-09-24-model-fiyatlama-e3.md
--
-- NE EKLİYOR:
--   1. model_bulten            — teorik operasyon bülteni (atölyeden bağımsız)
--   2. model_bulten_operasyon  — bültenin satırları + bölüm
--   3. bulten_bolum_kurali     — (seviye1, tip) → bölüm, düzenlenebilir
--   4. model_fiyat             — model × atölye × dönem, HESAPLANIP SAKLANIR
--   5. model_gercek_sure       — üretimden türetilen + atölye beyanı
--   6. work_order.model_bulten_id
--
-- NE EKLEMİYOR:
--   ref_* tabloları (012'de kurulu, bu turda yalnız veriyle dolduruluyor).
--   eder_* modülü — dokunulmuyor, akıbeti ayrı karar.
--
-- GÖRÜNÜRLÜK: beş yeni tablo İÇ EKİP verisi. 035'in "OR workshop_id IS NULL"
--   kalıbı BİLEREK yok; o kalıp NULL satırı her atölyeye açıyor (bkz. 037, 038).
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. model_bulten ----------
CREATE TABLE IF NOT EXISTS model_bulten (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    model_adi     VARCHAR(200) NOT NULL,
    plm_id        VARCHAR(50),
    kumas_tipi    VARCHAR(200),
    sezon         VARCHAR(20),
    siparis_adedi INTEGER,
    klasman_kodu  VARCHAR(50),
    kaynak_dosya  TEXT,
    toplam_sn     NUMERIC(10,2),
    not_metni     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE model_bulten IS
'Teorik operasyon bülteni. ATÖLYE VE DÖNEM YOK: bülten modelin standart akışıdır, atölye/dönem model_fiyat''ta. Fiyatlama bunu kullanır (kullanıcı: "fiyatlamalar genelde teorik olan ile yapılmaktadır").';
COMMENT ON COLUMN model_bulten.klasman_kodu IS
'capability_value.code. Klasman kârlılığının anahtarı — E0''da atölye seviyesinde cevaplanamayan soru buradan çözülür.';
COMMENT ON COLUMN model_bulten.toplam_sn IS
'Operasyon satırlarının toplamı. Türetilmiş; satır yazıldıkça güncellenir.';

CREATE INDEX IF NOT EXISTS idx_mb_tenant  ON model_bulten(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mb_plm     ON model_bulten(plm_id);
CREATE INDEX IF NOT EXISTS idx_mb_klasman ON model_bulten(klasman_kodu);

DROP TRIGGER IF EXISTS trg_mb_updated ON model_bulten;
CREATE TRIGGER trg_mb_updated BEFORE UPDATE ON model_bulten
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 2. model_bulten_operasyon ----------
CREATE TABLE IF NOT EXISTS model_bulten_operasyon (
    id            SERIAL PRIMARY KEY,
    bulten_id     INTEGER NOT NULL REFERENCES model_bulten(id) ON DELETE CASCADE,
    tenant_id     UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    sira_no       INTEGER NOT NULL,
    seviye1       VARCHAR(200),
    seviye2       VARCHAR(200),
    seviye3       VARCHAR(200),
    cevrim_sn     NUMERIC(8,2) NOT NULL CHECK (cevrim_sn >= 0),
    tip           VARCHAR(50),
    makine_kodu   VARCHAR(50),
    oncesi        VARCHAR(200),
    bolum         VARCHAR(10) NOT NULL,
    bolum_kaynak  VARCHAR(10) NOT NULL DEFAULT 'kural',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bulten_id, sira_no),
    CONSTRAINT mbo_bolum_chk  CHECK (bolum IN ('KESIM','DIKIM','UKP')),
    CONSTRAINT mbo_kaynak_chk CHECK (bolum_kaynak IN ('kural','elle'))
);

COMMENT ON COLUMN model_bulten_operasyon.bolum_kaynak IS
'kural = eşleme kuralından geldi | elle = kullanıcı ezdi. Ezilen satır kural yeniden uygulandığında KORUNUR.';
COMMENT ON COLUMN model_bulten_operasyon.oncesi IS
'Öncelik bağı. Bu turda saklanıyor, kullanılmıyor — örnek dosyada 70 satırın yalnız 6''sında dolu, akış analizine yetmiyor.';

CREATE INDEX IF NOT EXISTS idx_mbo_bulten ON model_bulten_operasyon(bulten_id, sira_no);
CREATE INDEX IF NOT EXISTS idx_mbo_tenant ON model_bulten_operasyon(tenant_id);

-- ---------- 3. bulten_bolum_kurali ----------
CREATE TABLE IF NOT EXISTS bulten_bolum_kurali (
    id         SERIAL PRIMARY KEY,
    tenant_id  UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    oncelik    INTEGER NOT NULL,
    seviye1    VARCHAR(200),
    tip        VARCHAR(50),
    bolum      VARCHAR(10) NOT NULL,
    aciklama   TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT bbk_bolum_chk CHECK (bolum IN ('KESIM','DIKIM','UKP'))
);

COMMENT ON TABLE bulten_bolum_kurali IS
'(seviye1, tip) → bölüm. NULL = herhangi. Küçük öncelik önce; ilk eşleşen kazanır. Tip kuralları aşama kurallarından ÖNCE gelmeli: "Son İşlem" karışıktır ve paça kıvırma/punteriz dikimdir.';

CREATE INDEX IF NOT EXISTS idx_bbk_tenant ON bulten_bolum_kurali(tenant_id, oncelik);

-- ---------- 4. model_fiyat ----------
CREATE TABLE IF NOT EXISTS model_fiyat (
    id             SERIAL PRIMARY KEY,
    bulten_id      INTEGER NOT NULL REFERENCES model_bulten(id) ON DELETE CASCADE,
    workshop_id    INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id      UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    donem          VARCHAR(7) NOT NULL,
    kesim_dk       NUMERIC(10,4),
    dikim_dk       NUMERIC(10,4),
    ukp_dk         NUMERIC(10,4),
    kesim_tl       NUMERIC(12,4),
    dikim_tl       NUMERIC(12,4),
    ukp_tl         NUMERIC(12,4),
    toplam_maliyet NUMERIC(12,4),
    adil_fiyat     NUMERIC(12,4),
    cmt_fiyat      NUMERIC(12,2),
    kar_adet       NUMERIC(12,4),
    marj           NUMERIC(8,6),
    gunluk_adet    INTEGER,
    kapasite_payi  NUMERIC(8,4),
    referans_3d    NUMERIC(12,4),
    cmt_3d_sapma   NUMERIC(8,6),
    param_donem    VARCHAR(7),
    hesaplandi_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bulten_id, workshop_id, donem),
    CONSTRAINT mf_donem_chk CHECK (donem ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON TABLE model_fiyat IS
'Hesaplanmış fiyat, SAKLANIR. Fiyat bir karar anıdır: üç ay sonra "bu fiyatı neye göre verdik" sorusunun cevabı, o günkü parametre ve dakika maliyetiyle birlikte durmalı.';
COMMENT ON COLUMN model_fiyat.param_donem IS
'Hesapta kullanılan economy_param dönemi. Parametre değişince eski fiyat yeniden hesaplanmaz; hangi varsayımla verildiği burada kalır.';

CREATE INDEX IF NOT EXISTS idx_mf_tenant ON model_fiyat(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mf_bulten ON model_fiyat(bulten_id, donem);

-- ---------- 5. model_gercek_sure ----------
CREATE TABLE IF NOT EXISTS model_gercek_sure (
    id           SERIAL PRIMARY KEY,
    bulten_id    INTEGER NOT NULL REFERENCES model_bulten(id) ON DELETE CASCADE,
    workshop_id  INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id    UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    donem        VARCHAR(7) NOT NULL,
    kaynak       VARCHAR(10) NOT NULL,
    dk_adet      NUMERIC(10,4),
    gun_sayisi   INTEGER,
    atlanan_gun  INTEGER NOT NULL DEFAULT 0,
    not_metni    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bulten_id, workshop_id, donem, kaynak),
    CONSTRAINT mgs_kaynak_chk CHECK (kaynak IN ('uretim','beyan')),
    CONSTRAINT mgs_donem_chk  CHECK (donem ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON COLUMN model_gercek_sure.atlanan_gun IS
'Bir bant aynı gün birden fazla iş emri işlediyse o gün paylaştırılamaz ve türetmeye girmez. Uydurulmuş bir dakika fiyat pazarlığında yanlış tarafa çeker.';

CREATE INDEX IF NOT EXISTS idx_mgs_tenant ON model_gercek_sure(tenant_id);

DROP TRIGGER IF EXISTS trg_mgs_updated ON model_gercek_sure;
CREATE TRIGGER trg_mgs_updated BEFORE UPDATE ON model_gercek_sure
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 6. work_order bağı ----------
ALTER TABLE work_order
    ADD COLUMN IF NOT EXISTS model_bulten_id INTEGER REFERENCES model_bulten(id) ON DELETE SET NULL;

COMMENT ON COLUMN work_order.model_bulten_id IS
'Teorik bülten bağı. Bugün model serbest metin (model_adi, stil_kodu); bülten bağlanmadan üretimden gerçek süre türetilemez. Geçmiş iş emirlerinde NULL kalır.';

CREATE INDEX IF NOT EXISTS idx_wo_bulten ON work_order(model_bulten_id)
    WHERE model_bulten_id IS NOT NULL;

-- ---------- 7. RLS ----------
-- Beş tablo da İÇ EKİP verisi. Atölye oturumunda current_workshop_id()
-- dolu olur; bu şart onu tamamen dışarıda tutar.
-- 035'in "OR workshop_id IS NULL" kalıbı BİLEREK yok.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['model_bulten','model_bulten_operasyon',
                             'bulten_bolum_kurali','model_fiyat','model_gercek_sure'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND current_workshop_id() IS NULL)',
            t || '_tenant_isolation', t);
    END LOOP;
END $$;

REVOKE ALL ON model_bulten, model_bulten_operasyon, bulten_bolum_kurali,
              model_fiyat, model_gercek_sure FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON
                 model_bulten, model_bulten_operasyon, bulten_bolum_kurali,
                 model_fiyat, model_gercek_sure TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE
                 model_bulten_id_seq, model_bulten_operasyon_id_seq,
                 bulten_bolum_kurali_id_seq, model_fiyat_id_seq,
                 model_gercek_sure_id_seq TO pes_app';
    END IF;
END $$;

-- ---------- 8. Tohum kurallar ----------
-- lib/pes/bulten-bolum.ts TOHUM_KURALLAR ile birebir. Sıra kritik:
-- tip kuralları (30-36) "Son İşlem → UKP" kuralından (40) ÖNCE gelir.
INSERT INTO bulten_bolum_kurali (tenant_id, oncelik, seviye1, tip, bolum, aciklama)
SELECT t.id, k.oncelik, k.seviye1, k.tip, k.bolum, k.aciklama
FROM tenant t
CROSS JOIN (VALUES
    (10, 'Kesim',      NULL,             'KESIM', 'Kesim aşamasının tamamı'),
    (20, NULL,         'Serme',          'KESIM', 'Serme her aşamada kesim'),
    (21, NULL,         'Kesim',          'KESIM', 'Kesim tipi her aşamada kesim'),
    (30, NULL,         'Düz Dikiş',      'DIKIM', 'Dikiş makinesi'),
    (31, NULL,         'Overlok',        'DIKIM', 'Dikiş makinesi'),
    (32, NULL,         'Punteriz',       'DIKIM', 'Dikiş makinesi'),
    (33, NULL,         'Çift İğne',      'DIKIM', 'Dikiş makinesi'),
    (34, NULL,         'Zincir (FOA)',   'DIKIM', 'Dikiş makinesi'),
    (35, NULL,         'Zincir Dikiş',   'DIKIM', 'Dikiş makinesi'),
    (36, NULL,         'Kemer (Kansai)', 'DIKIM', 'Dikiş makinesi'),
    (40, 'Son İşlem',  NULL,             'UKP',   'Son işlemde dikiş dışı kalanlar'),
    (99, NULL,         NULL,             'DIKIM', 'Tanınmayan operasyon; import raporu bunları sayar')
) AS k(oncelik, seviye1, tip, bolum, aciklama)
WHERE NOT EXISTS (
    SELECT 1 FROM bulten_bolum_kurali b
    WHERE b.tenant_id = t.id AND b.oncelik = k.oncelik);

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT count(*) FROM bulten_bolum_kurali;   -- → tenant sayısı × 12
--
-- Atölye kullanıcısı görememeli:
--   SET LOCAL pes.workshop_id = '1';
--   SELECT count(*) FROM model_bulten;        -- → 0
--
-- node scripts/verify_public_api.mjs
-- node scripts/verify_workshop_isolation.mjs
--
-- ROLLBACK:
--   BEGIN;
--   ALTER TABLE work_order DROP COLUMN IF EXISTS model_bulten_id;
--   DROP TABLE IF EXISTS model_gercek_sure;
--   DROP TABLE IF EXISTS model_fiyat;
--   DROP TABLE IF EXISTS model_bulten_operasyon;
--   DROP TABLE IF EXISTS bulten_bolum_kurali;
--   DROP TABLE IF EXISTS model_bulten;
--   COMMIT;
