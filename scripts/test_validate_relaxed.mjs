import { validateRows } from '../lib/pes/sim-excel.js'

const rows = [
  { 'Ana Grup': 'Arka Bant', 'Operasyon Adı': 'PİLE PENS', 'Çevrim (sn)': 17.5, 'Tip': 'OTOMASYON' },
  { 'Ana Grup': 'Arka Bant', 'Operasyon Adı': 'FLETO', 'Çevrim (sn)': 12.75, 'Tip': 'OTOMASYON' },
  { 'Ana Grup': 'Arka Bant', 'Operasyon Adı': 'FLETO ÇEVİRME', 'Çevrim (sn)': 6.3, 'Tip': 'MANUEL' },
  { 'Ana Grup': 'Ön Bant', 'Operasyon Adı': 'CEP TAKMA', 'Çevrim (sn)': 12.75, 'Tip': 'ROBOT MAKINA' },
  { 'Ana Grup': 'Ön Bant', 'Operasyon Adı': 'CEP GAZE', 'Çevrim (sn)': 15.6, 'Tip': 'DÜZ' },
  { 'Ana Grup': 'Arka Bant', 'Operasyon Adı': 'PUNTEREZ', 'Çevrim (sn)': 16, 'Tip': 'PUNTEREZ' },
]

const out = validateRows(rows)
const ok = out.filter(r => r.ok).length
const bad = out.filter(r => !r.ok)
console.log(`Toplam: ${out.length}, geçerli: ${ok}, hatalı: ${bad.length}`)
if (bad.length > 0) {
  console.log('Hatalılar:', bad.map(r => `${r.opAdi}: ${r.errors.join(', ')}`))
}
