/**
 * pantolon-jean-uretim-case.xlsx → lib/pes/__fixtures__/bulten-ornek.json
 *
 * Bülten kural motorunun testi bu dosyayı okur. Kaynak değişirse script
 * yeniden çalıştırılır ve testler yeni gerçeğe karşı koşar.
 *
 * Kullanım: node scripts/bulten_fixture_uret.mjs [--dosya <yol>]
 */
import XLSX from 'xlsx'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const arg = (ad, v = null) => {
  const i = process.argv.indexOf(`--${ad}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : v
}
const KAYNAK = arg('dosya', 'C:\\Users\\bhaka\\Desktop\\pantolon-jean-uretim-case.xlsx')
const HEDEF = join(__dir, '../lib/pes/__fixtures__/bulten-ornek.json')

const wb = XLSX.readFile(KAYNAK)

const bilgiSatirlari = XLSX.utils.sheet_to_json(wb.Sheets['Bilgi'], { header: 1, defval: null })
const bilgi = {}
for (const [alan, deger] of bilgiSatirlari.slice(1)) {
  if (alan) bilgi[String(alan).trim()] = deger === null ? null : String(deger)
}

const ops = XLSX.utils.sheet_to_json(wb.Sheets['Operasyonlar'], { defval: null })
  .filter(r => r['Sıra'] !== null && r['Sıra'] !== undefined)
  .map(r => ({
    sira_no: Number(r['Sıra']),
    seviye1: r['1.Seviye Süreç'] ?? null,
    seviye2: r['2.Seviye Süreç'] ?? null,
    seviye3: r['3.Seviye Süreç'] ?? null,
    cevrim_sn: Number(r['Çevrim (sn)']) || 0,
    tip: r['Tip'] ?? null,
    makine_kodu: r['Makine Kodu'] ?? null,
    oncesi: r['Öncesi'] ?? null,
  }))

const toplam = ops.reduce((a, o) => a + o.cevrim_sn, 0)

mkdirSync(dirname(HEDEF), { recursive: true })
writeFileSync(HEDEF, JSON.stringify({
  uretildi: new Date().toISOString(), kaynak: KAYNAK, bilgi, operasyonlar: ops, toplamSn: toplam,
}, null, 2), 'utf8')

console.log(`OK  ${ops.length} operasyon, toplam ${toplam} sn (${(toplam / 60).toFixed(2)} dk) → ${HEDEF}`)
