import { afterAll, beforeAll, afterEach, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { malzemeGecikenSiparisler } from './malzeme-uyari'
import { yerlestir } from './yerlestir-kaydet'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 15 })

let defaultTenant: string
let wsId: number
let lineId: number
const KOD = 'ZZMLZTST'

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
    VALUES (${defaultTenant}, ${KOD}, 'Malzeme Testi', 'X', 0,0,0,0,0,0,1,0,9) RETURNING id`
  wsId = w.id as number
  const [l] = await yonetici`
    INSERT INTO production_line (tenant_id, workshop_id, code, name, daily_target, is_active)
    VALUES (${defaultTenant}, ${wsId}, ${KOD + '-B1'}, 'B1', 1000, true) RETURNING id`
  lineId = l.id as number
})

afterEach(async () => {
  await yonetici`DELETE FROM work_order WHERE workshop_id = ${wsId}`
})

afterAll(async () => { await temizle(); await yonetici.end(); await uygulama.end() })

function tenantIcinde<T>(fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${defaultTenant}, true)`
    return fn(tx)
  }) as Promise<T>
}

async function siparisAc(no: string) {
  return tenantIcinde(sql => yerlestir(sql, defaultTenant, {
    siparisNo: no, musteri: 'T', modelAdi: 'M',
    adet: 1000, teslimTarihi: '2026-12-31', bugun: '2026-08-06',
    workshopId: wsId, lineIds: [lineId], asamaKodlari: ['DIKIM'],
  }))
}

test('malzeme uretim baslangicindan SONRA geliyorsa isaretlenir', async () => {
  const s = await siparisAc('ZZ-MLZ-1')
  // dikim 1000/1000 = 1 gun -> 2026-12-31'de baslar ve biter
  await yonetici`
    INSERT INTO work_order_material (work_order_id, tenant_id, tip, ad, durum, beklenen_tarih)
    VALUES (${s.workOrderId}, ${defaultTenant}, 'KUMAŞ', 'Ana kumaş', 'Bekleniyor', '2027-01-15')`

  const uyarilar = await tenantIcinde(sql => malzemeGecikenSiparisler(sql))
  const bizim = uyarilar.find(u => u.workOrderId === s.workOrderId)
  expect(bizim).toBeDefined()
  expect(bizim!.enGecMalzeme).toBe('2027-01-15')
  expect(bizim!.uretimBaslangic).toBe('2026-12-31')
})

test('malzeme zamaninda geliyorsa isaretlenmez', async () => {
  const s = await siparisAc('ZZ-MLZ-2')
  await yonetici`
    INSERT INTO work_order_material (work_order_id, tenant_id, tip, ad, durum, beklenen_tarih)
    VALUES (${s.workOrderId}, ${defaultTenant}, 'KUMAŞ', 'Ana kumaş', 'Bekleniyor', '2026-12-01')`

  const uyarilar = await tenantIcinde(sql => malzemeGecikenSiparisler(sql))
  expect(uyarilar.find(u => u.workOrderId === s.workOrderId)).toBeUndefined()
})

test('gelmis malzemede GERCEK gelis tarihi esas alinir', async () => {
  /* beklenen_tarih gec olsa da malzeme erken geldiyse sorun yok. */
  const s = await siparisAc('ZZ-MLZ-3')
  await yonetici`
    INSERT INTO work_order_material (work_order_id, tenant_id, tip, ad, durum, beklenen_tarih, gelis_tarihi)
    VALUES (${s.workOrderId}, ${defaultTenant}, 'KUMAŞ', 'Ana kumaş', 'Geldi', '2027-01-15', '2026-11-20')`

  const uyarilar = await tenantIcinde(sql => malzemeGecikenSiparisler(sql))
  expect(uyarilar.find(u => u.workOrderId === s.workOrderId)).toBeUndefined()
})

test('malzemesi olmayan siparis isaretlenmez', async () => {
  const s = await siparisAc('ZZ-MLZ-4')
  const uyarilar = await tenantIcinde(sql => malzemeGecikenSiparisler(sql))
  expect(uyarilar.find(u => u.workOrderId === s.workOrderId)).toBeUndefined()
})
