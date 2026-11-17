// scripts/_migrate_kuru.mjs
/**
 * Migration'ı ve kontrol SQL'ini TEK işlemde çalıştırır, sonra GERİ ALIR.
 * Üretim DB'sine hiçbir şey yazılmaz.
 *
 * Kullanım: node scripts/_migrate_kuru.mjs 061_olcu_sartname.sql [supabase/tests/061_kontrol.sql]
 *
 * Migration dosyası BEGIN; ... COMMIT; biçiminde olmalı: son COMMIT; kesilir,
 * yerine kontrol SQL'i ve ROLLBACK; gelir. Kontrol SQL'i hatada RAISE EXCEPTION yapar.
 */
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(join(__dir, '../.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const [file, kontrol] = process.argv.slice(2)
if (!file) { console.error('Kullanım: node scripts/_migrate_kuru.mjs <dosya.sql> [kontrol.sql]'); process.exit(1) }

const text = readFileSync(join(__dir, '../supabase/migrations', file), 'utf8')
const son = text.lastIndexOf('COMMIT;')
if (son < 0) { console.error('FAIL', file, '-> COMMIT; bulunamadı'); process.exit(1) }
const govde = text.slice(0, son) + '\n' + (kontrol ? readFileSync(join(__dir, '..', kontrol), 'utf8') : '') + '\nROLLBACK;\n'

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15, onnotice: n => console.log('  ', n.message) })
try {
  await sql.unsafe(govde)
  console.log('KURU OK (geri alındı)', file)
} catch (e) {
  console.error('KURU FAIL', file, '->', e.message)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 3 })
}
