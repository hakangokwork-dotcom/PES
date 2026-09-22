# Atölye Tablet Uygulaması (PWA) — Tasarım

Tarih: 2026-09-22 · Durum: **onaylandı, plan bekliyor**

Önceki iş: `/workshop` paneli (20 sayfa) masaüstü için yazıldı; bu tasarım aynı
paneli iPad ve Android tabletlerde kurulabilir bir uygulamaya çevirir.

---

## 1. Problem

Fason atölyeler (tedarikçiler) veri girişini ve kendi performanslarını
**tablette** görmek istiyor. Bugün `/workshop` paneli var ama:

- Kenar çubuğu sabit 256 px, katlanmıyor; 768–1023 px'te ekranın üçte biri gidiyor.
- Girdi/buton yükseklikleri 36 px ve 28 px; dokunma için 44 px gerekir.
- Yaklaşık 60 sayısal alan tam klavye açıyor; yalnız `GunlukUretimTablo` ve
  yerleştirme sihirbazı `inputMode` kullanıyor.
- 20 sayfanın hiçbiri paylaşılan `DataTable`'ı kullanmıyor; tablolarda yatay
  kaydırma sarmalayıcısı ve yapışkan başlık yok.
- Manifest, service worker, `public/` klasörü, viewport meta yok — PWA sıfırdan.
- Saha Wi-Fi'si düşüyor; girişler kaybolmamalı.
- `POST /api/pes/quality` ve `/downtime` düz INSERT: çevrimdışı kuyruk iki kez
  oynatılırsa mükerrer kayıt oluşur. `work_order_gunluk_uretim` ise
  `UNIQUE (atama_id, tarih)` ile zaten upsert.

## 2. Kararlar

| # | Karar | Gerekçe |
|---|-------|---------|
| K1 | **Teslim: PWA.** Native/Expo veya Capacitor yok. | Tek kod tabanı, aynı giriş, aynı RLS, Vercel deploy ile çıkar. Mağaza gerekmiyor. |
| K2 | **Yaklaşım: mevcut `/workshop` retrofiti, 4 faz.** Ayrı tablet rota ağacı yok. | İki panel bakımı ve iş mantığı çoğaltması istenmiyor; masaüstü kullanıcı da kazanıyor. |
| K3 | **Kapsam: 20 sayfanın tamamı.** Öncelik: günlük giriş → performans → sipariş → kalan. | Kullanıcı kararı. VSM masaüstü-only; takvim dokunma sürükleme denenir, olmazsa masaüstü uyarısı. |
| K4 | **Çevrimdışı: yalnız üç giriş ekranının YAZMALARI kuyruklanır.** Okumalar çevrimiçi. | Girişin kaybolmaması şart; tam çevrimdışı okuma KPI bayatlığı kuralları ister, kapsam dışı. |
| K5 | **Kullanıcı: tablet başına bir ortak atölye hesabı.** Kişi seçici yok, `created_by` yok. | Mevcut auth (tenant + workshop) ile birebir; hesap açma yükü yok. |
| K6 | **Service worker elle yazılır** (`public/sw.js`). next-pwa / Serwist yok. | İkisi de Next 16 Turbopack build'iyle uyumsuz; kabuk ihtiyacı küçük. |
| K7 | **İdempotensi: `quality_record` ve `downtime_record`'a `client_key UUID UNIQUE`.** Günlük üretim mevcut upsert'i kullanır. | Kuyruk tekrar oynatılınca mükerrer kayıt olmaz. |
| K8 | **Çakışma: son yazan kazanır** (günlük üretim). Sunucu doğrulama hatası → kayıt `hata`, kullanıcı düzeltir veya siler. | Ekran bugün de böyle çalışıyor; birleştirme kuralı icat etmiyoruz. |
| K9 | **Masaüstü davranışı değişmez.** Dokunma boyutları `pointer: coarse` medya kuralıyla; çekmece 1024 px altında. | Merkez ekibi aynı paneli masaüstünde kullanıyor. |

## 3. Faz 1 — PWA kabuğu ve tablet temeli

### 3.1 Kurulabilirlik
- `app/manifest.ts`: ad "PES Atölye", kısa ad "PES", `display: standalone`,
  `orientation: any`, `start_url: /workshop`, `theme_color` mevcut vurgu yeşili
  (`#197A56`), `background_color` `#F6F8F9`.
- `public/icons/`: 192, 512, maskable 512, `apple-touch-icon` 180.
- `app/layout.tsx`: `viewport` export'u (`viewportFit: 'cover'`,
  `width: device-width`, `initialScale: 1`), `appleWebApp: { capable: true,
  statusBarStyle: 'default', title: 'PES Atölye' }`.

### 3.2 Service worker
- `public/sw.js`; sürüm dizesi `lib/version.ts` sürümü + build zamanı damgasından `next.config.ts` `env` ile üretilir ve `SwKayit` bunu `?v=` sorgusuyla SW adresine ekler
  (deploy → eski kabuk geçersiz).
- Precache: `/cevrimdisi` (statik "bağlantı yok" sayfası), manifest, ikonlar.
- Strateji: gezinmeler ve `/api/` → network-first, ağ yoksa gezinmede
  `/cevrimdisi`; `/_next/static/` → cache-first.
- API yanıtları önbelleklenmez (RLS'li veri cihazda kalmaz).
- `components/pes/SwKayit.tsx` (client, `/workshop` layout'unda): kaydı
  `{ scope: '/workshop' }` ile yapar; `controllerchange` (ilk kurulum sonrası)
  → alt şeritte "Yenile" düğmesi, otomatik reload yok.
- Geliştirmede adrese `&gelistirme=1` eklenir; SW o kipte `/_next/static/`
  önbellek-önce kuralını kapatır (Turbopack dev chunk'ları bayatlamasın).
- Çevrimdışı yedek: `/cevrimdisi` önbellekte yoksa satır içi HTML son çare
  olarak döner (yanıt asla undefined olmaz).
- Android Chrome'da `sync` olayı (Background Sync) kuyruk boşaltmayı tetikler;
  iOS'ta bu olay yok, §4.4 tetikleyicileri güvence.

### 3.3 Çekmece kenar çubuğu
- `WorkshopSidebar` aynı `NAV_GROUPS` verisiyle iki kipte çalışır:
  `lg:` ve üstü sabit sütun (bugünkü), altı off-canvas çekmece.
- `components/pes/WorkshopUstBar.tsx` (client, yalnız `<lg`): 56 px; menü
  düğmesi, atölye adı, senkron çipi (§4.5).
- Çekmece: `role="dialog"`, arka plan karartma, ESC/karartma tıkla kapanır,
  rota değişince kapanır. Odak çekmece içinde tutulur.
- `app/workshop/layout.tsx`: `main` iç boşluğu `p-4 md:p-6 lg:p-8`.

### 3.4 Dokunma boyutları ve girdi türleri
- `globals.css`: `@media (pointer: coarse)` altında `.input`, `.select`,
  `button` için `min-height: 44px`; tablo satırı `min-height: 44px`. Bu
  kurallar geneldir: dokunmatik cihazda yönetim panelinin (`/pes`)
  kontrollerini de büyütürler — kapsam dışı olsa da kabul edilen bir yan etki.
- `components/ui/Field.tsx` (`Input`): `type="number"` verilince otomatik
  `inputMode="numeric"`; yalnız kesirli `step` (`0.x`) veya `step="any"`
  varsa `decimal`. Açıkça verilen `inputMode` her zaman kazanır.
- Sayfalardaki el yapımı `<table>`'lar `components/ui/TabloSarmal.tsx`
  (`overflow-x-auto`) ile sarılır. Yapışkan `<thead>` yalnızca sarmala
  `yukseklik` (CSS `max-height`, ör. `70vh`) verilirse gerçekten çalışır;
  verilmezse sarmal sadece yatay kaydırır. `DataTable`'a geçiş zorunlu
  değil — sarmalayıcı yeterli, sayfa mantığı değişmez.
- Şartsız `grid-cols-3/4/7` → `grid-cols-1 md:grid-cols-2 lg:grid-cols-N`.
- Hover-only öğeler (`MetricInfo`, `TermTip`, satır aksiyonları) dokunmada
  tıkla-aç.

### 3.5 Oturum
- `@supabase/ssr` çerezi 400 gün; refresh token kullanıldıkça döner. Ayda bir
  açılan tablet oturumda kalır. Ek ayar gerekmez.
- Kuyruk boşaltmadan önce `supabase.auth.getSession()` ile yenileme denenir.
- Boşaltmada 401 → kuyruk **durur**, çip "Yeniden giriş yapın" gösterir;
  kayıt silinmez. Giriş sonrası kaldığı yerden devam.

## 4. Faz 2 — Çevrimdışı günlük giriş ve senkron

### 4.1 Kapsam
Günlük Üretim (`PUT /api/pes/workshops/:id/gunluk-uretim` ve
`PUT /api/pes/atamalar/:id/gunluk`), Kalite (`POST /api/pes/quality`),
Duruş (`POST /api/pes/downtime`). Yalnız yazma; okumalar çevrimiçi.

### 4.2 Kuyruk modülü — `lib/pes/cihaz-kuyruk.ts`
- IndexedDB veritabanı `pes-cihaz`, store `kuyruk`. Satır:
  `{ clientKey: uuid, url, method, body, olusturma: ISO, deneme: number,
     durum: 'bekliyor'|'gonderiliyor'|'tamam'|'hata', hataMesaji?: string,
     ekran: 'gunluk'|'kalite'|'durus', ozet: string }`.
- API: `ekle(istek)`, `bosalt()`, `bekleyenler()`, `sil(clientKey)`,
  `yenidenDene(clientKey)`, `durumAboneOl(cb)`.
- `bosalt()`: FIFO, tek seferde bir istek, her istek `fetch` ile; ağ hatası →
  `bekliyor` kalır ve üstel bekleme (5 s → 10 → 20 → en çok 5 dk); 4xx → `hata`
  (mesaj saklanır); 2xx → `tamam` (7 gün sonra temizlenir); 401 → durdur (§3.5).
- Body'ye `client_key` eklenir; sunucu bunu idempotensi anahtarı olarak alır.
- Hook: `components/pes/useCihazKuyruk.ts` → `gonder(url, method, body)`:
  çevrimiçiyse anında `fetch` + kuyruğa `tamam` yazar; ağ hatasıysa
  `bekliyor` yazar ve `{ kuyrukta: true }` döner. Üç form `fetch` yerine bunu çağırır.
- Testler (vitest, `fake-indexeddb`): ekle/boşalt sırası, geri çekilme,
  tamam/hata/401 durumları, mükerrer clientKey.

### 4.3 Veri modeli — Migration 039
```sql
ALTER TABLE quality_record  ADD COLUMN client_key UUID UNIQUE;
ALTER TABLE downtime_record ADD COLUMN client_key UUID UNIQUE;
```
Nullable: eski kayıtlar ve merkez importları anahtar taşımaz.
`scripts/_migrate_one.mjs` ile uygulanır (mevcut akış).

### 4.4 API
- `POST /api/pes/quality` ve `/downtime`: zod şeması (bugün yok), gövdede
  isteğe bağlı `client_key`. Varsa
  `INSERT … ON CONFLICT (client_key) DO NOTHING RETURNING id`; çakışırsa mevcut
  id `SELECT` ile döner, yanıt `{ record: { id }, tekrar: true }`.
- Günlük üretim uçları değişmez (upsert zaten var).
- Tetikleyiciler: uygulama açılışı, `window` `online` olayı, bekleyen varken
  60 s aralık, elle "Şimdi gönder", Android'de SW `sync`.

### 4.5 Görünürlük
- Üst bar çipi: "Senkron" (yeşil) · "Çevrimdışı — N kayıt bekliyor" (sarı) ·
  "N kayıt gönderilemedi" (kırmızı) · "Yeniden giriş yapın".
- Yeni rota `/workshop/senkron`: bekleyen ve hatalı kayıtlar; satırda
  ekran adı, özet (bant, tarih, adet), hata mesajı; "Yeniden dene" ve "Sil".
  Çip bu sayfaya bağlanır.
- Form gönderiminde kuyruğa düşerse toast: "Bağlantı yok, kayıt cihazda
  saklandı; bağlanınca gönderilecek."

## 5. Faz 3 — Performans ve sipariş ekranları

- **Dashboard** (`/workshop`): KPI ızgarası tablette 2 sütun; grafikler
  `ResponsiveContainer` ile tam genişlik; `MetricInfo` dokunmada tıkla-aç.
- **Analiz**: dört tablo `TabloSarmal`; çubuk sütunu `w-24`.
- **Olgunluk** (`AtolyeOzDegerlendirme`): puan hücreleri 44 px segment,
  seviye etiketi görünür; kategori başlığı yapışkan.
- **İş Emri listesi**: filtre çubuğu `<lg` "Filtreler" alt sayfasına; sabit
  `min-w` girdiler alt sayfada tam genişlik.
- **İş Emri detayı** (1220 satır): dört bileşene bölünür —
  `IsEmriBaslik` (künye), `IsEmriAsamalar`, `IsEmriMalzeme`, `IsEmriNotlar`.
  `<lg` sekme, `lg+` bugünkü çok panelli görünüm. Emoji buton → 44 px ikon
  buton (lucide). styled-jsx `.input` üzerine yazmaları kalkar, paylaşılan
  `Input` kullanılır. Uç ve davranış değişmez.

## 6. Faz 4 — Kalan sayfalar

- Profil, Modeller, Yıkama/UKP, Maliyet, İşgücü, Kaizen, Yetenek, Veri Yükle:
  §3.4 uygulaması + sayfaya özel ızgara düzeltmesi. Profil'de piksel genişlikli
  girdiler ve `min-w-[1100px]` tablo yapısal olarak yeniden düzenlenir.
  Yetenek seviye çipleri 44 px.
- **Takvim**: sürükleme `pointer` olaylarına geçer; dokunmada uzun basış
  (300 ms) sürüklemeyi başlatır, aksi hâlde sayfa kayar. `HucreMenusu` `<lg`
  alt sayfa. Kabul: iPad'de blok taşıma ve yeniden boyutlama çalışır; çalışmazsa
  sayfa `<lg` "masaüstünde kullanın" uyarısı gösterir ve salt okunur kalır.
- **VSM**: dokunmatik cihazda masaüstü uyarısı; `components/vsim` üretilmiş
  koddur, dokunulmaz.

## 7. Kapsam dışı

- Native uygulama, mağaza yayını, push bildirimi.
- Çevrimdışı okuma (dashboard/liste önbelleği).
- Kişi bazlı giriş veya `created_by`.
- Yönetim paneli (`/pes`) tablet uyumu.
- Yeni iş mantığı; tüm uçlar ve hesaplar aynı kalır (yalnız §4.3–4.4 eklemeleri).

## 8. Doğrulama

- Birim: `cihaz-kuyruk.test.ts` (§4.2), `quality`/`downtime` rota testleri
  (aynı `client_key` ile iki POST → tek satır, ikinci yanıt `tekrar: true`).
- Mevcut takım (1079 test) yeşil kalır; `verify_workshop_isolation.mjs` 76/76.
- Playwright (`playwright-core`, 820×1180 ve 1024×768): çekmece açılır/kapanır,
  sabit kenar çubuğu görünmez, üç giriş formu gönderir, `offline: true` ile
  gönderim kuyruğa düşer ve `online` sonrası boşalır.
- Lighthouse PWA denetimi: kurulabilir, manifest ve SW geçerli.
- Elle: bir iPad + bir Android tablette ana ekrana ekle, uçak modunda giriş,
  bağlanınca boşaltma; sürüm güncelleme toast'ı.
- Her faz ayrı PR olarak main'e girer ve normal Vercel akışıyla yayınlanır;
  Faz 1 tek başına tüm sayfaları kullanılabilir yaptığı için pilot atölyelere
  önce o çıkar.
