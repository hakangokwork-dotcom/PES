-- ============================================================
-- Migration 022c — Gider beyanı revizyon geçmişi
-- ============================================================
--
-- SORUN:
--   monthly_expense'te UNIQUE (workshop_id, year, month) var. Bir atölye
--   geçmiş dönem için düzeltilmiş beyan gönderdiğinde import unique
--   ihlaliyle patlıyordu — re-beyan hiç mümkün değildi.
--
--   Enflasyonist ortamda re-beyan istisna değil kural: kur sıçrayınca
--   doğalgaz/enerji faturaları revize ediliyor, atölye düzeltme
--   gönderiyor. Eski değer de saklanmalı, aksi halde "artış gerçek mi,
--   yoksa düzeltme mi" sorusu cevaplanamaz.
--
-- ÇÖZÜM:
--   expense_declaration_staging zaten append-only ham defter (021).
--   Onu sürüm defterine çeviriyoruz:
--     - revision_no      : aynı (atölye, dönem) için kaçıncı beyan
--     - superseded_at/by : hangi sürümün yerini hangi sürüm aldı
--   monthly_expense "geçerli değer" olarak kalır ve hangi sürümden
--   geldiğini current_staging_id ile gösterir.
--
--   Yani: staging = tarih, monthly_expense = bugünkü gerçek.
--
-- BU MIGRATION GÜVENLİDİR — additive; mevcut satırlar revision_no=1 olur.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. STAGING → SÜRÜM DEFTERİ
-- ============================================================
ALTER TABLE expense_declaration_staging
    ADD COLUMN IF NOT EXISTS revision_no    INTEGER,
    ADD COLUMN IF NOT EXISTS superseded_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS superseded_by  INTEGER REFERENCES expense_declaration_staging(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS revision_note  TEXT;

COMMENT ON COLUMN expense_declaration_staging.revision_no IS 'Aynı (workshop_id, donem) için kaçıncı beyan. 1 = ilk beyan.';
COMMENT ON COLUMN expense_declaration_staging.superseded_at IS 'NULL ise bu sürüm hâlen geçerli. Dolu ise yerini superseded_by aldı.';
COMMENT ON COLUMN expense_declaration_staging.revision_note IS 'Atölyenin/operatörün düzeltme gerekçesi (örn. "doğalgaz faturası revize edildi").';

-- Mevcut satırlara sürüm numarası ver (yükleme sırasına göre)
UPDATE expense_declaration_staging s
SET revision_no = sub.rn
FROM (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY workshop_id, donem ORDER BY created_at, id
    ) AS rn
    FROM expense_declaration_staging
) sub
WHERE s.id = sub.id AND s.revision_no IS NULL;

CREATE INDEX IF NOT EXISTS idx_expense_staging_revision
    ON expense_declaration_staging(workshop_id, donem, revision_no DESC);

-- Aynı (atölye, dönem) için en fazla bir geçerli sürüm
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_staging_current
    ON expense_declaration_staging(workshop_id, donem)
    WHERE superseded_at IS NULL AND workshop_id IS NOT NULL AND match_status = 'matched';

-- ============================================================
-- 2. MONTHLY_EXPENSE → GEÇERLİ SÜRÜME İŞARET
-- ============================================================
ALTER TABLE monthly_expense
    ADD COLUMN IF NOT EXISTS current_staging_id INTEGER
        REFERENCES expense_declaration_staging(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS revision_no INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS revised_at  TIMESTAMPTZ;

COMMENT ON COLUMN monthly_expense.current_staging_id IS 'Bu satırdaki değerlerin geldiği staging sürümü. NULL = elle girilmiş, import değil.';
COMMENT ON COLUMN monthly_expense.revision_no IS 'Kaç kez revize edildi. 1 = hiç revize edilmedi.';

-- ============================================================
-- 3. SÜRÜM GEÇMİŞİ VIEW
-- ============================================================
-- Bir (atölye, dönem) için tüm beyan sürümleri, sıralı.
-- raw JSONB'den okunabilir alan çıkarmaz — ham veri yorumlanmadan
-- gösterilir (izlenebilirlik ilkesi); yorumlama uygulama katmanında.
CREATE OR REPLACE VIEW v_expense_revisions AS
SELECT
    s.id                AS staging_id,
    s.tenant_id,
    s.workshop_id,
    w.code              AS workshop_code,
    s.donem,
    s.revision_no,
    s.source,
    s.source_ref,
    s.revision_note,
    s.created_at        AS submitted_at,
    s.superseded_at,
    s.superseded_by,
    (s.superseded_at IS NULL) AS is_current,
    s.raw,
    dq.total_sc,
    dq.status           AS quality_status
FROM expense_declaration_staging s
LEFT JOIN workshop w ON w.id = s.workshop_id
LEFT JOIN declaration_quality dq ON dq.staging_id = s.id
WHERE s.workshop_id IS NOT NULL
ORDER BY s.workshop_id, s.donem, s.revision_no;

COMMENT ON VIEW v_expense_revisions IS 'Gider beyanı sürüm defteri. Her (atölye, dönem) için tüm gönderimler; is_current = geçerli sürüm.';

COMMIT;

-- ============================================================
-- POST-MIGRATION DOĞRULAMA (manuel)
-- ============================================================
-- 1. SELECT count(*) FROM expense_declaration_staging WHERE revision_no IS NULL;  -- 0
-- 2. Aynı dönemi iki kez yükle → staging'de 2 satır, revision_no 1 ve 2,
--    ilkinde superseded_at dolu, monthly_expense'te tek satır (revision_no=2).
-- 3. SELECT * FROM v_expense_revisions WHERE donem = '2026-02';
