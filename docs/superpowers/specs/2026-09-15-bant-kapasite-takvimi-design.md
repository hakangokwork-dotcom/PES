# Bant Kapasite Takvimi — Tasarım

Tarih: 2026-09-15 · Durum: tasarım onaylandı, uygulama planı bekliyor

Maket: https://claude.ai/artifact/VKqcZPWErSSEJVTjRRmKi1

---

## 1. Problem

`/pes/takvim` bugün atölyelerin bant doluluğunu gösteriyor, ama üç ayrı sebeple
yanlış cevap veriyor.

**Yanlış kaynaktan okuyor.** Ekran `work_order.line_id` ile başlangıç/bitiş
tarihlerini çiziyor — 030 öncesi yol. 030 gerçek bant tahsisini
`work_order_stage_atama`'ya taşıdı ve `line_schedule`'ı "yalnız iş emri dışı
bloklar: bakım, izin, tatil" anlamına daralttı. Ekran `line_schedule`'ı hiç
okumuyor; uygulama kodunun hiçbir yeri okumuyor. Bakımdaki bir bant ekranda
**boş** görünüyor. "Boş bant bul" diye açılan bir ekran için bu doğrudan yanlış.

**Doluluğu ikili sayıyor.** Hesap "o gün dolu mu" diye gün sayıyor.
`work_order_stage_atama.adet` ve `workshop_stage_capacity.gunluk_kapasite`
duruyor ama kullanılmıyor. Planlamacı "bu bant %60 dolu, 400 adet daha alır"
cevabını alamıyor; aynı bantta iki siparişin çakıştığını göremiyor.

**Üretim öncesini hiç göstermiyor.** Kumaş ne zaman geliyor, çekme testi yapıldı
mı, kesim başladı mı — hiçbiri ekranda yok. Oysa bir bandın asıl darboğazı
çoğu zaman dikim değil, kumaşın gecikmesi. Dahası önceki model bantta yürürken
yeni siparişin kesimi ve hazırlığı başlar; bu **grift geçiş** planın kendisidir
ve bugün görünmüyor.

Sonuç: planlamacı ekrana bakıp karar veremiyor, Excel ve telefona dönüyor.

---

## 2. Kararlar

**K1 — Kapasite atölyenin, bantlar arasında ortak.** Bant başına ayrı kapasite
tutulmaz. Atölye "günde 6.000 adet" der; üç bandı bu havuzu paylaşır. Doluluk
atölye satırında hesaplanır, bant satırı yalnız siparişin nerede durduğunu
gösterir. Kaynak `workshop_stage_capacity`'nin **DIKIM** satırıdır.
`production_line.daily_target` bu ekranda payda olmaktan çıkar; başka ekranlarda
kullanıldığı için tabloda kalır.

**K2 — Bandın varsayılan günlük payı = atölye kapasitesi ÷ bant sayısı.**
6.000 kapasiteli üç bantlı atölyede bant başına 2.000. Bölen **aktif** bant
sayısıdır (`production_line.is_active`). Bu yalnızca başlangıç değeridir; atölye
gün gün ezer.

**K3 — Günlük planı ve gerçekleşeni atölye girer.** Yeni modele başlarken 2.000
yerine 1.800 yazmak atölyenin kararıdır. Gerçekleşen adet aynı gün girilir.
Merkez ikisini de okur, yazmaz. Giriş ekranı `/workshop/gunluk-uretim` — zaten
var ve tam bunu söylüyor.

**K4 — Planlanan bitiş türetilir.** Günlük plan tektir; `plan_bitis` her yazımda
adedin tükendiği son güne eşitlenir. Tek yazma fonksiyonu ikisini birlikte
günceller. İki ayrı yerden yazılırsa zamanla birbirini tutmaz — 030'un
`line_schedule` için verdiği kararın aynısı.

**K5 — Rezerve `line_schedule`'da yaşar, sahibi ve süresi zorunludur.** Tabloda
`tip` zaten `BLOK` taşıyor ve `work_order_id` nullable; yeni tablo gerekmiyor.
Bakım, izin ve rezerve aynı yerde durur, aynı çakışma kontrolünden geçer.
Sahipsiz ya da süresiz rezerve yazılamaz: bu kısıt olmadan tablo birkaç ay
içinde kimsenin silmeye cesaret edemediği bloklarla dolar.

**K6 — Blok tek renk, içinde gerçekleşen dolgusu.** Günlük ton rampası
denendi ve elendi: bilgi taşımıyor, ekranı yoruyor. Blok sabit renk, koyu kısım
`gerçekleşen ÷ planlanan`.

**K7 — Satır hiyerarşisi: tedarik müdürlüğü → atölye → bant → PO.** Her seviye
katlanır. 131 atölye ancak böyle taranabilir; PO seviyesi varsayılan kapalıdır.

**K8 — Aşama zinciri PO satırında görünür.** Kesim ve hazırlık dikimden önce
başlar, dolayısıyla önceki PO'nun dikim bloğuyla yan yana çizilir. Grift geçiş
başka hiçbir yerde görünmez.

**K9 — Zincir dört zorunlu aşamadan oluşur: kesim → hazırlık → dikim → UKP.**
Dikim ile UKP arasına ürüne göre **bir** değişken aşama girer: yıkama (denim),
baskı ya da nakış. Hiçbiri de girmeyebilir. Değişken aşama sık sık dış atölyede
yapılır; `work_order_stage.workshop_id` bunu zaten taşıyor.

**K10 — Malzeme geliş tarihini ve gelen miktarı atölye girer.** Beklenen tarih
planlamadan gelir. Sipariş edilen ile gelen arasındaki fark eldeki eksik kumaşı
gösterir ve kesimi bloke eder.

**K11 — Çekme testi ayrı tablo, altı alan.** En çekmesi, boy çekmesi, may
kayması, yıkama sayısı, sonuç, yapan. Renk haslığı ve gramaj bu tura girmiyor.

**K12 — Model risk dökümanı kapsam dışı.** Kumaş kalite görselleri, risk
parametreleri, müşteri mutabakat maddeleri ve ilk ürün fotoğrafları ayrı bir
projedir; PES'te ikili dosya saklama altyapısı henüz yok. Takvim yalnızca
**eksiği işaretler**: risk dökümanı olmayan PO blokta kırmızı şerit taşır.

**K13 — Pazar kapalı, Cumartesi çalışılır.** Kapasite hesabı Pazar günlerini
sıfır sayar.

---

## 3. Veri modeli — Migration 036

### 3.1 `line_schedule` rezervasyona açılıyor

```sql
ALTER TABLE line_schedule
  ADD COLUMN IF NOT EXISTS adet             INTEGER,
  ADD COLUMN IF NOT EXISTS sahip            TEXT,
  ADD COLUMN IF NOT EXISTS gecerlilik_bitis DATE;
```

`tip` CHECK'ine `'REZERVE'` eklenir. Eski değerler (`WO`, `CHANGEOVER`, `BAKIM`,
`İZİN`, `BLOK`) korunur; `WO` artık yazılmaz ama enum'ı daraltmak eski satırları
kırma riski taşır, o yüzden durur.

```sql
ALTER TABLE line_schedule ADD CONSTRAINT lsch_rezerve_sahipli
  CHECK (tip <> 'REZERVE' OR (sahip IS NOT NULL AND gecerlilik_bitis IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_lsch_rezerve
  ON line_schedule(line_id, baslangic_tarihi) WHERE tip = 'REZERVE';
```

`adet` NULL ise blok bandın tamamını kaplar.

### 3.2 `workshop_kapasite_gun` — yeni

Atölyenin günlük kapasitesinin sabitten saptığı günler. Kayıt yoksa
`workshop_stage_capacity`'nin DIKIM satırındaki `gunluk_kapasite` geçerlidir.

```sql
CREATE TABLE workshop_kapasite_gun (
    workshop_id      INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id        UUID    NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
    tarih            DATE    NOT NULL,
    gunluk_kapasite  INTEGER NOT NULL CHECK (gunluk_kapasite >= 0),
    sebep            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workshop_id, tarih)
);
```

Gün başına bir satır, ama giriş **tarih aralığı** olarak yapılır ("01.01–15.01
arası 1.200/gün") ve API aralığı satırlara açar. Kimse otuz günü tek tek yazmaz.

### 3.3 `work_order_gunluk_uretim` genişliyor

```sql
ALTER TABLE work_order_gunluk_uretim
  ADD COLUMN IF NOT EXISTS plan_adet INTEGER;
ALTER TABLE work_order_gunluk_uretim ALTER COLUMN adet DROP NOT NULL;
ALTER TABLE work_order_gunluk_uretim ALTER COLUMN adet DROP DEFAULT;
```

`adet` nullable olmalı: plan satırları üretimden **önce** yazılır ve `0` ile
"henüz girilmedi" aynı şeye benzer. Bundan sonra `NULL` = girilmedi, `0` =
girildi ve sıfır üretim. Aksi halde gerçekleşme raporu üretim başlamamış günleri
sıfır üretim sayar.

Tablo adı "üretim" diyor ama artık planı da tutuyor; ad değişmez (kod ve
migration izleri var), tablo yorumu güncellenir.

### 3.4 `work_order_material` genişliyor

```sql
ALTER TABLE work_order_material
  ADD COLUMN IF NOT EXISTS gelen_miktar DECIMAL(10,3);
```

`miktar` sipariş edilendir, `gelen_miktar` fiilen gelendir. `durum = 'Eksik'`
zaten CHECK'te duruyor ama miktarı yoktu.

### 3.5 `kumas_cekme_testi` — yeni

```sql
CREATE TABLE kumas_cekme_testi (
    id             SERIAL PRIMARY KEY,
    work_order_id  INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
    tenant_id      UUID    NOT NULL REFERENCES tenant(id)     ON DELETE CASCADE,
    workshop_id    INTEGER REFERENCES workshop(id) ON DELETE SET NULL,
    tarih          DATE    NOT NULL,
    yikama_sayisi  SMALLINT CHECK (yikama_sayisi BETWEEN 0 AND 10),
    en_cekme_pct   NUMERIC(5,2),
    boy_cekme_pct  NUMERIC(5,2),
    may_kaymasi_pct NUMERIC(5,2),
    sonuc          VARCHAR(20) NOT NULL CHECK (sonuc IN ('UYGUN','RİSKLİ','RED','BEKLIYOR')),
    yapan          VARCHAR(100),
    notlar         TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kct_wo ON kumas_cekme_testi(work_order_id);
```

Çekme yüzdeleri negatif olur (kumaş küçülür); işaret korunur.

### 3.6 `production_stage` katalog düzeltmesi

Mevcut katalog K9 ile üç yerde çelişiyor.

```sql
-- Hazırlık kesimden SONRA gelir ve zorunludur
UPDATE production_stage SET sira_no = 15, zorunlu = TRUE WHERE code = 'HAZIRLIK';

-- Dikim ile UKP arasına giren değişken aşamalar
INSERT INTO production_stage (code, name, sira_no, zorunlu, renk) VALUES
  ('BASKI', 'Baskı', 32, FALSE, '#0ea5e9'),
  ('NAKIS', 'Nakış', 34, FALSE, '#8b5cf6')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, sira_no = EXCLUDED.sira_no, zorunlu = EXCLUDED.zorunlu;
```

`KESIM` (10), `DIKIM` (20), `UKP` (50) zaten `zorunlu = TRUE`. `YIKAMA` (30)
zaten opsiyonel. Yerleştirme sihirbazı `zorunlu` alanını okuyup zinciri
kurduğu için (030b) kod değişikliği gerekmez — düzeltme yalnız veridir.

### 3.7 RLS ve atölye kısıtı

Yeni tablolar 019b tenant izolasyonunu ve 033 atölye kısıtını izler.
`workshop_kapasite_gun` ile `kumas_cekme_testi` `workshop_id` taşıdığı için
033'ün `dogrudan` listesine girer.

**Kapatılacak boşluk:** `work_order_gunluk_uretim` bugün 033'ün hiçbir listesinde
yok — ne `workshop_id` ne `line_id` taşıyor, yalnız `atama_id`. K3 bu tabloya
atölye yazdırdığına göre kısıt şart. `atama_id → work_order_stage_atama.line_id
→ production_line.workshop_id` zinciriyle `dolayli` desene benzer bir politika
yazılır. 035'in eklediği `verify_workshop_isolation.mjs` artık tüm tabloları
taradığı için doğrulama hazır.

---

## 4. Hesap kuralları

Tek formül, tek yerde. Bunu `lib/pes/` altında saf bir modüle koy; hem API hem
doğrulama betiği aynı koddan okusun.

```
efektif kapasite(atölye, gün) =
    Pazar ise 0
    workshop_kapasite_gun(atölye, gün)
      ?? workshop_stage_capacity(atölye, DIKIM).gunluk_kapasite

bandın varsayılan payı(bant, gün) =
    o bantta kapsayan BAKIM/İZİN bloğu varsa 0
    değilse efektif kapasite(atölye, gün) ÷ atölyenin AKTİF bant sayısı

günlük plan(atama, gün) =
    plan_adet girilmişse o
    değilse min(kalan adet, bandın varsayılan payı)

plan_bitis(atama) = adedin tükendiği son gün

doluluk(atölye, gün) =
    (Σ tüm atamaların günlük planı + Σ rezerve adetleri) ÷ efektif kapasite

kapasite aşımı = doluluk > 1
```

**Varsayım:** elle girilen gün sabit kalır. Blok başka banda ya da tarihe
taşındığında otomatik günler kayar, elle yazılan rampa korunur. Aksi halde
planlamacı her taşımada rampayı baştan yazar.

---

## 5. Ekran

`/pes/takvim` yerini alır. Mevcut 863 satırlık tek dosya bölünür; hesap kuralları
`lib/pes/`'e, satır bileşenleri `components/pes/takvim/` altına çıkar.

### 5.1 Satırlar

| seviye | sol sütun | sağ şerit |
|---|---|---|
| Tedarik müdürlüğü | ad, atölye sayısı | toplam kapasite |
| Atölye | ad, kod, bölge, kapasite, doluluk % | günlük doluluk çubukları, içinde gerçekleşen dolgusu |
| Bant | ad, PO sayısı | dikim blokları, rezerve, bakım/izin |
| PO | PO no, model, durum rozetleri | malzeme kilometre taşları + aşama zinciri |

PO satırının rozetleri satır içinde okunur: malzeme durumu, çekme testi sonucu,
risk dökümanı eksikliği, açık konu sayısı.

### 5.2 Görsel dil

- **Dikim bloğu** — düz yeşil, koyu dolgu gerçekleşen oranı.
- **Rezerve** — kesik çizgili mor. Süresi geçmişse soluk.
- **Bakım / izin** — dokulu nötr; renk değil doku ayırır.
- **Zorunlu aşama** — düz çerçeve. **Değişken aşama** — kesik çizgi, `· dış`
  etiketi dış atölyeyi gösterir.
- **Kapasite aşımı** — atölye çubuğunda kırmızı halka.
- **Teslim riski** — blok sağ kenarında sarı şerit.
- **Risk dökümanı yok** — blok sol kenarında kırmızı şerit.

Kategorik renkler `scripts/validate_palette.js` ile doğrulandı: yeşil `#197A56`
ve mor `#5B6BAF` açık temada, `#3FA87C` ve `#6E7FE8` koyu temada tüm renk körlüğü
kontrollerinden geçiyor.

### 5.3 Zoom

| görünüm | kolon | hücre içeriği |
|---|---|---|
| Ay | 1 gün, dar | yalnız çubuk — tarama için |
| Hafta | 1 gün, geniş | `plan / kapasite` ve gerçekleşen |
| Gün | tek gün | atölye ve bant kırılımı tablosu |

### 5.4 Etkileşim

- Boş hücre → *Rezerve et* / *Sipariş yerleştir* / *Kapasite gir*. Yerleştirme
  mevcut sihirbazı atölye, bant ve tarih önseçili açar; aşama zinciri mantığı
  çatallanmaz.
- Blok sürükle → başka bant veya tarih. Bırakırken kapasite kontrolü.
- Blok kenarı çek → süre değişir, günlük plan kurala göre yeniden dağılır.
- Bloğa tıkla → yan panel, beş sekme: **Günlük plan**, **Zincir**, **Malzeme**,
  **Çekme testi**, **Konular** (`work_order_journal`).
- Uyarı sayaçları tıklanınca filtreye dönüşür. Sıfırken alarm rengi taşımaz.

### 5.5 Filtreler

Tedarik müdürlüğü, bölge, yetkinlik, doluluk aralığı, arama. Yetkinlik filtresi
`line_capability` üzerinden çalışır ve "bu ürünü yapabilen **ve** boş" sorusunu
tek ekranda cevaplar; planlamacıyı `/pes/yetenek-arama`'ya gidip gelmekten
kurtarır.

---

## 6. Roller

| | Merkez planlamacı | Atölye kullanıcısı |
|---|---|---|
| Görünen | tüm atölyeler | yalnız kendi atölyesi (033) |
| Sipariş yerleştirme, rezerve | yazar | — |
| Günlük plan, gerçekleşen | okur | **yazar** |
| Atölye günlük kapasitesi | okur | **yazar** |
| Malzeme geliş tarihi, gelen miktar | okur | **yazar** |
| Çekme testi | okur | **yazar** |

Atölye tarafı yeni bir yetkilendirme işi değil: 033 `work_order_stage_atama`'yı
ve `line_schedule`'ı zaten bant üzerinden atölyeye bağlıyor. Eksik olan tek şey
3.7'de yazılı `work_order_gunluk_uretim` boşluğu.

---

## 7. Kapsam dışı

- **Model risk dökümanı** (K12) — ayrı spec, ayrı plan. Görsel saklama altyapısı
  o turda kurulur.
- Renk haslığı, gramaj sapması, tuşe (K11).
- Otomatik yerleştirme önerisi. Sistem eler, kullanıcı seçer — 030'un K5'i.
- Aşamalar arası tampon süre kuralları.
- Rezervenin onay akışı. Sahip ve süre yeterli; talep→onay zinciri sonraki tur.

---

## 8. Doğrulama

1. `node scripts/_migrate_one.mjs 036_...` çalışır, `ROLLBACK` bloğu geri alır.
2. `node scripts/verify_public_api.mjs` — yeni tablolar 401 döner.
3. `node scripts/verify_workshop_isolation.mjs` — `work_order_gunluk_uretim`,
   `workshop_kapasite_gun` ve `kumas_cekme_testi` dahil tüm tablolarda atölye
   kullanıcısı yalnız kendi satırlarını görür.
4. Hesap modülünün birim testleri: Pazar sıfır kapasite, elle girilen günün
   sabit kalması, `plan_bitis` türetimi, kapasite aşımı eşiği.
5. Sahipsiz rezerve INSERT'i CHECK ile reddedilir.
6. `production_stage` düzeltmesinden sonra yerleştirme sihirbazı zinciri
   kesim → hazırlık → dikim → UKP sırasıyla kurar; yıkama/baskı/nakış seçilebilir
   kalır.
