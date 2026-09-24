/**
 * Model operasyon bülteni (Excel) → model_bulten + model_bulten_operasyon.
 *
 * Kullanım:
 *   node scripts/import_model_bulten.mjs --dosya "C:\\...\\pantolon-jean-uretim-case.xlsx"
 *   node scripts/import_model_bulten.mjs --dosya "..." --klasman PANTOLON --uygula
 *
 * --uygula olmadan hiçbir şey yazılmaz; bölüm dağılımı ve son kurala
 * düşen satırlar raporlanır.
 */
import postgres from 'postgres'
import XLSX from 'xlsx'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))
const UYGULA = process.argv.includes('--uygula')
const arg = (ad, v = null) => {
  const i = process.argv.indexOf(`--${ad}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : v
}
const DOSYA = arg('dosya')
const KLASMAN = arg('klasman')
if (!DOSYA) { console.error('HATA: --dosya zorunlu'); process.exit(1) }

const lib = await import('tsx/esm/api').then(async ({ register }) => {
  const un = register()
  const oku = await import('../lib/pes/bulten-oku.ts')
  const bolum = await import('../lib/pes/bulten-bolum.ts')
  un()
  return { ...oku, ...bolum }
})

const wb = XLSX.readFile(DOSYA)
if (!wb.Sheets['Bilgi'] || !wb.Sheets['Operasyonlar']) {
  console.error('HATA: dosyada "Bilgi" ve "Operasyonlar" sayfaları olmalı')
  process.exit(1)
}

const bilgiHam = XLSX.utils.sheet_to_json(wb.Sheets['Bilgi'], { header: 1, defval: null }).slice(1)
const bilgi = lib.bilgiCoz(bilgiHam)
const operasyonlar = lib.operasyonlariCoz(
  XLSX.utils.sheet_to_json(wb.Sheets['Operasyonlar'], { defval: null }))
const ozet = lib.bultenOzeti(operasyonlar)

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })

const [tenant] = await sql`SELECT id FROM tenant ORDER BY created_at LIMIT 1`
if (!tenant) { console.error('HATA: tenant yok'); await sql.end(); process.exit(1) }

const kurallarDb = await sql`
  SELECT oncelik, seviye1, tip, bolum FROM bulten_bolum_kurali
  WHERE tenant_id = ${tenant.id} ORDER BY oncelik`
const kurallar = kurallarDb.length ? kurallarDb : lib.TOHUM_KURALLAR
if (!kurallarDb.length) console.log('UYARI: veritabanında kural yok, tohum set kullanılıyor')

const bolumlu = operasyonlar.map(o => ({ ...o, bolum: lib.bolumBul(o, kurallar), bolum_kaynak: 'kural' }))
const toplam = lib.bolumToplamlari(operasyonlar, kurallar)
const sonKurala = operasyonlar.filter(o => lib.uygulananKural(o, kurallar)?.oncelik === 99)

console.log(`\n${bilgi.model_adi}  (${bilgi.plm_id ?? 'PLM yok'})`)
console.log(`  ${ozet.operasyonSayisi} operasyon, ${ozet.toplamSn} sn = ${ozet.toplamDk.toFixed(2)} dk`)
console.log(`  KESİM ${toplam.KESIM} sn · DİKİM ${toplam.DIKIM} sn · UKP ${toplam.UKP} sn`)

if (sonKurala.length) {
  console.log(`\n  ${sonKurala.length} satır son kurala (99) düştü — tanınmayan aşama/tip, DİKİM sayıldı:`)
  const gruplu = {}
  for (const o of sonKurala) {
    const k = `${o.seviye1 ?? '-'} / ${o.tip ?? '-'}`
    gruplu[k] = (gruplu[k] ?? 0) + 1
  }
  for (const [k, n] of Object.entries(gruplu)) console.log(`    ${k}  ×${n}`)
  console.log("  Bunlar doğru bölümde değilse bulten_bolum_kurali'na kural ekle.")
}

if (!UYGULA) {
  console.log('\nKURU ÇALIŞMA — hiçbir şey yazılmadı. Yazmak için --uygula ekle.')
  await sql.end(); process.exit(0)
}

const [bulten] = await sql.begin(async (tx) => {
  const [b] = await tx`
    INSERT INTO model_bulten (tenant_id, model_adi, plm_id, kumas_tipi, sezon,
                              siparis_adedi, klasman_kodu, kaynak_dosya, toplam_sn, not_metni)
    VALUES (${tenant.id}, ${bilgi.model_adi}, ${bilgi.plm_id}, ${bilgi.kumas_tipi},
            ${bilgi.sezon}, ${bilgi.siparis_adedi}, ${KLASMAN},
            ${DOSYA}, ${ozet.toplamSn}, ${bilgi.not_metni})
    RETURNING id, model_adi`
  for (const o of bolumlu) {
    await tx`
      INSERT INTO model_bulten_operasyon
        (bulten_id, tenant_id, sira_no, seviye1, seviye2, seviye3,
         cevrim_sn, tip, makine_kodu, oncesi, bolum, bolum_kaynak)
      VALUES (${b.id}, ${tenant.id}, ${o.sira_no}, ${o.seviye1}, ${o.seviye2}, ${o.seviye3},
              ${o.cevrim_sn}, ${o.tip}, ${o.makine_kodu}, ${o.oncesi}, ${o.bolum}, 'kural')`
  }
  return [b]
})

console.log(`\nYAZILDI: bülten #${bulten.id} — ${bulten.model_adi}, ${bolumlu.length} operasyon`)
await sql.end()
