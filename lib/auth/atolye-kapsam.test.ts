import { describe, it, expect } from 'vitest'
import { atolyeKapsamindaMi, gecerliAtolyeId } from './atolye-kapsam'

const u = (s: string) => new URL(s, 'https://pes.example')

describe('atolyeKapsamindaMi', () => {
  it('atölye paneli sayfaları kapsamda', () => {
    expect(atolyeKapsamindaMi(u('/workshop'), null)).toBe(true)
    expect(atolyeKapsamindaMi(u('/workshop/plan'), null)).toBe(true)
  })

  it('merkez paneli kapsam dışı — çerez dururken bile daralmamalı', () => {
    expect(atolyeKapsamindaMi(u('/pes/plan-tezgahi'), null)).toBe(false)
    expect(atolyeKapsamindaMi(u('/pes'), 'https://pes.example/workshop/plan')).toBe(false)
  })

  it('/workshopX gibi benzer adlar kapsam dışı', () => {
    expect(atolyeKapsamindaMi(u('/workshopx'), null)).toBe(false)
  })

  it('API çağrısı atölye sayfasından geliyorsa kapsamda', () => {
    expect(atolyeKapsamindaMi(u('/api/pes/work-orders'), 'https://pes.example/workshop/takvim')).toBe(true)
  })

  it('API çağrısı merkezden ya da referer yoksa kapsam dışı', () => {
    expect(atolyeKapsamindaMi(u('/api/pes/work-orders'), 'https://pes.example/pes/takvim')).toBe(false)
    expect(atolyeKapsamindaMi(u('/api/pes/work-orders'), null)).toBe(false)
  })

  it('başka kökenden gelen referer sayılmaz', () => {
    expect(atolyeKapsamindaMi(u('/api/pes/work-orders'), 'https://kotu.example/workshop')).toBe(false)
    expect(atolyeKapsamindaMi(u('/api/pes/work-orders'), 'bozuk')).toBe(false)
  })
})

describe('gecerliAtolyeId', () => {
  it('yalnız pozitif tam sayı', () => {
    expect(gecerliAtolyeId('12')).toBe(12)
    expect(gecerliAtolyeId('0')).toBeNull()
    expect(gecerliAtolyeId('-3')).toBeNull()
    expect(gecerliAtolyeId('1.5')).toBeNull()
    expect(gecerliAtolyeId(undefined)).toBeNull()
    expect(gecerliAtolyeId('abc')).toBeNull()
  })
})
