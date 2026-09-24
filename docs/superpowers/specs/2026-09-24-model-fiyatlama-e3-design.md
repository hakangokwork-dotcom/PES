# Model Fiyatlama — E3: MTM Kütüphanesi ve Model Maliyeti

Tarih: 2026-09-24 · Durum: tasarım onaylandı, uygulama planı bekliyor

Önceki iş: `2026-09-15-atolye-ekonomi-e0-design.md` (E0 veri omurgası, `hesapla()` çekirdeği)

---

## 1. Amaç

Kullanıcının ilk sorusu: *"bir model diktirirken atölyenin beklentinin üzerinde kazanması, veya farkında olmadan zarara uğraması, veya standart işçilik rakamlarına göre bir modelin kaç liraya dikilmesinin makul olduğu"*.

E0 bunun yarısını verdi: her atölyenin **kendi** kesim / dikim / UKP dakika maliyeti, kendi gider ve ciro verisinden. Eksik olan yarısı süre: bir modelin o atölyede kaç dakika sürdüğü. E3 o yarıyı getirir ve ikisini çarpar.

E3 ayrıca E0'da bilerek ertelenen soruyu kapatır: **klasman kârlılığı.** Atölye seviyesinde tek ciro/tek gider olduğu için "hangi klasmanda kâr ediyoruz" cevaplanamıyordu; model katmanı her modeli bir klasmana bağladığı ve kendi maliyet–fiyat satırını taşıdığı için gerçek cevap buradan gelir.

---

## 2. Bugünkü durum — ölçüldü

| Katman | Durum |
|---|---|
| `eder_model`, `eder_model_islem`, `eder_operasyon_grubu`, `eder_alt_operasyon`, `eder_atolye_teklif` | kurulu, **0 satır** |
| `ref_urun_tipi` … `ref_operasyon_zamani` (7 tablo, migration 012) | kurulu, **0 satır** |
| `kv3_urun`, `kv3_urun_islem` | kurulu, **0 satır** |
| `model_library` | 10 satır — **seed**; kategoriler tutarsız ("Basic Tişört" → kategori "Pantolon") |
| `dk_maliyet` (bölgesel 3D) | **12 satır, gerçek** |
| `workshop_economy` + `economy_param` (E0) | **11 atölye × 3 ay, gerçek ve Excel'e karşı doğrulanmış** |

Yani PES'te bugün **hiç gerçek süre verisi yok.** Bu alandaki her şey ya boş ya seed.

Buna karşılık dosya sisteminde iki gerçek kaynak var:

**A. Operasyon zamanı kütüphanesi** — `PES/Konfeksiyon_operasyonları/konfeksiyon_veri_modeli.xlsx` (1,7 MB, 8 sayfa) ve yanında `veri_modeli_dokuman.md`. Orijinali 46.244 satırlık düz bir dosya; temizlenip 7 tabloya ayrıştırılmış.

| Sayfa | Satır | `ref_*` karşılığı |
|---|---|---|
| `01_urun_tipi` | 117 | `ref_urun_tipi` |
| `02_ek_parca_tipi` | 464 | `ref_ek_parca_tipi` |
| `03_ek_parca_varyant` | 1.270 | `ref_ek_parca_varyant` |
| `04_operasyon_grup` | 273 | `ref_operasyon_grup` |
| `05_operasyon` | 1.338 | `ref_operasyon` |
| `06_makine_tipi` | 17 | `ref_makine_tipi` |
| `07_operasyon_zamani` | **30.319** | `ref_operasyon_zamani` |

Sayfa başlıkları 3. satırda, veri 4'ten başlıyor. Kolon adları `ref_*` tablolarının kolonlarıyla birebir — şema bu dosya için kurulmuş ve hiç yüklenmemiş.

MTM değerleri medyan; yanlarında `mtm_min`, `mtm_max`, `mtm_std`, `orneklem`, `varyasyon_yuzde` ve **`guven_seviyesi`** var:

| Seviye | Kural | Sayı |
|---|---|---|
| `TEK_OLCUM` | tek ölçüm | 21.595 |
| `YUKSEK` | VK < %5 | 4.824 |
| `ORTA` | %5 ≤ VK < %20 | 1.861 |
| `DUSUK` | VK ≥ %20 — sahada doğrulanmalı | 2.039 |

**B. Model operasyon bülteni** — örnek: `Desktop/pantolon-jean-uretim-case.xlsx`. İki sayfa:

- `Bilgi`: model adı, PLM ID, kumaş tipi, sipariş adedi, sezon, not
- `Operasyonlar`: 70 satır × 9 kolon — `Sıra`, `1.Seviye Süreç`, `2.Seviye Süreç`, `3.Seviye Süreç`, `Çevrim (sn)`, `Tip`, `Makine Kodu`, `Operatör`, `Öncesi`

Toplam 1.368 sn = 22,80 dk. `3.Seviye` bu dosyada tamamen boş, `Öncesi` 70 satırın 6'sında dolu.

---

## 3. Alınan kararlar

| Karar | Seçim | Gerekçe |
|---|---|---|
| Süre kaynağı | **Teorik bülten + atölye gerçeği** | Kullanıcı: *"fiyatlamalar genelde teorik olan ile yapılmaktadır"* — teorik fiyatlar, gerçek kıyaslanır |
| Granülerlik | **Operasyon seviyesi** | Örnek dosya böyle; toplanarak bölüm seviyesine indirilebilir, tersi mümkün değil |
| Kapsam | **Kütüphane + bülten + fiyatlama birlikte** | Kullanıcı tercihi. Bedeli söylendi (tur uzar) ve kabul edildi; fazlara bölünerek karşılandı |
| Gerçek süre | **Üretimden türetilen + atölye beyanı, yan yana** | İkisi arasındaki fark da bir sinyal |
| Mimari | **Bülten için ayrı tablolar** | `eder_model` "bir atölyedeki, bir dönemdeki, bir bölgedeki model" (`bolge`/`donem` NOT NULL); teorik bülten bunların hiçbiri değil |
| Bölüm eşlemesi | **`(1.Seviye, Tip)` çifti, düzenlenebilir** | Ölçüldü: yalnız 1.Seviye ile eşlenirse süre yanlış bölüme yazılıyor (aşağıda) |

### Bölüm eşlemesi neden iki kolona bakar

`Son İşlem` grubu **karışık**: paça kıvırma (36 sn, Düz Dikiş) ve dört punteriz operasyonu gerçek dikim; iplik temizleme, son ütü, perçin/düğme takma, katlama-paket ise UKP.

```
YALNIZ 1.SEVİYE:  DİKİM 1137 sn (%83,1) | KESİM 28 (%2,0) | UKP 203 (%14,8)
TİP-DUYARLI:      DİKİM 1241 sn (%90,7) | KESİM 28 (%2,0) | UKP  99 (%7,2)
```

104 saniye — sürenin %7,6'sı — bölümler arasında yer değiştiriyor.

**Bugün toplam fiyatı değiştirmez**, çünkü `economy_param`'da bölüm maaş ağırlıkları 1/1/1 ve üç bölümün dakika maliyeti aynı çıkıyor. Ama **kapasite payını bugün de değiştirir** (kapasite payı yalnız DİKİM dakikasına bakar), ve bölüm maaşları ayrıştığı gün fiyatı da değiştirir. E0 bu ayrışmaya şimdiden hazır.

Bu yüzden eşleme bir sabit değil, **görünür ve düzenlenebilir bir tablo**.

---

## 4. Veri modeli — migration 039

### 4.1 `ref_*` — yeni tablo yok, yalnız yükleme

Yedi tablo olduğu gibi kullanılır. Yükleme `scripts/import_operasyon_kutuphanesi.mjs` ile; varsayılan kuru çalışma, `--uygula` ile yazar. `id` kolonları dosyadaki id'lerle birebir korunur — `07_operasyon_zamani`'nin yabancı anahtarları onlara dayanıyor.

### 4.2 `model_bulten` — teorik bülten, atölyeden bağımsız

| Kolon | Tip | Açıklama |
|---|---|---|
| `id`, `tenant_id` | | |
| `model_adi` | `VARCHAR(200)` | |
| `plm_id` | `VARCHAR(50)` | |
| `kumas_tipi` | `VARCHAR(200)` | |
| `sezon` | `VARCHAR(20)` | |
| `siparis_adedi` | `INTEGER` | Bültende geliyor; fiyatlamada varsayılan |
| `klasman_kodu` | `VARCHAR(50)` | `capability_value.code`; klasman kârlılığının anahtarı |
| `kaynak_dosya` | `TEXT` | İzlenebilirlik |
| `toplam_sn` | `NUMERIC(10,2)` | Türetilmiş, yazılırken hesaplanır |
| `not` | `TEXT` | |

**Atölye ve dönem YOK.** Bülten bir modelin standart akışıdır; atölye ve dönem `model_fiyat`'ta.

### 4.3 `model_bulten_operasyon`

| Kolon | Tip | Açıklama |
|---|---|---|
| `bulten_id` | `INTEGER` | → `model_bulten` |
| `sira_no` | `INTEGER` | |
| `seviye1`, `seviye2`, `seviye3` | `VARCHAR(200)` | Dosyanın üç süreç kolonu |
| `cevrim_sn` | `NUMERIC(8,2)` | |
| `tip` | `VARCHAR(50)` | Düz Dikiş, Overlok, Punteriz, Ütü/Pres, Yardımcı (El)… |
| `makine_kodu` | `VARCHAR(50)` | SNLS, O/L 3iğne, IRN… |
| `oncesi` | `VARCHAR(200)` | Öncelik bağı; bu turda saklanır, kullanılmaz |
| `bolum` | `VARCHAR(10)` | `KESIM` \| `DIKIM` \| `UKP` |
| `bolum_kaynak` | `VARCHAR(10)` | `kural` \| `elle` — elle ezilen satır işaretli kalır |

### 4.4 `bulten_bolum_kurali`

`(oncelik, seviye1_desen, tip_desen) → bolum`. Desenler `NULL` ise "herhangi". Öncelik sırasıyla ilk eşleşen kural uygulanır. Tohum kurallar:

| Öncelik | seviye1 | tip | → |
|---|---|---|---|
| 10 | `Kesim` | — | `KESIM` |
| 20 | — | `Serme`, `Kesim` | `KESIM` |
| 30 | — | `Düz Dikiş`, `Overlok`, `Punteriz`, `Çift İğne`, `Zincir (FOA)`, `Zincir Dikiş`, `Kemer (Kansai)` | `DIKIM` |
| 40 | `Son İşlem` | — | `UKP` |
| 99 | — | — | `DIKIM` |

Son kural bilerek `DIKIM`: tanınmayan bir operasyon en olası yere düşer ve import raporu kaç satırın 99'a düştüğünü söyler.

### 4.5 `model_fiyat`

`(bulten_id, workshop_id, donem)` tekil. Hesaplanan değerler **saklanır**: `kesim_dk`, `dikim_dk`, `ukp_dk`, `kesim_tl`, `dikim_tl`, `ukp_tl`, `toplam_maliyet`, `adil_fiyat`, `cmt_fiyat`, `kar_adet`, `marj`, `kapasite_payi`, `referans_3d`, `cmt_3d_sapma`, `hesaplandi_at`, `param_donem`.

**Neden saklanıyor:** fiyat bir karar anıdır. Üç ay sonra "bu fiyatı neye göre verdik" sorusunun cevabı, o günkü parametre ve dakika maliyetiyle birlikte durmalı. `param_donem` hangi parametre setiyle hesaplandığını kaydeder.

### 4.6 `model_gercek_sure`

`(bulten_id, workshop_id, donem, kaynak)`; `kaynak` ∈ `uretim` \| `beyan`. Kolonlar: `dk_adet`, `gun_sayisi`, `atlanan_gun`, `not`.

### 4.7 `work_order.model_bulten_id`

Nullable FK. Bugün iş emrinde model serbest metin (`model_adi`, `stil_kodu`); bülten bağlanmadan üretimden türetme yapılamaz.

### RLS

Altı yeni tablo da **iç ekip verisi** — `current_workshop_id() IS NULL` şartıyla atölye kullanıcısı dışarıda. 035'in `OR workshop_id IS NULL` kalıbı kullanılmaz (bkz. E0 migration 037 ve PO havuzu 038).

`ref_*` tabloları ortak katalogdur; mevcut politikaları korunur.

---

## 5. Hesap çekirdeği — `lib/pes/model-fiyat.ts`

Excel `MODEL_HESAP` ile birebir. Girdi: bültenin bölüm toplamları + E0'ın `hesapla()` çıktısı + `economy_param` + bölge 3D.

```
gerçek dk/adet (bölüm b) = Σ cevrim_sn(b) ÷ 60 ÷ verimlilik_b
bölüm maliyeti/adet      = gerçek dk × bölüm dk maliyeti        ← E0, ATÖLYEYE ÖZEL
toplam maliyet/adet      = kesim + dikim + UKP
adil fiyat               = toplam maliyet × (1 + hedef marj)
kâr/adet                 = CMT − toplam maliyet
marj                     = kâr ÷ CMT
kapasite payı            = (günlük adet × dikim gerçek dk) ÷ (dikim kişi × saat × 60)
3D referans maliyet      = Σ(cevrim_sn ÷ 60) × bölge 3D          ← verimlilik düzeltmesiz
CMT ÷ 3D − 1
```

Son satır bilerek farklı: `FORMULLER!E51` diyor ki 3D değeri verimlilik kaybını zaten içerir, o yüzden standart dakikayla çarpılır. Verimlilikle ikinci kez düzeltmek çifte sayım olur.

Hesaplanamayan her alan `null` döner, `0` değil — E0'ın kuralı.

### Üretimden türetme

```
dk/adet = (dikim kişi × saat × 60) ÷ günlük adet
```

İş emrinin üretim günleri üzerinden; zincir `work_order_gunluk_uretim.atama_id` → `work_order_stage_atama.line_id` → `production_line.workshop_id`.

**Karışık günler hesaba girmez.** Bir bant aynı gün birden fazla iş emri işliyorsa o gün paylaştırılamaz; `atlanan_gun` olarak sayılır ve ekranda yazar. Paylaştırma uydurmaktansa eksik saymak doğrudur — uydurulmuş bir dakika fiyat pazarlığında yanlış tarafa çeker.

---

## 6. Ekranlar

| Ekran | İçerik |
|---|---|
| `/pes/model` | Bülten listesi: model, PLM, toplam dakika, operasyon sayısı, bölüm dağılımı, kaç atölyede fiyatlanmış |
| `/pes/model/[id]` | Bültenin satırları; üstte bölüm dağılımı şeridi; her satırın bölümü elle ezilebilir ve ezildiği işaretli kalır |
| `/pes/model/[id]/fiyat` | **Asıl ekran.** Seçilen atölyeler yan yana: toplam maliyet, adil fiyat, CMT, marj, kapasite payı, 3D sapması. Altta üç süre (teorik / üretim / beyan) ve farkları |
| `/pes/model/[id]/yukle` | Import: dosya → önizleme → bölüm eşlemesi uygulanır ve gösterilir → onay |
| `/pes/model/kutuphane` | `ref_*` gezgini: klasman → ek parça → operasyon, MTM medyanı + güven seviyesi rozeti; `DUSUK` filtresi |

Sidebar'a tek giriş: **Model Fiyatlama** → `/pes/model`.

---

## 7. Fazlar

| Faz | İçerik | Sonunda |
|---|---|---|
| 1 | `ref_*` yükleme + kütüphane gezgini | 30.319 MTM değeri aranabilir, güven seviyeleri görünür |
| 2 | Bülten şeması + import + bölüm eşleme kuralları | Örnek dosya içeri girer, bölüm dağılımı doğru |
| 3 | Fiyatlama çekirdeği + fiyat ekranı | **"Bu model bu atölyede kaça dikilir"** cevaplanır |
| 4 | Gerçek süre (türetme + beyan) + karşılaştırma | Teorik ↔ gerçek farkı ölçülür |

Faz 1 önce, çünkü kütüphane bültenin operasyon adlarını ve bölüm eşlemesini doğrulamakta işe yarıyor.

---

## 8. Kapsam dışı

- `eder_*` modülü — dokunulmaz; akıbeti ayrı karar
- Öğrenme eğrisi, parti büyüklüğü, model değişim süresi etkisi → **E5**
- Bülten PDF'ten okuma — bu turda yalnız Excel
- Operasyon seviyesinde bant dengeleme / yamazumi — mevcut VSM modülünün işi
- `oncesi` (öncelik bağı) saklanır ama kullanılmaz; akış analizi sonraki tur

---

## 9. Doğrulama

1. `node scripts/_migrate_one.mjs 039_model_fiyatlama.sql`; ROLLBACK bloğu geri alır.
2. Kütüphane yüklemesi: yedi tabloda beklenen satır sayıları (117 / 464 / 1.270 / 273 / 1.338 / 17 / 30.319); yabancı anahtar ihlali yok.
3. Bölüm eşleme birim testi: örnek dosyanın 70 satırı → `KESIM 28 sn / DIKIM 1241 sn / UKP 99 sn`. Bu sayılar bu spec'te ölçüldü; sapma ya kural ya kod hatasıdır.
4. Fiyat çekirdeği birim testi — Excel `MODEL_HESAP` satır 4 (Netclass, klasik gömlek; MTM 150/1380/300 sn, bölüm dk maliyeti 3,322142950541009 TL, bölge 6 → 3D 5,05; CMT 377, günlük adet 1.200, kapasite 32.400 dk). Beklenen, ‰1 içinde:

   | Gösterge | Beklenen |
   |---|---|
   | Kesim gerçek dk | 3,3333333333 |
   | Dikim gerçek dk | 35,3846153846 |
   | UKP gerçek dk | 6,6666666667 |
   | Toplam maliyet / adet | 150,7741800630 |
   | Adil fiyat | 173,3903070725 |
   | Kapasite payı | 1,3105413105 |
   | 3D referans maliyet | 154,025 |

   Bu değerler spec yazılırken Excel'in önbelleğinden okundu ve formüller elle yeniden hesaplanarak doğrulandı (ör. kesim 150 ÷ 60 ÷ 0,75 = 3,3333; 3D (150+1380+300) ÷ 60 × 5,05 = 154,025). Sapma çıkarsa önce hangisinin doğru olduğuna karar ver.
5. RLS testi: atölye kullanıcısı altı yeni tablodan 0 satır görür.
6. `verify_public_api.mjs` — yeni uçlar 401.
7. Tarayıcı: bülten yükle → bölüm dağılımını gör → bir atölye seç → fiyat çıkar → 3D referansla karşılaştır.
