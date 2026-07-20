---
title: "Konfeksiyon Atölyeleri için Temel Performans Göstergeleri (KPI) — Literatür Taraması ve Ontolojik Sözlük"
type: reference
domain: garment-manufacturing / industrial-engineering / lean-six-sigma
language: en-primary, tr-secondary
status: draft
last_updated: 2026-05-07
---

# Konfeksiyon Atölyeleri için Temel Performans Göstergeleri (KPI)
**Literatür Taraması, Tanımlamalar, Hesaplamalar ve Ontolojik Sözlük**

> Bu doküman; konfeksiyon (apparel/garment manufacturing) sektöründe kullanılan KPI'ların **birincil literatürü İngilizce terminoloji** üzerinden ele alır, Türkçe karşılıkları ikinci planda verir, ve kendi çalışmalarınla (çok-atölye verimlilik değerlendirme platformu, CMT eder maliyet hesaplayıcı) **ontolojik bir bağ** kurar. Ayrıca literatürde sık karıştırılan **efficiency vs effectiveness vs productivity** ayrımının doğru kullanımına odaklanır.

---

## 0. TL;DR — Sorduğun Kritik Soru

> **"Gerçekleşen üretim / Hedeflenen üretim" literatürde verimlilik (efficiency) midir, etkililik (effectiveness) midir?**

**Kısa cevap: Bu oran kavramsal olarak *EFFECTIVENESS* (etkililik) ölçüsüdür, *efficiency* (verimlilik) değil.**

Daha doğrusu, literatürde bu spesifik orana ayrı bir isim verilmiştir:

```
Production Attainment (Üretim Hedefine Ulaşma) = (Actual Output / Target Output) × 100
                                              = Schedule Attainment / Plan Attainment
```

- **Effectiveness** klasik tanımıyla (Drucker, 1963/1974): *"Doing the right things"* — **hedefe ulaşma**, çıktının amaçla uyumu. Formül: `Output / Goal`.
- **Efficiency** klasik tanımıyla: *"Doing things right"* — **kaynak kullanım kalitesi**. Formül: `Output / Input` veya `Standard Time / Actual Time`.

**Konfeksiyon sektöründeki kafa karışıklığı şuradan kaynaklanır:** Sektörde "Line Efficiency" denilen metrik aslında doğru bir efficiency ölçüsüdür (`Earned SAM / Available Minutes`), ama saha dilinde "verimlilik %75'e düştü" denildiğinde çoğunlukla `Gerçekleşen / Hedef` kastedilir — ki bu teknik olarak *attainment / effectiveness*'tir.

**Kendi platformun için tavsiye:** İki farklı metriği iki farklı isimle ayır:
- `Line Efficiency` (Hat Verimliliği) → `(Üretilen × SAM) / (Operatör × Vardiya × 60)` — kaynak verimliliği
- `Target Attainment` (Hedef Tutturma Oranı) → `Gerçekleşen / Hedef` — etkililik

Detaylı türetim aşağıda **§2** ve **§9.2**'de.

---

## 1. Performance Measurement — Kavramsal Çerçeve

### 1.1 Üç Temel Kavram

Üretim/operasyon performans literatüründe **birbirine yakın ama farklı** üç temel kavram vardır:

| Kavram (EN) | Türkçe | Soru | Formül Şablonu |
|---|---|---|---|
| **Effectiveness** | Etkililik | "Doğru şeyi mi yapıyoruz?" — Hedefe ulaştık mı? | `Output / Goal` |
| **Efficiency** | Verimlilik | "Doğru yapıyor muyuz?" — Kaynakları iyi mi kullanıyoruz? | `Output / Input` veya `Standard / Actual` |
| **Productivity** | Üretkenlik | "Ne kadar üretiyoruz?" — Birim girdi başına çıktı | `Total Output / Total Input` (mutlak değer) |

> **Drucker'ın klasik formülasyonu (1974, *Management: Tasks, Responsibilities, Practices*):**
> *Efficiency is concerned with doing things right. Effectiveness is doing the right things.*
> Drucker'a göre **effectiveness, success'in temelidir; efficiency ise success kazanıldıktan sonra hayatta kalmanın minimum koşuludur.**

### 1.2 Üretim/Operasyon Bağlamında Ayrım

OEE Academy'nin (oee.academy) aktardığı şekliyle:

- **Effectiveness:** Belirli bir zaman diliminde teorik maksimum iyi-çıktıya karşı **gerçekleşen iyi-çıktı**. Kaynak miktarını dikkate almaz; sadece sonucu ölçer.
- **Efficiency:** Sonucu elde etmek için **bağlanan kaynak miktarı**. Aynı çıktı daha az kaynakla elde edilirse efficiency artar.
- **Productivity:** Effectiveness ile efficiency'nin **kombinasyonu** — daha az çabayla daha çok elde etme.

```
Productivity = f(Effectiveness, Efficiency)
```

### 1.3 Konfeksiyon Sahasında Bu Ayrım Neden Bulanıklaşır?

1. **"Efficiency" terimi sektörde geniş tanımlı kullanılır.** Saha mühendisleri "line efficiency" derken çoğu zaman `(Earned Minutes / Attended Minutes)` formülünü kullanır — ki bu doğru bir efficiency ölçüsüdür. Ama operatör başına "verim %80" denildiğinde aynı operatör için bazen `actual pieces / target pieces` da kastedilir.
2. **SAM bir "input" mı, "standard"mı?** SAM dakikası teorik standardı temsil eder, dolayısıyla efficiency formülünün payında *earned standard time*, paydasında *attended actual time* yer alır. Bu klasik **standard-to-actual** verimlilik tanımıyla uyumludur.
3. **Brand/buyer raporlamalarında karışıklık.** Bazı buyer'lar "efficiency" altında attainment'ı, bazıları true efficiency'yi raporlar.

---

## 2. Production Attainment — "Gerçekleşen / Hedef" Oranının Doğru Adı

### 2.1 Tanım

**Production Attainment** (Üretim Hedefine Ulaşma Oranı), bir üretim biriminin hedeflediği üretim miktarına ne kadar yaklaştığını ölçer. OpsDog tanımıyla *Production Attainment measures the degree to which the Manufacturing function is capable of reaching its targeted production output.*

### 2.2 Formül

```
Production Attainment (%) = (Actual Production Output / Target Production Output) × 100
```

### 2.3 Eş Anlamlılar (Literatürde)

| Terim | Bağlam |
|---|---|
| Production Attainment | Genel imalat |
| Schedule Attainment | Planlama, ERP, MRP bağlamı |
| Plan Adherence | Lean / Toyota terminolojisi |
| Target Achievement Rate | Apparel KPI raporları |
| **Hedef Tutturma Oranı / Hedefe Ulaşma %** | Türkçe |

### 2.4 Neden Effectiveness?

Çünkü payda **input/kaynak değil, planlanan/istenen sonuçtur**. Drucker'ın "doğru şeyi yapma" tanımı; çıktının istenen sonuçla karşılaştırılmasıdır. Bu yüzden:

- Eğer üretim hattı 480 dakikada 500 parça yapması gerekirken 400 parça yaparsa, **attainment = %80**.
- Aynı 400 parçayı kaç operatörle, kaç dakikada yaptığını sormuyoruz; **sadece hedefe ne kadar yaklaştığımıza bakıyoruz**.
- Aynı hat 800 parça hedefini düşürerek 400 parçaya çekilseydi, attainment %100 olur ama gerçek verimlilik düşmüştür.

### 2.5 Effectiveness ile Efficiency'nin Birlikte Çarpıldığı Tek Yer: OEE

**OEE (Overall Equipment Effectiveness)** üç bileşenin çarpımıdır ve bu yapı tam olarak **effectiveness × efficiency** dekompozisyonunu yansıtır:

```
OEE = Availability × Performance × Quality
       └────────┘   └─────────┘  └─────┘
       efficiency    efficiency    effectiveness
       (zaman)       (hız)         (kalite)
```

OEE'nin orijinal adında "Effectiveness" geçmesi, üç bileşenin de hedef-temelli olmasıdır: planlanan üretim zamanı içinde hedeflenen iyi-parça çıktısına ulaşma oranı.

---

## 3. Konfeksiyon KPI Taksonomisi — Literatür Sentezi

Onlineclothingstudy (Prasanta Sarkar) ve LinkedIn / Textile Learner / Apparel Resources kaynakları üzerinden yapılan sentezde, konfeksiyon KPI'ları **3 katmanlı** bir hiyerarşiye yerleşir:

### 3.1 Factory-Level KPIs (Fabrika Seviyesi)

| # | KPI (EN) | KPI (TR) | Tip |
|---|---|---|---|
| 1 | Line / Factory Efficiency | Hat / Fabrika Verimliliği | Efficiency |
| 2 | Man-to-Machine Ratio | İnsan-Makine Oranı | Resource use |
| 3 | Cut-to-Ship Ratio | Kesim-Sevkiyat Oranı | Loss / Yield |
| 4 | Order-to-Ship Ratio | Sipariş-Sevkiyat Oranı | Fulfilment |
| 5 | On-Time Delivery (OTD) Rate | Zamanında Teslimat Oranı | Effectiveness |
| 6 | Right First Time (RFT) | İlk Seferde Doğru | Quality |
| 7 | Quality Performance / DHU | Kalite Performansı / 100'de Hata | Quality |
| 8 | Lost Time Percentage | Kayıp Zaman Oranı | Efficiency loss |
| 9 | Worker Absenteeism Rate | İşçi Devamsızlık Oranı | HR |
| 10 | Employee Turnover Rate | İşçi Çıkış Oranı | HR |

### 3.2 Department-Level KPIs

**Cutting Department (Kesim)**
- Marker Efficiency — Pastal Verimliliği
- Fabric Utilization — Kumaş Kullanım Oranı
- Labour Cost per Piece — Adet Başı İşçilik Maliyeti

**Sewing Department (Dikim)**
- Line Efficiency — Hat Verimliliği
- Lost Time % — Kayıp Zaman %
- DHU (Defects per Hundred Units) — Yüz Adetteki Hata
- % Defective Level — Hatalı Yüzdesi
- Man-to-Machine Ratio
- Labour Productivity — İşçi Üretkenliği

**Finishing / QC**
- Final Audit Pass Rate
- AQL Pass / Fail Rate
- Reinspection / Rework %

### 3.3 Operator-Level KPIs

- Operator Efficiency
- Operator Performance (Performance Rating)
- Operator Utilization

---

## 4. Zaman-Temelli Metrikler — Apparel IE'nin Çekirdek Sözlüğü

Bu, sektörün **endüstri mühendisliği (IE)** çekirdeğidir ve senin CMT eder hesaplayıcının matematiksel temelidir.

### 4.1 SAM / SMV — Standard Allowed Minute / Standard Minute Value

**Tanım (ILO Work Study, klasik):** Standart yöntemle, normal şartlarda, niteliklerine sahip bir operatörün, bir operasyonu tamamlaması için **kabul edilen standart süre**.

**Hesaplama:**

```
Observed Time     → kronometre ile gözlem (dakika)
Performance Rate  → operatörün hıza göre derecelendirmesi (örn. 100% standart, 120% hızlı)
Basic Time        = Observed Time × Performance Rating
Allowance %       → kişisel + yorgunluk + makine arızası + bundle handling (genellikle 15–25%)

SAM = Basic Time × (1 + Allowance%)
    = Basic Time + Bundle Allowance + Personal & Machine Allowance
```

**Örnek (textileLearner.net):**
- Observed Time: 0.5 dk, Performance Rating: 120%, Allowance: 20%
- Basic Time = 0.5 × 1.20 = 0.6 dk
- Allowance = 0.6 × 0.20 = 0.12 dk
- **SAM = 0.72 dk**

**SAM vs SMV:** Pratikte aynı kavram; SAM Amerikan literatüründe, SMV Avrupa literatüründe yaygındır. Bazı firmalar SMV'yi *cost factor* (TL/dk) olarak da kullanır — bu durumda `Operasyon Maliyeti = SAM × SMV`.

### 4.2 Performance, Utilization, Efficiency — Üçlünün Hassas Ayrımı

Bu üç terim sahada en çok karıştırılanlardır. Lean Stitch ve Apparel Resources sentezi:

#### Performance (Performans)
> Operatörün **çalışırken** ne kadar standart hıza yakın olduğu.

```
Performance (%) = (Standard Minutes Earned / On-Standard Time) × 100

On-Standard Time = Operatörün gerçekten dikiş yaptığı süre
                 = Attended Time − Off-Standard Time
```

#### Utilization (Kullanım / Doluluk)
> Operatöre verilen sürenin **ne kadarının on-standard işe** ayrılabildiği.

```
Utilization (%) = (On-Standard Time / Attended Time) × 100

Off-Standard Time örnekleri: parça beklemek, makine arızası, eğitim, toplantı
```

#### Efficiency (Verimlilik)
> Operatörün veya hattın **mevcut süreyi standart işe çevirme oranı**. Performance × Utilization.

```
Efficiency (%) = (Standard Minutes Earned / Attended Time) × 100
              = Performance × Utilization
```

#### Sayısal Örnek (Lean Stitch'ten uyarlandı)

Operator Jay:
- Attended (vardiya): 480 dk
- Beklediği iş yokluğu: 50 dk → Off-standard
- Makine arızası: 10 dk → Off-standard
- On-Standard Time = 480 − 60 = 420 dk
- Üretim: 1000 adet × SAM 0.40 = **400 standart dakika kazandı**

| Metrik | Hesap | Değer |
|---|---|---|
| Performance | 400 / 420 | **%95.2** |
| Utilization | 420 / 480 | **%87.5** |
| Efficiency | 400 / 480 | **%83.3** |
| Doğrulama | 0.952 × 0.875 | **%83.3** ✓ |

> **Yönetimsel anlam:** Performance operatörün sorumluluğudur. Utilization yöneticinin sorumluluğudur (besleme, denge, makine bakım). Efficiency ise ikisinin bileşkesidir.

### 4.3 Line Efficiency (Hat Verimliliği)

**Bir bütün olarak hattın efficiency'si**:

```
Line Efficiency (%) = (Total Minutes Produced × 100) / (Total Hours Worked × 60)

Total Minutes Produced = Line Output × Garment SAM
Total Hours Worked     = Number of Operators × Shift Hours
```

**Örnek:** 30 operatörlü hat, 8 saat vardiya, garment SAM 4.25 dk, hedef efficiency %75:

```
Daily Line Target = (8 × 60 × 30 × 0.75) / 4.25 = 254 adet/gün
```

### 4.4 Cycle Time, Takt Time, Pitch Time — Akış Metrikleri

| Metrik | Tanım | Formül |
|---|---|---|
| **Cycle Time** | Bir operasyonu tamamlama süresi | Gözlemlenen, dakika |
| **Takt Time** | Müşteri talebine göre olması gereken hız | `Available Time / Customer Demand` |
| **Pitch Time** | Hattın hedef ritmi (dengelenmiş hat için) | `Total Garment SAM / # of Operators` |
| **Throughput Time** | İlk parça girişinden son çıkışa kadar | Stopwatch (lead time) |

> **Pitch Time örneği:** 40 dk SAM'lı parça, 10 operatör → Pitch Time = 4 dk/operatör. Her operasyonun bu süreye yakın dengelenmesi hedeflenir.

### 4.5 Line Balancing Efficiency

Hattın **operasyonel dengesi**:

```
Line Balancing Efficiency (%) = (Σ Operation SAM) / (# Operators × Bottleneck Cycle Time) × 100
```

veya

```
Line Balancing Efficiency (%) = (Total Work Content) / (Operators × Cycle Time) × 100
```

Bottleneck (darboğaz) operasyon, hattın hız sınırlayıcısıdır.

---

## 5. OEE — Konfeksiyona Uyarlanmış Hali

OEE klasik olarak otomatize makine endüstrileri için Seiichi Nakajima (TPM) tarafından geliştirilmiş ve şu üç bileşenden oluşur:

```
OEE = Availability × Performance × Quality
```

### 5.1 Klasik Formüller

```
Availability = Run Time / Planned Production Time
             = (Planned Production Time − Downtime) / Planned Production Time

Performance  = (Ideal Cycle Time × Total Count) / Run Time
             = Net Run Rate / Ideal Run Rate

Quality      = Good Count / Total Count

OEE          = (Good Count × Ideal Cycle Time) / Planned Production Time
```

### 5.2 Konfeksiyon Bağlamına Uyarlama (Sarkar, 2024)

| Bileşen | Konfeksiyondaki Karşılığı |
|---|---|
| Availability | Hattın çalışmaya hazır olduğu oran (makine arızası, elektrik kesintisi, devamsızlık) |
| Performance | Hattın ürettiği SAM / hattın üretmesi gereken SAM |
| Quality | (Toplam − DHU) / Toplam veya First-Pass Yield |

### 5.3 Endüstri Benchmarkları

- **World-class OEE:** ≥ %85 (genel imalat)
- **Discrete manufacturing ortalaması:** %55–70
- **Apparel sektörü gerçeği (Koç, 2025, *Engineering Reports*):** Konfeksiyon endüstrisi yoğun emek + düşük otomasyon yüzünden tipik OEE %40–60 bandında çalışır.

> **Ontolojik not:** Konfeksiyonda saf OEE her zaman "doğru" metrik değildir çünkü makine değil **operatör** primer kaynaktır. Bu yüzden bazı firmalar **OLE (Overall Labor Effectiveness)** kullanır:
> ```
> OLE = Labor Availability × Labor Performance × Labor Quality
> ```

---

## 6. Kalite Metrikleri

### 6.1 DHU — Defects per Hundred Units (Yüz Adetteki Hata)

```
DHU = (Total Defects Found / Total Units Inspected) × 100
```

> Aynı parçada birden fazla hata olabileceği için DHU > %100 olabilir. Bu yüzden DHU bir "oran" değil, **hata yoğunluğu** metriğidir.

### 6.2 Defective % (Hatalı Yüzdesi)

```
Defective % = (Defective Units / Total Units Inspected) × 100
```

DHU'nun aksine, defective % her zaman ≤ %100'dir. Bir parçada birden fazla hata olsa da o parça "1 hatalı" sayılır.

### 6.3 Right First Time (RFT) / First-Pass Yield (FPY)

```
RFT (%) = (Units Passed Without Rework / Total Units) × 100
FPY     = aynı kavramın istatistiksel/Lean Six Sigma versiyonu
```

### 6.4 Rolled Throughput Yield (RTY) — Çok-Aşamalı

```
RTY = FPY₁ × FPY₂ × FPY₃ × … × FPYₙ
```

10 aşamalı bir süreçte her aşama %95 FPY ise: RTY = 0.95¹⁰ = **%59.9**. Bu, gizli fabrikanın (hidden factory) gerçek boyutunu gösterir.

### 6.5 Cut-to-Ship Ratio

```
Cut-to-Ship = Total Cut Quantity / Total Shipped Quantity
```

Hedef = 1.00. > 1.00 → fazla kesim, fire. < 1.00 → eksik sevkiyat.

### 6.6 Order-to-Ship Ratio

```
Order-to-Ship = Total Ordered Quantity / Total Shipped Quantity
```

Hedef = 1.00. Buyer açısından en kritik vendor değerlendirme metriği.

---

## 7. Maliyet ve Üretkenlik Metrikleri

### 7.1 Cost per Minute (CM/dk) — Senin CMT Hesaplayıcının Çekirdeği

```
Cost per Minute = (Total Direct + Indirect Cost) / (Total Available Operator Minutes)

Available Minutes = # Operators × Shift Time × Days × Utilization%
```

### 7.2 CMT (Cut-Make-Trim) Cost / Garment

```
CMT per Garment = Garment SAM × Cost per Minute / Target Efficiency

veya senin platformundaki gibi:
CMT = Σ (Operation SAM_i × Operator Count_i × Cost per Minute_i) / Daily Capacity
```

### 7.3 Labour Productivity

```
Labour Productivity = Total Output (units or pieces) / Total Labour Hours

Productivity = Garment Produced × SAM / Operator-Hours
            (output expressed in standard minutes)
```

### 7.4 Capacity Utilization

```
Capacity Utilization = (Actual Output / Maximum Possible Output) × 100
```

Bu attainment'a benzer ama paydası **teorik kapasite** olduğu için etkililik+verimlilik bileşkesidir.

### 7.5 Pieces per Operator per Hour (PPH) / per Day (PPD)

```
PPH = Units Produced / (# Operators × Working Hours)
```

Sahada en çok kullanılan, en kaba productivity metriği.

---

## 8. Teslimat ve Müşteri Metrikleri

| KPI | Formül | Hedef |
|---|---|---|
| **OTD (On-Time Delivery)** | (Zamanında Sevk Edilen Sipariş / Toplam Sipariş) × 100 | %95+ |
| **Lead Time** | Sipariş onayından sevkiyata kadar gün sayısı | Buyer-spesifik |
| **Sample Approval Rate** | Onaylanan / Gönderilen | %90+ |
| **First Sample Approval %** | İlk seferde onaylanan numune oranı | RFT'nin numune versiyonu |

---

## 9. Ontolojik Bağ — Senin Çalışmana Mapping

Bu bölüm; literatürdeki kavramları senin **(a) çok-atölye verimlilik değerlendirme platformu** ve **(b) CMT eder maliyet hesaplayıcı** için sözlüklere bağlar.

### 9.1 Atölye Verimlilik Platformu — Kavram Eşleştirmesi

| Senin Platform Verisi / Kavramı | Literatür Karşılığı (EN) | Doğru Hesap | Tip |
|---|---|---|---|
| Atölye günlük üretim (adet) | Daily Production Output | gözlemlenen | actual |
| Atölyeye verilen hedef | Daily Production Target | `Available Minutes / SAM × Target Efficiency` | planned |
| **Hedef Tutturma %** | **Production Attainment / Schedule Attainment** | `Actual / Target × 100` | **effectiveness** |
| Atölye verimliliği | **Line Efficiency** | `(Output × SAM × 100) / (Operators × Hours × 60)` | **efficiency** |
| SAM (saniye/operasyon) | Standard Allowed Minute | time study | input standard |
| Toplam SAM (parça) | Garment SAM / Total Work Content | `Σ Operation SAM` | input standard |
| Operatör sayısı (kişi, kesirli) | Manpower / Headcount | gözlem | input |
| Vardiya dakikası | Available / Attended Time | `# Operators × Shift × 60` | denominator |
| Darboğaz operasyon | Bottleneck Operation | en uzun cycle time | constraint |
| Hat dengeleme oranı | Line Balancing Efficiency | `Σ SAM / (# Op × Bottleneck CT) × 100` | balance |
| Günlük kapasite | Daily Capacity | `(Workers × Min × Eff%) / SAM` | output potential |
| Sevk edilen / Üretilen | Shipped / Produced | observation | output |
| Hatalı parça oranı | Defective % / DHU | sayım | quality |
| Tekrar dikim oranı | Rework Rate | sayım | quality loss |
| Atölye duruş süresi | Lost Time / Downtime | log | availability loss |
| Atölye sınıfı (S/CS/CSU) | Workshop Type / Capability Tier | sınıflandırma | structural |

> **Kritik tasarım kararı:** Platformunda hem `Line Efficiency` (klasik IE'lik tanım) hem `Target Attainment` (hedefe ulaşma) ayrı sütunlar olarak yer almalı. Türkçe arayüzde bunlar **"Verimlilik %"** ve **"Hedef Tutturma %"** olarak ayrılmalı. Tek bir "verimlilik" sütunu, **operasyonel mühendislik** ile **planlama performansı**nı karıştırır.

### 9.2 CMT Eder Hesaplayıcı — Kavram Eşleştirmesi

| Senin Platform Verisi / Kavramı | Literatür Karşılığı (EN) | Formül | Not |
|---|---|---|---|
| Operasyon SAM (sn) | Operation SAM | time study | sn → dk dönüşümü kritik |
| İşçi sayısı (kesirli, 0.5 kişi) | Fractional Manpower / Worker Allocation | gözlem | sektörde standart pratik |
| Bölgesel TL/dk | Regional Cost per Minute | sözleşme/araştırma | input |
| Operasyon eder maliyet | Operation CMT Cost | `Op SAM × Workers × Cost/min` | output |
| Toplam parça eder | Garment CMT Cost | `Σ Operation Costs` | nihai çıktı |
| Darboğaz operasyon | Bottleneck Operation | `max(Op SAM × Workers)` | kapasite belirleyici |
| Günlük kapasite | Daily Capacity | `Workers × 480 / max(Op SAM × Workers)` | bottleneck-driven |
| Hat verimliliği varsayımı | Target Line Efficiency | parametre | maliyet ayarı |
| Hedef kâr marjı | Markup / Margin | parametre | satış fiyatı türetimi |

### 9.3 Hiyerarşik Sözlük (Ontoloji Taslağı)

Obsidian / Wiki yapına uygun şekilde:

```
Performance_Measurement
├── Effectiveness
│   ├── Production_Attainment  (Hedef Tutturma)
│   ├── Schedule_Attainment
│   ├── On_Time_Delivery
│   └── First_Sample_Approval
├── Efficiency
│   ├── Operator_Efficiency
│   ├── Line_Efficiency  (klasik IE tanımı)
│   ├── Operator_Performance  (sub-component)
│   ├── Operator_Utilization  (sub-component)
│   ├── Line_Balancing_Efficiency
│   └── Capacity_Utilization
├── Productivity
│   ├── Labour_Productivity
│   ├── Pieces_per_Hour  (PPH)
│   └── Output_per_Operator
├── Quality
│   ├── DHU
│   ├── Defective_Percentage
│   ├── Right_First_Time  (RFT)
│   ├── First_Pass_Yield  (FPY)
│   └── Rolled_Throughput_Yield  (RTY)
├── Composite_Metrics
│   ├── OEE  (Availability × Performance × Quality)
│   ├── OLE  (Labor versiyonu)
│   └── TEEP  (Total Effective Equipment Performance)
├── Cost
│   ├── Cost_per_Minute  (CM/min)
│   ├── CMT_per_Garment
│   └── Labour_Cost_per_Piece
└── Time_Standards
    ├── SAM_SMV  (Standard Allowed Minute / Standard Minute Value)
    ├── Basic_Time
    ├── Cycle_Time
    ├── Takt_Time
    ├── Pitch_Time
    └── Throughput_Time
```

---

## 10. Sözlük (English-Türkçe Glossary, Alfabetik)

| EN | TR | Kısa Tanım |
|---|---|---|
| Allowance | Tolerans / Pay | Kişisel ihtiyaç + yorgunluk + makine arızası için verilen ek süre |
| Attainment | Hedef Tutturma | Gerçekleşenin hedefe oranı (effectiveness ölçüsü) |
| Availability | Müsaitlik | Plan zamanına göre çalışabilirlik oranı (OEE bileşeni) |
| Basic Time | Temel Süre | Observed Time × Performance Rating |
| Bottleneck | Darboğaz | Hattın hızını sınırlayan en yavaş operasyon |
| Bundle Allowance | Demet Toleransı | Demet alma/bırakma için verilen ek süre (~%10) |
| Capacity Utilization | Kapasite Kullanımı | Gerçekleşen / Maksimum kapasite |
| CMT | Cut-Make-Trim Maliyeti | Kesim+Dikim+Aksesuar işçilik maliyeti |
| Cost per Minute | Dakika Maliyeti | Toplam dolaylı+dolaysız maliyet / toplam müsait operatör dakikası |
| Cut-to-Ship Ratio | Kesim-Sevkiyat Oranı | Kesilen / Sevk edilen |
| Cycle Time | Çevrim Süresi | Bir operasyonun tek tekrar süresi |
| DHU | Yüz Adetteki Hata | (Hatalar / İncelenen) × 100 — yoğunluk metriği |
| Downtime | Duruş Süresi | Üretimin durduğu süre |
| Effectiveness | Etkililik | Output / Goal — "doğru şeyi yapma" |
| Efficiency | Verimlilik | Output / Input veya Standard / Actual — "doğru yapma" |
| Factory Efficiency | Fabrika Verimliliği | Tüm hatların ağırlıklı line efficiency'si |
| First-Pass Yield (FPY) | İlk Geçişte Kabul | İlk seferde hatasız geçen oran |
| Garment SAM | Ürün SAM | Tüm operasyon SAM'larının toplamı |
| Lead Time | Teslim Süresi | Sipariş onayı → sevkiyat |
| Line Balancing | Hat Dengeleme | İş yükünün operasyonlar arası eşit dağıtımı |
| Line Efficiency | Hat Verimliliği | Üretilen std dk / Toplam müsait dk |
| Lost Time | Kayıp Zaman | Üretime ayrılması beklenen ama olmayan zaman |
| Man-to-Machine Ratio | İnsan-Makine Oranı | Operatör sayısı / Makine sayısı |
| Marker Efficiency | Pastal Verimliliği | Net kumaş alanı / Pastal alanı |
| OEE | Genel Ekipman Etkililiği | Availability × Performance × Quality |
| OLE | Genel İşgücü Etkililiği | OEE'nin işgücü versiyonu |
| On-Time Delivery (OTD) | Zamanında Teslimat | Zamanında sevk / Toplam sevk |
| Operator Efficiency | Operatör Verimliliği | Std dk üretildi / Müsait dk |
| Operator Performance | Operatör Performansı | Std dk üretildi / On-standard dk |
| Operator Utilization | Operatör Kullanımı | On-standard dk / Müsait dk |
| Order-to-Ship Ratio | Sipariş-Sevkiyat Oranı | Sipariş / Sevk edilen |
| Performance Rating | Performans Derecelendirmesi | Operatörün hızının standarda oranı (%) |
| Pitch Time | Pitch Süresi | Garment SAM / Operatör Sayısı |
| Production Attainment | Üretim Hedefine Ulaşma | (Gerçekleşen / Hedef) × 100 |
| Productivity | Üretkenlik | Çıktı / Girdi (mutlak değer) |
| Quality (in OEE) | Kalite (OEE'de) | İyi / Toplam |
| Right First Time (RFT) | İlk Seferde Doğru | Yeniden işlemsiz geçen oran |
| Rolled Throughput Yield (RTY) | Birikmiş Geçiş Verimi | Π FPYᵢ |
| SAM | Standart İzin Verilen Dakika | Bir operasyonun standart süresi |
| Schedule Attainment | Plan Tutturma | Production Attainment ile aynı |
| SMV | Standart Dakika Değeri | SAM ile eşanlamlı (Avrupa terminolojisi) |
| Takt Time | Takt Süresi | Müsait süre / Müşteri talebi |
| Throughput Time | Akış Süresi | İlk parça → son parça çıkış |
| Utilization | Kullanım Oranı | Kaynak kullanım yoğunluğu |

---

## 11. Çapraz Referans Tablosu — Karıştırılan Kavramlar

| Saha Kullanımı (yanlış olabilir) | Teknik Olarak Doğru Terim | Doğru Tanım |
|---|---|---|
| "Atölyenin verimi %75" (gerçekleşen/hedef) | **Production Attainment** | Hedef tutturma; effectiveness ölçüsü |
| "Hatın verimliliği %75" (üretilen std dk / müsait dk) | **Line Efficiency** | Klasik IE verimliliği |
| "Operatör performansı düşük" (gerçekleşen az) | **Output**'un düşük olması | Performance ≠ output volume |
| "OEE %85'in üstü olmalı" (apparel için) | OEE %50–60 (apparel'da) | World-class %85 ama otomatize endüstri için |
| "Verimsizlik" (genel) | Specifically: hangi loss? | 6 büyük kayıp: setup, breakdown, micro-stops, speed loss, defects, startup |

---

## 12. Önerilen Okuma ve Kaynaklar

### 12.1 Akademik / Endüstriyel Kaynaklar

- Drucker, P. F. (1974). *Management: Tasks, Responsibilities, Practices*. Harper & Row. — Effectiveness vs Efficiency klasik tanımı.
- ILO. *Introduction to Work Study*. — SAM/SMV ve time study'nin bibliyografik kökeni.
- Nakajima, S. (1988). *Introduction to TPM*. Productivity Press. — OEE'nin kökeni.
- Koç, K. ve diğ. (2025). "Achieving Sustainable OEE in Apparel Industry With Lean and Digital Integration." *Engineering Reports*, Wiley. — Apparel OEE %40–60 bandı bulgusu.
- Bongomin, O. ve diğ. (2020). "Improvement of garment assembly line efficiency using line balancing technique." *Engineering Reports*, Wiley.
- Juman, Z. A. M. S. "A Generalized Assignment of SMV Model to Minimize the Difference Between Planned and Actual Outputs of a Garment Production Line." — Senin platformuna en yakın akademik referans.

### 12.2 Pratik / Endüstri Web Kaynakları

- onlineclothingstudy.com (Prasanta Sarkar) — Konfeksiyon KPI hesaplamaları için en kapsamlı pratik kaynak.
- textilelearner.net — SAM/SMV/OEE konfeksiyon uyarlamaları.
- apparelresources.com — IE makaleleri.
- leanstitch.com — Operator performance/utilization/efficiency ayrımı için pratik örnekler.
- oee.com & oee.academy — OEE'nin standart referansları.
- opsdog.com — Production Attainment dahil 200+ KPI tanımı.

### 12.3 Türkçe Kaynak Önerileri

- TMMOB Tekstil Mühendisleri Odası yayınları
- İTÜ Tekstil Müh. Bölümü kürsü materyalleri (özellikle Üretim Planlama dersleri)
- "Hazır Giyim Üretim Yönetimi" başlıklı Türkçe ders kitapları (genelde SAM yerine "standart süre" kullanır)

---

## 13. Pratik Uygulama Notları (Senin İşin İçin)

1. **Platformunda iki ayrı sütun:** `Hedef Tutturma %` (attainment) ve `Verimlilik %` (line efficiency). Bunları birleştirmek karışıklık yaratır.

2. **OEE'yi konfeksiyona uyarlarken** bilinçli ol: Availability daha çok devamsızlık + makine arızası, Performance hat efficiency'si, Quality DHU'dan türetilir. Saf ekipman OEE'si (otomotiv tarzı) konfeksiyonda yanıltıcıdır.

3. **CMT hesaplayıcında bottleneck-aware kapasite** zaten doğru yaklaşım. Bunu literatürde **bottleneck-driven capacity planning** veya **Theory of Constraints (TOC)** olarak konumlandırabilirsin.

4. **Fason atölye sınıflandırmaların (S/CS/CSU)** literatürde **capability tiering** veya **vertical integration level** olarak geçer.

5. **Kesirli işçi atamaları (0.5 kişi)** literatürde **fractional manpower allocation** veya **shared operator** olarak geçer; line balancing'in önemli bir esnekliğidir.

6. **Blog için düşünebileceğin başlık:** *"Konfeksiyonda 'Verimlilik' Dediğimizde Ne Demek İstiyoruz? — Effectiveness, Efficiency ve Productivity'yi Karıştırmamak"* — bu doküman tam o yazının iskeleti.

---

## 14. Sonuç

Konfeksiyon sektörünün KPI literatürü, **klasik endüstri mühendisliğinin (Time Study + Method Study)** üzerine **Lean/TPM (OEE, Line Balancing)** ve **Six Sigma (DHU, FPY, RTY)** katmanlarının eklenmesiyle oluşmuş bir hibrit yapıdır. Sektörel jargonun klasik literatürle her zaman uyuşmadığı (özellikle "efficiency" teriminin geniş kullanımı) noktalarda, kendi platformlarında **terminoloji disiplinini** kurmak hem teknik tutarlılık hem buyer/yatırımcı raporlamasında güven yaratır.

Sorduğun spesifik soru — *"Gerçekleşen/Hedeflenen verimlilik mi etkililik mi?"* — sorusunun cevabı **etkililik (effectiveness)** olarak verildiğinde, hem Drucker'ın klasik tanımıyla, hem OpsDog gibi standart KPI sözlükleriyle, hem de OEE'nin "E" harfinin neden Effectiveness olduğunun mantığıyla **örtüşür**. Senin sözlüğünde bu metriği **"Production Attainment / Hedef Tutturma %"** olarak adlandırman, sektör jargonunun yarattığı bulanıklığı kendi platformunda gidermenin en temiz yoludur.

---

*Doküman versiyonu: 1.0 — Hakan'ın AI Wiki'si için hazırlanmış literatür + ontoloji referansı.*
