-- ============================================================
-- Migration 031 — Olgunluk kataloğu ve olgunluk denetimi
-- ============================================================
--
-- KAYNAK: "WKYS Olgunluk Seviyesi_v4 / new file.xlsx". 33 süreç, her biri
-- için Kötü(0)/Gelişime Açık(1)/İyi(2)/Mükemmel(3) tanımları ve bir
-- "Durum" dropdown'ı. Radar sayfasında 9 kategori.
--
-- BU, 029'DAKİ workshop_denetim'İN AYNISI DEĞİL:
--   workshop_denetim  -> denetim başına TEK puan (WKYS 87.4, sosyal 91.2)
--   olgunluk denetimi -> denetim başına 33 satır, her satırda 0-3 seviye,
--                        her seviyenin altında işaretlenen maddeler
--   Aynı tabloya sığmaz; ayrı ağaç. Bağ 031b'de kurulur (tamamlanan
--   olgunluk denetimi workshop_denetim'e tip='OLGUNLUK' özet satırı yazar).
--
-- ALTI TABLO, ÜÇ TASARIM KARARI:
--
--   1) SEVİYE SEÇİLMEZ, TÜRETİLİR  (kullanıcı kararı, 2026-08-06)
--      Kaynak Excel'de denetçi 4 tanım bloğuna bakıp elle 0/1/2/3 seçiyordu.
--      Ama her tanım a/b/c diye 3-14 maddelik bir paket; "4 maddenin 3'ü
--      sağlanıyorsa seviye kaç" kuralı yoktu ve skor denetçinin yorumuydu.
--      Artık denetçi MADDE işaretler (olgunluk_denetim_kriter), seviye
--      v_olgunluk_surec_seviye'de hesaplanır. Puan hiçbir yerde saklanmaz —
--      kriter cevabı tek gerçek, geri kalan türev.
--
--   2) KATALOG VERİDİR, KOD DEĞİL — ve VERSİYONLUDUR
--      Kriterler her yıl değişiyor (elimizdeki dosya zaten v4). Kriter
--      metnini koda gömmek her revizyonu deploy'a bağlardı. Şablon =
--      kataloğun donmuş bir sürümü; denetim şablona bağlanır. v5 çıkınca
--      v4 denetimleri KENDİ sorularıyla okunmaya devam eder — yoksa geçmiş
--      skorlar sessizce yeniden yorumlanır ve trend yalan söyler.
--
--   3) YAYINDAKİ ŞABLON DEĞİŞTİRİLEMEZ
--      Admin paneli süreç ekleyip madde sıralayabilecek. Ama yayındaki
--      şablonu düzenlemek, saha denetimi yarıdayken soruyu değiştirmek
--      demek: iki atölyenin skoru farklı şeyi ölçer. Kilit trigger'da,
--      uygulamada değil — panelin bir hatası veriyi bozamasın.
--      Düzenleme akışı: yayındaki şablonu klonla -> taslakta düzenle -> yayınla.
--
-- SİLME = PASİFE ALMA (aktif=false)
--   Tamamlanmış denetim maddeye satır bazında bağlı. Maddeyi gerçekten
--   silmek o denetimin skorunu açıklanamaz hale getirir. FK RESTRICT bunu
--   veritabanı seviyesinde de engeller; hiç kullanılmamış madde silinebilir.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ŞABLON — KATALOĞUN VERSİYONU
-- ============================================================
CREATE TABLE IF NOT EXISTS olgunluk_sablon (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,

    kod             TEXT NOT NULL,
    ad              TEXT NOT NULL,
    aciklama        TEXT,
    durum           TEXT NOT NULL DEFAULT 'taslak',
    klon_kaynak_id  INTEGER REFERENCES olgunluk_sablon(id) ON DELETE SET NULL,

    yayin_tarihi    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT os_durum_chk CHECK (durum IN ('taslak','yayinda','arsiv')),
    UNIQUE (tenant_id, kod)
);

COMMENT ON TABLE olgunluk_sablon IS
'Olgunluk kataloğunun bir sürümü (v4, v5...). Denetim şablona bağlanır: kriterler değişince eski denetimler kendi sorularıyla okunmaya devam eder.';
COMMENT ON COLUMN olgunluk_sablon.durum IS
'taslak = düzenlenebilir, denetim açılamaz | yayinda = kilitli, denetim buna açılır | arsiv = kilitli, yeni denetim açılmaz';
COMMENT ON COLUMN olgunluk_sablon.klon_kaynak_id IS
'Bu şablon hangi şablonun kopyası. v4 -> v5 farkını göstermek için.';

-- Aynı anda tek yayın: "hangi sürüme denetim açılır" sorusu tek cevaplı olmalı.
CREATE UNIQUE INDEX IF NOT EXISTS uq_olgunluk_sablon_yayinda
    ON olgunluk_sablon(tenant_id) WHERE durum = 'yayinda';

DROP TRIGGER IF EXISTS trg_os_updated ON olgunluk_sablon;
CREATE TRIGGER trg_os_updated BEFORE UPDATE ON olgunluk_sablon
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ============================================================
-- 2. KATEGORİ — RADAR EKSENLERİ
-- ============================================================
CREATE TABLE IF NOT EXISTS olgunluk_kategori (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    sablon_id   INTEGER NOT NULL REFERENCES olgunluk_sablon(id) ON DELETE CASCADE,

    kod         TEXT NOT NULL,
    ad          TEXT NOT NULL,
    sira        INTEGER NOT NULL DEFAULT 0,
    aktif       BOOLEAN NOT NULL DEFAULT true,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (sablon_id, kod)
);

COMMENT ON TABLE olgunluk_kategori IS
'Radar eksenleri. Kaynak Excel''in Radar sayfasındaki 9 kategori + kapasite/planlama, dosya kapama, verimlilik için önerilen 10.''su.';
COMMENT ON COLUMN olgunluk_kategori.sira IS
'Panelde sürükle-bırak sırası. Kardeşler arasında yeniden numaralanır; benzersizlik aranmaz (sıralama tek transaction''da yazılır).';

CREATE INDEX IF NOT EXISTS idx_ok_sablon ON olgunluk_kategori(sablon_id, sira);

DROP TRIGGER IF EXISTS trg_ok_updated ON olgunluk_kategori;
CREATE TRIGGER trg_ok_updated BEFORE UPDATE ON olgunluk_kategori
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ============================================================
-- 3. SÜREÇ — PUANLANAN BİRİM
-- ============================================================
CREATE TABLE IF NOT EXISTS olgunluk_surec (
    id           SERIAL PRIMARY KEY,
    tenant_id    UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    sablon_id    INTEGER NOT NULL REFERENCES olgunluk_sablon(id) ON DELETE CASCADE,
    kategori_id  INTEGER NOT NULL REFERENCES olgunluk_kategori(id) ON DELETE RESTRICT,

    kod          TEXT NOT NULL,
    ad           TEXT NOT NULL,
    agirlik      NUMERIC(5,2) NOT NULL DEFAULT 1,
    sira         INTEGER NOT NULL DEFAULT 0,
    aktif        BOOLEAN NOT NULL DEFAULT true,
    not_metni    TEXT,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT osu_agirlik_chk CHECK (agirlik > 0),
    UNIQUE (sablon_id, kod)
);

COMMENT ON TABLE olgunluk_surec IS
'Olgunluk seviyesi verilen birim (Excel''deki 33 satır). Puan bu seviyede toplanır.';
COMMENT ON COLUMN olgunluk_surec.agirlik IS
'Varsayılan 1 = her süreç eşit (kaynak Excel''in davranışı). Değiştirmek şema değişikliği gerektirmez.';

CREATE INDEX IF NOT EXISTS idx_osu_sablon   ON olgunluk_surec(sablon_id, sira);
CREATE INDEX IF NOT EXISTS idx_osu_kategori ON olgunluk_surec(kategori_id);

DROP TRIGGER IF EXISTS trg_osu_updated ON olgunluk_surec;
CREATE TRIGGER trg_osu_updated BEFORE UPDATE ON olgunluk_surec
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ============================================================
-- 4. KRİTER — İŞARETLENEN MADDE
-- ============================================================
CREATE TABLE IF NOT EXISTS olgunluk_kriter (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    sablon_id   INTEGER NOT NULL REFERENCES olgunluk_sablon(id) ON DELETE CASCADE,
    surec_id    INTEGER NOT NULL REFERENCES olgunluk_surec(id) ON DELETE CASCADE,

    seviye      SMALLINT NOT NULL,
    sira        INTEGER NOT NULL DEFAULT 0,
    metin       TEXT NOT NULL,
    taraf       TEXT NOT NULL DEFAULT 'ATOLYE',
    zorunlu     BOOLEAN NOT NULL DEFAULT true,
    aktif       BOOLEAN NOT NULL DEFAULT true,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Seviye 0'ın maddesi YOKTUR: 0, "seviye 1 sağlanamadı" demektir.
    -- Kaynak Excel'de de "Kötü (0)" kolonu 33 satırın hepsinde boştu.
    CONSTRAINT okr_seviye_chk CHECK (seviye BETWEEN 1 AND 3),
    CONSTRAINT okr_taraf_chk  CHECK (taraf IN ('ATOLYE','MARKA'))
);

COMMENT ON TABLE olgunluk_kriter IS
'Denetimde tek tek işaretlenen madde. Seviye tanımının a/b/c şıkları burada ayrı satır.';
COMMENT ON COLUMN olgunluk_kriter.taraf IS
'ATOLYE = atölyeyi bağlar, puana girer | MARKA = marka/tedarik sorumluluğu (kaynak metinlerde "X" önekliydi), atölye puanına GİRMEZ.';
COMMENT ON COLUMN olgunluk_kriter.zorunlu IS
'false ise seviyeyi bloklamaz; bilgi amaçlı sorulur. Seviye kapısı yalnız zorunlu maddelere bakar.';

CREATE INDEX IF NOT EXISTS idx_okr_surec  ON olgunluk_kriter(surec_id, seviye, sira);
CREATE INDEX IF NOT EXISTS idx_okr_sablon ON olgunluk_kriter(sablon_id);

DROP TRIGGER IF EXISTS trg_okr_updated ON olgunluk_kriter;
CREATE TRIGGER trg_okr_updated BEFORE UPDATE ON olgunluk_kriter
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ============================================================
-- 5. YAYIN KİLİDİ
-- ============================================================
-- Yayındaki/arşivdeki şablonun katalog satırları değiştirilemez.
-- Uygulamada değil burada: panelin bir hatası tamamlanmış denetimlerin
-- anlamını değiştiremesin.
CREATE OR REPLACE FUNCTION olgunluk_katalog_kilit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sablon INTEGER;
    v_durum  TEXT;
BEGIN
    v_sablon := COALESCE(NEW.sablon_id, OLD.sablon_id);
    SELECT durum INTO v_durum FROM olgunluk_sablon WHERE id = v_sablon;

    IF v_durum IN ('yayinda','arsiv') THEN
        RAISE EXCEPTION
            'Şablon % durumunda; katalog değiştirilemez. Şablonu klonlayıp taslakta düzenleyin.', v_durum
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END $$;

COMMENT ON FUNCTION olgunluk_katalog_kilit() IS
'Yayında/arşivdeki şablonun kategori-süreç-kriter satırlarını kilitler. Düzenleme akışı: klonla -> taslakta düzenle -> yayınla.';

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['olgunluk_kategori','olgunluk_surec','olgunluk_kriter'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_kilit', t);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I
                 FOR EACH ROW EXECUTE FUNCTION olgunluk_katalog_kilit()',
            'trg_' || t || '_kilit', t);
    END LOOP;
END $$;

-- ============================================================
-- 6. DENETİM
-- ============================================================
CREATE TABLE IF NOT EXISTS olgunluk_denetim (
    id             SERIAL PRIMARY KEY,
    tenant_id      UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    workshop_id    INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    sablon_id      INTEGER NOT NULL REFERENCES olgunluk_sablon(id) ON DELETE RESTRICT,

    tarih          DATE NOT NULL,
    denetci        TEXT,
    durum          TEXT NOT NULL DEFAULT 'taslak',
    not_metni      TEXT,

    tamamlandi_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT od_durum_chk CHECK (durum IN ('taslak','tamamlandi')),
    UNIQUE (workshop_id, sablon_id, tarih)
);

COMMENT ON TABLE olgunluk_denetim IS
'Bir atölyeye bir tarihte yapılan olgunluk denetimi. Puan burada TUTULMAZ; kriter cevaplarından türetilir (v_olgunluk_denetim_ozet).';
COMMENT ON COLUMN olgunluk_denetim.durum IS
'taslak = sahada doldurulmakta, rapora girmez | tamamlandi = kilitli, rapora girer';

CREATE INDEX IF NOT EXISTS idx_od_workshop ON olgunluk_denetim(workshop_id, tarih DESC);
CREATE INDEX IF NOT EXISTS idx_od_tenant   ON olgunluk_denetim(tenant_id);

-- Denetim YALNIZ yayındaki şablona açılır.
-- Taslak şablon düzenlenebilir durumda; üzerine denetim doldurulursa
-- sorular denetim sürerken değişebilir ve cevaplar başka bir soruya ait
-- hale gelir. Arşivdeki şablona da yeni denetim açılmaz (eskiler durur).
CREATE OR REPLACE FUNCTION olgunluk_denetim_sablon_kontrol()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_durum TEXT;
BEGIN
    SELECT durum INTO v_durum FROM olgunluk_sablon WHERE id = NEW.sablon_id;
    IF v_durum IS DISTINCT FROM 'yayinda' THEN
        RAISE EXCEPTION
            'Şablon "%" durumunda; denetim yalnız yayındaki şablona açılır.', COALESCE(v_durum, 'yok')
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

COMMENT ON FUNCTION olgunluk_denetim_sablon_kontrol() IS
'Denetimin yayındaki şablona bağlanmasını zorlar. Taslak şablon düzenlenebilir olduğu için üzerine denetim doldurulamaz.';

DROP TRIGGER IF EXISTS trg_od_sablon_kontrol ON olgunluk_denetim;
CREATE TRIGGER trg_od_sablon_kontrol
    BEFORE INSERT OR UPDATE OF sablon_id ON olgunluk_denetim
    FOR EACH ROW EXECUTE FUNCTION olgunluk_denetim_sablon_kontrol();

DROP TRIGGER IF EXISTS trg_od_updated ON olgunluk_denetim;
CREATE TRIGGER trg_od_updated BEFORE UPDATE ON olgunluk_denetim
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ============================================================
-- 7. KRİTER CEVAPLARI — TEK GERÇEK
-- ============================================================
CREATE TABLE IF NOT EXISTS olgunluk_denetim_kriter (
    denetim_id  INTEGER NOT NULL REFERENCES olgunluk_denetim(id) ON DELETE CASCADE,
    -- RESTRICT bilerek: cevaplanmış madde silinemez, ancak pasife alınır.
    kriter_id   INTEGER NOT NULL REFERENCES olgunluk_kriter(id) ON DELETE RESTRICT,
    tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,

    sonuc       TEXT NOT NULL,
    not_metni   TEXT,
    kanit_url   TEXT,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (denetim_id, kriter_id),
    CONSTRAINT odk_sonuc_chk CHECK (sonuc IN ('EVET','HAYIR','KAPSAM_DISI'))
);

COMMENT ON TABLE olgunluk_denetim_kriter IS
'Denetimde işaretlenen maddeler. Sistemin tek ham verisi — seviye, puan, radar, hepsi bundan türer.';
COMMENT ON COLUMN olgunluk_denetim_kriter.sonuc IS
'EVET = sağlanıyor | HAYIR = sağlanmıyor | KAPSAM_DISI = bu atölyede bu operasyon yok (paydadan düşer, seviyeyi bloklamaz)';

CREATE INDEX IF NOT EXISTS idx_odk_kriter ON olgunluk_denetim_kriter(kriter_id);

DROP TRIGGER IF EXISTS trg_odk_updated ON olgunluk_denetim_kriter;
CREATE TRIGGER trg_odk_updated BEFORE UPDATE ON olgunluk_denetim_kriter
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ============================================================
-- 8. RLS — 019b tenant_isolation deseni
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['olgunluk_sablon','olgunluk_kategori','olgunluk_surec',
                             'olgunluk_kriter','olgunluk_denetim','olgunluk_denetim_kriter'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I
                FOR ALL USING (tenant_id = current_tenant_id() OR is_internal_admin())',
            t || '_tenant_isolation', t);
    END LOOP;
END $$;

-- 028: anon/authenticated public şemada yetkisiz kalır.
REVOKE ALL ON olgunluk_sablon, olgunluk_kategori, olgunluk_surec,
              olgunluk_kriter, olgunluk_denetim, olgunluk_denetim_kriter
    FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON
                 olgunluk_sablon, olgunluk_kategori, olgunluk_surec,
                 olgunluk_kriter, olgunluk_denetim, olgunluk_denetim_kriter TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE
                 olgunluk_sablon_id_seq, olgunluk_kategori_id_seq, olgunluk_surec_id_seq,
                 olgunluk_kriter_id_seq, olgunluk_denetim_id_seq TO pes_app';
    END IF;
END $$;

-- ============================================================
-- 9. SEVİYE TÜRETİMİ — SİSTEMİN KALBİ
-- ============================================================
-- KURAL: Bir süreçte seviye N sayılmak için 1..N seviyelerinin TÜM zorunlu
-- atölye maddeleri EVET olmalı. İlk düşen seviye tavanı belirler:
--   seviye 1 düştüyse           -> 0
--   1 geçti, 2 düştü            -> 1
--   1-2 geçti, 3 düştü          -> 2
--   üçü de geçti                -> 3
--
-- ÜÇ İNCELİK:
--   * Cevapsız madde EVET sayılmaz — o seviye düşer. Muhafazakâr: eksik
--     denetim yüksek skor üretmemeli.
--   * KAPSAM_DISI paydadan düşer (atölyede o operasyon yok). Bir seviyenin
--     tüm maddeleri kapsam dışıysa o seviye boş kalır ve geçer.
--   * Maddesi hiç olmayan seviye de geçer (zorunlu_adet = 0). Kaynak
--     Excel'de 33 sürecin çoğunda seviye 2 veya 3 tanımsızdı; tanımsız
--     şart, sağlanamayan şart değildir.
--
-- View'lar önce düşürülür: CREATE OR REPLACE VIEW kolon TİPİNİ değiştiremez.
-- Sayaçlara ::int eklendiğinde (bkz. aşağıdaki not) replace sessizce eski
-- tiple devam ederdi.
DROP VIEW IF EXISTS v_atolye_olgunluk;
DROP VIEW IF EXISTS v_olgunluk_kategori;
DROP VIEW IF EXISTS v_olgunluk_denetim_ozet;
DROP VIEW IF EXISTS v_olgunluk_surec_seviye;

-- SAYAÇLARDA ::int ZORUNLU. count()/sum() bigint döner; postgres.js bigint'i
-- STRING'e çevirir (64-bit hassasiyeti kaybetmemek için). TypeScript tarafında
-- alan "number" yazdığı için derleyici susar, ama çalışma zamanında "1" gelir
-- ve degerlendirilen === 1 gibi karşılaştırmalar sessizce false olur.
-- Aynı sınıf tuzak DATE kolonlarında da yaşandı (029 notu).
--
-- Süreçte hiçbir madde cevaplanmamışsa (ya da sürecin hiç maddesi yoksa)
-- seviye NULL = "değerlendirilmedi"; puanın hem payından hem paydasından düşer.
--
-- View denetim x AKTİF SÜREÇ çaprazından başlar, kriterden değil: kriteri
-- olmayan süreç de satır üretmeli. Kaynak Excel'de 10 sürecin hiç kriteri
-- yoktu ama puanı vardı; onları görünmez yapmak aynı hatanın sessiz hali
-- olurdu. Şimdi "değerlendirilmedi" olarak sayılıyorlar.
CREATE OR REPLACE VIEW v_olgunluk_surec_seviye
WITH (security_invoker = true) AS
WITH kapsam AS (
    SELECT d.id AS denetim_id, d.tenant_id, s.id AS surec_id
    FROM olgunluk_denetim d
    JOIN olgunluk_surec s ON s.sablon_id = d.sablon_id AND s.aktif
),
cevap AS (
    SELECT kp.denetim_id, kp.surec_id, k.seviye, k.zorunlu, dk.sonuc
    FROM kapsam kp
    JOIN olgunluk_kriter k
      ON k.surec_id = kp.surec_id AND k.aktif AND k.taraf = 'ATOLYE'
    LEFT JOIN olgunluk_denetim_kriter dk
      ON dk.denetim_id = kp.denetim_id AND dk.kriter_id = k.id
),
seviye_ozet AS (
    SELECT denetim_id, surec_id, seviye,
           count(*) FILTER (
               WHERE zorunlu AND sonuc IS DISTINCT FROM 'KAPSAM_DISI') AS zorunlu_adet,
           count(*) FILTER (
               WHERE zorunlu AND sonuc = 'EVET')                       AS evet_adet,
           count(*) FILTER (WHERE sonuc IS NOT NULL)                   AS cevapli_adet
    FROM cevap
    GROUP BY 1, 2, 3
),
surec_ozet AS (
    SELECT denetim_id, surec_id,
           sum(cevapli_adet) AS cevapli_toplam,
           bool_and(evet_adet >= zorunlu_adet) FILTER (WHERE seviye = 1) AS g1,
           bool_and(evet_adet >= zorunlu_adet) FILTER (WHERE seviye = 2) AS g2,
           bool_and(evet_adet >= zorunlu_adet) FILTER (WHERE seviye = 3) AS g3
    FROM seviye_ozet
    GROUP BY 1, 2
)
SELECT kp.denetim_id,
       kp.tenant_id,
       kp.surec_id,
       COALESCE(so.cevapli_toplam, 0)::int AS cevapli_toplam,
       CASE
           WHEN so.surec_id IS NULL           THEN NULL   -- sürecin hiç kriteri yok
           WHEN so.cevapli_toplam = 0         THEN NULL   -- hiçbiri cevaplanmamış
           WHEN NOT COALESCE(so.g1, true)     THEN 0
           WHEN NOT COALESCE(so.g2, true)     THEN 1
           WHEN NOT COALESCE(so.g3, true)     THEN 2
           ELSE                                    3
       END AS seviye
FROM kapsam kp
LEFT JOIN surec_ozet so
       ON so.denetim_id = kp.denetim_id AND so.surec_id = kp.surec_id;

COMMENT ON VIEW v_olgunluk_surec_seviye IS
'Denetim x AKTİF SÜREÇ -> 0-3 seviye. Kural: 1..N seviyelerinin tüm zorunlu atölye maddeleri EVET. Cevapsız madde seviyeyi düşürür; KAPSAM_DISI paydadan düşer; tanımsız seviye geçer. Kriteri olmayan ya da hiç cevaplanmamış süreçte NULL = değerlendirilmedi.';

-- ============================================================
-- 10. DENETİM ÖZETİ — PUAN VE YÜZDE
-- ============================================================
-- Kaynak Excel'in TOPLAM'ı ham toplamdı (ve elle yazıldığı için yanlıştı:
-- 55 yazıyordu, gerçek 50). Burada payda da hesaplanır ve
-- DEĞERLENDİRİLEN süreçlerin ağırlığından oluşur — puansız bırakılmış bir
-- süreç (Excel'de 3.1 Dikim böyleydi) skoru şişirmez.
CREATE OR REPLACE VIEW v_olgunluk_denetim_ozet
WITH (security_invoker = true) AS
SELECT d.id                AS denetim_id,
       d.tenant_id,
       d.workshop_id,
       d.sablon_id,
       d.tarih,
       d.durum,
       d.denetci,
       (count(*) FILTER (WHERE ss.seviye IS NOT NULL))::int       AS degerlendirilen,
       (count(*) FILTER (WHERE ss.seviye IS NULL))::int           AS degerlendirilmeyen,
       sum(ss.seviye * s.agirlik) FILTER (WHERE ss.seviye IS NOT NULL) AS puan,
       3 * sum(s.agirlik) FILTER (WHERE ss.seviye IS NOT NULL)    AS max_puan,
       round(
           100.0 * sum(ss.seviye * s.agirlik) FILTER (WHERE ss.seviye IS NOT NULL)
           / NULLIF(3 * sum(s.agirlik) FILTER (WHERE ss.seviye IS NOT NULL), 0)
       , 1)                                                       AS yuzde
FROM olgunluk_denetim d
JOIN v_olgunluk_surec_seviye ss ON ss.denetim_id = d.id
JOIN olgunluk_surec s           ON s.id = ss.surec_id
GROUP BY d.id, d.tenant_id, d.workshop_id, d.sablon_id, d.tarih, d.durum, d.denetci;

COMMENT ON VIEW v_olgunluk_denetim_ozet IS
'Denetim başına puan / max_puan / yüzde. Payda yalnız değerlendirilen süreçlerin ağırlığından oluşur.';

-- ============================================================
-- 11. KATEGORİ KIRILIMI — RADAR
-- ============================================================
-- Kaynak Excel'de radar seviyeleri elle yazılıyordu ve tabloya bağlı
-- değildi. Burada süreçlerden hesaplanır.
-- İki sayı birden verilir: ortalama karnedir, minimum ise zayıf halkadır.
-- Ortalama 2.4 görünen bir kategoride tek bir süreç 0 olabilir.
CREATE OR REPLACE VIEW v_olgunluk_kategori
WITH (security_invoker = true) AS
SELECT ss.denetim_id,
       ss.tenant_id,
       kat.id                                   AS kategori_id,
       kat.kod                                  AS kategori_kod,
       kat.ad                                   AS kategori_adi,
       kat.sira,
       (count(*) FILTER (WHERE ss.seviye IS NOT NULL))::int AS surec_adedi,
       round(sum(ss.seviye * s.agirlik) FILTER (WHERE ss.seviye IS NOT NULL)
             / NULLIF(sum(s.agirlik) FILTER (WHERE ss.seviye IS NOT NULL), 0), 2)
                                                AS ortalama_seviye,
       min(ss.seviye)                           AS en_zayif_seviye
FROM v_olgunluk_surec_seviye ss
JOIN olgunluk_surec s    ON s.id = ss.surec_id
JOIN olgunluk_kategori kat ON kat.id = s.kategori_id
GROUP BY ss.denetim_id, ss.tenant_id, kat.id, kat.kod, kat.ad, kat.sira;

COMMENT ON VIEW v_olgunluk_kategori IS
'Denetim x kategori: ağırlıklı ortalama seviye (radar) ve en zayıf süreç seviyesi. Radar artık elle girilmez.';

-- ============================================================
-- 12. ATÖLYE DURUMU — "HANGİ ATÖLYE NE DURUMDA"
-- ============================================================
-- Atölye başına EN SON TAMAMLANMIŞ denetim. Hiç denetimi olmayan atölye
-- de görünür (LEFT JOIN) — "denetimi yok" da bir durumdur ve raporun
-- asıl aradığı şeydir.
CREATE OR REPLACE VIEW v_atolye_olgunluk
WITH (security_invoker = true) AS
WITH son AS (
    SELECT DISTINCT ON (o.workshop_id) o.*
    FROM v_olgunluk_denetim_ozet o
    WHERE o.durum = 'tamamlandi'
    ORDER BY o.workshop_id, o.tarih DESC, o.denetim_id DESC
)
SELECT w.id            AS workshop_id,
       w.tenant_id,
       w.code          AS atolye_kodu,
       w.name          AS atolye_adi,
       w.is_active,
       p.tedarik_mudurlugu,
       p.teknik_mudur,
       p.risk_seviyesi,
       s.denetim_id,
       s.sablon_id,
       s.tarih         AS son_denetim,
       s.denetci,
       s.puan,
       s.max_puan,
       s.yuzde,
       s.degerlendirilen,
       s.degerlendirilmeyen,
       CASE
           WHEN s.tarih IS NULL   THEN 'YOK'
           WHEN s.yuzde >= 85     THEN 'A'
           WHEN s.yuzde >= 70     THEN 'B'
           WHEN s.yuzde >= 50     THEN 'C'
           ELSE                        'D'
       END AS sinif
FROM workshop w
LEFT JOIN son s             ON s.workshop_id = w.id
LEFT JOIN workshop_profil p ON p.workshop_id = w.id;

COMMENT ON VIEW v_atolye_olgunluk IS
'Atölye başına son TAMAMLANMIŞ olgunluk denetimi. Denetimi olmayan atölye sinif=YOK ile görünür. Bant eşikleri (85/70/50) geçici — kullanıcı onayı bekliyor.';

REVOKE ALL ON v_olgunluk_surec_seviye, v_olgunluk_denetim_ozet,
              v_olgunluk_kategori, v_atolye_olgunluk
    FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT ON v_olgunluk_surec_seviye, v_olgunluk_denetim_ozet,
                 v_olgunluk_kategori, v_atolye_olgunluk TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- POST-MIGRATION
-- ============================================================
-- 1. Katalog yükle:  node scripts/import_olgunluk_katalog.mjs            # kuru
--                    node scripts/import_olgunluk_katalog.mjs --uygula
-- 2. Seviye kuralı:  node scripts/verify_olgunluk_seviye.mjs
-- 3. RLS:            node scripts/verify_tenant_isolation.mjs
-- 4. Anon kapalı:    node scripts/verify_public_api.mjs
--
-- Yayın kilidini elle denemek için:
--   UPDATE olgunluk_sablon SET durum='yayinda' WHERE kod='v4';
--   UPDATE olgunluk_kriter SET metin='x' WHERE id=(SELECT min(id) FROM olgunluk_kriter);
--   -- beklenen: ERROR  Şablon yayinda durumunda; katalog değiştirilemez.
--
-- SIRADAKİ (031b): tamamlanan olgunluk denetimi workshop_denetim'e
--   tip='OLGUNLUK' özet satırı yazacak. Bu, wd_tip_chk kısıtını ve
--   denetim_gecerlilik_ay() fonksiyonunu değiştirir; 029d'deki gibi
--   GENERATED kolonlar DROP edilip yeniden kurulmalı (CREATE OR REPLACE
--   FUNCTION tek başına eski değerleri tazelemez).
--
-- ROLLBACK:
--   BEGIN;
--   DROP VIEW IF EXISTS v_atolye_olgunluk, v_olgunluk_kategori,
--                       v_olgunluk_denetim_ozet, v_olgunluk_surec_seviye;
--   DROP TABLE IF EXISTS olgunluk_denetim_kriter, olgunluk_denetim,
--                        olgunluk_kriter, olgunluk_surec,
--                        olgunluk_kategori, olgunluk_sablon;
--   DROP FUNCTION IF EXISTS olgunluk_katalog_kilit();
--   DROP FUNCTION IF EXISTS olgunluk_denetim_sablon_kontrol();
--   COMMIT;
-- ============================================================
