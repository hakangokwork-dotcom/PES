---
tur: index
guncelleme: 2026-11-10
---
# PES Wiki: İndeks

> Her sayfanın kataloğu. Sorgulara **önce buradan** başlanır. Kurallar [[CLAUDE]], büyük resim [[genel-bakis]], geçmiş [[log]].

## Sentezler
- [[genel-bakis]]: PES nedir, iki panel, temel kurallar, durum
- [[performans-dersleri]]: gezinme yavaşlığı (bölge, gidiş-dönüş) ve RLS altında görünüm tekrarı (v1.15.1–2)

## Kararlar
- [[2026-11-03-ortak-kayit]]: ortak kayıt, onay yok; `giren_*` ve 409 sürüm kontrolü
- [[2026-11-09-fason-win]]: canlı adres fason.win, bölge dub1, yayın akışı
- [[2026-11-10-tasarim-dili]]: sıcak fildişi zemin, kil vurgu, serif başlık; "iyi" durumu ayrı yeşil token

## Kavramlar
- [[rls-ve-kiracilik]]: pes_app rolü, oturum değişkenleri, kim neyi görür, `security_invoker` tuzağı

## Veri
- [[v-atolye-denetim-durum]]: atölye × denetim tipi son durum; doğrudan birleştirme, MATERIALIZED kullan

## Modüller
### Merkez (`/pes`)
- [[atolye-profil]]: Profil & Sosyal Uygunluk
- [[siparis-yerlestirme]] · [[olgunluk]] · [[ekonomi]] · [[yillik-plan]] · [[plan-tezgahi]] — sayfası yok

### Atölye (`/workshop`)
- [[atolye-panosu]] · [[gunluk-uretim]] — sayfası yok

## İşlenmeyi bekleyen ham kaynaklar
Ingest sırası (yukarıdan aşağı önerilir). İşlenen kaynak buradan silinir, `log.md`'ye yazılır.
- `docs/2026-11-02-panel-inceleme-raporu.md`, `docs/2026-11-03-veri-sahipligi-matrisi.md`, `docs/2026-11-07-gorsel-tasarim-firsatlari.md`
- `PES_HESAPLAMA_SOZLUGU.md` → kavramlar (EDER, dakika maliyeti, verimlilik…)
- `docs/superpowers/specs/` (19 spec) ve `plans/` (18 plan) → modüller ve kararlar
- `docs/provsm-ayirma-plani.md` → karar
- `PLATFORM_VISION_v3.md`, `MODULE_CATALOG.md`, `COMMERCIAL_ROADMAP.md` → genel bakış, ticari çerçeve
- `supabase/migrations/` (005→056) → veri sayfaları
