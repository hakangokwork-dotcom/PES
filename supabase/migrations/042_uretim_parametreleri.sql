-- 042 — Atölye bazlı üretim parametreleri (E5)
--
-- Model değişim süresi, öğrenme oranı ve ilk birim çarpanı atölyeden
-- atölyeye değişir. Varsayılanlar kodda (lib/pes/siparis-senaryo.ts);
-- bu tablo yalnız FARKLI olanı tutar — her atölye için satır açmak,
-- varsayılan değiştiğinde 139 satırın eskimesi demek olurdu.
--
-- KAYNAK ALANI ŞART. PES'te gerçek model değişim ölçümü YOK:
-- changeover_record'un 45 satırının hepsi demo verisi (demo-atolye
-- kiracısı, FA-01..FA-08). Bu tabloya yazılan değer varsayım mı, atölye
-- beyanı mı, gerçek ölçüm mü — ekranda ayırt edilebilmeli. Ayrılmazsa
-- uydurma bir sayı, ölçülmüş gibi görünür.

BEGIN;

CREATE TABLE IF NOT EXISTS workshop_uretim_param (
    id                 SERIAL PRIMARY KEY,
    tenant_id          UUID    NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
    workshop_id        INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,

    -- Bir model değişiminin bandı durdurduğu dakika.
    degisim_dk         NUMERIC(6,1),

    -- Wright öğrenme oranı: kümülatif adet katlandığında birim süre oranı.
    -- 1 ve üstü "hiç öğrenme yok" demektir ve kayıp hesaplanamaz; 0 ve altı
    -- anlamsız. CHECK ikisini de dışarıda tutuyor.
    ogrenme_orani      NUMERIC(4,3),

    -- İlk birim kararlı hızın kaç katı sürer. 1 = öğrenme kaybı yok.
    ilk_birim_carpani  NUMERIC(4,2),

    kaynak             TEXT    NOT NULL DEFAULT 'varsayim',
    note               TEXT,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (workshop_id),
    CONSTRAINT wup_kaynak_chk   CHECK (kaynak IN ('varsayim', 'beyan', 'olcum')),
    CONSTRAINT wup_degisim_chk  CHECK (degisim_dk IS NULL OR degisim_dk >= 0),
    CONSTRAINT wup_ogrenme_chk  CHECK (ogrenme_orani IS NULL
                                       OR (ogrenme_orani > 0 AND ogrenme_orani < 1)),
    CONSTRAINT wup_carpan_chk   CHECK (ilk_birim_carpani IS NULL OR ilk_birim_carpani >= 1)
);

CREATE INDEX IF NOT EXISTS wup_tenant_idx ON workshop_uretim_param (tenant_id);

ALTER TABLE workshop_uretim_param ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_uretim_param FORCE  ROW LEVEL SECURITY;

-- Atölye kendi parametresini GÖRÜR (kendi değişim süresi kendi bilgisi),
-- ama DEĞİŞTİREMEZ — kendi lehine ayarlayıp fiyat pazarlığını etkileyebilirdi.
-- 040'ın deseni: eşitlik şartı, 035'in NULL kalıbı değil.
CREATE POLICY workshop_uretim_param_select ON workshop_uretim_param
    FOR SELECT USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND (current_workshop_id() IS NULL
             OR workshop_id = current_workshop_id())
    );

CREATE POLICY workshop_uretim_param_write ON workshop_uretim_param
    FOR ALL USING (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND current_workshop_id() IS NULL
    )
    WITH CHECK (
        (tenant_id = current_tenant_id() OR is_internal_admin())
        AND current_workshop_id() IS NULL
    );

REVOKE ALL ON workshop_uretim_param FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON workshop_uretim_param TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE workshop_uretim_param_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;
