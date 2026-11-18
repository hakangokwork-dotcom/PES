-- ============================================================
-- Migration 065 — Atölye ↔ iş ortağı eşitleme, gerçek revizyon sayısı
-- ============================================================
--
-- HEDEF (2026-11-18, 064 inceleme bulguları):
--   1. is_ortagi (tip Atölye) workshop'un eşidir; 064 yalnız açılışta
--      kopyaladı. Atölyenin adı ya da aktifliği değişince ortak kaydı
--      eskiyordu. Artık tetikleyici eşitler (ikinci kopya elle tutulmaz).
--   2. v_is_emri_adim.revizyon_sayisi "farklı plan sayısı − 1" idi:
--      A → B → A iki değişiklik olduğu hâlde 1 sayılıyordu. Artık her
--      satır bir öncekiyle (created_at, id sırası, LAG) karşılaştırılır;
--      plan tarihi değişen satırlar sayılır, tarihi olan ilk satır (ilk
--      plan) hariç. Yalnız firma değişen satır revizyon değildir.
--   Görünümün kolonları (ad, sıra, tip) 064 ile aynı: CREATE OR REPLACE
--   yeterli, yetkiler korunur.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. Atölye → iş ortağı eşitleme ----------
-- SECURITY DEFINER: workshop'u değiştiren oturum is_ortagi'ye (yalnız merkez
-- yazar, 064 RLS) yazamasa da eş kayıt eskimesin.
CREATE OR REPLACE FUNCTION workshop_ortak_esitle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE is_ortagi
       SET unvan = NEW.name, aktif = coalesce(NEW.is_active, true)
     WHERE workshop_id = NEW.id
       AND (unvan, aktif) IS DISTINCT FROM (NEW.name, coalesce(NEW.is_active, true));
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workshop_ortak_esitle() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_workshop_ortak_esitle ON workshop;
CREATE TRIGGER trg_workshop_ortak_esitle AFTER UPDATE OF name, is_active ON workshop
    FOR EACH ROW EXECUTE FUNCTION workshop_ortak_esitle();

-- Tek seferlik: 064'ten bu yana birikmiş fark.
UPDATE is_ortagi io
   SET unvan = w.name, aktif = coalesce(w.is_active, true)
  FROM workshop w
 WHERE io.workshop_id = w.id
   AND (io.unvan, io.aktif) IS DISTINCT FROM (w.name, coalesce(w.is_active, true));

-- ---------- 2. Görünüm: gerçek plan değişikliği sayısı ----------
CREATE OR REPLACE VIEW v_is_emri_adim WITH (security_invoker = true) AS
SELECT s.id AS stage_kayit_id, s.work_order_id, s.stage_id, ps.code AS stage_code, ps.name AS stage_name, s.sira_no,
       s.is_ortagi_id, o.unvan AS ortak_unvan, o.tip AS ortak_tipi, s.zorunlu_formlar,
       ilk.plan_baslangic AS ilk_plan_baslangic, ilk.plan_bitis AS ilk_plan_bitis,
       s.plan_baslangic, s.plan_bitis, s.gercek_baslangic, s.gercek_bitis, s.durum,
       coalesce(g.n, 0)::int AS revizyon_sayisi,
       CASE WHEN ilk.plan_bitis IS NULL OR s.plan_bitis IS NULL THEN NULL
            ELSE s.plan_bitis - ilk.plan_bitis END AS plan_kayma_gun,
       CASE WHEN s.plan_bitis IS NULL THEN NULL
            WHEN s.gercek_bitis IS NOT NULL THEN s.gercek_bitis - s.plan_bitis
            WHEN current_date > s.plan_bitis THEN current_date - s.plan_bitis
            ELSE 0 END AS gecikme_gun,
       coalesce(j.acik, 0)::int AS acik_sorun,
       coalesce(j.toplam, 0)::int AS toplam_sorun
  FROM work_order_stage s
  JOIN production_stage ps ON ps.id = s.stage_id
  LEFT JOIN is_ortagi o ON o.id = s.is_ortagi_id
  LEFT JOIN LATERAL (
      SELECT plan_baslangic, plan_bitis FROM adim_plan_gecmisi
       WHERE stage_kayit_id = s.id AND (plan_baslangic IS NOT NULL OR plan_bitis IS NOT NULL)
       ORDER BY id LIMIT 1) ilk ON true
  LEFT JOIN LATERAL (
      -- planli_sira: o satıra kadar (dahil) tarihi olan satır sayısı; 1 = ilk plan.
      SELECT count(*) FILTER (WHERE x.degisti AND x.planli_sira > 1) AS n
        FROM (SELECT (h.plan_baslangic, h.plan_bitis) IS DISTINCT FROM
                     (lag(h.plan_baslangic) OVER w, lag(h.plan_bitis) OVER w) AS degisti,
                     count(*) FILTER (WHERE h.plan_baslangic IS NOT NULL OR h.plan_bitis IS NOT NULL) OVER w AS planli_sira
                FROM adim_plan_gecmisi h
               WHERE h.stage_kayit_id = s.id
              WINDOW w AS (ORDER BY h.created_at, h.id)) x) g ON true
  LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE NOT coalesce(resolved, false)) AS acik, count(*) AS toplam
        FROM work_order_journal
       WHERE work_order_id = s.work_order_id AND stage_id = s.stage_id AND tip IN ('PROBLEM', 'BLOKAJ')) j ON true;
COMMENT ON VIEW v_is_emri_adim IS
'064/065: adım başına ilk plan / güncel plan / gerçek, plan kayması, gecikme, sorun sayısı. revizyon_sayisi = ilk plandan sonraki plan tarihi değişikliği sayısı (065).';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT ON v_is_emri_adim TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT count(*) FROM is_ortagi io JOIN workshop w ON w.id = io.workshop_id
--    WHERE (io.unvan, io.aktif) IS DISTINCT FROM (w.name, coalesce(w.is_active, true));  -- 0
--   SELECT stage_kayit_id, revizyon_sayisi FROM v_is_emri_adim WHERE revizyon_sayisi > 0;
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_workshop_ortak_esitle ON workshop;
--   DROP FUNCTION IF EXISTS workshop_ortak_esitle();
--   v_is_emri_adim: 064 §7'deki tanımla CREATE OR REPLACE (revizyon_sayisi =
--   GREATEST(count(DISTINCT (plan_baslangic, plan_bitis)) - 1, 0)).
--   Tek seferlik unvan/aktif eşitlemesi geri alınmaz (veri doğru hâline geldi).
-- ============================================================
