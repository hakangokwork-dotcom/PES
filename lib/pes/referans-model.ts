/**
 * Referans model — MTM kütüphanesinden ürün tipi başına "tipik model"
 * süresi ve bölgesel referans fiyatı.
 *
 * NEDEN AYRI BİR HESAP: MTM kütüphanesinde model yok. ref_operasyon_zamani
 * bir ürün tipinin altında her parçanın BÜTÜN alternatiflerini yan yana
 * tutar; hepsini toplamak anlamsızdır (mont 28.557 sn çıkar). Referans
 * model, parçaların görülme sıklığıyla ağırlıklanarak KURULUR
 * (bkz. bolgeSureleri).
 *
 * NEDEN HAM DOSYA: ref_operasyon_zamani aynı anahtarın ölçümlerini medyanla
 * birleştirmiş ve 3.805 tam tekrar satırı atmıştır. Bu iki şey "bu parça kaç
 * modelde vardı" bilgisini siler — yaygın parçalar az görünür. Ham dosyada
 * bir modelin bir parçası ardışık satırlardır; her ardışık blok bir
 * GÖRÜNÜM'dür. Görünüm sayısı parçanın yaygınlığını, görünüm toplamlarının
 * medyanı parçanın süresini verir.
 *
 * KESİM VE UKP: MTM'de yoktur (yalnız dikim hattı + ara ütü). Atölyelerin
 * personel dağılımından tahmin edilir; ekranda "tahmini" diye ayrı durur.
 *
 * KURAL: hesaplanamayan alan null döner, 0 değil (E0'ın kuralı).
 */

/** Ham dosyanın bir satırı (HİYERARŞİ sayfası). */
export type HamSatir = {
  klasman: string
  bolge: string
  ekParca: string
  operasyon: string
  mtm: number
}

/** Bir modelde bir parçanın bir kez geçişi. */
export type Gorunum = {
  klasman: string
  bolge: string
  ekParca: string
  sn: number
  opSayisi: number
}

/** (klasman, bölge, ek parça) başına toplulaştırılmış süre. */
export type ParcaSure = {
  klasman: string
  bolge: string
  ekParca: string
  gorulme: number
  snMedyan: number
  snMin: number
  snMax: number
  opSayisi: number
}

/** Adlardaki boşluk ve bilinen yazım farkları. Kütüphane importuyla aynı düzeltmeler. */
export function adNormalize(s: string): string {
  return String(s ?? '')
    .replace(/[\t ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/BASİC/g, 'BASIC')
}

/**
 * Ek parça adının "base"i: parantezli özellikler atılır.
 * "Kol Takma (Çimalı)" → "Kol Takma". Aynı işin varyantları tek base altında
 * sayılır; yoksa "Kol Takma" 7 + "Kol Takma (Çimalı)" 8 ayrı ayrı eşiğin
 * altında kalır ve gömleğin kolu reçeteye girmez.
 */
export function baseAd(ekParca: string): string {
  const b = ekParca.replace(/\(.*$/, '').trim()
  return b || ekParca
}

export function medyan(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Ardışık satırları görünümlere böler. Anahtar (klasman, bölge, ek parça)
 * değiştiğinde yeni görünüm başlar.
 *
 * Görünüm içindeki TAM tekrar (aynı operasyon, aynı MTM) bir kez sayılır:
 * kaynak dokümandaki 3.805 tam tekrar temizliğiyle aynı gerekçe, ama
 * görünüm içinde — farklı modellerdeki aynı değer atılmaz.
 * MTM ≤ 0 satırlar atlanır (kaynak dokümandaki 284 sıfır kaydı).
 */
export function gorunumleriCikar(satirlar: HamSatir[]): { gorunumler: Gorunum[]; atlanan: number } {
  const gorunumler: Gorunum[] = []
  let atlanan = 0
  let cur: (Gorunum & { gorulen: Set<string> }) | null = null
  let oncekiAnahtar = ''
  for (const s of satirlar) {
    const klasman = adNormalize(s.klasman)
    const bolge = adNormalize(s.bolge)
    const ekParca = adNormalize(s.ekParca)
    const anahtar = `${klasman}|${bolge}|${ekParca}`
    // Sıfır/boş satır bloğu BÖLMEZ: aynı parçanın iki yarısı ayrı görünüm sayılmasın.
    if (!(Number.isFinite(s.mtm) && s.mtm > 0) || !klasman || !ekParca) { atlanan++; continue }
    if (!cur || anahtar !== oncekiAnahtar) {
      if (cur) gorunumler.push(sade(cur))
      cur = { klasman, bolge, ekParca, sn: 0, opSayisi: 0, gorulen: new Set() }
      oncekiAnahtar = anahtar
    }
    const opAnahtar = `${adNormalize(s.operasyon)}|${s.mtm}`
    if (cur.gorulen.has(opAnahtar)) { atlanan++; continue }
    cur.gorulen.add(opAnahtar)
    cur.sn += s.mtm
    cur.opSayisi++
  }
  if (cur) gorunumler.push(sade(cur))
  return { gorunumler, atlanan }
}

function sade(g: Gorunum & { gorulen: Set<string> }): Gorunum {
  return { klasman: g.klasman, bolge: g.bolge, ekParca: g.ekParca, sn: g.sn, opSayisi: g.opSayisi }
}

export function parcaSureleri(gorunumler: Gorunum[]): ParcaSure[] {
  const gruplar = new Map<string, Gorunum[]>()
  for (const g of gorunumler) {
    const k = `${g.klasman}|${g.bolge}|${g.ekParca}`
    const l = gruplar.get(k)
    if (l) l.push(g)
    else gruplar.set(k, [g])
  }
  return [...gruplar.values()].map((l) => {
    const sn = l.map((g) => g.sn)
    return {
      klasman: l[0].klasman,
      bolge: l[0].bolge,
      ekParca: l[0].ekParca,
      gorulme: l.length,
      snMedyan: medyan(sn)!,
      snMin: Math.min(...sn),
      snMax: Math.max(...sn),
      opSayisi: Math.round(medyan(l.map((g) => g.opSayisi))!),
    }
  })
}

/** Hesaba giren alanlar. */
export type Aday = {
  bolge: string
  ekParca: string
  gorulme: number
  snMedyan: number
}

/**
 * Model sayısı tahmini: en yaygın parçanın (base) görünüm sayısı.
 * Varyantlar base altında toplanır; yoksa "Kol Takma" 7 + "Kol Takma
 * (Çimalı)" 8 iki ayrı az yaygın parça gibi görünür.
 */
export function modelSayisiTahmini(adaylar: Aday[]): number {
  const base = new Map<string, number>()
  for (const a of adaylar) {
    const k = `${a.bolge}|${baseAd(a.ekParca)}`
    base.set(k, (base.get(k) ?? 0) + a.gorulme)
  }
  return Math.max(0, ...base.values())
}

export type BolgeSure = {
  bolge: string
  /** Bu bölgedeki model sayısı tahmini (bölgenin en yaygın parçası). */
  modelSayisi: number
  /** Beklenen süre, saniye. */
  sn: number
  parcaSayisi: number
}

/**
 * ORTALAMA MODEL — bölge bazlı beklenen süre.
 *
 * Gerçek modeller geri kurulamıyor (ham dosyadaki bloklar model değil, model
 * parçası). Bir modelin süresinin BEKLENEN değeri ise kurulabilir:
 *   bölge süresi = Σ parça  min(1, görülme ÷ N_bölge) × medyan süre
 * N_bölge o bölgenin en yaygın parçasının görülmesidir — "yakası olan her
 * gömlekte bir yaka vardır". Birbirinin alternatifi olan parçalar (Gömlek
 * Yaka / Ayaksız Gömlek Yaka) görülme oranında ağırlıklanır; eşik yöntemi
 * gibi ikisini birden almaz ya da ikisini birden düşürmez.
 *
 * Neden bölge bazlı N, ürün bazlı değil: ürün geneli N en parçalı bölgeden
 * gelir ve diğer bölgeleri seyreltir. Jean pantolonda ürün geneli N ile
 * 682 sn, bölge bazlı N ile 1.019 sn çıkıyor; gerçek bülten 1.241 sn.
 *
 * Varsayım: modelin her bölgesi vardır. Seyrek bölge (gömlekte "Bel",
 * N=3) tam sayılır — referansı hafifçe yukarı çeker; ekranda bölge
 * kırılımı ve N'i görünür.
 */
export function bolgeSureleri(adaylar: Aday[]): BolgeSure[] {
  const bolgeler = new Map<string, Aday[]>()
  for (const a of adaylar) {
    const l = bolgeler.get(a.bolge)
    if (l) l.push(a)
    else bolgeler.set(a.bolge, [a])
  }
  return [...bolgeler.entries()].map(([bolge, l]) => {
    const n = modelSayisiTahmini(l)
    const sn = n === 0 ? 0 : l.reduce((s, a) => s + Math.min(1, a.gorulme / n) * a.snMedyan, 0)
    return { bolge, modelSayisi: n, sn, parcaSayisi: l.length }
  }).sort((a, b) => b.sn - a.sn)
}

/** Referans dikim süresi: bölge sürelerinin toplamı. */
export function referansDikimSn(adaylar: Aday[]): number {
  return bolgeSureleri(adaylar).reduce((s, b) => s + b.sn, 0)
}

export type OranParam = {
  /** Kesim personeli ÷ dikim personeli (atölye beyanı). */
  ref_kesim_personel_orani: number
  /** UKP personeli ÷ dikim personeli. */
  ref_ukp_personel_orani: number
  eff_cutting: number
  eff_sewing: number
  eff_ukp: number
}

export type BolumSure = { kesimSn: number | null; dikimSn: number; ukpSn: number | null }

/**
 * Dikim saniyesinden kesim ve UKP saniyesi.
 *
 * Dengeli akışta bir bölümün adet başına GERÇEK dakikası personel payıyla
 * orantılıdır. Standart süre = gerçek × verimlilik, dolayısıyla
 *   kesim_std ÷ dikim_std = (kesim kişi ÷ dikim kişi) × (eff_kesim ÷ eff_dikim).
 */
export function bolumSureleri(dikimSn: number, p: OranParam): BolumSure {
  const oran = (personel: number, eff: number) =>
    p.eff_sewing > 0 && Number.isFinite(personel) && personel >= 0 ? dikimSn * personel * (eff / p.eff_sewing) : null
  return {
    kesimSn: oran(p.ref_kesim_personel_orani, p.eff_cutting),
    dikimSn,
    ukpSn: oran(p.ref_ukp_personel_orani, p.eff_ukp),
  }
}

export type ReferansFiyat = {
  kesimTl: number | null
  dikimTl: number | null
  ukpTl: number | null
  toplamTl: number | null
}

/**
 * Standart dakika × bölgesel 3D dakika maliyeti. Verimlilik düzeltmesi YOK:
 * FORMULLER!E51'e göre 3D değeri verimlilik kaybını zaten içerir
 * (model-fiyat.ts referans3D ile aynı kural). Marj eklenmez — 3D bir
 * piyasa referansıdır.
 */
export function referansFiyat(s: BolumSure, dkMaliyet3D: number | null): ReferansFiyat {
  const tl = (sn: number | null) => (sn === null || dkMaliyet3D === null ? null : (sn / 60) * dkMaliyet3D)
  const kesimTl = tl(s.kesimSn)
  const dikimTl = tl(s.dikimSn)
  const ukpTl = tl(s.ukpSn)
  const toplamTl = kesimTl === null || dikimTl === null || ukpTl === null ? null : kesimTl + dikimTl + ukpTl
  return { kesimTl, dikimTl, ukpTl, toplamTl }
}

export type Guven = 'YUKSEK' | 'ORTA' | 'DUSUK' | 'ZAYIF'

/** Referansın kaç modelden türetildiğine göre. */
export function guvenEtiketi(modelSayisi: number): Guven {
  if (modelSayisi >= 8) return 'YUKSEK'
  if (modelSayisi >= 4) return 'ORTA'
  if (modelSayisi >= 2) return 'DUSUK'
  return 'ZAYIF'
}
