/* Tekstil / Konfeksiyon domain pack — saf veri, React yok. */
export default {
  id: 'textile',
  name: 'Tekstil / Konfeksiyon',
  icon: 'Shirt',                    // lucide ikon adı (galeri kartı)
  accentColor: '#0891b2',
  labels: {
    item: 'Parça',        itemPlural: 'Parçalar',
    station: 'İstasyon',  mainGroup: 'Bant/Bölüm',
    resource: 'Makine',   resourcePlural: 'Makineler',
    person: 'Operatör',   personPlural: 'Operatörler',
    facility: 'Atölye',
    demandUnit: 'adet/gün',
  },
  opTypes: [
    'DİKİM', 'OVERLOK', 'ÇİMA', 'REÇME', 'PUNTEREZ',
    'OTOMAT', 'ÜTÜ', 'KESİM', 'KONTROL', 'TEMİZLİK', 'AKSESUAR', 'DESTEK',
  ],
  resourceTypes: ['Düz Dikiş', 'Overlok', 'Reçme', 'Punterez', 'Otomat', 'Ütü', 'Kesim'],
  defaults: { netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 },
  adviceHints: {
    assignResources: 'Bazı dikim/overlok alt operasyonlarına makine atanmamış — Kaynaklar sekmesinden sürükleyip atayın.',
    bottleneckFix: 'Burayı bölmek / otomat eklemek / ikinci operatör atamak hat çıktısını artırır.',
  },
};
