# ProMode-A — Ticari Ürün Vizyonu (v3)

**2026-04-27 · v2'den v3'e ticari pivot**

> **v2:** "AI Endüstri Mühendisi" — atölye sahibine IE alternatifi (ürün kimliği)
> **v3:** Aynı kimliğin **ticari SaaS ürünü** olarak paketlenmesi. Atölye web üzerinden abone olur, ihtiyaç duyduğu modülleri seçer, faturayla kullanır. Ana üretici (parent manufacturer) toplu lisansla alt fasonlarına aktarabilir.

---

## 0. v2 → v3 Pivotu

| | **v2 (ProMode-A Vision — Vision)** | **v3 (Ticari SaaS — Bu doküman)** |
|---|---|---|
| Tip | İçeriden geliştirilen sistem (development tool) | **Müşteri tarafından satın alınan SaaS** |
| Kullanıcı | Tek atölye, manuel kurulum | Self-serve abonelik + onboarding hizmeti |
| Modül kullanımı | Hepsi açık | **Modül başına abone ol** (subscription) |
| Müşteri tipi | "Atölye" | **2 segment**: Bireysel atölye + Ana üretici (toplu) |
| Faturalandırma | Yok | **Aylık/yıllık abonelik** + onboarding ücreti |
| Deploy | Tek instance, dev mode | **Multi-tenant SaaS**, her atölye = izole tenant |
| Marketing | Yok | **Web sitesi + landing + signup funnel** |
| İlk müşteri kaynağı | Pilot yakın çevre | Web'den + satış ekibi |

**v3'ün koruduğu (v2'den)**:
- ProMode-A pozisyonu (AI Endüstri Mühendisi)
- Bant planlama, OEE, kalite, maliyet özellikleri
- AI farklılaşma noktası (doc ingest + LLM query)
- Kod tabanı (mevcut PES) — extend edilir, atılmaz

**v3'ün yeni getirisi**:
- Multi-tenancy (her atölyenin verisi izole)
- Abonelik modeli (modül başına)
- Self-serve onboarding
- Toplu lisans (parent manufacturer)
- Marketing/satış funnel'ı

---

## 1. Strateji Sırası — "Önce Bireysel Değer, Sonra Toplu"

> **Atölye PES'ten bağımsız, kendi çıkarı için kullanır.** Bireysel değer kanıtlanmadan ana üretici kanalı açılmaz.

### Aşama A — Bireysel Atölye (Faz 1-2)
- Hedef: Tek atölye, ayda 6-12K TL ödeyerek **kendi verimliliği için** kullanır
- Başarı kriteri: 3 pilot atölye 90 gün içinde kullanmaya devam eder + en az 1 ölçülebilir kazanç gösterir (örn. %5 verimlilik artışı, %20 hata düşüşü)
- **Bu aşama tamamlanmadan ana üretici kanalı açılmaz**

### Aşama B — Ana Üretici (Faz 3+)
- Hedef: Bir ana üretici "5 fason için lisans" veya "100 fason için lisans" satın alır
- Bireysel atölyeler hâlâ doğrudan da abone olabilir
- Ana üreticinin kendi ek dashboard'u: "tüm fasonlarımın verimliliği"
- Kanal: B2B satış + landing page

---

## 2. Müşteri Segmentleri ve Değer Önerileri

### 2.1 Segment 1: Bireysel Atölye (B2B SMB)

**Kim?**
- 20-200 çalışan, tek lokasyon
- Endüstri mühendisi yok, sahip + 1-2 yönetici
- Bugünkü durum: Excel + WhatsApp + kağıt
- Aylık ciro: 5-50M TL (tahmini)

**Ödediği için ne alıyor?**
- IE'in ölçüm/analiz/raporlama işinin %80'i otomatik
- Günlük çıkan ürün, hata, kayıp süre ölçülüyor
- Hangi modelin karlı olduğunu görüyor
- Bant darboğazlarını otomatik tespit
- AI her hafta "bu hafta ne oldu?" raporu gönderiyor (WhatsApp/email)
- Patron mobile app'ten 5 dakikada özet görür

**Pricing çıpası:**
- IE maaşı: 60-80K TL/ay (Türkiye 2026)
- ProMode-A SaaS: bunun %10-20'si = **6-12K TL/ay** (modüllere göre)

### 2.2 Segment 2: Ana Üretici (B2B Enterprise)

**Kim?**
- Yurt dışına ihraç eden marka veya tedarik şirketi
- 5-200 alt fason ile çalışıyor
- Kalite kontrol ekibi var, ama her atölyeyi tek tek izlemek zor
- Sipariş dağıtımı için doğru atölyeyi seçmesi gerekiyor

**Ödediği için ne alıyor?**
- Tüm fasonlarının verimlilik tablosu tek panelde
- Sipariş için "hangi fason en uygun?" karar desteği
- Kalite trendi / red oranları cross-workshop
- Atölyeler arası kıyas + benchmark
- Yeni fason onboarding'i hızlanır (her atölyeye ProMode-A ile başla)
- Atölyeler ortak dilde rapor verir → karşılaştırma kolay

**Pricing çıpası:**
- Bireysel fiyatın × N atölye, **%30-50 toplu indirim**
- 5 atölye paketi: ~30-40K TL/ay
- 100 atölye paketi: ~400-500K TL/ay (custom enterprise)
- Ek: özel onboarding + dedicated account manager

---

## 3. Modül Katalogu — Abonelik Bazlı

Atölye **çekirdek paket**'i alır, üstüne ihtiyacı olan **modül paket'leri** ekler. Lego mantığı:

### 3.1 Çekirdek (Core) — Zorunlu
**Her abonelikte var.** Tek başına satılmaz.
- Auth, multi-tenant izolasyon
- Atölye profili, bant tanımları, operatör listesi
- Dashboard (genel özet)
- Mobil + web

### 3.2 Modül Paketleri

| Modül | İçerik | Tipik Müşteri |
|---|---|---|
| **OPS** Üretim Operasyonları | Üretim günlüğü, vardiya, duruş kaydı | Hepsi (zorunlu denilebilir) |
| **WO** İş Emri Yönetimi | İş emri yarat, aşama takip, malzeme, günlük problem | Sipariş alan tüm atölyeler |
| **PLAN** Planlama & Takvim | Bant takvimi, auto-scheduling, slot bulucu, drag&drop | Çoklu sipariş yönetimi |
| **OEE** OEE & Verimlilik | OEE hesabı, darboğaz tespit, yamazumi, simülasyon | Verimlilik takip eden |
| **QUAL** Kalite | FPQ, red, kök-neden, hata Pareto | Kalite önemli müşteri olanlar |
| **COST** Maliyet | TL/dk, eder maliyet, model karlılık, sapma | Karlılık takip eden |
| **AI-DOC** AI Doküman Tarama | Foto/PDF → JSON otomatik veri girişi | Veri girişi yükü olan |
| **AI-CHAT** AI Sorgu | Doğal dil sorgu (LLM), patron dili rapor, WhatsApp bot | Sahip günlük takip |
| **SCORE** Skorlama & Benchmark | Sektör benchmark, kendi sıralaması, kıyas | Büyümek isteyen |
| **PARENT** Ana Üretici Paneli | Multi-workshop dashboard, dağıtım kararı, cross-rapor | Sadece ana üretici |

### 3.3 Önerilen Paketler

| Paket | Hedef Müşteri | İçerik | Aylık |
|---|---|---|---|
| **STARTER** | 20-50 kişi, ilk dijitalleşme | Core + OPS + WO | ~5K TL |
| **GROWTH** | 50-100 kişi, verimlilik takip | Core + OPS + WO + PLAN + OEE + QUAL | ~9K TL |
| **PRO** | 80-200 kişi, ileri seviye | Growth + COST + AI-DOC | ~14K TL |
| **PREMIUM** | Pro + AI tüm özellikler | Pro + AI-CHAT + SCORE | ~18K TL |
| **ENTERPRISE** Bulk | Ana üretici, 5+ fason | Pro paket × N atölye + PARENT modülü, custom indirim | Custom |

**Trial:** 30 gün ücretsiz Pro deneme (kredi kartı bile istemez)

**Onboarding hizmeti:** Ek 5-10K TL bir kerelik (atölyede 1-2 gün kurulum, kullanıcı eğitimi, Excel'den import).

---

## 4. Bireysel Değer Kanıtı — Atölye Tek Başına Kullanırken Ne Alır?

> "Atölyenin kendine değer üretmesi lazım önce" — kullanıcı talebi

### 4.1 İlk 7 Gün (Onboarding)
- Setup: bantlar, operatörler, bilinen modeller import
- İlk üretim verisi WhatsApp bot'tan girilir → ilk OEE raporu çıkar
- "Şu anda gerçek verimliliğin %X" — patron için ilk farkındalık

### 4.2 İlk 30 Gün (Quick Wins)
- 1 darboğaz tespit edilir → açıldığında %5-10 throughput artış
- En karlı/zararlı 3 model belirlenir
- Kalite hata Pareto'su: en sık 2 hata türü → kök-neden → düzelt
- Plan vs gerçek sapması: her hafta düzeltilen küçük bir kayıp

### 4.3 İlk 90 Gün (Sürdürülebilir Değer)
- Aylık net verimlilik artışı %5-15 (ölçülebilir)
- Hata düşüşü %20-40
- Patron WhatsApp'tan haftalık rapor okuyor (artık Excel açmıyor)
- Üretim planlaması için 1-2 saat/hafta tasarruf
- IE bütçesi ayrılmadan IE çıktısı alınıyor

### 4.4 Bireysel Değer Kanıtı Metriği

Pilot atölyelerden 3 KPI:
1. **NDR (Net Dollar Retention)** — abone kalıyor + paketini büyütüyor mu? Hedef: %110+
2. **Activation rate** — 30 günde aktif kullanıma geçiş %'si. Hedef: %80
3. **Time-to-Value (TTV)** — ilk ölçülebilir kazanca kadar geçen gün. Hedef: ≤14 gün

Bunlar yeşilse Aşama B (ana üretici) açılır.

---

## 5. Ana Üretici Modeli (Aşama B — Bireysel Sonrası)

### 5.1 Lisans Yapısı
- **5 atölye paketi**: 5 atölye için ProMode-A + ana üretici dashboard'u
- **15 atölye paketi**: + dağıtım kararı modülü
- **100+ atölye paketi**: Enterprise — özel sözleşme

### 5.2 Ana Üreticinin Aldığı Ek Değer
- **Cross-workshop dashboard**: Tüm fasonların verimlilik özeti
- **Sipariş dağıtım kararı**: yeni sipariş için "hangi atölye en uygun?" otomatik öneri
- **Benchmark**: fason A vs B kıyaslaması
- **Risk göstergeleri**: gecikme riski olan WO'lar erken uyarı
- **Kalite trendi**: tüm fasonlarda red oranı trendi
- **Yeni fason onboarding**: yeni alt fason eklemek hızlı (ProMode-A zaten kurulu)

### 5.3 Atölye-Ana Üretici İlişkisi
- Ana üretici lisanslarsa, atölyeler **alt-tenant** olarak girer
- Atölyenin kendi verisi yine kendisinin (data ownership)
- Atölye, Ana üretici ile **paylaşılan** veriyi seçer (örn. "kalite raporları paylaş, maliyet detayı paylaşma")
- Kontrol atölyede, görünürlük ana üreticide

### 5.4 Atölye Çıkış Senaryosu
- Ana üretici sözleşmesi biterse atölye **bireysel aboneliğe** geçebilir (data taşınmaz, hesap aktif kalır)
- Tersi de: bireysel abone atölye, ana üretici tarafından satın alınırsa toplu pakete geçer

---

## 6. Yol Haritası (Üst Seviye)

> Detay: [COMMERCIAL_ROADMAP.md](COMMERCIAL_ROADMAP.md)

### Faz 1 — SaaS Foundation (4-6 hafta)
Multi-tenancy, auth, abonelik modeli, modül aktivasyon sistemi. Mevcut sistemi tek-atölyeden multi-tenant'a çevir.

### Faz 2 — Self-Serve Onboarding (3-4 hafta)
Web kayıt, email doğrulama, ödeme entegrasyonu (iyzico/Stripe), trial başlatma, ilk kurulum sihirbazı.

### Faz 3 — Marketing & Pilot (4 hafta)
Landing page, fiyatlandırma sayfası, blog, demo video. 3 pilot atölye onboarding.

### Faz 4 — İterasyon & Bireysel Değer Kanıtı (8-12 hafta)
Pilot geri bildirimle özellik rafine. NDR/Activation/TTV ölçümleri. **Bireysel değer kanıtlanırsa Faz 5'e geç.**

### Faz 5 — Ana Üretici Paketi (6-8 hafta)
PARENT modülü, alt-tenant yapısı, cross-workshop dashboard, sipariş dağıtım önerisi.

### Faz 6 — Ölçeklenme (Sürekli)
Satış ekibi, partner programı, sektör vertical (denim/triko/örme), uluslararası.

---

## 7. Pivot İçin Anlık Yapılacaklar

Sırasıyla:

1. **Multi-tenancy migrasyonu** (tüm tablolarda `tenant_id`) — tek başına 1-2 hafta
2. **Auth sistemi yenilemesi** — email/parola, JWT, atölye → tenant ilişkisi
3. **Subscription tablosu** + modül aktivasyon
4. **Module guard** — UI ve API katmanlarında "bu modül abonelik kapsamında mı?" kontrolü
5. **Plan değiştirme akışı** — bir paket'ten diğerine yükseltme/düşürme
6. **Onboarding wizard** — ilk login sonrası 5 adımlı kurulum
7. **Landing page** (basit) — gen-public fiyatlandırma + signup
8. **Ödeme entegrasyonu** (iyzico Türkiye için, sonra Stripe yurtdışı)
9. **Trial mantığı** — 30 gün ücretsiz, sonra otomatik downgrade veya billing
10. **Customer portal** — abonelik yönet, fatura, kullanıcı ekle/çıkar

Detaylar [COMMERCIAL_ROADMAP.md](COMMERCIAL_ROADMAP.md)'de.

---

## 8. Mevcut PES Kodu ile İlişki

Şimdiye kadar yapılanlar **base** — ürünleştirme bunu commercialize eder. Atılan kod yok, eklenen var:

### Korunur (kullanılan yapı)
- Tüm sayfalar (`/workshop/*`, `/pes/*`)
- Migration'lar 005-018
- Üretim simülasyonu, eder maliyet, iş emri, takvim — hepsi tenant_id ile çalışır
- AI infra (sim-excel, kv3 import) — modül olarak paketlenir

### Eklenir
- `tenant` tablosu + her tabloya `tenant_id` kolon (migration 019)
- `subscription`, `subscription_plan`, `subscription_module` tabloları
- `auth_user`, `auth_session` tabloları (Supabase Auth veya custom)
- Module guard middleware
- Onboarding state machine
- Billing webhooks (iyzico/Stripe)
- Marketing site (`/` veya ayrı subdomain)
- Customer portal (`/account`)

### Yer değiştirir
- Şu anki "Atölye Paneli" rolünü atölye-tenant kullanıcısı görür
- Şu anki "PES Merkez Paneli" iki ayrı role bölünür:
  - **Internal Admin** (ProMode-A çalışanı) — tüm tenant'ları yönetir
  - **Parent Manufacturer** (ana üretici tenant'ı) — sadece kendi alt fasonlarını görür

---

## 9. Riskler ve Varsayımlar

### Risk 1 — Bireysel atölye fiyat eşiği
6-12K TL/ay Türkiye SMB için yüksek olabilir. Pilot'ta ödeme isteksizliği görülürse:
- **Mitigasyon**: STARTER paket'i 3K TL'ye indir, AI modüllerini opsiyonel premium yap

### Risk 2 — Onboarding hizmeti gerekli olması
Self-serve %100 olmayabilir; özellikle 50+ kişilik atölyeler için. **Mitigasyon**: hybrid model — self-serve + opsiyonel kurulum hizmeti.

### Risk 3 — Ana üretici kanalı bireysel başarıyı dilute edebilir
Toplu satışla bireysel müşteri kanalı çakışabilir (cannibalization). **Mitigasyon**: ana üretici paketi PARENT modülü ile farklılaşır; bireysel atölye o modülü zaten almıyor.

### Risk 4 — Multi-tenancy refactor süresi
Tahmini 2 hafta gerçekte 3-4 hafta sürebilir (her tablo + her API + her query güncellenmeli). **Mitigasyon**: özellik geliştirmeyi bu süre boyunca dondur, sadece refactor odaklan.

### Risk 5 — Compliance / KVKK
Müşteri verisi tutuyoruz, KVKK uyumu şart. **Mitigasyon**: Faz 1'de KVKK aydınlatma metni + veri saklama politikası + silme akışı.

### Risk 6 — Rakip giriş
Logo/Mikro tekstil verticali geliştirebilir. **Mitigasyon**: AI farklılaşma noktasına yatırım, hızlı pilot edinme.

---

## 10. Başarı Metrikleri (NORTH STAR)

### Faz 1-2 (SaaS hazırlık)
- Tüm endpoint'ler tenant-aware: %100
- Trial signup'tan ilk üretim verisi girişine kadar süre: ≤7 gün

### Faz 3-4 (Bireysel pilot)
- Pilot atölye sayısı: 3 → 10 → 30
- Activation rate: %80+ (30 gün içinde aktif kullanım)
- NDR: %110+ (paket büyütme)
- Trial → ödeme dönüşüm: %30+

### Faz 5+ (Ana üretici)
- İlk ana üretici müşteri: 1 (5+ atölye)
- Ana üretici aracılığıyla onboarding atölye sayısı: 5 → 50
- Toplam aktif atölye sayısı: 100+ (1 yıl içinde)

### Genel SaaS metrikleri
- MRR (Monthly Recurring Revenue): hedef 12 ay sonunda 200K TL+
- CAC (Customer Acquisition Cost): max 3 ay'lık abonelik ücreti
- Churn (aylık iptal): max %5
- LTV/CAC oranı: en az 3x

---

## 11. Sonuç — Tek Cümle

> **ProMode-A v3, AI Endüstri Mühendisi yeteneğini her atölyenin web'den abone olabileceği bir SaaS ürünü haline getirir; önce bireysel atölye değer üretir, sonra ana üreticiler toplu lisansla alt fasonlarını platforma alır.**

---

*v1: PLATFORM_VISION.md (Nisan 2026 — atölye odaklı sistem, tarihsel)*
*v2: PLATFORM_VISION_v2.md (Nisan 18, 2026 — ProMode-A / AI IE pozisyonu)*
*v3: Bu doküman (Nisan 27, 2026 — ticari SaaS pivotu)*

*İlgili: [COMMERCIAL_ROADMAP.md](COMMERCIAL_ROADMAP.md), [MODULE_CATALOG.md](MODULE_CATALOG.md)*
