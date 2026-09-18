/**
 * Atolye_Gider_Model.xlsx → lib/pes/__fixtures__/ekonomi-pilot.json
 *
 * VERI_GIRIS = girdi, HESAP = Excel'in hesapladığı beklenen çıktı.
 * Excel'in önbelleğe aldığı formül sonuçları okunur (cellDates yok, raw değer).
 * Excel güncellenince bu script yeniden çalıştırılır ve testler yeni
 * referansa karşı koşar.
 *
 * Kullanım: node scripts/ekonomi_fixture_uret.mjs
 */
import XLSX from 'xlsx'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const KAYNAK = 'C:\\Users\\bhaka\\Desktop\\WORK\\Facilty_Expence\\Atolye_Gider_Model.xlsx'
const HEDEF = join(__dir, '../lib/pes/__fixtures__/ekonomi-pilot.json')

const wb = XLSX.readFile(KAYNAK)

/** Sayfayı 3. satır başlıklı nesne dizisine çevirir (satır 1-2 açıklama). */
function satirlar(ad) {
  const ws = wb.Sheets[ad]
  if (!ws) throw new Error(`Sayfa yok: ${ad}`)
  return XLSX.utils.sheet_to_json(ws, { range: 2, defval: null })
}

const giris = satirlar('VERI_GIRIS').filter(r => r['Kısa ad'])
const hesap = satirlar('HESAP').filter(r => r['Kısa ad'])

if (giris.length !== hesap.length) {
  throw new Error(`VERI_GIRIS ${giris.length} satır, HESAP ${hesap.length} satır — eşleşmiyor`)
}

// PARAMETRE sayfası: A sütunu etiket, B sütunu değer. Formül hücreleri
// (B11, B12) önbellekli sonucu taşır; onları da alıyoruz ki test
// asgari dakika maliyetini yeniden türetmek zorunda kalmasın.
const pws = wb.Sheets['PARAMETRE']
const pOku = (hucre) => {
  const c = pws[hucre]
  if (!c) throw new Error(`PARAMETRE!${hucre} boş`)
  return c.v
}

const parametre = {
  min_wage_gross: pOku('B4'),
  min_wage_net: pOku('B5'),
  employer_cost: pOku('B6'),
  wage_support: pOku('B7'),
  minutes_per_day: pOku('B8'),
  nominal_days: pOku('B9'),
  effective_days: pOku('B10'),
  eff_cutting: pOku('B14'),
  eff_sewing: pOku('B15'),
  eff_ukp: pOku('B16'),
  target_margin: pOku('B17'),
  weight_cutting: pOku('B19'),
  weight_sewing: pOku('B20'),
  weight_ukp: pOku('B21'),
  revenue_adj_on: pOku('B23'),
  revenue_adj_divisor: pOku('B24'),
}

// Bölge 3D dakika maliyeti — PARAMETRE!A32:D37, GÜNCEL sütunu (D).
const dk3d = {}
for (let r = 32; r <= 37; r++) {
  const ad = pws['A' + r]?.v
  const deger = pws['D' + r]?.v
  if (ad != null && deger != null) dk3d[String(ad).trim()] = deger
}

const cikti = {
  uretildi: new Date().toISOString(),
  kaynak: KAYNAK,
  parametre,
  dk3d,
  atolyeler: giris.map((g, i) => ({
    ad: g['Kısa ad'],
    giris: g,
    beklenen: hesap[i],
  })),
}

mkdirSync(dirname(HEDEF), { recursive: true })
writeFileSync(HEDEF, JSON.stringify(cikti, null, 2), 'utf8')
console.log(`OK  ${cikti.atolyeler.length} atölye → ${HEDEF}`)
console.log(`    ${cikti.atolyeler.map(a => a.ad).join(', ')}`)
