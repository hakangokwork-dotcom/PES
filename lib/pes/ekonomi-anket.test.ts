import { describe, it, expect } from 'vitest'
import { anketSatiriCoz, anketiAylaraBol, sgkSupheliMi } from './ekonomi-anket'

/* Atolye_Gider_Model.xlsx VERI_GIRIS satır 4 — Örssan, başlıklar birebir. */
const ORSSAN_HAM: Record<string, unknown> = {
  'No': 1,
  'Kısa ad': 'Örssan',
  'İşletme unvanı': 'ÖRSSAN TEKSTİL SANAYİ VE DIŞ TİCARET LTD ŞTİ',
  'Klasman (Taha Giyim tedarik yönetimi)': '315 - Erkek Çocuk',
  'Teşvik bölgesi': '6.Bölge',
  'Üretim alanı (m²)': 5000,
  'Kesim kişi': 6,
  'Dikim kişi': 90,
  'UKP kişi (ütü-kontrol-paket)': 35,
  'Ofis kişi': 6,
  'Günlük çalışma saati': 9,
  'Haftalık gün': 4,
  'Aylık nominal çalışma günü': 22,
  'Fiili çalışma günü (aylık ort.)': 15.25,
  'Boş / dışarı çalışılan gün (aylık ort.)': 5.5,
  'Kesilen fatura toplamı (TL)': 14788970.61,
  'Fatura dönemi (ay)': 3,
  'Aylık adet (bant kapasitesi)': 43036.7,
  'Alınan teşvik (TL/ay)': 1300000,
  'Maaş (net, TL/ay)': 4900000,
  'Fazla mesai': 200000,
  'Prim ve ikramiye': 0,
  'SGK': 200000,
  'Kıdem karşılığı': 0,
  'Yemek': 200000,
  'Servis': 350000,
  'Nakliye': 150000,
  'Kira': 0,
  'Bina amortismanı': 100000,
  'Elektrik': 150000,
  'Su': 30000,
  'Isıtma': 50000,
  'İğne ve iplik': 300000,
  'UKP sarf': 200000,
  'Genel üretim sarf': 250000,
  'Bakım ve yedek parça': 50000,
  'Makine amortismanı': 20000,
  'Taşıt / demirbaş amortismanı': 20000,
  'Araç yakıt ve bakım': 40000,
  'Kırtasiye': 10000,
  'İSG': 30000,
  'Danışmanlık': 50000,
  'Ek resmi giderler': 150000,
  'Sigorta': 100000,
  'Diğer (telefon, internet)': 3000,
}

describe('anketSatiriCoz', () => {
  const c = anketSatiriCoz(ORSSAN_HAM)

  it('kısa adı ve unvanı okur', () => {
    expect(c.kisaAd).toBe('Örssan')
    expect(c.unvan).toContain('ÖRSSAN')
  })

  it('teşvik bölgesini sayıya çevirir', () => {
    expect(c.bolge).toBe(6)
  })

  it('klasmanı noktalı virgülden böler', () => {
    expect(c.klasmanlar).toEqual(['315 - Erkek Çocuk'])
  })

  it('çoklu klasmanı böler', () => {
    const cok = anketSatiriCoz({
      ...ORSSAN_HAM,
      'Klasman (Taha Giyim tedarik yönetimi)': '315 - Erkek Çocuk;310 - Kız Bebek',
    })
    expect(cok.klasmanlar).toEqual(['315 - Erkek Çocuk', '310 - Kız Bebek'])
  })

  it('ciroyu ay sayısına böler', () => {
    expect(c.ekonomi.revenue_declared).toBeCloseTo(14788970.61 / 3, 8)
  })

  it('kadroyu doğru yerleştirir', () => {
    expect(c.ekonomi.cutting_staff).toBe(6)
    expect(c.ekonomi.sewing_staff).toBe(90)
    expect(c.ekonomi.ukp_staff).toBe(35)
    expect(c.ekonomi.office_staff).toBe(6)
  })

  it('UKP sarf ile genel üretim sarfı ayrı kolonlara yazar', () => {
    expect(c.gider.ukp_consumables).toBe(200000)
    expect(c.gider.consumables).toBe(250000)
  })

  it('taşıt amortismanını araç yakıtından ayırır', () => {
    expect(c.gider.vehicle_depr).toBe(20000)
    expect(c.gider.vehicle).toBe(40000)
  })

  it('iğne+iplik birleşik alanı thread e yazar, needle boş kalır', () => {
    expect(c.gider.thread).toBe(300000)
    expect(c.gider.needle).toBeNull()
    expect(c.birlesikAlanlar).toContain('İğne ve iplik → thread')
  })

  it('teşviki gider değil mahsup olarak okur', () => {
    expect(c.gider.incentive_amount).toBe(1300000)
  })

  it('parantezli "Diğer" başlığı communication a gider, other a değil', () => {
    expect(c.gider.communication).toBe(3000)
    expect(c.gider.other ?? null).toBeNull()
  })

  it('fatura dönemini ay sayısı olarak verir', () => {
    expect(c.aySayisi).toBe(3)
  })
})

describe('anketiAylaraBol', () => {
  const c = anketSatiriCoz(ORSSAN_HAM)

  it('3 aylık anket 3 satır üretir', () => {
    const aylar = anketiAylaraBol(c, '2026-04')
    expect(aylar).toHaveLength(3)
    expect(aylar.map(a => `${a.year}-${String(a.month).padStart(2, '0')}`))
      .toEqual(['2026-04', '2026-05', '2026-06'])
  })

  it('yıl sınırını aşar', () => {
    const aylar = anketiAylaraBol(c, '2026-11')
    expect(aylar.map(a => `${a.year}-${String(a.month).padStart(2, '0')}`))
      .toEqual(['2026-11', '2026-12', '2027-01'])
  })

  it('çok aylı anketin her ayı turetilmis işaretlenir', () => {
    const aylar = anketiAylaraBol(c, '2026-04')
    expect(aylar.every(a => a.ekonomi.source === 'turetilmis')).toBe(true)
  })

  it('tek aylı anket anket olarak işaretlenir', () => {
    const tekAy = anketSatiriCoz({ ...ORSSAN_HAM, 'Fatura dönemi (ay)': 1 })
    const aylar = anketiAylaraBol(tekAy, '2026-04')
    expect(aylar).toHaveLength(1)
    expect(aylar[0].ekonomi.source).toBe('anket')
  })

  it('gider kalemleri bölünmez — her ay aynı aylık tutarı taşır', () => {
    const aylar = anketiAylaraBol(c, '2026-04')
    expect(aylar.every(a => a.gider.personnel === 4900000)).toBe(true)
  })

  it('bozuk başlangıç ayında hata atar', () => {
    expect(() => anketiAylaraBol(c, '2026-13')).toThrow(/başlangıç ayı/)
  })
})

describe('sgkSupheliMi', () => {
  it('teşvik SGK dan büyükse şüpheli', () => {
    expect(sgkSupheliMi({ sgk: 200000, incentive_amount: 1300000 })).toBe(true)
  })

  it('teşvik SGK dan küçükse temiz', () => {
    expect(sgkSupheliMi({ sgk: 1800000, incentive_amount: 1200000 })).toBe(false)
  })

  it('teşvik yoksa temiz', () => {
    expect(sgkSupheliMi({ sgk: 200000, incentive_amount: null })).toBe(false)
  })

  it('SGK yoksa şüpheli sayılmaz — ayrı bir eksiklik', () => {
    expect(sgkSupheliMi({ sgk: null, incentive_amount: 1300000 })).toBe(false)
  })
})
