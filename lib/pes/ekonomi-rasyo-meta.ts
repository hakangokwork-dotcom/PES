/**
 * Rasyo Radarı — 37 gösterge metadatası.
 *
 * Her giriş, EkonomiRasyo'daki bir alana (+ marjSirasi) karşılık gelir.
 * Yön kararları:
 *   - yuksek-iyi: daha yüksek değer atölye için iyidir (ciro, kâr, verimlilik)
 *   - dusuk-iyi:  daha düşük değer iyidir (maliyet, zarar, fire)
 *   - notr:       yalnız bağlam gösterir; sıralama ve karneye girmez
 *
 * Belirsiz durumlar:
 *   - iscilikToplam: mutlak TL tutarı; büyük atölye kaçınılmaz yüksek —
 *     pay (iscilikPayi) oran verdiği için TL toplamı nötr.
 *   - tesvik: daha çok teşvik almak ham iyi ama kâr marjını yanlış şişirir;
 *     gösterge olarak nötr bırakıldı.
 *   - maasKisi: asgari ücretle kıyaslama için referans; yön yok.
 *   - fiyatSapmasi: negatif = adil altında çalışıyor, pozitif = adil üstü;
 *     yorumu bağlama göre değişir → nötr.
 *   - nominalDikimDk, fiiliDikimDk, uretimKisiDk, aylikAdet: ölçek bilgisi.
 *   - iscilikYukKatsayisi: 1 altı şüpheli beyan sinyali; yorumlanmayı
 *     bekleyen gösterge → nötr.
 *   - marjSirasi: zaten sıralama; kendi kendinin yönü yok → nötr.
 *   - referans3D: bölge TL/dk sabiti, kıyaslama girdisi.
 */

import type { EkonomiRasyo } from './ekonomi-tipler'

export type Yon = 'yuksek-iyi' | 'dusuk-iyi' | 'notr'

/** 4 grup — spec'te 5'e kadar izin var; 4 daha temiz okunuyor. */
export type Grup = 'karlilik' | 'isgucu' | 'birim-maliyet' | 'referans'

export type Format =
  | 'percent'   // % — 1 ondalık, tr-TR
  | 'int'       // tam sayı
  | 'dec2'      // 2 ondalık
  | 'dec4'      // 4 ondalık
  | 'tl'        // TL/kişi, büyük sayı

export type RasyoMeta = {
  /** EkonomiRasyo alanı ya da 'marjSirasi'. */
  alan: keyof EkonomiRasyo | 'marjSirasi'
  /** Ekranda görünen kısa başlık. */
  etiket: string
  /** Birim dizisi: "%", "TL/dk", "TL/adet", "kişi", "adet", "dk", "x", "-" */
  birim: string
  yon: Yon
  grup: Grup
  format: Format
  /** Göstergenin ne anlama geldiğini anlatan tek satır. */
  onemAciklama: string
}

/**
 * Sıralanan (yön ≠ 'notr') rasyolar karne ve ısı haritasına girer.
 * Nötr rasyolar yalnız gezginde görünür.
 */
export const RASYO_META: RasyoMeta[] = [
  // ─── KÂRLILIK ───────────────────────────────────────────────────────────────
  {
    alan: 'aylikCiro',
    etiket: 'Aylık Ciro',
    birim: 'TL',
    yon: 'yuksek-iyi',
    grup: 'karlilik',
    format: 'tl',
    onemAciklama: 'Boş gün düzeltmesiyle elde edilen aylık fatura tutarı.',
  },
  {
    alan: 'brutGider',
    etiket: 'Brüt Gider',
    birim: 'TL',
    yon: 'dusuk-iyi',
    grup: 'karlilik',
    format: 'tl',
    onemAciklama: '28 gider kaleminin teşvik hariç toplamı.',
  },
  {
    alan: 'tesvik',
    etiket: 'Teşvik',
    birim: 'TL',
    yon: 'notr',
    grup: 'karlilik',
    format: 'tl',
    onemAciklama: 'Devlet teşvik mahsubu — brüt gidere girmez, nötr referanstır.',
  },
  {
    alan: 'netGider',
    etiket: 'Net Gider',
    birim: 'TL',
    yon: 'dusuk-iyi',
    grup: 'karlilik',
    format: 'tl',
    onemAciklama: 'Brüt gider eksi teşvik mahsubu.',
  },
  {
    alan: 'karZarar',
    etiket: 'Kâr / Zarar',
    birim: 'TL',
    yon: 'yuksek-iyi',
    grup: 'karlilik',
    format: 'tl',
    onemAciklama: 'Aylık ciro eksi net gider.',
  },
  {
    alan: 'marj',
    etiket: 'Kâr/Zarar Marjı',
    birim: '%',
    yon: 'yuksek-iyi',
    grup: 'karlilik',
    format: 'percent',
    onemAciklama: 'Kâr/zarar ÷ ciro. Negatif = zarar eden atölye.',
  },
  {
    alan: 'ortFiyatAdet',
    etiket: 'Ort. Satış Fiyatı',
    birim: 'TL/adet',
    yon: 'yuksek-iyi',
    grup: 'karlilik',
    format: 'dec2',
    onemAciklama: 'Aylık ciro ÷ aylık adet. Ortalama CMT.',
  },
  {
    alan: 'iscilikToplam',
    etiket: 'İşçilik Toplamı',
    birim: 'TL',
    yon: 'notr',
    grup: 'karlilik',
    format: 'tl',
    onemAciklama: 'Maaş + mesai + prim + SGK + kıdem; büyük atölye kaçınılmaz yüksek.',
  },
  {
    alan: 'iscilikPayi',
    etiket: 'İşçilik Payı',
    birim: '%',
    yon: 'dusuk-iyi',
    grup: 'karlilik',
    format: 'percent',
    onemAciklama: 'Net işçilik ÷ net gider. Pilotta %66-79 tipik.',
  },
  {
    alan: 'iscilikYukKatsayisi',
    etiket: 'İşçilik Yük Katsayısı',
    birim: 'x',
    yon: 'notr',
    grup: 'karlilik',
    format: 'dec2',
    onemAciklama: 'Net işçilik ÷ maaş. 1 altı şüpheli beyan sinyali.',
  },
  {
    alan: 'basabasFiyat',
    etiket: 'Başabaş Fiyat',
    birim: 'TL/adet',
    yon: 'dusuk-iyi',
    grup: 'karlilik',
    format: 'dec2',
    onemAciklama: 'Net gider ÷ adet. Sıfır kârla çalışılacak en düşük CMT.',
  },
  {
    alan: 'adilFiyat',
    etiket: 'Adil Fiyat',
    birim: 'TL/adet',
    yon: 'dusuk-iyi',
    grup: 'karlilik',
    format: 'dec2',
    onemAciklama: 'Başabaş × (1 + hedef marj). Sürdürülebilir fiyat.',
  },
  {
    alan: 'fiyatSapmasi',
    etiket: 'Fiyat Sapması',
    birim: '%',
    yon: 'notr',
    grup: 'karlilik',
    format: 'percent',
    onemAciklama: 'Ort. fiyat ÷ adil fiyat − 1. Negatif = adil altında.',
  },
  {
    alan: 'marjSirasi',
    etiket: 'Marj Sırası',
    birim: '-',
    yon: 'notr',
    grup: 'karlilik',
    format: 'int',
    onemAciklama: 'Kârlılıkta kaçıncı olduğu (1 = en kârlı).',
  },

  // ─── İŞGÜCÜ ─────────────────────────────────────────────────────────────────
  {
    alan: 'toplamKisi',
    etiket: 'Toplam Kişi',
    birim: 'kişi',
    yon: 'notr',
    grup: 'isgucu',
    format: 'int',
    onemAciklama: 'Kesim + dikim + UKP + ofis. Ölçek referansı.',
  },
  {
    alan: 'uretimKisi',
    etiket: 'Üretim Kişi',
    birim: 'kişi',
    yon: 'notr',
    grup: 'isgucu',
    format: 'int',
    onemAciklama: 'Ofis hariç üretim çalışanı. Dakika maliyetinin paydası.',
  },
  {
    alan: 'dikimPayi',
    etiket: 'Dikim Personel Oranı',
    birim: '%',
    yon: 'yuksek-iyi',
    grup: 'isgucu',
    format: 'percent',
    onemAciklama: 'Dikim kişi ÷ toplam kişi. %55-75 tipik.',
  },
  {
    alan: 'ciroKisi',
    etiket: 'Kişi Başı Ciro',
    birim: 'TL/kişi',
    yon: 'yuksek-iyi',
    grup: 'isgucu',
    format: 'tl',
    onemAciklama: 'Aylık ciro ÷ toplam kişi. Marjla en güçlü ilişkiyi gösteren rasyo.',
  },
  {
    alan: 'netGiderKisi',
    etiket: 'Kişi Başı Net Gider',
    birim: 'TL/kişi',
    yon: 'dusuk-iyi',
    grup: 'isgucu',
    format: 'tl',
    onemAciklama: 'Net gider ÷ toplam kişi. Ciro/kişi ile yan yana okunur.',
  },
  {
    alan: 'maasKisi',
    etiket: 'Kişi Başı Maaş',
    birim: 'TL/kişi',
    yon: 'notr',
    grup: 'isgucu',
    format: 'tl',
    onemAciklama: 'Maaş toplamı ÷ toplam kişi. Asgari net ile kıyaslanır.',
  },
  {
    alan: 'adetDikimci',
    etiket: 'Adet / Dikimci',
    birim: 'adet',
    yon: 'yuksek-iyi',
    grup: 'isgucu',
    format: 'int',
    onemAciklama: 'Aylık adet ÷ dikim kişi. Aynı ürün klasmanında kıyasla.',
  },
  {
    alan: 'iscilikDisiKisi',
    etiket: 'İşçilik Dışı / Kişi',
    birim: 'TL/kişi',
    yon: 'dusuk-iyi',
    grup: 'isgucu',
    format: 'tl',
    onemAciklama: 'Her çalışanla gelen işletme maliyeti (yemek, enerji, sarf vb.).',
  },
  {
    alan: 'aylikAdet',
    etiket: 'Aylık Adet',
    birim: 'adet',
    yon: 'notr',
    grup: 'isgucu',
    format: 'int',
    onemAciklama: 'Aylık üretim adedi — ölçek referansı.',
  },

  // ─── BİRİM MALİYET ──────────────────────────────────────────────────────────
  {
    alan: 'nominalDikimDk',
    etiket: 'Nominal Dikim Dk',
    birim: 'dk',
    yon: 'notr',
    grup: 'birim-maliyet',
    format: 'int',
    onemAciklama: 'Dikim kişi × saat × nominal gün × 60. Benchmark cetveli.',
  },
  {
    alan: 'fiiliDikimDk',
    etiket: 'Fiili Dikim Dk',
    birim: 'dk',
    yon: 'notr',
    grup: 'birim-maliyet',
    format: 'int',
    onemAciklama: 'Fiili günle hesaplanan dikim dakikası. Fiyatlama için.',
  },
  {
    alan: 'uretimKisiDk',
    etiket: 'Üretim Kişi-Dk',
    birim: 'dk',
    yon: 'notr',
    grup: 'birim-maliyet',
    format: 'int',
    onemAciklama: 'Üretim kişi × saat × nominal gün × 60. Bölüm maliyetinin paydası.',
  },
  {
    alan: 'kisiDkMaliyet',
    etiket: 'Kişi-Dk Maliyeti',
    birim: 'TL/dk',
    yon: 'dusuk-iyi',
    grup: 'birim-maliyet',
    format: 'dec4',
    onemAciklama: 'Net gider ÷ üretim kişi-dk. Tam yüklü bir dakika.',
  },
  {
    alan: 'kesimDkMaliyet',
    etiket: 'Kesim Dk Maliyeti',
    birim: 'TL/dk',
    yon: 'dusuk-iyi',
    grup: 'birim-maliyet',
    format: 'dec4',
    onemAciklama: 'Kesim bölümüne atanan maliyet ÷ kesim dakikası.',
  },
  {
    alan: 'dikimDkMaliyet',
    etiket: 'Dikim Dk Maliyeti',
    birim: 'TL/dk',
    yon: 'dusuk-iyi',
    grup: 'birim-maliyet',
    format: 'dec4',
    onemAciklama: 'Dikim bölümüne atanan maliyet ÷ nominal dikim dk.',
  },
  {
    alan: 'ukpDkMaliyet',
    etiket: 'UKP Dk Maliyeti',
    birim: 'TL/dk',
    yon: 'dusuk-iyi',
    grup: 'birim-maliyet',
    format: 'dec4',
    onemAciklama: 'UKP bölümüne atanan maliyet ÷ UKP dakikası.',
  },
  {
    alan: 'dikimDkCiro',
    etiket: 'Dikim Dk Cirosu',
    birim: 'TL/dk',
    yon: 'yuksek-iyi',
    grup: 'birim-maliyet',
    format: 'dec4',
    onemAciklama: 'Aylık ciro ÷ nominal dikim dk. Kârı belirleyen gösterge.',
  },
  {
    alan: 'dakikaMarji',
    etiket: 'Dakika Marjı',
    birim: 'TL/dk',
    yon: 'yuksek-iyi',
    grup: 'birim-maliyet',
    format: 'dec4',
    onemAciklama: 'Kâr/zarar ÷ nominal dikim dk.',
  },
  {
    alan: 'fiiliDikimDkMaliyet',
    etiket: 'Fiili Dikim Dk Maliyeti',
    birim: 'TL/dk',
    yon: 'dusuk-iyi',
    grup: 'birim-maliyet',
    format: 'dec4',
    onemAciklama: 'Net gider ÷ fiili dikim dk. Nominalden %10-15 yüksek.',
  },
  {
    alan: 'asgariDkCarpani',
    etiket: 'Asgari Dk Çarpanı',
    birim: 'x',
    yon: 'dusuk-iyi',
    grup: 'birim-maliyet',
    format: 'dec2',
    onemAciklama: 'Dikim dk maliyeti ÷ asgari ücretli dk. 1,3 yalın, 1,8-2,4 tipik.',
  },
  {
    alan: 'dikimDkAdet',
    etiket: 'Dikim Dk / Adet',
    birim: 'dk',
    yon: 'dusuk-iyi',
    grup: 'birim-maliyet',
    format: 'dec2',
    onemAciklama: 'Nominal dikim dk ÷ adet. MTM ile kıyaslanınca verimlilik.',
  },

  // ─── REFERANS ────────────────────────────────────────────────────────────────
  {
    alan: 'referans3D',
    etiket: '3D Referans Değeri',
    birim: 'TL/dk',
    yon: 'notr',
    grup: 'referans',
    format: 'dec4',
    onemAciklama: 'Bölgeye özgü 3D endeksi (dk_maliyet tablosu). Karşılaştırma girdisi.',
  },
  {
    alan: 'dkMaliyet3DOran',
    etiket: '3D Oran',
    birim: 'x',
    yon: 'dusuk-iyi',
    grup: 'referans',
    format: 'dec2',
    onemAciklama: 'Gerçekleşen dikim dk maliyeti ÷ 3D referans. 1,00 = referansla aynı.',
  },
]

/**
 * alan → meta hızlı erişim haritası. Sıkça kullanılan arama için.
 */
export const RASYO_META_MAP: Map<string, RasyoMeta> = new Map(
  RASYO_META.map(m => [m.alan, m])
)

/** Yalnız sıralanan (yön ≠ 'notr') rasyolar — karne ve ısı haritası için. */
export const SIRALANAN_RASYOLAR: RasyoMeta[] = RASYO_META.filter(m => m.yon !== 'notr')
