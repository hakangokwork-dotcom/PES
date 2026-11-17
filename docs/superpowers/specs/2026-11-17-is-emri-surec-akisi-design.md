# İş Emri Süreç Akışı — Kumaştan Bitmiş Ürüne

> Tasarım · 2026-11-17 · Durum: kullanıcı incelemesinde
> Kaynak: denim kalite/izlenebilirlik süreç metni (ölçü şartnamesi, top bazlı kumaş kabulü, çekme testi, pastal, demet, yıkama, ölçü kontrolü).

## 1. Amaç

Atölyeye bir PO / iş emri geldiğinde; kumaş kabulünden ürün bitene kadar her kaydın **tek bir akışta**, iş emri sayfasında girilmesi:

kumaş topları (lot, parti, metre) → çekme sonuçları ve gruplama → pastal ve kesim → kesim/dikim kontrol formları ve yıkama öncesi ölçü → yıkamaya lotlu sevk (kayıt + görsel) → yıkama operasyonu detayı → yıkama dönüşü ve yıkama sonrası ölçü → ütü / final ölçü / paket.

Belirleyici kural (kaynak metin): **onaylı kumaş grubu olmayan kumaş kesime girmez; final kontrol kontrollü bir prosesi doğrular, kurtarmaya çalışmaz.**

## 2. Kim, nerede

| Taraf | Ne yapar | Yer |
|---|---|---|
| Atölye | Kumaş, çekme, pastal/demet, kontrol, yıkama öncesi ölçü, yıkamaya sevk, dönüş kabulü, ütü/final | `/workshop/is-emri/[id]` → "Süreç" sekmesi |
| Yıkamacı | Kendisine gelen sevkin kabulü, yıkama yükleri ve kurutma, yıkama sonrası ölçü, dönüş sevki | `/yikamaci` (ayrı panel, kendi hesabı) |
| Merkez | Ölçü şartnamesi ve müşteri onayı; yıkamacıları ve kullanıcılarını tanımlar; akışı izler; gerekirse "atölye adına" girer | `/pes/olcu-sartname`, `/pes/yikamacilar`, iş emri görünümü |

### 2.1 Yıkamacı kimliği ve güvenlik

Yıkamacı `workshop` satırı **değildir** (o tabloyu okuyan 88 dosya var; yıkamacılar atölye listelerine, kıyas ve ortalamalara karışırdı). Ayrı varlık:

```
yikamaci           id, tenant_id, ad, adres, telefon, aktif
yikamaci_kullanici user_id PK, yikamaci_id, tenant_id
current_yikamaci_id()  -- app.current_yikamaci_id ayarından, NULL = yıkamacı değil
```

- 033 kuralında `current_workshop_id()` NULL = merkez = kısıt yok. Yıkamacı oturumunda bu yüzden `app.current_workshop_id = '0'` yazılır (0 numaralı atölye yok): atölyeye bağlı mevcut tüm tablolar yıkamacıya **kendiliğinden kapalıdır**. Yıkamacıya yalnız yıkama tablolarında açık politika tanınır (`yikamaci_id = current_yikamaci_id()`).
- `lib/supabase/tenant-db.ts` her transaction'da iki ayarı da yazar; `TenantContext`e `yikamaciId` eklenir; `/yikamaci` paneli `requireYikamaci()` ile korunur, yıkamacı kullanıcısı `/pes` ve `/workshop`a giremez.
- `kayit_giren_yaz()`: `current_yikamaci_id()` doluysa `giren_taraf = 'yikamaci'` (CHECK kısıtları ve `TARAF_ETIKET` "Yıkamacı kaydı" ile genişler).
- Yıkamacının görebildiği: kendine gelen sevkler, o sevklerin iş emri no / model adı, demetleri (beden, grup, adet), ilgili ölçü şartnamesi ve o iş emrinin yıkama öncesi ölçümleri. Fiyat, diğer atölye/yıkamacı verisi görünmez. Bu, yıkamacı API uçlarında ayrıca seçilen kolonlarla sınırlanır.
- Kapsam dışı: bir yıkamacının birden fazla kiracıya hizmeti; yıkamacının fiyat/fatura girmesi.

- Ortak kayıt kuralı geçerli: akış kayıtlarını iki taraf da düzeltebilir; `giren_taraf / giren_eposta / girildi_at` 054/055 tetikleyicisiyle (`kayit_giren_yaz()`) yazılır, ekran `surumBasligi()` gönderir, araya giren değişiklik PT409 → 409.
- Ölçü şartnamesine yalnız merkez yazar (`requirePanel('yonetim')`); atölye okur.
- Atölye kimliği oturumdan (`TenantContext.workshopId`), `?wid=` kullanılmaz.

## 3. Akış adımları

İş emri detayında ilk sekme **"Süreç"**: dikey adım listesi, her adım açılınca kendi formu. Adım durumu (Bekliyor / Devam / Tamam / Sorunlu) elle işaretlenmez; `v_is_emri_surec` görünümünde veriden türetilir. Mevcut "Aşamalar" sekmesi plan tarihleri için kalır; akış ona yazmaz (ikinci durum kaynağı açılmaz).

| # | Adım | Girilenler | Tamam sayılma koşulu (görünüm) |
|---|---|---|---|
| 0 | PO / şartname | Mevcut iş emri; `model_bulten_id` ve kumaş kategorisi üzerinden ölçü şartnamesi | FINAL ve YIKAMA_ONCESI şartnamesi bulunuyor |
| 1 | Kumaş kabul | Top kayıtları | En az bir top var ve karantinada top kalmadı |
| 2 | Çekme testi / gruplama | Top bazlı test, ton ve çekme grubu | Her serbest topun grubu atanmış |
| 3 | Pastal / kesim | Pastal, kullanılan toplar, beden oranları → demetler | Kesilen adet ≥ sipariş miktarı ya da pastal "kapandı" |
| 4 | Kesim / dikim kontrol | Kontrol formları + yıkama öncesi ölçü | Her demet için en az bir yıkama öncesi ölçüm var |
| 5 | Yıkamaya sevk (atölye) | Yıkamacı seçimi, irsaliye, demetler, foto | Tüm demetler bir sevkte |
| 6 | Yıkama (yıkamacı) | Sevk kabulü (sayım, fark, foto); yük bazında reçete + gerçekleşen değerler + kurutma; yıkama sonrası ölçü; dönüş sevki | Her sevk "Döndü" ve en az bir yükü var |
| 7 | Dönüş kabulü (atölye) | Sayılan adet, fark, not | Tüm sevkler "Kabul edildi" |
| 8 | Ütü / final / paket | Ütü sonrası ve final ölçü, UKP | Final ölçümü ve UKP kaydı var; iş emri "Tamamlandi" yapılabilir |

"Sorunlu": ilgili adımda kalan ölçüm, RED top, RİSKLİ test ya da düzeltme yıkaması varsa.

## 4. Veri modeli

Migration'lar **061**'den başlar (059 `uretim_formu`, 060 `uretim_formu_dosya` paralel "Üretim formları" işinde — v1.18.0 — alındı ve üretime uygulandı).

**Üretim formlarıyla uzlaşma (2026-11-17):**
- Kontrol formları için ayrı tablo açılmaz; akış ilgili adımda o PO'nun `uretim_formu` kayıtlarını (hat içi kalite, hata formları, düğme çekme, metal…) listeler ve forma bağlantı verir.
- Ölçüde **süreç ölçümü esastır** (`olcum`/`olcum_degeri`, §4.6). `ara_olcu_*` ve `final_olcu_*` formlarının ölçüm tablosu, sürüm 2'de bu kayıtları gösterecek şekilde değiştirilir; formların diğer alanları (AQL sonucu, ad soyad vb.) kalır. Aynı ölçü iki yere girilmez.
- Fotoğraflar 060'ın kapalı `uretim-formlari` kovasını ve yükleme desenini (istemcide küçültme, 4 MB sınırı, 1 saatlik imzalı bağlantı, yalnız service role) kullanır; forma bağlı olmayan kayıtlar için ince `surec_gorsel` tablosu (§4.8).

 Tüm yeni tablolarda `tenant_id`, `workshop_id` (iş emrinden), RLS (019b deseni) ve 054/055 kolonları + `kayit_giren_yaz()` tetikleyicisi.

### 4.1 Ölçü şartnamesi (merkez)

```
olcu_sartname
  id, tenant_id, model_bulten_id → model_bulten
  kumas_kategorisi TEXT            -- 'Rijit' | 'Esnek' (serbest metin değil, CHECK)
  asama TEXT                       -- 'FINAL' | 'YIKAMA_ONCESI'
  revizyon INT, durum TEXT         -- 'Önerilen' | 'Müşteri onaylı' | 'Geçersiz'
  onaylayan TEXT, onay_tarihi DATE, notlar TEXT
  UNIQUE (model_bulten_id, kumas_kategorisi, asama, revizyon)
  kısmi UNIQUE: aynı model × kategori × aşama için tek 'Müşteri onaylı'

olcu_noktasi
  id, sartname_id, kod, ad, musteri_adi, yontem TEXT, kritik BOOL, sira

olcu_degeri
  nokta_id, beden TEXT, nominal NUMERIC(6,2), tol_eksi NUMERIC(5,2), tol_arti NUMERIC(5,2)
  PK (nokta_id, beden); CHECK tol_eksi >= 0 AND tol_arti >= 0
```

- Kabul aralığı **saklanmaz**; `nominal − tol_eksi … nominal + tol_arti` görünümde hesaplanır. Hedef nominaldir; aralık ortası hedef olmaz.
- "Müşteri onaylı" şartname değiştirilemez (tetikleyici); değişiklik = yeni revizyon (kopya). Onaylanınca aynı anahtardaki eski onaylı revizyon "Geçersiz" olur.
- Rijit ve esnek toleransları eşit olsa da ayrı şartnamedir.

### 4.2 Kumaş topu (adım 1)

```
kumas_top
  id, work_order_id, tedarikci, artikel, kompozisyon,
  tedarikci_lotu, parti_no, top_no, metre NUMERIC(8,2), kullanilabilir_en_cm NUMERIC(6,1),
  irsaliye_no, gelis_tarihi DATE,
  durum TEXT                       -- 'Karantina' (varsayılan) | 'Serbest' | 'Red'
  ton_grubu TEXT, cekme_grubu TEXT -- adım 2'de atanır; tedarikçi lotundan ayrı alan
  notlar
  UNIQUE (work_order_id, tedarikci_lotu, top_no)
```

### 4.3 Çekme testi (adım 2) — mevcut tablo genişler

`kumas_cekme_testi`ne (036) eklenir: `top_id → kumas_top` (NULL olabilir; eski iş emri bazlı kayıtlar bozulmaz), `yikama_receti` TEXT, `hedef_renk` TEXT, `ton_degerlendirme` TEXT. Mevcut kolonlar aynen kalır; ekranda `boy_cekme_pct` "Çözgü (boy)", `en_cekme_pct` "Atkı (en)", `may_kaymasi_pct` "Dönme" olarak adlandırılır — yeni kolon açılmaz.

Kural: bir top RED testle "Serbest" yapılamaz; grup ataması atölyenin kararıdır (otomatik bant yok — kaynak metin evrensel ±%0,5 bandını reddediyor). Ekran, grup içi çekme ortalaması ve aralığını gösterir.

### 4.4 Pastal ve demet (adım 3)

```
kesim_pastal
  id, work_order_id, pastal_no, kalip_revizyonu, pastal_boyu_m, kat_sayisi,
  beden_oranlari JSONB             -- {"30":1,"32":2,...}
  kesilen_adet INT, fire_m NUMERIC, tarih, kapandi BOOL

kesim_pastal_top                   -- pastala serilen toplar
  pastal_id, top_id, kullanilan_metre
  -- tetikleyici: top 'Serbest' değilse ekleme reddedilir

kesim_demet
  id, pastal_id, demet_no, beden, adet, top_id, ton_grubu, cekme_grubu
  UNIQUE (pastal_id, demet_no)
```

Demetler pastal kaydedilirken beden oranı × kat sayısından önerilir, atölye düzeltebilir. Demet kimliği = model (iş emri) + beden + top/grup + kalıp revizyonu + demet no.

### 4.5 Kontrol formları (adım 4, 8)

Yeni tablo yok: mevcut `uretim_formu` (059) kullanılır. Adım 4 o PO'nun `inline_kalite`, `hata_*`, `dugme_cekme`, `cakim_proses`, `metal_kontrol` formlarını; adım 8 `final_olcu_*` ve AQL formlarını listeler. "Sorunlu" durumu bu formlardan türetilmez (JSONB içeriği form başına farklı); yalnız form sayısı gösterilir.

### 4.6 Ölçüm (adım 4, 7, 8)

```
olcum
  id, work_order_id, sartname_id (ölçüldüğü andaki revizyon), demet_id NULL,
  beden, urun_no INT, olcum_asamasi TEXT
    -- 'Yıkama öncesi' | 'Yıkama sonrası' | 'Ütü sonrası' | 'Final'
  olcen TEXT, tarih
  UNIQUE (work_order_id, urun_no, olcum_asamasi)

olcum_degeri
  olcum_id, nokta_id, deger NUMERIC(6,2)
  PK (olcum_id, nokta_id)
```

- 'Yıkama sonrası' ölçümünü yıkamacı girer (`olcum.yikamaci_id` dolu; politika sevk üzerinden: yıkamacı yalnız kendisine sevk edilmiş iş emrinin ölçümlerini okur, yalnız 'Yıkama sonrası' yazar). Diğer aşamaları atölye girer.
- 'Yıkama öncesi' → `YIKAMA_ONCESI` şartnamesi; diğerleri → `FINAL`. Uygun şartname yoksa API 422 döner.
- `v_olcum_sonuc`: POM bazlı sapma (`deger − nominal`), alt/üst sınır, geçti/kaldı; ürün yalnız **her** ölçülen POM geçerse geçer; şartname 'Müşteri onaylı' değilse `onaysiz_sartname = true`.
- Eşleştirme: aynı `work_order_id + urun_no` farklı aşamalarda = aynı ürün; görünüm önceki aşamaya göre değişimi verir.

### 4.7 Yıkama sevki, yükü, dönüşü (adım 5–7)

```
yikama_sevk
  id, tenant_id, work_order_id, workshop_id (gönderen atölye), yikamaci_id → yikamaci
  durum TEXT  -- 'Gönderildi' | 'Yıkamacıda' | 'Döndü' | 'Kabul edildi'
  -- atölye yazar:
  irsaliye_no, sevk_tarihi, giden_adet, notlar
  -- yıkamacı yazar:
  kabul_tarihi, kabul_adet, kabul_notu,
  donus_irsaliye_no, donus_tarihi, donen_adet, hatali_adet, renk_degerlendirme
  -- atölye yazar:
  donus_kabul_adet, donus_kabul_notu

yikama_sevk_demet
  sevk_id, demet_id   -- bir demet tek sevkte (UNIQUE demet_id)
```

- Politika: `workshop_id = current_workshop_id() OR yikamaci_id = current_yikamaci_id() OR (ikisi de NULL → merkez)`.
- Alan sahipliği tetikleyiciyle: yıkamacı yalnız kabul/dönüş alanlarını, atölye yalnız sevk ve dönüş kabul alanlarını değiştirebilir; durum geçişleri sırayla (Gönderildi → Yıkamacıda → Döndü → Kabul edildi). Merkez hepsini değiştirebilir.
- Yıkamacı sevki "Döndü" yapmadan önce en az bir yük kaydı gerekir.

`yikama_record` (013) yük kaydı olarak genişler; yeni yük kayıtlarını yıkamacı yazar, görünürlük sevk üzerinden (`sevk_id`'nin sevki görünüyorsa yük de görünür). Eklenenler: `sevk_id → yikama_sevk`, `yikamaci_id`, `makine`, `recete_revizyonu`, `hedef_renk`, `kuru_agirlik_kg`, `duzeltme_yikamasi BOOL`, `adimlar JSONB` (`[{adim, su_lt|flotte, kimyasal, doz, sicaklik_c, sure_dk, ph}]` — gerçekleşen değerler), `kurutucu`, `kurutma_programi`, `kurutma_sure_dk`, `sogutma_dk`. Mevcut adet/enerji/su kolonları kalır.

### 4.8 Görseller

```
surec_gorsel
  id, work_order_id, adim TEXT, kayit_tablosu TEXT, kayit_id INT, yol TEXT, aciklama, created_at
```

060'ın kapalı `uretim-formlari` kovası; yol `surec/{tenant_id}/{work_order_id}/{adim}/{uuid}.jpg`. Yükleme ve okuma yalnız API üzerinden (service role, 1 saatlik imzalı URL); yetki `surec_gorsel` RLS'inden. 060'daki yükleme/küçültme kodu ortak yardımcıya taşınır, kopyalanmaz. Telefonda `<input type="file" accept="image/*" capture="environment">`.

### 4.9 Görünümler

- `v_olcum_sonuc` — §4.6.
- `v_is_emri_surec` — iş emri başına adım 0–8 durumu ve sayaçlar (top sayısı, karantinada top, kesilen adet, sevkte/dönen adet, kalan ölçüm sayısı).

## 5. Kapılar (ilk sürüm)

Sert (veritabanında):
1. 'Serbest' olmayan top pastala eklenemez.
2. RED testi olan top 'Serbest' yapılamaz.
3. Şartnamesi olmayan iş emrine ölçüm girilemez (API 422).
4. 'Müşteri onaylı' şartname düzenlenemez.
5. Yıkamacı yalnız kendine gelen sevkleri ve onlara bağlı yük/ölçümleri görür ve yazar; atölye tablolarının hiçbirini göremez (§2.1).
6. Sevk durum geçişleri sıralıdır; taraf yalnız kendi alanlarını değiştirir.

Uyarı (ekranda, engellemez):
- Onaysız şartnameyle final ölçüm.
- Yıkama öncesi kalan ürünü olan demet yıkamaya sevk ediliyor ("yıkama düzeltmez; sorumlu operasyonu düzeltin").
- Bir yıkama yükünde farklı çekme/ton grupları.
- Düzeltme yıkaması kaydı.

Kapsam dışı (sonraki aşama): C1–C3 renk standartları ve sınır numuneleri, kumaş–renk–kalıp–yıkama onay matrisi, G0–G4 onay kapıları, kalıp telafisi hesabı (hedef ÷ (1−r)), ölçüm sistemi çalışması (10×3×2), POM/beden bazlı SPC panosu, tüketici yıkaması sonrası kalan çekme, koli/asorti takibi.

## 6. API

Hepsi `withTenantRoute`, `app/api/pes/` altında:

- `olcu-sartname` (GET liste, POST yeni), `olcu-sartname/[id]` (GET, PATCH, `onayla`, `revizyon`), `olcu-sartname/[id]/yapistir` (Excel'den yapıştırılan metni bir bedene işler).
- `work-orders/[id]/surec` (GET: `v_is_emri_surec` + adım özetleri).
- `work-orders/[id]/toplar`, `.../cekme-testi` (mevcut; top alanları eklenir), `.../pastal`, `.../demetler`, `.../olcum`, `.../yikama-sevk`, `.../yikama-yuk`, `.../gorsel`.

Yazma uçları `surumBasligi()` başlığını kabul eder; PT409 → 409, 422 → doğrulama mesajı Türkçe.

## 7. Ekranlar

- `/workshop/is-emri/[id]` → "Süreç" sekmesi (ilk sekme). Her adım ayrı bileşen dosyası (`components/pes/surec/Adim*.tsx`); sayfa dosyası (şu an 1224 satır) büyütülmez.
- Ölçüm girişi: beden + ürün no seç → POM'lar alt alta tek sayı kutusu, girildikçe yeşil/kırmızı ve sapma; Enter ile sonraki POM; "Kaydet ve sonraki ürün" ürün no'yu artırır; aynı ürünün önceki aşama değeri gri gösterilir. Anlık renk istemcide aynı formülle; kayıtlı sonuç yalnız `v_olcum_sonuc`tan.
- `/pes/olcu-sartname`: liste; POM × beden ızgarası (nominal, −tol, +tol; kabul aralığı hesaplanıp gösterilir); yapıştır; "Müşteri onaylı yap"; "Yeni revizyon".
- Merkezde iş emri akışı salt okunur görünüm + "atölye adına gir".
- `/yikamaci`: kendi kısa menüsü (Gelen sevkler, Geçmiş). Sevk detayı: Kabul → Yükler (yük ekle: reçete adımları satır satır, kurutma) → Yıkama sonrası ölçü (atölye ölçüm ekranıyla aynı bileşen; yıkama öncesi değer gri) → Dönüş sevki (irsaliye, adet, hatalı, renk notu, foto). Tablet/telefon öncelikli.
- `/pes/yikamacilar`: yıkamacı listesi, kullanıcı bağlama (atölye kullanıcısı bağlama deseniyle).
- `WorkshopSidebar`a ayrı menü gerekmez (akış iş emri içinde); merkez `/pes` menüsüne "Ölçü Şartnamesi" eklenir.
- `components/ui` ve tema token'ları; ham Tailwind renkleri yok; ekran metinleri Türkçe.

## 8. Hata durumları

| Durum | Davranış |
|---|---|
| Araya giren değişiklik | 409, "Bu kayıt siz açtıktan sonra değiştirildi…" — sayfa yenilenir |
| Şartname yok | Ölçüm ekranı kilitli, "şartname yok, merkeze bildirin" |
| Karantinadaki top pastala | Seçim listesinde gösterilmez; API yine de reddeder |
| Görsel yükleme hatası | Kayıt korunur, görsel ayrıca yeniden denenir; kayıt görsele bağlı değildir |
| Aynı ürün no + aşama tekrar | Var olan ölçüm açılır (yeniden ölçüm = düzeltme, ilk değer `giren`/sürüm izinde) |
| Supabase uykuda (ilk istek) | Mevcut genel hata/yeniden dene davranışı |

İlk sonuçlar silinmez: düzeltme yıkaması ve yeniden ölçüm ayrı kayıt/sürüm olarak tutulur (kaynak metin: "düzeltilmiş sonuçların yanında ilk sonuçları da sakla").

## 9. Test

- vitest: yapıştır ayrıştırıcısı (gönderilen 32 beden tablosu → 10 POM, virgüllü ondalık, "−1,50 / +1,00"); demet önerisi (beden oranı × kat); istemci geçti/kaldı formülü sınır değerlerde (41,50 ve 44,00 geçer; 41,49 kalır).
- SQL (migration kuru çalıştırma, `BEGIN … ROLLBACK`): `v_olcum_sonuc` sınır değerleri; karantina topu pastala eklenemez; onaylı şartname güncellenemez; tek onaylı revizyon kısıtı; PT409.
- SQL güvenlik: yıkamacı oturumu (`current_workshop_id = 0`, `current_yikamaci_id = X`) ile atölye tablolarından 0 satır; başka yıkamacının sevki görünmez; yıkamacı atölye alanını (irsaliye_no) değiştiremez; sıra dışı durum geçişi reddedilir.
- `npx tsc --noEmit` ve `npm test` yeşil.
- Tarayıcıda uçtan uca: bir iş emrinde 2 top → test → pastal → demet → yıkama öncesi ölçüm → sevk → yük → dönüş → final ölçüm; telefon genişliğinde ölçüm girişi.

## 10. Uygulama sırası

Tek spesifikasyon, üç sürüm:

1. **Adım 0–2**: ölçü şartnamesi (merkez ekranı + 32 beden tablosu "Önerilen" olarak), `kumas_top`, çekme testi genişletme, `surec_gorsel` (060 kovası), "Süreç" sekmesi iskeleti ve `v_is_emri_surec`.
2. **Adım 3–5**: pastal, demet, PO formlarının akışta listelenmesi, ölçüm + `v_olcum_sonuc` ve `ara_olcu_*`/`final_olcu_*` formlarının bu ölçümleri göstermesi, yıkamaya sevk.
3. **Adım 6–8**: yıkamacı varlığı ve hesabı (§2.1), `/yikamaci` paneli, yıkama yükü genişletme, dönüş ve dönüş kabulü, ütü/final ölçüm, tamamlama. Bu sürümde güvenlik testi zorunlu: yıkamacı oturumuyla atölye tablolarından satır gelmediği SQL ile doğrulanır.

Sürüm 2'de sevk yıkamacı seçimiyle oluşur ama yıkamacı hesabı henüz yoksa sevk "Gönderildi"de bekler; merkez yıkamacı adına girebilir.

Her sürüm: migration + `lib/version.ts` ve `package.json` birlikte + wiki (`_wiki_PES`) güncellemesi.

## 11. Açık konular

- Yıkamacı kullanıcısının kiracı üyeliği ve giriş yolu (`lib/auth/tenant-context.ts`) plan aşamasında doğrulanacak; atölye kullanıcısıyla aynı yoldan girdiği varsayıldı.
- 32 beden tablosunun kumaş kategorisi (Rijit / Esnek) ve modeli ilk girişte belirtilecek.
- Ölçüm çiziminin (Baldır, arka ağ uç noktaları) düzeltilmesi süreç dışı bir iştir; `olcu_noktasi.yontem` metni ve bir görsel (`surec_gorsel` ile) buna yer açar.
