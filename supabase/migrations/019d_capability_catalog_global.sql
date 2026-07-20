-- ============================================================
-- Migration 019d — Yetkinlik kataloğu hibrit/global tenancy
-- 019c'nin ortaya çıkardığı veri modeli sorununun düzeltmesi
-- ============================================================
--
-- SORUN:
--   019a tüm operasyonel tabloları default tenant'a taşıdı;
--   capability_dimension (10 satır) ve capability_value (86 satır)
--   'default' tenant'ında kaldı. Oysa line_capability ve workshop
--   'demo-atolye' tenant'ında.
--
--   019b RLS kurdu ama uygulama BYPASSRLS rolüyle bağlandığı için
--   uyumsuzluk görünmedi. 019c baypası kaldırınca ortaya çıktı:
--   demo-atolye kataloğu göremiyor, yetkinlik etiketleri NULL dönüyor
--   ve arayüz "Cinsiyet / Yas" yerine "cinsiyet_yas" gösteriyor.
--
-- ÇÖZÜM:
--   Bu iki tablo taksonomidir (kumaş türü, siluet, klasman...) —
--   tenant'a özel iş verisi değil. 019b'nin master_process /
--   product_category için kullandığı "global referans" mantığı ve
--   model_library'nin hibrit deseni burada da geçerli:
--
--     tenant_id IS NULL  -> global katalog, herkes okur
--     tenant_id = <uuid> -> tenant'a özel ek tanım
--
--   Mevcut 96 satır global'e (NULL) çekilir; tenant'lar isterse
--   kendi satırlarını ekleyebilir.
--
-- ROLLBACK:
--   UPDATE ... SET tenant_id = (default tenant) WHERE tenant_id IS NULL;
--   ALTER TABLE ... ALTER COLUMN tenant_id SET NOT NULL;
--   ve hibrit policy'leri 019b'nin tenant_isolation'ı ile değiştir.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. NOT NULL KISITINI KALDIR (global satırlar için NULL gerekli)
-- ============================================================
ALTER TABLE capability_dimension ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE capability_value     ALTER COLUMN tenant_id DROP NOT NULL;

-- ============================================================
-- 2. MEVCUT KATALOĞU GLOBAL YAP
-- ============================================================
-- Yalnız 'default' (internal) tenant'ındaki satırlar taşınır.
-- Bir tenant kendi özel tanımını eklemişse ona dokunulmaz.
UPDATE capability_dimension SET tenant_id = NULL
WHERE tenant_id = (SELECT id FROM tenant WHERE slug = 'default');

UPDATE capability_value SET tenant_id = NULL
WHERE tenant_id = (SELECT id FROM tenant WHERE slug = 'default');

-- ============================================================
-- 3. HİBRİT POLİCY (model_library deseni)
-- ============================================================
-- Okuma: global + kendi tenant'ı
-- Yazma: yalnız kendi tenant'ı (global katalogu değiştiremez)
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['capability_dimension','capability_value'] LOOP
        -- 019b'nin katı izolasyon policy'sini kaldır
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_hybrid_read', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT
                USING (tenant_id IS NULL OR tenant_id = current_tenant_id() OR is_internal_admin())',
            t || '_hybrid_read', t
        );

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR INSERT
                WITH CHECK (tenant_id = current_tenant_id() OR is_internal_admin())',
            t || '_tenant_insert', t
        );

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR UPDATE
                USING (tenant_id = current_tenant_id() OR is_internal_admin())',
            t || '_tenant_update', t
        );

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_delete', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR DELETE
                USING (tenant_id = current_tenant_id() OR is_internal_admin())',
            t || '_tenant_delete', t
        );
    END LOOP;
END $$;

COMMENT ON TABLE capability_dimension IS 'Yetkinlik boyutu taksonomisi. HİBRİT: tenant_id NULL = global katalog, dolu = tenant''a özel. Global satırlar yalnız internal admin tarafından değiştirilir.';
COMMENT ON TABLE capability_value     IS 'Yetkinlik değeri taksonomisi. HİBRİT: tenant_id NULL = global katalog, dolu = tenant''a özel.';

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA (manuel)
-- ============================================================
-- 1. SELECT count(*) FROM capability_dimension WHERE tenant_id IS NULL;  -- 10
--    SELECT count(*) FROM capability_value     WHERE tenant_id IS NULL;  -- 86
--
-- 2. pes_app ile, demo-atolye context'inde:
--      SELECT count(*) FROM capability_value;   -- 86 (global görünür)
--
-- 3. Arayüz: /pes/workshops/1 > Yetkinlik sekmesi
--    -- başlıklar "Kumas Turu" gibi etiket olmalı, "kumas_turu" değil
