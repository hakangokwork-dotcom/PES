# Fabrika Kuş Bakışı Görünümü — Tasarım

**Tarih:** 2026-07-27
**Durum:** Onaylandı (görsel companion ile 3 tur seçim yapıldı)

## Amaç

Üretim Simülasyonu'na ikinci bir görünüm: fabrikayı üstten gösteren şematik hat.
İstasyonlar kutu, bekleyen ürünler VSM standardı **△ üçgen içinde sayı**, bitmiş
ürün adedi ve kişi sayısı canlı olarak görünür.

## Kullanıcı seçimleri (brainstorm çıktısı)

1. **Üslup:** Şematik hat görünümü (taban planı ve izometrik elendi).
2. **İstasyon kutusu:** İkonsuz, sayı odaklı — kısaltılmış istasyon adı
   (sabit genişlik, `…` ile kesilir, tam ad hover tooltip), büyük sayı =
   istasyondan geçen adet, alt satır `👤 · çevrim sn`.
3. **WIP:** Her istasyonun önünde ve bölgeler arasında △ üçgen + sayı.
   0 ise gizlenir; sayı büyüdükçe turuncu koyulaşır.
4. **Yerleşim:** Serpantin (S-hattı) — bölgeler satırlara bölünür, çift
   satırlar sağdan sola akar. Satır geçişi **U-borusu değil, kıvrımlı SVG ok**.
5. **Konum:** Simülasyon sekmesi içinde `Liste | Fabrika` görünüm anahtarı;
   KPI şeridi ve oynat/durdur kontrolleri ortak kalır.

## Mimari

- `components/vsim/engine/factoryLayout.js` — saf fonksiyonlar, UI'sız:
  - `stationRows(data)`: kök ana-op sırasına göre bölgeler; her bölge içinde
    yaprak alt-oplar topolojik sırada; bölgeler kümülatif istasyon sayısına
    göre satırlara bölünür (satır başına hedef ~N istasyon, ekran genişliğine
    değil sayıya dayalı deterministik bölme).
  - `stationQueue(simState, bridges, opId)`: `pending` toplamı + giriş
    alt-oplarında `groupInbox` payı (motor §3 ile aynı mantık).
  - Yaprak istasyon: `childNodes(data, id).length === 0 && cycleTime > 0`.
    Kök bölge eşlemesi `buildGroupBridges(d).groupOf` ile.
- `components/vsim/components/FabrikaView.jsx` — yalnız çizim. Props:
  `{ data, simState, calc, projectedEOD }`. SimView'ın 100ms tick'iyle
  otomatik yeniden render olur; kendi state'i yok (tooltip hariç).
- `SimView` içine görünüm anahtarı: `useState` + `localStorage`
  (`vsim.simViewMode`, değerler `liste | fabrika`). Liste = mevcut istasyon
  listesi; Fabrika = FabrikaView. KPI kartları/kontroller her iki modda aynı.

## Görsel kurallar

- İstasyon kutusu ~64px sabit genişlik; ad tek satır `text-overflow:ellipsis`;
  `title` attribute ile tam ad.
- Durum renkleri: çalışıyor = yeşil çerçeve/zemin; boşta = gri; darboğaz
  (en yüksek `peakQueue`) = kırmızı çerçeve + △ kırmızı.
- Bölge (1.Seviye süreç) kesikli çerçeveli grup kutusu; başlıkta ad +
  `👤 toplam` (operatorId atanmış alt-op sayısı) + `△ toplam WIP`.
- Bölgeler arası: ok (→) + bölge-arası △ (hedef bölgenin inbox toplamı).
- Satır sonu: kıvrımlı SVG ok alt satırın ilk bölgesine iner.
- Hat sonu: yeşil `✅ bitmiş ürün` kutusu (`simState.exited`) + gün sonu
  tahmini (SimView'daki mevcut `projectedEOD`).

## Test

- `factoryLayout.test.js`: satır bölme (tek bölge, çok bölge, boş model),
  topolojik istasyon sırası (Öncesi dallı model), kuyruk türetme
  (pending + groupInbox), darboğaz seçimi.
- Bileşen için ayrı DOM testi yok (repo geleneği: engine test edilir).

## Kapsam dışı (v1)

Pan/zoom, istasyon tıklama detay paneli, animasyonlu parça hareketi,
makine ikonları (ileride domain ikon seti eklenebilir).

## Senkron

Değişiklikler `npm run sync:vsim` ile standalone VSIM kopyasına aktarılır.
