import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { sablonlar, varsayilanSablon } from './olgunluk'
import { denetimDetay, filoDurumu } from './olgunluk-denetim'

/* Denetimin TAM AKIŞI, uygulamanın rolüyle (pes_app, NOBYPASSRLS):
   sürüm yayınla -> denetim aç -> madde işaretle -> seviye türet ->
   tamamla -> filo görünümünde çık.

   Neden uçtan uca: puan hiçbir yerde saklanmıyor, dört view'ın üstüste
   binmesiyle çıkıyor. Parçaları ayrı ayrı doğru olup birleşimi yanlış
   olabilir — örneğin denetim 'taslak' kaldığında filo görünümünde
   görünmemesi gerekir, bu ancak zincirin tamamı çalıştırılınca ölçülür.

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

/* ÜRETİM VERİSİNDEN YALITIM — 2026-08-07'de bu iki noktadan kırıldı:

   1) Tarih: (workshop_id, sablon_id, tarih) benzersiz. Test bugünün
      tarihiyle denetim açınca kullanıcının aynı gün açtığı gerçek
      denetimle çakıştı. Uzak gelecekteki sabit bir gün hem çakışmayı
      hem de "en son denetim" sıralamasını deterministik yapar.

   2) Atölye: hiç olgunluk denetimi OLMAYAN bir atölye seçilir. Aksi
      halde kullanıcının o atölyedeki açık taslağı, testin "tamamlayınca
      taslak kalmamalı" beklentisini bozar.

   Transaction geri alındığı için ikisi de veriye hiç yazılmaz. */
const TEST_TARIH = '2099-12-31'

/** Yayında sürüm + temiz atölyede açık denetim; üç seviyesi de dolu bir süreç. */
async function kurulum(sql: postgres.TransactionSql) {
  const hepsi = await sablonlar(sql)
  const sablon = varsayilanSablon(hepsi)!
  await sql`
    UPDATE olgunluk_sablon SET durum = 'arsiv'
     WHERE tenant_id = ${defaultTenant} AND durum = 'yayinda' AND id <> ${sablon.id}`
  await sql`
    UPDATE olgunluk_sablon SET durum = 'yayinda', yayin_tarihi = now() WHERE id = ${sablon.id}`

  const [w] = await sql`
    SELECT w.id, w.code FROM workshop w
     WHERE w.is_active
       AND NOT EXISTS (SELECT 1 FROM olgunluk_denetim d WHERE d.workshop_id = w.id)
     ORDER BY w.id LIMIT 1`
  if (!w) throw new Error('Denetimi hiç olmayan aktif atölye bulunamadı')

  const [denetim] = await sql`
    INSERT INTO olgunluk_denetim (tenant_id, workshop_id, sablon_id, tarih, denetci)
    VALUES (${defaultTenant}, ${w.id}, ${sablon.id}, ${TEST_TARIH}, 'test')
    RETURNING id`

  const [surec] = await sql`
    SELECT s.id, s.kod, s.kategori_id
      FROM olgunluk_surec s
     WHERE s.sablon_id = ${sablon.id}
       AND (SELECT count(DISTINCT seviye) FROM olgunluk_kriter k WHERE k.surec_id = s.id) = 3
     ORDER BY s.sira LIMIT 1`

  return { sablon, workshopId: w.id as number, denetimId: denetim.id as number, surec }
}

async function isaretle(
  sql: postgres.TransactionSql, denetimId: number, surecId: number, sonuc: string
) {
  const kriterler = await sql`
    SELECT id FROM olgunluk_kriter
     WHERE surec_id = ${surecId} AND aktif AND taraf = 'ATOLYE'`
  for (const k of kriterler) {
    await sql`
      INSERT INTO olgunluk_denetim_kriter (denetim_id, kriter_id, tenant_id, sonuc)
      VALUES (${denetimId}, ${k.id}, ${defaultTenant}, ${sonuc})
      ON CONFLICT (denetim_id, kriter_id) DO UPDATE SET sonuc = EXCLUDED.sonuc`
  }
  return kriterler.length
}

test('uygulama rolü denetim açıp madde işaretleyebiliyor', async () => {
  await geriAlinan(async (sql) => {
    const { denetimId, surec } = await kurulum(sql)
    const adet = await isaretle(sql, denetimId, surec.id, 'EVET')
    expect(adet).toBeGreaterThan(0)

    const d = await denetimDetay(sql, denetimId)
    expect(d).not.toBeNull()
    expect(d!.cevaplar.length).toBe(adet)
    expect(d!.baslik.durum).toBe('taslak')
  })
})

test('hepsi Sağlanıyor işaretlenince süreç seviye 3 olur, payda o süreçten gelir', async () => {
  await geriAlinan(async (sql) => {
    const { denetimId, surec } = await kurulum(sql)
    await isaretle(sql, denetimId, surec.id, 'EVET')

    const d = (await denetimDetay(sql, denetimId))!
    const sv = d.seviyeler.find((s) => s.surec_id === surec.id)
    expect(sv?.seviye).toBe(3)

    // Yalnız bu süreç değerlendirildi; geri kalanı paydaya girmemeli.
    expect(d.ozet?.degerlendirilen).toBe(1)
    expect(d.ozet?.degerlendirilmeyen).toBe(d.surecler.length - 1)
    expect(d.ozet?.yuzde).toBe('100.0')

    // Kategori kırılımı da yalnız bu süreci saymalı.
    const kat = d.kategoriSeviyeleri.find((k) => k.kategori_id === surec.kategori_id)
    expect(kat?.surec_adedi).toBe(1)
    expect(Number(kat?.ortalama_seviye)).toBe(3)
  })
})

test('taslak denetim filo görünümüne girmez, tamamlanınca girer', async () => {
  await geriAlinan(async (sql) => {
    const { denetimId, workshopId, surec } = await kurulum(sql)
    await isaretle(sql, denetimId, surec.id, 'EVET')

    const once = await filoDurumu(sql)
    const oncekiSatir = once.satirlar.find((s) => s.workshop_id === workshopId)!
    expect(oncekiSatir.sinif).toBe('YOK')          // henüz taslak
    expect(oncekiSatir.taslak_id).toBe(denetimId)  // ama "devam et" bağlantısı var

    await sql`
      UPDATE olgunluk_denetim SET durum = 'tamamlandi', tamamlandi_at = now()
       WHERE id = ${denetimId}`

    const sonra = await filoDurumu(sql)
    const satir = sonra.satirlar.find((s) => s.workshop_id === workshopId)!
    expect(satir.denetim_id).toBe(denetimId)
    expect(satir.sinif).toBe('A')
    expect(satir.yuzde).toBe('100.0')
    expect(satir.taslak_id).toBeNull()

    // Isı haritası hücresi: sürecin kategorisi dolu, diğerleri boş.
    const katKod = sonra.kategoriKodlari.find((k) =>
      satir.kategoriler[k.kod] !== undefined && satir.kategoriler[k.kod] !== null)
    expect(katKod).toBeDefined()
    expect(satir.kategoriler[katKod!.kod]).toBe(3)
  })
})

test('bir madde Sağlanmıyor olunca seviye düşer ve yüzde geriler', async () => {
  await geriAlinan(async (sql) => {
    const { denetimId, surec } = await kurulum(sql)
    await isaretle(sql, denetimId, surec.id, 'EVET')

    const [ilk] = await sql`
      SELECT id FROM olgunluk_kriter
       WHERE surec_id = ${surec.id} AND seviye = 1 AND aktif AND taraf = 'ATOLYE'
       ORDER BY sira LIMIT 1`
    await sql`
      UPDATE olgunluk_denetim_kriter SET sonuc = 'HAYIR'
       WHERE denetim_id = ${denetimId} AND kriter_id = ${ilk.id}`

    const d = (await denetimDetay(sql, denetimId))!
    expect(d.seviyeler.find((s) => s.surec_id === surec.id)?.seviye).toBe(0)
    expect(d.ozet?.yuzde).toBe('0.0')
  })
})

test('kapsam dışı madde seviyeyi düşürmez', async () => {
  await geriAlinan(async (sql) => {
    const { denetimId, surec } = await kurulum(sql)
    await isaretle(sql, denetimId, surec.id, 'EVET')

    const [ilk] = await sql`
      SELECT id FROM olgunluk_kriter
       WHERE surec_id = ${surec.id} AND seviye = 1 AND aktif AND taraf = 'ATOLYE'
       ORDER BY sira LIMIT 1`
    await sql`
      UPDATE olgunluk_denetim_kriter SET sonuc = 'KAPSAM_DISI'
       WHERE denetim_id = ${denetimId} AND kriter_id = ${ilk.id}`

    const d = (await denetimDetay(sql, denetimId))!
    expect(d.seviyeler.find((s) => s.surec_id === surec.id)?.seviye).toBe(3)
  })
})
