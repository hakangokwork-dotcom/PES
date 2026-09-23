# Atölye Ekonomi — E1 kalanı: Maliyet DNA'sı ve fiyat endeksi

Tarih: 2026-09-23
Durum: tasarım onaylandı, uygulama planı bekliyor
Önceki: `2026-09-15-atolye-ekonomi-e0-design.md`
Kaynak prototip: `C:\Users\bhaka\Desktop\WORK\Facilty_Expence\atolye-radar\src\data\rasyolar.json` (C ve D grupları)

---

## 1. Amaç

E1 iki turda yapılıyor. Birinci tur 2026-09-21'de main'e girdi: Rasyo Radarı
(5 bölüm), atölye karnesi ve klasman kıyası. Geriye iki şey kaldı:

- **Maliyet DNA'sı** — bir atölyenin parasının hangi gider grubuna gittiği,
  akranına göre nerede durduğu ve bunun adet başına ne ettiği.
- **Fiyat endeksi kıyası** — aynı bileşimin dönemler arasında nasıl kaydığı,
  enflasyondan arındırılmış olarak.

Bu iki iş aynı veriye bakıyor, bu yüzden tek spec ve tek tur.

Bittiğinde `/pes/ekonomi` altıncı bölümünü, `/pes/ekonomi/[id]` karnesi de
kendi DNA bloğunu kazanır; `price_index`'e endeks girildiği an reel kıyas
ek kod olmadan çalışır.

---

## 2. Bugünkü durum

Kod okundu ve canlı veritabanı sorgulandı (2026-09-23):

| Bulgu | Sonuç |
|---|---|
| Radarın 37 rasyosunda gider yapısı yok — yalnız `iscilikPayi` var | Prototipin C (gider payları) ve D (adet başı birim maliyetler) grupları PES'te hiç yok |
| `/pes/gider-panosu` G1–G8 grup paylarını yığılmış çubukla zaten gösteriyor | Gruplama yeniden tanımlanmayacak; view tek kaynak kalacak |
| `v_expense_groups` ve `v_expense_groups_real` view'ları mevcut | Reel (deflate edilmiş) değerleri view zaten hesaplıyor |
| `expense_group_index_map` sekiz grubu dört seriye bağlıyor (022d) | Deflatör eşlemesi hazır |
| **`price_index` tablosunda 0 satır var** | Bugün her `_real` kolonu NULL, `eksik_seri` = `ASGARI, TUFE, UFE, USDTRY` |
| `monthly_expense` 7 dönem: 2025-11, 2025-12, 2026-01, 2026-02, 2026-03, 2026-07, 2026-08 | Zaman şeridi gider tarafında mümkün |
| `workshop_economy` 3 dönem (2026-01…03), hepsi `source='turetilmis'` | Adet başı maliyet yalnız bu üç dönemde hesaplanabilir |
| `monthly_expense.needle` tamamen NULL | Forms iğne+ipliği `thread`'e yığıyor (bkz. `pes-gider-forms-ingestion` notu) |
| 2026-07 döneminde tek atölye var | O dönemde medyan ve sapma anlamsız |

---

## 3. Alınan kararlar

| Karar | Seçim | Gerekçe |
|---|---|---|
| DNA nerede yaşar | **Radara 6. bölüm + karneye blok** | Adet başı maliyet `qty_declared`'a bağlı; `gider-panosu` yalnız `monthly_expense` okuyor. Hesap ekonomi katmanına ait. `gider-panosu` beyan kalitesi ve ham dağılım ekranı olarak kalır. |
| Kalem kırılımı | **G1–G8 + 3 teşhis** | G1–G8 PES'in kanonik ekseni, DB view'ında hazır, `gider-panosu` ile aynı dili konuşur ve deflatör eşlemesini bedava getirir. Prototipin kendi gruplaması ikinci bir eksen doğururdu. |
| Modül sınırı | **Ayrı `lib/pes/ekonomi-dna.ts`** | `EkonomiRasyo` 37'de kalır, `verify_ekonomi.mjs`'in Excel karşılaştırması bozulmaz, karnenin "3 güçlü / 3 zayıf" seçimi 19 yeni adayla sulanmaz. |
| Gruplama kaynağı | **SQL view'ı, TypeScript değil** | G1–G8'i TS'te yeniden tanımlamak en büyük sessiz hata kaynağı olurdu: `gider-panosu` ile radar aynı atölye için farklı yüzde gösterirse hangisinin doğru olduğu bilinemez. |
| Endeks verisi | **Bu turda doldurulmaz** | Uydurulmuş TÜFE/kur rakamı tüm reel analizi sessizce bozar (022d'nin kendi notu). UI ve sorgu hazır edilir, veri `/pes/endeks`'ten elle girilir. |
| Şerit ağırlığı | **Ağırlıklı (Σgrup / Σbrüt)** | "Havuzun maliyet bileşimi" havuzun parasının nereye gittiğidir. Sapma tablosu ayrı soruyu sorar ve **medyan** (eşit ağırlık) kullanır. |
| Adet kaynağı | **`kullanilanAdet()`** | E0'da karara bağlandı: PES üretim kaydı varsa o, yoksa beyan; kaynak ekranda işaretli. Yeni kural yazılmaz. |
| Hesaplanamayan değer | **`null`, `0` değil** | E0 kuralı korunur: `0` "hesaplandı ve sıfır çıktı", `null` "hesaplanamadı". Ekranda `—`. |

---

## 4. Göstergeler — 19 adet

### 4.1 Grup payı (8) — birim %

`g{n} / toplam_brut`. Teşvik paya girmez (gider değil, mahsup kalemi).

`g1_iscilik`, `g2_personel_yan`, `g3_enerji`, `g4_mekan`, `g5_makine`,
`g6_sarf`, `g7_dis_hizmet`, `g8_diger`.

Yön: hepsi **nötr**. Yüksek enerji payı tek başına kötü değildir — bağlam
gösterir. Bu yüzden DNA göstergeleri sıralamaya ve karnenin güçlü/zayıf
seçimine girmez.

### 4.2 Grup adet başı (8) — birim TL/adet

`g{n} / kullanilanAdet()`. Adet yoksa hepsi `null`.

Yön: **düşük-iyi**, ama yine sıralamaya girmez (bkz. 4.1 gerekçesi); sapma
tablosunda işaret olarak kullanılır.

### 4.3 Teşhis (3)

| Gösterge | Formül | Neden |
|---|---|---|
| Fazla mesai / maaş | `overtime / personnel` | Kapasite baskısı sinyali; grup payı bunu gizler (ikisi de G1'de) |
| Adet başı iğne-iplik | `(thread ?? 0) + (needle ?? 0)` ÷ adet, ikisi de null ise `null` | G6 "sarf" payı yüksek çıkınca iğne-iplik mi UKP mi ayırt eder |
| Adet başı nakliye | `cargo / adet` | G7 içinde kaybolur; lojistik farkı atölyeler arasında büyük |

---

## 5. Mimari

### 5.1 Veri katmanı — `lib/pes/ekonomi-dna-sorgu.ts`

İki sorgu, ikisi de `withServerTenant` içinden çalışır.

**Sorgu A — şerit (tüm dönemler).** `v_expense_groups_real`'den dönem başına
atölye üstü toplam:

```
donem, count(*) AS n,
sum(g1..g8), sum(g1_real..g8_real),
sum(toplam_brut), sum(toplam_brut_real),
bool_or(eksik_seri IS NOT NULL) AS endeks_eksik
GROUP BY donem ORDER BY donem
```

Ayrıca her dönem için atölye kimliklerinin kümesi (kadro değişimi işareti için).

**Sorgu B — sapma tablosu (seçili dönem).** Atölye satırları:

- `v_expense_groups_real` → `g1..g8`, `g1_real..g8_real`, `toplam_brut`,
  `toplam_brut_real`, `eksik_seri`
- `monthly_expense` → `overtime`, `personnel`, `thread`, `needle`, `cargo`
- `workshop_economy` → `qty_declared` ve `source` (+ PES üretim adedi,
  `kullanilanAdet` için)
- `workshop` → `name`, `code`

`v_expense_groups`'ta `donem` kolonu **yoktur** (yalnız `year`, `month`);
`v_expense_groups_real`'de vardır. İki sorgu da `_real` view'ını kullanır.

### 5.2 Hesap — `lib/pes/ekonomi-dna.ts`

Saf fonksiyonlar, `EkonomiRasyo`'dan bağımsız. Bölme `ekonomi-hesap.ts`'in
`bol()`'ü ile null-güvenli, medyan `ekonomi-akran.ts`'in `medyan()`'ı ile.

```ts
export type DnaGrup =
  | 'g1_iscilik' | 'g2_personel_yan' | 'g3_enerji'     | 'g4_mekan'
  | 'g5_makine'  | 'g6_sarf'         | 'g7_dis_hizmet' | 'g8_diger'

export type DnaTeshis = 'fazlaMesaiMaas' | 'adetBasiIgneIplik' | 'adetBasiNakliye'

export type DnaMod = 'nominal' | 'reel'

export type DnaGirdi = {
  workshopId: number
  ad: string
  gruplar:      Record<DnaGrup, number | null>
  gruplarReel:  Record<DnaGrup, number | null>
  toplamBrut:     number | null
  toplamBrutReel: number | null
  eksikSeri: string | null
  adet: number | null            // kullanilanAdet() çıktısı
  adetTuretilmis: boolean        // workshop_economy.source === 'turetilmis'
  overtime: number | null
  personnel: number | null
  thread: number | null
  needle: number | null
  cargo: number | null
}

export type DnaSonuc = {
  pay:      Record<DnaGrup, number | null>   // 0–1
  adetBasi: Record<DnaGrup, number | null>   // TL/adet
  teshis:   Record<DnaTeshis, number | null>
}

/** Şeridin bir dönemi — Sorgu A'nın bir satırı. */
export type DonemGirdi = {
  donem: string                  // 'YYYY-MM'
  n: number                      // o dönemde veri veren atölye sayısı
  workshopIds: number[]          // kadro değişimi ayracı için
  gruplar:     Record<DnaGrup, number | null>   // atölye üstü toplam
  gruplarReel: Record<DnaGrup, number | null>
  toplamBrut:     number | null
  toplamBrutReel: number | null
  adetToplam: number | null      // 'adet başı' görünümü için; yoksa null
}

export type HavuzDonem = {
  donem: string
  n: number
  kadroDegisti: boolean          // bir önceki döneme göre atölye kümesi farklı
  zayif: boolean                 // n < 3 — gri gösterilir, sapmaya girmez
  pay:      Record<DnaGrup, number | null>
  adetBasi: Record<DnaGrup, number | null>
}

export type SapmaSatiri = {
  workshopId: number
  ad: string
  sonuc: DnaSonuc
  /** pay − medyanPay, yüzde puanı. */
  paySapma:      Record<DnaGrup, number | null>
  /** adetBasi − medyanAdetBasi, TL/adet. */
  adetBasiSapma: Record<DnaGrup, number | null>
  adetTuretilmis: boolean
}

export function dnaHesapla(g: DnaGirdi, mod: DnaMod): DnaSonuc
export function havuzBilesimi(donemler: DonemGirdi[], mod: DnaMod): HavuzDonem[]
export function sapmaTablosu(satirlar: DnaGirdi[], mod: DnaMod): SapmaSatiri[]
```

`mod === 'reel'` ve `toplamBrutReel === null` ise `dnaHesapla` tüm alanları
`null` döndürür — kısmi reel sonuç üretilmez. Teşhis göstergeleri
`monthly_expense`'in ham kalemlerinden gelir ve deflate **edilmez**; reel
modda da nominal değerleriyle gösterilir ve arayüzde bu işaretlenir.

`sapmaTablosu` her grup için havuz medyanını alır ve her atölyenin farkını
**yüzde puanı** olarak verir (`pay − medyanPay`). Adet başı için fark
TL/adet cinsindendir.

### 5.3 UI — radar 6. bölüm

Yeni `app/pes/ekonomi/BolumMaliyetDnasi.tsx`, `RadarClient`'a altıncı bölüm
olarak eklenir. Hesap `page.tsx`'te (server) yapılır, bileşen hazır veri alır —
mevcut beş bölümün kalıbı budur.

```
MALİYET DNA'SI      [Nominal | Reel (pasif)]  endeks girilmemiş

Havuz bileşimi — 7 dönem  (ağırlıklı)      [pay % | adet başı TL]
       11.25 12.25 : 01.26 02.26 03.26 : 07.26 08.26
  G1   █████ █████   ██████ ██████ ██████   ....  ██████
  ...
       n=8   n=8     n=19   n=11   n=11     n=1   n=11

Atölye × grup — medyandan sapma (puan)
            G1    G2    G3    G4    G5    G6   G7   G8
  BESE     +4,2  -1,1  +0,3  -2,0  +0,1 -1,4 -0,2 +0,1
  ...  (satıra tıkla → /pes/ekonomi/[id])
```

- `:` ayraç = ardışık dönemlerin atölye kümesi farklı (kadro değişti).
- `n < 3` olan dönem gri gösterilir ve sapma tablosuna girmez.
- "adet başı TL" görünümünde `workshop_economy` olmayan dönem `—`.
- `source='turetilmis'` satır E0'daki gibi gri.

### 5.4 UI — karne bloğu

`/pes/ekonomi/[id]` sayfasına "Maliyet DNA'sı" bloğu: atölyenin 8 payı akran
medyanı çizgisiyle, yanında adet başı TL ve 3 teşhis göstergesi, altında kendi
7 dönemlik şeridi. Aynı `ekonomi-dna.ts` fonksiyonlarını çağırır.

### 5.5 Reel/nominal anahtarı

`eksik_seri` doluysa **Reel** seçeneği pasif; üstünde eksik seriler yazılı ve
`/pes/endeks`'e bağlantı verir. Endeks girildiği an ek kod olmadan çalışır.

Her grup kendi serisiyle deflate olduğu için reel paylar nominalden **farklıdır**
(işçilik asgari ücretle, enerji kurla, sarf ÜFE ile). Bu bir hata değil,
bölümün asıl bulgusudur — arayüzde bir satırla açıklanır.

---

## 6. Test — `lib/pes/ekonomi-dna.test.ts`

Vitest, mevcut `ekonomi-*.test.ts` kalıbında.

| Durum | Beklenen |
|---|---|
| Tam girdi | 8 pay toplamı 1 ± 0,001 |
| `toplamBrut = 0` | Tüm paylar `null` (0'a bölme değil) |
| Bir grup 0 TL | Payı `0`, `null` değil |
| `adet = null` | 8 adet başı ve 2 adet başı teşhis `null`, paylar dolu |
| `mod='reel'`, `toplamBrutReel = null` | `pay` ve `adetBasi`'nın tamamı `null` |
| `mod='reel'` | `teshis` nominal değerleriyle döner (deflate edilmez) |
| `thread` ve `needle` ikisi de null | `adetBasiIgneIplik = null` (0 değil) |
| `needle` null, `thread` dolu | `thread` üzerinden hesaplanır |
| `personnel = 0` | `fazlaMesaiMaas = null` |
| Sapma, tek atölye (n=1) | Dönem sapma tablosundan elenir |
| Sapma işareti | Medyan üstü `+`, altı `−` |

---

## 7. Kapsam dışı

- **Endeks değerlerini doldurmak.** 2025-11…2026-08 için TÜFE/ÜFE/USDTRY/Asgari
  toplanması ayrı bir veri işi; entegrasyon planında bekleyen dış girdiler
  arasında zaten duruyor.
- DNA göstergelerini rasyo gezginine ve ısı haritasına eklemek (bilerek — o iki
  bölüm 37 rasyonun sıralanabilir evreni, DNA nötr göstergelerden oluşuyor).
- Klasman kırılımlı DNA — atölye seviyesinde tek gider var, klasman ayrıştırması
  E3'ün model katmanını bekler (E0 kararı).
- `monthly_expense.needle`'ı Forms importundan ayırmak.

---

## 8. Riskler

| Risk | Etki | Karşılık |
|---|---|---|
| Şeritteki kadro her dönem değişiyor | Bileşim kaydı sanılır, oysa küme değişti | Dönem başına `n`, küme değişiminde ayraç |
| 2026-07'de n=1 | Medyan ve sapma anlamsız | `n < 3` dönem gri, sapmaya girmez |
| `workshop_economy` 3 dönem ve türetilmiş | Adet başı seri kısa ve zayıf | Pay (%) 7 dönemde çalışır; adet başı olmayan dönem `—`, türetilmiş satır gri |
| Endeks hiç girilmezse reel hiç açılmaz | Bölümün yarısı ölü kod gibi görünür | Pasif anahtar eksik serileri yazar ve giriş ekranına bağlar — boşluk görünür ve giderilebilir olur |
| View ile TS arasında gruplama kayması | `gider-panosu` ≠ radar | Gruplama TS'e kopyalanmıyor; `DnaGrup` yalnız view kolon adlarının tip karşılığı |
| Reel paylar nominalden farklı çıkınca hata sanılır | Güven kaybı | Arayüzde tek satır açıklama: her grup kendi serisiyle deflate ediliyor |
