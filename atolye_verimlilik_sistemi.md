# Atölye Verimlilik Değerlendirme Sistemi

---

## 0. Proje Planı — Pilot'tan Üretime

### 0.1 Yaklaşım

Bu sistem 200 fason atölye için tasarlanmış olsa da sıfırdan büyük ölçekte başlamak hem maliyetli hem risklidir. Bunun yerine **üç aşamalı bir büyüme modeli** izlenir: önce az atölye ile veri modeli doğrulanır, sonra süreçler olgunlaştırılır, ardından ölçek büyütülür.

```
Faz 1 — Pilot          Faz 2 — MVP            Faz 3 — Ölçekleme
3 atölye, 2 ay    →    15 atölye, 3 ay    →    200 atölye, sürekli
Veri modeli test        Raporlama kurulur        Tam operasyon
```

---

### 0.2 Faz 1 — Pilot (Ay 1–2)

**Hedef:** Veri modelini gerçek verilerle test etmek, boşlukları bulmak, veri giriş sürecini tasarlamak.

**Pilot Atölye Seçim Kriterleri:**

| Kriter | Açıklama |
|--------|----------|
| Tip çeşitliliği | 1× Tip A, 1× Tip B veya C |
| Ürün çeşitliliği | En az 1 alt grup + 1 üst grup atölye |
| Bant sayısı | 1 bantlı + çok bantlı atölye |
| Veri erişimi | Gider tablosunu, üretim verisini paylaşmaya istekli |
| Coğrafya | Tercihen merkezi ekibe yakın, saha ziyareti yapılabilir |

**Faz 1 Görev Listesi:**

| # | Görev | Süre | Çıktı |
|---|-------|------|-------|
| 1 | 3 pilot atölye seçimi ve onayı | 3 gün | Atölye listesi |
| 2 | Atölye profil formu oluşturma (Tablo 1–2) | 3 gün | Google Sheets / Form şablonu |
| 3 | Pilot atölye profillerini girme | 2 gün | Dolu profil kayıtları |
| 4 | Gider tablosu şablonu hazırlama | 2 gün | Tablo 3 şablonu |
| 5 | Pilot atölye gider verilerini girme | 3 gün | Gerçek gider kayıtları |
| 6 | Üretim verisi şablonu hazırlama | 2 gün | Tablo 4 şablonu |
| 7 | 1 aylık üretim verisi girme | 3 gün | Doldurulan üretim tablosu |
| 8 | Darboğaz ve süreç kapasite verisi girme | 3 gün | Tablo 10–11 dolu |
| 9 | Temel metriklerin hesaplanması | 2 gün | Verimlilik, maliyet, skor |
| 10 | Pilot değerlendirme toplantısı | 1 gün | Boşluk listesi, revizyon kararları |

**Faz 1 Başarı Kriterleri:**
- 3 atölye için tüm temel tablolar eksiksiz doldurulabildi
- Verimlilik ve adet başı maliyet doğru hesaplanıyor
- Veri giriş süresi atölye başına 2 saatin altında
- En az 1 darboğaz tespiti yapıldı

**Faz 1 Araçlar:**
- Google Sheets (5 sekme = 5 tablo)
- Google Forms (veri giriş formu)
- Manuel hesap doğrulaması

---

### 0.3 Faz 2 — MVP (Ay 3–5)

**Hedef:** 15 atölye ile raporlama, skorlama ve karşılaştırma mekanizmalarını kurmak.

**Faz 2 Genişletme Kriterleri:**

15 atölye seçilirken şu çeşitlilik sağlanır: farklı şehirlerden en az 3 lokasyon, 3 farklı ürün kategorisi (pantolon, mont, gömlek gibi), hem yüksek hem düşük performans gösteren atölyeler, 1–4 bant aralığını temsil eden atölyeler.

**Faz 2 Görev Listesi:**

| # | Görev | Süre | Çıktı |
|---|-------|------|-------|
| 1 | Faz 1 bulgularına göre veri modelini revize etme | 1 hafta | Güncellenmiş tablo şemaları |
| 2 | 12 yeni atölye onboarding | 2 hafta | 15 atölye profili dolu |
| 3 | Tedarikçi skorlama modelini devreye alma | 1 hafta | Bölüm 9 canlı |
| 4 | Kalite ve duruş veri girişini başlatma | 1 hafta | Tablo Kalite + Duruş dolu |
| 5 | İlk karşılaştırmalı rapor (15 atölye sıralaması) | 3 gün | Yönetim raporu v1 |
| 6 | Benchmark değerlerini sisteme işleme | 2 gün | Bölüm 21 aktif |
| 7 | Raporlama takvimini ve SLA'ları yayınlama | 2 gün | Bölüm 22 aktif |
| 8 | Düşük skorer için geliştirme planı başlatma | 1 hafta | İlk Bölüm 19 kayıtları |
| 9 | Veri kalitesi doğrulama kurallarını devreye alma | 1 hafta | Bölüm 18 aktif |
| 10 | Faz 2 değerlendirme toplantısı ve ölçekleme kararı | 1 gün | Faz 3 onayı |

**Faz 2 Başarı Kriterleri:**
- 15 atölye için aylık rapor 10. güne kadar hazır
- Bileşik skor hesabı otomatik işliyor
- En az 3 atölye için geliştirme planı aktif
- Veri kalite skoru ortalama ≥ 80

**Faz 2 Araçlar:**
- Google Sheets (geliştirilmiş — atölyeler arası referanslar)
- Google Looker Studio veya Power BI (görsel raporlama)
- Otomatik uyarı mekanizması (Google Apps Script veya benzeri)

---

### 0.4 Faz 3 — Tam Ölçek (Ay 6–12)

**Hedef:** 200 atölye ile sistemin tam operasyona alınması, altyapının ölçeklenmesi.

**Faz 3 Görev Listesi:**

| # | Görev | Süre | Çıktı |
|---|-------|------|-------|
| 1 | Teknoloji kararı (Sheets mi, veritabanı mı) | 2 hafta | Altyapı seçimi |
| 2 | Kalan 185 atölye onboarding (gruplar halinde) | 8 hafta | 200 atölye aktif |
| 3 | Makine parkı takibini başlatma | 2 hafta | Bölüm 15 aktif |
| 4 | İşgücü devir oranı takibini başlatma | 1 hafta | Bölüm 16 aktif |
| 5 | Sosyal uyumluluk ve sertifikasyon kontrolü | 2 hafta | Bölüm 20 aktif |
| 6 | Sezonluk kapasite planlamasını devreye alma | 1 hafta | Bölüm 17 aktif |
| 7 | Kapasite planlama ve sipariş dağıtımı entegrasyonu | 2 hafta | Bölüm 14 aktif |
| 8 | Risk analizi ve konsantrasyon takibi | 1 hafta | Bölüm 13 aktif |
| 9 | Tedarik zinciri entegrasyonu | 2 hafta | Bölüm 24 aktif |
| 10 | Tam sistem değerlendirmesi ve optimizasyon | 1 hafta | v1.0 yayın |

**Faz 3 Altyapı Kararı:**

| Seçenek | Ne zaman geç | Gösterge |
|---------|-------------|---------|
| Google Sheets'te devam | ≤ 50 atölye yeterliyse | Sistem hızlı çalışıyor, formüller akıyor |
| Airtable'a geç | 50–100 atölye arası takılırsa | Sheets yavaşlıyor, ilişki yönetimi zorlaşıyor |
| PostgreSQL + web arayüzü | 100+ atölye ve gelişmiş analiz lazımsa | Gerçek zamanlı sorgular, özel dashboard |

---

### 0.5 Tüm Proje Takvim Özeti

```
AY 1          AY 2          AY 3          AY 4          AY 5
──────────    ──────────    ──────────    ──────────    ──────────
FAZ 1         FAZ 1 son     FAZ 2         FAZ 2         FAZ 2 son
Pilot kurulum Pilot eval.   Onboarding    Raporlama     MVP eval.
3 atölye      Revizyon      15 atölye     Skorlama      Karar

AY 6          AY 7–8        AY 9–10       AY 11         AY 12
──────────    ──────────    ──────────    ──────────    ──────────
FAZ 3 başlık  Onboarding    Onboarding    Tüm modüller  v1.0
Altyapı karar 50 → 100      100 → 200     Aktif         Tam ops.
```

---

### 0.6 Risk ve Önlem Tablosu

| Risk | Olasılık | Etki | Önlem |
|------|:--------:|:----:|-------|
| Atölyeler veri paylaşmak istemez | Orta | Yüksek | Skoru sipariş önceliğine bağla — teşvik mekanizması |
| Gider verileri güvenilmez / eksik | Yüksek | Yüksek | Bölüm 18 doğrulama kuralları + saha doğrulaması |
| Veri giriş süresi çok uzun | Orta | Orta | Formu sadeleştir, Faz 1'de ölç, gerekirse kısalt |
| Google Sheets ölçeklenemiyor | Düşük | Orta | 50+ atölyede Airtable veya veritabanına geçiş planı hazır tut |
| Skor hesabı tartışma yaratır | Orta | Orta | Ağırlıkları ve eşikleri atölyelere şeffaf yayınla |
| Merkezi ekipte bilgi eksikliği | Düşük | Yüksek | Faz 1'de ekip eğitimi zorunlu |

---

### 0.7 Faz Geçiş Kriterleri (Kapı Kontrolleri)

Bir fazdan diğerine geçmek için şu koşulların hepsinin karşılanmış olması gerekir:

**Faz 1 → Faz 2 geçiş koşulları:**
- [ ] 3 atölye eksiksiz veri girişi tamamlandı
- [ ] Temel metrikler (verimlilik, maliyet, skor) doğru hesaplanıyor
- [ ] Veri giriş süresi atölye başına ≤ 2 saat
- [ ] Veri modeli revizyonları karara bağlandı

**Faz 2 → Faz 3 geçiş koşulları:**
- [ ] 15 atölye 2 ay üst üste tam veri girişi yaptı
- [ ] Aylık yönetim raporu 10. günde hazır
- [ ] Veri kalite skoru ortalama ≥ 80
- [ ] En az 1 geliştirme planı sonuç verdi (skor artışı gözlemlendi)
- [ ] Altyapı kararı (Sheets / Airtable / Veritabanı) verildi

---



### 1.1 Üretim Kapsamı (Atölye Tipi)

| Tip | Kapsam | Açıklama |
|-----|--------|----------|
| A | Sadece Dikim | Kesim hazır gelir, atölye yalnızca dikiş üretimine odaklanır |
| B | Kesim + Dikim | Kumaş kesimden çıkıp direkt dikime girer, UKP dışarıda |
| C | Kesim + Dikim + UKP | Tam entegre atölye, ürün hammaddeden bitmiş pakete kadar tamamlanır |

> Atölye tipi; maliyet hesabı, SAM kapsamı ve kapasite kısıt noktasını doğrudan etkiler.

---

### 1.2 Genel Parametreler

| Parametre | 2025 Gerçekleşen | 2026 Öngörülen | Notlar |
|-----------|----------------:|---------------:|--------|
| Aylık toplam gider | 11.557.650 TL | 14.103.625 TL | %22 artış |
| Günlük gider (22 iş günü) | 525.348 TL | 641.074 TL | |
| Kişi başı aylık gider | 36.005 TL | 43.937 TL | 321 kişi bazında |
| Aylık çalışma günü | 22 gün | 22 gün | Baz alınan |
| Net çalışma süresi | 9 saat / gün | 9 saat / gün | Molalar çıkarıldıktan sonra |
| Net çalışma süresi (dakika) | 540 dk / gün | 540 dk / gün | |
| Dakika başı maliyet (dikim) | — | **6,42 TL/dk** | 185 dikim operatörü bazında |

---

### 1.3 Çalışan Profili

| Departman | Kişi Sayısı | Kategori |
|-----------|------------|----------|
| Dikim | 185 | Verimli (üretici) |
| UKP | 86 | Verimli (üretici) — Tip C atölyede |
| Kesim | 17 | Verimli (üretici) — Tip B ve C atölyede |
| Yönetim | 17 | Endirekt |
| Endirekt Mavi Yaka (şoför, aşçı vb.) | 16 | Endirekt |
| **Toplam** | **321** | |

**Verimli çalışan oranı (Tip A — sadece dikim):** 185 / 321 = %57,6

---

### 1.4 Bant Yapısı

| Parametre | Değer |
|-----------|-------|
| Toplam bant sayısı | 3 |
| Günlük toplam hedef | 6.750 adet |
| Bant yapısı | 2 normal bant + 1 küçük bant |
| Küçük bant max çevrim süresi | ~28 saniye |

---

## 2. Maliyet Hesabı

### 2.1 Temel Formüller

```
Toplam Kapasite (dk/ay) = Dikim Operatörü × Çalışma Günü × 540

Dakika Başı Maliyet (TL/dk) = Aylık Toplam Gider / Toplam Kapasite

Operatör Başı Günlük Kapasite (dk) = 540
```

### 2.2 Gerçek Hesap (2026 öngörüsü, 22 iş günü, 185 dikim operatörü)

```
Toplam Kapasite = 185 × 22 × 540 = 2.198.400 dk/ay

Dakika Başı Maliyet = 14.103.625 / 2.198.400 ≈ 6,42 TL/dk
```

### 2.3 Gider Kalemleri — 2025 ve 2026 Karşılaştırması

| Gider Kalemi | 2025 (TL/ay) | 2026 (TL/ay) | Değişim |
|--------------|-------------:|-------------:|:-------:|
| Personel Gideri | 8.480.000 | 10.770.000 | +%27 |
| SGK Giderleri | 267.400 | 334.375 | +%25 |
| Yemek Giderleri | 267.500 | 267.500 | — |
| Elektrik Gideri | 280.000 | 280.000 | — |
| Su Gideri | 36.000 | 36.000 | — |
| Doğalgaz | 26.750 | 26.750 | — |
| Servis Ödemesi | 630.000 | 789.000 | +%25 |
| Araç Yakıt ve Bakım | 110.000 | 110.000 | — |
| Kargo ve Nakliye | 160.000 | 160.000 | — |
| Makina Yedek Parça ve Bakım | 400.000 | 400.000 | — |
| İplik Alımları | 600.000 | 600.000 | — |
| Diğer Giderler | 300.000 | 330.000 | +%10 |
| **TOPLAM** | **11.557.650** | **14.103.625** | **+%22** |

> Personel + SGK kalemi 2026 toplam giderin **%78,7'sini** oluşturmaktadır.

### 2.4 "Diğer Giderler" Kaleminin İçeriği (2025)

| Alt Kalem | Tutar (TL/ay) |
|-----------|-------------:|
| Vergiler | 65.000 |
| İSG | 45.000 |
| Görünmeyen Giderler | 39.000 |
| Mali Müşavir | 40.000 |
| Sigorta | 40.000 |
| Avukatlık | 30.000 |
| Ticaret Odası | 17.000 |
| Kırtasiye | 10.000 |
| Eczane | 5.000 |
| Telefon | 7.000 |
| Noter | 2.000 |
| **TOPLAM** | **300.000** |

### 2.5 Atölye Tipine Göre Maliyet Kapsamı

| Atölye Tipi | Maliyete Dahil Edilecek Operatörler |
|-------------|-------------------------------------|
| Tip A (Sadece Dikim) | Yalnızca dikim operatörleri (185) |
| Tip B (Kesim + Dikim) | Dikim + kesim operatörleri (202) |
| Tip C (Kesim + Dikim + UKP) | Dikim + kesim + UKP operatörleri (288) |

### 2.6 Hedef Ciro Analizi (2026)

| Senaryo | Değer |
|---------|------:|
| Hedef aylık ciro | 15.000.000 TL |
| Günlük hedef kazanç (22 gün) | 681.818 TL |
| Günlük toplam gider | 641.074 TL |
| 6.500 adet / gün senaryosunda adet fiyatı | 104,90 TL |
| 7.000 adet / gün senaryosunda adet fiyatı | 97,40 TL |
| 6.500 adet / gün başa düşen gider | 98,63 TL/adet |
| 7.000 adet / gün başa düşen gider | 91,58 TL/adet |
| Hedef aylık net marj | 896.375 TL |
| Hedef marj oranı | %6,0 |

> Referans dikiş fiyatı 75 TL/adet baz alınarak ciro senaryoları değerlendirilmiştir.

---

## 3. Süreç Tanımları

### 3.1 Alt Grup (Pantolon vb.)

| Sıra | Süreç | Açıklama |
|------|-------|----------|
| 1 | Hazırlık | Parça hazırlama, ara işlemler |
| 2 | Ön Bant | Ön panel dikişleri |
| 3 | Arka Bant | Arka panel dikişleri |
| 4 | Montaj | Ön-arka birleştirme, kemer, fermuvar |
| 5 | UKP | Ütü, kalite kontrol, paketleme |

### 3.2 Üst Grup (Ceket, Gömlek vb.)

| Sıra | Süreç | Açıklama |
|------|-------|----------|
| 1 | Hazırlık | Yaka, cep vb. detay hazırlıkları |
| 2 | Ön / Arka Montaj | Panel dikişleri ve birleştirme |
| 3 | UKP | Ütü, kalite kontrol, paketleme |

---

## 4. Verimlilik Hesabı

### 4.1 Model Bazlı Formüller

```
Toplam SAM (dk) = Σ (Tüm Süreç SAM Değerleri)

Hedef Üretim (adet/gün) = (Operatör Sayısı × 540) / Toplam SAM

Verimlilik (%) = (Gerçekleşen Üretim / Hedef Üretim) × 100

Adet Başı Maliyet (TL) = (Toplam SAM × Dakika Başı Maliyet) / (Verimlilik / 100)
```

### 4.2 Bant Bazlı Formüller

```
Günlük Teorik Kapasite (adet) = (9 × 3600) / Max Çevrim Süresi (sn)

Bant Verimliliği (%) = (Günlük Gerçekleşen / Günlük Hedef) × 100
```

**Örnek — Küçük Bant (28 sn çevrim):**
```
Günlük Teorik Kapasite = 32.400 / 28 ≈ 1.157 adet/gün
```

### 4.3 Verimlilik Sınıflandırması

| Aralık | Sınıf | Yorumu |
|--------|-------|--------|
| ≥ %90 | İyi | Hedef karşılanıyor |
| %70 – %89 | Orta | İyileştirme gerekli |
| < %70 | Kritik | Akış ve dengeleme analizi yapılmalı |

---

## 5. Değerlendirme Perspektifleri

### 5.1 Atölye Bazlı Göstergeler

- Toplam günlük / aylık üretim hedefi vs. gerçekleşen
- Genel verimlilik yüzdesi
- Adet başı ortalama maliyet
- Verimli / endirekt çalışan oranı

### 5.2 Bant Bazlı Göstergeler

- Her bandın hedef ve gerçekleşen üretim karşılaştırması
- Bant bazlı verimlilik yüzdesi
- Çevrim süresi analizi (darboğaz tespiti)

### 5.3 Model / Ürün Bazlı Göstergeler

- SAM doğruluk oranı (hedef vs. gerçekleşen SAM)
- Model bazlı adet başı maliyet
- Süreç bazlı SAM dağılımı (hangi süreç ağırlıklı)

### 5.4 Atölye Tipi Bazlı Özel Notlar

**Tip A — Sadece Dikim:**
Darboğaz noktası genellikle banttaki en yavaş operasyondur. SAM sadece dikiş SAM'ını kapsar.

**Tip B — Kesim + Dikim:**
Kesim kapasitesinin dikiş hızını karşılayıp karşılamadığı ayrıca izlenmelidir. Kesim gecikmesi dikim duruşuna yol açar.

**Tip C — Kesim + Dikim + UKP:**
Darboğaz noktası UKP'de oluşabilir. Dikiş çıkışı ne kadar güçlü olursa olsun UKP kapasitesi tüm hattın hızını belirler. UKP SAM'ı ayrıca izlenmelidir.

---

## 6. Veri Girişi Gereksinimleri

Sistemin doğru çalışması için aşağıdaki verilerin periyodik olarak girilmesi gerekir:

| Veri | Sıklık | Kaynak |
|------|--------|--------|
| Aylık sabit gider | Aylık | Muhasebe |
| Çalışma günü | Aylık | İnsan Kaynakları |
| Departman çalışan sayıları | Aylık veya değişiklikte | İnsan Kaynakları |
| Model SAM değerleri | Model başlangıcında | Endüstriyel Mühendislik / Etüd |
| Günlük üretim miktarları | Günlük | Üretim |
| Bant hedefleri | Model başlangıcında veya aylık | Üretim Planlama |

---

## 7. Operasyon Kütüphanesi — Örnek Veri (Pantolon / Alt Grup)

Bu bölüm, atölyede etüd edilen gerçek operasyon sürelerini içermektedir. Süreler **saniye/adet** cinsinden olup 10'ar ölçümün ortalamasına dayanmaktadır.

### 7.1 Ölçüm Metodolojisi

| Parametre | Açıklama |
|-----------|----------|
| Ölçüm adedi | Operasyon başına 10 çevrim |
| Çevrim süresi | 10 ölçümün toplamı (saniye) |
| Çevrim ortalama | Toplam / ölçüm adedi (sn/adet) |
| PİLİ katsayısı | × 1,15 (yorgunluk ve bekleme payı) |
| Verimlilik katsayısı | × 0,80 (%80 üzerinden kapasite) |
| Günlük kapasite bazı | 540 dakika / gün |

> **Not:** TORINO modeli için MTM (Methods-Time Measurement) teorik süreler, diğer modeller için pratik ölçüm süreleri kullanılmaktadır.

---

### 7.2 Ön Bant Operasyonları

| Operasyon | Çevrim Toplamı (sn) | Ölçüm Adedi | Ort. Süre (sn) | Ort. Süre (dk) |
|-----------|--------------------:|:-----------:|---------------:|---------------:|
| Kibrit Cep Pili + Çıma | 83 | 10 | 8,3 | 0,14 |
| Kibrit Cep Tutturma | 85 | 10 | 8,5 | 0,14 |
| Kibrit Cep Kırma | 12 | 10 | 1,2 | 0,02 |
| Kibrit Cep Takma | 66 | 10 | 6,6 | 0,11 |
| Kibrit Cep Çizim | 60 | 10 | 6,0 | 0,10 |
| Açık Pat Overlok | 24,5 | 10 | 2,5 | 0,04 |
| Kapalı Pat Overlok | 88 | 10 | 8,8 | 0,15 |
| Ön Çekme | 22,5 | 10 | 2,3 | 0,04 |
| Açık Pat Takma | 93,4 | 10 | 9,3 | 0,16 |
| Fermuar Takma | 78 | 10 | 7,8 | 0,13 |
| Patlet J Dikiş | 44 | 10 | 4,4 | 0,07 |
| Kapalı Patlet Takma | 61 | 10 | 6,1 | 0,10 |
| Cep Karşılık Overlok | 28 | 10 | 2,8 | 0,05 |
| Cep Karşılık Reçme | 53 | 10 | 5,3 | 0,09 |
| Cep Astarı Tulumu | 62 | 10 | 6,2 | 0,10 |
| Cep Astar Gazesi | 44 | 10 | 4,4 | 0,07 |
| Cep Ağzı Biye | 45 | 10 | 4,5 | 0,08 |
| Karşılık Üst Kapama | 52 | 10 | 5,2 | 0,09 |
| Karşılık Yan Kapama | 53 | 10 | 5,3 | 0,09 |
| Ön Bağlama | 81 | 10 | 8,1 | 0,14 |
| Ön Alt Bağlama | 94 | 10 | 9,4 | 0,16 |
| Ön Punterez (4 adet) | 93 | 10 | 9,3 | 0,16 |
| Etiket Kesme | 60 | 10 | 6,0 | 0,10 |
| Yıkama Talimatı Takma | 46 | 10 | 4,6 | 0,08 |
| Ön Kontrol | 117 | 10 | 11,7 | 0,20 |

---

### 7.3 Arka Bant Operasyonları

| Operasyon | Çevrim Toplamı (sn) | Ölçüm Adedi | Ort. Süre (sn) | Ort. Süre (dk) |
|-----------|--------------------:|:-----------:|---------------:|---------------:|
| Arka Cep Kırma | 150 | 10 | 1,5 | 0,03 |
| Arka Cep Otomatı | 112 | 10 | 10,0 | 0,17 |
| Arka Conta Takma | 48 | 10 | 4,8 | 0,08 |
| Arka Conta Takma Çırağı | 58 | 10 | 5,8 | 0,10 |
| Arka Ağ Çatım | 60 | 10 | 6,0 | 0,10 |
| Arka Ağ Çatım Çırak | 59 | 10 | 5,9 | 0,10 |
| Arka Çizim | 25 | 10 | 3,2 | 0,05 |
| Arka Kontrol | 60 | 8 | 9,3 | 0,16 |

---

### 7.4 Montaj Operasyonları

| Operasyon | Çevrim Toplamı (sn) | Ölçüm Adedi | Ort. Süre (sn) | Ort. Süre (dk) |
|-----------|--------------------:|:-----------:|---------------:|---------------:|
| İç Ağ Çatımı - Kollu | 100 | 10 | 10,0 | 0,17 |
| İç Ağ Çatımı Çırağı | 66 | 10 | 9,8 | 0,16 |
| Sol Yan Çatım | 91 | 10 | 9,1 | 0,15 |
| Sağ Yan Çatım | 88 | 10 | 8,8 | 0,15 |
| Sağ Yan Çıma | 72 | 10 | 9,2 | 0,15 |
| Sol Yan Çıma | 82 | 10 | 9,2 | 0,15 |
| Kemer Büzgü | 80 | 10 | 9,8 | 0,16 |
| Kemer Takma | 82 | 10 | 9,5 | 0,16 |
| Kemer Temizlik | 36 | 10 | 9,8 | 0,16 |
| Askılık Etiketi Takma | 77 | 10 | 9,2 | 0,15 |
| Kemer Kilt Dikiş | 71 | 10 | 9,1 | 0,15 |
| Kemer Alt Uç Kapatma | 98 | 10 | 9,5 | 0,16 |
| Kemer Üst Uç Kapatma | 100 | 10 | 9,5 | 0,16 |
| Kemer Ekleme | 26 | 10 | 4,8 | 0,08 |
| Tela Yapıştırma | — | — | 7,4 | 0,12 |
| İç Kontrol | 139 | 10 | 25,0 | 0,42 |

---

### 7.5 Bitim Operasyonları

| Operasyon | Çevrim Toplamı (sn) | Ölçüm Adedi | Ort. Süre (sn) | Ort. Süre (dk) |
|-----------|--------------------:|:-----------:|---------------:|---------------:|
| Paça Kıvırma Otomatı | 101 | 10 | 8,8 | 0,15 |
| Paça Temizleme | 99 | 10 | 9,3 | 0,16 |

---

### 7.6 UKP Operasyonları

#### Hazırlık

| Operasyon | Ort. Süre (sn) | Çevrim Adedi |
|-----------|---------------:|:------------:|
| Köprü Temizleme | 21 sn / 180 adet | — |
| Çakım | 24 sn / 180 adet | — |
| Keçe Kesme | 16,5 | — |
| Temizlik | 9 sn / 194 adet | — |

#### Kontrol & Paketleme

| Operasyon | Ort. Süre (sn/adet) |
|-----------|--------------------:|
| Ürün Çevirme | 15,0 |
| İç Kontrol | 7,0 |
| Çevirme | 18,0 |
| Dar Paskara | 11,0 |
| Son Ütü | 14,0 |
| Son Kontrol | 5,0 |
| Düğme Kontrol / Fermuar Kapama | 34,0 |
| Ölçü — Kemer | 40,0 |
| Beden Kartı | 46,0 |
| Etiket Kontrolü | 37,0 |
| Katlama | 26,0 |
| Jelatinleme | 21,0 |
| Dedektörden Geçirme | 53,0 |

> UKP sürelerindeki birim: referans çevrim adedi başına ölçüm (toplu işlemler için adet/çevrim değişkendir).

---

### 7.7 Model Karşılaştırması

| Model | Süre Kaynağı | Özellik |
|-------|-------------|---------|
| Standart (Dikim Süreler) | Pratik ölçüm (10 çevrim) | Atölye gerçek verim |
| Baggy | Pratik ölçüm | Aynı operasyonlar, farklı yoğunluk |
| Torino | MTM teorik + pratik çevrim | Teorik-pratik sapma karşılaştırması mevcut |

---

## 8. Veri Mimarisi — 200 Fason Atölye Yönetimi

### 8.1 Kapsam ve Kullanım Modeli

| Parametre | Değer |
|-----------|-------|
| Atölye sayısı | ~200 fason / tedarikçi atölye |
| Veri girişi | Merkezi ekip |
| Okuyucu | Yönetim |
| Analiz sıklığı | Aylık |
| Bant sayısı | Atölye başına 1–4 bant |

---

### 8.2 Veri Modeli — Tablolar ve Alanlar

Sistem üç ana katmandan oluşur: sabit profil bilgileri, aylık değişken veriler ve bant düzeyindeki operasyonel veriler.

---

#### TABLO 1 — ATÖLYE (Workshop)
*Her atölye için bir kez girilir, nadiren güncellenir.*

| Alan | Tür | Açıklama | Örnek |
|------|-----|----------|-------|
| atölye_id | Metin / Kod | Benzersiz tanımlayıcı | ATL-0042 |
| atölye_adı | Metin | Firma adı | Tuba Tekstil |
| şehir | Metin | Lokasyon | İstanbul |
| ilçe | Metin | | Bağcılar |
| tip | Seçenek | A / B / C | C (Kesim+Dikim+UKP) |
| toplam_calisan | Tam Sayı | | 321 |
| dikim_operatör | Tam Sayı | | 185 |
| ukp_operatör | Tam Sayı | | 86 |
| kesim_operatör | Tam Sayı | | 17 |
| yönetim | Tam Sayı | | 17 |
| endirekt | Tam Sayı | | 16 |
| bant_sayısı | Tam Sayı | 1–4 | 3 |
| günlük_hedef | Tam Sayı | Toplam adet/gün | 6.750 |
| net_çalışma_saati | Ondalık | Mola çıkarılmış | 9 |
| aktif | Boolean | Aktif / Pasif | Evet |
| kayıt_tarihi | Tarih | İlk kayıt | 2026-01-01 |

---

#### TABLO 2 — BANT (ProductionLine)
*Her atölye için 1–4 bant, profil değişince güncellenir.*

| Alan | Tür | Açıklama | Örnek |
|------|-----|----------|-------|
| bant_id | Metin / Kod | Benzersiz | ATL-0042-B1 |
| atölye_id | Referans | Atölye tablosuna bağlı | ATL-0042 |
| bant_adı | Metin | | Bant 1 |
| bant_tipi | Seçenek | Normal / Küçük | Küçük |
| operatör_sayısı | Tam Sayı | | 45 |
| günlük_hedef | Tam Sayı | Bu bant için | 2.250 |
| max_çevrim_sn | Ondalık | Darboğaz operasyonu süresi | 28 |
| aktif | Boolean | | Evet |

---

#### TABLO 3 — AYLIK GİDER (MonthlyExpense)
*Her atölye için her ay girilir. Temel analiz birimi.*

| Alan | Tür | Açıklama | Örnek |
|------|-----|----------|-------|
| gider_id | Otomatik | | |
| atölye_id | Referans | | ATL-0042 |
| yıl | Tam Sayı | | 2026 |
| ay | Tam Sayı | 1–12 | 4 |
| çalışma_günü | Tam Sayı | O ayki gerçek gün | 22 |
| personel_gideri | Para | TL | 10.770.000 |
| sgk_gideri | Para | TL | 334.375 |
| yemek_gideri | Para | TL | 267.500 |
| elektrik_gideri | Para | TL | 280.000 |
| su_gideri | Para | TL | 36.000 |
| dogalgaz_gideri | Para | TL | 26.750 |
| servis_gideri | Para | TL | 789.000 |
| arac_yakit_bakim | Para | TL | 110.000 |
| kargo_nakliye | Para | TL | 160.000 |
| makina_yedek_bakim | Para | TL | 400.000 |
| iplik_alimi | Para | TL | 600.000 |
| diger_giderler | Para | TL | 330.000 |
| toplam_gider | Hesaplanan | Otomatik toplam | 14.103.625 |
| hedef_ciro | Para | TL | 15.000.000 |

---

#### TABLO 4 — AYLIK ÜRETİM (MonthlyProduction)
*Her bant için her ay girilir.*

| Alan | Tür | Açıklama | Örnek |
|------|-----|----------|-------|
| uretim_id | Otomatik | | |
| bant_id | Referans | | ATL-0042-B1 |
| atölye_id | Referans | | ATL-0042 |
| yıl | Tam Sayı | | 2026 |
| ay | Tam Sayı | | 4 |
| hedef_uretim | Tam Sayı | Adet/ay | 49.500 |
| gerceklesen_uretim | Tam Sayı | Adet/ay | 43.200 |
| çalışılan_gün | Tam Sayı | O ay fiilen | 22 |
| model_kodu | Metin | Dikilen model | PNT-2026-A |
| grup_tipi | Seçenek | Alt / Üst | Alt Grup |
| toplam_sam | Ondalık | Model SAM (dk) | 14,5 |

---

#### TABLO 5 — ANA SÜREÇ (MasterProcess)
*Sistemde tanımlı tüm süreçlerin listesi. Sabit katalog — genişletilebilir.*

| alan | tür | açıklama | örnek değerler |
|------|-----|----------|----------------|
| süreç_id | Kod | Benzersiz | HAZ / ONB / ARB / MON / UKP / ONA |
| süreç_adı | Metin | Görünen ad | Hazırlık / Ön Bant / Arka Bant / Montaj / UKP |
| grup | Seçenek | Hangi ürün grubunda geçerli | Alt / Üst / Her ikisi |
| açıklama | Metin | Ne içerdiği | Yaka, cep, ara işlemler vb. |
| sıra_no | Tam Sayı | Tipik sıra (esnek) | 1, 2, 3... |

**Varsayılan süreç kataloğu:**

| süreç_id | süreç_adı | uygulandığı grup |
|----------|-----------|-----------------|
| HAZ | Hazırlık | Her ikisi |
| ONB | Ön Bant | Alt Grup |
| ARB | Arka Bant | Alt Grup |
| ONA | Ön / Arka Montaj | Üst Grup |
| MON | Montaj | Alt Grup |
| UKP | UKP (Ütü-Kontrol-Paket) | Her ikisi |
| *(özel)* | Kullanıcı tanımlı | Serbest | 

> Yeni bir süreç ilişkisi gerektiğinde (örn. "Yıkama", "Nakış", "Baskı") bu tabloya satır eklenerek sisteme tanıtılır.

---

#### TABLO 6 — ÜRÜN KATEGORİSİ (ProductCategory)
*Atölyenin dikebildiği ürün tipleri. Her tip bir süreç mimarisi şablonuna bağlıdır.*

| alan | tür | açıklama | örnek |
|------|-----|----------|-------|
| kategori_id | Kod | | PNT / MONT / GOMLEK / SORT |
| kategori_adı | Metin | | Pantolon / Mont / Gömlek / Şort |
| grup_tipi | Seçenek | Alt / Üst | Alt Grup |
| süreç_şablonu_id | Referans | Tablo 7'ye bağlı | SABLÓN-PNT |
| notlar | Metin | | Baggy, Torino vb. varyantlar bu kategoride |

---

#### TABLO 7 — SÜREÇ MİMARİSİ ŞABLONU (ProcessTemplate)
*Bir ürün kategorisinin hangi süreçlerden, hangi sırayla geçtiğini tanımlar.*
*Bir şablona birden fazla atölye bağlanabilir. Değişince tüm bağlı atölyeler güncellenir.*

| alan | tür | açıklama | örnek |
|------|-----|----------|-------|
| şablon_id | Kod | | SABLON-PNT |
| şablon_adı | Metin | | Standart Pantolon Akışı |
| kategori_id | Referans | Tablo 6 | PNT |
| süreç_id | Referans | Tablo 5 | HAZ → ONB → ARB → MON → UKP |
| sıra | Tam Sayı | Bu şablondaki sıra | 1, 2, 3, 4, 5 |
| zorunlu_mu | Boolean | Atlanamaz mı? | Evet / Hayır |

**Örnek şablon kayıtları:**

*Standart Pantolon (SABLON-PNT):*

| sıra | süreç | zorunlu |
|------|-------|---------|
| 1 | Hazırlık (HAZ) | Evet |
| 2 | Ön Bant (ONB) | Evet |
| 3 | Arka Bant (ARB) | Evet |
| 4 | Montaj (MON) | Evet |
| 5 | UKP (UKP) | Evet |

*Standart Mont (SABLON-MONT):*

| sıra | süreç | zorunlu |
|------|-------|---------|
| 1 | Hazırlık (HAZ) | Evet |
| 2 | Ön / Arka Montaj (ONA) | Evet |
| 3 | UKP (UKP) | Evet |

*Mont + Dış Cephe Nakış (SABLON-MONT-NAKIS):*

| sıra | süreç | zorunlu |
|------|-------|---------|
| 1 | Hazırlık (HAZ) | Evet |
| 2 | Nakış *(özel)* | Hayır |
| 3 | Ön / Arka Montaj (ONA) | Evet |
| 4 | UKP (UKP) | Evet |

---

#### TABLO 8 — ATÖLYE–ÜRÜN KONFİGÜRASYONU (WorkshopProduct)
*Hangi atölyenin hangi ürün kategorisini, hangi şablonla ürettiğini bağlar.*
*Bir atölye birden fazla ürün kategorisi üretebilir (pantolon + mont gibi).*

| alan | tür | açıklama | örnek |
|------|-----|----------|-------|
| config_id | Otomatik | | |
| atölye_id | Referans | Tablo 1 | ATL-0042 |
| kategori_id | Referans | Tablo 6 | PNT |
| şablon_id | Referans | Tablo 7 | SABLON-PNT |
| atanmış_bant_id | Referans | Tablo 2 | ATL-0042-B1 |
| başlangıç_tarihi | Tarih | Ne zaman başladı | 2026-01-01 |
| aktif | Boolean | Hâlâ üretiyor mu | Evet |
| notlar | Metin | | Baggy modeli ağırlıklı |

**Örnek: Hem pantolon hem mont diken atölye**

| atölye_id | kategori | şablon | atanmış bant |
|-----------|----------|--------|--------------|
| ATL-0042 | Pantolon | SABLON-PNT | Bant 1, Bant 2 |
| ATL-0042 | Mont | SABLON-MONT | Bant 3 (küçük bant) |

---

#### TABLO 9 — MODEL / SAM KÜTÜPHANESI (ModelLibrary)
*Paylaşılan model-bazlı SAM verileri. Şablona ve sürece bağlıdır.*

| alan | tür | açıklama | örnek |
|------|-----|----------|-------|
| model_id | Kod | | PNT-BAGGY-01 |
| model_adı | Metin | | Baggy Pantolon |
| kategori_id | Referans | Tablo 6 | PNT |
| şablon_id | Referans | Tablo 7 | SABLON-PNT |
| süreç_id | Referans | Tablo 5 | ONB |
| süreç_sam | Ondalık | dk — bu model için bu süreçte | 5,8 |
| kaynak | Seçenek | Pratik / MTM | Pratik |
| geçerlilik_tarihi | Tarih | | 2026-01-01 |

> Her model için her süreç ayrı satır olarak girilir. Toplam SAM = o modelin tüm süreç SAM'larının toplamı.

**Örnek — Baggy Pantolon SAM kayıtları:**

| model | süreç | SAM (dk) |
|-------|-------|-------:|
| Baggy Pantolon | Hazırlık | 3,20 |
| Baggy Pantolon | Ön Bant | 5,80 |
| Baggy Pantolon | Arka Bant | 2,90 |
| Baggy Pantolon | Montaj | 6,10 |
| Baggy Pantolon | UKP | 2,50 |
| | **Toplam** | **20,50** |

---

#### TABLO 10 — BANT SÜREÇ KAPASİTESİ (BandProcessCapacity)
*Her bant için her ana sürecin darboğaz operasyonu ve günlük kapasitesi. Aylık güncellenir.*

| alan | tür | açıklama | örnek |
|------|-----|----------|-------|
| kapasite_id | Otomatik | | |
| bant_id | Referans | Tablo 2 | ATL-0042-B1 |
| atölye_id | Referans | Tablo 1 | ATL-0042 |
| süreç_id | Referans | Tablo 5 | ONB |
| yıl | Tam Sayı | | 2026 |
| ay | Tam Sayı | | 4 |
| model_id | Referans | Tablo 9 | PNT-BAGGY-01 |
| darbogaz_operasyon | Metin | O süreçteki en yavaş operasyon | Açık Pat Takma |
| darbogaz_cevrim_sn | Ondalık | Darboğaz operasyonun çevrim süresi (sn) | 9,34 |
| teorik_gunluk_kapasite | Hesaplanan | 32.400 / darboğaz_çevrim_sn | 3.469 adet |
| gerceklesen_gunluk_ort | Ondalık | Ay boyunca günlük ortalama çıktı | 2.900 adet |
| surec_verimliligi | Hesaplanan | gerçekleşen / teorik × 100 | %83,6 |

> **32.400** = 9 saat × 3.600 saniye. Net çalışma süresi değiştiyse bu baz güncellenir.

**Her ana süreç için ayrı bir kayıt girilir.** Örnek — ATL-0042, Bant 1, Nisan 2026:

| ana süreç | darboğaz operasyonu | çevrim sn | teorik kapasite | gerçekleşen | verimlilik |
|-----------|--------------------:|----------:|----------------:|------------:|----------:|
| Hazırlık | Kibrit Cep Takma | 9,0 | 3.600 | 3.200 | %88,9 |
| Ön Bant | Açık Pat Takma | 9,3 | 3.484 | 2.900 | %83,3 |
| Arka Bant | Arka Cep Otomatı | 10,0 | 3.240 | 2.750 | %84,9 |
| Montaj | İç Kontrol | 25,0 | 1.296 | 1.050 | %81,0 |
| UKP | Son Kontrol | 14,0 | 2.314 | 1.900 | %82,1 |

> Bu tabloda **Montaj — İç Kontrol (25 sn → 1.296 adet/gün)** bant genelinin darboğazıdır.
> Diğer tüm süreçler daha yüksek kapasiteye sahip olsa da Montaj tüm hattı kısıtlar.

---

#### TABLO 11 — BANT DARBOĞAZ ÖZETİ (BandBottleneck)
*Her bant için o aydaki genel darboğaz — Tablo 10'dan otomatik türetilir.*

| alan | tür | açıklama | örnek |
|------|-----|----------|-------|
| bant_id | Referans | | ATL-0042-B1 |
| yıl / ay | Tam Sayı | | 2026 / 4 |
| model_id | Referans | | PNT-BAGGY-01 |
| darbogaz_surec | Referans | En düşük kapasiteli süreç | MON (Montaj) |
| darbogaz_operasyon | Metin | O süreçteki darboğaz operasyonu | İç Kontrol |
| darbogaz_cevrim_sn | Ondalık | | 25,0 |
| bant_teorik_kapasite | Hesaplanan | Darboğaz sürecinin teorik kapasitesi | 1.296 adet/gün |
| bant_gerceklesen | Ondalık | Bandın fiili günlük ortalama çıktısı | 1.050 adet/gün |
| bant_verimliligi | Hesaplanan | | %81,0 |

---

### 8.3 Hesaplanan Metrikler (Her Ay, Her Atölye, Her Ürün Kategorisi)

Veri girildikten sonra aşağıdaki metrikler otomatik hesaplanır. Bir atölye birden fazla ürün üretiyorsa her kategori için ayrı, atölye toplamı için konsolide hesap yapılır.

```
─── DARBOĞAZ VE BANT KAPASİTESİ ────────────────────────────
Süreç Teorik Kapasitesi (adet/gün)
  = (net_çalışma_saat × 3.600) / darboğaz_çevrim_sn
  = 32.400 / darboğaz_çevrim_sn          [9 saatlik baz için]

Süreç Verimliliği (%)
  = gerçekleşen_günlük / teorik_kapasite × 100

Bant Darboğaz Süreci
  = MIN(teorik_kapasite) olan süreç
  → Bu sürecin kapasitesi = bandın gerçek üst sınırı

Bant Verimliliği (%)
  = bant_gerçekleşen / bant_teorik_kapasite × 100

Kapasite Boşluğu (adet/gün)
  = bant_teorik_kapasite − bant_gerçekleşen


Toplam Kapasite (dk/ay)
  = dikim_operatör × çalışma_günü × 540

Bant Kapasite (dk/ay)
  = bant_operatör × çalışma_günü × 540

─── MALİYET ─────────────────────────────────────────────────
Dakika Başı Maliyet (TL/dk)
  = toplam_gider / toplam_kapasite

Adet Başı Gider (TL) — model ve kategori bazlı
  = toplam_sam × dk_maliyeti / (verimlilik / 100)

─── VERİMLİLİK ──────────────────────────────────────────────
Hedef Üretim (adet/ay) — bant ve model bazlı
  = bant_kapasite / toplam_sam

Verimlilik (%) — bant bazlı
  = gerceklesen_uretim / hedef_uretim × 100

─── ATÖLYE TOPLAMI (çoklu ürün varsa konsolide) ─────────────
Toplam Gerçekleşen (adet/ay)
  = Σ gerceklesen_uretim (tüm bantlar, tüm kategoriler)

Ağırlıklı Ortalama Verimlilik (%)
  = Σ (verimlilik × hedef_uretim) / Σ hedef_uretim

─── MARJ ────────────────────────────────────────────────────
Net Marj (TL/ay) = hedef_ciro − toplam_gider
Marj Oranı (%)   = net_marj / hedef_ciro × 100
```

---

### 8.4 Analiz Boyutları (Yönetim Raporları)

Veriler toplandığında aşağıdaki perspektiflerden analiz yapılabilir:

| Analiz | Soru | Kaynak Tablolar |
|--------|------|-----------------|
| Atölye sıralaması | Hangi atölye en verimli? | Atölye + Aylık Üretim |
| Maliyet karşılaştırması | Adet maliyeti en düşük atölye? | Atölye + Aylık Gider + Üretim |
| Bant performansı | Hangi bantlar hedefi tutturuyor? | Bant + Aylık Üretim |
| Ürün kategorisi bazlı | Pantolon mı mont mu daha verimli dikiliyor? | WorkshopProduct + Üretim |
| Süreç mimarisi karşılaştırması | Farklı şablonlar arasında verimlilik farkı var mı? | ProcessTemplate + Üretim |
| Şehir bazlı analiz | İstanbul vs. diğer şehirler | Atölye (şehir) + tüm |
| Tip bazlı analiz | Entegre atölyeler daha mı verimli? | Atölye (tip) + tüm |
| Trend analizi | Verimlilik ay ay nasıl değişiyor? | Aylık Üretim (zaman serisi) |
| Model / SAM analizi | Hangi modelde maliyet en ağır? | ModelLibrary + Üretim |
| Kapasite boşluğu | Kullanılmayan kapasite ne kadar? | Atölye + Bant + Üretim |
| Süreç darboğazı | Hangi süreçte en fazla gecikme? | Bant (max_çevrim) + Üretim |

---

### 8.5 Teknoloji Seçenekleri

200 atölye + merkezi veri girişi + yönetim raporu senaryosu için uygun seçenekler:

| Seçenek | Avantaj | Dezavantaj | Uygunluk |
|---------|---------|------------|----------|
| **Google Sheets + Apps Script** | Sıfır maliyet, hızlı kurulum, bilinen arayüz | 200 atölyede yavaşlayabilir, formül karmaşıklığı | Başlangıç için uygun |
| **Airtable / Notion** | Hazır ilişkisel yapı, görsel dashboard | Aylık maliyet, özelleştirme sınırı | Orta ölçek için uygun |
| **Power BI + Excel/SharePoint** | Güçlü analiz, kurumsal entegrasyon | Microsoft lisansı gerekli | Kurumsal kullanım için uygun |
| **PostgreSQL + basit web arayüzü** | Tam kontrol, ölçeklenebilir, hızlı | Teknik kurulum gerektirir | Uzun vadeli en sağlam seçenek |

> **Öneri:** Başlangıçta Google Sheets ile pilot yapı kurulur, veri modeli oturursa PostgreSQL'e taşınır. MD dosyasındaki şema her iki yapıya da doğrudan uygulanabilir.

---

### 8.6 Aylık Veri Giriş Akışı

```
1. Atölye profili değiştiyse güncelle  (Tablo 1 + Tablo 2)
   ↓
2. O ayın gider kalemlerini gir        (Tablo 3)
   ↓
3. Her bant için üretim verisini gir   (Tablo 4)
   ↓
4. Sistem metrikleri otomatik hesapla  (Bölüm 8.3)
   ↓
5. Yönetim raporları oluştur           (Bölüm 8.4)
```

---

## 9. Tedarikçi Skorlama Sistemi

### 9.1 Amaç

200 fason atölyenin tek bir bileşik skorla karşılaştırılabilmesi için standart bir değerlendirme çerçevesi. Skor; sipariş dağıtımı, geliştirme önceliği ve atölye ilişkisinin sürdürülüp sürdürülmeyeceği kararlarında temel girdi olarak kullanılır.

### 9.2 Skor Bileşenleri ve Ağırlıkları

| Boyut | Bileşen | Ağırlık | Veri Kaynağı |
|-------|---------|:-------:|--------------|
| Verimlilik | Aylık ortalama bant verimliliği | %30 | Tablo 4 / Tablo 10 |
| Kalite | İlk geçiş kalite oranı (FPQ) | %25 | Tablo Kalite (Bölüm 11) |
| Teslimat | Zamanında teslimat oranı | %20 | Tablo Teslimat |
| Maliyet | Adet başı maliyet rekabetçiliği | %15 | Tablo 3 + Tablo 4 |
| Uyumluluk | Sosyal / yasal uyumluluk skoru | %10 | Bölüm 21 |
| **Toplam** | | **%100** | |

### 9.3 Skor Hesabı

```
Boyut Skoru (0–100) = (Gerçekleşen / Hedef) × 100  [max 100]

Bileşik Skor = Σ (Boyut Skoru × Ağırlık)
```

### 9.4 Performans Kademeleri

| Kademe | Skor Aralığı | Renk | Aksiyon |
|--------|-------------|:----:|---------|
| Stratejik Tedarikçi | 85 – 100 | Yeşil | Sipariş önceliği, ortaklık genişletme |
| Gelişen Tedarikçi | 70 – 84 | Mavi | Standart sipariş, gelişim desteği |
| İzlemede | 55 – 69 | Sarı | Uyarı, iyileştirme planı zorunlu |
| Risk Altında | 40 – 54 | Turuncu | Sipariş kısıtlama, yoğun takip |
| Kritik | 0 – 39 | Kırmızı | Sipariş durdurma değerlendirmesi |

### 9.5 Skor Tablosu Veri Alanları

| Alan | Tür | Açıklama |
|------|-----|----------|
| atölye_id | Referans | |
| yıl / ay | Tarih | |
| verimlilik_skoru | Hesaplanan | 0–100 |
| kalite_skoru | Hesaplanan | 0–100 |
| teslimat_skoru | Hesaplanan | 0–100 |
| maliyet_skoru | Hesaplanan | 0–100 |
| uyumluluk_skoru | Hesaplanan | 0–100 |
| bilesik_skor | Hesaplanan | Ağırlıklı ortalama |
| kademe | Hesaplanan | Stratejik / Gelişen / İzlemede / Risk / Kritik |
| onceki_ay_skor | Referans | Trend hesabı için |
| trend | Hesaplanan | Artış / Sabit / Düşüş |

---

## 10. Kalite Yönetimi

### 10.1 Temel Kalite Metrikleri

| Metrik | Tanım | Formül | Hedef |
|--------|-------|--------|-------|
| İlk Geçiş Kalitesi (FPQ) | İlk kontrolde geçen oran | Geçen adet / Toplam adet × 100 | ≥ %95 |
| Red Oranı | Reddedilen ürün oranı | Red adet / Üretim × 100 | ≤ %3 |
| Müşteri İade Oranı | Sevk sonrası dönen ürün | İade adet / Sevk adet × 100 | ≤ %1 |
| Yeniden İşlem Oranı | Düzeltme gerektiren ürün | Yeniden işlem / Üretim × 100 | ≤ %5 |
| Kusur Yoğunluğu | 100 üründe ortalama kusur | Toplam kusur / Üretim × 100 | — |

### 10.2 Hata Kategorileri

| Kategori | Örnekler |
|----------|----------|
| Dikiş hatası | Atlayan dikiş, yanlış mesafe, kırık iplik |
| Montaj hatası | Yanlış parça, ters montaj, hizalama bozukluğu |
| Kemer / fermuar hatası | Eğri kemer, sıkışan fermuar, pat bozukluğu |
| Temizlik hatası | İplik artığı, leke, yağ izi |
| Ütü hatası | Yanık, iz, düzensiz ütü |
| Etiket / paket hatası | Yanlış etiket, eksik beden kartı |
| Ölçü hatası | Beden dışı ölçü, asimetri |

### 10.3 Kalite Veri Tablosu

| Alan | Tür | Açıklama | Örnek |
|------|-----|----------|-------|
| kalite_id | Otomatik | | |
| atölye_id | Referans | | ATL-0042 |
| bant_id | Referans | | ATL-0042-B1 |
| yıl / ay | Tarih | | 2026 / 4 |
| kontrol_adedi | Tam Sayı | İncelenen ürün | 500 |
| ilk_gecis | Tam Sayı | İlk kontrolde geçen | 481 |
| red_adedi | Tam Sayı | Reddedilen | 10 |
| yeniden_islem | Tam Sayı | Düzeltme yapılan | 9 |
| hata_kategorisi | Metin | En sık hata tipi | Dikiş hatası |
| fpq | Hesaplanan | % | %96,2 |
| musteri_iade | Tam Sayı | O ay gelen iade | 3 |

### 10.4 Kalite — Maliyet İlişkisi

```
Yeniden İşlem Maliyeti (TL/ay)
  = yeniden_islem_adedi × toplam_sam × dk_maliyeti

Red Maliyeti (TL/ay)
  = red_adedi × (malzeme_maliyeti + işçilik_maliyeti)

Toplam Kalite Kayıp Maliyeti
  = Yeniden İşlem + Red + Müşteri İade İşleme
```

---

## 11. Duruş Analizi

### 11.1 Duruş Türleri

| Tür | Tanım | Örnekler |
|-----|-------|----------|
| Planlı duruş | Önceden bilinen, planlanmış | Yemek molası, temizlik, vardiya geçişi |
| Plansız duruş | Beklenmedik, anlık | Makine arızası, enerji kesintisi, malzeme bitişi |
| Organizasyonel duruş | Yönetimden kaynaklı | Model değiştirme, bant yeniden düzenleme, eğitim |
| Tedarik duruşu | Girdi gecikmesinden kaynaklı | Kumaş gecikmesi, aksesuar eksikliği |

### 11.2 Duruş Veri Tablosu

| Alan | Tür | Açıklama | Örnek |
|------|-----|----------|-------|
| duruş_id | Otomatik | | |
| bant_id | Referans | | ATL-0042-B1 |
| tarih | Tarih | | 2026-04-15 |
| başlangıç | Zaman | | 10:30 |
| süre_dk | Tam Sayı | Toplam duruş süresi (dk) | 45 |
| tür | Seçenek | Planlı / Plansız / Organizasyonel / Tedarik | Plansız |
| neden | Metin | | Overlok makinesi arızası |
| etkilenen_op | Tam Sayı | Duruştan etkilenen operatör sayısı | 8 |

### 11.3 Duruş Metrikleri

```
OEE (Genel Ekipman Etkinliği)
  = Kullanılabilirlik × Performans × Kalite

Kullanılabilirlik (%)
  = (Planlı Süre − Duruş Süresi) / Planlı Süre × 100

Aylık Duruş Oranı (%)
  = Toplam Duruş Dakikası / (Çalışma Günü × 540 × Bant Op.) × 100

Duruş Kayıp Kapasitesi (adet/ay)
  = Toplam Duruş Dk / Model SAM
```

### 11.4 Duruş Sınıflandırması

| Aylık Duruş Oranı | Değerlendirme |
|-------------------|---------------|
| ≤ %5 | Normal |
| %5 – %10 | Takip gerekli |
| %10 – %20 | Kritik — kök neden analizi yapılmalı |
| > %20 | Acil müdahale |

---

## 12. Model Değiştirme (Changeover) Yönetimi

### 12.1 Changeover Nedir

Bir üretim modelinden diğerine geçiş sürecinde yaşanan süre ve verimlilik kaybı. Pantolon bandında mont üretimine geçildiğinde makine ayarları, operatör görev dağılımı ve bant dengesi yeniden kurulur. Bu süre boyunca bant üretim yapmaz.

### 12.2 Changeover Bileşenleri

| Bileşen | Açıklama |
|---------|----------|
| Makine ayar süresi | Makine değişimi, iplik değişimi, kalıp takma |
| Bant dengeleme süresi | Operatör yerlerinin yeniden düzenlenmesi |
| İlk parti kontrol süresi | İlk üretilen partinin kalite onayı |
| Isınma süresi | Operatörlerin yeni modelde dengeleme dönemi |

### 12.3 Changeover Veri Tablosu

| Alan | Tür | Açıklama | Örnek |
|------|-----|----------|-------|
| co_id | Otomatik | | |
| bant_id | Referans | | ATL-0042-B1 |
| tarih | Tarih | | 2026-04-10 |
| onceki_model | Referans | | PNT-BAGGY-01 |
| yeni_model | Referans | | MONT-STD-01 |
| toplam_sure_dk | Tam Sayı | Changeover toplam süresi | 180 |
| makine_ayar_dk | Tam Sayı | | 60 |
| bant_dengeleme_dk | Tam Sayı | | 45 |
| ilk_parti_dk | Tam Sayı | | 30 |
| isinma_dk | Tam Sayı | | 45 |
| kayip_uretim | Hesaplanan | Changeover süresinde üretilemeyenler | 214 adet |

### 12.4 Changeover Maliyet Hesabı

```
Changeover Kayıp Kapasitesi (adet)
  = changeover_süre_dk / yeni_model_sam

Changeover Maliyeti (TL)
  = changeover_süre_dk × dk_maliyeti × etkilenen_op_sayısı

Aylık Changeover Yükü (%)
  = Σ changeover_süre / (çalışma_günü × 540) × 100
```

---

## 13. Atölye Riski ve Bağımlılık Analizi

### 13.1 Risk Boyutları

| Risk Türü | Tanım | Ölçüm |
|-----------|-------|-------|
| Kapasite konsantrasyonu | Tek atölyeye aşırı bağımlılık | Atölye payı / Toplam sipariş |
| Coğrafi konsantrasyon | Tek bölgede çok atölye | Şehir bazlı sipariş yoğunluğu |
| Ürün uzmanlığı riski | Sadece bir ürün tipinde uzman atölye | Alternatif tedarikçi sayısı |
| Finansal risk | Atölyenin marj baskısı | Marj oranı trendi |
| Performans düşüşü | Sürekli gerileyen skor | 3 aylık trend |

### 13.2 Risk Skoru Hesabı

```
Bağımlılık Oranı (%)
  = Atölyeye verilen aylık sipariş / Toplam aylık sipariş × 100

Konsantrasyon Riski
  > %20 → Yüksek risk
  %10–20 → Orta risk
  < %10  → Düşük risk

Alternatif Kapsama Oranı
  = Aynı ürün kategorisinde alternatif atölye sayısı / Min gerekli atölye sayısı
```

### 13.3 Risk Tablosu

| Alan | Tür | Açıklama |
|------|-----|----------|
| atölye_id | Referans | |
| yıl / ay | Tarih | |
| sipariş_payi | Hesaplanan | % — toplam portföydeki pay |
| alternatif_atolye_sayisi | Tam Sayı | Aynı kategoride yedek |
| finansal_marj_trendi | Seçenek | Artış / Sabit / Düşüş |
| performans_trendi | Seçenek | Artış / Sabit / Düşüş |
| risk_skoru | Hesaplanan | 0–100 (yüksek = riskli) |
| risk_seviyesi | Hesaplanan | Düşük / Orta / Yüksek / Kritik |

---

## 14. Kapasite Planlama ve Sipariş Dağıtımı

### 14.1 Sipariş Dağıtım Kriterleri

Bir siparişin hangi atölyeye verileceğine karar verilirken şu kriterler sırayla uygulanır:

| Öncelik | Kriter | Eşik |
|---------|--------|------|
| 1 | Ürün kategorisi uyumu | Atölyenin o kategoride aktif şablonu olmalı |
| 2 | Mevcut boş kapasite | Sipariş hacmi ≤ atölye boş kapasitesi |
| 3 | Bileşik skor eşiği | Skor ≥ 55 (İzlemede ve üstü) |
| 4 | Risk konsantrasyonu | Sipariş atandıktan sonra pay ≤ %25 |
| 5 | Coğrafi çeşitlendirme | Aynı şehirden ≤ %40 |

### 14.2 Kapasite Planlama Tablosu

| Alan | Tür | Açıklama |
|------|-----|----------|
| atölye_id | Referans | |
| ay | Tarih | |
| kategori_id | Referans | |
| toplam_kapasite | Hesaplanan | Teorik maks. adet/ay |
| rezerve_kapasite | Tam Sayı | Onaylı siparişler |
| bos_kapasite | Hesaplanan | Toplam − Rezerve |
| doluluk_orani | Hesaplanan | % |
| oneri_siparis_siniri | Hesaplanan | Boş kapasitenin %85'i |

### 14.3 Kapasite Uyarı Eşikleri

| Doluluk Oranı | Durum | Aksiyon |
|---------------|-------|---------|
| ≤ %60 | Düşük doluluk | Yeni sipariş öncelikli yönlendir |
| %60 – %85 | Optimal | Normal sipariş akışı |
| %85 – %95 | Yüksek | Dikkatli — gecikme riski |
| > %95 | Aşırı yük | Yeni sipariş verme |

---

## 15. Makine Parkı Takibi

### 15.1 Makine Kategorileri

| Kategori | Makine Türleri |
|----------|----------------|
| Dikiş makineleri | Singer (düz dikiş), çift iğne, zincir dikiş |
| Overlok makineleri | 3 iplik overlok, 4 iplik overlok, 5 iplik overlok (reçme) |
| Özel makineler | Kemer otomatı, cep otomatı, punteriz, paça kıvırma otomatı |
| Yardımcı makineler | Pres / tela yapıştırma, yakma makinesi, temizleme makinesi |
| UKP makineleri | Ütü masası, dedektör, jelatinleme |

### 15.2 Makine Parkı Tablosu

| Alan | Tür | Açıklama | Örnek |
|------|-----|----------|-------|
| makine_id | Kod | | ATL-0042-M001 |
| atölye_id | Referans | | ATL-0042 |
| kategori | Seçenek | | Overlok |
| marka_model | Metin | | Juki MO-6714 |
| üretim_yılı | Tam Sayı | | 2019 |
| yaş | Hesaplanan | Yıl | 7 |
| son_bakim | Tarih | | 2026-02-01 |
| bakim_periyodu_ay | Tam Sayı | | 3 |
| sonraki_bakim | Hesaplanan | | 2026-05-01 |
| durum | Seçenek | Çalışır / Arızalı / Bakımda | Çalışır |
| operasyon_ataması | Referans | Hangi operasyon tipi | Overlok |

### 15.3 Makine Yaşı ve Verimlilik İlişkisi

| Makine Yaşı | Beklenen Etki |
|-------------|---------------|
| 0 – 3 yıl | Optimal performans |
| 3 – 7 yıl | Normal, düzenli bakım yeterli |
| 7 – 12 yıl | Arıza riski artar, yedek parça maliyeti yükselir |
| > 12 yıl | Yenileme değerlendirmesi yapılmalı |

---

## 16. İşgücü Devir Oranı

### 16.1 Neden Kritik

Konfeksiyon sektöründe işgücü devir oranı doğrudan verimlilik kaybına yol açar. Yeni bir operatör tipik olarak 4–8 hafta içinde standart hıza ulaşır. Bu sürede bant dengesi bozulur, darboğazlar çoğalır.

### 16.2 Devir Oranı Hesabı

```
Aylık Devir Oranı (%)
  = (Ayrılan çalışan + İşe başlayan) / 2 / Ortalama çalışan × 100

Yıllık Devir Oranı (%)
  = Yıl içinde ayrılan / Ortalama çalışan × 100

Isınma Dönemi Kayıp Kapasitesi (dk/ay)
  = Yeni işe başlayan × ısınma_süresi_gün × 540 × (1 − beklenen_ısınma_verimliliği)
```

### 16.3 İşgücü Takip Tablosu

| Alan | Tür | Açıklama |
|------|-----|----------|
| atölye_id | Referans | |
| yıl / ay | Tarih | |
| toplam_calisan | Tam Sayı | Ay sonu itibariyle |
| ayrilanlar | Tam Sayı | O ay işten ayrılan |
| ise_baslayanlar | Tam Sayı | O ay işe başlayan |
| net_degisim | Hesaplanan | İşe başlayan − Ayrılan |
| devir_orani | Hesaplanan | % |
| isinma_surecindeki | Tam Sayı | Deneme süresindeki çalışan |
| ortalama_kidem_ay | Ondalık | Ortalama çalışma süresi |

### 16.4 Devir Oranı Referans Değerleri

| Yıllık Devir Oranı | Değerlendirme |
|--------------------|---------------|
| ≤ %20 | İyi — sektör ortalamasının altı |
| %20 – %40 | Normal sektör düzeyi |
| %40 – %60 | Yüksek — motivasyon ve çalışma koşulları incelenmeli |
| > %60 | Kritik — atölye istikrarsız |

---

## 17. Sezonluk Kapasite Planlaması

### 17.1 Konfeksiyonda Sezonluk Dalgalanma

| Dönem | Talep Durumu | Tipik Ay |
|-------|-------------|----------|
| İlkbahar koleksiyonu | Yoğun | Ocak – Mart |
| Yaz koleksiyonu | Orta | Nisan – Mayıs |
| Ölü sezon | Düşük | Haziran – Temmuz |
| Sonbahar / kış koleksiyonu | En yoğun | Ağustos – Kasım |
| Yılsonu | Düşük | Aralık |

### 17.2 Kapasite Esneklik Modeli

| Yöntem | Açıklama | Maliyet Etkisi |
|--------|----------|----------------|
| Fazla mesai | Mevcut çalışanla ek saat | +%25–50 işçilik |
| Geçici personel | Sezonluk işe alım | Isınma kayıpları |
| Alt fason | Taşma kapasitesini başka atölyeye yönlendirme | Koordinasyon maliyeti |
| Bant geçici genişleme | Küçük bantı büyük banta geçici dahil etme | Changeover maliyeti |

### 17.3 Sezon Kapasitesi Planlama Tablosu

| Alan | Tür | Açıklama |
|------|-----|----------|
| atölye_id | Referans | |
| yıl | Tam Sayı | |
| ay | Tam Sayı | |
| sezon | Seçenek | Yoğun / Orta / Düşük |
| planlanan_kapasite | Tam Sayı | Baz kapasite |
| ek_kapasite_yontemi | Seçenek | Fazla mesai / Geçici / Alt fason |
| ek_kapasite_miktari | Tam Sayı | Ek adet/ay |
| toplam_kapasite | Hesaplanan | |
| planlanan_siparis | Tam Sayı | O ay için alınmış sipariş |
| doluluk | Hesaplanan | % |

---

## 18. Veri Kalitesi ve Doğrulama Kuralları

### 18.1 Doğrulama Katmanları

Sisteme giren her veri üç katmandan geçer:

**Katman 1 — Format kontrolü:** Alan tipi, zorunluluk, değer aralığı.
**Katman 2 — Tutarlılık kontrolü:** Birbiriyle çelişen veriler.
**Katman 3 — Aykırı değer tespiti:** İstatistiksel olarak olağandışı girişler.

### 18.2 Alan Bazlı Doğrulama Kuralları

| Alan | Kural | Hata Mesajı |
|------|-------|-------------|
| dikim_operatör | > 0, ≤ 500 | Geçersiz operatör sayısı |
| çalışma_günü | 18 – 23 arasında | Çalışma günü aralık dışı |
| verimlilik | 0 – 130% | 130% üstü aykırı — kontrol et |
| darboğaz_çevrim_sn | 1 – 120 sn | Çevrim süresi mantıksız |
| toplam_sam | > 0, ≤ 60 dk | SAM değeri aralık dışı |
| fpq | 0 – 100% | Geçersiz kalite oranı |
| devir_oranı | 0 – 200% (aylık) | Aşırı devir — kontrol et |

### 18.3 Tutarlılık Kontrolleri

```
KURAL 1: Bant op. toplamı ≤ dikim_operatör
KURAL 2: gerçekleşen_üretim ≤ teorik_kapasite × 1.10
KURAL 3: toplam_gider > personel_gideri
KURAL 4: red_adedi + geçen_adet = kontrol_adedi
KURAL 5: Σ bant_hedef = atölye_günlük_hedef (±%5 tolerans)
```

### 18.4 Aykırı Değer Eşikleri

| Metrik | Uyarı Eşiği | Bloke Eşiği |
|--------|-------------|-------------|
| Verimlilik değişimi | Önceki aydan ±20% fark | ±40% fark |
| Darboğaz çevrim süresi | Önceki aydan ±30% fark | ±60% fark |
| Gider değişimi | Önceki aydan ±15% fark | ±30% fark |
| FPQ düşüşü | 5 puan düşüş | 15 puan düşüş |

### 18.5 Veri Kalite Skoru

```
Veri Kalite Skoru (0–100)
  = (Eksiksiz alan oranı × 0.40)
  + (Doğrulama kurallarını geçen oran × 0.40)
  + (Zamanında girilen veri oranı × 0.20)
```

---

## 19. Atölye Geliştirme Planı

### 19.1 Geliştirme Planı Tetikleyicileri

Aşağıdaki durumlardan biri oluştuğunda atölye için zorunlu geliştirme planı başlatılır:

- Bileşik skor 3 ay üst üste < 70
- Tek bir ayda skor 15 puan düşüş
- FPQ iki ay üst üste < %90
- Duruş oranı > %15
- İşgücü devir oranı yıllık > %60

### 19.2 Geliştirme Planı Tablosu

| Alan | Tür | Açıklama |
|------|-----|----------|
| plan_id | Otomatik | |
| atölye_id | Referans | |
| başlangıç_tarihi | Tarih | |
| hedef_bitiş | Tarih | |
| tetikleyici | Metin | Hangi koşul planı başlattı |
| sorun_alani | Seçenek | Verimlilik / Kalite / Duruş / Devir / Maliyet |
| mevcut_skor | Ondalık | Planın başındaki skor |
| hedef_skor | Ondalık | Planın sonundaki hedef skor |
| aksiyon_listesi | Metin | Somut adımlar |
| sorumlu | Metin | Takip eden kişi / ekip |
| son_ilerleme | Metin | En son durum notu |
| durum | Seçenek | Devam Ediyor / Tamamlandı / İptal |

### 19.3 Tipik Geliştirme Aksiyonları

| Sorun | Aksiyon |
|-------|---------|
| Düşük verimlilik | Bant dengeleme analizi, darboğaz operasyonu ikinci operatör atama |
| Yüksek red oranı | Kalite kontrol noktası ekleme, operatör eğitimi |
| Yüksek duruş | Önleyici bakım programı, yedek parça stoku |
| Yüksek devir | Maaş yapısı incelemesi, çalışma koşulları değerlendirmesi |
| Changeover süresi uzun | Standart changeover prosedürü oluşturma |

---

## 20. Sosyal Uyumluluk ve Sertifikasyon

### 20.1 Yasal Uyumluluk Kontrol Listesi

| Madde | Kontrol Sorusu | Evet / Hayır |
|-------|---------------|:------------:|
| SGK kaydı | Tüm çalışanlar kayıtlı mı? | |
| Asgari ücret | Tüm çalışanlar asgari ücrette mi? | |
| Fazla mesai sınırı | Haftalık 45 saat sınırı aşılıyor mu? | |
| İzin hakkı | Yıllık izin kullandırılıyor mu? | |
| İş güvenliği | İSG uzmanı var mı? | |
| Çocuk işçi | 15 yaş altı çalışan var mı? (Olmamalı) | |
| Yangın güvenliği | Yangın tüpü ve çıkış yeterli mi? | |

### 20.2 Sertifikasyon Durumu Tablosu

| Alan | Tür | Açıklama |
|------|-----|----------|
| atölye_id | Referans | |
| sertifika_turu | Metin | OEKO-TEX / GOTS / ISO 9001 / SA8000 vb. |
| kurum | Metin | Sertifika veren kuruluş |
| gecerlilik_bitis | Tarih | |
| durum | Seçenek | Geçerli / Süresi Dolmuş / Başvuruldu |

### 20.3 Uyumluluk Skoru

```
Uyumluluk Skoru (0–100)
  = (Yasal kontrol listesi geçen madde / Toplam madde) × 70
  + (Aktif sertifika bonusu) × 30

Sertifika Bonusu:
  ISO 9001 veya SA8000 → +15 puan
  OEKO-TEX veya GOTS  → +10 puan
  Her ek geçerli sertifika → +5 puan (max 30)
```

---

## 21. Benchmark ve Sektör Karşılaştırması

### 21.1 Sektör Referans Değerleri (Konfeksiyon)

| Metrik | Düşük | Sektör Ortalaması | İyi | Mükemmel |
|--------|------:|------------------:|----:|----------:|
| Bant verimliliği | < %65 | %70 – %75 | %80 – %88 | ≥ %90 |
| İlk geçiş kalitesi (FPQ) | < %88 | %90 – %93 | %95 – %97 | ≥ %98 |
| Red oranı | > %8 | %4 – %6 | %2 – %3 | ≤ %1 |
| Yıllık işgücü devri | > %60 | %35 – %50 | %20 – %30 | ≤ %15 |
| Duruş oranı | > %15 | %8 – %12 | %4 – %7 | ≤ %3 |
| Changeover süresi (bant) | > 4 saat | 2 – 3 saat | 1 – 2 saat | ≤ 1 saat |

> Referans değerler orta-büyük ölçekli konfeksiyon atölyeleri için genel kılavuz niteliğindedir. Ürün kategorisi ve bant boyutuna göre farklılaşabilir.

### 21.2 Atölye Sıralaması — Benchmark Pozisyonu

Her atölye için metrik bazında sektör pozisyonu belirlenir:

```
Benchmark Pozisyonu
  = (Atölye Değeri − Sektör Ortalaması) / Sektör Std. Sapması

Pozitif değer → Ortalamanın üstünde
Negatif değer → Ortalamanın altında
```

---

## 22. Raporlama Takvimi ve Sorumluluklar

### 22.1 Aylık Veri Giriş Takvimi

| Gün | Aksiyon | Sorumlu |
|-----|---------|---------|
| Ayın 1–3'ü | Önceki ay gider tablosu girişi | Merkezi ekip |
| Ayın 1–5'i | Önceki ay üretim verisi girişi | Merkezi ekip |
| Ayın 1–5'i | Darboğaz ve süreç kapasite verisi girişi | Merkezi ekip |
| Ayın 6'sı | Kalite ve duruş verisi girişi | Merkezi ekip |
| Ayın 7'si | Otomatik skor hesabı | Sistem |
| Ayın 8–10'u | Yönetim raporu hazırlanması | Analiz ekibi |
| Ayın 10'u | Yönetim sunumu | Yönetim |
| Ayın 11–15'i | Geliştirme planı güncellemeleri | Saha ekibi |

### 22.2 SLA Tanımları

| SLA | Kural | Gecikme Sonucu |
|-----|-------|----------------|
| Veri giriş SLA | Ayın 6'sına kadar tamamlanmalı | Atölye o ay skorsuz kalır |
| Kalite verisi SLA | Ayın 6'sına kadar | Kalite skoru 0 hesaplanır |
| Geliştirme planı güncelleme SLA | 15 günde bir | Sistem uyarı oluşturur |

### 22.3 Raporlar ve Hedef Kitlesi

| Rapor | İçerik | Kitle | Sıklık |
|-------|--------|-------|--------|
| Yönetim özet raporu | Top 10 / Bottom 10, genel trend | Üst yönetim | Aylık |
| Operasyonel detay raporu | Bant, süreç, darboğaz detayı | Operasyon ekibi | Aylık |
| Kalite raporu | FPQ, red oranı, hata kategorisi | Kalite ekibi | Aylık |
| Risk raporu | Bağımlılık, konsantrasyon, atölye riskleri | Tedarik yönetimi | Aylık |
| Geliştirme plan durumu | Aktif planlar, ilerleme | Saha ekibi | 15 günlük |
| Kapasite ön görü raporu | Önümüzdeki 3 ay kapasite durumu | Planlama ekibi | Aylık |

---

## 23. Fazla Mesai Takibi

### 23.1 Fazla Mesai Tanımı ve Sınırlar

| Tür | Tanım | Yasal Sınır (Türkiye) |
|-----|-------|----------------------|
| Günlük fazla mesai | Günde 7,5 saatin üstü | Günde 3 saat |
| Haftalık fazla mesai | Haftada 45 saatin üstü | Haftada 270 saat/yıl |
| Fazla mesai ücreti | Normal ücretin %50 fazlası | Zorunlu |

### 23.2 Fazla Mesai Veri Tablosu

| Alan | Tür | Açıklama |
|------|-----|----------|
| atölye_id | Referans | |
| yıl / ay | Tarih | |
| toplam_fm_saat | Ondalık | O ay toplam fazla mesai saati |
| fm_kisi_sayisi | Tam Sayı | Fazla mesai yapan kişi |
| kisi_basi_fm_saat | Hesaplanan | Ortalama kişi başı |
| fm_maliyeti | Hesaplanan | Ek işçilik maliyeti (TL) |
| sezon | Seçenek | Yoğun / Normal / Düşük |
| neden | Metin | Sipariş yetişme / Telafi / Diğer |

### 23.3 Fazla Mesai Maliyet Hesabı

```
Saatlik Normal Ücret
  = Aylık brüt / (çalışma_günü × 7,5)

Fazla Mesai Saatlik Ücret
  = Saatlik Normal Ücret × 1,50

Aylık Fazla Mesai Maliyeti (TL)
  = FM saat × FM saatlik ücret × FM yapan kişi sayısı
```

---

## 24. Tedarik Zinciri Entegrasyonu

### 24.1 Girdi Gecikme Etkisi

Tip B ve Tip C atölyeler için malzeme girişi üretimi doğrudan etkiler. Kumaş veya aksesuar gecikmesi bant duruşuna, dolayısıyla kapasite kaybına yol açar.

### 24.2 Tedarik Takip Tablosu

| Alan | Tür | Açıklama |
|------|-----|----------|
| atölye_id | Referans | |
| yıl / ay | Tarih | |
| malzeme_turu | Seçenek | Kumaş / Astar / Aksesuar / İplik |
| planlanan_giris | Tarih | Beklenen giriş tarihi |
| gercek_giris | Tarih | Fiili giriş tarihi |
| gecikme_gun | Hesaplanan | Gün farkı |
| etkilenen_uretim | Tam Sayı | Gecikme nedeniyle üretilemeyen adet |
| duruş_dk | Tam Sayı | Malzeme bekleme nedeniyle duruş süresi |

### 24.3 Tedarik Gecikmesi — Kapasite Kaybı

```
Tedarik Kayıp Kapasitesi (adet)
  = duruş_dk / model_sam

Tedarik Kayıp Maliyeti (TL)
  = duruş_mk × dk_maliyeti × etkilenen_op_sayısı
```

---

## 25. Terimler Sözlüğü (Glossary)

| Terim | Tanım |
|-------|-------|
| SAM (Standard Allowed Minute) | Bir operasyonu veya ürünü tamamlamak için standart çalışma koşullarında gereken dakika |
| MTM (Methods-Time Measurement) | İş hareketlerini analiz ederek teorik süre belirleme yöntemi |
| Pratik ölçüm | Atölyede fiilen yapılan zamanlama çalışmasıyla belirlenen süre |
| PİLİ katsayısı | Yorgunluk, bekleme ve kişisel ihtiyaçlar için eklenen tolerans (genellikle ×1,15) |
| Çevrim süresi | Bir operasyonu tamamlamak için geçen süre (saniye/adet) |
| Çevrim adedi | Ölçüm sırasında gözlemlenen tekrar sayısı |
| Darboğaz | Bir hattın veya sürecin üretim hızını kısıtlayan en yavaş operasyon ya da süreç |
| Bant dengesi | Operasyonların operatörler arasında eşit süre yüküyle dağıtılması |
| OEE (Overall Equipment Effectiveness) | Kullanılabilirlik × Performans × Kalite — ekipman etkinliğinin bileşik ölçüsü |
| FPQ (First Pass Quality) | İlk kontrolde herhangi bir düzeltme yapılmadan geçen ürün oranı |
| Changeover | Bir modelden diğerine üretim geçişi sırasında yaşanan hazırlık ve ayar süresi |
| Verimli çalışan | Doğrudan üretime katkı sağlayan operatör (dikim, kesim, UKP) |
| Endirekt çalışan | Üretime doğrudan katkısı olmayan personel (yönetim, servis, güvenlik) |
| Teorik kapasite | İdeal koşullarda, hiç duruş olmadan elde edilebilecek maksimum üretim miktarı |
| Bileşik skor | Birden fazla performans boyutunu ağırlıklı olarak birleştiren genel değerlendirme puanı |
| Kapasite boşluğu | Teorik kapasite ile gerçekleşen üretim arasındaki fark |
| Başabaş noktası | Toplam giderleri karşılayacak minimum üretim adedi veya ciro |
| Fason atölye | Kendi markası olmayan, sipariş bazlı üretim yapan dış tedarikçi atölye |

---

## 26. Versiyon Geçmişi

| Versiyon | Tarih | Değişiklik | Yapan |
|----------|-------|------------|-------|
| 1.0 | 2026-04 | İlk sürüm — atölye profili, maliyet, süreç, verimlilik bölümleri | — |
| 1.1 | 2026-04 | Gider tablosu gerçek verilerle güncellendi (2025–2026) | — |
| 1.2 | 2026-04 | Operasyon kütüphanesi eklendi (60+ operasyon, SAM verileri) | — |
| 1.3 | 2026-04 | Veri mimarisi ve 11 tablo şeması eklendi | — |
| 1.4 | 2026-04 | Süreç mimarisi, şablon ve çoklu ürün yapısı eklendi | — |
| 1.5 | 2026-04 | Bant süreç kapasitesi ve darboğaz tabloları eklendi | — |
| 2.0 | 2026-04 | Tam kapsam: skorlama, kalite, duruş, changeover, risk, kapasite planlama, makine, devir, sezon, veri kalitesi, geliştirme, uyumluluk, benchmark, raporlama, fazla mesai, tedarik, sözlük | — |

---

## 27. Platform Altyapısı ve Teknik Mimari

### 27.1 Genel Sistem Mimarisi

Sistem dört katmandan oluşur. Her katman bağımsız olarak değiştirilebilir — Faz 1'de tümü basit araçlarla karşılanır, Faz 3'te her katman güçlendirilir.

```
┌─────────────────────────────────────────────────────┐
│  SUNUM KATMANI (Frontend / Raporlama)               │
│  Dashboard · Veri giriş formu · Yönetim raporu      │
├─────────────────────────────────────────────────────┤
│  İŞ MANTIĞI KATMANI (Backend / Hesaplama)           │
│  Formüller · Skor hesabı · Doğrulama · Uyarılar     │
├─────────────────────────────────────────────────────┤
│  VERİ KATMANI (Database / Storage)                  │
│  Tablolar · İlişkiler · Yedekleme · Erişim kontrolü │
├─────────────────────────────────────────────────────┤
│  ENTEGRASYON KATMANI (API / Bağlantılar)            │
│  Dış sistemler · Import/Export · Bildirimler         │
└─────────────────────────────────────────────────────┘
```

---

### 27.2 Faz Bazlı Teknoloji Yığını

#### Faz 1 — Pilot (3 atölye)

| Katman | Araç | Neden |
|--------|------|-------|
| Veri depolama | Google Sheets | Sıfır kurulum, bilinen arayüz, formül destekli |
| Veri girişi | Google Forms | Mobil uyumlu, otomatik Sheets'e yazar |
| Hesaplama | Google Sheets formülleri | Anlık, görünür, değiştirilebilir |
| Raporlama | Manuel — Sheets grafikleri | Yeterli, hızlı |
| Kullanıcı yönetimi | Google Drive paylaşım izinleri | Basit, ücretsiz |
| **Tahmini maliyet** | **0 TL/ay** | |

#### Faz 2 — MVP (15 atölye)

| Katman | Araç | Neden |
|--------|------|-------|
| Veri depolama | Airtable veya Sheets (gelişmiş) | İlişkisel görünümler, link alanları |
| Veri girişi | Airtable Forms veya özel form | Daha iyi validasyon |
| Hesaplama | Apps Script (Sheets) veya Airtable Automations | Otomatik tetikleme |
| Raporlama | Google Looker Studio veya Power BI | Görsel dashboard, filtreli görünümler |
| Bildirimler | Google Apps Script + Gmail / Slack | SLA aşımı uyarıları |
| Kullanıcı yönetimi | Airtable workspace rolleri | Okuma / yazma ayrımı |
| **Tahmini maliyet** | **500–1.500 TL/ay** | Airtable Pro: ~$20/kullanıcı |

#### Faz 3 — Tam Ölçek (200 atölye)

| Katman | Araç | Neden |
|--------|------|-------|
| Veri depolama | PostgreSQL (bulut) | İlişkisel, hızlı sorgular, ölçeklenebilir |
| Veri girişi | Özel web uygulaması (Next.js / React) | Tam kontrol, validasyon, UX |
| Hesaplama | Backend API (Python / Node.js) | Karmaşık iş mantığı, test edilebilir |
| Raporlama | Metabase, Redash veya özel dashboard | SQL tabanlı, canlı veri |
| Bildirimler | Webhook + e-posta / Slack entegrasyonu | Otomatik SLA uyarıları |
| Kullanıcı yönetimi | Rol tabanlı erişim kontrolü (RBAC) | Yönetici / analist / izleyici |
| Altyapı | AWS / GCP / Azure veya Türkiye bulut | Veri egemenliği, yedekleme |
| **Tahmini maliyet** | **3.000–8.000 TL/ay** | Sunucu + lisans + bakım |

---

### 27.3 Veritabanı Şeması — SQL

Faz 3 veritabanı için tam tablo şeması. PostgreSQL sözdizimi kullanılmıştır.

```sql
-- TABLO 1: ATÖLYE
CREATE TABLE workshop (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) UNIQUE NOT NULL,       -- ATL-0042
    name            VARCHAR(100) NOT NULL,
    city            VARCHAR(50),
    district        VARCHAR(50),
    type            CHAR(1) CHECK (type IN ('A','B','C')),
    total_staff     INTEGER,
    sewing_staff    INTEGER,
    ukp_staff       INTEGER,
    cutting_staff   INTEGER,
    management      INTEGER,
    indirect        INTEGER,
    net_hours_day   NUMERIC(4,1) DEFAULT 9,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- TABLO 2: BANT
CREATE TABLE production_line (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(30) UNIQUE NOT NULL,       -- ATL-0042-B1
    workshop_id     INTEGER REFERENCES workshop(id),
    name            VARCHAR(50),
    line_type       VARCHAR(20) CHECK (line_type IN ('Normal','Küçük')),
    operator_count  INTEGER,
    daily_target    INTEGER,
    max_cycle_sec   NUMERIC(6,2),
    is_active       BOOLEAN DEFAULT TRUE
);

-- TABLO 3: ANA SÜREÇ KATALOĞU
CREATE TABLE master_process (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(10) UNIQUE NOT NULL,       -- ONB, ARB, MON
    name            VARCHAR(50) NOT NULL,
    group_type      VARCHAR(20),                       -- Alt / Üst / Her ikisi
    sort_order      INTEGER
);

-- TABLO 4: ÜRÜN KATEGORİSİ
CREATE TABLE product_category (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(10) UNIQUE NOT NULL,       -- PNT, MONT
    name            VARCHAR(50) NOT NULL,
    group_type      VARCHAR(20)                        -- Alt / Üst
);

-- TABLO 5: SÜREÇ ŞABLONU
CREATE TABLE process_template (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(100),
    category_id     INTEGER REFERENCES product_category(id),
    process_id      INTEGER REFERENCES master_process(id),
    sort_order      INTEGER,
    is_mandatory    BOOLEAN DEFAULT TRUE
);

-- TABLO 6: ATÖLYE–ÜRÜN KONFİGÜRASYONU
CREATE TABLE workshop_product (
    id              SERIAL PRIMARY KEY,
    workshop_id     INTEGER REFERENCES workshop(id),
    category_id     INTEGER REFERENCES product_category(id),
    template_id     INTEGER REFERENCES process_template(id),
    line_id         INTEGER REFERENCES production_line(id),
    start_date      DATE,
    is_active       BOOLEAN DEFAULT TRUE,
    notes           TEXT
);

-- TABLO 7: MODEL / SAM KÜTÜPHANESİ
CREATE TABLE model_library (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(30) UNIQUE NOT NULL,       -- PNT-BAGGY-01
    name            VARCHAR(100),
    category_id     INTEGER REFERENCES product_category(id),
    template_id     INTEGER REFERENCES process_template(id),
    process_id      INTEGER REFERENCES master_process(id),
    sam_minutes     NUMERIC(6,3),                      -- Dakika
    source          VARCHAR(20) CHECK (source IN ('Pratik','MTM')),
    valid_from      DATE
);

-- TABLO 8: AYLIK GİDER
CREATE TABLE monthly_expense (
    id              SERIAL PRIMARY KEY,
    workshop_id     INTEGER REFERENCES workshop(id),
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    work_days       SMALLINT,
    personnel       BIGINT,
    sgk             BIGINT,
    food            BIGINT,
    electricity     BIGINT,
    water           BIGINT,
    gas             BIGINT,
    transport       BIGINT,
    vehicle         BIGINT,
    cargo           BIGINT,
    machine_maint   BIGINT,
    thread          BIGINT,
    other           BIGINT,
    target_revenue  BIGINT,
    UNIQUE (workshop_id, year, month)
);

-- TABLO 9: AYLIK ÜRETİM
CREATE TABLE monthly_production (
    id              SERIAL PRIMARY KEY,
    line_id         INTEGER REFERENCES production_line(id),
    workshop_id     INTEGER REFERENCES workshop(id),
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL,
    model_id        INTEGER REFERENCES model_library(id),
    target_qty      INTEGER,
    actual_qty      INTEGER,
    work_days       SMALLINT,
    UNIQUE (line_id, year, month, model_id)
);

-- TABLO 10: BANT SÜREÇ KAPASİTESİ
CREATE TABLE line_process_capacity (
    id              SERIAL PRIMARY KEY,
    line_id         INTEGER REFERENCES production_line(id),
    workshop_id     INTEGER REFERENCES workshop(id),
    process_id      INTEGER REFERENCES master_process(id),
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL,
    model_id        INTEGER REFERENCES model_library(id),
    bottleneck_op   VARCHAR(100),
    bottleneck_sec  NUMERIC(6,2),
    actual_daily    NUMERIC(8,1)
);

-- TABLO 11: KALİTE
CREATE TABLE quality_record (
    id              SERIAL PRIMARY KEY,
    workshop_id     INTEGER REFERENCES workshop(id),
    line_id         INTEGER REFERENCES production_line(id),
    year            SMALLINT,
    month           SMALLINT,
    inspected_qty   INTEGER,
    first_pass_qty  INTEGER,
    rejected_qty    INTEGER,
    rework_qty      INTEGER,
    top_defect_cat  VARCHAR(100),
    customer_return INTEGER DEFAULT 0
);

-- TABLO 12: DURUŞ
CREATE TABLE downtime_record (
    id              SERIAL PRIMARY KEY,
    line_id         INTEGER REFERENCES production_line(id),
    occurred_at     TIMESTAMP NOT NULL,
    duration_min    INTEGER NOT NULL,
    downtime_type   VARCHAR(30) CHECK (downtime_type IN
                      ('Planlı','Plansız','Organizasyonel','Tedarik')),
    reason          TEXT,
    affected_ops    INTEGER
);

-- TABLO 13: CHANGEOVER
CREATE TABLE changeover_record (
    id              SERIAL PRIMARY KEY,
    line_id         INTEGER REFERENCES production_line(id),
    occurred_date   DATE,
    from_model_id   INTEGER REFERENCES model_library(id),
    to_model_id     INTEGER REFERENCES model_library(id),
    total_min       INTEGER,
    machine_adj_min INTEGER,
    balancing_min   INTEGER,
    first_batch_min INTEGER,
    warmup_min      INTEGER
);

-- TABLO 14: İŞGÜCÜ DEVİR
CREATE TABLE workforce_turnover (
    id              SERIAL PRIMARY KEY,
    workshop_id     INTEGER REFERENCES workshop(id),
    year            SMALLINT,
    month           SMALLINT,
    total_staff     INTEGER,
    left_count      INTEGER,
    joined_count    INTEGER,
    in_warmup       INTEGER,
    avg_tenure_mon  NUMERIC(5,1)
);

-- TABLO 15: TEDARİKÇİ SKOR
CREATE TABLE supplier_score (
    id              SERIAL PRIMARY KEY,
    workshop_id     INTEGER REFERENCES workshop(id),
    year            SMALLINT,
    month           SMALLINT,
    efficiency_sc   NUMERIC(5,1),
    quality_sc      NUMERIC(5,1),
    delivery_sc     NUMERIC(5,1),
    cost_sc         NUMERIC(5,1),
    compliance_sc   NUMERIC(5,1),
    composite_sc    NUMERIC(5,1),
    tier            VARCHAR(20),
    prev_sc         NUMERIC(5,1),
    trend           VARCHAR(10),
    UNIQUE (workshop_id, year, month)
);

-- GÖRÜNÜM: AYLIK VERİMLİLİK ÖZETİ
CREATE VIEW v_monthly_summary AS
SELECT
    mp.workshop_id,
    mp.year,
    mp.month,
    SUM(mp.actual_qty)                               AS total_actual,
    SUM(mp.target_qty)                               AS total_target,
    ROUND(SUM(mp.actual_qty)::NUMERIC /
          NULLIF(SUM(mp.target_qty),0) * 100, 1)    AS efficiency_pct,
    me.personnel + me.sgk + me.food + me.electricity
      + me.water + me.gas + me.transport + me.vehicle
      + me.cargo + me.machine_maint + me.thread
      + me.other                                     AS total_expense
FROM monthly_production mp
LEFT JOIN monthly_expense me
       ON me.workshop_id = mp.workshop_id
      AND me.year = mp.year
      AND me.month = mp.month
GROUP BY mp.workshop_id, mp.year, mp.month,
         me.personnel, me.sgk, me.food, me.electricity,
         me.water, me.gas, me.transport, me.vehicle,
         me.cargo, me.machine_maint, me.thread, me.other;
```

---

### 27.4 Kullanıcı Rolleri ve Erişim Kontrolü (RBAC)

| Rol | Kimler | Okuma | Yazma | Silme | Ayarlar |
|-----|--------|:-----:|:-----:|:-----:|:-------:|
| Süper Admin | Sistem yöneticisi | Tümü | Tümü | Tümü | Evet |
| Yönetim | Üst yönetim | Tümü | — | — | — |
| Analist | Analiz ekibi | Tümü | Hesaplama görünümleri | — | — |
| Veri Giriş Operatörü | Merkezi giriş ekibi | Kendi girdiği | Veri tabloları | — | — |
| Atölye İzleyici | Atölye sahibi (isteğe bağlı) | Sadece kendi | — | — | — |

> **İleriye dönük not — self-service veri girişi:** Sistem şu an merkezi ekip tarafından beslenmektedir. İleride atölyelerin kendi verilerini girmesi planlanırsa aşağıdaki iki karar şimdiden doğru alınmalıdır:
>
> 1. Her kayıtta `workshop_id` tutarlı biçimde bulunmalı — erişim kontrolü bu alana dayanır.
> 2. Kimlik doğrulama baştan atölye bazlı tasarlanmalı (her atölyeye ayrı kullanıcı/token).
>
> Bu iki kural şimdiden uygulanırsa merkezi → self-service geçişi veri temizliği gerektirmez; yalnızca yeni bir "Atölye Giriş Operatörü" rolü ve atölye bazlı bir giriş ekranı eklenir.

```
Erişim Matrisi (tablo bazlı):

Tablo                  Süper  Yönetim  Analist  Operatör  İzleyici
─────────────────────  ─────  ───────  ───────  ────────  ────────
workshop               R/W    R        R        R         R(kendi)
monthly_expense        R/W    R        R        R/W       —
monthly_production     R/W    R        R        R/W       R(kendi)
quality_record         R/W    R        R        R/W       —
supplier_score         R/W    R        R        —         R(kendi)
process_template       R/W    R        R        R         —
model_library          R/W    R        R        R         —
```

---

### 27.5 API Tasarımı (REST)

Faz 3 web uygulaması için temel endpoint listesi:

```
── ATÖLYELER ──────────────────────────────────────────────
GET    /api/workshops                  → Tüm atölyeler (filtreli)
GET    /api/workshops/:id              → Tek atölye detayı
POST   /api/workshops                  → Yeni atölye
PATCH  /api/workshops/:id              → Atölye güncelleme

── BANTLAR ────────────────────────────────────────────────
GET    /api/workshops/:id/lines        → Atölye bantları
POST   /api/lines                      → Yeni bant
PATCH  /api/lines/:id                  → Bant güncelleme

── AYLIK VERİ ─────────────────────────────────────────────
GET    /api/expenses?wid=&year=&month= → Gider sorgusu
POST   /api/expenses                   → Gider girişi
GET    /api/production?lid=&year=&month= → Üretim sorgusu
POST   /api/production                 → Üretim girişi

── ANALİTİK ───────────────────────────────────────────────
GET    /api/analytics/efficiency       → Verimlilik raporu
GET    /api/analytics/scores           → Skor karşılaştırması
GET    /api/analytics/bottlenecks      → Darboğaz analizi
GET    /api/analytics/trends           → Zaman serisi trendi

── UYARILAR ───────────────────────────────────────────────
GET    /api/alerts/active              → Aktif uyarılar
POST   /api/alerts/rules               → Uyarı kuralı ekleme

── DIŞA AKTARIM ───────────────────────────────────────────
GET    /api/export/monthly-report?year=&month= → PDF/Excel rapor
GET    /api/export/raw-data?from=&to=  → Ham veri CSV
```

---

### 27.6 Veri Depolama Detayları

#### Faz 1: Google Sheets Yapısı

5 sekmeli tek çalışma kitabı yeterlidir:

```
Sekme 1: workshops        → Atölye master tablosu
Sekme 2: lines            → Bant tablosu
Sekme 3: monthly_expense  → Aylık gider (satır = atölye × ay)
Sekme 4: monthly_prod     → Aylık üretim (satır = bant × ay × model)
Sekme 5: scores           → Otomatik skor hesabı (ARRAYFORMULA)
```

Naming convention: `ATL-{şehir kodu}{sıra}` — örn. `ATL-IST042`

#### Faz 2: Airtable Yapısı

```
Base: Atölye Yönetimi
├── Table: Workshops       (master)
├── Table: Lines           (linked to Workshops)
├── Table: Expenses        (linked to Workshops)
├── Table: Production      (linked to Lines)
├── Table: Quality         (linked to Lines)
├── Table: Scores          (linked to Workshops — automation)
└── Table: Alerts          (triggered by automations)

Airtable Automations:
→ Her ayın 7'si: Skor hesapla
→ Verimlilik < 70%: Uyarı oluştur
→ Skor < 55: Geliştirme planı tetikle
→ Veri girişi 6. güne kadar gelmezse: Hatırlatma e-postası
```

#### Faz 3: PostgreSQL + Bulut Depolama

```
Veritabanı sunucusu: AWS RDS PostgreSQL (db.t3.medium)
  → 2 vCPU, 4 GB RAM
  → 100 GB SSD depolama
  → Otomatik yedekleme (7 gün)
  → Multi-AZ yüksek erişilebilirlik

Uygulama sunucusu: AWS EC2 (t3.small) veya Railway / Render
  → Backend API (Node.js / Python FastAPI)
  → Statik frontend (Next.js → S3 + CloudFront)

Dosya depolama: AWS S3
  → Raporlar (PDF)
  → Ham veri exportları (CSV/Excel)
  → Yedekler

CDN: CloudFront veya Cloudflare
  → Statik varlıklar
  → Rapor dosyaları
```

---

### 27.7 Güvenlik Mimarisi

| Katman | Önlem | Araç / Yöntem |
|--------|-------|---------------|
| Kimlik doğrulama | Kullanıcı adı + şifre + 2FA | JWT token, Google OAuth |
| Yetkilendirme | Rol tabanlı erişim (RBAC) | Middleware kontrolü |
| Veri şifreleme (dinlenirken) | Veritabanı şifreleme | AES-256 |
| Veri şifreleme (aktarımda) | HTTPS zorunlu | TLS 1.3 |
| SQL enjeksiyonu | Parametreli sorgular | ORM kullanımı (Prisma/SQLAlchemy) |
| Veri yedekleme | Günlük otomatik yedek | RDS automated backup |
| Denetim kaydı | Tüm yazma işlemleri loglanır | audit_log tablosu |
| Kişisel veri | KVKK uyumu — atölye çalışan verisi anonimleştirilir | Maskeleme |

```sql
-- Denetim log tablosu
CREATE TABLE audit_log (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER,
    action      VARCHAR(20),    -- INSERT, UPDATE, DELETE
    table_name  VARCHAR(50),
    record_id   INTEGER,
    old_values  JSONB,
    new_values  JSONB,
    ip_address  INET,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

---

### 27.8 Yedekleme ve Felaket Kurtarma

| Strateji | Sıklık | Saklama | Yöntem |
|----------|--------|---------|--------|
| Tam yedekleme | Günlük | 30 gün | RDS snapshot |
| Artımlı yedek | Saatlik | 7 gün | WAL arşivleme |
| Çapraz bölge yedek | Haftalık | 90 gün | S3 cross-region |
| Sheets dışa aktarım | Haftalık | Manuel | CSV export |

```
RTO (Recovery Time Objective)  : ≤ 4 saat
RPO (Recovery Point Objective) : ≤ 1 saat
```

---

### 27.9 Entegrasyon Noktaları

Sistem şu dış sistemlerle bağlantı kurabilir:

| Sistem | Entegrasyon Türü | Veri Akışı | Öncelik |
|--------|-----------------|-----------|---------|
| ERP / Muhasebe yazılımı | API veya CSV import | Gider verileri otomatik çekilir | Yüksek |
| Sipariş yönetim sistemi | API | Kapasite doluluk verisi beslenir | Yüksek |
| E-posta (Gmail / Outlook) | SMTP | Otomatik SLA uyarıları | Orta |
| Slack / Teams | Webhook | Anlık uyarı bildirimleri | Orta |
| Power BI / Looker Studio | Canlı bağlantı | Raporlama dashboard | Orta |
| Excel | CSV/XLSX export | Yönetim raporları | Düşük |
| Google Sheets | Import/Export | Faz 1–2 geçiş köprüsü | Faz 1–2 |

---

### 27.10 Performans ve Ölçekleme

```
200 atölye × 12 ay × ~15 tablo = ~36.000 temel satır/yıl
+ üretim detayları: ~200 × 4 bant × 12 ay = ~9.600 satır/yıl
+ kalite + duruş + changeover: ~50.000 ek satır/yıl

Toplam yıllık veri hacmi: ~100.000–150.000 satır
→ PostgreSQL için trivial — dizin optimizasyonu yeterli

Kritik indeksler:
  CREATE INDEX idx_prod_workshop_month ON monthly_production(workshop_id, year, month);
  CREATE INDEX idx_expense_workshop_month ON monthly_expense(workshop_id, year, month);
  CREATE INDEX idx_score_workshop_month ON supplier_score(workshop_id, year, month);
  CREATE INDEX idx_downtime_line ON downtime_record(line_id, occurred_at);
```

---

### 27.11 İzleme ve Gözlemlenebilirlik

| İzleme Konusu | Araç | Uyarı Eşiği |
|---------------|------|-------------|
| Sunucu CPU | CloudWatch / Grafana | > %80 |
| Veritabanı bağlantıları | pg_stat_activity | > 80 bağlantı |
| API yanıt süresi | Datadog / New Relic | > 2 saniye |
| Hata oranı | Sentry | > %1 |
| Veri giriş SLA | Özel sorgu | Ayın 6'sında eksik atölye sayısı |
| Disk doluluk | CloudWatch | > %75 |

---

### 27.12 Tahmini Altyapı Maliyetleri

| Faz | Araçlar | Aylık Maliyet (TL) | Yıllık |
|-----|---------|-------------------:|-------:|
| Faz 1 (3 atölye) | Google Workspace | 0 | 0 |
| Faz 2 (15 atölye) | Airtable Pro + Looker Studio | 1.000–2.000 | 12.000–24.000 |
| Faz 3 (200 atölye) | AWS RDS + EC2 + S3 + CDN | 3.500–7.000 | 42.000–84.000 |
| Faz 3 (Türkiye bulutu) | Turkcell Bulut / BIGES | 2.500–5.000 | 30.000–60.000 |

> Türkiye'de faaliyet gösteren sistem için veri egemenliği nedeniyle yerli bulut (Turkcell Bulut, BIGES, UlakHaberleşme) tercih edilebilir. KVKK açısından avantajlıdır.

---

### 27.13 Proje Planı — Altyapı Güncellemesi

Bölüm 0'daki proje planına aşağıdaki altyapı görevleri eklenir:

**Faz 1 Altyapı Görevleri (Ay 1–2):**
- Google Workspace hesabı ve Drive klasör yapısı kurulumu (1 gün)
- Google Sheets 5 sekmeli master şablon oluşturma (2 gün)
- Google Forms veri giriş formu hazırlama (1 gün)
- Naming convention ve ID sistemi tanımlama (1 gün)
- Kullanıcı erişim izinleri tanımlama (1 gün)

**Faz 2 Altyapı Görevleri (Ay 3–5):**
- Airtable base kurulumu ve tablo ilişkileri (3 gün)
- Sheets → Airtable veri migrasyonu (2 gün)
- Looker Studio dashboard şablonu (3 gün)
- Otomatik skor hesabı automation kurulumu (2 gün)
- SLA uyarı mekanizması (e-posta / Slack) (2 gün)
- Kullanıcı rol tanımları ve erişim testi (1 gün)

**Faz 3 Altyapı Görevleri (Ay 6–12):**
- Teknoloji stack kararı ve prototip API (2 hafta)
- PostgreSQL şema kurulumu ve seed data (1 hafta)
- Backend API geliştirme (4 hafta)
- Frontend web uygulaması geliştirme (6 hafta)
- Airtable → PostgreSQL veri migrasyonu (1 hafta)
- Güvenlik testi ve penetrasyon testi (1 hafta)
- Yük testi (200 atölye senaryosu) (3 gün)
- Canlıya geçiş ve izleme kurulumu (1 hafta)

---

## 26. Versiyon Geçmişi

| Versiyon | Tarih | Değişiklik | Yapan |
|----------|-------|------------|-------|
| 1.0 | 2026-04 | İlk sürüm — atölye profili, maliyet, süreç, verimlilik bölümleri | — |
| 1.1 | 2026-04 | Gider tablosu gerçek verilerle güncellendi (2025–2026) | — |
| 1.2 | 2026-04 | Operasyon kütüphanesi eklendi (60+ operasyon, SAM verileri) | — |
| 1.3 | 2026-04 | Veri mimarisi ve 11 tablo şeması eklendi | — |
| 1.4 | 2026-04 | Süreç mimarisi, şablon ve çoklu ürün yapısı eklendi | — |
| 1.5 | 2026-04 | Bant süreç kapasitesi ve darboğaz tabloları eklendi | — |
| 2.0 | 2026-04 | Tam kapsam: skorlama, kalite, duruş, changeover, risk, kapasite planlama, makine, devir, sezon, veri kalitesi, geliştirme, uyumluluk, benchmark, raporlama, fazla mesai, tedarik, sözlük | — |
| 2.1 | 2026-04 | Platform altyapısı eklendi: SQL şema, API tasarımı, RBAC, güvenlik, yedekleme, entegrasyon, maliyet | — |

---

*Son güncelleme: Nisan 2026 — Versiyon 2.1*
