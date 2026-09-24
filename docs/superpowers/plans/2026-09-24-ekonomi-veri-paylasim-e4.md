# E4 — Veri toplama ve atölyeyle paylaşım (uygulama kaydı)

**Spec:** `docs/superpowers/specs/2026-09-24-ekonomi-veri-paylasim-e4-design.md`
**Dal:** `feat/ekonomi-veri-paylasim`
**Tarih:** 2026-09-24

## Yapılanlar

- [x] `040_ekonomi_veri_paylasim.sql` — RLS gevşetmesi, `source='atolye'`,
      `economy_data_request`
- [x] `041_ekonomi_tenant_onarimi.sql` — E0 import hatasının veri onarımı
- [x] `scripts/import_ekonomi_anket.mjs` — kiracı satır başına
- [x] `scripts/verify_tenant_uyumu.mjs` — kalıcı bekçi
- [x] `lib/pes/ekonomi-talep.ts` + testi (14 test)
- [x] `lib/pes/ekonomi-akran-ozet.ts` + testi (12 test)
- [x] `lib/pes/ekonomi-akran-sorgu.ts` — yükseltilmiş bağlam, sayı çıkışı
- [x] `/pes/ekonomi/talep` + API
- [x] `/workshop/ekonomi` + API
- [x] `/workshop/ekonomi/karne`
- [x] Sidebar bağlantıları (iç panel + atölye paneli)

## Yolda çıkan asıl iş — E4'ten önce gelen hata

E4'ün önkoşulunu doğrularken **E0'dan kalma bir veri bütünlüğü hatası**
bulundu ve E4'ten önce düzeltildi.

`import_ekonomi_anket.mjs` kiracıyı şöyle buluyordu:

```js
const atolyeler = await sql`SELECT id, code, name, tenant_id FROM workshop`
const tenantId = atolyeler[0]?.tenant_id
```

**Sırasız** bir sorgunun ilk satırının kiracısı alınıp bütün satırlara
yazılmış. 11 pilotun hepsi `default` kiracısında ama 33 ekonomi + 11 anket +
33 gider satırı `demo-atolye`'ye gitmiş. RLS kiracıya göre süzdüğü için
ekonomi ekranları **uygulamada herkese boş** görünüyordu:

| Kullanıcı | Gördüğü |
|---|---|
| `default` (10 kişi) | 131 atölye, **0 ekonomi satırı** |
| `demo-atolye` (2 kişi) | 33 satır ama alakasız 8 atölye |

**Neden aylarca görünmedi:** bütün doğrulamalar `DATABASE_URL` ile, yani
**BYPASSRLS** yönetici rolüyle yapılıyordu. Yönetici her satırı görür.
Doğrulama yönteminin kendisi kördü.

`verify_tenant_uyumu.mjs` bu dersi koda çeviriyor: bütünlüğü yönetici
gözüyle, **görünürlüğü uygulama rolüyle** kontrol ediyor. İkincisi asıl
önemlisi.

## Güvenlik kararları

**RLS ölçülü açıldı.** Yalnız `workshop_economy` ve yalnız **eşitlik**
şartıyla: `workshop_id = current_workshop_id()`. 035'in
`OR workshop_id IS NULL` kalıbı kullanılmadı — o kalıp NULL satırı her
atölyeye açar. Üstüne kolon `NOT NULL`, yani NULL satır hiç oluşamaz.

**`economy_param` okumaya açıldı, yazmaya kapalı.** Tek `FOR ALL` politikası
ayrıldı; bırakılsaydı atölye parametreyi değiştirip kendi karnesini
düzeltebilirdi. `economy_survey_staging` hiç açılmadı — başka atölyenin
beyanına giden tek kapı orası.

**Akran medyanı SQL'e yazılmadı.** 37 rasyoyu SQL'de tekrarlamak E2'de
uyarılan sürüklemenin ta kendisi olurdu. Bunun yerine tek noktada bilinçli
yetki yükseltmesi (`workshopId: null`) ve **yalnız sayı dizisi** dönen bir
fonksiyon.

**Diziler karıştırılıyor.** Sıra korunsaydı iki göstergenin dizileri yan
yana konarak tek tek atölyelerin profili geri kurulabilirdi.

**n < 5 ise kıyas yok.** Üç atölyelik grupta medyan rakibin rakamını ifşa
eder; ikisinde medyan zaten "öteki"dir.

## Doğrulama

- 1242 test / 69 dosya geçiyor · `tsc` temiz · build temiz, 5 yeni rota
- Canlı (işlem geri alınarak): atölye kendi satırını yazabiliyor, başka
  atölyeye yazamıyor, talep açamıyor
- Karne 11 atölyede n=11 ile çalışıyor; istatistik nesnesi hiçbir kimlik
  alanı taşımıyor (test bunu da doğruluyor)
- `verify_tenant_uyumu` 36/0 · `verify_workshop_isolation` 82/0 ·
  `verify_public_api` hepsi 401 · `verify_ekonomi` 132 kontrol / 0 sapma

## Karnenin ilk gerçek çıktısı

BAGİSAN başabaş için **217,71 TL** istemek zorunda; akran medyanı
**145,29 TL**. Marj, kişi başı ciro, dikim dakika cirosu ve adet/dikimci
göstergelerinin hepsinde son sırada. Atölyenin "farkında olmadan zarara
uğraması" tam olarak bu tabloydu.

## Kapsam dışı kalanlar

Talebin e-posta/SMS ile bildirimi (atölye panele girince görür). Gider
kaleminin form üzerinden girilmesi. Atölyenin başka atölyeyi görmesi —
hiçbir biçimde.
