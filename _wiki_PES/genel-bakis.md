---
tur: sentez
soru: "PES nedir, nasıl kurulu, şu an nerede?"
guncelleme: 2026-11-09
kaynaklar: [CLAUDE.md]
---
# PES — Genel bakış

> Fason üretim yaptıran **merkez** ile onun **fason atölyeleri** arasında köprü kuran portal.
> Atölye kendi işini yönetmek için veri girer; merkez ortak yönetim katmanını işletir.

## İki panel
| Panel | Yol | Kim |
|---|---|---|
| Merkez | `/pes` | internal kiracının owner/admin'i |
| Atölye | `/workshop` | atölyeye bağlı kullanıcı; merkez yöneticisi "atölye adına" da girebilir (`/workshop/gir`) |

Atölye kimliği oturumdan gelir (`TenantContext.workshopId`). Ayrıntı: [[rls-ve-kiracilik]].

## Temel kurallar
- [[2026-11-03-ortak-kayit]] — ortak kayıt, onay yok; araya giren değişiklik 409.
- Hesaplanan değerler (olgunluk, kapasite, doluluk) veritabanı görünümlerinde türetilir, TS'de ikinci kez yazılmaz. Bedeli: [[performans-dersleri]].
- Simülasyon/VSM çekirdeği ayrı ürün (ProVSM); PES'te yalnız adaptör. Bkz. `docs/provsm-ayirma-plani.md`.

## Teknoloji
Next.js 16 App Router, React 19, Supabase (Postgres + Auth, RLS), postgres.js, Tailwind 4, vitest. Vercel `pes-platform`, bölge dub1. Yayın: [[2026-11-09-fason-win]].

## Modüller
Katalog [[index]]'te. Merkez: [[siparis-yerlestirme]], [[atolye-profil]], [[olgunluk]], [[ekonomi]], [[yillik-plan]], [[plan-tezgahi]]. Atölye: [[atolye-panosu]], [[gunluk-uretim]] ve veri giriş ekranları.

## Durum (2026-11-09)
- Sürüm v1.15.x; canlı www.fason.win.
- 131 aktif atölye; portal fiilen tek yöneticiyle kullanılıyor, ekip veri girişine açılıyor.
- Olgunluk kataloğu v7 yayında, tamamlanmış denetim yok.
