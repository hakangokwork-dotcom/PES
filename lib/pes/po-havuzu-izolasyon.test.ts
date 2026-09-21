import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'

/* 035 sızıntısının kapandığının kanıtı (spec K2).

   035 atölye kısıtına "OR workshop_id IS NULL" ekledi — ortak katalog
   için doğru, work_order ve work_order_stage için YANLIŞ: havuzdaki PO
   (workshop_id NULL) her atölyeye görünürdü; normal aşama satırı
   (NULL = siparişin atölyesi) zaten görünüyordu. 038 iki tabloya özel
   politika yazıyor. Bu test dört şeyi kanıtlar:
     1. Havuz PO'sunu atölye kullanıcısı GÖRMEZ, merkez görür.
     2. Başka atölyenin NULL-atölyeli aşama satırını GÖRMEZ.
     3. Kendi iş emrinin NULL-atölyeli aşamasını GÖRÜR.
     4. Dış atölyeye çıkan aşamayı o dış atölye GÖRÜR. */

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 20 })

const KOD = 'ZZHAVUZ'
let tenantId: string
let wsA: number, wsB: number
let havuzWo: number, aWo: number
let aStageNull: number, aStageDis: number

async function temizle() {
  await yonetici`DELETE FROM work_order WHERE is_emri_no LIKE ${KOD + '%'}`
  await yonetici`DELETE FROM workshop WHERE code LIKE ${KOD + '%'}`
}

function baglamda<T>(workshopId: number | null, fn: (tx: postgres.Sql) => Promise<T>) {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    await tx`SELECT set_config('app.current_workshop_id',
               ${workshopId === null ? '' : String(workshopId)}, true)`
    return fn(tx as unknown as postgres.Sql)
  })
}

beforeAll(async () => {
  const [t] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  tenantId = t.id as string
  await temizle()

  const atolyeKur = async (ek: string) => (await yonetici`
    INSERT INTO workshop (tenant_id, code, name, type, total_staff, sewing_staff, ukp_staff,
                          cutting_staff, management, indirect, line_count, daily_target, net_hours_day)
    VALUES (${tenantId}, ${KOD + ek}, ${'Havuz Izolasyon ' + ek}, 'X', 0,0,0,0,0,0, 1, 1000, 9)
    RETURNING id`)[0].id as number
  wsA = await atolyeKur('A'); wsB = await atolyeKur('B')

  const [dikim] = await yonetici`SELECT id FROM production_stage WHERE code = 'DIKIM'`
  const [yikama] = await yonetici`SELECT id FROM production_stage WHERE code = 'YIKAMA'`

  /* Havuz PO: atölyesiz, Taslak — 038 sonrası yazılabilir. */
  havuzWo = (await yonetici`
    INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum)
    VALUES (${tenantId}, NULL, ${KOD + '-HAVUZ'}, 'Havuz Modeli', 1000, 'Taslak') RETURNING id`)[0].id as number

  /* A'ya atanmış PO; bir aşaması NULL (A'nın), biri dış atölye B'de. */
  aWo = (await yonetici`
    INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum)
    VALUES (${tenantId}, ${wsA}, ${KOD + '-A'}, 'A Modeli', 1000, 'Planlandi') RETURNING id`)[0].id as number
  aStageNull = (await yonetici`
    INSERT INTO work_order_stage (work_order_id, tenant_id, stage_id, sira_no, workshop_id, durum)
    VALUES (${aWo}, ${tenantId}, ${dikim.id}, 20, NULL, 'Beklemede') RETURNING id`)[0].id as number
  aStageDis = (await yonetici`
    INSERT INTO work_order_stage (work_order_id, tenant_id, stage_id, sira_no, workshop_id, durum)
    VALUES (${aWo}, ${tenantId}, ${yikama.id}, 30, ${wsB}, 'Beklemede') RETURNING id`)[0].id as number
})

afterAll(async () => { await temizle(); await yonetici.end(); await uygulama.end() })

test('havuzdaki PO merkeze görünür, atölyeye GÖRÜNMEZ', async () => {
  const merkez = await baglamda(null, tx => tx`SELECT id FROM work_order WHERE id = ${havuzWo}`)
  expect(merkez).toHaveLength(1)
  const atolye = await baglamda(wsA, tx => tx`SELECT id FROM work_order WHERE id = ${havuzWo}`)
  expect(atolye).toHaveLength(0)
})

test('başka atölyenin NULL-atölyeli aşaması GÖRÜNMEZ', async () => {
  const b = await baglamda(wsB, tx => tx`SELECT id FROM work_order_stage WHERE id = ${aStageNull}`)
  expect(b).toHaveLength(0)
})

test('kendi iş emrinin NULL-atölyeli aşaması GÖRÜNÜR', async () => {
  const a = await baglamda(wsA, tx => tx`SELECT id FROM work_order_stage WHERE id = ${aStageNull}`)
  expect(a).toHaveLength(1)
})

test('dış atölyeye çıkan aşamayı dış atölye GÖRÜR', async () => {
  const b = await baglamda(wsB, tx => tx`SELECT id FROM work_order_stage WHERE id = ${aStageDis}`)
  expect(b).toHaveLength(1)
})

test('atölye kullanıcısı havuza yazamaz', async () => {
  await expect(baglamda(wsA, tx => tx`
    INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum)
    VALUES (${tenantId}, NULL, ${KOD + '-SIZINTI'}, 'X', 1, 'Taslak')`)).rejects.toThrow()
})
