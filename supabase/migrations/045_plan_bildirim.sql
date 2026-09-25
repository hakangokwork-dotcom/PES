-- 045 — Plan bildirimleri: gecikme ve çit içi değişiklik
--
-- İKİ YÖN, TEK MEKANİZMA. İkisi de aynı şeyi söylüyor: "kararlaştırdığımız
-- tarih tutmuyor, sebebi şu."
--
--   tip='gecikme'    atölye → planlamacı  "bitiş kayıyor"
--   tip='degisiklik' planlamacı → atölye  "zaman çiti içinde plan değişti"
--
-- Ayrı iki tablo kurmak, aynı alanları iki kez tanımlamak ve iki ayrı
-- "okundu" mantığı taşımak demekti.
--
-- TNA (Time & Action) takviminin karşılığı: planlanan tarih, gerçekleşen
-- tarih, GECİKME GÜNÜ, açıklama. Gecikme günü SAKLANMAZ, iki tarihten
-- türetilir — saklansaydı tarih düzeltilince sessizce yanlış kalırdı.
--
-- ZAMAN ÇİTİ kullanıcı kararıyla ENGELLEMİYOR ama sessiz de kalamaz:
-- sessizce değişen bir plan, onay mekanizmasını anlamsız kılar (044).

BEGIN;

CREATE TABLE IF NOT EXISTS plan_bildirim (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID    NOT NULL REFERENCES tenant(id)     ON DELETE CASCADE,
    workshop_id   INTEGER NOT NULL REFERENCES workshop(id)   ON DELETE CASCADE,
    work_order_id INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,

    tip           TEXT    NOT NULL,

    /* Kararlaştırılmış tarih ve yerine önerilen/oluşan tarih. */
    eski_bitis    DATE,
    yeni_bitis    DATE    NOT NULL,

    /* 044'ün gerekçe kodlarıyla AYNI küme — atölyenin dili değişmesin. */
    gerekce_kodu  TEXT    NOT NULL,
    not_metni     TEXT,

    olusturan     UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    /* Karşı taraf gördü mü. NULL = görülmedi. */
    okundu_at     TIMESTAMPTZ,

    CONSTRAINT pb_tip_chk CHECK (tip IN ('gecikme', 'degisiklik')),
    CONSTRAINT pb_gerekce_chk CHECK (gerekce_kodu IN (
        'KAPASITE_YOK', 'MALZEME_GEC', 'ONCEKI_IS_GECIKTI', 'MAKINE_ARIZA',
        'ISGUCU_YETERSIZ', 'NUMUNE_ONAY_BEKLIYOR', 'TATIL_IZIN', 'DIGER')),
    CONSTRAINT pb_diger_not CHECK (
        gerekce_kodu <> 'DIGER' OR (not_metni IS NOT NULL AND length(trim(not_metni)) > 0))
);

CREATE INDEX IF NOT EXISTS pb_workshop_idx ON plan_bildirim (workshop_id, okundu_at);
CREATE INDEX IF NOT EXISTS pb_wo_idx       ON plan_bildirim (work_order_id, created_at DESC);

ALTER TABLE plan_bildirim ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_bildirim FORCE  ROW LEVEL SECURITY;

/* Her iki taraf da kendi ilgilendiği satırı görür: iç ekip hepsini,
   atölye kendi işlerininkini. 040'ın eşitlik kalıbı. */
CREATE POLICY plan_bildirim_select ON plan_bildirim
    FOR SELECT USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()));

/* Atölye gecikme bildirebilir; iç ekip değişiklik bildirir. Hangi tipi
   kimin yazabileceğini API sınırlar — RLS satır seviyesinde çalışır. */
CREATE POLICY plan_bildirim_insert ON plan_bildirim
    FOR INSERT WITH CHECK (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()));

/* "Okundu" işaretlemek için; içerik değiştirilmemeli, API onu da sınırlar. */
CREATE POLICY plan_bildirim_update ON plan_bildirim
    FOR UPDATE USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()))
    WITH CHECK (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()));

/* Bildirim SİLİNMEZ — kimin ne zaman ne bildirdiği, gecikme tartışmasının
   tek nesnel dayanağı. */
CREATE POLICY plan_bildirim_delete ON plan_bildirim
    FOR DELETE USING (is_internal_admin());

REVOKE ALL ON plan_bildirim FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON plan_bildirim TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE plan_bildirim_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;
