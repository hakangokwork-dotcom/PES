import { describe, it, expect } from 'vitest'
import { gunlukDakikaAdet, sureTuret } from './gercek-sure'
import type { UretimGunu } from './gercek-sure'

/* 40 dikimci × 9 saat × 60 = 21.600 dk/gün */
const KADRO = { sewingStaff: 40, hoursPerDay: 9 }

const GUNLER: UretimGunu[] = [
  { tarih: '2026-01-05', workOrderId: 1, adet: 600, bantIsEmriSayisi: 1 },
  { tarih: '2026-01-06', workOrderId: 1, adet: 720, bantIsEmriSayisi: 1 },
  { tarih: '2026-01-07', workOrderId: 1, adet: 500, bantIsEmriSayisi: 2 },  // karışık
  { tarih: '2026-01-08', workOrderId: 1, adet: 800, bantIsEmriSayisi: 1 },
]

describe('gunlukDakikaAdet', () => {
  it('kadro dakikasını adede böler', () => {
    expect(gunlukDakikaAdet(600, KADRO)).toBeCloseTo(36, 10)   // 21600 / 600
  })

  it('adet sıfırsa null', () => {
    expect(gunlukDakikaAdet(0, KADRO)).toBeNull()
  })

  it('dikim kişi yoksa null', () => {
    expect(gunlukDakikaAdet(600, { sewingStaff: null, hoursPerDay: 9 })).toBeNull()
  })
})

describe('sureTuret', () => {
  const s = sureTuret(GUNLER, KADRO)

  it('karışık günü hesaba katmaz', () => {
    expect(s.gunSayisi).toBe(3)
    expect(s.atlananGun).toBe(1)
  })

  it('ortalama dakika/adet yalnız tek iş emirli günlerden', () => {
    // 21600/600=36, 21600/720=30, 21600/800=27 → ortalama 31
    expect(s.dkAdet).toBeCloseTo(31, 10)
  })

  it('hiç uygun gün yoksa null döner ve atlananı sayar', () => {
    const hepsiKarisik = GUNLER.map(g => ({ ...g, bantIsEmriSayisi: 3 }))
    const r = sureTuret(hepsiKarisik, KADRO)
    expect(r.dkAdet).toBeNull()
    expect(r.gunSayisi).toBe(0)
    expect(r.atlananGun).toBe(4)
  })

  it('adet sıfır olan gün de atlanır', () => {
    const r = sureTuret([{ tarih: '2026-01-09', workOrderId: 1, adet: 0, bantIsEmriSayisi: 1 }], KADRO)
    expect(r.dkAdet).toBeNull()
    expect(r.atlananGun).toBe(1)
  })

  it('boş listede null, sıfır gün', () => {
    expect(sureTuret([], KADRO)).toEqual({ dkAdet: null, gunSayisi: 0, atlananGun: 0 })
  })
})
