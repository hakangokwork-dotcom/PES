/**
 * Fast-track teşvik hesabı.
 *
 * ASIL FİKİR: Adil prim keyfi bir yüzde değil, **atölyenin uğradığı
 * ölçülebilir kaybın karşılığıdır**. PES bu kaybı zaten hesaplayabiliyor —
 * E0 atölyeye özel dakika maliyetini, E3 model süresini veriyor. Pazarlık
 * "siz %15 isteyin, biz %8 verelim"den çıkıp "bu iş sana şu kadar dakikaya
 * mal oluyor"a dönüyor.
 *
 * Kullanıcının kullanabileceği üç kaldıraç (2026-09-24 kararı):
 * birim fiyat primi, garantili hacim, gecikme kesintisi. Erken ödeme
 * kapsam dışı bırakıldı.
 *
 * Fast-track üç şeyi birden içerir (kullanıcı kararı): sırayı atlar,
 * mesaiyle sıkıştırılır, parti bölünüp birden fazla banda dağıtılır.
 * Üçünün maliyeti de aşağıda ayrı ayrı görünür — tek bir "fast-track
 * zammı" rakamı nereden geldiğini gizlerdi.
 */
import type { SenaryoSonuc } from './siparis-senaryo'

export type FastTrackGirdi = {
  /** Normal koşulda senaryo. */
  normal: SenaryoSonuc
  /** Fast-track koşulunda senaryo (parti bölünmüş, bant artmış). */
  hizli: SenaryoSonuc
  /** Sipariş adedi. */
  adet: number
  /** Dikim dakika maliyeti, TL. E0'dan — GERÇEK. null ise prim hesaplanamaz. */
  dikimDkMaliyet: number | null
  /** Mesaiyle kazanılan dakika. */
  mesaiDk: number
  /** Mesai zam oranı (0,5 = %50 zamlı). */
  mesaiZamOrani: number
  /** Sıra atlama yüzünden ötelenen işin yaşayacağı ek değişim sayısı. */
  otelenenDegisimSayisi: number
  /** Bir değişimin dakikası (VARSAYIM). */
  degisimDk: number
  /** Hedef tedarikçi marjı (E0 parametresi). */
  hedefMarj: number
}

export type TesvikSonuc = {
  /** Fast-track'in getirdiği ek bant dakikası (değişim + öğrenme). */
  ekDakika: number
  ekDakikaMaliyeti: number | null
  /** Mesai zammının maliyeti (normal maliyet zaten sayıldı, yalnız ZAM). */
  mesaiZamMaliyeti: number | null
  /** Ötelenen işin ek kurulum maliyeti. */
  otelemeMaliyeti: number | null
  toplamEkMaliyet: number | null
  /** Marj payı dahil adil prim, TL/adet. */
  adilPrimAdet: number | null
  /** Normal birim maliyete göre prim oranı. */
  adilPrimOran: number | null
}

export function fastTrackTesvik(g: FastTrackGirdi): TesvikSonuc {
  const ekDakika = g.hizli.toplamDk - g.normal.toplamDk

  if (g.dikimDkMaliyet === null) {
    /* Dakika maliyeti yoksa prim HESAPLANAMAZ. Sıfır dönmek "bedava"
       demek olurdu; E0'ın null/0 ayrımı burada da geçerli. */
    return {
      ekDakika,
      ekDakikaMaliyeti: null, mesaiZamMaliyeti: null, otelemeMaliyeti: null,
      toplamEkMaliyet: null, adilPrimAdet: null, adilPrimOran: null,
    }
  }

  const m = g.dikimDkMaliyet
  const ekDakikaMaliyeti = ekDakika * m

  /* Mesaide yalnız ZAM ek maliyettir: o dakikaların normal maliyeti
     zaten ekDakika içinde ya da normal senaryoda sayıldı. Zammı ikinci
     kez tam maliyet olarak eklemek çifte sayım olurdu. */
  const mesaiZamMaliyeti = g.mesaiDk * m * g.mesaiZamOrani

  const otelemeMaliyeti = g.otelenenDegisimSayisi * g.degisimDk * m

  const toplamEkMaliyet = ekDakikaMaliyeti + mesaiZamMaliyeti + otelemeMaliyeti

  const adilPrimAdet = g.adet > 0
    ? (toplamEkMaliyet / g.adet) * (1 + g.hedefMarj)
    : null

  const normalBirim = g.normal.birimMaliyet
  const adilPrimOran = adilPrimAdet !== null && normalBirim !== null && normalBirim > 0
    ? adilPrimAdet / normalBirim
    : null

  return {
    ekDakika, ekDakikaMaliyeti, mesaiZamMaliyeti, otelemeMaliyeti,
    toplamEkMaliyet, adilPrimAdet, adilPrimOran,
  }
}

/**
 * Garantili hacmin parasal karşılığı.
 *
 * Atölyenin boş gün riski azalır. E0 zaten boş gün düzeltmesi tutuyor:
 * boş geçen gün, o günün dakika marjı kadar kayıptır.
 *
 * Bu bir PRİM DEĞİL, primin yerine geçebilecek bir değerdir — teklif
 * "X TL prim" yerine "Y gün garantili iş" olarak da kurulabilsin diye
 * aynı birime çevrilir.
 */
export function garantiDegeri(
  garantiGunSayisi: number,
  gunlukKapasiteDk: number,
  dakikaMarji: number | null,
): number | null {
  if (dakikaMarji === null) return null
  if (garantiGunSayisi <= 0 || gunlukKapasiteDk <= 0) return 0
  return garantiGunSayisi * gunlukKapasiteDk * dakikaMarji
}

/**
 * Gecikme kesintisi — teşvik yapısının negatif yarısı.
 *
 * Kesinti, siparişin GÜNLÜK değerinin bir oranıdır; sabit bir tutar
 * büyük ve küçük siparişte aynı caydırıcılığı vermez.
 *
 * `tavanOran` olmadan uzun gecikmede kesinti siparişin tamamını yiyebilir;
 * o noktada atölyenin işi bitirmek için hiçbir sebebi kalmaz. Tavan
 * caydırıcılığı korurken teslimi sürdürmeyi mantıklı tutar.
 */
export function gecikmeKesintisi(
  gecikenGun: number,
  siparisToplamTutar: number,
  gunlukOran: number,
  tavanOran = 0.1,
): number {
  if (gecikenGun <= 0 || siparisToplamTutar <= 0 || gunlukOran <= 0) return 0
  const ham = gecikenGun * gunlukOran * siparisToplamTutar
  return Math.min(ham, tavanOran * siparisToplamTutar)
}

/** Teklifin toplam paketi: prim + garanti − beklenen kesinti. */
export function tesvikPaketi(
  primToplam: number | null,
  garanti: number | null,
  beklenenKesinti: number,
): number | null {
  if (primToplam === null) return null
  return primToplam + (garanti ?? 0) - beklenenKesinti
}
