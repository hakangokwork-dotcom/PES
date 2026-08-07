import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { yerlestir } from './yerlestir-kaydet'

/* Gerçek veritabanına bağlanır. Kendi ZZTEST atölyesini ve bantlarını
   açar, sonunda siler; gerçek atölyelere dokunmaz. */
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 15 })

let defaultTenant: string
let wsId: number
let lineIds: number[]
/* Onek 'ZZTEST' OLMAMALI: workshop-baglantilar.test.ts 'ZZTEST%' ile
   baslayan atolyeleri siliyor ve paralel kosarken bu dosyanin atolyesini
   altindan aliyordu. Test yalitimi, isim secimiyle korunuyor. */
const KOD = 'ZZYRLTST'

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
    VALUES (${defaultTenant}, ${KOD}, 'Yerlestirme Testi', 'X', 0,0,0,0,0,0,2,0,9)
    RETURNING id`
  wsId = w.id as number
  const bantlar = await yonetici`
    INSERT INTO production_line (tenant_id, workshop_id, code, name, daily_target, is_active)
    VALUES (${defaultTenant}, ${wsId}, ${KOD + '-B1'}, 'B1', 1000, true),
           (${defaultTenant}, ${wsId}, ${KOD + '-B2'}, 'B2', 500, true)
    RETURNING id`
  lineIds = bantlar.map(r => r.id as number)
})

afterEach(async () => {
  await yonetici`DELETE FROM work_order WHERE workshop_id = ${wsId}`
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

test('sipariş, zincir ve bant tahsisleri tek seferde yazılır', async () => {
  const sonuc = await tenantIcinde(sql => yerlestir(sql, defaultTenant, {
    siparisNo: 'ZZ-001', musteri: 'Test', modelAdi: 'M1',
    adet: 10_000, teslimTarihi: '2026-12-31', bugun: '2026-08-06',
    workshopId: wsId, lineIds,
    asamaKodlari: ['KESIM', 'DIKIM', 'UKP'],
  }))

  expect(sonuc.workOrderId).toBeGreaterThan(0)
  expect(sonuc.yetisiyor).toBe(true)

  const asamalar = await tenantIcinde(sql =>
    sql`SELECT ps.code FROM work_order_stage wos
        JOIN production_stage ps ON ps.id = wos.stage_id
        WHERE wos.work_order_id = ${sonuc.workOrderId} ORDER BY ps.sira_no`)
  expect(asamalar.map(a => a.code)).toEqual(['KESIM', 'DIKIM', 'UKP'])

  const tahsis = await tenantIcinde(sql =>
    sql`SELECT a.adet FROM work_order_stage_atama a
        JOIN work_order_stage wos ON wos.id = a.stage_row_id
        WHERE wos.work_order_id = ${sonuc.workOrderId} ORDER BY a.adet DESC`)
  expect(tahsis).toHaveLength(2)
  expect(Number(tahsis[0].adet) + Number(tahsis[1].adet)).toBe(10_000)
  expect(Number(tahsis[0].adet)).toBe(6667)
})

test('tarihler metin olarak döner, Date nesnesi değil', async () => {
  const sonuc = await tenantIcinde(sql => yerlestir(sql, defaultTenant, {
    siparisNo: 'ZZ-002', musteri: 'Test', modelAdi: 'M1',
    adet: 1000, teslimTarihi: '2026-12-31', bugun: '2026-08-06',
    workshopId: wsId, lineIds: [lineIds[0]],
    asamaKodlari: ['DIKIM'],
  }))
  const [t] = await tenantIcinde(sql =>
    sql`SELECT a.plan_baslangic::text, a.plan_bitis::text
        FROM work_order_stage_atama a
        JOIN work_order_stage wos ON wos.id = a.stage_row_id
        WHERE wos.work_order_id = ${sonuc.workOrderId}`)
  expect(typeof t.plan_baslangic).toBe('string')
  expect(t.plan_baslangic).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('yetişmeyen sipariş yine yazılır ama işaretli', async () => {
  const sonuc = await tenantIcinde(sql => yerlestir(sql, defaultTenant, {
    siparisNo: 'ZZ-003', musteri: 'Test', modelAdi: 'M1',
    adet: 100_000, teslimTarihi: '2026-08-10', bugun: '2026-08-06',
    workshopId: wsId, lineIds,
    asamaKodlari: ['DIKIM'],
  }))
  expect(sonuc.yetisiyor).toBe(false)
  expect(sonuc.workOrderId).toBeGreaterThan(0)
})

test('bant başka atölyeye aitse hata verir', async () => {
  const [baskaBant] = await yonetici`
    SELECT id FROM production_line WHERE workshop_id <> ${wsId} AND is_active LIMIT 1`
  await expect(tenantIcinde(sql => yerlestir(sql, defaultTenant, {
    siparisNo: 'ZZ-004', musteri: 'Test', modelAdi: 'M1',
    adet: 1000, teslimTarihi: '2026-12-31', bugun: '2026-08-06',
    workshopId: wsId, lineIds: [baskaBant.id as number],
    asamaKodlari: ['DIKIM'],
  }))).rejects.toThrow('bu atölyede bulunamadı')
})

test('ikinci siparis ayni bandi ayni gun kullanamaz', async () => {
  const ortak = {
    musteri: 'Test', modelAdi: 'M1', adet: 3000,
    teslimTarihi: '2026-12-31', bugun: '2026-08-06',
    workshopId: wsId, lineIds: [lineIds[0]], asamaKodlari: ['DIKIM'],
  }
  const a = await tenantIcinde(sql => yerlestir(sql, defaultTenant, { ...ortak, siparisNo: 'ZZ-A' }))
  const b = await tenantIcinde(sql => yerlestir(sql, defaultTenant, { ...ortak, siparisNo: 'ZZ-B' }))

  const pencereler = await tenantIcinde(sql => sql`
    SELECT wos.work_order_id, a.plan_baslangic::text, a.plan_bitis::text
    FROM work_order_stage_atama a
    JOIN work_order_stage wos ON wos.id = a.stage_row_id
    WHERE wos.work_order_id IN (${a.workOrderId}, ${b.workOrderId})
    ORDER BY a.plan_baslangic`)

  expect(pencereler).toHaveLength(2)
  const [ilk, ikinci] = pencereler
  // Aralıklar ÇAKIŞMAMALI: ilkin bitişi ikincinin başlangıcından önce
  expect(String(ilk.plan_bitis) < String(ikinci.plan_baslangic)).toBe(true)
  // İkinci sipariş geriye kaymış olmalı
  expect(b.kaydirilanGun).toBeGreaterThan(0)
})

test('kapasite tanimliysa asama tarih alir, tanimsizsa almaz', async () => {
  /* Kapasite ekraninin asil isi bu: tanimsiz asama zincirde TARIHSIZ
     kaliyor. Kesim'e kapasite verildiginde tarih uretilmeli, UKP
     tanimsiz kaldigi icin uretilmemeli. */
  const [kesim] = await yonetici`SELECT id FROM production_stage WHERE code='KESIM'`
  await yonetici`
    INSERT INTO workshop_stage_capacity ${yonetici({
      workshop_id: wsId, stage_id: kesim.id as number,
      tenant_id: defaultTenant, gunluk_kapasite: 2500,
    })}
    ON CONFLICT (workshop_id, stage_id) DO UPDATE SET gunluk_kapasite = 2500`

  try {
    const sonuc = await tenantIcinde(sql => yerlestir(sql, defaultTenant, {
      siparisNo: 'ZZ-KAP', musteri: 'Test', modelAdi: 'M1',
      adet: 10_000, teslimTarihi: '2026-12-31', bugun: '2026-08-06',
      workshopId: wsId, lineIds, asamaKodlari: ['KESIM', 'DIKIM', 'UKP'],
    }))

    const asamalar = await tenantIcinde(sql => sql`
      SELECT ps.code, s.plan_baslangic::text, s.plan_bitis::text
      FROM work_order_stage s JOIN production_stage ps ON ps.id = s.stage_id
      WHERE s.work_order_id = ${sonuc.workOrderId} ORDER BY ps.sira_no`)

    const k = asamalar.find(a => a.code === 'KESIM')!
    const u = asamalar.find(a => a.code === 'UKP')!

    // 10.000 / 2500 = 4 gun
    expect(k.plan_baslangic).not.toBeNull()
    expect(k.plan_bitis).not.toBeNull()
    expect(sonuc.elleTarihGereken).toContain('UKP')
    expect(sonuc.elleTarihGereken).not.toContain('KESIM')
    expect(u.plan_baslangic).toBeNull()
  } finally {
    await yonetici`DELETE FROM workshop_stage_capacity WHERE workshop_id = ${wsId}`
  }
})

test('dis atolyeye cikan asama o atolyeye yazilir', async () => {
  const [disAtolye] = await yonetici`
    SELECT id, code FROM workshop WHERE is_active AND id <> ${wsId} ORDER BY code LIMIT 1`
  const disId = disAtolye.id as number

  const sonuc = await tenantIcinde(sql => yerlestir(sql, defaultTenant, {
    siparisNo: 'ZZ-DIS', musteri: 'Test', modelAdi: 'M1',
    adet: 1000, teslimTarihi: '2026-12-31', bugun: '2026-08-06',
    workshopId: wsId, lineIds: [lineIds[0]],
    asamaKodlari: ['DIKIM', 'UKP'],
    disAtolye: { UKP: disId },
  }))

  const asamalar = await tenantIcinde(sql => sql`
    SELECT ps.code, s.workshop_id
    FROM work_order_stage s JOIN production_stage ps ON ps.id = s.stage_id
    WHERE s.work_order_id = ${sonuc.workOrderId} ORDER BY ps.sira_no`)

  const dikim = asamalar.find(a => a.code === 'DIKIM')!
  const ukp = asamalar.find(a => a.code === 'UKP')!
  expect(Number(dikim.workshop_id)).toBe(wsId)
  expect(Number(ukp.workshop_id)).toBe(disId)   // DIS atolye
})

test('dis atolyenin kapasitesi o asamanin suresini belirler', async () => {
  /* UKP disarida yapiliyorsa sure DIS atolyenin kapasitesinden cikmali;
     siparis atolyesinin kapasitesine bakmak yanlis tarih uretirdi. */
  const [dis] = await yonetici`
    SELECT id FROM workshop WHERE is_active AND id <> ${wsId} ORDER BY code LIMIT 1`
  const disId = dis.id as number
  const [ukpAsama] = await yonetici`SELECT id FROM production_stage WHERE code='UKP'`

  await yonetici`
    INSERT INTO workshop_stage_capacity ${yonetici({
      workshop_id: disId, stage_id: ukpAsama.id as number,
      tenant_id: defaultTenant, gunluk_kapasite: 500,
    })}
    ON CONFLICT (workshop_id, stage_id) DO UPDATE SET gunluk_kapasite = 500`

  try {
    const sonuc = await tenantIcinde(sql => yerlestir(sql, defaultTenant, {
      siparisNo: 'ZZ-DIS2', musteri: 'Test', modelAdi: 'M1',
      adet: 1000, teslimTarihi: '2026-12-31', bugun: '2026-08-06',
      workshopId: wsId, lineIds: [lineIds[0]],
      asamaKodlari: ['DIKIM', 'UKP'],
      disAtolye: { UKP: disId },
    }))
    // 1000 / 500 = 2 gun -> UKP tarih ALMALI, elleTarihGereken'de OLMAMALI
    expect(sonuc.elleTarihGereken).not.toContain('UKP')

    const [ukp] = await tenantIcinde(sql => sql`
      SELECT s.plan_baslangic::text, s.plan_bitis::text
      FROM work_order_stage s JOIN production_stage ps ON ps.id = s.stage_id
      WHERE s.work_order_id = ${sonuc.workOrderId} AND ps.code = 'UKP'`)
    expect(ukp.plan_baslangic).not.toBeNull()
    expect(ukp.plan_bitis).toBe('2026-12-31')
    expect(ukp.plan_baslangic).toBe('2026-12-30')   // 2 gun
  } finally {
    await yonetici`DELETE FROM workshop_stage_capacity WHERE workshop_id = ${disId}`
  }
})
