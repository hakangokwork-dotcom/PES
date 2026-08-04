import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { atolyeProfilSatirlari, excelSatirlari } from './atolye-profil'

/* Gerçek veritabanına bağlanır. Bu dosyanın varlık sebebi tam olarak
   sahte veriyle yakalanamayan bir hata:
   postgres.js DATE kolonlarını JS Date nesnesine çevirir. Tip tanımı
   "string" dediği için TypeScript susar, build geçer, ama arayüz
   tarih.slice(0,10) / localeCompare çağırınca render TypeError ile
   çöker ve tarayıcı "This page couldn't load" gösterir. 2026-08-04'te
   canlıda tam olarak bu oldu. Mock bir sürücü bunu asla göstermezdi. */
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
/* Uygulamanın gerçek yolu: pes_app rolü (NOBYPASSRLS) + tenant context. */
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 15 })

let defaultTenant: string

beforeAll(async () => {
  const [d] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  defaultTenant = d.id
})

afterAll(async () => {
  await yonetici.end()
  await uygulama.end()
})

function tenantIcinde<T>(fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${defaultTenant}, true)`
    return fn(tx)
  }) as Promise<T>
}

test('tenant context içinde atölyeleri döndürür', async () => {
  const satirlar = await tenantIcinde((sql) => atolyeProfilSatirlari(sql))
  expect(satirlar.length).toBeGreaterThan(0)
  expect(satirlar.every((s) => typeof s.code === 'string')).toBe(true)
})

test('tarih alanları string döner, Date nesnesi değil', async () => {
  const satirlar = await tenantIcinde((sql) => atolyeProfilSatirlari(sql))

  const tarihAlanlari = ['wkys_tarih', 'wkys_sonraki', 'sosyal_tarih', 'sosyal_sonraki'] as const
  const bozuk: string[] = []
  for (const s of satirlar) {
    for (const alan of tarihAlanlari) {
      const v = s[alan]
      if (v === null) continue
      if (typeof v !== 'string') bozuk.push(`${s.code}.${alan}: ${Object.prototype.toString.call(v)}`)
    }
  }
  expect(bozuk).toEqual([])

  /* Arayüzün yaptığı işlemler gerçekten çalışmalı — tip iddiası değil,
     davranış kontrolü. */
  const tarihli = satirlar.find((s) => s.wkys_tarih !== null)
  if (tarihli?.wkys_tarih) {
    expect(() => tarihli.wkys_tarih!.slice(0, 10).split('-')).not.toThrow()
    expect(tarihli.wkys_tarih).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  }
})

test('Excel satırları her alan için ilkel değer üretir', async () => {
  const satirlar = await tenantIcinde((sql) => atolyeProfilSatirlari(sql))
  const excel = excelSatirlari(satirlar)
  expect(excel.length).toBe(satirlar.length)

  /* xlsx bir Date'i hücreye yazabilir ama biçim bozulur; ayrıca burada
     hepsi ::text geldiği için ilkel olmalılar. */
  const nesneler = excel.flatMap((satir, i) =>
    Object.entries(satir)
      .filter(([, v]) => v !== null && typeof v === 'object')
      .map(([k]) => `${i}.${k}`)
  )
  expect(nesneler).toEqual([])
})

test('tenant context olmadan satır dönmez (RLS)', async () => {
  const satirlar = await atolyeProfilSatirlari(uygulama as unknown as postgres.TransactionSql)
  expect(satirlar.length).toBe(0)
})
