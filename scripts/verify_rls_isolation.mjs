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

const sql = postgres(env.DATABASE_URL, {
  max: 1,
  prepare: false,
})

async function main() {
  console.log('=== RLS FORCE Izolasyon Testi ===\n')

  console.log('0) Mevcut role bilgileri')
  const me = await sql`
    SELECT current_user AS user, session_user AS session_user,
           current_setting('is_superuser') AS superuser,
           rolbypassrls
    FROM pg_roles WHERE rolname = current_user
  `
  console.log('   ', me[0])

  console.log('\n0b) workshop tablosu sahibi & RLS durumu')
  const tbl = await sql`
    SELECT relname, relowner::regrole AS owner, relrowsecurity AS rls, relforcerowsecurity AS force
    FROM pg_class WHERE relname = 'workshop'
  `
  console.log('   ', tbl[0])

  console.log('\n0c) workshop policies')
  const pol = await sql`
    SELECT polname, polcmd FROM pg_policy
    WHERE polrelid = 'workshop'::regclass
  `
  console.log('   ', pol)

  console.log('\n1) Tenant context YOK -> RLS engellemeli (beklenen: 0 ama BYPASSRLS varsa 10)')
  const noCtxRows = await sql`SELECT count(*)::int AS cnt FROM workshop`
  console.log('   workshop count =', noCtxRows[0].cnt)

  console.log('\n2) Default tenant_id getir')
  const tRows = await sql`SELECT id FROM tenant WHERE slug='default' LIMIT 1`
  const defaultId = tRows[0]?.id
  console.log('   default tenant id =', defaultId)

  console.log('\n3) Tenant context VAR (transaction icinde) -> beklenen: 10')
  const withCtx = await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${defaultId}, true)`
    const r = await tx`SELECT count(*)::int AS cnt FROM workshop`
    return r[0].cnt
  })
  console.log('   workshop count =', withCtx)

  console.log('\n4) Bogus tenant_id -> beklenen: 0 (BYPASSRLS varsa 10)')
  const fake = '00000000-0000-0000-0000-000000000000'
  const withFake = await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${fake}, true)`
    const r = await tx`SELECT count(*)::int AS cnt FROM workshop`
    return r[0].cnt
  })
  console.log('   workshop count =', withFake)

  console.log('\n5) authenticated rolune SET LOCAL ROLE ile gec, sonra bogus tenant -> beklenen: 0')
  try {
    const asAuth = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${fake}, true)`
      await tx`SET LOCAL ROLE authenticated`
      const r = await tx`SELECT count(*)::int AS cnt FROM workshop`
      return r[0].cnt
    })
    console.log('   workshop count (authenticated, fake tenant) =', asAuth)
  } catch (e) {
    console.log('   HATA:', e.message)
  }

  console.log('\n6) authenticated rol + dogru tenant -> beklenen: 10')
  try {
    const asAuthOk = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${defaultId}, true)`
      await tx`SET LOCAL ROLE authenticated`
      const r = await tx`SELECT count(*)::int AS cnt FROM workshop`
      return r[0].cnt
    })
    console.log('   workshop count (authenticated, valid tenant) =', asAuthOk)
  } catch (e) {
    console.log('   HATA:', e.message)
  }

  await sql.end()
  console.log('\n=== TEST BITTI ===')
}

main().catch((err) => {
  console.error('HATA:', err.message)
  process.exit(1)
})
