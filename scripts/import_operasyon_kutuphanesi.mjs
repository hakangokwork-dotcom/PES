/**
 * Operasyon zamanı kütüphanesi → ref_* tabloları.
 *
 * Kaynak: PES/Konfeksiyon_operasyonları/konfeksiyon_veri_modeli.xlsx
 *   117 ürün tipi / 464 ek parça / 1.270 varyant / 273 grup /
 *   1.338 operasyon / 17 makine / 30.319 MTM değeri
 *
 * Kullanım:
 *   node scripts/import_operasyon_kutuphanesi.mjs
 *   node scripts/import_operasyon_kutuphanesi.mjs --uygula
 *
 * --uygula olmadan hiçbir şey yazılmaz.
 *
 * DİKKAT: dosyadaki id'ler KORUNUR (operasyon_zamani'nin dört FK'si onlara
 * dayanıyor). Yükleme sonunda diziler ileri alınır.
 */
import postgres from 'postgres'
import XLSX from 'xlsx'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))
const UYGULA = process.argv.includes('--uygula')
const arg = (ad, v = null) => {
  const i = process.argv.indexOf(`--${ad}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : v
}
const DOSYA = arg('dosya', join(__dir, '../Konfeksiyon_operasyonları/konfeksiyon_veri_modeli.xlsx'))

const { SAYFALAR, satirlariCoz, adDuzelt } = await import('tsx/esm/api').then(async ({ register }) => {
  const un = register()
  const mod = await import('../lib/pes/kutuphane-sayfa.ts')
  un()
  return mod
})

/** NOT NULL ad kolonları — boş gelirse adDuzelt yer tutucu koyar. */
const AD_KOLONU = {
  ref_urun_tipi: 'klasman_ad',
  ref_ek_parca_tipi: 'ad',
  ref_ek_parca_varyant: 'tam_ad',
  ref_operasyon_grup: 'ad',
  ref_operasyon: 'ad',
  ref_makine_tipi: 'ad',
}

/** Yabancı anahtar sırası — ebeveyn önce. */
const SIRA = [
  '06_makine_tipi', '01_urun_tipi', '02_ek_parca_tipi', '03_ek_parca_varyant',
  '04_operasyon_grup', '05_operasyon', '07_operasyon_zamani',
]

const wb = XLSX.readFile(DOSYA)
const paket = {}
let hata = 0

for (const sayfa of SIRA) {
  const t = SAYFALAR[sayfa]
  const ws = wb.Sheets[sayfa]
  if (!ws) { console.error(`HATA: sayfa yok — ${sayfa}`); process.exit(1) }

  /* header:1 ham dizi verir; baslikSatiri'ndan SONRAKİ satırlar veridir.
     blankrows: TRUE şart — false olursa dosyadaki boş 2. satır diziden
     düşer, dizi indeksleri dosya satırlarıyla kaymaz ve slice(3) ilk VERİ
     satırını da keser. (Altı sayfa birer satır eksik geliyordu.) */
  const tumu = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: null })
  const ham = tumu.slice(t.baslikSatiri)
  const kayitlar = satirlariCoz(t.kolonlar, ham)

  const adKol = AD_KOLONU[t.tablo]
  let duzeltilen = 0
  if (adKol) {
    for (const k of kayitlar) {
      const once = k[adKol]
      k[adKol] = adDuzelt(once, k.id)
      if (String(once ?? '').trim() === '') duzeltilen++
    }
  }

  const uyari = kayitlar.length === t.beklenenSatir ? '' : `  << BEKLENEN ${t.beklenenSatir}`
  if (uyari) hata++
  console.log(`  ${sayfa.padEnd(22)} ${String(kayitlar.length).padStart(6)} satır` +
              (duzeltilen ? `  (${duzeltilen} boş ad dolduruldu)` : '') + uyari)
  paket[sayfa] = { tanim: t, kayitlar }
}

if (hata) {
  console.error('\nSatır sayıları beklenenden farklı. Dosya değişmiş olabilir —')
  console.error('lib/pes/kutuphane-sayfa.ts içindeki beklenenSatir değerlerini gözden geçir.')
  process.exit(1)
}

if (!UYGULA) {
  console.log('\nKURU ÇALIŞMA — hiçbir şey yazılmadı. Yazmak için --uygula ekle.')
  process.exit(0)
}

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30 })

try {
  await sql.begin(async (tx) => {
    // Ters sırada temizle — çocuk önce.
    for (const sayfa of [...SIRA].reverse()) {
      await tx.unsafe(`DELETE FROM ${SAYFALAR[sayfa].tablo}`)
    }

    for (const sayfa of SIRA) {
      const { tanim, kayitlar } = paket[sayfa]
      if (kayitlar.length === 0) continue
      // 1.000'lik gruplar: 30.319 satırı tek INSERT'te göndermek parametre
      // sınırını aşıyor.
      for (let i = 0; i < kayitlar.length; i += 1000) {
        const grup = kayitlar.slice(i, i + 1000)
        await tx`INSERT INTO ${tx(tanim.tablo)} ${tx(grup, ...tanim.kolonlar)}`
      }
      console.log(`  yazıldı: ${tanim.tablo} ${kayitlar.length}`)
    }

    // id'ler korunduğu için diziler geride kaldı; ileri al.
    for (const sayfa of SIRA) {
      const tablo = SAYFALAR[sayfa].tablo
      await tx.unsafe(
        `SELECT setval(pg_get_serial_sequence('${tablo}','id'),
                       COALESCE((SELECT MAX(id) FROM ${tablo}), 1))`)
    }
  })

  console.log('\nYAZILDI. Güven seviyesi dağılımı:')
  for (const r of await sql`
    SELECT guven_seviyesi, count(*)::int AS n FROM ref_operasyon_zamani
    GROUP BY guven_seviyesi ORDER BY n DESC`) {
    console.log(`  ${String(r.guven_seviyesi).padEnd(12)} ${r.n}`)
  }
} finally {
  await sql.end()
}
