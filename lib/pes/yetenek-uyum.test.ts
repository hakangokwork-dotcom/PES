import { describe, it, expect } from 'vitest'
import {
  boyutUyumlari, uyumOzeti, genelUyum, uyariMetni, DURUM_ETIKET, GENEL_ETIKET,
  type AtolyeYetenegi,
} from './yetenek-uyum'
import { KUNYE_BOYUTLARI } from './kunye'
import { boyutAdi } from './yetenek-filtre'

const ATOLYE: AtolyeYetenegi[] = [
  { boyut: 'klasman', deger: 'PANTOLON' },
  { boyut: 'ana_grup', deger: 'DENIM' },
  { boyut: 'cinsiyet_yas', deger: 'KADIN' },
]

/* Yetenek kataloğunda gerçekten tutulan boyutlar — `kalite` YOK. */
const IZLENEN = new Set(['klasman', 'ana_grup', 'cinsiyet_yas', 'kumas_turu', 'kumas_grubu'])

const oz = (k: Parameters<typeof boyutUyumlari>[0]) =>
  uyumOzeti(boyutUyumlari(k, ATOLYE, IZLENEN))

describe('boyut uyumu — dört durum', () => {
  it('künye dolu ve yetenek varsa UYGUN', () => {
    const u = boyutUyumlari({ klasman_kodu: 'PANTOLON' }, ATOLYE, IZLENEN)
    expect(u.find((x) => x.boyut === 'klasman')!.durum).toBe('uygun')
  })

  it('künye dolu ama yetenek yoksa UYGUN-DEĞİL', () => {
    const u = boyutUyumlari({ klasman_kodu: 'ETEK' }, ATOLYE, IZLENEN)
    expect(u.find((x) => x.boyut === 'klasman')!.durum).toBe('uygun-degil')
  })

  it('künye boşsa KUNYE-BOS — "uygun değil" DEĞİL', () => {
    /* İkisini birleştirmek her işi her atölyeye uygunsuz gösterirdi. */
    const u = boyutUyumlari({}, ATOLYE, IZLENEN)
    expect(u.every((x) => x.durum === 'kunye-bos' || x.durum === 'izlenmiyor')).toBe(true)
    expect(u.some((x) => x.durum === 'uygun-degil')).toBe(false)
  })

  it('katalogda izlenmeyen boyut İZLENMIYOR — atölyeyi elemez', () => {
    /* kalite künyede var ama line_capability'de hiç geçmiyor. */
    const u = boyutUyumlari({ kalite_kodu: 'A' }, ATOLYE, IZLENEN)
    expect(u.find((x) => x.boyut === 'kalite')!.durum).toBe('izlenmiyor')
  })

  it('izlenen küme verilmezse hepsi sorulur', () => {
    const u = boyutUyumlari({ kalite_kodu: 'A' }, ATOLYE)
    expect(u.find((x) => x.boyut === 'kalite')!.durum).toBe('uygun-degil')
  })

  it('künyenin her kolonu için bir satır döner', () => {
    expect(boyutUyumlari({}, ATOLYE)).toHaveLength(Object.keys(KUNYE_BOYUTLARI).length)
  })

  it('boşluk yalnızca boşluk olan alan DOLU sayılmaz', () => {
    const u = boyutUyumlari({ klasman_kodu: '   ' }, ATOLYE, IZLENEN)
    expect(u.find((x) => x.boyut === 'klasman')!.durum).toBe('kunye-bos')
  })
})

describe('özet', () => {
  it('uyumsuzu, uygunu ve sorulamayanı ayrı sayar', () => {
    const o = oz({ klasman_kodu: 'PANTOLON', ana_grup_kodu: 'TAKIM' })
    expect(o.uygun).toBe(1)
    expect(o.uyumsuz).toBe(1)
    expect(o.sorulamayan).toBeGreaterThan(0)
    expect(o.eksikBoyutlar).toEqual(['ana_grup'])
  })

  it('künye tamamen boşken KARAR VERİLEMEZ', () => {
    const o = oz({})
    expect(o.kararVerilebilir).toBe(false)
    expect(o.uyumsuz).toBe(0)
  })

  it('izlenmeyen boyut karar verdirmez', () => {
    const o = oz({ kalite_kodu: 'A' })
    expect(o.kararVerilebilir).toBe(false)
  })
})

describe('genel uyum', () => {
  it('hepsi uygunsa uygun', () => {
    expect(genelUyum(oz({ klasman_kodu: 'PANTOLON', ana_grup_kodu: 'DENIM' }))).toBe('uygun')
  })

  it('biri bile uymuyorsa uyumsuz', () => {
    expect(genelUyum(oz({ klasman_kodu: 'PANTOLON', ana_grup_kodu: 'TAKIM' }))).toBe('uyumsuz')
  })

  it('künye boşken BİLİNMİYOR — ne yeşil ne kırmızı', () => {
    expect(genelUyum(oz({}))).toBe('bilinmiyor')
    expect(GENEL_ETIKET.bilinmiyor).toContain('Künye boş')
  })

  it('her durumun etiketi var', () => {
    for (const d of ['uygun', 'uygun-degil', 'kunye-bos', 'izlenmiyor'] as const) {
      expect(DURUM_ETIKET[d]).toBeTruthy()
    }
  })
})

describe('uyarı metni', () => {
  it('uyumsuz boyutları Türkçe adıyla sayar', () => {
    const m = uyariMetni(oz({ klasman_kodu: 'ETEK', ana_grup_kodu: 'TAKIM' }), boyutAdi)
    expect(m).toContain('Klasman')
    expect(m).toContain('Ana grup')
  })

  it('uyumsuzluk yoksa metin YOK', () => {
    expect(uyariMetni(oz({ klasman_kodu: 'PANTOLON' }), boyutAdi)).toBeNull()
    expect(uyariMetni(oz({}), boyutAdi)).toBeNull()
  })
})
