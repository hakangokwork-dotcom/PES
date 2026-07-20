# ProMode-A — Ticari SaaS Yol Haritası (Detay)

**Vizyon:** [PLATFORM_VISION_v3.md](PLATFORM_VISION_v3.md)
**Modüller:** [MODULE_CATALOG.md](MODULE_CATALOG.md)

Yol haritası 6 fazdan oluşur. Her faz: hedef + iş paketleri + başarı kriteri + tahmini süre.

---

## Faz 0 — Hazırlık (1 hafta)

**Hedef:** Pivot kararını teknik ekiple sabitle, mevcut sistemi audit et, eksik liste çıkar.

**İş paketleri:**
- [ ] PES kod tabanı audit (tüm tablolar, endpoint'ler, sayfa listesi)
- [ ] Multi-tenancy etki analizi (kaç tablo, kaç query etkilenir)
- [ ] Auth seçimi: **Supabase Auth** (kolay, mevcut DB'yle uyum) vs custom JWT
- [ ] Ödeme seçimi: **iyzico** (Türkiye) + **Stripe** (yurtdışı, sonra)
- [ ] KVKK aydınlatma metni hazırlığı (avukat)
- [ ] Subdomain yapısı: `app.ustabasi.com`, `marketing.ustabasi.com`
- [ ] Hosting kararı: Vercel (frontend) + Supabase (DB) + Cloudflare (CDN)
- [ ] Mevcut PES'i `app.<domain>`'a taşıma planı (domain seçimi açık)

**Başarı kriteri:** Tüm Faz 1 backlog'u net + sprint planı çıktı.

---

## Faz 1 — SaaS Foundation (4-6 hafta)

**Hedef:** Sistem **multi-tenant SaaS** olur. Her atölye izole. Abonelik altyapısı çalışır.

### 1.1 Multi-tenancy Migrasyonu (1.5 hafta)
- [ ] **Migration 019_tenancy.sql**:
  - `tenant` tablosu (id, name, slug, plan_id, created_at, status)
  - `tenant_user` (tenant ↔ user many-to-many + role)
  - Tüm operational tablolarda `tenant_id` kolonu (workshop, work_order, eder_model, line_schedule, journal, ...)
  - RLS policies: her tenant sadece kendi verisini görür
- [ ] Migration script: mevcut PES verisini "default tenant"a ata
- [ ] **Tüm API route'larda** `tenant_id` filter (middleware)
- [ ] `getDB()` → `getTenantDB(tenantId)` (tenant context'i her query'ye otomatik yansıt)
- [ ] Frontend: tenant context provider (her API call header'a `X-Tenant-Id`)

### 1.2 Auth Sistemi (1 hafta)
- [ ] **Supabase Auth** kurulumu — email/parola + magic link
- [ ] `auth_user` ile `tenant_user` ilişkisi
- [ ] Login sayfası (`/login`) + logout
- [ ] Password reset
- [ ] Session management (cookie + JWT)
- [ ] Mevcut `pes_user_roles` tablosu → `tenant_user.role` ile değiştir

### 1.3 Subscription & Modül Sistemi (1.5 hafta)
- [ ] **Migration 020_subscription.sql**:
  - `subscription_plan` (id, code, name, monthly_price, modules JSONB, max_users, max_workshops)
  - `subscription` (id, tenant_id, plan_id, status, trial_end, current_period_end, ...)
  - `subscription_module` (subscription_id, module_code) — ek modül abonelikleri
  - `billing_event` (id, subscription_id, type, amount, ...)
- [ ] Seed: 5 plan (STARTER, GROWTH, PRO, PREMIUM, ENTERPRISE)
- [ ] `lib/subscription.ts` — `hasModule(tenantId, moduleCode)` helper
- [ ] **Module guard** middleware:
  - API: `assertModule(req, 'AI-DOC')` — yoksa 403
  - UI: `<RequireModule code="AI-DOC">` wrapper component
- [ ] Sidebar: abonelikte olmayan modüller "🔒 Yükselt" rozeti ile gri gösterilir
- [ ] Plan upgrade akışı (modül kilidi açılır)

### 1.4 Trial Mantığı (3 gün)
- [ ] Yeni tenant kayıt → 30 günlük PRO trial otomatik başlar
- [ ] Trial expiry warning (kalan gün, e-mail)
- [ ] Trial bitince otomatik STARTER'a downgrade veya tüm modülleri kilitle

### 1.5 i18n Altyapısı — TR + EN (3-4 gün)
- [ ] **next-intl** veya **react-i18next** kurulumu
- [ ] `tr.json` + `en.json` translation dosyaları (TR ana dil, EN ek)
- [ ] Tenant ayarlarına `locale` kolonu (`tenant.locale = 'tr' | 'en'`)
- [ ] User ayarlarına `locale` (kullanıcı tercihi tenant default'unu override eder)
- [ ] UI'da dil değiştirme dropdown (header'da)
- [ ] Tarih/sayı formatlama Intl API ile (toLocaleDateString)
- [ ] Tüm mevcut sayfalar i18n key'leriyle çevrilir (TR fallback hep var)
- [ ] AI çıktıları (haftalık özet, doc ingest) tenant locale'ine göre yanıt verir

**Başarı kriteri:**
- 2 farklı tenant aynı sistemde çalışır, birbirinin verisini görmez
- Bir tenant'ın aboneliği değiştirilince UI'da modüller anında erişilebilir/kilitli olur
- Yeni signup → trial başlar → 30 gün sonra otomatik downgrade

---

## Faz 2 — Self-Serve Onboarding (3-4 hafta)

**Hedef:** Bir atölye sahibi tek başına web'den kayıt olabilir, ödeyip kullanmaya başlayabilir.

### 2.1 Signup & Kayıt (1 hafta)
- [ ] Public signup sayfası (`/signup`)
- [ ] Form: email + parola + atölye adı + telefon + KVKK onay
- [ ] Email doğrulama
- [ ] İlk login → onboarding wizard'a yönlendir
- [ ] (Opsiyonel) Demo veri yükle butonu — boş başlama yerine örnek data

### 2.2 Onboarding Wizard (1 hafta)
5 adımlı kurulum sihirbazı (yeni tenant ilk girişte):
1. **Atölye profili**: çalışan sayısı, lokasyon, tip (CMT/Full Package), bant sayısı
2. **Bantlar**: kod + isim + günlük hedef (basit form, 3-5 bant)
3. **Operatörler**: temel liste (sonradan detaylandırılır)
4. **İlk model**: bir örnek model + temel SAM (varsa)
5. **Tamamlandı**: dashboard tour başlar

### 2.3 Ödeme Entegrasyonu (1.5 hafta)
- [ ] **iyzico** API entegrasyonu (kart ile abonelik)
- [ ] Plan seçim sayfası (`/account/plan`)
- [ ] Ödeme akışı: kart bilgisi gir → tokenize → iyzico abonelik oluştur
- [ ] Webhook handler: ödeme başarılı/başarısız → DB güncelle
- [ ] Fatura görüntüleme (`/account/invoices`)
- [ ] Plan değiştirme (yükselt/düşür) — pro-rata hesabı

### 2.4 Customer Portal (3 gün)
- [ ] `/account` ana sayfa: plan, kullanım, bir sonraki ödeme tarihi
- [ ] Kullanıcı yönetimi: takım üyesi davet et + rol ata
- [ ] Tenant ayarları: isim, logo, locale
- [ ] İptal akışı (hesap dondur veya sil)

**Başarı kriteri:**
- Yeni bir kullanıcı 5 dakikada signup → trial başlatır → demo data ile sistemi gezer
- Ödeme akışı end-to-end çalışır (test kartla başarılı + başarısız senaryolar)

---

## Faz 3 — Marketing & İlk Pilotlar (4 hafta)

**Hedef:** Ürünü dünyaya tanıt + 3 pilot atölye onboard et.

### 3.1 Marketing Site (1.5 hafta)
- [ ] Landing page (`marketing.ustabasi.com` veya `ustabasi.com`):
  - Hero: "AI Endüstri Mühendisi — atölyenize yapay zeka çağının ustası"
  - Sorun-çözüm bloku: "Excel + WhatsApp ile yönetmek yerine..."
  - Özellikler showcase (her ana modül için 1-2 ekran görüntüsü)
  - Müşteri sözleri (pilot sonrası eklenir)
  - Fiyatlandırma sayfası
  - SSS
- [ ] Blog / Bilgi merkezi (SEO için)
- [ ] Demo video (3-5 dk)
- [ ] Lead capture form ("Demo iste")

### 3.2 SEO & İçerik (1 hafta)
- [ ] 5 blog yazısı: "Atölyemde IE yok ama nasıl OEE ölçerim?", "Konfeksiyonda darboğaz tespiti", vs.
- [ ] Anahtar kelime: "konfeksiyon ERP", "atölye yazılımı", "OEE takip", "iş emri yönetimi"
- [ ] Google Analytics + Hotjar (kullanıcı davranışı)
- [ ] LinkedIn şirket sayfası

### 3.3 İlk 3 Pilot (1.5 hafta + sürekli)
- [ ] Pilot atölye seçimi (mevcut network'ten 3 farklı tip atölye)
- [ ] Onboarding hizmeti — fiziksel ziyaret + 1 gün eğitim
- [ ] WhatsApp grup → günlük destek
- [ ] Excel'den veri import asistanı
- [ ] 30/60/90 gün checkpoint anketleri

**Başarı kriteri:**
- Landing page yayında, organik trafik başladı
- 3 pilot atölye 30 gün aktif kullanım
- En az 5 demo isteği (lead) geldi
- Ürün ilk kez **müşterinin parasını alıyor** (trial sonrası 1 ödeme)

---

## Faz 4 — İterasyon & Bireysel Değer Kanıtı (8-12 hafta)

**Hedef:** Pilot geri bildirimle özellik rafine. Bireysel atölye değer kanıtla.

### 4.1 Pilot Feedback (sürekli)
- [ ] Haftalık 1:1 görüşmeler (her pilot atölye sahibi)
- [ ] In-app feedback widget
- [ ] Hotjar session recording (kullanıcı nerede kayboluyor?)
- [ ] Hızlı yamalar — kritik UX sorunları haftalık
- [ ] Faz 1-2'de eksik kalan özellikler (örn. WhatsApp bot eksikse şimdi)

### 4.2 Bireysel Değer Kanıtı Metrikleri
- [ ] Aktivasyon rate ölçümü (30 gün içinde aktif kullanım)
- [ ] TTV (Time to Value) — ilk ölçülebilir kazanca süre
- [ ] NDR (Net Dollar Retention) — paket büyüdü mü?
- [ ] Churn ölçümü (aylık iptal %)
- [ ] Pilot başarı hikayesi (case study) yayınla

### 4.3 İçerik Pazarlama (paralel)
- [ ] Pilot vaka çalışması (rakamla): "X atölyesi 90 günde verimliliği %12 artırdı"
- [ ] Webinar serisi: "AI ile Atölye Yönetimi" (aylık)
- [ ] LinkedIn organik takipçi büyüme
- [ ] Sektör fuarına katılım (ilk fuar)

### 4.4 İlk 30 Müşteri Edinme
- [ ] Pilot dışı yeni müşteri edinme (paid + organic karışım)
- [ ] Free trial → ödemeye geçiş optimizasyonu
- [ ] CAC ölçümü ve indirme

**Başarı kriteri (Faz 5'e geçiş eşiği):**
- 30+ aktif ödeme yapan atölye
- Activation %80+
- Aylık churn %5 altı
- NDR %110+
- LTV/CAC > 3x
- En az 3 case study elde

---

## Faz 5 — Ana Üretici Paketi (6-8 hafta)

**Hedef:** Bireysel başarı kanıtlandıktan sonra ana üretici (parent manufacturer) kanalı aç.

### 5.1 Parent Tenant Mimarisi (2 hafta)
- [ ] **Migration 021_parent_tenant.sql**:
  - `tenant.parent_tenant_id` kolonu (alt-tenant ilişkisi)
  - `tenant.tenant_type` (workshop / parent_manufacturer)
  - `parent_workshop_link` — parent ↔ child atölye ilişkisi (atölye onayıyla)
  - `data_sharing_policy` — atölye hangi datayı parent ile paylaşacak
- [ ] Atölye ekleme akışı: parent davet eder → atölye sahibi onaylar
- [ ] Veri görünürlük katmanı: atölye datası varsayılan kapalı, paylaşım açıkça izinli

### 5.2 PARENT Modülü (2-3 hafta)
- [ ] `/pes` mevcut sayfaları → `/parent/*` olarak rebrand (parent_manufacturer tenant'ı görür)
- [ ] Cross-workshop dashboard (mevcut PES atölye listesi + takvim)
- [ ] Sipariş dağıtım kararı paneli — slot bulucu ile entegre
- [ ] Cross-workshop kalite & verimlilik karşılaştırma
- [ ] Atölye performans ranking + uyarı (geç teslim, kalite düşüşü)
- [ ] Yeni fason davet/onboarding akışı

### 5.3 Bulk Pricing & Sözleşme (1 hafta)
- [ ] 5 / 15 / 50 / 100+ atölye paketleri tanımlı
- [ ] Indirim yapısı (5 atölye %20, 50+ atölye %40 indirim)
- [ ] Custom contract akışı (Enterprise için)
- [ ] Per-atölye consumption ölçümü

### 5.4 İlk Parent Müşteri (1 hafta + sürekli)
- [ ] Direct B2B satış (network'ten 1-2 parent target)
- [ ] Pitch deck + ROI hesabı (her atölyede %X kazanç × N atölye)
- [ ] İlk parent demo + müzakere

**Başarı kriteri:**
- 1+ parent manufacturer müşteri (5+ atölyeli)
- Parent paneli üzerinden 5+ alt atölye onboard
- MRR'e ek 30K+ TL parent kanaldan

---

## Faz 6 — Ölçeklenme (Sürekli)

**Hedef:** Pazara yayıl, MRR'i 200K+ TL'ye çıkar.

### 6.1 Satış Ekibi (3 ay)
- [ ] 1 satış lideri + 2 SDR (sales development representative)
- [ ] CRM (HubSpot / Pipedrive) entegrasyonu
- [ ] Outbound funnel: cold email + LinkedIn outreach
- [ ] Inbound funnel optimizasyonu

### 6.2 Partner & Channel Programı
- [ ] Tekstil mühendisliği danışmanlık firmaları → partner / referral
- [ ] Sektör birlikleri (TGSD, vs.) ile işbirliği
- [ ] Satış komisyonu modeli

### 6.3 Sektör Dikey Genişleme
- Konfeksiyon tek vertical olarak ele alınır — denim/triko/örme/iç giyim aynı yapıyla yönetilir
- Atölye kurulumu sırasında "ürün tipi" seçilir (denim/örme/...) — modüller aynı, sadece varsayılan operasyon kütüphanesi değişir
- Konfeksiyon dışı (ayakkabı, deri) Faz 6+ ileride opsiyonel

### 6.4 Uluslararası (TR + EN)
- TR ana pazar (Faz 0-5'te varsayılan)
- **EN dil seçeneği** Faz 1'den itibaren altyapı hazır (i18n)
- Stripe ile global ödeme (Faz 6'da iyzico'ya ek)
- EU pilot (Romanya, Bulgaristan tekstil hub'ları) — Faz 6'da değerlendirilir

### 6.5 Sürekli Ürün Geliştirme
- [ ] Mobil app (React Native veya PWA derinleştir)
- [ ] WhatsApp bot tam otomasyon
- [ ] AI özellikleri derinleştir (sektör-spesifik LLM fine-tune)
- [ ] Public API (3rd party entegrasyonlar)
- [ ] Logo/Mikro ERP adapter (mevcut müşteri + ProMode-A yan yana)

---

## Teknik Stack — Yeni Eklenenler

| Katman | Mevcut | Eklenir (v3 için) |
|---|---|---|
| Auth | Yok / temel | Supabase Auth + JWT |
| Multi-tenancy | Yok | RLS + tenant_id middleware |
| Billing | Yok | iyzico (TR) + Stripe (global) |
| Email | Yok | Resend / SendGrid |
| Analytics | Yok | PostHog (ürün) + GA4 (marketing) |
| Error tracking | Yok | Sentry |
| Queue / Cron | Yok | Inngest veya Supabase Edge Functions |
| Marketing CMS | Yok | Sanity veya MDX |
| Customer support | Yok | Crisp / Intercom |
| Documentation | Yok | Mintlify / Docusaurus |

---

## Toplam Zaman Tahmini

| Faz | Süre | Kümülatif |
|---|---|---|
| 0 — Hazırlık | 1 hafta | 1 hafta |
| 1 — SaaS Foundation | 4-6 hafta | 5-7 hafta |
| 2 — Self-Serve Onboarding | 3-4 hafta | 8-11 hafta |
| 3 — Marketing & Pilot | 4 hafta | 12-15 hafta (~3 ay) |
| 4 — İterasyon & Değer Kanıtı | 8-12 hafta | 20-27 hafta (~6 ay) |
| 5 — Ana Üretici Paketi | 6-8 hafta | 26-35 hafta (~8 ay) |
| 6 — Ölçeklenme | Sürekli | 12+ ay |

**Bireysel atölye için satışa hazır**: ~3-4 ay
**Ana üretici için satışa hazır**: ~7-8 ay
**MRR 200K hedefine ulaşma**: ~12-18 ay

---

## Öncelik Sıralaması (En Kritikten En Az'a)

1. 🔴 **Multi-tenancy** — diğer her şeyin temeli (Faz 1.1)
2. 🔴 **Auth sistemi** — multi-tenant için zorunlu (Faz 1.2)
3. 🔴 **Subscription & module guard** — gelir akışı (Faz 1.3)
4. 🟠 **Onboarding wizard** — TTV'yi düşürür (Faz 2.2)
5. 🟠 **Ödeme entegrasyonu** — gerçek müşteri için zorunlu (Faz 2.3)
6. 🟠 **Landing page + signup** — kanal açar (Faz 3.1)
7. 🟡 **Pilot iterasyon** — değer kanıtı (Faz 4)
8. 🟡 **Marketing içerik** — organik trafik (Faz 3.2)
9. 🟢 **Parent tenant** — bireysel sonrası (Faz 5)
10. 🟢 **Satış ekibi & ölçek** — büyüme (Faz 6)

---

## Riskler ve Mitigation Planı

Detay [PLATFORM_VISION_v3.md §9]'da. Özet:

| Risk | Mitigasyon |
|---|---|
| Multi-tenancy refactor uzar | Faz 1'de özellik geliştirmeyi durdur |
| Pilot fiyat eşiğini geçemez | STARTER 3K TL'ye düşür, AI premium yap |
| Self-serve %100 olmaz | Hybrid: self-serve + opsiyonel onboarding hizmeti |
| Ana üretici kanalı bireyseli kanibalize eder | PARENT modülü ile farklılaş |
| KVKK uyum eksiği | Faz 1'de aydınlatma metni + saklama politikası |
| Logo/Mikro rakip atılım yapar | AI farklılaşmaya yatırım, hızlı pilot |

---

## Onaylanan Kararlar (2026-04-27)

| Karar | Sonuç |
|---|---|
| **Marka adı** | ✅ **ProMode-A** (final) |
| **Sektör vertical** | ✅ **Konfeksiyon — tek vertical, tüm alt türler aynı yapı** (denim/triko/örme/iç giyim ürün tipi seçimi olarak ayrılır, modül farkı yok) |
| **Self-hosted opsiyon** | ✅ **Var** (Enterprise için, Faz 6'da ilk talep eden büyük müşteriyle paketlenir; Faz 1-5 sadece Cloud SaaS) |
| **Coğrafi & dil** | ✅ **TR ana pazar + EN dil opsiyonu** (i18n altyapısı Faz 1.5'te kurulur, EU pilot Faz 6) |
| **İçerik pazarlama** | ⏳ **Pilot sonrası karar** (Faz 4 sonunda "atölye için güzel sonuçlar" görüldüğünde blog/webinar bütçesi belirlenir) |

### Hâlâ Açık Olanlar (sonra karar verilecek)
1. Tek satış kanalı mı bireysel + partner mı? — Faz 3-4'te netleşir
2. Open-source vs kapalı? — Kapalı (commercial); bazı yardımcı araçlar açık olabilir, ileride değerlendirilir

---

*Son güncelleme: 2026-04-27*
*İlgili: [PLATFORM_VISION_v3.md](PLATFORM_VISION_v3.md), [MODULE_CATALOG.md](MODULE_CATALOG.md)*
