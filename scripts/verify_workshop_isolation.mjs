#!/usr/bin/env node
/**
 * Atölye kısıtının iki yönlü kanıtı (033).
 *
 * NEDEN VAR: /workshop paneli atölyeye açılacak. Kısıt RLS'te; bir
 * politikada hata olursa iki şeyden biri olur ve ikisi de sessizdir:
 *   - kısıt tutmaz  -> atölye başka atölyenin verisini görür
 *   - fazla tutar   -> merkez ekibi kendi verisini kaybeder
 * Bu yüzden her iki yön de ölçülür.
 *
 * UYGULAMANIN ROLÜYLE (pes_app, NOBYPASSRLS) çalışır — yönetici
 * bağlantısı BYPASSRLS olduğu için hiçbir şey kanıtlamaz.
 *
 *   node scripts/verify_workshop_isolation.mjs
 */
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))

const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 20 })

/* Atölyeye bağlı, veri taşıyan tablolar. Hepsini denemek gereksiz;
   doğrudan / dolaylı / özel bağ tiplerinin her birinden örnek alınır. */
const TABLOLAR = [
  { ad: 'workshop', kolon: 'id' },
  { ad: 'production_line', kolon: 'workshop_id' },
  { ad: 'workshop_denetim', kolon: 'workshop_id' },
  { ad: 'workshop_account', kolon: 'workshop_id' },
  { ad: 'workshop_profil', kolon: 'workshop_id' },
  { ad: 'workshop_contact', kolon: 'workshop_id' },
  { ad: 'declaration_quality', kolon: 'workshop_id' },
]

let gecti = 0, kaldi = 0
const kontrol = (ad, beklenen, gercek) => {
  const ok = String(beklenen) === String(gercek)
  if (ok) { gecti++; console.log(`  OK    ${ad} -> ${gercek}`) }
  else { kaldi++; console.log(`  KALDI ${ad} -> beklenen ${beklenen}, gelen ${gercek}`) }
}

function baglamda(tenantId, workshopId, fn) {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    await tx`SELECT set_config('app.current_workshop_id', ${workshopId === null ? '' : String(workshopId)}, true)`
    return fn(tx)
  })
}

try {
  const [t] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  // Verisi en çok olan atölyeyi seç: boş bir atölye hiçbir şey kanıtlamaz.
  const [hedef] = await yonetici`
    SELECT w.id, w.code, w.name,
           (SELECT count(*) FROM production_line l WHERE l.workshop_id = w.id) AS bant
      FROM workshop w WHERE w.tenant_id = ${t.id}
     ORDER BY bant DESC, w.id LIMIT 1`
  console.log(`hedef atölye: #${hedef.id} ${hedef.code} — ${hedef.name}\n`)

  console.log('MERKEZ KULLANICISI (atölye bağı yok) — kısıt uygulanmamalı')
  const merkez = {}
  for (const tb of TABLOLAR) {
    const [r] = await baglamda(t.id, null, (sql) =>
      sql`SELECT count(*)::int AS n FROM ${sql(tb.ad)}`)
    merkez[tb.ad] = r.n
    kontrol(`${tb.ad} görülüyor`, true, r.n > 0)
  }

  console.log('\nATÖLYE KULLANICISI — yalnız kendi satırları')
  for (const tb of TABLOLAR) {
    const [r] = await baglamda(t.id, hedef.id, (sql) =>
      sql`SELECT count(*)::int AS n FROM ${sql(tb.ad)}`)
    const [yabanci] = await baglamda(t.id, hedef.id, (sql) =>
      sql`SELECT count(*)::int AS n FROM ${sql(tb.ad)}
           WHERE ${sql(tb.kolon)} <> ${hedef.id}`)
    kontrol(`${tb.ad}: yabancı satır sızmıyor`, 0, yabanci.n)
    // Kısıt gerçekten daraltmış olmalı; aksi halde test bir şey ölçmüyordur.
    if (merkez[tb.ad] > r.n) {
      console.log(`        (${merkez[tb.ad]} -> ${r.n} satıra düştü)`)
    }
  }

  console.log('\nYAZMA — başka atölyeye kayıt açılamamalı')
  const [baska] = await yonetici`
    SELECT id FROM workshop WHERE tenant_id = ${t.id} AND id <> ${hedef.id} LIMIT 1`
  let yazildi = false
  try {
    await baglamda(t.id, hedef.id, async (sql) => {
      await sql`
        INSERT INTO workshop_interaction (tenant_id, workshop_id, kind, occurred_at, note)
        VALUES (${t.id}, ${baska.id}, 'ziyaret', CURRENT_DATE, 'izolasyon denemesi')`
      yazildi = true
      throw new Error('GERI_AL')
    })
  } catch { /* beklenen */ }
  kontrol('başka atölyeye satır yazılamıyor', false, yazildi)

  console.log('\nKATALOG — atölye kendi sorularını görebilmeli')
  const [kat] = await baglamda(t.id, hedef.id, (sql) =>
    sql`SELECT count(*)::int AS n FROM olgunluk_kriter`)
  kontrol('olgunluk kriterleri okunuyor', true, kat.n > 0)
} catch (e) {
  console.error('\nFAIL:', e.message)
  process.exitCode = 1
} finally {
  await yonetici.end({ timeout: 3 })
  await uygulama.end({ timeout: 3 })
}

console.log(`\n${gecti} geçti, ${kaldi} kaldı`)
if (kaldi > 0) process.exitCode = 1
