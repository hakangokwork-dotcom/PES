/**
 * Hesap izi — bir formülü gerçek sayılarla gösterir.
 *
 * "Marj neden −%4?" sorusunun cevabı formülün kendisi değil, o formüle giren
 * sayılardır. İz, her girdiyi gerçek değeriyle yan yana koyar; hangi girdinin
 * sonucu bozduğu doğrudan görünür.
 *
 * FORMÜL METNİNE SAYI YERLEŞTİREN AYRIŞTIRICI YAZILMADI. 54 farklı sözel
 * ifadeyi string ikamesiyle çözmek kırılgandır ve sessizce yanlış bir ifade
 * üretir — doğru görünen yanlış çıktı, hiç çıktı vermemekten kötüdür. İz
 * bunun yerine bir tablodur: girdi adı → gerçek değer, altında sonuç.
 *
 * ÜÇ DURUM AYRI TUTULUR:
 *   - deger sayı        → hesaplandı
 *   - deger null        → hesaplanamadı (girdi eksik). SIFIR DEĞİL.
 *   - bulundu === false → katalog havuzda olmayan bir anahtara işaret ediyor;
 *                         bu veri eksikliği değil, katalog hatasıdır.
 */
import type { FormulGirdisi } from './formul-katalogu'

/** Değer havuzu: 'ad alanı.alan' → değer. */
export type DegerHavuzu = Record<string, number | null>

export type IzSatiri = {
  etiket: string
  anahtar: string
  deger: number | null
  /** Anahtar havuzda tanımlı mı? false ise katalog sapmış demektir. */
  bulundu: boolean
}

export type IzSonucu = {
  /** Rasyo alan adı. */
  alan: string
  deger: number | null
}

export type FormulIzi = {
  formul: FormulGirdisi
  girdiler: IzSatiri[]
  /** Formülün hesapladığı alanlar ve değerleri; katalog alanı yoksa boş. */
  sonuclar: IzSonucu[]
  /** Girdilerden en az biri null mı — sonuç neden boş olabilir. */
  eksikGirdiVar: boolean
}

/** Bir nesnenin sayısal alanlarını ad alanı önekiyle havuza yazar. */
function serp(
  havuz: DegerHavuzu,
  onek: string,
  kaynak: Record<string, unknown> | null | undefined,
): void {
  if (!kaynak) return
  for (const [k, v] of Object.entries(kaynak)) {
    if (typeof v === 'number') havuz[`${onek}.${k}`] = v
    else if (v === null) havuz[`${onek}.${k}`] = null
    /* string ve boolean alanlar (source gibi) havuza girmez — iz sayı gösterir */
  }
}

/**
 * Katalog anahtarlarının çözüldüğü havuzu kurar.
 *
 * `atolye` ad alanı, ekonomi satırında olmayan atölye seviyesi bilgiler
 * içindir (teşvik bölgesi gibi) — bunlar workshop tablosundan gelir.
 */
export function degerHavuzu(girdi: {
  rasyo?: Record<string, unknown> | null
  param?: Record<string, unknown> | null
  giris?: Record<string, unknown> | null
  gider?: Record<string, unknown> | null
  atolye?: Record<string, unknown> | null
}): DegerHavuzu {
  const havuz: DegerHavuzu = {}
  serp(havuz, 'rasyo', girdi.rasyo)
  serp(havuz, 'param', girdi.param)
  serp(havuz, 'giris', girdi.giris)
  serp(havuz, 'gider', girdi.gider)
  serp(havuz, 'atolye', girdi.atolye)
  return havuz
}

/** Bir formülün izini çıkarır. */
export function formulIzi(formul: FormulGirdisi, havuz: DegerHavuzu): FormulIzi {
  const girdiler: IzSatiri[] = formul.girdiler.map((g) => {
    const bulundu = Object.hasOwn(havuz, g.anahtar)
    return { etiket: g.etiket, anahtar: g.anahtar, deger: bulundu ? havuz[g.anahtar] : null, bulundu }
  })

  const sonuclar: IzSonucu[] = formul.alanlar.map((alan) => ({
    alan,
    deger: Object.hasOwn(havuz, `rasyo.${alan}`) ? havuz[`rasyo.${alan}`] : null,
  }))

  return {
    formul,
    girdiler,
    sonuclar,
    eksikGirdiVar: girdiler.some((g) => g.deger === null),
  }
}

/**
 * Havuzda karşılığı olmayan katalog anahtarlarını listeler.
 *
 * Testte kullanılır: katalog eksik bir anahtara işaret ediyorsa iz sessizce
 * boş satır gösterir, bu da gerçek veri eksikliğiyle karışır.
 */
export function cozulmeyenAnahtarlar(
  formuller: FormulGirdisi[],
  havuz: DegerHavuzu,
): string[] {
  const eksik = new Set<string>()
  for (const f of formuller) {
    for (const g of f.girdiler) {
      if (!Object.hasOwn(havuz, g.anahtar)) eksik.add(`${f.id} → ${g.anahtar}`)
    }
  }
  return [...eksik].sort()
}
