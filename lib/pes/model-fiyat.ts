/**
 * Model fiyatlama — Excel MODEL_HESAP ile birebir.
 *
 * Girdi ikiye dayanır:
 *   - Bültenin bölüm süreleri (teorik MTM, saniye)
 *   - E0'ın ATÖLYEYE ÖZEL bölüm dakika maliyetleri (hesapla() çıktısı)
 *
 * Bölgesel 3D değeri ayrı bir referanstır, maliyetin kendisi değil.
 *
 * KURAL: hesaplanamayan her alan null döner, 0 değil (E0'ın kuralı).
 */
import { bol } from './ekonomi-hesap'
import type { EkonomiParam } from './ekonomi-tipler'
import type { Bolum } from './bulten-bolum'

export type FiyatGirdisi = {
  /** Bültenin bölüm başına toplam süresi, saniye. */
  bolumSn: Record<Bolum, number>
  /** E0'dan, bu atölyenin bu dönemdeki bölüm dakika maliyetleri. */
  bolumDkMaliyet: Record<Bolum, number | null>
  param: EkonomiParam
  cmtFiyat: number | null
  gunlukAdet: number | null
  /** Atölyenin günlük dikim kapasitesi, dakika (dikim kişi × saat × 60). */
  dikimKapasiteDk: number | null
  /** Bölgesel 3D dakika maliyeti; yoksa referans hesaplanmaz. */
  dkMaliyet3D: number | null
}

export type FiyatSonucu = {
  kesimDk: number | null
  dikimDk: number | null
  ukpDk: number | null
  kesimTl: number | null
  dikimTl: number | null
  ukpTl: number | null
  toplamMaliyet: number | null
  adilFiyat: number | null
  karAdet: number | null
  marj: number | null
  fiyatSapmasi: number | null
  gunlukDikimIhtiyaci: number | null
  kapasitePayi: number | null
  kapasiteAsimi: boolean | null
  aylikSonuc: number | null
  referans3D: number | null
  cmt3dSapma: number | null
}

/**
 * MTM saniyesi → gerçek bant dakikası.
 * Kimse gün boyu standart hızda dikmez; verimlilik bunu düzeltir.
 * FORMULLER!E38: verimlilik = (üretilen × SAM) ÷ (operatör × çalışılan dk).
 */
export function gercekDakika(sn: number, verimlilik: number): number | null {
  if (verimlilik === 0) return null
  return sn / 60 / verimlilik
}

/** Gerçek dakika × bölümün dakika maliyeti. */
export function bolumMaliyeti(dk: number | null, dkMaliyet: number | null): number | null {
  if (dk === null || dkMaliyet === null) return null
  return dk * dkMaliyet
}

export function modelFiyati(g: FiyatGirdisi): FiyatSonucu {
  const kesimDk = gercekDakika(g.bolumSn.KESIM, g.param.eff_cutting)
  const dikimDk = gercekDakika(g.bolumSn.DIKIM, g.param.eff_sewing)
  const ukpDk = gercekDakika(g.bolumSn.UKP, g.param.eff_ukp)

  const kesimTl = bolumMaliyeti(kesimDk, g.bolumDkMaliyet.KESIM)
  const dikimTl = bolumMaliyeti(dikimDk, g.bolumDkMaliyet.DIKIM)
  const ukpTl = bolumMaliyeti(ukpDk, g.bolumDkMaliyet.UKP)

  // Üçünden biri hesaplanamıyorsa toplam da hesaplanamaz: eksik bir bölümü
  // 0 saymak maliyeti olduğundan düşük gösterir ve fiyat yanlış verilir.
  const toplamMaliyet =
    kesimTl === null || dikimTl === null || ukpTl === null ? null : kesimTl + dikimTl + ukpTl

  const adilFiyat = toplamMaliyet === null ? null : toplamMaliyet * (1 + g.param.target_margin)
  const karAdet =
    toplamMaliyet === null || g.cmtFiyat === null ? null : g.cmtFiyat - toplamMaliyet
  const marj = bol(karAdet, g.cmtFiyat)
  const sapmaOrani = bol(g.cmtFiyat, adilFiyat)
  const fiyatSapmasi = sapmaOrani === null ? null : sapmaOrani - 1

  const gunlukDikimIhtiyaci =
    dikimDk === null || g.gunlukAdet === null ? null : g.gunlukAdet * dikimDk
  const kapasitePayi = bol(gunlukDikimIhtiyaci, g.dikimKapasiteDk)
  const kapasiteAsimi = kapasitePayi === null ? null : kapasitePayi > 1

  const aylikSonuc =
    karAdet === null || g.gunlukAdet === null
      ? null
      : karAdet * g.gunlukAdet * g.param.nominal_days

  /* 3D referans VERİMLİLİK DÜZELTMESİZ: FORMULLER!E51'e göre 3D değeri
     verimlilik kaybını zaten içeriyor, standart dakikayla çarpılır.
     Verimlilikle ikinci kez düzeltmek çifte sayım olur. */
  const toplamStandartDk = (g.bolumSn.KESIM + g.bolumSn.DIKIM + g.bolumSn.UKP) / 60
  const referans3D = g.dkMaliyet3D === null ? null : toplamStandartDk * g.dkMaliyet3D
  const ref3dOran = bol(g.cmtFiyat, referans3D)
  const cmt3dSapma = ref3dOran === null ? null : ref3dOran - 1

  return {
    kesimDk, dikimDk, ukpDk,
    kesimTl, dikimTl, ukpTl,
    toplamMaliyet, adilFiyat, karAdet, marj, fiyatSapmasi,
    gunlukDikimIhtiyaci, kapasitePayi, kapasiteAsimi, aylikSonuc,
    referans3D, cmt3dSapma,
  }
}

export type Hukum = 'YESIL' | 'SARI' | 'KIRMIZI' | 'HESAPLANAMADI'

/**
 * MODEL_HESAP!Z karşılığı: marja göre hüküm.
 * Kapasite aşımı ayrı bir bayrak — fiyat kararını değil, adet kararını
 * ilgilendirir; ikisini tek metne gömmek hangisinin sorun olduğunu gizler.
 */
export function hukum(f: FiyatSonucu, hedefMarj: number): Hukum {
  if (f.marj === null) return 'HESAPLANAMADI'
  if (f.marj >= hedefMarj) return 'YESIL'
  if (f.marj >= 0) return 'SARI'
  return 'KIRMIZI'
}
