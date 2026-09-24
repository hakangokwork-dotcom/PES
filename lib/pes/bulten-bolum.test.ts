import { describe, it, expect } from 'vitest'
import { TOHUM_KURALLAR, bolumBul, bolumToplamlari } from './bulten-bolum'
import type { BolumKurali, BultenSatiri } from './bulten-bolum'
import fixture from './__fixtures__/bulten-ornek.json'

const OPS = fixture.operasyonlar as BultenSatiri[]

describe('fixture', () => {
  it('70 operasyon, 1368 saniye', () => {
    expect(OPS).toHaveLength(70)
    expect(OPS.reduce((a, o) => a + o.cevrim_sn, 0)).toBe(1368)
  })
})

describe('bolumBul', () => {
  it('Kesim aşaması KESIM', () => {
    expect(bolumBul({ seviye1: 'Kesim', tip: 'Serme' } as BultenSatiri, TOHUM_KURALLAR)).toBe('KESIM')
    expect(bolumBul({ seviye1: 'Kesim', tip: 'Yardımcı (El)' } as BultenSatiri, TOHUM_KURALLAR)).toBe('KESIM')
  })

  it('dikiş makinesi tipleri DIKIM — aşama ne olursa olsun', () => {
    for (const tip of ['Düz Dikiş', 'Overlok', 'Punteriz', 'Çift İğne', 'Zincir (FOA)', 'Zincir Dikiş', 'Kemer (Kansai)']) {
      expect(bolumBul({ seviye1: 'Son İşlem', tip } as BultenSatiri, TOHUM_KURALLAR), tip).toBe('DIKIM')
    }
  })

  it('Son İşlem içindeki dikiş dışı işler UKP', () => {
    expect(bolumBul({ seviye1: 'Son İşlem', tip: 'Ütü/Pres' } as BultenSatiri, TOHUM_KURALLAR)).toBe('UKP')
    expect(bolumBul({ seviye1: 'Son İşlem', tip: 'Yardımcı (El)' } as BultenSatiri, TOHUM_KURALLAR)).toBe('UKP')
    expect(bolumBul({ seviye1: 'Son İşlem', tip: 'Pres/Aksesuar' } as BultenSatiri, TOHUM_KURALLAR)).toBe('UKP')
  })

  it('hazırlık aşamasındaki ütü ve el işi DIKIM — dikim hazırlığıdır', () => {
    expect(bolumBul({ seviye1: 'Ön Hazırlık', tip: 'Ütü/Pres' } as BultenSatiri, TOHUM_KURALLAR)).toBe('DIKIM')
    expect(bolumBul({ seviye1: 'Ön Hazırlık', tip: 'Yardımcı (El)' } as BultenSatiri, TOHUM_KURALLAR)).toBe('DIKIM')
  })

  it('tanınmayan her şey son kuralla DIKIM', () => {
    expect(bolumBul({ seviye1: 'Bilinmeyen Aşama', tip: 'Bilinmeyen Tip' } as BultenSatiri, TOHUM_KURALLAR)).toBe('DIKIM')
  })

  it('kural önceliği: düşük öncelik önce uygulanır', () => {
    const kurallar: BolumKurali[] = [
      { oncelik: 5, seviye1: null, tip: 'Düz Dikiş', bolum: 'UKP' },
      { oncelik: 30, seviye1: null, tip: 'Düz Dikiş', bolum: 'DIKIM' },
    ]
    expect(bolumBul({ seviye1: 'X', tip: 'Düz Dikiş' } as BultenSatiri, kurallar)).toBe('UKP')
  })
})

describe('bolumToplamlari — gerçek dosya', () => {
  const t = bolumToplamlari(OPS, TOHUM_KURALLAR)

  it('KESİM 28 saniye', () => expect(t.KESIM).toBe(28))
  it('DİKİM 1241 saniye', () => expect(t.DIKIM).toBe(1241))
  it('UKP 99 saniye', () => expect(t.UKP).toBe(99))

  it('üç bölümün toplamı dosyanın toplamı', () => {
    expect(t.KESIM + t.DIKIM + t.UKP).toBe(1368)
  })

  it('yalnız 1.seviyeye bakan kural setiyle sonuç FARKLI — eşleme önemli', () => {
    const naif: BolumKurali[] = [
      { oncelik: 10, seviye1: 'Kesim', tip: null, bolum: 'KESIM' },
      { oncelik: 40, seviye1: 'Son İşlem', tip: null, bolum: 'UKP' },
      { oncelik: 99, seviye1: null, tip: null, bolum: 'DIKIM' },
    ]
    const n = bolumToplamlari(OPS, naif)
    expect(n.UKP).toBe(203)
    expect(n.DIKIM).toBe(1137)
    expect(n.UKP - t.UKP).toBe(104)   // 104 saniye yer değiştiriyor
  })

  it('elle ezilen satır kuralı geçersiz kılar', () => {
    const ezili = OPS.map((o, i) => i === 0 ? { ...o, bolum: 'UKP' as const, bolum_kaynak: 'elle' as const } : o)
    const t2 = bolumToplamlari(ezili, TOHUM_KURALLAR)
    expect(t2.KESIM).toBe(28 - OPS[0].cevrim_sn)
    expect(t2.UKP).toBe(99 + OPS[0].cevrim_sn)
  })
})
