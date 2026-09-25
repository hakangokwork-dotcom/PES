import { describe, it, expect } from 'vitest'
import {
  gecikmeGunu, bildirimDogrula, bildirimOzeti, bildirimGerekir, gunFarki,
  TIP_ETIKET, type Bildirim,
} from './plan-bildirim'

const B = (o: Partial<Bildirim> = {}): Bildirim => ({
  id: 1, tip: 'gecikme', workOrderId: 10, workshopId: 5,
  eskiBitis: '2026-10-10', yeniBitis: '2026-10-14',
  gerekceKodu: 'MALZEME_GEC', not: null,
  olusturulma: '2026-10-01', okunduAt: null, ...o,
})

describe('gecikme günü', () => {
  it('iki tarihten türetilir', () => {
    expect(gecikmeGunu(B())).toBe(4)
  })

  it('eski tarih YOKSA null — SIFIR DEĞİL', () => {
    /* "Kayma yok" ile "karşılaştıracak tarih yok" farklı şeyler; 0 yazmak
       ikincisini "zamanında" gibi gösterirdi. */
    expect(gecikmeGunu(B({ eskiBitis: null }))).toBeNull()
  })

  it('erkene çekme NEGATİF döner ve gizlenmez', () => {
    expect(gecikmeGunu(B({ eskiBitis: '2026-10-14', yeniBitis: '2026-10-10' }))).toBe(-4)
  })

  it('aynı tarihte sıfır', () => {
    expect(gecikmeGunu(B({ yeniBitis: '2026-10-10' }))).toBe(0)
  })
})

describe('doğrulama', () => {
  const G = { tip: 'gecikme', yeniBitis: '2026-10-14', gerekceKodu: 'MALZEME_GEC', not: null }

  it('geçerli bildirimde hata yok', () => {
    expect(bildirimDogrula(G)).toEqual([])
  })

  it('GEREKÇE zorunlu', () => {
    /* Tarih değiştiyse sebebi de bilinmeli; yoksa planlamacı ne
       yapacağını bilemez. */
    expect(bildirimDogrula({ ...G, gerekceKodu: null }).map((x) => x.alan))
      .toEqual(['gerekceKodu'])
  })

  it('DİĞER seçildiyse açıklama zorunlu', () => {
    expect(bildirimDogrula({ ...G, gerekceKodu: 'DIGER', not: '   ' }).map((x) => x.alan))
      .toEqual(['not'])
    expect(bildirimDogrula({ ...G, gerekceKodu: 'DIGER', not: 'boyahane kapandı' })).toEqual([])
  })

  it('bozuk tarih yakalanır', () => {
    expect(bildirimDogrula({ ...G, yeniBitis: '14.10.2026' }).map((x) => x.alan))
      .toEqual(['yeniBitis'])
  })

  it('bilinmeyen tip reddedilir', () => {
    expect(bildirimDogrula({ ...G, tip: 'baska' }).map((x) => x.alan)).toEqual(['tip'])
  })

  it('her tipin etiketi var', () => {
    expect(TIP_ETIKET.gecikme).toBeTruthy()
    expect(TIP_ETIKET.degisiklik).toBeTruthy()
  })
})

describe('özet', () => {
  it('okunmamışı ve en büyük gecikmeyi sayar', () => {
    const o = bildirimOzeti([
      B({ id: 1 }),
      B({ id: 2, yeniBitis: '2026-10-20', okunduAt: '2026-10-02' }),
      B({ id: 3, eskiBitis: '2026-10-14', yeniBitis: '2026-10-11' }),
    ])
    expect(o.toplam).toBe(3)
    expect(o.okunmamis).toBe(2)
    expect(o.enBuyukGecikme).toBe(10)
    expect(o.erkeneCekilen).toBe(1)
  })

  it('hesaplanamayan gecikme özeti bozmaz', () => {
    const o = bildirimOzeti([B({ eskiBitis: null })])
    expect(o.enBuyukGecikme).toBeNull()
    expect(o.toplam).toBe(1)
  })

  it('boş listede null', () => {
    expect(bildirimOzeti([])).toEqual({
      toplam: 0, okunmamis: 0, enBuyukGecikme: null, erkeneCekilen: 0,
    })
  })
})

describe('zaman çiti bildirimi', () => {
  it('çit içindeki değişiklik bildirilmeli', () => {
    expect(bildirimGerekir('2026-10-01', '2026-10-05', 7)).toBe(true)
  })

  it('çit dışındaki değişiklik bildirilmez', () => {
    expect(bildirimGerekir('2026-10-01', '2026-11-01', 7)).toBe(false)
  })

  it('başlamış iş de çit içindedir', () => {
    expect(bildirimGerekir('2026-10-10', '2026-10-05', 7)).toBe(true)
  })
})

describe('gün farkı', () => {
  it('yaz saati geçişinde kaymaz', () => {
    expect(gunFarki('2026-03-28', '2026-03-30')).toBe(2)
    expect(gunFarki('2026-10-24', '2026-10-26')).toBe(2)
  })
})
