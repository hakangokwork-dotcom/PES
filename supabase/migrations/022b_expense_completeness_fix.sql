-- ============================================================
-- Migration 022b — v_expense_groups doluluk oranı düzeltmesi
-- ============================================================
--
-- SORUN:
--   021'de doluluk_orani "kalem IS NOT NULL" sayıyordu. Ama
--   monthly_expense'in ilk 12 kalemi (005_pes_schema mirası)
--   NOT NULL DEFAULT 0 olarak tanımlı — hiç doldurulmamış kalem de
--   0 olarak görünür, NULL asla olmaz.
--
--   Sonuç: hiçbir gider beyan etmemiş bir atölye bile %44 doluluk
--   alıyordu (12/27). Doluluk sinyali işe yaramaz durumdaydı ve
--   022 güven skorunun completeness boyutu bu yanlış sinyale
--   dayanıyordu.
--
-- ÇÖZÜM:
--   "Beyan edilmiş" = dolu VE sıfırdan farklı.
--   Yan etki: gerçekten sıfır olan kalem (doğalgazı olmayan atölye)
--   eksik sayılır. Kabul edilebilir — şema bu iki durumu ayırt
--   edemiyor ve 0'ı "beyan" saymak çok daha yanıltıcı.
--
--   lib/pes/validation-rules.ts içindeki scoreCompleteness aynı
--   kuralı uygular; ikisi tutarlı olmalı.
--
-- NOT: Yalnız view değişir; tablo şeması ve veri korunur.
-- ============================================================

BEGIN;

CREATE OR REPLACE VIEW v_expense_groups AS
SELECT
    me.id,
    me.tenant_id,
    me.workshop_id,
    me.year,
    me.month,
    me.work_days,

    COALESCE(me.personnel,0) + COALESCE(me.sgk,0) + COALESCE(me.overtime,0)
      + COALESCE(me.bonus,0) + COALESCE(me.severance_reserve,0)            AS g1_iscilik,
    COALESCE(me.food,0) + COALESCE(me.transport,0)                          AS g2_personel_yan,
    COALESCE(me.electricity,0) + COALESCE(me.water,0) + COALESCE(me.gas,0)  AS g3_enerji,
    COALESCE(me.rent,0) + COALESCE(me.building_depr,0)                      AS g4_mekan,
    COALESCE(me.machine_depr,0) + COALESCE(me.machine_maint,0)              AS g5_makine,
    COALESCE(me.thread,0) + COALESCE(me.needle,0)
      + COALESCE(me.consumables,0)                                          AS g6_sarf,
    COALESCE(me.insurance,0) + COALESCE(me.isg,0) + COALESCE(me.consulting,0)
      + COALESCE(me.official_fees,0) + COALESCE(me.communication,0)
      + COALESCE(me.stationery,0) + COALESCE(me.cargo,0)
      + COALESCE(me.vehicle,0)                                              AS g7_dis_hizmet,
    COALESCE(me.other,0)                                                    AS g8_diger,

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

    -- DÜZELTME: NULL değil "sıfırdan farklı" sayılır
    (
      (COALESCE(me.personnel,0)         <> 0)::int + (COALESCE(me.sgk,0)               <> 0)::int
    + (COALESCE(me.food,0)              <> 0)::int + (COALESCE(me.electricity,0)       <> 0)::int
    + (COALESCE(me.water,0)             <> 0)::int + (COALESCE(me.gas,0)               <> 0)::int
    + (COALESCE(me.transport,0)         <> 0)::int + (COALESCE(me.vehicle,0)           <> 0)::int
    + (COALESCE(me.cargo,0)             <> 0)::int + (COALESCE(me.machine_maint,0)     <> 0)::int
    + (COALESCE(me.thread,0)            <> 0)::int + (COALESCE(me.other,0)             <> 0)::int
    + (COALESCE(me.rent,0)              <> 0)::int + (COALESCE(me.building_depr,0)     <> 0)::int
    + (COALESCE(me.machine_depr,0)      <> 0)::int + (COALESCE(me.insurance,0)         <> 0)::int
    + (COALESCE(me.overtime,0)          <> 0)::int + (COALESCE(me.bonus,0)             <> 0)::int
    + (COALESCE(me.severance_reserve,0) <> 0)::int + (COALESCE(me.incentive_amount,0)  <> 0)::int
    + (COALESCE(me.isg,0)               <> 0)::int + (COALESCE(me.consulting,0)        <> 0)::int
    + (COALESCE(me.official_fees,0)     <> 0)::int + (COALESCE(me.communication,0)     <> 0)::int
    + (COALESCE(me.stationery,0)        <> 0)::int + (COALESCE(me.needle,0)            <> 0)::int
    + (COALESCE(me.consumables,0)       <> 0)::int
    )::numeric / 27.0                                                       AS doluluk_orani
FROM monthly_expense me;

COMMENT ON VIEW v_expense_groups IS 'Kanonik gider grupları G1-G8 + brüt/net çift defter + doluluk oranı. doluluk_orani: sıfırdan farklı kalem sayısı / 27 (022b — eski 12 kalem NOT NULL DEFAULT 0 olduğu için NULL kontrolü işe yaramıyordu). GRUPLAMA GEÇİCİ — ATOLYE-BENCHMARK-SISTEMI.md v0.2 ile doğrulanmalı.';

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA (manuel)
-- ============================================================
-- SELECT workshop_id, year, month, round(doluluk_orani*100,1) AS pct
-- FROM v_expense_groups ORDER BY pct LIMIT 5;
--   -- yalnız personel+sgk+yemek girilmiş satır ~%11 olmalı (%44 değil)
