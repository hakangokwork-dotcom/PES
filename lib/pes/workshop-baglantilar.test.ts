import { beforeAll, afterAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { bagimliliklariSay, atolyeSil } from './workshop-baglantilar'

/* Gerçek veritabanına bağlanır: sayım SQL'i pg_constraint ve RLS ile
   iç içe çalışıyor, sahte bağlantıyla test etmek hiçbir şey kanıtlamaz. */
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 15 })

let defaultTenant: string
let demoTenant: string | null = null
const KOD_ONEKI = 'ZZTEST'

beforeAll(async () => {
  const [d] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  defaultTenant = d.id
  const [m] = await yonetici`SELECT id FROM tenant WHERE slug = 'demo-atolye'`
  demoTenant = m?.id ?? null
  await yonetici`DELETE FROM workshop WHERE code LIKE ${KOD_ONEKI + '%'}`
})

afterAll(async () => {
  await yonetici`DELETE FROM workshop WHERE code LIKE ${KOD_ONEKI + '%'}`
  await yonetici.end()
  await uygulama.end()
})

/* Uygulamanın çalıştığı yol: pes_app rolü + SET LOCAL tenant context. */
function tenantIcinde<T>(tenantId: string, fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    return fn(tx)
  }) as Promise<T>
}

async function atolyeAc(kod: string): Promise<number> {
  /* type = 'X' → "henüz sınıflandırılmamış"; CHECK yalnız A/B/C/X kabul ediyor. */
  const [row] = await yonetici`
    INSERT INTO workshop (tenant_id, code, name, type, total_staff, sewing_staff,
                          ukp_staff, cutting_staff, management, indirect,
                          line_count, daily_target, net_hours_day)
    VALUES (${defaultTenant}, ${kod}, ${'Test ' + kod}, 'X', 0, 0, 0, 0, 0, 0, 0, 0, 9)
    RETURNING id`
  return row.id
}

test('boş atölyenin engeli yoktur ve silinir', async () => {
  const id = await atolyeAc(KOD_ONEKI + '-BOS')

  const engeller = await tenantIcinde(defaultTenant, (sql) => bagimliliklariSay(sql, id))
  expect(engeller).toEqual([])

  const sonuc = await tenantIcinde(defaultTenant, (sql) => atolyeSil(sql, id))
  expect(sonuc).toEqual({ bulundu: true, silindi: true, engeller: [] })

  const kalan = await yonetici`SELECT id FROM workshop WHERE id = ${id}`
  expect(kalan.length).toBe(0)
})

test('bandı olan atölye silinmez ve veritabanında durmaya devam eder', async () => {
  const id = await atolyeAc(KOD_ONEKI + '-DOLU')
  await yonetici`
    INSERT INTO production_line (tenant_id, workshop_id, code, name, operator_count)
    VALUES (${defaultTenant}, ${id}, ${KOD_ONEKI + '-B1'}, 'Test Bant', 10)`

  const sonuc = await tenantIcinde(defaultTenant, (sql) => atolyeSil(sql, id))
  expect(sonuc.silindi).toBe(false)
  expect(sonuc.bulundu).toBe(true)
  expect(sonuc.engeller.map((e) => e.tablo)).toContain('production_line')
  expect(sonuc.engeller.find((e) => e.tablo === 'production_line')?.adet).toBe(1)
  expect(sonuc.engeller.find((e) => e.tablo === 'production_line')?.etiket).toBe('bant')

  const kalan = await yonetici`SELECT id FROM workshop WHERE id = ${id}`
  expect(kalan.length).toBe(1)
})

test('arşivlenen atölye aktif sayımından düşer, geri alınca döner', async () => {
  const id = await atolyeAc(KOD_ONEKI + '-ARSIV')
  const aktifSay = async () => {
    const [r] = await yonetici`SELECT count(*)::int c FROM workshop WHERE is_active`
    return r.c
  }

  const once = await aktifSay()
  await yonetici`UPDATE workshop SET is_active = false WHERE id = ${id}`
  expect(await aktifSay()).toBe(once - 1)

  await yonetici`UPDATE workshop SET is_active = true WHERE id = ${id}`
  expect(await aktifSay()).toBe(once)
})

test('başka tenant’ın atölyesi görülemez, silinemez', async () => {
  if (!demoTenant) return
  const [baskasi] = await yonetici`
    SELECT id FROM workshop WHERE tenant_id = ${demoTenant} LIMIT 1`
  if (!baskasi) return

  const sonuc = await tenantIcinde(defaultTenant, (sql) => atolyeSil(sql, baskasi.id))
  expect(sonuc.bulundu).toBe(false)
  expect(sonuc.silindi).toBe(false)

  const kalan = await yonetici`SELECT id FROM workshop WHERE id = ${baskasi.id}`
  expect(kalan.length).toBe(1)
})

/* Sayım ile DELETE arasındaki yarış: FOR UPDATE gerçekten tutmuyorsa bu test
   düşer. Kilit iddiası yorum satırıyla değil, engellenen INSERT'le kanıtlanır. */
test('FOR UPDATE, sayım sürerken alt tabloya kayıt girilmesini engeller', async () => {
  const id = await atolyeAc(KOD_ONEKI + '-KILIT')
  let eklendi = false
  /* Bekleyen INSERT transaction'ın DIŞINDA tutulur: begin() geri dönen değeri
     await ettiği için içeriden döndürmek COMMIT'i INSERT'e bağlar — ikisi
     birbirini bekler ve test kilitlenir. */
  let rakip: Promise<unknown> | null = null

  await tenantIcinde(defaultTenant, async (sql) => {
    await sql`SELECT id FROM workshop WHERE id = ${id} FOR UPDATE`

    /* Ayrı bağlantı: FK kontrolü üst satırda FOR KEY SHARE almaya çalışır. */
    rakip = yonetici`
      INSERT INTO production_line (tenant_id, workshop_id, code, name, operator_count)
      VALUES (${defaultTenant}, ${id}, ${KOD_ONEKI + '-K1'}, 'Kilit Bant', 1)
    `.then(() => { eklendi = true })

    await new Promise((r) => setTimeout(r, 800))
    expect(eklendi).toBe(false)
  })

  /* Transaction kapandıktan sonra bekleyen INSERT serbest kalır. */
  await rakip
  expect(eklendi).toBe(true)
}, 30_000)
