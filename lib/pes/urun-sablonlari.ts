// Urun Sablon Sistemi — Ana gruplar + karar noktalari
// Her urun grubu icin hangi ana operasyon gruplari var ve her grupta hangi secenekler var

export interface SablonSecenek {
  id: string
  label: string
  varsayilan?: boolean // default secili mi
}

export interface SablonKarar {
  id: string
  label: string
  tip: 'tek' | 'coklu' | 'evet_hayir' // tek secim / coklu secim / var/yok
  secenekler: SablonSecenek[]
  // Referans op grup isimleri — secime gore hangi op gruplari getirilecek
  refMapping: Record<string, string[]> // secenek id -> ref_operasyon_grup ad listesi
}

export interface SablonAnaGrup {
  id: string
  label: string
  sabit: boolean // her modelde var mi (montaj gibi)
  kararlar: SablonKarar[]
  sabitOpGruplari?: string[] // sabit op grup isimleri (referanstan)
}

export interface UrunSablon {
  urunGrubu: string
  label: string
  anaGruplar: SablonAnaGrup[]
}

export const URUN_SABLONLARI: UrunSablon[] = [
  {
    urunGrubu: 'PANTOLON',
    label: 'Pantolon / Jean Pantolon',
    anaGruplar: [
      {
        id: 'on_bant', label: 'On Bant', sabit: false,
        kararlar: [
          {
            id: 'on_cep', label: 'On Cep Tipi', tip: 'tek',
            secenekler: [
              { id: 'fonksiyonlu', label: 'Fonksiyonlu Cep' },
              { id: 'fonksiyonsuz', label: 'Fonksiyonsuz Cep' },
              { id: 'kargo_koruklu', label: 'Kargo Cep (Koruklu)' },
              { id: 'kargo_koruksuz', label: 'Kargo Cep (Koruksuz)' },
              { id: 'fleto_fonk', label: 'Fleto Cep (Fonksiyonlu)' },
              { id: 'fleto_fonksuz', label: 'Fleto Cep (Fonksiyonsuz)' },
              { id: 'fermuar_cep', label: 'Fermuarli Cep' },
              { id: 'yok', label: 'Cep Yok' },
            ],
            refMapping: {
              'fonksiyonlu': ['Fonksiyonlu Cep'],
              'fonksiyonsuz': ['Fonksiyonsuz Cep'],
              'kargo_koruklu': ['Kargo Cep ( Körüklü )'],
              'kargo_koruksuz': ['Kargo Cep ( Körüksüz )'],
              'fleto_fonk': ['Fleto Cep (fonksiyonlu)'],
              'fleto_fonksuz': ['Tekli Fleto Cep (fonksiyonsuz)(1 adet)', 'Fleto Cep (fonksiyonsuz)'],
              'fermuar_cep': ['Fonksiyonlu Fermuarlı Cep (Çimalı)', 'Fermuarlı Cep'],
              'yok': [],
            }
          },
          {
            id: 'on_ag', label: 'On Ag', tip: 'tek',
            secenekler: [
              { id: 'standart', label: 'Standart', varsayilan: true },
              { id: 'kilit', label: 'Kilit Dikisli' },
              { id: 'yok', label: 'Yok' },
            ],
            refMapping: {
              'standart': ['Ön Ağ Çalışması'],
              'kilit': ['Ön Ağ Çalışması (Kilit Dikişli)'],
              'yok': [],
            }
          },
          {
            id: 'pat', label: 'Pat Yeri', tip: 'tek',
            secenekler: [
              { id: 'fermuarli', label: 'Fermuarli', varsayilan: true },
              { id: 'fonksiyonlu', label: 'D.Duz Pat Fonksiyonlu' },
              { id: 'fonksiyonsuz', label: 'Fonksiyonsuz' },
              { id: 'yok', label: 'Yok' },
            ],
            refMapping: {
              'fermuarli': ['Pat Yeri (fermuarlı)'],
              'fonksiyonlu': ['D. Düz Pat Fonksiyonlu'],
              'fonksiyonsuz': ['Pat Yeri (fonksiyonsuz)'],
              'yok': [],
            }
          },
        ]
      },
      {
        id: 'arka_bant', label: 'Arka Bant', sabit: false,
        kararlar: [
          {
            id: 'arka_cep', label: 'Arka Cep Tipi', tip: 'tek',
            secenekler: [
              { id: 'ustten_vurma', label: 'Ustten Vurma Cep', varsayilan: true },
              { id: 'ustten_vurma_kibrit', label: 'Ustten Vurma Kibrit Cep' },
              { id: 'fleto_kibrit', label: 'Fleto Kibrit Cep' },
              { id: 'yok', label: 'Cep Yok' },
            ],
            refMapping: {
              'ustten_vurma': ['Arka Üstten Vurma Cep', 'Üstten Vurma Kibrit Cep'],
              'ustten_vurma_kibrit': ['Üstten Vurma Kibrit Cep'],
              'fleto_kibrit': ['Fleto Kibrit Cep'],
              'yok': [],
            }
          },
          {
            id: 'arka_ag', label: 'Arka Ag', tip: 'tek',
            secenekler: [
              { id: 'standart', label: 'Standart', varsayilan: true },
              { id: 'kilit', label: 'Kilit Dikisli' },
            ],
            refMapping: {
              'standart': ['Arka Ağ Çalışması'],
              'kilit': ['Arka Ağ Çalışması (Kilit Dikişli)'],
            }
          },
        ]
      },
      {
        id: 'bel', label: 'Bel / Kemer', sabit: false,
        kararlar: [
          {
            id: 'kemer_tipi', label: 'Kemer / Bel Tipi', tip: 'tek',
            secenekler: [
              { id: 'duz_kemer', label: 'Duz Kemer' },
              { id: 'klasik_kemer', label: 'Klasik Kemer (Agrafli)' },
              { id: 'lastikli', label: 'Lastikli Bel' },
              { id: 'duz_lastikli', label: 'Duz + Lastikli Bel', varsayilan: true },
              { id: 'lastikli_kordonlu', label: 'Lastikli Bel (Kordonlu)' },
              { id: 'ayarli_lastik', label: 'Ayarli Lastik Kemer' },
              { id: 'hamile', label: 'Hamile Bel' },
            ],
            refMapping: {
              'duz_kemer': ['Düz Kemer', 'Düz Kemer (Kd)'],
              'klasik_kemer': ['Klasik Kemer', 'Klasik Kemer (Agraflı-Biyeli)'],
              'lastikli': ['Lastikli Bel'],
              'duz_lastikli': ['Düz + Lastikli Bel', 'Düz+Lastikli Bel', 'Düz Lastikli Bel'],
              'lastikli_kordonlu': ['Lastikli Bel (Kordonlu)'],
              'ayarli_lastik': ['Ayarlı Lastik Kemer'],
              'hamile': ['Hamile Bel'],
            }
          },
        ]
      },
      {
        id: 'paca', label: 'Paca', sabit: false,
        kararlar: [
          {
            id: 'paca_tipi', label: 'Paca Tipi', tip: 'tek',
            secenekler: [
              { id: 'duz', label: 'Duz Paca', varsayilan: true },
              { id: 'duble', label: 'Duble Paca' },
              { id: 'lastikli', label: 'Lastikli Paca' },
              { id: 'kor_baski', label: 'Kor Baski' },
              { id: 'yirtmacli', label: 'Yirtmacli' },
              { id: 'puskul', label: 'Puskul Paca' },
            ],
            refMapping: {
              'duz': ['Düz Paça'],
              'duble': ['Duble Paça_Alt'],
              'lastikli': ['Lastikli Paça', 'Lastikli Paça (Takma)'],
              'kor_baski': ['Paça Kör Baskı'],
              'yirtmacli': ['Paça Kör Baskı (Yırtmaçlı)', 'Paça Yırtmaç'],
              'puskul': ['Püskül Paça'],
            }
          },
        ]
      },
      {
        id: 'montaj', label: 'Montaj', sabit: true,
        kararlar: [],
        sabitOpGruplari: ['Montaj', 'Yan Birleştirme', 'İç Boy Birleştirme', 'Punteriz', 'İç-Dış Çevirme_Alt', 'Eşleme/Tasnif'],
      },
      {
        id: 'aksesuar', label: 'Aksesuar', sabit: false,
        kararlar: [
          {
            id: 'dugme', label: 'Dugme', tip: 'evet_hayir',
            secenekler: [{ id: 'evet', label: 'Var', varsayilan: true }, { id: 'hayir', label: 'Yok' }],
            refMapping: { 'evet': ['Düğme', 'Çakım'], 'hayir': [] }
          },
          {
            id: 'ilik', label: 'Ilik', tip: 'evet_hayir',
            secenekler: [{ id: 'evet', label: 'Var', varsayilan: true }, { id: 'hayir', label: 'Yok' }],
            refMapping: { 'evet': ['İlik-Düğme'], 'hayir': [] }
          },
          {
            id: 'etiket', label: 'Etiket/Talimat', tip: 'evet_hayir',
            secenekler: [{ id: 'evet', label: 'Var', varsayilan: true }, { id: 'hayir', label: 'Yok' }],
            refMapping: { 'evet': ['Etiket/Talimat'], 'hayir': [] }
          },
        ]
      },
    ]
  },
  {
    urunGrubu: 'GOMLEK',
    label: 'Gomlek',
    anaGruplar: [
      {
        id: 'yaka', label: 'Yaka', sabit: false,
        kararlar: [
          {
            id: 'yaka_tipi', label: 'Yaka Tipi', tip: 'tek',
            secenekler: [
              { id: 'ayakli', label: 'Ayakli Yaka', varsayilan: true },
              { id: 'ilikli', label: 'Ilikli Yaka' },
              { id: 'hakim', label: 'Hakim Yaka' },
              { id: 'resort', label: 'Resort Yaka' },
              { id: 'tek_parca', label: 'Tek Parca Yaka' },
              { id: 'baby', label: 'Baby Yaka' },
              { id: 'firfir', label: 'Firfir Yaka' },
              { id: 'brode', label: 'Brode Yaka' },
              { id: 'kacik', label: 'Kacik Yaka' },
            ],
            refMapping: {
              'ayakli': ['Ayaklı Yaka'],
              'ilikli': ['İlikli Yaka'],
              'hakim': ['Hakim Yaka'],
              'resort': ['Resort Yaka'],
              'tek_parca': ['Tek Parça Yaka'],
              'baby': ['Baby Yaka'],
              'firfir': ['Fırfır Yaka'],
              'brode': ['Brode Yaka'],
              'kacik': ['Kaçık Yaka'],
            }
          },
        ]
      },
      {
        id: 'pat', label: 'Pat', sabit: false,
        kararlar: [
          {
            id: 'pat_tipi', label: 'Pat Tipi', tip: 'tek',
            secenekler: [
              { id: 'kendinden_dikisli', label: 'Kendinden Donuslu (Dikisli)', varsayilan: true },
              { id: 'kendinden_dikissiz', label: 'Kendinden Donuslu (Dikissiz)' },
              { id: 'takma', label: 'Takma Pat' },
              { id: 'gizli', label: 'Gizli Pat' },
              { id: 'yarim_takma', label: 'Yarim Takma Pat' },
            ],
            refMapping: {
              'kendinden_dikisli': ['Kendinden Dönüşlü Pat (Dikişli)'],
              'kendinden_dikissiz': ['Kendinden Dönüşlü Pat (Dikişsiz)'],
              'takma': ['Takma Pat'],
              'gizli': ['Gizli Pat'],
              'yarim_takma': ['Yarım Takma Pat'],
            }
          },
        ]
      },
      {
        id: 'kol', label: 'Kol', sabit: false,
        kararlar: [
          {
            id: 'kol_ucu', label: 'Kol Ucu / Manset', tip: 'tek',
            secenekler: [
              { id: 'manset', label: 'Manset', varsayilan: true },
              { id: 'kol_apolet', label: 'Kol Apolet' },
              { id: 'apartura', label: 'Kol Apartura' },
              { id: 'lastik', label: 'Kol Ucu Lastik' },
              { id: 'duble', label: 'Kol Ucu Duble' },
              { id: 'kisa_kol', label: 'Kisa Kol (Katlama)' },
            ],
            refMapping: {
              'manset': ['Manşet Hazırlık'],
              'kol_apolet': ['Kol Apolet'],
              'apartura': ['Kol Apartura'],
              'lastik': ['Kol Ucu Lastik'],
              'duble': ['Kol Ucu Duble Katlama'],
              'kisa_kol': ['Kol Ucu Katlama'],
            }
          },
        ]
      },
      {
        id: 'cep', label: 'Cep', sabit: false,
        kararlar: [
          {
            id: 'cep_tipi', label: 'Cep Tipi', tip: 'tek',
            secenekler: [
              { id: 'koseli', label: 'Koseli Cep', varsayilan: true },
              { id: 'v_cep', label: 'V Cep' },
              { id: 'oval', label: 'Oval Cep' },
              { id: 'dugmeli', label: 'Dugmeli Cep' },
              { id: 'kapakli', label: 'Kapakli Cep' },
              { id: 'yok', label: 'Cep Yok' },
            ],
            refMapping: {
              'koseli': ['Köşeli_Cep', 'Köşeli Cep (U Köşeli)', 'Köşeli Cep - D Dikiş'],
              'v_cep': ['V Cep'],
              'oval': ['Oval_Cep'],
              'dugmeli': ['Düğmeli Cep'],
              'kapakli': ['Cep_Kapağı'],
              'yok': [],
            }
          },
        ]
      },
      {
        id: 'montaj', label: 'Montaj', sabit: true,
        kararlar: [],
        sabitOpGruplari: ['Kol Takma', 'Omuz_Çatım', 'Yan Çatım', 'Montaj', 'Etek Temiz Kıvırma', 'Etiket/Talimat', 'Eşleme/Tasnif', 'İç-Dış Çevirme_Alt'],
      },
      {
        id: 'aksesuar', label: 'Aksesuar', sabit: false,
        kararlar: [
          {
            id: 'dugme', label: 'Dugme', tip: 'evet_hayir',
            secenekler: [{ id: 'evet', label: 'Var', varsayilan: true }, { id: 'hayir', label: 'Yok' }],
            refMapping: { 'evet': ['Düğme'], 'hayir': [] }
          },
          {
            id: 'biyeli_kol', label: 'Biyeli Kol Yirtmaci', tip: 'evet_hayir',
            secenekler: [{ id: 'evet', label: 'Var' }, { id: 'hayir', label: 'Yok', varsayilan: true }],
            refMapping: { 'evet': ['Biyeli Kol Yırtmacı'], 'hayir': [] }
          },
        ]
      },
    ]
  },
]

// Yardimci: Sablon secimlerinden referans op grup listesi olustur
export function getSablonOpGruplari(sablon: UrunSablon, secimler: Record<string, string>): string[] {
  const opGruplari: string[] = []

  for (const grup of sablon.anaGruplar) {
    // Sabit gruplar
    if (grup.sabit && grup.sabitOpGruplari) {
      opGruplari.push(...grup.sabitOpGruplari)
    }

    // Karar bazli gruplar
    for (const karar of grup.kararlar) {
      const secim = secimler[karar.id]
      if (secim && karar.refMapping[secim]) {
        opGruplari.push(...karar.refMapping[secim])
      }
    }
  }

  return [...new Set(opGruplari)] // duplicate kaldir
}
