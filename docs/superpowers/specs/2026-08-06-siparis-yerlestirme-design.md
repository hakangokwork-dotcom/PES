# Sipariş Yerleştirme Sistemi — Tasarım

Tarih: 2026-08-06 · Durum: tasarım onaylandı, uygulama planı bekliyor

---

## 1. Problem

Merkez ekip, müşteriden gelen siparişleri 123 aktif fason atölyeye ve onların
bantlarına yerleştiriyor. Bu iş bugün Excel ve telefonla yapılıyor. Sistemde
takvim ve bir öneri motoru var ama **yerleşen bir plan yok**: `work_order_stage`
ve `line_schedule` tabloları boş, aşama zinciri hiç kurulmuyor.

Temel hesap basit — **süre = miktar ÷ günlük kapasite**. 10.000 adetlik sipariş
günde 1000 adet yapan yere 5 günde, 2500 yapan yere 4 günde biter. Zor olan
kısım bu değil; zor olan zincirin tamamı: kesimden sevke kadar hangi aşama
nerede, ne zaman, hangi bantta; malzeme zamanında gelecek mi; atölye UKP
yapamıyorsa nereye çıkacak; ve sonunda planın tutup tutmadığı.

---

## 2. Kararlar

Tasarım görüşmesinde alınan kararlar. Numaralar sonraki bölümlerde referans
olarak kullanılıyor.

**K1 — Sipariş birden fazla banda bölünebilir**, ama **tek atölye içinde**.
10.000 adet bir atölyenin 3 bandına paylaştırılabilir; iki ayrı atölyeye
bölünemez. Sipariş bir atölyeye aittir; aşamalar gerekirse dışarı çıkar (K4).

**K2 — Aşama kapasitesi atölye bazında, elle girilir.** Kullanıcı her
atölye × aşama için günlük kapasite tanımlayabilir. Tanımlıysa sistem süreyi
hesaplar; tanımlı değilse kullanıcı o aşamanın "girer/çıkar" tarihini yazar.
Aşamalar arasında **boşluk normaldir** — yıkamada sıra beklemek gerçek bir
durumdur, zincirin kesintisiz olması şart değil.

**K3 — Malzeme eksikliği yalnızca uyarı.** Kumaş/aksesuar/etiket üretimden önce
gelmiş olmalı ama sistem planı engellemez. İşaretler, karar kullanıcıda kalır.
Daha rijit kurallar (kilit, tampon süresi) sonraki tur.

**K4 — Her aşama başka bir atölyede olabilir.** Sadece UKP değil; yıkama da ayrı
bir yetenek. Tek genel mekanizma: aşama kaydı kendi atölyesini taşır, varsayılan
siparişin atölyesidir.

**K5 — Dış atölye seçiminde sistem eler, kullanıcı seçer.** Otomatik atama yok.

**K6 — Gerçekleşen veri girişi karma.** Aşama başlangıç/bitiş tarihi zorunlu,
günlük adet girişi isteğe bağlı. Hem atölye kendi girer hem merkez düzeltir.

**K7 — Önce sihirbaz, sonra takvimde düzenleme.** Veriyi doğuran akış önce
yapılır; bant takviminde sürükle-bırak ikinci turda.

**K8 — Planlama teslimden geriye.** Sipariş mümkün olan en geç tarihte başlar,
teslime tam yetişir. Bantlar gereksiz erken dolmaz, araya acil iş girebilir.

**K9 — Bölme kapasiteye orantılı.** 1000'lik ve 500'lük iki bant 10.000'i
6667/3333 paylaşır, ikisi aynı gün biter. Kullanıcı adetleri düzenleyebilir.

**K10 — Aday atölye sıralaması dört ölçütü birden kullanır:** bant boşluğu +
teslime yetişme, yetenek eşleşmesi, denetim durumu, tedarik müdürlüğü/bölge.

---

## 3. Mevcut altyapı — ne yeniden kullanılıyor

Bu iş sıfırdan başlamıyor. Kullanılacaklar:

- `work_order` — sipariş no, müşteri, model, miktar, teslim tarihi, öncelik,
  risk seviyesi, ilerleme %, materyal durumu %. 14 kayıt var.
- `production_stage` — 10 aşama tanımlı: NUMUNE(3) HAZIRLIK(5) KESIM(10)
  DIKIM(20) YIKAMA(30) UTU(40) KALITE(45) UKP(50) PAKET(60) SEVK(70).
- `production_line` — 185 aktif bant, **hepsinde `daily_target` dolu**.
- `work_order_material` — KUMAŞ/AKSESUAR/ETİKET/AMBALAJ/İPLİK, beklenen ve
  gerçek geliş tarihi, durum.
- `work_order_stage` — aşama başına satır; `line_id`, `plan_*`, `gercek_*`,
  `uretilen_adet` kolonları zaten var. **Şu an boş.**
- `line_capability` — 4058 kayıt; yetenek eşleşmesi (K10) buradan çıkar.
- `workshop_profil.uretim_tipi` — CMT 58 · UKP 10 · DİKİM-UKP 8 · DİKİM 6 ·
  KESİM-DİKİM 5. UKP yapamayan ~11 atölye ve UKP veren 10 atölye buradan belli.
- `v_atolye_denetim_durum` — denetim durumu (K10); 49 atölyenin süresi dolmuş.
- `auto-plan` API'si — `⌈miktar ÷ daily_target⌉` ve boş slot arama mantığı;
  yeni algoritmanın çekirdeği buradan devralınacak.

---

## 4. Veri modeli

```
work_order  (mevcut)
  │  siparişin sahibi TEK atölyedir (K1)
  └── work_order_stage  (mevcut + YENİ workshop_id)
         │   aşamanın kendisi: hangi atölye, plan penceresi, gerçek pencere, durum
         │   workshop_id NULL ise siparişin atölyesi; farklıysa DIŞ ATÖLYE (K4)
         │
         └── work_order_stage_atama  (YENİ)
                │   bant tahsisi: line_id, adet, plan_baslangic, plan_bitis,
                │                 gercek_baslangic, gercek_bitis
                │   3 banda bölünen dikim = 3 satır (K1, K9)
                │   bant bazlı olmayan aşamalarda HİÇ satır olmaz
                │
                └── work_order_gunluk_uretim  (YENİ)
                        tarih, adet, hatali_adet   — isteğe bağlı (K6)

workshop_stage_capacity  (YENİ)
    workshop_id × stage_id → gunluk_kapasite      — elle girilir (K2)

line_schedule  (mevcut, anlamı değişiyor)
    bundan sonra YALNIZ iş emri dışı bloklar: bakım, izin, tatil.
    İş emri doluluğu work_order_stage_atama'dan okunur.
```

**Neden `line_schedule` daraltılıyor:** iş emri doluluğu hem orada hem
tahsiste dursaydı aynı bilgi iki tabloda olur ve zamanla birbirini tutmazdı.
Tablo şu an boş, bu daraltmanın veri maliyeti yok.

**Aşamanın plan penceresi** tahsislerin `MIN(plan_baslangic)` / `MAX(plan_bitis)`
değeridir; ayrıca saklanmaz, sorguda türetilir.

**Bilinen borç:** `work_order.line_id` (tek bant) K1 ile anlamsızlaşıyor. Kolon
silinmiyor ama doğruyu artık tahsis tablosu söylüyor. `auto-plan` ve takvim bu
kolonu okuduğu için onların da çevrilmesi gerekiyor — işin görünmeyen parçası.

**Aşama zinciri:** mevcut `wo_init_stages()` yalnız `zorunlu=TRUE` aşamaları
açıyor (Kesim, Dikim, UKP); yıkama ve sevk açılmıyor. Sipariş bazında seçilebilir
hale getirilecek: sihirbazın 2. adımında işaretlenen zincir kurulur.

---

## 5. Yerleştirme algoritması

### 5.1 Aşama süresi

| aşama tipi | süre |
|---|---|
| Dikim (bant bazlı) | `⌈adet ÷ Σ(seçilen bantların daily_target)⌉` |
| Kapasite tanımlı aşama | `⌈adet ÷ workshop_stage_capacity⌉` |
| Kapasite tanımsız | süre hesaplanmaz; kullanıcı tarihi elle girer (K2) |

### 5.2 Bölme (K9)

Bant *b* için pay: `adet × daily_target(b) ÷ Σ daily_target`. Yuvarlama artığı
en büyük kapasiteli banda eklenir, böylece toplam adet korunur. Kullanıcı
adetleri düzenleyebilir; düzenleyince süre yeniden hesaplanır.

### 5.3 Zincir ve yön (K8)

Aşamalar `sira_no`'ya göre dizilir. Planlama **teslim tarihinden geriye**:
son aşamanın bitişi = teslim tarihi, her aşama bir öncekinin başlangıcından
önce biter. Aralarında boşluk kalabilir (K2).

Geriye giderken bir aşama bugünden öncesine düşerse: plan yine kurulur ama
sipariş **"teslime yetişmiyor"** olarak işaretlenir. Sessizce bugüne kaydırmak,
yetişmediğini gizlemek olurdu.

### 5.4 Çakışma

Bant tahsisi, o bandın mevcut tahsisleriyle ve `line_schedule` bloklarıyla
(bakım/izin/tatil) çakışmayan aralığa oturur. Geriye doğru giderken uygun aralık
bulunamazsa bir önceki uygun aralığa kayar ve fark kullanıcıya gösterilir.

### 5.5 Malzeme uyarısı (K3)

`MAX(work_order_material.gelis_tarihi ?? beklenen_tarih)` > ilk üretim aşamasının
planlanan başlangıcı ise sipariş işaretlenir. Engellenmez.

### 5.6 Aday atölye puanlaması (K10)

Dört ölçüt, her biri 0-100 arası bir alt puan üretir, ağırlıklı toplanır:

| ölçüt | kaynak | eleme mi, puan mı |
|---|---|---|
| Bant boşluğu + teslime yetişme | tahsisler + `daily_target` | **Eleme** — yetişmeyen aday listede en altta ve işaretli |
| Yetenek eşleşmesi | `line_capability` (4058 kayıt) | Puan |
| Denetim durumu | `v_atolye_denetim_durum` | Puan — süresi dolmuşsa düşer ve uyarı taşır |
| Tedarik müdürlüğü / bölge | `workshop_profil` | Puan |

Ağırlıklar koda gömülmez; tek bir sabitler nesnesinde durur ki kullanım sonrası
ayarlanabilsin.

---

## 6. Ekranlar

### 6.1 Sipariş yerleştirme sihirbazı

Yedi adım, geri dönülebilir:

1. **Sipariş** — no, müşteri, model, miktar, teslim tarihi, öncelik
2. **Aşama zinciri** — hangi aşamalar var (Kesim ☑ Dikim ☑ Yıkama ☐ UKP ☑ Sevk ☑)
3. **Atölye** — puanlanmış aday listesi (5.6), seçim
4. **Bant dağılımı** — kapasiteye orantılı öneri, düzenlenebilir adetler,
   süre anında güncellenir
5. **Dış atölye** — seçilen atölye UKP/yıkama yapamıyorsa aday listesi (K4, K5)
6. **Kapasitesiz aşamalar** — "girer/çıkar" tarihi elle (K2)
7. **Özet** — zincirin zaman çizelgesi + malzeme uyarısı → **Yerleştir**

Yerleştirme tek transaction: `work_order` + zincir aşamaları + bant tahsisleri.
Yarım kalmış plan diye bir şey olmamalı.

Sonradan değişiklik ayrı ekran değil: sihirbaz aynı siparişle açılır, mevcut
yerleşim dolu gelir.

### 6.2 Sipariş detayı — plan vs gerçekleşen (K6)

Aşama aşama planlanan pencere ile gerçekleşen pencere yan yana. Günlük adet
girilmişse plan eğrisi ile gerçek eğri üst üste.

### 6.3 Günlük üretim girişi

Atölye panelinde (`/workshop`), bant × gün × adet. Her gün kullanılacak, hızlı
giriş olmalı.

### 6.4 Atölye kapasite tanımlama (K2)

Atölye × aşama günlük kapasite tablosu. Atölye detayında yeni bir sekme.

### 6.5 Bant takvimi

Mevcut ekran. Bu turda yalnız **okur**: tahsisleri gösterir. Sürükle-bırak
düzenleme ikinci turda (K7).

---

## 7. Kapsam dışı (bilerek)

- Sürükle-bırak takvim düzenleme — K7, ikinci tur
- Siparişin birden fazla **atölyeye** bölünmesi — K1
- Malzeme kilidi ve tampon süresi kuralları — K3
- Otomatik atölye ataması — K5
- Kapasite tahmini/öğrenme — kapasiteyi kullanıcı girer, sistem çıkarmaz

---

## 8. Doğrulama

- **Süre ve bölme hesabı** için birim test: 10.000 adet, 1000+500 bant →
  6667/3333, ikisi de 7 gün, aynı gün biter.
- **Geriye planlama** için birim test: teslim tarihi verildiğinde zincirin
  başlangıcı doğru gün; bugünden öncesine düşen zincir "yetişmiyor" işaretli.
- **RLS ve tenant izolasyonu** için gerçek DB'ye bağlanan test (projede kalıp
  var: `lib/pes/atolye-profil.test.ts`, `workshop-baglantilar.test.ts`).
- **Tarih tipleri** için: DATE kolonları sorguda `::text` ile dönmeli. Bu
  projede daha önce `postgres.js`'in DATE'i `Date` nesnesine çevirmesi canlıda
  ekran çökertti; tip iddiası çalışma zamanında doğrulanmıyor.
- **Ekran doğrulaması** tarayıcıda, gerçek veriyle. Derleme ve test yeşil olması
  ekranın çalıştığını göstermiyor.

---

## 9. Açık riskler

1. **Kapasite verisi yok.** `workshop_stage_capacity` boş başlayacak; kullanıcı
   doldurana kadar dikim dışındaki aşamalar elle tarih isteyecek. İlk kullanımda
   sihirbaz çok soru soruyormuş gibi hissettirebilir.
2. **`work_order.line_id` göçü.** Takvim ve `auto-plan` bu kolonu okuyor;
   tahsis tablosuna çevrilmezse iki farklı doğruluk kaynağı oluşur.
3. **Aşama zinciri kurulumu geriye dönük değil.** Mevcut 14 iş emrinin zinciri
   yok; sihirbazdan geçmedikleri için raporlarda boş görünecekler.
4. **Yetenek eşleşmesi ölçütü** modelin gerektirdiği yeteneğin girilmiş olmasına
   bağlı. Model tarafında bu veri seyrekse ölçüt sessizce etkisiz kalır.
