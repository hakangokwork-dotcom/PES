// Import konfeksiyon_v3_final.xlsx -> Supabase (kv3_urun, kv3_islem_katalogu, kv3_urun_islem)
// Usage: node scripts/import_konfeksiyon_v3.mjs

import XLSX from 'xlsx'
import postgres from 'postgres'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const XLSX_PATH = path.join(__dirname, '..', 'konfeksiyon_v3_final.xlsx')

const env = Object.fromEntries(
  readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const sql = postgres(env.DATABASE_URL, {
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
})

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] || []
    if (row[0] === 'ID') return i
  }
  throw new Error('Header row (ID) not found')
}

function sheetToRecords(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const headerRow = findHeaderRow(rows)
  const headers = rows[headerRow]
  const records = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || []
    if (row.every(cell => cell == null || cell === '')) continue
    const obj = {}
    headers.forEach((h, idx) => { obj[h] = row[idx] })
    records.push(obj)
  }
  return records
}

async function main() {
  console.log('Loading Excel:', XLSX_PATH)
  const wb = XLSX.readFile(XLSX_PATH)

  const urunRecs = sheetToRecords(wb.Sheets['URUN'])
  const islemRecs = sheetToRecords(wb.Sheets['ISLEM_KATALOGU'])
  const uiRecs = sheetToRecords(wb.Sheets['URUN_ISLEM'])

  console.log(`URUN: ${urunRecs.length} rows`)
  console.log(`ISLEM_KATALOGU: ${islemRecs.length} rows`)
  console.log(`URUN_ISLEM: ${uiRecs.length} rows`)

  // 1) Clean existing data
  console.log('\n[1/4] Cleaning existing kv3 data...')
  await sql`TRUNCATE TABLE kv3_urun_islem, kv3_urun, kv3_islem_katalogu RESTART IDENTITY CASCADE`

  // 2) URUN
  console.log('[2/4] Inserting URUN...')
  const urunMap = new Map() // key = `${Kumas}||${Urun}||${Ozellik||''}` -> id
  for (const r of urunRecs) {
    const kumas = String(r['Kumaş'] || '').trim()
    const urun = String(r['Ürün'] || '').trim()
    const ozellikRaw = r['Özellik']
    const ozellik = ozellikRaw ? String(ozellikRaw).trim() : null
    const parcaSayisi = Number(r['Parça Sayısı'] || 0)
    const islemSayisi = Number(r['İşlem Sayısı'] || 0)
    if (!kumas || !urun) continue
    const [row] = await sql`
      INSERT INTO kv3_urun (kumas, urun, ozellik, parca_sayisi, islem_sayisi)
      VALUES (${kumas}, ${urun}, ${ozellik}, ${parcaSayisi}, ${islemSayisi})
      ON CONFLICT (kumas, urun, ozellik) DO UPDATE SET
        parca_sayisi = EXCLUDED.parca_sayisi,
        islem_sayisi = EXCLUDED.islem_sayisi
      RETURNING id
    `
    urunMap.set(`${kumas}||${urun}||${ozellik || ''}`, row.id)
  }
  console.log(`  → ${urunMap.size} urun kaydedildi`)

  // 3) ISLEM_KATALOGU (deduplicate on islem_adi)
  console.log('[3/4] Inserting ISLEM_KATALOGU...')
  const seenIslem = new Set()
  let islemInsCount = 0
  for (const r of islemRecs) {
    const ad = String(r['İşlem Adı'] || '').trim()
    const makine = r['Makine Tipi'] ? String(r['Makine Tipi']).trim() : null
    if (!ad || seenIslem.has(ad)) continue
    seenIslem.add(ad)
    await sql`
      INSERT INTO kv3_islem_katalogu (islem_adi, makine_tipi)
      VALUES (${ad}, ${makine})
      ON CONFLICT (islem_adi) DO NOTHING
    `
    islemInsCount++
  }
  console.log(`  → ${islemInsCount} unique islem kaydedildi`)

  // 4) URUN_ISLEM (batch insert)
  console.log('[4/4] Inserting URUN_ISLEM...')
  const batch = []
  const BATCH_SIZE = 500
  let insertedCount = 0
  let skipped = 0

  async function flushBatch() {
    if (batch.length === 0) return
    await sql`
      INSERT INTO kv3_urun_islem ${sql(batch, 'urun_id', 'parca', 'grup', 'islem_adi', 'mtm_sn', 'min_sn', 'max_sn', 'orneklem', 'guven')}
    `
    insertedCount += batch.length
    process.stdout.write(`  → ${insertedCount}/${uiRecs.length}\r`)
    batch.length = 0
  }

  for (const r of uiRecs) {
    const kumas = String(r['Kumaş'] || '').trim()
    const urun = String(r['Ürün'] || '').trim()
    const ozellikRaw = r['Özellik']
    const ozellik = ozellikRaw ? String(ozellikRaw).trim() : null
    const key = `${kumas}||${urun}||${ozellik || ''}`
    const urunId = urunMap.get(key)
    if (!urunId) { skipped++; continue }

    const parca = String(r['Parça'] || '').trim()
    const grup = r['Grup'] ? String(r['Grup']).trim() : null
    const islemAdi = String(r['İşlem'] || '').trim()
    if (!parca || !islemAdi) { skipped++; continue }

    batch.push({
      urun_id: urunId,
      parca,
      grup,
      islem_adi: islemAdi,
      mtm_sn: r['MTM'] != null ? Number(r['MTM']) : null,
      min_sn: r['Min'] != null ? Number(r['Min']) : null,
      max_sn: r['Max'] != null ? Number(r['Max']) : null,
      orneklem: r['Örneklem'] != null ? Number(r['Örneklem']) : null,
      guven: r['Güven'] ? String(r['Güven']).trim() : null,
    })

    if (batch.length >= BATCH_SIZE) await flushBatch()
  }
  await flushBatch()
  console.log(`\n  → ${insertedCount} kayıt yazıldı, ${skipped} atlandı`)

  console.log('\n✓ Import tamamlandı')
  await sql.end()
}

main().catch(err => {
  console.error('Hata:', err)
  process.exit(1)
})
