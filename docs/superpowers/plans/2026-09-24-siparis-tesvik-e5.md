# E5 — Sipariş ve teşvik simülatörü (uygulama kaydı)

**Spec:** `docs/superpowers/specs/2026-09-24-siparis-tesvik-e5-design.md`
**Dal:** `feat/siparis-tesvik-simulatoru`
**Tarih:** 2026-09-24

## Yapılanlar

- [x] `lib/pes/siparis-senaryo.ts` + testi (22 test)
- [x] `lib/pes/tesvik.ts` + testi (15 test)
- [x] `042_uretim_parametreleri.sql` — atölye bazlı değişim/öğrenme
- [x] `/pes/siparis-simulasyon` + sidebar bağlantısı

## Yolda bulunan modelleme hatası

İlk sürümde `bantSayisi` **kapasiteyi çarpıyordu**:

```ts
const gunlukToplam = g.gunlukKapasiteDk * bant   // YANLIŞ
```

Gerçek veriyle çalıştırınca simülatör "3 banda böl, 55,6 gün **18,6 güne**
insin, maliyeti 25.205 TL" dedi. Bu olamaz: BAGİSAN'ın 53 dikimcisi var;
onları üç banda bölmek üç katı insan yaratmaz — aynı kişiler.

Düzeltildi. Bant bölmenin tek etkisi **kurulum kaybını katlamak**. Süreyi
gerçekten kısaltan iki şey var ve ikisi de artık ayrı girdi:

- **kapasite payı** — siparişe atölyenin ne kadarı ayrılmış (sıra atlama)
- **ek günlük dakika** — mesai / ek vardiya

Hata yalnız kod okuyarak değil, **canlı veriyle çalıştırıp sonucun
inandırıcılığına bakarak** bulundu. Test yazarken de gözden kaçmıştı,
çünkü test "4 bant 1 banttan hızlı olmalı" diye yanlış şeyi doğruluyordu.

## Sonuçlar — gerçek veriyle

Model: *Erkek 5 Cep Denim Jean*, dikim 1.241 sn → 31,82 dk/adet.
Atölye: **BAGİSAN**, 53 dikimci, 28.620 dk/gün, 4,52 TL/dk.

### Soru 1 — 50.000 tek parti mı, 10 × 5.000 mi?

| Parti | Kayıp | Kayıp payı | Süre | Birim maliyet |
|---|---|---|---|---|
| 1 | 599 dk | %0,04 | 55,6 gün | 143,96 ₺ |
| 10 | 5.987 dk | %0,37 | 55,8 gün | 144,44 ₺ |
| 50 | 29.935 dk | %1,85 | 56,6 gün | 146,61 ₺ |

**Fark yalnız %0,34** (24.368 TL / 7,2 M TL). Sezgiye aykırı ama doğru:
50.000 adet × 31,82 dk = 1,59 milyon dakikanın yanında 10 kurulumun 800
dakikası önemsiz kalıyor.

**Ama ürün hızlanınca tablo tersine dönüyor.** Aynı hesap 2 dk/adet'lik
bir üründe ve 5.000 adetlik siparişte:

| Parti | Kayıp payı | Birim maliyet |
|---|---|---|
| 1 | %1,1 | 9,15 ₺ |
| 10 | %10,1 | 10,06 ₺ |

**Fark %10,02 — otuz kat büyük.** Asıl cevap bu: parti büyüklüğü
tartışması **yavaş ürün + büyük siparişte önemsiz, hızlı ürün + küçük
siparişte kritik**. Tek bir "partileri birleştirin" kuralı yanlış olur.

### Soru 4 — fast-track adil primi

Normal (kapasitenin %40'ı ayrılmış): **139 gün**.
Fast-track (%100 pay + %20 mesai): **46,4 gün**.

| Kalem | Tutar |
|---|---|
| Ek bant dakikası (1.796 dk) | 8.123 ₺ |
| Mesai zammı | 600.495 ₺ |
| Öteleme | 362 ₺ |
| **Toplam ek maliyet** | **608.979 ₺** |
| **Adil prim** | **14,01 ₺/adet — %9,7** |

Maliyetin neredeyse tamamı **mesai zammından** geliyor, kurulumdan değil.
Pazarlık artık "%15 isteyin, %8 verelim"den çıkıp "bu iş sana 609 bin TL'ye
mal oluyor"a dönüyor.

## Doğrulama

- 37 yeni test; `tsc` temiz; build temiz, `/pes/siparis-simulasyon` derleniyor
- `verify_tenant_uyumu` 36/0 · `verify_public_api` (042 tablosu eklendi)

## Kapsam dışı

Gerçek model değişim ölçümü toplamak (E4'ün talep mekanizması hazır, ayrı
iş). Öğrenme eğrisinin gerçek veriyle kalibrasyonu. Çok modelli / çok
atölyeli portföy optimizasyonu.
