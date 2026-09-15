import { gunEkle } from './yerlestirme'

/* Bant kapasite takvimi — hesap kuralları (tasarım K1, K2, K13).

   SAF MODÜL: veritabanı yok, Date nesnesi taşınmaz. Tarihler her yerde
   'YYYY-MM-DD' dizesidir; böylece saat dilimi hatası imkânsız.

   KAPASİTE ATÖLYENİNDİR. Bant başına ayrı kapasite tutulmaz; kaynak
   aktif bantların production_line.daily_target toplamıdır.
   workshop_stage_capacity'de DIKIM satırı BİLEREK yoktur — mevcut
   kapasite API'si (app/api/pes/workshops/[id]/kapasite/route.ts) bunu
   açıkça söylüyor ve o kural korunuyor. */

export type BantTanim = {
  lineId: number
  /** production_line.daily_target */
  dailyTarget: number
  aktif: boolean
}

export type BlokTip = 'REZERVE' | 'BAKIM' | 'İZİN' | 'BLOK' | 'CHANGEOVER' | 'WO'

export type BlokTanim = {
  lineId: number
  tip: BlokTip
  /** NULL = bandın tamamı. Dolu = yalnız o kadar adet düşer. */
  adet: number | null
  baslangic: string
  bitis: string
}

/** Pazar kapalı, Cumartesi çalışılır (K13). */
export function pazarMi(tarih: string): boolean {
  const [y, a, g] = tarih.split('-').map(Number)
  return new Date(Date.UTC(y, a - 1, g)).getUTCDay() === 0
}

function kapsiyorMu(blok: BlokTanim, tarih: string): boolean {
  return tarih >= blok.baslangic && tarih <= blok.bitis
}

/* Bandı o gün tamamen durduran blok var mı?
   REZERVE durdurmaz — kapasite yerinde, yalnız başkası için tutulmuştur;
   doluluğa eklenir, kapasiteden düşülmez. adet dolu olan blok da durdurmaz. */
function tamBlokluMu(lineId: number, bloklar: BlokTanim[], tarih: string): boolean {
  return bloklar.some(
    b => b.lineId === lineId && b.tip !== 'REZERVE' && b.adet === null && kapsiyorMu(b, tarih),
  )
}

export function calisanBantlar(
  bantlar: BantTanim[], bloklar: BlokTanim[], tarih: string,
): BantTanim[] {
  return bantlar.filter(b => b.aktif && !tamBlokluMu(b.lineId, bloklar, tarih))
}

export function hamKapasite(
  bantlar: BantTanim[], bloklar: BlokTanim[], tarih: string,
): number {
  return calisanBantlar(bantlar, bloklar, tarih).reduce((t, b) => t + b.dailyTarget, 0)
}

/**
 * Atölyenin o günkü efektif kapasitesi.
 * @param override workshop_kapasite_gun kaydı; yoksa null.
 */
export function efektifKapasite(
  bantlar: BantTanim[], bloklar: BlokTanim[], tarih: string, override: number | null,
): number {
  if (pazarMi(tarih)) return 0
  return override ?? hamKapasite(bantlar, bloklar, tarih)
}

/**
 * Bandın o günkü varsayılan payı.
 * Eşit bölme YAPILMAZ — fark zaten daily_target'ta duruyor (K2).
 * Atölye toplamı düşürdüğünde paylar daily_target oranında birlikte küçülür.
 */
export function bantPayi(
  lineId: number, bantlar: BantTanim[], bloklar: BlokTanim[],
  tarih: string, override: number | null,
): number {
  const calisan = calisanBantlar(bantlar, bloklar, tarih)
  const bant = calisan.find(b => b.lineId === lineId)
  if (!bant) return 0

  const ham = calisan.reduce((t, b) => t + b.dailyTarget, 0)
  if (ham === 0) return 0

  const efektif = efektifKapasite(bantlar, bloklar, tarih, override)
  return Math.round((bant.dailyTarget * efektif) / ham)
}

export type AtamaTanim = {
  atamaId: number
  lineId: number
  adet: number
  planBaslangic: string
  /** work_order_gunluk_uretim.plan_adet — atölyenin elle yazdığı günler */
  elleplan: Record<string, number>
}

export type PlanGunu = {
  tarih: string
  adet: number
  /** Atölye elle yazdı mı — blok taşınsa bile korunur */
  elle: boolean
  /** O günün bant payı (referans) */
  pay: number
}

export type HesapBaglami = {
  bantlar: BantTanim[]
  bloklar: BlokTanim[]
  /** O gün için workshop_kapasite_gun kaydı; yoksa null */
  override: (tarih: string) => number | null
}

/** Sonsuz döngüye karşı üst sınır — 200 iş günü ~9 aydır. */
const AZAMI_GUN = 200

/**
 * Bir atamanın gün gün planı (K3, K4).
 *
 *   1) O gün elle plan_adet girilmişse o kullanılır — SABİT kalır.
 *   2) Girilmemişse min(kalan, bandın o günkü payı).
 *
 * Kapasitesi sıfır olan gün (Pazar, bakım, atölye kapalı) atlanır; plan uzar.
 */
export function gunlukPlan(atama: AtamaTanim, ctx: HesapBaglami): PlanGunu[] {
  const cikti: PlanGunu[] = []
  let kalan = atama.adet
  let tarih = atama.planBaslangic

  for (let i = 0; kalan > 0 && i < AZAMI_GUN; i++) {
    const pay = bantPayi(atama.lineId, ctx.bantlar, ctx.bloklar, tarih, ctx.override(tarih))
    if (pay > 0) {
      const elleDeger = atama.elleplan[tarih]
      const istenen = elleDeger != null ? elleDeger : pay
      const adet = Math.max(0, Math.min(istenen, kalan))
      if (adet > 0) {
        cikti.push({ tarih, adet, elle: elleDeger != null, pay })
        kalan -= adet
      }
    }
    tarih = gunEkle(tarih, 1)
  }
  return cikti
}

/** Planlanan bitiş TÜRETİLİR — adedin tükendiği son gün (K4). */
export function planBitisi(atama: AtamaTanim, ctx: HesapBaglami): string {
  const p = gunlukPlan(atama, ctx)
  return p.length ? p[p.length - 1].tarih : atama.planBaslangic
}
