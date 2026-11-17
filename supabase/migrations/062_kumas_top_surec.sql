-- ============================================================
-- Migration 062 — Kumaş topu, top bazlı çekme testi, süreç görseli, adım görünümü
-- ============================================================
--
-- HEDEF (2026-11-17): İş emri süreç akışı adım 1–2. Tasarım:
-- docs/superpowers/specs/2026-11-17-is-emri-surec-akisi-design.md §4.2, §4.3, §4.8, §4.9
--
-- KURALLAR:
--   - Top kabulde 'Karantina'; kesime yalnız 'Serbest' top girer (sürüm 2).
--   - RED testli top 'Serbest' olamaz; 'Serbest' topa RED test girilemez (PT422).
--   - Tedarikçi lotu, top kimliği, ton grubu, çekme grubu AYRI alanlar.
--   - kumas_cekme_testi'nin mevcut kolonları kalır: boy = çözgü, en = atkı,
--     may = dönme (ekranda bu adlarla). top_id NULL = eski iş emri bazlı kayıt.
--   - surec_gorsel: dosya 060'ın 'uretim-formlari' kovasında, 'surec/' önekiyle.
--   - Adım durumu elle girilmez, v_is_emri_surec türetir (security_invoker).
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. Kumaş topu ----------
CREATE TABLE IF NOT EXISTS kumas_top (
    id                   SERIAL PRIMARY KEY,
    tenant_id            UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    work_order_id        INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
    workshop_id          INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tedarikci            TEXT,
    artikel              TEXT,
    kompozisyon          TEXT,
    tedarikci_lotu       TEXT    NOT NULL,
    parti_no             TEXT,
    top_no               TEXT    NOT NULL,
    metre                NUMERIC(8,2) CHECK (metre > 0),
    kullanilabilir_en_cm NUMERIC(6,1) CHECK (kullanilabilir_en_cm > 0),
    irsaliye_no          TEXT,
    gelis_tarihi         DATE    NOT NULL DEFAULT CURRENT_DATE,
    durum                TEXT    NOT NULL DEFAULT 'Karantina' CHECK (durum IN ('Karantina', 'Serbest', 'Red')),
    ton_grubu            TEXT,
    cekme_grubu          TEXT,
    notlar               TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    giren_taraf          TEXT CHECK (giren_taraf IN ('atolye', 'merkez')),
    giren_eposta         TEXT,
    girildi_at           TIMESTAMPTZ,
    UNIQUE (work_order_id, tedarikci_lotu, top_no)
);
CREATE INDEX IF NOT EXISTS idx_kumas_top_wo ON kumas_top(work_order_id);
COMMENT ON TABLE kumas_top IS
'062: top bazlı kumaş kabulü. Karantina → Serbest/Red. Tedarikçi lotu, ton grubu ve çekme grubu ayrı alanlar.';

-- ---------- 2. Çekme testi: top ve proses alanları ----------
ALTER TABLE kumas_cekme_testi
    ADD COLUMN IF NOT EXISTS top_id            INTEGER REFERENCES kumas_top(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS yikama_receti     TEXT,
    ADD COLUMN IF NOT EXISTS hedef_renk        TEXT,
    ADD COLUMN IF NOT EXISTS ton_degerlendirme TEXT;
CREATE INDEX IF NOT EXISTS idx_kct_top ON kumas_cekme_testi(top_id) WHERE top_id IS NOT NULL;
COMMENT ON COLUMN kumas_cekme_testi.top_id IS
'062: testin yapıldığı top. NULL = 062 öncesi iş emri bazlı test. boy_cekme_pct = çözgü, en_cekme_pct = atkı.';

-- ---------- 3. Kurallar ----------
CREATE OR REPLACE FUNCTION kumas_top_serbest_kontrol()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.durum = 'Serbest' AND EXISTS (
        SELECT 1 FROM kumas_cekme_testi WHERE top_id = NEW.id AND sonuc = 'RED'
    ) THEN
        RAISE EXCEPTION 'Top % için RED sonuçlu çekme testi var; serbest bırakılamaz.', NEW.top_no
            USING ERRCODE = 'PT422';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_kumas_top_serbest ON kumas_top;
CREATE TRIGGER trg_kumas_top_serbest
    BEFORE UPDATE OF durum ON kumas_top
    FOR EACH ROW EXECUTE FUNCTION kumas_top_serbest_kontrol();

CREATE OR REPLACE FUNCTION cekme_red_kontrol()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.sonuc = 'RED' AND NEW.top_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM kumas_top WHERE id = NEW.top_id AND durum = 'Serbest'
    ) THEN
        RAISE EXCEPTION 'Top serbest bırakılmış; RED sonuç girmeden önce topu Karantina ya da Red yapın.'
            USING ERRCODE = 'PT422';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cekme_red ON kumas_cekme_testi;
CREATE TRIGGER trg_cekme_red
    BEFORE INSERT OR UPDATE OF sonuc, top_id ON kumas_cekme_testi
    FOR EACH ROW EXECUTE FUNCTION cekme_red_kontrol();

-- ---------- 4. Süreç görseli ----------
CREATE TABLE IF NOT EXISTS surec_gorsel (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    work_order_id INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
    workshop_id   INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    adim          TEXT    NOT NULL CHECK (adim IN ('KUMAS', 'CEKME', 'PASTAL', 'KONTROL', 'SEVK', 'YIKAMA', 'DONUS', 'FINAL')),
    kayit_id      INTEGER,          -- adımın kaydı (ör. kumas_top.id); NULL = adımın geneli
    yol           TEXT    NOT NULL UNIQUE,
    ad            TEXT    NOT NULL,
    tur           TEXT    NOT NULL,
    boyut         INTEGER NOT NULL,
    aciklama      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    giren_taraf   TEXT CHECK (giren_taraf IN ('atolye', 'merkez')),
    giren_eposta  TEXT,
    girildi_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_surec_gorsel_wo ON surec_gorsel(work_order_id, adim);
COMMENT ON TABLE surec_gorsel IS
'062: süreç adımı fotoğrafları. Dosya uretim-formlari kovasında surec/ önekiyle; satır silinince API depodan da siler.';

-- ---------- 5. 054/055 + RLS ----------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['kumas_top', 'surec_gorsel'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_kayit_giren ON %I', t);
        EXECUTE format('CREATE TRIGGER trg_kayit_giren BEFORE INSERT OR UPDATE ON %I
                        FOR EACH ROW EXECUTE FUNCTION kayit_giren_yaz()', t);
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()))',
            t || '_tenant_isolation', t);
        EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    END LOOP;
END $$;

-- ---------- 6. Adım görünümü (sürüm 1: adım 0–2) ----------
CREATE OR REPLACE VIEW v_is_emri_surec WITH (security_invoker = true) AS
WITH s AS (
    SELECT wo.id AS work_order_id,
           count(os.id) FILTER (WHERE os.asama = 'FINAL'         AND os.durum <> 'Geçersiz')       AS final_sartname,
           count(os.id) FILTER (WHERE os.asama = 'FINAL'         AND os.durum = 'Müşteri onaylı')  AS final_onayli,
           count(os.id) FILTER (WHERE os.asama = 'YIKAMA_ONCESI' AND os.durum <> 'Geçersiz')       AS yo_sartname
      FROM work_order wo
      LEFT JOIN olcu_sartname os ON os.model_bulten_id = wo.model_bulten_id
     GROUP BY wo.id
), t AS (
    SELECT work_order_id,
           count(*)                                       AS top_sayisi,
           count(*) FILTER (WHERE durum = 'Karantina')    AS karantina,
           count(*) FILTER (WHERE durum = 'Serbest')      AS serbest,
           count(*) FILTER (WHERE durum = 'Red')          AS red,
           count(*) FILTER (WHERE durum = 'Serbest' AND (ton_grubu IS NULL OR cekme_grubu IS NULL)) AS grupsuz_serbest,
           coalesce(sum(metre), 0)                        AS toplam_metre
      FROM kumas_top GROUP BY work_order_id
), c AS (
    SELECT work_order_id,
           count(*)                                              AS test_sayisi,
           count(*) FILTER (WHERE sonuc IN ('RİSKLİ', 'RED'))    AS sorunlu_test
      FROM kumas_cekme_testi GROUP BY work_order_id
)
SELECT wo.id AS work_order_id,
       wo.workshop_id,
       wo.model_bulten_id,
       s.final_sartname, s.final_onayli, s.yo_sartname,
       coalesce(t.top_sayisi, 0)      AS top_sayisi,
       coalesce(t.karantina, 0)       AS karantina,
       coalesce(t.serbest, 0)         AS serbest,
       coalesce(t.red, 0)             AS red,
       coalesce(t.grupsuz_serbest, 0) AS grupsuz_serbest,
       coalesce(t.toplam_metre, 0)    AS toplam_metre,
       coalesce(c.test_sayisi, 0)     AS test_sayisi,
       coalesce(c.sorunlu_test, 0)    AS sorunlu_test,
       CASE WHEN s.final_sartname > 0 AND s.yo_sartname > 0 THEN 'Tamam'
            WHEN s.final_sartname + s.yo_sartname > 0       THEN 'Devam'
            ELSE 'Bekliyor' END AS adim0,
       CASE WHEN coalesce(t.red, 0) > 0         THEN 'Sorunlu'
            WHEN coalesce(t.top_sayisi, 0) = 0  THEN 'Bekliyor'
            WHEN t.karantina > 0                THEN 'Devam'
            ELSE 'Tamam' END AS adim1,
       CASE WHEN coalesce(c.sorunlu_test, 0) > 0                    THEN 'Sorunlu'
            WHEN coalesce(c.test_sayisi, 0) = 0                     THEN 'Bekliyor'
            WHEN coalesce(t.serbest, 0) = 0 OR t.grupsuz_serbest > 0 THEN 'Devam'
            ELSE 'Tamam' END AS adim2
  FROM work_order wo
  JOIN s ON s.work_order_id = wo.id
  LEFT JOIN t ON t.work_order_id = wo.id
  LEFT JOIN c ON c.work_order_id = wo.id;

COMMENT ON VIEW v_is_emri_surec IS
'062: iş emri süreç adımlarının durumu (0 şartname, 1 kumaş, 2 çekme). Bekliyor/Devam/Tamam/Sorunlu veriden türer.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON kumas_top, surec_gorsel TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE kumas_top_id_seq, surec_gorsel_id_seq TO pes_app';
        EXECUTE 'GRANT SELECT ON v_is_emri_surec TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT * FROM v_is_emri_surec WHERE top_sayisi > 0;
--
-- ROLLBACK (önce kovadaki surec/ nesneleri Storage API ile silinmeli)
--   DROP VIEW IF EXISTS v_is_emri_surec;
--   DROP TABLE IF EXISTS surec_gorsel;
--   DROP TRIGGER IF EXISTS trg_cekme_red ON kumas_cekme_testi;
--   ALTER TABLE kumas_cekme_testi DROP COLUMN IF EXISTS top_id, DROP COLUMN IF EXISTS yikama_receti,
--         DROP COLUMN IF EXISTS hedef_renk, DROP COLUMN IF EXISTS ton_degerlendirme;
--   DROP TABLE IF EXISTS kumas_top;
--   DROP FUNCTION IF EXISTS kumas_top_serbest_kontrol(), cekme_red_kontrol();
-- ============================================================
