/**
 * Atölye ekonomi rasyoları — Atolye_Gider_Model.xlsx FORMULLER sayfasıyla
 * bire bir. Her fonksiyon bir göstergedir; hangi FORMULLER satırına
 * karşılık geldiği yorumda yazılıdır.
 *
 * KURAL 1: Hesaplanamayan her şey null döner, 0 değil. 0 "hesaplandı ve
 *   sıfır çıktı", null "hesaplanamadı" demektir. Excel ikisini de 0 yazıyor;
 *   burada bilerek ayrıldık çünkü ekranda 0 gösterilen bir atölye
 *   sıralamanın ucuna fırlar ve en kârlı ya da en zararlı sanılır.
 *
 * KURAL 2: Teşvik gider değildir. Brüt toplama girmez, net giderden düşülür.
 *
 * KURAL 3: Ofis dakikası ürün üretmez; maliyeti üretim dakikasına yüklenir.
 */
import {
  GIDER_KALEMLERI, ISCILIK_KALEMLERI,
  type EkonomiGirdi, type EkonomiParam, type EkonomiRasyo,
  type EkonomiSatiri, type GiderSatiri,
} from './ekonomi-tipler'

/** Güvenli bölme: payda 0/null ya da pay null ise null. */
export function bol(pay: number | null, payda: number | null): number | null {
  if (pay === null || payda === null || payda === 0) return null
  return pay / payda
}

/** Null'ları atlayarak toplar; hiç sayı yoksa null. */
function topla(degerler: Array<number | null | undefined>): number | null {
  let toplam = 0
  let sayiVar = false
  for (const d of degerler) {
    if (typeof d === 'number' && Number.isFinite(d)) {
      toplam += d
      sayiVar = true
    }
  }
  return sayiVar ? toplam : null
}

/* ---------- Kadro ve ölçek — FORMULLER 6-8 ---------- */

/** HESAP!E — kesim + dikim + UKP + ofis. Kişi başı rasyoların paydası. */
export function toplamKisi(e: EkonomiSatiri): number | null {
  return topla([e.cutting_staff, e.sewing_staff, e.ukp_staff, e.office_staff])
}

/** HESAP!F — ofis hariç. Dakika maliyetinin paydası. */
export function uretimKisi(e: EkonomiSatiri): number | null {
  return topla([e.cutting_staff, e.sewing_staff, e.ukp_staff])
}

/** HESAP!G — dikim kişi ÷ toplam kişi. %55-75 tipik. */
export function dikimPayi(e: EkonomiSatiri): number | null {
  return bol(e.sewing_staff, toplamKisi(e))
}

/* ---------- Ciro — FORMULLER 9 ---------- */

/**
 * HESAP!H — fatura ÷ ay × (1 + boş gün ÷ payda).
 * Boş gün düzeltmesi dışarı/boş geçen günleri kapasiteye geri ekler;
 * revenue_adj_on = 0 ile kapatılabilir.
 */
export function aylikCiro(e: EkonomiSatiri, p: EkonomiParam): number | null {
  if (e.revenue_declared === null) return null
  if (p.revenue_adj_on !== 1 || p.revenue_adj_divisor === 0) return e.revenue_declared
  const bosGun = e.idle_days ?? 0
  return e.revenue_declared * (1 + bosGun / p.revenue_adj_divisor)
}

/* ---------- Gider — FORMULLER 11-12, 15 ---------- */

/** HESAP!K — 28 gider kaleminin toplamı. Teşvik BURADA YOK. */
export function brutGider(g: GiderSatiri): number | null {
  return topla(GIDER_KALEMLERI.map(k => g[k]))
}

/** HESAP!M — brüt gider − teşvik. Teşvik iade olarak geri geldiği için düşülür. */
export function netGider(g: GiderSatiri): number | null {
  const brut = brutGider(g)
  if (brut === null) return null
  return brut - (g.incentive_amount ?? 0)
}

/** HESAP!P — maaş + mesai + prim + SGK + kıdem. */
export function iscilikToplam(g: GiderSatiri): number | null {
  return topla(ISCILIK_KALEMLERI.map(k => g[k]))
}

/* ---------- Sonuç — FORMULLER 13-14 ---------- */

/** HESAP!N — aylık ciro − net gider. */
export function karZarar(g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam): number | null {
  const ciro = aylikCiro(e, p)
  const net = netGider(g)
  if (ciro === null || net === null) return null
  return ciro - net
}

/** HESAP!O — (ciro − net gider) ÷ ciro. Adet tahmininden etkilenmez. */
export function marj(g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam): number | null {
  return bol(karZarar(g, e, p), aylikCiro(e, p))
}

/* ---------- İşçilik rasyoları — FORMULLER 16-17, 35 ---------- */

/** HESAP!Q — (işçilik − teşvik) ÷ net gider. Pilotta %66-79. */
export function iscilikPayi(g: GiderSatiri): number | null {
  const isc = iscilikToplam(g)
  if (isc === null) return null
  return bol(isc - (g.incentive_amount ?? 0), netGider(g))
}

/**
 * HESAP!R — (brüt − işçilik − kira) ÷ toplam kişi.
 * Yemek, servis, enerji, sarf, bakım, idari: her çalışanla gelen işletme
 * maliyeti. Pilot medyanı 12.831 TL.
 */
export function iscilikDisiKisi(g: GiderSatiri, e: EkonomiSatiri): number | null {
  const brut = brutGider(g)
  const isc = iscilikToplam(g)
  if (brut === null || isc === null) return null
  return bol(brut - isc - (g.rent ?? 0), toplamKisi(e))
}

/**
 * HESAP!AL — (işçilik − teşvik) ÷ net maaş.
 * Net maaşın üstüne mesai, prim, SGK ve kıdemle ne kadar bindiği.
 * Pilot: 6. bölge ~1,17, 1. bölge ~1,25.
 *
 * 1'in altına düşüyorsa teşvik SGK'dan büyük demektir ve beyan şüphelidir —
 * Örssan'da 0,82 çıkıyor (SGK 200 bin, teşvik 1,3 milyon). Task 13'teki
 * doğrulama bunu ayrıca raporlar.
 */
export function iscilikYukKatsayisi(g: GiderSatiri): number | null {
  const isc = iscilikToplam(g)
  if (isc === null) return null
  return bol(isc - (g.incentive_amount ?? 0), g.personnel ?? null)
}

/* ---------- Adet — beyan mı PES gerçeği mi ---------- */

/**
 * Hesaplarda kullanılacak adet. PES üretim kaydı varsa o, yoksa beyan.
 *
 * İkisi arasındaki fark bir hata değil sinyaldir: büyük sapma ya beyanın
 * ya iş emri kaydının zayıf olduğunu söyler. Hangisinin kullanıldığı
 * ekranda işaretlenir (adetKaynagi).
 */
export function kullanilanAdet(e: EkonomiSatiri, qtyActual: number | null): number | null {
  return qtyActual ?? e.qty_declared
}

export function adetKaynagi(qtyActual: number | null): 'pes' | 'beyan' {
  return qtyActual === null ? 'beyan' : 'pes'
}

/** Beyan ile PES gerçeği arasındaki oransal sapma. İkisi de yoksa null. */
export function adetSapmasi(e: EkonomiSatiri, qtyActual: number | null): number | null {
  if (qtyActual === null || e.qty_declared === null || e.qty_declared === 0) return null
  return qtyActual / e.qty_declared - 1
}

/* ---------- Kişi başı — FORMULLER 10, 18-21 ---------- */

/** HESAP!S — aylık ciro ÷ toplam kişi. Marjla en güçlü ilişkiyi gösteren rasyo. */
export function ciroKisi(e: EkonomiSatiri, p: EkonomiParam): number | null {
  return bol(aylikCiro(e, p), toplamKisi(e))
}

/** HESAP!T — net gider ÷ toplam kişi. Ciro/kişi ile yan yana okunur. */
export function netGiderKisi(g: GiderSatiri, e: EkonomiSatiri): number | null {
  return bol(netGider(g), toplamKisi(e))
}

/** HESAP!U — net maaş ÷ toplam kişi. Asgari net ile kıyaslanır. */
export function maasKisi(g: GiderSatiri, e: EkonomiSatiri): number | null {
  return bol(g.personnel ?? null, toplamKisi(e))
}

/** HESAP!V — aylık adet ÷ dikim kişi. Ürüne çok bağlı; aynı klasmanda kıyasla. */
export function adetDikimci(e: EkonomiSatiri, qtyActual: number | null): number | null {
  return bol(kullanilanAdet(e, qtyActual), e.sewing_staff)
}

/** HESAP!J — aylık ciro ÷ aylık adet. Parça başına faturalanan ortalama CMT. */
export function ortFiyatAdet(
  e: EkonomiSatiri, p: EkonomiParam, qtyActual: number | null,
): number | null {
  return bol(aylikCiro(e, p), kullanilanAdet(e, qtyActual))
}

/* ---------- Dakika havuzları — FORMULLER 22-24 ---------- */

/** HESAP!W — dikim kişi × saat × nominal gün × 60. Benchmark cetveli. */
export function nominalDikimDk(e: EkonomiSatiri): number | null {
  if (e.sewing_staff === null || e.hours_per_day === null || e.nominal_days === null) return null
  return e.sewing_staff * e.hours_per_day * e.nominal_days * 60
}

/** HESAP!X — fiili günle. Fiyatlama için bu kullanılır. */
export function fiiliDikimDk(e: EkonomiSatiri): number | null {
  if (e.sewing_staff === null || e.hours_per_day === null || e.actual_days === null) return null
  return e.sewing_staff * e.hours_per_day * e.actual_days * 60
}

/** HESAP!Y — üretim kişi × saat × nominal gün × 60. Bölüm maliyetlerinin ortak paydası. */
export function uretimKisiDk(e: EkonomiSatiri): number | null {
  const kisi = uretimKisi(e)
  if (kisi === null || e.hours_per_day === null || e.nominal_days === null) return null
  return kisi * e.hours_per_day * e.nominal_days * 60
}

/* ---------- Dakika maliyetleri — FORMULLER 25-30 ---------- */

/** HESAP!Z — net gider ÷ üretim kişi-dakikası. Tam yüklü bir üretim dakikası. */
export function kisiDkMaliyet(g: GiderSatiri, e: EkonomiSatiri): number | null {
  return bol(netGider(g), uretimKisiDk(e))
}

export type Bolum = 'kesim' | 'dikim' | 'ukp'

/**
 * HESAP!AA / AB / AC — net gider maaş ağırlığıyla bölümlere dağıtılır,
 * sonra bölümün dakikasına bölünür:
 *
 *   netGider × w_b ÷ ((kesim×w_k + dikim×w_d + ukp×w_u) × saat × gün × 60)
 *
 * Ağırlıklar 1/1/1 olduğu sürece üç değer aynı çıkar. Bölüm maaşları
 * toplandığında economy_param'dan ayrıştırılır; formül buna hazır.
 */
export function bolumDkMaliyet(
  g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam, bolum: Bolum,
): number | null {
  const net = netGider(g)
  if (net === null || e.hours_per_day === null || e.nominal_days === null) return null

  const agirlikliKisi =
    (e.cutting_staff ?? 0) * p.weight_cutting +
    (e.sewing_staff ?? 0) * p.weight_sewing +
    (e.ukp_staff ?? 0) * p.weight_ukp
  if (agirlikliKisi === 0) return null

  const w = bolum === 'kesim' ? p.weight_cutting
    : bolum === 'dikim' ? p.weight_sewing
    : p.weight_ukp

  return (net * w) / (agirlikliKisi * e.hours_per_day * e.nominal_days * 60)
}

/** HESAP!AD — aylık ciro ÷ nominal dikim dakikası. Kârı belirleyen gösterge. */
export function dikimDkCiro(e: EkonomiSatiri, p: EkonomiParam): number | null {
  return bol(aylikCiro(e, p), nominalDikimDk(e))
}

/** HESAP!AE — (ciro − net gider) ÷ nominal dikim dakikası. */
export function dakikaMarji(g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam): number | null {
  return bol(karZarar(g, e, p), nominalDikimDk(e))
}

/** HESAP!AF — net gider ÷ fiili dikim dakikası. Nominalden ~%10-15 yüksek. */
export function fiiliDikimDkMaliyet(g: GiderSatiri, e: EkonomiSatiri): number | null {
  return bol(netGider(g), fiiliDikimDk(e))
}

/**
 * PARAMETRE!B11 — (işveren maliyeti − destek) ÷ (nominal gün × günlük dakika).
 * Türkiye'de bir dikim dakikasının olabileceği en düşük maliyet.
 */
export function asgariDkMaliyetNominal(p: EkonomiParam): number | null {
  return bol(p.employer_cost - p.wage_support, p.nominal_days * p.minutes_per_day)
}

/**
 * PARAMETRE!B12 — aynı pay ÷ (efektif gün × günlük dakika).
 * Ücret 30 gün ödenir ama ~19,5 gün dikilir; fiyatlama kararında bu kullanılır.
 */
export function asgariDkMaliyetEfektif(p: EkonomiParam): number | null {
  return bol(p.employer_cost - p.wage_support, p.effective_days * p.minutes_per_day)
}

/**
 * HESAP!AG — dikim dakika maliyeti ÷ asgari ücretli dakika.
 * ~1,3 yalın; 1,8-2,4 tipik; 3+ ağır (destek kadrosu, genel gider, boş zaman).
 */
export function asgariDkCarpani(
  g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam,
): number | null {
  const dkMaliyet = bol(netGider(g), nominalDikimDk(e))
  return bol(dkMaliyet, asgariDkMaliyetNominal(p))
}

/**
 * HESAP!AH — nominal dikim dakikası ÷ aylık adet.
 * %100 verimlilikte parça başına düşen dikim dakikası; MTM ile kıyaslanınca
 * gerçek verimliliği verir (E3'ün girdisi).
 */
export function dikimDkAdet(e: EkonomiSatiri, qtyActual: number | null): number | null {
  return bol(nominalDikimDk(e), kullanilanAdet(e, qtyActual))
}

/* ---------- Fiyat — FORMULLER 32-34 ---------- */

/** HESAP!AI — net gider ÷ aylık adet. Sıfır kârla yaşadığı ortalama CMT. */
export function basabasFiyat(
  g: GiderSatiri, e: EkonomiSatiri, qtyActual: number | null,
): number | null {
  return bol(netGider(g), kullanilanAdet(e, qtyActual))
}

/** HESAP!AJ — başabaş × (1 + hedef marj). Tedarikçiyi ayakta tutan fiyat. */
export function adilFiyat(
  g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam, qtyActual: number | null,
): number | null {
  const bb = basabasFiyat(g, e, qtyActual)
  if (bb === null) return null
  return bb * (1 + p.target_margin)
}

/**
 * HESAP!AK — ortalama fiyat ÷ adil fiyat − 1.
 * Negatifse atölye adilin altında çalışıyor: gizli pahalı, süreklilik riski.
 */
export function fiyatSapmasi(
  g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam, qtyActual: number | null,
): number | null {
  const oran = bol(ortFiyatAdet(e, p, qtyActual), adilFiyat(g, e, p, qtyActual))
  return oran === null ? null : oran - 1
}

/* ---------- 3D referans — FORMULLER 49-50 ---------- */

/**
 * HESAP!AN — atölyenin gerçekleşen dikim dakika maliyeti ÷ bölge 3D değeri.
 * 1,00 = referansla aynı; 1,20 = %20 pahalı; 0,85 = referansın altında
 * (yalın ya da eksik bildirim).
 */
export function dkMaliyet3DOran(
  g: GiderSatiri, e: EkonomiSatiri, p: EkonomiParam, dk3d: number | null,
): number | null {
  return bol(bolumDkMaliyet(g, e, p, 'dikim'), dk3d)
}

/* ---------- Birleştirme ---------- */

/**
 * Tek bir atölye-ayın 36 rasyosunu hesaplar. HESAP'ın 37. sütunu (Marj sırası)
 * akran türevlidir; tek satır bilgisiyle hesaplanamaz, ekonomi-akran.ts'te.
 * Ekranlar ve import doğrulaması bunu çağırır; tek tek fonksiyonlar
 * testler ve E3/E5 içindir.
 */
export function hesapla(girdi: EkonomiGirdi): EkonomiRasyo {
  const { gider: g, ekonomi: e, param: p, dkMaliyet3D, qtyActual } = girdi
  return {
    toplamKisi: toplamKisi(e),
    uretimKisi: uretimKisi(e),
    dikimPayi: dikimPayi(e),

    aylikCiro: aylikCiro(e, p),
    aylikAdet: kullanilanAdet(e, qtyActual),
    ortFiyatAdet: ortFiyatAdet(e, p, qtyActual),
    brutGider: brutGider(g),
    tesvik: g.incentive_amount,
    netGider: netGider(g),
    karZarar: karZarar(g, e, p),
    marj: marj(g, e, p),

    iscilikToplam: iscilikToplam(g),
    iscilikPayi: iscilikPayi(g),
    iscilikDisiKisi: iscilikDisiKisi(g, e),
    iscilikYukKatsayisi: iscilikYukKatsayisi(g),

    ciroKisi: ciroKisi(e, p),
    netGiderKisi: netGiderKisi(g, e),
    maasKisi: maasKisi(g, e),
    adetDikimci: adetDikimci(e, qtyActual),

    nominalDikimDk: nominalDikimDk(e),
    fiiliDikimDk: fiiliDikimDk(e),
    uretimKisiDk: uretimKisiDk(e),
    kisiDkMaliyet: kisiDkMaliyet(g, e),
    kesimDkMaliyet: bolumDkMaliyet(g, e, p, 'kesim'),
    dikimDkMaliyet: bolumDkMaliyet(g, e, p, 'dikim'),
    ukpDkMaliyet: bolumDkMaliyet(g, e, p, 'ukp'),
    dikimDkCiro: dikimDkCiro(e, p),
    dakikaMarji: dakikaMarji(g, e, p),
    fiiliDikimDkMaliyet: fiiliDikimDkMaliyet(g, e),
    asgariDkCarpani: asgariDkCarpani(g, e, p),
    dikimDkAdet: dikimDkAdet(e, qtyActual),

    basabasFiyat: basabasFiyat(g, e, qtyActual),
    adilFiyat: adilFiyat(g, e, p, qtyActual),
    fiyatSapmasi: fiyatSapmasi(g, e, p, qtyActual),

    referans3D: dkMaliyet3D,
    dkMaliyet3DOran: dkMaliyet3DOran(g, e, p, dkMaliyet3D),
  }
}
