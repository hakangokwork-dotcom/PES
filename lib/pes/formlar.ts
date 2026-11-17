/* 059: üretim formları — "Tutulması Gereken Formlar Family.xlsx"in dijitali.
 *
 * Her form: üst alanlar + bir ya da birkaç tablo. Tablo ya sabit satırlı
 * (ölçü noktaları, bakım adımları, hata bölgeleri) ya serbest satırlı
 * (günlük kayıt defterleri). Kayıt uretim_formu.veri'de durur:
 *   { alanlar: { ad: değer }, tablolar: { tabloAd: [ { sütunAd: değer } ] } }
 * Sipariş no / model / müşteri PO'dan okunur, formda tekrar sorulmaz.
 * Islak imza yerine "kim girdi" kaydı (054) ve ad-soyad alanı.
 */

export type AlanTipi = 'metin' | 'uzun' | 'sayi' | 'tarih' | 'saat' | 'evet_hayir' | 'onay' | 'secim'
export type Alan = { ad: string; etiket: string; tip?: AlanTipi; secenekler?: string[] }
export type Tablo = {
  ad: string; etiket: string; satirlar?: string[]; satirBasligi?: string; sutunlar: Alan[]
  /** Sayı sütunlarının altına toplam satırı (adet tabloları; ölçü tablolarında anlamsız). */
  toplam?: boolean
}
export type FormTanimi = {
  kod: string
  ad: string
  grup: string
  /** Önerilen bağ: true ise yeni kayıtta PO seçimi öne çıkar. PO her formda seçmeli. */
  po: boolean
  belge?: string
  alanlar: Alan[]
  tablolar: Tablo[]
}
export type Deger = string | number | boolean | null
export type FormVerisi = { alanlar: Record<string, Deger>; tablolar: Record<string, Record<string, Deger>[]> }

const m = (ad: string, etiket: string): Alan => ({ ad, etiket })
const s = (ad: string, etiket: string): Alan => ({ ad, etiket, tip: 'sayi' })
const u = (ad: string, etiket: string): Alan => ({ ad, etiket, tip: 'uzun' })
const eh = (ad: string, etiket: string): Alan => ({ ad, etiket, tip: 'evet_hayir' })
const ok = (ad: string, etiket: string): Alan => ({ ad, etiket, tip: 'onay' })
const tarih: Alan = { ad: 'tarih', etiket: 'Tarih', tip: 'tarih' }
const saat: Alan = { ad: 'saat', etiket: 'Saat', tip: 'saat' }
const saatli = (on: string, saatler: string[], tip: AlanTipi = 'sayi'): Alan[] =>
  saatler.map(h => ({ ad: `${on}_${h.replace(':', '')}`, etiket: h, tip }))

const ARA_SAATLER = ['08:30', '10:30', '12:30', '15:30', '18:00']
const TEST_SAATLER = ['10:00', '12:00', '14:00', '16:00']

const UST_ARA_NOKTALAR = [
  'Arka ortadan boy', 'Roba boyu arka ortadan', 'Göğüs genişliği', 'Omuzdan omuza',
  'Etek ucu genişliği - düz', 'Kol evi - düz', 'Pazu genişliği', 'Kol boyu - rib./manşet dahil',
  'Kol ağzı genişliği - uzun kol', 'Üst yaka uzunluğu', 'Yaka altından yaka uzunluğu',
  'Ayak altından yaka uzunluğu', 'Arka ortadan yaka yüksekliği', 'Yaka ucu yüksekliği',
  'Arka ortadan yaka ayağı yüksekliği', 'Düğme/çıtçıt sayısı', '1. düğme yeri / yaka evinin altından',
  'Düğme/çıtçıt aralığı', 'Pat genişliği', 'Apartura eni', 'Apartura boyu',
  'Manşet / rib. yüksekliği', 'Apolet yeri - kol tepesinden', 'Apolet eni', 'Apolet boyu',
]
const ALT_NOKTALAR = [
  'Bel genişliği durgun', 'Bel genişliği gergin', 'Basen noktası', 'Basen genişliği',
  'Baldır genişliği', 'Ön yükseklik kemer hariç', 'Arka yükseklik kemer hariç', 'Diz genişliği',
  'Paça genişliği', 'İç boy kısa', 'İç boy uzun', 'Yan boy', 'Yan cep boyu', 'Yan cep genişliği',
  'Arka cep boyu', 'Arka cep genişliği', 'Kemer yüksekliği',
]
const UST_FINAL_NOKTALAR = [
  'Arka ortadan boy', 'Ön boy omuzdan', 'Göğüs genişliği', 'Etek ucu genişliği', 'Omuz genişliği',
  'Kol evi genişliği', 'Kol boyu', 'Kol ağzı genişliği', 'Omuzdan omuza', 'Arka genişlik',
  'Yaka uzunluğu', 'Yaka açıklığı dikişten dikişe', 'Roba uzunluğu', 'Cep yeri', 'Cep uzunluğu',
  'Cep genişliği',
]
const HATA_TURLERI: Alan[] = [
  s('sokuk', 'Sökük'), s('patlak', 'Patlak'), s('egrilik', 'Eğrilik'), s('atlama', 'Atlama'),
  s('pase', 'Pase'), s('esitsizlik', 'Eşitsizlik'), s('dikis_dusmesi', 'Dikiş düşmesi'), s('defo', 'Defo'),
]

const ARA_OLCU_ALANLAR = [m('renk', 'Renk'), m('beden', 'Beden'), m('kontrol_eden', 'Kontrol eden (ad soyad)')]
const araOlcuTablosu = (noktalar: string[]): Tablo => ({
  ad: 'olcumler', etiket: 'Ölçümler (cm)', satirBasligi: 'Ölçüm noktası', satirlar: noktalar,
  sutunlar: [s('referans', 'Referans'), ...saatli('s', ARA_SAATLER)],
})
const FINAL_SONUC: Alan = { ad: 'sonuc', etiket: 'Ölçü sonucu', tip: 'secim', secenekler: ['Kabul', 'Tolerans dahilinde', 'Tolerans dışı', 'Ticari karar gerektirir'] }
const FINAL_ALANLAR = [
  m('renk', 'Renk'), m('beden', 'Beden'), m('model_tanimi', 'Model tanımı'), m('inspector', 'Inspector'),
  m('merchandiser', 'Müşteri merchandiser'), FINAL_SONUC, u('aciklama', 'Açıklama'),
  m('qa_imza_1', 'Müşteri QA/QC 1'), m('qa_imza_2', 'Müşteri QA/QC 2'), m('uretici_temsilcisi', 'Üretici temsilcisi'),
]
const finalTablosu = (noktalar: string[]): Tablo => ({
  ad: 'olcumler', etiket: 'Ölçümler (cm)', satirBasligi: 'Ölçüm noktası', satirlar: noktalar,
  sutunlar: [s('spec', 'Spec'), s('n1', '1'), s('n2', '2'), s('n3', '3'), s('n4', '4')],
})

const AQL_HATALAR = [
  ...['Bakım etiketinde hatalı/eksik menşei', 'Etikette eksik/hatalı kumaş içeriği', 'Eksik/hatalı fiyat bilgisi',
    'Eksik/hatalı barkod etiket içeriği', 'Eksik, hatalı, okunaksız etiket', 'Hatalı etiket/logo yerleşimi', 'Diğer']
    .map(h => `Etiket · ${h}`),
  ...['Gri hata', 'Mavi hata', 'Kesici, sivri metal/plastik aksesuar', 'Gevşek tutturulmuş aksesuar (çıtçıt, düğme, kuşgözü)',
    'Yabancı nesne (yaprak, taş vs.)', 'Diğer'].map(h => `Güvenlik · ${h}`),
  ...['Dokuma/örme hatası', 'Yabancı elyaf', 'Yırtık/delik, ilmek kaçığı', 'Tüylenme/sararma', 'Kumaş kat izi', 'Diğer']
    .map(h => `Kumaş · ${h}`),
  ...['Eğri baskı ya da yanlış baskı yeri', 'Baskı hatası', 'Baskı lekesi, çatlama, sararma', 'Eğri nakış, yanlış nakış yeri',
    'Nakış hatası', 'Nakış sonucu kumaşta delik', 'Nakış bölgesinde büzme/çekme', 'Aplike patlağı, sararma', 'Diğer']
    .map(h => `Baskı/Nakış · ${h}`),
  ...['Aynı bedende renk farkı', 'Kumaşın/ürünün boya vermesi', 'Tuşe farkı', 'Yıkama efekt farkı', 'Boyama/yıkama abrajı', 'Diğer']
    .map(h => `Boyama/Yıkama · ${h}`),
  ...['Sökük, patlak', 'Dikiş atlaması, dikiş düşmesi', 'Hatalı dikiş tansiyonu (büzgü, gevşek)', 'Büzgü eşitsizliği',
    'Dikiş dönmesi, kaptırma', 'Düzensiz birleşen dikiş, kötü tamir', 'Makine ayak izi, parlama', 'İğne izi, iğne hasarı',
    'Eğri dikiş', 'Diğer'].map(h => `Dikim · ${h}`),
  ...['Eğri, ortalanmamış pat', 'Etek, paça eğriliği', 'Eğri ve eşitsiz cep', 'Simetri parçalarda eşitsizlik',
    'Dönme (yaka, kol, paça, yan)', 'Tela lekesi, parlama', 'Temizlenmemiş iplik', 'Temizlenmemiş meto, meto lekesi',
    'Küf, pas, nem, rutubet, ağır koku', 'Kir lekesi', 'İşaret kalem izi', 'Yağ lekesi', 'Ütü hatası, parlama, yanık izi',
    'Hatalı paketlemeden parlama (askı, toka, düğme)', 'Diğer'].map(h => `Görünüm/Temizlik/Ütü · ${h}`),
  ...['Düğme, çıtçıt, rivet, kuşgözü kopması', 'Hatalı/eksik aksesuar', 'Birleştirme aksesuarında hatalı boyut',
    'Etiket/aksesuarın boya vermesi', 'Diğer'].map(h => `Aksesuar · ${h}`),
]
const AQL_KALMA_NEDENLERI = [
  'Hata limit aşımı', 'Gri hata', 'Ölçü hatası', 'Mavi hata', 'Aynı lotta/kolide renk farkı', 'Kötü koku',
  'Asorti hatası', 'Çocuk güvenliğine aykırı durum', 'Yanlış ambalajlama', 'Ürün iğne dedektöründen geçmiyor',
  'Üretim gold seal numunesinden farklı', 'Jelatin ve lot poşet kalitesi uygun değil',
  'Lot poşetinde 4,5 cm şeffaf bant kullanılmamış', 'Koli kalitesi uygun değil',
]

export const FORMLAR: FormTanimi[] = [
  {
    kod: 'risk_analizi', ad: 'Risk Analizi', grup: 'Hazırlık', po: true,
    alanlar: [m('kumas_cinsi', 'Kumaş cinsi'), u('aksesuar', 'Aksesuar bilgileri'), u('on_hazirlik', 'Ön hazırlık gerektiren noktalar'),
      u('kalip', 'Kalıp'), u('kesim', 'Kesim'), u('dikim', 'Dikim'), u('utu_kontrol', 'Ütü kontrol'), u('paket', 'Paket')],
    tablolar: [{ ad: 'katilimcilar', etiket: 'Katılımcılar', sutunlar: [m('ad_soyad', 'Ad soyad'), m('gorev', 'Görev'), ok('onay', 'Onayladı')] }],
  },
  {
    kod: 'makine_bakim', ad: 'Makine Temizlik-Bakım', grup: 'Makine', po: false,
    alanlar: [m('makine_no', 'Makine no'), m('seri_no', 'Seri no'), m('bakim_sorumlusu', 'Bakım sorumlusu')],
    tablolar: [{
      ad: 'adimlar', etiket: 'Haftalık kontrol (tarih = haftanın pazartesisi)', satirBasligi: 'Adım',
      satirlar: [
        'Günlük · İşe başlamadan önce makine iğnesi kontrol edilir',
        'Günlük · Gün sonunda makine içi hava ile temizlenir',
        'Günlük · Gün sonunda makine yüzeyi hava ile temizlenir',
        'Günlük · Ayak altına kumaş konup yağ sızıntısı kontrol edilir',
        'Günlük · Deneme parçasıyla baskı, bıçak, tansiyon, adım ve iğne ucu kontrolü',
        'Günlük · İğne ayağı ve plaka parçaları temizlenip yerine takılır',
        'Haftalık · Plaka parçaları sökülüp makine içi temizlenir',
      ],
      sutunlar: [ok('pzt', 'Pzt'), ok('sal', 'Sal'), ok('car', 'Çar'), ok('per', 'Per'), ok('cum', 'Cum'), ok('cmt', 'Cmt'), ok('haftalik', 'Haftalık')],
    }],
  },
  {
    kod: 'kirik_igne', ad: 'Kırık / Değişen İğne Takibi', grup: 'İğne & Metal', po: false, belge: 'FM.226 Rev.03 · PR 239',
    alanlar: [m('igne_kodu', 'İğne kodu'), m('onaylayan', 'Onaylayan bölüm yöneticisi')],
    tablolar: [{
      ad: 'kayitlar', etiket: 'Kırık iğne kayıtları (iğne parçaları fiziksel olarak saklanır)',
      sutunlar: [m('makine_no', 'Makine no'), m('operasyon', 'Operasyon'), m('operator', 'Operatör'), tarih, saat,
        m('siparis_no', 'Sipariş no'), m('model', 'Model'), m('renk', 'Renk'),
        eh('parcalar_bulundu', 'Tüm parçalar bulundu mu?'), eh('imha_edildi', 'Bulunmadıysa ürünler imha edildi mi?')],
    }],
  },
  {
    kod: 'inline_kalite', ad: 'Hat İçi Kalite Kontrol', grup: 'Kalite', po: true,
    alanlar: [m('bant', 'Bant / hat')],
    tablolar: [{
      ad: 'operatorler', etiket: 'Saatlik kontrol (bakılan / hata)', toplam: true,
      sutunlar: [m('operator', 'Operatör'), m('operasyon', 'Operasyon'),
        ...[1, 2, 3, 4, 5, 6, 7].flatMap(i => [s(`b${i}`, `${i}. saat bakılan`), s(`h${i}`, `${i}. saat hata`)]),
        s('sari_bayrak', 'Sarı bayrak'), s('kirmizi_bayrak', 'Kırmızı bayrak')],
    }],
  },
  { kod: 'ara_olcu_ust', ad: 'Dikim Ara Ölçü — Üst (yıkama öncesi)', grup: 'Ölçü', po: true, alanlar: ARA_OLCU_ALANLAR, tablolar: [araOlcuTablosu(UST_ARA_NOKTALAR)] },
  { kod: 'ara_olcu_alt', ad: 'Dikim Ara Ölçü — Alt', grup: 'Ölçü', po: true, alanlar: ARA_OLCU_ALANLAR, tablolar: [araOlcuTablosu(ALT_NOKTALAR)] },
  { kod: 'final_olcu_ust', ad: 'Final AQL Ölçü — Üst', grup: 'Ölçü', po: true, belge: 'FM 214', alanlar: FINAL_ALANLAR, tablolar: [finalTablosu(UST_FINAL_NOKTALAR)] },
  { kod: 'final_olcu_alt', ad: 'Final AQL Ölçü — Alt', grup: 'Ölçü', po: true, belge: 'FM 214 · PR 231', alanlar: FINAL_ALANLAR, tablolar: [finalTablosu(ALT_NOKTALAR)] },
  {
    kod: 'dugme_cekme', ad: 'Dikme Düğme Çekme Kontrolü', grup: 'Aksesuar testi', po: true, belge: 'FM 2653',
    alanlar: [m('renk', 'Renk'), m('kontrol_eden', 'Kontrol eden'), m('uretim_sorumlusu', 'Üretim sorumlusu')],
    tablolar: [{ ad: 'testler', etiket: 'Çekme testi değerleri', sutunlar: [tarih, m('malzeme', 'Malzeme'),
      m('bolge', 'Üründeki bölge (manşet, yaka, cep…)'), ...saatli('c', TEST_SAATLER)] }],
  },
  {
    kod: 'cakim_proses', ad: 'Çakım Proses Kontrolü', grup: 'Aksesuar testi', po: true, belge: 'FM 2654',
    alanlar: [m('kontrol_eden', 'Kontrol eden'), m('uretim_sorumlusu', 'Üretim sorumlusu')],
    tablolar: [{ ad: 'testler', etiket: 'Ölçüm yüksekliği ve çekme testi', sutunlar: [tarih, m('renk', 'Renk'), m('malzeme', 'Malzeme'),
      m('bolge', 'Üründeki bölge'),
      ...saatli('y', TEST_SAATLER).map(a => ({ ...a, etiket: `Yükseklik ${a.etiket}` })),
      ...saatli('c', TEST_SAATLER).map(a => ({ ...a, etiket: `Çekme ${a.etiket}` }))] }],
  },
  {
    kod: 'metal_kontrol', ad: 'Metal Dedektör Ürün Kontrolü', grup: 'İğne & Metal', po: true,
    alanlar: [m('firma_yetkilisi', 'Firma yetkilisi')],
    tablolar: [{ ad: 'kayitlar', etiket: 'Dedektörden geçen ürünler', toplam: true, sutunlar: [tarih, m('ozel_kod', 'Özel kod'), m('renk', 'Renk'),
      s('gecen', 'Geçen adet'), s('gecti', 'Geçti'), s('kaldi', 'Kaldı'), m('not', 'Not')] }],
  },
  {
    kod: 'metal_kalibrasyon', ad: 'Metal Dedektör Günlük Kalibrasyon', grup: 'İğne & Metal', po: false,
    alanlar: [],
    tablolar: [{ ad: 'kayitlar', etiket: 'Kalibrasyon kayıtları', sutunlar: [tarih, saat, eh('kalibre_oldu', 'Kalibre oldu mu?'), m('sorumlu', 'Sorumlu')] }],
  },
  {
    kod: 'metal_karantina', ad: 'Metal Dedektör Karantina', grup: 'İğne & Metal', po: false,
    alanlar: [m('firma_yetkilisi', 'İmha tutanağı · firma yetkilisi'), m('musteri_yetkilisi', 'İmha tutanağı · müşteri yetkilisi')],
    tablolar: [{ ad: 'kayitlar', etiket: 'Karantina kayıtları', sutunlar: [tarih, m('model', 'Model'), s('hatali_adet', 'Hatalı adet'),
      m('yetkili', 'Yetkili personel'), m('sonuc', 'Sonuç')] }],
  },
  {
    kod: 'metal_alan_giris', ad: 'Metalden Arındırılmış Bölge Giriş-Çıkış', grup: 'İğne & Metal', po: false,
    alanlar: [],
    tablolar: [{ ad: 'kayitlar', etiket: 'Giriş-çıkış', sutunlar: [tarih, { ad: 'giris', etiket: 'Giriş saati', tip: 'saat' },
      { ad: 'cikis', etiket: 'Çıkış saati', tip: 'saat' }, m('ad_soyad', 'Ad soyad')] }],
  },
  {
    kod: 'hata_ust', ad: 'Kalite Kontrol Hata Formu — Üst', grup: 'Kalite', po: true,
    alanlar: [m('bolum', 'Bölüm'), s('kontrol_adedi', 'Kontrol adedi'), m('operator', 'Operatör ad soyad')],
    tablolar: [{ ad: 'hatalar', etiket: 'Bölge × hata türü (adet)', toplam: true, satirBasligi: 'Bölge', sutunlar: HATA_TURLERI,
      satirlar: ['Yaka', 'Omuz', 'Kol evi', 'Apartura-biye', 'Manşet', 'Ön pat', 'Cep', 'Roba', 'Yan çatma', 'Etek', 'Fermuar',
        'Cep kapağı', 'Fleto', 'Apolet', 'Etiket', 'İlik', 'Düğme', 'Pens', 'Kuşak', 'Köprü'] }],
  },
  {
    kod: 'hata_alt', ad: 'Kalite Kontrol Hata Formu — Alt', grup: 'Kalite', po: true,
    alanlar: [m('bolum', 'Bölüm'), s('kontrol_adedi', 'Kontrol adedi'), m('operator', 'Operatör ad soyad')],
    tablolar: [{ ad: 'hatalar', etiket: 'Bölge × hata türü (adet)', toplam: true, satirBasligi: 'Bölge', sutunlar: HATA_TURLERI,
      satirlar: ['Kemer', 'Köprü', 'Ön cep torba', 'Patlet', 'Fermuar', 'Ön ağ alt bağlama', 'Conta', 'Kemer arka cep', 'Arka ağ',
        'Paça', 'İç boy', 'Yan dikiş', 'İlik', 'Punteriz hatası', 'Renk farkı', 'Leke', 'Kumaş hatası', 'Rivet', 'Çakma düğme', 'Dikme düğme'] }],
  },
  {
    kod: 'aql_inspection', ad: 'Tedarikçi AQL Raporu (Inspection)', grup: 'Final', po: true,
    alanlar: [
      { ad: 'kontrol_tekrari', etiket: 'Kontrol tekrarı', tip: 'secim', secenekler: ['1', '2', '3', '4'] }, m('seri_no', 'Seri no'),
      m('buyer', 'Müşteri buyer'), m('tedarik_birimi', 'Tedarik birimi'), m('ulke', 'Ülke'), m('mumessil', 'Mümessil firma'),
      m('merch_alt_grubu', 'Merch alt grubu'), m('ozel_kod', 'Özel kodu'), m('kumas_cinsi', 'Kumaş cinsi'), m('urun_grubu', 'Ürün grubu'),
      m('renk', 'Renk'), m('renk_kodu', 'Renk kodu'), s('hazir_lot', 'Hazır lot'), s('hazir_urun', 'Hazır ürün'),
      s('acilan_lot', 'Açılan lot'), s('kontrol_adedi', 'Kontrol adedi'),
      { ad: 'kontrol_tipi', etiket: 'Kontrol tipi ve seviyesi (AQL 2,5)', tip: 'secim', secenekler: ['Normal I', 'Normal II', 'Normal III', 'Sıkı I', 'Sıkı II'] },
      s('sinir_kritik', 'Hata sınırı · kritik'), s('sinir_major', 'Hata sınırı · majör'), s('sinir_minor', 'Hata sınırı · minör'),
      { ad: 'sonuc', etiket: 'Sonuç', tip: 'secim', secenekler: ['Geçti', 'Kaldı'] }, eh('olcu_tolerans', 'Ölçüler tolerans dahilinde mi?'),
      u('bekleme_nedeni', 'Bekleme nedeni'), u('alinan_onaylar', 'Alınan onaylar'),
      m('aql_uzmani_1', 'Tedarikçi AQL uzmanı 1'), m('aql_uzmani_2', 'Tedarikçi AQL uzmanı 2'),
      m('uretici_yetkilisi', 'Üretici firma yetkilisi'), m('musteri_yetkilisi', 'Müşteri / mümessil yetkilisi'),
    ],
    tablolar: [
      { ad: 'hatalar', etiket: 'Tespit edilen hatalar', toplam: true, satirBasligi: 'Kaynak · hata', satirlar: AQL_HATALAR,
        sutunlar: [s('kritik', 'Kritik'), s('major', 'Majör'), s('minor', 'Minör')] },
      { ad: 'kalma_nedenleri', etiket: 'Kalma nedeni', satirBasligi: 'Neden', satirlar: AQL_KALMA_NEDENLERI, sutunlar: [ok('var', 'Var')] },
    ],
  },
  {
    kod: 'ceki_listesi', ad: 'Üretici Çeki Listesi', grup: 'Final', po: true,
    alanlar: [{ ad: 'inspection_tarihi', etiket: 'Inspection tarihi', tip: 'tarih' }, m('talep_no', 'Inspection talep no'),
      eh('asortili', 'Asortili mi?'), m('uretici_sorumlusu', 'Üretici sorumlusu')],
    tablolar: [
      { ad: 'birinci', etiket: '1. kalite', toplam: true, sutunlar: [m('merch_alt_grubu', 'Merch alt grubu'), m('ozel_kod', 'Özel kod'), m('renk', 'Renk'),
        s('toplam_koli', 'Toplam koli'), s('lot_adedi', 'Lot adedi'), s('lot_ici_adet', 'Lot içi adet'), s('koli_ici_lot', 'Koli içi lot'), s('adet', 'Adet')] },
      { ad: 'ikinci', etiket: '2. kalite', toplam: true, sutunlar: [m('merch_alt_grubu', 'Merch alt grubu'), m('ozel_kod', 'Özel kod'), m('renk', 'Renk'),
        m('renk_kodu', 'Renk kodu'), s('koli', 'Koli sayısı'), m('beden', 'Beden-yaş'), s('adet', 'Adet')] },
    ],
  },
]

export const FORM_GRUPLARI = [...new Set(FORMLAR.map(f => f.grup))]

export function formTanimi(kod: string): FormTanimi | undefined {
  return FORMLAR.find(f => f.kod === kod)
}

export const SERBEST_SATIR_SINIRI = 500

function hucre(alan: Alan, v: unknown): Deger {
  if (v === null || v === undefined || v === '') return null
  switch (alan.tip) {
    case 'sayi': { const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null }
    case 'onay': return v === true
    case 'evet_hayir': return v === 'evet' || v === 'hayir' ? v : null
    case 'secim': return alan.secenekler?.includes(String(v)) ? String(v) : null
    default: return String(v).slice(0, 2000)
  }
}

function satiriSuz(sutunlar: Alan[], ham: unknown): Record<string, Deger> {
  const kaynak = (ham && typeof ham === 'object' ? ham : {}) as Record<string, unknown>
  return Object.fromEntries(sutunlar.map(a => [a.ad, hucre(a, kaynak[a.ad])]))
}

const bosMu = (r: Record<string, Deger>) => Object.values(r).every(v => v === null || v === false)

/** İstemciden gelen gövdeyi tanıma göre süzer: bilinmeyen alan atılır, tipler
 *  düzeltilir, sabit satırlı tablo tam satır sayısına, serbest tablo boş
 *  satırlardan arınmış hâle getirilir. */
export function formVerisiniSuz(t: FormTanimi, ham: unknown): FormVerisi {
  const h = (ham && typeof ham === 'object' ? ham : {}) as { alanlar?: Record<string, unknown>; tablolar?: Record<string, unknown> }
  const alanlar = satiriSuz(t.alanlar, h.alanlar)
  const tablolar: FormVerisi['tablolar'] = {}
  for (const tb of t.tablolar) {
    const satirlar = Array.isArray(h.tablolar?.[tb.ad]) ? (h.tablolar![tb.ad] as unknown[]) : []
    tablolar[tb.ad] = tb.satirlar
      ? tb.satirlar.map((_, i) => satiriSuz(tb.sutunlar, satirlar[i]))
      : satirlar.slice(0, SERBEST_SATIR_SINIRI).map(r => satiriSuz(tb.sutunlar, r)).filter(r => !bosMu(r))
  }
  return { alanlar, tablolar }
}

/** Yeni kayıt için boş gövde. Serbest tablolar bir boş satırla başlar. */
export function bosFormVerisi(t: FormTanimi): FormVerisi {
  const bos = (sutunlar: Alan[]) => Object.fromEntries(sutunlar.map(a => [a.ad, null])) as Record<string, Deger>
  return {
    alanlar: bos(t.alanlar),
    tablolar: Object.fromEntries(t.tablolar.map(tb => [tb.ad, tb.satirlar ? tb.satirlar.map(() => bos(tb.sutunlar)) : [bos(tb.sutunlar)]])),
  }
}
