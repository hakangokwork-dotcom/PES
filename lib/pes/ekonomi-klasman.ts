/**
 * Klasman merkezli karşılaştırma.
 *
 * NEDEN AYRI BİR KATMAN: akranGrubu() atölyeden başlıyor — "bu atölyenin
 * akranları kim". PES klasmanı bant seviyesinde olduğu ve atölyeler çok
 * klasman diktiği için bu soru anlamsız bir cevap veriyor: 11 pilotta
 * "herhangi bir ortak klasman" kuralıyla gruplar n=5..11 çıkıyor, İmkot
 * herkesle akran oluyor.
 *
 * Buradaki katman ters yönden bakıyor: klasmandan başlar — "PANTOLON diken
 * atölyeler kim, hangisi kâr ediyor". Kullanıcının iki sorusu da bu:
 * "aynı klasmanı diken atölyeler arası" ve "hangi klasmanda zarar ediyoruz".
 *
 * BİLİNEN SINIR: atölyenin rasyosu TÜM üretimi içindir, klasman başına
 * ayrışmaz. Yani "PANTOLON'da Örssan'ın marjı −%3,2" demek değil; "PANTOLON
 * diken Örssan'ın (tüm işinden) marjı −%3,2" demek. Klasman başına gerçek
 * P&L model katmanından (E3) gelecek. Ekran bunu yazmak zorunda.
 */
import { medyan } from './ekonomi-akran'

/** Karşılaştırmaya giren bir atölye. Rasyolar hesapla() çıktısından. */
export type KlasmanAtolyesi = {
  workshopId: number
  ad: string
  /** PES yetenek klasmanları (line_capability value_code). Boşsa gruplanmaz. */
  klasmanlar: string[]
  /** null = cirosu yok, hesaplanamadı. Örnekleme girmez. */
  marj: number | null
  dikimDkCiro: number | null
}

export type KlasmanOzeti = {
  klasman: string
  /** Bu klasmanı diken atölye sayısı — marjı olmayanlar dahil. */
  atolyeSayisi: number
  /** Marjı hesaplanabilen atölye sayısı. Medyanın n'i budur. */
  marjliAtolyeSayisi: number
  medyanMarj: number | null
  medyanDikimDkCiro: number | null
  enIyi: KlasmanAtolyesi | null
  enKotu: KlasmanAtolyesi | null
  /** En iyi ile en kötü marj farkı. Tek atölyede 0, marjlı yoksa null. */
  yayilim: number | null
  zarardaSayisi: number
  atolyeler: KlasmanAtolyesi[]
}

/**
 * line_capability satırlarını (bant başına bir satır) atölye başına
 * benzersiz, alfabetik klasman listesine çevirir.
 *
 * Bant seviyesinden geldiği için aynı klasman bir atölyede birden çok kez
 * görünür; tekilleştirilmezse gruplama sayıları şişer.
 */
export function atolyeKlasmanlari(
  satirlar: Array<{ workshop_id: number; value_code: string }>,
): Map<number, string[]> {
  const kumeler = new Map<number, Set<string>>()
  for (const s of satirlar) {
    if (!s.value_code) continue
    const mevcut = kumeler.get(s.workshop_id) ?? new Set<string>()
    mevcut.add(s.value_code)
    kumeler.set(s.workshop_id, mevcut)
  }
  const harita = new Map<number, string[]>()
  for (const [id, kume] of kumeler) {
    harita.set(id, [...kume].sort((a, b) => a.localeCompare(b, 'tr')))
  }
  return harita
}

/**
 * Atölyeleri klasmanlarına göre gruplar. Bir atölye diktiği her klasmanın
 * listesinde görünür — bu bir kopya değil, verinin kendisi.
 */
export function klasmanlariGrupla(
  atolyeler: KlasmanAtolyesi[],
): Map<string, KlasmanAtolyesi[]> {
  const gruplar = new Map<string, KlasmanAtolyesi[]>()
  for (const a of atolyeler) {
    for (const k of a.klasmanlar) {
      gruplar.set(k, [...(gruplar.get(k) ?? []), a])
    }
  }
  return gruplar
}

/** Tek bir klasmanın özeti. `atolyeler` tüm örneklemdir, filtrelenmemiş. */
export function klasmanOzeti(
  klasman: string,
  atolyeler: KlasmanAtolyesi[],
): KlasmanOzeti {
  const uyeler = atolyeler.filter(a => a.klasmanlar.includes(klasman))
  const marjli = uyeler.filter(
    (a): a is KlasmanAtolyesi & { marj: number } => a.marj !== null,
  )

  // Sıralamada eşitlik olursa ada göre — liste her açılışta aynı görünsün.
  const sirali = [...marjli].sort(
    (x, y) => y.marj - x.marj || x.ad.localeCompare(y.ad, 'tr'),
  )
  const enIyi = sirali[0] ?? null
  const enKotu = sirali[sirali.length - 1] ?? null

  return {
    klasman,
    atolyeSayisi: uyeler.length,
    marjliAtolyeSayisi: marjli.length,
    medyanMarj: medyan(uyeler.map(a => a.marj)),
    medyanDikimDkCiro: medyan(uyeler.map(a => a.dikimDkCiro)),
    enIyi,
    enKotu,
    yayilim: enIyi && enKotu ? enIyi.marj - enKotu.marj : null,
    zarardaSayisi: marjli.filter(a => a.marj < 0).length,
    atolyeler: uyeler,
  }
}

/**
 * Bütün klasmanların özeti. Varsayılan sıra: en çok atölyeli önce, eşitlikte
 * alfabetik — böylece liste veri değişmedikçe yer değiştirmez.
 */
export function klasmanOzetleri(atolyeler: KlasmanAtolyesi[]): KlasmanOzeti[] {
  const klasmanlar = [...klasmanlariGrupla(atolyeler).keys()]
  return klasmanlar
    .map(k => klasmanOzeti(k, atolyeler))
    .sort(
      (x, y) =>
        y.atolyeSayisi - x.atolyeSayisi ||
        x.klasman.localeCompare(y.klasman, 'tr'),
    )
}
