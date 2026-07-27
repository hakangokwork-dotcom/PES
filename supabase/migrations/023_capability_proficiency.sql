-- ============================================================
-- 023_capability_proficiency.sql — Yetenek matrisi v2
--
-- PES-ENTEGRASYON-PLANI.md §023'ün BİRİNCİ parçası: seviye kolonları ve
-- atölye özeti view'ı. Yetenek atama arayüzünün (Faz 4) dayandığı şema.
--
-- KAPSAM DIŞI BIRAKILANLAR (bilinçli — plandaki diğer iki parça):
--   · Körelme job'ı (last_production_at 18 aydan eskiyse seviye düşür)
--   · work_order kapanış trigger'ı (last_production_at'i besler)
--   Bunlar otomasyondur ve gerçek üretim akışı olmadan doğrulanamaz;
--   work_order verisi birikince ayrı migration olarak eklenecek. Kolonlar
--   şimdi açılıyor ki o gün şema değişikliği gerekmesin.
--
-- SEVİYE ÖLÇEĞİ (0-3):
--   0 = yapamaz / uygun değil   1 = yapabilir (varsayılan)
--   2 = iyi, verimli çalışır    3 = uzman, referans bant
--   Mevcut 3019 kayıt 1'e düşer: "yapabilir" — Klasman verisi seviye
--   bilgisi taşımıyordu, 2/3 atamak veri uydurmak olurdu.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. SEVİYE VE ONAY KOLONLARI
-- ============================================================
ALTER TABLE line_capability ADD COLUMN IF NOT EXISTS proficiency SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE line_capability ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE line_capability ADD COLUMN IF NOT EXISTS approved_at DATE;
ALTER TABLE line_capability ADD COLUMN IF NOT EXISTS last_production_at DATE;

ALTER TABLE line_capability DROP CONSTRAINT IF EXISTS line_capability_proficiency_check;
ALTER TABLE line_capability ADD  CONSTRAINT line_capability_proficiency_check
    CHECK (proficiency BETWEEN 0 AND 3);

COMMENT ON COLUMN line_capability.proficiency IS
  '0=yapamaz, 1=yapabilir (varsayılan), 2=iyi/verimli, 3=uzman/referans.';
COMMENT ON COLUMN line_capability.approved_by IS
  'Beyanı doğrulayan kullanıcı. NULL = henüz doğrulanmamış (atölyenin kendi beyanı).';
COMMENT ON COLUMN line_capability.last_production_at IS
  'Bu bant×yetenek hücresinde en son ne zaman üretim yapıldı. Körelme hesabının girdisi; şimdilik elle/boş, work_order trigger''ı sonra bağlanacak.';

-- ============================================================
-- 2. ATÖLYE SEVİYESİ ÖZET
-- ============================================================
-- Atölyenin yetkinliği = bantlarının EN İYİSİ. Bir bant "uzman" ise atölye
-- o işi uzman seviyede yapabiliyor demektir; ortalama almak yanıltıcı olurdu
-- (zayıf ikinci bant güçlü birinciyi aşağı çekerdi).
--
-- security_invoker: view'ı SORGULAYANIN RLS'i uygulanır. Aksi halde view
-- sahibinin haklarıyla çalışır ve tenant izolasyonu delinirdi.
CREATE OR REPLACE VIEW v_workshop_capability
WITH (security_invoker = true) AS
SELECT
    pl.workshop_id,
    lc.tenant_id,
    lc.dimension_code,
    lc.value_code,
    lc.attribute_type,
    MAX(lc.proficiency)                AS proficiency,
    COUNT(*)::int                      AS bant_sayisi,
    MAX(lc.last_production_at)         AS last_production_at,
    bool_or(lc.approved_by IS NOT NULL) AS onayli
FROM line_capability lc
JOIN production_line pl ON pl.id = lc.line_id
GROUP BY pl.workshop_id, lc.tenant_id, lc.dimension_code, lc.value_code, lc.attribute_type;

COMMENT ON VIEW v_workshop_capability IS
  'Atölye seviyesi yetkinlik = bantlarının max''ı (plan §023). Kaynak line_capability; buraya YAZILMAZ.';

COMMIT;
