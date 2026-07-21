/* Hesaplama kılavuzu — her metrik için formül + sade açıklama + gerçek sayılı örnek.
   Sofistike olmayan atölye kullanıcısı için sade Türkçe. Örnek sayıları golden-master
   test değerleridir (metrics.test.js / capacity.test.js) ve calculations.test.js ile
   motor çıktısına karşı doğrulanır — kılavuz koddan sapmaz.
   Her girdi: { id, term, tab, formula, plain, example, glossaryKey? }.
   tab: guides.js sekme uzayı ('flow'|'vsm'|'surec'|'ops'|'dashboard'|'sim'|'resources'|'rapor')
        veya '' (sekmesiz genel). Ondalık ayraç virgül (TR), binlik nokta. */

export const CALCULATIONS = [
  // ---- Grup 1: Ana ekran metrikleri ----
  {
    id: 'takt', term: 'Takt Time', tab: 'dashboard', glossaryKey: 'takt',
    formula: 'Takt = Net Süre (sn) ÷ Talep',
    plain: 'Müşteri talebini karşılamak için bir parçanın çıkması gereken ritim. Küçük takt = hızlı ritim.',
    example: 'Net 420 dk × 60 = 25.200 sn ÷ 350 adet = 72 sn/adet',
  },
  {
    id: 'smv', term: 'SMV (Standart Dakika)', tab: 'dashboard', glossaryKey: 'smv',
    formula: 'SMV = Temel Süre × (1 + PF&D%)',
    plain: 'Temel işlem süresine kişisel/yorgunluk/gecikme payı eklenmiş standart süre.',
    example: '0,42 dk × (1 + 0,12) = 0,47 dk',
  },
  {
    id: 'pfd', term: 'PF&D Payı', tab: 'dashboard', glossaryKey: 'pfd',
    formula: 'Standart süre = Temel süre × (1 + PF&D%)',
    plain: 'Personal/Fatigue/Delay: kişisel ihtiyaç, yorgunluk ve gecikme için standart süreye eklenen pay.',
    example: '%12 pay → çarpan 1,12; %15 pay → çarpan 1,15',
  },
  {
    id: 'kapasite', term: 'Hat Çıktısı (Kapasite)', tab: 'dashboard', glossaryKey: 'cevrim',
    formula: 'Kapasite = (Net dk × Verim × İstasyon) ÷ SMV (dk)',
    plain: 'Bir istasyonun vardiya başına üretebileceği adet. Verim ve PF&D payı hesaba katılır.',
    example: 'SMV = 30 sn ÷ 60 × 1,15 = 0,575 dk → (540 × 0,85 × 1) ÷ 0,575 ≈ 798 ad/vardiya',
  },
  {
    id: 'darbogaz', term: 'Darboğaz', tab: 'dashboard', glossaryKey: 'darbogaz',
    formula: 'Hat Çıktısı = en düşük kapasiteli adım',
    plain: 'Hattın en yavaş adımı toplam çıktıyı sınırlar. Diğer adımlar ne kadar hızlı olursa olsun hat bu hızda akar.',
    example: '3 adım: 399 / 266 / 532 ad/v → darboğaz 266, hat çıktısı 266',
  },
  {
    id: 'dengeleme', term: 'Dengeleme Verimi', tab: 'dashboard', glossaryKey: 'dengeleme',
    formula: 'Dengeleme = ΣÇevrim ÷ (İstasyon × EnYavaşÇevrim) × 100',
    plain: 'İş yükünün istasyonlara ne kadar eşit dağıldığı. %100 = kusursuz denge; düşük = boşta kalan kapasite.',
    example: '(60 + 90 + 45) ÷ (3 × 90) × 100 = %72,2 (kayıp %27,8)',
  },
  {
    id: 'yamazumi', term: 'Yamazumi', tab: 'dashboard', glossaryKey: 'yamazumi',
    formula: 'Çevrim > Takt → darboğaz; Çevrim ≥ %80 × Takt → risk',
    plain: 'İstasyon iş yükünü Takt çizgisiyle karşılaştıran çubuk grafik. Takt üstü çubuk = darboğaz.',
    example: 'Çevrim 72 sn > Takt 67,5 sn → darboğaz (kırmızı çubuk)',
  },
  {
    id: 'join', term: 'VE / ÇOĞALT (Birleşme)', tab: 'flow', glossaryKey: 'joinType',
    formula: 'VE = en yavaş giriş (min) · ÇOĞALT = girişler toplanır',
    plain: 'Bir adıma birden çok giriş gelince: VE = kit (her girişten birer parça, en yavaş belirler); ÇOĞALT = havuzlama (aynı parça, hızlar toplanır).',
    example: '399 + 399 ad/v: VE → 399 (min) · ÇOĞALT → 798 (toplam)',
  },
  {
    id: 'split', term: 'ÇOĞALT / BÖL (Dağılım)', tab: 'flow', glossaryKey: 'splitType',
    formula: 'ÇOĞALT = her dala tam hız · BÖL = kapasiteye orantılı pay',
    plain: 'Bir adım iki adımı besleyince: ÇOĞALT = farklı parçalar (kesim: 1 kesim → 1 ön + 1 arka, her dal tam hız); BÖL = aynı parça farklı hatlara (kapasiteye göre paylaşılır).',
    example: '399 ad/v BÖL → kapasitesi 2:1 olan dallara 266 / 133',
  },
  {
    id: 'gerekliOperator', term: 'Gerekli Operatör', tab: 'resources',
    formula: 'Gerekli Operatör = Toplam SMV (sn) ÷ Takt (sn), yukarı yuvarla',
    plain: 'Talebi karşılamak için hatta kaç operatör gerektiği. Küsurat yukarı yuvarlanır (yarım operatör olmaz).',
    example: '924 sn ÷ 72 sn = 12,83 → 13 operatör',
  },

  // ---- Grup 2: Derin VSM / kalite metrikleri ----
  {
    id: 'processTime', term: 'Process Time', tab: 'vsm', glossaryKey: 'cevrim',
    formula: 'Process Time = Çevrim × (Operatör ÷ Makine)',
    plain: 'Bir adımın efektif işlem süresi. Paralel operatör hızlandırır, paylaşılan makine yavaşlatır.',
    example: '45 sn × (2 operatör ÷ 1 makine) = 90 sn',
  },
  {
    id: 'little', term: 'Little Yasası (Ara Stok Süresi)', tab: 'vsm', glossaryKey: 'wip',
    formula: 'Bekleme Süresi = Ara Stok (WIP) × Takt',
    plain: 'İki adım arasındaki stok, hattı geçme süresine ne ekler. Çok stok = uzun bekleme.',
    example: '15 adet × 72 sn = 1.080 sn (18 dk) bekleme',
  },
  {
    id: 'leadTime', term: 'Lead Time', tab: 'vsm', glossaryKey: 'leadTime',
    formula: 'Lead Time = ΣProcess Time + ΣBekleme',
    plain: 'Bir parçanın hatta baştan sona geçen toplam süresi: işlem (VA) + bekleme (NVA).',
    example: '(45 + 60) + (1.080 + 720) = 1.905 sn ÷ 60 = 31,75 dk',
  },
  {
    id: 'pce', term: 'PCE (Değer Katma Verimi)', tab: 'vsm', glossaryKey: 'pce',
    formula: 'PCE = İşlem Süresi (VA) ÷ Lead Time × 100',
    plain: 'Süreç Çevrim Verimliliği: toplam sürenin ne kadarı gerçek işlem. Yüksek = az bekleme/israf.',
    example: '15,4 dk ÷ 285 dk × 100 = %5,4 (çoğu süre bekleme)',
  },
  {
    id: 'hatVerimi', term: 'Hat Verimliliği', tab: 'dashboard', glossaryKey: 'hatVerimliligi',
    formula: 'Hat Verimi = (ΣSMV × Üretim) ÷ (Süre × Operatör) × 100',
    plain: 'Operatör-zaman kaynağının ne kadar verimli kullanıldığı. %85 üstü iyi kabul edilir.',
    example: '(15,4 × 280) ÷ (420 × 12) × 100 = %85,56 (iyi)',
  },
  {
    id: 'oee', term: 'OEE', tab: 'vsm', glossaryKey: 'oee',
    formula: 'OEE = Kullanılabilirlik × Performans × Kalite',
    plain: 'Genel Ekipman Etkinliği: makinenin gerçek verimini tek sayıda özetler. %85 üstü dünya standardı.',
    example: '%94,05 × %99,24 × %95 = %88,67 (dünya standardı)',
  },
  {
    id: 'dpmo', term: 'DPMO / Sigma', tab: 'vsm', glossaryKey: 'dpmo',
    formula: 'DPMO = (Hata ÷ (Adet × Fırsat)) × 1.000.000',
    plain: 'Milyon fırsatta hata sayısı; sigma seviyesinin ölçüsü. Düşük DPMO = yüksek sigma = az hata.',
    example: '5 hata ÷ (1.000 adet × 10 fırsat) × 1.000.000 = 500 DPMO → 4σ',
  },
  {
    id: 'md1', term: 'M/D/1 Kuyruk Beklemesi', tab: 'resources', glossaryKey: 'mdq1',
    formula: 'Bekleme = (ρ × Servis) ÷ (2 × (1 − ρ))   [ρ = doluluk]',
    plain: 'Ortak (paylaşılan) istasyonda ortalama kuyruk beklemesi tahmini. Doluluk %100\'e yaklaştıkça bekleme patlar.',
    example: 'ρ=%80, servis 45 sn → (0,8 × 45) ÷ (2 × 0,2) = 90 sn',
  },
  {
    id: 'gerekliMakine', term: 'Gerekli Makine', tab: 'resources',
    formula: 'Gerekli Makine = ⌈Kullanım ÷ (Kapasite × 0,85)⌉',
    plain: 'Talebi %85 hedef dolulukla karşılamak için kaç makine gerektiği. Küsurat yukarı yuvarlanır.',
    example: '500 dk ÷ (480 × 0,85) = 1,23 → 2 makine',
  },
  {
    id: 'setupKaybi', term: 'Setup (Model Değişimi) Kaybı', tab: 'resources', glossaryKey: 'co',
    formula: 'Setup Kaybı = Toplam Setup ÷ Toplam Çalışma × 100',
    plain: 'Model değişimi (changeover) için harcanan sürenin çalışma süresine oranı. Yüksek = sık değişim kaybı.',
    example: '45 dk ÷ 420 dk × 100 = %10,7',
  },
  {
    id: 'rpn', term: 'RPN (FMEA Risk)', tab: 'vsm',
    formula: 'RPN = Şiddet × Oluşma × Tespit',
    plain: 'Hata Türü ve Etkileri Analizinde risk önceliği. >200 acil aksiyon, ≥100 önleyici, altı izle.',
    example: '8 × 6 × 5 = 240 → acil aksiyon',
  },
];
