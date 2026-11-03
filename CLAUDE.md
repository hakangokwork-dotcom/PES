# PES — Fason Üretim Portalı

> TASLAK · 2026-11-02 · Amaç cümlesi Hakan ile netleşecek; aşağısı ilk öneri.

## Amaç

PES, fason üretim yaptıran bir **merkez** ile onun **fason atölyeleri** arasında köprü kuran portaldır.

- **Atölye** kendi işini yönetmek için veri girer (günlük üretim, duruş, kalite, gider, öz değerlendirme) ve kendi içeriğine bakar (plan, denetim sonucu, karne).
- **Merkez** ortak yönetim katmanını işletir: sipariş yerleştirme, plan ve onay, olgunluk denetimi, kıyas, ekonomi, yıllık talep.
- Kural: **atölye beyan eder, merkez doğrular.** Aynı veriye iki taraf yazıyorsa hangisinin kaynak olduğu ekranda yazılı olmalı.

Vizyon ve ticari çerçeve: `PLATFORM_VISION_v3.md`, `MODULE_CATALOG.md`, `COMMERCIAL_ROADMAP.md` (Nisan 2026 SaaS pivotu; portal amacı oraya henüz işlenmedi).

## İki panel

| Panel | Yol | Kim | Koruma |
|---|---|---|---|
| Merkez | `/pes` | internal tenant owner/admin | `requirePanel('yonetim')` |
| Atölye | `/workshop` | atölyeye bağlı kullanıcı; merkez yöneticisi "atölye adına" da girebilir (`/workshop/gir`) | `requireSession()` |

Atölye kimliği **oturumdan** gelir (`TenantContext.workshopId`); `?wid=` eski desendir, yeni kod kullanmaz. Atölye paneline konan her sayfa `WorkshopSidebar`'a da eklenir; menüde olmayan sayfa yok sayılır.

## Mimari notlar

- Next.js 16 App Router, Supabase (Postgres + Auth), RLS ile çok kiracılı. `lib/auth/*` tek yetki kaynağı.
- Hesaplanan değerler (olgunluk seviyesi/puanı, kapasite, doluluk) **veritabanı görünümlerinde** türetilir; TypeScript'te ikinci kez yazılmaz.
- API: `app/api/pes/*`, hepsi `withTenantRoute`. Migration'lar `supabase/migrations/NNN_*.sql`, sıralı ve yorumlu.
- Simülasyon/VSM çekirdeği ayrı ürün (ProVSM); PES'te yalnız adaptör. Bkz. `docs/provsm-ayirma-plani.md`.

## Ortam

- Üretim DB: Supabase projesi `esucqswvhlnrmcownhbd` (`.env.local` ve canlı paket aynı). Supabase MCP'de görünen `jvgzfvrpjdzwfdtfvvax` **PES değildir**.
- Canlı: https://pes.provsm.com (Vercel `pes-platform`). Ücretsiz Supabase planı boşta duraklayabilir; ilk istek 1–3 dk hata verir.
- Üretim veritabanına yalnız salt okunur sorgu; yazma işlemi migration üzerinden.

## Çalışma kuralları

- Dil: ekran metinleri ve yorumlar Türkçe, doğru karakterlerle ("Duruş", "Atölye"). ASCII'leştirme yok.
- Ortak bileşenler: `components/ui` (`PageHeader`, `Card`, `Badge`…), tema token'ları (`text-ink`, `bg-surface`…); ham Tailwind renkleri kullanılmaz.
- Komutlar: `npm run dev`, `npx tsc --noEmit`, `npm test` (vitest). Değişiklik bu ikisi yeşilken biter.
- Sürüm: `lib/version.ts` ve `package.json` birlikte; commit mesajı `tip(kapsam): açıklama` biçiminde.
- Tasarım/plan dokümanları `docs/superpowers/{specs,plans}/YYYY-MM-DD-*.md`.

## Güncel durum (2026-11-02)

- 131 aktif atölye, 1 atölye kullanıcısı; portal fiilen tek yöneticiyle kullanılıyor.
- Olgunluk: katalog v7 yayında, tamamlanmış denetim yok. Atölye tarafındaki akış kırık. Bkz. `docs/2026-11-02-panel-inceleme-raporu.md`.
