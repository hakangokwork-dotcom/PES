-- ============================================================
-- Migration 021 — Gider Beyanı v2 (genişletme + staging + grup view)
-- PES Entegrasyon Planı v0.1, Sprint 1
-- Ref: PES-ENTEGRASYON-PLANI.md §2 / 021_expense_v2.sql
-- ============================================================
--
-- BU MIGRATION GÜVENLİDİR — yalnız additive DDL.
-- Mevcut monthly_expense satırları korunur; yeni kolonlar NULL başlar.
-- Eski 13 kalemi okuyan route/sayfalar etkilenmez.
--
-- İçerik:
--   1. monthly_expense'e 15 yeni gider kalemi
--   2. expense_declaration_staging — ham form satırı (izlenebilirlik)
--   3. v_expense_groups — kanonik G1-G8 rasyo katmanı
--   4. RLS + FORCE + tenant_isolation (019b kalıbı)
--
-- ⚠️ G1-G8 GRUP TANIMI GEÇİCİDİR
-- Plan §2/021 "kanonik 8 grup" diyor ama içeriğini tanımlamıyor; kaynak
-- doküman (ATOLYE-BENCHMARK-SISTEMI.md v0.2) bu repoda yok. Aşağıdaki
-- gruplama mevcut kalemlerden türetilmiş makul bir varsayımdır.
-- Kaynak doküman geldiğinde YALNIZ bu view güncellenir — tablo şeması
-- değişmez (planın "rasyo katmanı sabit kalır" ilkesi tam olarak bunun için).
-- ============================================================

BEGIN;

-- ============================================================
-- 1. MONTHLY_EXPENSE — 15 YENİ KALEM
-- ============================================================
-- Mevcut 13 kalem: personnel, sgk, food, electricity, water, gas,
--                  transport, vehicle, cargo, machine_maint, thread, other
ALTER TABLE monthly_expense
    ADD COLUMN IF NOT EXISTS rent               NUMERIC(14,2),  -- kira
    ADD COLUMN IF NOT EXISTS building_depr      NUMERIC(14,2),  -- bina amortismanı
    ADD COLUMN IF NOT EXISTS machine_depr       NUMERIC(14,2),  -- makine amortismanı
    ADD COLUMN IF NOT EXISTS insurance          NUMERIC(14,2),  -- sigorta (bina/makine)
    ADD COLUMN IF NOT EXISTS overtime           NUMERIC(14,2),  -- fazla mesai
    ADD COLUMN IF NOT EXISTS bonus              NUMERIC(14,2),  -- prim / ikramiye
    ADD COLUMN IF NOT EXISTS severance_reserve  NUMERIC(14,2),  -- kıdem tazminatı karşılığı
    ADD COLUMN IF NOT EXISTS incentive_amount   NUMERIC(14,2),  -- teşvik (GİDER DEĞİL — mahsup)
    ADD COLUMN IF NOT EXISTS isg                NUMERIC(14,2),  -- iş sağlığı ve güvenliği
    ADD COLUMN IF NOT EXISTS consulting         NUMERIC(14,2),  -- danışmanlık / müşavirlik
    ADD COLUMN IF NOT EXISTS official_fees      NUMERIC(14,2),  -- resmi harç / vergi
    ADD COLUMN IF NOT EXISTS communication      NUMERIC(14,2),  -- telefon / internet
    ADD COLUMN IF NOT EXISTS stationery         NUMERIC(14,2),  -- kırtasiye
    ADD COLUMN IF NOT EXISTS needle             NUMERIC(14,2),  -- iğne
    ADD COLUMN IF NOT EXISTS consumables        NUMERIC(14,2);  -- diğer sarf

COMMENT ON COLUMN monthly_expense.incentive_amount IS 'Teşvik tutarı. Gider DEĞİL, mahsup kalemi — G1-G8 toplamına girmez, net maliyette düşülür.';
COMMENT ON COLUMN monthly_expense.severance_reserve IS 'Kıdem tazminatı karşılığı (tahakkuk). Nakit çıkışı değil, dönemsel karşılık.';

-- ============================================================
-- 2. EXPENSE_DECLARATION_STAGING — ham beyan (izlenebilirlik)
-- ============================================================
-- İlke: gelen ham satır DOKUNULMADAN saklanır. Temizlik/eşleme sonrası
-- monthly_expense'e yazılır; ham kayıt denetim izi olarak kalır.
CREATE TABLE IF NOT EXISTS expense_declaration_staging (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    source        TEXT NOT NULL CHECK (source IN ('forms_xlsx','manual','api')),
    source_ref    TEXT,                                  -- dosya adı / form yanıt id
    donem         VARCHAR(20) NOT NULL,                  -- 'YYYY-MM'
    raw           JSONB NOT NULL,                        -- ham satır, hiç işlenmemiş
    workshop_id   INTEGER REFERENCES workshop(id) ON DELETE SET NULL,
    match_status  TEXT NOT NULL DEFAULT 'unmatched'
                  CHECK (match_status IN ('unmatched','matched','ambiguous','rejected')),
    match_note    TEXT,
    promoted_at   TIMESTAMPTZ,                           -- monthly_expense'e yazıldığı an
    created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_staging_tenant ON expense_declaration_staging(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expense_staging_donem  ON expense_declaration_staging(donem);
CREATE INDEX IF NOT EXISTS idx_expense_staging_status ON expense_declaration_staging(match_status)
    WHERE match_status <> 'matched';
CREATE INDEX IF NOT EXISTS idx_expense_staging_ws     ON expense_declaration_staging(workshop_id);

COMMENT ON TABLE  expense_declaration_staging IS 'Gider beyanı ham katmanı. raw JSONB hiçbir zaman güncellenmez — 022 güven skoru bu ham veriyi referans alır.';
COMMENT ON COLUMN expense_declaration_staging.promoted_at IS 'NULL ise henüz monthly_expense''e aktarılmamış.';

-- ============================================================
-- 3. V_EXPENSE_GROUPS — kanonik G1-G8 rasyo katmanı
-- ============================================================
-- Ham kalemler değişse de bu view'in kolon seti sabit kalır.
-- COALESCE ile NULL kalemler 0 sayılır (kısmi beyan toplamı bozmasın).
CREATE OR REPLACE VIEW v_expense_groups AS
SELECT
    me.id,
    me.tenant_id,
    me.workshop_id,
    me.year,
    me.month,
    me.work_days,

    -- G1 Doğrudan işçilik
    COALESCE(me.personnel,0) + COALESCE(me.sgk,0) + COALESCE(me.overtime,0)
      + COALESCE(me.bonus,0) + COALESCE(me.severance_reserve,0)            AS g1_iscilik,

    -- G2 Personel yan hakları
    COALESCE(me.food,0) + COALESCE(me.transport,0)                          AS g2_personel_yan,

    -- G3 Enerji
    COALESCE(me.electricity,0) + COALESCE(me.water,0) + COALESCE(me.gas,0)  AS g3_enerji,

    -- G4 Mekân
    COALESCE(me.rent,0) + COALESCE(me.building_depr,0)                      AS g4_mekan,

    -- G5 Makine ve bakım
    COALESCE(me.machine_depr,0) + COALESCE(me.machine_maint,0)              AS g5_makine,

    -- G6 Üretim sarf
    COALESCE(me.thread,0) + COALESCE(me.needle,0)
      + COALESCE(me.consumables,0)                                          AS g6_sarf,

    -- G7 Dış hizmet ve yasal
    COALESCE(me.insurance,0) + COALESCE(me.isg,0) + COALESCE(me.consulting,0)
      + COALESCE(me.official_fees,0) + COALESCE(me.communication,0)
      + COALESCE(me.stationery,0) + COALESCE(me.cargo,0)
      + COALESCE(me.vehicle,0)                                              AS g7_dis_hizmet,

    -- G8 Diğer
    COALESCE(me.other,0)                                                    AS g8_diger,

    -- Brüt toplam (G1..G8)
    COALESCE(me.personnel,0) + COALESCE(me.sgk,0) + COALESCE(me.overtime,0)
      + COALESCE(me.bonus,0) + COALESCE(me.severance_reserve,0)
      + COALESCE(me.food,0) + COALESCE(me.transport,0)
      + COALESCE(me.electricity,0) + COALESCE(me.water,0) + COALESCE(me.gas,0)
      + COALESCE(me.rent,0) + COALESCE(me.building_depr,0)
      + COALESCE(me.machine_depr,0) + COALESCE(me.machine_maint,0)
      + COALESCE(me.thread,0) + COALESCE(me.needle,0) + COALESCE(me.consumables,0)
      + COALESCE(me.insurance,0) + COALESCE(me.isg,0) + COALESCE(me.consulting,0)
      + COALESCE(me.official_fees,0) + COALESCE(me.communication,0)
      + COALESCE(me.stationery,0) + COALESCE(me.cargo,0) + COALESCE(me.vehicle,0)
      + COALESCE(me.other,0)                                                AS toplam_brut,

    -- Teşvik mahsubu ve net (çift defter — plan §1 K3)
    COALESCE(me.incentive_amount,0)                                         AS tesvik,
    COALESCE(me.personnel,0) + COALESCE(me.sgk,0) + COALESCE(me.overtime,0)
      + COALESCE(me.bonus,0) + COALESCE(me.severance_reserve,0)
      + COALESCE(me.food,0) + COALESCE(me.transport,0)
      + COALESCE(me.electricity,0) + COALESCE(me.water,0) + COALESCE(me.gas,0)
      + COALESCE(me.rent,0) + COALESCE(me.building_depr,0)
      + COALESCE(me.machine_depr,0) + COALESCE(me.machine_maint,0)
      + COALESCE(me.thread,0) + COALESCE(me.needle,0) + COALESCE(me.consumables,0)
      + COALESCE(me.insurance,0) + COALESCE(me.isg,0) + COALESCE(me.consulting,0)
      + COALESCE(me.official_fees,0) + COALESCE(me.communication,0)
      + COALESCE(me.stationery,0) + COALESCE(me.cargo,0) + COALESCE(me.vehicle,0)
      + COALESCE(me.other,0)
      - COALESCE(me.incentive_amount,0)                                     AS toplam_net,

    -- Beyan doluluk oranı: 27 kalemden kaçı girilmiş (022 completeness girdisi)
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
    )::numeric / 27.0                                                       AS doluluk_orani
FROM monthly_expense me;

COMMENT ON VIEW v_expense_groups IS 'Kanonik gider grupları G1-G8 + brüt/net çift defter + doluluk oranı. GRUPLAMA GEÇİCİ — ATOLYE-BENCHMARK-SISTEMI.md v0.2 geldiğinde doğrulanmalı. Ham kalem şeması değişmeden bu view güncellenebilir.';

-- ============================================================
-- 4. RLS + FORCE + TENANT ISOLATION (019b kalıbı)
-- ============================================================
ALTER TABLE expense_declaration_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_declaration_staging FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_declaration_staging_tenant_isolation ON expense_declaration_staging;
CREATE POLICY expense_declaration_staging_tenant_isolation ON expense_declaration_staging
    FOR ALL USING (tenant_id = current_tenant_id() OR is_internal_admin());

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA (manuel)
-- ============================================================
-- 1. SELECT count(*) FROM information_schema.columns
--    WHERE table_name='monthly_expense';
--    -- 21 + 15 = 36 olmalı
--
-- 2. SELECT count(*) FROM monthly_expense;
--    -- migration öncesi ile aynı (24) — veri kaybı yok
--
-- 3. SELECT workshop_id, year, month, toplam_brut, toplam_net, doluluk_orani
--    FROM v_expense_groups LIMIT 5;
--    -- eski satırlarda yeni kalemler NULL → 0 sayılır, toplam bozulmaz
--
-- 4. SELECT relforcerowsecurity FROM pg_class
--    WHERE relname='expense_declaration_staging';
--    -- true
