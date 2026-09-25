import { describe, it, expect } from 'vitest'
import {
  kalemPlani, cakismalar, tezgahDolulugu, zamanCitiUyarilari,
  gunFarki, gunAraligi, type TaslakKalem,
} from './plan-tezgah'
import type { HesapBaglami } from './bant-doluluk'

/* İki bant: 100 ve 50 adet/gün. Blok yok, override yok. */
const CTX: HesapBaglami = {
  bantlar: [
    { lineId: 1, dailyTarget: 100, aktif: true },
    { lineId: 2, dailyTarget: 50, aktif: true },
  ],
  bloklar: [],
  override: () => null,
}

const K = (o: Partial<TaslakKalem> = {}): TaslakKalem => ({
  id: 1, workOrderId: 10, workshopId: 5, lineId: 1,
  baslangic: '2026-10-01', adet: 300, ...o,
})

describe('kalem planı', () => {
  it('bitiş tarihi kapasiteden TÜRETİLİR', () => {
    /* 300 adet ÷ 100/gün = 3 gün. 1 Ekim Perşembe → 1,2,3 Ekim. */
    const p = kalemPlani(K(), CTX)
    expect(p.gunler).toHaveLength(3)
    expect(p.bitis).toBe('2026-10-03')
    expect(p.sigmadi).toBe(false)
  })

  it('yavaş bantta daha uzun sürer', () => {
    const p = kalemPlani(K({ lineId: 2 }), CTX)
    expect(p.gunler.length).toBeGreaterThan(3)
  })

  it('Pazar atlanır, plan uzar', () => {
    /* 4 Ekim 2026 Pazar. 3 Ekim'de başlayan 300 adet 3 günde bitmez. */
    const p = kalemPlani(K({ baslangic: '2026-10-03' }), CTX)
    expect(p.gunler.map((g) => g.tarih)).not.toContain('2026-10-04')
  })

  it('kapasitesi olmayan banda bırakılırsa SESSİZ KALMAZ', () => {
    /* Sessiz kalmak planlamacıya "yerleşti" demektir. */
    const bos: HesapBaglami = { ...CTX, bantlar: [{ lineId: 1, dailyTarget: 0, aktif: true }] }
    const p = kalemPlani(K(), bos)
    expect(p.gunler).toHaveLength(0)
    expect(p.sigmadi).toBe(true)
  })

  it('günlerin toplamı adede eşit', () => {
    const p = kalemPlani(K({ adet: 250 }), CTX)
    expect(p.gunler.reduce((t, g) => t + g.adet, 0)).toBe(250)
  })
})

describe('çakışma', () => {
  const kap = () => 100

  it('aynı bantta aynı gün kapasite aşımını bulur', () => {
    const a = kalemPlani(K({ id: 1, adet: 100 }), CTX)
    const b = kalemPlani(K({ id: 2, workOrderId: 11, adet: 100 }), CTX)
    const c = cakismalar([a, b], kap)
    expect(c).toHaveLength(1)
    expect(c[0].tarih).toBe('2026-10-01')
    expect(c[0].toplam).toBe(200)
    expect(c[0].kapasite).toBe(100)
    expect(c[0].kalemIdler).toEqual([1, 2])
  })

  it('kapasite aşılmıyorsa çakışma yok', () => {
    const a = kalemPlani(K({ id: 1, adet: 50 }), CTX)
    const b = kalemPlani(K({ id: 2, workOrderId: 11, adet: 50 }), CTX)
    expect(cakismalar([a, b], kap)).toEqual([])
  })

  it('FARKLI bantlar çakışmaz', () => {
    const a = kalemPlani(K({ id: 1, lineId: 1, adet: 100 }), CTX)
    const b = kalemPlani(K({ id: 2, lineId: 2, workOrderId: 11, adet: 50 }), CTX)
    expect(cakismalar([a, b], (l) => (l === 1 ? 100 : 50))).toEqual([])
  })

  it('çakışma ENGELLENMEZ, yalnız bildirilir', () => {
    /* Planlamacı bilerek üst üste koyabilmeli (mesai düşünüyor olabilir).
       Fonksiyon liste döndürür, hata ATMAZ. */
    const a = kalemPlani(K({ id: 1, adet: 500 }), CTX)
    const b = kalemPlani(K({ id: 2, workOrderId: 11, adet: 500 }), CTX)
    expect(() => cakismalar([a, b], kap)).not.toThrow()
    expect(cakismalar([a, b], kap).length).toBeGreaterThan(0)
  })
})

describe('tezgâh dolluğu', () => {
  it('bant ve güne göre toplar', () => {
    const a = kalemPlani(K({ id: 1, adet: 100 }), CTX)
    const b = kalemPlani(K({ id: 2, workOrderId: 11, adet: 100 }), CTX)
    const d = tezgahDolulugu([a, b])
    expect(d[1]['2026-10-01']).toBe(200)
  })

  it('kalem yoksa boş', () => {
    expect(tezgahDolulugu([])).toEqual({})
  })
})

describe('zaman çiti', () => {
  const p = (id: number, baslangic: string) => kalemPlani(K({ id, baslangic }), CTX)

  it('çit içindeki kalemi uyarır', () => {
    const u = zamanCitiUyarilari([p(1, '2026-10-03')], '2026-10-01', 7)
    expect(u).toHaveLength(1)
    expect(u[0].kalanGun).toBe(2)
  })

  it('çit dışındaki kalemi uyarmaz', () => {
    expect(zamanCitiUyarilari([p(1, '2026-11-01')], '2026-10-01', 7)).toEqual([])
  })

  it('GEÇMİŞE yerleştirilmiş kalemi de uyarır', () => {
    /* Negatif kalan gün, farkında olmadan geriye yerleştirme demektir. */
    const u = zamanCitiUyarilari([p(1, '2026-09-20')], '2026-10-01', 7)
    expect(u[0].kalanGun).toBeLessThan(0)
  })

  it('en acil olan başta', () => {
    const u = zamanCitiUyarilari([p(1, '2026-10-05'), p(2, '2026-10-02')], '2026-10-01', 7)
    expect(u.map((x) => x.kalemId)).toEqual([2, 1])
  })
})

describe('tarih yardımcıları', () => {
  it('gün farkı saat dilimi taşımaz', () => {
    expect(gunFarki('2026-10-01', '2026-10-04')).toBe(3)
    expect(gunFarki('2026-10-04', '2026-10-01')).toBe(-3)
    /* Yaz saati geçişi olan bir aralık — UTC kullanılmasaydı 1 kayardı. */
    expect(gunFarki('2026-03-28', '2026-03-30')).toBe(2)
  })

  it('gün aralığı ardışık', () => {
    expect(gunAraligi('2026-10-30', 3)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
  })
})
