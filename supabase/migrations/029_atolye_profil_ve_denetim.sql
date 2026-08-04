-- ============================================================
-- Migration 029 — Atölye profili ve denetim geçmişi
-- ============================================================
--
-- KAYNAK: "Atölye isimleri.xlsx" (474 satır, 37 kolon) — tedarik
-- ekibinin elde tuttuğu atölye künye listesi. WKYS/sosyal uygunluk
-- denetim tarihleri, puan/sınıf, tedarik müdürlüğü, FKU, risk seviyesi,
-- çalışma şekli gibi alanlar var.
--
-- ÜÇ TABLO, ÜÇ AYRI SEBEP:
--
--   workshop_profil_staging — ham Excel, satır satır, hepsi TEXT.
--     Neden: Excel'deki 474 satırın ~340'ı sistemde atölyesi olmayan
--     tüzel kişilik. Bunları atmak yerine saklıyoruz; "bu atölye de
--     eklensin" dendiğinde veri hazır. Ayrıca eşleştirme kararı
--     değişirse ham veriye dönmek gerekiyor.
--
--   workshop_profil — atölye başına TEK satır, tipli künye alanları.
--     Neden ayrı tablo: workshop tablosu üretim/kapasite çekirdeği;
--     tedarik künyesi (FKU, tedarik müdürlüğü, subjektif sınıf) farklı
--     bir sahiplik ve farklı bir güncellenme ritmi. workshop'a 20 kolon
--     eklemek çekirdeği bulandırırdı.
--
--   workshop_denetim — denetim başına BİR satır (geçmiş tutar).
--     Neden düz kolon değil: "sonraki denetim ne zaman" sorusu ancak
--     son denetim + geçerlilik süresiyle cevaplanır. Düz kolonda
--     (wkys_tarih, wkys_puan) her yeni denetim öncekini siler, trend
--     kaybolur. Yeni denetim = yeni satır; view en günceli seçer.
--
-- GEÇERLİLİK KURALI (kullanıcı kararı, 2026-08-04):
--   WKYS   -> her zaman 12 ay
--   SOSYAL -> puan >= 90 ise 12 ay, puan < 90 ise 6 ay
--   Puan yoksa 6 ay (muhafazakâr: bilinmeyen skor iyi kabul edilmez).
--   Kural denetim_gecerlilik_ay() fonksiyonunda TEK yerde; kolonlar
--   GENERATED olduğu için veri kuraldan sapamaz. Kural değişirse
--   fonksiyon değişir + kolonlar yeniden üretilir (bkz. dosya sonu).
--
-- ROLLBACK: dosya sonundaki blok.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. GEÇERLİLİK KURALI
-- ============================================================
CREATE OR REPLACE FUNCTION denetim_gecerlilik_ay(p_tip TEXT, p_puan NUMERIC)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_tip = 'WKYS' THEN 12::SMALLINT
        WHEN p_puan IS NULL THEN 6::SMALLINT
        WHEN p_puan >= 90  THEN 12::SMALLINT
        ELSE 6::SMALLINT
    END;
$$;

COMMENT ON FUNCTION denetim_gecerlilik_ay(TEXT, NUMERIC) IS
'Denetim geçerlilik süresi (ay). WKYS=12; SOSYAL: puan>=90 -> 12, aksi/puansız -> 6. Kuralın tek kaynağı.';

-- ============================================================
-- 2. STAGING — HAM EXCEL
-- ============================================================
CREATE TABLE IF NOT EXISTS workshop_profil_staging (
    id                  SERIAL PRIMARY KEY,
    tenant_id           UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    kaynak_dosya        TEXT NOT NULL,
    satir_no            INTEGER NOT NULL,

    -- Excel kolonları, sırasıyla, hepsi ham TEXT
    atolye_adi          TEXT,
    bw_atolye_adi       TEXT,
    t_kod               TEXT,
    odito_adi           TEXT,
    atolye_unvani       TEXT,
    bant_sayisi         TEXT,
    inspection          TEXT,
    calisma_sekli       TEXT,
    aktiflik            TEXT,
    uretim_tipi         TEXT,
    tedarik_mudurlugu   TEXT,
    bolge               TEXT,
    il                  TEXT,
    ilce                TEXT,
    teknik_mudur        TEXT,
    fku                 TEXT,
    subjektif_sinif     TEXT,
    aylik_kapasite      TEXT,
    on_uretim_numunesi  TEXT,
    yetkili_kisi        TEXT,
    telefon             TEXT,
    eposta              TEXT,
    calisan_sayisi      TEXT,
    wkys_tarih          TEXT,
    wkys_puan           TEXT,
    wkys_sinif          TEXT,
    sosyal_tarih        TEXT,
    sosyal_puan         TEXT,
    sosyal_sinif        TEXT,
    calisan_sayisi_alt  TEXT,
    is_ortakligi_leveli TEXT,
    aylik_gider         TEXT,
    risk_seviyesi       TEXT,
    ozel_not            TEXT,
    kullanici           TEXT,
    degisiklik_zamani   TEXT,
    kapasite_tipi       TEXT,

    -- eşleştirme sonucu (import scripti doldurur)
    eslesen_workshop_id INTEGER REFERENCES workshop(id) ON DELETE SET NULL,
    eslesme_yontemi     TEXT,
    eslesme_skoru       NUMERIC(4,3),

    yuklendi_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (kaynak_dosya, satir_no)
);

COMMENT ON TABLE workshop_profil_staging IS
'"Atölye isimleri.xlsx" ham hali. Sistemde atölyesi olmayan tüzel kişilikler de burada durur — silinmez, ileride atölye açılırsa kaynak budur.';
COMMENT ON COLUMN workshop_profil_staging.calisan_sayisi_alt IS
'Excel''de İKİNCİ "ÇALIŞAN SAYISI" kolonu (29. sütun). Değer aralığı (884-3500) ilkinden (70-180) çok farklı; ne olduğu teyit edilmedi, ham saklanıyor.';
COMMENT ON COLUMN workshop_profil_staging.eslesme_yontemi IS
'kesin | inceleme | elle | yok — atölye eşleştirmesinin nasıl kurulduğu.';

CREATE INDEX IF NOT EXISTS idx_wps_tkod    ON workshop_profil_staging(t_kod);
CREATE INDEX IF NOT EXISTS idx_wps_eslesen ON workshop_profil_staging(eslesen_workshop_id);

-- ============================================================
-- 3. PROFİL — ATÖLYE BAŞINA TEK SATIR
-- ============================================================
CREATE TABLE IF NOT EXISTS workshop_profil (
    workshop_id         INTEGER PRIMARY KEY REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,

    t_kod               TEXT,
    bw_atolye_adi       TEXT,
    odito_adi           TEXT,
    atolye_unvani       TEXT,

    tedarik_mudurlugu   TEXT,
    teknik_mudur        TEXT,
    fku                 TEXT,
    yetkili_kisi        TEXT,

    calisma_sekli       TEXT,
    uretim_tipi         TEXT,
    inspection          TEXT,
    kapasite_tipi       TEXT,
    on_uretim_numunesi  TEXT,

    subjektif_sinif     TEXT,
    is_ortakligi_leveli TEXT,
    risk_seviyesi       TEXT,

    bant_sayisi         SMALLINT,
    aylik_kapasite      INTEGER,
    calisan_sayisi      INTEGER,
    calisan_sayisi_alt  INTEGER,
    ozel_not            TEXT,

    kaynak_satir        INTEGER,
    eslesme_yontemi     TEXT NOT NULL DEFAULT 'kesin',
    data_confidence     TEXT NOT NULL DEFAULT 'yuksek',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT wp_eslesme_chk   CHECK (eslesme_yontemi IN ('kesin','inceleme','elle')),
    CONSTRAINT wp_confidence_chk CHECK (data_confidence IN ('yuksek','orta','dusuk'))
);

COMMENT ON TABLE workshop_profil IS
'Atölye tedarik künyesi (Atölye isimleri.xlsx kaynaklı). workshop tablosundan ayrı: farklı sahip, farklı güncellenme ritmi.';
COMMENT ON COLUMN workshop_profil.eslesme_yontemi IS
'kesin = isim jetonları birebir örtüştü | inceleme = kullanıcı onayladı | elle = elle girildi';

CREATE INDEX IF NOT EXISTS idx_wp_tenant  ON workshop_profil(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wp_tedarik ON workshop_profil(tedarik_mudurlugu);

DROP TRIGGER IF EXISTS trg_wp_updated ON workshop_profil;
CREATE TRIGGER trg_wp_updated BEFORE UPDATE ON workshop_profil
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ============================================================
-- 4. DENETİM GEÇMİŞİ
-- ============================================================
CREATE TABLE IF NOT EXISTS workshop_denetim (
    id              SERIAL PRIMARY KEY,
    workshop_id     INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,

    tip             TEXT NOT NULL,
    tarih           DATE NOT NULL,
    puan            NUMERIC(5,2),
    sinif           TEXT,

    -- Kural fonksiyondan gelir; elle yazılamaz, veriyle kural çelişemez.
    gecerlilik_ay   SMALLINT GENERATED ALWAYS AS (denetim_gecerlilik_ay(tip, puan)) STORED,
    sonraki_tarih   DATE     GENERATED ALWAYS AS
                        ((tarih + make_interval(months => denetim_gecerlilik_ay(tip, puan)))::date) STORED,

    kaynak          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT wd_tip_chk  CHECK (tip IN ('WKYS','SOSYAL')),
    CONSTRAINT wd_puan_chk CHECK (puan IS NULL OR (puan >= 0 AND puan <= 100)),
    UNIQUE (workshop_id, tip, tarih)
);

COMMENT ON TABLE workshop_denetim IS
'Denetim geçmişi — her denetim bir satır. WKYS ve sosyal uygunluk. sonraki_tarih GENERATED: geçerlilik kuralı denetim_gecerlilik_ay() fonksiyonunda.';
COMMENT ON COLUMN workshop_denetim.sinif IS
'Denetim sınıfı (A/B/C/D). Kaynak Excel''de bu kolona sayı sızmış satırlar var; import bunları NULL bırakıp puana çevirmeyi dener.';

CREATE INDEX IF NOT EXISTS idx_wd_workshop ON workshop_denetim(workshop_id, tip, tarih DESC);
CREATE INDEX IF NOT EXISTS idx_wd_sonraki  ON workshop_denetim(sonraki_tarih);
CREATE INDEX IF NOT EXISTS idx_wd_tenant   ON workshop_denetim(tenant_id);

-- ============================================================
-- 5. RLS — 019b tenant_isolation deseni
-- ============================================================
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['workshop_profil_staging','workshop_profil','workshop_denetim'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I
                FOR ALL USING (tenant_id = current_tenant_id() OR is_internal_admin())',
            t || '_tenant_isolation', t
        );
    END LOOP;
END $$;

-- 028: anon/authenticated public şemada yetkisiz; yeni tablolar da öyle kalsın.
REVOKE ALL ON workshop_profil_staging, workshop_profil, workshop_denetim
    FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON
                 workshop_profil_staging, workshop_profil, workshop_denetim TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE
                 workshop_profil_staging_id_seq, workshop_denetim_id_seq TO pes_app';
    END IF;
END $$;

-- ============================================================
-- 6. DENETİM DURUM VIEW'I
-- ============================================================
-- Atölye × denetim tipi başına EN SON denetim ve türetilmiş durum.
-- Denetimi hiç olmayan atölyeler de görünür (LEFT JOIN + 'YOK').
--
-- security_invoker=true ZORUNLU: 028'de tüm view'lar bu hale getirildi;
-- false kalırsa view sahibinin (postgres, BYPASSRLS) yetkisiyle çalışır
-- ve RLS'i deler.
CREATE OR REPLACE VIEW v_atolye_denetim_durum
WITH (security_invoker = true) AS
WITH tipler AS (
    SELECT w.id AS workshop_id, w.tenant_id, t.tip
    FROM workshop w
    CROSS JOIN (VALUES ('WKYS'), ('SOSYAL')) AS t(tip)
),
son AS (
    SELECT DISTINCT ON (d.workshop_id, d.tip)
           d.workshop_id, d.tip, d.tarih, d.puan, d.sinif,
           d.gecerlilik_ay, d.sonraki_tarih
    FROM workshop_denetim d
    ORDER BY d.workshop_id, d.tip, d.tarih DESC
)
SELECT
    tp.workshop_id,
    tp.tenant_id,
    w.code                AS atolye_kodu,
    w.name                AS atolye_adi,
    w.is_active,
    p.tedarik_mudurlugu,
    p.teknik_mudur,
    p.fku,
    p.risk_seviyesi,
    tp.tip                AS denetim_tipi,
    s.tarih               AS son_denetim,
    s.puan                AS son_puan,
    s.sinif               AS son_sinif,
    s.gecerlilik_ay,
    s.sonraki_tarih,
    (s.sonraki_tarih - CURRENT_DATE) AS kalan_gun,
    CASE
        WHEN s.tarih IS NULL                                  THEN 'YOK'
        WHEN s.sonraki_tarih <  CURRENT_DATE                  THEN 'SURESI_DOLMUS'
        WHEN s.sonraki_tarih <= CURRENT_DATE + 90             THEN 'YAKLASIYOR'
        ELSE 'GECERLI'
    END AS durum
FROM tipler tp
JOIN workshop w        ON w.id = tp.workshop_id
LEFT JOIN son s        ON s.workshop_id = tp.workshop_id AND s.tip = tp.tip
LEFT JOIN workshop_profil p ON p.workshop_id = tp.workshop_id;

COMMENT ON VIEW v_atolye_denetim_durum IS
'Atölye × denetim tipi: son denetim, sonraki tarih, durum (YOK / SURESI_DOLMUS / YAKLASIYOR / GECERLI). YAKLASIYOR eşiği 90 gün.';

REVOKE ALL ON v_atolye_denetim_durum FROM anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT ON v_atolye_denetim_durum TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA
-- ============================================================
-- 1. Kural doğru mu:
--      SELECT denetim_gecerlilik_ay('WKYS', 40);    -- 12
--      SELECT denetim_gecerlilik_ay('SOSYAL', 92);  -- 12
--      SELECT denetim_gecerlilik_ay('SOSYAL', 67);  -- 6
--      SELECT denetim_gecerlilik_ay('SOSYAL', NULL);-- 6
--
-- 2. İçe aktarım:  node scripts/import_atolye_profil.mjs --uygula
-- 3. RLS:          node scripts/verify_tenant_isolation.mjs
-- 4. Anon kapalı:  node scripts/verify_public_api.mjs
--
-- KURAL DEĞİŞİRSE (ör. sosyal eşiği 85 olursa):
--   CREATE OR REPLACE FUNCTION denetim_gecerlilik_ay(...) ... ;
--   -- GENERATED kolonlar eski değeri tutar, yeniden üretilmeli:
--   ALTER TABLE workshop_denetim
--     ALTER COLUMN gecerlilik_ay DROP EXPRESSION,   -- sonra tekrar ekle
--     ...
--   En pratiği: tabloyu VACUUM FULL yerine
--   UPDATE workshop_denetim SET tarih = tarih;  -- GENERATED yeniden hesaplanır
--
-- ROLLBACK:
--   BEGIN;
--   DROP VIEW  IF EXISTS v_atolye_denetim_durum;
--   DROP TABLE IF EXISTS workshop_denetim;
--   DROP TABLE IF EXISTS workshop_profil;
--   DROP TABLE IF EXISTS workshop_profil_staging;
--   DROP FUNCTION IF EXISTS denetim_gecerlilik_ay(TEXT, NUMERIC);
--   COMMIT;
-- ============================================================
