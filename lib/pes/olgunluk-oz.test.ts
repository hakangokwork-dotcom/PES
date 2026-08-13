import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { atolyeOlgunluk, filoDurumu } from './olgunluk-denetim'

/* ÖZ DEĞERLENDİRME AYRIMI (034) + ATÖLYE KISITI (033).

   İkisi birlikte sınanıyor çünkü tek başlarına eksikler: ayrım yalnız
   "tur" kolonu ile yapılsaydı atölye kendine DENETIM açıp sınıfını
   yükseltebilirdi; kısıt olup ayrım olmasaydı atölyenin beyanı filo
   skoruna karışırdı.

   Uygulamanın rolüyle (pes_app, NOBYPASSRLS) çalışır; yönetici bağlantısı
   BYPASSRLS olduğu için hiçbir şey kanıtlamaz. */

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 15 })

let tenantId: string
let atolyeId: number
let sablonId: number

beforeAll(async () => {
  const [t] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  tenantId = t.id
  const [w] = await yonetici`
    SELECT id FROM workshop WHERE tenant_id = ${tenantId} AND is_active ORDER BY id LIMIT 1`
  atolyeId = w.id
  const [s] = await yonetici`
    SELECT id FROM olgunluk_sablon WHERE tenant_id = ${tenantId} AND durum = 'yayinda'`
  sablonId = s.id
})

afterAll(async () => {
  await yonetici.end()
  await uygulama.end()
})

const GERI_AL = 'TEST_GERI_AL'
/** workshopId verilirse atölye kullanıcısı, verilmezse merkez kullanıcısı. */
async function baglamda(
  workshopId: number | null,
  fn: (sql: postgres.TransactionSql) => Promise<void>
) {
  try {
    await uygulama.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
      await tx`SELECT set_config('app.current_workshop_id',
                 ${workshopId === null ? '' : String(workshopId)}, true)`
      await fn(tx)
      throw new Error(GERI_AL)
    })
  } catch (e) {
    if ((e as Error).message !== GERI_AL) throw e
  }
}

const TARIH = '2099-06-15'

test('atölye kullanıcısı kendine RESMİ denetim açamaz', async () => {
  await baglamda(atolyeId, async (sql) => {
    let acildi = false
    try {
      await sql.savepoint(async (sp) => {
        await sp`
          INSERT INTO olgunluk_denetim (tenant_id, workshop_id, sablon_id, tarih, tur)
          VALUES (${tenantId}, ${atolyeId}, ${sablonId}, ${TARIH}, 'DENETIM')`
        acildi = true
      })
    } catch { /* trigger reddetmeli */ }
    expect(acildi).toBe(false)
  })
})

test('atölye kullanıcısı öz değerlendirme açabilir', async () => {
  await baglamda(atolyeId, async (sql) => {
    const [d] = await sql`
      INSERT INTO olgunluk_denetim (tenant_id, workshop_id, sablon_id, tarih, tur)
      VALUES (${tenantId}, ${atolyeId}, ${sablonId}, ${TARIH}, 'OZ_DEGERLENDIRME')
      RETURNING id, tur`
    expect(d.tur).toBe('OZ_DEGERLENDIRME')
  })
})

test('aynı gün hem denetim hem öz değerlendirme olabilir', async () => {
  await baglamda(null, async (sql) => {
    await sql`
      INSERT INTO olgunluk_denetim (tenant_id, workshop_id, sablon_id, tarih, tur)
      VALUES (${tenantId}, ${atolyeId}, ${sablonId}, ${TARIH}, 'DENETIM')`
    // Merkez kullanıcısı öz değerlendirmeyi de açabilir (kısıt yalnız atölyeye).
    const [ikinci] = await sql`
      INSERT INTO olgunluk_denetim (tenant_id, workshop_id, sablon_id, tarih, tur)
      VALUES (${tenantId}, ${atolyeId}, ${sablonId}, ${TARIH}, 'OZ_DEGERLENDIRME')
      RETURNING id`
    expect(ikinci.id).toBeGreaterThan(0)
  })
})

test('tamamlanmış öz değerlendirme filo skorunu ve sınıfı DEĞİŞTİRMEZ', async () => {
  await baglamda(null, async (sql) => {
    const once = (await filoDurumu(sql)).satirlar.find((s) => s.workshop_id === atolyeId)!

    // Atölye kendine tam puan verir.
    const [d] = await sql`
      INSERT INTO olgunluk_denetim (tenant_id, workshop_id, sablon_id, tarih, tur, durum)
      VALUES (${tenantId}, ${atolyeId}, ${sablonId}, ${TARIH}, 'OZ_DEGERLENDIRME', 'taslak')
      RETURNING id`
    const kriterler = await sql`
      SELECT id FROM olgunluk_kriter
       WHERE sablon_id = ${sablonId} AND aktif AND taraf = 'ATOLYE' LIMIT 40`
    for (const k of kriterler) {
      await sql`
        INSERT INTO olgunluk_denetim_kriter (denetim_id, kriter_id, tenant_id, sonuc)
        VALUES (${d.id}, ${k.id}, ${tenantId}, 'EVET')`
    }
    await sql`
      UPDATE olgunluk_denetim SET durum = 'tamamlandi', tamamlandi_at = now()
       WHERE id = ${d.id}`

    const sonra = (await filoDurumu(sql)).satirlar.find((s) => s.workshop_id === atolyeId)!
    expect(sonra.sinif).toBe(once.sinif)
    expect(sonra.yuzde).toBe(once.yuzde)
    expect(sonra.denetim_id).toBe(once.denetim_id)

    // Ama atölyenin kendi ekranında görünmeli.
    const kendi = await atolyeOlgunluk(sql, atolyeId)
    expect(kendi.denetimler.some((x) => x.denetim_id === d.id)).toBe(true)
    // Sınıfı belirleyen "son denetim" hâlâ öz değerlendirme OLMAMALI.
    expect(kendi.sonDenetim?.denetim_id).not.toBe(d.id)
  })
})

test('atölye kullanıcısı başka atölyeye öz değerlendirme açamaz', async () => {
  const [baska] = await yonetici`
    SELECT id FROM workshop WHERE tenant_id = ${tenantId} AND id <> ${atolyeId} LIMIT 1`
  await baglamda(atolyeId, async (sql) => {
    let acildi = false
    try {
      await sql.savepoint(async (sp) => {
        await sp`
          INSERT INTO olgunluk_denetim (tenant_id, workshop_id, sablon_id, tarih, tur)
          VALUES (${tenantId}, ${baska.id}, ${sablonId}, ${TARIH}, 'OZ_DEGERLENDIRME')`
        acildi = true
      })
    } catch { /* RLS reddetmeli */ }
    expect(acildi).toBe(false)
  })
})
