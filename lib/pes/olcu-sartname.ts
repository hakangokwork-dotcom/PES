// lib/pes/olcu-sartname.ts
/* Ölçü şartnamesi — sunucu ve istemcinin ortak saf hesapları.
   Kabul aralığı veritabanında saklanmaz (hedef nominaldir, aralık ortası
   hedef olmaz); ekran ve görünüm bu formülle hesaplar. */

export type YapistirSatiri = {
  kod: string; ad: string; musteri_adi: string
  nominal: number; tol_eksi: number; tol_arti: number
}
export type YapistirSonucu = { satirlar: YapistirSatiri[]; hatalar: string[] }

const yuvarla = (n: number) => Math.round(n * 100) / 100

export function kabulAraligi(nominal: number, tolEksi: number, tolArti: number): { alt: number; ust: number } {
  return { alt: yuvarla(nominal - tolEksi), ust: yuvarla(nominal + tolArti) }
}

const sayi = (s: string) => Number(s.trim().replace(/\s/g, '').replace(',', '.'))

/** Excel'den kopyalanan tablo: ölçü \t nominal \t "−1,50 / +1,00" [\t "41,50–44,00"].
 *  Nominali sayı olmayan satır (başlık) sessizce atlanır. */
export function sartnameYapistir(metin: string): YapistirSonucu {
  const satirlar: YapistirSatiri[] = []
  const hatalar: string[] = []
  metin.split(/\r?\n/).forEach((ham, i) => {
    if (!ham.trim()) return
    const h = ham.split('\t')
    const no = i + 1
    if (h.length < 3) { hatalar.push(`Satır ${no}: en az 3 sütun gerekli (ölçü, nominal, tolerans)`); return }
    const nominal = sayi(h[1])
    if (!Number.isFinite(nominal)) return
    const tol = h[2].match(/[−–-]\s*([\d.,]+)\s*\/\s*\+\s*([\d.,]+)/)
    if (!tol) { hatalar.push(`Satır ${no}: tolerans "−a / +b" biçiminde olmalı`); return }
    const tol_eksi = sayi(tol[1]), tol_arti = sayi(tol[2])
    const musteri_adi = h[0].trim()
    const ad = musteri_adi.includes(' / ') ? musteri_adi.split(' / ').slice(1).join(' / ').trim() : musteri_adi
    if (h[3]?.trim()) {
      const a = h[3].match(/([\d.,]+)\s*[–—-]\s*([\d.,]+)/)
      const k = kabulAraligi(nominal, tol_eksi, tol_arti)
      if (a && (Math.abs(sayi(a[1]) - k.alt) > 0.005 || Math.abs(sayi(a[2]) - k.ust) > 0.005)) {
        hatalar.push(`Satır ${no}: kabul aralığı ${h[3].trim()} nominal ve toleransla uyuşmuyor (${k.alt}–${k.ust})`)
      }
    }
    satirlar.push({ kod: `P${String(satirlar.length + 1).padStart(2, '0')}`, ad, musteri_adi, nominal, tol_eksi, tol_arti })
  })
  return { satirlar, hatalar }
}

/** Izgaraya eklenecek yeni ölçü noktasının kodu: mevcut en büyük P numarası + 1 (silinen satır numara çakıştırmasın). */
export function sonrakiKod(kodlar: string[]): string {
  const max = kodlar.reduce((m, k) => Math.max(m, Number(/^P(\d+)$/.exec(k.trim())?.[1] ?? 0)), 0)
  return `P${String(max + 1).padStart(2, '0')}`
}

/** YYYY-AA-GG ve takvimde gerçekten var olan gün (2026-02-30 değil). */
export function gercekTarih(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/* Ekran etiketleri — merkez şartname ekranı ve atölye süreç adımı ortak kullanır. */
export const DURUM_TONU: Record<string, 'neutral' | 'good' | 'warn' | 'bad'> = {
  'Önerilen': 'warn', 'Müşteri onaylı': 'good', 'Geçersiz': 'neutral',
}
export const ASAMA_ETIKET: Record<string, string> = { FINAL: 'Final (bitmiş ürün)', YIKAMA_ONCESI: 'Yıkama öncesi' }
