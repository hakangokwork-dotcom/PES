/**
 * Bülten operasyonlarını KESİM / DİKİM / UKP bölümlerine eşler.
 *
 * NEDEN İKİ KOLONA BAKIYOR: aşama adı tek başına yetmiyor. Örnek dosyada
 * "Son İşlem" karışık — paça kıvırma (36 sn, düz dikiş) ve dört punteriz
 * gerçek dikim; iplik temizleme, son ütü, perçin ve paket UKP. Yalnız
 * aşamaya bakılırsa 104 saniye (sürenin %7,6'sı) yanlış bölüme yazılıyor.
 *
 * Bugün üç bölümün dakika maliyeti eşit olduğu için toplam fiyat
 * değişmiyor; ama KAPASİTE PAYI yalnız DİKİM dakikasına baktığı için onu
 * bugün de değiştiriyor, ve bölüm maaş ağırlıkları ayrıştığı gün fiyatı da
 * değiştirecek. economy_param bu ayrışmaya hazır.
 *
 * Kurallar veritabanında (bulten_bolum_kurali) ve düzenlenebilir;
 * buradaki tohum set ilk yüklemede yazılır.
 */

export type Bolum = 'KESIM' | 'DIKIM' | 'UKP'

export type BolumKurali = {
  /** Küçük olan önce uygulanır; ilk eşleşen kazanır. */
  oncelik: number
  /** null = herhangi bir aşama. Birebir eşleşme. */
  seviye1: string | null
  /** null = herhangi bir tip. Birebir eşleşme. */
  tip: string | null
  bolum: Bolum
}

export type BultenSatiri = {
  sira_no: number
  seviye1: string | null
  seviye2: string | null
  seviye3: string | null
  cevrim_sn: number
  tip: string | null
  makine_kodu: string | null
  oncesi: string | null
  /** Elle ezilmişse dolu; kural uygulanmaz. */
  bolum?: Bolum
  bolum_kaynak?: 'kural' | 'elle'
}

/** Dikiş makinesi sayılan tipler — aşama ne olursa olsun DİKİM. */
const DIKIS_TIPLERI = [
  'Düz Dikiş', 'Overlok', 'Punteriz', 'Çift İğne',
  'Zincir (FOA)', 'Zincir Dikiş', 'Kemer (Kansai)',
]

/** Kesim sayılan tipler. */
const KESIM_TIPLERI = ['Serme', 'Kesim']

export const TOHUM_KURALLAR: BolumKurali[] = [
  { oncelik: 10, seviye1: 'Kesim', tip: null, bolum: 'KESIM' },
  ...KESIM_TIPLERI.map((tip, i) => ({ oncelik: 20 + i, seviye1: null, tip, bolum: 'KESIM' as Bolum })),
  ...DIKIS_TIPLERI.map((tip, i) => ({ oncelik: 30 + i, seviye1: null, tip, bolum: 'DIKIM' as Bolum })),
  { oncelik: 40, seviye1: 'Son İşlem', tip: null, bolum: 'UKP' },
  // Tanınmayan operasyon en olası yere düşer. "Eşleşmedi" bırakmak
  // süreyi hiçbir bölüme yazmaz ve fiyat SESSİZCE eksik çıkar; import
  // raporu kaç satırın bu kurala düştüğünü söyler.
  { oncelik: 99, seviye1: null, tip: null, bolum: 'DIKIM' },
]

/** Satırın bölümü. Elle ezilmişse o kullanılır, yoksa ilk eşleşen kural. */
export function bolumBul(satir: BultenSatiri, kurallar: BolumKurali[]): Bolum {
  if (satir.bolum_kaynak === 'elle' && satir.bolum) return satir.bolum
  const sirali = [...kurallar].sort((a, b) => a.oncelik - b.oncelik)
  for (const k of sirali) {
    if (k.seviye1 !== null && k.seviye1 !== satir.seviye1) continue
    if (k.tip !== null && k.tip !== satir.tip) continue
    return k.bolum
  }
  return 'DIKIM'
}

/** Kaçıncı kuralın uygulandığı — import raporu son kurala düşenleri sayar. */
export function uygulananKural(satir: BultenSatiri, kurallar: BolumKurali[]): BolumKurali | null {
  if (satir.bolum_kaynak === 'elle') return null
  const sirali = [...kurallar].sort((a, b) => a.oncelik - b.oncelik)
  for (const k of sirali) {
    if (k.seviye1 !== null && k.seviye1 !== satir.seviye1) continue
    if (k.tip !== null && k.tip !== satir.tip) continue
    return k
  }
  return null
}

export type BolumToplami = Record<Bolum, number>

/** Bölüm başına toplam saniye. */
export function bolumToplamlari(
  satirlar: BultenSatiri[], kurallar: BolumKurali[],
): BolumToplami {
  const t: BolumToplami = { KESIM: 0, DIKIM: 0, UKP: 0 }
  for (const s of satirlar) t[bolumBul(s, kurallar)] += s.cevrim_sn
  return t
}
