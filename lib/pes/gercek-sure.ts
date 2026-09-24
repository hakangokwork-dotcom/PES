/**
 * Üretimden gerçek süre türetme.
 *
 *   dk/adet = (dikim kişi × saat × 60) ÷ günlük adet
 *
 * Bu bir BANT ORTALAMASIDIR: duruş, model değişimi ve fire içindedir.
 * Teorik süreden farklı çıkması normaldir; farkın kendisi bilgidir.
 *
 * KARIŞIK GÜNLER HESABA GİRMEZ. Bir bant aynı gün birden fazla iş emri
 * işliyorsa o günün dakikası iş emirleri arasında paylaştırılamaz —
 * paylaştırma uydurmak olurdu ve uydurulmuş bir dakika fiyat
 * pazarlığında yanlış tarafa çeker. Atlanan gün sayılır ve gösterilir.
 */

export type Kadro = { sewingStaff: number | null; hoursPerDay: number | null }

export type UretimGunu = {
  tarih: string
  workOrderId: number
  adet: number
  /** O gün o bantta üretim kaydı olan farklı iş emri sayısı. */
  bantIsEmriSayisi: number
}

/** Tek günün dakika/adet değeri. Adet ya da kadro yoksa null. */
export function gunlukDakikaAdet(adet: number, kadro: Kadro): number | null {
  if (kadro.sewingStaff === null || kadro.hoursPerDay === null) return null
  if (adet <= 0) return null
  return (kadro.sewingStaff * kadro.hoursPerDay * 60) / adet
}

export type TuretmeSonucu = {
  dkAdet: number | null
  gunSayisi: number
  atlananGun: number
}

export function sureTuret(gunler: UretimGunu[], kadro: Kadro): TuretmeSonucu {
  const degerler: number[] = []
  let atlanan = 0
  for (const g of gunler) {
    if (g.bantIsEmriSayisi > 1) { atlanan++; continue }
    const d = gunlukDakikaAdet(g.adet, kadro)
    if (d === null) { atlanan++; continue }
    degerler.push(d)
  }
  if (degerler.length === 0) return { dkAdet: null, gunSayisi: 0, atlananGun: atlanan }
  const ort = degerler.reduce((a, b) => a + b, 0) / degerler.length
  return { dkAdet: ort, gunSayisi: degerler.length, atlananGun: atlanan }
}
