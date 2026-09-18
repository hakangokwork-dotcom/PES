-- ============================================================
-- Migration 037 — Atölye ekonomi veri omurgası
-- ============================================================
--
-- Kaynak tasarım: docs/superpowers/specs/2026-09-15-atolye-ekonomi-e0-design.md
-- Uygulama planı:  docs/superpowers/plans/2026-09-15-atolye-ekonomi-e0.md
-- Veri kaynağı:    Atolye_Gider_Model.xlsx
--
-- NE EKLİYOR:
--   1. monthly_expense'e iki kalem — ukp_consumables, vehicle_depr
--   2. workshop_economy   — giderde olmayan aylık alanlar (ciro, adet, gün, kadro)
--   3. economy_param      — dönem versiyonlu 16 model parametresi
--   4. economy_survey_staging — ham anket satırı (izlenebilirlik)
--
-- NE EKLEMİYOR:
--   Bölge 3D dakika maliyeti. Mevcut dk_maliyet (007) tablosundan okunur;
--   Excel'in PARAMETRE!D32:D37 bloğu onun kopyasıdır ve ikiye ayrılmamalı.
--
-- GÖRÜNÜRLÜK: Bu üç tablo İÇ EKİP içindir. Atölye kullanıcısı (033) hiçbirini
--   göremez — politikalar current_workshop_id() IS NULL şartıyla bunu zorlar.
--   035'teki "OR workshop_id IS NULL" kalıbı BİLEREK kullanılmadı: o kalıp
--   NULL yazılan satırı bütün atölyelere açıyor.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. monthly_expense: iki eksik kalem ----------
-- Excel'in 26 gider satırının 24'ü zaten karşılanıyor. Kalan ikisi:
ALTER TABLE monthly_expense
    ADD COLUMN IF NOT EXISTS ukp_consumables NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS vehicle_depr    NUMERIC(14,2);

COMMENT ON COLUMN monthly_expense.ukp_consumables IS
'UKP (ütü-kontrol-paket) sarfı. consumables''tan ayrı: ikisi birlikte yazılırsa UKP bölümünün dakika maliyeti hesaplanamaz.';
COMMENT ON COLUMN monthly_expense.vehicle_depr IS
'Taşıt / demirbaş amortismanı. vehicle''dan ayrı: o yakıt ve bakım yani nakit gider, bu amortisman.';

-- ---------- 2. workshop_economy ----------
CREATE TABLE IF NOT EXISTS workshop_economy (
    id                SERIAL PRIMARY KEY,
    workshop_id       INTEGER  NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id         UUID     NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
    year              SMALLINT NOT NULL,
    month             SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),

    -- Ciro: boş gün düzeltmesi ÖNCESİ. Düzeltme hesap katmanında yapılır ki
    -- parametre değişince geçmiş veri yeniden yazılmak zorunda kalmasın.
    revenue_declared  NUMERIC(16,2),
    idle_days         NUMERIC(5,2),
    qty_declared      INTEGER,

    nominal_days      NUMERIC(5,2),
    actual_days       NUMERIC(5,2),
    hours_per_day     NUMERIC(4,1),

    -- O AYA ait kadro. workshop tablosundaki kadro bugünkü durumdur ve
    -- güncellenince geçmişi siler; ekonomi geriye dönük hesaplandığı için
    -- ayın kendi kadrosu burada durmalı.
    cutting_staff     SMALLINT,
    sewing_staff      SMALLINT,
    ukp_staff         SMALLINT,
    office_staff      SMALLINT,

    area_m2           INTEGER,

    source            TEXT     NOT NULL DEFAULT 'elle',
    survey_id         INTEGER,
    note              TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (workshop_id, year, month),
    CONSTRAINT we_source_chk CHECK (source IN ('anket','elle','turetilmis')),
    CONSTRAINT we_year_chk   CHECK (year BETWEEN 2000 AND 2100),
    -- Türetilmiş satır kaynağını göstermek zorunda; aksi halde birkaç ay
    -- içinde hangi ayın gerçek hangisinin atıf olduğu kaybolur.
    CONSTRAINT we_turetilmis_kaynakli CHECK (source <> 'turetilmis' OR survey_id IS NOT NULL)
);

COMMENT ON TABLE workshop_economy IS
'Atölye aylık ekonomi satırı: giderde olmayan alanlar. monthly_expense ile aynı anahtar. İÇ EKİP verisi — atölye kullanıcısı göremez.';
COMMENT ON COLUMN workshop_economy.source IS
'anket = beyandan tek aya geldi | elle = iç ekip girdi | turetilmis = çok aylı anketten bölündü, gerçek ölçüm değil';

CREATE INDEX IF NOT EXISTS idx_we_tenant   ON workshop_economy(tenant_id);
CREATE INDEX IF NOT EXISTS idx_we_donem    ON workshop_economy(year, month);
CREATE INDEX IF NOT EXISTS idx_we_workshop ON workshop_economy(workshop_id, year, month);

DROP TRIGGER IF EXISTS trg_we_updated ON workshop_economy;
CREATE TRIGGER trg_we_updated BEFORE UPDATE ON workshop_economy
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 3. economy_param ----------
CREATE TABLE IF NOT EXISTS economy_param (
    donem       VARCHAR(7) NOT NULL,          -- 'YYYY-MM'
    param_key   TEXT       NOT NULL,
    param_value NUMERIC(14,4) NOT NULL,
    tenant_id   UUID       NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, donem, param_key),
    CONSTRAINT ep_donem_chk CHECK (donem ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON TABLE economy_param IS
'Ekonomi modelinin dönem versiyonlu parametreleri (Atolye_Gider_Model.xlsx PARAMETRE sayfası). Bir ay hesaplanırken o aydan küçük veya eşit en yakın dönem kullanılır; asgari ücret değişince geçmiş bozulmaz.';

DROP TRIGGER IF EXISTS trg_ep_updated ON economy_param;
CREATE TRIGGER trg_ep_updated BEFORE UPDATE ON economy_param
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 4. economy_survey_staging ----------
CREATE TABLE IF NOT EXISTS economy_survey_staging (
    id                SERIAL PRIMARY KEY,
    tenant_id         UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    raw               JSONB NOT NULL,
    workshop_name_raw TEXT,
    workshop_id       INTEGER REFERENCES workshop(id) ON DELETE SET NULL,
    match_status      TEXT NOT NULL DEFAULT 'eslesmedi',
    period_start      VARCHAR(7),                       -- 'YYYY-MM'
    period_months     SMALLINT NOT NULL DEFAULT 1,
    promoted_at       TIMESTAMPTZ,
    note              TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ess_match_chk CHECK (match_status IN ('kesin','inceleme','eslesmedi')),
    CONSTRAINT ess_months_chk CHECK (period_months BETWEEN 1 AND 24),
    CONSTRAINT ess_donem_chk CHECK (period_start IS NULL OR period_start ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON TABLE economy_survey_staging IS
'Ham gider anketi satırı, dokunulmadan. Aylara bölme izi burada kalır; yanlış bölünen anket geri alınıp yeniden bölünebilir.';
COMMENT ON COLUMN economy_survey_staging.period_start IS
'Anketin kapsadığı ilk ay. Excel VERI_GIRIS kaç ay olduğunu söylüyor ama hangi aydan başladığını söylemiyor — import sırasında elle verilir, tahmin edilmez.';

CREATE INDEX IF NOT EXISTS idx_ess_tenant  ON economy_survey_staging(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ess_status  ON economy_survey_staging(match_status)
    WHERE promoted_at IS NULL;

ALTER TABLE workshop_economy
    DROP CONSTRAINT IF EXISTS we_survey_fk;
ALTER TABLE workshop_economy
    ADD CONSTRAINT we_survey_fk FOREIGN KEY (survey_id)
    REFERENCES economy_survey_staging(id) ON DELETE SET NULL;

-- ---------- 4b. v_expense_groups — iki yeni kalem ----------
-- 021'deki görünüm kolonları tek tek sayıyor. Yeni kalemler eklenmezse
-- gider panosunun toplamı sessizce eksik kalır:
--   ukp_consumables → G6 üretim sarf (UKP sarfı bir sarf kalemidir)
--   vehicle_depr    → G5 makine ve bakım (amortisman, nakit gider değil;
--                      vehicle yakıt/bakım olarak G7'de kalır)
-- Doluluk paydası 27 → 29.
CREATE OR REPLACE VIEW v_expense_groups AS
SELECT
    me.id,
    me.tenant_id,
    me.workshop_id,
    me.year,
    me.month,
    me.work_days,

    COALESCE(me.personnel,0) + COALESCE(me.sgk,0) + COALESCE(me.overtime,0)
      + COALESCE(me.bonus,0) + COALESCE(me.severance_reserve,0)            AS g1_iscilik,

    COALESCE(me.food,0) + COALESCE(me.transport,0)                          AS g2_personel_yan,

    COALESCE(me.electricity,0) + COALESCE(me.water,0) + COALESCE(me.gas,0)  AS g3_enerji,

    COALESCE(me.rent,0) + COALESCE(me.building_depr,0)                      AS g4_mekan,

    COALESCE(me.machine_depr,0) + COALESCE(me.machine_maint,0)
      + COALESCE(me.vehicle_depr,0)                                         AS g5_makine,

    COALESCE(me.thread,0) + COALESCE(me.needle,0)
      + COALESCE(me.consumables,0) + COALESCE(me.ukp_consumables,0)         AS g6_sarf,

    COALESCE(me.insurance,0) + COALESCE(me.isg,0) + COALESCE(me.consulting,0)
      + COALESCE(me.official_fees,0) + COALESCE(me.communication,0)
      + COALESCE(me.stationery,0) + COALESCE(me.cargo,0)
      + COALESCE(me.vehicle,0)                                              AS g7_dis_hizmet,

    COALESCE(me.other,0)                                                    AS g8_diger,

    COALESCE(me.personnel,0) + COALESCE(me.sgk,0) + COALESCE(me.overtime,0)
      + COALESCE(me.bonus,0) + COALESCE(me.severance_reserve,0)
      + COALESCE(me.food,0) + COALESCE(me.transport,0)
      + COALESCE(me.electricity,0) + COALESCE(me.water,0) + COALESCE(me.gas,0)
      + COALESCE(me.rent,0) + COALESCE(me.building_depr,0)
      + COALESCE(me.machine_depr,0) + COALESCE(me.machine_maint,0)
      + COALESCE(me.vehicle_depr,0)
      + COALESCE(me.thread,0) + COALESCE(me.needle,0) + COALESCE(me.consumables,0)
      + COALESCE(me.ukp_consumables,0)
      + COALESCE(me.insurance,0) + COALESCE(me.isg,0) + COALESCE(me.consulting,0)
      + COALESCE(me.official_fees,0) + COALESCE(me.communication,0)
      + COALESCE(me.stationery,0) + COALESCE(me.cargo,0) + COALESCE(me.vehicle,0)
      + COALESCE(me.other,0)                                                AS toplam_brut,

    COALESCE(me.incentive_amount,0)                                         AS tesvik,
    COALESCE(me.personnel,0) + COALESCE(me.sgk,0) + COALESCE(me.overtime,0)
      + COALESCE(me.bonus,0) + COALESCE(me.severance_reserve,0)
      + COALESCE(me.food,0) + COALESCE(me.transport,0)
      + COALESCE(me.electricity,0) + COALESCE(me.water,0) + COALESCE(me.gas,0)
      + COALESCE(me.rent,0) + COALESCE(me.building_depr,0)
      + COALESCE(me.machine_depr,0) + COALESCE(me.machine_maint,0)
      + COALESCE(me.vehicle_depr,0)
      + COALESCE(me.thread,0) + COALESCE(me.needle,0) + COALESCE(me.consumables,0)
      + COALESCE(me.ukp_consumables,0)
      + COALESCE(me.insurance,0) + COALESCE(me.isg,0) + COALESCE(me.consulting,0)
      + COALESCE(me.official_fees,0) + COALESCE(me.communication,0)
      + COALESCE(me.stationery,0) + COALESCE(me.cargo,0) + COALESCE(me.vehicle,0)
      + COALESCE(me.other,0)
      - COALESCE(me.incentive_amount,0)                                     AS toplam_net,

    (
      (me.personnel IS NOT NULL)::int + (me.sgk IS NOT NULL)::int
    + (me.food IS NOT NULL)::int + (me.electricity IS NOT NULL)::int
    + (me.water IS NOT NULL)::int + (me.gas IS NOT NULL)::int
    + (me.transport IS NOT NULL)::int + (me.vehicle IS NOT NULL)::int
    + (me.cargo IS NOT NULL)::int + (me.machine_maint IS NOT NULL)::int
    + (me.thread IS NOT NULL)::int + (me.other IS NOT NULL)::int
    + (me.rent IS NOT NULL)::int + (me.building_depr IS NOT NULL)::int
    + (me.machine_depr IS NOT NULL)::int + (me.insurance IS NOT NULL)::int
    + (me.overtime IS NOT NULL)::int + (me.bonus IS NOT NULL)::int
    + (me.severance_reserve IS NOT NULL)::int + (me.incentive_amount IS NOT NULL)::int
    + (me.isg IS NOT NULL)::int + (me.consulting IS NOT NULL)::int
    + (me.official_fees IS NOT NULL)::int + (me.communication IS NOT NULL)::int
    + (me.stationery IS NOT NULL)::int + (me.needle IS NOT NULL)::int
    + (me.consumables IS NOT NULL)::int
    + (me.ukp_consumables IS NOT NULL)::int + (me.vehicle_depr IS NOT NULL)::int
    )::numeric / 29.0                                                       AS doluluk_orani
FROM monthly_expense me;

COMMENT ON VIEW v_expense_groups IS 'Kanonik gider grupları G1-G8 + brüt/net çift defter + doluluk oranı. 037 ile ukp_consumables (G6) ve vehicle_depr (G5) eklendi, doluluk paydası 29 oldu.';

-- ---------- 5. RLS ----------
-- Üç tablo da İÇ EKİP verisi. Atölye kullanıcısının oturumunda
-- current_workshop_id() dolu olur; bu şart onu tamamen dışarıda tutar.
--
-- 035'in "OR workshop_id IS NULL" kalıbı BİLEREK yok: o kalıp NULL yazılan
-- satırı her atölyeye açıyor ve burada görünürlük zaten istenmiyor.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['workshop_economy','economy_param','economy_survey_staging'] LOOP
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

-- 028: public şemada anon/authenticated yetkisiz kalsın.
REVOKE ALL ON workshop_economy, economy_param, economy_survey_staging
    FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON
                 workshop_economy, economy_param, economy_survey_staging TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE workshop_economy_id_seq TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE economy_survey_staging_id_seq TO pes_app';
    END IF;
END $$;

-- ---------- 6. Parametre tohumu — 2026-01 ----------
-- Atolye_Gider_Model.xlsx PARAMETRE sayfasının başlangıç değerleri.
-- Her tenant için yazılır; tenant yoksa hiçbir şey eklenmez.
INSERT INTO economy_param (tenant_id, donem, param_key, param_value, note)
SELECT t.id, '2026-01', p.k, p.v, p.n
FROM tenant t
CROSS JOIN (VALUES
    ('min_wage_gross',      33030.0000, 'Brüt asgari ücret — ÇSGB 2026'),
    ('min_wage_net',        28075.5000, 'Net asgari ücret — ÇSGB 2026'),
    ('employer_cost',       39223.1300, 'İşveren maliyeti, imalat 5 puan SGK indirimi'),
    ('wage_support',         1270.0000, 'Asgari ücret desteği — 2026 için sürüyor'),
    ('minutes_per_day',       540.0000, '9 saat × 60, molalar hariç'),
    ('nominal_days',           22.0000, '52 hafta × 5 gün ÷ 12'),
    ('effective_days',         19.5000, 'Resmi tatil, izin ve devamsızlık sonrası'),
    ('eff_cutting',             0.7500, 'Kesim verimliliği'),
    ('eff_sewing',              0.6500, 'Dikim verimliliği — tipik Türk bandı %50-70'),
    ('eff_ukp',                 0.7500, 'UKP verimliliği'),
    ('target_margin',           0.1500, 'Hedef tedarikçi marjı'),
    ('weight_cutting',          1.0000, 'Kesim maaş ağırlığı — bölüm maaşları toplanınca güncellenir'),
    ('weight_sewing',           1.0000, 'Dikim maaş ağırlığı'),
    ('weight_ukp',              1.0000, 'UKP maaş ağırlığı'),
    ('revenue_adj_on',          1.0000, 'Boş gün ciro düzeltmesi açık'),
    ('revenue_adj_divisor',    24.0000, 'Boş gün düzeltme paydası')
) AS p(k, v, n)
ON CONFLICT (tenant_id, donem, param_key) DO NOTHING;

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT count(*) FROM economy_param WHERE donem = '2026-01';
--   → tenant sayısı × 16
--
-- Atölye kullanıcısı görememeli:
--   SET LOCAL pes.workshop_id = '1';
--   SELECT count(*) FROM workshop_economy;   -- → 0
--
-- node scripts/verify_public_api.mjs
-- node scripts/verify_workshop_isolation.mjs
--
-- ROLLBACK:
--   BEGIN;
--   DROP TABLE IF EXISTS workshop_economy;
--   DROP TABLE IF EXISTS economy_survey_staging;
--   DROP TABLE IF EXISTS economy_param;
--   ALTER TABLE monthly_expense DROP COLUMN IF EXISTS ukp_consumables;
--   ALTER TABLE monthly_expense DROP COLUMN IF EXISTS vehicle_depr;
--   -- v_expense_groups'u 021'deki haline döndür:
--   \i supabase/migrations/021_expense_v2.sql   -- yalnız 3. bölüm
--   COMMIT;
