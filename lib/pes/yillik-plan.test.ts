import { describe, expect, test } from 'vitest'
import {
  calismaGunu, kapasiteCoz, yillikKapasite, bazKaynagi,
  dolulukYuzdesi, dolulukRengi, yuzdeMetni, talepAcigi, ayToplamlari,
  hucreAdedi, adetGecerli, klasmanUyumu, planIpucuMetni, type AySatiri,
} from './yillik-plan'

describe('calismaGunu', () => {
  test('pazar kapalı: ocak 2027 = 26, şubat 2027 = 24, mart 2027 = 27', () => {
    expect(calismaGunu(2027, 1)).toBe(26)
    expect(calismaGunu(2027, 2)).toBe(24)
    expect(calismaGunu(2027, 3)).toBe(27)
  })
  test('2026 yılı toplamı 313', () => {
    const t = Array.from({ length: 12 }, (_, m) => calismaGunu(2026, m + 1)).reduce((a, b) => a + b, 0)
    expect(t).toBe(313)
  })
})

describe('kapasiteCoz', () => {
  const taban = { duzeltme: null, profil: null, atolye: null, gunlukHedef: 0, calismaGunu: 26 }
  test('düzeltme her şeyi ezer, 0 dahil (ay kapalı)', () => {
    expect(kapasiteCoz({ ...taban, duzeltme: 0, profil: 40000, atolye: 30000, gunlukHedef: 1000 }))
      .toEqual({ adet: 0, kaynak: 'duzeltme' })
  })
  test('düzeltme yoksa profil', () => {
    expect(kapasiteCoz({ ...taban, profil: 40000, gunlukHedef: 1000 }))
      .toEqual({ adet: 40000, kaynak: 'profil' })
  })
  test('profil atölye beyanını ezer', () => {
    expect(kapasiteCoz({ ...taban, profil: 40000, atolye: 30000, gunlukHedef: 1000 }))
      .toEqual({ adet: 40000, kaynak: 'profil' })
  })
  test('profil yok/0 ise atölye beyanı (workshop.monthly_capacity) hedefi ezer', () => {
    expect(kapasiteCoz({ ...taban, profil: null, atolye: 30000, gunlukHedef: 1000 }))
      .toEqual({ adet: 30000, kaynak: 'atolye' })
    expect(kapasiteCoz({ ...taban, profil: 0, atolye: 30000, gunlukHedef: 1000 }))
      .toEqual({ adet: 30000, kaynak: 'atolye' })
  })
  test('atölye beyanı 0 ise yok sayılır, hedefe düşer', () => {
    expect(kapasiteCoz({ ...taban, atolye: 0, gunlukHedef: 1000 }))
      .toEqual({ adet: 26000, kaynak: 'hedef' })
  })
  test('profil ve atölye beyanı yoksa günlük hedef × çalışma günü', () => {
    expect(kapasiteCoz({ ...taban, profil: 0, gunlukHedef: 1000 }))
      .toEqual({ adet: 26000, kaynak: 'hedef' })
  })
  test('hiçbiri yoksa null', () => {
    expect(kapasiteCoz(taban)).toEqual({ adet: null, kaynak: 'yok' })
  })
})

describe('yillikKapasite', () => {
  test('ay bazında çözer; düzeltme yalnız kendi ayını etkiler', () => {
    const d = Array<number | null>(12).fill(null)
    d[1] = 5000
    const k = yillikKapasite(2027, { duzeltmeler: d, profil: null, atolye: null, gunlukHedef: 1000 })
    expect(k.adet).toHaveLength(12)
    expect(k.adet[0]).toBe(26000)
    expect(k.kaynak[0]).toBe('hedef')
    expect(k.adet[1]).toBe(5000)
    expect(k.kaynak[1]).toBe('duzeltme')
    expect(k.adet[2]).toBe(27000)
  })
})

describe('bazKaynagi', () => {
  test('profil > atolye > hedef > yok', () => {
    expect(bazKaynagi(40000, 30000, 1000)).toBe('profil')
    expect(bazKaynagi(null, 30000, 1000)).toBe('atolye')
    expect(bazKaynagi(null, null, 500)).toBe('hedef')
    expect(bazKaynagi(0, 0, 0)).toBe('yok')
  })
})

describe('doluluk', () => {
  test('yüzde', () => {
    expect(dolulukYuzdesi(20000, 40000)).toBe(50)
    expect(dolulukYuzdesi(5, null)).toBeNull()
    expect(dolulukYuzdesi(1, 0)).toBe(Number.POSITIVE_INFINITY)
    expect(dolulukYuzdesi(0, 0)).toBe(0)
  })
  test('renk eşikleri: ≤85 yeşil, ≤100 sarı, >100 kırmızı', () => {
    expect(dolulukRengi(null)).toBe('yok')
    expect(dolulukRengi(85)).toBe('yesil')
    expect(dolulukRengi(85.5)).toBe('sari')
    expect(dolulukRengi(100)).toBe('sari')
    expect(dolulukRengi(100.1)).toBe('kirmizi')
    expect(dolulukRengi(Number.POSITIVE_INFINITY)).toBe('kirmizi')
  })
  test('metin', () => {
    expect(yuzdeMetni(null)).toBe('—')
    expect(yuzdeMetni(Number.POSITIVE_INFINITY)).toBe('∞')
    expect(yuzdeMetni(0.4)).toBe('<%1')
    expect(yuzdeMetni(0)).toBe('%0')
    expect(yuzdeMetni(84.6)).toBe('%85')
  })
})

describe('talepAcigi', () => {
  test('açık ve fazla', () => {
    expect(talepAcigi(100, 60)).toEqual({ acik: 40, fazla: 0 })
    expect(talepAcigi(100, 130)).toEqual({ acik: 0, fazla: 30 })
    expect(talepAcigi(0, 0)).toEqual({ acik: 0, fazla: 0 })
  })
})

describe('ayToplamlari', () => {
  const s: AySatiri[] = [
    { workshopId: 1, ay: 1, klasmanKodu: 'PANTOLON', adet: 100 },
    { workshopId: 1, ay: 1, klasmanKodu: 'GOMLEK', adet: 50 },
    { workshopId: 2, ay: 3, klasmanKodu: 'PANTOLON', adet: 70 },
    { workshopId: 1, ay: 12, klasmanKodu: null, adet: 5 },
  ]
  test('süzgeçsiz: ay toplamları', () => {
    const t = ayToplamlari(s)
    expect(t).toHaveLength(12)
    expect(t[0]).toBe(150)
    expect(t[2]).toBe(70)
    expect(t[11]).toBe(5)
  })
  test('atölye süzgeci', () => {
    expect(ayToplamlari(s, { workshopId: 1 })).toEqual([150, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5])
  })
  test('klasman süzgeci; null klasman = hepsi', () => {
    expect(ayToplamlari(s, { klasman: 'PANTOLON' })).toEqual([100, 0, 70, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(ayToplamlari(s, { klasman: null })).toEqual(ayToplamlari(s))
  })
  test('ikisi birlikte', () => {
    const t = ayToplamlari(s, { workshopId: 1, klasman: 'PANTOLON' })
    expect(t[0]).toBe(100)
    expect(t[2]).toBe(0)
  })
})

describe('adet girdisi', () => {
  test('hucreAdedi: Türkçe binlik nokta ve boşluk atılır, boş = 0', () => {
    expect(hucreAdedi('20.000')).toBe(20000)
    expect(hucreAdedi(' 1 500 ')).toBe(1500)
    expect(hucreAdedi('')).toBe(0)
    expect(hucreAdedi('-5')).toBeNull()
    expect(hucreAdedi('1,5')).toBeNull()
    expect(hucreAdedi('abc')).toBeNull()
  })
  test('adetGecerli: yalnız negatif olmayan tam sayı (number)', () => {
    expect(adetGecerli(0)).toBe(0)
    expect(adetGecerli(20000)).toBe(20000)
    expect(adetGecerli(-1)).toBeNull()
    expect(adetGecerli(1.5)).toBeNull()
    expect(adetGecerli('100')).toBeNull()
    expect(adetGecerli(null)).toBeNull()
    expect(adetGecerli(3_000_000_000)).toBeNull()
  })
})

describe('klasmanUyumu', () => {
  test('kayıtta var → uygun, başka değer var → uyumsuz', () => {
    expect(klasmanUyumu('PANTOLON', ['PANTOLON', 'GOMLEK'], true)).toBe('uygun')
    expect(klasmanUyumu('ELBISE', ['PANTOLON'], true)).toBe('uyumsuz')
  })
  test('atölyenin klasman kaydı yok → kontrol edilemedi (uyumsuz DEĞİL)', () => {
    expect(klasmanUyumu('ELBISE', [], true)).toBe('bilinmiyor')
  })
  test('klasman boyutu hiç izlenmiyorsa → kontrol edilemedi', () => {
    expect(klasmanUyumu('PANTOLON', ['PANTOLON'], false)).toBe('bilinmiyor')
  })
})

describe('planIpucuMetni', () => {
  test('Türkçe binlik ile kod (adet) listesi', () => {
    expect(planIpucuMetni([{ kod: 'B021', adet: 20000 }, { kod: 'B005', adet: 8000 }]))
      .toBe('B021 (20.000), B005 (8.000)')
  })
  test('boşsa null', () => {
    expect(planIpucuMetni([])).toBeNull()
  })
})
