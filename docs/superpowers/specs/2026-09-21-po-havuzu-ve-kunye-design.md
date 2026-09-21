# PO Havuzu ve Künye — Tasarım

Tarih: 2026-09-21 · Durum: **uygulandı** — migration 038 + 038b canlıda, dokuz görev bitti, doğrulama geçti (1079 test, `verify_workshop_isolation` 76/76, `verify_public_api` temiz)

Önceki iş: `2026-09-15-bant-kapasite-takvimi-design.md` §7.1 bu projeyi tanımladı.

---

## 1. Problem

İş emri bugün **yalnız yerleştirme anında** doğuyor: `lib/pes/yerlestir-kaydet.ts`
ve `POST /api/pes/work-orders` ikisi de `workshop_id` istiyor, kolon `NOT NULL`.
"Gelen PO'yu kenara yazdım, henüz atölyeye atamadım" durumu temsil edilemiyor.
Planlamacı PO'ları Excel'de biriktirip sihirbaza tek tek elle giriyor.

İkinci eksik **künye**: `work_order` müşteri, stil kodu, sezon, adet, teslim ve
fiyatı taşıyor ama ürün grubu, klasman, kumaş türü, kumaş grubu, cinsiyet/yaş,
kalite segmenti ve kumaşçıyı taşımıyor. Oysa katalog (`capability_value`,
023b) bu boyutların hepsine sahip ve bantların yetkinliği aynı kodlarla
tanımlı (`line_capability.value_code`). Künye olmayınca "bu PO'yu hangi
atölye yapabilir" sorusu sistemden cevaplanamıyor.

Üçüncüsü bir **güvenlik hatası**. Migration 035 atölye kısıtına
`OR workshop_id IS NULL` ekledi — ortak katalog satırlarını (model_library)
atölyeye göstermek için doğru, ama aynı kural `work_order` ve
`work_order_stage`'e de uygulandı. Sonuç: `workshop_id`'yi nullable yapıp
havuz kaydı yazarsak **PO müşterisi, adedi ve fiyatıyla 131 atölyenin
hepsine görünür**. Ve bugün zaten `work_order_stage.workshop_id` 030'a göre
"NULL = siparişin atölyesi" — yani normal aşama satırları her atölye
kullanıcısına açık. Künye sızmıyor (iş emri görünmüyor) ama kural yanlış
yerde çalışıyor.

---

## 2. Kararlar

**K1 — Tek kayıt, havuzda doğar.** Ayrı `po_havuz` tablosu yok. `work_order`
`workshop_id = NULL`, `durum = 'Taslak'` ile açılır; yerleştirmede atölye
yazılır ve durum `'Planlandi'` olur. `'Taslak'` enum'da zaten var ve üç
ekranda renklendirilmiş; yeni durum değeri eklenmez. Künye giriş anından
sevke tek satırda yaşar — iki tabloda tekrar eden alan, zamanla birbirini
tutmayan iki gerçek demekti.

**K2 — 035 kuralı `work_order` ve `work_order_stage` için ezilir.** İki tablo
ortak katalog değil, ticari kayıt; `NULL` "herkese açık" değil "henüz
atanmadı" demek. Özel politika:

- `work_order`: `current_workshop_id() IS NULL OR workshop_id = current_workshop_id()`.
  NULL atölyeli PO yalnız merkeze görünür.
- `work_order_stage`: aşamanın kendi `workshop_id`'si doluysa o; NULL ise
  **iş emrinin atölyesi** (030 K4) — politika `work_order`'a bakar:
  `workshop_id = current_workshop_id() OR EXISTS (SELECT 1 FROM work_order wo
  WHERE wo.id = work_order_id AND wo.workshop_id = current_workshop_id())`.
  Dış atölyede yapılan aşama o dış atölyeye de görünür; bugün öyle değildi.

035'in genel döngüsü diğer tablolar için olduğu gibi kalır. Bu iki politika
`verify_workshop_isolation.mjs`'in taradığı listede; ayrıca doğrudan RLS
testi yazılır (§8).

**K3 — Künye yedi alan.** Altısı katalog kodu, biri serbest metin:

| kolon | kaynak boyut | değer sayısı |
|---|---|---|
| `ana_grup_kodu` | `ana_grup` | 7 |
| `klasman_kodu` | `klasman` | 50 |
| `kumas_turu_kodu` | `kumas_turu` | 36 |
| `kumas_grubu_kodu` | `kumas_grubu` | 3 |
| `cinsiyet_yas_kodu` | `cinsiyet_yas` | 6 |
| `kalite_kodu` | `kalite` | 7 |
| `kumasci` | serbest metin | — |

Katalog kodları `VARCHAR`, `capability_value.code` ile eşleşir —
`line_capability.value_code` ile aynı desen. Yabancı anahtar YOK: katalog
`(dimension_id, code)` tekil, tek kolon FK kuramaz; API yazarken katalogda
var mı diye doğrular, yoksa 400 döner. Hepsi isteğe bağlı: havuza yarım
künyeyle PO yazılabilir, sihirbaz eksiği gösterir ama engellemez.

**K4 — Havuz ekranı `/pes/siparisler`.** Üç görünüm: *Havuzda* (`Taslak`),
*Atanmış*, *Hepsi*. Satır: sipariş no, müşteri, model, klasman, kumaş türü,
adet, teslim, kalan gün, atölye (varsa). Oluştur/düzenle formu künyeyi
katalogdan seçtirir (`<select>`, etiket gösterir, kod yazar). "Atölyeye ata"
düğmesi sihirbazı bu PO ile açar.

**K5 — Sihirbaz havuz modu.** `YerlestirIstek`'e isteğe bağlı `workOrderId`
eklenir. Doluysa `yerlestir()` yeni iş emri açmaz, mevcut satırı **günceller**
(`workshop_id`, tarihler, `durum = 'Planlandi'`) ve aşama zincirini ona
bağlar. Sihirbazın 1. adımı (sipariş bilgisi) havuz kaydından dolu ve salt
okunur gelir; künye değişikliği havuz ekranında yapılır, iki yerden yazılmaz.
`workOrderId` yoksa bugünkü davranış aynen sürer — sihirbazdan sıfırdan
sipariş açmak kalkmıyor.

Havuz kaydı **aşama zinciri kurmaz**: `POST /api/pes/work-orders`'ın
çağırdığı `wo_init_stages` havuz ucunda çağrılmaz. Zinciri yerleştirme
kurar — bugün olduğu gibi. Aksi halde sihirbaz UPDATE modunda önce eski
zinciri silmek zorunda kalırdı.

**K6 — Yetkinlik eşleşmesi künyeden.** Havuzdaki PO'nun `klasman_kodu` ve
`kumas_turu_kodu`'na sahip bandı olan atölyeler sihirbazın atölye adımında
önce listelenir ("bu ürünü yapabilen"), diğerleri altta. Mevcut
`lib/pes/aday-atolye.ts` zaten `yetenek` ağırlığıyla (30/100)
`line_capability` eşleşmesi puanlıyor ama `AdayIstek` klasman/kumaş kodu
almıyor; iki alan eklenir (`klasmanKodu?`, `kumasTuruKodu?`) ve puan
bunlarla hesaplanır. Yeni modül yazılmaz. Otomatik atama YOK — sistem
eler, kullanıcı seçer (030 K5).

**K7 — Durum geçişleri.** `Taslak → Planlandi` yalnız yerleştirmeyle.
Havuzdan silme yalnız `Taslak`'ta; yerleştirilmiş PO havuz ekranından
silinemez (iş emri ekranı ve iptal akışı oradadır). Yerleştirmeyi geri
almak (`Planlandi → Taslak`) bu turda yok; kapsam dışı.

**K8 — Takvimdeki "Sipariş yerleştir" havuza gider.** Hücre menüsündeki
bağlantı `/pes/siparisler?havuz=1&bant=&tarih=` açar; kullanıcı havuzdan PO
seçer, sihirbaz atölye/bant/tarih önseçili açılır. Takvim spec'inin açık
bıraktığı "sihirbaz URL parametresi okumuyor" işi böylece kapanır:
parametreyi havuz ekranı okur, sihirbaza prop olarak verir.

**K9 — Merkez yazar, atölye havuzu görmez.** Havuz ve künye düzenleme merkez
yetkisi. Atölye kendine atanmış PO'nun künyesini iş emri ekranında **okur**;
yazamaz.

---

## 3. Veri modeli — Migration 038

```sql
-- 1. Havuz: atölye artık zorunlu değil
ALTER TABLE work_order ALTER COLUMN workshop_id DROP NOT NULL;
COMMENT ON COLUMN work_order.workshop_id IS
'NULL = havuzda, henüz atölyeye atanmadı (durum Taslak). Yerleştirme yazar.';

-- 2. Künye
ALTER TABLE work_order
  ADD COLUMN IF NOT EXISTS ana_grup_kodu     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS klasman_kodu      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kumas_turu_kodu   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kumas_grubu_kodu  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cinsiyet_yas_kodu VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kalite_kodu       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kumasci           VARCHAR(150);

-- Havuz listesi ve atölye filtresi için
CREATE INDEX IF NOT EXISTS idx_wo_havuz ON work_order(tenant_id, durum)
  WHERE workshop_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_wo_klasman ON work_order(klasman_kodu);

-- 3. 035 istisnası — NULL atölye "herkese açık" DEĞİL
DROP POLICY IF EXISTS work_order_tenant_isolation ON work_order;
CREATE POLICY work_order_tenant_isolation ON work_order FOR ALL USING (
  (tenant_id = current_tenant_id() OR is_internal_admin())
  AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()));

DROP POLICY IF EXISTS work_order_stage_tenant_isolation ON work_order_stage;
CREATE POLICY work_order_stage_tenant_isolation ON work_order_stage FOR ALL USING (
  (tenant_id = current_tenant_id() OR is_internal_admin())
  AND (current_workshop_id() IS NULL
       OR workshop_id = current_workshop_id()
       OR (workshop_id IS NULL AND EXISTS (
             SELECT 1 FROM work_order wo
              WHERE wo.id = work_order_stage.work_order_id
                AND wo.workshop_id = current_workshop_id()))));
```

`work_order_stage` politikasındaki alt sorgu `work_order`'ın kendi RLS'inden
geçer; bu istenen davranıştır — iş emrini göremeyen aşamasını da göremez.

`POST /api/pes/work-orders` bugün `workshop_id`'yi gövdeden alıp yazıyor;
isteğe bağlı olur. `is_emri_no` `UNIQUE` — havuzda da tekil, sihirbaz
mevcut numarayı korur.

ROLLBACK: politikaları 035 hâline döndür (dosyada), kolonları düşür,
`workshop_id`'ye `NOT NULL` geri koy — önce `workshop_id IS NULL` satır
kalmadığından emin olarak.

---

## 4. API

| uç | ne yapar |
|---|---|
| `GET /api/pes/siparisler?gorunum=havuz\|atanmis\|hepsi&q=` | liste; kalan gün sunucuda hesaplanır, tarihler `::text` |
| `POST /api/pes/siparisler` | havuza PO açar; `workshop_id` yok, `durum='Taslak'`; künye kodları katalogda doğrulanır |
| `PATCH /api/pes/siparisler/[id]` | künye ve temel alanlar; `workshop_id`/`durum` buradan DEĞİŞMEZ |
| `DELETE /api/pes/siparisler/[id]` | yalnız `Taslak`; aksi 409 |
| `GET /api/pes/katalog?boyut=klasman,kumas_turu,…` | seçenek listeleri; tek istekte birden çok boyut |
| `POST /api/pes/work-orders/yerlestir` (mevcut) | `workOrderId` alırsa UPDATE modu |

Künye doğrulama tek yerde: `lib/pes/kunye.ts` — `kodlariDogrula(sql, {…})`
katalogdan boyut→kod kümesini bir kez çeker, hatalı alanları adıyla döner.
POST ve PATCH aynı fonksiyonu çağırır.

---

## 5. Ekran

**`/pes/siparisler`** — tablo + üstte görünüm sekmeleri ve arama. Havuz
görünümünde her satırın sağında "Atölyeye ata". Kalan gün ≤ 7 ise satır
sarı, teslim geçmişse kırmızı. Oluştur/düzenle aynı form: temel alanlar
(sipariş no, müşteri, model, stil kodu, sezon, adet, teslim, öncelik) +
künye (altı `<select>` + kumaşçı). Katalog seçenekleri sayfa açılışında
tek istekle gelir.

**Sihirbaz** — havuzdan gelince 1. adım dolu ve kilitli; üstte küçük künye
şeridi (klasman · kumaş türü · kumaş grubu). Atölye adımında liste ikiye
bölünür: *Bu ürünü yapabilenler* / *Diğerleri* (K6). URL'den `bant` ve
`tarih` geldiyse bant seçimi ve başlangıç önseçili.

**İş emri sayfası (`/workshop/is-emri/[id]`)** — Özet sekmesine künye
satırı; atölye görür, düzenleyemez.

**Takvim hücre menüsü** — "Sipariş yerleştir" havuza yönlendirir (K8).

---

## 6. Roller

| | Merkez | Atölye |
|---|---|---|
| Havuz listesi | görür, yazar | **görmez** (RLS) |
| Künye | yazar | kendine atanmışı okur |
| Yerleştirme | yapar | — |

---

## 7. Kapsam dışı

- Model risk dökümanı (takvim spec K12) — hâlâ ayrı proje.
- PO'ların Excel/ERP'den toplu ithali. Havuz elle doldurulur; ithal sonraki tur.
- Müşteri master tablosu; `musteri` serbest metin kalır.
- Yerleştirmeyi geri alma (`Planlandi → Taslak`).
- Katalog yönetimi ekranı; katalog 023b'deki gibi migration ile beslenir.

---

## 8. Doğrulama

1. `node scripts/_migrate_one.mjs 038_po_havuzu_ve_kunye.sql`; ROLLBACK bloğu geri alır.
2. **RLS testi** (`lib/pes/po-havuzu-izolasyon.test.ts`): atölye kullanıcısı
   `workshop_id IS NULL` iş emrini **görmez**; başka atölyenin aşama
   satırlarını (`workshop_id IS NULL`) **görmez**; kendi iş emrinin aşamasını
   görür; dış atölyeye çıkan aşamayı dış atölye görür. Merkez hepsini görür.
3. `verify_workshop_isolation.mjs` — `work_order` ve `work_order_stage`
   satırlarında sızıntı yok.
4. `kunye.ts` birim testi: geçerli kod geçer, olmayan kod alan adıyla reddedilir.
5. Sihirbaz UPDATE modu testi (`yerlestir-kaydet.test.ts`'e ek): havuzdaki
   iş emri yerleştirilince `id` aynı kalır, `workshop_id` dolar, durum
   `Planlandi`, aşama zinciri bağlanır; ikinci çağrı yeni satır AÇMAZ.
6. `verify_public_api.mjs` — yeni uçlar 401.
7. Tarayıcı: havuza PO yaz → takvimden hücre menüsü → havuzdan seç → sihirbaz
   önseçili açılır → yerleştir → takvimde blok görünür.
