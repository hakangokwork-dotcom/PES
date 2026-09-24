import { describe, it, expect } from 'vitest'
import { degerHavuzu, formulIzi, cozulmeyenAnahtarlar } from './formul-izi'
import { FORMUL_KATALOGU, formulBul } from './formul-katalogu'
import { hesapla } from './ekonomi-hesap'
import { VARSAYILAN_PARAM, type EkonomiSatiri, type GiderSatiri } from './ekonomi-tipler'

/* Gerçekçi tek atölye: 100 kişi, 4,5 M TL ciro, 4,8 M TL gider → zararda. */
const GIRIS: EkonomiSatiri = {
  revenue_declared: 4_500_000, idle_days: 0, qty_declared: 30_000,
  nominal_days: 22, actual_days: 20, hours_per_day: 9,
  cutting_staff: 10, sewing_staff: 70, ukp_staff: 15, office_staff: 5,
  area_m2: 2000, source: 'anket',
}

const GIDER: GiderSatiri = {
  incentive_amount: 200_000,
  personnel: 3_000_000, overtime: 200_000, bonus: 100_000, sgk: 700_000,
  severance_reserve: 100_000,
  rent: 300_000, food: 200_000, transport: 150_000, electricity: 250_000,
}

const RASYO = hesapla({
  gider: GIDER, ekonomi: GIRIS, param: VARSAYILAN_PARAM,
  dkMaliyet3D: 4.2, qtyActual: null,
})

const HAVUZ = degerHavuzu({
  rasyo: RASYO as unknown as Record<string, unknown>,
  param: VARSAYILAN_PARAM as unknown as Record<string, unknown>,
  giris: GIRIS as unknown as Record<string, unknown>,
  gider: GIDER as unknown as Record<string, unknown>,
  atolye: { bolge: 6 },
})

describe('değer havuzu', () => {
  it('ad alanı önekiyle sayıları toplar', () => {
    expect(HAVUZ['giris.sewing_staff']).toBe(70)
    expect(HAVUZ['param.target_margin']).toBe(0.15)
    expect(HAVUZ['gider.incentive_amount']).toBe(200_000)
    expect(HAVUZ['atolye.bolge']).toBe(6)
  })

  it('metin alanlarını havuza almaz — iz sayı gösterir', () => {
    expect(Object.hasOwn(HAVUZ, 'giris.source')).toBe(false)
  })

  it('null değeri saklar, alanı düşürmez', () => {
    const h = degerHavuzu({ giris: { idle_days: null } })
    expect(Object.hasOwn(h, 'giris.idle_days')).toBe(true)
    expect(h['giris.idle_days']).toBeNull()
  })
})

describe('formül izi', () => {
  it('marj izinde gerçek ciro ve net gider görünüyor', () => {
    const iz = formulIzi(formulBul('hesap.marj')!, HAVUZ)
    expect(iz.girdiler.map((g) => g.etiket)).toEqual(['Aylık ciro', 'Net gider'])
    expect(iz.girdiler[0].deger).toBe(4_500_000)
    expect(iz.girdiler[1].deger).toBe(RASYO.netGider)
    expect(iz.sonuclar).toEqual([{ alan: 'marj', deger: RASYO.marj }])
  })

  it('zarardaki atölyede marj negatif ve iz bunu gösteriyor', () => {
    const iz = formulIzi(formulBul('hesap.marj')!, HAVUZ)
    const [ciro, net] = iz.girdiler.map((g) => g.deger!)
    expect(net).toBeGreaterThan(ciro)
    expect(iz.sonuclar[0].deger!).toBeLessThan(0)
  })

  it('bölüm dk maliyeti izinde üç sonuç birden var', () => {
    const iz = formulIzi(formulBul('hesap.bolum-dk-maliyet')!, HAVUZ)
    expect(iz.sonuclar.map((s) => s.alan))
      .toEqual(['kesimDkMaliyet', 'dikimDkMaliyet', 'ukpDkMaliyet'])
    /* Üç ağırlık da 1 olduğu için üç bölüm maliyeti eşit çıkar. */
    expect(iz.sonuclar[0].deger).toBeCloseTo(iz.sonuclar[1].deger!, 10)
  })

  it('eksik girdiyi işaretler ama sıfıra çevirmez', () => {
    const bosHavuz = degerHavuzu({ rasyo: { aylikCiro: null, netGider: 1000 } })
    const iz = formulIzi(formulBul('hesap.marj')!, bosHavuz)
    expect(iz.girdiler[0].deger).toBeNull()
    expect(iz.girdiler[0].bulundu).toBe(true)
    expect(iz.eksikGirdiVar).toBe(true)
  })

  it('havuzda olmayan anahtarı veri eksikliğinden ayırır', () => {
    const iz = formulIzi(formulBul('hesap.marj')!, degerHavuzu({}))
    expect(iz.girdiler.every((g) => g.bulundu)).toBe(false)
  })
})

describe('katalog anahtarları', () => {
  it('her girdi anahtarı dolu bir havuzda çözülüyor', () => {
    /* Katalogdaki yazım hatası izde boş satır olarak görünür ve gerçek veri
       eksikliğiyle karışır. Bu test onu koda çevirir. */
    expect(cozulmeyenAnahtarlar(FORMUL_KATALOGU, HAVUZ)).toEqual([])
  })
})
