-- ============================================================
-- Migration 022d — Fiyat endeksi ve reel değer katmanı
-- ============================================================
--
-- SORUN:
--   Enflasyonist ortamda dönemler arası nominal karşılaştırma anlamsız.
--   2025-11'in 88.000 TL elektriği ile 2026-07'nin 140.000 TL'si
--   kıyaslanamaz: artışın ne kadarı gerçek tüketim/fiyat artışı,
--   ne kadarı para erimesi belli değil.
--
--   Dahası her kalem aynı şeyle deflate EDİLMEZ:
--     - işçilik   → asgari ücret / ücret endeksi
--     - enerji    → kur veya enerji ÜFE'si (doğalgaz dolara bağlı)
--     - genel     → TÜFE
--   Doğalgazı TÜFE ile deflate edersek kur sıçraması "gerçek maliyet
--   artışı" gibi görünür. Bu yüzden seri seçimi yapılandırılabilir.
--
-- ÇÖZÜM:
--   index_series           — seri kataloğu (TÜFE, ÜFE, USD/TRY, asgari ücret)
--   price_index            — seri × dönem değerleri
--   expense_group_index_map — hangi G-grubu hangi seriyle deflate edilir
--   v_expense_groups_real  — en güncel döneme indekslenmiş reel değerler
--
-- ⚠️ VERİ YOK — TABLO BOŞ BAŞLAR
--   Endeks değerleri bilerek seed edilmiyor. Uydurulmuş TÜFE/kur
--   rakamları tüm reel analizi sessizce bozardı. Değerler
--   /pes/endeks ekranından elle girilir (ya da sonradan TCMB/TÜİK
--   beslemesi eklenir). Endeks girilmemiş dönem için reel değer NULL
--   döner — yanlış sayı yerine "bilinmiyor".
-- ============================================================

BEGIN;

-- ============================================================
-- 1. SERİ KATALOĞU
-- ============================================================
CREATE TABLE IF NOT EXISTS index_series (
    code        TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('cpi','ppi','fx','wage','other')),
    unit        TEXT,
    description TEXT,
    sort_order  SMALLINT DEFAULT 0
);

COMMENT ON TABLE index_series IS 'Deflatör seri kataloğu. Global — tüm tenant''lar paylaşır, değerleri price_index''te.';

INSERT INTO index_series (code, label, kind, unit, description, sort_order) VALUES
    ('TUFE',     'TÜFE (Tüketici Fiyat Endeksi)', 'cpi',  'endeks', 'Genel enflasyon. Varsayılan deflatör.',            1),
    ('UFE',      'ÜFE (Üretici Fiyat Endeksi)',   'ppi',  'endeks', 'Girdi maliyetleri; sarf ve malzeme için uygun.',   2),
    ('USDTRY',   'USD/TRY Kuru',                  'fx',   'TL',     'Dolara bağlı kalemler (enerji, ithal girdi).',     3),
    ('ASGARI',   'Asgari Ücret',                  'wage', 'TL',     'İşçilik kalemleri için referans.',                 4)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. ENDEKS DEĞERLERİ
-- ============================================================
CREATE TABLE IF NOT EXISTS price_index (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID REFERENCES tenant(id) ON DELETE CASCADE,  -- NULL = global
    series_code TEXT NOT NULL REFERENCES index_series(code) ON DELETE CASCADE,
    donem       VARCHAR(20) NOT NULL,          -- 'YYYY-MM'
    value       NUMERIC(16,4) NOT NULL CHECK (value > 0),
    source      TEXT,                          -- 'TUIK', 'TCMB', 'manuel'
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, series_code, donem)
);

CREATE INDEX IF NOT EXISTS idx_price_index_lookup ON price_index(series_code, donem);
CREATE INDEX IF NOT EXISTS idx_price_index_tenant ON price_index(tenant_id);

COMMENT ON TABLE price_index IS 'Seri × dönem endeks değerleri. tenant_id NULL = global (herkes kullanır); tenant kendi satırıyla ezebilir. BOŞ BAŞLAR — değerler elle girilir.';

DROP TRIGGER IF EXISTS trg_price_index_updated ON price_index;
CREATE TRIGGER trg_price_index_updated
    BEFORE UPDATE ON price_index
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ============================================================
-- 3. GRUP → SERİ EŞLEŞTİRMESİ
-- ============================================================
CREATE TABLE IF NOT EXISTS expense_group_index_map (
    group_code  TEXT PRIMARY KEY,
    series_code TEXT NOT NULL REFERENCES index_series(code),
    rationale   TEXT
);

INSERT INTO expense_group_index_map (group_code, series_code, rationale) VALUES
    ('g1_iscilik',      'ASGARI', 'İşçilik maliyeti asgari ücrete endeksli hareket eder.'),
    ('g2_personel_yan', 'TUFE',   'Yemek/servis tüketici fiyatlarını izler.'),
    ('g3_enerji',       'USDTRY', 'Doğalgaz ve elektrik girdi maliyeti dövize bağlı.'),
    ('g4_mekan',        'TUFE',   'Kira ve bina genel enflasyonu izler.'),
    ('g5_makine',       'USDTRY', 'Makine ve yedek parça ağırlıklı ithal.'),
    ('g6_sarf',         'UFE',    'İplik/iğne/sarf üretici fiyatlarını izler.'),
    ('g7_dis_hizmet',   'TUFE',   'Hizmet kalemleri genel enflasyonu izler.'),
    ('g8_diger',        'TUFE',   'Sınıflandırılmamış — genel enflasyon.')
ON CONFLICT (group_code) DO NOTHING;

COMMENT ON TABLE expense_group_index_map IS 'Hangi gider grubu hangi seriyle deflate edilir. Varsayılanlar değiştirilebilir; doğalgazı TÜFE ile deflate etmek kur etkisini gerçek artış gibi gösterir.';

-- ============================================================
-- 4. ENDEKS ÇÖZÜMLEME YARDIMCISI
-- ============================================================
-- Bir seri için bir dönemin değerini döndürür (tenant ezmesi öncelikli).
CREATE OR REPLACE FUNCTION index_value(p_series TEXT, p_donem TEXT)
RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
    SELECT value FROM price_index
    WHERE series_code = p_series AND donem = p_donem
      AND (tenant_id = current_tenant_id() OR tenant_id IS NULL)
    ORDER BY tenant_id NULLS LAST   -- tenant'a özel satır global'i ezer
    LIMIT 1;
$$;

-- Bir serinin en güncel dönemi (reel değerlerin baz alınacağı nokta)
CREATE OR REPLACE FUNCTION index_latest_donem(p_series TEXT)
RETURNS TEXT
LANGUAGE sql STABLE AS $$
    SELECT max(donem) FROM price_index
    WHERE series_code = p_series
      AND (tenant_id = current_tenant_id() OR tenant_id IS NULL);
$$;

COMMENT ON FUNCTION index_value(TEXT, TEXT) IS 'Seri × dönem endeks değeri. Endeks girilmemişse NULL — çağıran taraf "bilinmiyor" göstermeli, 0 veya 1 varsaymamalı.';

-- Bir gider grubunun bir dönem için deflatör katsayısı.
--   katsayı = baz_dönem_endeksi / dönem_endeksi
-- Baz = o serinin en güncel dönemi, yani sonuç "bugünün parasıyla".
-- Endeks eksikse NULL döner; çarpım da NULL olur ve reel değer
-- "bilinmiyor" olarak görünür. Bilerek 1 döndürmüyoruz — 1 dönmek
-- "enflasyon yokmuş" demek olurdu ve sessizce yanlış sonuç üretirdi.
CREATE OR REPLACE FUNCTION deflator(p_group TEXT, p_donem TEXT)
RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
    SELECT CASE
             WHEN cur.v IS NULL OR base.v IS NULL OR cur.v = 0 THEN NULL
             ELSE base.v / cur.v
           END
    FROM expense_group_index_map m
    CROSS JOIN LATERAL (SELECT index_value(m.series_code, p_donem) AS v) cur
    CROSS JOIN LATERAL (SELECT index_value(m.series_code, index_latest_donem(m.series_code)) AS v) base
    WHERE m.group_code = p_group;
$$;

COMMENT ON FUNCTION deflator(TEXT, TEXT) IS 'Grubun dönem deflatörü (baz = serinin en güncel dönemi). Endeks eksikse NULL — asla 1 döndürmez.';

-- ============================================================
-- 5. REEL DEĞER VIEW
-- ============================================================
-- Her grup kendi serisiyle, o serinin EN GÜNCEL dönemine indekslenir.
-- reel = nominal × (baz_endeks / dönem_endeksi)
-- Endeks eksikse ilgili grup NULL döner (yanlış sayı üretmez).
CREATE OR REPLACE VIEW v_expense_groups_real AS
SELECT
    v.id,
    v.tenant_id,
    v.workshop_id,
    v.year,
    v.month,
    to_char(make_date(v.year, v.month, 1), 'YYYY-MM') AS donem,

    -- nominal değerler (referans için korunur)
    v.g1_iscilik, v.g2_personel_yan, v.g3_enerji, v.g4_mekan,
    v.g5_makine, v.g6_sarf, v.g7_dis_hizmet, v.g8_diger,
    v.toplam_brut, v.toplam_net,

    -- reel değerler
    v.g1_iscilik      * d.g1 AS g1_iscilik_real,
    v.g2_personel_yan * d.g2 AS g2_personel_yan_real,
    v.g3_enerji       * d.g3 AS g3_enerji_real,
    v.g4_mekan        * d.g4 AS g4_mekan_real,
    v.g5_makine       * d.g5 AS g5_makine_real,
    v.g6_sarf         * d.g6 AS g6_sarf_real,
    v.g7_dis_hizmet   * d.g7 AS g7_dis_hizmet_real,
    v.g8_diger        * d.g8 AS g8_diger_real,

    -- Toplam reel: her grup kendi deflatörüyle düzeltilip toplanır.
    -- Herhangi bir grubun deflatörü eksikse toplam NULL olur —
    -- kısmen düzeltilmiş bir toplam yanıltıcı olurdu.
    (v.g1_iscilik * d.g1 + v.g2_personel_yan * d.g2 + v.g3_enerji * d.g3
     + v.g4_mekan * d.g4 + v.g5_makine * d.g5 + v.g6_sarf * d.g6
     + v.g7_dis_hizmet * d.g7 + v.g8_diger * d.g8)      AS toplam_brut_real,

    d.eksik_seri
FROM v_expense_groups v
CROSS JOIN LATERAL (
    SELECT
        deflator('g1_iscilik',      dn) AS g1,
        deflator('g2_personel_yan', dn) AS g2,
        deflator('g3_enerji',       dn) AS g3,
        deflator('g4_mekan',        dn) AS g4,
        deflator('g5_makine',       dn) AS g5,
        deflator('g6_sarf',         dn) AS g6,
        deflator('g7_dis_hizmet',   dn) AS g7,
        deflator('g8_diger',        dn) AS g8,
        (SELECT string_agg(DISTINCT m.series_code, ', ')
         FROM expense_group_index_map m
         WHERE index_value(m.series_code, dn) IS NULL
            OR index_latest_donem(m.series_code) IS NULL) AS eksik_seri
    FROM (SELECT to_char(make_date(v.year, v.month, 1), 'YYYY-MM') AS dn) x
) d;

COMMENT ON VIEW v_expense_groups_real IS 'Gider grupları hem nominal hem reel. Reel = grubun kendi serisiyle, serinin en güncel dönemine indekslenmiş. Endeks eksikse NULL + eksik_seri dolu.';

-- ============================================================
-- 6. RLS
-- ============================================================
-- index_series ve expense_group_index_map global katalog: herkes okur,
-- yalnız internal admin yazar (019b'nin master_process deseni).
ALTER TABLE index_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE index_series FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS index_series_read ON index_series;
CREATE POLICY index_series_read ON index_series
    FOR SELECT USING (current_tenant_id() IS NOT NULL OR is_internal_admin());
DROP POLICY IF EXISTS index_series_write ON index_series;
CREATE POLICY index_series_write ON index_series
    FOR ALL USING (is_internal_admin()) WITH CHECK (is_internal_admin());

ALTER TABLE expense_group_index_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_group_index_map FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS egim_read ON expense_group_index_map;
CREATE POLICY egim_read ON expense_group_index_map
    FOR SELECT USING (current_tenant_id() IS NOT NULL OR is_internal_admin());
DROP POLICY IF EXISTS egim_write ON expense_group_index_map;
CREATE POLICY egim_write ON expense_group_index_map
    FOR ALL USING (is_internal_admin()) WITH CHECK (is_internal_admin());

-- price_index hibrit: global seri + tenant ezmesi
ALTER TABLE price_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_index FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_index_hybrid_read ON price_index;
CREATE POLICY price_index_hybrid_read ON price_index
    FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id() OR is_internal_admin());
DROP POLICY IF EXISTS price_index_tenant_insert ON price_index;
CREATE POLICY price_index_tenant_insert ON price_index
    FOR INSERT WITH CHECK (tenant_id = current_tenant_id() OR is_internal_admin());
DROP POLICY IF EXISTS price_index_tenant_update ON price_index;
CREATE POLICY price_index_tenant_update ON price_index
    FOR UPDATE USING (tenant_id = current_tenant_id() OR is_internal_admin());
DROP POLICY IF EXISTS price_index_tenant_delete ON price_index;
CREATE POLICY price_index_tenant_delete ON price_index
    FOR DELETE USING (tenant_id = current_tenant_id() OR is_internal_admin());

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA (manuel)
-- ============================================================
-- 1. SELECT count(*) FROM index_series;             -- 4
-- 2. SELECT count(*) FROM price_index;              -- 0 (bilerek boş)
-- 3. SELECT donem, toplam_brut, toplam_brut_real, eksik_seri
--    FROM v_expense_groups_real LIMIT 3;
--    -- endeks girilmeden: real NULL, eksik_seri dolu
-- 4. Endeks girdikten sonra aynı sorgu reel değer döndürmeli.
