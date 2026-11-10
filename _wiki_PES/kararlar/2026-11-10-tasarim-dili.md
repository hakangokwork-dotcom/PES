---
tur: karar
durum: gecerli
tarih: 2026-11-10
guncelleme: 2026-11-10
kaynaklar: [app/globals.css, lib/ui/tone.ts, components/ui/Card.tsx, components/ui/PageHeader.tsx, components/pes/SidebarParts.tsx]
---
# Tasarım dili: sıcak fildişi, kil vurgu, serif başlık

## Bağlam
Ekranlar "Word belgesi gibi" bulundu: soğuk gri-beyaz zemin, düz kutular, her şey aynı ağırlıkta. Kullanıcı Claude arayüzünün dilini istedi.

## Karar
- **Zemin** sıcak fildişi (`canvas`), kenar çubuğu bir ton koyu (`sidebar`), kartlar beyaz, yumuşak köşe (`rounded-xl`) ve çok hafif gölge.
- **Vurgu** kil rengi (`accent`): birincil düğme, aktif menü ikonu, bağlantı, logo.
- **"İyi" durumu vurgudan ayrıldı**: yeni `ok`, `ok-soft`, `ok-ink` token'ları (yeşil). Eskiden yeşil hem marka hem "iyi" idi; kil renge geçince olumlu değer turuncu görünürdü. Sayfalardaki `accent-soft` / `accent-ink` kullanımları (olumlu marj, hedefte, kaydedildi) `ok-*`'a taşındı.
- **Başlıklar serif** (Source Serif 4, `font-serif`): `main` içindeki h1–h3 taban kuralıyla; VSIM hariç. Büyük metrik sayıları da serif.
- `.num` artık mono yazı tipi değil, yalnız `tabular-nums`.
- Grafik renkleri `lib/ui/tone.ts`'te (recharts CSS değişkeni okumuyor); `globals.css` ile birlikte değişir.

## Seçilmeyenler
- Koyu tema: istenmedi.
- Tüm sayfaları tek tek yeniden düzenlemek: önce token ve ortak bileşenle en geniş etki.

## Sonuçlar / açık işler
- Ham Tailwind rengi kullanan ~25 dosya (`gray-*`, `rose-*`, `emerald-*`) yeni palete uymuyor; dokunuldukça token'a çevrilecek.
- Kil vurgu ile `danger` kırmızısı yakın tonlar; tablo kodları (bağlantı) kritik rozetlerin yanında benzer görünebiliyor. Gerekirse bağlantılar `text-ink` + alt çizgiye alınır.
- Doluluk rampası (takvim) bilinçli olarak yeşil kaldı: veri anlamı taşıyor.
