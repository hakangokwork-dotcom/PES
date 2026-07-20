import postgres from 'postgres'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const PW = decodeURIComponent(env.DATABASE_URL.split(':')[2].split('@')[0])
const sql = postgres({ host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  username: 'postgres.esucqswvhlnrmcownhbd', password: PW, max: 1, prepare: false, connect_timeout: 15 })

const ACCOUNTS = [
  { email: 'admin@pes.local',  password: 'Admin1234!',  tenantSlug: 'default',     role: 'owner' },
  { email: 'atolye@pes.local', password: 'Atolye1234!', tenantSlug: 'demo-atolye', role: 'owner' },
]

try {
  // 1) demo-atolye tenant (individual) — yoksa oluştur
  await sql`
    INSERT INTO tenant (slug, name, type, locale, status)
    VALUES ('demo-atolye', 'Demo Atölye', 'individual', 'tr', 'active')
    ON CONFLICT (slug) DO NOTHING`

  for (const a of ACCOUNTS) {
    // 2) auth kullanıcısı — yoksa oluştur
    const existing = await sql`SELECT id FROM auth.users WHERE email = ${a.email} LIMIT 1`
    let uid
    if (existing.length) {
      uid = existing[0].id
      // şifreyi garanti et
      await sql`UPDATE auth.users SET encrypted_password = crypt(${a.password}, gen_salt('bf')), updated_at = now() WHERE id = ${uid}`
      console.log('exists ', a.email, uid)
    } else {
      const rows = await sql`
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, created_at, updated_at,
          raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          email_change_token_current, phone_change, phone_change_token, reauthentication_token
        ) VALUES (
          '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          ${a.email}, crypt(${a.password}, gen_salt('bf')),
          now(), now(), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false,
          '', '', '', '', '', '', '', ''
        ) RETURNING id`
      uid = rows[0].id
      console.log('created', a.email, uid)
    }

    // 3) identity (email provider) — yoksa oluştur
    await sql`
      INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(), ${uid},
        jsonb_build_object('sub', ${uid}::text, 'email', ${a.email}::text, 'email_verified', true, 'phone_verified', false),
        'email', ${uid}::text, now(), now(), now()
      )
      ON CONFLICT (provider_id, provider) DO NOTHING`

    // 4) tenant_user — primary
    const t = await sql`SELECT id FROM tenant WHERE slug = ${a.tenantSlug} LIMIT 1`
    const tid = t[0].id
    await sql`
      INSERT INTO tenant_user (tenant_id, user_id, role, is_primary, created_at)
      VALUES (${tid}, ${uid}, ${a.role}, true, now())
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, is_primary = true`
    console.log('   -> tenant_user', a.tenantSlug, a.role)
  }

  // özet
  const summary = await sql`
    SELECT u.email, tu.role, t.slug, t.type, tu.is_primary
    FROM auth.users u
    JOIN tenant_user tu ON tu.user_id = u.id
    JOIN tenant t ON t.id = tu.tenant_id
    ORDER BY u.email`
  console.log('SUMMARY:', JSON.stringify(summary, null, 1))
} catch (e) { console.log('ERR', e.message) }
await sql.end({ timeout: 3 })
