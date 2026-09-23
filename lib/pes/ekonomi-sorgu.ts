/**
 * DB satırı → hesap girdisi.
 *
 * TEK SEBEBİ BİR TUZAK: postgres.js NUMERIC kolonları STRING döndürür.
 * '4929656.87' doğrudan hesapla()'ya girerse aritmetik sessizce NaN üretir
 * ve TypeScript bunu yakalamaz — tip iddiası çalışma zamanında
 * doğrulanmıyor. Dönüştürme burada, tek yerde ve test edilerek yapılır.
 */
import { VARSAYILAN_PARAM, type EkonomiGirdi, type EkonomiParam } from './ekonomi-tipler'

/** Her şeyi sayıya çevirir; çevrilemiyorsa null. NaN asla dönmez. */
export function sayiya(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Sorgunun döndürdüğü ham satır. Alanlar string ya da number olabilir. */
export type EkonomiDbSatiri = Record<string, unknown> & {
  workshop_id: number
  name: string
  bolge: number | null
  /** false ise bu atölyenin o ay ekonomi satırı yok — bütün alanlar null. */
  veri_var: boolean
}

const GIDER_ALANLARI = [
  'personnel', 'overtime', 'bonus', 'sgk', 'severance_reserve',
  'food', 'transport', 'cargo', 'rent', 'building_depr',
  'electricity', 'water', 'gas', 'thread', 'needle',
  'ukp_consumables', 'consumables', 'machine_maint', 'machine_depr',
  'vehicle_depr', 'vehicle', 'stationery', 'isg', 'consulting',
  'official_fees', 'insurance', 'communication', 'other', 'incentive_amount',
] as const

export function dbSatiriCoz(r: EkonomiDbSatiri, param: EkonomiParam): EkonomiGirdi {
  const gider = { incentive_amount: null } as Record<string, number | null>
  for (const alan of GIDER_ALANLARI) gider[alan] = sayiya(r[alan])

  const ham = r.source
  const source = ham === 'anket' || ham === 'elle' || ham === 'turetilmis' ? ham : 'elle'

  return {
    gider: gider as EkonomiGirdi['gider'],
    ekonomi: {
      revenue_declared: sayiya(r.revenue_declared),
      idle_days: sayiya(r.idle_days),
      qty_declared: sayiya(r.qty_declared),
      nominal_days: sayiya(r.nominal_days),
      actual_days: sayiya(r.actual_days),
      hours_per_day: sayiya(r.hours_per_day),
      cutting_staff: sayiya(r.cutting_staff),
      sewing_staff: sayiya(r.sewing_staff),
      ukp_staff: sayiya(r.ukp_staff),
      office_staff: sayiya(r.office_staff),
      area_m2: sayiya(r.area_m2),
      source,
    },
    param,
    dkMaliyet3D: sayiya(r.dk_maliyet_tl),
    qtyActual: sayiya(r.qty_actual),
  }
}

/** economy_param satırlarını nesneye çevirir; eksikler varsayılandan tamamlanır. */
export function paramCoz(
  satirlar: Array<{ param_key: string; param_value: unknown }>,
): EkonomiParam {
  const p: Record<string, number> = { ...VARSAYILAN_PARAM }
  for (const s of satirlar) {
    const v = sayiya(s.param_value)
    if (v !== null && s.param_key in p) p[s.param_key] = v
  }
  return p as EkonomiParam
}

/**
 * Bir dönemin ekonomi satırlarını, gideri ve bölge 3D değeriyle getirir.
 *
 * Temel tablo workshop'tır, workshop_economy DEĞİL: ekonomi satırı olmayan
 * aktif atölye de sonuca girer, bütün alanları null olarak. hesapla() bu
 * satırda 37 null döndürür ve ekran "veri yok" gösterir. Sıfırla
 * doldurmak onları sıralamanın uçlarına fırlatırdı — en kârlı ya da en
 * zararlı sanılırlardı.
 */
export const EKONOMI_SORGUSU = `
  SELECT
    w.id AS workshop_id, w.name, w.code, w.bolge,
    we.id IS NOT NULL AS veri_var,
    we.revenue_declared, we.idle_days, we.qty_declared,
    we.nominal_days, we.actual_days, we.hours_per_day,
    we.cutting_staff, we.sewing_staff, we.ukp_staff, we.office_staff,
    we.area_m2, we.source,
    me.personnel, me.overtime, me.bonus, me.sgk, me.severance_reserve,
    me.food, me.transport, me.cargo, me.rent, me.building_depr,
    me.electricity, me.water, me.gas, me.thread, me.needle,
    me.ukp_consumables, me.consumables, me.machine_maint, me.machine_depr,
    me.vehicle_depr, me.vehicle, me.stationery, me.isg, me.consulting,
    me.official_fees, me.insurance, me.communication, me.other,
    me.incentive_amount,
    dk.dk_maliyet_tl,
    mp.qty_actual,
    /* Maliyet DNA (G1-G8). ::float ŞART: NUMERIC postgres.js'te string
       döner ve paylar sessizce NaN çıkar. */
    g.g1_iscilik::float      AS g1_iscilik,
    g.g2_personel_yan::float AS g2_personel_yan,
    g.g3_enerji::float       AS g3_enerji,
    g.g4_mekan::float        AS g4_mekan,
    g.g5_makine::float       AS g5_makine,
    g.g6_sarf::float         AS g6_sarf,
    g.g7_dis_hizmet::float   AS g7_dis_hizmet,
    g.g8_diger::float        AS g8_diger
  FROM workshop w
  LEFT JOIN workshop_economy we
         ON we.workshop_id = w.id AND we.year = $2 AND we.month = $3
  LEFT JOIN monthly_expense me
         ON me.workshop_id = w.id AND me.year = $2 AND me.month = $3
  LEFT JOIN LATERAL (
        SELECT dk_maliyet_tl FROM dk_maliyet
        WHERE bolge = w.bolge AND donem <= $1
        ORDER BY donem DESC LIMIT 1) dk ON TRUE
  LEFT JOIN LATERAL (
        SELECT SUM(actual_qty)::int AS qty_actual
        FROM monthly_production
        WHERE workshop_id = w.id AND year = $2 AND month = $3) mp ON TRUE
  LEFT JOIN v_expense_groups g ON g.id = me.id
  WHERE w.is_active
  ORDER BY (we.workshop_id IS NULL), w.name
`
