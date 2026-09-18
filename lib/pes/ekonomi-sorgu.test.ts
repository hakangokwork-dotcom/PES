import { describe, it, expect } from 'vitest'
import { sayiya, dbSatiriCoz, paramCoz } from './ekonomi-sorgu'
import { VARSAYILAN_PARAM } from './ekonomi-tipler'

describe('sayiya', () => {
  it('postgres NUMERIC string ini sayıya çevirir', () => {
    expect(sayiya('4929656.87')).toBe(4929656.87)
  })

  it('sayıyı olduğu gibi bırakır', () => {
    expect(sayiya(22)).toBe(22)
  })

  it('null null kalır', () => {
    expect(sayiya(null)).toBeNull()
  })

  it('undefined null olur', () => {
    expect(sayiya(undefined)).toBeNull()
  })

  it('sayıya çevrilemeyen string null olur — NaN DEĞİL', () => {
    expect(sayiya('abc')).toBeNull()
  })

  it('boş string null olur', () => {
    expect(sayiya('')).toBeNull()
  })
})

describe('dbSatiriCoz', () => {
  /* postgres.js'in gerçekte döndürdüğü biçim: NUMERIC -> string,
     INTEGER/SMALLINT -> number. */
  const HAM = {
    workshop_id: 7, name: 'Örssan', code: 'W007', bolge: 6, veri_var: true,
    revenue_declared: '4929656.87',
    idle_days: '5.50',
    qty_declared: 43037,
    nominal_days: '22.00',
    actual_days: '15.25',
    hours_per_day: '9.0',
    cutting_staff: 6, sewing_staff: 90, ukp_staff: 35, office_staff: 6,
    area_m2: 5000, source: 'turetilmis',
    personnel: 4900000, sgk: 200000,
    overtime: '200000.00', bonus: '0.00', severance_reserve: null,
    rent: '0.00', ukp_consumables: '200000.00', vehicle_depr: '20000.00',
    incentive_amount: '1300000.00',
    dk_maliyet_tl: '5.05',
    qty_actual: null,
  }

  const g = dbSatiriCoz(HAM, VARSAYILAN_PARAM)

  it('NUMERIC alanları sayıya çevirir', () => {
    expect(g.ekonomi.revenue_declared).toBe(4929656.87)
    expect(g.ekonomi.idle_days).toBe(5.5)
    expect(g.ekonomi.hours_per_day).toBe(9)
    expect(g.gider.overtime).toBe(200000)
    expect(g.gider.incentive_amount).toBe(1300000)
  })

  it('hiçbir alan NaN olmaz', () => {
    const hepsi = [...Object.values(g.gider), ...Object.values(g.ekonomi)]
    expect(hepsi.some(v => typeof v === 'number' && Number.isNaN(v))).toBe(false)
  })

  it('3D dakika maliyetini sayıya çevirir', () => {
    expect(g.dkMaliyet3D).toBe(5.05)
  })

  it('0.00 sıfır kalır, null olmaz', () => {
    expect(g.gider.rent).toBe(0)
    expect(g.gider.bonus).toBe(0)
  })

  it('gerçek null null kalır', () => {
    expect(g.gider.severance_reserve).toBeNull()
  })

  it('source değerini taşır', () => {
    expect(g.ekonomi.source).toBe('turetilmis')
  })
})

describe('paramCoz', () => {
  it('satırları parametre nesnesine çevirir', () => {
    const p = paramCoz([
      { param_key: 'target_margin', param_value: '0.1500' },
      { param_key: 'nominal_days', param_value: '22.0000' },
    ])
    expect(p.target_margin).toBe(0.15)
    expect(p.nominal_days).toBe(22)
  })

  it('eksik anahtarlar varsayılandan tamamlanır', () => {
    const p = paramCoz([{ param_key: 'target_margin', param_value: '0.2000' }])
    expect(p.target_margin).toBe(0.2)
    expect(p.minutes_per_day).toBe(VARSAYILAN_PARAM.minutes_per_day)
  })

  it('boş listede tamamen varsayılan döner', () => {
    expect(paramCoz([])).toEqual(VARSAYILAN_PARAM)
  })
})
