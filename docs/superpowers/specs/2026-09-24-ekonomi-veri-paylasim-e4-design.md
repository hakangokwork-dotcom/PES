# E4 — Veri toplama ve atölyeyle paylaşım (tasarım)

**Tarih:** 2026-09-24
**Durum:** tasarım
**Öncül:** E0 (veri omurgası), E1 (karşılaştırma), E2 (formül kütüphanesi)

## Neden şimdi

E0–E2 üç ekran kurdu ve **131 aktif atölyenin 11'ini** kapsıyor. E2'nin ortaya
çıkardığı tablo — 11 pilotun 8'i zararda görünüyor — bu kapsamla
yorumlanamaz: ciro yalnız beyandan geliyor ve doğrulanmadı. Platformun geri
kalanı veri gelmeden değer üretmiyor.

Kullanıcının ifadesi: *"bazen arkadaşlardan veriler isteyeceğim onlar ile
paylaşacağım atölyenin genel durumunu ve karşılaştırmaşları durumunu"*.
Buradaki döngü tek yönlü değil: **veri iste → atölye doldursun → karşılığında
kendi durumunu görsün.** Karne, verinin bedelidir; atölyenin doldurma sebebi
odur.

## Alınan iki karar (2026-09-24)

- **Paylaşım atölye panelinden**, PES girişiyle. Token'lı genel link veya
  dışa aktarılan dosya değil.
- **Toplama PES içinde talep ekranıyla**; Google Forms akışı sürdürülmüyor.

## Hemen kazanılacak kapsam

`monthly_expense`'te **20 atölyenin** gideri var ama `workshop_economy`'de
yalnız **11 satır**. Aradaki 9 atölye için gider zaten duruyor; eksik olan
anketin kadro/gün/adet alanları. Talep ekranı ilk olarak bunları istemeli.

## Üç parça

### A. Talep — iç ekip tarafı

Yeni tablo `economy_data_request`: hangi atölyeden hangi dönem için ne
istendi, durumu ne. Ekran `/pes/ekonomi/talep`:

- Atölye + dönem seçip talep aç
- Liste: kim doldurdu, kim doldurmadı, **hangi alanlar hâlâ boş**
- Eksik alan listesi `workshop_economy` satırından türetilir — elle takip
  edilen ayrı bir durum alanı tutulmaz, çünkü o veriyle anında saparlar

### B. Atölye giriş formu — `/workshop/ekonomi`

Atölye kendi dönem verisini doldurur: ciro, adet, boş gün, nominal/fiili gün,
günlük saat, dört bölümün kadrosu, alan. Kaydedince `workshop_economy`
satırı yazılır (`source='atolye'`), açık talep kapanır.

**Gider buraya girmiyor.** Gider `monthly_expense`'te ve atölyenin zaten
kullandığı Excel yükleme akışı var; ikinci bir giriş yolu açmak iki kaynak
yaratır.

`source` CHECK'i `'atolye'` değerini kabul etmiyor — migration genişletmeli.

### C. Atölye karnesi — `/workshop/ekonomi/karne`

Atölye **kendi** rasyolarını, yanında **anonim akran kıyasını** görür:
medyan, çeyreklikler, "n atölye içinde x. sırada". Başka atölyenin adı,
kodu veya tek tek değeri **asla** görünmez.

## Güvenlik — işin kritik yeri

### RLS gevşetmesi

Bugün üç tablonun kuralı atölye kullanıcısını tamamen dışarıda tutuyor:

```
(tenant_id = current_tenant_id() OR is_internal_admin())
AND current_workshop_id() IS NULL
```

Yeni kural yalnız `workshop_economy` için:

```
(tenant_id = current_tenant_id() OR is_internal_admin())
AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id())
```

**Bu 035'in hatası DEĞİL.** 035 `OR workshop_id IS NULL` yazıyor ve NULL
workshop'lu satırı herkese açıyor. Buradaki ikinci şart **eşitlik**;
`workshop_economy.workshop_id` ayrıca `NOT NULL`, yani NULL satır hiç
oluşamaz. İki koruma üst üste.

`economy_survey_staging` **değişmiyor** — ham anket iç veridir.
`economy_param` okumaya açılır (hesap için gerekli, hassas değil), yazma iç
ekipte kalır: tek `FOR ALL` politikası yerine ayrı SELECT/write politikaları.

### Akran medyanı nasıl sızmadan gösterilir

Atölye kullanıcısı diğer satırları göremediğine göre medyanı kendisi
hesaplayamaz. Çözüm `SECURITY DEFINER` bir fonksiyon: **yalnız toplu
istatistik döndürür** (n, medyan, Q1, Q3, sıra), hiçbir satır ve hiçbir isim
döndürmez.

**Küçük örneklem koruması:** n < 5 ise fonksiyon `NULL` döner. 3 atölyelik
bir grupta medyan, atölyenin rakibinin rakamını ifşa eder. Bu sayısal bir
incelik değil, gizlilik şartı.

## Kapsam dışı

Atölyenin başka atölyeyi görmesi (hiçbir biçimde). Gider kaleminin atölye
tarafından form üzerinden girilmesi. Talebin e-posta/SMS ile bildirimi —
atölye panele girdiğinde görür.

## Ölçüt

- Atölye kullanıcısı `/workshop/ekonomi` ile kendi verisini yazabiliyor
- Aynı kullanıcı `/workshop/ekonomi/karne`'de kendi rasyolarını ve anonim
  akran kıyasını görüyor
- Atölye kullanıcısı **başka** atölyenin satırını hiçbir uçtan okuyamıyor —
  `verify_workshop_isolation` bunu kanıtlıyor
- n < 5 olan bir örneklemde akran özeti boş dönüyor
- `/pes/ekonomi/talep` eksik alanları doğru sayıyor
