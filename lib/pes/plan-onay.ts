/**
 * İki taraflı onay — saf kurallar.
 *
 * Araştırmadaki tedarikçi portalı döngüsü: planlamacı teklif eder, atölye
 * KABUL eder / REVİZYON önerir / REDDEDER. Cevap yapısal olmak zorunda;
 * "olmaz" tek başına planlamacıya yeni tur açtırmaz.
 *
 * ZAMAN ÇİTİ ENGELLEMEZ, UYARIR (kullanıcı kararı 2026-09-25). MRP'nin
 * planning time fence'i normalde dondurur; burada yumuşak tutuldu, ama
 * çit içindeki bir değişiklik atölyeye BİLDİRİLİR — sessizce değişen bir
 * plan, onay mekanizmasını anlamsız kılar.
 */

export type TeklifDurumu = 'bekliyor' | 'kabul' | 'revizyon' | 'ret'

export type GerekceKodu =
  | 'KAPASITE_YOK'
  | 'MALZEME_GEC'
  | 'ONCEKI_IS_GECIKTI'
  | 'MAKINE_ARIZA'
  | 'ISGUCU_YETERSIZ'
  | 'NUMUNE_ONAY_BEKLIYOR'
  | 'TATIL_IZIN'
  | 'DIGER'

/** Ekranda gösterilen etiketler. Kod veritabanında, metin burada. */
export const GEREKCE_ETIKET: Record<GerekceKodu, string> = {
  KAPASITE_YOK: 'Kapasite yetmiyor',
  MALZEME_GEC: 'Kumaş / aksesuar gelmedi',
  ONCEKI_IS_GECIKTI: 'Önceki iş sarktı',
  MAKINE_ARIZA: 'Makine arızası / bakım',
  ISGUCU_YETERSIZ: 'İşgücü yetersiz',
  NUMUNE_ONAY_BEKLIYOR: 'Numune / tech pack onayı bekliyor',
  TATIL_IZIN: 'Tatil / izin',
  DIGER: 'Diğer',
}

export const GEREKCE_KODLARI = Object.keys(GEREKCE_ETIKET) as GerekceKodu[]

export const DURUM_ETIKET: Record<TeklifDurumu, string> = {
  bekliyor: 'Cevap bekliyor',
  kabul: 'Kabul edildi',
  revizyon: 'Revizyon önerildi',
  ret: 'Reddedildi',
}

/** Atölyenin verebileceği cevap. */
export type Cevap = {
  durum: Exclude<TeklifDurumu, 'bekliyor'>
  gerekceKodu: GerekceKodu | null
  not: string | null
}

export type CevapHatasi = { alan: string; mesaj: string }

/**
 * Cevabın geçerliliği.
 *
 * Kurallar veritabanındaki CHECK'lerle aynı — ama burada da var, çünkü
 * kullanıcıya "constraint violation" göstermek cevap değildir.
 */
export function cevapDogrula(c: Cevap): CevapHatasi[] {
  const hatalar: CevapHatasi[] = []

  if (c.durum === 'revizyon' || c.durum === 'ret') {
    if (!c.gerekceKodu) {
      hatalar.push({
        alan: 'gerekceKodu',
        mesaj: '"Olmaz" demek yetmez: planlamacının yeni tur açabilmesi için gerekçe şart.',
      })
    }
  }

  /* DIGER seçildiyse serbest metin zorunlu — kod tek başına bilgi taşımaz. */
  if (c.gerekceKodu === 'DIGER' && !c.not?.trim()) {
    hatalar.push({ alan: 'not', mesaj: '"Diğer" seçildiğinde açıklama zorunlu.' })
  }

  return hatalar
}

export type TeklifKalem = {
  id: number
  workOrderId: number
  lineId: number
  baslangic: string
  bitis: string
  adet: number
  karsiBaslangic: string | null
  karsiAdet: number | null
  karsiNot: string | null
}

export type KalemFarki = {
  kalemId: number
  workOrderId: number
  gunKaymasi: number | null
  adetFarki: number | null
  degisti: boolean
}

/** b − a, gün. Tarihler 'YYYY-MM-DD'; saat dilimi taşımaz. */
function gunFarki(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((t(b) - t(a)) / 86_400_000)
}

/**
 * Atölyenin karşı önerisi teklifin neresinden ayrılıyor.
 *
 * NULL karşı öneri "itirazım yok" demektir, "sıfır kaydırma" değil. İkisini
 * birleştirmek, atölyenin dokunmadığı kalemi de pazarlık konusu gösterir.
 */
export function kalemFarklari(kalemler: TeklifKalem[]): KalemFarki[] {
  return kalemler.map((k) => {
    const gunKaymasi = k.karsiBaslangic === null ? null : gunFarki(k.baslangic, k.karsiBaslangic)
    const adetFarki = k.karsiAdet === null ? null : k.karsiAdet - k.adet
    return {
      kalemId: k.id,
      workOrderId: k.workOrderId,
      gunKaymasi,
      adetFarki,
      degisti: (gunKaymasi !== null && gunKaymasi !== 0) || (adetFarki !== null && adetFarki !== 0),
    }
  })
}

/** Karşı önerinin özeti — planlamacı bir bakışta görsün. */
export type FarkOzeti = {
  degisenKalem: number
  toplamKalem: number
  enBuyukKayma: number
  toplamAdetFarki: number
}

export function farkOzeti(farklar: KalemFarki[]): FarkOzeti {
  const degisen = farklar.filter((f) => f.degisti)
  return {
    degisenKalem: degisen.length,
    toplamKalem: farklar.length,
    enBuyukKayma: degisen.reduce((m, f) => Math.max(m, Math.abs(f.gunKaymasi ?? 0)), 0),
    toplamAdetFarki: degisen.reduce((t, f) => t + (f.adetFarki ?? 0), 0),
  }
}

/**
 * Kabul edilen teklifin GERÇEK plana dönüşecek hâli.
 *
 * Karşı öneri varsa O geçerlidir: planlamacı revizyonu kabul ettiğinde
 * atölyenin tarihleri yazılır, kendi ilk teklifi değil. Aksi halde "kabul
 * ettim" der ama eski tarihi yazar ve atölye yine tutturamaz.
 */
export function gecerliYerlesim(k: TeklifKalem): { baslangic: string; adet: number } {
  return {
    baslangic: k.karsiBaslangic ?? k.baslangic,
    adet: k.karsiAdet ?? k.adet,
  }
}

/** Bir durumdan hangi durumlara geçilebilir. */
const GECISLER: Record<TeklifDurumu, TeklifDurumu[]> = {
  bekliyor: ['kabul', 'revizyon', 'ret'],
  /* Cevaplanmış teklif yeniden cevaplanmaz; planlamacı YENİ TUR açar.
     Aynı turu değiştirmek, geçmişi silmek demektir. */
  kabul: [],
  revizyon: [],
  ret: [],
}

export function gecisGecerli(mevcut: TeklifDurumu, yeni: TeklifDurumu): boolean {
  return GECISLER[mevcut].includes(yeni)
}
