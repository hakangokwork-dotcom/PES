-- ============================================================
-- Migration 064 — İş ortağı, rota şablonu, plan geçmişi, sorun nedeni
-- ============================================================
--
-- HEDEF (2026-11-17/18): iş emri SAP benzeri ana veriyle, ama ERP değil
-- operasyon yönetimi (TNA): her adımda plan, gerçekleşen, kontrol, sorun.
-- Tasarım: docs/superpowers/specs/2026-11-17-is-emri-sap-operasyon-design.md §2.1, §4
--
-- KURALLAR:
--   - Adım = work_order_stage (plan tezgahı/takvim aynen çalışır).
--   - Plan tarihleri elle girilir; her değişiklik adim_plan_gecmisi'ne
--     tetikleyiciyle yazılır. Gerekçe işlem-yerel 'app.plan_gerekce'
--     ayarından (set_config(..., true)); verilmezse NULL = "belirtilmedi".
--     Gerekçe zorunluluğu API'dedir: mevcut çağıranlar (plan tezgahı,
--     yerleştirme) DB'de bozulmasın.
--   - Hafıza kuralı: plan geçmişi silinmez, değişmez (PT422).
--   - is_ortagi: tip Atölye ⇔ workshop_id dolu. 141 atölye geçişte açılır.
--   - Ana veri yazımı yalnız merkez (current_workshop_id() IS NULL).
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. İş ortağı ----------
CREATE TABLE IF NOT EXISTS is_ortagi (
    id           SERIAL PRIMARY KEY,
    tenant_id    UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    tip          TEXT NOT NULL CHECK (tip IN ('Kumaşçı','Aksesuar','Kesimhane','Atölye','Yıkamacı','UKP','Baskı','Nakış','Diğer')),
    unvan        TEXT NOT NULL,
    kisa_ad      TEXT,
    vergi_no     TEXT,
    adres        TEXT,
    il           TEXT,
    telefon      TEXT,
    eposta       TEXT,
    notlar       TEXT,
    aktif        BOOLEAN NOT NULL DEFAULT true,
    workshop_id  INTEGER UNIQUE REFERENCES workshop(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    giren_taraf  TEXT CHECK (giren_taraf IN ('atolye', 'merkez')),
    giren_eposta TEXT,
    girildi_at   TIMESTAMPTZ,
    CONSTRAINT is_ortagi_atolye_chk CHECK ((tip = 'Atölye') = (workshop_id IS NOT NULL))
);
COMMENT ON TABLE is_ortagi IS
'064: iş ortağı (SAP LFA1 karşılığı). Atölye tipi mevcut workshop kaydına bağlı; diğer tipler (kumaşçı, yıkamacı, UKP, baskı, nakış…) yalnız burada.';
-- Unvan tekilliği yalnız dış firmalar için: atölyeler workshop_id ile zaten tekil;
-- aynı adlı iki atölye (üretimde 4 kayıt) ortak kaydını sessizce kaybetmesin.
CREATE UNIQUE INDEX IF NOT EXISTS is_ortagi_unvan_uq ON is_ortagi (tenant_id, tip, unvan) WHERE tip <> 'Atölye';

INSERT INTO is_ortagi (tenant_id, tip, unvan, aktif, workshop_id)
SELECT w.tenant_id, 'Atölye', w.name, coalesce(w.is_active, true), w.id
  FROM workshop w
 WHERE w.tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Yeni atölye açılınca ortağı da açılsın (ikinci kopya elle tutulmaz).
CREATE OR REPLACE FUNCTION workshop_ortak_ac()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.tenant_id IS NOT NULL THEN
        INSERT INTO is_ortagi (tenant_id, tip, unvan, aktif, workshop_id)
        VALUES (NEW.tenant_id, 'Atölye', NEW.name, coalesce(NEW.is_active, true), NEW.id)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_workshop_ortak ON workshop;
CREATE TRIGGER trg_workshop_ortak AFTER INSERT ON workshop
    FOR EACH ROW EXECUTE FUNCTION workshop_ortak_ac();

-- ---------- 2. Aşama kataloğu: kabul adımları ----------
INSERT INTO production_stage (code, name, sira_no, zorunlu, renk) VALUES
    ('KUMAS_KABUL',    'Kumaş kabul',    5, FALSE, '#0ea5e9'),
    ('AKSESUAR_KABUL', 'Aksesuar kabul', 6, FALSE, '#14b8a6')
ON CONFLICT (code) DO NOTHING;

-- ---------- 3. Rota şablonu ----------
CREATE TABLE IF NOT EXISTS rota_sablonu (
    id         SERIAL PRIMARY KEY,
    tenant_id  UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    ad         TEXT NOT NULL,
    aciklama   TEXT,
    aktif      BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, ad)
);
CREATE TABLE IF NOT EXISTS rota_operasyonu (
    id                  SERIAL PRIMARY KEY,
    sablon_id           INTEGER NOT NULL REFERENCES rota_sablonu(id) ON DELETE CASCADE,
    sira                INTEGER NOT NULL,
    stage_id            INTEGER NOT NULL REFERENCES production_stage(id),
    ortak_tipi          TEXT NOT NULL CHECK (ortak_tipi IN ('Kumaşçı','Aksesuar','Kesimhane','Atölye','Yıkamacı','UKP','Baskı','Nakış','Diğer')),
    zorunlu_formlar     TEXT[] NOT NULL DEFAULT '{}',   -- lib/pes/formlar.ts kodları
    varsayilan_ortak_id INTEGER REFERENCES is_ortagi(id) ON DELETE SET NULL,
    UNIQUE (sablon_id, sira),
    UNIQUE (sablon_id, stage_id)                         -- work_order_stage (work_order_id, stage_id) tekil
);
COMMENT ON TABLE rota_operasyonu IS
'064: rota şablonu satırı (SAP PLPO). İş emrine wo_rota_kur() ile kopyalanır; iş emrinde değiştirilebilir.';

-- ---------- 4. İş emri ve adım ----------
ALTER TABLE work_order
    ADD COLUMN IF NOT EXISTS rota_sablonu_id INTEGER REFERENCES rota_sablonu(id) ON DELETE SET NULL;
ALTER TABLE work_order_stage
    ADD COLUMN IF NOT EXISTS is_ortagi_id    INTEGER REFERENCES is_ortagi(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS zorunlu_formlar TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_wos_ortak ON work_order_stage(is_ortagi_id) WHERE is_ortagi_id IS NOT NULL;

-- Şablonu uygular: eksik adımları ekler; var olan adımın planına/gerçeğine
-- dokunmaz, firması boşsa doldurur. Atölye tipi adım firması = iş emrinin atölyesi.
CREATE OR REPLACE FUNCTION wo_rota_kur(p_wo INTEGER)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE n INTEGER;
BEGIN
    INSERT INTO work_order_stage (tenant_id, work_order_id, stage_id, sira_no, is_ortagi_id, zorunlu_formlar)
    SELECT wo.tenant_id, wo.id, ro.stage_id, ro.sira,
           coalesce(ro.varsayilan_ortak_id,
                    CASE WHEN ro.ortak_tipi = 'Atölye'
                         THEN (SELECT io.id FROM is_ortagi io WHERE io.workshop_id = wo.workshop_id) END),
           ro.zorunlu_formlar
      FROM work_order wo
      JOIN rota_operasyonu ro ON ro.sablon_id = wo.rota_sablonu_id
     WHERE wo.id = p_wo
    ON CONFLICT (work_order_id, stage_id) DO UPDATE
       SET sira_no         = EXCLUDED.sira_no,
           zorunlu_formlar = EXCLUDED.zorunlu_formlar,
           is_ortagi_id    = coalesce(work_order_stage.is_ortagi_id, EXCLUDED.is_ortagi_id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

-- ---------- 5. Plan geçmişi ----------
CREATE TABLE IF NOT EXISTS adim_plan_gecmisi (
    id             SERIAL PRIMARY KEY,
    tenant_id      UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    work_order_id  INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
    stage_kayit_id INTEGER NOT NULL REFERENCES work_order_stage(id) ON DELETE CASCADE,
    plan_baslangic DATE,
    plan_bitis     DATE,
    is_ortagi_id   INTEGER REFERENCES is_ortagi(id) ON DELETE SET NULL,
    gerekce_kodu   TEXT CHECK (gerekce_kodu IN ('KAPASITE_YOK','MALZEME_GEC','ONCEKI_IS_GECIKTI','MAKINE_ARIZA',
                       'ISGUCU_YETERSIZ','NUMUNE_ONAY_BEKLIYOR','TATIL_IZIN','MUSTERI_TALEBI','KALITE_SORUNU','DIGER')),
    not_metni      TEXT,
    giren_eposta   TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apg_stage ON adim_plan_gecmisi(stage_kayit_id, id);
COMMENT ON TABLE adim_plan_gecmisi IS
'064: adım planının her hâli (ilk plan = en eski satır). Tetikleyici yazar; silinmez, değişmez.';

CREATE OR REPLACE FUNCTION adim_plan_kaydet()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.plan_baslangic IS NULL AND NEW.plan_bitis IS NULL AND NEW.is_ortagi_id IS NULL THEN RETURN NEW; END IF;
    ELSIF (NEW.plan_baslangic, NEW.plan_bitis, NEW.is_ortagi_id)
          IS NOT DISTINCT FROM (OLD.plan_baslangic, OLD.plan_bitis, OLD.is_ortagi_id) THEN
        RETURN NEW;
    END IF;
    INSERT INTO adim_plan_gecmisi (tenant_id, work_order_id, stage_kayit_id, plan_baslangic, plan_bitis,
                                   is_ortagi_id, gerekce_kodu, not_metni, giren_eposta)
    VALUES (NEW.tenant_id, NEW.work_order_id, NEW.id, NEW.plan_baslangic, NEW.plan_bitis, NEW.is_ortagi_id,
            NULLIF(current_setting('app.plan_gerekce', true), ''),
            NULLIF(current_setting('app.plan_notu', true), ''),
            NULLIF(current_setting('app.current_user_email', true), ''));
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_adim_plan ON work_order_stage;
CREATE TRIGGER trg_adim_plan AFTER INSERT OR UPDATE ON work_order_stage
    FOR EACH ROW EXECUTE FUNCTION adim_plan_kaydet();

CREATE OR REPLACE FUNCTION kayit_degismez()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    -- İş emri/adım silinirken cascade geçer; doğrudan silme/değiştirme yasak.
    IF pg_trigger_depth() = 1 THEN
        RAISE EXCEPTION 'Geçmiş kaydı değiştirilemez ya da silinemez.' USING ERRCODE = 'PT422';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;  -- UPDATE'te OLD dönmek SET NULL zincirini sessizce yutardı
END $$;
DROP TRIGGER IF EXISTS trg_apg_degismez ON adim_plan_gecmisi;
CREATE TRIGGER trg_apg_degismez BEFORE UPDATE OR DELETE ON adim_plan_gecmisi
    FOR EACH ROW EXECUTE FUNCTION kayit_degismez();

-- Geçiş: mevcut planlar ilk plan olarak yazılır.
INSERT INTO adim_plan_gecmisi (tenant_id, work_order_id, stage_kayit_id, plan_baslangic, plan_bitis, not_metni)
SELECT s.tenant_id, s.work_order_id, s.id, s.plan_baslangic, s.plan_bitis, '064 öncesi plan'
  FROM work_order_stage s
 WHERE (s.plan_baslangic IS NOT NULL OR s.plan_bitis IS NOT NULL) AND s.tenant_id IS NOT NULL;

-- Geçiş: atölyesi olan iş emirlerinde KESIM/DIKIM adımına atölye ortağı.
UPDATE work_order_stage s SET is_ortagi_id = io.id
  FROM work_order wo, is_ortagi io, production_stage ps
 WHERE wo.id = s.work_order_id AND io.workshop_id = wo.workshop_id
   AND ps.id = s.stage_id AND ps.code IN ('KESIM', 'DIKIM') AND s.is_ortagi_id IS NULL;

-- ---------- 6. Sorun nedeni ----------
CREATE TABLE IF NOT EXISTS sorun_neden (
    kod  TEXT PRIMARY KEY,
    ad   TEXT NOT NULL,
    sira INTEGER NOT NULL DEFAULT 0
);
INSERT INTO sorun_neden (kod, ad, sira) VALUES
    ('KUMAS_HATA',     'Kumaş hatası',              10),
    ('EN_FARKI',       'En farkı',                  20),
    ('TON_FARKI',      'Ton / renk farkı',          30),
    ('CEKME_FARKI',    'Çekme farkı',               40),
    ('MALZEME_GEC',    'Malzeme geç geldi',         50),
    ('AKSESUAR_EKSIK', 'Aksesuar eksik / hatalı',   60),
    ('OLCU_DISI',      'Ölçü dışı',                 70),
    ('DIKIS_HATA',     'Dikiş hatası',              80),
    ('YIKAMA_HATA',    'Yıkama hatası',             90),
    ('KAPASITE',       'Kapasite / işgücü',        100),
    ('MAKINE_ARIZA',   'Makine arızası',           110),
    ('DIGER',          'Diğer',                    999)
ON CONFLICT (kod) DO NOTHING;

ALTER TABLE work_order_journal
    ADD COLUMN IF NOT EXISTS neden_kodu TEXT REFERENCES sorun_neden(kod),
    ADD COLUMN IF NOT EXISTS etki       TEXT CHECK (etki IN ('Gecikme', 'Kalite', 'Maliyet', 'Diğer'));

-- ---------- 7. Görünümler ----------
CREATE OR REPLACE VIEW v_is_emri_adim WITH (security_invoker = true) AS
SELECT s.id AS stage_kayit_id, s.work_order_id, s.stage_id, ps.code AS stage_code, ps.name AS stage_name, s.sira_no,
       s.is_ortagi_id, o.unvan AS ortak_unvan, o.tip AS ortak_tipi, s.zorunlu_formlar,
       ilk.plan_baslangic AS ilk_plan_baslangic, ilk.plan_bitis AS ilk_plan_bitis,
       s.plan_baslangic, s.plan_bitis, s.gercek_baslangic, s.gercek_bitis, s.durum,
       GREATEST(coalesce(g.n, 0) - 1, 0)::int AS revizyon_sayisi,
       CASE WHEN ilk.plan_bitis IS NULL OR s.plan_bitis IS NULL THEN NULL
            ELSE s.plan_bitis - ilk.plan_bitis END AS plan_kayma_gun,
       CASE WHEN s.plan_bitis IS NULL THEN NULL
            WHEN s.gercek_bitis IS NOT NULL THEN s.gercek_bitis - s.plan_bitis
            WHEN current_date > s.plan_bitis THEN current_date - s.plan_bitis
            ELSE 0 END AS gecikme_gun,
       coalesce(j.acik, 0)::int AS acik_sorun,
       coalesce(j.toplam, 0)::int AS toplam_sorun
  FROM work_order_stage s
  JOIN production_stage ps ON ps.id = s.stage_id
  LEFT JOIN is_ortagi o ON o.id = s.is_ortagi_id
  LEFT JOIN LATERAL (
      SELECT plan_baslangic, plan_bitis FROM adim_plan_gecmisi
       WHERE stage_kayit_id = s.id AND (plan_baslangic IS NOT NULL OR plan_bitis IS NOT NULL)
       ORDER BY id LIMIT 1) ilk ON true
  LEFT JOIN LATERAL (
      SELECT count(DISTINCT (plan_baslangic, plan_bitis)) AS n FROM adim_plan_gecmisi
       WHERE stage_kayit_id = s.id AND (plan_baslangic IS NOT NULL OR plan_bitis IS NOT NULL)) g ON true
  LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE NOT coalesce(resolved, false)) AS acik, count(*) AS toplam
        FROM work_order_journal
       WHERE work_order_id = s.work_order_id AND stage_id = s.stage_id AND tip IN ('PROBLEM', 'BLOKAJ')) j ON true;
COMMENT ON VIEW v_is_emri_adim IS
'064: adım başına ilk plan / güncel plan / gerçek, plan kayması, gecikme, sorun sayısı.';

CREATE OR REPLACE VIEW v_sorun_kayit WITH (security_invoker = true) AS
SELECT j.id, j.work_order_id, wo.is_emri_no, wo.model_adi, wo.workshop_id, j.stage_id, ps.name AS stage_name,
       s.is_ortagi_id, o.unvan AS ortak_unvan, o.tip AS ortak_tipi,
       j.tip, j.neden_kodu, sn.ad AS neden_ad, j.etki, j.baslik, j.aciklama, j.tarih,
       coalesce(j.resolved, false) AS cozuldu, j.resolved_at, j.created_at
  FROM work_order_journal j
  JOIN work_order wo ON wo.id = j.work_order_id
  LEFT JOIN production_stage ps ON ps.id = j.stage_id
  LEFT JOIN work_order_stage s ON s.work_order_id = j.work_order_id AND s.stage_id = j.stage_id
  LEFT JOIN is_ortagi o ON o.id = s.is_ortagi_id
  LEFT JOIN sorun_neden sn ON sn.kod = j.neden_kodu
 WHERE j.tip IN ('PROBLEM', 'BLOKAJ');

-- ---------- 8. 054/055 + RLS ----------
DROP TRIGGER IF EXISTS trg_kayit_giren ON is_ortagi;
CREATE TRIGGER trg_kayit_giren BEFORE INSERT OR UPDATE ON is_ortagi
    FOR EACH ROW EXECUTE FUNCTION kayit_giren_yaz();

DO $$
DECLARE t TEXT;
BEGIN
    -- Ana veri: herkes (kiracı içi) okur, yalnız merkez yazar.
    FOREACH t IN ARRAY ARRAY['is_ortagi', 'rota_sablonu'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_oku', t);
        EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = current_tenant_id() OR is_internal_admin())', t || '_oku', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_merkez', t);
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING ((tenant_id = current_tenant_id() OR is_internal_admin()) AND current_workshop_id() IS NULL)', t || '_merkez', t);
        EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    END LOOP;
END $$;

ALTER TABLE rota_operasyonu ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_operasyonu FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rota_operasyonu_oku ON rota_operasyonu;
CREATE POLICY rota_operasyonu_oku ON rota_operasyonu FOR SELECT USING (
    EXISTS (SELECT 1 FROM rota_sablonu r WHERE r.id = rota_operasyonu.sablon_id));
DROP POLICY IF EXISTS rota_operasyonu_merkez ON rota_operasyonu;
CREATE POLICY rota_operasyonu_merkez ON rota_operasyonu FOR ALL USING (
    current_workshop_id() IS NULL AND EXISTS (SELECT 1 FROM rota_sablonu r WHERE r.id = rota_operasyonu.sablon_id));
REVOKE ALL ON rota_operasyonu FROM anon, authenticated;

-- Plan geçmişi: iş emrini gören görür; tetikleyici atölyenin kendi adımında da yazar.
ALTER TABLE adim_plan_gecmisi ENABLE ROW LEVEL SECURITY;
ALTER TABLE adim_plan_gecmisi FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS adim_plan_gecmisi_tenant_isolation ON adim_plan_gecmisi;
CREATE POLICY adim_plan_gecmisi_tenant_isolation ON adim_plan_gecmisi FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin())
    AND (current_workshop_id() IS NULL OR EXISTS (
        SELECT 1 FROM work_order wo WHERE wo.id = adim_plan_gecmisi.work_order_id AND wo.workshop_id = current_workshop_id())));
REVOKE ALL ON adim_plan_gecmisi FROM anon, authenticated;

-- sorun_neden: global katalog, salt okunur.
ALTER TABLE sorun_neden ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sorun_neden_oku ON sorun_neden;
CREATE POLICY sorun_neden_oku ON sorun_neden FOR SELECT USING (true);
REVOKE ALL ON sorun_neden FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON is_ortagi, rota_sablonu, rota_operasyonu TO pes_app';
        EXECUTE 'GRANT SELECT, INSERT ON adim_plan_gecmisi TO pes_app';
        EXECUTE 'GRANT SELECT ON sorun_neden, v_is_emri_adim, v_sorun_kayit TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE is_ortagi_id_seq, rota_sablonu_id_seq, rota_operasyonu_id_seq, adim_plan_gecmisi_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT tip, count(*) FROM is_ortagi GROUP BY 1;
--   SELECT * FROM v_is_emri_adim WHERE revizyon_sayisi > 0;
--
-- ROLLBACK
--   DROP VIEW IF EXISTS v_sorun_kayit, v_is_emri_adim;
--   ALTER TABLE work_order_journal DROP COLUMN IF EXISTS neden_kodu, DROP COLUMN IF EXISTS etki;
--   DROP TABLE IF EXISTS sorun_neden, adim_plan_gecmisi;
--   DROP TRIGGER IF EXISTS trg_adim_plan ON work_order_stage;
--   ALTER TABLE work_order_stage DROP COLUMN IF EXISTS is_ortagi_id, DROP COLUMN IF EXISTS zorunlu_formlar;
--   ALTER TABLE work_order DROP COLUMN IF EXISTS rota_sablonu_id;
--   DROP TABLE IF EXISTS rota_operasyonu, rota_sablonu;
--   DROP TRIGGER IF EXISTS trg_workshop_ortak ON workshop;
--   DROP TABLE IF EXISTS is_ortagi;
--   DROP FUNCTION IF EXISTS wo_rota_kur(INTEGER), adim_plan_kaydet(), kayit_degismez(), workshop_ortak_ac();
--   DELETE FROM production_stage WHERE code IN ('KUMAS_KABUL','AKSESUAR_KABUL');
-- ============================================================
