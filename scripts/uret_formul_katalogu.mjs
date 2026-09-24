#!/usr/bin/env node
/**
 * FORMULLER sayfasını lib/pes/formul-katalogu.ts'e çevirir.
 *
 *   node scripts/uret_formul_katalogu.mjs
 *
 * Çıktı KAYNAK dosyadır, derleme adımı değil — üretilip commit'lenir.
 * Excel güncellenirse bu betik yeniden çalıştırılır ve fark gözden geçirilir.
 *
 * TUZAK: "Marj %" iki farklı sayfada geçiyor (HESAP ve MODEL_HESAP).
 * Eşleme anahtarı bu yüzden `sayfa|gösterge`, tek başına gösterge değil.
 *
 * Eşlemesi olmayan satır varsa betik HATA verir ve hiçbir şey yazmaz:
 * sessizce eksik katalog üretmektense durmak doğru.
 */
import XLSX from 'xlsx'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const KAYNAK = 'C:/Users/bhaka/Desktop/WORK/Facilty_Expence/Atolye_Gider_Model.xlsx'
const HEDEF = join(__dir, '../lib/pes/formul-katalogu.ts')

/* Değer havuzu anahtarları: rasyo.* | param.* | giris.* | gider.*
   girdiler listesi BAŞLICA girdileri gösterir, tam liste olmak zorunda değil. */
const E = (etiket, anahtar) => ({ etiket, anahtar })

const ESLEME = {
  'PARAMETRE|Asgari ücretli dakika maliyeti (nominal)': {
    id: 'param.asgari-dk-nominal', alan: null, kod: 'lib/pes/ekonomi-hesap.ts#asgariDkMaliyetNominal',
    girdiler: [E('İşveren maliyeti', 'param.employer_cost'), E('Asgari ücret desteği', 'param.wage_support'),
      E('Nominal gün', 'param.nominal_days'), E('Günlük dakika', 'param.minutes_per_day')],
  },
  'PARAMETRE|Asgari ücretli dakika maliyeti (efektif)': {
    id: 'param.asgari-dk-efektif', alan: null, kod: 'lib/pes/ekonomi-hesap.ts#asgariDkMaliyetEfektif',
    girdiler: [E('İşveren maliyeti', 'param.employer_cost'), E('Asgari ücret desteği', 'param.wage_support'),
      E('Efektif gün', 'param.effective_days'), E('Günlük dakika', 'param.minutes_per_day')],
  },
  'PARAMETRE|3D referans dk maliyeti (bölge)': {
    id: 'param.referans-3d', alan: null, kod: null,
    girdiler: [E('Atölye bölgesi', 'atolye.bolge')],
  },
  'HESAP|Toplam kişi': {
    id: 'hesap.toplam-kisi', alan: 'toplamKisi', kod: 'lib/pes/ekonomi-hesap.ts#toplamKisi',
    girdiler: [E('Kesim kişi', 'giris.cutting_staff'), E('Dikim kişi', 'giris.sewing_staff'),
      E('UKP kişi', 'giris.ukp_staff'), E('Ofis kişi', 'giris.office_staff')],
  },
  'HESAP|Üretim kişi': {
    id: 'hesap.uretim-kisi', alan: 'uretimKisi', kod: 'lib/pes/ekonomi-hesap.ts#uretimKisi',
    girdiler: [E('Kesim kişi', 'giris.cutting_staff'), E('Dikim kişi', 'giris.sewing_staff'),
      E('UKP kişi', 'giris.ukp_staff')],
  },
  'HESAP|Dikim payı': {
    id: 'hesap.dikim-payi', alan: 'dikimPayi', kod: 'lib/pes/ekonomi-hesap.ts#dikimPayi',
    girdiler: [E('Dikim kişi', 'giris.sewing_staff'), E('Toplam kişi', 'rasyo.toplamKisi')],
  },
  'HESAP|Aylık ciro': {
    id: 'hesap.aylik-ciro', alan: 'aylikCiro', kod: 'lib/pes/ekonomi-hesap.ts#aylikCiro',
    girdiler: [E('Beyan edilen ciro', 'giris.revenue_declared'), E('Boş gün', 'giris.idle_days'),
      E('Düzeltme açık mı', 'param.revenue_adj_on'), E('Düzeltme paydası', 'param.revenue_adj_divisor')],
  },
  'HESAP|Ortalama fiyat / adet': {
    id: 'hesap.ort-fiyat-adet', alan: 'ortFiyatAdet', kod: 'lib/pes/ekonomi-hesap.ts#ortFiyatAdet',
    girdiler: [E('Aylık ciro', 'rasyo.aylikCiro'), E('Aylık adet', 'rasyo.aylikAdet')],
  },
  'HESAP|Brüt gider': {
    id: 'hesap.brut-gider', alan: 'brutGider', kod: 'lib/pes/ekonomi-hesap.ts#brutGider',
    girdiler: [E('İşçilik toplamı (5 satır)', 'rasyo.iscilikToplam')],
  },
  'HESAP|Net gider': {
    id: 'hesap.net-gider', alan: 'netGider', kod: 'lib/pes/ekonomi-hesap.ts#netGider',
    girdiler: [E('Brüt gider', 'rasyo.brutGider'), E('Alınan teşvik', 'gider.incentive_amount')],
  },
  'HESAP|Kâr / zarar': {
    id: 'hesap.kar-zarar', alan: 'karZarar', kod: 'lib/pes/ekonomi-hesap.ts#karZarar',
    girdiler: [E('Aylık ciro', 'rasyo.aylikCiro'), E('Net gider', 'rasyo.netGider')],
  },
  'HESAP|Marj %': {
    id: 'hesap.marj', alan: 'marj', kod: 'lib/pes/ekonomi-hesap.ts#marj',
    girdiler: [E('Aylık ciro', 'rasyo.aylikCiro'), E('Net gider', 'rasyo.netGider')],
  },
  'HESAP|İşçilik toplamı': {
    id: 'hesap.iscilik-toplam', alan: 'iscilikToplam', kod: 'lib/pes/ekonomi-hesap.ts#iscilikToplam',
    girdiler: [],
  },
  'HESAP|İşçilik payı (net)': {
    id: 'hesap.iscilik-payi', alan: 'iscilikPayi', kod: 'lib/pes/ekonomi-hesap.ts#iscilikPayi',
    girdiler: [E('İşçilik toplamı', 'rasyo.iscilikToplam'), E('Alınan teşvik', 'gider.incentive_amount'),
      E('Net gider', 'rasyo.netGider')],
  },
  'HESAP|İşçilik dışı / kişi, kira hariç': {
    id: 'hesap.iscilik-disi-kisi', alan: 'iscilikDisiKisi', kod: 'lib/pes/ekonomi-hesap.ts#iscilikDisiKisi',
    girdiler: [E('Brüt gider', 'rasyo.brutGider'), E('İşçilik toplamı', 'rasyo.iscilikToplam'),
      E('Toplam kişi', 'rasyo.toplamKisi')],
  },
  'HESAP|Ciro / kişi': {
    id: 'hesap.ciro-kisi', alan: 'ciroKisi', kod: 'lib/pes/ekonomi-hesap.ts#ciroKisi',
    girdiler: [E('Aylık ciro', 'rasyo.aylikCiro'), E('Toplam kişi', 'rasyo.toplamKisi')],
  },
  'HESAP|Net gider / kişi': {
    id: 'hesap.net-gider-kisi', alan: 'netGiderKisi', kod: 'lib/pes/ekonomi-hesap.ts#netGiderKisi',
    girdiler: [E('Net gider', 'rasyo.netGider'), E('Toplam kişi', 'rasyo.toplamKisi')],
  },
  'HESAP|Maaş / kişi': {
    id: 'hesap.maas-kisi', alan: 'maasKisi', kod: 'lib/pes/ekonomi-hesap.ts#maasKisi',
    girdiler: [E('Toplam kişi', 'rasyo.toplamKisi'), E('Net asgari ücret (kıyas)', 'param.min_wage_net')],
  },
  'HESAP|Adet / dikimci': {
    id: 'hesap.adet-dikimci', alan: 'adetDikimci', kod: 'lib/pes/ekonomi-hesap.ts#adetDikimci',
    girdiler: [E('Aylık adet', 'rasyo.aylikAdet'), E('Dikim kişi', 'giris.sewing_staff')],
  },
  'HESAP|Nominal dikim dakikası / ay': {
    id: 'hesap.nominal-dikim-dk', alan: 'nominalDikimDk', kod: 'lib/pes/ekonomi-hesap.ts#nominalDikimDk',
    girdiler: [E('Dikim kişi', 'giris.sewing_staff'), E('Günlük saat', 'giris.hours_per_day'),
      E('Nominal gün', 'giris.nominal_days')],
  },
  'HESAP|Fiili dikim dakikası / ay': {
    id: 'hesap.fiili-dikim-dk', alan: 'fiiliDikimDk', kod: 'lib/pes/ekonomi-hesap.ts#fiiliDikimDk',
    girdiler: [E('Dikim kişi', 'giris.sewing_staff'), E('Günlük saat', 'giris.hours_per_day'),
      E('Fiili gün', 'giris.actual_days')],
  },
  'HESAP|Üretim kişi-dakikası': {
    id: 'hesap.uretim-kisi-dk', alan: 'uretimKisiDk', kod: 'lib/pes/ekonomi-hesap.ts#uretimKisiDk',
    girdiler: [E('Üretim kişi', 'rasyo.uretimKisi'), E('Günlük saat', 'giris.hours_per_day'),
      E('Nominal gün', 'giris.nominal_days')],
  },
  'HESAP|Kişi-dakika maliyeti': {
    id: 'hesap.kisi-dk-maliyet', alan: 'kisiDkMaliyet', kod: 'lib/pes/ekonomi-hesap.ts#kisiDkMaliyet',
    girdiler: [E('Net gider', 'rasyo.netGider'), E('Üretim kişi-dakikası', 'rasyo.uretimKisiDk')],
  },
  /* Tek Excel satırı ÜÇ rasyo hesaplıyor — alan bu yüzden dizi. */
  'HESAP|KESİM / DİKİM / UKP dk maliyeti': {
    id: 'hesap.bolum-dk-maliyet',
    alan: ['kesimDkMaliyet', 'dikimDkMaliyet', 'ukpDkMaliyet'],
    kod: 'lib/pes/ekonomi-hesap.ts#bolumDkMaliyet',
    girdiler: [E('Net gider', 'rasyo.netGider'), E('Kesim ağırlığı', 'param.weight_cutting'),
      E('Dikim ağırlığı', 'param.weight_sewing'), E('UKP ağırlığı', 'param.weight_ukp'),
      E('Üretim kişi-dakikası', 'rasyo.uretimKisiDk')],
  },
  'HESAP|Dikim dk cirosu': {
    id: 'hesap.dikim-dk-ciro', alan: 'dikimDkCiro', kod: 'lib/pes/ekonomi-hesap.ts#dikimDkCiro',
    girdiler: [E('Aylık ciro', 'rasyo.aylikCiro'), E('Nominal dikim dakikası', 'rasyo.nominalDikimDk')],
  },
  'HESAP|Dakika marjı': {
    id: 'hesap.dakika-marji', alan: 'dakikaMarji', kod: 'lib/pes/ekonomi-hesap.ts#dakikaMarji',
    girdiler: [E('Kâr / zarar', 'rasyo.karZarar'), E('Nominal dikim dakikası', 'rasyo.nominalDikimDk')],
  },
  'HESAP|Fiili dikim dk maliyeti': {
    id: 'hesap.fiili-dikim-dk-maliyet', alan: 'fiiliDikimDkMaliyet', kod: 'lib/pes/ekonomi-hesap.ts#fiiliDikimDkMaliyet',
    girdiler: [E('Net gider', 'rasyo.netGider'), E('Fiili dikim dakikası', 'rasyo.fiiliDikimDk')],
  },
  'HESAP|Asgari dakika çarpanı': {
    id: 'hesap.asgari-dk-carpani', alan: 'asgariDkCarpani', kod: 'lib/pes/ekonomi-hesap.ts#asgariDkCarpani',
    girdiler: [E('Net gider', 'rasyo.netGider'), E('Nominal dikim dakikası', 'rasyo.nominalDikimDk'),
      E('İşveren maliyeti', 'param.employer_cost'), E('Nominal gün', 'param.nominal_days')],
  },
  'HESAP|Dikim dakikası / adet': {
    id: 'hesap.dikim-dk-adet', alan: 'dikimDkAdet', kod: 'lib/pes/ekonomi-hesap.ts#dikimDkAdet',
    girdiler: [E('Nominal dikim dakikası', 'rasyo.nominalDikimDk'), E('Aylık adet', 'rasyo.aylikAdet')],
  },
  'HESAP|Başabaş fiyat / adet': {
    id: 'hesap.basabas-fiyat', alan: 'basabasFiyat', kod: 'lib/pes/ekonomi-hesap.ts#basabasFiyat',
    girdiler: [E('Net gider', 'rasyo.netGider'), E('Aylık adet', 'rasyo.aylikAdet')],
  },
  'HESAP|Adil fiyat / adet': {
    id: 'hesap.adil-fiyat', alan: 'adilFiyat', kod: 'lib/pes/ekonomi-hesap.ts#adilFiyat',
    girdiler: [E('Başabaş fiyat', 'rasyo.basabasFiyat'), E('Hedef marj', 'param.target_margin')],
  },
  'HESAP|Fiyat sapması': {
    id: 'hesap.fiyat-sapmasi', alan: 'fiyatSapmasi', kod: 'lib/pes/ekonomi-hesap.ts#fiyatSapmasi',
    girdiler: [E('Ortalama fiyat', 'rasyo.ortFiyatAdet'), E('Adil fiyat', 'rasyo.adilFiyat')],
  },
  'HESAP|İşçilik yük katsayısı': {
    id: 'hesap.iscilik-yuk', alan: 'iscilikYukKatsayisi', kod: 'lib/pes/ekonomi-hesap.ts#iscilikYukKatsayisi',
    girdiler: [E('İşçilik toplamı', 'rasyo.iscilikToplam'), E('Alınan teşvik', 'gider.incentive_amount')],
  },
  'HESAP|Marj sırası': {
    id: 'hesap.marj-sirasi', alan: 'marjSirasi', kod: 'lib/pes/ekonomi-akran.ts#marjSirasi',
    girdiler: [E('Marj %', 'rasyo.marj')],
  },
  'HESAP|3D referans dk maliyeti': {
    id: 'hesap.referans-3d', alan: 'referans3D', kod: null,
    girdiler: [E('Atölye bölgesi', 'atolye.bolge')],
  },
  'HESAP|Dikim dk maliyeti ÷ 3D referans': {
    id: 'hesap.3d-oran', alan: 'dkMaliyet3DOran', kod: 'lib/pes/ekonomi-hesap.ts#dkMaliyet3DOran',
    girdiler: [E('Dikim dk maliyeti', 'rasyo.dikimDkMaliyet'), E('3D referans', 'rasyo.referans3D')],
  },
  'MODEL_HESAP|Bölüm dk maliyetleri': {
    id: 'model.bolum-dk', alan: null, kod: 'lib/pes/model-fiyat.ts#modelFiyati', girdiler: [],
  },
  'MODEL_HESAP|Gerçek dakika / adet (kesim, dikim, UKP)': {
    id: 'model.gercek-dakika', alan: null, kod: 'lib/pes/model-fiyat.ts#gercekDakika',
    girdiler: [E('Dikim verimliliği', 'param.eff_sewing'), E('Kesim verimliliği', 'param.eff_cutting'),
      E('UKP verimliliği', 'param.eff_ukp')],
  },
  'MODEL_HESAP|Bölüm maliyeti / adet': {
    id: 'model.bolum-maliyet', alan: null, kod: 'lib/pes/model-fiyat.ts#bolumMaliyeti', girdiler: [],
  },
  'MODEL_HESAP|Kâr / zarar / adet': {
    id: 'model.kar-zarar', alan: null, kod: 'lib/pes/model-fiyat.ts#modelFiyati', girdiler: [],
  },
  'MODEL_HESAP|Marj %': {
    id: 'model.marj', alan: null, kod: 'lib/pes/model-fiyat.ts#modelFiyati', girdiler: [],
  },
  'MODEL_HESAP|Adil fiyat': {
    id: 'model.adil-fiyat', alan: null, kod: 'lib/pes/model-fiyat.ts#modelFiyati',
    girdiler: [E('Hedef marj', 'param.target_margin')],
  },
  'MODEL_HESAP|Günlük dikim dakika ihtiyacı': {
    id: 'model.gunluk-dk-ihtiyac', alan: null, kod: 'lib/pes/model-fiyat.ts#modelFiyati', girdiler: [],
  },
  'MODEL_HESAP|Atölye günlük dikim kapasitesi': {
    id: 'model.gunluk-kapasite', alan: null, kod: 'lib/pes/model-fiyat.ts#modelFiyati',
    girdiler: [E('Dikim kişi', 'giris.sewing_staff'), E('Günlük saat', 'giris.hours_per_day')],
  },
  'MODEL_HESAP|Kapasite payı': {
    id: 'model.kapasite-payi', alan: null, kod: 'lib/pes/model-fiyat.ts#modelFiyati', girdiler: [],
  },
  'MODEL_HESAP|Aylık sonuç': {
    id: 'model.aylik-sonuc', alan: null, kod: 'lib/pes/model-fiyat.ts#modelFiyati', girdiler: [],
  },
  'MODEL_HESAP|Hüküm': {
    id: 'model.hukum', alan: null, kod: 'lib/pes/model-fiyat.ts#hukum', girdiler: [],
  },
  'MODEL_HESAP|3D referans maliyet / adet': {
    id: 'model.referans-3d', alan: null, kod: 'lib/pes/model-fiyat.ts#modelFiyati', girdiler: [],
  },
  'MODEL_HESAP|CMT ÷ 3D referans − 1': {
    id: 'model.cmt-3d-sapma', alan: null, kod: 'lib/pes/model-fiyat.ts#modelFiyati', girdiler: [],
  },
  'OZET|Medyan / en düşük / en yüksek': {
    id: 'ozet.medyan', alan: null, kod: 'lib/pes/ekonomi-akran.ts#medyan', girdiler: [],
  },
  'OZET|Marj sıralaması': {
    id: 'ozet.marj-siralamasi', alan: null, kod: 'lib/pes/ekonomi-akran.ts#marjSirasi', girdiler: [],
  },
  'Gider fonksiyonu (pano 07 / B)|Tahmini aylık gider': {
    id: 'pano.gider-fonksiyonu', alan: null, kod: null,
    girdiler: [E('Maaş / kişi', 'rasyo.maasKisi'), E('İşçilik yük katsayısı', 'rasyo.iscilikYukKatsayisi'),
      E('İşçilik dışı / kişi', 'rasyo.iscilikDisiKisi')],
  },
  'Pano 02–03|Yüzdelik skor (0–100)': {
    id: 'pano.yuzdelik-skor', alan: null, kod: 'lib/pes/ekonomi-akran.ts#yuzdelikSkor', girdiler: [],
  },
  'Pano 05|Fiyat endeksi': {
    id: 'pano.fiyat-endeksi', alan: 'fiyatEndeksi', kod: 'lib/pes/ekonomi-akran.ts#fiyatEndeksi',
    girdiler: [E('Dikim dk cirosu', 'rasyo.dikimDkCiro')],
  },
}

const KAYNAK_ADI = (sayfa) =>
  sayfa === 'PARAMETRE' || sayfa === 'HESAP' || sayfa === 'MODEL_HESAP' || sayfa === 'OZET'
    ? sayfa
    : 'PANO'

const wb = XLSX.readFile(KAYNAK)
const ham = XLSX.utils.sheet_to_json(wb.Sheets['FORMULLER'], { header: 1, blankrows: true, defval: null })
const satirlar = ham.slice(3).filter((r) => r && r[1])

const eksik = []
const girisler = []
const gorulenId = new Set()

for (const r of satirlar) {
  const [sayfa, gosterge, sozel, excel, okuma] = r
  const anahtar = `${sayfa}|${gosterge}`
  const es = ESLEME[anahtar]
  if (!es) { eksik.push(anahtar); continue }
  if (gorulenId.has(es.id)) { eksik.push(`YINELENEN id: ${es.id}`); continue }
  gorulenId.add(es.id)
  girisler.push({
    id: es.id,
    kaynak: KAYNAK_ADI(sayfa),
    etiket: String(gosterge),
    sozel: String(sozel ?? ''),
    excel: excel ? String(excel) : null,
    okuma: String(okuma ?? ''),
    /* Tek satır birden çok rasyo hesaplayabilir (bölüm dk maliyeti) — hep dizi. */
    alanlar: es.alan === null ? [] : [].concat(es.alan),
    kod: es.kod,
    girdiler: es.girdiler,
  })
}

if (eksik.length) {
  console.error(`✗ ${eksik.length} satırın eşlemesi yok — hiçbir şey yazılmadı:`)
  eksik.forEach((k) => console.error('   ', k))
  process.exit(1)
}

const q = (s) => (s === null ? 'null' : `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)

const govde = girisler.map((g) => {
  const gr = g.girdiler.length
    ? g.girdiler.map((x) => `\n      { etiket: ${q(x.etiket)}, anahtar: ${q(x.anahtar)} },`).join('') + '\n    '
    : ''
  return `  {
    id: ${q(g.id)},
    kaynak: ${q(g.kaynak)},
    etiket: ${q(g.etiket)},
    sozel: ${q(g.sozel)},
    excel: ${q(g.excel)},
    okuma: ${q(g.okuma)},
    alanlar: [${g.alanlar.map(q).join(', ')}],
    kod: ${q(g.kod)},
    girdiler: [${gr}],
  },`
}).join('\n')

const ustyazi = `/**
 * Formül kataloğu — Atolye_Gider_Model.xlsx FORMULLER sayfasının PES karşılığı.
 *
 * ÜRETİLMİŞ DOSYA: scripts/uret_formul_katalogu.mjs ile yeniden üretilir.
 * Elle düzenlenebilir ama Excel'den yeniden üretilince değişiklik kaybolur —
 * kalıcı düzeltme betiğin ESLEME tablosuna yazılmalı.
 *
 * NEDEN OKUNUR-YAZILAMAZ: Katalog hesabı YAPMAZ, anlatır. Bir satırı
 * veritabanından düzenlenebilir yapmak hesabı değiştirmez; yalnız
 * ekonomi-hesap.ts'ten sessizce sapan, doğru görünen yanlış bir belge üretir.
 * Değişebilen şey parametrelerdir (economy_param, /pes/ekonomi/parametre).
 *
 * girdiler BAŞLICA girdileri gösterir, tam liste olmak zorunda değil —
 * brüt gider gibi 27 kalemli satırlarda hepsini listelemek izi okunmaz yapar.
 */

/** Katalog girişinin geldiği Excel sayfası. Pano satırları 'PANO' altında toplanır. */
export type FormulKaynak = 'PARAMETRE' | 'HESAP' | 'MODEL_HESAP' | 'OZET' | 'PANO'

/** Hesap izinde gösterilecek bir girdi; anahtar değer havuzuna işaret eder. */
export type FormulGirdi = {
  etiket: string
  /** 'rasyo.<alan>' | 'param.<alan>' | 'giris.<alan>' | 'gider.<alan>' | 'atolye.<alan>' */
  anahtar: string
}

export type FormulGirdisi = {
  id: string
  kaynak: FormulKaynak
  etiket: string
  /** Sözel formül — Excel'in "Formül (sözle)" sütunu. */
  sozel: string
  /** Excel karşılığı; referans amaçlı, PES bunu çalıştırmaz. */
  excel: string | null
  /** "Nasıl okunur / neden" — eşikler, tipik aralıklar, bilinen tuzaklar. */
  okuma: string
  /**
   * Bu formülün hesapladığı EkonomiRasyo alanları (ya da marjSirasi /
   * fiyatEndeksi). Model ve pano satırlarında boş. Bölüm dakika maliyeti
   * gibi tek satırın üç alan ürettiği durumlar olduğu için dizi.
   */
  alanlar: string[]
  /** 'dosya#fonksiyon' — testle gerçekten dışa aktarıldığı doğrulanır. */
  kod: string | null
  girdiler: FormulGirdi[]
}

export const FORMUL_KATALOGU: FormulGirdisi[] = [
${govde}
]

/** id → giriş. Derin bağlantı (?formul=hesap.marj) bunu kullanır. */
export function formulBul(id: string): FormulGirdisi | null {
  return FORMUL_KATALOGU.find((f) => f.id === id) ?? null
}

/** Bir rasyo alanının katalog girişi; radardan formüle geçiş için. */
export function alanFormulu(alan: string): FormulGirdisi | null {
  return FORMUL_KATALOGU.find((f) => f.alanlar.includes(alan)) ?? null
}
`

writeFileSync(HEDEF, ustyazi, 'utf8')
console.log(`✓ ${girisler.length} giriş yazıldı → lib/pes/formul-katalogu.ts`)
const dagilim = {}
girisler.forEach((g) => { dagilim[g.kaynak] = (dagilim[g.kaynak] ?? 0) + 1 })
console.log('  kaynak dağılımı:', JSON.stringify(dagilim))
console.log(`  rasyo alanına bağlı: ${girisler.filter((g) => g.alanlar.length).length} giriş, ${girisler.reduce((t, g) => t + g.alanlar.length, 0)} alan`)
