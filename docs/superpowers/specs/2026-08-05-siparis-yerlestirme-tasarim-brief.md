# Sipariş Yerleştirme Sistemi — Ekran Tasarımı Brief'i

**Durum:** Tasarım görüşmesi devam ediyor. Bu belge, ekran çalışması yapmak için
repoya erişimi olmayan birine verilecek kadar bağımsızdır. Karar verilmiş şeyler
"KARAR", verilmemiş olanlar "AÇIK" olarak işaretli.

Tarih: 2026-08-05 · Proje: PES (Next.js 16 App Router, Tailwind, Supabase/Postgres)

---

## 1. İş bağlamı

Konfeksiyon fason üretim yönetimi. Merkez ekip, müşteriden gelen siparişleri
**131 fason atölyeye** ve onların **185 dikim bandına** yerleştiriyor. Şu an bu
yerleştirme Excel ve telefonla yapılıyor; sistemde takvim ve öneri motoru var
ama yerleşen bir plan yok.

Temel hesap: **süre = sipariş miktarı ÷ günlük kapasite**.
10.000 adetlik sipariş, günde 1000 adet yapan bir yere 5 günde; 2500 adet
yapan bir yere 2 günde biter.

Üretim aşamaları (sistemde tanımlı, sıra numaralarıyla):

| sıra | kod | ad | bant bazlı mı |
|---|---|---|---|
| 3 | NUMUNE | Numune Onayı | hayır |
| 5 | HAZIRLIK | Hazırlık | hayır |
| 10 | KESIM | Kesim | hayır |
| 20 | DIKIM | Dikim | **evet** |
| 30 | YIKAMA | Yıkama | hayır |
| 40 | UTU | Ütü | hayır |
| 45 | KALITE | Kalite Kontrol | hayır |
| 50 | UKP | UKP (Ütü-Kalite-Paket) | hayır |
| 60 | PAKET | Paket | hayır |
| 70 | SEVK | Sevkiyat | hayır |

Her atölye her aşamayı yapamıyor. Atölyelerin üretim tipi dağılımı:
**CMT 58 · UKP 10 · DİKİM-UKP 8 · DİKİM 6 · KESİM-DİKİM 5**
(kalan ~44 atölyenin künyesi henüz doldurulmadı).
Yani UKP'si olmayan ~11 atölye var ve yalnız UKP hizmeti veren 10 atölye var —
UKP'si olmayan atölyeye yerleşen sipariş, UKP için dışarıya çıkıyor.

---

## 2. Verilen kararlar

**KARAR 1 — Sipariş birden fazla banda bölünebilir.**
10.000 adet tek banda da düşebilir, 3 banda paylaştırılıp her parça kendi
tarihini de alabilir. Ekranın bölme arayüzü olmalı.

**KARAR 2 — Aşama kapasitesi atölye bazında, elle girilir.**
Kullanıcı her atölye × aşama için günlük kapasite tanımlayabilir
(ör. "bu atölyenin kesimhanesi 3000 adet/gün"). Kapasite tanımlıysa sistem
süreyi hesaplar. Tanımlı değilse kullanıcı o aşamanın **"şu tarihte girer,
şu tarihte çıkar"** tarihlerini elle yazar.
Aşamalar arasında **boşluk normaldir** — yıkamada sıra beklemek gerçek bir durum,
zincirin kesintisiz olması şart değil.

**KARAR 3 — Malzeme eksikliği şimdilik yalnızca uyarı.**
Kumaş/aksesuar/etiket üretimden önce gelmiş olmalı, ama sistem planı
engellemeyecek. Beklenen geliş tarihi üretim başlangıcından sonraysa sipariş
işaretlenir, karar kullanıcıda kalır. Daha rijit kurallar (kilit, tampon süresi)
sonraki turda konuşulacak.

**KARAR 4 — Her aşama başka bir atölyede olabilir.**
Sadece UKP değil; yıkama da ayrı bir yetenek (7 atölye "CMT+Yıkama"). Tek genel
mekanizma: aşama kaydı kendi atölyesini taşır. Varsayılan siparişin atölyesi.

**KARAR 5 — Dış atölye seçiminde sistem eler, kullanıcı seçer.**
Atölyenin UKP'si yoksa, UKP verebilen atölyeler sıralanıp kullanıcıya sunulur.
Otomatik atama yok. *(Bu varsayım kullanıcıya bildirildi, itiraz gelmedi.)*

**KARAR 6 — Gerçekleşen veri girişi karma.**
Aşama başlangıç/bitiş tarihi zorunlu; günlük adet girişi isteğe bağlı.
Girilirse plan eğrisi ile gerçek eğri üst üste çizilebilir, girilmezse en azından
gecikme takibi çalışır. Hem atölye kendi girebilir hem merkez düzeltebilir.
*(Bu da varsayım olarak bildirildi.)*

**KARAR 7 — Önce sihirbaz, sonra takvim düzenleme.**
Yerleştirmeyi yapan, aşama zincirini kuran ve veriyi doğuran akış önce
yapılacak. Bant takviminde sürükle-bırak düzenleme ikinci turda.
Gerekçe: ilgili tablolar şu an boş; sürükle-bırak takvimi önce yaparsak
sürüklenecek bir şey olmaz.

---

## 3. Mevcut altyapı (ne var, ne yok)

**Dolu ve çalışıyor:**
- `work_order` — sipariş no, müşteri, model, sipariş miktarı, başlangıç/bitiş/teslim
  tarihi, öncelik, risk seviyesi, ilerleme %, materyal durumu %, sezon.
  Şu an 14 kayıt (Planlandı 2, Bekleniyor 4, Devam 7, Sevk Edildi 1).
- `production_line` — 185 aktif bant, **hepsinde günlük hedef dolu** (0–6818 arası).
- `work_order_material` — KUMAŞ/AKSESUAR/ETİKET/AMBALAJ/İPLİK, beklenen tarih,
  geliş tarihi, durum (Bekleniyor/Sipariş Verildi/Yolda/Geldi/Eksik/İade).
- `/pes/takvim` ekranı — atölye listesi + doluluk, atölye bant takvimi, ve bir
  **slot bulucu** (miktar + günlük hedef + şehir girip uygun bant arıyor).
- `auto-plan` API'si — `ceil(miktar / günlük hedef)` ile gün sayısını buluyor,
  bantın dolu aralıklarını çıkarıp boş slot arıyor, puanlayıp sıralıyor.

**Şema var ama tamamen boş — asıl eksik bu:**
- `work_order_stage` (0 satır) — aşama başına satır. `line_id`, `plan_baslangic`,
  `plan_bitis`, `gercek_baslangic`, `gercek_bitis`, `uretilen_adet`, `hatali_adet`,
  durum. Yani tahmini/gerçekleşen ayrımı şemada zaten hazır, hiç kullanılmıyor.
- `line_schedule` (0 satır) — bant takvimi kayıtları.

**Hiç yok:**
- Aşama bazında atölye kapasitesi
- Bir siparişi birden fazla banda bölme
- Aşamanın başka atölyede yapılması
- Günlük üretim girişi
- Malzeme/plan çakışma uyarısı

---

## 4. Kararlaştırılan veri modeli

```
work_order (mevcut)
  └── work_order_stage (mevcut, + YENİ workshop_id kolonu)
         │   aşamanın kendisi: hangi atölye, plan penceresi, gerçek pencere, durum
         │   workshop_id boşsa siparişin atölyesi; farklıysa DIŞ ATÖLYE
         │
         └── work_order_stage_atama (YENİ)
                 bant tahsisi: line_id, adet, plan_baslangic, plan_bitis,
                               gercek_baslangic, gercek_bitis
                 3 banda bölünen dikim = 3 satır
                 kesim/yıkama/UKP bant bazlı değil → hiç satırı olmaz,
                 tarihleri work_order_stage üzerinde durur
                 └── work_order_gunluk_uretim (YENİ)
                         tarih, adet, hatali_adet  (isteğe bağlı giriş)

workshop_stage_capacity (YENİ)
  workshop_id × stage_id → günlük kapasite   (kullanıcı elle girer)

line_schedule (mevcut, anlamı değişiyor)
  bundan sonra yalnız iş emri DIŞI bloklar: bakım, izin, tatil.
  iş emri doluluğu work_order_stage_atama'dan okunur — aynı bilgi iki tabloda
  durursa zamanla birbirini tutmaz.
```

**Aşamanın plan penceresi** tahsislerin MIN(başlangıç)/MAX(bitiş)'i.

**Bilinen borç:** `work_order.line_id` (tek bant) bölme ile anlamsızlaşıyor.
Kolon silinmeyecek ama doğruyu artık `atama` söyleyecek; mevcut takvim ve
auto-plan bu kolonu okuduğu için onların da çevrilmesi gerekiyor.

**Aşama zinciri:** Mevcut `wo_init_stages()` fonksiyonu yalnız `zorunlu=TRUE`
aşamaları açıyor (Kesim, Dikim, UKP). Yıkama ve Sevk açılmıyor. Bu, sipariş
bazında seçilebilir hale getirilecek — sihirbazda "bu siparişte yıkama var mı"
işaretlenir, zincir ona göre kurulur.

---

## 5. Tasarlanacak ekranlar

### 5.1 Sipariş Yerleştirme Sihirbazı (ana iş)

Önerilen adımlar — **bu bölüm AÇIK, ekran çalışmasının asıl konusu bu:**

1. **Sipariş bilgileri** — sipariş no, müşteri, model/stil, miktar, teslim tarihi,
   sezon, öncelik. (Mevcut siparişten devam etme yolu da olmalı.)
2. **Aşama zinciri** — hangi aşamalar var? Kesim ☑ Dikim ☑ Yıkama ☐ UKP ☑ Sevk ☑
3. **Atölye ve bant seçimi** — sistem adayları puanlayıp sıralar (teslim tarihine
   tampon, bant doluluğu, günlük hedef). Kullanıcı seçer. **Bölme burada yapılır:**
   10.000 adedi kaç banda, hangi oranda paylaştıracağı.
4. **Dış atölyeye çıkan aşamalar** — seçilen atölye UKP yapamıyorsa, UKP verebilen
   atölyeler listelenir. Yıkama için de aynı.
5. **Kapasitesi tanımsız aşamalar** — elle "girer/çıkar" tarihi girişi.
6. **Malzeme kontrolü** — beklenen geliş tarihleri üretim başlangıcıyla
   karşılaştırılır, geç kalanlar uyarı olarak gösterilir (engellemez).
7. **Özet ve onay** — zincirin tamamı zaman çizelgesi olarak, sonra "Yerleştir".

Zor kısımlar, tasarımda çözülmesi gerekenler:
- Bölme arayüzü: adedi bantlara paylaştırma nasıl gösterilir/düzenlenir?
- Aday listesi: 131 atölye × 185 bant arasından seçim nasıl daraltılır?
- Zincirin görselleştirilmesi: 5-7 aşama, farklı atölyeler, aralarında boşluklar

### 5.2 Bant takvimi (mevcut ekran, geliştirilecek — 2. tur)
Şu an salt görüntüleme. Sürükle-bırak ile plan kaydırma ikinci turda.

### 5.3 Sipariş detayı — plan vs gerçekleşen
Aşama aşama planlanan pencere ile gerçekleşen pencere yan yana; günlük adet
girilmişse plan eğrisi vs gerçek eğri.

### 5.4 Günlük üretim girişi
Atölye panelinde (`/workshop`), bant × gün × adet. Hızlı giriş olmalı — her gün
kullanılacak.

### 5.5 Atölye kapasite tanımlama
Atölye × aşama günlük kapasite tablosu. Muhtemelen atölye detay sayfasında
bir sekme.

---

## 6. Ekran tasarımı kısıtları

- **Dil:** Arayüz tamamen Türkçe.
- **Stack:** Next.js 16 App Router, React, Tailwind. Grafik için `recharts`
  zaten kurulu. İkon olarak `lucide-react` ve bazı yerlerde düz unicode
  karakterler kullanılıyor.
- **Marka rengi:** `#197A56` (koyu yeşil), hover `#0E3E1B`.
- **Mevcut görsel dil:** beyaz kart + `border-gray-200` + `rounded-xl`,
  tablo başlıkları `bg-gray-50`, durum rozetleri `text-xs px-2 py-0.5
  rounded-full` (yeşil=iyi, kehribar=uyarı, kırmızı=kötü, gri=yok).
  Sayfa başlığı `text-2xl font-bold text-gray-900`, altında gri özet satırı.
- **Sol menü:** gruplu (Genel / Atölyeler & Plan / Sipariş & Üretim / Modelleme /
  Verimlilik & Kalite / İK & Maliyet / Performans & Karşılaştırma). Yeni ekran
  muhtemelen "Sipariş & Üretim" altına girer.
- Sayfalar sunucu bileşeni olarak veri çekip istemci bileşenine veriyor;
  filtreleme/etkileşim istemcide.

---

## 7. Açık sorular

1. Sihirbaz adım adım mı ilerlesin (wizard), yoksa tek sayfada bölümler halinde mi?
2. Bölme arayüzü: yüzde mi, adet mi, sürükleyerek mi?
3. Aday atölye listesi neye göre daraltılsın — şehir/bölge, tedarik müdürlüğü,
   müşteri geçmişi, yetenek eşleşmesi?
4. Bir sipariş birden fazla **atölyeye** de bölünebilir mi, yoksa bölme yalnız
   tek atölyenin bantları arasında mı? *(Şimdiye kadar tek atölye varsayıldı.)*
5. Yerleştirme sonrası değişiklik: sihirbaz tekrar mı çalışır, yoksa ayrı bir
   düzenleme ekranı mı?
