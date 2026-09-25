/**
 * Yetenek filtresi — bant takviminde "bu işi kim dikebilir" sorusu.
 *
 * PES'te 11 yetenek boyutu var (klasman, ana_grup, kumas_turu,
 * makine_parkuru, cinsiyet_yas, …) ve 121 değer. Eski filtre tek serbest
 * metindi ve BOYUT FARKI GÖZETMİYORDU: "DENIM" ana_grup'ta, "PANTOLON"
 * klasman'da geçiyor ve ikisini birlikte sormanın yolu yoktu.
 *
 * SEMANTİK: boyut İÇİNDE "veya", boyutlar ARASINDA "ve".
 *   {ana_grup: [DENIM, DOKUMA_ALT], klasman: [PANTOLON]}
 *   → (denim VEYA dokuma alt) VE pantolon
 * Planlamacının düşünme biçimi bu: "denim ya da dokuma alt olsun, ama
 * mutlaka pantolon dikebilsin."
 *
 * ATÖLYE SEVİYESİNDE SÜZÜLÜR. Yetenek `line_capability`'de bant seviyesinde
 * duruyor ama 136 atölyenin yalnız 5'inde bantlar birbirinden farklı;
 * bant seviyesi filtre bu 5 atölye için taşınacak karmaşıklığa değmiyor.
 * Fark büyürse burası değişmeli — kural kodun kendisinde değil, veride.
 */

/** boyut kodu → seçilen değer kodları. */
export type YetenekSecim = Record<string, string[]>

/** URL'de taşınan biçim: "klasman:PANTOLON,ana_grup:DENIM" */
const AYIRAC = ','
const CIFT = ':'

/* Kod alfabesi: veri tabanındaki kodlar BÜYÜK_HARF_ALTÇİZGİ. Serbest metne
   izin vermek, URL'den gelen her şeyi sorguya taşımak demekti. */
const GECERLI = /^[A-Za-z0-9_]+$/

/** URL parametresini çözer. Bozuk parça SESSİZCE ATILIR, sorgu kirlenmez. */
export function cozumle(param: string | null | undefined): YetenekSecim {
  if (!param) return {}
  const cikti: YetenekSecim = {}
  for (const parca of param.split(AYIRAC)) {
    const [boyut, deger] = parca.split(CIFT)
    if (!boyut || !deger) continue
    if (!GECERLI.test(boyut) || !GECERLI.test(deger)) continue
    ;(cikti[boyut] ??= []).push(deger)
  }
  /* Aynı değer iki kez gelirse tekilleştir; HAVING sayımı bozulmasın. */
  for (const b of Object.keys(cikti)) cikti[b] = [...new Set(cikti[b])]
  return cikti
}

/** Seçimi URL biçimine çevirir. Sıra kararlı: aynı seçim aynı URL'yi verir. */
export function metinle(secim: YetenekSecim): string {
  const parcalar: string[] = []
  for (const boyut of Object.keys(secim).sort()) {
    for (const deger of [...secim[boyut]].sort()) {
      parcalar.push(`${boyut}${CIFT}${deger}`)
    }
  }
  return parcalar.join(AYIRAC)
}

export function bosMu(secim: YetenekSecim): boolean {
  return Object.values(secim).every((v) => v.length === 0)
}

/** Kaç boyut seçili — SQL'deki HAVING sayımı bununla eşleşmeli. */
export function boyutSayisi(secim: YetenekSecim): number {
  return Object.values(secim).filter((v) => v.length > 0).length
}

/** Sorguya gidecek (boyut, değer) çiftleri. */
export function ciftler(secim: YetenekSecim): Array<[string, string]> {
  const cikti: Array<[string, string]> = []
  for (const boyut of Object.keys(secim)) {
    for (const deger of secim[boyut]) cikti.push([boyut, deger])
  }
  return cikti
}

/** Bir değeri ekler/çıkarır — arayüzdeki onay kutusu bunu çağırır. */
export function degistir(
  secim: YetenekSecim, boyut: string, deger: string,
): YetenekSecim {
  const mevcut = secim[boyut] ?? []
  const yeni = mevcut.includes(deger)
    ? mevcut.filter((d) => d !== deger)
    : [...mevcut, deger]
  const cikti = { ...secim, [boyut]: yeni }
  if (yeni.length === 0) delete cikti[boyut]
  return cikti
}

/**
 * Bir atölyenin yetenekleri seçime uyuyor mu.
 *
 * Sunucu zaten süzüyor; bu istemci tarafında rozet/uyarı göstermek için.
 * SQL'deki kuralla AYNI olmak zorunda — ayrılırsa ekran sunucunun
 * döndürdüğünden farklı bir şey söyler.
 */
export function eslesirMi(
  atolyeYetenekleri: Array<{ boyut: string; deger: string }>,
  secim: YetenekSecim,
): boolean {
  if (bosMu(secim)) return true
  for (const boyut of Object.keys(secim)) {
    const istenen = secim[boyut]
    if (istenen.length === 0) continue
    const varMi = atolyeYetenekleri.some(
      (y) => y.boyut === boyut && istenen.includes(y.deger))
    if (!varMi) return false   // boyutlar arasında VE
  }
  return true
}

/** Ekranda gösterilecek boyut adları. Kod veritabanında, metin burada. */
export const BOYUT_ETIKET: Record<string, string> = {
  klasman: 'Klasman',
  ana_grup: 'Ana grup',
  kumas_turu: 'Kumaş türü',
  kumas_grubu: 'Kumaş grubu',
  makine_parkuru: 'Makine parkuru',
  cinsiyet_yas: 'Cinsiyet / yaş',
  siluet: 'Silüet',
  cep_turu: 'Cep türü',
  kalip_turu: 'Kalıp türü',
  yaka_turu: 'Yaka türü',
  kol_turu: 'Kol türü',
}

/** Bilinmeyen boyut da gösterilebilmeli — katalog büyürse ekran susmasın. */
export function boyutAdi(kod: string): string {
  return BOYUT_ETIKET[kod] ?? kod.replace(/_/g, ' ')
}
