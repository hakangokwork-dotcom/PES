-- ============================================================
-- Migration 038b — work_order durum geçmişi tetikleyicisi tenant_id yazsın
-- ============================================================
--
-- HATA: trg_wo_status_history (017) work_order_status_history'ye
-- tenant_id YAZMIYOR. 019b tenant izolasyonu bu tabloyu da kapsıyor;
-- pes_app rolüyle bir iş emrinin durumu değişince geçmiş satırı RLS'e
-- takılır: "new row violates row-level security policy for table
-- work_order_status_history". Havuz modunda (038) Taslak → Planlandi
-- geçişi bunu ilk kez sistematik olarak tetikledi; hızlı durum düğmeleri
-- de aynı yola çıkıyor.
--
-- DÜZELTME: satır iş emrinin tenant'ıyla yazılır. Başka değişiklik yok.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_wo_status_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.durum IS DISTINCT FROM NEW.durum THEN
    INSERT INTO work_order_status_history (tenant_id, work_order_id, eski_durum, yeni_durum, tarih)
    VALUES (NEW.tenant_id, NEW.id, OLD.durum, NEW.durum, now());
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;

-- DOĞRULAMA: npx vitest run lib/pes/yerlestir-kaydet.test.ts → havuz modu testi geçer
-- ROLLBACK: 017'deki gövde (tenant_id'siz INSERT) ile CREATE OR REPLACE FUNCTION.
