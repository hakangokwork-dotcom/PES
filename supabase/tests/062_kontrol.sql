-- supabase/tests/062_kontrol.sql — yalnız _migrate_kuru.mjs ile.
DO $$
DECLARE t UUID; w INT; wo INT; tp INT; v RECORD;
BEGIN
    SELECT id, tenant_id INTO wo, t FROM work_order WHERE tenant_id IS NOT NULL ORDER BY id LIMIT 1;
    SELECT workshop_id INTO w FROM work_order WHERE id = wo;

    INSERT INTO kumas_top (tenant_id, work_order_id, workshop_id, tedarikci_lotu, top_no, metre)
        VALUES (t, wo, w, 'L-1', 'T-1', 85) RETURNING id INTO tp;

    -- Varsayılan karantina
    PERFORM 1 FROM kumas_top WHERE id = tp AND durum = 'Karantina';
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: yeni top karantinada değil'; END IF;

    -- Aynı lot + top no iki kez girilemez
    BEGIN
        INSERT INTO kumas_top (tenant_id, work_order_id, workshop_id, tedarikci_lotu, top_no) VALUES (t, wo, w, 'L-1', 'T-1');
        RAISE EXCEPTION 'KONTROL: aynı top iki kez girildi';
    EXCEPTION WHEN unique_violation THEN NULL; END;

    -- RED test → top serbest bırakılamaz
    INSERT INTO kumas_cekme_testi (work_order_id, tenant_id, workshop_id, tarih, sonuc, top_id, boy_cekme_pct)
        VALUES (wo, t, w, current_date, 'RED', tp, -6.5);
    BEGIN
        UPDATE kumas_top SET durum = 'Serbest' WHERE id = tp;
        RAISE EXCEPTION 'KONTROL: RED testli top serbest oldu';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Serbest topa RED test girilemez (önce karantina/red)
    DELETE FROM kumas_cekme_testi WHERE top_id = tp;
    UPDATE kumas_top SET durum = 'Serbest' WHERE id = tp;
    BEGIN
        INSERT INTO kumas_cekme_testi (work_order_id, tenant_id, workshop_id, tarih, sonuc, top_id)
            VALUES (wo, t, w, current_date, 'RED', tp);
        RAISE EXCEPTION 'KONTROL: serbest topa RED test girildi';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Görünüm: tek top serbest, karantina yok → adım 1 'Tamam'
    SELECT * INTO v FROM v_is_emri_surec WHERE work_order_id = wo;
    IF v.adim1 <> 'Tamam' THEN RAISE EXCEPTION 'KONTROL: adim1 % (Tamam beklenirdi)', v.adim1; END IF;

    INSERT INTO kumas_cekme_testi (work_order_id, tenant_id, workshop_id, tarih, sonuc, top_id)
        VALUES (wo, t, w, current_date, 'UYGUN', tp);
    SELECT * INTO v FROM v_is_emri_surec WHERE work_order_id = wo;
    IF v.adim2 <> 'Devam' THEN RAISE EXCEPTION 'KONTROL: grupsuz serbest topla adim2 % (Devam beklenirdi)', v.adim2; END IF;

    UPDATE kumas_top SET ton_grubu = 'A', cekme_grubu = '1' WHERE id = tp;
    SELECT * INTO v FROM v_is_emri_surec WHERE work_order_id = wo;
    IF v.adim2 <> 'Tamam' THEN RAISE EXCEPTION 'KONTROL: adim2 % (Tamam beklenirdi)', v.adim2; END IF;

    RAISE NOTICE '062 kontrolleri geçti';
END $$;
