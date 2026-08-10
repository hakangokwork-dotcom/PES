-- ============================================================
-- Migration 032 — Katalog revizyon geçmişi
-- ============================================================
--
-- KULLANICI İSTEĞİ (2026-08-10): "olgunluk kataloğu değiştirilebilir
-- maddelerden oluşsun, bir başlığı ya da içeriği düzenleyebileyim, her
-- kayıt yeni versiyon saklasın, kaydet ya da yoksay seçeneği de olsun,
-- çünkü olgunluk süreçlerini burada canlı bir şekilde oluşturacağım."
--
-- "YENİ VERSİYON" NEDEN ŞABLON SÜRÜMÜ DEĞİL:
--   Her kayıtta yeni bir şablon sürümü açmak, tek bir yazım oturumunda
--   onlarca v5/v6/v7 üretirdi ve sürüm listesi kullanılamaz hale gelirdi.
--   Kastedilen şey kaydın ÖNCEKİ HALİNİN kaybolmaması. O yüzden revizyon
--   SATIR BAZINDA tutuluyor: bir maddenin metnini değiştirdiğinde eski
--   metin bu tabloya düşer, geri alınabilir.
--   Şablon sürümü (v4 -> v5) ayrı ve daha kaba bir kavram olarak duruyor:
--   o, "denetimler hangi soru setiyle yapıldı" sorusunun cevabı.
--
-- NEDEN TEK TABLO + JSONB:
--   Üç tabloyu (kategori/süreç/kriter) ayrı ayrı sürümlemek üç tablo, üç
--   trigger ve üç okuma yolu demekti. Değişen kolonlar da farklı. Snapshot
--   JSONB olarak tutulunca tek trigger fonksiyonu üçüne de takılıyor ve
--   yeni bir alan eklendiğinde revizyon tablosu değişmiyor.
--
-- NE SAKLANIR: satırın DEĞİŞMEDEN ÖNCEKİ hali. Yani en son revizyon,
--   bir önceki metindir; güncel metin her zaman asıl tablodadır.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS olgunluk_revizyon (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,

    tur         TEXT NOT NULL,
    kayit_id    INTEGER NOT NULL,
    sablon_id   INTEGER NOT NULL REFERENCES olgunluk_sablon(id) ON DELETE CASCADE,

    -- Satırın önceki hali. Ham JSONB: kolon eklendiğinde burası değişmesin.
    onceki      JSONB NOT NULL,
    -- Hangi alanlar değişti — geçmiş listesinde "metin değişti" diyebilmek için.
    degisen     TEXT[] NOT NULL DEFAULT '{}',

    kaydeden    UUID,
    kayit_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT orev_tur_chk CHECK (tur IN ('kategori','surec','kriter'))
);

COMMENT ON TABLE olgunluk_revizyon IS
'Katalog satırlarının önceki halleri. Panelde canlı yazım yapılırken hiçbir düzenleme geri alınamaz olmasın diye. Güncel değer asıl tabloda, burada yalnız eski haller.';
COMMENT ON COLUMN olgunluk_revizyon.onceki IS
'Satırın DEĞİŞMEDEN ÖNCEKİ hali (to_jsonb(OLD)). En son revizyon = bir önceki metin.';
COMMENT ON COLUMN olgunluk_revizyon.degisen IS
'Bu kayıtta değişen kolon adları. Geçmiş listesinde neyin değiştiğini yazmak için.';

CREATE INDEX IF NOT EXISTS idx_orev_kayit  ON olgunluk_revizyon(tur, kayit_id, kayit_at DESC);
CREATE INDEX IF NOT EXISTS idx_orev_sablon ON olgunluk_revizyon(sablon_id, kayit_at DESC);

-- ============================================================
-- TRIGGER — üç tabloya da aynı fonksiyon
-- ============================================================
-- Yalnız İZLENEN alanlar değişince kayıt atar. sira/updated_at gibi
-- alanlar sürükle-bırak sıralamada sürekli değişiyor; onları da geçmişe
-- yazmak listeyi anlamsız gürültüyle doldururdu.
CREATE OR REPLACE FUNCTION olgunluk_revizyon_yaz()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_izlenen TEXT[] := ARRAY['kod','ad','metin','taraf','zorunlu','aktif','seviye','agirlik','kategori_id','not_metni'];
    v_degisen TEXT[] := '{}';
    v_alan    TEXT;
    v_eski    JSONB := to_jsonb(OLD);
    v_yeni    JSONB := to_jsonb(NEW);
BEGIN
    FOREACH v_alan IN ARRAY v_izlenen LOOP
        IF v_eski ? v_alan AND v_eski -> v_alan IS DISTINCT FROM v_yeni -> v_alan THEN
            v_degisen := array_append(v_degisen, v_alan);
        END IF;
    END LOOP;

    IF array_length(v_degisen, 1) IS NULL THEN
        RETURN NEW;   -- yalnız sıra/zaman damgası değişmiş; geçmişe yazma
    END IF;

    INSERT INTO olgunluk_revizyon (tenant_id, tur, kayit_id, sablon_id, onceki, degisen, kaydeden)
    VALUES (
        OLD.tenant_id,
        TG_ARGV[0],
        OLD.id,
        OLD.sablon_id,
        v_eski,
        v_degisen,
        NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );
    RETURN NEW;
END $$;

COMMENT ON FUNCTION olgunluk_revizyon_yaz() IS
'Katalog satırı güncellenmeden önceki halini olgunluk_revizyon''a yazar. Yalnız içerik alanları izlenir; sıra değişikliği geçmişe girmez.';

DO $$
DECLARE
    t TEXT;
    tur TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['olgunluk_kategori','olgunluk_surec','olgunluk_kriter'] LOOP
        tur := replace(t, 'olgunluk_', '');
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_revizyon', t);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON %I
                 FOR EACH ROW EXECUTE FUNCTION olgunluk_revizyon_yaz(%L)',
            'trg_' || t || '_revizyon', t, tur);
    END LOOP;
END $$;

-- ============================================================
-- RLS — 019b deseni
-- ============================================================
ALTER TABLE olgunluk_revizyon ENABLE ROW LEVEL SECURITY;
ALTER TABLE olgunluk_revizyon FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS olgunluk_revizyon_tenant_isolation ON olgunluk_revizyon;
CREATE POLICY olgunluk_revizyon_tenant_isolation ON olgunluk_revizyon
    FOR ALL USING (tenant_id = current_tenant_id() OR is_internal_admin());

REVOKE ALL ON olgunluk_revizyon FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT ON olgunluk_revizyon TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE olgunluk_revizyon_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
--   node scripts/verify_olgunluk_revizyon.mjs
--
-- Elle:
--   UPDATE olgunluk_kriter SET metin = metin || ' (deneme)' WHERE id = <taslak sürümden bir id>;
--   SELECT tur, kayit_id, degisen, onceki->>'metin' FROM olgunluk_revizyon ORDER BY id DESC LIMIT 1;
--   -- beklenen: degisen = {metin}, onceki->>'metin' = eski metin
--
--   UPDATE olgunluk_kriter SET sira = sira WHERE id = <aynı id>;
--   -- beklenen: YENİ REVİZYON YOK (içerik değişmedi)
--
-- ROLLBACK:
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_olgunluk_kriter_revizyon   ON olgunluk_kriter;
--   DROP TRIGGER IF EXISTS trg_olgunluk_surec_revizyon    ON olgunluk_surec;
--   DROP TRIGGER IF EXISTS trg_olgunluk_kategori_revizyon ON olgunluk_kategori;
--   DROP FUNCTION IF EXISTS olgunluk_revizyon_yaz();
--   DROP TABLE IF EXISTS olgunluk_revizyon;
--   COMMIT;
-- ============================================================
