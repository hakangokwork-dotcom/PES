-- ============================================================
-- Migration 020 — Atölye 360 (Halka 1 + 3)
-- PES Entegrasyon Planı v0.1, Sprint 1
-- Ref: PES-ENTEGRASYON-PLANI.md §2 / 020_workshop_account.sql
-- ============================================================
--
-- BU MIGRATION GÜVENLİDİR — yalnız additive DDL.
-- Mevcut tablolara dokunulmaz, workshop tablosu şişirilmez.
-- 1:1 uzatma (workshop_account) + 3 çocuk tablo eklenir.
--
-- İçerik:
--   1. workshop_account         — kimlik / tesis / ilişki bilgisi (1:1)
--   2. workshop_contact         — iletişim kişileri (1:N)
--   3. workshop_customer_share  — müşteri kapasite paylaşımı (SCD-2)
--   4. workshop_interaction     — etkileşim günlüğü (CRM activity log)
--   5. tenant_id index'leri
--   6. RLS + FORCE + tenant_isolation policy (019b kalıbı)
--
-- TENANCY: 019b disiplini aynen uygulanır — tenant_id NOT NULL,
-- RLS FORCE, policy adı <tablo>_tenant_isolation.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. WORKSHOP_ACCOUNT — 1:1 uzatma
-- ============================================================
CREATE TABLE IF NOT EXISTS workshop_account (
    workshop_id        INTEGER PRIMARY KEY REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id          UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    legal_name         TEXT,                       -- tam ticari ünvan
    tax_no             VARCHAR(20),
    founded_date       DATE,
    relationship_start DATE,                       -- firmayla çalışma başlangıcı → ilişki yaşı
    production_area_m2 INTEGER CHECK (production_area_m2 IS NULL OR production_area_m2 > 0),
    building_ownership TEXT CHECK (building_ownership IN ('kira','mulk')),
    incentive_zone     SMALLINT CHECK (incentive_zone BETWEEN 1 AND 6),  -- workshop.bolge ile senkron
    address_full       TEXT,
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  workshop_account IS 'Atölye 360 Halka 1 — kimlik/tesis/ilişki. workshop ile 1:1, çekirdek tabloyu şişirmemek için ayrı.';
COMMENT ON COLUMN workshop_account.relationship_start IS 'İlişki yaşı hesabının kaynağı: AGE(CURRENT_DATE, relationship_start).';
COMMENT ON COLUMN workshop_account.incentive_zone IS 'Teşvik bölgesi 1-6. workshop.bolge ile tutarlı olmalı; çapraz kontrol 022 güven skorunda kullanılır.';

-- ============================================================
-- 2. WORKSHOP_CONTACT — iletişim kişileri
-- ============================================================
CREATE TABLE IF NOT EXISTS workshop_contact (
    id          SERIAL PRIMARY KEY,
    workshop_id INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    role        TEXT,
    phone       TEXT,
    email       TEXT,
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshop_contact_ws ON workshop_contact(workshop_id);

-- Atölye başına tek birincil kişi
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_contact_primary
    ON workshop_contact(workshop_id) WHERE is_primary;

COMMENT ON TABLE workshop_contact IS 'Atölye 360 Halka 1 — iletişim kişileri. is_primary atölye başına en fazla bir kayıt (partial unique index).';

-- ============================================================
-- 3. WORKSHOP_CUSTOMER_SHARE — müşteri kapasite paylaşımı (SCD-2)
-- ============================================================
CREATE TABLE IF NOT EXISTS workshop_customer_share (
    id             SERIAL PRIMARY KEY,
    workshop_id    INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id      UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    customer_label TEXT NOT NULL,                  -- 'biz' | diğer müşteri etiketi
    share_pct      NUMERIC(5,2) CHECK (share_pct >= 0 AND share_pct <= 100),
    valid_from     DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to       DATE,                           -- NULL = hâlen geçerli
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_workshop_cshare_ws ON workshop_customer_share(workshop_id);

-- Aynı müşteri için çakışan açık dönem olmasın
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_cshare_current
    ON workshop_customer_share(workshop_id, customer_label) WHERE valid_to IS NULL;

COMMENT ON TABLE workshop_customer_share IS 'Atölye 360 Halka 3 — bize ayrılan kapasite / diğer müşteriler. SCD-2: geçmiş satır valid_to ile kapatılır, silinmez.';

-- ============================================================
-- 4. WORKSHOP_INTERACTION — etkileşim günlüğü
-- ============================================================
CREATE TABLE IF NOT EXISTS workshop_interaction (
    id          SERIAL PRIMARY KEY,
    workshop_id INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('ziyaret','denetim','olay','dmaic','fiyat_revizyonu','not')),
    occurred_at DATE NOT NULL DEFAULT CURRENT_DATE,
    summary     TEXT NOT NULL,
    detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshop_interaction_ws   ON workshop_interaction(workshop_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_interaction_kind ON workshop_interaction(kind);

COMMENT ON TABLE workshop_interaction IS 'Atölye 360 Halka 3 — zaman çizgisi. 023 körelme job''ı ve 025 fiyat koridoru sapması buraya otomatik not düşer.';

-- ============================================================
-- 5. updated_at TRIGGER (mevcut pes_update_updated_at fonksiyonu)
-- ============================================================
DROP TRIGGER IF EXISTS trg_workshop_account_updated ON workshop_account;
CREATE TRIGGER trg_workshop_account_updated
    BEFORE UPDATE ON workshop_account
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ============================================================
-- 6. TENANT_ID INDEX'LERİ
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_workshop_account_tenant     ON workshop_account(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workshop_contact_tenant     ON workshop_contact(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workshop_customer_share_tenant ON workshop_customer_share(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workshop_interaction_tenant ON workshop_interaction(tenant_id);

-- ============================================================
-- 7. RLS + FORCE + TENANT ISOLATION (019b kalıbı)
-- ============================================================
DO $$
DECLARE
    t TEXT;
    new_tables TEXT[] := ARRAY[
        'workshop_account','workshop_contact',
        'workshop_customer_share','workshop_interaction'
    ];
    policy_name TEXT;
BEGIN
    FOREACH t IN ARRAY new_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

        policy_name := t || '_tenant_isolation';
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, t);
        EXECUTE format(
            'CREATE POLICY %I ON %I
                FOR ALL USING (tenant_id = current_tenant_id() OR is_internal_admin())',
            policy_name, t
        );
    END LOOP;
END $$;

-- ============================================================
-- 8. MEVCUT ATÖLYELER İÇİN BOŞ ACCOUNT SATIRI
-- ============================================================
-- Detay sayfası LEFT JOIN yerine doğrudan okuyabilsin diye her workshop'a
-- bir account satırı açılır (alanlar NULL, kullanıcı doldurur).
INSERT INTO workshop_account (workshop_id, tenant_id)
SELECT w.id, w.tenant_id FROM workshop w
ON CONFLICT (workshop_id) DO NOTHING;

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA (manuel)
-- ============================================================
-- 1. SELECT count(*) FROM workshop_account;
--    -- workshop sayısına eşit olmalı
--
-- 2. SELECT relname, relforcerowsecurity FROM pg_class
--    WHERE relname LIKE 'workshop\_%';
--    -- 4 yeni tabloda relforcerowsecurity = true
--
-- 3. SELECT set_config('app.current_tenant_id',
--      (SELECT id::text FROM tenant WHERE slug='default'), true);
--    SELECT count(*) FROM workshop_account;
--    -- tenant context'inde satırlar görünür
