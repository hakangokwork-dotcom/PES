/* Atölyenin hangi aşamayı yapabildiği (tasarım K4).

   KAYNAK: workshop_profil.uretim_tipi — tedarik ekibinin Excel'inden
   gelen serbest metin. Gözlenen değerler: CMT, UKP, DİKİM-UKP, DİKİM,
   KESİM-DİKİM. workshop.production_type'ta ayrıca "CMT+Yıkama" var.

   BU BİR ÇIKARIMDIR, kesin bilgi değil. Metin tanınmıyorsa null döner
   ve sistem hiçbir şey varsaymaz — kullanıcıyı yanlış bir "bu atölye
   UKP yapamaz" uyarısıyla gereksiz adıma sokmak, hiç uyarmamaktan
   kötüdür. Kesinlik gerekiyorsa atölye başına yetenek işaretlemesi
   ayrı bir iş olarak eklenmeli. */

export type Yetenek = 'kesim' | 'dikim' | 'ukp' | 'yikama'

/** Aşama kodu → gerektirdiği yetenek. Listede olmayan aşama (NUMUNE,
    HAZIRLIK, SEVK) her atölyede yapılabilir sayılır. */
const ASAMA_YETENEGI: Record<string, Yetenek> = {
  KESIM: 'kesim',
  DIKIM: 'dikim',
  YIKAMA: 'yikama',
  UTU: 'ukp',
  KALITE: 'ukp',
  UKP: 'ukp',
  PAKET: 'ukp',
}

/** Üretim tipi metnini yeteneklere çevirir. Tanınmayan metin → null. */
function yetenekler(uretimTipi: string | null | undefined): Set<Yetenek> | null {
  if (!uretimTipi) return null
  const t = uretimTipi.toLocaleUpperCase('tr-TR').replace(/İ/g, 'I')

  const set = new Set<Yetenek>()
  if (t.includes('YIKAMA')) set.add('yikama')

  if (t.includes('CMT')) { set.add('kesim'); set.add('dikim'); set.add('ukp') }
  if (t.includes('KESIM')) set.add('kesim')
  if (t.includes('DIKIM')) set.add('dikim')
  if (t.includes('UKP')) set.add('ukp')

  return set.size > 0 ? set : null
}

/**
 * Bu atölye bu aşamayı yapabilir mi?
 *   true  → yapabilir
 *   false → yapamaz, dışarı çıkmalı
 *   null  → üretim tipi bilinmiyor/tanınmıyor, varsayım yapılmıyor
 */
export function asamaYapabilirMi(
  uretimTipi: string | null | undefined,
  asamaKodu: string,
): boolean | null {
  const gereken = ASAMA_YETENEGI[asamaKodu]
  if (!gereken) return true          // NUMUNE, HAZIRLIK, SEVK — herkes yapar

  const sahip = yetenekler(uretimTipi)
  if (sahip === null) return null

  return sahip.has(gereken)
}

/**
 * Seçilen zincirde bu atölyenin YAPAMADIĞI aşamalar.
 * Bilinmeyen üretim tipinde boş döner — emin olmadan kullanıcıyı
 * dış atölye seçmeye zorlamayız.
 */
export function disariCikanAsamalar(
  uretimTipi: string | null | undefined,
  asamaKodlari: string[],
): string[] {
  return asamaKodlari.filter(k => asamaYapabilirMi(uretimTipi, k) === false)
}
