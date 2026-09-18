import { describe, it, expect } from 'vitest'
import { anketSatiriCoz } from './ekonomi-anket'
import { hesapla } from './ekonomi-hesap'
import type { EkonomiParam, EkonomiRasyo } from './ekonomi-tipler'
import fixture from './__fixtures__/ekonomi-pilot.json'

/**
 * Excel HESAP başlığı → EkonomiRasyo alanı.
 * Sol taraf Atolye_Gider_Model.xlsx HESAP satır 3'ten birebir kopyalanmıştır.
 */
const ESLESME: Array<[string, keyof EkonomiRasyo, number]> = [
  ['Toplam kişi', 'toplamKisi', 9],
  ['Üretim kişi (kesim+dikim+UKP)', 'uretimKisi', 9],
  ['Dikim payı', 'dikimPayi', 10],
  ['Aylık ciro (TL)', 'aylikCiro', 4],
  ['Ortalama fiyat / adet', 'ortFiyatAdet', 6],
  ['Brüt gider (TL)', 'brutGider', 4],
  ['Net gider (TL)', 'netGider', 4],
  ['Kâr / zarar (TL)', 'karZarar', 4],
  ['Marj %', 'marj', 10],
  ['İşçilik toplamı (maaş+mesai+prim+SGK+kıdem)', 'iscilikToplam', 4],
  ['İşçilik payı (net)', 'iscilikPayi', 10],
  ['İşçilik dışı / kişi, kira hariç', 'iscilikDisiKisi', 6],
  ['Ciro / kişi', 'ciroKisi', 5],
  ['Net gider / kişi', 'netGiderKisi', 5],
  ['Maaş / kişi', 'maasKisi', 5],
  ['Adet / dikimci', 'adetDikimci', 6],
  ['Nominal dikim dakikası / ay', 'nominalDikimDk', 4],
  ['Fiili dikim dakikası / ay', 'fiiliDikimDk', 4],
  ['Üretim kişi-dakikası (nominal)', 'uretimKisiDk', 4],
  ['Kişi-dakika maliyeti (TL/dk)', 'kisiDkMaliyet', 10],
  ['KESİM dk maliyeti (TL/dk)', 'kesimDkMaliyet', 10],
  ['DİKİM dk maliyeti (TL/dk)', 'dikimDkMaliyet', 10],
  ['UKP dk maliyeti (TL/dk)', 'ukpDkMaliyet', 10],
  ['Dikim dk cirosu (TL/dk)', 'dikimDkCiro', 10],
  ['Dakika marjı (ciro − maliyet, TL/dk)', 'dakikaMarji', 10],
  ['Fiili dikim dk maliyeti (TL/dk)', 'fiiliDikimDkMaliyet', 10],
  ['Asgari dakika çarpanı (× asgari ücretli dk)', 'asgariDkCarpani', 9],
  ['Dikim dakikası / adet (nominal)', 'dikimDkAdet', 8],
  ['Başabaş fiyat / adet', 'basabasFiyat', 7],
  ['Adil fiyat / adet (hedef marjla)', 'adilFiyat', 7],
  ['Fiyat sapması (fiyat ÷ adil − 1)', 'fiyatSapmasi', 9],
  ['İşçilik yük katsayısı (işçilik net ÷ maaş)', 'iscilikYukKatsayisi', 10],
  ['Dikim dk maliyeti ÷ 3D referans', 'dkMaliyet3DOran', 9],
]

const param = fixture.parametre as EkonomiParam
const dk3d = fixture.dk3d as Record<string, number>

describe('11 pilot atölye — Excel HESAP ile birebir', () => {
  it('fixture 11 atölye içeriyor', () => {
    expect(fixture.atolyeler).toHaveLength(11)
  })

  for (const atolye of fixture.atolyeler) {
    describe(atolye.ad, () => {
      const cozum = anketSatiriCoz(atolye.giris as Record<string, unknown>)
      const bolgeAd = String((atolye.giris as Record<string, unknown>)['Teşvik bölgesi'] ?? '').trim()
      const rasyo = hesapla({
        gider: cozum.gider,
        ekonomi: cozum.ekonomi,
        param,
        dkMaliyet3D: dk3d[bolgeAd] ?? null,
        qtyActual: null,
      })

      for (const [excelBaslik, alan, hassasiyet] of ESLESME) {
        const beklenen = (atolye.beklenen as Record<string, unknown>)[excelBaslik]
        if (typeof beklenen !== 'number') continue

        it(`${excelBaslik}`, () => {
          const bulunan = rasyo[alan]
          expect(bulunan, `${alan} null döndü`).not.toBeNull()
          expect(bulunan as number).toBeCloseTo(beklenen, hassasiyet)
        })
      }
    })
  }
})
