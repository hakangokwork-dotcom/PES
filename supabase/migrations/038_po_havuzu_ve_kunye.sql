-- ============================================================
-- Migration 038 — PO havuzu ve künye
-- ============================================================
-- Kaynak tasarım: docs/superpowers/specs/2026-09-21-po-havuzu-ve-kunye-design.md
-- Uygulama planı:  docs/superpowers/plans/2026-09-21-po-havuzu-ve-kunye.md
--
-- NE EKLİYOR:
--   1. work_order.workshop_id nullable — NULL = havuzda, henüz atanmadı (K1).
--   2. Künye: altı katalog kodu + kumaşçı (K3). FK yok; katalog (dimension_id,
--      code) tekil, tek kolon FK kuramaz. API lib/pes/kunye.ts ile doğrular.
--   3. 035'in "OR workshop_id IS NULL" kuralı work_order ve work_order_stage
--      için EZİLİYOR (K2). İki tablo ticari kayıt, ortak katalog değil:
--      NULL "herkese açık" değil "henüz atanmadı" / "siparişin atölyesi".
--   4. v_work_order_full künye kolonlarını taşır — iş emri GET'i bu view'dan
--      SELECT * okuyor, kolonlar açık listeli, yenisi kendiliğinden gelmez.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. Havuz ----------
ALTER TABLE work_order ALTER COLUMN workshop_id DROP NOT NULL;
COMMENT ON COLUMN work_order.workshop_id IS
'NULL = havuzda, henüz atölyeye atanmadı (durum Taslak). Yerleştirme yazar; başka yerden yazılmaz.';

-- ---------- 2. Künye ----------
ALTER TABLE work_order
  ADD COLUMN IF NOT EXISTS ana_grup_kodu     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS klasman_kodu      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kumas_turu_kodu   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kumas_grubu_kodu  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cinsiyet_yas_kodu VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kalite_kodu       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kumasci           VARCHAR(150);

COMMENT ON COLUMN work_order.klasman_kodu IS
'capability_value.code (boyut: klasman). line_capability.value_code ile aynı katalog — yetkinlik eşleşmesi buradan.';

CREATE INDEX IF NOT EXISTS idx_wo_havuz ON work_order(tenant_id, durum) WHERE workshop_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_wo_klasman ON work_order(klasman_kodu);

-- ---------- 3. 035 istisnası ----------
-- work_order: NULL atölye yalnız merkeze görünür.
DROP POLICY IF EXISTS work_order_tenant_isolation ON work_order;
CREATE POLICY work_order_tenant_isolation ON work_order FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin())
    AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()));

-- work_order_stage: aşamanın kendi atölyesi doluysa o; NULL ise İŞ EMRİNİN
-- atölyesi (030 K4). Alt sorgu work_order'ın RLS'inden geçer — iş emrini
-- göremeyen aşamasını da göremez; istenen davranış bu.
DROP POLICY IF EXISTS work_order_stage_tenant_isolation ON work_order_stage;
CREATE POLICY work_order_stage_tenant_isolation ON work_order_stage FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin())
    AND (current_workshop_id() IS NULL
         OR workshop_id = current_workshop_id()
         OR (workshop_id IS NULL AND EXISTS (
               SELECT 1 FROM work_order wo
                WHERE wo.id = work_order_stage.work_order_id
                  AND wo.workshop_id = current_workshop_id()))));

-- ---------- 4. v_work_order_full künyeyi taşısın ----------
-- Gövde pg_get_viewdef('v_work_order_full') çıktısıdır; CREATE OR REPLACE
-- yalnız SONA kolon eklemeye izin verir — mevcut sıra ve adlar aynen,
-- yedi künye kolonu aciliyet'ten sonra. Grant'ler (028) korunur.
CREATE OR REPLACE VIEW v_work_order_full AS
 SELECT wo.id,
    wo.is_emri_no,
    wo.workshop_id,
    wo.line_id,
    wo.musteri,
    wo.siparis_no,
    wo.model_adi,
    wo.stil_kodu,
    wo.siparis_miktari,
    wo.baslangic_tarihi,
    wo.bitis_tarihi,
    wo.teslim_tarihi,
    wo.mtm_toplam_sn,
    wo.sam_toplam_sn,
    wo.darbogaz_op,
    wo.darbogaz_sure_sn,
    wo.anlasmali_fiyat,
    wo.yikama_fiyati,
    wo.durum,
    wo.tamamlanan_adet,
    wo.notlar,
    wo.created_at,
    wo.updated_at,
    wo.oncelik,
    wo.risk_seviyesi,
    wo.ilerleme_pct,
    wo.materyal_durumu_pct,
    wo.musteri_kodu,
    wo.musteri_iletisim,
    wo.sezon,
    wo.sample_onaylandi,
    wo.tech_pack_onaylandi,
    wo.notlar_genel,
    wo.etiketler,
    wo.paylasim_admin,
    w.code AS workshop_code,
    w.name AS workshop_name,
    pl.code AS line_code,
    pl.name AS line_name,
    COALESCE(stage_summary.toplam_asama, 0::bigint) AS toplam_asama,
    COALESCE(stage_summary.tamamlanan_asama, 0::bigint) AS tamamlanan_asama,
    COALESCE(stage_summary.devam_asama, 0::bigint) AS devam_asama,
    COALESCE(material_summary.toplam_malzeme, 0::bigint) AS toplam_malzeme,
    COALESCE(material_summary.gelen_malzeme, 0::bigint) AS gelen_malzeme,
    COALESCE(material_summary.eksik_malzeme, 0::bigint) AS eksik_malzeme,
    COALESCE(journal_summary.problem_sayisi, 0::bigint) AS problem_sayisi,
    COALESCE(journal_summary.acik_problem, 0::bigint) AS acik_problem,
    journal_summary.son_journal_tarih,
        CASE
            WHEN wo.teslim_tarihi IS NULL THEN NULL::integer
            WHEN wo.durum::text = 'Tamamlandi'::text THEN 0
            ELSE wo.teslim_tarihi - CURRENT_DATE
        END AS teslim_kalan_gun,
        CASE
            WHEN wo.teslim_tarihi IS NULL OR (wo.durum::text = ANY (ARRAY['Tamamlandi'::character varying, 'Sevk Edildi'::character varying, 'İptal'::character varying]::text[])) THEN 'normal'::text
            WHEN (wo.teslim_tarihi - CURRENT_DATE) < 0 THEN 'kritik'::text
            WHEN (wo.teslim_tarihi - CURRENT_DATE) <= 3 THEN 'acil'::text
            WHEN (wo.teslim_tarihi - CURRENT_DATE) <= 7 THEN 'yakin'::text
            ELSE 'normal'::text
        END AS aciliyet,
    wo.ana_grup_kodu,
    wo.klasman_kodu,
    wo.kumas_turu_kodu,
    wo.kumas_grubu_kodu,
    wo.cinsiyet_yas_kodu,
    wo.kalite_kodu,
    wo.kumasci
   FROM work_order wo
     LEFT JOIN workshop w ON wo.workshop_id = w.id
     LEFT JOIN production_line pl ON wo.line_id = pl.id
     LEFT JOIN LATERAL ( SELECT count(*) AS toplam_asama,
            count(*) FILTER (WHERE work_order_stage.durum::text = 'Tamamlandi'::text) AS tamamlanan_asama,
            count(*) FILTER (WHERE work_order_stage.durum::text = 'Devam'::text) AS devam_asama
           FROM work_order_stage
          WHERE work_order_stage.work_order_id = wo.id) stage_summary ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS toplam_malzeme,
            count(*) FILTER (WHERE work_order_material.durum::text = 'Geldi'::text) AS gelen_malzeme,
            count(*) FILTER (WHERE work_order_material.durum::text = 'Eksik'::text) AS eksik_malzeme
           FROM work_order_material
          WHERE work_order_material.work_order_id = wo.id) material_summary ON true
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE work_order_journal.tip::text = 'PROBLEM'::text) AS problem_sayisi,
            count(*) FILTER (WHERE work_order_journal.tip::text = 'PROBLEM'::text AND NOT work_order_journal.resolved) AS acik_problem,
            max(work_order_journal.tarih) AS son_journal_tarih
           FROM work_order_journal
          WHERE work_order_journal.work_order_id = wo.id) journal_summary ON true;

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='v_work_order_full' AND column_name LIKE '%_kodu' → 6 satır (+ kumasci)
-- npx vitest run lib/pes/po-havuzu-izolasyon.test.ts   → 5 test geçer
-- node scripts/verify_workshop_isolation.mjs           → sızıntı yok
--
-- ROLLBACK:
--   BEGIN;
--   DROP POLICY IF EXISTS work_order_stage_tenant_isolation ON work_order_stage;
--   CREATE POLICY work_order_stage_tenant_isolation ON work_order_stage FOR ALL USING (
--       (tenant_id = current_tenant_id() OR is_internal_admin())
--       AND (current_workshop_id() IS NULL OR workshop_id IS NULL OR workshop_id = current_workshop_id()));
--   DROP POLICY IF EXISTS work_order_tenant_isolation ON work_order;
--   CREATE POLICY work_order_tenant_isolation ON work_order FOR ALL USING (
--       (tenant_id = current_tenant_id() OR is_internal_admin())
--       AND (current_workshop_id() IS NULL OR workshop_id IS NULL OR workshop_id = current_workshop_id()));
--   -- view: kolon düşürmek CREATE OR REPLACE ile olmaz; DROP VIEW + 017'deki gövde + 028 REVOKE/GRANT
--   DROP INDEX IF EXISTS idx_wo_klasman; DROP INDEX IF EXISTS idx_wo_havuz;
--   ALTER TABLE work_order DROP COLUMN IF EXISTS ana_grup_kodu, DROP COLUMN IF EXISTS klasman_kodu,
--       DROP COLUMN IF EXISTS kumas_turu_kodu, DROP COLUMN IF EXISTS kumas_grubu_kodu,
--       DROP COLUMN IF EXISTS cinsiyet_yas_kodu, DROP COLUMN IF EXISTS kalite_kodu,
--       DROP COLUMN IF EXISTS kumasci;
--   -- Önce havuz satırı kalmadığından emin ol: SELECT count(*) FROM work_order WHERE workshop_id IS NULL;
--   ALTER TABLE work_order ALTER COLUMN workshop_id SET NOT NULL;
--   COMMIT;
-- ============================================================
