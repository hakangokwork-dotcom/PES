import * as XLSX from 'xlsx'
import { writeFileSync } from 'fs'

const wb = XLSX.utils.book_new()

// Bilgi sheet
const bilgi = [
  ['Alan', 'Değer'],
  ['Model Adı', 'Test Pantolon'],
  ['Model No / PLM ID', 'PN-TEST-001'],
  ['Atölye Adı', 'Test Atölye'],
  ['Müşteri', 'Test Müşteri'],
  ['Tarih', '2026-04-29'],
  ['Sipariş Adedi', 1000],
]
const wsB = XLSX.utils.aoa_to_sheet(bilgi)
XLSX.utils.book_append_sheet(wb, wsB, 'Bilgi')

// Operasyonlar sheet
const ops = [
  ['Ana Grup', 'Operasyon Adı', 'Çevrim (sn)', 'Tip', 'Makine Kodu', 'Operatör'],
  ['Ön Bant', 'Cep Hazırlama', 8.5, 'DİKİM', 'DDM-01', 'Ali V.'],
  ['Ön Bant', 'Cep Birleştirme', 7.2, 'OVERLOK', 'OVR-01', 'Ayşe K.'],
  ['Arka Bant', 'Arka Cep Otomatı', 11.0, 'OTOMAT', 'OTM-01', ''],
  ['Arka Bant', 'Arka Çatım', 5.8, 'OVERLOK', 'OVR-01', ''],
  ['Montaj', 'Yan Çatım', 12.0, 'OVERLOK', 'OVR-01', ''],
  ['Montaj', 'Kemer Takma', 9.5, 'DİKİM', 'DDM-01', ''],
  ['UKP', 'Paça Kıvırma', 8.7, 'OTOMAT', 'OTM-01', ''],
]
const wsO = XLSX.utils.aoa_to_sheet(ops)
XLSX.utils.book_append_sheet(wb, wsO, 'Operasyonlar')

const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
writeFileSync('c:/Users/bhaka/Desktop/PES/scripts/test_sim.xlsx', buf)
console.log('Yazildi: scripts/test_sim.xlsx', buf.length, 'bytes')
