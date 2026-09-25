import { describe, it, expect } from 'vitest'
import {
  fastTrackTesvik, garantiDegeri, gecikmeKesintisi, tesvikPaketi,
  type FastTrackGirdi,
} from './tesvik'
import { senaryoHesapla, VARSAYILAN_SENARYO_PARAM } from './siparis-senaryo'

const P = VARSAYILAN_SENARYO_PARAM
const TEMEL = {
  toplamAdet: 20_000,
  kararliBirimDk: 20,
  gunlukKapasiteDk: 70 * 540,
  dikimDkMaliyet: 4.5,
  param: P,
}

const normal = senaryoHesapla({ ...TEMEL, partiSayisi: 1, bantSayisi: 1 })
/* Fast-track: parti 2'ye bölünmüş, 3 banda dağıtılmış. */
const hizli = senaryoHesapla({ ...TEMEL, partiSayisi: 2, bantSayisi: 3 })

const G: FastTrackGirdi = {
  normal, hizli, adet: 20_000, dikimDkMaliyet: 4.5,
  mesaiDk: 5_000, mesaiZamOrani: 0.5,
  otelenenDegisimSayisi: 1, degisimDk: 80,
  hedefMarj: 0.15,
}

describe('fast-track ek maliyeti', () => {
  const t = fastTrackTesvik(G)

  it('ek dakika iki senaryonun farkı', () => {
    expect(t.ekDakika).toBeCloseTo(hizli.toplamDk - normal.toplamDk, 6)
    expect(t.ekDakika).toBeGreaterThan(0)
  })

  it('üç maliyet kalemi AYRI görünür', () => {
    /* Tek bir "fast-track zammı" rakamı nereden geldiğini gizlerdi. */
    expect(t.ekDakikaMaliyeti).toBeCloseTo(t.ekDakika * 4.5, 6)
    expect(t.mesaiZamMaliyeti).toBeCloseTo(5_000 * 4.5 * 0.5, 6)
    expect(t.otelemeMaliyeti).toBeCloseTo(1 * 80 * 4.5, 6)
    expect(t.toplamEkMaliyet).toBeCloseTo(
      t.ekDakikaMaliyeti! + t.mesaiZamMaliyeti! + t.otelemeMaliyeti!, 6)
  })

  it('mesaide yalnız ZAM sayılır — çifte sayım yok', () => {
    /* Mesai dakikasının normal maliyeti zaten senaryoda var; tam maliyeti
       ikinci kez eklemek primi şişirirdi. */
    const tamMaliyet = 5_000 * 4.5
    expect(t.mesaiZamMaliyeti!).toBeLessThan(tamMaliyet)
    expect(t.mesaiZamMaliyeti!).toBeCloseTo(tamMaliyet * 0.5, 6)
  })

  it('adil prim marj payını içerir', () => {
    const primsiz = t.toplamEkMaliyet! / 20_000
    expect(t.adilPrimAdet!).toBeCloseTo(primsiz * 1.15, 6)
  })

  it('prim oranı normal birim maliyete göre', () => {
    expect(t.adilPrimOran!).toBeCloseTo(t.adilPrimAdet! / normal.birimMaliyet!, 10)
  })
})

describe('dakika maliyeti yoksa', () => {
  it('prim NULL döner — sıfır değil', () => {
    /* Sıfır dönmek "fast-track bedava" demek olurdu. */
    const t = fastTrackTesvik({ ...G, dikimDkMaliyet: null })
    expect(t.toplamEkMaliyet).toBeNull()
    expect(t.adilPrimAdet).toBeNull()
    expect(t.adilPrimOran).toBeNull()
    /* Dakika farkı yine de bilinir. */
    expect(t.ekDakika).toBeGreaterThan(0)
  })
})

describe('garanti değeri', () => {
  it('boş gün riskinin azalması kadar', () => {
    expect(garantiDegeri(10, 37_800, 0.8)).toBeCloseTo(10 * 37_800 * 0.8, 6)
  })

  it('dakika marjı yoksa null', () => {
    expect(garantiDegeri(10, 37_800, null)).toBeNull()
  })

  it('gün yoksa 0', () => {
    expect(garantiDegeri(0, 37_800, 0.8)).toBe(0)
  })
})

describe('gecikme kesintisi', () => {
  it('günlük orana göre birikir', () => {
    expect(gecikmeKesintisi(3, 1_000_000, 0.01)).toBeCloseTo(30_000, 6)
  })

  it('TAVANI aşmaz', () => {
    /* Tavansız uzun gecikmede kesinti siparişin tamamını yer ve atölyenin
       işi bitirmek için sebebi kalmaz. */
    expect(gecikmeKesintisi(100, 1_000_000, 0.01)).toBeCloseTo(100_000, 6)
    expect(gecikmeKesintisi(100, 1_000_000, 0.01, 0.05)).toBeCloseTo(50_000, 6)
  })

  it('gecikme yoksa 0', () => {
    expect(gecikmeKesintisi(0, 1_000_000, 0.01)).toBe(0)
    expect(gecikmeKesintisi(-2, 1_000_000, 0.01)).toBe(0)
  })
})

describe('teşvik paketi', () => {
  it('prim + garanti − beklenen kesinti', () => {
    expect(tesvikPaketi(100_000, 30_000, 10_000)).toBeCloseTo(120_000, 6)
  })

  it('garanti yoksa yalnız prim', () => {
    expect(tesvikPaketi(100_000, null, 0)).toBeCloseTo(100_000, 6)
  })

  it('prim hesaplanamadıysa paket de null', () => {
    expect(tesvikPaketi(null, 30_000, 0)).toBeNull()
  })
})
