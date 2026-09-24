/**
 * Atölyeye gösterilecek akran kıyası — kimseyi ifşa etmeden.
 *
 * Atölye kullanıcısı RLS yüzünden başka atölyenin satırını göremez, yani
 * medyanı kendisi hesaplayamaz. Özet uygulama katmanında, bilinçli olarak
 * yükseltilmiş bir bağlamda hesaplanır ve BURADAN yalnız TOPLU sayılar
 * çıkar: n, medyan, çeyreklikler, sıra. Hiçbir atölye adı, kodu, kimliği
 * ya da tek tek değeri dönmez — tipler bunu yapısal olarak imkânsız kılar.
 *
 * KÜÇÜK ÖRNEKLEM KORUMASI: n < 5 ise özet NULL döner. Üç atölyelik bir
 * grupta medyan, atölyenin rakibinin rakamını doğrudan ifşa eder; ikisinde
 * medyan zaten "öteki"dir. Bu sayısal bir incelik değil, gizlilik şartı.
 *
 * Rasyoların formülü SQL'e KOPYALANMADI. 37 rasyoyu SQL'de yeniden yazmak,
 * formül kütüphanesinde (E2) uyardığım sürüklenmenin ta kendisi olurdu;
 * tek kaynak ekonomi-hesap.ts'tir.
 */

/** Altında akran özetinin gösterilmediği örneklem büyüklüğü. */
export const ASGARI_ORNEKLEM = 5

export type AkranIstatistik = {
  /** Örneklemdeki atölye sayısı (kendisi dahil). */
  n: number
  medyan: number
  q1: number
  q3: number
  enDusuk: number
  enYuksek: number
  /** Atölyenin kendi değeri; hesaplanamadıysa null. */
  kendiDeger: number | null
  /** 1 = en iyi. Yöne göre sıralanır. Kendi değeri yoksa null. */
  kendiSira: number | null
}

function yuzdelik(sirali: number[], p: number): number {
  if (sirali.length === 1) return sirali[0]
  const i = (sirali.length - 1) * p
  const alt = Math.floor(i)
  const ust = Math.ceil(i)
  if (alt === ust) return sirali[alt]
  return sirali[alt] + (sirali[ust] - sirali[alt]) * (i - alt)
}

/**
 * Bir göstergenin akran özeti.
 *
 * @param kendiDeger atölyenin kendi değeri (null olabilir)
 * @param orneklem   kendisi dahil bütün değerler; null olanlar elenir
 * @param yon        'yuksek-iyi' ise büyük değer 1. sıra
 */
export function akranIstatistik(
  kendiDeger: number | null,
  orneklem: Array<number | null>,
  yon: 'yuksek-iyi' | 'dusuk-iyi',
): AkranIstatistik | null {
  const degerler = orneklem.filter((d): d is number => d !== null && Number.isFinite(d))
  if (degerler.length < ASGARI_ORNEKLEM) return null

  const sirali = [...degerler].sort((a, b) => a - b)

  let kendiSira: number | null = null
  if (kendiDeger !== null && Number.isFinite(kendiDeger)) {
    /* Sıra = kendisinden DAHA İYİ olanların sayısı + 1. Eşitler aynı sırayı
       paylaşır; "kaçıncı sıradayım" sorusunun beklenen cevabı budur. */
    const dahaIyi = yon === 'yuksek-iyi'
      ? degerler.filter((d) => d > kendiDeger).length
      : degerler.filter((d) => d < kendiDeger).length
    kendiSira = dahaIyi + 1
  }

  return {
    n: degerler.length,
    medyan: yuzdelik(sirali, 0.5),
    q1: yuzdelik(sirali, 0.25),
    q3: yuzdelik(sirali, 0.75),
    enDusuk: sirali[0],
    enYuksek: sirali[sirali.length - 1],
    kendiDeger: kendiDeger !== null && Number.isFinite(kendiDeger) ? kendiDeger : null,
    kendiSira,
  }
}

/** Atölyenin kendi değeri çeyrekliklere göre nerede duruyor. */
export type Konum = 'ust-ceyrek' | 'ust-orta' | 'alt-orta' | 'alt-ceyrek'

export function konum(ist: AkranIstatistik, yon: 'yuksek-iyi' | 'dusuk-iyi'): Konum | null {
  if (ist.kendiDeger === null) return null
  const v = ist.kendiDeger
  /* Çeyreklikler her zaman küçükten büyüğe; "üst" olan yöne göre değişir. */
  if (yon === 'yuksek-iyi') {
    if (v >= ist.q3) return 'ust-ceyrek'
    if (v >= ist.medyan) return 'ust-orta'
    if (v >= ist.q1) return 'alt-orta'
    return 'alt-ceyrek'
  }
  if (v <= ist.q1) return 'ust-ceyrek'
  if (v <= ist.medyan) return 'ust-orta'
  if (v <= ist.q3) return 'alt-orta'
  return 'alt-ceyrek'
}

export const KONUM_ETIKET: Record<Konum, string> = {
  'ust-ceyrek': 'En iyi çeyrek',
  'ust-orta': 'Ortalamanın üstü',
  'alt-orta': 'Ortalamanın altı',
  'alt-ceyrek': 'En alt çeyrek',
}
