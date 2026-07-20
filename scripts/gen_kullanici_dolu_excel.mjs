import * as XLSX from 'xlsx'
import { writeFileSync } from 'fs'

// Kullanıcının görselindeki veriler — Ana Grup adlandırması base akışla uyumlu hale getirildi
// (MONTAJ → Montaj). Tip kolonu serbest, sistem doğrulamıyor.
const rows = [
  // Arka Bant
  ['Arka Bant', 'PİLE PENS',                       17.5,  'OTOMASYON',    '', ''],
  ['Arka Bant', 'PENS ÇIMA',                       12.5,  'DÜZ',          '', ''],
  ['Arka Bant', 'FLETO 3 İPLİK ÇEKME',             9,     'PRESS',        '', ''],
  ['Arka Bant', 'FLETO',                           12.75, 'OTOMASYON',    '', ''],
  ['Arka Bant', 'FLETO ÇEVİRME',                   6.3,   'MANUEL',       '', ''],
  ['Arka Bant', 'ALT ÇIMA',                        10,    'DÜZ',          '', ''],
  ['Arka Bant', 'GÖZDE İLİK',                      5.6,   'İLİK',         '', ''],
  ['Arka Bant', 'ÜST ÇIMA',                        15,    'DÜZ',          '', ''],
  ['Arka Bant', 'ARKA CEP TULUM',                  8.15,  'DÜZ',          '', ''],
  ['Arka Bant', 'OVERLOK ARKA AĞ ÇATIM',           10.1,  'OVARLOK',      '', ''],
  ['Arka Bant', 'ARKA AĞ ÇIMA',                    10.1,  'DÜZ',          '', ''],
  ['Arka Bant', 'ÜST REGOLA EMNİYET DİKİŞİ',       16.6,  'OVERLOK',      '', ''],
  ['Arka Bant', 'PUNTEREZ',                        16,    'PUNTEREZ',     '', ''],
  ['Arka Bant', 'CEP KARŞILIK VURMASI',            8.5,   'DÜZ',          '', ''],
  // Ön Bant
  ['Ön Bant',   'ÜÇ İPLİK OVERLOK',                12.45, 'OVERLOK',      '', ''],
  ['Ön Bant',   'AÇIK PAT TAKMA VE ÇIMA',          12.9,  'DÜZ',          '', ''],
  ['Ön Bant',   'FERMUAR TAKMA',                   12.7,  'ÇİFT İĞNE',    '', ''],
  ['Ön Bant',   'J DİKİŞİ DÖNME',                  8.3,   'ÇİFT İĞNE',    '', ''],
  ['Ön Bant',   'CEP TAKMA',                       12.75, 'ROBOT MAKINA', '', ''],
  ['Ön Bant',   'CEP KARŞILIĞI VE PERVAZ VURMA',   12.75, 'ROBOT MAKINA', '', ''],
  ['Ön Bant',   'CEP TORBASI ÇATIMI(TULUM)',       16.3,  'DÜZ',          '', ''],
  ['Ön Bant',   'CEP GAZE',                        15.6,  'DÜZ',          '', ''],
  ['Ön Bant',   'CEP BEDEN TUTTURMA',              11.4,  'DÜZ',          '', ''],
  ['Ön Bant',   'CEP AĞZI DİKİŞİ',                 15.8,  'DÜZ',          '', ''],
  ['Ön Bant',   'YAN CEP KAPAMA',                  5,     'DÜZ',          '', ''],
  ['Ön Bant',   'ÖN BAĞLAMA',                      9.3,   'DÜZ',          '', ''],
  ['Ön Bant',   'ÖN ALT BAĞLAMA',                  11.7,  'DÜZ',          '', ''],
  ['Ön Bant',   'PUNTEREZ',                        11.6,  'PUNTEREZ',     '', ''],
  // Montaj
  ['Montaj',    'YAN ÇATIM',                       19.2,  'OVERLOK',      '', ''],
  ['Montaj',    'YAN EMNİYET ÇIMA DİKİŞ',          8.2,   'DÜZ',          '', ''],
  ['Montaj',    'KEMER ÇİZİMİ',                    4.4,   'MANUEL',       '', ''],
  ['Montaj',    'ETİKET TAKIMI',                   8.7,   'DÜZ',          '', ''],
  ['Montaj',    'KEMER TAKMA',                     14.4,  'OTOMAT',       '', ''],
  ['Montaj',    'ALT UÇ KAPAMA',                   6,     'DÜZ',          '', ''],
  ['Montaj',    'ÜST UÇ ÇATIMI',                   9,     'DÜZ',          '', ''],
  ['Montaj',    'ÜST UÇ KAPAMA',                   9,     'DÜZ',          '', ''],
  ['Montaj',    'KEMER UÇ İLİK',                   5.6,   'GÖZLÜ İLİK',   '', ''],
  ['Montaj',    'PAÇA KIVIRMA',                    10,    'DÜZ',          '', ''],
  ['Montaj',    'YAN EMNİYET DİKİŞİ',              16.4,  'PUNTEREZ',     '', ''],
  ['Montaj',    'KÖPRÜ OTOMATI',                   7.8,   'OTOMAT',       '', ''],
  ['Montaj',    'KEMER EKLEME',                    15.9,  'DÜZ',          '', ''],
  ['Montaj',    'İÇ BOY OVERLOK ÇATIM',            12.45, 'OVERLOK',      '', ''],
  ['Montaj',    'İÇ BOY BASKISI',                  11.1,  'DÜZ',          '', ''],
]

const header = ['Ana Grup', 'Operasyon Adı', 'Çevrim (sn)', 'Tip', 'Makine Kodu', 'Operatör']
const wb = XLSX.utils.book_new()
const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
ws['!cols'] = [{ wch: 14 }, { wch: 38 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }]
XLSX.utils.book_append_sheet(wb, ws, 'Operasyonlar')

const path = 'c:/Users/bhaka/Desktop/PES/scripts/uretim_simulasyon_dolu.xlsx'
XLSX.writeFile(wb, path)
console.log(`Yazildi: ${path} (${rows.length} satir, 3 ana grup)`)
console.log('  Arka Bant:', rows.filter(r => r[0] === 'Arka Bant').length)
console.log('  Ön Bant  :', rows.filter(r => r[0] === 'Ön Bant').length)
console.log('  Montaj   :', rows.filter(r => r[0] === 'Montaj').length)
