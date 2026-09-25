/**
 * Yetenek uyumu — "bu işi bu atölye dikebilir mi?"
 *
 * İş emrinin künyesi (`work_order.*_kodu`) ile atölyenin yetenekleri
 * (`line_capability`) aynı katalogdan besleniyor ve boyut adları birebir
 * aynı; eşleştirme bu yüzden mümkün.
 *
 * DÖRT DURUM, ÜÇÜ "HAYIR" DEĞİL:
 *
 *   uygun         künye dolu, atölyede o yetenek var
 *   uygun-degil   künye dolu, atölyede YOK  → gerçek uyarı
 *   kunye-bos     iş emrinde o alan girilmemiş → SORULAMADI
 *   izlenmiyor    boyut yetenek kataloğunda hiç tutulmuyor (ör. kalite)
 *
 * Bu ayrım işin özü. "Künye boş" ile "uygun değil"i birleştirmek iki yönde
 * de yalan söyler: ya her işi her atölyeye uygun gösterir, ya hiçbirini.
 * PES'te bugün 16 iş emrinin HEPSİNİN künyesi boş — birleştirilseydi ekran
 * ya hep yeşil ya hep kırmızı olurdu ve ikisi de bilgi taşımazdı.
 */
import { KUNYE_BOYUTLARI, type Kunye, type KunyeKolonu } from './kunye'

export type UyumDurumu = 'uygun' | 'uygun-degil' | 'kunye-bos' | 'izlenmiyor'

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
    const var_ = atolyeYetenekleri.some((y) => y.boyut === boyut && y.deger === istenen)
    return { kolon, boyut, istenen, durum: (var_ ? 'uygun' : 'uygun-degil') as UyumDurumu }
  })
}

export type UyumOzeti = {
  /** Gerçek uyumsuzluk sayısı — yalnız künyesi dolu ve izlenen boyutlar. */
  uyumsuz: number
  uygun: number
  /** Künyesi boş olduğu için sorulamayan alan sayısı. */
  sorulamayan: number
  /** Karar verilebilen alan var mı — yoksa "bilinmiyor". */
  kararVerilebilir: boolean
  /** Uyumsuz boyutların kodları; uyarı metninde kullanılır. */
  eksikBoyutlar: string[]
}

export function uyumOzeti(uyumlar: BoyutUyumu[]): UyumOzeti {
  const uyumsuzlar = uyumlar.filter((u) => u.durum === 'uygun-degil')
  const uygunlar = uyumlar.filter((u) => u.durum === 'uygun')
  const bos = uyumlar.filter((u) => u.durum === 'kunye-bos')
  return {
    uyumsuz: uyumsuzlar.length,
    uygun: uygunlar.length,
    sorulamayan: bos.length,
    /* İzlenmeyen boyut karar verdirmez; sayılmaz. */
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
  bilinmiyor: 'Künye boş — kontrol edilemedi',
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
