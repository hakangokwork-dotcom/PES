# E5 — Sipariş ve teşvik simülatörü (tasarım)

**Tarih:** 2026-09-24
**Durum:** tasarım
**Öncül:** E0 (dakika maliyeti), E3 (bülten → SAM), E4 (veri toplama)

## Cevaplanacak sorular

Kullanıcının ilk mesajından, kelimesi kelimesine:

1. *"50000 adet bir sipariş ile 5000'er bin adet 10 sipariş diktirmenin
   atölyenin genel kapasitesine etkisi"*
2. *"model değişim sürelerinin atölye çıktısına etkileri"*
3. *"mtm değişimi ile atölye çıktı arasındaki ilişki"*
4. *"özellikle fast track siparişlerde atölyelere nasıl bir incentive
   yapısı kuracağımız"*

## Dürüstlük şartı — bu parça ötekilerden farklı

E0–E4 "Excel'i PES'e taşı" işiydi; sayıların kaynağı belliydi. **E5'in
dayanacağı ölçüm YOK.**

- `changeover_record`: 45 satır, **hepsi `demo-atolye` kiracısında**,
  atölyeler FA-01…FA-08 — `_seed_demo_data.mjs` çıktısı
- `downtime_record` (71) ve `monthly_production` (69): aynı, demo
- `work_order_gunluk_uretim`: **0 satır**
- Gerçek iş emri: **1**

Gerçek olan yalnız E0'ın atölyeye özel dakika maliyetleri ve E3'ün MTM
süreleri. Değişim süresi ve öğrenme eğrisi **varsayımdır** ve ekranda
varsayım olarak görünecek — E0'ın beyan/ölçüm ayrımının aynısı.

Kullanıcı kararı (2026-09-24): değişim süresi **parametre olarak, atölye
bazında düzenlenebilir**. Ölçüm toplama şimdilik yok.

## Model

Girdi: bülten (E3 → bölüm SAM), atölye (E0 → dakika maliyeti, dikim kadrosu),
toplam adet, parti sayısı.

```
kararlı birim dakika  t_s = SAM_dikim / verimlilik
dikim dakikası        = adet × t_s
değişim kaybı         = parti sayısı × değişim_dk
öğrenme kaybı         = parti sayısı × parti_başı_öğrenme_kaybı(parti adedi)
toplam bant dakikası  = dikim + değişim + öğrenme
günlük kapasite       = dikim kişi × günlük dakika
süre (gün)            = toplam bant dakikası ÷ günlük kapasite
maliyet               = toplam bant dakikası × dikim dk maliyeti
```

**Kayıp PARTİ BAŞINADIR** — 50.000'i tek partide dikmekle 10 partide
dikmek arasındaki farkın tamamı buradan çıkar. Soru 1'in cevabı bu.

### Öğrenme eğrisi — Wright yasası

Birim süresi kümülatif adetle düşer: `t_n = t_1 × n^(-b)`, `b = -log2(LR)`.

İki parametre, ikisi de anlamlı ve düzenlenebilir:
- `ogrenme_orani` (LR) — katlanan adette birim sürenin oranı (varsayılan 0,90)
- `ilk_birim_carpani` — ilk birim kararlı hızın kaç katı (varsayılan 2,0)

**Birim süresi kararlı hızın ALTINA İNEMEZ.** `t_n = max(t_s, ...)` şart;
aksi halde büyük partilerde öğrenme kaybı negatife döner ve simülatör
"parti ne kadar büyükse o kadar bedava" der. Öğrenme sonsuza kadar sürmez.

Kayıp = `Σ (t_n − t_s)`, yalnız kararlı hıza ulaşılana kadar.

## Fast-track

Kullanıcı kararı: fast-track üç şeyi birden içerir — **sırayı atlar**,
**mesaiyle sıkıştırılır**, **parti bölünüp birden fazla banda dağıtılır**.

Üçünün de maliyeti hesaplanabilir:

| Kaynak | Hesap |
|---|---|
| Sıra atlama | Ötelenen işin ek değişim maliyeti + gecikme |
| Mesai | Ek dakika × mesai zammı |
| Bant bölme | Her bant ayrı değişim + ayrı öğrenme eğrisi → kayıp **katlanır** |

## Teşvik — asıl katkı burada

Adil prim keyfi bir yüzde değil, **atölyenin uğradığı ölçülebilir kaybın
karşılığıdır**. PES bu kaybı zaten hesaplayabiliyor:

```
fast-track ek maliyeti = (fast-track toplam dakika − normal toplam dakika)
                         × dikim dk maliyeti
                       + mesai zammı
                       + ötelenen işin kaybı

adil prim (TL/adet)    = ek maliyet ÷ adet
                       + hedef marj payı
```

Kullanıcının kullanabileceği kaldıraçlar (2026-09-24 kararı):
**birim fiyat primi**, **garantili hacim**, **gecikme kesintisi**.
Erken ödeme kapsam dışı.

Garantili hacim parasal karşılığa çevrilir: boş gün riskinin azalması.
E0 zaten boş gün düzeltmesi tutuyor — aynı katsayı kullanılır.

## MTM değişimi ↔ çıktı (soru 3)

Doğrudan: `çıktı = kapasite ÷ t_s`. SAM %10 düşerse çıktı %11,1 artar
(1/0,9). Simülatör bunu duyarlılık olarak gösterir; ayrı model gerekmez.

## Ölçüt

- 1×50.000 ile 10×5.000 yan yana, fark TL ve gün olarak
- Parti sayısı arttıkça kaybın **doğrusal** arttığı görünüyor
- Öğrenme kaybı büyük partide **negatife dönmüyor**
- Fast-track primi, hesaplanan ek maliyetten türüyor; elle girilen bir
  yüzde değil
- Varsayım olan her sayı ekranda varsayım olarak işaretli
