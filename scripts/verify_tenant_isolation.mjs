/**
 * Tenant izolasyonunun GERÇEKTEN çalıştığını kanıtlar.
 *
 * 019b RLS politikalarını kurmuştu ama uygulama `postgres` rolüyle
 * bağlandığı için (rolbypassrls=true) hepsi atıldı. 019c ile uygulama
 * pes_app rolüne geçti. Bu script farkı ölçer.
 *
 * Kullanım: node scripts/verify_tenant_isolation.mjs
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

const TABLES = ['workshop', 'monthly_expense', 'workshop_account', 'workshop_interaction']

let failures = 0
const check = (label, actual, expected) => {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`  ${ok ? 'GECTI' : 'KALDI'}  ${label}: ${actual} (beklenen ${expected})`)
}

const admin = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
const app = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 15 })

try {
  const [{ rolbypassrls, rolname }] = await app`
    select rolname, rolbypassrls from pg_roles where rolname = current_user
  `
  console.log(`Uygulama rolü: ${rolname}, RLS baypas: ${rolbypassrls}\n`)
  if (rolbypassrls) {
    console.log('DURDURULDU: uygulama rolü RLS baypas ediyor, izolasyon testi anlamsız.')
    process.exit(1)
  }

  const tenants = await admin`select id, slug from tenant order by slug`
  console.log('Tenant sayısı:', tenants.length, '->', tenants.map(t => t.slug).join(', '), '\n')

  // --- 1. Tenant context YOKken hiçbir satır görünmemeli ---
  console.log('1) Tenant context ayarlanmadan (RLS engellemeli):')
  for (const t of TABLES) {
    const [{ n }] = await app.unsafe(`select count(*)::int as n from ${t}`)
    check(t, n, 0)
  }

  // --- 2. Her tenant kendi satırlarını görmeli, fazlasını değil ---
  console.log('\n2) Tenant context ile (kendi verisi görünmeli):')
  for (const t of tenants) {
    const [{ n: expected }] = await admin`
      select count(*)::int as n from workshop where tenant_id = ${t.id}
    `
    const actual = await app.begin(async (tx) => {
      await tx`select set_config('app.current_tenant_id', ${t.id}, true)`
      const [{ n }] = await tx`select count(*)::int as n from workshop`
      return n
    })
    check(`workshop / ${t.slug}`, actual, expected)
  }

  // --- 3. Çapraz tenant sızıntısı: A context'inde B'nin satırı görünmemeli ---
  console.log('\n3) Çapraz tenant sızıntısı (0 olmalı):')
  if (tenants.length < 2) {
    console.log('  ATLANDI: karşılaştırma için en az 2 tenant gerekli.')
  } else {
    const [a, b] = tenants
    const leaked = await app.begin(async (tx) => {
      await tx`select set_config('app.current_tenant_id', ${a.id}, true)`
      const [{ n }] = await tx`
        select count(*)::int as n from workshop where tenant_id = ${b.id}
      `
      return n
    })
    check(`${a.slug} context'inde ${b.slug} satırları`, leaked, 0)
  }

  // --- 4. Bootstrap fonksiyonu RLS'e rağmen çalışmalı ---
  console.log('\n4) resolve_tenant_context bootstrap (RLS öncesi çalışmalı):')
  const [anyUser] = await admin`select user_id from tenant_user limit 1`
  if (!anyUser) {
    console.log('  ATLANDI: tenant_user boş.')
  } else {
    const rows = await app`select * from resolve_tenant_context(${anyUser.user_id}::uuid)`
    check('bootstrap satır sayısı', rows.length, 1)
  }

  console.log(`\n${failures === 0 ? 'TUM TESTLER GECTI' : failures + ' TEST KALDI'}`)
  process.exitCode = failures === 0 ? 0 : 1
} catch (e) {
  console.error('HATA:', e.message)
  process.exitCode = 1
} finally {
  await admin.end({ timeout: 2 })
  await app.end({ timeout: 2 })
}
