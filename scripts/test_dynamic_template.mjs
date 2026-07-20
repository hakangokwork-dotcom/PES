import { validateRows, buildSimDataFromRows } from '../lib/pes/sim-excel.js'

// Akıştaki mainOps (kullanıcı kendi tanımladı)
const flowMainOps = [
  { id: 'mo_hazirlik', name: 'Hazırlık', color: '#3b82f6', order: 0, x: 60, y: 100, nextIds: [] },
  { id: 'mo_dikim',    name: 'Dikim',    color: '#16a34a', order: 1, x: 360, y: 100, nextIds: [] },
  { id: 'mo_kontrol',  name: 'Kontrol',  color: '#d97706', order: 2, x: 660, y: 100, nextIds: [] },
]

const rows = [
  { 'Ana Grup': 'Hazırlık', 'Operasyon Adı': 'Etiket Kesme',     'Çevrim (sn)': 3,    'Tip': 'KESİM' },
  { 'Ana Grup': 'Dikim',    'Operasyon Adı': 'Cep Birleştirme',  'Çevrim (sn)': 7.2,  'Tip': 'OVERLOK' },
  { 'Ana Grup': 'Kontrol',  'Operasyon Adı': 'Genel Kontrol',    'Çevrim (sn)': 12.5, 'Tip': 'KONTROL' },
  { 'Ana Grup': 'Yıkama',   'Operasyon Adı': 'Test',             'Çevrim (sn)': 5,    'Tip': 'PRESS' }, // akışta yok
  { 'Ana Grup': 'Ön Bant',  'Operasyon Adı': 'Test2',            'Çevrim (sn)': 5,    'Tip': 'DİKİM' }, // akışta yok
]

const allowed = flowMainOps.map(m => m.name)
const validated = validateRows(rows, allowed)
const okCount = validated.filter(v => v.ok).length
const failed = validated.filter(v => !v.ok)
console.log(`Geçerli: ${okCount}/${validated.length}`)
console.log('Reddedilenler:')
for (const f of failed) console.log(' -', f.opAdi, '|', f.errors.join(', '))

// Build sim data — mainOps korunmalı
const built = buildSimDataFromRows(validated.filter(v => v.ok), { machines: [], operators: [], mainOps: flowMainOps })
console.log('\nÇıkan mainOps:', built.mainOps.map(m => m.name))
console.log('Çıkan subOps:', built.subOps.length, '→', built.subOps.map(s => `${flowMainOps.find(m => m.id === s.mainOpId)?.name}/${s.name}`))
