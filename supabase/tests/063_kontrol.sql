-- supabase/tests/063_kontrol.sql — yalnız _migrate_kuru.mjs ile, işlem içinde çalışır.

-- ---------- 1. Kurallar (süper kullanıcı) ----------
DO $$
DECLARE t UUID; wa INT; wb INT; ma INT; mb INT; woa INT; wob INT; tp INT; tp2 INT; s INT; n INT; v RECORD;
BEGIN
    SELECT id INTO t FROM tenant ORDER BY created_at LIMIT 1;
    SELECT id INTO wa FROM workshop WHERE tenant_id = t ORDER BY id LIMIT 1;
    SELECT id INTO wb FROM workshop WHERE tenant_id = t AND id <> wa ORDER BY id LIMIT 1;
    IF wb IS NULL THEN RAISE EXCEPTION 'KONTROL: iki atölyeli tenant yok'; END IF;
    INSERT INTO model_bulten (tenant_id, model_adi) VALUES (t, '__k063_a__') RETURNING id INTO ma;
    INSERT INTO model_bulten (tenant_id, model_adi) VALUES (t, '__k063_b__') RETURNING id INTO mb;
    INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum, model_bulten_id)
        VALUES (t, wa, '__K063A__', 'A', 100, 'Planlandi', ma) RETURNING id INTO woa;
    INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum, model_bulten_id)
        VALUES (t, wb, '__K063B__', 'B', 100, 'Planlandi', mb) RETURNING id INTO wob;

    -- Top bazlı test silinmez; testli top silinmez
    INSERT INTO kumas_top (tenant_id, work_order_id, workshop_id, tedarikci_lotu, top_no) VALUES (t, woa, wa, 'L', 'T1') RETURNING id INTO tp;
    INSERT INTO kumas_cekme_testi (work_order_id, tenant_id, workshop_id, tarih, sonuc, top_id)
        VALUES (woa, t, wa, current_date - 1, 'RİSKLİ', tp);
    BEGIN
        DELETE FROM kumas_cekme_testi WHERE top_id = tp;
        RAISE EXCEPTION 'KONTROL: top bazlı test silindi';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
    BEGIN
        DELETE FROM kumas_top WHERE id = tp;
        RAISE EXCEPTION 'KONTROL: testli top silindi';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    -- İş emri geneli (top_id NULL) eski test silinebilir
    INSERT INTO kumas_cekme_testi (work_order_id, tenant_id, workshop_id, tarih, sonuc) VALUES (woa, t, wa, current_date, 'UYGUN');
    DELETE FROM kumas_cekme_testi WHERE work_order_id = woa AND top_id IS NULL;

    -- Adım 2: RİSKLİ, sonra UYGUN yeniden test + serbest + gruplu → Tamam
    SELECT * INTO v FROM v_is_emri_surec WHERE work_order_id = woa;
    IF v.adim2 <> 'Sorunlu' THEN RAISE EXCEPTION 'KONTROL: RİSKLİ testle adim2 % (Sorunlu beklenirdi)', v.adim2; END IF;
    INSERT INTO kumas_cekme_testi (work_order_id, tenant_id, workshop_id, tarih, sonuc, top_id)
        VALUES (woa, t, wa, current_date, 'UYGUN', tp);
    UPDATE kumas_top SET durum = 'Serbest', ton_grubu = 'A', cekme_grubu = '1' WHERE id = tp;
    SELECT * INTO v FROM v_is_emri_surec WHERE work_order_id = woa;
    IF v.adim2 <> 'Tamam' THEN RAISE EXCEPTION 'KONTROL: yeniden testten sonra adim2 % (Tamam beklenirdi)', v.adim2; END IF;
    IF v.test_sayisi <> 1 OR v.sorunlu_test <> 0 THEN RAISE EXCEPTION 'KONTROL: test_sayisi % sorunlu %', v.test_sayisi, v.sorunlu_test; END IF;

    -- Red top: adım 1 kalıcı Sorunlu olmaz, adım 2'de sayılmaz
    INSERT INTO kumas_top (tenant_id, work_order_id, workshop_id, tedarikci_lotu, top_no, durum) VALUES (t, woa, wa, 'L', 'T2', 'Red') RETURNING id INTO tp2;
    INSERT INTO kumas_cekme_testi (work_order_id, tenant_id, workshop_id, tarih, sonuc, top_id) VALUES (woa, t, wa, current_date, 'RED', tp2);
    SELECT * INTO v FROM v_is_emri_surec WHERE work_order_id = woa;
    IF v.adim1 <> 'Tamam' OR v.adim2 <> 'Tamam' OR v.red <> 1 THEN
        RAISE EXCEPTION 'KONTROL: Red topla adim1 % adim2 % red %', v.adim1, v.adim2, v.red;
    END IF;
    -- Testsiz yeni top → Devam
    INSERT INTO kumas_top (tenant_id, work_order_id, workshop_id, tedarikci_lotu, top_no, durum) VALUES (t, woa, wa, 'L', 'T3', 'Serbest');
    UPDATE kumas_top SET ton_grubu = 'A', cekme_grubu = '1' WHERE work_order_id = woa AND top_no = 'T3';
    SELECT * INTO v FROM v_is_emri_surec WHERE work_order_id = woa;
    IF v.adim2 <> 'Devam' THEN RAISE EXCEPTION 'KONTROL: testsiz topla adim2 % (Devam beklenirdi)', v.adim2; END IF;

    -- Onaylı şartnameden nokta taşınamaz
    INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama) VALUES (t, ma, 'Esnek', 'FINAL') RETURNING id INTO s;
    INSERT INTO olcu_noktasi (tenant_id, sartname_id, kod, ad) VALUES (t, s, 'P01', 'Bel') RETURNING id INTO n;
    UPDATE olcu_sartname SET durum = 'Müşteri onaylı', onaylayan = 'QA', onay_tarihi = current_date WHERE id = s;
    INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama, revizyon) VALUES (t, ma, 'Esnek', 'FINAL', 2) RETURNING id INTO s;
    BEGIN
        UPDATE olcu_noktasi SET sartname_id = s WHERE id = n;
        RAISE EXCEPTION 'KONTROL: onaylı şartnameden nokta taşındı';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- B'nin modeline şartname (RLS testinde B okur, A'nınkini okumaz)
    INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama) VALUES (t, mb, 'Rijit', 'FINAL');
    INSERT INTO surec_gorsel (tenant_id, work_order_id, workshop_id, adim, yol, ad, tur, boyut)
        VALUES (t, woa, wa, 'KUMAS', '__k063__/x.jpg', 'x.jpg', 'image/jpeg', 1);

    PERFORM set_config('k063.tenant', t::text, true);
    PERFORM set_config('k063.wb', wb::text, true);
    PERFORM set_config('k063.woa', woa::text, true);
    PERFORM set_config('k063.ma', ma::text, true);
    PERFORM set_config('k063.mb', mb::text, true);
END $$;

-- ---------- 2. RLS (pes_app, atölye B oturumu) ----------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        RAISE NOTICE '063 RLS kontrolü ATLANDI: pes_app rolü yok';
    ELSE
        BEGIN
            -- Kuru çalıştırmada rol geçişi için geçici üyelik; işlemle birlikte geri alınır.
            IF NOT pg_has_role(current_user, 'pes_app', 'USAGE') THEN
                EXECUTE format('GRANT pes_app TO %I', current_user);
            END IF;
            EXECUTE 'SET LOCAL ROLE pes_app';
            PERFORM set_config('app.current_tenant_id', current_setting('k063.tenant'), true);
            PERFORM set_config('app.current_workshop_id', current_setting('k063.wb'), true);
            PERFORM set_config('app.is_internal', '', true);
        EXCEPTION WHEN insufficient_privilege OR invalid_grant_operation THEN
            RAISE NOTICE '063 RLS kontrolü ATLANDI: % kullanıcısı pes_app rolüne geçemiyor (%)', current_user, SQLERRM;
        END;
    END IF;
END $$;

DO $$
DECLARE woa INT; ma INT; mb INT; c INT;
BEGIN
    IF current_user <> 'pes_app' THEN RETURN; END IF;
    woa := current_setting('k063.woa')::int;
    ma  := current_setting('k063.ma')::int;
    mb  := current_setting('k063.mb')::int;

    SELECT count(*) INTO c FROM kumas_top WHERE work_order_id = woa;
    IF c <> 0 THEN RAISE EXCEPTION 'KONTROL RLS: atölye B, A''nın % topunu görüyor', c; END IF;
    SELECT count(*) INTO c FROM surec_gorsel WHERE work_order_id = woa;
    IF c <> 0 THEN RAISE EXCEPTION 'KONTROL RLS: atölye B, A''nın görselini görüyor'; END IF;
    SELECT count(*) INTO c FROM olcu_sartname WHERE model_bulten_id = ma;
    IF c <> 0 THEN RAISE EXCEPTION 'KONTROL RLS: atölye B, A''nın modelinin şartnamesini görüyor'; END IF;
    SELECT count(*) INTO c FROM olcu_sartname WHERE model_bulten_id = mb;
    IF c <> 1 THEN RAISE EXCEPTION 'KONTROL RLS: atölye B kendi modelinin şartnamesini göremiyor (%)', c; END IF;
    BEGIN
        INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama)
            VALUES (current_setting('k063.tenant')::uuid, mb, 'Esnek', 'YIKAMA_ONCESI');
        RAISE EXCEPTION 'KONTROL RLS: atölye şartname yazdı';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RAISE NOTICE '063 RLS kontrolleri geçti (pes_app, atölye oturumu)';
END $$;

RESET ROLE;

-- ---------- 3. Zincirleme silme: iş emri silinince top ve testleri gider ----------
DO $$
DECLARE woa INT := current_setting('k063.woa')::int;
BEGIN
    DELETE FROM surec_gorsel WHERE work_order_id = woa;
    DELETE FROM work_order WHERE id = woa;
    PERFORM 1 FROM kumas_top WHERE work_order_id = woa;
    IF FOUND THEN RAISE EXCEPTION 'KONTROL: iş emri silinince top kaldı'; END IF;
    RAISE NOTICE '063 kontrolleri geçti';
END $$;
