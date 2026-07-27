#!/usr/bin/env node
/**
 * Klasman saha verisini (114 atölye) PES'e aktarır.
 *
 * KAYNAK: C:\Users\bhaka\Desktop\Klasman\MEVCUT_DURUM\MASTER_veri.xlsx → "Long" sayfası
 *
 * VARSAYILAN KURU ÇALIŞMADIR — hiçbir şey yazmaz, ne olacağını raporlar.
 * Yazmak için açıkça --apply verilmelidir.
 *
 *   node scripts/import-klasman.mjs                # kuru çalışma + rapor
 *   node scripts/import-klasman.mjs --apply        # gerçekten yaz
 *   node scripts/import-klasman.mjs --tenant=demo-atolye
 *   node scripts/import-klasman.mjs --file=/yol/MASTER_veri.xlsx
 *
 * TASARIM KARARI — SESSİZ VERİ UYDURMA YOK:
 *   Katalogda karşılığı olmayan bir yetenek terimi görülürse betik hiçbir şey
 *   yazmadan durur ve eksik terimleri listeler. Böyle bir terim "atlanırsa"
 *   atölye eksik yetenekle içeri girer ve bunu kimse fark etmez.
 *
 * TEKRAR ÇALIŞTIRILABİLİR: atölyeler code üzerinden upsert edilir; bandın
 *   PROFILE yetenekleri her seferinde silinip yeniden yazılır (kaynak neyse o).
 */
import postgres from 'postgres'
import XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : def
}
const APPLY = process.argv.includes('--apply')
const TENANT_SLUG = arg('tenant', 'default')
const FILE = arg('file', 'C:/Users/bhaka/Desktop/Klasman/MEVCUT_DURUM/MASTER_veri.xlsx')

const env = Object.fromEntries(
  readFileSync(join(__dir, '../.env.local'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

/* ---------- Terim normalizasyonu (023b migration'ıyla AYNI kural) ---------- */
const TR = { 'ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I','ö':'o','Ö':'O','ş':'s','Ş':'S','ü':'u','Ü':'U' }
const norm = (s) => s.split('').map((c) => TR[c] ?? c).join('')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')

/* Klasman kolonu → PES boyut kodu */
const DIM = {
  ANA_GRUP: 'ana_grup', CINSIYET: 'cinsiyet_yas', KUMAS_GRUBU: 'kumas_grubu',
  KLASMAN: 'klasman', KUMAS_TURU: 'kumas_turu', MAKINE_PARKURU: 'makine_parkuru',
}
/* Normalizasyonun yakalayamadığı, PES'te farklı kodla duran terimler */
const ALIAS = {
  makine_parkuru: {
    '4 İplik Overlok': 'OVERLOK_4I',
    '5 İplik Overlok': 'OVERLOK_5I',
    'Punterez':        'PUNTERIZ',
    'İlik dügme':      'ILIK',
  },
}

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })

/* ---------- 1. Kaynak ---------- */
const rows = XLSX.utils.sheet_to_json(XLSX.readFile(FILE).Sheets['Long'])
const txt = (v) => String(v ?? '').trim()
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null }

/* ---------- 2. Katalog ---------- */
const catRows = await sql`
  SELECT d.code AS dim, v.code
  FROM capability_dimension d JOIN capability_value v ON v.dimension_id = d.id`
const katalog = {}
for (const r of catRows) (katalog[r.dim] ||= new Set()).add(r.code)

const [tenant] = await sql`SELECT id, name FROM tenant WHERE slug = ${TENANT_SLUG}`
if (!tenant) { console.error(`✗ tenant bulunamadı: ${TENANT_SLUG}`); process.exit(1) }

/* ---------- 3. Çözümleme ---------- */
const eksik = new Map()   // "boyut :: terim" -> kaç atölyede
const plan = []

for (const r of rows) {
  const code = txt(r.ID)
  if (!code) continue

  const caps = []
  for (const [kcol, dim] of Object.entries(DIM)) {
    for (const parca of txt(r[kcol]).split(',')) {
      const terim = parca.trim()
      if (!terim) continue
      const vcode = ALIAS[dim]?.[terim] ?? norm(terim)
      if (!katalog[dim]?.has(vcode)) {
        const k = `${dim} :: ${terim}  (beklenen kod: ${vcode})`
        eksik.set(k, (eksik.get(k) ?? 0) + 1)
        continue
      }
      caps.push({ dim, vcode })
    }
  }

  const tip = txt(r.ATOLYE_TIPI)
  const guven = txt(r.GUVEN)
  plan.push({
    code,
    name: txt(r.ATOLYE_ADI) || code,
    production_type: tip || null,
    monthly_capacity: num(r.AYLIK_KAPASITE),
    data_confidence: ['Yüksek', 'Orta', 'Düşük'].includes(guven) ? guven : null,
    notes: txt(r.KAPASITE_NOTU) || null,
    sorumlu: txt(r.SORUMLU) || null,
    caps,
  })
}

/* ---------- 4. Eksik terim varsa DUR ---------- */
if (eksik.size) {
  console.error(`\n✗ Katalogda karşılığı olmayan ${eksik.size} terim — hiçbir şey yazılmadı.\n`)
  for (const [k, n] of [...eksik].sort((a, b) => b[1] - a[1])) {
    console.error(`   ${String(n).padStart(3)} atölyede  ${k}`)
  }
  console.error(`\n   Çözüm: bu terimleri 023b migration'ına ekleyip yeniden çalıştırın.`)
  await sql.end()
  process.exit(1)
}

/* ---------- 5. Rapor ---------- */
const mevcut = new Set((await sql`SELECT code FROM workshop`).map((r) => r.code))
const yeni = plan.filter((p) => !mevcut.has(p.code))
const guncel = plan.filter((p) => mevcut.has(p.code))
const capToplam = plan.reduce((a, p) => a + p.caps.length, 0)

console.log(`\nKaynak    : ${FILE}`)
console.log(`Tenant    : ${tenant.name} (${TENANT_SLUG})`)
console.log(`Satır     : ${rows.length}  →  işlenecek ${plan.length}`)
console.log(`Atölye    : ${yeni.length} yeni, ${guncel.length} güncelleme`)
console.log(`Yetenek   : ${capToplam} atama (atölye başına ort. ${(capToplam / plan.length).toFixed(1)})`)
console.log(`Eksik alan: ${plan.filter((p) => !p.production_type).length} üretim tipi, ` +
            `${plan.filter((p) => !p.monthly_capacity).length} kapasite, ` +
            `${plan.filter((p) => !p.data_confidence).length} güven`)

if (!APPLY) {
  console.log(`\nKURU ÇALIŞMA — hiçbir şey yazılmadı. Yazmak için: --apply\n`)
  await sql.end()
  process.exit(0)
}

/* ---------- 6. Yazma ---------- */
let nWs = 0, nLine = 0, nCap = 0, nContact = 0
await sql.begin(async (tx) => {
  for (const p of plan) {
    const [ws] = await tx`
      INSERT INTO workshop (tenant_id, code, name, type, production_type, monthly_capacity, line_count)
      VALUES (${tenant.id}, ${p.code}, ${p.name}, 'X', ${p.production_type}, ${p.monthly_capacity}, 1)
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        production_type = EXCLUDED.production_type,
        monthly_capacity = EXCLUDED.monthly_capacity,
        updated_at = NOW()
      RETURNING id`
    nWs++

    await tx`
      INSERT INTO workshop_account (workshop_id, tenant_id, notes, data_confidence, source_ref)
      VALUES (${ws.id}, ${tenant.id}, ${p.notes}, ${p.data_confidence}, ${'Klasman ' + p.code})
      ON CONFLICT (workshop_id) DO UPDATE SET
        notes = EXCLUDED.notes,
        data_confidence = EXCLUDED.data_confidence,
        source_ref = EXCLUDED.source_ref,
        updated_at = NOW()`

    /* Sorumlu — birincil kişi. Kısmi unique index (workshop_id WHERE is_primary)
       yüzünden önce mevcut birincil kayıt temizlenir. */
    if (p.sorumlu) {
      await tx`DELETE FROM workshop_contact WHERE workshop_id = ${ws.id} AND is_primary`
      await tx`
        INSERT INTO workshop_contact (workshop_id, tenant_id, name, role, is_primary)
        VALUES (${ws.id}, ${tenant.id}, ${p.sorumlu}, 'Sorumlu', TRUE)`
      nContact++
    }

    /* Klasman verisi atölye seviyesinde; PES yetenekleri bant seviyesinde tutar.
       Varsayılan banda yazılır — arkadaş sonradan bant bazında incelteceği için
       kaynak burası, atölye özeti bundan türetilir. */
    const bantKod = `${p.code}-B1`
    const [line] = await tx`
      INSERT INTO production_line (tenant_id, workshop_id, code, name, line_type)
      VALUES (${tenant.id}, ${ws.id}, ${bantKod}, 'Bant 1', 'Normal')
      ON CONFLICT (code) DO UPDATE SET workshop_id = EXCLUDED.workshop_id, updated_at = NOW()
      RETURNING id`
    nLine++

    /* Kaynak neyse o: eski PROFILE kayıtları silinip yeniden yazılır.
       TEK sorguda toplu ekleme — atölye başına ~26 yetenek var; tek tek
       göndermek 3000 ağ gidiş-dönüşü demek (dakikalarca sürer). */
    await tx`DELETE FROM line_capability WHERE line_id = ${line.id} AND attribute_type = 'PROFILE'`
    if (p.caps.length) {
      const satirlar = p.caps.map((c) => ({
        tenant_id: tenant.id, line_id: line.id,
        dimension_code: c.dim, value_code: c.vcode, attribute_type: 'PROFILE',
      }))
      await tx`
        INSERT INTO line_capability ${tx(satirlar, 'tenant_id', 'line_id', 'dimension_code', 'value_code', 'attribute_type')}
        ON CONFLICT (line_id, dimension_code, value_code, attribute_type) DO NOTHING`
      nCap += satirlar.length
    }
  }
})

console.log(`\n✓ Aktarıldı — atölye ${nWs} · bant ${nLine} · yetenek ${nCap} · sorumlu ${nContact}\n`)
await sql.end()
