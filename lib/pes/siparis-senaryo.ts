/**
 * Sipariş senaryosu — parti büyüklüğü, değişim ve öğrenme eğrisinin
 * kapasiteye etkisi.
 *
 * Cevapladığı soru: "50.000 adet tek sipariş ile 5.000'er 10 sipariş
 * diktirmenin atölye kapasitesine etkisi ne?"
 *
 * VARSAYIM / ÖLÇÜM AYRIMI: Bu modüldeki `degisimDk`, `ogrenmeOrani` ve
 * `ilkBirimCarpani` VARSAYIMDIR. PES'te gerçek model değişim ölçümü yok —
 * changeover_record'daki 45 satırın hepsi demo verisidir (demo-atolye
 * kiracısı, FA-01..FA-08). Gerçek olan yalnız E0'ın dakika maliyeti ve
 * E3'ün MTM süresidir. Ekran bunu varsayım olarak göstermek zorunda;
 * "hesapladı" ile "varsaydı" karışırsa sayı olduğundan güvenilir görünür.
 */

export type SenaryoParam = {
  /** Bir model değişiminin bandı durdurduğu dakika. VARSAYIM. */
  degisimDk: number
  /**
   * Wright öğrenme oranı: kümülatif adet katlandığında birim süresinin
   * oranı. 0,90 = her katlanmada %10 hızlanma. VARSAYIM.
   */
  ogrenmeOrani: number
  /** İlk birim, kararlı hızın kaç katı sürer. VARSAYIM. */
  ilkBirimCarpani: number
}

export const VARSAYILAN_SENARYO_PARAM: SenaryoParam = {
  degisimDk: 80,
  ogrenmeOrani: 0.9,
  ilkBirimCarpani: 2,
}

export type SenaryoGirdi = {
  /** Toplam sipariş adedi. */
  toplamAdet: number
  /** Kaç partiye bölünecek. */
  partiSayisi: number
  /** Kararlı durumda bir adedin dikim dakikası (SAM ÷ verimlilik). */
  kararliBirimDk: number
  /** Bandın günlük toplam dikim dakikası (dikim kişi × günlük dakika). */
  gunlukKapasiteDk: number
  /** Dikim dakika maliyeti, TL. E0'dan gelir — bu GERÇEK. */
  dikimDkMaliyet: number | null
  /**
   * Sipariş kaç ayrı banda bölünecek.
   *
   * DİKKAT: bu sayı KAPASİTEYİ ARTIRMAZ. Bir atölyenin 53 dikimcisini üç
   * banda bölmek üç katı insan yaratmaz — aynı kişiler. Bant bölmek
   * yalnız her bandın AYRI kurulum ve AYRI öğrenme eğrisi yaşamasına yol
   * açar, yani kaybı KATLAR. İlk sürümde kapasite bant sayısıyla
   * çarpılıyordu ve simülatör "3 banda böl, süre üçte bire insin" diyordu;
   * gerçek veriyle çalıştırınca 55,6 gün → 18,6 gün çıktı ve hata görüldü.
   */
  bantSayisi?: number
  /**
   * Bu siparişe ayrılan günlük kapasite payı (0–1). Sıra atlama burada
   * modellenir: normalde atölyenin bir kısmı bu işe ayrılmışken
   * fast-track'te tamamı ayrılır (başka iş ötelenir).
   */
  kapasitePayi?: number
  /** Mesai / ek vardiyayla kazanılan GÜNLÜK ek dakika. Kapasiteyi GERÇEKTEN artırır. */
  ekGunlukKapasiteDk?: number
  param: SenaryoParam
}

export type SenaryoSonuc = {
  /** Saf dikim dakikası (kayıpsız). */
  dikimDk: number
  /** Model değişimlerinin toplam kaybı. */
  degisimKaybiDk: number
  /** Öğrenme eğrisinin toplam kaybı. */
  ogrenmeKaybiDk: number
  /** Bandın toplam meşguliyeti. */
  toplamDk: number
  /** Kaybın toplam içindeki payı. */
  kayipPayi: number
  /** Takvim günü. */
  gun: number | null
  /** Bu siparişe fiilen ayrılan günlük dakika. */
  etkinGunlukKapasiteDk: number
  /** Toplam maliyet, TL. dikimDkMaliyet null ise null. */
  maliyet: number | null
  /** Birim maliyet, TL/adet. */
  birimMaliyet: number | null
  /** Kaç değişim yaşanır (parti × bant). */
  degisimSayisi: number
}

/**
 * Wright yasasıyla bir partinin öğrenme kaybı (dakika).
 *
 * t_n = t_s × carpan × n^(-b),  b = -log2(LR)
 *
 * KRİTİK: birim süresi kararlı hızın ALTINA İNEMEZ. `max(t_s, ...)`
 * olmazsa büyük partide kayıp negatife döner ve model "parti ne kadar
 * büyükse o kadar bedava" der — öğrenme sonsuza kadar sürmez.
 */
export function ogrenmeKaybi(
  partiAdedi: number,
  kararliBirimDk: number,
  p: SenaryoParam,
): number {
  if (partiAdedi <= 0 || kararliBirimDk <= 0) return 0
  if (p.ilkBirimCarpani <= 1) return 0
  /* LR 1 ise öğrenme yok: birim süresi hiç düşmez, çarpan sonsuza kadar
     sürer. Bu fiziksel olarak anlamsız; kayıp hesaplanmaz. */
  if (p.ogrenmeOrani >= 1 || p.ogrenmeOrani <= 0) return 0

  const b = -Math.log2(p.ogrenmeOrani)
  /* Kararlı hıza ulaşılan birim: carpan × n^(-b) = 1 → n = carpan^(1/b) */
  const kararliBirim = Math.pow(p.ilkBirimCarpani, 1 / b)
  const son = Math.min(partiAdedi, Math.ceil(kararliBirim))

  let kayip = 0
  for (let n = 1; n <= son; n++) {
    const oran = p.ilkBirimCarpani * Math.pow(n, -b)
    if (oran <= 1) break
    kayip += kararliBirimDk * (oran - 1)
  }
  return kayip
}

export function senaryoHesapla(g: SenaryoGirdi): SenaryoSonuc {
  const bant = Math.max(1, g.bantSayisi ?? 1)
  const parti = Math.max(1, Math.floor(g.partiSayisi))
  const adet = Math.max(0, g.toplamAdet)

  const dikimDk = adet * g.kararliBirimDk

  /* Her bant her partiyi ayrı kurar: değişim ve öğrenme bant sayısıyla
     ÇARPILIR. Bant bölmenin TEK etkisi budur — kapasiteyi artırmaz. */
  const degisimSayisi = parti * bant
  const degisimKaybiDk = degisimSayisi * g.param.degisimDk

  const partiAdedi = adet / parti / bant
  const ogrenmeKaybiDk = degisimSayisi * ogrenmeKaybi(partiAdedi, g.kararliBirimDk, g.param)

  const toplamDk = dikimDk + degisimKaybiDk + ogrenmeKaybiDk
  const kayipPayi = toplamDk > 0 ? (degisimKaybiDk + ogrenmeKaybiDk) / toplamDk : 0

  /* KAPASİTE BANT SAYISIYLA ÇARPILMAZ — aynı kadro bölünüyor, çoğalmıyor.
     Süreyi gerçekten kısaltan iki şey var: siparişe daha büyük kapasite
     payı ayırmak (başka işi ötelemek) ve mesai. */
  const pay = Math.min(1, Math.max(0, g.kapasitePayi ?? 1))
  const etkinGunlukKapasiteDk = g.gunlukKapasiteDk * pay + (g.ekGunlukKapasiteDk ?? 0)
  const gun = etkinGunlukKapasiteDk > 0 ? toplamDk / etkinGunlukKapasiteDk : null

  const maliyet = g.dikimDkMaliyet === null ? null : toplamDk * g.dikimDkMaliyet
  const birimMaliyet = maliyet === null || adet === 0 ? null : maliyet / adet

  return {
    dikimDk, degisimKaybiDk, ogrenmeKaybiDk, toplamDk, kayipPayi,
    gun, etkinGunlukKapasiteDk, maliyet, birimMaliyet, degisimSayisi,
  }
}

/** İki senaryonun farkı — "50.000 tek parti mi, 10×5.000 mi". */
export type Karsilastirma = {
  a: SenaryoSonuc
  b: SenaryoSonuc
  /** b − a, dakika. Pozitif = b daha pahalı. */
  farkDk: number
  farkGun: number | null
  farkMaliyet: number | null
  /** b'nin a'ya göre fazla maliyeti, oran. */
  farkOran: number | null
}

export function karsilastir(a: SenaryoSonuc, b: SenaryoSonuc): Karsilastirma {
  return {
    a, b,
    farkDk: b.toplamDk - a.toplamDk,
    farkGun: a.gun === null || b.gun === null ? null : b.gun - a.gun,
    farkMaliyet: a.maliyet === null || b.maliyet === null ? null : b.maliyet - a.maliyet,
    farkOran: a.maliyet === null || b.maliyet === null || a.maliyet === 0
      ? null : (b.maliyet - a.maliyet) / a.maliyet,
  }
}

/**
 * MTM duyarlılığı: birim süresi %x değişirse çıktı nasıl değişir.
 *
 * Kullanıcının "mtm değişimi ile atölye çıktı arasındaki ilişki" sorusu.
 * İlişki ters orantılı: süre %10 düşerse çıktı %11,1 artar (1/0,9 − 1).
 */
export function mtmDuyarliligi(sureDegisimOrani: number): number | null {
  const yeni = 1 + sureDegisimOrani
  if (yeni <= 0) return null
  return 1 / yeni - 1
}
