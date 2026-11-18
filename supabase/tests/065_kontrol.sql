-- supabase/tests/065_kontrol.sql — yalnız _migrate_kuru.mjs ile, işlem içinde çalışır.

DO $$
DECLARE t UUID; w INT; o INT; wo INT; st INT; s_kesim INT; n INT; v RECORD;
BEGIN
    -- ---------- 1. Eşitleme ----------
    SELECT count(*) INTO n FROM is_ortagi io JOIN workshop ws ON ws.id = io.workshop_id
     WHERE (io.unvan, io.aktif) IS DISTINCT FROM (ws.name, coalesce(ws.is_active, true));
    IF n > 0 THEN RAISE EXCEPTION 'KONTROL: tek seferlik eşitlemeden sonra % fark kaldı', n; END IF;

    SELECT id, tenant_id INTO w, t FROM workshop WHERE tenant_id IS NOT NULL ORDER BY id LIMIT 1;
    SELECT id INTO o FROM is_ortagi WHERE workshop_id = w;
    UPDATE workshop SET name = '__K065 ad__', is_active = false WHERE id = w;
    PERFORM 1 FROM is_ortagi WHERE id = o AND unvan = '__K065 ad__' AND NOT aktif;
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: atölye adı/aktifliği ortağa geçmedi'; END IF;
    UPDATE workshop SET is_active = true WHERE id = w;
    PERFORM 1 FROM is_ortagi WHERE id = o AND aktif;
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: atölye yeniden aktif, ortak pasif kaldı'; END IF;

    -- ---------- 2. Revizyon sayısı ----------
    INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum)
        VALUES (t, w, '__K065__', 'K', 100, 'Planlandi') RETURNING id INTO wo;
    SELECT id INTO s_kesim FROM production_stage WHERE code = 'KESIM';
    -- Önce yalnız firma (tarihsiz satır), sonra ilk plan: revizyon 0
    INSERT INTO work_order_stage (tenant_id, work_order_id, stage_id, is_ortagi_id) VALUES (t, wo, s_kesim, o) RETURNING id INTO st;
    UPDATE work_order_stage SET plan_baslangic = DATE '2026-12-01', plan_bitis = DATE '2026-12-05' WHERE id = st;
    SELECT * INTO v FROM v_is_emri_adim WHERE stage_kayit_id = st;
    IF v.revizyon_sayisi <> 0 THEN RAISE EXCEPTION 'KONTROL: ilk plan revizyon sayıldı (%)', v.revizyon_sayisi; END IF;

    -- Yalnız firma değişir: revizyon değil
    UPDATE work_order_stage SET is_ortagi_id = NULL WHERE id = st;
    SELECT * INTO v FROM v_is_emri_adim WHERE stage_kayit_id = st;
    IF v.revizyon_sayisi <> 0 THEN RAISE EXCEPTION 'KONTROL: firma değişikliği revizyon sayıldı (%)', v.revizyon_sayisi; END IF;

    -- A → B → A: iki değişiklik (064'te 1 sayılıyordu)
    UPDATE work_order_stage SET plan_bitis = DATE '2026-12-09' WHERE id = st;
    UPDATE work_order_stage SET plan_bitis = DATE '2026-12-05' WHERE id = st;
    SELECT * INTO v FROM v_is_emri_adim WHERE stage_kayit_id = st;
    IF v.revizyon_sayisi <> 2 OR v.ilk_plan_bitis <> DATE '2026-12-05' OR v.plan_kayma_gun <> 0 THEN
        RAISE EXCEPTION 'KONTROL: görünüm rev=% ilk=% kayma=%', v.revizyon_sayisi, v.ilk_plan_bitis, v.plan_kayma_gun;
    END IF;

    -- Yetki korunur
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app')
       AND NOT has_table_privilege('pes_app', 'v_is_emri_adim', 'SELECT') THEN
        RAISE EXCEPTION 'KONTROL: pes_app görünümü okuyamıyor';
    END IF;

    RAISE NOTICE '065 kontrolleri geçti';
END $$;
