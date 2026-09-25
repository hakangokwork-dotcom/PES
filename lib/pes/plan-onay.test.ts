import { describe, it, expect } from 'vitest'
import {
  cevapDogrula, kalemFarklari, farkOzeti, gecerliYerlesim, gecisGecerli,
  GEREKCE_KODLARI, GEREKCE_ETIKET, type TeklifKalem,
} from './plan-onay'

const K = (o: Partial<TeklifKalem> = {}): TeklifKalem => ({
  id: 1, workOrderId: 10, lineId: 3,
  baslangic: '2026-10-01', bitis: '2026-10-05', adet: 1000,
  karsiBaslangic: null, karsiAdet: null, karsiNot: null, ...o,
})

describe('cevap doğrulama', () => {
  it('kabulde gerekçe istenmez', () => {
    expect(cevapDogrula({ durum: 'kabul', gerekceKodu: null, not: null })).toEqual([])
  })

  it('RET gerekçesiz olamaz', () => {
    const h = cevapDogrula({ durum: 'ret', gerekceKodu: null, not: null })
    expect(h.map((x) => x.alan)).toEqual(['gerekceKodu'])
  })

  it('REVİZYON gerekçesiz olamaz', () => {
    /* "Olmaz" tek başına planlamacıya yeni tur açtırmaz. */
    expect(cevapDogrula({ durum: 'revizyon', gerekceKodu: null, not: null })).toHaveLength(1)
  })

  it('DİĞER seçildiyse açıklama zorunlu', () => {
    const h = cevapDogrula({ durum: 'ret', gerekceKodu: 'DIGER', not: '  ' })
    expect(h.map((x) => x.alan)).toEqual(['not'])
    expect(cevapDogrula({ durum: 'ret', gerekceKodu: 'DIGER', not: 'boyahane kapandı' })).toEqual([])
  })

  it('kod dolu ve DİĞER değilse not istenmez', () => {
    expect(cevapDogrula({ durum: 'ret', gerekceKodu: 'KAPASITE_YOK', not: null })).toEqual([])
  })

  it('her gerekçe kodunun etiketi var', () => {
    for (const k of GEREKCE_KODLARI) expect(GEREKCE_ETIKET[k]).toBeTruthy()
  })
})

describe('karşı öneri farkı', () => {
  it('karşı öneri YOKSA fark null — sıfır DEĞİL', () => {
    /* NULL "itirazım yok" demek; 0 "sıfır gün kaydırdım" demek. Birleştirmek
       atölyenin dokunmadığı kalemi pazarlık konusu gösterir. */
    const f = kalemFarklari([K()])[0]
    expect(f.gunKaymasi).toBeNull()
    expect(f.adetFarki).toBeNull()
    expect(f.degisti).toBe(false)
  })

  it('tarih kaymasını gün olarak verir', () => {
    const f = kalemFarklari([K({ karsiBaslangic: '2026-10-04' })])[0]
    expect(f.gunKaymasi).toBe(3)
    expect(f.degisti).toBe(true)
  })

  it('geriye çekmeyi negatif verir', () => {
    expect(kalemFarklari([K({ karsiBaslangic: '2026-09-28' })])[0].gunKaymasi).toBe(-3)
  })

  it('adet farkını verir', () => {
    const f = kalemFarklari([K({ karsiAdet: 800 })])[0]
    expect(f.adetFarki).toBe(-200)
    expect(f.degisti).toBe(true)
  })

  it('aynı tarihi teklif etmek DEĞİŞİKLİK sayılmaz', () => {
    const f = kalemFarklari([K({ karsiBaslangic: '2026-10-01' })])[0]
    expect(f.gunKaymasi).toBe(0)
    expect(f.degisti).toBe(false)
  })
})

describe('fark özeti', () => {
  it('değişen kalemleri ve en büyük kaymayı sayar', () => {
    const f = kalemFarklari([
      K({ id: 1 }),
      K({ id: 2, karsiBaslangic: '2026-10-06' }),
      K({ id: 3, karsiBaslangic: '2026-09-29', karsiAdet: 900 }),
    ])
    const o = farkOzeti(f)
    expect(o.toplamKalem).toBe(3)
    expect(o.degisenKalem).toBe(2)
    expect(o.enBuyukKayma).toBe(5)
    expect(o.toplamAdetFarki).toBe(-100)
  })

  it('hiç değişiklik yoksa sıfır', () => {
    expect(farkOzeti(kalemFarklari([K(), K({ id: 2 })])))
      .toEqual({ degisenKalem: 0, toplamKalem: 2, enBuyukKayma: 0, toplamAdetFarki: 0 })
  })
})

describe('geçerli yerleşim', () => {
  it('karşı öneri varsa O geçerlidir', () => {
    /* "Kabul ettim" deyip eski tarihi yazmak, atölyeye yine tutturamayacağı
       bir plan vermek demektir. */
    expect(gecerliYerlesim(K({ karsiBaslangic: '2026-10-07', karsiAdet: 900 })))
      .toEqual({ baslangic: '2026-10-07', adet: 900 })
  })

  it('karşı öneri yoksa teklif geçerlidir', () => {
    expect(gecerliYerlesim(K())).toEqual({ baslangic: '2026-10-01', adet: 1000 })
  })

  it('yalnız tarih önerildiyse adet teklifin kalır', () => {
    expect(gecerliYerlesim(K({ karsiBaslangic: '2026-10-07' })))
      .toEqual({ baslangic: '2026-10-07', adet: 1000 })
  })
})

describe('durum geçişleri', () => {
  it('bekleyen teklif cevaplanabilir', () => {
    expect(gecisGecerli('bekliyor', 'kabul')).toBe(true)
    expect(gecisGecerli('bekliyor', 'revizyon')).toBe(true)
    expect(gecisGecerli('bekliyor', 'ret')).toBe(true)
  })

  it('CEVAPLANMIŞ teklif yeniden cevaplanamaz', () => {
    /* Aynı turu değiştirmek geçmişi silmektir; planlamacı YENİ TUR açar. */
    expect(gecisGecerli('kabul', 'revizyon')).toBe(false)
    expect(gecisGecerli('ret', 'kabul')).toBe(false)
    expect(gecisGecerli('revizyon', 'kabul')).toBe(false)
  })
})
