-- supabase/tests/061_kontrol.sql — yalnız _migrate_kuru.mjs ile, işlem içinde çalışır.
DO $$
DECLARE t UUID; m INT; s INT; n INT;
BEGIN
    SELECT id INTO t FROM tenant ORDER BY created_at LIMIT 1;
    INSERT INTO model_bulten (tenant_id, model_adi) VALUES (t, '__kontrol__') RETURNING id INTO m;
    INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama)
        VALUES (t, m, 'Esnek', 'FINAL') RETURNING id INTO s;
    INSERT INTO olcu_noktasi (tenant_id, sartname_id, kod, ad) VALUES (t, s, 'P01', 'Bel') RETURNING id INTO n;
    INSERT INTO olcu_degeri (tenant_id, nokta_id, beden, nominal, tol_eksi, tol_arti) VALUES (t, n, '32', 43, 1.5, 1);

    -- Önerilen şartname düzenlenebilir
    UPDATE olcu_degeri SET tol_arti = 1.0 WHERE nokta_id = n;

    -- Onaysız "Müşteri onaylı" yapılamaz (onaylayan zorunlu)
    BEGIN
        UPDATE olcu_sartname SET durum = 'Müşteri onaylı' WHERE id = s;
        RAISE EXCEPTION 'KONTROL: onaylayansız onay geçti';
    EXCEPTION WHEN check_violation THEN NULL; END;

    UPDATE olcu_sartname SET durum = 'Müşteri onaylı', onaylayan = 'Müşteri QA', onay_tarihi = current_date WHERE id = s;

    -- Onaylı şartnamenin değeri değişmez (hedef 43 → 42,75 kendiliğinden olamaz)
    BEGIN
        UPDATE olcu_degeri SET nominal = 42.75 WHERE nokta_id = n;
        RAISE EXCEPTION 'KONTROL: onaylı şartnamenin değeri değişti';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Onaylı şartnamenin notu da değişmez
    BEGIN
        UPDATE olcu_sartname SET notlar = 'x' WHERE id = s;
        RAISE EXCEPTION 'KONTROL: onaylı şartname başlığı değişti';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Onaylı şartname silinemez
    BEGIN
        DELETE FROM olcu_sartname WHERE id = s;
        RAISE EXCEPTION 'KONTROL: onaylı şartname silindi';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Aynı model × kategori × aşamada ikinci onaylı revizyon olamaz
    BEGIN
        INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama, revizyon, durum, onaylayan, onay_tarihi)
            VALUES (t, m, 'Esnek', 'FINAL', 2, 'Müşteri onaylı', 'y', current_date);
        RAISE EXCEPTION 'KONTROL: ikinci onaylı revizyon girdi';
    EXCEPTION WHEN unique_violation THEN NULL; END;

    -- Rijit ayrı şartname: aynı model için ayrıca onaylanabilir
    INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama, durum, onaylayan, onay_tarihi)
        VALUES (t, m, 'Rijit', 'FINAL', 'Müşteri onaylı', 'y', current_date);

    -- Onaylı → Geçersiz izinli; Geçersiz sonra değişmez
    UPDATE olcu_sartname SET durum = 'Geçersiz' WHERE id = s;
    BEGIN
        UPDATE olcu_sartname SET durum = 'Önerilen' WHERE id = s;
        RAISE EXCEPTION 'KONTROL: geçersiz şartname canlandı';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    RAISE NOTICE '061 kontrolleri geçti';
END $$;
