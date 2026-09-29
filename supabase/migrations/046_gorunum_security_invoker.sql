-- 046: RLS'i atlayan iki görünüm kapatıldı.
--
-- SORUN: v_work_order_full ve v_expense_groups `security_invoker` olmadan
-- tanımlıydı. Postgres'te böyle bir görünüm SAHİBİNİN (postgres) haklarıyla
-- çalışır ve alttaki tabloların RLS'ini hiç uygulamaz: ne atölye kısıtı
-- (033) ne kiracı kısıtı (019). Diğer 13 görünüm doğru tanımlıydı; bu ikisi
-- sonradan CREATE OR REPLACE ile yeniden yazılırken (037, 038) seçenek
-- düşmüş ya da hiç konmamıştı.
--
-- NASIL FARK EDİLDİ: merkez yöneticisi atölye panelinde bir atölye seçip
-- onun hesabıyla girmiş gibi çalışırken /api/pes/work-orders 9 farklı
-- atölyenin iş emirlerini döndürdü; aynı anda /api/pes/workshops doğru
-- biçimde yalnız o atölyeyi döndürüyordu. Gerçek atölye hesapları
-- açıldığında İş Emri ekranı her atölyeye herkesin iş emrini gösterirdi.
--
-- ALTER VIEW ... SET seçeneği kalıcıdır; sonraki bir CREATE OR REPLACE
-- VIEW yine düşürebilir — yeniden yazan migration WITH (security_invoker
-- = true) koymalı.

ALTER VIEW v_work_order_full SET (security_invoker = true);
ALTER VIEW v_expense_groups  SET (security_invoker = true);

-- Doğrulama: public şemada security_invoker'sız görünüm kalmamalı.
DO $$
DECLARE eksik text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO eksik
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'], false);
  IF eksik IS NOT NULL THEN
    RAISE EXCEPTION 'security_invoker eksik görünümler: %', eksik;
  END IF;
END $$;
