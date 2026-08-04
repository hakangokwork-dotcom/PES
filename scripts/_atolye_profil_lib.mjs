/**
 * "Atölye isimleri.xlsx" ortak ayrıştırma katmanı.
 *
 * İki script kullanır: import_atolye_profil.mjs (ilk yükleme) ve
 * eslestirme_uygula.mjs (inceleme dosyasının işlenmesi). Tarih/sayı
 * çözümlemesi tek yerde durmazsa ikisi zamanla ayrışır ve aynı hücre
 * iki farklı tarihe dönüşür.
 */
import xlsx from 'xlsx'
import { readFileSync } from 'node:fs'

/* ---- Excel kolon sırası ----
 * Başlıklarda tekrar var ("ÇALIŞAN SAYISI" iki kez), o yüzden isimle
 * değil indeksle okunuyor. Kaynak dosyanın kolon sırası değişirse
 * BURASI güncellenmeli — başka hiçbir yerde indeks yok. */
export const K = {
  ad: 0, bw: 1, tkod: 2, odito: 3, unvan: 4, bant: 5, inspection: 6, calismaSekli: 7,
  aktiflik: 8, uretimTipi: 9, tedarik: 10, bolge: 11, il: 12, ilce: 13, teknikMudur: 14,
  fku: 15, subjektif: 16, aylikKapasite: 17, onUretim: 18, yetkili: 19, telefon: 20,
  eposta: 21, calisan: 22, wkysTarih: 23, wkysPuan: 24, wkysSinif: 25,
  sosyalTarih: 26, sosyalPuan: 27, sosyalSinif: 28, calisanAlt: 29, isOrtakligi: 30,
  aylikGider: 31, risk: 32, ozelNot: 33, kullanici: 34, degisiklik: 35, kapasiteTipi: 36,
}

export const bos = (v) => v === null || v === undefined || String(v).trim() === ''
export const metin = (v) => (bos(v) ? null : String(v).trim())

/** Tarih makul aralıkta mı — bozuk hücrelerin veriye sızmasını engeller. */
function gecerliTarih(d) {
  if (!(d instanceof Date) || isNaN(d)) return null
  const yil = d.getUTCFullYear()
  if (yil < 2010 || yil > 2035) return null
  return d.toISOString().slice(0, 10)
}

/** Kaynakta 5 format var: 18.9.2025 / 20.08.2025 / 12,02,2025 /
 *  45743 (Excel seri no) / 2025-08-20. Hepsi gün-önce (TR) okunur. */
export function tarihCoz(ham) {
  if (bos(ham)) return null
  const s = String(ham).trim()

  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(parseFloat(s)) * 86400000
    return gecerliTarih(new Date(ms))
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return gecerliTarih(new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])))

  const p = s.match(/^(\d{1,2})[.,/-](\d{1,2})[.,/-](\d{4})/)
  if (p) return gecerliTarih(new Date(Date.UTC(+p[3], +p[2] - 1, +p[1])))

  return null
}

/** "86,30" ve "95.3" birlikte geliyor; binlik ayracı yok. */
export function sayiCoz(ham) {
  if (bos(ham)) return null
  const s = String(ham).trim().replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export function tamsayiCoz(ham) {
  const n = sayiCoz(ham)
  return n === null ? null : Math.round(n)
}

/** SINIF kolonuna sayı sızmış satırlar var ("60,35", "86,8").
 *  Geçerli sınıf A-D; değilse sayı okunup puan adayı yapılır. */
export function sinifCoz(ham) {
  if (bos(ham)) return { sinif: null, puanAdayi: null }
  const s = String(ham).trim().toLocaleUpperCase('tr-TR')
  if (/^[ABCD][+-]?$/.test(s)) return { sinif: s, puanAdayi: null }
  const n = sayiCoz(s)
  return { sinif: null, puanAdayi: n !== null && n >= 0 && n <= 100 ? n : null }
}

export const TR = (s) => String(s || '').toLocaleUpperCase('tr-TR')
  .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
  .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/Â/g, 'A')

/** Şirket ünvanlarında herkeste geçen kelimeler — ayırt edici değil. */
const COP = new Set([
  'SAN', 'SANAYI', 'SANAYII', 'TIC', 'TICARET', 'LTD', 'STI', 'SIRKETI', 'LIMITED',
  'VE', 'AS', 'ANONIM', 'TEKS', 'TEKSTIL', 'KONFEKSIYON', 'KONF', 'INS', 'INSAAT',
  'ITH', 'IHR', 'ITHALAT', 'IHRACAT', 'NAK', 'NAKLIYAT', 'TAS', 'TASIMACILIK',
  'GIDA', 'TURIZM', 'TURIZIM', 'TURZ', 'PETROL', 'MODA', 'GIYIM', 'PAZARLAMA',
  'TASARIM', 'ORME', 'DENIM', 'TES', 'DIS', 'OTOM', 'YIK', 'YIKAMA', 'PAK',
  'PAKETLEME', 'ISLETMELERI', 'GRUP', 'TARIM', 'HAYVANCILIK',
])

export const jetonlar = (s) => [...new Set(
  TR(s).replace(/[^A-Z0-9]+/g, ' ').split(' ').filter((t) => t.length > 1 && !COP.has(t))
)]

/** Excel'i oku, her satırı çözümlenmiş kayda çevir. satirNo 1 tabanlı
 *  Excel satır numarasıdır (başlık 1, ilk veri 2) — inceleme dosyasındaki
 *  "ADAY n SATIR" ile aynı numara. */
export function kayitlariOku(dosya) {
  const wb = xlsx.readFile(dosya, { cellDates: false })
  const sayfa = wb.SheetNames[0]
  const satirlar = xlsx.utils.sheet_to_json(wb.Sheets[sayfa], {
    header: 1, raw: false, defval: null, blankrows: false,
  })
  const kayitlar = satirlar.slice(1).map((r, i) => {
    const wkysS = sinifCoz(r[K.wkysSinif])
    const sosyalS = sinifCoz(r[K.sosyalSinif])
    return {
      satirNo: i + 2,
      ham: r,
      ad: metin(r[K.ad]),
      bw: metin(r[K.bw]),
      tkod: metin(r[K.tkod]) === '0' ? null : metin(r[K.tkod]),
      odito: metin(r[K.odito]),
      unvan: metin(r[K.unvan]),
      degisiklik: sayiCoz(r[K.degisiklik]) ?? 0,
      doluluk: r.filter((v) => !bos(v)).length,
      wkys: {
        tarih: tarihCoz(r[K.wkysTarih]),
        puan: sayiCoz(r[K.wkysPuan]) ?? wkysS.puanAdayi,
        sinif: wkysS.sinif,
      },
      sosyal: {
        tarih: tarihCoz(r[K.sosyalTarih]),
        puan: sayiCoz(r[K.sosyalPuan]) ?? sosyalS.puanAdayi,
        sinif: sosyalS.sinif,
      },
      jetonAd: [...new Set([...jetonlar(r[K.ad]), ...jetonlar(r[K.bw])])],
      jetonTum: [...new Set([
        ...jetonlar(r[K.ad]), ...jetonlar(r[K.bw]),
        ...jetonlar(r[K.odito]), ...jetonlar(r[K.unvan]),
      ])],
    }
  })
  return { sayfa, kayitlar }
}

/** Excel satırından workshop_profil kolonlarına eşleme. */
export function profilAlanlari(kayit) {
  const r = kayit.ham
  return {
    t_kod: metin(r[K.tkod]),
    bw_atolye_adi: metin(r[K.bw]),
    odito_adi: metin(r[K.odito]),
    atolye_unvani: metin(r[K.unvan]),
    tedarik_mudurlugu: metin(r[K.tedarik]),
    teknik_mudur: metin(r[K.teknikMudur]),
    fku: metin(r[K.fku]),
    yetkili_kisi: metin(r[K.yetkili]),
    calisma_sekli: metin(r[K.calismaSekli]),
    uretim_tipi: metin(r[K.uretimTipi]),
    inspection: metin(r[K.inspection]),
    kapasite_tipi: metin(r[K.kapasiteTipi]),
    on_uretim_numunesi: metin(r[K.onUretim]),
    subjektif_sinif: metin(r[K.subjektif]),
    is_ortakligi_leveli: metin(r[K.isOrtakligi]),
    risk_seviyesi: metin(r[K.risk]),
    // AKTİF/PASİF bilerek yok: canlı durum workshop.is_active (029c).
    // Excel'in ham değeri staging'de duruyor; import kullanıcının
    // çevirdiği anahtarı ezmez.
    bolge_ad: metin(r[K.bolge]),
    bant_sayisi: tamsayiCoz(r[K.bant]),
    aylik_kapasite: tamsayiCoz(r[K.aylikKapasite]),
    calisan_sayisi: tamsayiCoz(r[K.calisan]),
    calisan_sayisi_alt: tamsayiCoz(r[K.calisanAlt]),
    ozel_not: metin(r[K.ozelNot]),
    kaynak_satir: kayit.satirNo,
  }
}

/** Bir veya daha çok kayıttan denetim satırları — (tip, tarih) tekil. */
export function denetimleriCikar(kayitlar) {
  const cikti = new Map()
  for (const k of kayitlar) {
    for (const [tip, d] of [['WKYS', k.wkys], ['SOSYAL', k.sosyal]]) {
      if (!d.tarih) continue
      const anahtar = `${tip}|${d.tarih}`
      const mevcut = cikti.get(anahtar)
      // aynı tarihte iki satır varsa puanı dolu olan kazanır
      if (!mevcut || (mevcut.puan === null && d.puan !== null)) {
        cikti.set(anahtar, { tip, tarih: d.tarih, puan: d.puan, sinif: d.sinif })
      }
    }
  }
  return [...cikti.values()]
}

/** .env.local okuma — scriptlerin ortak ihtiyacı. */
export function envOku(yol) {
  return Object.fromEntries(
    readFileSync(yol, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
  )
}
