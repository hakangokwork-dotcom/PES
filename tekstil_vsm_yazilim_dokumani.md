# TEKSTİL ATÖLYESİ — PROFESYONEL VALUE STREAM MAPPING (VSM) YAZILIMI
## Yazılım Tasarım & Hesaplama Dokümantasyonu

> **Versiyon:** 1.0  
> **Alan:** Konfeksiyon / Fason Atölye Yönetimi  
> **Metodoloji:** Lean Manufacturing · VSM (Rother & Shook, Learning to See) · Six Sigma  
> **Hedef:** Çok bantlı, çok modelli tekstil atölyelerinde değer akışını görselleştirmek, atık analizi yapmak ve gelecek durum haritası üretmek

---

## İÇİNDEKİLER

1. [Proje Vizyonu ve Kapsam](#1-proje-vizyonu-ve-kapsam)
2. [Temel Kavramlar ve Tanımlar](#2-temel-kavramlar-ve-tanımlar)
3. [Tekstil Atölyesi İçin VSM Metodolojisi](#3-tekstil-atölyesi-için-vsm-metodolojisi)
4. [Çok Bantlı Mimari Tasarımı](#4-çok-bantlı-mimari-tasarımı)
5. [Tüm VSM Hesaplamaları — Formüller ve Açıklamalar](#5-tüm-vsm-hesaplamaları--formüller-ve-açıklamalar)
6. [Veri Modeli (Veritabanı Şeması)](#6-veri-modeli-veritabanı-şeması)
7. [Yazılım Mimarisi](#7-yazılım-mimarisi)
8. [Modüller ve Özellikler](#8-modüller-ve-özellikler)
9. [VSM Sembol Seti (Tekstil Özel)](#9-vsm-sembol-seti-tekstil-özel)
10. [Raporlama ve KPI Dashboard](#10-raporlama-ve-kpi-dashboard)
11. [Gelecek Durum Haritası (Future State)](#11-gelecek-durum-haritası-future-state)
12. [Teknoloji Stack Önerisi](#12-teknoloji-stack-önerisi)
13. [Geliştirme Yol Haritası](#13-geliştirme-yol-haritası)

---

## 1. PROJEVİZYONU VE KAPSAM

### 1.1 Problem Tanımı

Konfeksiyon atölyelerinde üretim süreçleri son derece karmaşıktır:

- Aynı atölye içinde **birden fazla bant** eş zamanlı çalışır
- Bazı bantlar birbirinden **tamamen bağımsız** modeller üretir
- Bazı bantlar **ortak istasyonlar paylaşır** (örn. ütü, kalite kontrol, overlok)
- Her model için **farklı SMV (Standard Minute Value)** ve operasyon sırası geçerlidir
- Model değişimleri sırasında **setup kayıpları** oluşur

Mevcut el ile çizilen VSM yöntemleri bu karmaşıklığı yönetemez ve hesaplamalar manuel olarak yapıldığından hatalara açıktır.

### 1.2 Yazılımın Hedefleri

| Hedef | Açıklama |
|-------|----------|
| **Mevcut Durum Haritası** | Atölyenin anlık üretim akışını görselleştirme |
| **Gelecek Durum Haritası** | İyileştirme senaryolarını simüle etme |
| **Çok Bantlı Yönetim** | Bağımsız, ortak ve karma bant yapılarını modelleme |
| **Otomatik Hesaplama** | Tüm VSM metriklerini gerçek zamanlı hesaplama |
| **Atık Analizi** | 8 lean atık kategorisini tespit ve ölçme |
| **Raporlama** | Yönetim için KPI dashboard ve karşılaştırmalı raporlar |

### 1.3 Kapsam Dışı

- Ham madde tedarik zinciri yönetimi (ERP entegrasyonu için ayrı modül)
- Muhasebe ve finansal yönetim
- İnsan kaynakları yönetimi

---

## 2. TEMEL KAVRAMLAR VE TANIMLAR

### 2.1 Lean Atık Kategorileri (Tekstil Uygulaması)

| # | Atık Türü | Türkçe | Tekstil Atölyesindeki Karşılığı |
|---|-----------|--------|--------------------------------|
| 1 | **Overproduction** | Fazla Üretim | Siparişten fazla ürün dikmek, boş stok oluşturmak |
| 2 | **Waiting** | Bekleme | Operatörün kumaş, aksesuar veya önceki operasyonu beklemesi |
| 3 | **Transportation** | Taşıma | Yarı mamulün bantlar veya istasyonlar arası gereksiz taşınması |
| 4 | **Overprocessing** | Fazla İşlem | Müşterinin talep etmediği dikişleri atmak, gereksiz kontroller |
| 5 | **Inventory** | Stok/WIP | Bantlar arası yığılan yarı mamul (Work In Process) |
| 6 | **Motion** | Hareket | Operatörün ürüne ulaşmak için yaptığı gereksiz hareketler |
| 7 | **Defects** | Hata/Fire | Dikişsizlik, renk farkı, ölçü hatası, revizyon |
| 8 | **Skills Underuse** | Yetenek Kaybı | Deneyimli operatörün basit operasyona atanması |

### 2.2 Temel VSM Sembolleri Açıklaması

```
[MÜŞTERİ] → Sipariş Bilgisi → [ÜRETİM KONTROL] → Üretim Planı
                                        ↓
[TEDARİKÇİ] → Kumaş / Aksesuar → [KESIMHANE] → [BANT-1] → [KALİTE] → [SEVKIYAT]
                                                    ↙         ↗
                                               [BANT-2] ----
                                        [ORTAK: OVERLOK]
```

---

## 3. TEKSTİL ATÖLYESİ İÇİN VSM METODOLOJİSİ

### 3.1 VSM Uygulama Adımları

```
ADIM 1: Ürün Ailesi Seçimi
   └─ Hangi model/sipariş için harita çizilecek?
   
ADIM 2: Mevcut Durum Haritası (Current State Map)
   ├─ Müşteri talebini kaydet
   ├─ Tüm üretim adımlarını soldansağa haritalandır
   ├─ Her istasyonun veri kutusunu doldur
   ├─ Bilgi akışını göster
   └─ Zaman çizelgesi (timeline) oluştur
   
ADIM 3: Atık Analizi
   ├─ VA (Value Added) süreleri hesapla
   ├─ NVA (Non-Value Added) süreleri hesapla
   └─ PCE (Process Cycle Efficiency) hesapla
   
ADIM 4: Gelecek Durum Haritası (Future State Map)
   ├─ Darboğazları kaldır
   ├─ Hat dengeleme öner
   └─ İyileştirme hedeflerini belirle
   
ADIM 5: Uygulama Planı (Kaizen Planı)
   └─ Öncelikli aksiyonları belirle ve takip et
```

### 3.2 Tekstile Özgü Üretim Süreçleri

```
TEDARİK → KESIMHANE → DİKİMHANE (BANTLAR) → BİTİŞ → KALİTE → SEVKIYAT
              ↓              ↓
         [Pastal Hazırlama]  [Ortak İstasyonlar]
         [Serileme]          - Overlok
         [Kesim]             - Ütü
         [Numaralama]        - Düğme
         [Demetleme]         - Paket
```

---

## 4. ÇOK BANTLI MİMARİ TASARIMI

Bu yazılımın en kritik özelliği, tekstil atölyelerinin gerçek yapısını yansıtacak şekilde **çok bantlı ve çok modelli** yapıyı desteklemesidir.

### 4.1 Bant Tipleri

#### Tip A: Bağımsız Bant (Dedicated Line)
```
BANT-1: [Op1] → [Op2] → [Op3] → [Op4] → [Op5]
         Model A sadece bu bantta üretilir
         
BANT-2: [Op1] → [Op2] → [Op3] → [Op4]
         Model B sadece bu bantta üretilir
```

**Özellikler:**
- Kendi Takt Time'ı vardır
- Kendi hat dengesi yapılır
- WIP sadece kendi içinde ölçülür
- Darboğaz analizi bağımsız yapılır

#### Tip B: Ortak İstasyonlu Bant (Shared Resource Line)
```
BANT-1: [Op1] → [Op2] ─────────────────────┐
                                      [ORTAK OVERLOK] → [Devam]
BANT-2: [Op1] → [Op2] → [Op3] ────────────┘

BANT-3: [Op1] ─────────────────────────────┐
                                      [ORTAK ÜTÜ]
BANT-1: [Dikimden Sonra] ─────────────────┘
```

**Yazılım Yaklaşımı:**
- Ortak istasyon ayrı bir kaynak olarak tanımlanır
- Her bant için bu istasyonun **kullanım oranı** ve **bekleme süresi** ayrı hesaplanır
- Ortak istasyonun kapasitesi tüm bantlara bölüştürülür
- Darboğaz tespitinde ortak istasyon özellikle izlenir

#### Tip C: Esnek / Karma Bant (Flexible Line)
```
BANT-1: Sabah vardiyası → Model A
BANT-1: Öğleden sonra → Model B (model değişimi)

veya

BANT-1: İlk 3 operasyon → Model A ve Model B (paralel)
BANT-1: Son 2 operasyon → Sadece Model A
```

**Yazılım Yaklaşımı:**
- Zaman dilimine göre model ataması yapılır
- Model değişim süreleri (setup time) ayrıca kaydedilir
- Her model değişimi için SMV farkı otomatik hesaplanır

### 4.2 Bant Konfigürasyon Yönetimi

```yaml
# Örnek Bant Yapılandırması (Mantıksal Gösterim)
atolye:
  id: ATL-001
  ad: "Ana Konfeksiyon Atölyesi"
  
  bantlar:
    - id: BANT-01
      ad: "Pantolon Bandı"
      tip: DEDICATED
      kapasite: 12 operatör
      mevcut_model: "5 Cep Pantolon - Model XY"
      
    - id: BANT-02
      ad: "Gömlek Bandı"
      tip: DEDICATED
      kapasite: 10 operatör
      mevcut_model: "Klasik Gömlek - Model AB"
      
    - id: BANT-03
      ad: "Karma Bant"
      tip: FLEXIBLE
      kapasite: 8 operatör
      aktif_modeller:
        - model: "Polo T-Shirt - Model CD"
          paylasim_orani: 0.6
        - model: "Basic T-Shirt - Model EF"
          paylasim_orani: 0.4
          
  ortak_istasyonlar:
    - id: OI-001
      ad: "Overlok Bölümü"
      makine_sayisi: 4
      kullanan_bantlar: [BANT-01, BANT-02, BANT-03]
      
    - id: OI-002
      ad: "Ütü Bölümü"
      makine_sayisi: 6
      kullanan_bantlar: [BANT-01, BANT-02]
      
    - id: OI-003
      ad: "Kalite Kontrol"
      personel: 3
      kullanan_bantlar: [BANT-01, BANT-02, BANT-03]
```

---

## 5. TÜM VSM HESAPLAMALARI — FORMÜLLER VE AÇIKLAMALAR

### 5.1 Temel Zaman Metrikleri

#### 5.1.1 Takt Time (Müşteri Ritmi)

> Müşterinin bir ürünü ne sıklıkla talep ettiğini gösteren süre

```
FORMÜL:
Takt Time (TT) = Kullanılabilir Üretim Süresi / Müşteri Talebi

Bileşenler:
  Kullanılabilir Süre = (Vardiya Süresi − Mola − Arıza Duruşları) × Vardiya Sayısı
  
Örnek:
  Vardiya süresi          = 480 dk
  Mola süresi             = 30 dk (2 × 15 dk)
  Yemek molası            = 30 dk
  Net kullanılabilir süre = 480 - 30 - 30 = 420 dk = 25.200 sn
  Günlük müşteri talebi   = 350 adet
  
  TT = 25.200 sn / 350 adet = 72 sn/adet
```

**Yorumlama:**
- Eğer herhangi bir operasyonun Cycle Time > Takt Time ise: **Darboğaz!**
- Takt Time, tüm hat dengeleme hesaplamalarının referans noktasıdır

#### 5.1.2 Cycle Time (İşlem Süresi)

> Bir operasyonun bir birim ürün için harcadığı gerçek süre

```
FORMÜL:
Cycle Time (CT) = Toplam Gözlem Süresi / Gözlenen Birim Sayısı

Gerçek (Actual) Cycle Time:
  ACT = Teorik CT + Arıza Kayıpları + Setup Kayıpları + Kalite Kayıpları

Her operasyon için veri kutusu:
  ┌─────────────────────────────┐
  │ Operasyon Adı               │
  ├──────────────┬──────────────┤
  │ CT: 45 sn    │ Makine: 1   │
  │ Setup: 0 sn  │ Oper.: 1    │
  │ Uptime: %94  │ WIP: 8 adet │
  └──────────────┴──────────────┘
```

#### 5.1.3 Process Time (İşlem Zamanı)

```
FORMÜL:
Process Time (PT) = Cycle Time × (Operatör Sayısı / Makine Sayısı)

Not: Eğer 1 makine / 1 operatör ise PT = CT
```

#### 5.1.4 Lead Time (Teslim Süresi)

```
FORMÜL:
Lead Time (LT) = Toplam İşlem Süresi + Toplam Bekleme Süresi

LT = Σ(Process Time_i) + Σ(Inventory Lead Time_i)

Inventory Lead Time (Stok Bekleme Süresi):
  ILT = WIP Miktarı × Takt Time  [Little's Law]
  
Örnek:
  Operasyon 1: PT = 45 sn, Aradan gelen WIP = 15 adet
  ILT = 15 × 72 sn = 1.080 sn = 18 dk
  
Toplam LT:
  LT = (PT1 + PT2 + ... + PTn) + (ILT1 + ILT2 + ... + ILTn)
```

#### 5.1.5 SMV — Standard Minute Value

```
FORMÜL:
SMV = Temel Süre × (1 + Allowance Faktörü)

Allowance faktörleri (tekstil standartları):
  - Kişisel ihtiyaç : %5
  - Yorgunluk      : %4
  - Gecikme         : %3
  Toplam Allowance  : %12 (atölye bazında ayarlanabilir)

Örnek:
  Yaka dikişi için temel süre = 0,42 dk
  SMV = 0,42 × (1 + 0,12) = 0,47 dk

Not: SMV tüm Takt Time ve hat dengeleme hesaplamalarında
     temel girdi olarak kullanılır.
```

---

### 5.2 Verimlilik Metrikleri

#### 5.2.1 Line Efficiency (Hat Verimliliği)

```
FORMÜL:
Hat Verimliliği (%) = (Toplam SMV × Gerçekleşen Üretim) 
                      ─────────────────────────────────── × 100
                      (Toplam Çalışma Dakikası × Operatör Sayısı)

Örnek:
  Toplam SMV      = 15,4 dk (bir ürün için tüm operasyonlar)
  Günlük üretim   = 280 adet
  Vardiya süresi  = 420 dk (net)
  Operatör sayısı = 12

  Hat Verimliliği = (15,4 × 280) / (420 × 12) × 100
                  = 4.312 / 5.040 × 100
                  = %85,6
```

**Benchmarklar:**
| Verimlilik | Değerlendirme |
|-----------|---------------|
| < %60 | Kritik — acil iyileştirme gerekli |
| %60 - %70 | Zayıf |
| %70 - %80 | Ortalama |
| %80 - %88 | İyi |
| > %88 | Mükemmel |

#### 5.2.2 OEE — Overall Equipment Effectiveness

```
FORMÜL:
OEE = Kullanılabilirlik × Performans × Kalite

1. Kullanılabilirlik (Availability):
   A = (Planlanan Süre − Plansız Duruş) / Planlanan Süre
   
2. Performans (Performance):
   P = (Gerçek Üretim × İdeal CT) / Çalışma Süresi
   
3. Kalite (Quality):
   Q = (Toplam Üretim − Hatalı Üretim) / Toplam Üretim

Örnek:
  Planlanan süre     = 420 dk
  Plansız duruş      = 25 dk
  Gerçek üretim      = 280 adet
  İdeal CT           = 1,4 dk/adet (= 420/300 hedef kapasite)
  Hatalı ürün        = 14 adet
  
  A = (420 − 25) / 420 = 0,940 → %94,0
  P = (280 × 1,4) / (420 − 25) = 392 / 395 = 0,992 → %99,2
  Q = (280 − 14) / 280 = 0,950 → %95,0
  
  OEE = 0,940 × 0,992 × 0,950 = 0,885 → %88,5
```

**OEE Dünya Standartları:**
| OEE | Sınıf |
|-----|-------|
| < %65 | Kabul edilemez |
| %65 - %75 | Kabul edilebilir |
| %75 - %85 | İyi |
| > %85 | Dünya Standartları |

#### 5.2.3 PCE — Process Cycle Efficiency (Değer Katma Oranı)

```
FORMÜL:
PCE = Değer Katan Süre (VA) / Toplam Lead Time × 100

Değer Katan Süre (VA):
  Ürünü fiziksel olarak dönüştüren operasyonlar
  (dikiş atma, overlok, ütü, vb.)

Değer Katmayan Süre (NVA):
  Bekleme + Taşıma + Kontrol + Setup sürelerinin toplamı

Örnek:
  Toplam VA  = 15,4 dk
  Toplam LT  = 285 dk (stok beklemeleri dahil)
  
  PCE = 15,4 / 285 × 100 = %5,4

Tekstil Sektörü Benchmarkları:
  PCE > %15 → İyi
  PCE > %25 → Mükemmel (Lean ortamı)
  PCE < %5  → Kritik — çok fazla stok/bekleme var
```

---

### 5.3 Hat Dengeleme Hesaplamaları

#### 5.3.1 Gerekli Operatör Sayısı

```
FORMÜL:
Gerekli Operatör = Toplam SMV / Takt Time

Örnek:
  Toplam SMV = 15,4 dk = 924 sn
  Takt Time  = 72 sn
  
  Gerekli Operatör = 924 / 72 = 12,83 → 13 operatör
```

#### 5.3.2 Hat Dengeleme Kaybı

```
FORMÜL:
Dengeleme Kaybı (%) = (1 − Toplam SMV / (Operatör × Max CT)) × 100

Balancing Efficiency:
  BE = Toplam CT / (Operatör Sayısı × Max CT) × 100

Örnek:
  Operatör sayısı = 12
  Toplam CT       = 896 sn
  En yüksek CT    = 82 sn (darboğaz operasyonu)
  
  BE = 896 / (12 × 82) × 100 = 896 / 984 × 100 = %91,1
  Dengeleme Kaybı = %8,9
```

#### 5.3.3 Yamazumi Chart (Yük Analizi)

```
Her operasyon için:
  ┌──────────────────────────────────────────────────────┐
  │ OP-01  OP-02  OP-03  OP-04  OP-05  OP-06  OP-07    │
  │  ████   ████   █████  ████   ██████  ████   ████     │
  │  ████   ████   █████  ████   ██████  ████   ████     │
  │  ████   ████   █████  ████   ██████  ████   ████     │
  │  ────   ────   ─────  ────   ──────  ────   ────     │
  │                              ▲                        │
  │                        DARBOĞAZ                      │
  │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
  │ ─────────────── TAKT TIME (72 sn) ──────────────────│
  └──────────────────────────────────────────────────────┘

Hesaplama:
  Her çubuk: Operasyonun CT değeri
  Kırmızı çubuk: CT > Takt Time (darboğaz)
  Sarı çubuk:    CT = %80-100 Takt Time (risk)
  Yeşil çubuk:   CT < %80 Takt Time (normal)
```

---

### 5.4 Stok ve Akış Metrikleri

#### 5.4.1 WIP Hesabı

```
FORMÜL:
WIP Miktarı (adet) = CT_sonraki_operasyon × Üretim Hızı × Bekleme Süresi

veya Little's Law ile:
WIP = Verim (throughput) × Akış Süresi

WIP Değeri (TL):
  WIP Değeri = WIP Miktarı × Birim Maliyet

WIP Devir Hızı:
  Devir = Yıllık Üretim / Ortalama WIP
```

#### 5.4.2 Inventory Turnover

```
FORMÜL:
Stok Devir Hızı = Yıllık Satılan Malın Maliyeti / Ortalama Stok Değeri

Hedef: Devir hızı yükseldikçe lean uygulaması başarılı demektir.
```

---

### 5.5 Ortak İstasyon Hesaplamaları

Bu tekstil yazılımının en özgün kısmıdır.

#### 5.5.1 Ortak İstasyon Kapasite Paylaşımı

```
Senaryo: 1 Overlok makinesi → BANT-1 ve BANT-2 tarafından kullanılıyor

HESAPLAMA:
  Toplam kullanım süresi = Σ (Bant_i üretim miktarı × Overlok CT_i)
  
  Bant-1: 280 adet × 12 sn = 3.360 sn
  Bant-2: 220 adet × 15 sn = 3.300 sn
  Toplam = 6.660 sn = 111 dk

  Mevcut kapasite (vardiyada) = 420 dk × 1 makine = 420 dk
  
  Kullanım Oranı = 111 / 420 = %26,4 (kapasite yeterli)
  
Eğer Kullanım Oranı > %85 ise:
  → Darboğaz uyarısı tetiklenir
  → Ek makine ihtiyacı hesaplanır
  
  Gereken makine = ⌈Toplam kullanım / (420 × 0,85)⌉
```

#### 5.5.2 Ortak İstasyonda Bekleme Süresi

```
FORMÜL (Kuyruk Teorisi — M/D/1):
  Ortalama Bekleme Süresi = (Kullanım Oranı × İşlem Süresi) 
                            ───────────────────────────────
                            (2 × (1 − Kullanım Oranı))

Örnek:
  ρ (kullanım) = 0,80
  İşlem süresi = 12 sn
  
  Bekleme = (0,80 × 12) / (2 × 0,20) = 9,6 / 0,4 = 24 sn
```

#### 5.5.3 Model Değişim (Setup) Analizi

```
Her bant için model değişim kaydı:
  ┌──────────────────────────────────────────────────────┐
  │ Bant ID     : BANT-01                               │
  │ Model From  : Pantolon - Model XY                   │
  │ Model To    : Şort - Model PQ                       │
  │ Setup Süresi: 45 dk                                 │
  │ Üretim Kaybı: 45 / 420 = %10,7                      │
  │ Setup SMV Farkı: 15,4 → 12,8 dk (yeni model)       │
  └──────────────────────────────────────────────────────┘

Toplam Setup Kaybı (aylık):
  Setup Kaybı% = Σ(Setup Süreleri) / (Toplam Çalışma Süresi) × 100
```

---

### 5.6 Kalite Metrikleri

#### 5.6.1 DPMO ve Sigma Seviyesi

```
FORMÜL:
DPMO = (Hata Sayısı / (Birim Sayısı × Hata Fırsatı)) × 1.000.000

Sigma Seviyesi → DPMO dönüşüm tablosu:
  6 Sigma = 3,4 DPMO
  5 Sigma = 233 DPMO
  4 Sigma = 6.210 DPMO
  3 Sigma = 66.807 DPMO
  
Tekstil için tipik hata fırsatı sayısı:
  Bir pantolon için ~25 kontrol noktası vardır
```

#### 5.6.2 RPN — Risk Priority Number (FMEA)

```
RPN = Şiddet (S) × Oluşma (O) × Tespit Edilebilirlik (D)

Her hata modu için:
  S, O, D değerleri 1-10 arasında puanlanır
  
  RPN > 200 → Acil aksiyon gerekli
  RPN 100-200 → Önleyici aksiyon planla
  RPN < 100 → İzlemede tut

Örnek — Dikiş Kopması:
  S = 7 (ürün kullanılamaz)
  O = 4 (nadir görülür)
  D = 3 (kolayca fark edilir)
  RPN = 7 × 4 × 3 = 84
```

---

### 5.7 Çok Modelli Bant İçin Heijunka (Üretim Dengeleme)

```
FORMÜL:
Her model için günlük üretim hedefi:
  Heijunka Kutusu = Toplam Talep × (Model Talebi / Toplam Talep)

Örnek:
  Günlük toplam kapasite : 300 adet
  Model A talebi         : %60 → 180 adet
  Model B talebi         : %40 → 120 adet
  
  Karma üretim dizisi:
  A-A-A-B-B → A-A-A-B-B → ... (Takt Time sırasına göre)
  
  Model A Takt = 25.200 sn / 180 = 140 sn
  Model B Takt = 25.200 sn / 120 = 210 sn
```

---

## 6. VERİ MODELİ (VERİTABANI ŞEMASI)

### 6.1 Temel Tablolar

```sql
-- ATOLYE (Workshop)
CREATE TABLE workshops (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    location        VARCHAR(200),
    total_capacity  INT,           -- toplam operatör kapasitesi
    shift_count     SMALLINT DEFAULT 1,
    shift_duration  INT DEFAULT 480, -- dakika
    break_duration  INT DEFAULT 60,  -- dakika (tüm molalar)
    created_at      TIMESTAMP DEFAULT NOW()
);

-- BANTLAR (Production Lines)
CREATE TABLE production_lines (
    id              SERIAL PRIMARY KEY,
    workshop_id     INT REFERENCES workshops(id),
    name            VARCHAR(100) NOT NULL,
    line_type       VARCHAR(20) CHECK (line_type IN ('DEDICATED', 'FLEXIBLE', 'SHARED')),
    max_operators   INT,
    description     TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ORTAK İSTASYONLAR (Shared Stations)
CREATE TABLE shared_stations (
    id              SERIAL PRIMARY KEY,
    workshop_id     INT REFERENCES workshops(id),
    name            VARCHAR(100) NOT NULL,  -- "Overlok Bölümü"
    station_type    VARCHAR(50),             -- "OVERLOK", "UTU", "KALITE", "PAKET"
    machine_count   INT DEFAULT 1,
    operator_count  INT DEFAULT 1,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ORTAK İSTASYON — BANT İLİŞKİSİ
CREATE TABLE line_shared_station_mapping (
    id              SERIAL PRIMARY KEY,
    line_id         INT REFERENCES production_lines(id),
    station_id      INT REFERENCES shared_stations(id),
    usage_priority  SMALLINT DEFAULT 1,  -- 1=yüksek öncelik
    allocation_pct  DECIMAL(5,2),        -- kapasite payı %
    UNIQUE(line_id, station_id)
);

-- MODELLER (Product Models)
CREATE TABLE models (
    id              SERIAL PRIMARY KEY,
    workshop_id     INT REFERENCES workshops(id),
    model_code      VARCHAR(50) UNIQUE NOT NULL,
    model_name      VARCHAR(200) NOT NULL,
    category        VARCHAR(100),          -- "Pantolon", "Gömlek", vb.
    total_smv       DECIMAL(8,3),          -- dakika
    target_qty_day  INT,                   -- günlük hedef adet
    customer_name   VARCHAR(200),
    order_qty       INT,
    order_deadline  DATE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- BANT-MODEL ATAMALARI
CREATE TABLE line_model_assignments (
    id              SERIAL PRIMARY KEY,
    line_id         INT REFERENCES production_lines(id),
    model_id        INT REFERENCES models(id),
    assignment_date DATE NOT NULL,
    end_date        DATE,
    share_ratio     DECIMAL(5,2) DEFAULT 100.00, -- karma bantta % pay
    setup_time_min  INT DEFAULT 0,               -- model değişim süresi (dk)
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- OPERASYONLAR (Operations)
CREATE TABLE operations (
    id              SERIAL PRIMARY KEY,
    model_id        INT REFERENCES models(id),
    sequence_no     INT NOT NULL,
    operation_name  VARCHAR(200) NOT NULL,
    operation_type  VARCHAR(50),  -- "DIKIŞ", "OVERLOK", "UTU", "KONTROL", "PAKET"
    smv             DECIMAL(8,3) NOT NULL,        -- dakika
    machine_type    VARCHAR(100),
    is_shared_station BOOLEAN DEFAULT FALSE,
    shared_station_id INT REFERENCES shared_stations(id),
    allowance_pct   DECIMAL(5,2) DEFAULT 12.00,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- GÜNLÜK ÜRETİM KAYITLARI
CREATE TABLE daily_production (
    id              SERIAL PRIMARY KEY,
    line_id         INT REFERENCES production_lines(id),
    model_id        INT REFERENCES models(id),
    production_date DATE NOT NULL,
    shift_no        SMALLINT DEFAULT 1,
    target_qty      INT NOT NULL,
    actual_qty      INT DEFAULT 0,
    defect_qty      INT DEFAULT 0,
    rework_qty      INT DEFAULT 0,
    operator_count  INT,
    working_minutes INT,
    downtime_minutes INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- OPERASYON ÖLÇÜM KAYITLARI (Zaman Etüdü)
CREATE TABLE operation_measurements (
    id              SERIAL PRIMARY KEY,
    operation_id    INT REFERENCES operations(id),
    line_id         INT REFERENCES production_lines(id),
    measured_at     TIMESTAMP DEFAULT NOW(),
    cycle_time_sec  DECIMAL(10,3),  -- saniye
    operator_id     INT,
    observer_name   VARCHAR(100),
    notes           TEXT
);

-- WIP KAYITLARI
CREATE TABLE wip_records (
    id              SERIAL PRIMARY KEY,
    line_id         INT REFERENCES production_lines(id),
    model_id        INT REFERENCES models(id),
    operation_id    INT REFERENCES operations(id),  -- hangi operasyondan önce
    recorded_at     TIMESTAMP DEFAULT NOW(),
    wip_qty         INT NOT NULL,
    wip_value_tl    DECIMAL(12,2)
);

-- VSM SNAPSHOT (Harita Kayıtları)
CREATE TABLE vsm_snapshots (
    id              SERIAL PRIMARY KEY,
    workshop_id     INT REFERENCES workshops(id),
    snapshot_name   VARCHAR(200),
    snapshot_type   VARCHAR(20) CHECK (snapshot_type IN ('CURRENT', 'FUTURE')),
    snapshot_date   DATE NOT NULL,
    snapshot_data   JSONB,          -- tüm harita verisi JSON olarak
    calculated_metrics JSONB,       -- hesaplanan metrikler
    created_by      VARCHAR(100),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- KAIZEN AKSİYON PLANI
CREATE TABLE kaizen_actions (
    id              SERIAL PRIMARY KEY,
    vsm_snapshot_id INT REFERENCES vsm_snapshots(id),
    action_title    VARCHAR(300) NOT NULL,
    action_type     VARCHAR(50),   -- "DARBOĞAZ_GİDERME", "WIP_AZALTMA", vb.
    target_metric   VARCHAR(100),
    current_value   DECIMAL(12,3),
    target_value    DECIMAL(12,3),
    responsible     VARCHAR(200),
    due_date        DATE,
    status          VARCHAR(20) DEFAULT 'PLANNED',  -- PLANNED, IN_PROGRESS, DONE
    created_at      TIMESTAMP DEFAULT NOW()
);
```

---

## 7. YAZILIM MİMARİSİ

### 7.1 Genel Mimari (Layered Architecture)

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ VSM Harita   │  │  Dashboard   │  │  Hesaplama Raporları│  │
│  │ Editörü      │  │  (KPI)       │  │  & Yamazumi Chart   │  │
│  └──────────────┘  └──────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │ REST API / WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND (Node.js / Python)               │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │  VSM Engine    │  │  Calc Engine   │  │   Report Engine  │  │
│  │  (Harita CRUD) │  │  (Formüller)   │  │   (PDF/Excel)    │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │  Line Manager  │  │  Kaizen Tracker│  │  Auth & Tenant   │  │
│  │  (Bant Yönt.)  │  │  (Aksiyon)     │  │  Management      │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     VERİTABANI (PostgreSQL)                     │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 VSM Hesaplama Motoru — Akış

```
INPUT:
  - Bant tanımları
  - Model operasyon listesi (SMV'lerle)
  - Günlük üretim verisi
  - WIP ölçümleri
  - Ortak istasyon paylaşım oranları

HESAPLAMA AKIŞI:
  1. Net Kullanılabilir Süre → 
  2. Takt Time (her bant için) →
  3. Her operasyon için ACT hesabı →
  4. Yamazumi Chart verisi →
  5. Darboğaz tespiti (CT > TT olanlar) →
  6. WIP → ILT hesabı →
  7. Toplam Lead Time →
  8. VA / NVA ayrımı →
  9. PCE hesabı →
  10. Hat Verimliliği →
  11. OEE →
  12. Ortak istasyon kullanım oranları →
  13. Hat Dengeleme önerileri →

OUTPUT:
  - VSM JSON verisi (harita için)
  - KPI metrikleri
  - Darboğaz raporu
  - Kaizen önerileri
```

### 7.3 REST API Endpoint Listesi

```
# BANT YÖNETİMİ
GET    /api/v1/workshops/:id/lines          → Tüm bantları listele
POST   /api/v1/lines                        → Yeni bant oluştur
PUT    /api/v1/lines/:id                    → Bant güncelle
GET    /api/v1/lines/:id/current-model      → Banttaki aktif model

# MODEL YÖNETİMİ  
GET    /api/v1/models                       → Model listesi
POST   /api/v1/models                       → Yeni model ekle
GET    /api/v1/models/:id/operations        → Modelin operasyonları
POST   /api/v1/models/:id/operations        → Operasyon ekle

# ÜRETİM VERİLERİ
POST   /api/v1/production/daily             → Günlük üretim kaydet
GET    /api/v1/production/line/:id/today    → Bugünkü üretim
POST   /api/v1/wip/record                   → WIP ölç

# VSM HESAPLAMALAR
GET    /api/v1/vsm/line/:id/metrics         → Bant VSM metrikleri
GET    /api/v1/vsm/line/:id/takt-time       → Takt Time hesabı
GET    /api/v1/vsm/line/:id/yamazumi        → Yamazumi chart verisi
GET    /api/v1/vsm/line/:id/bottlenecks     → Darboğaz analizi
GET    /api/v1/vsm/workshop/:id/overview    → Atölye genel görünümü

# ORTAK İSTASYON
GET    /api/v1/shared-stations/:id/utilization  → Kullanım analizi
GET    /api/v1/shared-stations/:id/queue-time   → Bekleme süresi

# VSM SNAPSHOT / HARITA
POST   /api/v1/vsm/snapshot                    → Harita kaydet
GET    /api/v1/vsm/snapshots/workshop/:id       → Harita geçmişi
GET    /api/v1/vsm/compare/:id1/:id2            → İki haritayı karşılaştır

# RAPORLAR
GET    /api/v1/reports/efficiency/line/:id      → Hat verimlilik raporu
GET    /api/v1/reports/waste-analysis/:id       → Atık analizi raporu
GET    /api/v1/reports/oee/workshop/:id         → OEE raporu
POST   /api/v1/reports/export/pdf              → PDF export
```

---

## 8. MODÜLLER VE ÖZELLİKLER

### 8.1 Modül 1: Atölye Kurulum Modülü

**Yapılandırma:**
- Atölye temel bilgileri (vardiya, mola, kapasite)
- Bantların tanımlanması (tip, operatör sayısı)
- Ortak istasyonların tanımlanması
- Bant ↔ Ortak istasyon bağlantılarının kurulması

**Özellikler:**
- Sürükle-bırak ile bant düzeni oluşturma
- Ortak istasyon kapasite simulasyonu
- Vardiya planı entegrasyonu

### 8.2 Modül 2: Model / SMV Yönetimi

**Yapılandırma:**
- Model operasyon listesi girişi
- Her operasyon için SMV tanımı
- Makine tipi eşleştirme
- Ortak istasyon operasyonu işaretleme

**Özellikler:**
- SMV import (Excel'den)
- Operasyon sıralaması (drag & drop)
- Alternatif operasyon rotaları
- Model versiyonlama (model revizyonları)

### 8.3 Modül 3: VSM Harita Editörü

**Görsel Özellikler:**
- Tam ekran interaktif kanvas
- Standart VSM sembolleri kütüphanesi
- Sürükle-bırak ile sembol yerleştirme
- Otomatik bağlantı çizgisi
- Veri kutularının gerçek zamanlı güncellenmesi
- Zaman çizelgesi (timeline) otomatik çizimi

**Harita Özellikleri:**
- Mevcut Durum Haritası modu
- Gelecek Durum Haritası modu
- Kaizen patlaması (burst) ekleme
- Harita annotation (notlar)
- PNG / SVG / PDF export

**Çok Bantlı Görünüm:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🏭 ANA KONFEKSIYON ATÖLYESİ — VSM GÖRÜNÜMÜ                │
├─────────────────────────────────────────────────────────────┤
│  [KESIMHANE] ──────────────────────────────────────────┐    │
│                                                        ↓    │
│  BANT-1: [Op1]→[Op2]→[Op3]──────────────────────[SON] │    │
│                                    ↕ paylaşım          │    │
│  BANT-2: [Op1]→[Op2]──→[ORTAK OVERLOK]→[Op4]→[SON]   │    │
│                                    ↕ paylaşım          │    │
│  BANT-3: [Op1]→[Op2]→[Op3]────────────────────[SON]   │    │
│                                                        │    │
│  [ORTAK KALİTE KONTROL] ───────────────────────────────┘    │
│  [SEVKIYAT]                                                  │
└─────────────────────────────────────────────────────────────┘
```

### 8.4 Modül 4: Günlük Veri Giriş Modülü

**Girdi Ekranları:**
- Hızlı üretim girişi (her bant için tablet/mobil uyumlu)
- WIP sayım girişi (operasyonlar arası)
- Duruş kaydı (planlı/plansız, nedeniyle)
- Kalite kaydı (hata tipi, miktar)
- Zaman etüdü kayıt ekranı (operasyon CT ölçümü)

**Otomasyonlar:**
- Takt Time ile anlık CT karşılaştırma uyarısı
- WIP eşiği aşıldığında alarm
- Günlük hedefin %80'i altındaysa uyarı push notification

### 8.5 Modül 5: Hesaplama ve Analiz Motoru

Bu modül arka planda sürekli çalışır:

| Hesaplama | Frekans | Tetikleyici |
|-----------|---------|-------------|
| Takt Time | Gerçek zamanlı | Vardiya başlangıcında |
| Hat Verimliliği | Her 30 dk | Yeni üretim kaydında |
| OEE | Günlük | Vardiya kapanışında |
| PCE | Snapshot alındığında | Manuel tetik |
| Darboğaz Analizi | Her veri güncellemesinde | Otomatik |
| Ortak İstasyon Kullanımı | Saatlik | Zaman tabanlı |

### 8.6 Modül 6: Kaizen Takip Modülü

- İyileştirme fırsatı tanımlama
- Sorumluluk atama
- Hedef metrik belirleme
- Durum takibi (Planlı → Devam ediyor → Tamamlandı)
- Before/After metrik karşılaştırması

---

## 9. VSM SEMBOL SETİ (TEKSTİL ÖZEL)

### 9.1 Üretim Süreci Sembolleri

```
STANDART VSM SEMBOLLERİ + TEKSTİL EKLERİ:

[📦] Tedarikçi / Kumaş ambarı
[🏭] Proses kutusu (operasyon istasyonu)
[📊] Veri kutusu (CT, Makine, Operatör, WIP, Uptime)
[📦↔📦] Stok (WIP üçgeni)
[→→→] İtme (push) oku
[⟵] Çekme (pull) oku
[💥] Kaizen patlaması (iyileştirme noktası)
[⚡] Darboğaz uyarısı
[🔗] Ortak istasyon bağlantısı (bu yazılıma özel)
[🔀] Model değişim noktası (bu yazılıma özel)

TEKSTİL'E ÖZEL İSTASYON İKONLARI:
  ✂️  Kesimhane
  🧵  Dikiş makinesi
  🔄  Overlok makinesi
  ♨️  Ütü
  🔘  Düğme / Aksesuar
  🔍  Kalite kontrol
  📦  Paketleme
  🚚  Sevkiyat
```

### 9.2 Veri Kutusu Formatı

```
┌─────────────────────────────────────────────────────┐
│          BANT-01 / OPERASYON 3 — YAKA DİKİŞİ       │
├──────────────────────┬──────────────────────────────┤
│ CT      : 52 sn      │ Makine Tipi: Düz Dikiş M.   │
│ SMV     : 0,87 dk    │ Makine Sayısı: 1            │
│ Uptime  : %93        │ Operatör Sayısı: 1          │
│ Setup   : 8 dk       │ WIP (önde): 18 adet         │
├──────────────────────┴──────────────────────────────┤
│ Takt Time: 72 sn    │ DURUM: ✅ Normal (CT < TT)   │
│ ILT: 21,6 dk        │ Hat Dengesi: %72,2           │
└─────────────────────────────────────────────────────┘
```

---

## 10. RAPORLAMA VE KPI DASHBOARD

### 10.1 Atölye Genel Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│  🏭 ATÖLYE GÜNLÜK ÖZET — 15.04.2026                                │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│  BANT-1      │  BANT-2      │  BANT-3      │  ATÖLYE TOPLAM         │
│  ──────────  │  ──────────  │  ──────────  │  ──────────────────    │
│  Verimlilik  │  Verimlilik  │  Verimlilik  │  Ort. Verimlilik       │
│   %85,6      │   %78,3      │   %91,2      │   %85,0                │
│  ──────────  │  ──────────  │  ──────────  │                        │
│  OEE: %88,5  │  OEE: %82,1  │  OEE: %90,3  │  Toplam Üretim         │
│  ──────────  │  ──────────  │  ──────────  │  850 / 1.000 adet      │
│  280 / 300   │  270 / 350   │  300 / 350   │                        │
│  adet        │  adet        │  adet        │  WIP Toplam: 127 adet  │
│  ──────────  │  ──────────  │  ──────────  │  Hata Oranı: %2,1     │
│  ⚠️ Darboğaz │  ✅ Normal   │  ✅ Normal   │  PCE: %5,8             │
│  Op-5: 78sn  │              │              │                        │
└──────────────┴──────────────┴──────────────┴────────────────────────┘

ORTAK İSTASYON DURUMU:
  ♨️ Ütü Bölümü:     Kullanım %73 ✅  │  Bekleme: 12 dk
  🔄 Overlok:         Kullanım %89 ⚠️  │  Bekleme: 48 dk
  🔍 Kalite Kontrol:  Kullanım %61 ✅  │  Bekleme: 8 dk
```

### 10.2 Raporlar Listesi

| Rapor Adı | Periyot | İçerik |
|-----------|---------|--------|
| **Hat Verimlilik Raporu** | Günlük/Haftalık | Her bant için verimlilik trendi |
| **OEE Raporu** | Günlük/Aylık | Kullanılabilirlik, Performans, Kalite |
| **Darboğaz Analizi** | Anlık | CT > TT olan operasyonlar |
| **Atık Analizi Raporu** | Haftalık | 8 atık kategorisi dağılımı |
| **WIP Raporu** | Günlük | Bantlar arası stok durumu |
| **Model Karşılaştırma** | Model bazlı | SMV, verimlilik, hata oranı karşılaştırması |
| **Ortak İstasyon Kullanım** | Günlük | Kapasite yük dağılımı |
| **Kaizen İlerleme Raporu** | Aylık | Aksiyon planı tamamlanma oranları |
| **VSM Before/After** | Proje bazlı | İki snapshot karşılaştırması |
| **Trend Analizi** | Aylık | 3-6 aylık KPI trendleri |

---

## 11. GELECEK DURUM HARİTASI (FUTURE STATE)

### 11.1 Otomatik İyileştirme Önerileri

Yazılım, mevcut durum haritasını analiz ederek otomatik önerileri aşağıdaki kurallara göre üretir:

```
KURAL 1 — DARBOĞAZ TESPİTİ:
  EĞER herhangi_operasyon.CT > takt_time:
    → Öner: "Operasyonu ikiye böl (iki operatör)"
    VEYA → Öner: "Yardımcı makine ekle"
    VEYA → Öner: "Takt Time artır (üretim hızını ayarla)"

KURAL 2 — YÜKSEK WIP:
  EĞER wip_qty > (3 × takt_time / ortalama_CT):
    → Öner: "Operasyonlar arası WIP üst sınırı belirle"
    → Öner: "FIFO akışına geç"
    → Öner: "Kanban kartı uygula"

KURAL 3 — DÜŞÜK PCE:
  EĞER pce < 0.15:
    → Öner: "Hat akışını sürekli akışa (continuous flow) çevir"
    → Öner: "Supermarket çekme sistemi kur"

KURAL 4 — ORTAK İSTASYON AŞIRI YÜKÜ:
  EĞER shared_station.utilization > 0.85:
    → Öner: "Ek makine/operatör ata"
    → Öner: "Kapasiteyi bantlar arası yeniden dağıt"

KURAL 5 — DÜŞÜK BANT DENGELEMESİ:
  EĞER balancing_efficiency < 0.80:
    → Öner: "Yük dengeleme yapılsın (Yamazumi bazlı)"
    → Öner: "Bazı operasyonları birleştir veya böl"
```

### 11.2 Senaryo Simülasyonu

```
SENARYO MOTORu:
  Kullanıcı şu parametreleri değiştirebilir:
    - Operatör sayısı
    - Makine sayısı
    - SMV değerleri (iyileştirme sonrası)
    - Vardiya süresi
    - Ortak istasyon kapasitesi
    
  Sistem anlık olarak hesaplar:
    - Yeni Takt Time
    - Yeni Hat Verimliliği
    - Yeni OEE tahmini
    - Yeni PCE
    - Kapasite artışı/azalışı
    - Yatırım geri dönüş tahmini (ROI)
```

---

## 12. TEKNOLOJİ STACK ÖNERİSİ

### 12.1 Önerilen Stack

| Katman | Teknoloji | Gerekçe |
|--------|-----------|---------|
| **Frontend** | React 18 + TypeScript | Component tabanlı, tip güvenli |
| **UI Kütüphanesi** | Ant Design veya MUI | Profesyonel veri tabloları |
| **VSM Canvas** | React Flow veya Konva.js | İnteraktif diyagram editörü |
| **Grafik/Chart** | Recharts + D3.js | Yamazumi chart için |
| **Backend** | Node.js (Express) veya Python (FastAPI) | Hızlı API geliştirme |
| **Veritabanı** | PostgreSQL 15 | JSONB desteği (VSM snapshot) |
| **Cache** | Redis | Gerçek zamanlı metrik cache |
| **Auth** | JWT + bcrypt | Güvenli kimlik doğrulama |
| **PDF Export** | Puppeteer veya pdfkit | VSM harita PDF export |
| **Excel** | xlsx (npm) veya openpyxl | SMV import/export |
| **Real-time** | Socket.io veya WebSocket | Anlık KPI güncellemeleri |
| **Deployment** | Docker + nginx | Kolay deploy |

### 12.2 Geliştirme Klasör Yapısı

```
tekstil-vsm/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── vsm/
│   │   │   │   ├── VsmCanvas.tsx          ← Ana harita kanvası
│   │   │   │   ├── VsmNode.tsx            ← Operasyon kutusu
│   │   │   │   ├── VsmDataBox.tsx         ← Veri kutusu
│   │   │   │   ├── VsmTimeline.tsx        ← Zaman çizelgesi
│   │   │   │   └── VsmSharedStation.tsx   ← Ortak istasyon
│   │   │   ├── charts/
│   │   │   │   ├── YamazumiChart.tsx      ← Yük dengesi grafiği
│   │   │   │   ├── OeeChart.tsx
│   │   │   │   └── TrendChart.tsx
│   │   │   ├── dashboard/
│   │   │   └── forms/
│   │   ├── services/
│   │   │   ├── vsmCalculations.ts         ← Tüm VSM formülleri
│   │   │   ├── bottleneckDetector.ts      ← Darboğaz analizi
│   │   │   └── futureStateGenerator.ts   ← Öneri motoru
│   │   └── pages/
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── vsm.service.ts
│   │   │   ├── calculations.service.ts   ← Tüm VSM formülleri
│   │   │   ├── sharedStation.service.ts  ← Ortak istasyon
│   │   │   └── report.service.ts
│   │   ├── models/                        ← DB modelleri
│   │   └── migrations/                    ← DB migration
│
├── database/
│   ├── schema.sql
│   ├── seed/                              ← Örnek veri
│   └── migrations/
│
└── docs/
    ├── api/                               ← Swagger/OpenAPI
    └── calculations/                      ← Bu döküman
```

---

## 13. GELİŞTİRME YOL HARİTASI

### Faz 1: Temel Altyapı (0-2. Ay)

- [ ] Veritabanı şeması kurulumu
- [ ] Bant, model, operasyon CRUD API'leri
- [ ] Temel VSM hesaplama motoru (Takt Time, CT, Hat Verimliliği)
- [ ] Basit web arayüzü (form tabanlı veri girişi)
- [ ] Günlük üretim kayıt ekranı

### Faz 2: VSM Görselleştirme (3-4. Ay)

- [ ] İnteraktif VSM harita editörü (React Flow entegrasyonu)
- [ ] Standart VSM sembol kütüphanesi
- [ ] Çok bantlı harita görünümü
- [ ] Ortak istasyon bağlantı gösterimi
- [ ] Zaman çizelgesi (timeline) otomatik çizimi
- [ ] Yamazumi Chart modülü

### Faz 3: İleri Analitik (5-6. Ay)

- [ ] OEE hesaplama ve raporlama
- [ ] PCE ve atık analizi
- [ ] Darboğaz tespit ve uyarı sistemi
- [ ] Ortak istasyon kuyruk analizi
- [ ] Model değişim (setup) yönetimi
- [ ] DPMO ve Sigma seviyesi

### Faz 4: Gelecek Durum & Kaizen (7-8. Ay)

- [ ] Gelecek Durum Haritası modu
- [ ] Senaryo simülasyon motoru
- [ ] Otomatik iyileştirme önerileri
- [ ] Kaizen aksiyon takip modülü
- [ ] VSM snapshot karşılaştırma (Before/After)

### Faz 5: Raporlama ve Entegrasyon (9-10. Ay)

- [ ] PDF/Excel rapor export
- [ ] KPI Dashboard (tüm atölye özeti)
- [ ] Trend analizi grafikleri
- [ ] Mobil uyumlu veri giriş ekranı
- [ ] Excel SMV import
- [ ] E-posta rapor zamanlama

### Faz 6: İleri Özellikler (11-12. Ay)

- [ ] Çok atölye (multi-tenant) desteği
- [ ] Fason atölye karşılaştırma
- [ ] Heijunka (üretim dengeleme) modülü
- [ ] API entegrasyon (ERP / barkod sistemleri)
- [ ] Makine öğrenimi ile anomali tespiti

---

## EK A: ÖRNEK VSM METRİK ÇIKTI (JSON)

```json
{
  "vsm_snapshot": {
    "id": 42,
    "workshop": "Ana Konfeksiyon Atölyesi",
    "date": "2026-04-15",
    "type": "CURRENT",
    "lines": [
      {
        "line_id": 1,
        "line_name": "Pantolon Bandı",
        "model": "5 Cep Pantolon - XY",
        "metrics": {
          "takt_time_sec": 72,
          "total_smv_min": 15.4,
          "target_qty": 350,
          "actual_qty": 280,
          "line_efficiency_pct": 85.6,
          "oee_pct": 88.5,
          "lead_time_min": 285,
          "value_added_time_min": 15.4,
          "non_value_added_time_min": 269.6,
          "pce_pct": 5.4,
          "total_wip": 127,
          "defect_rate_pct": 2.1,
          "bottleneck_operation": {
            "operation_id": 5,
            "name": "Kemer Takma",
            "cycle_time_sec": 78,
            "excess_sec": 6
          }
        },
        "operations": [
          {
            "seq": 1,
            "name": "Ön Parça Dikişi",
            "cycle_time_sec": 45,
            "smv_min": 0.75,
            "wip_before": 8,
            "ilt_min": 9.6,
            "status": "NORMAL"
          }
        ]
      }
    ],
    "shared_stations": [
      {
        "station_id": 1,
        "name": "Overlok Bölümü",
        "utilization_pct": 89.2,
        "avg_queue_time_min": 48,
        "status": "WARNING"
      }
    ],
    "workshop_totals": {
      "total_lines": 3,
      "total_production": 850,
      "avg_line_efficiency_pct": 85.0,
      "avg_oee_pct": 86.9,
      "total_wip": 312
    }
  }
}
```

---

## EK B: HESAPLAMA REFERANS TABLOSU

| Metrik | Formül | Birim | Benchmark |
|--------|--------|-------|-----------|
| Takt Time | Net Süre / Talep | sn/adet | Müşteri bazlı |
| Cycle Time | Ölçüm / Birim | sn | < Takt Time |
| Lead Time | ΣPT + ΣILT | dk/gün | Minimize et |
| PCE | VA / LT × 100 | % | > %15 |
| Hat Verimliliği | SMV×Üretim / (Dk×Op) × 100 | % | > %80 |
| OEE | A × P × Q | % | > %85 |
| WIP | Little's Law: R × T | adet | Minimize et |
| Darboğaz | CT > TT operasyonlar | — | CT ≤ TT |
| Balancing Eff. | ΣCT / (N × MaxCT) × 100 | % | > %85 |
| Setup Kaybı | ΣSetup / ΣÇalışma × 100 | % | < %5 |
| Kalite (Q) | (Toplam − Hatalı) / Toplam | % | > %98 |
| DPMO | Hata / (Adet × Fırsat) × 1M | — | < 6.210 (4σ) |

---

*Bu döküman yaşayan bir belgedir. Yazılım geliştikçe güncellenecektir.*

**Son güncelleme:** Nisan 2026  
**Hazırlayan:** VSM Yazılım Ekibi  
**Metodoloji kaynakları:** Rother & Shook (Learning to See), Lean Enterprise Institute, Six Sigma DMAIC
