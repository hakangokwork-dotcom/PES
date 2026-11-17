-- ============================================================
-- Migration 063 — Süreç akışı düzeltmeleri (kod incelemesi, 2026-11-17)
-- ============================================================
--
-- HEDEF: 061/062 canlıda; inceleme bulguları burada kapanır.
--
-- KURALLAR:
--   - Top bazlı çekme testi silinmez (RED testi silip topu serbest bırakma
--     yolu kapanır, test geçmişi korunur). Düzeltme = yeni test. İş emri
--     bazlı eski testler (top_id NULL) silinebilir kalır. İş emri ya da top
--     silinmesinden gelen zincirleme silme engellenmez (pg_trigger_depth).
--   - Testi olan top silinemez (FK RESTRICT); top 'Red' yapılır.
--   - v_is_emri_surec adım 2 topun yalnız SON testine bakar; Red toplar ve
--     top_id NULL testler sayılmaz. Adım 1'de Red top kalıcı 'Sorunlu' yapmaz.
--   - olcu_alt_kilit: UPDATE'te hem eski hem yeni şartname kontrol edilir
--     (onaylı şartnameden nokta/değer taşınamaz).
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. Top bazlı test silinmez ----------
CREATE OR REPLACE FUNCTION cekme_testi_silme_kilit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    -- pg_trigger_depth() > 1: iş emri silinmesinden gelen zincirleme silme.
    IF OLD.top_id IS NOT NULL AND pg_trigger_depth() = 1 THEN
        RAISE EXCEPTION 'Top bazlı test kaydı silinmez; düzeltme için yeni test girin.'
            USING ERRCODE = 'PT422';
    END IF;
    RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_cekme_testi_silme ON kumas_cekme_testi;
CREATE TRIGGER trg_cekme_testi_silme
    BEFORE DELETE ON kumas_cekme_testi
    FOR EACH ROW EXECUTE FUNCTION cekme_testi_silme_kilit();

-- ---------- 2. Testi olan top silinemez ----------
DO $$
DECLARE ad TEXT;
BEGIN
    SELECT c.conname INTO ad
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'kumas_cekme_testi'::regclass AND c.contype = 'f'
       AND c.confrelid = 'kumas_top'::regclass AND a.attname = 'top_id';
    IF ad IS NOT NULL THEN
        EXECUTE format('ALTER TABLE kumas_cekme_testi DROP CONSTRAINT %I', ad);
    END IF;
END $$;
ALTER TABLE kumas_cekme_testi
    ADD CONSTRAINT kumas_cekme_testi_top_id_fkey
    FOREIGN KEY (top_id) REFERENCES kumas_top(id) ON DELETE RESTRICT;

-- ---------- 3. Ölçü alt kayıt kilidi: eski ve yeni şartname ----------
CREATE OR REPLACE FUNCTION olcu_alt_kilit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
    sids INTEGER[] := '{}';
BEGIN
    IF TG_TABLE_NAME = 'olcu_noktasi' THEN
        IF TG_OP <> 'INSERT' THEN sids := sids || OLD.sartname_id; END IF;
        IF TG_OP <> 'DELETE' THEN sids := sids || NEW.sartname_id; END IF;
    ELSE
        IF TG_OP <> 'INSERT' THEN
            sids := sids || (SELECT n.sartname_id FROM olcu_noktasi n WHERE n.id = OLD.nokta_id);
        END IF;
        IF TG_OP <> 'DELETE' THEN
            sids := sids || (SELECT n.sartname_id FROM olcu_noktasi n WHERE n.id = NEW.nokta_id);
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM olcu_sartname WHERE id = ANY (sids) AND durum <> 'Önerilen') THEN
        RAISE EXCEPTION 'Yalnız "Önerilen" şartnamenin ölçüleri değiştirilebilir; yeni revizyon açın.' USING ERRCODE = 'PT422';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

-- ---------- 4. Adım görünümü ----------
-- Kolonlar 062 ile aynı ad ve sırada (CREATE OR REPLACE VIEW).
-- Adım 0 henüz kumaş kategorisine bakmaz: work_order'da kategori kolonu yok,
-- Rijit/Esnek şartnameden hangisinin gerektiği kararı bekliyor (inceleme madde 12).
CREATE OR REPLACE VIEW v_is_emri_surec WITH (security_invoker = true) AS
WITH s AS (
    SELECT wo.id AS work_order_id,
           count(os.id) FILTER (WHERE os.asama = 'FINAL'         AND os.durum <> 'Geçersiz')       AS final_sartname,
           count(os.id) FILTER (WHERE os.asama = 'FINAL'         AND os.durum = 'Müşteri onaylı')  AS final_onayli,
           count(os.id) FILTER (WHERE os.asama = 'YIKAMA_ONCESI' AND os.durum <> 'Geçersiz')       AS yo_sartname
      FROM work_order wo
      LEFT JOIN olcu_sartname os ON os.model_bulten_id = wo.model_bulten_id
     GROUP BY wo.id
), son AS (
    -- Topun son testi; önceki RİSKLİ/RED, sonraki yeniden testle geçersizleşir.
    SELECT DISTINCT ON (top_id) top_id, sonuc
      FROM kumas_cekme_testi
     WHERE top_id IS NOT NULL
     ORDER BY top_id, tarih DESC, id DESC
), t AS (
    SELECT kt.work_order_id,
           count(*)                                          AS top_sayisi,
           count(*) FILTER (WHERE kt.durum = 'Karantina')    AS karantina,
           count(*) FILTER (WHERE kt.durum = 'Serbest')      AS serbest,
           count(*) FILTER (WHERE kt.durum = 'Red')          AS red,
           count(*) FILTER (WHERE kt.durum = 'Serbest' AND (kt.ton_grubu IS NULL OR kt.cekme_grubu IS NULL)) AS grupsuz_serbest,
           coalesce(sum(kt.metre), 0)                        AS toplam_metre,
           count(*) FILTER (WHERE kt.durum <> 'Red' AND son.top_id IS NOT NULL)            AS test_sayisi,
           count(*) FILTER (WHERE kt.durum <> 'Red' AND son.sonuc IN ('RİSKLİ', 'RED'))    AS sorunlu_test,
           count(*) FILTER (WHERE kt.durum <> 'Red' AND son.top_id IS NULL)                AS testsiz
      FROM kumas_top kt
      LEFT JOIN son ON son.top_id = kt.id
     GROUP BY kt.work_order_id
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
       coalesce(t.test_sayisi, 0)     AS test_sayisi,
       coalesce(t.sorunlu_test, 0)    AS sorunlu_test,
       CASE WHEN s.final_sartname > 0 AND s.yo_sartname > 0 THEN 'Tamam'
            WHEN s.final_sartname + s.yo_sartname > 0       THEN 'Devam'
            ELSE 'Bekliyor' END AS adim0,
       CASE WHEN coalesce(t.top_sayisi, 0) - coalesce(t.red, 0) = 0 THEN 'Bekliyor'
            WHEN t.karantina > 0                                    THEN 'Devam'
            ELSE 'Tamam' END AS adim1,
       CASE WHEN coalesce(t.sorunlu_test, 0) > 0                                  THEN 'Sorunlu'
            WHEN coalesce(t.test_sayisi, 0) = 0                                   THEN 'Bekliyor'
            WHEN t.testsiz > 0 OR t.serbest = 0 OR t.grupsuz_serbest > 0          THEN 'Devam'
            ELSE 'Tamam' END AS adim2
  FROM work_order wo
  JOIN s ON s.work_order_id = wo.id
  LEFT JOIN t ON t.work_order_id = wo.id;

COMMENT ON VIEW v_is_emri_surec IS
'062/063: iş emri süreç adımlarının durumu (0 şartname, 1 kumaş, 2 çekme). Adım 2 topun son testine bakar; Red toplar sayılmaz.';

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT * FROM v_is_emri_surec WHERE top_sayisi > 0;
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_cekme_testi_silme ON kumas_cekme_testi;
--   DROP FUNCTION IF EXISTS cekme_testi_silme_kilit();
--   ALTER TABLE kumas_cekme_testi DROP CONSTRAINT kumas_cekme_testi_top_id_fkey,
--         ADD CONSTRAINT kumas_cekme_testi_top_id_fkey
--         FOREIGN KEY (top_id) REFERENCES kumas_top(id) ON DELETE CASCADE;
--   062 §6 görünümünü ve 061 olcu_alt_kilit() gövdesini yeniden çalıştırın.
-- ============================================================
