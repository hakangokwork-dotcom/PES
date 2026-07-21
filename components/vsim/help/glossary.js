/* Terim sözlüğü — sofistike olmayan atölye/üretim yöneticisi için sade Türkçe.
   Açıklamalar src/engine/metrics.js §-referanslı formüllerden türetildi.
   Her girdi: { term: 'Görünen Ad', short: 'tek cümle sade açıklama' }. */

export const GLOSSARY = {
  pce: {
    term: 'PCE (Değer Katma)',
    short: "Süreç Çevrim Verimliliği: değer katan işlem süresinin toplam lead time'a oranı. Yüksek = az bekleme/israf.",
  },
  takt: {
    term: 'Takt Time',
    short: 'Müşteri talebini karşılamak için bir parçanın çıkması gereken ritim: net süre ÷ talep.',
  },
  darbogaz: {
    term: 'Darboğaz',
    short: 'Hattın en yavaş adımı; toplam çıktıyı bu adım sınırlar.',
  },
  dengeleme: {
    term: 'Dengeleme Verimi/Kaybı',
    short: 'İş yükünün istasyonlara ne kadar eşit dağıldığı. Kayıp = boşta kalan kapasite.',
  },
  mdq1: {
    term: 'M/D/1 Kuyruk',
    short: 'Ortak istasyonda bekleme tahmini için kuyruk modeli (sabit servis süresi, tek kanal).',
  },
  co: {
    term: 'C/O (Model Değişimi)',
    short: 'Changeover: bir üründen diğerine geçiş/hazırlık süresi. Bilgi amaçlı, hesaba dahil değil.',
  },
  fpy: {
    term: 'FPY',
    short: 'First Pass Yield: ilk seferde hatasız geçen parça oranı.',
  },
  uptime: {
    term: 'Uptime',
    short: "Makinenin kullanılabilir olduğu süre oranı (OEE'nin kullanılabilirlik bileşeni).",
  },
  va: {
    term: 'İşlem (VA)',
    short: 'Değer katan süre — parçayı müşteri için ileri götüren gerçek işlem.',
  },
  nva: {
    term: 'Bekleme (NVA)',
    short: 'Değer katmayan süre — stok/kuyrukta bekleme, taşıma vb.',
  },
  leadTime: {
    term: 'Lead Time',
    short: 'Bir parçanın hatta baştan sona geçen toplam süresi (VA + NVA).',
  },
  wip: {
    term: 'WIP / Ara Stok',
    short: 'Work In Process: hat içinde işlenmeyi bekleyen parça miktarı.',
  },
  yamazumi: {
    term: 'Yamazumi',
    short: 'İstasyon bazında iş yükü çubuk grafiği; Takt çizgisiyle karşılaştırılır.',
  },
  cevrim: {
    term: 'Çevrim Süresi',
    short: 'Bir parçayı bir istasyonda işleme süresi.',
  },
  pfd: {
    term: 'PF&D Payı',
    short: 'Personal/Fatigue/Delay: kişisel ihtiyaç, yorgunluk ve gecikme için standart süreye eklenen pay.',
  },
  hatVerimliligi: {
    term: 'Hat Verimliliği',
    short: '(ΣSMV × üretim) ÷ (süre × operatör) × 100 — operatör-zaman kullanımı.',
  },
  // Ekstra: ekranda gösterilmese de sözlükte taranabilir bulunsun.
  oee: {
    term: 'OEE',
    short: 'Genel Ekipman Etkinliği: Kullanılabilirlik × Performans × Kalite. Makinenin gerçek verimini tek sayıda özetler.',
  },
  dpmo: {
    term: 'DPMO',
    short: 'Milyon fırsatta hata sayısı: (hata ÷ (adet × fırsat)) × 1.000.000. Sigma seviyesinin ölçüsü.',
  },
  smv: {
    term: 'SMV',
    short: 'Standart Dakika Değeri: temel işlem süresine pay (allowance) eklenmiş standart süre.',
  },
  joinType: {
    term: 'Birleşme Tipi (VE / ÇOĞALT)',
    short: 'Bir adıma birden çok ok girdiğinde: VE = kit (her girişten birer parça, en yavaş belirler); ÇOĞALT = havuzlama (aynı parça paralel hatlardan, hızlar toplanır).',
  },
  splitType: {
    term: 'Dağılım Tipi (ÇOĞALT / BÖL)',
    short: 'Bir adım birden çok adımı beslediğinde: ÇOĞALT = farklı parçalar (kesim gibi, her dal tam hız); BÖL = aynı parça farklı hatlara (kapasiteye orantılı paylaşılır).',
  },
};

export function glossaryTip(key) {
  return GLOSSARY[key];
}
