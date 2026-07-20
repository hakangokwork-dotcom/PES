import * as XLSX from 'xlsx'
import { readFileSync } from 'fs'
import { validateRows } from '../lib/pes/sim-excel.js'

const buf = readFileSync('c:/Users/bhaka/Desktop/PES/scripts/uretim_simulasyon_dolu.xlsx')
const wb = XLSX.read(buf)
const ws = wb.Sheets['Operasyonlar']
const rows = XLSX.utils.sheet_to_json(ws, { defval: null })

// Base akıştaki ana operasyon adları
const allowed = ['Hazırlık', 'Ön Bant', 'Arka Bant', 'Montaj', 'Yıkama', 'UKP']
const validated = validateRows(rows, allowed)
const ok = validated.filter(v => v.ok).length
const bad = validated.filter(v => !v.ok)
console.log(`Toplam: ${validated.length}, geçerli: ${ok}, hatalı: ${bad.length}`)
if (bad.length > 0) {
  console.log('Reddedilenler:')
  bad.forEach(b => console.log(' -', b.opAdi, '|', b.errors.join(', ')))
}
