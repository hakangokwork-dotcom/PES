/**
 * Planlama tezgâhı — saf hesap katmanı.
 *
 * Planlamacının sanal alanı: iş emirlerini bantlara sürükleyip bırakır,
 * sonucu görür, beğenirse gönderir. Bu dosya veritabanı bilmez.
 *
 * BİTİŞ TARİHİ SAKLANMAZ, TÜRETİLİR. Kaynak bant-doluluk.ts'in
 * planBitisi()'dir; bandın günlük hedefi değişince ya da araya tatil
 * girince kendiliğinden güncellenir. Saklansaydı sessizce eskirdi.
 *
 * TASLAK GERÇEK KAPASİTE TÜKETMEZ. Atölye taslağı görmez ve taslak
 * onun takvimini doldurmaz — sanal alanın anlamı bu. Ama planlamacı
 * KENDİ taslağının kapladığı yeri görmek zorunda, yoksa plan yapamaz;
 * bu yüzden tezgâh içinde ayrı bir doluluk katmanı hesaplanır.
 */
import { gunEkle } from './yerlestirme'
import { gunlukPlan, planBitisi, type HesapBaglami } from './bant-doluluk'

export type TaslakKalem = {
  id: number
  workOrderId: number
  workshopId: number
  lineId: number
  baslangic: string
  adet: number
}

export type KalemPlani = TaslakKalem & {
  /** Kapasiteden türetilen bitiş. */
  bitis: string
  /** Gün gün dağılım. */
  gunler: Array<{ tarih: string; adet: number }>
  /** Adet planlanan pencereye sığmadıysa true (200 iş günü sınırı). */
  sigmadi: boolean
}

/** Bir kalemin kapasiteye göre planı. */
export function kalemPlani(k: TaslakKalem, ctx: HesapBaglami): KalemPlani {
  const atama = {
    atamaId: k.id, lineId: k.lineId, adet: k.adet,
    planBaslangic: k.baslangic, elleplan: {},
  }
  const gunler = gunlukPlan(atama, ctx)
  const yerlesen = gunler.reduce((t, g) => t + g.adet, 0)
  return {
    ...k,
    bitis: planBitisi(atama, ctx),
    gunler: gunler.map((g) => ({ tarih: g.tarih, adet: g.adet })),
    /* Kapasitesi olmayan bir banda bırakılırsa gunlukPlan boş döner ve
       adet hiç yerleşmez. Sessiz kalmak, planlamacıya "yerleşti" demektir. */
    sigmadi: yerlesen < k.adet,
  }
}

export type Cakisma = {
  lineId: number
  tarih: string
  /** O gün o banda düşen toplam adet. */
  toplam: number
  /** Bandın o günkü kapasitesi. */
  kapasite: number
  kalemIdler: number[]
}

/**
 * Aynı bantta aynı gün kapasiteyi aşan yerleştirmeler.
 *
 * ÇAKIŞMA ENGELLENMEZ, GÖSTERİLİR. Planlamacı bilerek üst üste
 * koyabilmeli (mesai düşünüyor olabilir); tezgâhın işi karar vermek
 * değil, sonucu görünür kılmak. Engelleyen bir tezgâh, planlamacıyı
 * yine Excel'e iter.
 */
export function cakismalar(
  planlar: KalemPlani[],
  kapasite: (lineId: number, tarih: string) => number,
): Cakisma[] {
  /* lineId → tarih → { toplam, kalemIdler } */
  const harita = new Map<string, { lineId: number; tarih: string; toplam: number; ids: number[] }>()

  for (const p of planlar) {
    for (const g of p.gunler) {
      const anahtar = `${p.lineId}|${g.tarih}`
      const mevcut = harita.get(anahtar)
      if (mevcut) {
        mevcut.toplam += g.adet
        mevcut.ids.push(p.id)
      } else {
        harita.set(anahtar, { lineId: p.lineId, tarih: g.tarih, toplam: g.adet, ids: [p.id] })
      }
    }
  }

  const cikti: Cakisma[] = []
  for (const v of harita.values()) {
    const kap = kapasite(v.lineId, v.tarih)
    if (v.toplam > kap) {
      cikti.push({
        lineId: v.lineId, tarih: v.tarih,
        toplam: v.toplam, kapasite: kap,
        kalemIdler: [...new Set(v.ids)].sort((a, b) => a - b),
      })
    }
  }
  return cikti.sort((a, b) => a.tarih.localeCompare(b.tarih) || a.lineId - b.lineId)
}

/** Tezgâh ızgarası için: lineId → tarih → adet. */
export function tezgahDolulugu(planlar: KalemPlani[]): Record<number, Record<string, number>> {
  const cikti: Record<number, Record<string, number>> = {}
  for (const p of planlar) {
    cikti[p.lineId] ??= {}
    for (const g of p.gunler) {
      cikti[p.lineId][g.tarih] = (cikti[p.lineId][g.tarih] ?? 0) + g.adet
    }
  }
  return cikti
}

export type ZamanCitiUyarisi = {
  kalemId: number
  workOrderId: number
  baslangic: string
  /** Bugüne kaç gün kaldı (negatif = geçmişte). */
  kalanGun: number
}

/**
 * Zaman çiti uyarısı.
 *
 * Kullanıcı kararı (2026-09-25): çit ENGELLEMEZ, yalnız UYARIR.
 * MRP'nin planning time fence'i normalde donduruyor; burada yumuşak
 * tutuldu çünkü atölye onayı henüz devrede değil (2. tur). Uyarı,
 * "bu iş 3 gün sonra başlıyor, atölye hazırlanmış olabilir" demek.
 *
 * Geçmişte başlayan kalem de uyarır — negatif kalan gün, planlamacının
 * fark etmeden geriye yerleştirdiği anlamına gelir.
 */
export function zamanCitiUyarilari(
  planlar: KalemPlani[],
  bugun: string,
  citGun: number,
): ZamanCitiUyarisi[] {
  return planlar
    .map((p) => ({
      kalemId: p.id,
      workOrderId: p.workOrderId,
      baslangic: p.baslangic,
      kalanGun: gunFarki(bugun, p.baslangic),
    }))
    .filter((u) => u.kalanGun < citGun)
    .sort((a, b) => a.kalanGun - b.kalanGun)
}

/** b − a, gün. Saat dilimi taşımaz; tarihler 'YYYY-MM-DD'. */
export function gunFarki(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((t(b) - t(a)) / 86_400_000)
}

/** Izgara başlıkları: baslangic'tan itibaren gunSayisi günlük dizi. */
export function gunAraligi(baslangic: string, gunSayisi: number): string[] {
  const cikti: string[] = []
  let t = baslangic
  for (let i = 0; i < gunSayisi; i++) {
    cikti.push(t)
    t = gunEkle(t, 1)
  }
  return cikti
}
