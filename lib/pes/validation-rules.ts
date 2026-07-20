/**
 * Beyan güven skoru — kuralların TEK kaynağı.
 *
 * Migration 022 §tasarım notu: kural mantığı bilerek tek yerde tutuluyor.
 * Bu modül saf (DB'ye dokunmaz), böylece aynı fonksiyon hem import
 * ekranında önizleme için client'ta, hem batch skorlamada server'da çalışır.
 *
 * Dört boyut, her biri 0-100:
 *   completeness  — beyan ne kadar dolu
 *   consistency   — kalemler kendi içinde tutarlı mı (oranlar, işaretler)
 *   plausibility  — değerler makul bantta mı (kişi başı maaş, yemek...)
 *   crosscheck    — PES'teki diğer kayıtlarla uyuşuyor mu (kadro, üretim)
 *
 * total_sc = ağırlıklı ortalama; status eşikleri validation_param'dan gelir.
 */

import { z } from 'zod'

export const RULE_VERSION = '2026-07-20.1'

/* ------------------------------------------------------------------ tipler */

export const EXPENSE_FIELDS = [
  'personnel', 'sgk', 'food', 'electricity', 'water', 'gas',
  'transport', 'vehicle', 'cargo', 'machine_maint', 'thread', 'other',
  'rent', 'building_depr', 'machine_depr', 'insurance', 'overtime',
  'bonus', 'severance_reserve', 'incentive_amount', 'isg', 'consulting',
  'official_fees', 'communication', 'stationery', 'needle', 'consumables',
] as const

export type ExpenseField = (typeof EXPENSE_FIELDS)[number]

const numish = z.union([z.number(), z.string(), z.null()]).optional()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
  })

/** Skorlanacak gider beyanı. Tüm kalemler opsiyonel — eksiklik completeness'e yansır. */
export const ExpenseDeclarationSchema = z.object({
  workshop_id: z.number().int().positive(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  work_days: numish,
  target_revenue: numish,
  ...Object.fromEntries(EXPENSE_FIELDS.map((f) => [f, numish])),
}).passthrough()

export type ExpenseDeclaration = z.infer<typeof ExpenseDeclarationSchema>

/** Çapraz kontrol için PES'ten gelen bağlam. Eksikse o kural atlanır. */
export type CrossCheckContext = {
  total_staff?: number | null
  sewing_staff?: number | null
  line_count?: number | null
  /** O döneme ait monthly_production kaydı var mı */
  has_production?: boolean
  /** Bölge dk maliyeti (varsa) — hesaplananla karşılaştırılır */
  bolge_dk_maliyet?: number | null
}

export type Severity = 'info' | 'warn' | 'error'

export type Flag = {
  field: string
  rule: string
  severity: Severity
  message: string
  suggested_fix?: string
}

export type QualityScore = {
  completeness_sc: number
  consistency_sc: number
  plausibility_sc: number
  crosscheck_sc: number
  total_sc: number
  flags: Flag[]
  status: 'accepted' | 'winsorized' | 'rejected' | 'pending_fix'
  rule_version: string
}

/** validation_param tablosundan çözülmüş parametreler. */
export type ValidationParams = {
  wage_per_person_min: number
  wage_per_person_max: number
  sgk_ratio_min: number
  sgk_ratio_max: number
  food_per_person_max: number
  work_days_min: number
  work_days_max: number
  headcount_tolerance: number
  accept_threshold: number
  winsorize_threshold: number
}

export const DEFAULT_PARAMS: ValidationParams = {
  wage_per_person_min: 20000,
  wage_per_person_max: 60000,
  sgk_ratio_min: 0.15,
  sgk_ratio_max: 0.50,
  food_per_person_max: 8000,
  work_days_min: 15,
  work_days_max: 31,
  headcount_tolerance: 0.30,
  accept_threshold: 70,
  winsorize_threshold: 50,
}

/** Boyut ağırlıkları — toplamı 1 olmalı. */
export const WEIGHTS = {
  completeness: 0.25,
  consistency: 0.25,
  plausibility: 0.25,
  crosscheck: 0.25,
} as const

/* ---------------------------------------------------------------- yardımcı */

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Ceza uygulanmış skoru 0-100 aralığında tutar. */
const clamp = (n: number) => Math.max(0, Math.min(100, n))

/* -------------------------------------------------------------- 1. doluluk */

function scoreCompleteness(d: ExpenseDeclaration, flags: Flag[]): number {
  // NOT: "beyan edilmiş" = dolu VE sıfırdan farklı.
  // monthly_expense'in ilk 12 kalemi NOT NULL DEFAULT 0 olarak tanımlanmış
  // (005_pes_schema mirası), yani hiç doldurulmamış kalem de 0 olarak
  // görünür — NULL kontrolü bu tabloda hiçbir zaman tetiklenmez.
  // Sıfırı "beyan edilmemiş" saymak, hiçbir şey girmeyen atölyeye
  // %44 doluluk vermekten daha dürüst. Yan etki: gerçekten sıfır olan
  // bir kalem (örn. doğalgazı olmayan atölye) eksik sayılır — kabul
  // edilebilir, çünkü şema o iki durumu ayırt edemiyor.
  const declared = EXPENSE_FIELDS.filter((f) => {
    const v = num(d[f])
    return v !== null && v !== 0
  }).length
  const ratio = declared / EXPENSE_FIELDS.length

  if (!num(d.personnel)) {
    flags.push({
      field: 'personnel', rule: 'required_core', severity: 'error',
      message: 'Personel gideri boş — maliyet hesabı yapılamaz.',
      suggested_fix: 'Aylık toplam personel giderini girin.',
    })
  }
  if (num(d.work_days) === null) {
    flags.push({
      field: 'work_days', rule: 'required_core', severity: 'error',
      message: 'Çalışma günü boş — dakika maliyeti hesaplanamaz.',
      suggested_fix: 'Ayda kaç gün çalışıldığını girin.',
    })
  }
  if (ratio < 0.4) {
    flags.push({
      field: '*', rule: 'low_completeness', severity: 'warn',
      message: `Beyan kalemlerinin yalnız %${Math.round(ratio * 100)}'i dolu.`,
      suggested_fix: 'Kira, amortisman, sarf gibi eksik kalemleri tamamlayın.',
    })
  }

  return clamp(ratio * 100)
}

/* ------------------------------------------------------------- 2. tutarlılık */

function scoreConsistency(d: ExpenseDeclaration, p: ValidationParams, flags: Flag[]): number {
  let score = 100

  // Negatif değer — gider negatif olamaz (teşvik hariç, o zaten mahsup)
  for (const f of EXPENSE_FIELDS) {
    const v = num(d[f])
    if (v !== null && v < 0 && f !== 'incentive_amount') {
      flags.push({
        field: f, rule: 'negative_amount', severity: 'error',
        message: `${f} negatif (${v}).`,
        suggested_fix: 'Tutarı pozitif girin; mahsup kalemleri teşvik alanına yazılır.',
      })
      score -= 20
    }
  }

  // Çalışma günü aralığı
  const wd = num(d.work_days)
  if (wd !== null && (wd < p.work_days_min || wd > p.work_days_max)) {
    flags.push({
      field: 'work_days', rule: 'work_days_range', severity: 'error',
      message: `Çalışma günü ${wd} — beklenen aralık ${p.work_days_min}-${p.work_days_max}.`,
      suggested_fix: 'Ay içindeki fiili çalışma gününü kontrol edin.',
    })
    score -= 25
  }

  // SGK / personel oranı
  const personnel = num(d.personnel)
  const sgk = num(d.sgk)
  if (personnel && personnel > 0 && sgk !== null) {
    const ratio = sgk / personnel
    if (ratio < p.sgk_ratio_min || ratio > p.sgk_ratio_max) {
      // Hafif sapma ile "alan hiç beyan edilmemiş" arasında fark var.
      // Bandın iki katı dışına taşan oran (örn. 5M maaşa karşı 100 TL SGK)
      // veri girişi hatasıdır, ölçüm gürültüsü değil — error'a yükselt.
      const grosslyOff = ratio < p.sgk_ratio_min / 2 || ratio > p.sgk_ratio_max * 2
      flags.push({
        field: 'sgk',
        rule: grosslyOff ? 'sgk_ratio_implausible' : 'sgk_ratio',
        severity: grosslyOff ? 'error' : 'warn',
        message: `SGK/personel oranı %${(ratio * 100).toFixed(2)} — beklenen %${(p.sgk_ratio_min * 100).toFixed(0)}-%${(p.sgk_ratio_max * 100).toFixed(0)}.`,
        suggested_fix: grosslyOff
          ? 'SGK alanı boş bırakılmış ya da yanlış birimde girilmiş olabilir.'
          : 'SGK priminin işveren payını içerdiğinden emin olun.',
      })
      score -= grosslyOff ? 35 : 15
    }
  }

  // Teşvik toplam gideri aşamaz
  const incentive = num(d.incentive_amount)
  if (incentive !== null && incentive > 0) {
    const gross = EXPENSE_FIELDS
      .filter((f) => f !== 'incentive_amount')
      .reduce((s, f) => s + (num(d[f]) ?? 0), 0)
    if (gross > 0 && incentive > gross) {
      flags.push({
        field: 'incentive_amount', rule: 'incentive_exceeds_gross', severity: 'error',
        message: 'Teşvik tutarı toplam giderden büyük.',
        suggested_fix: 'Teşvik yalnız dönem içi mahsup tutarı olmalı.',
      })
      score -= 25
    }
  }

  return clamp(score)
}

/* ------------------------------------------------------------ 3. makullük */

function scorePlausibility(
  d: ExpenseDeclaration,
  ctx: CrossCheckContext,
  p: ValidationParams,
  flags: Flag[],
): number {
  let score = 100
  const staff = ctx.total_staff ?? null

  if (!staff || staff <= 0) {
    // Kadro bilinmiyorsa kişi başı kuralları uygulanamaz — cezalandırma,
    // ama tam puan da verme (bilgi eksikliği belirsizliktir).
    flags.push({
      field: '*', rule: 'no_headcount', severity: 'info',
      message: 'Atölye kadrosu bilinmiyor; kişi başı makullük kontrolleri atlandı.',
      suggested_fix: 'Atölye kartında toplam çalışan sayısını doldurun.',
    })
    return 75
  }

  // Kişi başı maaş bandı
  const personnel = num(d.personnel)
  if (personnel !== null && personnel > 0) {
    const perPerson = personnel / staff
    if (perPerson < p.wage_per_person_min) {
      flags.push({
        field: 'personnel', rule: 'wage_below_band', severity: 'error',
        message: `Kişi başı maaş ${Math.round(perPerson).toLocaleString('tr-TR')} TL — alt sınır ${p.wage_per_person_min.toLocaleString('tr-TR')} TL.`,
        suggested_fix: 'Personel gideri tüm kadroyu kapsıyor mu, yoksa yalnız dikimhane mi?',
      })
      score -= 35
    } else if (perPerson > p.wage_per_person_max) {
      flags.push({
        field: 'personnel', rule: 'wage_above_band', severity: 'warn',
        message: `Kişi başı maaş ${Math.round(perPerson).toLocaleString('tr-TR')} TL — üst sınır ${p.wage_per_person_max.toLocaleString('tr-TR')} TL.`,
        suggested_fix: 'Fazla mesai/prim ayrı kalemlere ayrılmış mı?',
      })
      score -= 20
    }
  }

  // Kişi başı yemek
  const food = num(d.food)
  if (food !== null && food > 0) {
    const perPerson = food / staff
    if (perPerson > p.food_per_person_max) {
      flags.push({
        field: 'food', rule: 'food_above_band', severity: 'warn',
        message: `Kişi başı yemek ${Math.round(perPerson).toLocaleString('tr-TR')} TL — üst sınır ${p.food_per_person_max.toLocaleString('tr-TR')} TL.`,
      })
      score -= 15
    }
  }

  return clamp(score)
}

/* ----------------------------------------------------------- 4. çapraz kontrol */

function scoreCrosscheck(
  d: ExpenseDeclaration,
  ctx: CrossCheckContext,
  p: ValidationParams,
  flags: Flag[],
): number {
  let score = 100
  let applied = 0

  // Beyandan türetilen kişi sayısı ↔ kayıtlı kadro
  const personnel = num(d.personnel)
  const staff = ctx.total_staff ?? null
  if (personnel && personnel > 0 && staff && staff > 0) {
    applied++
    const midWage = (p.wage_per_person_min + p.wage_per_person_max) / 2
    const impliedStaff = personnel / midWage
    const deviation = Math.abs(impliedStaff - staff) / staff
    if (deviation > p.headcount_tolerance) {
      flags.push({
        field: 'personnel', rule: 'headcount_mismatch', severity: 'warn',
        message: `Beyandan türetilen kadro ~${Math.round(impliedStaff)} kişi, kayıtlı kadro ${staff} kişi (%${Math.round(deviation * 100)} sapma).`,
        suggested_fix: 'Atölye kartındaki çalışan sayısı güncel mi?',
      })
      score -= 30
    }
  }

  // Dönemde üretim kaydı var mı — gider var, üretim yoksa şüpheli
  if (ctx.has_production !== undefined) {
    applied++
    if (!ctx.has_production && personnel && personnel > 0) {
      flags.push({
        field: '*', rule: 'expense_without_production', severity: 'warn',
        message: 'Dönemde gider beyanı var ama üretim kaydı yok.',
        suggested_fix: 'Üretim verisi yüklendi mi, yoksa atölye o ay durdu mu?',
      })
      score -= 25
    }
  }

  // Hiç çapraz kontrol uygulanamadıysa tam puan verme
  if (applied === 0) {
    flags.push({
      field: '*', rule: 'no_crosscheck_possible', severity: 'info',
      message: 'Çapraz kontrol için yeterli referans veri yok.',
    })
    return 60
  }

  return clamp(score)
}

/* ------------------------------------------------------------------ ana giriş */

export function scoreDeclaration(
  declaration: ExpenseDeclaration,
  ctx: CrossCheckContext = {},
  params: ValidationParams = DEFAULT_PARAMS,
): QualityScore {
  const flags: Flag[] = []

  const completeness_sc = scoreCompleteness(declaration, flags)
  const consistency_sc = scoreConsistency(declaration, params, flags)
  const plausibility_sc = scorePlausibility(declaration, ctx, params, flags)
  const crosscheck_sc = scoreCrosscheck(declaration, ctx, params, flags)

  const total_sc =
    completeness_sc * WEIGHTS.completeness +
    consistency_sc * WEIGHTS.consistency +
    plausibility_sc * WEIGHTS.plausibility +
    crosscheck_sc * WEIGHTS.crosscheck

  // Tek bir 'error' bayrağı bile kabulü engeller — eşiği geçse dahi.
  const hasError = flags.some((f) => f.severity === 'error')

  let status: QualityScore['status']
  if (hasError) {
    status = total_sc >= params.winsorize_threshold ? 'pending_fix' : 'rejected'
  } else if (total_sc >= params.accept_threshold) {
    status = 'accepted'
  } else if (total_sc >= params.winsorize_threshold) {
    status = 'winsorized'
  } else {
    status = 'pending_fix'
  }

  const r1 = (n: number) => Math.round(n * 10) / 10

  return {
    completeness_sc: r1(completeness_sc),
    consistency_sc: r1(consistency_sc),
    plausibility_sc: r1(plausibility_sc),
    crosscheck_sc: r1(crosscheck_sc),
    total_sc: r1(total_sc),
    flags,
    status,
    rule_version: RULE_VERSION,
  }
}

/**
 * validation_param satırlarını ValidationParams'a çözer.
 * Dönem bazlı: hedef döneme eşit/küçük en güncel donem_from kazanır,
 * tenant'a özel satır global varsayılanı ezer.
 */
export function resolveParams(
  rows: Array<{ param_key: string; donem_from: string; value_num: string | number | null; tenant_id: string | null }>,
  targetDonem: string,
): ValidationParams {
  const best = new Map<string, { donem_from: string; tenant_id: string | null; value: number }>()

  for (const r of rows) {
    if (r.donem_from > targetDonem) continue
    const value = num(r.value_num)
    if (value === null) continue

    const cur = best.get(r.param_key)
    const beatsOnDate = !cur || r.donem_from > cur.donem_from
    // Aynı dönemde tenant'a özel satır global'i ezer
    const beatsOnScope =
      cur && r.donem_from === cur.donem_from && r.tenant_id !== null && cur.tenant_id === null

    if (beatsOnDate || beatsOnScope) {
      best.set(r.param_key, { donem_from: r.donem_from, tenant_id: r.tenant_id, value })
    }
  }

  const out = { ...DEFAULT_PARAMS }
  for (const key of Object.keys(DEFAULT_PARAMS) as (keyof ValidationParams)[]) {
    const hit = best.get(key)
    if (hit) out[key] = hit.value
  }
  return out
}
