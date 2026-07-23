#!/usr/bin/env node
/**
 * Her şablon için: İNDİR → HİÇ DEĞİŞTİRMEDEN YÜKLE → sonucu doğrula.
 *
 * NEDEN VAR: 2026-07-23'te bir kullanıcı "Atölye Kurulum" şablonunu indirip
 * yükleyince "value too long for type character(1)" aldı. Sebep, şablonun
 * `tip` alanına "CMT" örneği vermesi ama import kodunun bunu CHAR(1) olan
 * workshop.type'a yazmasıydı. Aynı sınıftan üç hata daha vardı (duruş tipinde
 * Türkçe karakter uyumsuzluğu, "Küçük" bant tipinin sessizce Normal'e düşmesi,
 * changeover model kodlarının hiç yazılmaması).
 *
 * Bu betik o hata sınıfını bir daha sessizce geçirmez: şablonun kendi örnek
 * verisi, kendi import ucundan geçemiyorsa kullanıcı da geçiremez.
 *
 *   node scripts/verify_sablonlar.mjs --email=... --sifre=...
 *   node scripts/verify_sablonlar.mjs --email=... --sifre=... --url=https://...
 *
 * Kendi ZZTEST atölyesini açar ve sonunda siler; gerçek atölyelere dokunmaz.
 */
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`))
  return h ? h.slice(n.length + 3) : d
}
const EMAIL = arg('email')
const SIFRE = arg('sifre')
const TABAN = arg('url', 'http://localhost:3000')

if (!EMAIL || !SIFRE) {
  console.error('\nKullanım: node scripts/verify_sablonlar.mjs --email=... --sifre=...')
  console.error('  (şifre koda gömülmez; kendi hesabınızla çalıştırın)\n')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(join(__dir, '../.env.local'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })

const giris = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
  body: JSON.stringify({ email: EMAIL, password: SIFRE }),
})
const oturum = await giris.json()
if (!oturum.access_token) {
  console.error('✗ Giriş başarısız:', oturum.error_description ?? oturum.msg ?? JSON.stringify(oturum))
  await sql.end(); process.exit(1)
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const cerez = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(oturum)).toString('base64')}`

const [t] = await sql`SELECT id FROM tenant WHERE slug='default'`
await sql`DELETE FROM workshop WHERE code LIKE 'ZZTEST%'`
const [ws] = await sql`
  INSERT INTO workshop (tenant_id, code, name, type, total_staff, sewing_staff, ukp_staff,
                        cutting_staff, management, indirect, line_count, daily_target, net_hours_day)
  VALUES (${t.id}, 'ZZTEST-SBL', 'Sablon Dogrulama', 'X', 0,0,0,0,0,0,0,0,9) RETURNING id`

/* setup önce çalışmalı: BANT-01/02/03'ü o açıyor, diğer şablonlar onları arıyor. */
const SIRA = ['setup', 'production', 'expenses', 'quality', 'downtime', 'workforce', 'changeover']
let hata = 0

console.log(`\nHedef: ${TABAN}\n`)
for (const tip of SIRA) {
  const s = await fetch(`${TABAN}/api/pes/templates/${tip}`, { headers: { cookie: cerez } })
  if (!s.ok) { console.log(`  KALDI  ${tip.padEnd(14)} şablon indirilemedi (${s.status})`); hata++; continue }
  const csv = await s.text()

  const fd = new FormData()
  fd.append('file', new Blob([csv], { type: 'text/csv' }), `${tip}.csv`)
  fd.append('workshop_id', String(ws.id))
  fd.append('year', '2026'); fd.append('month', '4')
  const y = await fetch(`${TABAN}/api/pes/import/${tip}`, { method: 'POST', headers: { cookie: cerez }, body: fd })
  const d = await y.json().catch(() => ({}))
  if (y.ok) console.log(`  GECTI  ${tip.padEnd(14)} ${d.message ?? d.imported}`)
  else { console.log(`  KALDI  ${tip.padEnd(14)} HTTP ${y.status}: ${d.error}`); hata++ }
}

/* Kritik alanlar gerçekten doğru kolona ve doğru değerle gitti mi? */
const [son] = await sql`SELECT type, production_type, bolge FROM workshop WHERE id=${ws.id}`
const bantlar = await sql`SELECT code, line_type FROM production_line WHERE workshop_id=${ws.id} ORDER BY code`
const durus = await sql`SELECT DISTINCT downtime_type FROM downtime_record WHERE workshop_id=${ws.id} ORDER BY 1`

const kontrol = (etiket, kosul) => {
  if (!kosul) hata++
  console.log(`  ${kosul ? 'GECTI' : 'KALDI'}  ${etiket}`)
}
console.log('\nAlan doğrulamaları:')
kontrol(`workshop.type korundu ('${son.type}' — şablon buraya yazmamalı)`, son.type === 'X')
kontrol(`production_type doğru kolona yazıldı ('${son.production_type}')`, son.production_type === 'CMT')
kontrol(`bolge geçerli aralıkta (${son.bolge})`, son.bolge >= 1 && son.bolge <= 6)
kontrol(`'Küçük' bant tipi korundu`, bantlar.some((b) => b.line_type === 'Küçük'))
kontrol(`duruş tipleri CHECK ile uyumlu (${durus.map((d) => d.downtime_type).join(', ')})`, durus.length === 4)

await sql`DELETE FROM workshop WHERE code LIKE 'ZZTEST%'`
const [k] = await sql`SELECT count(*)::int c FROM workshop WHERE code LIKE 'ZZTEST%'`
if (k.c > 0) { console.log(`\n✗ Temizlik başarısız: ${k.c} ZZTEST satırı kaldı`); hata++ }

console.log(hata === 0 ? '\n✓ TÜM ŞABLONLAR GEÇTİ\n' : `\n✗ ${hata} başarısız kontrol\n`)
await sql.end()
process.exit(hata === 0 ? 0 : 1)
