# MATRIS yetenek aktarımı ve yetenek arama

Tarih: 2026-07-23
Durum: tasarım onaylandı

## Sorun

Atölyelerin master genel-bilgi ve yetenek verisi
`bant_kapasite_formu_MATRIS_mevcut_durum (1).xlsx` dosyasında toplandı.
Önceki aktarımda (Klasman, `import-klasman.mjs` + migration 023b/023c) her
atölyenin **tek bandı** vardı ve o bandın yetenek matrisi işaretli değildi —
3019 yetenek kaydı tek banda yığılmıştı. Yeni master veride bant kırılımı
gerçek (ŞAHİNLER 1/2/3 ayrı bantlar) ve her bandın yetenek matrisi işaretli.

İki iş: (A) bu veriyi atölyelere ve bantlarına aktarmak, (B) yeteneğe göre
filtreleme yapılabilen bir arama alanı.

## Kaynak

Master sayfa: **`Bant Yetkinlik (Matris) (4)`** — 139 bant satırı, 111 atölye.
Yalnız bu sayfada gerçek bant kırılımı ve `BANT TÜRÜ` / `ANA TEDARİK` /
`2. TEDARİK` kolonları var. Eşleştirme **isimle** yapılır: `ATOLYE_ID`
(T914202…) dış numaradır, PES `workshop.code` (B001…) ile hiç tutmuyor.
Bkz. hafıza `pes-atolye-master-veri-kaynagi`.

## Katalog uyumu (ölçüldü)

Mevcut boyutlara tam oturanlar: Ana Grup 6/6, Kumaş Grubu 3/3, Cinsiyet 6/6,
Klasman 34/34, Kumaş Türü 31/31, Cep 5/5.

Yeni değer getiren mevcut boyutlar (14 değer):
- makine_parkuru: Punterez
- kol_turu: Truvakar Kol
- yaka_turu: Düğmeli Gömlek Yaka
- kalip_turu: Loose & Bol, Sigaret, Wideleg, Straight / Düz
- siluet: Flare, Jüpiter, Mars, Mercury, Balık Etek, Balon, Fırfırlı

Katalogda hiç olmayan iki yeni boyut:
- **kalite** (7): Premium Klasik, Standart Vision, Casual Trendy, Bebek/Çocuk,
  Geleneksel, Modest, Outlet
- **sezon** (4): Yıl Boyu, Yaz Ağırlıklı, Kış Ağırlıklı, Sezonluk-Esnek

Yetenek olmayan, bant düzeyi alanlar: BANT TÜRÜ (CMT/UKP/DİKİM/DİKİM-UKP/
KESİM-DİKİM), ANA TEDARİK, 2. TEDARİK, TIER, ÇALIŞAN_SAYISI, MAKİNE_SAYISI,
KAPASİTE_ADET_GÜN, MİN_SİPARİŞ_ADET, DOLULUK_%, GÖRÜŞÜLEN_KİŞİ, TARİH, NOT.

## Kararlar

- **Bant uzlaştırma: dosya esas.** Eşleşen atölyenin bantları dosyadaki
  BANT_ADI'ya göre yenilenir. Eşleşen bant SİLİNMEZ, güncellenir (üzerindeki
  üretim/iş emri korunur). Dosyada olmayan mevcut bant: üzerinde veri varsa
  arşivlenir (`is_active = false`), yoksa silinir. Dosyadaki yeni bant açılır.
- **Eksik 20 atölye yeni atölye olarak açılır** (`type = 'X'`), kuru çalışma
  raporunda ayrı listelenir.
- **Yetenek filtresi: yeni sayfa** `/pes/yetenek-arama`.
- **Seviye (proficiency) kapsam dışı:** 3019 kaydın tamamı seviye 1, dosya da
  seviye taşımıyor. Filtre koymak boş kutu olurdu.

## Faz A — şema ve aktarım

### Migration 027

- `capability_dimension`'a `kalite` ve `sezon` boyutları + 11 değeri
  (global katalog, `tenant_id = NULL`).
- Mevcut 5 boyuta 14 yeni değer (yukarıdaki liste).
- `production_line`'a bant düzeyi kolonlar: `bant_turu`, `makine_sayisi`,
  `min_siparis_adet`, `doluluk_pct`, `gorusulen_kisi`, `gorusme_tarihi`,
  `notlar`. Çalışan sayısı → mevcut `operator_count`, kapasite → `daily_target`.
- `bant_turu` için ayrı kolon: mevcut `line_type` yalnız `Normal/Küçük` —
  CMT/UKP/DİKİM farklı kavram, sığmaz (023c'de `workshop.type` ile aynı durum).
- İdempotent: `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`.

### Aktarım betiği `scripts/import-matris.mjs`

`import-klasman.mjs` desenini birebir izler:

- **Varsayılan kuru çalışma.** `--apply` verilmeden hiçbir şey yazmaz.
- **Sessiz veri uydurma yok:** katalogda karşılığı olmayan terim görülürse
  hiçbir şey yazmadan durur, eksik terimleri listeler. 027 sonrası beklenen
  "eksik yok"; kural yine kalır (dosya güncellenirse yeni terim gelebilir).
- **Bant uzlaştırma:** dosyadaki bantlar `BANT_ADI` üzerinden eşleştirilir
  (yukarıdaki karar). Bant `code` UNIQUE — kimlik oradan kurulur. Kod deseni
  `{atölye_kodu}-B{n}` (mevcut: `B001-B1`); yeni bant aynı deseni izler.
  Not: default tenant'ta bugün üretim kaydı olan bant SIFIR, yani
  "arşivle-yoksa-sil" fiilen hep "sil" — kural ileride üretim birikince
  anlam kazanır.
- **Yetenekler:** eşleşen bandın `attribute_type = 'PROFILE'` kayıtları silinir,
  dosyadan yeniden yazılır. `ASSIGNED` kayıtlarına dokunulmaz (elle atanmış;
  default tenant'ta bugün 0 ASSIGNED var, hepsi PROFILE — kural yine korunur).
  Dosyadaki `X` işareti seviye taşımaz → `proficiency = 1`.
- **Eksik 20 atölye** yeni açılır, raporda ayrı başlık.

Kuru çalışma raporu: kaç atölye açılacak, kaç bant açılacak/güncellenecek/
arşivlenecek, kaç yetenek kaydı silinip yazılacak, hangi terimler eksik.

**Kapı:** gerçek aktarım (`--apply`) yalnız kuru çalışma raporu kullanıcıya
gösterilip onaylandıktan sonra çalıştırılır.

## Faz B — Yetenek Arama sayfası

Rota `/pes/yetenek-arama`, menüde "Performans & Karşılaştırma" altında.

- **Filtre mantığı:** boyut içinde VEYA, boyutlar arası VE. `Klasman ∈ {Gömlek,
  Elbise} AND Kumaş Türü ∈ {Keten} AND Makine ∈ {Reçme}`.
- **Sonuç bant düzeyinde.** Bir atölye eşleşir çünkü EN AZ BİR bandı tüm
  koşulları birden sağlar (iki ayrı bandın koşulları paylaşması sayılmaz).
- **Sol panel: sayaçlı boyut listesi.** Her değerin yanında bant sayısı
  (`Keten (47)`). Seçim yapıldıkça daralır. Bu aynı zamanda "hangi alanlarda
  hangi yeteneklerimiz var" kapsam raporu — ayrı rapor sayfası gereksiz.
- **Durum URL'de:** `?klasman=gomlek,elbise&kumas_turu=keten`. Server component,
  sorgu SQL'de, link paylaşılabilir.
- **Kapsam dışı:** seviye filtresi (veri yok), Excel çıktısı (sonra).

## Faz sırası

A ve B bağımsız. B, A'nın verisine muhtaç ama koduna değil. Önce A bitirilir,
kuru çalışma raporu onaylanır, gerçek aktarım yapılır, sonra B'ye geçilir.

## Kapsam dışı

- İsim eşleşmeyen atölyelerde otomatik bulanık eşleştirme — yeni açılıyorlar.
- Seviye (proficiency) hem aktarımda hem aramada.
- Yetenek arama Excel dışa aktarımı.
