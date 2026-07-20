# PES Hesaplama Sozlugu

> Platformdaki tum hesaplamalarin, metriklerin ve skorlama kurallarinin referans dokumani.
> Son guncelleme: Mayis 2026 (terminoloji disiplini eklendi)
> Kanonik kod kaynagi: `lib/pes/metrics-ontology.ts`
> Literatur referansi: `konfeksiyon_kpi_literatur_ontolojik_sozluk.md`

---

## 0. TERMINOLOJI DISIPLINI — Effectiveness vs Efficiency vs Productivity

> **KRITIK:** Konfeksiyon literaturunde "Verimlilik" terimi sahada genis tanimli kullanilir ve kavramsal kafa karisikligi yaratir. PES platformu dogru terminoloji ile uyumludur.

| Kavram (EN) | Turkce | Soru | Formul Sablonu | PES Karsiligi |
|---|---|---|---|---|
| **Effectiveness** | Etkililik | "Dogru seyi mi yapiyoruz?" | `Output / Goal` | verimlilik (Hedef Tutturma) |
| **Efficiency** | Verimlilik | "Dogru yapiyor muyuz?" | `Standard / Actual` | hat_verimliligi, operator_efficiency |
| **Productivity** | Uretkenlik | "Ne kadar uretiyoruz?" | `Output / Input` | pph, labour_productivity |

**Drucker (1974):** *Effectiveness is doing the right things. Efficiency is doing things right.*

**§1.1 "Verimlilik" sahasal kullanim notu:** Bu metrik aslinda literaturde **Production Attainment** (= Schedule Attainment, Plan Adherence) olarak gecer ve **EFFECTIVENESS** olcusudur. Saha jargonu uzerinden "Verimlilik" adi korunmustur ama gercek kaynak verimliligi `hat_verimliligi` (Line Efficiency) ile olculur. Detayli aciklama: konfeksiyon_kpi_literatur §2.

---

## 1. URETIM METRIKLERI

### 1.1 Verimlilik / Hedef Tutturma (%)

> **Literatur adi:** Production Attainment (Schedule Attainment, Plan Adherence)
> **Kategori:** Effectiveness (etkililik) — kaynak verimliligi DEGIL

```
Verimlilik = (Gercek Uretim / Hedef Uretim) x 100
```

| Girdi | Kaynak |
|-------|--------|
| Gercek Uretim | monthly_production.actual_qty |
| Hedef Uretim | monthly_production.target_qty |

**Ornek:** Hedef 3000, Gercek 2700 → %90

**Renk Kodlari:**
- >= %90 Yesil (Iyi)
- %70-89 Sari (Ortalama)
- < %70 Kirmizi (Kritik)

> **NOT:** Kaynak kullanim verimliligi icin `Hat Verimliligi` (§6.8) kullanilir. Iki kavram karistirilirsa, hedef dustugunde "verim arttı" gibi yaniltici sonuclar dogabilir.

---

### 1.2 Toplam Kapasite (dk/ay)

```
Kapasite(Çalışılabilir adam dakika) = Dikim Operatoru x Calisma Gunu x Net Saat x 60
```

| Girdi | Kaynak |
|-------|--------|
| Dikim Operatoru | workshop.sewing_staff |
| Calisma Gunu | monthly_expense.work_days |
| Net Saat | workshop.net_hours_day (varsayilan 9) |

**Ornek:** 185 op x 22 gun x 9 saat x 60 dk = 2,196,000 dk/ay

---

### 1.3 Bürüt Uretim Hedefi (Model Lead time'a göre) (adet/ay)

```
Bürüt Uretim Hedefi  = Toplam Kapasite (dk) / Model SAM (dk)
```

**Ornek:** 2,196,000 dk / 12.26 dk = 179,117 adet/ay

---

### 1.4 Darbogaz Kapasitesi (adet/gun)

```
Maks Gunluk = (Net Saat x 3600) / Darbogaz Suresi (sn)
```

| Girdi | Kaynak |
|-------|--------|
| Net Saat | workshop.net_hours_day |
| Darbogaz Suresi | En uzun operasyonun efektif suresi |

**Ornek:** (9 x 3600) / 56.55 sn = 573 adet/gun

---

## 2. MALIYET METRIKLERI

### 2.1 Toplam Gider (TL/ay)

```
Toplam = Personel + SGK + Yemek + Elektrik + Su + Dogalgaz
       + Servis + Arac + Kargo + Makina Bakim + Iplik + Diger
```

12 ana gider kalemi toplanir.

---

### 2.2 Dakika Maliyeti — Gercek (TL/dk)

```
TL/dk = Toplam Gider / (Verimli Operasyon x Calisma Gunu x Net Saat x 60)
```

| Atolye Tipi | Verimli Operasyon |
|-------------|-------------------|
| CMT | Dikim + Kesim + UKP |
| CM | Dikim + Kesim |
| MT | Dikim + UKP |
| M | Sadece Dikim |

**Ornek (CMT):** 1,648,000 TL / (288 op x 22 gun x 540 dk) = 0.48 TL/dk

---

### 2.3 Dakika Maliyeti — Sektor Referans (TL/dk)

Bolgesel sabit degerler (dk_maliyet tablosu):

| Bolge | Ocak 2026 | Nisan 2026 |
|-------|-----------|------------|
| 1. Bolge | 6.00 | 6.30 |
| 2. Bolge | 5.50 | 5.82 |
| 3. Bolge | 5.50 | 5.82 |
| 4. Bolge | 5.50 | 5.82 |
| 5. Bolge | 5.31 | 5.62 |
| 6. Bolge | 4.76 | 5.05 |

Atolyenin gercek TL/dk degeri bu referanslarla karsilastirilir.

---

### 2.4 Adet Basi Maliyet (TL)

```
Adet Maliyeti = (SAM (dk) x TL/dk) / (Verimlilik% / 100)
```

**Ornek:** (12.26 dk x 5.82 TL/dk) / (0.90) = 79.28 TL/adet

---

### 2.5 Net Marj (%)

```
Marj = ((Hedef Ciro - Toplam Gider) / Hedef Ciro) x 100
```

**Ornek:** ((2,200,000 - 1,648,000) / 2,200,000) x 100 = %25.1

---

### 2.6 Kisi Basi Aylik Gider (TL)

```
Kisi Basi = Toplam Gider / Toplam Personel
```

---

## 3. EDER MALIYET HESAPLAMALARI

### 3.1 Model Toplam Sure

```
Toplam Sure (sn) = SUM(tum alt operasyonlarin suresi)
Toplam Sure (dk) = Toplam Sure (sn) / 60
```

---

### 3.2 Eder Maliyet (1 adet)

```
Eder Maliyet (TL) = Toplam Sure (dk) x DK Maliyet (TL/dk)
```

DK Maliyet: Atolyenin tesvik bolgesine gore dk_maliyet tablosundan alinir.

**Ornek:** 12.26 dk x 5.82 TL/dk = 71.35 TL

---

### 3.3 Darbogaz (Bottleneck)

```
Darbogaz Suresi = MAX(Alt Operasyon Suresi / Kisi Sayisi)
```

Her alt operasyonun efektif suresi = sure / kisi. En yuksek deger darbogaz.

---

### 3.4 Gunluk Kapasite (Darbogaz)

```
Kapasite = Gunluk Calisma Suresi (sn) / Darbogaz Suresi (sn)
```

Varsayilan gunluk: 32,400 sn (9 saat)

---

### 3.5 Gunluk Kapasite (Hedef)

```
Kapasite = Gunluk Calisma Suresi (sn) / Hedef Cevrim Suresi (sn)
```

---

### 3.6 Bant Verimliligi

```
Verimlilik (%) = (Toplam Sure / (Darbogaz x Toplam Kisi)) x 100
```

---

### 3.7 Toplam Siparis Maliyeti

```
Toplam = Eder Maliyet (TL) x Siparis Adedi
```

---

### 3.8 Teklif Karsilastirma

```
Fark (TL) = Teklif Fiyati - Eder Maliyet
Fark (%) = (Fark / Eder Maliyet) x 100
```

Pozitif = teklif eder'den pahali, Negatif = teklif eder'den ucuz.

---

## 4. KALITE METRIKLERI

### 4.1 Ilk Gecis Kalitesi — FPQ (%)

```
FPQ = (Ilk Gecis Adedi / Kontrol Edilen Adet) x 100
```

| Deger | Degerlendirme |
|-------|---------------|
| >= %95 | Iyi (yesil) |
| %90-94 | Uyari (sari) |
| < %90 | Kritik (kirmizi) |

---

### 4.2 Red Orani (%)

```
Red Orani = (Red Edilen / Kontrol Edilen) x 100
```

---

## 5. OEE — Genel Ekipman Etkinligi

```
OEE = Kullanilabilirlik x Performans x Kalite
```

| Bilesen | Formul |
|---------|--------|
| Kullanilabilirlik | (Planlanan Sure - Plansiz Durus) / Planlanan Sure |
| Performans | (Gercek Uretim x Ideal CT) / Calisma Suresi |
| Kalite | (Toplam - Hatali) / Toplam |

| OEE | Sinif |
|-----|-------|
| > %85 | Dunya Standartlari |
| %75-85 | Iyi |
| %65-75 | Kabul Edilebilir |
| < %65 | Kabul Edilemez |

---

## 6. VSM METRIKLERI

### 6.1 Takt Time (sn/adet)

```
Takt Time = Net Kullanilabilir Sure (sn) / Gunluk Talep (adet)
```

```
Net Kullanilabilir Sure = (Vardiya dk - Mola dk) x 60
```

**Ornek:** (540 - 60) x 60 = 28,800 sn. Talep 350 → TT = 82.3 sn

**Kural:** Herhangi bir operasyonun CT > Takt Time ise o operasyon DARBOGAZ.

---

### 6.2 Efektif Cycle Time (sn)

```
Efektif CT = Operasyon Suresi (sn) / Kisi Sayisi
```

Bir operasyonda 2 kisi calisiyorsa efektif sure yarilara iner.

---

### 6.3 PCE — Deger Katma Orani (%)

```
PCE = Deger Katan Sure / Toplam Lead Time x 100
```

| Deger | Degerlendirme |
|-------|---------------|
| > %25 | Mukemmel (Lean) |
| %15-25 | Iyi |
| %5-15 | Ortalama |
| < %5 | Kritik |

**Deger Katan Sure (VA):** Urunu fiziksel olarak donusturen operasyonlar (dikis, overlok, utu)
**Lead Time:** VA + WIP bekleme sureleri

---

### 6.4 Hat Dengeleme Verimliligi (%)

```
Dengeleme = Toplam CT / (Operator Sayisi x Max CT) x 100
Dengeleme Kaybi = 100 - Dengeleme Verimliligi
```

| Deger | Degerlendirme |
|-------|---------------|
| > %85 | Iyi |
| %70-85 | Ortalama |
| < %70 | Kotu |

---

### 6.5 Gerekli Operator Sayisi

```
Gerekli Operator = Toplam SMV (sn) / Takt Time (sn)   (yukari yuvarla)
```

---

### 6.6 WIP Bekleme Suresi (Little's Law)

```
WIP Bekleme (sn) = WIP Miktari (adet) x Takt Time (sn)
```

---

### 6.7 Lead Time

```
Lead Time = Toplam Islem Suresi + Toplam WIP Bekleme Suresi
```

---

### 6.8 Hat Verimliligi (%)

```
Hat Verimliligi = (Toplam SMV x Gercek Uretim) / (Calisma Dk x Operator) x 100
```

| Deger | Degerlendirme |
|-------|---------------|
| > %88 | Mukemmel |
| %80-88 | Iyi |
| %70-80 | Ortalama |
| %60-70 | Zayif |
| < %60 | Kritik |

---

### 6.9 Yamazumi Durum

Her operasyon icin CT vs Takt Time karsilastirmasi:

| Durum | Kosul | Renk |
|-------|-------|------|
| Darbogaz | CT > Takt Time | Kirmizi |
| Risk | CT >= %80 Takt Time | Sari |
| Normal | CT < %80 Takt Time | Yesil |

---

## 7. DURUS METRIKLERI

### 7.1 Durus Kapasite Etkisi (%)

```
Etki = Toplam Durus (dk) / Toplam Kapasite (dk) x 100
```

Toplam Kapasite = Dikim Op x Calisma Gunu x Net Saat x 60

---

## 8. ISGUCU METRIKLERI

### 8.1 Devir Orani (%)

```
Devir = Aydan Ayrilan / Toplam Personel x 100
```

---

## 9. SKORLAMA SISTEMI

### 9.1 Bilesik Skor

```
Skor = Verimlilik x %30 + Kalite x %25 + Teslimat x %20 + Maliyet x %15 + Uyum x %10
```

| Bilesen | Agirlik | Hesaplama Kaynagi |
|---------|---------|-------------------|
| Verimlilik | %30 | Gercek/Hedef uretim orani |
| Kalite | %25 | FPQ orani |
| Teslimat | %20 | Gercek/Hedef uretim orani (zamaninda) |
| Maliyet | %15 | Marj orani (ciro vs gider) + 50 offset |
| Uyum | %10 | 100 - (Plansiz durus dk / 10) |

---

### 9.2 Kademe (Tier) Belirleme

| Skor Araligi | Kademe | Renk |
|-------------|--------|------|
| 85-100 | Stratejik | Yesil |
| 70-84 | Gelisen | Mavi |
| 55-69 | Izlemede | Sari |
| 40-54 | Risk | Turuncu |
| 0-39 | Kritik | Kirmizi |

---

### 9.3 Trend Belirleme

```
Fark = Mevcut Skor - Onceki Ay Skoru
```

| Fark | Trend |
|------|-------|
| > +2 | Artis (yukari ok) |
| -2 ile +2 arasi | Sabit |
| < -2 | Dusus (asagi ok) |

---

## 10. BENCHMARK SISTEMI

Merkezi hedef degerleri (pes_benchmark tablosu):

| Metrik | Hedef | Uyari | Kritik | Yon |
|--------|-------|-------|--------|-----|
| Verimlilik | %85 | %70 | %60 | Yuksek iyi |
| FPQ | %95 | %90 | %85 | Yuksek iyi |
| TL/dk | 6.00 | 7.00 | 8.00 | Dusuk iyi |
| Net Marj | %15 | %8 | %0 | Yuksek iyi |
| Durus Orani | %3 | %5 | %8 | Dusuk iyi |
| Isgucu Devir | %5 | %10 | %15 | Dusuk iyi |
| Genel Skor | 85 | 70 | 55 | Yuksek iyi |
| Red Orani | %1 | %3 | %5 | Dusuk iyi |

**Yon:**
- "Yuksek iyi" → deger >= hedef ise yesil
- "Dusuk iyi" → deger <= hedef ise yesil

---

## 11. KISALTMALAR

| Kisaltma | Aciklama |
|----------|----------|
| SAM | Standard Allowed Minute — standart izin verilen sure |
| SMV | Standard Minute Value — standart dakika degeri (= SAM) |
| FPQ | First Pass Quality — ilk gecis kalitesi |
| OEE | Overall Equipment Effectiveness — genel ekipman etkinligi |
| PCE | Process Cycle Efficiency — surec dongu verimliligi |
| VA | Value Added — deger katan (sure) |
| NVA | Non-Value Added — deger katmayan (sure) |
| WIP | Work In Process — yarimamul stok |
| CT | Cycle Time — dongu suresi |
| TT | Takt Time — musteri ritmi |
| LT | Lead Time — teslim suresi |
| CMT | Cut-Make-Trim — kesim+dikim+UKP |
| CM | Cut-Make — kesim+dikim |
| MT | Make-Trim — dikim+UKP |
| M | Make — sadece dikim |
| DK | Dakika |
| TL | Turk Lirasi |

---

*Bu dokuman PES platformundaki tum hesaplamalarin referansidir. Formul degisiklikleri lib/pes/calculations.ts ve lib/pes/scoring.ts dosyalarinda yapilir.*
