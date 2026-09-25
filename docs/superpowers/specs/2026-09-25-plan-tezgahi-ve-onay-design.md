# Planlama tezgâhı ve iki taraflı onay (tasarım)

**Tarih:** 2026-09-25
**Durum:** 1. tur uygulandı (tezgâh + taslak); 2. tur (onay döngüsü) bekliyor

## İstek

Planlamacı iş emirlerini yan panelden sürükleyip bir tezgâhta dizsin; plan
hazır olunca tek tuşla atölyenin operasyonel görünümüne geçsin. Atölyenin
aldığı plan onun gerçekliğini yansıtsın — gecikmeler dahil.

## Araştırma — kurulu kalıplar

Dört yerleşik kalıp var ve dördü de isteğin bir parçasına oturuyor.

**1. Planned order ↔ firm planned order + zaman çiti (MRP).** Plan iki halde
yaşar: serbestçe yeniden planlanabilir ve dondurulmuş. "Firming" dondurma
eylemidir; **planlama zaman çiti** içindeki siparişler otomatik değişimden
korunur. "Sanal alan ↔ gerçek icra" ayrımının tam karşılığı.

**2. Sipariş teyidi ve karşı öneri (tedarikçi iş birliği portalları).** Alıcı
talep gönderir; tedarikçi kabul eder, değişiklik önerir ya da karşılayamaz.
Kritik nokta: cevap, **alıcının üzerine aksiyon alabileceği yapısal bir kayıt**
olmalı. Teyitler plana geri akar — kapalı döngü.

**3. Kapasite rezervasyonu (konfeksiyon).** Fabrikalar hattı aylar öncesinden
teyitli rezervasyona göre doldurur. Rezervasyon; teyitli adet, onaylı numune
ve hazır tech pack ile *firm* olur. Öncesi yumuşak rezervasyondur.

**4. TNA (Time & Action) takvimi.** Konfeksiyonun standardı; sütunları:
faaliyet, sorumlu, **planlanan tarih, gerçekleşen tarih, gecikme günü,
açıklama**. "Atölyenin gerçekliğini yansıtsın" isteği burada zaten tanımlı.

## Alınan kararlar (2026-09-25)

| Konu | Karar |
|---|---|
| Atölyenin cevabı | **Kabul / revizyon önerisi / ret**, gerekçe zorunlu |
| Teklif aşamasında kapasite | **Yumuşak rezerve**, takvimde ayrı renk |
| Zaman çiti | **Var ama yalnız uyarır**, engellemez; değişiklik atölyeye bildirilir |
| Sıra | **Önce tezgâh + taslak**, sonra onay döngüsü |

## Üç durumlu model

```
TASLAK      planlamacının tezgâhı · atölye görmez · kapasite tüketmez
   ↓ gönder
TEKLİF      atölye görür · kapasite YUMUŞAK rezerve · cevap bekliyor
   ↓ kabul / revizyon önerisi / ret (gerekçeli)
ONAYLI      kapasite SERT rezerve · zaman çiti uyarır
   ↓ icra
GERÇEKLEŞEN atölye gecikme bildirir → plan/gerçek farkı → yeni tur
```

## 1. tur — uygulandı

`plan_taslak` (senaryo) + `plan_taslak_kalem` (yerleştirme). Birden fazla
taslak olabilir; senaryo karşılaştırması tezgâhın asıl değeri, tek taslak
zorlamak planlamacıyı yine Excel'e iter.

**Taslak atölyeye görünmez ve gerçek kapasite tüketmez.** RLS atölye
kullanıcısını tamamen dışarıda tutuyor — 040'ın eşitlik kalıbı burada
kullanılmadı, çünkü atölyenin kendi taslağını görmesi de istenmiyor.

**Bitiş tarihi saklanmaz, türetilir** (`bant-doluluk.planBitisi`). Saklansaydı
bandın günlük hedefi değişince ya da araya tatil girince sessizce eskirdi.

**Çakışma engellenmez, gösterilir.** Planlamacı bilerek üst üste koyabilmeli
(mesai düşünüyor olabilir); engelleyen bir tezgâh onu yine Excel'e iter.

## 2. tur — yapılacaklar

- `plan_taslak.durum` → `'gonderildi'`; teklif kaydı ve tur geçmişi
- Yumuşak rezervasyonun `bant-doluluk`'a üçüncü katman olarak girmesi
  (bugün: gerçek + plan; olacak: gerçek + onaylı + teklif)
- Atölye tarafı: `/workshop/plan` — gelen teklif, kabul/revizyon/ret
- Revizyon önerisi yapısal olmalı: yeni tarih + yeni adet + **gerekçe kodu**
  (serbest metin tek başına aksiyon alınabilir değil)
- Gecikme bildirimi → `plan-gercek.ts` zaten hazır, TNA'nın "gecikme günü"
  sütununun karşılığı
- Zaman çiti içindeki değişikliğin atölyeye bildirilmesi

## Kapsam dışı

Otomatik optimizasyon (en iyi yerleşimi kendi bulan algoritma). Çok aşamalı
zincirin (kesim→dikim→UKP) tezgâhta ayrı ayrı sürüklenmesi — bugün yalnız
dikim yerleştiriliyor; zincir `yerlestir-kaydet.ts`'te zaten var.
