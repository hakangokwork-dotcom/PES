#!/usr/bin/env node
/**
 * PES kullanıcısı açar / şifresini günceller.
 *
 *   node scripts/create-user.mjs --email=ahmet@pes.local --sifre='Gizli1234!'
 *   node scripts/create-user.mjs --email=ayse@pes.local  --sifre='Gizli1234!' --panel=atolye
 *   node scripts/create-user.mjs --liste            # mevcut kullanıcıları göster
 *
 * PANEL → ROL:
 *   --panel=tam     (VARSAYILAN) → rol 'admin'  → HER İKİ panel: /pes + /workshop
 *   --panel=atolye               → rol 'editor' → yalnız /workshop
 *
 * ŞU ANKİ KURULUM: ekip tam yetkili. Herkes atölye verisini girer, sonra
 * merkez panelinden değerlendirmeleri görür. Panel ayrımı (her atölyenin
 * yalnız kendi verisini görmesi) testler geçtikten SONRA açılacak —
 * altyapısı hazır: o gün hesaplar --panel=atolye ile güncellenir, kod
 * değişmez (bkz. lib/auth/panel-guard.ts).
 *
 * DİKKAT — yönetim paneli tenant tipine bağlıdır: /pes yalnız INTERNAL
 * tenant'ın owner/admin'ine açılır. Bireysel bir atölye tenant'ında 'admin'
 * rolü vermek o kişiyi yönetim paneline sokmaz.
 *
 * E-POSTA DOĞRULAMASI: hesap doğrulanmış olarak açılır (email_confirmed_at).
 * Test kurulumunda SMTP yok — doğrulama maili gönderilemez, beklenirse
 * kimse giremez. Adreslerin gerçek olması gerekmez.
 *
 * ŞİFRE: burada belirlenir, kullanıcıya elden iletilir. Betik şifreyi
 * ekrana basmaz; ne verdiysen o.
 */
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(join(__dir, '../.env.local'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.slice(n.length + 3) : d
}

/* 'tam' = her iki panel (admin). 'yonetim' eski ad, aynı role işaret eder. */
const PANEL_ROL = { tam: 'admin', yonetim: 'admin', atolye: 'editor' }

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })

/* ---------- Listeleme ---------- */
if (process.argv.includes('--liste')) {
  const rows = await sql`
    SELECT u.email, tu.role, t.slug AS tenant, t.type AS tenant_type, tu.is_primary,
           u.last_sign_in_at IS NOT NULL AS girdi
    FROM auth.users u
    LEFT JOIN tenant_user tu ON tu.user_id = u.id
    LEFT JOIN tenant t ON t.id = tu.tenant_id
    ORDER BY u.created_at`
  console.log('\n E-POSTA'.padEnd(34) + 'ROL'.padEnd(9) + 'TENANT'.padEnd(16) + 'PANEL'.padEnd(9) + 'GİRİŞ')
  console.log(' ' + '-'.repeat(74))
  for (const r of rows) {
    /* panel-guard.ts ile AYNI kural: internal tenant + owner/admin */
    const panel = r.tenant_type === 'internal' && (r.role === 'owner' || r.role === 'admin')
      ? 'yönetim' : 'atölye'
    console.log(' ' + String(r.email).padEnd(33) + String(r.role ?? '—').padEnd(9) +
      String(r.tenant ?? '—').padEnd(16) + panel.padEnd(9) + (r.girdi ? 'evet' : 'hayır'))
  }
  console.log()
  await sql.end()
  process.exit(0)
}

/* ---------- Girdi doğrulama ---------- */
const email = (arg('email') || '').trim().toLowerCase()
const sifre = arg('sifre')
const panel = arg('panel', 'tam')
const tenantSlug = arg('tenant', 'default')

const hata = []
if (!email || !email.includes('@')) hata.push('--email geçerli bir adres olmalı')
if (!sifre || sifre.length < 8) hata.push('--sifre en az 8 karakter olmalı')
if (!PANEL_ROL[panel]) hata.push(`--panel 'tam' veya 'atolye' olmalı (verilen: ${panel})`)
if (hata.length) {
  console.error('\n✗ ' + hata.join('\n✗ '))
  console.error('\nÖrnek: node scripts/create-user.mjs --email=ahmet@pes.local --sifre=\'Gizli1234!\'\n')
  await sql.end()
  process.exit(1)
}

const rol = PANEL_ROL[panel]
const [tenant] = await sql`SELECT id, name, type FROM tenant WHERE slug = ${tenantSlug}`
if (!tenant) {
  console.error(`✗ tenant bulunamadı: ${tenantSlug}`)
  await sql.end()
  process.exit(1)
}

/* Sessizce yanlış hesap açmayı önle: yönetim paneli internal tenant ister. */
if (panel !== 'atolye' && tenant.type !== 'internal') {
  console.error(`\n✗ '${tenantSlug}' tenant'ı '${tenant.type}' tipinde — yönetim paneli yalnız 'internal' tenant'ta açılır.`)
  console.error(`  Bu hesap açılsa bile /pes'e giremez, /workshop'a yönlendirilir.`)
  console.error(`  Ya --tenant=default kullan ya da --panel=atolye ver.\n`)
  await sql.end()
  process.exit(1)
}

/* ---------- Yazma ---------- */
let yeni = false
await sql.begin(async (tx) => {
  const [mevcut] = await tx`SELECT id FROM auth.users WHERE email = ${email}`
  let uid

  if (mevcut) {
    uid = mevcut.id
    await tx`
      UPDATE auth.users
      SET encrypted_password = crypt(${sifre}, gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
          updated_at = NOW()
      WHERE id = ${uid}`
  } else {
    yeni = true
    const [row] = await tx`
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${email}, crypt(${sifre}, gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, FALSE, FALSE,
        '', '', '', '', '', '', '', ''
      ) RETURNING id`
    uid = row.id
  }

  /* auth.identities ŞART: Supabase kimlik doğrulaması bu tabloyu okur.
     Yalnız auth.users yazmak hesabı görünürde oluşturur ama giriş
     "Database error querying schema" ile başarısız olur. */
  await tx`
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), ${uid},
      jsonb_build_object('sub', ${uid}::text, 'email', ${email}::text, 'email_verified', true, 'phone_verified', false),
      'email', ${uid}::text, NOW(), NOW(), NOW()
    )
    ON CONFLICT (provider_id, provider) DO NOTHING`

  /* Tenant üyeliği — kullanıcı zaten bağlıysa rolü güncellenir.
     is_primary: resolve_tenant_context() birden fazla üyelikte bunu seçer. */
  await tx`
    INSERT INTO tenant_user (tenant_id, user_id, role, is_primary)
    VALUES (${tenant.id}, ${uid}, ${rol}, TRUE)
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`
})

console.log(`\n✓ ${yeni ? 'Hesap açıldı' : 'Hesap güncellendi'}`)
console.log(`  e-posta : ${email}`)
console.log(`  rol     : ${rol}  (${panel === 'atolye' ? 'yalnız /workshop' : 'her iki panel: /pes + /workshop'})`)
console.log(`  tenant  : ${tenant.name} (${tenantSlug})`)
console.log(`\n  Şifreyi kullanıcıya elden ilet — betik ekrana basmaz.\n`)

await sql.end()
