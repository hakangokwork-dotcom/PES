# Atölye Verimlilik Sistemi — Referans Dökümantasyonu

> **Versiyon:** 1.0 | **Kapsam:** Tekstil Konfeksiyon Atölyeleri  
> Bu doküman; bant yönetimi, model bazlı sipariş analizi, iş emri yapısı, darboğaz ve OEE metodolojilerini kapsayan bütünleşik bir atölye verimlilik çerçevesi sunmaktadır.

---

## İçindekiler

1. [Temel Kavramlar ve Tanımlar](#1-temel-kavramlar-ve-tanımlar)
2. [Atölye Yapısı](#2-atölye-yapısı)
3. [Darboğaz Analizi ve Bant Tempo Süresi](#3-darboğaz-analizi-ve-bant-tempo-süresi)
4. [MTM / SAM / SMV — Standart Süre Kavramları](#4-mtm--sam--smv--standart-süre-kavramları)
5. [Takt Süresi ve Sipariş Uyumu](#5-takt-süresi-ve-sipariş-uyumu)
6. [Bant Dengeleme (Line Balancing)](#6-bant-dengeleme-line-balancing)
7. [Çalışan Verimliliği ve Performans Takibi](#7-çalışan-verimliliği-ve-performans-takibi)
8. [OEE — Genel Ekipman Etkinliği](#8-oee--genel-ekipman-etkinliği)
9. [Kalite Verimliliği](#9-kalite-verimliliği)
10. [WIP Yönetimi](#10-wip-yönetimi)
11. [İş Emri (Work Order) Yapısı](#11-iş-emri-work-order-yapısı)
12. [Model Bazlı Sipariş Analizi](#12-model-bazlı-sipariş-analizi)
13. [Kapasite Planlama ve Sipariş Kabulü](#13-kapasite-planlama-ve-sipariş-kabulü)
14. [Bant Maliyeti ve Gelir-Gider Analizi](#14-bant-maliyeti-ve-gelir-gider-analizi)
15. [Model Geçiş Süresi (Changeover) Yönetimi](#15-model-geçiş-süresi-changeover-yönetimi)
16. [Yıkama Prosesi Verimliliği](#16-yıkama-prosesi-verimliliği)
17. [UKP Verimliliği](#17-ukp-verimliliği)
18. [KPI Dashboard — Temel Performans Göstergeleri](#18-kpi-dashboard--temel-performans-göstergeleri)
19. [Sürekli İyileştirme (Kaizen) Döngüsü](#19-sürekli-i̇yileştirme-kaizen-döngüsü)
20. [Uygulama Örneği: Bayhan Tekstil](#20-uygulama-örneği-bayhan-tekstil)

---

## 1. Temel Kavramlar ve Tanımlar

| Terim | Açıklama |
|---|---|
| **Bant (Hat / Line)** | Bir ürün grubunu uçtan uca üreten, kendine ait makine ve personeli olan bağımsız üretim birimi |
| **Darboğaz Operasyon** | Banttaki en yüksek çevrim süresine sahip operasyon; bandın temposunu belirler |
| **Çevrim Süresi (Cycle Time)** | Bir operasyonun tek bir ürün için tamamlanma süresi (saniye/dakika) |
| **MTM Süresi** | Methods-Time Measurement; her operasyonda harcanan teorik en kısa süre |
| **SAM / SMV** | Standard Allowed Minute / Standard Minute Value; izin verilen standart süre (MTM + paylar) |
| **Takt Süresi** | Müşteri talebini karşılamak için bir ürünün tamamlanması gereken azami süre |
| **Bant Tempo Süresi** | Mevcut darboğaza göre belirlenen fiili üretim ritmi |
| **OEE** | Overall Equipment Effectiveness; Kullanılabilirlik × Performans × Kalite |
| **WIP** | Work In Progress; süreç içi yarı mamul stoku |
| **FPY** | First Pass Yield; ilk geçişte hatasız üretim oranı |
| **UKP** | Ütü – Kontrol – Paket prosesi |
| **İş Emri (Work Order)** | Bir sipariş için üretim sürecini başlatan ve izleyen yönetim belgesi |
| **Kapasite** | Belirli bir sürede üretilebilecek azami ürün miktarı |
| **Yük (Load)** | Bir banta atanan sipariş miktarı × modelin SAM değeri |

---

## 2. Atölye Yapısı

### 2.1 Genel Yapı

Bir tekstil atölyesi birden fazla banttan oluşabilir. Her bant, ayrı bir üretim atölyesi gibi kendi makine ve personeline sahiptir. Atölye yönetim kadrosu bantlarla ortak çalışır ve yönetim maliyetleri bantlara dağıtılır. Bunun yanı sıra ortak havuzda bulunan makine ve personeller birden fazla banda destek verebilir.

```
┌─────────────────────────────────────────────┐
│              ATÖLYE YÖNETİMİ                │
│     (İdari Kadro + Ortak Destek Havuzu)     │
└──────────┬──────────────────────┬───────────┘
           │                      │
    ┌──────▼──────┐        ┌──────▼──────┐
    │    BANT 1   │        │    BANT 2   │
    │  (Marlas)   │        │   (Level)   │
    │  59 kişi    │        │  75 kişi    │
    └──────┬──────┘        └──────┬──────┘
           │                      │
    ┌──────▼──────────────────────▼──────┐
    │            YIKAMA                  │
    │   (5 kişi – bant çıkışı sonrası)   │
    └────────────────┬───────────────────┘
                     │
    ┌────────────────▼───────────────────┐
    │              UKP                   │
    │   (20 kişi – 2 banda ortak)        │
    └────────────────────────────────────┘
```

### 2.2 Ana Üretim Akışı

Bir pantolonun tipik ana üretim akışı aşağıdaki gibidir. Ön ve arka operasyon grupları **paralel** ilerler; montajda birleşir.

```
KESİM
  │
  ├──────────────────────────────┐
  ▼                              ▼
ÖN GRUP OPERASYONLARİ     ARKA GRUP OPERASYONLARİ
(paralel)                  (paralel)
  │                              │
  └──────────────┬───────────────┘
                 ▼
            MONTAJ
                 │
                 ▼
        YIKAMA (varsa)        ← Bant çıkışı ile UKP arasında
                 │
                 ▼
            UKP (Ütü – Kontrol – Paket)
                 │
                 ▼
            SEVKIYAT
```

> **Dikkat:** Paralel süreçlerin darboğazları ayrı ayrı analiz edilmelidir. Darboğaz her zaman en son tamamlanan paralel süreçtir.

---

## 3. Darboğaz Analizi ve Bant Tempo Süresi

### 3.1 Darboğaz Nedir?

Darboğaz, banttaki en yüksek çevrim süresine sahip operasyondur. Tüm bandın üretim hızını bu operasyon belirler. Üretim sisteminde darboğaz, bir davulun vuruş temposuna benzer — tüm diğer operasyonlar bu ritme uyum sağlamak zorundadır.

> **Kısıtlar Teorisi (Theory of Constraints — TOC):** Eliyahu Goldratt tarafından geliştirilen bu yaklaşıma göre, bir sistemin çıktısı en zayıf halkası tarafından sınırlandırılır. Darboğazı iyileştirmeden yapılan diğer operasyon iyileştirmeleri toplam çıktıyı artırmaz.

### 3.2 Darboğaza Göre Maksimum Çıktı Hesabı

```
Günlük Çalışma Süresi = 9 saat × 3.600 saniye = 32.400 saniye

Darboğaz Operasyon Çevrim Süresi = T_db (saniye)

Darboğaza Göre Max Çıktı = 32.400 / T_db
```

**Örnek:**

| Durum | Darboğaz Op. | Çevrim Süresi | Max Çıktı |
|---|---|---|---|
| Başlangıç | Cep otomat | 40 sn | 810 adet/gün |
| +1 makine eklendi | Yan birleştirme | 25 sn | 1.296 adet/gün |

### 3.3 Darboğaz Analiz Adımları

1. Tüm operasyonların çevrim süreleri ölçülür (zaman etüdü).
2. Paralel süreç grupları ayrı ayrı değerlendirilir.
3. Her paralel grup içindeki en yüksek çevrim süreli operasyon tespit edilir.
4. Tüm paralel grupların darboğazları karşılaştırılır; en yükseği bandın genel darboğazı olur.
5. Kaynak ekleme / bölme ile darboğaz hafifletilirse adım 3'e dönülür (iteratif süreç).

### 3.4 Bant Tempo Süresi

```
Bant Tempo Süresi = Güncel Darboğaz Operasyonun Çevrim Süresi
```

Bu süre, platformdaki tüm verimlilik hesaplarının **referans verisi** olarak kullanılır.

---

## 4. MTM / SAM / SMV — Standart Süre Kavramları

### 4.1 MTM (Methods-Time Measurement)

MTM, her operasyonun teorik olarak tamamlanabileceği en kısa süreyi verir. Bu süre, yalnızca katma değerli hareketleri içerir; dinlenme payı, makine gecikmesi veya paket işlem süresi dahil değildir.

```
MTM Toplam Süresi = Σ (tüm operasyonların MTM süreleri)
```

> **Örnek:** Marlas modeli için MTM toplam süresi = **550,2 saniye**

### 4.2 SAM — Standard Allowed Minute

SAM, MTM üzerine çeşitli paylar eklenerek hesaplanan ve planlama ile maliyetlendirmede kullanılan gerçekçi standart süredir.

```
SAM = Temel Süre × (1 + Pay Oranı)

Temel Süre = Gözlemlenen Süre × Performans Katsayısı
```

**Tipik Pay Oranları (Konfeksiyon):**

| Pay Türü | Oran |
|---|---|
| Kişisel ihtiyaç ve yorgunluk | %10–15 |
| Makine gecikmesi (SNLS için) | %9 |
| Paket işleme | %10 |
| **Toplam Tipik Pay** | **%15–25** |

> **SAM ile MTM Farkı:** MTM saf teorik süredir; SAM ise gerçekçi planlama süresidir. Platform, kapasite hesaplarında SAM değerini, verimlilik simülasyonlarında ise MTM değerini birlikte kullanmalıdır.

### 4.3 SMV (Standard Minute Value)

SMV, SAM ile özdeş olmakla birlikte Avrupa konfeksiyon literatüründe yaygın kullanılan terimdir. İşçilik maliyeti hesabı için kullanılır.

```
İşçilik Maliyeti (ürün başına) = SMV × Dakika Başına Maliyet (TL/dakika)
```

---

## 5. Takt Süresi ve Sipariş Uyumu

### 5.1 Takt Süresi Nedir?

Takt süresi, müşteri talebini zamanında karşılamak için bir ürünün banttan çıkması gereken azami süreyi ifade eder. Lean üretiminin temel kavramlarından biridir.

```
Takt Süresi = Kullanılabilir Üretim Süresi / Müşteri Talebi

Örnek:
Sipariş = 40.000 adet, Teslimat = 30 iş günü
Günlük Hedef = 40.000 / 30 = 1.333 adet/gün
Takt Süresi = 32.400 sn / 1.333 = 24,3 saniye/ürün
```

### 5.2 Takt Süresi ile Bant Tempo Süresinin Karşılaştırması

| Durum | Anlamı | Eylem |
|---|---|---|
| Tempo < Takt | Bant talebi karşılayabilir | Çıktıyı takip et |
| Tempo = Takt | Tam uyum | İdeal durum |
| Tempo > Takt | Bant talebi karşılayamaz | Darboğazı gider / mesai ekle |

> **Platform Uyarısı:** Yeni bir sipariş girildiğinde sistem otomatik olarak takt süresini hesaplamalı ve bant tempo süresi ile karşılaştırmalıdır. Karşılanamayan siparişler için alternatif seçenekler (ek mesai, kaynak artırımı) simüle edilebilmelidir.

---

## 6. Bant Dengeleme (Line Balancing)

### 6.1 Neden Önemlidir?

Bant dengeleme, tüm operasyonların çevrim sürelerini birbirine mümkün olduğunca yakınlaştırarak darboğazları ortadan kaldırma ve bekleme sürelerini minimize etme sürecidir.

### 6.2 Temel Adımlar

1. **Öncelik Diyagramı Çiz:** Her operasyonun önceki operasyona bağımlılığını göster.
2. **Çevrim Sürelerini Belirle:** Zaman etüdü veya MTM ile her operasyonun süresini ölç.
3. **Pitch Süresini Hesapla:**
   ```
   Pitch Süresi = MTM Toplam Süresi / Toplam Operatör Sayısı
   ```
4. **Operasyonları Dengele:** Pitch süresini aşan operasyonlar için operatör ekle, bölme veya yöntem iyileştirmesi uygula.
5. **Bant Verimi Hesapla:**
   ```
   Bant Verimi (%) = (Toplam MTM Süresi) / (Operatör Sayısı × Darboğaz Çevrim Süresi) × 100
   ```

### 6.3 Bant Dengeleme Yaklaşımları

| Yöntem | Açıklama | Ne Zaman Kullanılır |
|---|---|---|
| Operasyon bölme | Uzun operasyonu ikiye böl, iki operatör çalıştır | Makine izin veriyorsa |
| Operasyon birleştirme | Kısa iki operasyonu tek operatöre ver | Beceri seti uyumluysa |
| Yöntem iyileştirme | Hareket analizi ile süreyi kıs | Uzun vadeli çözüm |
| Ek makine/operatör | Darboğaz operasyona kaynak ekle | Kısa vadeli çözüm |

---

## 7. Çalışan Verimliliği ve Performans Takibi

### 7.1 İş Gücü Kapasitesi

```
İş Gücü Kapasitesi (saat)   = Personel Sayısı × Günlük Çalışma Saati
İş Gücü Kapasitesi (dakika) = İş Gücü Kapasitesi (saat) × 60
İş Gücü Kapasitesi (saniye) = İş Gücü Kapasitesi (dakika) × 60
```

**Örnek (Bant 1 – 59 kişi, 9 saat):**
```
İş Gücü Kapasitesi = 59 × 9 × 3.600 = 1.911.600 saniye = 531 adam-saat
```

### 7.2 Teorik Maksimum Üretim (Adam-Saat'e Göre)

```
Teorik Max Çıktı (MTM'ye göre) = İş Gücü Kapasitesi (sn) / MTM Toplam Süresi (sn)

= 1.911.600 / 550,2 = 3.474 adet/gün
```

Bu sayı, darboğaz kısıtı olmasa kaç ürün üretilebileceğini gösterir. Gerçekte darboğaz kısıtı (1.296 adet) belirleyicidir.

### 7.3 Modele Göre İş Gücü Kullanım Oranı

```
Darboğaz Kapasitesinde İş Gücü Kullanım Oranı (%)
= (Darboğaz Max Çıktı × MTM Toplam Süresi) / İş Gücü Kapasitesi × 100
= (1.296 × 550,2) / 1.911.600 × 100 = %37
```

Bu oran, modelin MTM süresi ile darboğaz çevrim süresi arasındaki yapısal verimsizliği ortaya koyar. Modeller arasında karşılaştırma yapılarak en verimli model-bant kombinasyonu belirlenebilir.

### 7.4 Çıktı Verimliliği (Günlük Takip)

```
Çıktı Verimliliği (%) = Gerçekleşen Çıktı / Darboğaza Göre Max Çıktı × 100
```

| Gerçekleşen | Max (Darboğaz) | Çıktı Verimliliği | Değerlendirme |
|---|---|---|---|
| 1.000 | 1.296 | %77 | Hedefin altında |
| 1.166 | 1.296 | **%90** | Hedef |
| 1.296 | 1.296 | %100 | Teorik maks. |
| 1.500 | 1.296 | %115 | Ek mesai/hazırlık; kaydedilmeli |

> **Hedef:** %90 çıktı verimliliği (endüstri standardı; dünya genelinde %85 OEE benchmark'ına paralel)

### 7.5 Bireysel Operatör Performans Takibi

Her operatörün performansı ayrıca takip edilmelidir:

```
Operatör Performansı (%) = (Üretilen Adet × SAM) / Standart Çalışma Süresi × 100

Standart Çalışma Süresi = Toplam Mesai – Mesai Dışı Süre (arıza, bekleme vb.)
```

- **Off-standard süreler** (makine arızası, bekleme) operatörün kontrolünde olmadığından performans hesabına dahil edilmez.
- **On-standard süreler** (dikiş, paket işleme) performansa dahildir.

---

## 8. OEE — Genel Ekipman Etkinliği

### 8.1 OEE Nedir?

OEE (Overall Equipment Effectiveness), üretim sürecindeki kaybı üç bileşene ayırarak ölçen uluslararası standarttır.

```
OEE = Kullanılabilirlik (A) × Performans (P) × Kalite (Q)
```

### 8.2 OEE Bileşenleri

**Kullanılabilirlik (Availability):**
```
A = Fiili Çalışma Süresi / Planlanan Üretim Süresi

Planlanan Üretim Süresi = Toplam Mesai – Planlı Duruşlar (mola vb.)
Fiili Çalışma Süresi = Planlanan Süre – Plansız Duruşlar (arıza, malzeme bekleme vb.)
```

**Performans (Performance):**
```
P = (Gerçekleşen Çıktı × İdeal Çevrim Süresi) / Fiili Çalışma Süresi

İdeal Çevrim Süresi = Darboğaz Operasyonun Teorik Min. Süresi (MTM)
```

**Kalite (Quality):**
```
Q = Hatasız Ürün Sayısı / Toplam Üretilen Ürün Sayısı
  = 1 – Kusur Oranı
```

**Tam Hesaplama Örneği:**

| Bileşen | Değer |
|---|---|
| Kullanılabilirlik (A) | %88 (plansız arıza: 38 dakika) |
| Performans (P) | %91 (yavaş çevrim dönemleri) |
| Kalite (Q) | %96 (FPY) |
| **OEE** | **0,88 × 0,91 × 0,96 = %77** |

### 8.3 OEE Benchmark Değerleri (Konfeksiyon Sektörü)

| OEE Seviyesi | Değerlendirme |
|---|---|
| %40–60 | Sektör ortalaması (yoğun emek / düşük otomasyon) |
| %75 | Sürdürülebilir hedef |
| %85+ | Dünya standardı (genel imalat) |

> Konfeksiyon sektörünün emek yoğun yapısı nedeniyle %75 OEE, sektör için güçlü bir benchmark olarak kabul edilmektedir.

### 8.4 Altı Büyük Kayıp (Six Big Losses)

| Kategori | Kayıp Türü | Etkilediği OEE Bileşeni |
|---|---|---|
| Makine arızası | Plansız duruş | Kullanılabilirlik |
| Model değişikliği | Planlı duruş | Kullanılabilirlik |
| Küçük duruşlar | İplik kopması, iğne kırılması | Performans |
| Düşük hız | Operatör hızı, ham madde sorunu | Performans |
| Başlangıç kayıpları | Sıcak çalışma, ayar | Kalite |
| Hurda / yeniden işleme | Dikim hataları | Kalite |

---

## 9. Kalite Verimliliği

### 9.1 İlk Geçiş Verimi (FPY — First Pass Yield)

```
FPY (%) = Hatasız Üretilen Adet / Toplam Üretilen Adet × 100
```

FPY, kalite maliyetinin doğrudan göstergesidir. Yeniden işleme (tamir) hem iş gücü hem de zaman kaybına yol açar.

### 9.2 Dikim Hata Kategorileri

Platform aşağıdaki hata kategorilerini kayıt altına almalıdır:

| Hata Kodu | Hata Türü |
|---|---|
| DH-01 | Dikiş atlama |
| DH-02 | İplik gerilim sorunu |
| DH-03 | Ölçü hatası |
| DH-04 | Cep/etiket yanlış yerleştirme |
| DH-05 | Kumaş kaydırma / çekme |
| KH-01 | Kesim hatası (boyut) |
| UK-01 | Ütü yanığı / izi |

### 9.3 Kalite Maliyeti Hesabı

```
Yeniden İşleme Maliyeti = Tamir Edilen Adet × Ortalama Tamir Süresi (dk) × Dakika Maliyeti (TL/dk)

Hurda Maliyeti = Hurda Adet × Birim Malzeme Maliyeti
```

---

## 10. WIP Yönetimi

### 10.1 WIP Nedir?

WIP (Work In Progress), üretim hattı boyunca bir süreçten diğerine geçmekte olan yarı mamul stoğudur. Aşırı WIP, darboğaz sorunlarının ve bant dengesizliğinin belirtisidir.

### 10.2 Hedef WIP Miktarı

```
Hedef WIP = Bant Tempo Süresi × Operasyon Sayısı (ortalama)
```

Pratikte her operasyon istasyonunda birkaç parçalık bir tampon yeterlidir. Aşırı WIP birikimi incelenmesi gereken bir sorunu işaret eder.

### 10.3 WIP Takip Noktaları

Platform aşağıdaki noktalarda anlık WIP miktarını takip etmelidir:

- Kesim → Bant girişi
- Ön grup bitişi (Montaj öncesi)
- Arka grup bitişi (Montaj öncesi)
- Montaj çıkışı → Yıkama girişi
- Yıkama çıkışı → UKP girişi    ← Yıkama, UKP'den önce gelir
- UKP çıkışı → Sevkiyat

---

## 11. İş Emri (Work Order) Yapısı

### 11.1 İş Emri Nedir?

İş emri, bir sipariş için üretim sürecini başlatan, yönlendiren ve izleyen temel yönetim belgesidir. Her iş emri, siparişi banta bağlar ve üretim boyunca referans alınır.

### 11.2 İş Emri Yapısı (Alanlar)

```yaml
İş Emri:
  # KİMLİK BİLGİLERİ
  is_emri_no:        "IE-2024-0087"
  musteri:           "XYZ Markası"
  siparis_no:        "SP-2024-0045"
  model:             "Marlas Pantolon"
  stil_kodu:         "MRL-32-BLU"

  # MİKTAR VE ZAMANLAMA
  siparis_miktari:   40000            # adet
  baslangic_tarihi:  "2024-11-01"
  bitis_tarihi:      "2024-12-10"
  teslim_tarihi:     "2024-12-15"

  # BANT VE KAPASİTE
  atanan_bant:       "Bant-1"
  gunluk_hedef:      1296             # adet/gün (darboğaz bazlı)
  tahmini_gun:       31               # gün
  takt_suresi:       25.0             # saniye/ürün

  # MODEL TEKNİK VERİLERİ
  mtm_toplam:        550.2            # saniye
  sam_toplam:        632.7            # saniye (%15 pay ile)
  darbogaz_op:       "Yan Birleştirme"
  darbogaz_sure:     25.0             # saniye
  bant_tempo:        25.0             # saniye

  # MALİYET VE FİYAT
  anlasmali_fiyat:   131.0            # TL/adet (kesim+dikim+UKP)
  yikama_fiyati:     8.0              # TL/adet
  tahmini_gelir:     5240000          # TL

  # DURUM
  durum:             "Devam Ediyor"   # Planlandı / Devam Ediyor / Tamamlandı
  ilerleme:          18540            # adet (bugüne kadar tamamlanan)
```

### 11.3 İş Emri Yaşam Döngüsü

```
Sipariş Alındı
     │
     ▼
Kapasite Kontrolü (otomatik)
     │
     ├─ Kapasite Yok → Alternatif bant / tarih öner
     │
     ▼
İş Emri Oluştur
     │
     ▼
Kesim Emri Tetikle
     │
     ▼
Bant'a Yükle (PCD — Planned Cut Date)
     │
     ▼
Günlük Üretim Takibi
     │
     ▼
Yıkama Takibi             ← Bant çıkışının hemen ardından
     │
     ▼
UKP Takibi
     │
     ▼
Sevkiyat & Kapatma
```

### 11.4 İş Emriyle İlişkili Belgeler

| Belge | Açıklama |
|---|---|
| BOM (Bill of Materials) | Kumaş, aksesuar, iplik listesi |
| Operasyon Listesi | Her operasyonun tanımı, süresi, makine tipi |
| Ölçü Tablosu | Beden bazlı ölçü detayları |
| Kalite Kontrol Planı | Kontrol noktaları ve AQL seviyeleri |
| Trim Kartı | Onaylı aksesuar örnekleri |
| Günlük Çıktı Raporu | Fiili vs. hedef karşılaştırması |

---

## 12. Model Bazlı Sipariş Analizi

### 12.1 Her Model İçin Verimlilik Simülasyonu

Her model, farklı MTM süresine, farklı darboğaz operasyonuna ve farklı iş gücü kullanım oranına sahiptir. Bu nedenle her sipariş kabulü öncesinde model bazlı simülasyon yapılmalıdır.

### 12.2 Model Verimlilik Profili

Platform, her model için aşağıdaki profili tutmalıdır:

```
Model Adı: Marlas Pantolon
Stil Kodu: MRL-32

─── TEKNİK VERILER ────────────────────────────
MTM Toplam Süresi        : 550,2 saniye
SAM Toplam Süresi        : 632,7 saniye
Operasyon Sayısı         : 48 adet
Paralel Süreç Grubu      : 3 (Ön, Arka, Montaj+UKP)

─── DARBOGAZ ───────────────────────────────────
Darboğaz Operasyon       : Yan Birleştirme
Darboğaz Çevrim Süresi   : 25,0 saniye
Bant Tempo Süresi        : 25,0 saniye
Darboğaza Göre Max Çıktı : 1.296 adet/gün

─── VERİMLİLİK METRİKLERİ (Bant 1 – 59 kişi) ─
İş Gücü Kapasitesi       : 1.911.600 saniye
Teorik Max Çıktı (MTM)   : 3.474 adet/gün
İş Gücü Kullanım Oranı   : %37 (darboğaz bazlı)
OEE Hedefi               : %75

─── MALİYET ────────────────────────────────────
Anlaşmalı Fiyat          : 131 TL/adet
Yıkama                   : 8 TL/adet
Tahmini Maliyet (Bant)   : [Bkz. Bant Maliyeti]
```

### 12.3 Model Karşılaştırma Tablosu

| Model | MTM (sn) | Darboğaz (sn) | Max Çıktı | İş Gücü Kull. | Anlaşma Fiyatı |
|---|---|---|---|---|---|
| Marlas | 550,2 | 25 | 1.296 | %37 | 131 TL |
| Level | *(girilecek)* | *(girilecek)* | *(girilecek)* | *(girilecek)* | *(girilecek)* |

> **Platform Özelliği:** Yeni model eklendiğinde sistem otomatik olarak verimlilik profilini hesaplamalı ve bant bazlı simülasyon sunmalıdır.

### 12.4 Model Değişikliği Analizi

Aynı bantta model değişikliği yapıldığında (örneğin Marlas'tan Level'e geçiş), darboğaz operasyon değişebilir ve bant yeniden dengelenmesi gerekebilir. Platform bu geçiş maliyetini ve süresini hesaplamalıdır (bkz. Bölüm 15).

---

## 13. Kapasite Planlama ve Sipariş Kabulü

### 13.1 Mevcut Kapasite Hesabı

```
Toplam Mevcut Kapasite (adet) = Darboğaza Göre Max Çıktı × Kalan İş Günü

Kullanılan Kapasite (adet) = Σ (Aktif İş Emri Hedefleri × Kalan Günleri)

Boş Kapasite = Toplam Mevcut Kapasite – Kullanılan Kapasite
```

### 13.2 Sipariş Kabul Kararı

Yeni sipariş girildiğinde platform otomatik olarak şu soruları yanıtlamalıdır:

| Soru | Hesaplama |
|---|---|
| Kaç günde tamamlanır? | Sipariş Miktarı / Darboğaz Max Çıktı |
| Teslimat tarihine yetişir mi? | Kalan İş Günü ≥ Gerekli Gün? |
| Kapasite müsait mi? | Boş Kapasite ≥ Sipariş Miktarı? |
| Takt süresi sağlanabilir mi? | Bant Tempo ≤ Hesaplanan Takt? |
| Karlılık pozitif mi? | Sipariş Geliri > Bant Maliyeti? |

**Sipariş Kabul Simülasyonu Örneği:**
```
Sipariş: 40.000 adet Marlas Pantolon
Teslim: 35 iş günü

Gerekli Günlük Çıktı = 40.000 / 35 = 1.143 adet/gün
Takt Süresi = 32.400 / 1.143 = 28,3 saniye

Bant Tempo Süresi = 25 saniye → 25 < 28,3 ✅ Kapasite yeterli

Tahmini Tamamlanma = 40.000 / 1.296 = 30,9 gün ✅ 35 günden az

KARAR: Sipariş kabul edilebilir. Ekstra 4,1 günlük tampon mevcut.
```

### 13.3 Haftalık Kapasite Planlama Görünümü

Platform, bant bazlı haftalık yükleme tablosu sunmalıdır:

```
BANT 1 – KASIM 2024 YÜKLEMESİ
──────────────────────────────────────────────────────────
Hafta    │ Sipariş     │ Hedef   │ Kalan Kap. │ Doluluk
─────────┼─────────────┼─────────┼────────────┼─────────
Hft. 1   │ IE-2024-087 │ 6.480   │ 0           │ %100
Hft. 2   │ IE-2024-087 │ 6.480   │ 0           │ %100
Hft. 3   │ IE-2024-087 │ 6.480   │ 648         │ %95
Hft. 4   │ IE-2024-091 │ 5.832   │ 648         │ %90
──────────────────────────────────────────────────────────
```

---

## 14. Bant Maliyeti ve Gelir-Gider Analizi

### 14.1 Bant Maliyeti Hesaplama Yöntemi

**Adım 1: Birim Personel Maliyeti**
```
Birim Personel Maliyeti = Toplam Personel Gideri / Toplam Personel Sayısı
```
*(Bireysel maaş bilgisi varsa her personelin gerçek maliyeti kullanılır)*

**Adım 2: Bant Doğrudan Personel Maliyeti**
```
Bant X Doğrudan Maliyet = Birim Personel Maliyeti × Bant X Personel Sayısı
```

**Adım 3: Ortak Giderlerin Dağıtımı**
```
Dağıtılacak Tutar = Toplam Gider – Σ (Tüm Bantların Doğrudan Maliyeti)

Her Banda Düşen Ortak Gider = Dağıtılacak Tutar / Bant Sayısı
(veya personel sayısına orantılı dağıtım)
```

**Adım 4: Bant Toplam Maliyeti**
```
Bant X Toplam Maliyeti = Bant X Doğrudan Maliyet + Ortak Gider Payı
```

### 14.2 Örnek Hesaplama (Bayhan Tekstil)

| Personel Grubu | Kişi Sayısı |
|---|---|
| Kesim | 7 |
| Bant 1 | 59 |
| Bant 2 | 75 |
| Ortak Destek | 5 |
| İdari | 10 |
| UKP | 20 |
| **Toplam** | **176** |

```
Toplam Aylık Gider     : 8.083.666 TL
Birim Personel Maliyeti: 8.083.666 / 176 = 45.930 TL/kişi

Bant 1 Doğrudan Maliyet : 59 × 45.930 = 2.709.870 TL
Bant 2 Doğrudan Maliyet : 75 × 45.930 = 3.444.750 TL
Σ Doğrudan Maliyet      : 6.154.620 TL

Dağıtılacak Ortak Gider : 8.083.666 – 6.154.620 = 1.929.046 TL
Her Banta Ortak Pay     : 1.929.046 / 2 = 964.523 TL

Bant 1 Toplam Maliyet   : 2.709.870 + 964.523 = 3.674.393 TL/ay
Bant 2 Toplam Maliyet   : 3.444.750 + 964.523 = 4.409.273 TL/ay
```

### 14.3 Sipariş Karlılık Analizi

```
Sipariş Geliri    = Sipariş Miktarı × Anlaşmalı Fiyat
                  = 40.000 × 131 = 5.240.000 TL

Yıkama Geliri     = 40.000 × 8 = 320.000 TL (Ayrıca faturalandırılır)

Bant Maliyeti     = Üretim Süresi (ay) × Aylık Bant Maliyeti
                  = 1,5 × 3.674.393 = 5.511.590 TL

Brüt Kar/Zarar    = 5.240.000 – 5.511.590 = –271.590 TL ❌

YORUM: Bu sipariş anlaşmalı fiyatla zararlıdır.
Başabaş Fiyat = 5.511.590 / 40.000 = 137,8 TL/adet olmalıdır.
```

> **Platform Uyarısı:** Sipariş karlılık analizi, iş emri oluşturulmadan önce otomatik olarak hesaplanmalı ve negatif karı kırmızı uyarıyla göstermelidir.

### 14.4 Dakika Başına Maliyet (CM Rate)

Bandın aylık toplam maliyetinin, o bantta üretilen toplam adam-dakikaya bölünmesiyle elde edilir. Tüm model fiyat hesaplarının temel girdisidir.

```
Dakika Başına Maliyet (TL/dk) = Aylık Bant Maliyeti / Aylık Toplam Adam-Dakika

= 3.674.393 / (59 kişi × 22 gün × 9 saat × 60 dk)
= 3.674.393 / 702.240
= 5,23 TL/adam-dakika
```

---

### 14.5 Model Fiyat Hesabı (MTM × Dakika Maliyeti)

Model fiyatı, bir ürünü üretmenin gerçek işçilik maliyetidir. Bu değer hem iç maliyet tabanı hem de müşteriyle fiyat müzakeresinde alt sınır olarak kullanılır.

#### Hesaplama Katmanları

Üç ayrı katmanda hesaplanır; her biri farklı bir amaca hizmet eder:

| Katman | Formül | Ne İçin? |
|---|---|---|
| **MTM Maliyeti** | MTM (dk) × TL/dk | Teorik alt sınır (saf iş içeriği) |
| **SAM Maliyeti** | SAM (dk) × TL/dk | Gerçekçi planlama maliyeti |
| **Başabaş Fiyatı** | Bant Aylık Maliyet / (Max Çıktı × Çalışma Günü) | Sipariş kabul alt sınırı |

#### Formüller

```
─── MTM BAZLI MODEL MALİYETİ ───────────────────────────────
(Teorik minimum — tam verimlilik varsayımı)

MTM Süresi (dk)   = MTM Toplam Saniye / 60
                  = 550,2 / 60 = 9,17 dk

MTM Maliyeti (TL) = MTM Süresi (dk) × Dakika Maliyeti (TL/dk)
                  = 9,17 × 5,23 = 47,96 TL/ürün


─── SAM BAZLI MODEL MALİYETİ ───────────────────────────────
(Gerçekçi maliyet — %15 pay dahil)

SAM Süresi (dk)   = SAM Toplam Saniye / 60
                  = 632,7 / 60 = 10,55 dk

SAM Maliyeti (TL) = SAM Süresi (dk) × Dakika Maliyeti (TL/dk)
                  = 10,55 × 5,23 = 55,17 TL/ürün


─── BAŞABAŞ FİYATI ─────────────────────────────────────────
(Bandın kendini amorti ettiği minimum satış fiyatı)

Başabaş Fiyatı    = Aylık Bant Maliyeti / (Max Çıktı/gün × Çalışma Günü/ay)
                  = 3.674.393 / (1.296 × 22)
                  = 3.674.393 / 28.512
                  = 128,87 TL/ürün  (darboğaz kapasitesinde %100 dolulukta)

Hedef Dolulukta   = Başabaş Fiyatı / Hedef Verimlilik (%90)
(%90 verimlilik)  = 128,87 / 0,90 = 143,19 TL/ürün
```

#### Fiyat Bileşenleri Tablosu (Marlas Pantolon)

| Maliyet Bileşeni | Hesaplama | Tutar |
|---|---|---|
| MTM işçilik maliyeti | 9,17 dk × 5,23 TL/dk | **47,96 TL** |
| Pay farkı (MTM → SAM) | (10,55 – 9,17) × 5,23 | **7,22 TL** |
| **SAM işçilik maliyeti** | 10,55 dk × 5,23 TL/dk | **55,17 TL** |
| Yönetim + ortak gider payı | (Bant maliyetinde dahil) | — |
| Yıkama | Ayrı faturalandırılır | **8,00 TL** |
| **Toplam Üretim Maliyeti** | SAM maliyeti + yıkama | **63,17 TL** |
| Anlaşmalı Fiyat (müşteri) | — | **131,00 TL** |
| **Görünen Brüt Marj** | 131 – 63,17 | **67,83 TL (%52)** |

> **Önemli Not:** Görünen brüt marj cazip görünse de, bant her gün %100 dolu değildir. Gerçek karlılık için sipariş bazlı analiz (Bölüm 14.3) ve bant doluluk oranı birlikte değerlendirilmelidir.

#### Modeller Arası Fiyat Karşılaştırması

Her modelin MTM süresi farklı olduğu için aynı dakika maliyetiyle çok farklı birim maliyetler ortaya çıkar. Platform bu tabloyu otomatik üretmelidir:

| Model | MTM (dk) | SAM (dk) | MTM Maliyeti | SAM Maliyeti | Başabaş Fiyat | Müşteri Fiyatı | Durum |
|---|---|---|---|---|---|---|---|
| Marlas | 9,17 | 10,55 | 47,96 TL | 55,17 TL | 143,19 TL | 131,00 TL | ⚠️ Riskli |
| Level | *(girilecek)* | *(girilecek)* | *(girilecek)* | *(girilecek)* | *(girilecek)* | *(girilecek)* | — |

> **Başabaş fiyatı neden müşteri fiyatından yüksek?** Hedef verimlilik (%90) varsayımıyla hesaplanan başabaş fiyat (143,19 TL), müşterinin ödediği 131 TL'nin üzerindedir. Bu fark, ya fiyat artışı müzakeresiyle ya da bant maliyetinin düşürülmesiyle (daha fazla sipariş → sabit gider dağılımı) kapatılabilir.

#### Fiyat Müzakeresi için Zemin Belirleme

```
Minimum Kabul Edilebilir Fiyat = Başabaş Fiyat × (1 + Hedef Kar Marjı)

Örnek (%15 kar hedefi):
= 143,19 × 1,15 = 164,67 TL/ürün

Mevcut fiyat (131 TL) bu hedefin %20 altındadır.
```

---

## 15. Model Geçiş Süresi (Changeover) Yönetimi

### 15.1 Changeover Nedir?

Bir bantta model değişikliğinde yaşanan geçiş süreci; makine ayarları, düzen değişikliği, operatör eğitimi ve bant dengeleme adımlarını kapsar. Bu süre boyunca bant verimlilik kaybı yaşar.

### 15.2 Changeover Kayıp Hesabı

```
Changeover Süresi = T_co (gün veya saat)

Changeover Üretim Kaybı = T_co × Darboğaza Göre Max Çıktı × (1 – Ortalama Geçiş Verimliliği)

Örnek: 2 günlük geçiş, %60 ortalama verimlilikle:
Kayıp = 2 × 1.296 × (1 – 0,60) = 1.037 adet
```

### 15.3 Changeover Optimizasyonu (SMED)

SMED (Single-Minute Exchange of Die), geçiş sürelerini minimize etmek için kullanılan lean tekniğidir.

**Temel Adımlar:**
1. İç ve dış faaliyetleri ayır (makine dururken vs. öncesinde yapılabilecekler)
2. İç faaliyetleri dış'a dönüştür
3. Paralel faaliyetler planla
4. Standart geçiş prosedürü oluştur

---

## 16. Yıkama Prosesi Verimliliği

Yıkama prosesi genellikle ayrı fiyatlandırıldığından bant maliyetinin dışında tutulur. Ancak darboğaz oluşturmaması ve hata oranının düşük tutulması kritik önemdedir.

### 16.1 Yıkama Kapasitesi Hesabı

```
Makine Kapasitesi (adet/yıkama) = Makine Haznesi / Ürün Başına Yükleme
Günlük Kapasite = Kapasite × Günlük Çevrim Sayısı

Çevrim Sayısı = Fiili Çalışma Süresi / (Yıkama + Kurutma + Sıkma Süresi)
```

**Örnek (Bayhan Tekstil – 2 yıkama, 3 kurutma, 2 sıkma makinesi):**
```
Yıkama Süresi         : 45 dakika/çevrim
Kurutma Süresi        : 30 dakika/çevrim
Sıkma Süresi          : 10 dakika/çevrim
Toplam Çevrim         : 85 dakika

Günlük Çevrim (9 saat): 540 / 85 ≈ 6 çevrim
Kapasite (1 makine)   : 6 × [makine kapasitesi adet]
```

### 16.2 Yıkama Verimliliği

```
Yıkama Verimliliği (%) = Yıkanan Adet / Yıkama Kapasitesi × 100
```

| Takip Metriği | Açıklama |
|---|---|
| Kusur Oranı | Yıkama sonrası renk, büzülme hataları |
| Darboğaz Kontrolü | Yıkama bant çıktısını engelliyor mu? |
| Enerji Tüketimi | kWh / adet (enerji verimliliği) |
| Su Tüketimi | Litre / adet |

---

## 17. UKP Verimliliği

### 17.1 UKP Kapasitesi

UKP genellikle 2 veya daha fazla banda hizmet verir. Birden fazla bandın çıktısını işleyebilir olması, UKP'nin kendi başına bir darboğaz oluşturmaması açısından kritiktir.

```
UKP Kapasitesi (adet/gün) = UKP Personeli × Kişi Başı Günlük Kapasite

UKP Darboğaz Kontrolü: UKP Kapasitesi ≥ Σ (Tüm Bantların Günlük Çıktısı)
```

### 17.2 UKP Maliyet Dağıtımı

UKP maliyeti, hizmet verdiği bantlara çıktı miktarına orantılı olarak dağıtılır:

```
Bant X'in UKP Maliyet Payı = UKP Toplam Maliyet × (Bant X Çıktısı / Toplam Çıktı)
```

---

## 18. KPI Dashboard — Temel Performans Göstergeleri

Platform ana ekranında aşağıdaki KPI'lar anlık ve günlük olarak gösterilmelidir:

### 18.1 Bant Bazlı KPI'lar

| KPI | Formül | Hedef |
|---|---|---|
| Çıktı Verimliliği | Gerçekleşen / Max Çıktı × 100 | ≥ %90 |
| OEE | A × P × Q | ≥ %75 |
| İlk Geçiş Verimi (FPY) | Hatasız / Toplam × 100 | ≥ %95 |
| İş Gücü Kullanım Oranı | (Çıktı × MTM) / İş Gücü Kap. × 100 | ≥ %85 |
| WIP Seviyesi | Süreç içi yarı mamul (adet) | < Hedef WIP |
| Bant Dengeleme Verimi | MTM Toplam / (Op. Sayısı × Darboğaz) | ≥ %85 |

### 18.2 Atölye Bazlı KPI'lar

| KPI | Formül | Hedef |
|---|---|---|
| Zamanında Teslimat Oranı | Zamanında Teslim / Toplam Sipariş × 100 | ≥ %95 |
| Sipariş Karlılığı | (Gelir – Maliyet) / Gelir × 100 | > %0 |
| Dakika Başına Maliyet | Aylık Maliyet / Adam-Dakika | İzleme |
| Changeover Süresi (ort.) | Toplam Geçiş Süresi / Geçiş Sayısı | Minimize |

### 18.3 Operatör KPI'ları

| KPI | Formül | Hedef |
|---|---|---|
| Operatör Performansı | (Üretilen × SAM) / On-Std Süre × 100 | ≥ %85 |
| Devamsızlık Oranı | Devamsızlık / Toplam Gün × 100 | ≤ %5 |
| Hata Oranı | Hatalı Parça / Üretilen × 100 | ≤ %3 |

---

## 19. Sürekli İyileştirme (Kaizen) Döngüsü

Platform sadece ölçüm yapmakla kalmamalı; iyileştirme süreçlerini de desteklemelidir.

### 19.1 PDCA Döngüsü

```
PLAN  → Darboğaz tespit et, iyileştirme hedefi belirle
DO    → Değişikliği uygula (ek makine, yöntem değişikliği vb.)
CHECK → OEE, çıktı verimliliği ve KPI'ları karşılaştır
ACT   → Başarılıysa standartlaştır; başarısızsa yeniden planla
```

### 19.2 İyileştirme Öncelik Matrisi

Platform, aşağıdaki kriterlere göre iyileştirme önerileri sıralamalıdır:

| Kriter | Ağırlık |
|---|---|
| Günlük çıktıya etkisi (adet) | %40 |
| Uygulama maliyeti (TL) | %30 |
| Uygulama süresi (gün) | %20 |
| Kalite etkisi | %10 |

---

## 20. Uygulama Örneği: Bayhan Tekstil

Bu bölüm, dokümanın tüm kavramlarını Bayhan Tekstil örneğinde bütünleştirir.

### 20.1 Atölye Yapısı

| Birim | Personel | Açıklama |
|---|---|---|
| Kesim | 7 | Tüm bantlara ortak |
| Bant 1 | 59 | Marlas Pantolon |
| Bant 2 | 75 | Level Pantolon |
| Ortak Destek | 5 | Her iki banda destek |
| İdari | 10 | Atölye yönetimi |
| UKP | 20 | Her iki banda ortak |
| Yıkama | 5 | Ayrı fiyatlandırma |
| **Toplam** | **181** | |

### 20.2 Bant 1 (Marlas) — Günlük Verimlilik Özeti

```
─── KAPASITE ───────────────────────────────────
Bant Tempo Süresi           : 25 saniye
Darboğaza Göre Max Çıktı    : 1.296 adet/gün

─── VERIMLILIK ─────────────────────────────────
Çıktı Hedefi (%90)          : 1.166 adet/gün
İş Gücü Kapasitesi          : 531 adam-saat/gün
MTM Toplam Süresi           : 550,2 saniye
İş Gücü Kullanım Oranı      : %37 (darboğaz bazlı)

─── MALIYET ────────────────────────────────────
Aylık Bant Maliyeti         : 3.674.393 TL
Dakika Başına Maliyet       : 5,23 TL/adam-dk
Ürün Başına İşçilik         : 55,2 TL

─── SIPARIS (IE-2024-087) ──────────────────────
Miktar                      : 40.000 adet
Anlaşma Fiyatı              : 131 TL/adet
Tahmini Süre                : 30,9 gün (≈ 6,2 hafta)
Tahmini Gelir               : 5.240.000 TL
Tahmini Bant Maliyeti       : 5.511.590 TL
Brüt Sonuç                  : –271.590 TL ❌ (fiyat revizyonu önerilir)
Başabaş Fiyat               : 137,8 TL/adet
```

### 20.3 Platform Uyarı Senaryoları

| Senaryo | Platform Tepkisi |
|---|---|
| Çıktı < %80 hedefin | Kırmızı uyarı, darboğaz analizi sun |
| Sipariş brüt zarar | Sarı uyarı, başabaş fiyatı göster |
| WIP > Hedef WIP × 2 | Turuncu uyarı, tıkanan operasyonu işaretle |
| FPY < %92 | Kırmızı uyarı, hata kategorisi raporu iste |
| Changeover > 3 gün | Mavi öneri, SMED aksiyon planı öner |
| Kapasite %100 doldu | Kırmızı, yeni sipariş için alternatif bant/tarih hesapla |

---

## Ekler

### Ek A: Formül Referans Kartı

```
Darboğaz Max Çıktı          = Günlük Süre (sn) / Darboğaz Çevrim Süresi
Takt Süresi                 = Günlük Süre / Günlük Hedef Çıktı
Çıktı Verimliliği           = Gerçekleşen / Max Çıktı
İş Gücü Kull. Oranı        = (Çıktı × MTM) / İş Gücü Kap.
SAM                         = Temel Süre × (1 + Pay Oranı)
OEE                         = Kullanılabilirlik × Performans × Kalite
Dakika Başına Maliyet       = Aylık Bant Maliyeti / (Personel × Gün × Saat × 60)
MTM Model Maliyeti          = (MTM Toplam sn / 60) × TL/adam-dakika
SAM Model Maliyeti          = (SAM Toplam sn / 60) × TL/adam-dakika
Başabaş Fiyatı              = Aylık Bant Maliyeti / (Max Çıktı/gün × Çalışma Günü/ay)
Hedef Dolulukta Başabaş     = Başabaş Fiyatı / Hedef Verimlilik Oranı
Min. Kabul Fiyatı           = Başabaş Fiyatı × (1 + Hedef Kar Marjı)
Gerekli Teslim Günü         = Sipariş Miktarı / Darboğaz Max Çıktı
Kapasite Açığı              = Gerekli Günlük Çıktı – Darboğaz Max Çıktı
```

### Ek B: Çıktı Verimliliği Hedefleri

| Verimlilik Bandı | Değerlendirme | Aksiyon |
|---|---|---|
| ≥ %100 | Ek mesai/hazırlık var | Kayıt altına al, insan hatası veya ekstra vardiya kaydı ekle |
| %90–99 | Hedefte | İzlemeye devam |
| %80–89 | Kabul edilebilir | Darboğaz operasyonunu incele |
| %70–79 | Dikkat | Acil darboğaz analizi, WIP kontrolü |
| < %70 | Kritik | Acil müdahale, kök neden analizi |

### Ek C: Konfeksiyon Sektörü Benchmark Değerleri

| Metrik | Zayıf | Ortalama | İyi | Dünya Standardı |
|---|---|---|---|---|
| OEE | < %40 | %40–60 | %60–75 | > %75 |
| Çıktı Verimliliği | < %70 | %70–80 | %80–90 | > %90 |
| FPY | < %85 | %85–92 | %92–97 | > %97 |
| Changeover (gün) | > 5 | 3–5 | 1–3 | < 1 |

---

*Bu doküman, Atölye Verimlilik Sistemi platformu için hazırlanmış canlı bir referans belgesidir. Yeni metrikler, model profilleri ve sektör benchmark güncellemeleri eklendikçe versiyonlanmalıdır.*
