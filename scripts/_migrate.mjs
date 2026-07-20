import postgres from 'postgres'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(join(__dir, '../.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const PW = decodeURIComponent(env.DATABASE_URL.split(':')[2].split('@')[0])

const sql = postgres({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  username: 'postgres.esucqswvhlnrmcownhbd', password: PW,
  max: 1, prepare: false, connect_timeout: 15, idle_timeout: 30,
})

const dir = join(__dir, '../supabase/migrations')
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
console.log('Applying', files.length, 'migrations...')
for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8')
  try {
    await sql.unsafe(text)
    console.log('OK  ', f)
  } catch (e) {
    console.log('FAIL', f, '->', e.message)
    await sql.end({ timeout: 3 })
    process.exit(1)
  }
}
await sql.end({ timeout: 3 })
console.log('ALL DONE')
