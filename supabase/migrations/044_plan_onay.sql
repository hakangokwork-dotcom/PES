-- 044 — İki taraflı onay: teklif, cevap, tur geçmişi
--
-- Araştırmadan (2026-09-25): tedarikçi iş birliği portallarının kabul /
-- karşı öneri / ret döngüsü. Kritik nokta şu: atölyenin cevabı, planlamacının
-- ÜZERİNE AKSİYON ALABİLECEĞİ YAPISAL BİR KAYIT olmalı. Serbest metin bir
-- cevap "hayır, olmaz" der ve planlamacı neyin işe yarayacağını bilemez;
-- karşı öneri bu yüzden tarih + adet + GEREKÇE KODU taşır.

BEGIN;

-- ---------- 1. Taslak gönderilebilir hâle gelir ----------

ALTER TABLE plan_taslak DROP CONSTRAINT IF EXISTS pt_durum_chk;
ALTER TABLE plan_taslak ADD CONSTRAINT pt_durum_chk
    CHECK (durum IN ('taslak', 'gonderildi', 'kapandi'));

-- ---------- 2. Teklif ----------
--
-- Bir taslak birden çok atölyeye dokunabilir; her ATÖLYEYE ayrı teklif
-- gider. Tek teklif olsaydı bir atölyenin reddi bütün planı bloklardı.
--
-- tur_no: revizyon önerisi sonrası planlamacı yeni teklif açar. Geçmiş
-- SİLİNMEZ — kimin ne zaman ne dediği kaydı, gecikme tartışmasının tek
-- nesnel dayanağı.

CREATE TABLE IF NOT EXISTS plan_teklif (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID    NOT NULL REFERENCES tenant(id)     ON DELETE CASCADE,
    taslak_id     INTEGER NOT NULL REFERENCES plan_taslak(id) ON DELETE CASCADE,
    workshop_id   INTEGER NOT NULL REFERENCES workshop(id)    ON DELETE CASCADE,
    tur_no        SMALLINT NOT NULL DEFAULT 1,

    durum         TEXT    NOT NULL DEFAULT 'bekliyor',

    gonderen      UUID,
    gonderildi_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cevaplayan    UUID,
    cevap_at      TIMESTAMPTZ,
    /* Ret ve revizyonda ZORUNLU — aşağıdaki CHECK zorluyor. */
    gerekce_kodu  TEXT,
    cevap_notu    TEXT,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (taslak_id, workshop_id, tur_no),
    CONSTRAINT ptk_durum_chk CHECK (durum IN ('bekliyor', 'kabul', 'revizyon', 'ret')),
    CONSTRAINT ptk_gerekce_chk CHECK (gerekce_kodu IS NULL OR gerekce_kodu IN (
        'KAPASITE_YOK', 'MALZEME_GEC', 'ONCEKI_IS_GECIKTI', 'MAKINE_ARIZA',
        'ISGUCU_YETERSIZ', 'NUMUNE_ONAY_BEKLIYOR', 'TATIL_IZIN', 'DIGER')),
    /* "Olmaz" demek yetmez; NEDEN olmadığı olmadan planlamacı yeni tur
       açamaz. Kabul ve bekliyor durumunda gerekçe istenmez. */
    CONSTRAINT ptk_gerekce_zorunlu CHECK (
        durum NOT IN ('revizyon', 'ret') OR gerekce_kodu IS NOT NULL),
    /* DIGER seçildiyse serbest metin şart — kod tek başına bilgi taşımıyor. */
    CONSTRAINT ptk_diger_not CHECK (
        gerekce_kodu <> 'DIGER' OR (cevap_notu IS NOT NULL AND length(trim(cevap_notu)) > 0))
);

CREATE INDEX IF NOT EXISTS ptkl_workshop_idx ON plan_teklif (workshop_id, durum);
CREATE INDEX IF NOT EXISTS ptkl_taslak_idx   ON plan_teklif (taslak_id);

-- ---------- 3. Teklif kalemleri — ANLIK GÖRÜNTÜ ----------
--
-- Kalemler plan_taslak_kalem'e İŞARET ETMEZ, KOPYALANIR. Taslak gönderildikten
-- sonra da değişmeye devam eder (planlamacı sürüklemeyi bırakmaz); teklif ise
-- değişmemeli. "Tam olarak neyi gönderdik" sorusunun cevabı sabit kalmalı,
-- yoksa atölyenin neyi kabul ettiği belirsizleşir.
--
-- karsi_* alanları atölyenin önerisi. NULL = o kaleme itirazı yok.

CREATE TABLE IF NOT EXISTS plan_teklif_kalem (
    id             SERIAL PRIMARY KEY,
    teklif_id      INTEGER NOT NULL REFERENCES plan_teklif(id) ON DELETE CASCADE,
    tenant_id      UUID    NOT NULL REFERENCES tenant(id)      ON DELETE CASCADE,

    work_order_id  INTEGER NOT NULL REFERENCES work_order(id)      ON DELETE CASCADE,
    line_id        INTEGER NOT NULL REFERENCES production_line(id) ON DELETE CASCADE,
    baslangic      DATE    NOT NULL,
    /* Türetilen bitiş, gönderim anındaki kapasiteyle. Burada SAKLANIYOR
       çünkü teklif anlık görüntüdür: atölye neyi gördüyse o kalmalı. */
    bitis          DATE    NOT NULL,
    adet           INTEGER NOT NULL CHECK (adet > 0),

    karsi_baslangic DATE,
    karsi_adet      INTEGER CHECK (karsi_adet IS NULL OR karsi_adet > 0),
    karsi_not       TEXT,

    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (teklif_id, work_order_id, line_id)
);

CREATE INDEX IF NOT EXISTS ptkk_teklif_idx ON plan_teklif_kalem (teklif_id);
/* Yumuşak rezervasyon sorgusu bu indeksten geçer. */
CREATE INDEX IF NOT EXISTS ptkk_line_idx   ON plan_teklif_kalem (line_id, baslangic, bitis);

-- ---------- 4. RLS ----------
--
-- Atölye KENDİ teklifini görür ve CEVAPLAR (UPDATE), ama teklif AÇAMAZ
-- (INSERT) ve SİLEMEZ. 040'ın eşitlik kalıbı; 035'in NULL kalıbı değil.
--
-- Not: UPDATE satır seviyesinde açık olduğu için atölye teorik olarak
-- durumu 'kabul' yapabilir; hangi kolonun değişebileceğini API sınırlıyor
-- (app/api/workshop/plan/route.ts). Kolon seviyesi kısıt PostgreSQL'de
-- GRANT ile yapılır ve pes_app tek rol olduğu için burada uygulanmadı.

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['plan_teklif', 'plan_teklif_kalem'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

CREATE POLICY plan_teklif_select ON plan_teklif
    FOR SELECT USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()));

CREATE POLICY plan_teklif_update ON plan_teklif
    FOR UPDATE USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()))
    WITH CHECK (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()));

CREATE POLICY plan_teklif_insert ON plan_teklif
    FOR INSERT WITH CHECK (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND current_workshop_id() IS NULL);

CREATE POLICY plan_teklif_delete ON plan_teklif
    FOR DELETE USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND current_workshop_id() IS NULL);

/* Kalem, teklifin atölyesine bakar: atölye kendi teklifinin kalemlerini
   görür ve karşı öneri yazabilir. */
CREATE POLICY plan_teklif_kalem_select ON plan_teklif_kalem
    FOR SELECT USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR EXISTS (
            SELECT 1 FROM plan_teklif t
             WHERE t.id = teklif_id AND t.workshop_id = current_workshop_id())));

CREATE POLICY plan_teklif_kalem_update ON plan_teklif_kalem
    FOR UPDATE USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR EXISTS (
            SELECT 1 FROM plan_teklif t
             WHERE t.id = teklif_id AND t.workshop_id = current_workshop_id())))
    WITH CHECK (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL OR EXISTS (
            SELECT 1 FROM plan_teklif t
             WHERE t.id = teklif_id AND t.workshop_id = current_workshop_id())));

CREATE POLICY plan_teklif_kalem_write ON plan_teklif_kalem
    FOR INSERT WITH CHECK (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND current_workshop_id() IS NULL);

CREATE POLICY plan_teklif_kalem_delete ON plan_teklif_kalem
    FOR DELETE USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND current_workshop_id() IS NULL);

REVOKE ALL ON plan_teklif, plan_teklif_kalem FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON plan_teklif, plan_teklif_kalem TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE plan_teklif_id_seq TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE plan_teklif_kalem_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;
