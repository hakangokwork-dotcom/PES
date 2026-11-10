---
tur: karar
durum: gecerli
tarih: 2026-11-03
guncelleme: 2026-11-09
kaynaklar: [CLAUDE.md, supabase/migrations/054_kayit_kim_girdi.sql, supabase/migrations/055_ortak_kayit_butunlugu.sql, lib/pes/giren.ts]
---
# Ortak kayıt, onay yok

## Bağlam
Atölye ve merkez aynı veriyi (üretim, kalite, duruş, işgücü, gider, profil, bant, yetenek, model değişimi) ayrı ayrı girebiliyor. Kimin girdiği görünmüyordu; iki taraf aynı satırı sessizce eziyordu.

## Karar
- Tek kayıt; iki panel aynı satırı okur ve yazar. Onay akışı yok.
- **Kim girdi** veritabanında tutulur: `giren_taraf` / `giren_eposta` (054, tetikleyici). Uygulama bu kolonlara yazmaz.
- **Araya giren değişiklik** reddedilir: yazma ekranı kaydı açtığı sürümü `surumBasligi()` ile gönderir (`lib/pes/giren.ts`); sürüm tutmazsa 409 (055).
- Künye bant/çalışan sayısı `workshop` ile tetikleyiciyle eşit tutulur; ikinci kopya açılmaz.

## Seçilmeyenler
- "Yalnız atölye yazar" ya da onaylı akış: ileride gelebilir; bugünkü kullanıcı sayısı buna değmiyor.

## Sonuçlar
Yeni yazma ekranı eklerken: `surumBasligi()` gönder, 409'u kullanıcıya göster, `giren_*` kolonlarına yazma. İlgili: [[rls-ve-kiracilik]].
