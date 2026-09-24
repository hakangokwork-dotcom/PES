#!/usr/bin/env node
/**
 * Kiracı tutarlılığı: bir atölyeye ait satırın kiracısı, O ATÖLYENİN
 * kiracısı olmalı.
 *
 * NEDEN VAR: import_ekonomi_anket.mjs kiracıyı `atolyeler[0]?.tenant_id`
 * ile buluyordu — sırasız bir sorgunun ilk satırının kiracısını alıp
 * bütün satırlara yazıyordu. 33 ekonomi + 11 anket + 33 gider satırı
 * yanlış kiracıya gitti. RLS kiracıya göre süzdüğü için ekonomi ekranları
 * uygulamada HERKESE boş görünüyordu:
 *   - default kullanıcısı (10 kişi): 131 atölye, 0 ekonomi satırı
 *   - demo-atolye kullanıcısı (2 kişi): 33 satır ama alakasız 8 atölye
 *
 * HATA NEDEN AYLARCA GÖRÜNMEDİ: bütün doğrulamalar DATABASE_URL ile,
 * yani BYPASSRLS yönetici rolüyle yapılıyordu. Yönetici her satırı görür.
 * Bu betik İKİ ŞEYİ birden kontrol eder ve ikincisi asıl önemlisidir:
 *
 *   1. tenant_id tutarlılığı (yönetici gözüyle — bütünlük)
 *   2. verinin sahibi kiracı UYGULAMA ROLÜYLE gerçekten görüyor mu
 *
 * Migration 041 veriyi onardı; bu betik geri gelmediğini kanıtlar.
 *
 *   node scripts/verify_tenant_uyumu.mjs
 *
 * Sadece OKUMA yapar.
 */
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))

const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 20 })

/* Kimlik çözümleme tabloları hariç: kısıtlanırsa bağlamın kendisi çözülemez. */
const HARIC = new Set(['tenant_user', 'workshop_user', 'pes_user_roles'])

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
  /* ---------- 1. Bütünlük: tenant_id atölyenin kiracısıyla aynı mı ---------- */

  const tablolar = (await yonetici`
    SELECT c.table_name AS ad
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.column_name = 'workshop_id'
       AND EXISTS (SELECT 1 FROM information_schema.columns c2
                    WHERE c2.table_schema = 'public' AND c2.table_name = c.table_name
                      AND c2.column_name = 'tenant_id')
       AND EXISTS (SELECT 1 FROM information_schema.tables tb
                    WHERE tb.table_schema = 'public' AND tb.table_name = c.table_name
                      AND tb.table_type = 'BASE TABLE')
     ORDER BY c.table_name`).map((r) => r.ad).filter((a) => !HARIC.has(a))

  console.log(`KIRACI TUTARLILIGI — ${tablolar.length} tablo (tenant_id + workshop_id tasiyan)\n`)

  let veriliTablo = 0
  for (const t of tablolar) {
    const [r] = await yonetici.unsafe(`
      SELECT count(*)::int AS toplam,
             count(*) FILTER (WHERE x.tenant_id <> w.tenant_id)::int AS uyumsuz
        FROM "${t}" x JOIN workshop w ON w.id = x.workshop_id`)
    if (r.toplam === 0) continue
    veriliTablo++
    kontrol(t.padEnd(30), r.uyumsuz === 0,
      r.uyumsuz === 0 ? `  ${r.toplam} satir` : `  ${r.uyumsuz}/${r.toplam} UYUMSUZ`)
  }

  /* Testin bir şey ölçtüğünün kanıtı. */
  kontrol('taramada veri bulundu', veriliTablo > 0, `  (${veriliTablo} tabloda)`)

  /* ---------- 2. Görünürlük: sahibi kiracı UYGULAMA ROLÜYLE görüyor mu ---------- */

  console.log('\nGORUNURLUK — verinin sahibi kiraci uygulama rolüyle gerçekten goruyor mu')

  /* Yalnız gerçekten veri taşıyan (tablo, kiracı) çiftleri sorulur; boş bir
     kiracı hiçbir şey kanıtlamaz. */
  for (const t of ['workshop_economy', 'monthly_expense', 'monthly_production']) {
    const sahipler = await yonetici.unsafe(`
      SELECT w.tenant_id, tn.slug, count(*)::int AS n
        FROM "${t}" x JOIN workshop w ON w.id = x.workshop_id
        JOIN tenant tn ON tn.id = w.tenant_id
       GROUP BY w.tenant_id, tn.slug`)

    for (const s of sahipler) {
      const [gorunen] = await baglamda(s.tenant_id, null, (sql) =>
        sql`SELECT count(*)::int AS n FROM ${sql(t)}`)
      kontrol(`${t} → ${s.slug}`.padEnd(38), gorunen.n >= s.n,
        `  sahip ${s.n}, goren ${gorunen.n}`)
    }
  }

  /* ---------- 3. Atölye kendi ekonomi satırını görebiliyor mu (E4 önkoşulu) ---------- */

  console.log('\nATOLYE ERISIMI — E4 paylasiminin onkosulu')

  const [hedef] = await yonetici`
    SELECT we.workshop_id, w.name, w.tenant_id, count(*)::int AS satir
      FROM workshop_economy we JOIN workshop w ON w.id = we.workshop_id
     GROUP BY we.workshop_id, w.name, w.tenant_id
     ORDER BY satir DESC LIMIT 1`

  if (!hedef) {
    console.log('  (ekonomi satiri yok — atlandi)')
  } else {
    const [kendi] = await baglamda(hedef.tenant_id, hedef.workshop_id, (sql) =>
      sql`SELECT count(*)::int AS n FROM workshop_economy`)
    const [yabanci] = await baglamda(hedef.tenant_id, hedef.workshop_id, (sql) =>
      sql`SELECT count(*)::int AS n FROM workshop_economy
           WHERE workshop_id <> ${hedef.workshop_id}`)
    const [param] = await baglamda(hedef.tenant_id, hedef.workshop_id, (sql) =>
      sql`SELECT count(*)::int AS n FROM economy_param`)
    const [ham] = await baglamda(hedef.tenant_id, hedef.workshop_id, (sql) =>
      sql`SELECT count(*)::int AS n FROM economy_survey_staging`)

    kontrol(`${hedef.name}: kendi satirini goruyor`.padEnd(38), kendi.n === hedef.satir,
      `  ${kendi.n}/${hedef.satir}`)
    kontrol('yabanci satir gormuyor'.padEnd(38), yabanci.n === 0, `  ${yabanci.n}`)
    kontrol('parametreyi okuyabiliyor'.padEnd(38), param.n > 0, `  ${param.n}`)
    /* Ham anket atölyeye KAPALI kalmalı: başka atölyenin beyanına giden tek kapı. */
    kontrol('ham anketi GORMUYOR'.padEnd(38), ham.n === 0, `  ${ham.n}`)

    /* Atölye parametreyi değiştirememeli. UPDATE engellenince hata atmaz,
       sessizce 0 satır günceller — bu yüzden etkilenen satır sayılır. */
    const etkilenen = await baglamda(hedef.tenant_id, hedef.workshop_id, async (sql) => {
      const r = await sql`UPDATE economy_param SET param_value = param_value`
      return r.count
    })
    kontrol('parametreyi DEGISTIREMIYOR'.padEnd(38), etkilenen === 0, `  ${etkilenen} satir`)
  }

  console.log(`\n${gecti} gecti, ${kaldi} kaldi`)
  if (kaldi > 0) process.exitCode = 1
} finally {
  await yonetici.end()
  await uygulama.end()
}
