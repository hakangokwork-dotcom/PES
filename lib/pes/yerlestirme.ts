/* Sipariş yerleştirme — SAF hesap katmanı.
   Bu dosya veritabanı bilmez. Sebebi: bölme ve geriye planlama bu işin
   en kırılgan kısmı; DB olmadan test edilebilmesi hızlı doğrulamanın
   tek yolu. Kalıcılık lib/pes/yerlestir-kaydet.ts'te. */

export type BantKapasite = { lineId: number; gunlukHedef: number }
export type BantPay = BantKapasite & { adet: number }

/**
 * Adedi bantlara KAPASİTEYE ORANTILI böler (tasarım K9).
 * Amaç bütün bantların aynı gün bitmesi: hızlı bant daha çok alır.
 *
 * Yuvarlama artığı en büyük kapasiteli banda eklenir — toplam adet
 * her zaman korunur, aksi halde sipariş miktarı sessizce eksilir.
 * Kapasitesi 0 olan bant hiç pay almaz (sonsuz süre demek olurdu).
 */
export function bantPaylari(adet: number, bantlar: BantKapasite[]): BantPay[] {
  const uygun = bantlar.filter(b => b.gunlukHedef > 0)
  if (uygun.length === 0) throw new Error('Bölme yapılamaz: kapasitesi tanımlı bant yok')

  const toplamHedef = uygun.reduce((t, b) => t + b.gunlukHedef, 0)
  const paylar: BantPay[] = uygun.map(b => ({
    ...b,
    adet: Math.floor((adet * b.gunlukHedef) / toplamHedef),
  }))

  const artik = adet - paylar.reduce((t, p) => t + p.adet, 0)
  if (artik > 0) {
    const enBuyuk = paylar.reduce((a, b) => (b.gunlukHedef > a.gunlukHedef ? b : a))
    enBuyuk.adet += artik
  }
  return paylar
}

/**
 * Bir aşamanın kaç gün süreceği.
 *
 * gunlukKapasite null veya 0 ise NULL döner: sistem tarih üretmez,
 * kullanıcı "girer/çıkar" tarihini elle yazar (tasarım K2). Buraya
 * varsayılan bir kapasite uydurmak, olmayan bir bilgiyi varmış gibi
 * göstermek olurdu.
 */
export function asamaGunu(adet: number, gunlukKapasite: number | null): number | null {
  if (!gunlukKapasite || gunlukKapasite <= 0) return null
  return Math.max(1, Math.ceil(adet / gunlukKapasite))
}
