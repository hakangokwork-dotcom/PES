# Yıllık Plan — Basit Yapı (v2) — Tasarım

Tarih: 2026-10-06 · Panel: merkez (`requirePanel('yonetim')`)
Önceki sürümün yerini alır: `2026-10-06-yillik-talep-plani-design.md` (v1.8.0 — tahmin → kalem → dakika → otomatik öneri).

## Neden değişti

Kullanıcı planı ters yönden kuruyor: atölyelerin aylık kapasitesi belli, planlamacı her ay hangi
atölyeye hangi klasmandan kaç adet yaptıracağını kendisi yazıyor. Dakika/SAM hesabı, otomatik
öneri ve tahmin-kalem katmanı gereksiz karmaşıklık. Her şey **adet**.

## Kararlar

- Kapasite: atölye başına tek aylık adet (klasmandan bağımsız) + ay bazında düzeltme.
- Klasman × ay talep hedefi girilir; hedef / yerleşen / açık yan yana görünür.
- v1 yapısı (049 tabloları, öneri motoru, "bağla") kaldırılır. Canlıda veri yok.

## 1. Kapasite çözümü (atölye × ay, adet)

Öncelik sırası:
1. `atolye_kapasite_ay` düzeltmesi (o atölye, yıl, ay)
2. Baz: `workshop_profil.aylik_kapasite` (> 0)
3. Türetilmiş: aktif bantların `daily_target` toplamı × o ayın çalışma günü (pazartesi–cumartesi,
   pazar kapalı — `bant-doluluk.ts` `pazarMi` kuralı)
4. Yok → `null`; ekranda "kapasite yok", hücre yüzdesiz

Ekranda her atölyenin kapasite kaynağı küçük etiketle görünür (düzeltme / profil / hedef≈ / yok).
Baz kapasite ekrandan düzenlenince `workshop_profil.aylik_kapasite` yazılır (profil satırı yoksa
oluşturulur). Not: profil içe aktarımı bu değeri sonradan ezebilir.

## 2. Veri modeli (migration 050)

- 049 nesneleri kaldırılır: `work_order.tahmin_kalem_id`, `talep_tahsis`,
  `talep_tahmini_kalem`, `talep_tahmini`.
- `atolye_kapasite_ay` — `tenant_id`, `workshop_id`, `yil`, `ay` (1–12), `adet` (>= 0), `sebep`;
  UNIQUE (`workshop_id`,`yil`,`ay`).
- `plan_atolye_ay` — `tenant_id`, `workshop_id`, `yil`, `ay`, `klasman_kodu`, `adet` (> 0),
  `not_metni`, zaman damgaları; UNIQUE (`workshop_id`,`yil`,`ay`,`klasman_kodu`).
- `plan_talep_ay` — `tenant_id`, `yil`, `ay`, `klasman_kodu`, `adet` (>= 0);
  UNIQUE (`tenant_id`,`yil`,`ay`,`klasman_kodu`).
- RLS: 043 kalıbı (iç ekip aracı; atölye kullanıcısı göremez). `verify_public_api.mjs` listesi
  güncellenir (049 tabloları çıkar, yeniler girer).
- `klasman_kodu` katalogda (`capability_value`, boyut `klasman`) olmalı — API'de doğrulanır.

## 3. Gerçek siparişler

Hücrede plan yanında fiili sipariş adedi: `work_order` (atanmış, `durum <> 'Iptal'`),
ay = `COALESCE(bitis_tarihi, teslim_tarihi)`, klasman filtresi varsa `klasman_kodu` eşleşmesi.
Doluluk yüzdesi PLAN üzerinden hesaplanır; fiili sipariş bilgi amaçlıdır.

## 4. Ekran `/pes/yillik-plan`

Üstte yıl seçici, klasman filtresi, iki sekme: **Doluluk** ve **Talep**.

**Doluluk sekmesi**
- Tablo: atölye × 12 ay. Hücre: `plan / kapasite`, yüzde, renk (yeşil ≤ %85, sarı ≤ %100,
  kırmızı > %100); altında küçük "sip: N" (fiili sipariş).
- Klasman seçiliyken:
  - hücrede yalnız o klasmanın planı, yüzde ise atölyenin TOPLAM doluluğu (kapasite paylaşılır)
  - atölyeler yetenek uyumuna göre gruplanır: uygun → kontrol edilemedi → uygun değil (soluk);
    `yetenek-uyum.ts` kuralları (künye = yalnız `klasman_kodu`)
  - üstte talep / yerleşen / açık satırı
- Atölye satırına tıklayınca yan panel: o atölyenin 12 ayı; her ayda klasman satırları
  (klasman seçici + adet + not, ekle/sil), baz kapasite alanı ve ay düzeltmeleri.
  Uygun olmayan klasman seçilirse UYARI (engellemez).

**Talep sekmesi**
- Klasman × 12 ay girilebilir tablo; her hücre altında yerleşen (Σ plan) ve açık
  (talep − yerleşen, negatifse "fazla").

## 5. Planlama Masası ipucu

Havuz kartında: PO'nun klasmanı ve ayı (`COALESCE(bitis, teslim)`) için planı olan atölyeler —
"Plan: B021 (20.000), B005 (8.000)". Bağlama düğmesi yok.

## 6. Kalkanlar

v1'in tahmin/kalem/tahsis API'leri, `yillik-plan-veri.ts`'deki dakika fonksiyonları, öneri motoru,
`bagla` uç noktası ve testleri. Saf hesap küçülür: kapasite çözme, doluluk yüzdesi, talep açığı.

## 7. Hata durumları

- Katalogda olmayan klasman → 400.
- Negatif / tam sayı olmayan adet → 400; adet 0 plan satırını siler.
- Atölye kullanıcısı → 403 (tüm uçlar).
- Görünmeyen atölye id → 404.

## 8. Test

Saf fonksiyonlar vitest (kapasite öncelik sırası, çalışma günü, yüzde, talep açığı).
Migration sonrası RLS `APP_DATABASE_URL` ile doğrulanır. Tarayıcıda uçtan uca senaryo.
