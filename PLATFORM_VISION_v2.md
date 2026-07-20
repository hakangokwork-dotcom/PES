# Ustabaşı — AI Endüstri Mühendisi

**Platform Vizyonu v2 — 2026-04-18**

> **Pozisyon:** Bu SaaS'ı alan atölye sahibi, **atölyesine endüstri mühendisi almış olur**.
> **Kategori:** ERP değil. AI-native atölye işletim sistemi. Küçük/orta konfeksiyon atölyesinin dijital ustabaşısı.

---

## 0. v1 → v2 Paradigma Kayması

| | **v1 (Nisan 2026)** | **v2 (Bu doküman)** |
|---|---|---|
| Pozisyon | "Atölye odaklı verimlilik sistemi" | **"AI Endüstri Mühendisi"** |
| Scope | Kapsamlı atölye yönetimi (ops + maliyet + plan + sipariş) | **Keskin: IE'in işi — ölçüm, analiz, raporlama, kaizen** |
| Rakip | Tanımsız | **IE maaşı (60-80K TL/ay) + danışman saati** |
| Farklılaşma | "Atölye kendi işine yarar" | **AI-native veri girişi + LLM query (patron dili)** |
| UX | Dashboard-centric | **Proaktif push + konuşma dili + mobil-first** |
| ERP (Logo/SAP) | Rakip/alternatif | **Rakip değil — entegre olur, kendi yapmaz** |
| SAP B1 | Model/benchmark olarak alındı | **Sadece veri modeli disiplini için benchmark, ürün kimliği değil** |

v1'in "atölye önce, merkez sonra" yönü **korunuyor ve keskinleşiyor**. Mini-SAP ya da "küçük ERP" değiliz — yeni bir kategori.

---

## 1. Kim İçin, Niye?

### 1.1 Hedef müşteri
- **Konfeksiyon atölyesi sahibi** (20-200 çalışan, B tipi: kesim+dikim öncelikli)
- Endüstri mühendisi **yok** (bütçe dışı veya bulmak zor)
- Bugünkü yönetim: Excel + WhatsApp + kağıt + gözlem
- Pazar sorunu: **IE'in göremediği kayıplar** (undetected inefficiencies, bad capacity decisions, quality leakage)

### 1.2 Değer önerisi tek cümle
> **"Ustabaşı atölyenizin gözü-kulağı-sayısal beyni olur. IE maaşının %15'ine, günde 24 saat çalışır."**

### 1.3 Persona boşluğu = ürünün varlık sebebi
IE'siz atölyede şu sorular cevapsız kalıyor:
- **Bu sipariş ne zaman çıkar, teslim tarihine yetişir mi?**
- **Siparişi hangi banta, hangi güne koyayım?**
- Bu ay 3 no.lu bantta verimlilik niye düştü?
- Hangi modelimiz karlı, hangisi zararlı?
- Kalite hatalarının TL maliyeti ne?
- Hangi operasyon darboğaz?
- Changeover süresini nasıl düşürürüz?

Ustabaşı bu soruları her gün, proaktif, **patron diliyle** cevaplar.

---

## 2. Scope — Dahil / Hariç

### ✅ DAHİL (IE'in işi)

| Modül | Ne yapar |
|---|---|
| **Master Data** (minimum) | Model, operasyon, SAM, bant, operatör |
| **Bant Planlama (L1a)** | Gantt, takvim, aşama (kesim/dikim/yıkama/ütü/paket), plan vs actual, atama önerisi |
| **Üretim Günlüğü (L1b)** | Vardiya × bant × adet × hata girişi (mobil/WhatsApp) |
| **OEE & Duruş** | Kullanılabilirlik × Performans × Kalite, Pareto |
| **Kalite Analizi** | FPQ, red oranı, kök-neden, hata kategorileri |
| **Darboğaz Tespiti** | Bant × süreç kapasite, balance skoru, öneri |
| **Changeover Analizi** | Model değişim süreleri, sıralama önerisi |
| **Birim Maliyet** | TL/dk, adet başı, model karlılık |
| **Kaizen Asistanı** | Trend + anomali + aksiyon önerisi |
| **Yönetim Raporu** | Haftalık/aylık özet, patron diliyle |

### ❌ HARİÇ (ERP işi — entegre oluruz, kendimiz yapmayız)

- Müşteri/sipariş yönetimi (CRM)
- Stok & inventory management
- Satınalma & tedarikçi fatura süreçleri
- Muhasebe, banka, vergi
- İnsan kaynakları (bordro, izin)
- Fiyat teklifi, satış süreçleri

Bu modüller Logo/Mikro/SAP B1'in işi. **Ustabaşı API'leri üzerinden entegre çalışır.**

---

## 3. Farklılaşma — İki Yarı, Bir Bütün

### 3.1 AI-native veri girişi (data capture)
Atölyede data girişi en büyük friction. AI bu köprüyü kurar:

| Kaynak | Otomasyon |
|---|---|
| Kumaş/aksesuar irsaliyesi (PDF/foto) | Vision LLM → `inventory_movement` + item doğrulama |
| Tech pack / model dosyası (PDF) | Vision LLM → `model_library` + operasyon listesi + SAM tahmini |
| Günlük üretim çizelgesi (el yazısı foto) | Vision LLM → `monthly_production` satırı |
| Kalite kontrol formu (foto) | Vision LLM → `quality_record` |
| **WhatsApp mesajı (foto/metin)** | Bot → JSON → onay → commit |

**Kural:** Hiçbir doküman auto-commit edilmez. Her zaman **insan onayı** (Notion AI tarzı accept/edit/reject). Kritik operasyonel veri için güvenlik şart.

### 3.2 AI-native analiz (LLM query)
Sistem verileri → Ustabaşı'nın doğal dil çıktısı:

- "Bu ay 3 no.lu bant 14 saat bekledi. Ana sebep: iplik makinesi. Geçen haftaya göre 2 saat fazla. Bakım takvimini kontrol et."
- "Polo modeli bu ay %18 red verdi, kök-neden yaka dikişi. 2 no.lu bantta yoğunlaşmış. Operatör rotasyonu öneririm."
- "Haftalık karın geçen haftaya göre 12K TL düşük. Sebep: changeover süreleri uzadı. Detaylı raporu gönderiyorum."

**Ustabaşı proaktiftir.** Patron data'ya bakmaz, **Ustabaşı patrona gelir** (WhatsApp/push).

### 3.3 Neden bu iki yarı inseparable?
- Analiz iyi veriye bağlı. Veri girişi zorsa, atölye sistem kullanmaz.
- Veri girişi kolaysa ama analiz jenerik kalırsa, sadece bir "dijital defter" olur.
- İkisi birlikte **AI-native ERP değil, AI-native operations brain** yaratır.

---

## 4. UX İlkeleri

### 4.1 Patron dili (jargon-free)
| ❌ Jargon | ✅ Konuşma dili |
|---|---|
| "Bant 3 availability %72" | "3 no.lu bant bu hafta 14 saat bekledi" |
| "OEE %58" | "Bantın verimli zamanı %58, saatte 42 dakika çalışıyor" |
| "FPQ %89" | "100 parçanın 11'i hatalı çıkıyor" |
| "Changeover 45 dk ortalama" | "Her model değişimde 45 dakika kaybediyorsun" |

Ürün iç katmanda teknik terimleri (OEE, SAM, AQL) kullanır — dış katmanda AI bunları çevirir.

### 4.2 Proaktif > pasif
- Push notification + WhatsApp özeti
- Haftalık rapor PDF otomatik gönderimi
- "Bir sorun var" alertleri, dashboard beklemez

### 4.3 Mobil-first
- PWA, bant sorumlusu telefon/tabletten girer
- Patron mobilde günlük 10 dk özet görür
- Web panel ikincil (IE/detaylı analiz için)

### 4.4 Onboarding friction = düşman
- Excel'den import wizard'ları
- Kumaş fotolarından kataloğa
- İlk 30 gün "Ustabaşı öğreniyor" modu (öneri kısıtlı, rapor açık)
- **Hizmet olarak onboarding** — ekip atölyede kurar

---

## 5. Rekabet — IE Maaşı vs Ustabaşı

### 5.1 Rakip değişiyor
- **Rakip değil:** Logo Tekstil, Mikro Tekstil, SAP B1 — onlar ERP kategorisi
- **Asıl rakip:** IE maaşı (60-80K TL/ay), danışman saati (5-8K/gün), atölyenin kendi "yokluk" durumu (hiç yapmamak)

### 5.2 Pricing çıpası
- IE maaşının %10-15'i = **6-12K TL/ay** hipotezi (2026 fiyatlarıyla)
- Pilot 3 atölyede test edilecek
- Self-serve SaaS değil — **hybrid (SaaS + onboarding hizmeti)**

### 5.3 ERP ile ilişki
Ustabaşı API'si üzerinden Logo/Mikro'ya entegre olur:
- Atölyenin mevcut ERP'si varsa: stok/sipariş/fatura orada kalır
- Ustabaşı sadece operasyonel katmanı alır
- Çift yönlü data sync (item master, production order, inventory movement)

---

## 6. SAP'nin Rolü — Benchmark, Model Değil

SAP B1'in **tablo yapısı ve disiplini** bizim için **referans**, ürün kimliği değil.

| SAP'den alınır | SAP'den alınmaz |
|---|---|
| Veri katmanlaması: master / transactional / analytical | 20 yıllık backward-compat bagajı |
| Terminoloji: Item, BOM, Routing, Work Order | Enterprise overhead (SAP lisans, danışman ordusu) |
| Süreç iskeletleri: O2C, P2P (ilham) | 200+ ekran UX geleneği |
| Modül ayrımı: MM/PP/SD/QM → bizde L0-L9 lego | Tıklanamayan, eğitimsiz kullanılamayan arayüz |

Kısaca: **tablo yapısı kopyala, UX'i sıfırdan yaz.**

---

## 7. Veri Modeli — Üç Katman

### 7.1 Master Data (sabit, atölye kurulumunda + değişiklikte)
`item`, `bom_header`, `bom_line`, `routing`, `workshop`, `production_line`, `operator`, `master_process`, `product_category`, `model_library`

### 7.2 Transactional (operasyonel, günlük/olay bazlı)
`work_order`, `operation_report`, `monthly_production`, `quality_record`, `downtime_record`, `changeover_record`, `inventory_movement` (minimum — kumaş parti takibi)

### 7.3 Analytical (türetilen, view veya materialized view)
`v_unified_model`, `v_workshop_performance`, `v_monthly_kpi`, `v_oee_daily`, `v_bottleneck_analysis`, `v_cost_variance`

### 7.4 Multi-tenancy (baştan)
**Her tabloda `tenant_id`.** Faz A'da atlandıysa, v2'nin ilk migrasyonu budur. Sonradan eklemek = cehennem.

---

## 8. MVP Scope (4-5 ay, tek atölye pilotu)

**Dahil:**
- L0: Master Data minimum (model + operasyon + SAM + bant + operatör)
- **L1a: Bant Planlama** (Gantt chart + takvim + aşama tracking + plan vs actual + atama önerisi)
- L1b: Üretim günlüğü (vardiya × bant × adet × hata, mobil + WhatsApp)
- L5: Kalite (FPQ, red, kök-neden Pareto)
- L6: OEE & duruş (otomatik hesap + uyarı)
- L7: Birim maliyet (TL/dk, adet başı, model karlılık)
- **AI:** Doküman ingest (en az 2 doc tipi) + doğal dil özet haftalık rapor + "siparişi hangi banta koyayım?" scheduling asistanı

**L1a bant planlamanın MVP'ye dahil edilme gerekçesi:** IE'in iş dağılımının %40'ı planlama. Ustabaşı bunu yapmazsa "IE alternatifi" iddiasının %40'ı eksik. Patronun #1 sorusu ("Bu sipariş ne zaman çıkar?") cevapsız kalır. Detay: [[vault/decisions/2026-04-18-bant-planlama-scope]].

**Hariç (Faz 2+):**
- L2 (stok), L3 (sipariş), L4 (satınalma), L8 (multi-atölye skorlama), L9 (cross-workshop BI)
- Operatör bazlı verimlilik (ileri seviye)
- Sezonluk planlama
- Performans panosu (TV modu)

**Pilot:** 1 atölye, 3 ay, ücretsiz + onboarding hizmeti. Fiyat hipotezi test ayında değerlendirilir.

---

## 9. Yol Haritası (Fazlar)

### Faz 1: Tek Atölye MVP (4-5 ay)
- Auth + multi-tenancy (tenant_id baştan)
- L0 Master Data minimum
- **L1a Bant Planlama** (Gantt + takvim + aşama + plan vs actual)
- L1b Üretim günlüğü (mobil + WhatsApp bot)
- L5 Kalite
- L6 OEE & duruş
- L7 Birim maliyet
- AI: 2 doküman tipi ingest + LLM haftalık özet + scheduling asistanı

### Faz 2: Ustabaşı Derinliği (3-4 ay)
- Model/SAM kütüphanesi otomatik genişleme (tech pack ingest)
- Darboğaz tespiti + bant dengeleme önerisi
- Changeover analizi
- Kaizen asistanı (anomali + öneri)
- Mobil PWA tamamı
- 3 atölye pilot

### Faz 3: ERP Entegrasyonu (2-3 ay)
- Logo/Mikro API adapter
- Item master sync
- Production order sync
- Inventory movement sync (fason için)
- 10 atölye onboarding

### Faz 4: Merkezi Görünüm (Çok Atölyeli)
- Ana firma admin paneli
- Multi-workshop benchmark
- Tedarikçi skorlama (eski PES scoring → revize)
- Sipariş dağıtım desteği
- 50+ atölye ölçek

### Faz 5: Ölçekleme
- Self-serve onboarding (hizmet minimize)
- WhatsApp bot tam otomasyon
- Sektörel benchmark veri havuzu
- 200 atölye hedefi

---

## 10. Riskler ve Varsayımlar

### 10.1 Scope dürüstlüğü
IE'in işinin %30'u **layout tasarım + ekip motivasyonu + süreç design + yeni hat kurulumu** — AI bunu yapamaz. Pazarlamada "IE'in yerini alır" yerine **"IE'in raporlama + analiz + izleme işinin %80'ini otomatlar"** demek. Aşırı söz = müşteri hayal kırıklığı = churn.

### 10.2 Veri kirliliği (onboarding dönemi)
İlk 3-6 ay atölyede veri düzensiz. AI önerileri yanlış çıkarsa güven erken kaybedilir.
**Mitigasyon:** "Ustabaşı öğreniyor" modu — öneri kısıtlı, sadece raporlama. Aylık eşik belirle.

### 10.3 Atölye sahibi adoption
Patron günde 10 dk bile bakmayabilir.
**Mitigasyon:** Proaktif push + WhatsApp mesajı + PDF rapor otomatik gönderimi. Dashboard ikincil.

### 10.4 Pricing testi
6-12K TL/ay hipotezi test edilmedi.
**Mitigasyon:** 10 atölye sahibi görüşmesi, pilot dönemi fiyat kabul testi.

### 10.5 ERP entegrasyonu karmaşıklığı
Logo/Mikro API'leri tam dokümante değil.
**Mitigasyon:** Faz 3'e ertele, ilk pilotlar stand-alone. Excel export/import minimum köprü.

### 10.6 Vision LLM maliyeti
Scan başı $0.01-0.10, ayda 10K scan → dikkat edilmeli.
**Mitigasyon:** Pricing modeline maliyet yansıt, çoklu tier (temel/pro). Self-hosted LLM Faz 4 opsiyonu.

---

## 11. İsim ve Marka (çalışma)

**Çalışma adı: Ustabaşı**

Adaylar:
- **Ustabaşı** (tercih) — Türkçe, sektör dili, AI'a karakter veriyor
- Tezgah — Kısa, Türkçe
- Koza — Tekstil metaforu
- Fason.ai — B2B SaaS tarzı
- AtölyeOS — Platform pozisyonu

Final karar pilot atölye onboarding'inde müşteri testi sonrası (Q3 2026).

---

## 12. Mevcut PES Kodu ile İlişki

Kod atılmaz, **extend edilir**. Mevcut PES'ten %70 tablo yeniden kullanılabilir:

### Korunur
`workshop`, `production_line`, `model_library`, `monthly_production`, `downtime_record`, `quality_record`, `master_process`, `product_category`, `band_process_capacity`, `band_bottleneck`

### Eklenir (v2 için)
`tenant` (multi-tenancy), `item_master`, `bom_header`, `bom_line`, `routing`, `operation_report`, `inventory_movement` (minimum), `ai_document_ingest` (scan kayıtları + onay durumu), `llm_query_log`, **`production_stage`, `work_order_stage`, `line_schedule`, `schedule_change_log`** (bant planlama — [[vault/decisions/2026-04-18-bant-planlama-scope]])

Not: `work_order` ve `changeover_record` zaten var (013_is_emri_ve_moduller.sql), genişletilir.

### Revize edilir
Faz A'da "scoring" Faz 4'te (multi-atölye) geri döner. MVP'de skor yok, sadece **atölye-içi performans**.

### Deprecate
`workshop_product`, `process_template` zaten Faz A'da ölü işaretlenmişti — v2'de silinir.

---

## 13. Sonuç — Tek Cümle

> **Ustabaşı, konfeksiyon atölyesine **yapay zeka çağının endüstri mühendisini** getirir: dokümanları o işler, metrikleri o izler, patrona o konuşur. ERP değil — ERP'nin yanında, operasyonun beynini tutar.**

---

*v1: PLATFORM_VISION.md — Nisan 2026 (korunur, tarihsel kayıt)*
*v2: Bu doküman — 18 Nisan 2026*
*v2 kararı: [[vault/decisions/2026-04-18-ustabasi-vision]]*
