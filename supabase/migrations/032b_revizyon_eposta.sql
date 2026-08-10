-- ============================================================
-- Migration 032b — Revizyonda "kim değiştirdi" e-postası
-- ============================================================
--
-- 032'de yalnız kullanıcı UUID'si saklanıyordu ve ekran onu auth.users ile
-- join'leyerek e-postaya çeviriyordu. Bu ÇALIŞMIYOR: uygulama pes_app
-- rolüyle bağlanıyor ve o rolün auth şemasında yetkisi yok —
-- "permission denied for schema auth". Testte yakalandı.
--
-- auth şemasına yetki VERMEK yanlış çözüm olurdu: geçmiş listesi için
-- tüm kullanıcı tablosunu açmak gerekirdi.
--
-- Doğrusu, denetim kayıtlarının olağan yolu: e-posta YAZMA ANINDA
-- kopyalanır. Denormalize ama kasıtlı — kayıt, o anki kimliği dondurur;
-- kullanıcı sonradan silinse ya da e-postası değişse bile geçmiş
-- "o zaman kim yaptı" sorusunu doğru cevaplamaya devam eder.
-- ============================================================

BEGIN;

ALTER TABLE olgunluk_revizyon ADD COLUMN IF NOT EXISTS kaydeden_eposta TEXT;

COMMENT ON COLUMN olgunluk_revizyon.kaydeden_eposta IS
'Değişikliği yapanın o andaki e-postası. Bilerek kopya: pes_app auth şemasını okuyamaz ve geçmiş, kimlik sonradan değişse de sabit kalmalı.';

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

    INSERT INTO olgunluk_revizyon
        (tenant_id, tur, kayit_id, sablon_id, onceki, degisen, kaydeden, kaydeden_eposta)
    VALUES (
        OLD.tenant_id,
        TG_ARGV[0],
        OLD.id,
        OLD.sablon_id,
        v_eski,
        v_degisen,
        NULLIF(current_setting('app.current_user_id', true), '')::uuid,
        NULLIF(current_setting('app.current_user_email', true), '')
    );
    RETURN NEW;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA:  npx vitest run lib/pes/olgunluk-revizyon.test.ts
--
-- ROLLBACK:
--   ALTER TABLE olgunluk_revizyon DROP COLUMN kaydeden_eposta;
--   -- ve 032'deki fonksiyon gövdesini geri koy.
-- ============================================================
