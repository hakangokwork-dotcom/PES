/* Tekstil Atölyesi yerleşik şablonu — temel konfeksiyon zinciri. */
export default {
  templateId: 'textile-basic',
  domainId: 'textile',
  name: 'Tekstil Atölyesi',
  description: 'Hazırlık → Ön/Arka Bant → Montaj → Yıkama → UKP temel konfeksiyon akışı',
  icon: 'Shirt',
  seed: {
    mainOps: [
      { id: 'mo_hazir', name: 'Hazırlık',   color: '#7c3aed', order: 0, nextIds: ['mo_on', 'mo_arka'], x:  60, y: 200 },
      { id: 'mo_on',    name: 'Ön Bant',    color: '#2563eb', order: 1, nextIds: ['mo_mont'],          x: 340, y: 100 },
      { id: 'mo_arka',  name: 'Arka Bant',  color: '#16a34a', order: 2, nextIds: ['mo_mont'],          x: 340, y: 300 },
      { id: 'mo_mont',  name: 'Montaj',     color: '#d97706', order: 3, nextIds: ['mo_yik'],           x: 620, y: 200 },
      { id: 'mo_yik',   name: 'Yıkama',     color: '#0891b2', order: 4, nextIds: ['mo_ukp'],           x: 900, y: 200 },
      { id: 'mo_ukp',   name: 'UKP',        color: '#dc2626', order: 5, nextIds: [],                   x:1180, y: 200 },
    ],
    subOps: [], machines: [], operators: [], meta: {},
  },
};
