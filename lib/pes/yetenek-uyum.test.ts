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

  it('künye dolu, boyutta kayıt var ama bu değer yoksa UYGUN-DEĞİL', () => {
    const u = boyutUyumlari({ klasman_kodu: 'ETEK' }, ATOLYE, IZLENEN)
    expect(u.find((x) => x.boyut === 'klasman')!.durum).toBe('uygun-degil')
  })

  it('atölyenin O BOYUTTA hiç kaydı yoksa ATOLYE-KAYITSIZ — "uygun değil" DEĞİL', () => {
    /* Canlı veride yakalandı: Ege Denim'in 11 yetenek kaydı var ama hiçbiri
       klasman boyutunda değil. Eski kural onu her klasmanda "uygun değil"
       sayıyordu — atölyeyi olmadığı bir şeyle suçlamak. */
    const kumassiz = [{ boyut: 'klasman', deger: 'PANTOLON' }]
    const u = boyutUyumlari({ kumas_turu_kodu: 'DENIM' }, kumassiz, IZLENEN)
    expect(u.find((x) => x.boyut === 'kumas_turu')!.durum).toBe('atolye-kayitsiz')
  })

  it('yeteneği HİÇ olmayan atölye her boyutta kayıtsız', () => {
    const u = boyutUyumlari({ klasman_kodu: 'PANTOLON' }, [], IZLENEN)
    expect(u.find((x) => x.boyut === 'klasman')!.durum).toBe('atolye-kayitsiz')
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

  it('izlenen küme verilmese bile atölyede kayıt yoksa suçlamaz', () => {
    /* İzlenen küme olmadan `kalite` sorulur, ama bu atölyenin kalite
       kaydı da yok — sonuç yine "sorulamadı" olmalı, "uygun değil" değil.
       Yeni kural eskisini daha doğru biçimde kapsıyor. */
    const u = boyutUyumlari({ kalite_kodu: 'A' }, ATOLYE)
    expect(u.find((x) => x.boyut === 'kalite')!.durum).toBe('atolye-kayitsiz')
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

  it('atölyede kayıt yoksa KARAR VERİLEMEZ', () => {
    const o = uyumOzeti(boyutUyumlari({ klasman_kodu: 'PANTOLON' }, [], IZLENEN))
    expect(o.kararVerilebilir).toBe(false)
    expect(o.uyumsuz).toBe(0)
    expect(o.sorulamayan).toBeGreaterThan(0)
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
    /* Etiket iki sebebi birden kapsamalı: künye boş olabilir ya da
       atölyenin o boyutta kaydı olmayabilir. */
    expect(GENEL_ETIKET.bilinmiyor).toContain('Kontrol edilemedi')
  })

  it('her durumun etiketi var', () => {
    for (const d of
      ['uygun', 'uygun-degil', 'kunye-bos', 'atolye-kayitsiz', 'izlenmiyor'] as const) {
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
