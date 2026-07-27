# Çok Kullanıcılı Test + Klasman Yetenek Geçişi — Tasarım

**Tarih:** 2026-07-21
**Amaç:** Platformu birkaç arkadaşa açmak; onlar kendi atölyelerinin verisini girsin, sen
ortak alandan hepsini yönet. İlk gerçek veri girişi konusu **yetenek belirleme ve atama**
olacak — Klasman klasöründeki 114 atölyelik saha verisi ve zengin sözlüğü PES'e taşınarak.

---

## 1. Mevcut durum (ölçülen, varsayılan değil)

### Hazır olanlar

| Alan | Durum |
|---|---|
| Çok kiracılık | `tenant` (individual/parent/internal) + `tenant_user` (owner/admin/editor/viewer) kurulu |
| RLS | 019a/b/c ile gerçekten devrede; uygulama `pes_app` rolüyle bağlanır, `resolve_tenant_context()` SECURITY DEFINER |
| Auth koruması | Çerezsiz sayfa isteği `307` → login; API `401`. Çalışıyor. |
| API tekilliği | **63/63** rota `withTenantRoute` kullanıyor — kesişim noktası tek |
| Yetenek modeli | `capability_dimension` / `capability_value` / `line_capability` (bant bazlı, `attribute_type='PROFILE'`) |
| Veritabanı | Supabase'te (bulutta), 8 demo atölye, 72 yetenek ataması, 10 boyut / 84 değer |

### Eksikler

| # | Eksik | Etki |
|---|---|---|
| 1 | Uygulama yalnız localhost'ta | Arkadaşların erişeceği adres yok |
| 2 | Login'de iki gömülü hesap, şifreler kaynak kodda (`app/login/page.tsx`) | Tek tıkla herkes admin olur |
| 3 | Kullanıcı açma/davet akışı yok; yalnız 2 hesap var | Arkadaşlara hesap açacak yol yok |
| 4 | Atölye sahipliği/kısıtı yok — `tenant_user.workshop_id` alanı **var ama hiçbir yerde uygulanmıyor** (ne RLS'te, ne `resolve_tenant_context`'te, ne `TenantContext` tipinde) | Herkes her atölyeyi düzenleyebilir |
| 5 | VSM/Simülasyon verisi `localStorage`'da | Arkadaşın çizdiği akışı göremezsin |
| 6 | Yetenek **atama arayüzü yok** — yalnız okuma (`/pes/workshops/[id]`, `/pes/yetenek-rapor`); POST API var, UI yok | Arkadaşlar yetenek giremez |
| 7 | Katalog dar: klasman 15, kumaş türü 18, makine 11; `ana_grup` boyutu hiç yok | Saha terimleri karşılanmıyor |

### Klasman kaynağı

`C:\Users\bhaka\Desktop\Klasman\MEVCUT_DURUM\`

- **MASTER_veri.xlsx → `Long`**: 114 atölye, her biri tek satır.
  Kolonlar: `ID, ATOLYE_ADI, SORUMLU, ATOLYE_TIPI, GUVEN, AYLIK_KAPASITE, ANA_GRUP,
  CINSIYET, KUMAS_GRUBU, KLASMAN, KUMAS_TURU, MAKINE_PARKURU, KAPASITE_NOTU`
- Yetenek kolonları **virgülle çoklu**: `KLASMAN: "5 Cep, Pantolon, Şort, Kapri"`
- **vocab.json**: 6 boyut + `ATOLYE_TIPI`/`GUVEN`. KLASMAN 49, KUMAS_TURU 33, MAKINE 15 terim.
- Veri **atölye** seviyesinde; PES `line_capability` **bant** seviyesinde → eşleme gerekiyor.

---

## 2. Kararlar

| Konu | Karar |
|---|---|
| Veri modeli | Arkadaşlar **senin tenant'ında**; atölye bazında ayrışırlar, sen hepsini görürsün |
| Kısıt seviyesi | **Uygulama katmanı** (`withTenantRoute`), RLS'e dokunulmaz |
| Yayın | **Vercel** |
| Şifreler | Sen belirlersin, elden iletirsin (SMTP kurulumu yok) |
| Klasman 114 atölye | **PES'e aktarılır**; arkadaş kendi atölyesini bulup sahiplenir (yoksa yeni açar) |
| Yetenek seviyesi | **İkisi de** — bant detayı kaynak, atölye özeti türetilir |
| VSM verisi | **DB'ye taşınır** |

Yetenek seviyesi kararı, `PES-ENTEGRASYON-PLANI.md`'deki `023_capability_proficiency.sql`
tanımıyla örtüşüyor: *"Atölye seviyesi yetkinlik = bantlarının max'ı: `v_workshop_capability` view"*.
Bu yüzden yeni bir model icat edilmiyor, plandaki 023 uygulanıyor.

---

## 3. Mimari

### 3.1 Atölye sahipliği

`tenant_user.workshop_id` **kullanılmaz** — tek atölyeye sabitler ve "arkadaş kendi
atölyesini açsın" senaryosunu karşılamaz. Yerine sahiplik atölyenin kendisinde tutulur:

```sql
ALTER TABLE workshop ADD COLUMN owner_user_id UUID REFERENCES auth.users(id);
-- NULL = ortak/havuz atölyesi (114 import edilen kayıt böyle başlar)
```

Erişim kuralı, tek noktada (`withTenantRoute`):

- `role IN ('owner','admin')` → tüm atölyeler (sen)
- `role = 'editor'` → yalnız `owner_user_id = kendisi` olan atölyeler
- İstek bir `wid`/`workshop_id` taşıyorsa ve kullanıcı o atölyenin sahibi değilse → **403**

Sahiplenme: arkadaş havuzdaki (`owner_user_id IS NULL`) atölyelerden kendininkini seçer,
`POST /api/pes/workshops/[id]/sahiplen` kaydı üstüne yazar. Bir atölyenin tek sahibi olur.

**Kapsam sınırı:** `wid` taşımayan rotalar (ör. `benchmark`, `categories`, `capabilities?action=dimensions`)
tenant seviyesinde kalır — katalog/referans verisidir, atölyeye özel değildir. Uygulama sırasında
her rota tek tek sınıflandırılacak; "wid taşıyor ama doğrulanmıyor" durumu kalmayacak.

### 3.2 Yetenek katmanı

```
capability_dimension  (boyut: ana_grup, cinsiyet_yas, kumas_grubu, klasman, kumas_turu, makine_parkuru, …)
capability_value      (değer: "5 Cep", "Gabardin", "Punterez", …)
line_capability       (bant × boyut × değer + proficiency)   ← KAYNAK
v_workshop_capability (atölye × boyut × değer = bantlarının max'ı)  ← TÜRETİLMİŞ
```

Klasman import'unda her atölyenin yetenekleri **varsayılan bandına** yazılır (bandı yoksa
"Bant 1" oluşturulur). Arkadaş sonradan bant bazında incelterek gerçeği yansıtır.

### 3.3 VSM kalıcılığı

```sql
CREATE TABLE vsm_flow (
  tenant_id UUID, workshop_id INT, data JSONB,
  updated_at TIMESTAMPTZ, updated_by UUID,
  PRIMARY KEY (tenant_id, workshop_id)
);
```

VSIM'in `flowStore` katmanı zaten soyut (`get`/`set`). Upstream'de `storageKey` gibi
dışarıdan verilebilir hale getirilir; PES DB adaptörünü geçirir, standalone localStorage'da kalır.
Çakışma: **son yazan kazanır**; `updated_at` ile "başkası güncelledi" uyarısı opsiyonel.

---

## 4. Fazlar

Sıra, arkadaşların gireceği veriyi hazır etmeye ve güvensiz login'i yayına çıkarmamaya göre kuruldu.

### Faz 1 — Katalog ve veri (arkadaşların bulacağı atölyeler)
- `023b_capability_catalog_klasman.sql` — `vocab.json` terimleri `capability_value`'ya,
  `ana_grup` boyutu eklenir. Mevcut 84 değer korunur, yalnız eksikler eklenir (idempotent).
- `scripts/import-klasman.mjs` — MASTER_veri.xlsx `Long` → `workshop` + `production_line` +
  `line_capability`. Virgüllü hücreler ayrıştırılır, sözlükte olmayan terim varsa **durur ve raporlar**
  (sessizce veri uydurmaz).
- 8 demo atölye: `code` çakışması yoksa dokunulmaz; raporda belirtilir.

### Faz 2 — Kimlik
- `app/login/page.tsx` → email + şifre formu; gömülü hesaplar ve şifreler silinir.
- `scripts/create-user.mjs` — email, şifre, rol alır; `auth.users` + `tenant_user` yazar
  (`email_confirmed_at` elle set — SMTP gerekmez).

### Faz 3 — Atölye sahipliği ve kısıt
- `026_workshop_ownership.sql` — `workshop.owner_user_id`.
- `TenantContext`'e sahiplik bilgisi; `withTenantRoute`'ta `wid` doğrulaması → 403.
- `/api/pes/workshops` GET: editor'e havuz + kendi atölyesi; sahiplenme rotası.
- `WorkshopSidebar` atölye seçici kısıtlı kullanıcıda daralır.

### Faz 4 — Yetenek atama arayüzü (test edilecek asıl ekran)
- `023_capability_proficiency.sql` — plandaki gibi: `proficiency`, `approved_by`,
  `last_production_at` + `v_workshop_capability` view.
- Bant yetenek editörü: boyut boyut chip seçme, çoklu seçim, "+ yeni terim" (tenant'a özel
  `capability_value`), seviye (0-3). Klasman panelindeki deneyimin PES karşılığı.
- Atölye özeti görünümü view'dan beslenir.

### Faz 5 — Yayın
- Vercel CLI kurulumu, proje bağlama, 5 env değişkeni.
- Supabase Auth: Site URL + Redirect URL.
- Deploy öncesi kontrol: `DATABASE_URL` pooler'a (6543) gidiyor; sunucusuz ortamda
  `postgres` sürücüsünde `prepare: false` gerekli — `lib/supabase/db.ts` doğrulanacak.
- Duman testi: giriş, atölye listesi, bir yetenek ataması, çıkış.

**→ Test buradan başlar.**

### Faz 6 — VSM kalıcılığı (test sürerken, ayrı tur)
- `027_vsm_flow.sql`, `/api/pes/vsm-flow` GET/PUT, VSIM flowStore adaptörü.

---

## 5. Riskler

| Risk | Karşılık |
|---|---|
| `next build` şu an **geçmiyor** — dokunulmamış 4 dosyada 16 tip hatası (`RowList<Row[]>` → `as X[]`) | Vercel deploy'u bu yüzden başarısız olur. Faz 5'ten önce düzeltilmeli (mekanik: `as unknown as X[]`) |
| Klasman terimleri PES kataloğuyla kısmen çakışıyor (klasman 49 vs 15) | Import öncesi sözlük birleştirme; eşleşmeyen terim **hata**, sessiz atlama yok |
| Arkadaş yanlış atölyeyi sahiplenir | Sahiplenme geri alınabilir (owner rolü sıfırlar) |
| Aynı atölyede eşzamanlı VSM düzenlemesi | Son yazan kazanır; test için kabul |
| Tailwind `@import` üst dizine çıkamıyor; yeni dizinlerde dev server yeniden başlatma gerekiyor | Bilinen; `app/styles/` deseni korunur |

---

## 6. Test senaryosu (kabul ölçütü)

1. Arkadaş kendisine verilen adres + şifreyle giriş yapar.
2. Havuzdan kendi atölyesini bulur ve sahiplenir.
3. Bandının yeteneklerini işaretler (ana grup, klasman, kumaş, makine) ve kaydeder.
4. Başka bir atölyenin sayfasına gitmeye çalışır → **403**.
5. Sen ortak panelden her iki atölyenin yeteneklerini ve atölye özetini görürsün.
