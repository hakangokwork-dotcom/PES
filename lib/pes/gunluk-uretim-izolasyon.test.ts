import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'

/* 036'nın kapattığı 033 BOŞLUĞU'nun kanıtı.

   work_order_gunluk_uretim ne workshop_id ne line_id taşır — yalnız
   atama_id. Bu yüzden 033'ün atölye kısıtı onu hiç kapsamadı ve
   verify_workshop_isolation.mjs de göremez: o betik yalnızca workshop_id
   kolonu OLAN tabloları tarar.

   Atölye bu tabloya günlük plan ve gerçekleşen YAZAR (tasarım K3), yani
   kısıt şart. 036 politikayı şu zincirle kuruyor:
     atama_id → work_order_stage_atama.line_id → production_line.workshop_id

   Bu test iki atölyeye birer satır yazar ve her atölye kullanıcısının
   yalnız kendi satırını gördüğünü doğrular. */

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 20 })

/* Onek baska test dosyalarinin temizligiyle carpismasin diye ozel. */
const KOD = 'ZZGUNIZO'
let tenantId: string
const atolye: { id: number; line: number; atama: number }[] = []

async function temizle() {
  await yonetici`
    DELETE FROM work_order
     WHERE workshop_id IN (SELECT id FROM workshop WHERE code LIKE ${KOD + '%'})`
  await yonetici`DELETE FROM production_line WHERE code LIKE ${KOD + '%'}`
  await yonetici`DELETE FROM workshop WHERE code LIKE ${KOD + '%'}`
}

/** Atölye kullanıcısı bağlamında okur — verify_workshop_isolation ile aynı desen. */
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

  const [dikim] = await yonetici`SELECT id FROM production_stage WHERE code = 'DIKIM'`

  for (const ek of ['A', 'B']) {
    const [w] = await yonetici`
      INSERT INTO workshop (tenant_id, code, name, type, total_staff, sewing_staff, ukp_staff,
                            cutting_staff, management, indirect, line_count, daily_target, net_hours_day)
      VALUES (${tenantId}, ${KOD + ek}, ${'Gunluk Izolasyon ' + ek}, 'X', 0,0,0,0,0,0, 1, 2000, 9)
      RETURNING id`
    const [l] = await yonetici`
      INSERT INTO production_line (tenant_id, workshop_id, code, name, daily_target, is_active)
      VALUES (${tenantId}, ${w.id}, ${KOD + ek + '-L1'}, 'Bant 1', 2000, TRUE)
      RETURNING id`
    const [wo] = await yonetici`
      INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum)
      VALUES (${tenantId}, ${w.id}, ${KOD + ek + '-WO'}, 'Izolasyon Modeli', 4000, 'Planlandi')
      RETURNING id`
    const [ws] = await yonetici`
      INSERT INTO work_order_stage (work_order_id, tenant_id, stage_id, sira_no, line_id,
                                    plan_baslangic, plan_bitis)
      VALUES (${wo.id}, ${tenantId}, ${dikim.id}, 20, ${l.id}, '2027-01-04', '2027-01-05')
      RETURNING id`
    const [a] = await yonetici`
      INSERT INTO work_order_stage_atama (stage_row_id, tenant_id, line_id, adet,
                                          plan_baslangic, plan_bitis)
      VALUES (${ws.id}, ${tenantId}, ${l.id}, 4000, '2027-01-04', '2027-01-05')
      RETURNING id`
    await yonetici`
      INSERT INTO work_order_gunluk_uretim (atama_id, tenant_id, tarih, plan_adet, adet)
      VALUES (${a.id}, ${tenantId}, '2027-01-04', 1800, NULL)`

    atolye.push({ id: w.id as number, line: l.id as number, atama: a.id as number })
  }
})

afterAll(async () => {
  await temizle()
  await yonetici.end()
  await uygulama.end()
})

test('merkez kullanıcısı iki atölyenin de satırını görür', async () => {
  const satirlar = await baglamda(null, (tx) => tx`
    SELECT atama_id FROM work_order_gunluk_uretim
     WHERE atama_id IN ${tx([atolye[0].atama, atolye[1].atama])}`)
  expect(satirlar).toHaveLength(2)
})

test('atölye kullanıcısı YALNIZ kendi satırını görür', async () => {
  for (const [i, kendi] of atolye.entries()) {
    const digeri = atolye[1 - i]
    const satirlar = await baglamda(kendi.id, (tx) => tx`
      SELECT atama_id FROM work_order_gunluk_uretim
       WHERE atama_id IN ${tx([kendi.atama, digeri.atama])}`)
    expect(satirlar).toHaveLength(1)
    expect(satirlar[0].atama_id).toBe(kendi.atama)
  }
})

test('atölye kullanıcısı başka atölyenin gününe yazamaz', async () => {
  const yazilan = await baglamda(atolye[0].id, (tx) => tx`
    UPDATE work_order_gunluk_uretim SET plan_adet = 9999
     WHERE atama_id = ${atolye[1].atama}
    RETURNING atama_id`)
  expect(yazilan).toHaveLength(0)

  /* Gerçekten değişmediğini yönetici bağlantısıyla doğrula — RLS'in
     satırı gizlemesi ile yazmayı engellemesi ayrı şeylerdir. */
  const [kontrol] = await yonetici`
    SELECT plan_adet FROM work_order_gunluk_uretim WHERE atama_id = ${atolye[1].atama}`
  expect(kontrol.plan_adet).toBe(1800)
})

test('adet NULL yazılabiliyor — girilmedi ile sıfır üretim ayrı', async () => {
  const [satir] = await yonetici`
    SELECT adet, plan_adet FROM work_order_gunluk_uretim WHERE atama_id = ${atolye[0].atama}`
  expect(satir.adet).toBeNull()
  expect(satir.plan_adet).toBe(1800)
})
