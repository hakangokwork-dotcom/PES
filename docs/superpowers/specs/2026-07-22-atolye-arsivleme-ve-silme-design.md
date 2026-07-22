# Atölye arşivleme ve silme

Tarih: 2026-07-22
Durum: tasarım onaylandı

## Sorun

Ekip `/pes` panelinden atölye ekleyebiliyor ama listeden çıkaramıyor. Yanlış
eklenen kayıt sonsuza kadar duruyor, kapanan atölye aktif sayılmaya devam
ediyor.

`workshop.is_active` kolonu şemada var ve sistemin tamamı ona saygı duyuyor —
dashboard sayacı, karşılaştırma, benchmark, raporlar, atölye paneli, gider
şablonu, yetenek raporu ve takvim hepsi `is_active = true` filtreliyor.
Eksik olan tek şey **anahtarı çeviren arayüz**. Atölye listesi de filtresiz,
aktif ve pasif kayıtları birlikte gösteriyor.

## Kararlar

**Arşivleme ana işlem, kalıcı silme istisna.** 24 tablo `workshop`'a bağlı:
23'ü `ON DELETE CASCADE` (üretim, gider, kalite, iş emri, duruş, operatör,
bant, yetenek, cari hesap, kaizen…), biri — `expense_declaration_staging` —
`ON DELETE SET NULL`. Gerçek bir `DELETE` o atölyenin bütün geçmişini sessizce
siler. Dokuz kişinin ortak alanda çalıştığı bir kurulumda bu kabul edilemez.

**Kalıcı silme yalnız tamamen boş atölyeye açık.** Bağlı 24 tablonun
herhangi birinde tek satır varsa silme reddedilir. Kural tek cümleyle
anlatılabilir ve yanlış silme ihtimalini sıfırlar. Bedeli: yanlışlıkla bant
eklenmiş bir atölyeyi silmek için önce bandı silmek gerekir. Kabul edildi.

**Yetki ayrımı yok.** Dokuz kişinin tamamı her atölyeyi arşivleyebilir ve
silebilir. Mevcut kurulumun ruhu bu: ortak havuz, herkes admin, "Sahiplen"
bir erişim kısıtı değil ilgi işareti (bkz. `026_workshop_ownership.sql`).

**Şema değişmiyor.** Yeni migration yok.

## Uç noktalar

### `PATCH /api/pes/workshops/[id]`

Mevcut alan listesine `is_active` eklenir. Arşivleme `{ is_active: false }`,
geri alma `{ is_active: true }`.

Mevcut `COALESCE(${body.x ?? null}, x)` deseni boolean için doğru çalışır:
`false` gönderildiğinde `??` onu korur, alan hiç gönderilmediğinde mevcut
değer kalır. Düzenleme formu bu alanı göndermediği için durumu bozmaz.

### `DELETE /api/pes/workshops/[id]` (yeni)

Transaction:

1. `SELECT id FROM workshop WHERE id = $1 FOR UPDATE` — atölye satırını
   kilitler. Alt tabloya kayıt eklemek yabancı anahtar kontrolü için üst
   satırda `FOR KEY SHARE` alır ve bu `FOR UPDATE` ile çakışır; böylece
   sayım ile silme arasında kimse o atölyeye kayıt giremez.
2. Bağlı tabloları sayar. Tablo listesi elle yazılmaz, `pg_constraint`'ten
   okunur — `workshop`'a ileride bağlanacak tablolar kendiliğinden kapsanır.
3. Toplam > 0 → `409`, gövdede hangi tabloda kaç kayıt olduğu.
   Toplam = 0 → siler, `200`.

Satır yoksa `404`. Başka tenant'ın atölyesi RLS nedeniyle zaten görünmez,
o da `404` olur.

## Arayüz

### Liste — `/pes/workshops`

Arşiv anahtarı URL parametresi: `?arsiv=1`. Sayfa server component kalır,
filtre SQL'de yapılır, bağlantı paylaşılabilir. Varsayılan `WHERE is_active`;
anahtar açıkken filtre kalkar.

Başlık sayacı dashboard ile tutarlı: normalde "114 aktif atölye", arşiv
görünürken "114 aktif · 6 arşivde".

Yeni işlem sütunu:

- Aktif satırda **Arşivle**
- Arşivlenmiş satırda **Geri al**, satır soluk gösterilir

Arşivleme onay sormaz — geri alınabilir bir işlemde onay penceresi yalnızca
gürültü yapar.

Kalıcı silme listede yoktur. Nadir ve geri dönüşsüz; 114 satırlık tabloda
yanlış satıra tıklama riski gereksiz.

### Detay — `/pes/workshops/[id]`

İki buton: **Arşivle / Geri al** ve **Kalıcı Sil**.

Kalıcı Sil:

- Atölye boşsa: "Bu atölye kalıcı olarak silinecek. Bağlı hiçbir kaydı yok."
  + Onayla / Vazgeç. Kod yazdırma gibi ek sürtünme yok — kayıt boş, kaybedilecek
  bir şey yok.
- Doluysa: sunucu `409` döner, engelin sebebi listelenir ("Silinemez — 3 bant,
  12 yetenek kaydı bağlı. Bunun yerine arşivleyebilirsin.") ve arşivleme
  butonuna yönlendirir.

Silme başarılıysa listeye döner.

## Hata durumları

| durum | davranış |
|---|---|
| Bağlı kayıt var | `409` + tablo/sayı dökümü, silme yok |
| Atölye başkası tarafından silinmiş | `404` → "Bu atölye artık yok", listeye dön |
| Zaten arşivlenmişi arşivlemek | Sessizce geçer, hata değil |
| Oturum yok | `withTenantRoute` `/login`'e yönlendirir |
| Başka tenant'ın atölyesi | RLS satırı göstermez → `404` |

## Doğrulama

Projede API route ve veritabanı için test altyapısı yok; vitest testlerinin
tamamı `components/vsim` altındaki saf hesap motoru için. `scripts/verify_tenant_isolation.mjs`
deseni izlenir.

`scripts/verify_atolye_silme.mjs` gerçek veritabanına karşı çalışır ve şunları
kanıtlar:

1. Boş atölye silinir.
2. Bant eklenmiş atölye `409` verir ve **silinmeden durur**.
3. Arşivlenen atölye dashboard sayacından ve atölye seçicilerden düşer.
4. Geri alınca döner.
5. `pes_app` rolüyle başka tenant'ın atölyesi silinemez.

Betik kendi test atölyesini açar ve sonunda temizler; mevcut 114 kayda
dokunmaz.

Arayüz Playwright ile production'da gezilir: arşivle → listeden düşer,
anahtarı aç → görünür, geri al → döner, dolu atölyede sil → engel mesajı çıkar.

## Kapsam dışı

- Rol bazlı yetki ayrımı (teknik müdür / Yalın uzman ayrımı sonraya bırakıldı)
- Toplu arşivleme
- Silme/arşivleme geçmişi denetim kaydı — ana tablolarda `created_by` izi
  zaten yok, ayrı bir iş
