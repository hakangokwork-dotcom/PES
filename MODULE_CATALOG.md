# ProMode — Modül Kataloğu

**Vizyon:** [PLATFORM_VISION_v3.md](PLATFORM_VISION_v3.md)
**Yol haritası:** [COMMERCIAL_ROADMAP.md](COMMERCIAL_ROADMAP.md)

ProMode modüler bir SaaS'tır. Atölye **çekirdek paket**'i alır, ihtiyacı olan modülleri ekler. Lego mantığı.

---

## Modül Tanımı

Bir **modül**:
- Belirli bir iş problemini çözer (örn. "iş emri yönetimi", "kalite takibi")
- Bağımsız aboneliklenebilir (modül kodu ile API/UI'da kontrol edilir)
- Ait olduğu sayfa/route grubu var
- Bağımlı olduğu başka modüller olabilir

**Yapı:**
```
{
  code: 'WO',
  name: 'İş Emri Yönetimi',
  description: '...',
  routes: ['/workshop/is-emri', '/workshop/is-emri/[id]'],
  api_paths: ['/api/pes/work-orders/*'],
  depends_on: ['CORE', 'OPS'],
  monthly_price: 2500,
  in_packages: ['GROWTH', 'PRO', 'PREMIUM'],
}
```

---

## Modül Listesi

### CORE — Çekirdek (zorunlu, her abonelikte)

**İçerik:**
- Auth (login, parola sıfırlama, kullanıcı yönetimi)
- Tenant izolasyonu
- Atölye profili sayfası (`/workshop/profile`)
- Bant tanımları
- Operatör listesi
- Ana dashboard (özet KPI'lar)
- Notification altyapısı
- Settings
- Mobile-friendly layout

**Routes:** `/workshop`, `/workshop/profile`, `/account/*`, `/login`
**Bağımlılık:** —
**Fiyat:** Tek başına satılmaz; her pakette zorunlu
**Adı diyabilirsin:** "Sistem"

---

### OPS — Üretim Operasyonları

**Problem:** "Günlük üretimi nasıl kayıt altına alıyorum, kim ne yaptı, ne kadar üretildi?"

**İçerik:**
- Günlük üretim girişi (vardiya × bant × adet)
- Aylık üretim raporu
- Operatör performans takibi
- Duruş kaydı (downtime)
- Vardiya yönetimi

**Routes:** `/workshop/production`, `/workshop/downtime`, `/workshop/workforce`
**API:** `/api/pes/production/*`, `/api/pes/downtime/*`, `/api/pes/operators/*`
**Bağımlılık:** CORE
**Fiyat:** 2,000 TL/ay (eklenirse)
**Standalone yok** — tüm paketlerde temel olarak var

---

### WO — İş Emri Yönetimi

**Problem:** "Müşteri siparişlerini nasıl planlıyorum, takip ediyorum, problemleri kaydediyorum?"

**İçerik:**
- İş emri oluştur (estimate WO)
- Aşama takibi (Kesim → Dikim → UKP)
- Plan vs gerçek tarihler
- Materyal listesi (kumaş, aksesuar)
- Günlük problem defteri (NOT/PROBLEM/KAIZEN/UYARI/BAŞARI/BLOKAJ)
- Status workflow + durum geçmişi
- Otomatik aşama init
- Ana üretici ile paylaşım flag'i

**Routes:** `/workshop/is-emri`, `/workshop/is-emri/[id]`
**API:** `/api/pes/work-orders/*`
**Bağımlılık:** CORE, OPS
**Fiyat:** 2,500 TL/ay
**Paketler:** STARTER (basic), GROWTH+, PRO, PREMIUM

---

### PLAN — Planlama & Takvim

**Problem:** "Hangi siparişi hangi banta ve ne zaman koymalıyım?"

**İçerik:**
- Bant takvimi (Gantt görünümü)
- Drag & drop tarih/bant değiştirme
- Auto-scheduling (yeni WO için bant + tarih önerisi)
- Slot bulucu
- Aşama detay görünümü (kesim/dikim ayrı bar)
- Bant doluluk özeti
- Çoklu görünüm: Ay / Hafta / Aşama Detay

**Routes:** `/workshop/takvim`
**API:** `/api/pes/work-orders/auto-plan`
**Bağımlılık:** CORE, WO
**Fiyat:** 2,000 TL/ay
**Paketler:** GROWTH, PRO, PREMIUM

---

### OEE — OEE & Verimlilik

**Problem:** "Bantlarımın gerçek verimliliği ne, darboğaz nerede, nasıl iyileştiririm?"

**İçerik:**
- OEE hesabı (Kullanılabilirlik × Performans × Kalite)
- Darboğaz tespiti (yamazumi)
- Bant performans karşılaştırma
- Üretim simülasyonu (yeni model için kapasite tahmini)
- Operatör optimizasyon önerileri
- Performans raporu

**Routes:** `/workshop/vsm`, `/workshop/analysis`, `/workshop/uretim-simulasyon` (mevcut PES'teki)
**API:** `/api/pes/oee/*`, `/api/pes/measurements/*`
**Bağımlılık:** CORE, OPS
**Fiyat:** 3,000 TL/ay
**Paketler:** GROWTH, PRO, PREMIUM

---

### QUAL — Kalite Yönetimi

**Problem:** "Hata türleri, red oranları, kalite trendi nasıl?"

**İçerik:**
- Kalite kontrol kayıt
- FPQ, RFT hesabı
- Hata Pareto + kök-neden analizi
- Hata kategorileri yönetimi
- Aylık kalite raporu
- Kalite ↔ Operatör eşleştirme (kim hangi hata türünü yapıyor)

**Routes:** `/workshop/quality`
**API:** `/api/pes/quality/*`
**Bağımlılık:** CORE, OPS
**Fiyat:** 1,500 TL/ay
**Paketler:** GROWTH+, PRO, PREMIUM

---

### COST — Maliyet & Karlılık

**Problem:** "Adet başı gerçek maliyet ne, hangi model karlı, hangi zararlı?"

**İçerik:**
- Aylık gider girişi (personel, enerji, kira, vs.)
- TL/dakika hesabı
- Eder maliyet hesabı (model bazlı)
- Standart vs gerçek maliyet sapması
- Model karlılık analizi
- Bölge benchmark karşılaştırma

**Routes:** `/workshop/costs`, `/workshop/eder-maliyet` (atölye versiyonu)
**API:** `/api/pes/expenses/*`, `/api/pes/eder/*`
**Bağımlılık:** CORE
**Fiyat:** 2,500 TL/ay
**Paketler:** PRO, PREMIUM

---

### AI-DOC — AI Doküman Tarama

**Problem:** "Excel/kağıt veriyi sisteme girmek 2 saat sürüyor, hata yapıyoruz."

**İçerik:**
- Vision LLM ile foto/PDF → JSON dönüşüm
- Tip-spesifik şablonlar:
  - Kumaş/aksesuar irsaliye
  - Tech pack / model dosyası
  - Günlük üretim çizelgesi (el yazısı)
  - Kalite kontrol formu
- WhatsApp bot entegrasyonu (foto gönder → veriye dönüş)
- İnsan onay UI'ı (önce göster, sonra commit)

**Routes:** `/workshop/ai-import`, `/workshop/ai-history`
**API:** `/api/pes/ai/scan`, `/api/pes/ai/whatsapp-webhook`
**Bağımlılık:** CORE, en az 1 hedef modül (WO veya OPS veya QUAL)
**Fiyat:** 4,000 TL/ay (1000 scan/ay dahil, sonrası kullanım bazlı)
**Paketler:** PRO (sınırlı), PREMIUM (full)

---

### AI-CHAT — AI Sorgu & Asistan

**Problem:** "Sahip Excel açmıyor, ben veriyi insan diliyle sorabilmek istiyorum."

**İçerik:**
- Doğal dil sorgu: "Bu ay 3. bantta ne oldu?"
- LLM cevap (sayısal + öneri)
- Patron dili çevirisi (jargonsuz dashboard)
- Haftalık otomatik özet (WhatsApp/email)
- Proaktif alert: "Şu sapma var, bakmak ister misin?"
- WhatsApp asistan bot

**Routes:** `/workshop/asistan`, `/workshop/raporlar/oto`
**API:** `/api/pes/ai/query`, `/api/pes/ai/weekly-summary`
**Bağımlılık:** CORE
**Fiyat:** 4,000 TL/ay (10K query/ay dahil)
**Paketler:** PREMIUM

---

### SCORE — Skorlama & Benchmark

**Problem:** "Sektörde nereye oturuyorum? Hangi alanda eksiğim?"

**İçerik:**
- Sektör benchmark'ı (ortalama OEE, FPQ, vs.)
- Bölge bazlı kıyaslama
- Geçmiş trendlere göre kendi sıralaması
- Hedef belirleme + gap analizi
- Anonim sektör veri havuzu

**Routes:** `/workshop/skorlama`, `/workshop/benchmark`
**API:** `/api/pes/scoring/*`
**Bağımlılık:** CORE, en az OPS + QUAL
**Fiyat:** 1,500 TL/ay
**Paketler:** PREMIUM

---

### PARENT — Ana Üretici Paneli (sadece parent_manufacturer tenant'ları için)

**Problem:** "5/100 fason atölyenin tümünü tek panelde nasıl yönetirim?"

**İçerik:**
- Cross-workshop dashboard
- Sipariş dağıtım kararı paneli
- Atölye performans karşılaştırma
- Yeni fason davet/onboarding
- Kalite/verimlilik trend kıyaslama
- Atölye ranking
- Toplu rapor + export

**Routes:** `/parent/*`
**API:** `/api/parent/*`
**Bağımlılık:** Parent tenant türü (tenant.tenant_type = 'parent_manufacturer')
**Fiyat:** Bulk pakete dahil (her sub-atölye başına ek ücret yok)
**Paketler:** ENTERPRISE (sadece)

---

## Önerilen Paketler

### 🟢 STARTER — "İlk Dijitalleşme" — 5,000 TL/ay
**Kim için:** İlk kez yazılım kullanan, 20-50 kişilik atölye. WhatsApp+Excel'den çıkış.
**İçerik:**
- CORE
- OPS
- WO (basic)
**Yok:** PLAN, OEE, COST, AI

---

### 🔵 GROWTH — "Verimlilik Takibi" — 9,000 TL/ay
**Kim için:** Verimlilik ölçmeye başlamak isteyen, 50-100 kişi.
**İçerik:**
- CORE + OPS + WO
- **+ PLAN** (bant takvimi)
- **+ OEE** (verimlilik)
- **+ QUAL** (kalite)
**Yok:** COST, AI, SCORE

---

### 🟡 PRO — "Profesyonel Yönetim" — 14,000 TL/ay
**Kim için:** 80-200 kişi, sahip aktif data tüketicisi.
**İçerik:**
- GROWTH + her şey
- **+ COST** (maliyet & karlılık)
- **+ AI-DOC** (sınırlı, 500 scan/ay)
**Yok:** AI-CHAT (full), SCORE

---

### 🟣 PREMIUM — "AI Endüstri Mühendisi" — 18,000 TL/ay
**Kim için:** AI'ı tam kullanmak isteyen, sahip mobil sürekli takip.
**İçerik:**
- PRO + her şey
- **+ AI-DOC** (full, 5000 scan/ay)
- **+ AI-CHAT** (full)
- **+ SCORE** (benchmark + sıralama)

---

### 🔶 ENTERPRISE BULK — Ana üretici için — Custom
**Kim için:** 5+ alt fasonu olan ana üretici/marka.
**İçerik:**
- N atölye için PRO veya PREMIUM paket (toplu indirim)
- **+ PARENT modülü** (cross-workshop dashboard)
- Dedicated account manager
- Custom SLA + öncelikli destek
- Aylık rapor servisi
- **Self-hosted opsiyonu** (kendi sunucularında deploy — ek lisans + maintenance ücreti)
**Bulk indirim:**
- 5 atölye: %20
- 15 atölye: %30
- 50+ atölye: %40
- 100+ atölye: özel

---

## Deploy Modu — Cloud SaaS vs Self-Hosted

ProMode iki deploy modunda sunulur:

### ☁️ Cloud SaaS (varsayılan)
- ProMode'un kendi infra'sında (Vercel + Supabase + Cloudflare)
- Otomatik güncellemeler, backup, monitoring
- Kullanıcının hiçbir altyapı yükü yok
- Aylık abonelik fiyatına dahil
- **Tüm bireysel + çoğu Enterprise müşteri bunu kullanır**

### 🏢 Self-Hosted (Enterprise opsiyonu)
**Kim için:** Veri hassasiyeti yüksek olan, regülatör baskısı altındaki, kendi data center'ı olan büyük müşteriler (genelde 50+ atölyeli ana üreticiler).

**Ne sunulur:**
- Docker compose veya Kubernetes manifest'leri
- DB schema + migration script'leri
- ProMode software lisansı (yıllık)
- Update mekanizması (semi-otomatik)
- Knowledge transfer + kurulum desteği

**Ne YOK:**
- Müşterinin kendi infra'sından sorumlu (DB backup, ölçek, uptime)
- AI modülleri için kendi LLM API key'i (OpenAI/Claude) gerek
- ProMode'un cloud-only modülleri (örn. anonim sektör benchmark) çalışmaz

**Fiyat:** Cloud SaaS'a ek %30-50 (yıllık lisans + 1. yıl onboarding hizmeti). Self-hosted müşteri custom sözleşmeyle alınır, listede fiyat yok.

**Kapsam kararı:** Faz 1-5'te sadece Cloud SaaS hayata geçer. Self-hosted opsiyonu Faz 6'da, ilk büyük Enterprise müşteri talep ettiğinde paketlenir.

---

## Modül Bağımlılık Grafiği

```
                  CORE
                ┌──┴──┐
                │     │
              OPS   COST
              ┌─┴─┐
              │   │
             WO   QUAL
              │
            PLAN
              │
             OEE

AI-DOC ──── (CORE + en az 1 hedef modül)
AI-CHAT ─── CORE
SCORE ───── CORE + OPS + QUAL
PARENT ──── (sadece parent_manufacturer tenant'lar)
```

UI'da ekleme akışı: Bir modülü eklerken, bağımlı olduğu modüller yoksa otomatik öneri "Bu modülü almak için X modülünün de aktif olması gerek".

---

## Module Guard Implementation (Geliştirme Kılavuzu)

### Backend (API katmanı)

`lib/subscription/module-guard.ts`:
```ts
export async function assertModule(req: Request, code: string) {
  const tenantId = getTenantId(req)
  const sub = await getActiveSubscription(tenantId)
  if (!sub.modules.includes(code) && !sub.modules.includes('CORE')) {
    throw new HTTPError(403, `Module "${code}" abonelik kapsamında değil`)
  }
}
```

API route içinde:
```ts
export async function GET(req: NextRequest) {
  await assertModule(req, 'WO')
  // ... mevcut logic
}
```

### Frontend (UI katmanı)

`components/RequireModule.tsx`:
```tsx
export function RequireModule({ code, children, fallback }: Props) {
  const { hasModule } = useSubscription()
  if (!hasModule(code)) {
    return fallback ?? <ModuleLockedCard code={code} />
  }
  return <>{children}</>
}
```

Sidebar'da kilitli modül:
```tsx
<NavItem
  href="/workshop/eder-maliyet"
  label="Eder Maliyet"
  locked={!hasModule('COST')}
  upgradeTo="PRO"
/>
```

---

## Trial & Upgrade Akışı

### İlk Signup
- Yeni tenant oluşur → otomatik **PRO trial 30 gün** atanır
- Tüm modüllere erişim açık (PARENT hariç)
- Banner: "Trial 30 gün — 12 gün kaldı"

### Trial Bitince
- Otomatik **STARTER**'a downgrade (ödeme yoksa)
- Kapatılan modüller "🔒 Bu modül için PRO/PREMIUM gerekli" mesajı
- Müşteriye email + in-app notification

### Plan Yükseltme/Düşürme
- `/account/plan` sayfasından
- Pro-rata fatura (yıl içi geçişte)
- Yeni plan modülleri anında açılır
- Düşürmede: yeni faturalama döneminden itibaren

---

## Müşteri Sözleşme Maddeleri (Özet)

- KVKK uyumu — veri silme hakkı, aydınlatma
- Veri ownership — atölye verisi atölyenindir, çıkışta export yapılır (CSV)
- SLA — %99 uptime, max 4 saat critical bug fix
- Refund — ilk 30 gün karşılıksız iade
- Anonim agregasyon — sektör benchmark için anonim veri kullanılabilir (opt-out var)
- Parent ile veri paylaşımı — atölye onayı ile, kategori bazlı (örn. "kalite verisi paylaş, maliyet detayı paylaşma")

---

*Son güncelleme: 2026-04-27*
