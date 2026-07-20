/**
 * Tek bir migration dosyasını uygular (tümünü baştan çalıştırmaz).
 *
 * Kullanım: node scripts/_migrate_one.mjs 019c_rls_role_hardening.sql
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

const file = process.argv[2]
if (!file) {
  console.error('Kullanım: node scripts/_migrate_one.mjs <dosya.sql>')
  process.exit(1)
}

// Admin (postgres) bağlantısı — DDL ve GRANT için gerekli
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })

try {
  const text = readFileSync(join(__dir, '../supabase/migrations', file), 'utf8')
  await sql.unsafe(text)
  console.log('OK  ', file)
} catch (e) {
  console.error('FAIL', file, '->', e.message)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 3 })
}
