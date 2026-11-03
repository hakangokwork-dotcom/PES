import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'

/* 054: "kaydı kim girdi" tetikleyicisi. Uygulamanın rolüyle (pes_app,
   NOBYPASSRLS) ve geri alınan işlem içinde çalışır; veri bırakmaz. */

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })

let tenantId: string
let atolyeId: number
beforeAll(async () => {
  const [t] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  tenantId = t.id
  const [w] = await yonetici`SELECT id FROM workshop WHERE tenant_id = ${tenantId} AND is_active ORDER BY id LIMIT 1`
  atolyeId = w.id
})
afterAll(async () => { await yonetici.end(); await uygulama.end() })

const GERI_AL = 'TEST_GERI_AL'
async function yaz(workshopKapsami: number | null, eposta: string, istemciTaraf?: string) {
  let satir: Record<string, unknown> = {}
  try {
    await uygulama.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
      await tx`SELECT set_config('app.current_workshop_id', ${workshopKapsami === null ? '' : String(workshopKapsami)}, true)`
      await tx`SELECT set_config('app.current_user_email', ${eposta}, true)`
      const [r] = await tx`
        INSERT INTO quality_record (tenant_id, workshop_id, year, month, inspected_qty, giren_taraf)
        VALUES (${tenantId}, ${atolyeId}, 2099, 1, 10, ${istemciTaraf ?? null})
        RETURNING giren_taraf, giren_eposta, girildi_at`
      satir = r
      throw new Error(GERI_AL)
    })
  } catch (e) { if ((e as Error).message !== GERI_AL) throw e }
  return satir
}

test('atölye kapsamında yazılan kayıt atölye beyanıdır', async () => {
  const r = await yaz(atolyeId, 'atolye@test')
  expect(r.giren_taraf).toBe('atolye')
  expect(r.giren_eposta).toBe('atolye@test')
  expect(r.girildi_at).toBeTruthy()
})

test('merkez kapsamında yazılan kayıt merkez kaydıdır', async () => {
  const r = await yaz(null, 'merkez@test')
  expect(r.giren_taraf).toBe('merkez')
  expect(r.giren_eposta).toBe('merkez@test')
})

test('istemcinin gönderdiği taraf yok sayılır', async () => {
  const r = await yaz(null, 'merkez@test', 'atolye')
  expect(r.giren_taraf).toBe('merkez')
})

/* 055: ortak kayıt. Uygulama rolüyle, geri alınan işlemde. */
async function islem<T>(workshopKapsami: number | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let sonuc: T | undefined
  try {
    await uygulama.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
      await tx`SELECT set_config('app.current_workshop_id', ${workshopKapsami === null ? '' : String(workshopKapsami)}, true)`
      await tx`SELECT set_config('app.current_user_email', 'test@test', true)`
      sonuc = await fn(tx)
      throw new Error(GERI_AL)
    })
  } catch (e) { if ((e as Error).message !== GERI_AL) throw e }
  return sonuc as T
}

async function giderYaz(tx: postgres.TransactionSql, surum: string, tutar: number) {
  await tx`SELECT set_config('app.beklenen_surum', ${surum}, true)`
  const [r] = await tx`
    INSERT INTO monthly_expense (tenant_id, workshop_id, year, month, work_days, personnel)
    VALUES (${tenantId}, ${atolyeId}, 2099, 1, 22, ${tutar})
    ON CONFLICT (workshop_id, year, month) DO UPDATE SET personnel = EXCLUDED.personnel
    RETURNING girildi_at`
  return r.girildi_at as Date
}

test('araya giren değişiklik sessizce ezilmez (PT409)', async () => {
  const kod = await islem(null, async (tx) => {
    const ilk = await giderYaz(tx, '', 100)                       // atölye girdi
    await tx`SELECT pg_sleep(0.002)`
    await giderYaz(tx, ilk.toISOString(), 200)                    // merkez gördüğü sürümle düzeltti
    try { await tx.savepoint((sp) => giderYaz(sp as unknown as postgres.TransactionSql, ilk.toISOString(), 300)); return 'gecti' }
    catch (e) { return (e as { code?: string }).code }           // eski sürümle yazan durur
  })
  expect(kod).toBe('PT409')
})

test("'yok' sürümü: ekran kayıt görmediyse bu arada eklenen kayıt korunur", async () => {
  const kod = await islem(null, async (tx) => {
    await giderYaz(tx, '', 100)
    try { await tx.savepoint((sp) => giderYaz(sp as unknown as postgres.TransactionSql, 'yok', 300)); return 'gecti' }
    catch (e) { return (e as { code?: string }).code }
  })
  expect(kod).toBe('PT409')
})

test('künye ↔ atölye: bant ve çalışan sayısı iki yönde eşitlenir', async () => {
  const r = await islem(null, async (tx) => {
    const [var_] = await tx`SELECT 1 FROM workshop_profil WHERE workshop_id = ${atolyeId}`
    if (!var_) await tx`INSERT INTO workshop_profil (workshop_id, tenant_id) VALUES (${atolyeId}, ${tenantId})`
    await tx`UPDATE workshop SET line_count = 7, total_staff = 77 WHERE id = ${atolyeId}`
    const [k] = await tx`SELECT bant_sayisi, calisan_sayisi FROM workshop_profil WHERE workshop_id = ${atolyeId}`
    await tx`UPDATE workshop_profil SET bant_sayisi = 3, calisan_sayisi = 33 WHERE workshop_id = ${atolyeId}`
    const [w] = await tx`SELECT line_count, total_staff, giren_taraf FROM workshop WHERE id = ${atolyeId}`
    return { k, w }
  })
  expect(r.k).toEqual({ bant_sayisi: 7, calisan_sayisi: 77 })
  expect(r.w).toEqual({ line_count: 3, total_staff: 33, giren_taraf: 'merkez' })
})
