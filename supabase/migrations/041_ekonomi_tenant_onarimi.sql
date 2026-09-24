-- 041 — Ekonomi satırlarının kiracısını düzelt (E0 import hatası)
--
-- HATA: scripts/import_ekonomi_anket.mjs kiracıyı şöyle buluyordu:
--
--     const atolyeler = await sql`SELECT id, code, name, tenant_id FROM workshop`
--     const tenantId = atolyeler[0]?.tenant_id
--
-- Sırasız bir sorgunun İLK satırının kiracısı alınıp BÜTÜN satırlara
-- yazılmış. Satırın hangi atölyeye ait olduğuna hiç bakılmamış.
--
-- SONUCU: 11 pilot atölyenin hepsi 'default' kiracısında, ama ekonomi
-- satırları 'demo-atolye' kiracısına yazılmış. RLS kiracıya göre süzdüğü
-- için ekonomi ekranları uygulamada HERKESE BOŞ görünüyordu:
--   - default kullanıcısı (10 kişi): 131 atölye, 0 ekonomi satırı
--   - demo-atolye kullanıcısı (2 kişi): 33 satır ama alakasız 8 atölye
--
-- Hata yönetici bağlantısıyla (BYPASSRLS) yapılan doğrulamalarda görünmez;
-- bu yüzden E0/E1/E2 boyunca fark edilmedi.
--
-- Doğrusu tek cümle: bir atölyeye ait satırın kiracısı, O ATÖLYENİN
-- kiracısıdır. Aşağıdaki üç UPDATE bunu uyguluyor.
--
-- monthly_expense'in 69 satırının 33'ü aynı import'tan geldiği için bozuk;
-- kalan 36 satır başka akıştan gelmiş ve zaten doğru — WHERE şartı yalnız
-- uyumsuz olanlara dokunuyor.

BEGIN;

UPDATE workshop_economy we
   SET tenant_id = w.tenant_id
  FROM workshop w
 WHERE w.id = we.workshop_id
   AND we.tenant_id <> w.tenant_id;

UPDATE economy_survey_staging es
   SET tenant_id = w.tenant_id
  FROM workshop w
 WHERE w.id = es.workshop_id
   AND es.tenant_id <> w.tenant_id;

UPDATE monthly_expense me
   SET tenant_id = w.tenant_id
  FROM workshop w
 WHERE w.id = me.workshop_id
   AND me.tenant_id <> w.tenant_id;

-- Onarımın gerçekten tuttuğunu migration'ın kendisi kanıtlasın: kalan
-- uyumsuz satır varsa işlem geri alınır, yarım onarım bırakılmaz.
DO $$
DECLARE kalan INTEGER;
BEGIN
    SELECT (SELECT count(*) FROM workshop_economy x JOIN workshop w ON w.id = x.workshop_id
             WHERE x.tenant_id <> w.tenant_id)
         + (SELECT count(*) FROM economy_survey_staging x JOIN workshop w ON w.id = x.workshop_id
             WHERE x.tenant_id <> w.tenant_id)
         + (SELECT count(*) FROM monthly_expense x JOIN workshop w ON w.id = x.workshop_id
             WHERE x.tenant_id <> w.tenant_id)
      INTO kalan;

    IF kalan > 0 THEN
        RAISE EXCEPTION 'Onarim tamamlanmadi: % satir hala uyumsuz', kalan;
    END IF;
END $$;

COMMIT;
