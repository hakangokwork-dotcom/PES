import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

const BOM = '﻿'

const TEMPLATES: Record<string, { filename: string; headers: string[]; examples: string[][] }> = {
  production: {
    filename: 'uretim_sablonu.csv',
    headers: ['bant_kodu', 'model_kodu', 'toplam_sam_sn', 'hedef_adet', 'gercek_adet', 'calisma_gunu'],
    examples: [
      ['BANT-01', 'WASHA', '735.6', '3000', '2850', '22'],
      ['BANT-01', 'TRAIT', '620.0', '3500', '3200', '22'],
      ['BANT-02', 'DENOM', '480.5', '4000', '3900', '22'],
    ],
  },
  expenses: {
    filename: 'gider_sablonu.csv',
    headers: ['calisma_gunu', 'personel', 'sgk', 'yemek', 'elektrik', 'su', 'dogalgaz', 'servis', 'arac', 'kargo', 'makina_bakim', 'iplik', 'diger', 'hedef_ciro'],
    examples: [
      ['22', '850000', '280000', '120000', '95000', '8000', '45000', '65000', '25000', '35000', '40000', '55000', '30000', '2200000'],
    ],
  },
  quality: {
    filename: 'kalite_sablonu.csv',
    headers: ['bant_kodu', 'model_kodu', 'kontrol_edilen', 'ilk_gecis', 'red_edilen', 'yeniden_islem', 'musteri_iade', 'en_sik_hata'],
    examples: [
      ['BANT-01', 'WASHA', '2850', '2710', '45', '95', '5', 'Dikis hatasi'],
      ['BANT-02', 'DENOM', '3900', '3750', '30', '120', '8', 'Olcu hatasi'],
    ],
  },
  /* tip değerleri downtime_record CHECK kısıtıyla birebir aynı olmalı —
     eskiden 'Plansiz'/'Planli' (Türkçe harfsiz) örnek veriliyordu ve şablonu
     olduğu gibi yükleyen kısıt hatası alıyordu. */
  downtime: {
    filename: 'durus_sablonu.csv',
    headers: ['bant_kodu', 'tarih', 'sure_dk', 'tip', 'neden', 'etkilenen_operasyon'],
    examples: [
      ['BANT-01', '2026-04-05', '45', 'Plansız', 'Makine arızası - Düz dikiş', '3'],
      ['BANT-01', '2026-04-10', '30', 'Planlı', 'Bakım', '0'],
      ['BANT-02', '2026-04-08', '60', 'Tedarik', 'Kumaş gecikmesi', '8'],
      ['BANT-02', '2026-04-12', '25', 'Organizasyonel', 'Vardiya devri', '4'],
    ],
  },
  workforce: {
    filename: 'isgucu_sablonu.csv',
    headers: ['toplam_personel', 'aydan_ayrilan', 'aya_katilan', 'isinma_doneminde', 'ort_kidem_ay'],
    examples: [
      ['185', '8', '12', '10', '18.5'],
    ],
  },
  changeover: {
    filename: 'model_degisim_sablonu.csv',
    headers: ['bant_kodu', 'tarih', 'onceki_model', 'sonraki_model', 'toplam_dk', 'makina_ayar_dk', 'dengeleme_dk', 'ilk_parti_dk', 'isinma_dk'],
    examples: [
      ['BANT-01', '2026-04-07', 'WASHA', 'TRAIT', '45', '15', '10', '12', '8'],
    ],
  },
  eder_operations: {
    filename: 'eder_operasyon_sablonu.csv',
    headers: ['operasyon_grubu', 'alt_operasyon', 'sure_sn', 'kisi_sayisi', 'makine_tipi'],
    examples: [
      ['Ayakli Yaka', 'Yaka Tulumlama', '16.91', '1', 'Duz Dikis'],
      ['Ayakli Yaka', 'Yaka Cevirme', '7.49', '1', ''],
      ['Ayakli Yaka', 'Yaka Cima/Gaze', '9.31', '1', 'Overlok'],
      ['Ayakli Yaka', 'Bedene Yaka Takma', '28.57', '1', 'Duz Dikis'],
      ['Kol Takma', 'Kol Takma', '24.72', '1', 'Duz Dikis'],
      ['Kol Takma', 'Cima', '25.37', '1', 'Overlok'],
      ['Yan Catim', 'Uzun Kol Yan Catim', '25.92', '1', 'Overlok'],
      ['Yan Catim', 'Regula', '15.08', '1', 'Duz Dikis'],
    ],
  },
  setup: {
    filename: 'atolye_kurulum_sablonu.csv',
    headers: [],
    examples: [],
  },
}

function buildSetupCSV(): string {
  /* Değerler veritabanı CHECK kısıtlarıyla birebir aynı yazılır; import
     katmanı yazım farklarını tolere etse de şablonun kendisi doğru örneği
     göstermeli — kullanıcı çoğu zaman örneği kopyalayarak doldurur. */
  const lines = [
    '# tip: CMT | CMT+Yıkama | Dikim | Kesim & Dikim   (üretim tipi — atölye sınıfı A/B/C değil)',
    '# tesvik_bolgesi: 1-6 arası',
    '## BOLUM 1: ATOLYE PROFIL',
    'atolye_adi;sehir;ilce;tip;tesvik_bolgesi;toplam_personel;dikim_operatoru;ukp_personel;kesim_personel;yonetim;endirek;bant_sayisi;gunluk_hedef;net_saat',
    'Şahinler Denim;Diyarbakır;Merkez;CMT;6;321;185;86;17;17;16;3;6750;9',
    '',
    '# bant_tipi: Normal | Küçük',
    '## BOLUM 2: BANTLAR',
    'bant_kodu;bant_adi;bant_tipi;operator_sayisi;gunluk_hedef',
    'BANT-01;Ana Bant;Normal;25;2500',
    'BANT-02;İkinci Bant;Normal;20;2250',
    'BANT-03;Üçüncü Bant;Küçük;15;2000',
    '',
    '## BOLUM 3: AYLIK GIDER',
    'yil;ay;calisma_gunu;personel;sgk;yemek;elektrik;su;dogalgaz;servis;arac;kargo;makina_bakim;iplik;diger;hedef_ciro',
    '2026;4;22;850000;280000;120000;95000;8000;45000;65000;25000;35000;40000;55000;30000;2200000',
  ]
  return BOM + lines.join('\r\n') + '\r\n'
}

export const GET = withTenantRoute<{ type: string }>(async (_req, { params }) => {
  const { type } = params
  const tmpl = TEMPLATES[type]
  if (!tmpl) {
    return NextResponse.json({ error: 'Gecersiz sablon tipi', valid: Object.keys(TEMPLATES) }, { status: 400 })
  }

  if (type === 'setup') {
    const csv = buildSetupCSV()
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="atolye_kurulum_sablonu.csv"',
      },
    })
  }

  const rows = [tmpl.headers.join(';'), ...tmpl.examples.map(r => r.join(';'))]
  const csv = BOM + rows.join('\r\n') + '\r\n'
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${tmpl.filename}"`,
    },
  })
})
