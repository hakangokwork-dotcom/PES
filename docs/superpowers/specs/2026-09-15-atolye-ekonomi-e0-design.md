# Atölye Ekonomi — E0: Veri Omurgası

Tarih: 2026-09-15
Durum: tasarım onaylandı, uygulama planı bekliyor
Kaynak: `C:\Users\bhaka\Desktop\WORK\Facilty_Expence\Atolye_Gider_Model.xlsx`

---

## 1. Amaç

`Atolye_Gider_Model.xlsx` bir atölyenin aylık ekonomisini hesaplayan çalışan bir
modeldir: 16 parametre, 47 kolonluk veri girişi, 37 türetilmiş rasyo, 54 satırlık
formül sözlüğü ve 11 atölyelik pilot veri. Bugün tek bir dosyada yaşıyor —
paylaşılamıyor, geçmişi tutmuyor, PES'in üretim ve gider verisinden habersiz.

E0 bu modelin **veri ve hesap katmanını** PES'e taşır. Bittiğinde elimizde
canlı bir rasyo tablosu, dönem versiyonlu bir parametre seti ve Excel'e karşı
doğrulanmış 11 pilot atölye olur.

E0 bir bütünün ilk parçasıdır. Tamamı:

| | Parça | Bağımlılık |
|---|---|---|
| **E0** | Ekonomi veri omurgası (bu doküman) | — |
| E1 | Karşılaştırma panosu (radar, karne, maliyet DNA) | E0 |
| E2 | Formül ve parametre kütüphanesi ekranı | E0 |
| E3 | MTM kütüphanesi ve model fiyatlama | E0 |
| E4 | Veri toplama ve atölyeyle paylaşım | E0 |
| E5 | Sipariş ve teşvik simülatörü | E0 + E3 |

---

## 2. Alınan kararlar

| Karar | Seçim | Gerekçe |
|---|---|---|
| Zaman birimi | **Aylık satır, ham anket saklanır** | Zaman serisi olmadan MTM↔çıktı ilişkisi ve değişim süresi etkisi (E5) ölçülemez. Ham anket saklanır ki türetme izi kaybolmasın. |
| Ciro kaynağı | **Atölye beyanı** | PES'te gerçekleşen ciro yok, yalnız `monthly_expense.target_revenue` (hedef). Başka kaynak mevcut değil. |
| Adet kaynağı | **Beyan + PES üretimi yan yana** | İkisi arasındaki fark bir hata değil, sinyaldir: büyük sapma ya beyanın ya iş emri kaydının zayıf olduğunu söyler. |
| Klasman kârlılığı | **E0'da etiket, kârlılık E3'te** | Atölye seviyesinde tek ciro ve tek gider var; iki klasman diken atölyede marjın hangi klasmandan geldiği bilinmiyor. Gerçek cevap model katmanından gelir. |
| Yetki | **İç ekip girer, atölye görmez** | En basit yetki modeli; PES'in mevcut rol yapısı karşılıyor. Atölyeye görünürlük E4'ün konusu. |
| Mimari | **Gider PES'te kalır, ekonomi üstüne biner** | `monthly_expense` tek gider kaynağı olarak korunur; G1–G8 ve mevcut gider panosu bozulmaz. |
| Hesap yeri | **TypeScript saf fonksiyonlar** | Her formül ayrı test edilir; parametre değiştirip yeniden hesaplamak mümkün olur; E2 aynı fonksiyonların tanımını okur. Veri hacmi (130 atölye × 12 ay) bunu kaldırır. |

---

## 3. Veri modeli

### 3.1 `monthly_expense` — iki kolon eklenir

Excel'in 26 gider satırının (VERI_GIRIS T:AS) 24'ü `monthly_expense`'te (005 + 021) zaten var.
Karşılığı olmayan ikisi:

| Excel satırı | Yeni kolon | Tip | Neden ayrı |
|---|---|---|---|
| UKP sarf | `ukp_consumables` | `NUMERIC(14,2)` | Bugün *genel üretim sarf* ile birlikte `consumables`'a düşüyor. İkisi ayrılmadan UKP bölümünün dakika maliyeti doğru hesaplanamaz. |
| Taşıt / demirbaş amortismanı | `vehicle_depr` | `NUMERIC(14,2)` | Hiç karşılığı yok. `vehicle` yakıt+bakım yani nakit gider; bu amortisman, nakit çıkışı değil. |

Ayrıca `lib/pes/expense-mapping.ts` iki yeni kolonu ve Excel başlıklarını tanıyacak
şekilde genişletilir. Excel'deki **"İğne ve iplik"** birleşik başlığı mevcut
davranışı korur: tamamı `thread`'e yazılır, `needle` boş kalır ve bu durum
import raporunda "birleşik alan" olarak listelenir.

### 3.2 `workshop_economy` — yeni tablo

Bir satır = bir atölyenin bir ayı. `monthly_expense` ile aynı anahtar
(`workshop_id`, `year`, `month`), `UNIQUE` kısıt aynı üçlüde.

| Kolon | Tip | Açıklama |
|---|---|---|
| `workshop_id`, `year`, `month` | | anahtar |
| `tenant_id` | `UUID` | 019a kiracılık deseni, RLS için zorunlu |
| `revenue_declared` | `NUMERIC(16,2)` | Aylık ciro, boş gün düzeltmesi **öncesi** (fatura toplamı ÷ ay sayısı) |
| `idle_days` | `NUMERIC(5,2)` | Boş / dışarı çalışılan gün — ciro düzeltmesinin girdisi |
| `qty_declared` | `INTEGER` | Beyan edilen aylık adet (bant kapasitesi tahmini) |
| `nominal_days` | `NUMERIC(5,2)` | Aylık nominal çalışma günü (tipik 22) |
| `actual_days` | `NUMERIC(5,2)` | Fiili çalışma günü |
| `hours_per_day` | `NUMERIC(4,1)` | Günlük çalışma saati |
| `cutting_staff` | `SMALLINT` | O AYA ait kesim kişi |
| `sewing_staff` | `SMALLINT` | O AYA ait dikim kişi |
| `ukp_staff` | `SMALLINT` | O AYA ait ütü-kontrol-paket kişi |
| `office_staff` | `SMALLINT` | O AYA ait ofis kişi |
| `area_m2` | `INTEGER` | Üretim alanı |
| `source` | `TEXT` | `anket` \| `elle` \| `turetilmis` |
| `survey_id` | `INTEGER` | → `economy_survey_staging.id`, `turetilmis` ise dolu |
| `note` | `TEXT` | |

**Kişi kırılımı neden burada, `workshop`'ta olmasına rağmen:** `workshop`
tablosundaki kadro *bugünkü* durumdur ve güncellendiğinde geçmişi siler. Ekonomi
geriye dönük hesaplandığı için ayın kendi kadrosu satırda durmalıdır. Aynı
sebeple `workshop_profil.calisan_sayisi` de kullanılmaz.

**Kopyalanmayanlar:** `bolge` (teşvik bölgesi 1–6) `workshop`'tan, klasman
yetenek kataloğundan okunur. Tek kaynak korunur.

`work_days` zaten `monthly_expense`'te var ve `actual_days` ile aynı şeyi
söyler. `workshop_economy.actual_days` yazılırken `monthly_expense.work_days`
ile tutarlılığı kontrol edilir; çelişki varsa import raporunda uyarı çıkar,
sessizce üzerine yazılmaz.

### 3.3 `economy_param` — dönem versiyonlu parametreler

`(donem, param_key)` birincil anahtar; `donem` `'YYYY-MM'`. 16 parametre:

| Anahtar | Excel | Varsayılan (2026-01) |
|---|---|---|
| `min_wage_gross` | PARAMETRE!B4 | 33 030 |
| `min_wage_net` | B5 | 28 075,50 |
| `employer_cost` | B6 | 39 223,13 |
| `wage_support` | B7 | 1 270 |
| `minutes_per_day` | B8 | 540 |
| `nominal_days` | B9 | 22 |
| `effective_days` | B10 | 19,5 |
| `eff_cutting` | B14 | 0,75 |
| `eff_sewing` | B15 | 0,65 |
| `eff_ukp` | B16 | 0,75 |
| `target_margin` | B17 | 0,15 |
| `weight_cutting` | B19 | 1 |
| `weight_sewing` | B20 | 1 |
| `weight_ukp` | B21 | 1 |
| `revenue_adj_on` | B23 | 1 |
| `revenue_adj_divisor` | B24 | 24 |

Bir ay hesaplanırken **o aydan küçük veya eşit en yakın dönemin** parametresi
kullanılır. Asgari ücret değiştiğinde yeni bir dönem satırı eklenir; geçmiş
aylar eski parametreyle hesaplandığı için bozulmaz.

**Bölge 3D dakika maliyeti buraya kopyalanmaz.** Mevcut `dk_maliyet`
(`donem`, `bolge`, `dk_maliyet_tl` — migration 007) tablosundan okunur. Excel'in
`PARAMETRE!D32:D37` bloğu bu tablonun kopyasıdır; iki kaynak tutulursa
kaçınılmaz olarak ayrışırlar.

### 3.4 `economy_survey_staging` — ham anket

021'in `expense_declaration_staging` deseninin aynısı:

| Kolon | Açıklama |
|---|---|
| `id`, `tenant_id` | |
| `raw` | `JSONB` — anket satırı dokunulmadan |
| `workshop_name_raw` | Eşleme öncesi ham isim |
| `workshop_id` | Eşleşme sonucu, `NULL` ise bekliyor |
| `match_status` | `kesin` \| `inceleme` \| `eslesmedi` |
| `period_start` | Anketin kapsadığı ilk ay |
| `period_months` | Kaç ay (Excel'de `Fatura dönemi`) |
| `promoted_at` | Aylara bölünüp yazıldığı an |
| `note` | |

"3 aylık fatura ÷ 3" bölünmesinin izi burada kalır. Bir anket yanlış bölünmüşse
ham satır elde olduğu için geri alınıp yeniden bölünebilir.

---

## 4. Hesap çekirdeği

### 4.1 `lib/pes/ekonomi-hesap.ts`

Excel'in `FORMULLER` sayfasıyla bire bir. Girdi:

```ts
type EkonomiGirdi = {
  gider: MonthlyExpenseRow      // 28 gider kalemi + teşvik
  ekonomi: WorkshopEconomyRow   // ciro, adet, gün, kişi
  param: EconomyParam           // o dönemin 16 parametresi
  dkMaliyet3D: number | null    // dk_maliyet, atölyenin bölgesine göre
  qtyActual: number | null      // PES üretim kaydından adet
}
```

Çıktı `EkonomiRasyo` — Excel `HESAP` sayfasının 4 kimlik + 37 türetilmiş kolonu:

**Kadro ve ölçek**
`toplamKisi` = kesim+dikim+UKP+ofis · `uretimKisi` = kesim+dikim+UKP ·
`dikimPayi` = dikim ÷ toplam

**Ciro ve sonuç**
`aylikCiro` = ciro × (1 + boş gün ÷ payda), düzeltme parametreden kapatılabilir ·
`aylikAdet` · `ortFiyatAdet` = ciro ÷ adet ·
`brutGider` = `monthly_expense`'in 28 gider kaleminin toplamı (teşvik hariç) ·
`tesvik` · `netGider` = brüt − teşvik ·
`karZarar` = ciro − net gider · `marj` = (ciro − net gider) ÷ ciro

**İşçilik**
`iscilikToplam` = maaş+mesai+prim+SGK+kıdem ·
`iscilikPayi` = (işçilik − teşvik) ÷ net gider ·
`iscilikDisiKisi` = (brüt − işçilik − kira) ÷ toplam kişi ·
`iscilikYukKatsayisi` = (işçilik − teşvik) ÷ net maaş

**Kişi başı**
`ciroKisi` · `netGiderKisi` · `maasKisi` · `adetDikimci`

**Dakika**
`nominalDikimDk` = dikim kişi × saat × nominal gün × 60 ·
`fiiliDikimDk` = dikim kişi × saat × fiili gün × 60 ·
`uretimKisiDk` = üretim kişi × saat × nominal gün × 60 ·
`kisiDkMaliyet` = net gider ÷ üretim kişi-dakikası ·
`kesimDkMaliyet`, `dikimDkMaliyet`, `ukpDkMaliyet` ·
`dikimDkCiro` = ciro ÷ nominal dikim dk ·
`dakikaMarji` = (ciro − net gider) ÷ nominal dikim dk ·
`fiiliDikimDkMaliyet` = net gider ÷ fiili dikim dk ·
`asgariDkCarpani` = dikim dk maliyeti ÷ asgari ücretli dakika ·
`dikimDkAdet` = nominal dikim dk ÷ adet

**Fiyat**
`basabasFiyat` = net gider ÷ adet ·
`adilFiyat` = başabaş × (1 + hedef marj) ·
`fiyatSapmasi` = ortalama fiyat ÷ adil fiyat − 1

**Referans**
`referans3D` (bölgeden) · `dkMaliyet3DOran` = dikim dk maliyeti ÷ 3D

Sıfıra bölme her göstergede `null` döndürür — `0` değil. Sıfır "hesaplandı ve
sıfır çıktı" demektir; `null` "hesaplanamadı" demektir ve ekranda ikisi farklı
görünmelidir.

### 4.2 Tek yerde yaşayan üç kural

1. **Net gider = brüt gider − teşvik.** Teşvik bir gider değil, mahsup kalemidir;
   brüt toplama girmez, net maliyetten düşülür. Excel'in `FORMULLER!E12` notu
   uyarıyor: SGK net bildirilmişse teşvik iki kez düşülmüş olur. Bu yüzden
   import doğrulaması SGK'nın brüt bildirildiğini kontrol eder.

2. **Ciro düzeltmesi:** `fatura ÷ ay × (1 + boş gün ÷ 24)`. Dışarı ve boş geçen
   günleri kapasiteye geri ekler. `revenue_adj_on = 0` ile kapatılabilir ve
   kapatıldığında ekranda belirtilir.

3. **Bölüm dakika maliyeti:** net gider maaş ağırlığıyla kesim/dikim/UKP'ye
   dağıtılır, sonra o bölümün kişi-dakikasına bölünür. Ofis dakikası ürün
   üretmez; maliyeti üretim dakikasına biner.

   ```
   bolumDkMaliyet(b) = netGider × w_b
                     ÷ ((kesim×w_k + dikim×w_d + ukp×w_u) × saat × nominalGün × 60)
   ```

   Ağırlıklar bugün 1/1/1 olduğu için üç değer aynı çıkar. Bölüm maaşları
   toplandığı gün `economy_param`'dan ayrıştırılır; formül şimdiden hazırdır.

### 4.3 `lib/pes/ekonomi-akran.ts`

Medyan, min, maks, yüzdelik skor ve marj sırası. Yalnız cirosu olan atölyeler
örnekleme girer.

Akran grubu kademeli seçilir:

1. Aynı klasman **ve** aynı büyüklük bandı (dikim kişi: <50, 50–100, >100)
2. Yeterli örneklem (n ≥ 5) yoksa → aynı klasman
3. O da yoksa → tüm örneklem

Her karşılaştırmanın yanında hangi kademenin kullanıldığı ve `n` yazılır.
11 atölyeyle medyan zayıf bir istatistiktir; bunu gizlemek yerine göstereceğiz.

### 4.4 Testler

`ekonomi-hesap.test.ts` ve `ekonomi-akran.test.ts`. 11 pilot atölyenin Excel'de
hesaplanmış `HESAP` değerleri fixture olarak girilir; kod aynı sayıyı üretmezse
test kırılır. Excel bu işin referans uygulamasıdır, ondan sapma bir hatadır.

Ayrıca kenar durumlar: adet sıfır, dikim kişi sıfır, ciro sıfır, parametre
dönemi eksik, `dk_maliyet` satırı yok.

---

## 5. Ekranlar

Yeni kök `/pes/ekonomi`. Mevcut `/pes/gider-panosu` yerinde kalır — o gider
*yapısına* bakar (G1–G8 payları, beyan tamlığı), bu *ekonomiye* bakar (ciro,
marj, dakika maliyeti, adil fiyat). İkisi arasında karşılıklı bağlantı verilir.

| Ekran | İçerik |
|---|---|
| `/pes/ekonomi` | Atölye × dönem tablosu. 37 rasyo, kolon seçici, sıralama, klasman + bölge + büyüklük filtresi. Akran medyanı satırı sabit. |
| `/pes/ekonomi/[id]` | Tek atölye karnesi: her rasyo, yanında akran medyanı ve yüzdelik yeri. Dönem seçici. |
| `/pes/ekonomi/giris` | Aylık ekonomi satırı girişi ve düzeltme: ciro, adet, gün, kişi kırılımı. Gider kalemleri buraya değil, mevcut gider akışına gider. |
| `/pes/ekonomi/parametre` | 16 parametrenin dönem versiyonlu düzenlenmesi. Kaydetmeden önce hangi dönemlerin ve kaç atölyenin etkilendiği gösterilir. |

Navigasyon `components/pes/PesDevSidebar.tsx` içine eklenir.

### Üç dürüstlük kuralı

- Ekonomi satırı olmayan atölye tabloda **"veri yok"** yazar, sıfır değil.
  130 atölyenin 11'inde veri var; sıfır göstermek onları en kârlı ya da en
  zararlı uçlara fırlatır.
- Marj ve adil fiyat hesaplanırken kullanılan adetin **beyan mı PES üretimi mi**
  olduğu hücrede işaretlidir. İkisi arasındaki sapma %20'yi geçerse uyarı çıkar.
- `source='turetilmis'` satırlar gri gösterilir ve "N aylık beyandan türetildi"
  etiketi taşır.

---

## 6. Göç ve doğrulama

`scripts/import_ekonomi_anket.mjs`
`Atolye_Gider_Model.xlsx` → `VERI_GIRIS` okunur → `economy_survey_staging`'e ham
yazılır → isim eşlemesi denenir → aylara bölünür → `monthly_expense` +
`workshop_economy`.

İsim eşlemesi otomatik atamaz. `kesin` olmayan her satır rapora düşer ve
kullanıcıya sorulur. 11 pilot: Örssan, Hediye Group, İmkot, Needles, Teknik
Tekstil, Netclass, Bese, Srtteks, Simayteks, Bagisan, Boz Moda.

`scripts/verify_ekonomi.mjs`
Excel `HESAP` sayfasındaki hesaplanmış değerleri okur, PES'in ürettiği rasyolarla
karşılaştırır. ‰1 üstü sapma hata sayılır ve hangi atölyenin hangi göstergesinde
olduğu yazılır. Import'un "çalışması" yetmez; sayıların tutması gerekir.

Bilinen veri düzeltmeleri (Excel `OKU_BENI!B12`'den taşınır):
- Bese kıdem tazminatı `83,333` → `83.333` (ondalık ayracı hatası)
- Örssan ek resmi gider ve sigorta değerleri `Sayfa1`'den alınır;
  `ATOLYE VERİLER` satır 44–45 formülleri hatalıydı

---

## 7. Kapsam dışı

Bilerek E0'a alınmayanlar:

- Radar / karne / maliyet DNA panoları → **E1**
- Formül kütüphanesi ekranı (54 formülün tanım ve okuma notu) → **E2**
- MTM kütüphanesi, model × atölye maliyeti, adil fiyat pazarlık ekranı → **E3**
- Atölyeye görünürlük, veri talebi, düzeltme akışı → **E4**
- Parti büyüklüğü, model değişim süresi, öğrenme eğrisi, fast-track teşvik
  yapısı → **E5**

---

## 8. Riskler

| Risk | Etki | Karşılık |
|---|---|---|
| 11 atölyenin PES'te karşılığı bulunamaz | Pilot göçü durur | İsim eşlemesi otomatik atamaz, `inceleme` kuyruğuna düşer ve sorulur |
| Beyan adedi bant kapasitesi tahmini | Marj, başabaş ve adil fiyat kayar | PES üretim adedi yanında gösterilir; %20 üstü sapma uyarı üretir |
| 11 atölyelik örneklemde medyan zayıf | Akran karşılaştırması yanıltır | `n` her karşılaştırmada görünür; n < 5 ise kademe yükseltilir |
| Türetilmiş aylar gerçek sanılır | Trend analizi (E5) bozulur | `source` kolonu, gri gösterim ve etiket |
| SGK net bildirilmişse teşvik iki kez düşülür | Net gider olduğundan düşük | Import doğrulaması SGK/maaş oranını kontrol eder, şüpheliyi raporlar |
| `monthly_expense` eski kolonları `BIGINT` | Kuruşlu değer yazılırsa hata | `expense-mapping.coerceForColumn` zaten yuvarlıyor; yeni iki kolon `NUMERIC` |
