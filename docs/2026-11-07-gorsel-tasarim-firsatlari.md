# Görsel tasarım fırsatları — atölye ve merkez paneli

**Durum:** Koddan inceleme (2026-11-07). Canlı ekran görüntüsü alınmadı, oturum kapalıydı; "doğrulanmalı" maddeleri ekranla kontrol edilecek.
**Doğrulanan bulgular:** `faint` kontrastı, eşik çelişkisi, devir oranı formülü, Geist alt kümesi.

## Teşhis

Tasarım sisteminin temeli sağlam: token'lar, `lib/ui/tone.ts`, `components/ui` (`Field`, `Button`, `Toast`, `TabloSarmal`) ve 44 px dokunma kuralı yerinde. Sorun, bu parçaların az kullanılması:

- 77 sayfadan 9'u `PageHeader`, 6 dosya `Card` kullanıyor.
- 66 dosyada kart elle yazılmış (`rounded-xl`), 62 dosyada başlık elle yazılmış (`<h1>`).

En zayıf görünüm atölyenin veri giriş ekranlarında. Bu ekranları tablet kullanan ve dijital okuryazarlığı düşük kişiler kullanıyor.

## Fırsatlar (etki / çaba sırasıyla)

| # | Fırsat | Kanıt | Öneri | Etki | Çaba | Panel |
|---|---|---|---|---|---|---|
| 1 | Giriş ekranlarındaki eşikler `tone.ts` ile çelişiyor | `workshop/production/page.tsx:133` 90/70 (`tone`: 90/75); `quality:241` 95/90 (`fpqTone`: 97/93); `workforce:74` eşikler sayfada sabit | `effTone`/`fpqTone` + `TONE_TEXT`; hedef metni eşikten üretilsin | Y | S | Atölye |
| 2 | `faint` kontrastı 3,64:1 (WCAG AA için 4,5 gerekir) | `globals.css:31` `#7A8894`; etiket, yardım ve tablo başlığı bu renkte | `#646F7B` → 5,12:1; tek satır | Y | S | İki panel |
| 3 | Form etiketleri alana bağlı değil, kayıt geri bildirimi zayıf | `htmlFor` yalnız login'de; hata yeşil kutuda (`production:80`); `quality:197` başarısız kayıtta sessiz | `Field`'a `useId` + `htmlFor`/`aria-describedby`; atölye formları `Field` + `Button loading` + `useToast` | Y | M | Atölye |
| 4 | Durum yalnız renkle anlatılıyor | "Dikkat gerektirenler" (`app/pes/page.tsx:199`); seviye rozetinde yalnız rakam, seviye 2 nötr (`SurecSeviyeListesi.tsx`) | İkon + kelime ("Kritik", "Uyarı"); "0 Yok … 3 Mükemmel" | Y | S | İki panel |
| 5 | Atölye panosunda birincil eylem yok | 8 KPI eşit ağırlıkta; hızlı erişimde "Günlük Üretim" yok; "H: G:" kısaltmaları | En üstte "Bugünkü üretimi gir"; `Metric` kartları; açık etiketler | Y | M | Atölye |
| 6 | Türkçe sayı biçimi karışık | 35 dosyada `toFixed`: "0.85 TL" ile "1.234" yan yana; "1.23M TL"; hem '—' hem '---' | `formatlayici.ts` → `lib/ui/sayi.ts` (Intl `tr-TR`); rakamlara `num` | Y | M | İki panel |
| 7 | Tablolar telefonda taşıyor | 50 tablolu dosyanın 16'sında kaydırma sarmalı yok; `workshop/production` 6 sütun | `TabloSarmal` + `min-w`; üretim girişinde telefonda bant başına kart | Y | S | Atölye |
| 8 | Kalan ham renkler, ASCII durum etiketleri | `downtime:93`, `is-emri:51`, `Tezgah.tsx`, `BolumIsiHaritasi.tsx`; ekranda "Planlandi", "Tamamlandi" | Token + `TONE_BADGE`; durum anahtarı ile ekrandaki etiket ayrılsın | O | S | Çoğu atölye |
| 9 | İki panel birbirinden ayırt edilmiyor | Aynı logo; "atölye adına" uyarısı 11 px, soluk (`WorkshopSidebar.tsx:368`), mobilde gizli | Kalıcı `warn-soft` şerit + "Merkeze dön"; merkez logosuna farklı zemin | Y | S | İki panel |
| 10 | Renk süs olarak kullanılıyor | "Toplam Duruş" her zaman kırmızı, "Ortalama" her zaman sarı (`downtime:61-63`); red oranı sabit kırmızı | Eşik yoksa nötr | O | S | Atölye |
| 11 | Sayfa iskeleti tutarsız | Elle `h1` + "← Panel"; köşe yarıçapı hem `rounded-lg` hem `rounded-xl`; dolgu p-4/5/6 | Her sayfada `PageHeader crumbs` + `Card` | O | L | İki panel |
| 12 | Erişilebilirlik nitelikleri eksik | `Toast`'ta `aria-live` yok; segment düğmesinde `aria-pressed`, menüde `aria-expanded`/`aria-current` yok | Nitelikler eklensin | O | S | İki panel |
| 13 | Yükleniyor ve hata ekranı yok | `loading.tsx`/`error.tsx` yok; istek düşerse `profile:208`'deki "Yükleniyor..." takılı kalıyor | `app/workshop/{loading,error}.tsx`; `EmptyState` | O | S | Atölye |
| 14 | Dönem seçimi zayıf | Yıl sabit 2025/2026 (2027 seçilemiyor); aylar sayıyla | `DonemBar` ya da ay adlı `Select` | O | S | Atölye |
| 15 | Tarayıcının kendi `alert`/`confirm` pencereleri | 15 dosyada; `is-emri` 4 yerde | `Field error`, `toast.error`, tek bir onay diyaloğu | O | M | İki panel |

**Tasarım dışı ama ekranda çelişki:** İşgücü devir oranı panoda `ayrılan / toplam` (`workshop/page.tsx:93`), giriş ekranında `(ayrılan + başlayan) / 2 / toplam` (`workforce/page.tsx:43`) ile hesaplanıyor. Aynı ay iki farklı oran gösteriyor. CLAUDE.md'ye göre hesap veritabanı görünümünde tek bir yerde yapılmalı.

**Yazı tipi:** Ana yazı tipi Geist yalnız `latin` alt kümesiyle yükleniyor (`app/layout.tsx:8,13`). Diğer yazı tiplerinde `latin-ext` var. ş, ğ ve İ harfleri başka bir yedek yazı tipiyle çizilebilir; doğrulanmalı.

## Önce yapılacak üç iş

1. **PR-1 Durum dili** (1, 2, 4, 8, 10 + Geist `latin-ext`). Davranış değişmez; renk ve etiket ekranın her yerinde tutarlı olur.
2. **PR-2 Atölye formları** (3, 7, 14 ve 11'in atölye kısmı). Üretim, kalite, işgücü, duruş ve gider ekranları ortak bileşenlerle yeniden yazılır.
3. **PR-3 Atölye panosu** (5, 6, 9). Birincil eylem, `Metric` kartları, `lib/ui/sayi.ts` ve "atölye adına" şeridi.

## Ekranla doğrulanacaklar

- `workshop/production` tablosu 375 px ve 768 px genişlikte taşıyor mu?
- Dar telefonda `text-3xl` KPI değerleri sığıyor mu?
- Dokunmatik ekranda 44 px'e büyüyen düğmeler satırları bozuyor mu?
- Merkez kenar çubuğu çekmeceye dönmüyor; merkez paneli tablette kullanılabilir mi?
- Geist ile Türkçe karakterler ilk karede doğru görünüyor mu?
