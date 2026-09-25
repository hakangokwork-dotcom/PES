# Planlama tezgâhı ve iki taraflı onay (tasarım)

**Tarih:** 2026-09-25
**Durum:** tamamı uygulandı — tezgâh, onay döngüsü, yumuşak rezervasyon, bildirimler

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

## 2. tur — uygulandı (044, 045)

**Teklif ve onay (044).** `plan_teklif` + `plan_teklif_kalem`. Her atölyeye
ayrı teklif; tek teklif olsaydı bir reddin bütün planı bloklaması gerekirdi.
Cevap bekleyen tur varken yenisi açılmaz.

Kalemler **kopyalanır, işaret edilmez**: taslak gönderildikten sonra da
değişmeye devam eder, teklif ise değişmemeli.

Cevap **yapısal**: ret ve revizyonda gerekçe kodu zorunlu (8 kod), `DIGER`
seçilirse serbest metin de. Kural hem TS'te hem `CHECK`'te.

**Karşı öneri varsa o geçerlidir**; uygulandığında atölyenin tarihleri
yazılır. `yerlestir()` çağrılmaz — o teslimden geriye planlıyor ve tezgâhta
seçilen tarihleri ezerdi.

**Yumuşak rezervasyon (bant-doluluk).** `Doluluk` dördüncü katman kazandı:
`teklif`. Plana EKLENMEZ, ayrı durur — takvim "bu iş kesin" ile "bu iş
sorulmuş" arasındaki farkı göstermek zorunda. İki oran: `oran` (kesinleşmiş)
ve `oranTeklifli`. Matriste amber çerçeve ve `*`. Yalnız `durum='bekliyor'`
sayılır: kabul edilen zaten gerçek atamaya döndü, reddedilen yer kaplamamalı.

**Bildirimler (045).** `plan_bildirim`, iki yön tek mekanizma:
`tip='gecikme'` (atölye → planlamacı), `tip='degisiklik'` (planlamacı →
atölye, çit içi değişiklik). TNA'nın gecikme günü sütunu — **gün saklanmaz,
türetilir**; eski tarih yoksa `null` döner, sıfır değil. Erkene çekme
gizlenmez. Tipi kim yazabilir API'de sınırlanır: rol kuralı olduğu için
RLS ile ifade edilemez.

## Kapsam dışı

Otomatik optimizasyon (en iyi yerleşimi kendi bulan algoritma). Çok aşamalı
zincirin (kesim→dikim→UKP) tezgâhta ayrı ayrı sürüklenmesi — bugün yalnız
dikim yerleştiriliyor; zincir `yerlestir-kaydet.ts`'te zaten var.

Çit içi değişiklikte bildirimin **otomatik** oluşturulması: altyapı hazır
(`bildirimGerekir` + `tip='degisiklik'`), ama `uygula` ucu bunu kendiliğinden
yazmıyor — planlamacı elle bildiriyor. Otomatik yazmak için "önceki
kararlaştırılmış tarih" kaydının ayrıca tutulması gerekir.
