/**
 * Akran karşılaştırması — medyan, yüzdelik, sıralama.
 *
 * FORMULLER!E53: "Benchmark = örneklem medyanı. 30+ atölyede aynı klasman /
 * büyüklük / bölge akran grubuna geçilmeli."
 *
 * Bugün 11 atölye var; medyan bu örneklemde zayıf bir istatistiktir. Bunu
 * gizlemek yerine her karşılaştırmanın yanında kademe ve n gösterilir.
 */

export type BuyuklukBandi = 'kucuk' | 'orta' | 'buyuk'

export type AkranAdayi = {
  workshopId: number
  ad: string
  klasmanlar: string[]
  sewingStaff: number | null
  /** Marjı null olan atölye örnekleme girmez — cirosu yok demektir. */
  marj: number | null
}

export type AkranKademesi = 'klasman+buyukluk' | 'klasman' | 'tumu'

export type AkranSonucu = {
  kademe: AkranKademesi
  n: number
  uyeler: AkranAdayi[]
}

/** Null'ları atlayarak medyan. Hiç sayı yoksa null. */
export function medyan(degerler: Array<number | null>): number | null {
  const sayilar = degerler.filter((d): d is number => d !== null && Number.isFinite(d))
  if (sayilar.length === 0) return null
  const s = [...sayilar].sort((a, b) => a - b)
  const orta = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[orta] : (s[orta - 1] + s[orta]) / 2
}

/**
 * FORMULLER!C56 — kendisinden kötü olan atölye sayısı ÷ (n − 1) × 100.
 * Tek elemanlı örneklemde kıyas yoktur; null döner.
 */
export function yuzdelikSkor(deger: number | null, orneklem: Array<number | null>): number | null {
  if (deger === null) return null
  const sayilar = orneklem.filter((d): d is number => d !== null && Number.isFinite(d))
  if (sayilar.length < 2) return null
  const kotuSayisi = sayilar.filter(d => d < deger).length
  return (kotuSayisi / (sayilar.length - 1)) * 100
}

/** Dikim kişi sayısına göre büyüklük bandı. Sınırlar tasarım dokümanından. */
export function buyuklukBandi(sewingStaff: number | null): BuyuklukBandi | null {
  if (sewingStaff === null) return null
  if (sewingStaff < 50) return 'kucuk'
  if (sewingStaff <= 100) return 'orta'
  return 'buyuk'
}

/**
 * Kademeli akran grubu:
 *   1. aynı klasman + aynı büyüklük bandı   (≥ esik üye)
 *   2. n < esik ise → aynı klasman          (≥ ⌈esik/2⌉ üye yeterli)
 *   3. hâlâ yetmezse → tüm örneklem
 *
 * Orta kademede daha yumuşak eşik (⌈esik/2⌉) kullanılır: daha geniş
 * gruptan az sayıda akran gelmesi halinde bile klasman bağlamı korunur.
 * Marjı null olan (cirosu olmayan) atölyeler hiçbir kademede sayılmaz.
 */
export function akranGrubu(
  hedef: AkranAdayi, tumu: AkranAdayi[], esik = 5,
): AkranSonucu {
  const gecerli = tumu.filter(a => a.marj !== null)
  const hedefBant = buyuklukBandi(hedef.sewingStaff)
  const esikOrta = Math.ceil(esik / 2)

  const klasmanOrtak = (a: AkranAdayi) =>
    a.klasmanlar.some(k => hedef.klasmanlar.includes(k))

  const dar = gecerli.filter(a => klasmanOrtak(a) && buyuklukBandi(a.sewingStaff) === hedefBant)
  if (dar.length >= esik) return { kademe: 'klasman+buyukluk', n: dar.length, uyeler: dar }

  const orta = gecerli.filter(klasmanOrtak)
  if (orta.length >= esikOrta) return { kademe: 'klasman', n: orta.length, uyeler: orta }

  return { kademe: 'tumu', n: gecerli.length, uyeler: gecerli }
}

/**
 * HESAP!AO — marjı kendisinden büyük olan atölye sayısı + 1. 1 = en kârlı.
 * Marjı olmayan atölye sıralanmaz.
 */
export function marjSirasi(marj: number | null, orneklem: AkranAdayi[]): number | null {
  if (marj === null) return null
  const ustunde = orneklem.filter(a => a.marj !== null && a.marj > marj).length
  return ustunde + 1
}

/**
 * FORMULLER!C57 (Pano 05) — dikim dk cirosu ÷ örneklem medyanı × 100.
 *
 * 100 = örneklemin ortasında. Bu bir FİYAT göstergesidir, verimlilik değil:
 * atölyenin bir dikim dakikasını kaça sattığını söyler. Yüksek endeks +
 * yüksek üretkenlik, faturada pahalı ama toplam ekonomik maliyette ucuz
 * olabilir — ikisi birlikte okunur.
 *
 * Örnekleme bağlı olduğu için hesapla() içinde değil burada: tek atölyeden
 * hesaplanamaz, marjSirasi gibi ikinci geçişte doldurulur.
 */
export function fiyatEndeksi(
  deger: number | null,
  orneklem: Array<number | null>,
): number | null {
  if (deger === null) return null
  const med = medyan(orneklem)
  if (med === null || med === 0) return null
  return (deger / med) * 100
}

export type EndeksOkumasi = 'ucuz' | 'ortalama' | 'pahali'

/**
 * FORMULLER!E57 eşikleri: 115 üstü dakika başına pahalı, 85 altı ucuz.
 * Sınırlar (85 ve 115) 'ortalama' sayılır — eşikte oynayan bir atölyeyi
 * uca atmamak için.
 */
export function endeksOkumasi(endeks: number | null): EndeksOkumasi | null {
  if (endeks === null) return null
  if (endeks > 115) return 'pahali'
  if (endeks < 85) return 'ucuz'
  return 'ortalama'
}
