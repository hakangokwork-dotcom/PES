import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { adayAtolyeler, AGIRLIK } from './aday-atolye'

/* Gerçek veritabanına bağlanır: puanlama dört ayrı tablodan besleniyor
   (tahsisler, line_capability, v_atolye_denetim_durum, workshop_profil)
   ve RLS altında çalışıyor. Sahte veriyle test etmek hiçbir şey kanıtlamaz. */
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 15 })

let defaultTenant: string
beforeAll(async () => {
  const [d] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  defaultTenant = d.id
})
afterAll(async () => { await yonetici.end(); await uygulama.end() })

function tenantIcinde<T>(fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${defaultTenant}, true)`
    return fn(tx)
  }) as Promise<T>
}

test('aday listesi döner ve puana göre sıralı', async () => {
  const adaylar = await tenantIcinde(sql =>
    adayAtolyeler(sql, { adet: 5000, teslimTarihi: '2026-12-31', bugun: '2026-08-06' }))

  expect(adaylar.length).toBeGreaterThan(0)
  for (let i = 1; i < adaylar.length; i++) {
    expect(adaylar[i - 1].puan).toBeGreaterThanOrEqual(adaylar[i].puan)
  }
})

test('pasif atölye aday olmaz', async () => {
  const adaylar = await tenantIcinde(sql =>
    adayAtolyeler(sql, { adet: 5000, teslimTarihi: '2026-12-31', bugun: '2026-08-06' }))
  const pasifler = await tenantIcinde(sql =>
    sql`SELECT id FROM workshop WHERE NOT is_active`)
  const pasifIdler = new Set(pasifler.map(r => r.id as number))
  expect(adaylar.some(a => pasifIdler.has(a.workshopId))).toBe(false)
})

test('denetimi dolmuş atölye uyarı taşır', async () => {
  const adaylar = await tenantIcinde(sql =>
    adayAtolyeler(sql, { adet: 5000, teslimTarihi: '2026-12-31', bugun: '2026-08-06' }))
  const uyarili = adaylar.filter(a => a.uyarilar.some(u => u.includes('denetim')))
  expect(uyarili.length).toBeGreaterThan(0)
})

test('yetişmeyen atölye listeden atılmaz, işaretlenir', async () => {
  /* Teslim yarın + 500 bin adet: en hızlı atölye bile (6818/gün)
     yetiştiremez. 5000 ile yazılan ilk sürüm yanlıştı — MTR-001 onu
     bir günde bitiriyor.
     Kullanıcı "hiç aday yok" ile karşılaşmamalı, NEDEN olmadığını görmeli. */
  const adaylar = await tenantIcinde(sql =>
    adayAtolyeler(sql, { adet: 500_000, teslimTarihi: '2026-08-07', bugun: '2026-08-06' }))
  expect(adaylar.length).toBeGreaterThan(0)
  expect(adaylar.every(a => !a.yetisiyor)).toBe(true)
  expect(adaylar[0].uyarilar.some(u => u.includes('yetişmiyor'))).toBe(true)
})

test('ağırlıklar toplamı 100', () => {
  const toplam = Object.values(AGIRLIK).reduce((t, v) => t + v, 0)
  expect(toplam).toBe(100)
})
