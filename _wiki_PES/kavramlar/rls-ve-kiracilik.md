---
tur: kavram
guncelleme: 2026-11-09
kaynaklar: [supabase/migrations/019b_tenancy_enforcement.sql, supabase/migrations/019c_rls_role_hardening.sql, supabase/migrations/046_gorunum_security_invoker.sql, lib/auth/tenant-context.ts, lib/supabase/tenant-db.ts]
---
# RLS ve kiracılık

> Her satır bir kiracıya (ve gerekiyorsa bir atölyeye) aittir; erişimi Postgres RLS uygular, uygulama kodu değil.

## Roller ve bağlantılar
- Uygulama `pes_app` rolüyle bağlanır (`APP_DATABASE_URL`): RLS'e tabidir, `auth` şemasını okuyamaz.
- Migration ve betikler `postgres` rolüyle (`DATABASE_URL`): RLS'i atlar. **Ölçümde bu fark önemli**: postgres ile hızlı olan sorgu pes_app ile yavaş olabilir ([[performans-dersleri]]).
- Kimlik çözümü SECURITY DEFINER fonksiyonlarla: `resolve_tenant_context`, `resolve_workshop_id` (pes_app `tenant_user` / `workshop_user`'ı doğrudan okuyamaz).

## Oturum değişkenleri
`withTenant` (`lib/supabase/tenant-db.ts`) işlem başında tek SELECT'te `set_config` ile kiracı, atölye, e-posta ve beklenen sürümü ([[2026-11-03-ortak-kayit]]) yazar. Politikalar `current_tenant_id()`, `current_workshop_id()`, `is_internal_admin()` ile okur.

## Kim neyi görür
- internal kiracı + owner/admin → merkez; tüm atölyeler.
- `workshop_user` bağı olan kullanıcı → yalnız kendi atölyesi.
- Merkez yöneticisi "atölye adına" girerse atölye kapsamı çerezden gelir; yetki farkı yok.
- Kullanıcı açma: `scripts/create-user.mjs --panel=sahip|tam|atolye --atolye=KOD`.

## Tuzaklar
- **Görünümler `security_invoker = true` olmalı.** Olmazsa görünüm sahibinin (postgres) haklarıyla çalışır ve RLS'i hiç uygulamaz. 046 iki görünümde bunu kapattı; `CREATE OR REPLACE VIEW` seçeneği düşürmüştü. Görünümü yeniden yazan migration `WITH (security_invoker = true)` koymalı.
- RLS politikası satır başına fonksiyon çağırır; görünüm bir sorguda satır başına yeniden değerlendirilirse maliyet katlanır ([[v-atolye-denetim-durum]]).
