# PES Wiki — Şema

PES projesinin LLM tarafından bakımı yapılan wiki'si. Desen: Karpathy "LLM Wiki"
(https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). Üst portföy wiki'si
`IDEAMD/_wiki/` aynı deseni kullanır; PES orada tek sayfadır (`projeler/work-pes.md`),
ayrıntı burada.

Sen (LLM) bu wiki'nin **disiplinli bakımcısısın**. İnsan kaynak seçer ve soru sorar; sen
okur, özetler, çapraz bağlar ve defteri tutarsın. Kod okurken öğrendiğin kalıcı bilgiyi
(neden böyle, nerede kırılır, hangi karar) buraya yazarsın ki bir sonraki oturum baştan
keşfetmesin.

## Üç katman

| Katman | Yer | Kural |
|---|---|---|
| **Ham kaynaklar** | `_wiki_PES/` dışındaki her şey: kök `*.md` vizyon belgeleri, `docs/` (rapor, spec, plan), `supabase/migrations/`, kod (`app/`, `lib/`), `git log` | Wiki işlemi sırasında **değiştirilmez**. Kod değişikliği ayrı iştir. |
| **Wiki** | `_wiki_PES/` | Tamamen senin. Sayfa oluştur, güncelle, birleştir. |
| **Şema** | `_wiki_PES/CLAUDE.md` (bu dosya) | Kurallar. İnsanla birlikte evrilir; değişince `log.md`'ye `sema` girdisi. |

Proje kuralları (dil, bileşenler, komutlar) `../CLAUDE.md`'dedir; burada tekrarlanmaz.

## Klasör yapısı

```
_wiki_PES/
├── CLAUDE.md        # şema (bu dosya)
├── index.md         # her sayfanın kataloğu — sorgularda İLK okunan dosya
├── log.md           # kronolojik, yalnız-ekleme günlüğü
├── genel-bakis.md   # PES'in büyük resmi (sentez)
├── moduller/        # ekran/özellik başına   → siparis-yerlestirme, olgunluk, gunluk-uretim
├── kavramlar/       # alan terimi ve hesap    → eder, dakika-maliyeti, ortak-kayit, rls
├── veri/            # tablo, görünüm, fonksiyon → v-atolye-denetim-durum, workshop
├── kararlar/        # verilmiş kararlar (ADR) → tarih-baslik: 2026-11-03-ortak-kayit
├── sentezler/       # sorgulardan doğan kalıcı cevaplar, incelemeler, dersler
├── _sablonlar/      # sayfa şablonları
└── _araclar/        # lint.py — mekanik sağlık kontrolü
```

Ayrım: **modül** = kullanıcının gördüğü ekran ve akış; **kavram** = ekrandan bağımsız alan
bilgisi ya da hesap; **veri** = veritabanı nesnesi; **karar** = alternatifler arasında
yapılmış seçim ve gerekçesi; **sentez** = bir sorunun ya da incelemenin cevabı.

## Sayfa kuralları

- Dosya adı: küçük harf, kebap-case, Türkçe karakter yok (`siparis-yerlestirme.md`).
  Veritabanı adında `_` → `-` (`v_atolye_denetim_durum` → `v-atolye-denetim-durum.md`).
- Bağlantı: Obsidian wiki-link `[[ortak-kayit]]`, `[[eder|EDER]]`. Olmayan sayfaya bağlantı
  serbesttir; yapılacak işaretidir.
- Ham kaynağa atıf: repo köküne göre yol, ters tırnakla → `` `lib/pes/atolye-profil.ts` ``,
  `` `supabase/migrations/055_*.sql` ``. Satır numarası yazma (kayar); fonksiyon adı yaz.
- Her sayfa YAML frontmatter ile başlar; şablonlar `_sablonlar/`.
- `kaynaklar:` alanına sayfanın dayandığı dosyaları yaz. Lint, bu dosyalardan biri sayfanın
  `guncelleme:` tarihinden yeniyse sayfayı **bayat** diye işaretler.
- `guncelleme:` her düzenlemede bugünün tarihi (YYYY-MM-DD).
- Belirsiz bilgi `(tahmin)`. Çelişkiyi silme; `> [!warning] Çelişki` bloğunda iki kaynağı göster.
- Dil: Türkçe, doğru karakterlerle. Teknik terimler orijinal kalabilir.

### Frontmatter

```yaml
tur: modul | kavram | veri | karar | sentez
guncelleme: 2026-11-09
kaynaklar: [app/pes/atolye-profil/page.tsx, lib/pes/atolye-profil.ts]
# modul:  panel: merkez | atolye | ikisi ; yol: /pes/atolye-profil
# veri:   cesit: tablo | gorunum | fonksiyon | tetikleyici ; migration: 055
# karar:  durum: gecerli | degisti | iptal ; tarih: 2026-11-03
```

## Gizlilik

Repo şirketin ticari verisini içerir. Wiki'ye **parola, anahtar, bağlantı dizesi, kişi
e-postası, atölye bazında maliyet/fiyat rakamı** kopyalanmaz. "Ne tür veri, nerede" yazılır.

## İşlemler

### 1. Ingest — "X'i wiki'ye işle" / bir spec, rapor, migration, modül
1. Kaynağı oku. Kod modülüyse sayfa + `lib/` + API + ilgili migration'ı birlikte oku.
2. Önemli bulguları insana kısaca söyle (toplu ingest'te sorma).
3. İlgili `moduller/`, `kavramlar/`, `veri/`, `kararlar/` sayfalarını oluştur/güncelle;
   karşılıklı bağlantıları ekle.
4. Yeni bilgi eskisiyle çelişiyorsa işaretle.
5. `index.md` ve `log.md` (`## [YYYY-MM-DD] ingest | <kaynak>`).

### 2. Query — "X nasıl hesaplanıyor?", "Y neden yavaş?"
1. Önce `index.md`, sonra ilgili sayfalar.
2. Gerekirse ham kaynağa in, doğrula; sayfa yanlışsa düzelt.
3. Cevabı sayfalara atıfla ver (`[[sayfa]]`).
4. Kalıcı değeri varsa `sentezler/` altına dosyala; `index.md` + `log.md` (`query | <soru>`).

### 3. Lint — "wiki'yi kontrol et"
1. `python _wiki_PES/_araclar/lint.py` (PES kökünden): yetim sayfa, index eksiği,
   bekleyen bağlantı, eksik `kaynaklar` dosyası, bayat sayfa.
2. Anlamsal kontrol: çelişki, doğrulanmamış `(tahmin)`, koddan sapmış iddia.
3. `log.md`: `## [YYYY-MM-DD] lint | <özet>`.

### 4. Kod işinden sonra (yan ürün ingest)
Bir özellik, düzeltme ya da inceleme bittiğinde, kalıcı bir ders çıktıysa (neden yavaştı,
hangi kural kırıldı, hangi karar alındı) ilgili sayfayı güncelle ve `log.md`'ye
`ingest | <commit/sürüm>` yaz. Commit'in kendisini tekrarlama; gerekçeyi yaz.

## log.md biçimi

Yalnız sona ekle. Başlık önekleri sabit (grep ile ayrıştırılır):

```
## [2026-11-09] ingest | v1.15.2 denetim görünümü
- oluşturuldu: sentezler/rls-gorunum-performansi.md
- güncellendi: veri/v-atolye-denetim-durum.md, index.md
```

Türler: `kurulum`, `ingest`, `query`, `lint`, `sema`.
