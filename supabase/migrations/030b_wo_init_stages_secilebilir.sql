-- ============================================================
-- Migration 030b — wo_init_stages seçilebilir zincir alır
-- ============================================================
-- 017'deki hali yalnız zorunlu=TRUE aşamaları açıyordu; yıkama ve sevk
-- hiç açılmıyordu. Artık zincir sipariş bazında seçiliyor (030 / Görev 6),
-- bu fonksiyon da aynı zinciri kabul etmeli. Parametre verilmezse eski
-- davranışı sürdürür — mevcut çağıranlar bozulmasın.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION wo_init_stages(
    p_wo_id INTEGER,
    p_kodlar TEXT[] DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  ins_count INTEGER := 0;
BEGIN
  INSERT INTO work_order_stage (work_order_id, tenant_id, stage_id, sira_no, durum)
  SELECT p_wo_id, wo.tenant_id, ps.id, ps.sira_no, 'Beklemede'
  FROM production_stage ps
  CROSS JOIN (SELECT tenant_id FROM work_order WHERE id = p_wo_id) wo
  WHERE (CASE WHEN p_kodlar IS NULL THEN ps.zorunlu ELSE ps.code = ANY(p_kodlar) END)
    AND NOT EXISTS (
      SELECT 1 FROM work_order_stage wos
      WHERE wos.work_order_id = p_wo_id AND wos.stage_id = ps.id
    );
  GET DIAGNOSTICS ins_count = ROW_COUNT;
  RETURN ins_count;
END;
$$;

COMMENT ON FUNCTION wo_init_stages(INTEGER, TEXT[]) IS
'İş emrinin aşama zincirini açar. p_kodlar verilirse o zincir, verilmezse zorunlu aşamalar. tenant_id iş emrinden alınır — 019b RLS''i onsuz insert''i reddeder.';

COMMIT;

-- DOĞRULAMA:
--   SELECT wo_init_stages(<test_wo_id>, ARRAY['KESIM','DIKIM','YIKAMA','UKP','SEVK']);
--   -- 5 dönmeli
