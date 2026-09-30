/**
 * VSIM için referans süreç — PES MTM kütüphanesinden bir ürün tipinin
 * "tipik modelini" VSIM'in akış verisine (mainOps/subOps) çevirir.
 *
 * Seçim, referans modeldeki mantıkla aynıdır (lib/pes/referans-model.ts):
 * bir bölgenin model sayısı N = en yaygın parçanın (base ad) görülmesi.
 * Bir parça (base) N'in en az `esik` oranı kadar modelde görüldüyse tipik
 * modele girer; varyantlarından en sık görüleni seçilir. Adımlar, o varyantın
 * ref_operasyon_zamani'deki gerçek operasyonlarıdır (MTM saniye, makine türü);
 * operasyonu bulunamayan parça tek adım olarak medyan süresiyle girer.
 *
 * Akış: her bölge bir parça hattıdır (Ön Beden, Kol, Yaka…); hepsi sonda
 * bir "Birleştirme" grubunda buluşur. Bölge içinde parçalar sırayla, parça
 * içinde operasyonlar sırayla bağlanır. Bu SIRA kütüphanede yok — başlangıç
 * önerisidir; atölye kendi sırasına göre düzenler.
 *
 * Saf fonksiyon; veritabanı sorgusu API rotasında.
 */
import { baseAd, modelSayisiTahmini } from './referans-model'

export type RefParca = { bolge: string; ekParca: string; varyantId: number | null; gorulme: number; snMedyan: number }
export type RefOperasyon = { varyantId: number; ad: string; makine: string | null; mtm: number; sira: number }

export const BOLGE_SIRASI = ['Ön Beden', 'Arka Beden', 'Kol', 'Yaka', 'Cep', 'Bel', 'Etek', 'Paça', 'Panel', 'Uzun Kenar']
const RENKLER = ['#1f5fae', '#0f766e', '#c2410c', '#7a4fb0', '#b7791f', '#be185d', '#4d7c0f', '#0e7490', '#6d28d9', '#475569']

/** Kütüphanedeki makine türü → VSIM operasyon türü (makine sembolü buradan seçilir). */
export function opTuru(makine: string | null, ad: string): string {
  const m = (makine || '').toLocaleLowerCase('tr')
  const a = (ad || '').toLocaleLowerCase('tr')
  if (m.includes('overlok')) return 'OVERLOK'
  if (m.includes('reçme')) return 'REÇME'
  if (m.includes('punteriz')) return 'PUNTEREZ'
  if (m.includes('otomat') || m.includes('ams')) return 'OTOMAT'
  if (m.includes('ütü') || m.includes('pres') || /ütü/.test(a)) return 'ÜTÜ'
  if (m.includes('kesim')) return 'KESİM'
  if (m.includes('el işi') || m.includes('fason')) return 'DESTEK'
  return 'DİKİM'
}

export type VsimSurec = {
  mainOps: Array<{ id: string; name: string; color: string; order: number; nextIds: string[]; x: number; y: number; joinType?: string }>
  subOps: Array<{ id: string; mainOpId: string; name: string; type: string; cycleTime: number; nextIds: string[]; machineId: null; operatorId: null; stationCount: number }>
  ozet: { adimSayisi: number; toplamSn: number; bolgeler: Array<{ bolge: string; parca: number; adim: number; sn: number }> }
}

export function referansSureci(parcalar: RefParca[], operasyonlar: RefOperasyon[], opts: { esik?: number } = {}): VsimSurec {
  const esik = opts.esik ?? 0.5
  const opsByVar = new Map<number, RefOperasyon[]>()
  for (const o of operasyonlar) {
    const l = opsByVar.get(o.varyantId)
    if (l) l.push(o)
    else opsByVar.set(o.varyantId, [o])
  }
  for (const l of opsByVar.values()) l.sort((a, b) => a.sira - b.sira)

  const byBolge = new Map<string, RefParca[]>()
  for (const p of parcalar) {
    const l = byBolge.get(p.bolge)
    if (l) l.push(p)
    else byBolge.set(p.bolge, [p])
  }
  const bolgeler = [...byBolge.keys()].sort((a, b) => {
    const ia = BOLGE_SIRASI.indexOf(a), ib = BOLGE_SIRASI.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'tr')
  })

  const mainOps: VsimSurec['mainOps'] = []
  const subOps: VsimSurec['subOps'] = []
  const ozet: VsimSurec['ozet'] = { adimSayisi: 0, toplamSn: 0, bolgeler: [] }
  let n = 0
  const sid = () => `r${++n}`

  bolgeler.forEach((bolge, bi) => {
    const liste = byBolge.get(bolge)!
    const N = modelSayisiTahmini(liste.map(p => ({ bolge, ekParca: p.ekParca, gorulme: p.gorulme, snMedyan: p.snMedyan })))
    if (N === 0) return
    // base başına: toplam görülme ve en sık varyant; ilk görülme sırası korunur
    const bases = new Map<string, { toplam: number; enIyi: RefParca }>()
    for (const p of liste) {
      const k = baseAd(p.ekParca)
      const b = bases.get(k)
      if (!b) bases.set(k, { toplam: p.gorulme, enIyi: p })
      else { b.toplam += p.gorulme; if (p.gorulme > b.enIyi.gorulme) b.enIyi = p }
    }
    const secilen = [...bases.values()].filter(b => b.toplam / N >= esik).map(b => b.enIyi)
    if (secilen.length === 0) return

    const gid = `g${bi + 1}`
    const adimlar: VsimSurec['subOps'] = []
    for (const p of secilen) {
      const ops = p.varyantId != null ? opsByVar.get(p.varyantId) || [] : []
      if (ops.length) {
        for (const o of ops) adimlar.push({ id: sid(), mainOpId: gid, name: o.ad, type: opTuru(o.makine, o.ad), cycleTime: Math.max(1, Math.round(o.mtm * 10) / 10), nextIds: [], machineId: null, operatorId: null, stationCount: 1 })
      } else {
        adimlar.push({ id: sid(), mainOpId: gid, name: p.ekParca, type: opTuru(null, p.ekParca), cycleTime: Math.max(1, Math.round(p.snMedyan * 10) / 10), nextIds: [], machineId: null, operatorId: null, stationCount: 1 })
      }
    }
    for (let i = 0; i < adimlar.length - 1; i++) adimlar[i].nextIds = [adimlar[i + 1].id]
    subOps.push(...adimlar)
    const sn = adimlar.reduce((a, s) => a + s.cycleTime, 0)
    mainOps.push({ id: gid, name: bolge, color: RENKLER[bi % RENKLER.length], order: mainOps.length, nextIds: [], x: 60, y: 60 + mainOps.length * 140 })
    ozet.bolgeler.push({ bolge, parca: secilen.length, adim: adimlar.length, sn: Math.round(sn * 10) / 10 })
    ozet.adimSayisi += adimlar.length
    ozet.toplamSn += sn
  })

  if (mainOps.length) {
    // bütün parça hatları sonda birleşir (kit mantığı: her hattan bir parça)
    const son = { id: 'g_son', name: 'Birleştirme', color: '#334155', order: mainOps.length, nextIds: [] as string[], x: 360, y: 60, joinType: 'AND' }
    for (const m of mainOps) m.nextIds = [son.id]
    mainOps.push(son)
    subOps.push({ id: sid(), mainOpId: son.id, name: 'Birleştirme / son kontrol (tahmini — düzenle)', type: 'KONTROL', cycleTime: 10, nextIds: [], machineId: null, operatorId: null, stationCount: 1 })
    ozet.adimSayisi += 1
    ozet.toplamSn += 10
  }
  ozet.toplamSn = Math.round(ozet.toplamSn * 10) / 10
  return { mainOps, subOps, ozet }
}
