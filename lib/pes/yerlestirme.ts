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

export type AsamaGirdi = {
  stageId: number
  kod: string
  siraNo: number
  /** null = kapasite tanımsız, tarih elle girilecek */
  gun: number | null
}

export type AsamaPencere = {
  stageId: number
  kod: string
  siraNo: number
  baslangic: string | null
  bitis: string | null
}

export type PlanSonucu = {
  pencereler: AsamaPencere[]
  /** Zincir bugünden önce başlamak zorunda kaldıysa false */
  yetisiyor: boolean
  /** Kapasitesi tanımsız olduğu için tarihi elle girilecek aşamalar */
  elleTarihGereken: string[]
}

/** 'YYYY-MM-DD' + gün. Date nesnesi DÖNDÜRMEZ: bu projede DATE'in
    Date'e dönüşmesi daha önce arayüzü çökertti, metin kalması güvenli. */
export function gunEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split('-').map(Number)
  const d = new Date(Date.UTC(y, a - 1, g))
  d.setUTCDate(d.getUTCDate() + gun)
  return d.toISOString().slice(0, 10)
}

/**
 * Zinciri TESLİM TARİHİNDEN GERİYE kurar (tasarım K8).
 *
 * Son aşama teslim tarihinde biter, her aşama bir öncekinin
 * başlangıcından bir gün önce biter. En sıkı yerleşim üretilir;
 * aralara boşluk elle açılır (yıkamada sıra beklemek gibi).
 *
 * Zincir bugünden öncesine düşerse plan YİNE kurulur, sadece
 * yetisiyor=false olur. Sessizce bugüne kaydırmak, yetişmediğini
 * gizlemek olurdu.
 *
 * Süresi bilinmeyen aşama pencere almaz ve elleTarihGereken'e düşer;
 * zincirin kalanı sanki o aşama sıfır gün sürüyormuş gibi devam eder.
 */
export function geriyePlanla(
  teslimTarihi: string,
  asamalar: AsamaGirdi[],
  bugun: string,
): PlanSonucu {
  const sirali = [...asamalar].sort((a, b) => b.siraNo - a.siraNo)  // sondan başa
  const pencereler: AsamaPencere[] = []
  const elleTarihGereken: string[] = []

  let imlec = teslimTarihi   // bu tarihte veya öncesinde bitmeli

  for (const a of sirali) {
    if (a.gun === null) {
      elleTarihGereken.push(a.kod)
      pencereler.push({ stageId: a.stageId, kod: a.kod, siraNo: a.siraNo, baslangic: null, bitis: null })
      continue
    }
    const bitis = imlec
    const baslangic = gunEkle(bitis, -(a.gun - 1))
    pencereler.push({ stageId: a.stageId, kod: a.kod, siraNo: a.siraNo, baslangic, bitis })
    imlec = gunEkle(baslangic, -1)   // bir önceki aşama bundan önce bitmeli
  }

  pencereler.sort((a, b) => a.siraNo - b.siraNo)

  const ilkBaslangic = pencereler.find(p => p.baslangic !== null)?.baslangic ?? null
  const yetisiyor = ilkBaslangic === null ? true : ilkBaslangic >= bugun

  return { pencereler, yetisiyor, elleTarihGereken }
}
