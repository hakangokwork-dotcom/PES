/**
 * PES'teki ekonomi rasyolarını Atolye_Gider_Model.xlsx HESAP sayfasıyla
 * karşılaştırır. ‰1 üstü sapma hatadır.
 *
 * Task 8'in testi saf fonksiyonları doğruluyor; bu script import'un
 * kalemleri doğru kolonlara koyduğunu doğruluyor. Bir kalem yanlış
 * kolona giderse fonksiyon testleri geçer ama bu script kırılır.
 *
 * Kullanım: node scripts/verify_ekonomi.mjs --donem 2026-01
 */
import postgres from 'postgres'
import XLSX from 'xlsx'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))

const arg = (ad, v = null) => {
  const i = process.argv.indexOf(`--${ad}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : v
}
const DONEM = arg('donem')
if (!DONEM || !/^\d{4}-(0[1-9]|1[0-2])$/.test(DONEM)) {
  console.error('HATA: --donem YYYY-MM zorunlu')
  process.exit(1)
}
const [YIL, AY] = DONEM.split('-').map(Number)
const TOLERANS = 0.001   // ‰1

/**
 * postgres.js NUMERIC kolonları string döndürür; Number() ile sarılmazsa
 * hesapla() içinde sessizce NaN üretir. Bu yardımcı gider satırındaki her
 * numerik alanı sayıya çevirir; null/undefined olduğu gibi kalır.
 */
function sayiya(r) {
  const out = { incentive_amount: null }
  const kolonlar = [
    'personnel','overtime','bonus','sgk','severance_reserve',
    'food','transport','cargo','rent','building_depr',
    'electricity','water','gas','thread','needle',
    'ukp_consumables','consumables','machine_maint','machine_depr',
    'vehicle_depr','vehicle','stationery','isg','consulting',
    'official_fees','insurance','communication','other',
    'incentive_amount',
  ]
  for (const k of kolonlar) {
    const v = r[k]
    out[k] = v === null || v === undefined ? null : Number(v)
  }
  return out
}

const { hesapla } = await import('tsx/esm/api').then(async ({ register }) => {
  const un = register()
  const mod = await import('../lib/pes/ekonomi-hesap.ts')
  un()
  return mod
})

// ---------- Excel referansı ----------
const wb = XLSX.readFile(
  'C:\\Users\\bhaka\\Desktop\\WORK\\Facilty_Expence\\Atolye_Gider_Model.xlsx')
const excelHesap = XLSX.utils.sheet_to_json(wb.Sheets['HESAP'], { range: 2, defval: null })
  .filter(r => r['Kısa ad'])
// DB adı → Excel kısa adı eşleştirmesi. Bazı atölyeler Excel'de farklı
// kısa ad kullanıyor ("Hediye Group" ≠ "HEDİYE TEKSTİL"). Bu override
// haritası elle bakılarak oluşturuldu — import scriptindeki mantıkla aynı.
const DB_EXCEL_OVERRIDE = {
  'HEDİYE TEKSTİL': 'Hediye Group',
  'SRT TEKSTİL':    'Srtteks',
  'SİMAY':          'Simayteks',
  'NETCLAS':        'Netclass',
}
const excelIndeks = new Map(excelHesap.map(r => [String(r['Kısa ad']).trim(), r]))
// Büyük harfe çevrilmiş indeks — Türkçe büyük/küçük harf duyarsız arama için.
// "Örssan" → "ÖRSSAN", "İmkot" → "İMKOT" vb.
const excelIndeksUpper = new Map(
  excelHesap.map(r => [String(r['Kısa ad']).trim().toLocaleUpperCase('tr-TR'), r])
)

// ---------- PES verisi ----------
// Developer script: postgres (superuser) rolü kullanılır — RLS baypas.
// APP_DATABASE_URL (pes_app) kullanılırsa set_config ile tenant context
// gerekir; import scriptleri de DATABASE_URL kullanır, aynı yaklaşım.
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false })

const satirlar = await sql`
  SELECT w.id, w.name, w.bolge,
         me.*, we.*,
         dk.dk_maliyet_tl
  FROM workshop_economy we
  JOIN workshop w        ON w.id = we.workshop_id
  LEFT JOIN monthly_expense me
         ON me.workshop_id = we.workshop_id
        AND me.year = we.year AND me.month = we.month
  LEFT JOIN LATERAL (
        SELECT dk_maliyet_tl FROM dk_maliyet
        WHERE bolge = w.bolge AND donem <= ${DONEM}
        ORDER BY donem DESC LIMIT 1) dk ON TRUE
  WHERE we.year = ${YIL} AND we.month = ${AY}`

const paramSatirlari = await sql`
  SELECT DISTINCT ON (param_key) param_key, param_value
  FROM economy_param WHERE donem <= ${DONEM}
  ORDER BY param_key, donem DESC`
const param = Object.fromEntries(paramSatirlari.map(p => [p.param_key, Number(p.param_value)]))

console.log(`Dönem ${DONEM}: PES'te ${satirlar.length} ekonomi satırı, Excel'de ${excelHesap.length} atölye`)

// ---------- Karşılaştır ----------
const ESLESME = [
  ['Toplam kişi', 'toplamKisi'],
  ['Aylık ciro (TL)', 'aylikCiro'],
  ['Brüt gider (TL)', 'brutGider'],
  ['Net gider (TL)', 'netGider'],
  ['Marj %', 'marj'],
  ['İşçilik toplamı (maaş+mesai+prim+SGK+kıdem)', 'iscilikToplam'],
  ['Ciro / kişi', 'ciroKisi'],
  ['DİKİM dk maliyeti (TL/dk)', 'dikimDkMaliyet'],
  ['Dikim dk cirosu (TL/dk)', 'dikimDkCiro'],
  ['Asgari dakika çarpanı (× asgari ücretli dk)', 'asgariDkCarpani'],
  ['Başabaş fiyat / adet', 'basabasFiyat'],
  ['Adil fiyat / adet (hedef marjla)', 'adilFiyat'],
]

let hata = 0, kontrol = 0, atlanan = 0

for (const r of satirlar) {
  // 1) Elle override (farklı kısa ad, örn. "HEDİYE TEKSTİL" → "Hediye Group")
  // 2) Birebir eşleşme (örn. "NEEDLES" = "NEEDLES")
  // 3) Büyük harf normalize ("ÖRSSAN" ~ "Örssan" → "ÖRSSAN")
  // 4) DB adı Excel kısa adını (büyük harfle) içeriyor mu (örn. "İMKOT KONFEKSİYON".includes("İMKOT"))
  // 5) Excel kısa adı DB adını içeriyor mu (ters yön)
  const dbUpper = r.name.toLocaleUpperCase('tr-TR')
  const overrideKey = DB_EXCEL_OVERRIDE[r.name]
  const excel = (overrideKey ? excelIndeks.get(overrideKey) : undefined) ??
                excelIndeks.get(r.name) ??
                excelIndeksUpper.get(dbUpper) ??
                [...excelIndeksUpper.entries()].find(([k]) => dbUpper.includes(k))?.[1] ??
                [...excelIndeksUpper.entries()].find(([k]) => k.includes(dbUpper))?.[1]
  if (!excel) { console.log(`  ? ${r.name}: Excel'de karşılığı yok, atlandı`); atlanan++; continue }

  const rasyo = hesapla({
    gider: sayiya(r),
    ekonomi: {
      revenue_declared: r.revenue_declared === null ? null : Number(r.revenue_declared),
      idle_days: r.idle_days === null ? null : Number(r.idle_days),
      qty_declared: r.qty_declared,
      nominal_days: r.nominal_days === null ? null : Number(r.nominal_days),
      actual_days: r.actual_days === null ? null : Number(r.actual_days),
      hours_per_day: r.hours_per_day === null ? null : Number(r.hours_per_day),
      cutting_staff: r.cutting_staff, sewing_staff: r.sewing_staff,
      ukp_staff: r.ukp_staff, office_staff: r.office_staff,
      area_m2: r.area_m2, source: r.source,
    },
    param,
    dkMaliyet3D: r.dk_maliyet_tl === null || r.dk_maliyet_tl === undefined
      ? null : Number(r.dk_maliyet_tl),
    qtyActual: null,
  })

  for (const [excelBaslik, alan] of ESLESME) {
    const beklenen = excel[excelBaslik]
    if (typeof beklenen !== 'number') continue
    const bulunan = rasyo[alan]
    kontrol++
    if (bulunan === null) {
      console.log(`  X ${r.name} / ${alan}: PES null, Excel ${beklenen}`)
      hata++
      continue
    }
    const payda = Math.abs(beklenen) < 1e-9 ? 1 : Math.abs(beklenen)
    const sapma = Math.abs(bulunan - beklenen) / payda
    if (sapma > TOLERANS) {
      console.log(`  X ${r.name} / ${alan}: PES ${bulunan.toFixed(6)} ≠ Excel ${Number(beklenen).toFixed(6)} (‰${(sapma * 1000).toFixed(1)})`)
      hata++
    }
  }
}

console.log(`\n${kontrol} kontrol, ${hata} sapma, ${atlanan} atölye atlandı`)

// postgres.js NUMERIC'i string döndürür. Number() ile sarılmayan bir alan
// sessizce NaN üretir; bu yüzden NaN'ı da hata sayıyoruz.
if (kontrol === 0) {
  // Sıfır kontrol bir başarı değildir. Bu script bir kez "0 kontrol, 0 sapma
  // → BAŞARILI" dedi ve o dönemde hiç veri olmadığını gizledi. Yanlış dönem,
  // boş tablo ya da RLS yüzünden görünmeyen satırlar hep buraya düşer.
  console.error('\nDOĞRULAMA YAPILAMADI — bu dönemde karşılaştırılacak satır yok.')
  console.error('  Dönemi kontrol et: SELECT DISTINCT year, month FROM workshop_economy;')
  console.error('  Anket içeri alınmadıysa: node scripts/import_ekonomi_anket.mjs --baslangic YYYY-MM --uygula')
  process.exitCode = 1
} else if (hata > 0) {
  console.error('\nDOĞRULAMA BAŞARISIZ — sapmaların nedenini bul, tolerans yükseltme.')
  process.exitCode = 1
} else {
  console.log('\nDOĞRULAMA BAŞARILI — PES rasyoları Excel ile ‰1 içinde.')
}
await sql.end()
