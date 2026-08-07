import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { katalog, sablonlar, sablonKlonla, varsayilanSablon } from './olgunluk'

/* Gerçek veritabanına, UYGULAMANIN ROLÜYLE bağlanır.
   Sebep: 031 altı yeni tablo ekledi. Bir GRANT ya da RLS politikası
   eksik kalırsa TypeScript de build de susar; hata ancak kullanıcı
   sayfayı açtığında "permission denied" olarak görünür. Yönetici
   (postgres) bağlantısıyla test etmek bunu asla göstermez.

   Klonlama ayrıca burada sınanıyor çünkü kategori/süreç id'leri kopyada
   değişiyor ve eşleme KOD üzerinden kuruluyor. Yanlış bir join, kriterleri
   sessizce eski sürümün süreçlerine bağlardı: kopya sürüm "tamam" görünür,
   ama düzenleme eski sürümü bozar. */

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

function tenantIcinde<T>(fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${defaultTenant}, true)`
    return fn(tx)
  }) as Promise<T>
}

/** Yazan testler: aynı desen, sonunda geri alınır. */
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

test('uygulama rolü katalog tablolarını okuyabiliyor', async () => {
  const hepsi = await tenantIcinde((sql) => sablonlar(sql))
  expect(hepsi.length).toBeGreaterThan(0)
  expect(hepsi.every((s) => typeof s.kod === 'string')).toBe(true)
})

test('katalog süreçleri ve maddeleri tutarlı döner', async () => {
  const k = await tenantIcinde(async (sql) => {
    const hepsi = await sablonlar(sql)
    const sec = varsayilanSablon(hepsi)!
    return katalog(sql, sec.id)
  })
  expect(k).not.toBeNull()
  expect(k!.surecler.length).toBeGreaterThan(0)

  const katIdler = new Set(k!.kategoriler.map((x) => x.id))
  const surecIdler = new Set(k!.surecler.map((x) => x.id))

  // Her süreç kendi şablonunun bir kategorisine bağlı olmalı.
  expect(k!.surecler.every((s) => katIdler.has(s.kategori_id))).toBe(true)
  // Her madde kendi şablonunun bir sürecine bağlı olmalı.
  expect(k!.kriterler.every((x) => surecIdler.has(x.surec_id))).toBe(true)
  // Seviye 0'ın maddesi olamaz (031 CHECK); 0 "seviye 1 sağlanamadı" demek.
  expect(k!.kriterler.every((x) => x.seviye >= 1 && x.seviye <= 3)).toBe(true)
})

test('klonlama katalogu eksiksiz kopyalar ve id eşlemesini doğru kurar', async () => {
  await geriAlinan(async (sql) => {
    const hepsi = await sablonlar(sql)
    const kaynak = varsayilanSablon(hepsi)!
    const once = (await katalog(sql, kaynak.id))!

    const yeniId = await sablonKlonla(sql, {
      kaynakId: kaynak.id,
      tenantId: defaultTenant,
      kod: `test-klon-${Date.now()}`,
    })
    const sonra = (await katalog(sql, yeniId))!

    // Sayılar birebir
    expect(sonra.kategoriler.length).toBe(once.kategoriler.length)
    expect(sonra.surecler.length).toBe(once.surecler.length)
    expect(sonra.kriterler.length).toBe(once.kriterler.length)

    // Kopya TASLAK olmalı — yayındaki bir sürümün kopyası da düzenlenebilir olsun
    expect(sonra.sablon.durum).toBe('taslak')
    expect(sonra.sablon.klon_kaynak_id).toBe(kaynak.id)

    // ASIL SORU: kopyanın satırları kendi içinde mi bağlı?
    const yeniKatIdler = new Set(sonra.kategoriler.map((x) => x.id))
    const yeniSurecIdler = new Set(sonra.surecler.map((x) => x.id))
    expect(sonra.surecler.every((s) => yeniKatIdler.has(s.kategori_id))).toBe(true)
    expect(sonra.kriterler.every((x) => yeniSurecIdler.has(x.surec_id))).toBe(true)

    // Ve eski sürümün satırlarına hiç dokunmamış olmalı
    const eskiSurecIdler = new Set(once.surecler.map((x) => x.id))
    expect(sonra.kriterler.some((x) => eskiSurecIdler.has(x.surec_id))).toBe(false)

    // Kod bazında içerik aynı mı — süreç başına madde sayısı korunuyor mu
    const sayim = (k: typeof once) => {
      const kodById = new Map(k.surecler.map((s) => [s.id, s.kod]))
      const m = new Map<string, number>()
      for (const x of k.kriterler) {
        const kod = kodById.get(x.surec_id)!
        m.set(kod, (m.get(kod) ?? 0) + 1)
      }
      return m
    }
    const a = sayim(once)
    const b = sayim(sonra)
    expect([...a.keys()].sort()).toEqual([...b.keys()].sort())
    for (const [kod, adet] of a) expect(b.get(kod)).toBe(adet)
  })
})

test('uygulama rolü başka tenant’ın katalogunu göremez', async () => {
  const [demo] = await yonetici`SELECT id FROM tenant WHERE slug = 'demo-atolye'`
  if (!demo) return // demo tenant yoksa test anlamsız
  const sizinti = await tenantIcinde(async (sql) => {
    const [r] = await sql`
      SELECT count(*)::int AS adet FROM olgunluk_sablon WHERE tenant_id = ${demo.id}`
    return r.adet as number
  })
  expect(sizinti).toBe(0)
})
