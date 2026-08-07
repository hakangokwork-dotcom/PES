import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { gunlukSatirlar, gunlukKaydet } from './gunluk-uretim'

/* Gerçek veritabanına bağlanır. Kendi atölyesini/bantlarını açar,
   sonunda siler; gerçek atölyelere dokunmaz. */
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
let dikimStageId: number

/* Onek her test dosyasinda FARKLI olmali: 'ZZTEST%' silen bir dosya
   paralel kosarken baskasinin atolyesini altindan aliyordu. */
const KOD = 'ZZGUNTST'

async function temizle() {
  await yonetici`DELETE FROM work_order WHERE workshop_id IN (SELECT id FROM workshop WHERE code = ${KOD})`
  await yonetici`DELETE FROM production_line WHERE code LIKE ${KOD + '%'}`
  await yonetici`DELETE FROM workshop WHERE code = ${KOD}`
}

beforeAll(async () => {
  const [d] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  defaultTenant = d.id
  const [ps] = await yonetici`SELECT id FROM production_stage WHERE code = 'DIKIM'`
  dikimStageId = ps.id as number

  await temizle()
  const [w] = await yonetici`
    INSERT INTO workshop (tenant_id, code, name, type, total_staff, sewing_staff, ukp_staff,
                          cutting_staff, management, indirect, line_count, daily_target, net_hours_day)
    VALUES (${defaultTenant}, ${KOD}, 'Gunluk Uretim Testi', 'X', 0,0,0,0,0,0,1,0,9)
    RETURNING id`
  wsId = w.id as number
  const [b] = await yonetici`
    INSERT INTO production_line (tenant_id, workshop_id, code, name, daily_target, is_active)
    VALUES (${defaultTenant}, ${wsId}, ${KOD + '-B1'}, 'B1', 1000, true)
    RETURNING id`
  lineId = b.id as number
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

/** Test için sipariş + dikim aşaması + bant tahsisi kurar, atama_id döner. */
async function atamaKur(opts: {
  no: string; adet: number; baslangic: string; bitis: string; durum?: string
}): Promise<number> {
  const [wo] = await yonetici`
    INSERT INTO work_order ${yonetici({
      tenant_id: defaultTenant, is_emri_no: opts.no, siparis_no: opts.no,
      workshop_id: wsId, model_adi: 'M1', siparis_miktari: opts.adet,
      durum: opts.durum ?? 'Devam',
    })} RETURNING id`
  const [stage] = await yonetici`
    INSERT INTO work_order_stage ${yonetici({
      tenant_id: defaultTenant, work_order_id: wo.id as number,
      stage_id: dikimStageId, sira_no: 20, workshop_id: wsId,
      plan_baslangic: opts.baslangic, plan_bitis: opts.bitis, durum: 'Beklemede',
    })} RETURNING id`
  const [atama] = await yonetici`
    INSERT INTO work_order_stage_atama ${yonetici({
      stage_row_id: stage.id as number, tenant_id: defaultTenant, line_id: lineId,
      adet: opts.adet, plan_baslangic: opts.baslangic, plan_bitis: opts.bitis,
    })} RETURNING id`
  return atama.id as number
}

test('plan penceresindeki bant listelenir, tarihler metin gelir', async () => {
  await atamaKur({ no: 'ZZG-001', adet: 4000, baslangic: '2026-08-10', bitis: '2026-08-13' })

  const satirlar = await tenantIcinde(sql => gunlukSatirlar(sql, wsId, '2026-08-11'))
  expect(satirlar).toHaveLength(1)
  const s = satirlar[0]

  expect(s.isEmriNo).toBe('ZZG-001')
  expect(s.tahsisAdet).toBe(4000)
  expect(s.kayitVar).toBe(false)
  expect(s.girilenAdet).toBe(0)
  // 4000 adet / 4 gun
  expect(s.gunlukHedef).toBe(1000)
  /* Date tuzagi: postgres.js DATE'i Date nesnesine ceviriyor, arayuz
     .slice ile cokuyor. ::text ile metin kalmali. */
  expect(typeof s.planBaslangic).toBe('string')
  expect(s.planBaslangic).toBe('2026-08-10')
})

test('girilen adet kaydedilir ve aynı gün üzerine yazılır', async () => {
  const atamaId = await atamaKur({ no: 'ZZG-002', adet: 4000, baslangic: '2026-08-10', bitis: '2026-08-13' })

  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-11', 900, 12))
  let [s] = await tenantIcinde(sql => gunlukSatirlar(sql, wsId, '2026-08-11'))
  expect(s.girilenAdet).toBe(900)
  expect(s.girilenHatali).toBe(12)
  expect(s.kayitVar).toBe(true)

  // Ikinci kayit yeni satir ACMAZ, uzerine yazar (UNIQUE atama_id+tarih)
  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-11', 950, 0))
  ;[s] = await tenantIcinde(sql => gunlukSatirlar(sql, wsId, '2026-08-11'))
  expect(s.girilenAdet).toBe(950)
  expect(s.girilenHatali).toBe(0)

  const sayim = await tenantIcinde(sql =>
    sql`SELECT count(*)::int AS n FROM work_order_gunluk_uretim WHERE atama_id = ${atamaId}`)
  expect(sayim[0].n).toBe(1)
})

test('0 adet gerçek bir kayıttır, boş bırakmak kaydı siler', async () => {
  /* "Bugun hic cikmadi" (0) ile "henuz girilmedi" (kayit yok) farkli
     seylerdir. 0'i silmek, duran bir bandi girilmemis gostermek olurdu. */
  const atamaId = await atamaKur({ no: 'ZZG-003', adet: 4000, baslangic: '2026-08-10', bitis: '2026-08-13' })

  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-11', 0, 0))
  let [s] = await tenantIcinde(sql => gunlukSatirlar(sql, wsId, '2026-08-11'))
  expect(s.kayitVar).toBe(true)
  expect(s.girilenAdet).toBe(0)

  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-11', null, 0))
  ;[s] = await tenantIcinde(sql => gunlukSatirlar(sql, wsId, '2026-08-11'))
  expect(s.kayitVar).toBe(false)
})

test('önceki günlerin toplamı kümülatife girer, sonraki günler girmez', async () => {
  const atamaId = await atamaKur({ no: 'ZZG-004', adet: 4000, baslangic: '2026-08-10', bitis: '2026-08-13' })

  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-10', 800, 0))
  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-11', 900, 0))
  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-12', 700, 0))

  const [s] = await tenantIcinde(sql => gunlukSatirlar(sql, wsId, '2026-08-11'))
  expect(s.oncekiToplam).toBe(800)          // yalniz 10 Agustos
  expect(s.girilenAdet).toBe(900)
  expect(s.kalanAdet).toBe(4000 - 800 - 900) // 12 Agustos'taki 700 HARIC
})

test('planı geçmiş ama bitmemiş tahsis listede kalır', async () => {
  /* Uretim plani asarsa bant o gun de calisiyordur. Pencere disinda
     diye gizlemek, girisi imkansiz kilardi. */
  const atamaId = await atamaKur({ no: 'ZZG-005', adet: 4000, baslangic: '2026-08-10', bitis: '2026-08-13' })
  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-13', 3000, 0))

  const satirlar = await tenantIcinde(sql => gunlukSatirlar(sql, wsId, '2026-08-20'))
  expect(satirlar).toHaveLength(1)
  expect(satirlar[0].gecikmis).toBe(true)
  expect(satirlar[0].kalanAdet).toBe(1000)
})

test('tahsis tamamlandıysa plan sonrası listeden düşer', async () => {
  const atamaId = await atamaKur({ no: 'ZZG-006', adet: 4000, baslangic: '2026-08-10', bitis: '2026-08-13' })
  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-13', 4000, 0))

  const satirlar = await tenantIcinde(sql => gunlukSatirlar(sql, wsId, '2026-08-20'))
  expect(satirlar).toHaveLength(0)
})

test('aşamanın üretilen/hatalı adedi günlük girişten türetilir', async () => {
  /* Aynı sayının iki kaynağı olmasın: aşama ekranında elle yazılan
     "üretilen adet" giriş yapıldığı anda girişten hesaplanmalı. */
  const atamaId = await atamaKur({ no: 'ZZG-008', adet: 4000, baslangic: '2026-08-10', bitis: '2026-08-13' })
  const [stage] = await yonetici`
    SELECT stage_row_id FROM work_order_stage_atama WHERE id = ${atamaId}`
  const stageRowId = stage.stage_row_id as number

  await yonetici`UPDATE work_order_stage SET uretilen_adet = 0 WHERE id = ${stageRowId}`

  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-10', 800, 6))
  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-11', 900, 4))

  const [s] = await yonetici`
    SELECT uretilen_adet, hatali_adet FROM work_order_stage WHERE id = ${stageRowId}`
  expect(Number(s.uretilen_adet)).toBe(1700)
  expect(Number(s.hatali_adet)).toBe(10)

  // Bir gunun girisi silinince toplam da duser
  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-11', null, 0))
  const [s2] = await yonetici`
    SELECT uretilen_adet FROM work_order_stage WHERE id = ${stageRowId}`
  expect(Number(s2.uretilen_adet)).toBe(800)
})

test('son giriş silinince elle yazılan değer sıfırlanmaz', async () => {
  /* Kimsenin yazmadigi bir 0, uretim durmus gibi okunur. Giris
     kalmadiginda deger oldugu gibi birakilir. */
  const atamaId = await atamaKur({ no: 'ZZG-009', adet: 4000, baslangic: '2026-08-10', bitis: '2026-08-13' })
  const [stage] = await yonetici`
    SELECT stage_row_id FROM work_order_stage_atama WHERE id = ${atamaId}`
  const stageRowId = stage.stage_row_id as number

  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-10', 800, 0))
  await tenantIcinde(sql => gunlukKaydet(sql, defaultTenant, atamaId, '2026-08-10', null, 0))

  const [s] = await yonetici`
    SELECT uretilen_adet FROM work_order_stage WHERE id = ${stageRowId}`
  expect(Number(s.uretilen_adet)).toBe(800)
})

test('başka atölyenin bandı listeye girmez', async () => {
  await atamaKur({ no: 'ZZG-007', adet: 4000, baslangic: '2026-08-10', bitis: '2026-08-13' })

  const [baska] = await yonetici`
    SELECT id FROM workshop WHERE id <> ${wsId} AND is_active ORDER BY code LIMIT 1`
  const satirlar = await tenantIcinde(sql =>
    gunlukSatirlar(sql, baska.id as number, '2026-08-11'))
  expect(satirlar.some(s => s.isEmriNo === 'ZZG-007')).toBe(false)
})
