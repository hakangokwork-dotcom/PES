/* "Nasıl Kullanılır" kılavuzları — her ana akış için kısa, somut adımlar.
   Sade Türkçe, emir kipi; sofistike olmayan kullanıcıya uygun.
   Her girdi: { id, tab, title, steps: [string], tip? }.
   tab: '' → sekmeye bağlı olmayan genel rehber (panoda "bu sekmeye git" düğmesi çıkmaz).

   SIRA ÖNEMLİ: Aşağıdaki dizilim üst menüdeki sekme sırasıyla AYNI olmalı
   (UretimSimulasyon.jsx sekme çubuğu). Sekme sırası değişirse burayı da güncelle. */

export const GUIDES = [
  {
    id: 'workflow',
    tab: '',
    title: 'Hangi sırayla çalışmalı?',
    steps: [
      'Süreç — süreci serbestçe çiz, kimseye bağımlı değil; buradan başla.',
      'Akış — operasyonları ve aralarındaki bağlantıları kur (asıl model burada).',
      'Kaynaklar — makine ve operatörleri tanımla (atamadan önce var olmalılar).',
      'Operasyonlar — adım sürelerini gir, makine/operatör ata.',
      'Hesaplama — kapasiteni ve darboğazını gör.',
      'Simülasyon — hattı çalıştır, WIP birikimini izle.',
      'VSM — değer akışını haritala, envanter ve kaizen notlarını ekle.',
      'Rapor — sonucu dışa aktar, paylaş.',
    ],
    tip: 'Menüdeki sekme sırası bu akışı izler: soldan sağa ilerlersen eksik veri yüzünden boş ekranla karşılaşmazsın.',
  },
  {
    id: 'surec',
    tab: 'surec',
    title: 'Süreç — harita stüdyosu',
    steps: [
      'Adımları ekle ve sürükleyerek düzenle.',
      'Adımlara ayrıntı (süre, kaynak, not) gir.',
      'Haritayı kaydet; kendi başına duran serbest bir çalışma alanıdır.',
    ],
    tip: 'Burası simülasyondan bağımsızdır: çizdiğin harita hesaplamaları etkilemez, fikir/dokümantasyon içindir.',
  },
  {
    id: 'flow',
    tab: 'flow',
    title: 'Akış — süreç adımlarını çiz',
    steps: [
      'Ana Op Ekle ile operasyonları oluştur.',
      'Bir düğümü sürükleyip taşı; kenardan çekip başkasına bağla.',
      'Çift tıkla → içine gir, alt operasyon ekle.',
      "'Bu Akışı Kaydet' ile senaryo sakla.",
    ],
    tip: 'Bağlantılar üretim sırasını belirler; Öncesi ilişkisi buradan kurulur.',
  },
  {
    id: 'resources',
    tab: 'resources',
    title: 'Kaynaklar — operatör & makine',
    steps: [
      'Operatör ve makine sayılarını tanımla.',
      'Vardiya, mola ve duruş sürelerini gir.',
      'Kullanılabilir süre ve gerekli kaynak sayısını gör.',
    ],
    tip: 'Burada tanımlamadığın makineyi/operatörü Operasyonlar sekmesinde adımlara atayamazsın.',
  },
  {
    id: 'ops',
    tab: 'ops',
    title: 'Operasyonlar — kanban',
    steps: [
      'Operasyon kartlarını durum sütunları arasında sürükle.',
      'Bir kartı aç; süre, operatör ve makine bilgisini güncelle.',
      'Değişiklikler hesaplamalara otomatik yansır.',
    ],
    tip: 'Makine/operatör atamasının yapıldığı tek yer burasıdır (sürükle-bırak).',
  },
  {
    id: 'dashboard',
    tab: 'dashboard',
    title: 'Hesaplama — KPI panosu',
    steps: [
      'Takt, Darboğaz ve Dengeleme kartlarından hattın dengesini gör.',
      'Yamazumi grafiğinde istasyon yüklerini Takt çizgisiyle karşılaştır.',
      'Çevrim ve PF&D tablosundan istasyon sürelerini incele.',
    ],
    tip: 'Kırmızı çubuk Takt üstü = darboğaz; iş yükünü dengele.',
  },
  {
    id: 'sim',
    tab: 'sim',
    title: 'Simülasyon — hattı çalıştır',
    steps: [
      'Başlat/Duraklat/Sıfırla ile kontrol et.',
      'Hız ve ileri-sar ile gün sonunu gör.',
      'WIP birikimi ve darboğazı izle.',
    ],
    tip: 'WIP birikimi darboğazın nerede olduğunu gösterir.',
  },
  {
    id: 'vsm',
    tab: 'vsm',
    title: 'VSM — değer akış haritası',
    steps: [
      'Her adımın kutusunda Çevrim (CT), C/O, Uptime ve FPY değerlerini gir.',
      'Alt şeritte İşlem (VA) ve Bekleme (NVA) sürelerini izle.',
      'Takt, Lead Time ve PCE toplam kartlarından hattın sağlığını oku.',
    ],
    tip: 'Akış sekmesindeki adımları okur; Akış boşsa burası da boş görünür.',
  },
  {
    id: 'rapor',
    tab: 'rapor',
    title: 'Rapor — çıktı & CSV',
    steps: [
      'Özet metrikleri ve tabloları gözden geçir.',
      'CSV olarak dışa aktar.',
      'Raporu paydaşlarla paylaş.',
    ],
    tip: 'Simülasyon bir süre çalışmadan rapor oluşmaz — önce Simülasyon sekmesinde hattı çalıştır.',
  },
  {
    id: 'excel',
    tab: 'flow',
    title: 'Excel ile veri yükle',
    steps: [
      'Şablonu indir, doldur (Ana Grup, Operasyon, Çevrim, Öncesi).',
      "'Excel Yükle' → önizle → içe aktar.",
      "'Öncesi' kolonu ana akışı otomatik kurar.",
    ],
    tip: "'Öncesi' kolonu boşsa adımlar bağlanmaz; sırayı buradan ver.",
  },
  {
    id: 'karsilastir',
    tab: 'flow',
    title: 'Senaryoları karşılaştır',
    steps: [
      'Mevcut düzeni senaryo olarak kaydet.',
      'Bir değişiklik yap ve ikinci senaryoyu kaydet.',
      'Karşılaştır ile metrik farklarını yan yana gör.',
    ],
    tip: 'İyileştirme öncesi/sonrası kıyası için iki senaryo yeterli.',
  },
];
