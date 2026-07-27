#!/usr/bin/env node
/**
 * Ekip kurulumu — platformu kullanacak kişilerin hesaplarını toplu açar.
 *
 * KİMLER: teknik müdürler, Yalın uzmanlar ve paydaşlar. Bunlar sahadaki
 * "üretim teknik uzmanları"nın (Klasman SORUMLU alanı → workshop_contact)
 * bir üst kademesidir. O uzmanlar platformun KULLANICISI DEĞİL, VERİSİDİR —
 * atölyenin sorumlusu olarak kayıtlıdırlar, hesapları olmaz.
 *
 *   node scripts/ekip-kur.mjs --sablon      # ekip.csv şablonu üret
 *   node scripts/ekip-kur.mjs               # kuru çalışma — ne olacağını göster
 *   node scripts/ekip-kur.mjs --apply       # hesapları aç
 *
 * ekip.csv biçimi (noktalı virgülle; 4. sütun opsiyonel):
 *   ad;eposta;sifre;rol
 *   Ahmet Yılmaz;ahmet@pes.local;Gizli1234!
 *   Hakan Gök;hakan@pes.local;Gizli1234!;owner
 *
 * ROL: boş bırakılırsa 'admin'. 'owner' yalnız sistem sahibi içindir —
 * yetki farkı bugün yok (ikisi de her iki panele girer), ayrım kayıt
 * amaçlıdır ve ileride yetki ayrıştırmasının dayanağı olur.
 *
 * YETKİ: herkes 'admin' — her iki panel (/pes + /workshop), tüm atölyeler.
 *   Atölye havuzu AYRILMAZ: herkes 114 atölyeyi görür, ilgilendiğini
 *   "Sahiplen" ile işaretler (işaret erişim kısıtı değildir, bkz. 026).
 *   Teknik müdür / Yalın uzman rol ayrımı ve atölye bazlı görünürlük
 *   testler geçtikten SONRA açılacak; şema hazır (tenant_user.role).
 *
 * ŞİFRE: burada belirlenir, elden iletilir. Betik şifreleri ekrana basmaz.
 */
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const CSV = join(__dir, '..', 'ekip.csv')
const APPLY = process.argv.includes('--apply')
const SABLON = process.argv.includes('--sablon')

const env = Object.fromEntries(
  readFileSync(join(__dir, '../.env.local'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })

/* ---------- Şablon ---------- */
if (SABLON) {
  if (existsSync(CSV)) {
    console.error(`✗ ekip.csv zaten var — üzerine yazmıyorum. Silip tekrar deneyin.`)
    await sql.end()
    process.exit(1)
  }
  writeFileSync(CSV,
    'ad;eposta;sifre\n' +
    '# Örnek (satırı silin): Ahmet Yılmaz;ahmet@pes.local;Gizli1234!\n', 'utf8')
  console.log(`\n✓ Şablon yazıldı: ekip.csv`)
  console.log(`  Her satıra bir kişi: ad;eposta;sifre`)
  console.log(`  # ile başlayan satırlar yok sayılır.\n`)
  await sql.end()
  process.exit(0)
}

if (!existsSync(CSV)) {
  console.error(`\n✗ ekip.csv bulunamadı. Önce şablon üretin:\n    node scripts/ekip-kur.mjs --sablon\n`)
  await sql.end()
  process.exit(1)
}

/* ---------- Oku ve doğrula ---------- */
const satirlar = readFileSync(CSV, 'utf8').split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))

const basliksiz = satirlar[0]?.toLowerCase().startsWith('ad;') ? satirlar.slice(1) : satirlar
const kayitlar = []
const hatalar = []
const gorulenEposta = new Set()

const GECERLI_ROL = ['owner', 'admin', 'editor', 'viewer']

for (const [i, satir] of basliksiz.entries()) {
  const [ad, eposta, sifre, rolHam] = satir.split(';').map((x) => (x ?? '').trim())
  const no = i + 2
  const rol = rolHam || 'admin'

  if (!ad && !eposta && !sifre) continue
  if (!ad) hatalar.push(`satır ${no}: ad boş`)
  if (!eposta.includes('@')) hatalar.push(`satır ${no}: geçersiz e-posta "${eposta}"`)
  if (sifre.length < 8) hatalar.push(`satır ${no}: şifre en az 8 karakter olmalı`)
  if (!GECERLI_ROL.includes(rol)) hatalar.push(`satır ${no}: geçersiz rol "${rol}"`)

  const e = eposta.toLowerCase()
  if (gorulenEposta.has(e)) hatalar.push(`satır ${no}: "${e}" dosyada birden fazla kez var`)
  gorulenEposta.add(e)

  kayitlar.push({ ad, eposta: e, sifre, rol })
}

if (hatalar.length) {
  console.error(`\n✗ ${hatalar.length} sorun — hiçbir şey yapılmadı:\n`)
  for (const h of hatalar) console.error('   ' + h)
  console.error()
  await sql.end()
  process.exit(1)
}
if (!kayitlar.length) {
  console.error('\n✗ ekip.csv içinde kişi yok.\n')
  await sql.end()
  process.exit(1)
}

/* ---------- Rapor ---------- */
const [tenant] = await sql`SELECT id, name FROM tenant WHERE slug = 'default'`
const mevcutlar = new Set(
  (await sql`SELECT email FROM auth.users WHERE email = ANY(${[...gorulenEposta]})`).map((r) => r.email)
)
const [atolyeSayisi] = await sql`SELECT COUNT(*)::int c FROM workshop WHERE is_active`

console.log(`\nTenant : ${tenant.name}`)
console.log(`Yetki  : admin — her iki panel, ${atolyeSayisi.c} atölyenin tamamı`)
console.log(`Kişi   : ${kayitlar.length} (${kayitlar.filter((k) => !mevcutlar.has(k.eposta)).length} yeni, ${kayitlar.filter((k) => mevcutlar.has(k.eposta)).length} şifre güncelleme)\n`)
for (const k of kayitlar) {
  console.log(`   ${mevcutlar.has(k.eposta) ? '~' : '+'} ${k.ad.padEnd(22)} ${k.eposta.padEnd(30)} ${k.rol}`)
}

if (!APPLY) {
  console.log(`\nKURU ÇALIŞMA — hiçbir şey yazılmadı. Uygulamak için: --apply\n`)
  await sql.end()
  process.exit(0)
}

/* ---------- Yazma ----------
 * Hesap açmak için Supabase Admin API kullanılır, auth.users'a elle INSERT
 * DEĞİL. Elle yazılan satır görünürde doğru olur (identities dahil) ama
 * giriş "Database error querying schema" ile reddedilir — GoTrue'nun
 * beklediği tüm alan/kayıtları elle üretmek kırılgandır. Admin API bunu
 * kendi yapar. tenant_user ise bizim tablomuz, oraya SQL ile yazıyoruz.
 */
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let acilan = 0, guncellenen = 0
const basarisiz = []

for (const k of kayitlar) {
  const [mevcut] = await sql`SELECT id FROM auth.users WHERE email = ${k.eposta}`
  let uid

  if (mevcut) {
    uid = mevcut.id
    const { error } = await admin.auth.admin.updateUserById(uid, {
      password: k.sifre,
      email_confirm: true,
      user_metadata: { full_name: k.ad },
    })
    if (error) { basarisiz.push(`${k.eposta}: ${error.message}`); continue }
    guncellenen++
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: k.eposta,
      password: k.sifre,
      email_confirm: true,          // SMTP yok — doğrulama beklenirse kimse giremez
      user_metadata: { full_name: k.ad },
    })
    if (error) { basarisiz.push(`${k.eposta}: ${error.message}`); continue }
    uid = data.user.id
    acilan++
  }

  await sql`
    INSERT INTO tenant_user (tenant_id, user_id, role, is_primary)
    VALUES (${tenant.id}, ${uid}, ${k.rol}, TRUE)
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`
}

console.log(`\n✓ ${acilan} yeni hesap, ${guncellenen} güncelleme`)
if (basarisiz.length) {
  console.log(`✗ ${basarisiz.length} başarısız:`)
  for (const b of basarisiz) console.log('   ' + b)
}
console.log(`  Şifreleri kullanıcılara elden iletin.\n`)
await sql.end()
