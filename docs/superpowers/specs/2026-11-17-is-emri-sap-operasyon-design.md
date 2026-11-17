# İş Emri — SAP Benzeri Ana Veri, Operasyon ve Sevk

> Tasarım · 2026-11-17 · Durum: kullanıcı incelemesinde
> Önceki iş: `2026-11-17-is-emri-surec-akisi-design.md` (sürüm 1, v1.19.0 yayında: ölçü şartnamesi, kumaş topu, çekme testi). Bu doküman onun §3–§4.7'deki iş emri akışını, yıkamacıya özel tasarımı ve sürüm 2–3 planını **değiştirir**; sürüm 1'in tabloları aynen kalır.

## 1. Amaç

Operasyonu SAP'in tablo yapısını örnek alarak yönetmek: her ana veri ayrı bir tablo; iş emri açılırken bunlardan seçilir; iş emri operasyonlar zinciri olarak ilerler ve her operasyonu ayrı bir firma yapabilir.

Akış: merkez PO'yu girer → kalemden iş emri açar, rota seçer → operasyonlara firma önerilir → firmalar kabul eder → firma formlarını doldurur ve parça parça sevk eder → sonraki firma teslim alır, kendi operasyonunu yürütür → son operasyon tamamlanınca iş emri biter.

## 2. Kararlar (kullanıcı, 2026-11-17)

| Konu | Karar |
|---|---|
| PO ↔ iş emri | 1 PO → çok iş emri. PO başlık + kalemler (model × renk × beden × adet). |
| İş ortakları | Kumaşçı, kesim, dikim, yıkama, UKP, baskı, nakış ayrı firma olabilir (kesim ve dikim bile). Tek iş ortağı ana verisi. |
| Operasyonun firması | Merkez önerir; sevk eden taraf sevkte değiştirebilir (gerekçe zorunlu, merkez görür). |
| Mal akışı | Parçalı sevk: her sevk renk/beden kırılımlı, lotlu, irsaliyeli, fotoğraflı; alıcı firma her sevki ayrı teslim alır. |
| Rota | Rota şablonu ana veri; iş emri açılırken kopyalanır, iş emrinde değiştirilebilir. |
| Yaklaşım | Mevcut yapıyı genişlet: `work_order` = başlık, `work_order_stage` = operasyon. Paralel emir yapısı kurulmaz. |

Varsayılan (itiraz yoksa geçerli): her firmanın kendi hesabı olur; firma atandığı operasyonu kabul/ret eder (044 gerekçe kodları); alıcı firma sevki sayarak teslim alır.

### 2.1 Çerçeve düzeltmesi (kullanıcı, 2026-11-17) — bu bölüm aşağıdakilerle çelişirse bu geçerlidir

> "ERP gibi davranmak istemiyorum, operasyonumu yönetmek istiyorum… önemli olan ne zaman neyi planladım, ne zaman ne gerçekleşti, bu gerçekleşmenin checklisti veya kalitesi istediğim şekilde oldu mu, nerede problem çıktı… 10 topu kabul edilecek 3 topu red edilip geri gönderilecek." — "Bu detayı bilmem ya da hafıza tutmam önemli."

- **Odak operasyon yönetimi (TNA), stok/defter değil.** İş emri = planlı adımlar zinciri. Her adımda dört şey: **plan** (tarih, sorumlu firma), **gerçekleşen** (tarih; gecikme günü türetilir), **kontrol** (adımın kontrol listesi/formları ve kalite sonucu), **sorun** (neden kodu, etki, çözüm).
- **Plan tarihleri elle girilir**, ama **her değişiklik saklanır**: ilk plan, her revizyon (kim, ne zaman, gerekçe kodu), güncel plan, gerçek. Tablo `adim_plan_gecmisi` (§4.6).
- **Teslimat = kabul/red/iade, kalem bazında.** Sevk yerine teslimat: malzeme tipi Kumaş | Aksesuar | Yarı mamul | Mamul. Alıcı her kalemi (kumaşta top, aksesuarda kalem/parti) **kabul ya da red** eder, red nedeni ve foto ile; red edilenler için **iade** kaydı (irsaliye, tarih). Kumaş topu kabul/red sürüm 1'in `kumas_top.durum`'una yazılır.
- **Hafıza kuralı:** hiçbir kayıt sessizce ezilmez ya da silinmez; düzeltme yeni kayıtla yapılır, ilk kayıt durur (plan revizyonu, test, kabul/red kararı, sorun çözümü).
- **Miktar kuralları uyarıdır, engel değil** (§5'teki 1. madde uyarıya iner). Engel olarak kalanlar: ret edilmiş/firmasız adıma teslimat, zorunlu kontrol eksikken adımı Tamam yapmak, alıcı değişince gerekçe, kayıt silme.
- **Sorun kaydı** mevcut `work_order_journal` (tip PROBLEM/BLOKAJ) üzerinden; adıma (`stage_id`, zaten var) ve isteğe bağlı teslimat kalemine bağlanır, neden kodu kataloğu eklenir.
- **Panolar:** iş emri zaman çizelgesi (ilk plan / güncel plan / gerçek çubukları, geciken adım kırmızı); sorun panosu (adım × firma × neden); kontrol durumu (eksik kontrol listeleri, kötü kalite sonuçları).

## 3. SAP karşılıkları

| SAP | PES | Durum |
|---|---|---|
| MARA malzeme | `model_bulten` | var |
| LFA1 tedarikçi | `is_ortagi` | **yeni** |
| CRHD iş yeri | `production_line` | var |
| Operasyon tipi / kontrol anahtarı | `production_stage` | var (yeni tipler eklenir: KUMAS_KABUL, BASKI, NAKIS…) |
| PLKO/PLPO rota | `rota_sablonu`, `rota_operasyonu` | **yeni** |
| QPMK muayene planı | `olcu_sartname` (061), form tanımları (`lib/pes/formlar.ts`) | var |
| VBAK/VBAP satış siparişi | `siparis`, `siparis_kalem` | **yeni** |
| AUFK/AFKO üretim emri | `work_order` | var, genişler |
| AFVC operasyon | `work_order_stage` | var, genişler |
| Operasyon onayı | `operasyon_onay` | **yeni** |
| MSEG mal hareketi | `sevk`, `sevk_kalem` | **yeni** |
| QALS/QAMR muayene | `uretim_formu`, `olcum`, `kumas_top`, `kumas_cekme_testi` | var / sürüm 2d |
| JEST durum | `work_order_status_history` + `operasyon_onay` | var / yeni |

## 4. Veri modeli

Tüm yeni tablolarda `tenant_id`, RLS (§6), 054/055 `giren_*` kolonları ve `kayit_giren_yaz()`. Migration'lar 064'ten başlar.

### 4.1 Ana veri

```
is_ortagi
  id, tenant_id, tip TEXT CHECK IN ('Kumaşçı','Kesimhane','Atölye','Yıkamacı','UKP','Baskı','Nakış','Aksesuar','Diğer'),
  unvan, kisa_ad, vergi_no, adres, il, telefon, eposta, aktif BOOL
  workshop_id NULL → workshop   -- yalnız tip='Atölye'; UNIQUE (workshop_id)
  CHECK ((tip = 'Atölye') = (workshop_id IS NOT NULL))

is_ortagi_kullanici
  user_id PK, is_ortagi_id, tenant_id
  -- Atölye tipi firmanın kullanıcıları mevcut workshop_user'da kalır (033); burada yalnız diğer tipler.

rota_sablonu
  id, tenant_id, ad, aciklama, aktif

rota_operasyonu
  id, sablon_id, sira, stage_id → production_stage, ortak_tipi (is_ortagi.tip),
  zorunlu_formlar TEXT[]   -- lib/pes/formlar.ts form kodları
  olcu_asamasi TEXT NULL   -- 'YIKAMA_ONCESI' | 'FINAL' | NULL: bu operasyonda hangi şartnameyle ölçülür
  varsayilan_ortak_id NULL → is_ortagi
  UNIQUE (sablon_id, sira)
```

### 4.2 Sipariş

```
siparis          id, tenant_id, musteri, po_no, termin DATE, notlar, durum ('Açık'|'Kapandı'|'İptal')
                 UNIQUE (tenant_id, musteri, po_no)
siparis_kalem    id, siparis_id, model_bulten_id NULL, model_adi, renk, kumas_kategorisi ('Rijit'|'Esnek'|NULL),
                 beden_dagilimi JSONB  -- {"30": 400, "32": 800, …}
                 adet INT (= dağılım toplamı, CHECK tetikleyiciyle), termin DATE NULL
```

### 4.3 İş emri ve operasyon

```
work_order (VAR) + siparis_kalem_id NULL, rota_sablonu_id NULL, kumasci_ortak_id NULL
  -- siparis_no/musteri/model_adi kalemden kopyalanır (mevcut ekranlar onları okuyor);
  -- serbest metin kumasci kalır, yeni kayıtta kumasci_ortak_id dolar.

work_order_stage (VAR) + is_ortagi_id NULL, ortak_durum TEXT
  ortak_durum CHECK IN ('Atanmadı','Atandı','Kabul','Ret','Devam','Tamam')
  zorunlu_formlar TEXT[], olcu_asamasi TEXT NULL   -- rotadan kopya
  -- Mevcut `durum` (plan/bant tarafı) ve ilerleme alanları aynen kalır; ortak_durum firma tarafıdır.

operasyon_onay
  id, stage_kayit_id → work_order_stage, is_ortagi_id, karar ('Kabul'|'Ret'), gerekce_kodu NULL, not_metni, created_at
  -- Geçmiş silinmez; work_order_stage.ortak_durum son kararla güncellenir (tetikleyici).
```

İş emri açma: `rota_sablonu_id` doluysa operasyonlar rotadan kopyalanır (`wo_rota_kur(wo_id)`), `wo_init_stages` çağrılmaz; boşsa bugünkü davranış. Havuz (038) aynen: iş emri `workshop_id NULL` ile havuza düşer; **yerleştirme** seçilen atölyeyi hem `work_order.workshop_id`'ye hem de rotadaki `ortak_tipi='Atölye'` operasyonların `is_ortagi_id`'sine yazar.

### 4.4 Sevk

```
sevk
  id, tenant_id, work_order_id, kaynak_stage_id → work_order_stage (gönderen operasyon; ilk operasyon öncesi kumaş girişi için NULL),
  hedef_stage_id → work_order_stage, gonderen_ortak_id, alici_ortak_id,
  onerilen_alici_ortak_id, degisiklik_gerekcesi NULL  -- alıcı öneriden farklıysa zorunlu
  irsaliye_no, sevk_tarihi, durum ('Yolda'|'Teslim alındı'), teslim_tarihi NULL, teslim_notu NULL

sevk_kalem
  sevk_id, renk, beden, adet, lot NULL, demet_id NULL, teslim_adet NULL
  id PK; UNIQUE INDEX (sevk_id, renk, beden, coalesce(lot, ''))
```

Alıcı firma sevkte değişirse hedef operasyonun `is_ortagi_id`'si de yeni firmaya geçer (o operasyonda başka firmadan teslim alınmış sevk yoksa); varsa sevk reddedilir: aynı operasyonu iki firma yapmaz — merkez operasyonu böler (sürüm 2c'de "operasyonu böl" kapsam dışı; bu durumda 422).

Fotoğraflar: `surec_gorsel` (062) `adim='SEVK'`, `kayit_id = sevk.id`.

### 4.6 Plan geçmişi, teslimat kabul/red/iade, sorun (çerçeve düzeltmesi §2.1)

```
adim_plan_gecmisi
  id, stage_kayit_id → work_order_stage, plan_baslangic, plan_bitis, sorumlu_ortak_id,
  gerekce_kodu NULL (ilk kayıtta NULL; sonrakilerde zorunlu — 044 kodları + 'MUSTERI_TALEBI'),
  not_metni, giren_*, created_at
  -- work_order_stage.plan_* her değiştiğinde tetikleyici eski değeri buraya yazar; ilk plan = en eski satır.

sevk → teslimat olarak kullanılır (§4.4) + malzeme_tipi ('Kumaş'|'Aksesuar'|'Yarı mamul'|'Mamul'), iade_edilen_sevk_id NULL
sevk_kalem + karar ('Bekliyor'|'Kabul'|'Red'), red_nedeni NULL, top_id NULL → kumas_top, aciklama
  -- Kumaş teslimatında her top bir kalem; karar kumas_top.durum'a yansır (Kabul → Serbest değil Karantina→ test sonrası Serbest; Red → Red).
  -- Red kalemler için "İade et": kaynak = alıcı, hedef = gönderen, iade_edilen_sevk_id = asıl teslimat.

sorun_neden (katalog)  kod, ad, adim_tipi NULL   -- ör. KUMAS_HATA, EN_FARKI, TON_FARKI, GEC_GELDI, OLCU_DISI…
work_order_journal (VAR) + teslimat_kalem_id NULL, neden_kodu NULL, etki ('Gecikme'|'Kalite'|'Maliyet'|'Diğer') NULL
```

### 4.5 Görünümler (hesaplanan değerler yalnız burada)

- `v_operasyon_adet`: operasyon başına giren (teslim alınan sevk kalemleri; ilk operasyonda iş emri adedi), çıkan (gönderilen sevk), elde (giren − çıkan), yolda, fark (gönderilen − teslim alınan), eksik zorunlu form sayısı.
- `v_is_emri_zincir`: iş emri × operasyon sırası, firma, ortak_durum, adetler; iş emrinin tamamlanma yüzdesi = son operasyonun çıkanı / iş emri adedi.
- `v_is_emri_surec` (062/063) atölye görünümünde kalır; kumaş kabul operasyonunun durumunu besler.

## 5. Kurallar

Sert (veritabanında, PT422):
1. Bir operasyon, teslim aldığından fazlasını sevk edemez (renk × beden bazında); ilk operasyonda üst sınır iş emri / kalem dağılımı.
2. Ret edilmiş ya da firması olmayan operasyona sevk yapılamaz.
3. Zorunlu formu eksik operasyon `Tamam` olamaz (form = o operasyona bağlı `uretim_formu` kaydı).
4. Sevkte alıcı öneriden farklıysa `degisiklik_gerekcesi` zorunlu.
5. Teslim alınmış sevk değiştirilemez; fark yeni kayıtla düzeltilir.
6. Firma kullanıcısı yalnız kendi firmasının operasyonlarını kabul/ret eder, kendi gönderdiği sevkleri yazar, kendisine gelen sevki teslim alır.

Uyarı (ekranda): öneriden farklı alıcı (merkezde işaretli), fark/fire, termine göre geciken operasyon.

## 6. Yetki

- Oturumda `app.current_ortak_id` (yeni, `current_ortak_id()`), mevcut `app.current_workshop_id` ve tenant ayarlarıyla birlikte yazılır (`lib/supabase/tenant-db.ts`, `TenantContext.ortakId`).
- **Atölye** kullanıcısı: bugünkü gibi `current_workshop_id = workshop.id`; `current_ortak_id` = o atölyenin `is_ortagi.id`.
- **Diğer firma** kullanıcısı: `current_workshop_id = 0` (0 numaralı atölye yok → atölyeye bağlı mevcut tüm tablolar varsayılan **kapalı**), `current_ortak_id = firma`.
- Merkez: ikisi de NULL (bugünkü davranış).
- Yeni politikalar: `work_order_stage`, `sevk`, `sevk_kalem`, `operasyon_onay`, `uretim_formu` (operasyona bağlı satırlar) için "`current_ortak_id()` bu operasyonun firması ya da sevkin gönderen/alıcısı" koşulu mevcut koşula **OR** ile eklenir. `work_order` için firma, operasyonu olduğu iş emirlerini okur (yalnız okuma politikası); API firmaya kolon seçerek döner (fiyat, diğer firmalar görünmez).
- `giren_taraf` CHECK'i `'ortak'` değeriyle genişler; `kayit_giren_yaz()` `current_ortak_id()` dolu ve `current_workshop_id() = 0` ise `'ortak'` yazar; `TARAF_ETIKET` "Firma kaydı".
- Panel: `/ortak` (yeni) `requireOrtak()`; firma kullanıcısı `/pes` ve `/workshop`'a giremez. Merkez `/ortak/gir` ile "firma adına" girer.
- Her sürümde zorunlu SQL testi: firma oturumunda atölye tablolarından 0 satır; başka firmanın operasyonu/sevki görünmez; firma başkasının operasyonunu kabul edemez.

## 7. Ekranlar

Merkez (`/pes`):
- **Ana veri → İş ortakları** (`/pes/is-ortaklari`): liste (tip filtresi), kayıt formu, kullanıcı bağlama. Atölyeler otomatik listelenir (§9), ayrıntısı mevcut atölye ekranına bağlanır.
- **Ana veri → Rota şablonları** (`/pes/rotalar`): şablon listesi; şablon detayında operasyon satırları (sıra, operasyon tipi, firma tipi, varsayılan firma, zorunlu formlar çoklu seçim, ölçü aşaması).
- **Sipariş → PO'lar** (`/pes/po`): PO listesi; PO detayında kalemler (beden dağılımı ızgarası, Excel'den yapıştırma — 061'deki yapıştırma deseni); kalemde "İş emri aç": rota seç → operasyon/firma önizleme → oluştur (havuza düşer).
- Mevcut **Siparişler** (iş emri havuzu) ve **Sipariş Yerleştir** aynen; liste kolonlarına PO no bağlantısı eklenir.
- **İş emri zinciri**: iş emri detayında (merkez) operasyon kutuları soldan sağa — firma, ortak_durum, giren/çıkan/elde/yolda, eksik form; ret ve öneriden farklı alıcı kırmızı/turuncu; operasyona firma atama/değiştirme.

Firma (`/workshop` atölye için, `/ortak` diğerleri için; içerik tek bileşen `components/pes/ortak/*`):
- **Bekleyen atamalar**: Kabul / Ret (gerekçe kodu + not).
- **Gelen sevkler**: kalem kalem sayılan adet, fark, foto → "Teslim aldım".
- **Operasyonlarım** → operasyon detayı: rota formları (eksikler işaretli; form açma mevcut `UretimFormlari` bileşeniyle, operasyona bağlı), atölye kumaş kabul operasyonunda sürüm 1 adımları (top, çekme), ölçü aşaması varsa ölçüm (2d), **Sevk et** (renk × beden adet, lot, alıcı öneriyle dolu + değişirse gerekçe, irsaliye, foto), **Tamamla**.
- Atölyenin iş emri sayfasındaki "Süreç" sekmesi bu zincirin atölye görünümüne dönüşür.

## 8. Plan tezgahıyla ilişki

Plan teklifi (043/044) atölye kapasitesini ve tarihi yönetir; aynı kalır. Atölye teklifi **kabul** edince o iş emrindeki `ortak_tipi='Atölye'` operasyonların `ortak_durum`'u `Kabul` olur ve `operasyon_onay`'a kayıt düşer (aynı kararın iki kez sorulmaması). Teklif ret/revizyon → operasyon `Ret` değil, `Atandı` kalır (plan pazarlığı sürüyor).

## 9. Geçiş

- 131 aktif atölye için `is_ortagi` (tip Atölye, unvan = workshop.name, workshop_id) migration'da otomatik.
- `work_order.kumasci` serbest metinlerinin farklı değerleri merkeze "Kumaşçı önerisi" listesi olarak gösterilir; onaylanınca `is_ortagi` açılır ve iş emirlerinde `kumasci_ortak_id` dolar. Otomatik açılmaz (yazım farkları).
- Mevcut iş emirleri: `rota_sablonu_id` NULL; aşamalarına (`work_order_stage`) atölyeleri varsa KESIM/DIKIM için `is_ortagi_id` = atölyenin ortağı, `ortak_durum` = 'Kabul'; diğerleri 'Atanmadı'. PO bağı boş kalır.
- Başlangıç rota şablonu (migration tohum): "Denim yıkamalı": Kumaş kabul (Atölye) → Kesim (Atölye) → Dikim (Atölye, ölçü YIKAMA_ONCESI) → Yıkama (Yıkamacı, ölçü FINAL — yıkama sonrası) → UKP (UKP, ölçü FINAL). Merkez düzenler.

## 10. Sürümler

| Sürüm | Kapsam | Yayın sonrası kullanılabilir olan |
|---|---|---|
| 2a | `is_ortagi`, rota şablonları, `siparis`/`siparis_kalem`, iş emri açma (rota kopyası), atölye geçişi, merkez ekranları | Merkez PO girer, iş emri açar, rota/firma önerisi yapar |
| 2b | `current_ortak_id`, `/ortak` paneli, firma kullanıcıları, `operasyon_onay`, kabul/ret, plan teklifi bağı, RLS testleri | Firmalar hesapla girip atamalarını kabul eder |
| 2c | `sevk`/`sevk_kalem`, teslim alma, `v_operasyon_adet`, `v_is_emri_zincir`, zincir ekranı, operasyon tamamlama + zorunlu form kuralı, `uretim_formu.operasyon_id` | Uçtan uca: atölye → yıkama → UKP parçalı sevk |
| 2d | Atölye operasyon formları: pastal, demet, ölçüm (`olcum`, `v_olcum_sonuc`), ölçü formlarının bu kayıtları göstermesi | Yıkama öncesi/sonrası ölçü eşleştirme |

Her sürüm: migration (kuru çalıştırma + kontrol SQL'i, yetki testi dahil) → kullanıcı onayıyla üretime → `tsc` + `npm test` → sürüm ve wiki → yayın.

## 11. Kapsam dışı

Fiyat/fatura ve firma hakedişi; bir operasyonu iki firmaya bölme; firmanın birden fazla kiracıya (üreticiye) hizmeti; stok/depo (MM envanteri — sevk hareketi stok defteri değildir); SAP'ten veri aktarımı (ana veri tabloları Excel yapıştırma ile dolar); renk standardı (C1–C3) ve G0–G4 kapıları.

## 12. Açık konular

- Kumaş kabul operasyonunu kumaşçı mı (gönderen) atölye mi (alan) yürütür? Varsayım: kumaşçı **sevk eden** (kaynak operasyonu olmayan sevk), kumaş kabul operasyonu atölyenindir.
- Kesimhane ayrı firmaysa kumaş kabul ve çekme testi kesimhanede olur; rota şablonu bunu `ortak_tipi` ile ifade eder — sürüm 1 ekranlarının atölyeye bağlı olması (workshop_id) 2b'de operasyon firmasına genelleştirilecek.
- Step 0 (şartname) kumaş kategorisini dikkate almıyor (063 yorumu); `siparis_kalem.kumas_kategorisi` ile 2a'da çözülür.
