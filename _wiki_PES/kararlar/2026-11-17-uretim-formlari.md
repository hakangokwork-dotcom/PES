---
tur: karar
durum: gecerli
tarih: 2026-11-17
guncelleme: 2026-11-17
kaynaklar: [Tutulması Gereken Formlar Family.xlsx, supabase/migrations/059_uretim_formlari.sql, lib/pes/formlar.ts]
---
# Üretim formları: tek tablo, kodda tanım

## Bağlam
Atölyeler müşteri için 19 kâğıt form tutuyor (risk analizi, makine bakım, kırık iğne, hat içi kalite, ara/final ölçü, düğme çekme, çakım, metal dedektör ×4, hata formları, AQL, çeki listesi). Merkez bunları göremiyordu.

## Karar
- Tek tablo `uretim_formu` (059): atölye, seçmeli PO (`work_order_id`), `form_kodu`, `tarih`, `veri` JSONB. Formun alanları ve tabloları `lib/pes/formlar.ts`'te; sunucu gövdeyi tanıma göre süzer (`formVerisiniSuz`).
- PO her formda seçmeli: doluysa sipariş kaydı, boşsa atölyenin süreç kaydı. Sipariş no / model / müşteri iş emrinden okunur, formda tekrar sorulmaz.
- Ortak kayıt kuralı aynen: `giren_*` tetikleyicisi ve 409 sürüm kontrolü. İki panel tek bileşen (`components/pes/UretimFormlari.tsx`): `/workshop/formlar`, `/pes/formlar`.
- PO'nun formun atölyesine ait olduğu API'de ayrıca kontrol edilir (FK, RLS'i atlar).

## Seçilmeyenler ve neden
- Form başına tablo (19 tablo): her form değişikliği migration ister; formlar müşteriye göre değişiyor.
- Ölçü formlarını taslaktaki ölçü şartnamesi tablolarına bağlamak: şartname henüz yok; gelince referans/spec değerleri oradan doldurulabilir.

## Sonuçlar
- Form alanı eklemek kod değişikliği; eski kayıt açılınca eksik alan boş gelir.
- Formlardan hesap (hata oranı, ölçü sapması) gerekirse JSONB üzerinden görünüm yazılır, TypeScript'te değil.
- Ekler (060): fotoğraf/PDF Supabase Storage kapalı kovası `uretim-formlari`; kova politikası yok, yalnız sunucu (service role) erişir, yetki `uretim_formu_dosya` RLS'inden. Görüntüleme 1 saatlik imzalı bağlantı. Kâğıt formun yalnız fotoğrafıyla kayıt açılabilir (ilk yüklemede form sessizce kaydedilir).
- Ders: Vercel istek gövdesi 4,5 MB; fotoğraflar istemcide 2400 px JPEG'e küçültülür, sunucu sınırı 4 MB.
- Yapılmadı: ıslak imza (yerine ad soyad + kim girdi), yazdırma.
