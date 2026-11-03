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
