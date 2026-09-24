-- 040 — Ekonomi verisi: atölyeden toplama ve atölyeyle paylaşım (E4)
--
-- E0 (037) üç tabloyu tamamen iç ekibe kapattı: `current_workshop_id() IS NULL`
-- şartı atölye kullanıcısını dışarıda tutuyor. E4 bu kapıyı ÖLÇÜLÜ açıyor:
-- atölye YALNIZ KENDİ satırını görebilsin, çünkü kendi karnesini görmesi
-- veriyi doldurmasının karşılığı.
--
-- BU 035'İN HATASI DEĞİL. 035 `OR workshop_id IS NULL` yazıyor ve NULL
-- workshop'lu satırı HER atölyeye açıyor. Buradaki ikinci şart EŞİTLİK:
-- `workshop_id = current_workshop_id()`. Üstüne workshop_economy.workshop_id
-- zaten NOT NULL, yani NULL satır hiç oluşamaz. İki koruma üst üste.
--
-- economy_survey_staging DEĞİŞMİYOR — ham anket iç veridir, atölyenin başka
-- atölyenin beyanını görmesine giden tek kapı orasıdır.

BEGIN;

-- ---------- 1. workshop_economy: atölye kendi satırını görsün ----------

DROP POLICY IF EXISTS workshop_economy_tenant_isolation ON workshop_economy;

CREATE POLICY workshop_economy_tenant_isolation ON workshop_economy
    FOR ALL USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL
             OR workshop_id = current_workshop_id())
    );

-- ---------- 2. economy_param: atölye OKUSUN, yazamasın ----------
--
-- Atölye kendi karnesini göremez parametresiz: dakika maliyeti, adil fiyat ve
-- asgari çarpanı hep parametreye dayanıyor. Parametreler atölyeye özel değil
-- ve hassas da değil (asgari ücret, verimlilik varsayımları).
--
-- Tek FOR ALL politikası yerine ayrı SELECT/write: okuma kiracı geneline
-- açılır, yazma iç ekipte kalır. FOR ALL bırakılsaydı atölye parametreyi
-- değiştirip kendi karnesini düzeltebilirdi.

DROP POLICY IF EXISTS economy_param_tenant_isolation ON economy_param;

CREATE POLICY economy_param_select ON economy_param
    FOR SELECT USING (
        tenant_id = current_tenant_id() OR is_internal_admin()
    );

CREATE POLICY economy_param_write ON economy_param
    FOR ALL USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND current_workshop_id() IS NULL
    )
    WITH CHECK (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND current_workshop_id() IS NULL
    );

-- ---------- 3. source: atölyenin kendi girdiği satır ----------
--
-- 'anket' Forms'tan, 'elle' iç ekipten, 'turetilmis' çok aylı anketin
-- bölünmesinden geliyordu. Atölyenin kendi girdiği satır bunların hiçbiri
-- değil ve ekranda ayrı görünmeli — beyanın kaynağı güvenilirliğini belirler.

ALTER TABLE workshop_economy DROP CONSTRAINT IF EXISTS we_source_chk;
ALTER TABLE workshop_economy ADD CONSTRAINT we_source_chk
    CHECK (source IN ('anket', 'elle', 'turetilmis', 'atolye'));

-- ---------- 4. Veri talebi ----------
--
-- Talebin DURUMU KOLONDA TUTULMUYOR. "dolduruldu" diye bir alan olsaydı
-- workshop_economy güncellenince sapardı ve ekran yalan söylerdi. Doluluk
-- her zaman workshop_economy satırından TÜRETİLİR; burada yalnız istek
-- kaydı ve iptal bilgisi var.

CREATE TABLE IF NOT EXISTS economy_data_request (
    id           SERIAL PRIMARY KEY,
    tenant_id    UUID     NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
    workshop_id  INTEGER  NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    year         SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    month        SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),

    -- Talebi kimin açtığı ve ne dediği; atölye panelinde de görünür.
    note         TEXT,
    requested_by UUID,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- İptal: talep silinmez, çünkü kimden ne istendiği kaydı kalmalı.
    cancelled_at TIMESTAMPTZ,

    UNIQUE (workshop_id, year, month)
);

CREATE INDEX IF NOT EXISTS edr_tenant_donem_idx
    ON economy_data_request (tenant_id, year, month);

ALTER TABLE economy_data_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE economy_data_request FORCE  ROW LEVEL SECURITY;

-- Atölye kendisinden ne istendiğini görür; başkasınınkini göremez ve
-- talep açamaz/kapatamaz (yazma iç ekipte).
CREATE POLICY economy_data_request_select ON economy_data_request
    FOR SELECT USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL
             OR workshop_id = current_workshop_id())
    );

CREATE POLICY economy_data_request_write ON economy_data_request
    FOR ALL USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND current_workshop_id() IS NULL
    )
    WITH CHECK (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND current_workshop_id() IS NULL
    );

-- 028: public şemada anon/authenticated yetkisiz kalsın.
REVOKE ALL ON economy_data_request FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON economy_data_request TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE economy_data_request_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;
