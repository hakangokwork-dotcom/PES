-- ============================================================
-- 026_workshop_ownership.sql
-- Atölye sahipliği — "bu atölyeyle ben ilgileniyorum" işareti.
--
-- KAPSAM SINIRI (bilinçli): bu bir ERİŞİM KISITI DEĞİLDİR.
--   Sahiplik kimsenin başka atölyeyi görmesini/düzenlemesini engellemez.
--   Kullanıcılar sahipliği kendileri belirler, veri ortak alanda serbesttir.
--   İşe yaradığı yerler:
--     · kimin hangi atölyeyle ilgilendiğini görmek (ortak alandan yönetim)
--     · kullanıcıya kendi atölyesini listenin başında göstermek (114 kayıt var)
--     · ileride kısıt istenirse altyapının hazır olması
--   Kısıt gerekirse withTenantRoute'ta tek noktadan eklenir; şema değişmez.
--
-- BİR ATÖLYENİN TEK SAHİBİ olur (kolon atölyede). Bir kullanıcı birden
-- fazla atölye sahiplenebilir — fason takip eden biri için normaldir.
--
-- ON DELETE SET NULL: kullanıcı silinince atölye sahipsiz kalır, silinmez.
-- ============================================================

BEGIN;

ALTER TABLE workshop ADD COLUMN IF NOT EXISTS owner_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE workshop ADD COLUMN IF NOT EXISTS owned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_workshop_owner ON workshop(owner_user_id)
    WHERE owner_user_id IS NOT NULL;

COMMENT ON COLUMN workshop.owner_user_id IS
  'Bu atölyeyi sahiplenen kullanıcı. NULL = havuzda, sahipsiz. Erişim kısıtı DEĞİL — yalnız ilgi/sorumluluk işareti.';
COMMENT ON COLUMN workshop.owned_at IS
  'Sahiplenme zamanı. Sahiplik bırakılınca NULL''a döner.';

-- ============================================================
-- SAHİBİN E-POSTASI
-- ============================================================
-- Uygulama pes_app rolüyle bağlanır ve auth şemasına erişemez (doğru kısıt).
-- "Kim sahiplenmiş" bilgisini göstermek için 019c'deki resolve_tenant_context
-- deseni: SECURITY DEFINER köprü fonksiyon.
--
-- KAPSAM: yalnız AYNI TENANT'taki kullanıcının e-postasını döndürür. Rastgele
-- bir UUID ile başka tenant'ın kullanıcı e-postası çekilemez.
CREATE OR REPLACE FUNCTION public.kullanici_eposta(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT u.email::text
    FROM auth.users u
    JOIN tenant_user tu ON tu.user_id = u.id
    WHERE u.id = p_user_id
      AND tu.tenant_id = current_tenant_id()
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.kullanici_eposta(UUID) IS
  'Aynı tenant''taki kullanıcının e-postası. pes_app auth şemasını göremediği için SECURITY DEFINER köprü.';

REVOKE ALL ON FUNCTION public.kullanici_eposta(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kullanici_eposta(UUID) TO pes_app;

COMMIT;
