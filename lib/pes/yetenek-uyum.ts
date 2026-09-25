/**
 * Yetenek uyumu — "bu işi bu atölye dikebilir mi?"
 *
 * İş emrinin künyesi (`work_order.*_kodu`) ile atölyenin yetenekleri
 * (`line_capability`) aynı katalogdan besleniyor ve boyut adları birebir
 * aynı; eşleştirme bu yüzden mümkün.
 *
 * BEŞ DURUM, DÖRDÜ "HAYIR" DEĞİL:
 *
 *   uygun          künye dolu, atölyede o yetenek var
 *   uygun-degil    künye dolu, atölyede o boyutta kayıt VAR ama bu değer YOK
 *   kunye-bos      iş emrinde o alan girilmemiş → sorulamadı
 *   atolye-kayitsiz atölyenin O BOYUTTA hiç kaydı yok → sorulamadı
 *   izlenmiyor     boyut yetenek kataloğunda hiç tutulmuyor (ör. kalite)
 *
 * Bu ayrım işin özü ve İKİ TARAFI DA var. "Künye boş" ile "uygun değil"i
 * birleştirmek her işi her atölyeye uygunsuz gösterir. Aynı şekilde
 * "atölyenin klasman kaydı yok" ile "bu klasmanı dikemez"i birleştirmek de
 * yanlış: kaydın olmaması yeteneğin olmadığını göstermez, kaydedilmediğini
 * gösterir.
 *
 * İkincisi canlı veride yakalandı: Ege Denim'in 11 yetenek kaydı var ama
 * hiçbiri klasman boyutunda değil. Eski kural onu her klasmanda "uygun
 * değil" sayıyordu — atölyeyi olmadığı bir şeyle suçlamak.
 */
import { KUNYE_BOYUTLARI, type Kunye, type KunyeKolonu } from './kunye'

export type UyumDurumu =
  | 'uygun' | 'uygun-degil' | 'kunye-bos' | 'atolye-kayitsiz' | 'izlenmiyor'

export type BoyutUyumu = {
  kolon: KunyeKolonu
  boyut: string
  /** İş emrinin istediği kod; künye boşsa null. */
  istenen: string | null
  durum: UyumDurumu
}

export type AtolyeYetenegi = { boyut: string; deger: string }

export const DURUM_ETIKET: Record<UyumDurumu, string> = {
  uygun: 'Uygun',
  'uygun-degil': 'Uygun değil',
  'kunye-bos': 'Künye boş',
  'atolye-kayitsiz': 'Atölyenin bu boyutta kaydı yok',
  izlenmiyor: 'İzlenmiyor',
}

function doluMu(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

/**
 * Künyenin her alanı için uyum.
 *
 * `izlenenBoyutlar` yetenek kataloğunda GERÇEKTEN tutulan boyutlar.
 * Verilmezse hepsi izleniyor sayılır — ama `kalite` gibi künyede olup
 * `line_capability`'de hiç geçmeyen boyutlar var ve onları "uygun değil"
 * saymak her atölyeyi haksız yere elerdi.
 */
export function boyutUyumlari(
  kunye: Kunye,
  atolyeYetenekleri: AtolyeYetenegi[],
  izlenenBoyutlar?: Set<string>,
): BoyutUyumu[] {
  return (Object.keys(KUNYE_BOYUTLARI) as KunyeKolonu[]).map((kolon) => {
    const boyut = KUNYE_BOYUTLARI[kolon]
    const istenen = doluMu(kunye[kolon]) ? String(kunye[kolon]).trim() : null

    if (izlenenBoyutlar && !izlenenBoyutlar.has(boyut)) {
      return { kolon, boyut, istenen, durum: 'izlenmiyor' as const }
    }
    if (istenen === null) {
      return { kolon, boyut, istenen: null, durum: 'kunye-bos' as const }
    }
    /* Atölyenin O BOYUTTA hiç kaydı yoksa yargı verilemez. Kaydın olmaması
       yeteneğin olmadığını değil, kaydedilmediğini gösterir. */
    const boyuttaKayitVar = atolyeYetenekleri.some((y) => y.boyut === boyut)
    if (!boyuttaKayitVar) {
      return { kolon, boyut, istenen, durum: 'atolye-kayitsiz' as const }
    }
    const var_ = atolyeYetenekleri.some((y) => y.boyut === boyut && y.deger === istenen)
    return { kolon, boyut, istenen, durum: (var_ ? 'uygun' : 'uygun-degil') as UyumDurumu }
  })
}

export type UyumOzeti = {
  /** Gerçek uyumsuzluk sayısı — yalnız künyesi dolu ve izlenen boyutlar. */
  uyumsuz: number
  uygun: number
  /** Künyesi boş ya da atölyede kayıt olmadığı için sorulamayan alan sayısı. */
  sorulamayan: number
  /** Karar verilebilen alan var mı — yoksa "bilinmiyor". */
  kararVerilebilir: boolean
  /** Uyumsuz boyutların kodları; uyarı metninde kullanılır. */
  eksikBoyutlar: string[]
}

export function uyumOzeti(uyumlar: BoyutUyumu[]): UyumOzeti {
  const uyumsuzlar = uyumlar.filter((u) => u.durum === 'uygun-degil')
  const uygunlar = uyumlar.filter((u) => u.durum === 'uygun')
  const bos = uyumlar.filter((u) => u.durum === 'kunye-bos' || u.durum === 'atolye-kayitsiz')
  return {
    uyumsuz: uyumsuzlar.length,
    uygun: uygunlar.length,
    sorulamayan: bos.length,
    /* İzlenmeyen boyut ve atölyede kaydı olmayan boyut karar verdirmez. */
    kararVerilebilir: uyumsuzlar.length + uygunlar.length > 0,
    eksikBoyutlar: uyumsuzlar.map((u) => u.boyut),
  }
}

export type GenelUyum = 'uygun' | 'uyumsuz' | 'bilinmiyor'

/**
 * Tek kelimelik sonuç.
 *
 * "bilinmiyor" ayrı bir cevap: künye hiç girilmemişse ekran yeşil de
 * kırmızı da göstermemeli, "kontrol edilemedi" demeli.
 */
export function genelUyum(ozet: UyumOzeti): GenelUyum {
  if (!ozet.kararVerilebilir) return 'bilinmiyor'
  return ozet.uyumsuz > 0 ? 'uyumsuz' : 'uygun'
}

export const GENEL_ETIKET: Record<GenelUyum, string> = {
  uygun: 'Yetenek uyumlu',
  uyumsuz: 'Yetenek uyumsuz',
  bilinmiyor: 'Kontrol edilemedi — künye ya da yetenek kaydı eksik',
}

/**
 * Kısa uyarı metni.
 *
 * ENGELLEMEZ, SÖYLER. Tezgâhtaki çakışma kuralının aynısı: planlamacı
 * bilerek uyumsuz bir atölyeye verebilmeli (numune dikilecek olabilir,
 * atölye yeni yetenek kazanmış ama katalog güncellenmemiş olabilir).
 * Engelleyen bir kontrol, katalog eskidiği anda işi durdurur.
 */
export function uyariMetni(
  ozet: UyumOzeti, boyutAdi: (k: string) => string,
): string | null {
  if (ozet.uyumsuz === 0) return null
  const adlar = ozet.eksikBoyutlar.map(boyutAdi).join(', ')
  return `Bu atölyede ${adlar} yeteneği kayıtlı değil`
}
