# Atölye Fiyatlama Ekranı — Ürün Spesifikasyonu

## 1. Amaç

Fason atölyelerin aldıkları sipariş için hızlı ve doğru CMT (Cut-Make-Trim) fiyat teklifi üretmesini sağlayan ekran. Atölye, ürünü tanımlar, modele uygun parçaları seçer, sistem işlem listesini ve toplam süreyi otomatik hesaplar, atölye kendi maliyet parametrelerini girerek birim fiyata ulaşır.

**Hedef kullanıcı:** Atölye sahibi, üretim müdürü veya bant şefi.
**Girdi:** Ürün bilgisi + parça seçimi + atölye maliyet parametreleri.
**Çıktı:** Birim CMT maliyet (₺), bant bilgisi, kapasite tahmini, teklif fiyatı.

---

## 2. Veri Modeli Bağlantısı

Ekran, aşağıdaki 3 tabloluk sadeleştirilmiş veri modelini kullanır:

```
URUN (63 satır)
├── urun_id
├── kumas          ← 1. seçim (7 tip)
├── urun_adi       ← 2. seçim (22 tip)
└── ozellik        ← 3. seçim (opsiyonel)

ISLEM_KATALOGU (1.338 satır)
├── islem_id
├── islem_adi
└── makine_tipi    ← opsiyonel, sahadan doldurulur

URUN_ISLEM (23.928 satır)
├── urun_id        → FK: URUN
├── islem_id       → FK: ISLEM_KATALOGU
├── parca          ← gruplama etiketi (metin)
├── grup           ← gruplama etiketi (metin)
├── mtm            ← baz süre (medyan, saniye)
├── mtm_min / mtm_max
├── orneklem
└── guven          ← TEK / SAĞLAM / DOĞRULA
```

---

## 3. Ekran Akışı (4 Adım)

### Adım 1 — Ürün Tanımlama

Üç kademeli dropdown ile ürün seçimi:

```
┌─────────────────────────────────────────────────────┐
│  MODEL FİYATLAMA                                    │
│                                                     │
│  Model Adı: [Müşteri sipariş kodu / serbest metin]  │
│                                                     │
│  Kumaş:    [ Denim          ▼ ]   ← 7 seçenek      │
│  Ürün:     [ Pantolon       ▼ ]   ← filtrelenir     │
│  Özellik:  [ (yok)          ▼ ]   ← opsiyonel       │
│                                                     │
│                            [ Parça Seçimine Geç → ] │
└─────────────────────────────────────────────────────┘
```

**Kumaş tipleri:** Denim, Dokuma, Kaşe, Naylon, PU (Suni Deri), Pamuklu, Sentetik.

**Davranış:** Kumaş seçildiğinde Ürün dropdown'u filtrelenir (örn. Denim seçince yalnızca Denim altındaki 15 ürün görünür). Özellik opsiyoneldir; yoksa boş bırakılabilir.

**Seçim sonucu:** `urun_id` belirlenir, bir sonraki adıma geçilir.

---

### Adım 2 — Parça Seçimi

Seçilen ürünün tüm olası parçaları (URUN_ISLEM tablosundaki `parca` sütununun tekil değerleri) listelenir. Atölye, kendi modeline uygun parçaları checkbox ile işaretler.

```
┌───────────────────────────────────────────────────────────────┐
│  PARÇA SEÇİMİ — Denim > Pantolon                             │
│                                                               │
│  Toplam havuz: 167 parça | Seçilen: 0                         │
│  [Arama: ____________]                                        │
│                                                               │
│  ☑ Düz Kemer                           (8 işlem,  98.4 sn)   │
│  ☑ Fermuar (Pat)                       (6 işlem,  72.1 sn)   │
│  ☐ Fermuar (Gizli Pat)                 (8 işlem,  91.3 sn)   │
│  ☑ Conta (Kollu)                       (3 işlem,  37.7 sn)   │
│  ☑ Ağ Birleştirme (Kollu)              (2 işlem,  20.4 sn)   │
│  ☑ Ön Tekli Fleto Cep (Çimalı)        (12 işlem, 148.6 sn)   │
│  ☐ Ön Çift Fleto Cep (Çimalı)         (14 işlem, 186.3 sn)   │
│  ☑ Arka Cep (Baskılı)                  (7 işlem,  84.2 sn)   │
│  ☐ Arka Cep (Düz)                      (5 işlem,  61.7 sn)   │
│  ☑ Etiket/Talimat                      (4 işlem,  45.0 sn)   │
│  ☑ Paça Temizleme (Katlama)            (3 işlem,  32.5 sn)   │
│  ☑ Bel Köprü                           (2 işlem,  18.9 sn)   │
│  ☑ Punteriz                            (1 işlem,  14.3 sn)   │
│  ...                                                          │
│                                                               │
│  ─────────────────────────────────────────────────────────     │
│  Seçilen: 12 parça | 62 işlem | Toplam MTM: 573.1 sn         │
│                                                               │
│                            [ ← Geri ]  [ İşlem Detayı → ]    │
└───────────────────────────────────────────────────────────────┘
```

**UI kuralları:**

- Her parça satırında işlem sayısı ve toplam MTM özeti görünür.
- Arama kutusu ile parça adı filtresi yapılabilir.
- Alt barda seçim özeti canlı güncellenir.
- Benzer parçalar (aynı base, farklı özellik) gruplanarak gösterilir. Örneğin `Arka Cep (Baskılı)` ile `Arka Cep (Düz)` yan yana sunulur; birinin seçimi diğerinin seçimini kapatır (aynı fonksiyonun varyasyonu oldukları için).

**Alternatif parça çakışma kuralı:** Bazı parçalar birbirinin alternatifidir ve birlikte seçilmemelidir. Örnekler:

| Grup | Alternatifler |
|---|---|
| Pat tipi | Kendinden Dönüşlü Pat, Takma Pat, Yarım Takma Pat, Gizli Pat |
| Yaka tipi | Gömlek Yaka, Ayaksız Gömlek Yaka, C Yaka, Resort Yaka, İlikli Yaka |
| Cep tipi | Fleto Cep, Fermuarlı Cep, Kapak Cep, Düz Cep |
| Kol ucu | Manşet (Katlamalı), Manşet (Çimalı), Kol Ucu Reçme, Kol Ucu Katlama |
| Bel tipi | Düz Kemer, Lastikli Bel, Düz+Lastikli Bel |
| Fermuar | Fermuar (Pat), Fermuar (Gizli Pat), Fermuar (Pervazlı) |

Bu gruplar veri tabanında ayrıca tanımlanabilir ya da ilk sürümde atölyenin kendi bilgisine bırakılır.

---

### Adım 3 — İşlem Listesi ve Süre Düzenleme

Seçilen parçaların tüm işlemleri, parça bazlı gruplu olarak listelenir. Atölye, MTM baz değerlerini görerek kendi gerçek süresini girebilir veya baz değeri kabul edebilir.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  İŞLEM LİSTESİ — Denim > Pantolon (12 parça, 62 işlem)                │
│                                                                         │
│  ┌ Düz Kemer ──────────────────────────────────────────────────────┐    │
│  │  #   İşlem                     Baz(sn)  Gerçek(sn)  Kişi  Mak │    │
│  │  1   Kemer Tela Yapıştırma       3.49    [  3.49 ]  [1.0] Pres│    │
│  │  2   Kemer İşaret                4.43    [  4.43 ]  [1.0] -   │    │
│  │  3   Kemer Uç Birleştirme        5.44    [  5.44 ]  [1.0] Düz │    │
│  │  4   Kemer Uç Kapama            30.22    [ 30.22 ]  [1.0] Düz │    │
│  │  5   Bedene Kemer Takma          14.47   [ 14.47 ]  [1.0] Düz │    │
│  │  6   Kemer Regula                10.87   [ 10.87 ]  [1.0] Düz │    │
│  │  7   Kemer Ütü                    8.52   [  8.52 ]  [1.0] Ütü │    │
│  │  8   Bel Punteriz                20.96   [ 20.96 ]  [1.0] Pun │    │
│  │                          Alt Toplam:      98.40 sn   8.0 kişi │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌ Fermuar (Pat) ──────────────────────────────────────────────────┐   │
│  │  #   İşlem                     Baz(sn)  Gerçek(sn)  Kişi  Mak │   │
│  │  9   Fermuar Hazırlık           12.30    [ 12.30 ]  [1.0] Düz │   │
│  │  10  Pat Dikim                   8.70    [  8.70 ]  [1.0] Düz │   │
│  │  11  Fermuar Takma              18.50    [ 18.50 ]  [1.0] Düz │   │
│  │  12  Kapama Dikişi               9.20    [  9.20 ]  [0.5] Düz │   │
│  │  13  Regula                     12.40    [ 12.40 ]  [0.5] Düz │   │
│  │  14  Fermuar Ütü                 5.10    [  5.10 ]  [0.5] Ütü │   │
│  │                          Alt Toplam:      66.20 sn   4.0 kişi │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ...                                                                    │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════     │
│  GENEL TOPLAM:  62 işlem | 573.1 sn | 52.5 kişi (bant)                │
│  Darboğaz:      Kemer Uç Kapama (30.22 sn) → Günlük max: 953 adet    │
│                                                                         │
│                             [ ← Geri ]  [ Fiyatlamaya Geç → ]         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Sütun açıklamaları:**

| Sütun | Açıklama |
|---|---|
| Baz (sn) | Sistemdeki MTM medyan değeri (salt okunur) |
| Gerçek (sn) | Atölyenin kendi süresi (düzenlenebilir, varsayılan = baz) |
| Kişi | O operasyonda çalışan kişi sayısı (0.5 desteklenir) |
| Mak | Makine tipi kısaltması (veri tabanında varsa gösterilir, yoksa `-`) |

**Darboğaz hesabı:**

```
Darboğaz operasyon = MAX(gerçek süre) olan operasyon
Günlük kapasite    = (8 saat × 60 dk × 60 sn) / darboğaz süresi
                   = 28.800 / darboğaz_sn
```

**Kişi sayısı kuralları:**
- Tam sayı veya 0.5 adımlarla girilebilir (0.5, 1.0, 1.5, 2.0...).
- 0.5 kişi = bir operatör iki operasyona paylaşılmış demektir.
- Toplam kişi sayısı = bant büyüklüğü.

---

### Adım 4 — Fiyatlama

Atölye kendi maliyet parametrelerini girer, sistem CMT birim fiyatı hesaplar.

```
┌───────────────────────────────────────────────────────────────────┐
│  FİYATLAMA — Denim > Pantolon                                    │
│                                                                   │
│  ┌ İşlem Özeti ──────────────────────────────────────────────┐   │
│  │  Toplam süre:          573.1 sn  →  9.55 dk              │   │
│  │  Toplam bant kişisi:   52.5 kişi                          │   │
│  │  Darboğaz:             30.22 sn (Kemer Uç Kapama)         │   │
│  │  Darboğaz kapasitesi:  953 adet/gün                       │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌ Maliyet Parametreleri ────────────────────────────────────┐   │
│  │                                                           │   │
│  │  Yöntem:  ○ Bölge Bazlı DK Maliyet                       │   │
│  │           ● Atölye Gerçek DK Maliyet                      │   │
│  │                                                           │   │
│  │  ── Bölge Bazlı (seçilirse) ──────────────────────────    │   │
│  │  Teşvik Bölgesi:  [ 3. Bölge  ▼ ]                        │   │
│  │  DK Maliyet:      5.40 ₺/dk  (otomatik, Nisan 2026)      │   │
│  │                                                           │   │
│  │  ── Atölye Gerçek (seçilirse) ────────────────────────    │   │
│  │  Aylık Toplam Gider:       [ 6.000.000 ] ₺               │   │
│  │  Dikim Operatörü Sayısı:   [       185 ] kişi             │   │
│  │  Aylık Çalışma Günü:       [        21 ] gün              │   │
│  │  Günlük Çalışma:           [       540 ] dk               │   │
│  │  ────────────────────                                     │   │
│  │  Hesaplanan DK Maliyet:    2.86 ₺/dk                      │   │
│  │  (= Gider / (Operatör × Gün × Dk))                       │   │
│  │                                                           │   │
│  │  ── Ek Parametreler ──────────────────────────────────    │   │
│  │  Verimlilik (%):           [    75 ] %                    │   │
│  │  Genel Gider Payı (%):     [    15 ] %                    │   │
│  │  Kâr Marjı (%):            [    10 ] %                    │   │
│  │                                                           │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌ HESAP SONUÇLARI ═════════════════════════════════════════┐    │
│  │                                                           │   │
│  │  Toplam Süre (dk):              9.55                      │   │
│  │  Verimlilik Düzeltmesi:         9.55 / 0.75 = 12.73 dk   │   │
│  │  Ham CMT Maliyet:               12.73 × 5.40 = 68.77 ₺   │   │
│  │  Genel Gider Eklentisi (+%15):  68.77 × 1.15 = 79.08 ₺   │   │
│  │  ──────────────────────────────────                       │   │
│  │  EDER MALİYET:                  79.08 ₺                   │   │
│  │  Kâr Marjı Eklentisi (+%10):    79.08 × 1.10 = 86.99 ₺   │   │
│  │  ──────────────────────────────────                       │   │
│  │  ÖNERİLEN TEKLİF FİYATI:       86.99 ₺                   │   │
│  │                                                           │   │
│  └═══════════════════════════════════════════════════════════┘   │
│                                                                   │
│  [ ← Geri ]   [ PDF Çıktı ]   [ Teklifi Kaydet ]                │
└───────────────────────────────────────────────────────────────────┘
```

---

## 4. Hesaplama Formülleri

### 4.1 Toplam Süre

```
toplam_sure_sn  = SUM(her işlemin gerçek süresi)
toplam_sure_dk  = toplam_sure_sn / 60
```

Not: Toplam süre, seçilen tüm parçalardaki tüm işlemlerin süre toplamıdır. Bu "bir adet ürünün tüm operasyonlarının toplam süresi"dir.

### 4.2 Dakika Maliyet Değeri

İki yöntemden biri seçilir:

**Yöntem A — Bölge Bazlı (referans):**

| Teşvik Bölgesi | DK Maliyet (₺) | Not |
|---|---|---|
| 1. Bölge | 6.30 | İstanbul, Ankara, İzmir vb. |
| 2. Bölge | 5.83 | |
| 3. Bölge | 5.40 | |
| 4. Bölge | 5.31 | |
| 5. Bölge | 5.11 | |
| 6. Bölge | 5.05 | GAP bölgesi |

Bu değerler periyodik olarak güncellenir. Referans kaynak: Sektör Dakika Maliyet Tablosu (Nisan 2026).

**Yöntem B — Atölye gerçek (hesaplamalı):**

```
dk_maliyet = aylık_toplam_gider / (dikim_operatoru × calisma_gunu × gunluk_dk)
```

Aylık toplam gider kapsamı, atölye tipine göre değişir:

| Atölye Tipi | Gider Kapsamı |
|---|---|
| Tip A (Sadece Dikim) | Yalnızca dikim personeli, kira, enerji, bakım |
| Tip B (Kesim + Dikim) | Dikim + kesim personeli ve giderleri |
| Tip C (Kesim + Dikim + UKP) | Tüm üretim personeli ve giderleri |

### 4.3 Verimlilik Düzeltmesi

```
efektif_sure_dk = toplam_sure_dk / verimlilik_yuzdesi
```

Verimlilik %100'ün altında olduğunda efektif süre artar. Tipik aralık: %65 - %85.

### 4.4 CMT Eder Maliyet

```
ham_cmt          = efektif_sure_dk × dk_maliyet
genel_gider      = ham_cmt × (1 + genel_gider_yuzdesi)
eder_maliyet     = genel_gider
teklif_fiyati    = eder_maliyet × (1 + kar_marji_yuzdesi)
```

### 4.5 Darboğaz ve Kapasite

```
darbogaz_suresi  = MAX(islem_gercek_suresi)   // tüm işlemler arasında en uzun olan
gunluk_kapasite  = (gunluk_dk × 60) / darbogaz_suresi
aylik_kapasite   = gunluk_kapasite × calisma_gunu
```

### 4.6 Bant Verimliliği

```
bant_verimi (%) = toplam_sure_sn / (darbogaz_suresi × toplam_kisi) × 100
```

Bu değer %85'in üstü iyi, %70'in altı kötü kabul edilir.

---

## 5. Güven Seviyesi Kullanımı

URUN_ISLEM tablosundaki `guven` alanı fiyatlamada görsel uyarı olarak kullanılır:

| Güven | Renk | Anlamı | Fiyatlamadaki Etkisi |
|---|---|---|---|
| SAĞLAM | 🟢 | Birden fazla ölçüm, <%20 sapma | Baz değer güvenilir, düzenleme gerekmez |
| TEK | 🟡 | Tek ölçüm | Baz değer referans, gerçek süreyi girmeniz önerilir |
| DOĞRULA | 🔴 | ≥%20 sapma | Baz değer şüpheli, mutlaka kendi sürenizi girin |

Ekranda DOĞRULA işlemlerin `gerçek süre` alanı vurgulanarak gösterilir. Atölye bu alanlara kendi ölçümlerini girmeye teşvik edilir.

---

## 6. Çıktılar

### 6.1 Ekran Özeti Kartı

Adım 4 tamamlandığında ekranın üst kısmında özet kartı gösterilir:

```
┌──────────────────────────────────────────────────────────────┐
│  Denim > Pantolon                     Tarih: 19.04.2026     │
│  Model: TRAIT-2026-S1                                        │
│                                                              │
│  12 parça  │  62 işlem  │  9.55 dk  │  52.5 kişi            │
│                                                              │
│  DK Maliyet: 5.40 ₺     Verimlilik: %75                     │
│                                                              │
│  EDER MALİYET:  79.08 ₺    TEKLİF FİYATI:  86.99 ₺         │
│  Darboğaz:      Kemer Uç Kapama    Kapasite: 953 adet/gün   │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 PDF Çıktı

Teklif fiyatı onaylandığında PDF çıktı alınabilir. İçerik:

1. Başlık: Atölye adı, model kodu, tarih.
2. Ürün tanımı: Kumaş, ürün, özellik.
3. Parça listesi (sadece başlıklar ve toplam MTM).
4. İşlem detay tablosu: İşlem adı, süre, kişi, makine.
5. Maliyet hesabı özeti.
6. Kapasite ve darboğaz bilgisi.

### 6.3 Karşılaştırma Modu

Kaydedilen teklifler birbiriyle karşılaştırılabilir:

| Model | Süre (dk) | Kişi | DK Maliyet | Eder (₺) | Teklif (₺) |
|---|---|---|---|---|---|
| TRAIT Pantolon | 9.55 | 52.5 | 5.40 | 79.08 | 86.99 |
| WASHA Pantolon | 12.26 | 37.0 | 5.40 | 94.60 | 104.06 |
| DENOM Gömlek | 7.82 | 28.0 | 5.40 | 56.30 | 61.93 |

---

## 7. Veri Akışı

```
                    ┌─────────┐
                    │  URUN   │
                    │ (63)    │
                    └────┬────┘
                         │ urun_id
                         ▼
                  ┌──────────────┐
                  │  URUN_ISLEM  │        ┌────────────────┐
                  │  (23.928)    │───────→│ ISLEM_KATALOGU │
                  └──────┬───────┘        │ (1.338)        │
                         │                └────────────────┘
                         │ parça seçimi filtresi
                         ▼
                ┌─────────────────┐
                │ SEÇİLEN İŞLEMLER│
                │ (tipik 40-80)   │
                └────────┬────────┘
                         │ + atölye parametreleri
                         ▼
                ┌─────────────────┐
                │   CMT HESABI    │
                │ Eder + Teklif   │
                └─────────────────┘
```

---

## 8. Validasyon Kuralları

| Alan | Kural | Hata Mesajı |
|---|---|---|
| Model Adı | Zorunlu, min 3 karakter | Model adı giriniz |
| Kumaş | Zorunlu seçim | Kumaş tipi seçiniz |
| Ürün | Zorunlu seçim | Ürün tipi seçiniz |
| Parça seçimi | En az 1 parça seçili olmalı | En az bir parça seçin |
| Gerçek süre | > 0, max 9999 sn | Geçerli bir süre giriniz |
| Kişi sayısı | 0.5 adımlarla, 0.5 - 10.0 arası | 0.5 - 10.0 arası giriniz |
| Verimlilik | %50 - %100 arası | Gerçekçi bir verimlilik girin |
| DK Maliyet | > 0 | Geçerli bir dakika maliyeti giriniz |
| Genel Gider % | %0 - %50 arası | Makul bir oran giriniz |
| Kâr Marjı % | %0 - %50 arası | Makul bir oran giriniz |

---

## 9. Atölye Profili Entegrasyonu

Atölyenin her seferinde maliyet parametrelerini yeniden girmemesi için atölye profilinde saklanan varsayılan değerler:

| Parametre | Kaynak | Varsayılan |
|---|---|---|
| Teşvik Bölgesi | Atölye profili | — |
| DK Maliyet Yöntemi | Atölye profili | Bölge Bazlı |
| Aylık Gider | Atölye profili | — |
| Operatör Sayısı | Atölye profili | — |
| Çalışma Günü | Atölye profili | 22 |
| Günlük Çalışma (dk) | Atölye profili | 540 |
| Verimlilik | Atölye profili | %75 |
| Genel Gider % | Atölye profili | %15 |
| Kâr Marjı % | Atölye profili | %10 |
| Atölye Tipi | Atölye profili | Tip A |

Fiyatlama ekranı açıldığında bu değerler otomatik yüklenir; atölye isterse model bazında değiştirebilir.

---

## 10. İleri Özellikler (Sonraki Fazlar)

### 10.1 Makine-İşlem Eşlemesi

`ISLEM_KATALOGU.makine_tipi` dolduruldukça:
- Seçilen işlemler için gereken makine listesi otomatik çıkarılır.
- Atölye makine envanteri ile karşılaştırılarak "bu modeli dikebilir misiniz" analizi yapılır.
- Eksik makine uyarısı verilir.

### 10.2 Otomatik Bant Dengeleme

Sahadan `operasyon_oncelik` (precedence) verisi toplandıkça:
- İşlemler arası bağımlılık grafiği kurulur.
- Toplam kişi sayısı ve takt time'a göre optimum bant düzeni önerilir.
- Darboğaz operasyonları paralel istasyona bölünebilir.

### 10.3 Saha Verisi ile MTM Kalibrasyonu

Atölyelerin girdiği "gerçek süre" verileri toplanır:
- Her (ürün, işlem) çifti için gerçek vs baz süre sapması izlenir.
- Yeterli veri biriktiğinde (30+ gözlem) MTM baz değerleri otomatik güncellenir.
- Atölye bazlı performans faktörü hesaplanır (bu atölye ortalamadan %X hızlı/yavaş).

### 10.4 Çoklu Teklif Karşılaştırma

Aynı model için birden fazla atölyeden teklif toplandığında:
- Eder maliyet vs teklif fiyatı analizi.
- Atölye performans geçmişi ile birleştirme.
- Optimum atölye önerisi (fiyat + kalite + kapasite skoru).

---

## 11. Teknik Notlar

### 11.1 MTM Birimi

Mevcut verideki MTM sütunu saniye cinsindendir (ortalama 18.6 sn, max 1938 sn). Ekranda saniye olarak gösterilir, fiyatlama hesabında dakikaya çevrilir (÷ 60).

### 11.2 Performans

- Parça seçimi ekranı: max 400 parça yüklenir (en büyük ürün kartı ~336 parça).
- İşlem listesi: max 1300 işlem (PU Mont İnce). Büyük listeler için virtual scroll kullanılmalı.
- Fiyatlama hesabı: tüm hesaplar client-side yapılabilir, sunucu çağrısı gerektirmez.

### 11.3 Kayıt Yapısı

Her kaydedilen teklif şu yapıda saklanır:

```
teklif
├── teklif_id (PK)
├── atolye_id (FK)
├── urun_id (FK)
├── model_adi
├── tarih
├── toplam_sure_sn
├── toplam_kisi
├── dk_maliyet
├── verimlilik
├── genel_gider_yuzde
├── kar_marji_yuzde
├── eder_maliyet
├── teklif_fiyati
├── darbogaz_islem_id
├── darbogaz_suresi
├── gunluk_kapasite
└── durum (taslak / onaylı / iptal)

teklif_detay
├── teklif_detay_id (PK)
├── teklif_id (FK)
├── islem_id (FK)
├── parca
├── grup
├── baz_sure_sn
├── gercek_sure_sn
├── kisi_sayisi
└── makine_tipi
```

---

## 12. Örnek Senaryo: Baştan Sona Akış

1. Atölye müdürü markadan "Denim Pantolon" siparişi alır.
2. Fiyatlama ekranını açar → Kumaş: **Denim**, Ürün: **Pantolon**, Özellik: boş.
3. 167 parçalık havuz gelir. 12 parça işaretler (kemer, fermuar, cep, ağ birleştirme vb.).
4. 62 işlem listelenir. `DOĞRULA` güvenli 3 işlemi kendi bildiği süreye düzeltir.
5. Bazı operasyonlara 0.5 kişi atar (bir operatör iki işe bakıyor).
6. Fiyatlama ekranına geçer. Atölye profili 3. Bölge, %75 verimlilik yüklenir.
7. Eder maliyet: **79.08 ₺**, teklif fiyatı: **86.99 ₺** çıkar.
8. Darboğaz "Kemer Uç Kapama" (30.22 sn) → günlük kapasite 953 adet.
9. Teklifi kaydeder, PDF alıp markaya gönderir.
10. Marka üç atölyeden teklif alır, karşılaştırır, sipariş verir.
