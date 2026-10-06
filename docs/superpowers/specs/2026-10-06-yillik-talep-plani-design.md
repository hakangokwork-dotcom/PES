# Yıllık Talep Planı (Forecast → Atölye Tahsisi) — Tasarım

Tarih: 2026-10-06 · Panel: merkez (`requirePanel('yonetim')`)

## Amaç

Tedarikçi departmanları yıl başında sipariş tahmini verir ("bu kumaşla 1 milyon pantolon").
Tahmin tipe göre kalemlere bölünür (ör. 600k 5-cep denim, 400k chino). Sistem her kalem için
yetenek yapısıyla uygun atölyeleri bulur, aylık boş kapasiteye göre dağılım önerir; planlamacı
düzenler. Sonuç atölye × ay yıllık yük planıdır. Gerçek PO geldiğinde tahmini tüketir.

## Kararlar

- Tahsis: sistem önerir, planlamacı düzenler.
- Zaman kırılımı: aylık.
- Tahmin → PO: yumuşak rezervasyon; eşleşen PO tahmin kalemini tüketir.
- Giriş: yalnız merkez planlamacılar (departman kendi girmez).
- Öneri algoritması: açgözlü doldurma (uyum + boş kapasite). LP ve oransal paylaştırma reddedildi.

## 1. Ortak birim: dakika

Atölyeler karışık ürün diker; adet karşılaştırılamaz.

- Kalem yükü (dk) = `adet × SAM`. SAM varsayılanı ürün tipinin referans süresi
  (`ref_parca_sure`, `lib/pes/referans-model.ts`); kalemde `sam_dk` ile ezilebilir.
  Ürün tipi yoksa ve ezme yoksa kalem önerilemez, ekranda "SAM eksik" uyarısı çıkar.
- Atölye aylık kapasitesi (dk) = Σ bant (`operator_count × 540 × verim × iş günü`).
  Verim 0,85 (`app/api/pes/work-orders/auto-plan/route.ts` ile aynı kural, ortak sabite çekilir).
  İş günü: ayın hafta içi günleri; `workshop_kapasite_gun` override'ı olan günlerde o değer kullanılır.
- Boş kapasite = kapasite − gerçek PO yükü (o aya düşen `work_order` dakikası) − diğer tahsisler.

## 2. Veri modeli (yeni migration)

`talep_tahmini`
- `id`, `tenant_id`, `yil int`, `departman text` (tedarikçi departmanı/müşteri),
  `ad text`, `kumas text`, `aciklama text`, `durum` CHECK in ('Taslak','Onayli'), zaman damgaları.

`talep_tahmini_kalem`
- `id`, `tahmin_id` FK cascade, `ad text`
- künye 7 alanı: `ana_grup_kodu`, `klasman_kodu`, `kumas_turu_kodu`, `kumas_grubu_kodu`,
  `cinsiyet_yas_kodu`, `kalite_kodu`, `kumasci` (doğrulama `lib/pes/kunye.ts` `kodlariDogrula`)
- `urun_tipi_id` FK `ref_urun_tipi` nullable, `sam_dk numeric` nullable
- `adet int > 0`
- `aylik_profil numeric[12]` — yüzdeler, toplam 100; varsayılan eşit dağılım

`talep_tahsis`
- `id`, `kalem_id` FK cascade, `workshop_id` FK, `ay int` 1–12, `adet int >= 0`,
  `kaynak` CHECK in ('oneri','elle'); UNIQUE (`kalem_id`,`workshop_id`,`ay`)

`work_order`
- yeni nullable `tahmin_kalem_id` FK `talep_tahmini_kalem` ON DELETE SET NULL.
  Kalemin tüketilen adedi = bağlı PO'ların `siparis_miktari` toplamı.

RLS: `plan_taslak` (043) ile aynı kiracı kalıbı. Doğrulama `APP_DATABASE_URL` ile yapılır.

## 3. Saf kütüphane: `lib/pes/yillik-plan.ts`

- `aylikKapasite(atolye, yil)` → 12 aylık dk dizisi
- `kalemDakikasi(kalem)` → aylık dk dizisi (adet × SAM × profil)
- `oneriUret(kalem, adaylar, bosKapasite)` → tahsis listesi + `tahsisEdilemeyen` adet.
  Aday kümesi: `genelUyum()` sonucu `uygun` olan atölyeler; sıralama `adayAtolyeler()`
  ağırlıkları. Her ay için sırayla en yüksek puanlı atölyenin boş dakikası dolar, sonra sıradaki.
  `elle` kaynaklı tahsisler korunur, öneri yalnız `oneri` satırlarını yeniden yazar.
- `uyumsuzlukNedeni(kalem, atolye)` → gri hücre açıklaması (`boyutUyumlari()` çıktısından)

## 4. Ekran: `/pes/yillik-plan`

Sidebar "Planlama" grubuna eklenir (`components/pes/PesDevSidebar.tsx`).

- Sol: yıl seçici, tahmin listesi, seçili tahminin kalemleri (künye seçicileri, adet, SAM, aylık profil).
- Sağ: atölye × ay ızgarası.
  - Üst satır seçili kalemin tahsisleri (düzenlenebilir hücre, adet).
  - Her hücrede toplam yük % (gerçek PO + tüm tahsisler); >%100 kırmızı.
  - Uyumsuz atölyeler gri, üzerine gelince neden.
  - "Öner" düğmesi; altta "Tahsis edilemeyen: N adet" — zorla atanmaz.
- Tahmin onaylanınca (`Onayli`) Planlama Masası ipucu üretir.

API: `app/api/pes/yillik-plan/` altında tahmin CRUD, kalem CRUD, `oneri` (POST, hesaplayıp yazar),
tahsis hücre güncelleme.

## 5. PO ile tüketim

- Planlama Masası / PO havuzunda: PO'nun künyesi + teslim ayı onaylı bir kalemle eşleşirse
  "Tahmin: X atölyesine ön-tahsisli" ipucu gösterilir.
- Planlamacı PO'yu kaleme bağlar (`tahmin_kalem_id`); açık tahmin = kalem adedi − tüketilen.
- Takvime (`line_schedule`) günlük rezerve YAZILMAZ; yumuşak rezervasyon aylık ızgaradır.

## 6. Hata durumları

- SAM yok → kalem önerilemez, uyarı.
- Hiç uygun atölye yok → tüm adet "tahsis edilemeyen".
- Profil toplamı ≠ 100 → kaydedilmez.
- Künye boş alan → `genelUyum` `kunye-bos` döner; o boyut kısıt sayılmaz (mevcut kural).

## 7. Test

Vitest, `lib/pes/yillik-plan.test.ts`: kapasite (override günleri dahil), dakika dönüşümü,
öneri doldurma sırası, `elle` satırların korunması, taşma → tahsis edilemeyen.
Migration sonrası RLS'i `APP_DATABASE_URL` ile iki kiracıyla doğrula.

## Kapsam dışı (v1)

Departman girişleri/rolü, maliyet optimizasyonu, Excel'den tahmin içe aktarma.
