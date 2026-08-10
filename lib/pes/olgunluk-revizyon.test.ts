import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { sablonlar, sablonKlonla, katalog, revizyonlar } from './olgunluk'

/* KATALOG REVİZYON GEÇMİŞİ (032), uygulamanın rolüyle.

   Neden gerçek DB: geçmiş bir trigger'la yazılıyor. Uygulama kodunda
   "revizyon yaz" diye bir satır YOK — dolayısıyla mock'lu bir test
   trigger'ın varlığını hiç ölçmez. Kullanıcı katalogu canlı yazacak;
   bir düzenlemenin öncesi kaybolursa bunu fark ettirecek bir hata
   mesajı da olmaz.

   Her test geri alınan bir transaction içinde; canlı veriye yazmaz. */

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
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

const GERI_AL = 'TEST_GERI_AL'
async function geriAlinan(fn: (sql: postgres.TransactionSql) => Promise<void>) {
  try {
    await uygulama.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${defaultTenant}, true)`
      await fn(tx)
      throw new Error(GERI_AL)
    })
  } catch (e) {
    if ((e as Error).message !== GERI_AL) throw e
  }
}

/** Düzenlenebilir bir taslak sürüm + içinden bir madde. */
async function taslakKatalog(sql: postgres.TransactionSql) {
  const hepsi = await sablonlar(sql)
  const kaynak = hepsi.find((s) => s.durum === 'yayinda') ?? hepsi[0]
  const yeniId = await sablonKlonla(sql, {
    kaynakId: kaynak.id, tenantId: defaultTenant, kod: `test-rev-${Date.now()}`,
  })
  const k = (await katalog(sql, yeniId))!
  return { sablonId: yeniId, kriter: k.kriterler[0], surec: k.surecler[0], kategori: k.kategoriler[0] }
}

test('madde metni değişince önceki hali geçmişe düşer', async () => {
  await geriAlinan(async (sql) => {
    const { kriter } = await taslakKatalog(sql)
    const eski = kriter.metin

    await sql`UPDATE olgunluk_kriter SET metin = ${eski + ' (v2)'} WHERE id = ${kriter.id}`

    const g = await revizyonlar(sql, 'kriter', kriter.id)
    expect(g.length).toBe(1)
    expect(g[0].degisen).toEqual(['metin'])
    expect(g[0].onceki.metin).toBe(eski)   // geçmişte ESKİ metin durur
  })
})

test('yalnız sıra değişirse geçmişe kayıt atılmaz', async () => {
  await geriAlinan(async (sql) => {
    const { kriter } = await taslakKatalog(sql)
    await sql`UPDATE olgunluk_kriter SET sira = sira + 1 WHERE id = ${kriter.id}`
    expect((await revizyonlar(sql, 'kriter', kriter.id)).length).toBe(0)
  })
})

test('her düzenleme ayrı bir kayıt bırakır, en yeni başta', async () => {
  await geriAlinan(async (sql) => {
    const { kriter } = await taslakKatalog(sql)
    await sql`UPDATE olgunluk_kriter SET metin = 'birinci' WHERE id = ${kriter.id}`
    await sql`UPDATE olgunluk_kriter SET metin = 'ikinci'  WHERE id = ${kriter.id}`
    await sql`UPDATE olgunluk_kriter SET metin = 'ucuncu'  WHERE id = ${kriter.id}`

    const g = await revizyonlar(sql, 'kriter', kriter.id)
    expect(g.length).toBe(3)
    // En yeni kayıt, bir önceki metni tutar.
    expect(g[0].onceki.metin).toBe('ikinci')
    expect(g[2].onceki.metin).toBe(kriter.metin)
  })
})

test('birden fazla alan aynı anda değişirse hepsi listelenir', async () => {
  await geriAlinan(async (sql) => {
    const { kriter } = await taslakKatalog(sql)
    await sql`
      UPDATE olgunluk_kriter SET metin = 'yeni metin', taraf = 'MARKA', zorunlu = false
       WHERE id = ${kriter.id}`

    const [g] = await revizyonlar(sql, 'kriter', kriter.id)
    expect([...g.degisen].sort()).toEqual(['metin', 'taraf', 'zorunlu'])
  })
})

test('süreç ve kategori başlıkları da sürümleniyor', async () => {
  await geriAlinan(async (sql) => {
    const { surec, kategori } = await taslakKatalog(sql)

    await sql`UPDATE olgunluk_surec SET ad = 'Yeni Süreç Adı' WHERE id = ${surec.id}`
    const gs = await revizyonlar(sql, 'surec', surec.id)
    expect(gs.length).toBe(1)
    expect(gs[0].onceki.ad).toBe(surec.ad)

    await sql`UPDATE olgunluk_kategori SET ad = 'Yeni Kategori Adı' WHERE id = ${kategori.id}`
    const gk = await revizyonlar(sql, 'kategori', kategori.id)
    expect(gk.length).toBe(1)
    expect(gk[0].onceki.ad).toBe(kategori.ad)
  })
})

test('yayındaki sürüm kilitli olduğu için geçmişe de kayıt düşmez', async () => {
  await geriAlinan(async (sql) => {
    const hepsi = await sablonlar(sql)
    const yayinda = hepsi.find((s) => s.durum === 'yayinda')
    if (!yayinda) return
    const k = (await katalog(sql, yayinda.id))!
    const kriter = k.kriterler[0]
    const oncekiAdet = (await revizyonlar(sql, 'kriter', kriter.id)).length

    let yazildi = false
    try {
      await sql.savepoint(async (sp) => {
        await sp`UPDATE olgunluk_kriter SET metin = 'olmamali' WHERE id = ${kriter.id}`
        yazildi = true
      })
    } catch { /* kilit trigger'ı reddetmeli */ }

    expect(yazildi).toBe(false)
    expect((await revizyonlar(sql, 'kriter', kriter.id)).length).toBe(oncekiAdet)
  })
})
