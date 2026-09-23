/**
 * Maliyet DNA — gider kompozisyonunun atölyeler arası karşılaştırması.
 *
 * Rasyolar "ne kadar" sorusunu cevaplıyor; DNA "**neye** harcıyor" sorusunu.
 * İki atölyenin kişi başı gideri aynı olabilir ama biri kirada, öteki
 * işçilikte ağırdır — pazarlıkta ve iyileştirmede bakılacak yer farklıdır.
 *
 * Asıl bilgi payların kendisinde değil, **örneklemden sapmada**. Herkesin
 * işçiliği %65-75'tir; ayırt edici olan, birinin mekânı %15 iken medyanın
 * %5 olmasıdır. Bu yüzden gruplar mutlak sapmaya göre sıralı döner.
 *
 * Kaynak veri: migration 021 `v_expense_groups` (G1-G8, brüt).
 */
import { medyan } from './ekonomi-akran'
import { G_KEYS, type GKey } from './gider-gruplari'

/** v_expense_groups'tan bir atölye-ay satırı. Tutarlar TL, teşvik düşülmemiş. */
export type GiderGrupSatiri = {
  workshopId: number
  ad: string
} & Record<GKey, number | null>

export type GrupPaylari = Record<GKey, number | null>

export type DnaGrubu = {
  grup: GKey
  /** Bu atölyede grubun brüt gider içindeki payı. */
  pay: number | null
  /** Örneklemin aynı gruptaki medyan payı. */
  medyanPay: number | null
  /** pay − medyanPay. Pozitif = bu grupta örneklemden ağır. */
  sapma: number | null
}

export type DnaProfili = {
  workshopId: number
  ad: string
  /** Brüt gider toplamı; sıfır ya da veri yoksa null. */
  toplam: number | null
  /** Mutlak sapmaya göre azalan sırada — en ayırt edici grup başta. */
  gruplar: DnaGrubu[]
}

function toplamGider(s: GiderGrupSatiri): number | null {
  let t = 0
  let varMi = false
  for (const k of G_KEYS) {
    const v = s[k]
    if (typeof v === 'number' && Number.isFinite(v)) { t += v; varMi = true }
  }
  if (!varMi || t === 0) return null
  return t
}

/**
 * Her grubun brüt gider içindeki payı. Toplam sıfırsa her pay null —
 * 0 değil: "harcama yok" ile "pay hesaplanamadı" aynı şey değil.
 */
export function grupPaylari(s: GiderGrupSatiri): GrupPaylari {
  const toplam = toplamGider(s)
  const cikti = {} as GrupPaylari
  for (const k of G_KEYS) {
    if (toplam === null) { cikti[k] = null; continue }
    const v = s[k]
    cikti[k] = typeof v === 'number' && Number.isFinite(v) ? v / toplam : 0
  }
  return cikti
}

/**
 * Bir atölyenin DNA profili: her grubun payı, örneklem medyanı ve sapması.
 * `orneklem` bütün atölyeleri içerir (hedef dahil) — medyan oradan gelir.
 */
export function dnaProfili(
  hedef: GiderGrupSatiri,
  orneklem: GiderGrupSatiri[],
): DnaProfili {
  const paylar = grupPaylari(hedef)
  const orneklemPaylari = orneklem.map(grupPaylari)

  const gruplar: DnaGrubu[] = G_KEYS.map(k => {
    const pay = paylar[k]
    const medyanPay = medyan(orneklemPaylari.map(p => p[k]))
    return {
      grup: k,
      pay,
      medyanPay,
      sapma: pay === null || medyanPay === null ? null : pay - medyanPay,
    }
  })

  // Sapması olmayanlar (null) sona; eşitlikte sabit grup sırası korunur.
  gruplar.sort((a, b) => {
    const x = a.sapma === null ? -1 : Math.abs(a.sapma)
    const y = b.sapma === null ? -1 : Math.abs(b.sapma)
    return y - x || G_KEYS.indexOf(a.grup) - G_KEYS.indexOf(b.grup)
  })

  return { workshopId: hedef.workshopId, ad: hedef.ad, toplam: toplamGider(hedef), gruplar }
}

/** Örneklemdeki her atölye için profil. Medyan hep tüm örneklemden. */
export function dnaProfilleri(orneklem: GiderGrupSatiri[]): DnaProfili[] {
  return orneklem.map(s => dnaProfili(s, orneklem))
}

/**
 * Atölyeyi örneklemden en çok ayıran grup. Profilin ilk elemanıdır;
 * sapması hesaplanamıyorsa null — "en ayırt edici" diye bir şey yoktur.
 */
export function enAyirtEdiciGrup(profil: DnaProfili): DnaGrubu | null {
  const ilk = profil.gruplar[0]
  return ilk && ilk.sapma !== null ? ilk : null
}
