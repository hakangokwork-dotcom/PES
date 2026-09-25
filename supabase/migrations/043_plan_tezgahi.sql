-- 043 — Planlama tezgâhı: taslak katmanı
--
-- Planlamacının "sanal alanı". Araştırmadaki MRP ayrımının karşılığı:
-- planlanan sipariş (serbestçe değiştirilebilir) ↔ dondurulmuş sipariş
-- (korunan). Taslak, planlananın PES'teki hâli.
--
-- TASLAK ATÖLYEYE GÖRÜNMEZ ve GERÇEK KAPASİTE TÜKETMEZ. Sanal alanın
-- anlamı bu: planlamacı denemeler yapabilsin, atölye her denemeyi
-- bildirim olarak almasın. Kapasite ancak teklif gönderilince yumuşak,
-- onaylanınca sert rezerve olur (2. tur).
--
-- RLS bu yüzden atölye kullanıcısını tamamen dışarıda tutuyor —
-- 040'ın eşitlik kalıbı BURADA KULLANILMAZ, çünkü atölyenin kendi
-- taslağını görmesi de istenmiyor.

BEGIN;

-- ---------- 1. Taslak (senaryo) ----------
--
-- Birden fazla taslak olabilir: "A planı", "B planı — Bese'siz" gibi.
-- Senaryo karşılaştırması tezgâhın asıl değeri; tek taslak zorlamak
-- planlamacıyı yine Excel'e iter.

CREATE TABLE IF NOT EXISTS plan_taslak (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    ad          TEXT    NOT NULL,
    aciklama    TEXT,
    olusturan   UUID,

    -- 'taslak'  : planlamacının tezgâhında, atölye görmez
    -- 'kapandi' : arşiv; yeni kalem eklenmez
    -- 'gonderildi' 2. turda (onay protokolü) eklenecek.
    durum       TEXT    NOT NULL DEFAULT 'taslak',

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pt_durum_chk CHECK (durum IN ('taslak', 'kapandi'))
);

CREATE INDEX IF NOT EXISTS pt_tenant_idx ON plan_taslak (tenant_id, durum);

-- ---------- 2. Taslak kalemi (bir yerleştirme) ----------
--
-- Bir iş emri birden çok banda bölünebilir; her bölüm ayrı satırdır.
-- Bu yüzden anahtar (taslak, iş emri, bant) üçlüsü.
--
-- BİTİŞ TARİHİ SAKLANMIYOR. Kapasiteden TÜRETİLİR (bant-doluluk.ts
-- planBitisi). Saklansaydı bandın günlük hedefi değiştiğinde ya da araya
-- tatil girdiğinde sessizce eskir ve tezgâh yanlış gösterirdi.

CREATE TABLE IF NOT EXISTS plan_taslak_kalem (
    id             SERIAL PRIMARY KEY,
    taslak_id      INTEGER NOT NULL REFERENCES plan_taslak(id) ON DELETE CASCADE,
    tenant_id      UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,

    work_order_id  INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
    workshop_id    INTEGER NOT NULL REFERENCES workshop(id)   ON DELETE CASCADE,
    line_id        INTEGER NOT NULL REFERENCES production_line(id) ON DELETE CASCADE,

    baslangic      DATE    NOT NULL,
    adet           INTEGER NOT NULL,

    not_metni      TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (taslak_id, work_order_id, line_id),
    CONSTRAINT ptk_adet_chk CHECK (adet > 0)
);

CREATE INDEX IF NOT EXISTS ptk_taslak_idx ON plan_taslak_kalem (taslak_id);
CREATE INDEX IF NOT EXISTS ptk_line_idx   ON plan_taslak_kalem (line_id, baslangic);

-- ---------- 3. RLS — iç ekip aracı ----------

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['plan_taslak', 'plan_taslak_kalem'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND current_workshop_id() IS NULL)
             WITH CHECK (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND current_workshop_id() IS NULL)',
            t || '_tenant_isolation', t);
    END LOOP;
END $$;

REVOKE ALL ON plan_taslak, plan_taslak_kalem FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON plan_taslak, plan_taslak_kalem TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE plan_taslak_id_seq TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE plan_taslak_kalem_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;
