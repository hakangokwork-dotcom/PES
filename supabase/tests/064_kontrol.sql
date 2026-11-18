-- supabase/tests/064_kontrol.sql — yalnız _migrate_kuru.mjs ile, işlem içinde çalışır.

-- ---------- 1. Kurallar (süper kullanıcı) ----------
DO $$
DECLARE t UUID; w INT; w2 INT; wo INT; o INT; r INT; yk INT; st INT; s_kesim INT; n INT; v RECORD;
BEGIN
    SELECT id, tenant_id INTO w, t FROM workshop WHERE tenant_id IS NOT NULL ORDER BY id LIMIT 1;
    SELECT id INTO w2 FROM workshop WHERE tenant_id = t AND id <> w ORDER BY id LIMIT 1;
    IF w2 IS NULL THEN RAISE EXCEPTION 'KONTROL: iki atölyeli tenant yok'; END IF;
    INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum)
        VALUES (t, w, '__K064__', 'K', 100, 'Planlandi') RETURNING id INTO wo;

    -- Geçiş: tenant'ı olan her atölyenin tek ortağı var (tenant'sız atölyeler hariç, sayısı bildirilir)
    SELECT count(*) INTO n FROM workshop WHERE tenant_id IS NULL;
    RAISE NOTICE '064: tenant_id NULL atölye sayısı (ortağı açılmaz): %', n;
    SELECT count(*) INTO n FROM workshop ws WHERE ws.tenant_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM is_ortagi io WHERE io.workshop_id = ws.id);
    IF n > 0 THEN RAISE EXCEPTION 'KONTROL: % atölyenin ortağı yok', n; END IF;
    SELECT id INTO o FROM is_ortagi WHERE workshop_id = w;

    -- Atölye tipi workshop'suz olamaz
    BEGIN
        INSERT INTO is_ortagi (tenant_id, tip, unvan) VALUES (t, 'Atölye', '__x__');
        RAISE EXCEPTION 'KONTROL: workshopsuz atölye ortağı girdi';
    EXCEPTION WHEN check_violation THEN NULL; END;

    -- Rota: Kesim (atölye) → Yıkama (yıkamacı, varsayılan firma)
    INSERT INTO is_ortagi (tenant_id, tip, unvan) VALUES (t, 'Yıkamacı', '__Yıkama A__') RETURNING id INTO yk;
    INSERT INTO rota_sablonu (tenant_id, ad) VALUES (t, '__kontrol rota__') RETURNING id INTO r;
    SELECT id INTO s_kesim FROM production_stage WHERE code = 'KESIM';
    INSERT INTO rota_operasyonu (sablon_id, sira, stage_id, ortak_tipi, zorunlu_formlar) VALUES (r, 10, s_kesim, 'Atölye', ARRAY['inline_kalite']);
    INSERT INTO rota_operasyonu (sablon_id, sira, stage_id, ortak_tipi, varsayilan_ortak_id)
        SELECT r, 20, id, 'Yıkamacı', yk FROM production_stage WHERE code = 'YIKAMA';

    UPDATE work_order SET rota_sablonu_id = r WHERE id = wo;
    PERFORM wo_rota_kur(wo);
    SELECT id INTO st FROM work_order_stage WHERE work_order_id = wo AND stage_id = s_kesim;
    PERFORM 1 FROM work_order_stage WHERE id = st AND is_ortagi_id = o AND zorunlu_formlar = ARRAY['inline_kalite'];
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: kesim adımı atölye ortağı/form almadı'; END IF;
    PERFORM 1 FROM work_order_stage s JOIN production_stage p ON p.id = s.stage_id
     WHERE s.work_order_id = wo AND p.code = 'YIKAMA' AND s.is_ortagi_id = yk;
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: yıkama adımı varsayılan firmayı almadı'; END IF;

    -- Plan geçmişi: ilk giriş + gerekçeli değişiklik
    UPDATE work_order_stage SET plan_baslangic = DATE '2026-12-01', plan_bitis = DATE '2026-12-05' WHERE id = st;
    PERFORM set_config('app.plan_gerekce', 'MALZEME_GEC', true);
    UPDATE work_order_stage SET plan_bitis = DATE '2026-12-09' WHERE id = st;
    PERFORM set_config('app.plan_gerekce', '', true);
    SELECT count(*) INTO n FROM adim_plan_gecmisi WHERE stage_kayit_id = st AND plan_bitis IS NOT NULL;
    IF n < 2 THEN RAISE EXCEPTION 'KONTROL: plan geçmişi % satır', n; END IF;
    PERFORM 1 FROM adim_plan_gecmisi WHERE stage_kayit_id = st AND plan_bitis = DATE '2026-12-09' AND gerekce_kodu = 'MALZEME_GEC';
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: gerekçe yazılmadı'; END IF;

    -- Plan dışı kolon değişince geçmiş yazılmaz
    SELECT count(*) INTO n FROM adim_plan_gecmisi WHERE stage_kayit_id = st;
    UPDATE work_order_stage SET notlar = 'x' WHERE id = st;
    PERFORM 1 FROM adim_plan_gecmisi WHERE stage_kayit_id = st HAVING count(*) = n;
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: plan dışı değişiklik geçmişe yazıldı'; END IF;

    -- Geçmiş silinmez / değişmez
    BEGIN
        DELETE FROM adim_plan_gecmisi WHERE stage_kayit_id = st;
        RAISE EXCEPTION 'KONTROL: plan geçmişi silindi';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
    BEGIN
        UPDATE adim_plan_gecmisi SET not_metni = 'oynandı' WHERE stage_kayit_id = st;
        RAISE EXCEPTION 'KONTROL: plan geçmişi değişti';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Görünüm: ilk plan 12-05, güncel 12-09, kayma 4, 1 revizyon
    SELECT * INTO v FROM v_is_emri_adim WHERE stage_kayit_id = st;
    IF v.ilk_plan_bitis <> DATE '2026-12-05' OR v.plan_kayma_gun <> 4 OR v.revizyon_sayisi <> 1 THEN
        RAISE EXCEPTION 'KONTROL: görünüm ilk=% kayma=% rev=%', v.ilk_plan_bitis, v.plan_kayma_gun, v.revizyon_sayisi;
    END IF;

    -- Sorun: neden kodu katalogdan, açık sorun sayısı görünümde
    INSERT INTO work_order_journal (tenant_id, work_order_id, stage_id, tip, aciklama, neden_kodu, etki)
        VALUES (t, wo, s_kesim, 'PROBLEM', '3 top en farkı', 'EN_FARKI', 'Kalite');
    SELECT * INTO v FROM v_is_emri_adim WHERE stage_kayit_id = st;
    IF v.acik_sorun <> 1 THEN RAISE EXCEPTION 'KONTROL: açık sorun %', v.acik_sorun; END IF;
    BEGIN
        INSERT INTO work_order_journal (tenant_id, work_order_id, tip, aciklama, neden_kodu) VALUES (t, wo, 'PROBLEM', 'x', 'YOK_BOYLE');
        RAISE EXCEPTION 'KONTROL: bilinmeyen neden kodu girdi';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;

    PERFORM set_config('k064.tenant', t::text, true);
    PERFORM set_config('k064.w2', w2::text, true);
    PERFORM set_config('k064.wo', wo::text, true);
    PERFORM set_config('k064.st', st::text, true);
    PERFORM set_config('k064.yk', yk::text, true);
END $$;

-- ---------- 2. RLS (pes_app, başka atölyenin oturumu) ----------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        RAISE NOTICE '064 RLS kontrolü ATLANDI: pes_app rolü yok';
    ELSE
        BEGIN
            IF NOT pg_has_role(current_user, 'pes_app', 'USAGE') THEN
                EXECUTE format('GRANT pes_app TO %I', current_user);
            END IF;
            EXECUTE 'SET LOCAL ROLE pes_app';
            PERFORM set_config('app.current_tenant_id', current_setting('k064.tenant'), true);
            PERFORM set_config('app.current_workshop_id', current_setting('k064.w2'), true);
            PERFORM set_config('app.is_internal', '', true);
        EXCEPTION WHEN insufficient_privilege OR invalid_grant_operation THEN
            RAISE NOTICE '064 RLS kontrolü ATLANDI: % kullanıcısı pes_app rolüne geçemiyor (%)', current_user, SQLERRM;
        END;
    END IF;
END $$;

DO $$
DECLARE n INT;
BEGIN
    IF current_user <> 'pes_app' THEN RETURN; END IF;
    SELECT count(*) INTO n FROM adim_plan_gecmisi WHERE stage_kayit_id = current_setting('k064.st')::int;
    IF n <> 0 THEN RAISE EXCEPTION 'KONTROL RLS: başka atölye plan geçmişini gördü (%)', n; END IF;
    SELECT count(*) INTO n FROM is_ortagi WHERE tenant_id = current_setting('k064.tenant')::uuid;
    IF n = 0 THEN RAISE EXCEPTION 'KONTROL RLS: atölye iş ortaklarını okuyamıyor'; END IF;
    BEGIN
        INSERT INTO is_ortagi (tenant_id, tip, unvan) VALUES (current_setting('k064.tenant')::uuid, 'Kumaşçı', '__atölye yazdı__');
        RAISE EXCEPTION 'KONTROL RLS: atölye iş ortağı yazdı';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RAISE NOTICE '064 yetki kontrolleri geçti (pes_app, atölye oturumu)';
END $$;

RESET ROLE;

-- ---------- 3. Zincirleme silme: ortak ve iş emri silinince geçmiş sorunsuz gider ----------
DO $$
DECLARE wo INT := current_setting('k064.wo')::int; yk INT := current_setting('k064.yk')::int; n INT;
BEGIN
    -- is_ortagi silinince geçmişteki ortak SET NULL olur (UPDATE zinciri kayit_degismez'e takılmaz)
    DELETE FROM is_ortagi WHERE id = yk;
    SELECT count(*) INTO n FROM adim_plan_gecmisi WHERE work_order_id = wo AND is_ortagi_id = yk;
    IF n <> 0 THEN RAISE EXCEPTION 'KONTROL: ortak silinince geçmişte % referans kaldı', n; END IF;
    -- iş emri silinince adımlar ve plan geçmişi cascade ile gider
    DELETE FROM work_order WHERE id = wo;
    PERFORM 1 FROM adim_plan_gecmisi WHERE work_order_id = wo;
    IF FOUND THEN RAISE EXCEPTION 'KONTROL: iş emri silinince plan geçmişi kaldı'; END IF;
    RAISE NOTICE '064 kontrolleri geçti';
END $$;
