#!/usr/bin/env node
/**
 * Atölye kısıtının iki yönlü kanıtı (033/035).
 *
 * NEDEN VAR: /workshop paneli atölyeye açılacak. Kısıt RLS'te; bir
 * politikada hata olursa iki şeyden biri olur ve ikisi de sessizdir:
 *   - kısıt tutmaz  -> atölye başka atölyenin verisini görür
 *   - fazla tutar   -> merkez ekibi kendi verisini kaybeder
 *
 * ÖRNEKLEME YAPMAZ. İlk sürümü yedi tablodan örnek alıyordu ve tam da bu
 * yüzden gerçek bir açığı kaçırdı: model_library'nin beş politikası var,
 * atölye kısıtı yalnız birine eklenmişti ve PERMISSIVE politikalar
 * OR'landığı için SELECT hiç kısıtlanmıyordu. Artık workshop_id kolonu
 * TAŞIYAN HER TABLO taranıyor — yeni bir tablo eklendiğinde otomatik
 * kapsama girer, listeye eklenmesi gerekmez.
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

/* Kimlik çözümleme tabloları kısıt dışıdır: kısıtlanırsa context'in
   kendisi çözülemez (033 notu). */
const HARIC = new Set(['tenant_user', 'pes_user_roles', 'workshop_user'])

let gecti = 0, kaldi = 0
const kontrol = (ad, ok, ek = '') => {
  if (ok) { gecti++; console.log(`  OK    ${ad}${ek}`) }
  else { kaldi++; console.log(`  KALDI ${ad}${ek}`) }
}

function baglamda(tenantId, workshopId, fn) {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    await tx`SELECT set_config('app.current_workshop_id',
               ${workshopId === null ? '' : String(workshopId)}, true)`
    return fn(tx)
  })
}

try {
  // workshop_id taşıyan HER tablo.
  const tablolar = (await yonetici`
    SELECT c.table_name AS ad
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_name = c.table_name AND tb.table_schema = 'public'
       AND tb.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.column_name = 'workshop_id'
     ORDER BY c.table_name`).map((r) => r.ad).filter((a) => !HARIC.has(a))

  /* HER TENANT taranır. İlk sürüm yalnız 'default'a bakıyordu ve gerçek
     bir açığı (model_library) tam da bu yüzden kaçırdı: o tablo default'ta
     boş, veri demo-atolye'de. Tenant seçimi testin gücünü belirlememeli. */
  const tenantlar = await yonetici`
    SELECT t.id, t.slug, count(w.id)::int AS atolye
      FROM tenant t JOIN workshop w ON w.tenant_id = t.id
     GROUP BY t.id, t.slug HAVING count(w.id) > 1 ORDER BY t.slug`

  console.log(`taranan tablo: ${tablolar.length} (workshop_id taşıyan hepsi)`)
  console.log(`taranan tenant: ${tenantlar.map((x) => `${x.slug}(${x.atolye})`).join(', ')}`)

  for (const t of tenantlar) {
    // Verisi en çok olan atölye: boş bir atölye hiçbir şey kanıtlamaz.
    const [hedef] = await yonetici`
      SELECT w.id, w.code, w.name,
             (SELECT count(*) FROM production_line l WHERE l.workshop_id = w.id) AS bant
        FROM workshop w WHERE w.tenant_id = ${t.id}
       ORDER BY bant DESC, w.id LIMIT 1`

    console.log(`\n=== ${t.slug} · hedef #${hedef.id} ${hedef.code} — ${hedef.name} ===`)
    console.log('SIZINTI — atölye kullanıcısına başka atölyenin satırı görünmemeli')
    const daralanlar = []
    for (const tablo of tablolar) {
      const [genel] = await baglamda(t.id, null, (sql) =>
        sql`SELECT count(*)::int AS n FROM ${sql(tablo)}`)
      const [kisitli] = await baglamda(t.id, hedef.id, (sql) =>
        sql`SELECT count(*)::int AS n FROM ${sql(tablo)}`)
      const [yabanci] = await baglamda(t.id, hedef.id, (sql) =>
        sql`SELECT count(*)::int AS n FROM ${sql(tablo)}
             WHERE workshop_id IS NOT NULL AND workshop_id <> ${hedef.id}`)

      // Veri yoksa satır basma — çıktı okunmaz hale geliyor.
      if (genel.n === 0) { gecti++; continue }
      kontrol(tablo.padEnd(30), yabanci.n === 0,
        yabanci.n === 0 ? `  ${genel.n} → ${kisitli.n}` : `  ${yabanci.n} YABANCI SATIR`)
      if (kisitli.n < genel.n) daralanlar.push(tablo)
    }

    // Testin bir şey ölçtüğünün kanıtı: en az bir tabloda gerçekten daralmalı.
    kontrol('kısıt gerçekten daraltıyor', daralanlar.length > 0,
      `  (${daralanlar.length} tabloda)`)

    const [w] = await baglamda(t.id, hedef.id, (sql) =>
      sql`SELECT count(*)::int AS n FROM workshop`)
    kontrol('workshop: yalnız kendi satırı', w.n === 1, `  ${w.n} satır`)

    const [wm] = await baglamda(t.id, null, (sql) =>
      sql`SELECT count(*)::int AS n FROM workshop`)
    kontrol('merkez kullanıcısı hepsini görüyor', wm.n > 1, `  ${wm.n} satır`)

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
    kontrol('başka atölyeye satır yazılamıyor', !yazildi)

    /* Ortak katalog yalnız katalogu OLAN tenant'ta anlamlı. demo-atolye'nin
       kendi olgunluk şablonu yok; orada 0 madde beklenen sonuçtur. */
    const [varMi] = await yonetici`
      SELECT count(*)::int AS n FROM olgunluk_sablon WHERE tenant_id = ${t.id}`
    if (varMi.n > 0) {
      const [kat] = await baglamda(t.id, hedef.id, (sql) =>
        sql`SELECT count(*)::int AS n FROM olgunluk_kriter`)
      kontrol('ortak katalog okunuyor', kat.n > 0, `  ${kat.n} madde`)
    }

    /* Atölyeye ait OLMAYAN (workshop_id NULL) ortak satırlar gizlenmemeli:
       gizlenirse atölye kendi modelini bile tanımlayamaz. */
    const [ortak] = await yonetici`
      SELECT count(*)::int AS n FROM model_library
       WHERE tenant_id = ${t.id} AND workshop_id IS NULL`
    if (ortak.n > 0) {
      const [gorunen] = await baglamda(t.id, hedef.id, (sql) =>
        sql`SELECT count(*)::int AS n FROM model_library WHERE workshop_id IS NULL`)
      kontrol('ortak (atölyesiz) satırlar görünüyor', gorunen.n === ortak.n,
        `  ${gorunen.n}/${ortak.n}`)
    }
  }
} catch (e) {
  console.error('\nFAIL:', e.message)
  process.exitCode = 1
} finally {
  await yonetici.end({ timeout: 3 })
  await uygulama.end({ timeout: 3 })
}

console.log(`\n${gecti} geçti, ${kaldi} kaldı`)
if (kaldi > 0) process.exitCode = 1
