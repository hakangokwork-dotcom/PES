/* Jenerik (endüstri-bağımsız) domain pack — Boş Kanvas'ın dili. */
export default {
  id: 'blank',
  name: 'Genel Süreç',
  icon: 'Workflow',
  accentColor: '#64748b',
  labels: {
    item: 'İş Birimi',    itemPlural: 'İş Birimleri',
    station: 'İstasyon',  mainGroup: 'Süreç',
    resource: 'Kaynak',   resourcePlural: 'Kaynaklar',
    person: 'Personel',   personPlural: 'Personel',
    facility: 'Tesis',
    demandUnit: 'adet/gün',
  },
  opTypes: [],                       // boş → serbest metin girişi
  resourceTypes: [],
  defaults: { netMinutes: 480, efficiency: 0.85, pfd: 0.1, demand: 100 },
  adviceHints: {
    assignResources: 'Bazı alt operasyonlara kaynak atanmamış — Kaynaklar sekmesinden sürükleyip atayın.',
    bottleneckFix: 'Burayı bölmek / paralel istasyon eklemek / ek personel atamak akış çıktısını artırır.',
  },
};
