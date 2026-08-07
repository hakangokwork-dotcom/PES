import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { planGercek } from './plan-gercek'

/* planGercek'in SORGU tarafı. Eğri hesabı plan-gercek.test.ts'te saf
   olarak test ediliyor; burada test edilen şey sorgunun çalıştığı,
   tarihlerin METİN geldiği ve dış atölye/sapma alanlarının doğru
   doldurulduğu. */
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 15 })

let defaultTenant: string
let wsId: number
let disId: number
let woId: number

const KOD = 'ZZPGTST'

async function temizle() {
  await yonetici`DELETE FROM work_order WHERE workshop_id IN (SELECT id FROM workshop WHERE code = ${KOD})`
  await yonetici`DELETE FROM production_line WHERE code LIKE ${KOD + '%'}`
  await yonetici`DELETE FROM workshop WHERE code = ${KOD}`
}

beforeAll(async () => {
  const [d] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  defaultTenant = d.id
  await temizle()

  const [w] = await yonetici`
    INSERT INTO workshop (tenant_id, code, name, type, total_staff, sewing_staff, ukp_staff,
                          cutting_staff, management, indirect, line_count, daily_target, net_hours_day)
    VALUES (${defaultTenant}, ${KOD}, 'Plan Gercek Testi', 'X', 0,0,0,0,0,0,1,0,9)
    RETURNING id`
  wsId = w.id as number
  const [b] = await yonetici`
    INSERT INTO production_line (tenant_id, workshop_id, code, name, daily_target, is_active)
    VALUES (${defaultTenant}, ${wsId}, ${KOD + '-B1'}, 'B1', 1000, true)
    RETURNING id`
  const lineId = b.id as number

  const [dis] = await yonetici`
    SELECT id FROM workshop WHERE is_active AND id <> ${wsId} ORDER BY code LIMIT 1`
  disId = dis.id as number

  const [wo] = await yonetici`
    INSERT INTO work_order ${yonetici({
      tenant_id: defaultTenant, is_emri_no: 'ZZPG-001', siparis_no: 'ZZPG-001',
      workshop_id: wsId, model_adi: 'M1', siparis_miktari: 4000,
      teslim_tarihi: '2026-08-20', durum: 'Devam',
    })} RETURNING id`
  woId = wo.id as number

  const [dikimPs] = await yonetici`SELECT id FROM production_stage WHERE code = 'DIKIM'`
  const [ukpPs] = await yonetici`SELECT id FROM production_stage WHERE code = 'UKP'`

  const [dikim] = await yonetici`
    INSERT INTO work_order_stage ${yonetici({
      tenant_id: defaultTenant, work_order_id: woId, stage_id: dikimPs.id as number,
      sira_no: 20, workshop_id: wsId,
      plan_baslangic: '2026-08-10', plan_bitis: '2026-08-13',
      gercek_baslangic: '2026-08-10', gercek_bitis: '2026-08-15',
      durum: 'Tamamlandi',
    })} RETURNING id`

  // UKP DIS atolyede
  await yonetici`
    INSERT INTO work_order_stage ${yonetici({
      tenant_id: defaultTenant, work_order_id: woId, stage_id: ukpPs.id as number,
      sira_no: 40, workshop_id: disId,
      plan_baslangic: '2026-08-16', plan_bitis: '2026-08-17', durum: 'Beklemede',
    })}`

  const [atama] = await yonetici`
    INSERT INTO work_order_stage_atama ${yonetici({
      stage_row_id: dikim.id as number, tenant_id: defaultTenant, line_id: lineId,
      adet: 4000, plan_baslangic: '2026-08-10', plan_bitis: '2026-08-13',
    })} RETURNING id`

  await yonetici`
    INSERT INTO work_order_gunluk_uretim ${yonetici([
      { atama_id: atama.id as number, tenant_id: defaultTenant, tarih: '2026-08-10', adet: 800, hatali_adet: 10 },
      { atama_id: atama.id as number, tenant_id: defaultTenant, tarih: '2026-08-11', adet: 900, hatali_adet: 5 },
    ])}`
})

afterAll(async () => {
  await temizle()
  await yonetici.end()
  await uygulama.end()
})

function tenantIcinde<T>(fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${defaultTenant}, true)`
    return fn(tx)
  }) as Promise<T>
}

test('aşama sapması ve dış atölye işaretlenir, tarihler metin gelir', async () => {
  const pg = (await tenantIcinde(sql => planGercek(sql, woId)))!
  expect(pg).not.toBeNull()
  expect(pg.isEmriNo).toBe('ZZPG-001')

  const dikim = pg.asamalar.find(a => a.kod === 'DIKIM')!
  expect(typeof dikim.planBitis).toBe('string')
  expect(dikim.planBitis).toBe('2026-08-13')
  expect(dikim.sapmaGun).toBe(2)          // 15 - 13
  expect(dikim.disAtolye).toBe(false)

  const ukp = pg.asamalar.find(a => a.kod === 'UKP')!
  expect(ukp.disAtolye).toBe(true)
  expect(ukp.sapmaGun).toBeNull()         // gercek_bitis yok
})

test('bant özeti ve eğri günlük girişlerden gelir', async () => {
  const pg = (await tenantIcinde(sql => planGercek(sql, woId)))!

  expect(pg.bantlar).toHaveLength(1)
  const b = pg.bantlar[0]
  expect(b.girilenToplam).toBe(1700)
  expect(b.hataliToplam).toBe(15)
  expect(b.girisGunSayisi).toBe(2)
  expect(b.sonGiris).toBe('2026-08-11')
  expect(b.gunlukHedef).toBe(1000)

  expect(pg.egri.map(p => p.gercek)).toEqual([800, 1700, null, null])
  expect(pg.egri[3].plan).toBe(4000)
})

test('olmayan sipariş null döner', async () => {
  const pg = await tenantIcinde(sql => planGercek(sql, -1))
  expect(pg).toBeNull()
})
