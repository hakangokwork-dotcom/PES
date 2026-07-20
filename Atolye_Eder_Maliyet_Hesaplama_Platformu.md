# Atölye Eder Maliyet Hesaplama Platformu

## 1. Genel Bakış

Bu platform, fason atölyelerin diktiği modellerin **dakika maliyeti (CMT - Cut Make Trim)** bazında eder fiyatını hesaplamak için tasarlanmıştır. Atölye, modelin tüm alt operasyonlarını, her operasyonun ortalama süresini (saniye cinsinden) ve o operasyonda çalışan kişi sayısını sisteme girer. Platform bu verilerden toplam süreyi, toplam kişi sayısını ve modelin eder maliyetini otomatik olarak hesaplar.

### 1.1 Temel Kavramlar

| Kavram | Açıklama |
|--------|----------|
| **Eder Maliyet** | Bir modelin dikim maliyetini ifade eder. Toplam süre × dakika maliyet değeri ile hesaplanır. |
| **Dakika Maliyet Değeri (DK Maliyet)** | Türkiye'deki teşvik bölgelerine göre belirlenen, 1 dakikalık üretimin TL karşılığı. |
| **CMT** | Cut-Make-Trim: Kesim, dikim ve aksesuar takma süreçlerinin toplam maliyeti. |
| **Bant** | Bir üretim hattında sıralı operasyonları gerçekleştiren çalışan grubunu ifade eder. |
| **Operasyon Grubu** | Birbiriyle ilişkili alt operasyonların toplandığı ana grup (ör. Yaka, Manşet Hazırlık, Kol Takma). |
| **Alt Operasyon** | Bir operasyon grubunun içindeki tekil iş adımı (ör. Yaka Tulumlama, Yaka Çevirme). |
| **TSS (Toplam Standart Süre)** | Bir alt operasyonun saniye cinsinden standart tamamlanma süresi. |
| **Kişi Sayısı** | İlgili operasyonda sabit olarak çalışan kişi adedi. 0,5 kişi gibi kesirli değerler alabilir (bir kişi iki operasyona paylaşımlı atanabilir). |
| **Bottleneck (Darboğaz)** | Banttaki en yavaş operasyon; bant hızını ve günlük kapasiteyi belirler. |

### 1.2 Dakika Maliyet Değerleri — Türkiye Bölgesel (Nisan 2026)

Aşağıdaki değerler 3D (3 vardiya dahil) hesaplamaya göre belirlenmiştir:

| Bölge | Ocak 2026 (₺/dk) | Nisan 2026 (₺/dk) | Artış Oranı |
|-------|-------------------|--------------------|-------------|
| 1. Bölge | 6,00 | **6,30** | %5,0 |
| 2. Bölge | 5,50 | **5,82** | %5,9 |
| 3. Bölge | 5,50 | **5,82** | %5,9 |
| 4. Bölge | 5,50 | **5,82** | %5,9 |
| 5. Bölge | 5,31 | **5,62** | %5,9 |
| 6. Bölge | 4,76 | **5,05** | %6,1 |

> **Not:** Dakika maliyet değerleri periyodik olarak güncellenir. Sistemde her dönem için ayrı maliyet tablosu tutulmalıdır.

---

## 2. Veri Giriş Yapısı

### 2.1 Model Tanım Bilgileri

Her model için aşağıdaki üst bilgiler girilir:

| Alan | Açıklama | Örnek |
|------|----------|-------|
| Model Adı | Modelin kısa tanımlayıcı adı | WASHA |
| PLM ID | Ürün yaşam döngüsü yönetim sistemi kodu | 1031027 |
| Sipariş Adedi | Toplam üretilecek adet | 3.700 |
| Bölge | Atölyenin bulunduğu teşvik bölgesi (1-6) | 3. Bölge |
| Dönem | Maliyet dönemi (ay/yıl) | Nisan 2026 |
| Günlük Çalışma Süresi (sn) | Bir vardiyada toplam üretim süresi | 32.400 (9 saat) |

### 2.2 Operasyon Giriş Tablosu

Atölye, modelin her bir operasyonunu aşağıdaki formatta girer:

| Sıra | Operasyon Grubu | Alt Operasyon Adı | Süre (sn) | Kişi Sayısı |
|------|-----------------|---------------------|-----------|-------------|
| 1 | Eşleme/Tasnif | Arka Beden Eşleme | 4,39 | 0,5 |
| 2 | Eşleme/Tasnif | Ön Beden Eşleme | 4,39 | 0,5 |
| 3 | Ayaklı Yaka | Yaka Tulumlama | 16,91 | 1 |
| 4 | Ayaklı Yaka | Yaka Çevirme | 7,49 | 1 |
| 5 | Ayaklı Yaka | Yaka Çima/Gaze | 9,31 | 1 |
| 6 | Ayaklı Yaka | Bedene Yaka Takma | 28,57 | 1 |
| 7 | Kol Takma | Kol Takma | 24,72 | 1 |
| 8 | Kol Takma | Çima | 25,37 | 1 |
| 9 | Yan Çatım | Uzun Kol Yan Çatım | 25,92 | 1 |
| 10 | Yan Çatım | Regula | 15,08 | 1 |
| ... | ... | ... | ... | ... |

#### 2.2.1 Kişi Sayısı Kuralları

- Tam zamanlı çalışan: **1** kişi
- İki operasyona paylaşımlı çalışan: **0,5** kişi (her operasyona 0,5 yazılır)
- Üç operasyona paylaşımlı çalışan: **0,33** kişi
- Yardımcı personel (yarım zamanlı destek): **0,5** kişi
- İki kişinin birlikte çalıştığı operasyon: **2** kişi

> **Kural:** Bir kişi birden fazla operasyona atanabilir. Atanan kesir toplamları o kişinin tam kapasitesini (1,0) geçmemelidir.

---

## 3. Hesaplama Formülleri

### 3.1 Operasyon Grubu Toplam Süresi

Bir operasyon grubundaki tüm alt operasyonların sürelerinin toplamı:

```
Operasyon_Grubu_Toplam_Süre (sn) = Σ Alt_Operasyon_Süre(i)
```

**Örnek — Ayaklı Yaka grubu:**

| Alt Operasyon | Süre (sn) |
|---------------|-----------|
| Yaka Tulumlama | 16,91 |
| Yaka Çevirme | 7,49 |
| Yaka Çima/Gaze | 9,31 |
| Yaka Gizli Çima | 7,91 |
| Yaka İşaret | 7,49 |
| Yaka Regula | 11,08 |
| Yaka Ayağı Çima | 6,36 |
| Yaka Ayağı Çizimi | 7,34 |
| Yaka Ayağı Gizli Gaze | 8,52 |
| Yaka Ayağı Kuşaklama | 12,73 |
| Yaka Ayağı Regula | 6,19 |
| Yaka Ara Ütü | 5,54 |
| Tela Yapıştırma (Pres) | 11,30 |
| Bedene Yaka Takma | 28,57 |
| **Toplam** | **146,75** |

### 3.2 Model Toplam Süresi (1 Adet)

Modeldeki tüm operasyon gruplarının toplam süresi:

```
Model_Toplam_Süre (sn) = Σ Operasyon_Grubu_Toplam_Süre(j)
```

### 3.3 Model Toplam Süresi — Dakika Cinsinden

```
Model_Toplam_Süre (dk) = Model_Toplam_Süre (sn) / 60
```

### 3.4 Bant Toplam Kişi Sayısı

```
Bant_Toplam_Kişi = Σ Kişi_Sayısı(i)    (tüm alt operasyonlar için)
```

### 3.5 Eder Maliyet Hesabı (1 Adet Model)

```
Eder_Maliyet (₺) = Model_Toplam_Süre (dk) × DK_Maliyet_Değeri (₺/dk)
```

**Örnek hesaplama:**
- Model toplam süre: 735,60 sn → 12,26 dk
- Atölye bölgesi: 3. Bölge → DK Maliyet: 5,82 ₺/dk
- **Eder Maliyet = 12,26 × 5,82 = 71,35 ₺**

### 3.6 Günlük Üretim Kapasitesi

#### a) Bottleneck'e Göre Kapasite

Banttaki en yavaş (en uzun süreli) operasyon bant hızını belirler:

```
Bottleneck_Süre (sn) = MAX(Alt_Operasyon_Süre / Kişi_Sayısı)

Günlük_Kapasite_Bottleneck = Günlük_Çalışma_Süresi (sn) / Bottleneck_Süre (sn)
```

#### b) Hedef Süreye Göre Kapasite

Belirli bir hedef süre (ör. 30 sn) belirlenerek günlük kapasite hesaplanır:

```
Günlük_Kapasite_Hedef = Günlük_Çalışma_Süresi (sn) / Hedef_Süre (sn)
```

**Örnek (DENOM modeli):**
- Günlük çalışma süresi: 32.400 sn
- Bottleneck süresi: 56,55 sn (Punteriz operasyonu)
- Günlük kapasite (bottleneck): 32.400 / 56,55 ≈ **573 adet**
- Günlük kapasite (30 sn hedef): 32.400 / 30 = **1.080 adet**

### 3.7 Toplam Sipariş Maliyet Hesabı

```
Toplam_Sipariş_Maliyet (₺) = Eder_Maliyet (₺) × Sipariş_Adedi
```

### 3.8 Bant Günlük ve Aylık Maliyet

```
Bant_Günlük_Maliyet (₺) = Bant_Toplam_Kişi × Kişi_Günlük_Maliyet (₺)

Bant_Aylık_Maliyet (₺) = Bant_Günlük_Maliyet × Çalışma_Günü_Sayısı
```

### 3.9 Bant Verimliliği

```
Bant_Verimlilik (%) = (Model_Toplam_Süre / (Bottleneck_Süre × Bant_Toplam_Kişi)) × 100
```

---

## 4. Atölye Fiyat Karşılaştırma

Platform, aynı model için birden fazla atölyeden alınan teklif fiyatlarını eder maliyet ile karşılaştırmaya olanak tanır.

| Alan | Açıklama |
|------|----------|
| Eder CMT (₺) | Sistem tarafından hesaplanan maliyet |
| Atölye Teklif Fiyatı (₺) | Fason atölyenin verdiği birim fiyat |
| Fark (₺) | Teklif Fiyatı − Eder CMT |
| Fark (%) | (Fark / Eder CMT) × 100 |

**Örnek karşılaştırma (WASHA modeli):**

| Kaynak | Birim Fiyat (₺) | Fark (Eder'e göre) |
|--------|------------------|--------------------|
| Eder CMT | 130,86 | — |
| Güneş Tekstil | 220,00 | +%68,1 |
| Melhan | 176,00 | +%34,5 |
| Hanbey | 190,00 | +%45,2 |
| Raperin | 197,00 | +%50,5 |

---

## 5. Referans: İş Akış Süresi Belirleme Sistemleri

Operasyon sürelerinin tespitinde üç ana sistem kullanılabilir:

### 5.1 REFA (İş ve Zaman Etüdü)

- Kronometre ile doğrudan gözleme dayalı ölçüm sistemidir.
- Operatör gözlemlenir, süre ölçülür, performans takdiri verilir.
- **Hesaplama:** Temel Zaman (tg) + Dağılım Zamanı (tv) + Dinlenme Zamanı (ter) = Standart Süre (te)
- Dağılım zamanı genellikle %12, dinlenme zamanı %8 olarak uygulanır.
- Yüksek adetli, standart model üretimlerinde tercih edilir.
- **Dezavantaj:** Üretim başlamadan süre tespiti yapılamaz; operatöre bağımlıdır.

### 5.2 MTM (Methods Time Measurement)

- Önceden belirlenmiş zaman standartlarına dayalı bir sistemdir.
- Her temel hareket (uzanmak, tutmak, getirmek, yerleştirmek, bırakmak) için standart TMU değerleri vardır.
- 1 TMU = 0,036 saniye; 27,8 TMU = 1 saniye.
- Üretim öncesinde süre tespiti yapılabilir.
- **Avantaj:** Operatör bağımsız, tekrarlanabilir sonuçlar verir.

### 5.3 GSD (General Sewing Data)

- Hazır giyim sektörüne özel geliştirilmiş, MTM tabanlı bir zaman öngörü sistemidir.
- 36 hareket kodu ile tüm dikim operasyonları tanımlanır.
- Alma, hizalama, biçim verme, kesme, bırakma, makine yönetimi ve kontrol kategorilerini kapsar.
- **Dikiş Kodu Yapısı:** `S 25 N A` → S: Dikiş, 25: cm uzunluk, N: Dikkat seviyesi, A: Duruş hassasiyeti.
- Bilgisayar destekli çalışır; veri tabanı ile entegre edilir.
- **Avantaj:** Hazır giyime özel, hızlı, pratik ve üretim öncesi kullanılabilir.

### 5.4 Sistemlerin Karşılaştırması

Aşağıdaki tablo, aynı operasyon (denim pantolon arka cep dikimi) için üç sistemle elde edilen sonuçları gösterir:

| Sistem | Değer | Süre (sn) |
|--------|-------|-----------|
| REFA | 25,08 YD | 15,05 |
| MTM | 440,45 TMU | 15,85 |
| GSD | 443,22 TMU | 15,94 |

> Üç sistem de birbirine yakın sonuçlar üretir. Ancak GSD, hazır giyim sektörüne özel tasarımı ve pratikliği ile tercih edilmelidir.

---

## 6. Veritabanı Yapısı

### 6.1 Tablolar

#### `modeller`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| model_id | SERIAL PK | Otomatik artan benzersiz ID |
| model_adi | VARCHAR(100) | Model adı |
| plm_id | VARCHAR(50) | PLM sistem kodu |
| siparis_adedi | INTEGER | Toplam sipariş adedi |
| bolge | SMALLINT | Teşvik bölgesi (1-6) |
| donem | VARCHAR(20) | Maliyet dönemi (ör. 2026-04) |
| created_at | TIMESTAMP | Kayıt tarihi |

#### `operasyon_gruplari`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| grup_id | SERIAL PK | Otomatik artan benzersiz ID |
| model_id | INTEGER FK | Bağlı model |
| grup_adi | VARCHAR(100) | Operasyon grubu adı (ör. Ayaklı Yaka) |
| sira_no | INTEGER | Sıralama numarası |

#### `alt_operasyonlar`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| operasyon_id | SERIAL PK | Otomatik artan benzersiz ID |
| grup_id | INTEGER FK | Bağlı operasyon grubu |
| operasyon_adi | VARCHAR(150) | Alt operasyon adı |
| sure_sn | DECIMAL(8,3) | Ortalama süre (saniye) |
| kisi_sayisi | DECIMAL(4,2) | Çalışan kişi sayısı (0,33 / 0,5 / 1 / 2 vb.) |
| sira_no | INTEGER | Operasyon grubu içi sıralama |
| makine_tipi | VARCHAR(100) | Kullanılan makine (opsiyonel) |
| notlar | TEXT | Ek açıklamalar |

#### `dk_maliyet`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| maliyet_id | SERIAL PK | Otomatik artan benzersiz ID |
| donem | VARCHAR(20) | Dönem (ör. 2026-04) |
| bolge | SMALLINT | Bölge (1-6) |
| dk_maliyet_tl | DECIMAL(6,2) | Dakika maliyet değeri (₺) |

#### `atolye_teklifleri`
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| teklif_id | SERIAL PK | Otomatik artan benzersiz ID |
| model_id | INTEGER FK | Bağlı model |
| atolye_adi | VARCHAR(100) | Atölye adı |
| teklif_fiyat_tl | DECIMAL(10,2) | Birim teklif fiyatı (₺) |
| notlar | TEXT | Ek açıklama (ör. kapüşon dahil/hariç) |

### 6.2 View: Model Maliyet Özet

```sql
CREATE VIEW v_model_maliyet_ozet AS
SELECT
    m.model_id,
    m.model_adi,
    m.plm_id,
    m.siparis_adedi,
    m.bolge,
    SUM(ao.sure_sn) AS toplam_sure_sn,
    SUM(ao.sure_sn) / 60.0 AS toplam_sure_dk,
    SUM(ao.kisi_sayisi) AS toplam_kisi,
    MAX(ao.sure_sn / ao.kisi_sayisi) AS bottleneck_sn,
    dm.dk_maliyet_tl,
    (SUM(ao.sure_sn) / 60.0) * dm.dk_maliyet_tl AS eder_maliyet_tl,
    32400.0 / MAX(ao.sure_sn / ao.kisi_sayisi) AS gunluk_kapasite_bottleneck
FROM modeller m
JOIN operasyon_gruplari og ON og.model_id = m.model_id
JOIN alt_operasyonlar ao ON ao.grup_id = og.grup_id
JOIN dk_maliyet dm ON dm.donem = m.donem AND dm.bolge = m.bolge
GROUP BY m.model_id, m.model_adi, m.plm_id, m.siparis_adedi, m.bolge, dm.dk_maliyet_tl;
```

---

## 7. API Yapısı (REST)

### 7.1 Modeller

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/modeller` | Tüm modelleri listele |
| GET | `/api/modeller/{id}` | Tek model detayı (operasyonlar dahil) |
| POST | `/api/modeller` | Yeni model oluştur |
| PUT | `/api/modeller/{id}` | Model bilgilerini güncelle |
| DELETE | `/api/modeller/{id}` | Modeli sil |

### 7.2 Operasyonlar

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/modeller/{id}/operasyonlar` | Modelin tüm operasyonlarını getir |
| POST | `/api/modeller/{id}/operasyonlar` | Operasyon grubu ve alt operasyonları ekle |
| PUT | `/api/operasyonlar/{op_id}` | Alt operasyon güncelle (süre, kişi) |
| DELETE | `/api/operasyonlar/{op_id}` | Alt operasyon sil |

### 7.3 Maliyet Hesaplama

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/modeller/{id}/maliyet` | Hesaplanmış eder maliyet sonucunu getir |
| GET | `/api/modeller/{id}/karsilastirma` | Atölye teklifleri ile eder karşılaştırması |

### 7.4 Dakika Maliyet

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/dk-maliyet?donem=2026-04` | Döneme göre tüm bölge maliyetleri |
| POST | `/api/dk-maliyet` | Yeni dönem maliyet değeri ekle |

---

## 8. Kullanıcı Arayüzü Ekranları

### 8.1 Model Tanımlama Ekranı
- Model adı, PLM ID, sipariş adedi, bölge ve dönem seçimi.
- "Operasyon Ekle" butonu ile satır bazlı veri girişi.

### 8.2 Operasyon Giriş Tablosu
- Dinamik tablo: Satır ekleme/silme/sıralama.
- Her satırda: Operasyon Grubu (dropdown veya serbest metin), Alt Operasyon Adı, Süre (sn), Kişi Sayısı.
- Satır sonunda otomatik hesaplanan: Kişi Başı Süre = Süre / Kişi Sayısı.
- Tablo altında otomatik toplam satırı: **Toplam Süre (sn)**, **Toplam Süre (dk)**, **Toplam Kişi Sayısı**.
- Bottleneck satırı kırmızı ile vurgulanır.

### 8.3 Maliyet Özet Kartı
- Model Toplam Süre (sn / dk)
- Bant Toplam Kişi Sayısı
- Seçili Bölge ve DK Maliyet (₺/dk)
- **Eder Maliyet (₺)** — büyük font ile vurgulanır
- Günlük Kapasite (bottleneck'e göre)
- Günlük Kapasite (hedef süreye göre, ayarlanabilir)

### 8.4 Atölye Karşılaştırma Ekranı
- Birden fazla atölyenin teklif fiyatlarını girme.
- Eder maliyet ile yüzdesel fark gösterimi.
- Sıralama: En uygun teklif üstte, en pahalı altta.

---

## 9. İş Akışı

```
1. Kullanıcı yeni model oluşturur
       ↓
2. Model bilgilerini girer (ad, PLM ID, adet, bölge, dönem)
       ↓
3. Operasyon gruplarını ve alt operasyonları girer
   - Her alt operasyon için: süre (sn) + kişi sayısı
       ↓
4. Sistem otomatik hesaplar:
   - Grup toplamları
   - Model toplam süre (sn ve dk)
   - Toplam kişi sayısı
   - Bottleneck operasyon
   - Eder maliyet (₺)
   - Günlük kapasite
       ↓
5. Kullanıcı atölye tekliflerini girer
       ↓
6. Sistem eder maliyet ile teklif fiyatlarını karşılaştırır
       ↓
7. Karar: Uygun atölye seçimi
```

---

## 10. Örnek Hesaplama — TRAIT Modeli

### Giriş Verileri

- **Model Adı:** TRAIT
- **Bölge:** 3. Bölge
- **Dönem:** Nisan 2026
- **DK Maliyet:** 5,82 ₺/dk

### Operasyon Özet Tablosu

| Operasyon Grubu | Toplam Süre (sn) | Tahmini Kişi |
|-----------------|-------------------|--------------|
| Ayaklı Yaka | 146,75 | 7 |
| Manşet Hazırlık | 162,80 | 8 |
| Kendinden Dönüşlü Pat | 104,11 | 5 |
| Kol Takma | 64,34 | 3 |
| Yan Çatım | 41,01 | 2 |
| Tutturma | 40,02 | 2 |
| V Cep | 37,36 | 2 |
| Montaj | 39,10 | 2 |
| Biyeli Kol Yırtmacı | 28,90 | 2 |
| Omuz Çatım | 26,18 | 1 |
| Etek Temiz Kıvırma | 18,05 | 1 |
| Etiket/Talimat | 15,38 | 1 |
| İç-Dış Çevirme | 11,59 | 1 |
| **TOPLAM** | **735,60** | **37** |

### Hesaplama

```
Model Toplam Süre = 735,60 sn = 12,26 dk
Eder Maliyet = 12,26 dk × 5,82 ₺/dk = 71,35 ₺
```

---

## 11. Teknik Notlar

### 11.1 Süre Giriş Standardı
- Tüm süreler **saniye (sn)** cinsinden girilir.
- Ondalık ayracı olarak **virgül** veya **nokta** kabul edilir.
- Minimum süre: 0,1 sn. Maksimum süre: 999,999 sn.

### 11.2 Operasyon Grubu Şablonları
- Sık kullanılan operasyon grupları şablon olarak kaydedilebilir.
- Yeni model oluşturulurken mevcut bir modelden operasyonlar kopyalanabilir.

### 11.3 Veri Doğrulama Kuralları
- Süre alanı boş bırakılamaz ve 0'dan büyük olmalıdır.
- Kişi sayısı 0'dan büyük olmalıdır (minimum 0,1).
- Her modelde en az 1 operasyon grubu ve 1 alt operasyon bulunmalıdır.

### 11.4 Excel Import/Export
- Operasyon tablosu Excel'den toplu olarak import edilebilir.
- Hesaplanmış sonuçlar Excel'e export edilebilir.
- Import formatı: Operasyon Grubu | Alt Operasyon | Süre (sn) | Kişi Sayısı

---

## 12. Gelecek Geliştirmeler

- GSD kodlarına dayalı otomatik süre hesaplama modülü
- Makine tipi bazlı operasyon filtreleme
- Bant dengeleme optimizasyonu (bottleneck minimize)
- Geçmiş model verilerinden benzer model süre tahmini
- Atölye performans skorlama (teslim süresi, kalite, fiyat)
- Dashboard: Model bazlı maliyet trendi ve bölgesel karşılaştırma
