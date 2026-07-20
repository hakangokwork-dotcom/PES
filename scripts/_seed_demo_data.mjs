import postgres from 'postgres'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const PW = decodeURIComponent(env.DATABASE_URL.split(':')[2].split('@')[0])
const sql = postgres({ host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  username: 'postgres.esucqswvhlnrmcownhbd', password: PW, max: 1, prepare: false, connect_timeout: 20, idle_timeout: 40 })

// deterministik varyasyon
let _s = 12345
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff }
const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1))
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const jitter = (v, pct) => Math.round(v * (1 + (rnd() - 0.5) * 2 * pct))

const MODELS = ['Basic Tişört', 'Polo Yaka T-Shirt', 'Erkek Gömlek', 'Kadın Bluz', '5 Cep Jean',
  'Eşofman Altı', 'Sweatshirt', 'Kapüşonlu Hırka', 'Şort', 'Örme Elbise', 'Chino Pantolon', 'Sweat Şort']
const MUSTERILER = ['LC Waikiki', 'Koton', 'DeFacto', 'Mavi', 'Colin\'s', 'Zara (Inditex)', 'H&M', 'Boyner']
const OPERASYONLAR = ['Omuz Dikişi', 'Yan Dikiş', 'Kol Takma', 'Yaka Biye', 'Etek Reçme', 'Cep Dikişi',
  'Fermuar Takma', 'Ilik-Düğme', 'Ütü-Pres', 'Son Kontrol']
const MAKINELER = ['Overlok', 'Düz', 'Reçme', 'Zincir', 'İlik', 'Düğme', 'Pres']
const ISIMLER = ['Ayşe Yıldız', 'Fatma Demir', 'Zeynep Kaya', 'Elif Şahin', 'Meryem Çelik', 'Hatice Arslan',
  'Emine Doğan', 'Sultan Yılmaz', 'Havva Aydın', 'Rukiye Öztürk', 'Ali Koç', 'Mehmet Aksoy',
  'Mustafa Polat', 'Hüseyin Er', 'İbrahim Taş']

const WORKSHOPS = [
  { code: 'FA-01', name: 'Yıldız Tekstil', city: 'İstanbul', district: 'Güngören', type: 'A', bolge: 1, sewing: 120, tier: 'A' },
  { code: 'FA-02', name: 'Marmara Konfeksiyon', city: 'Tekirdağ', district: 'Çorlu', type: 'A', bolge: 1, sewing: 95, tier: 'A' },
  { code: 'FA-03', name: 'Ege Denim', city: 'İzmir', district: 'Torbalı', type: 'B', bolge: 2, sewing: 82, tier: 'B' },
  { code: 'FA-04', name: 'Bursa Moda', city: 'Bursa', district: 'İnegöl', type: 'B', bolge: 1, sewing: 70, tier: 'B' },
  { code: 'FA-05', name: 'Denizli Örme', city: 'Denizli', district: 'Merkezefendi', type: 'B', bolge: 2, sewing: 60, tier: 'B' },
  { code: 'FA-06', name: 'Anadolu Giyim', city: 'Gaziantep', district: 'Şehitkamil', type: 'C', bolge: 3, sewing: 45, tier: 'C' },
  { code: 'FA-07', name: 'Çukurova Tekstil', city: 'Adana', district: 'Seyhan', type: 'C', bolge: 3, sewing: 52, tier: 'C' },
  { code: 'FA-08', name: 'Trakya Dikim', city: 'Tekirdağ', district: 'Malkara', type: 'C', bolge: 1, sewing: 38, tier: 'C' },
]
// tier -> verimlilik & kalite bantları
const TIER = {
  A: { eff: [90, 98], fpq: [96, 99], turnover: [1.5, 4], defectRate: [0.5, 2] },
  B: { eff: [80, 92], fpq: [92, 97], turnover: [3, 7], defectRate: [1.5, 4] },
  C: { eff: [66, 84], fpq: [86, 94], turnover: [6, 13], defectRate: [3, 7] },
}
const PERIODS = [[2025, 11], [2025, 12], [2026, 1]]

async function main() {
  const [{ id: tid }] = await sql`SELECT id FROM tenant WHERE slug = 'demo-atolye' LIMIT 1`
  console.log('tenant demo-atolye:', tid)

  // referans id'ler
  const cats = await sql`SELECT id, code, group_type FROM product_category ORDER BY id`
  const templates = await sql`SELECT code, category_id FROM process_template ORDER BY id`
  const processes = await sql`SELECT id, code FROM master_process ORDER BY id`

  // temizle (tekrar çalıştırılabilir) — operasyonel tablolar
  console.log('temizleniyor...')
  await sql.unsafe(`TRUNCATE TABLE
    work_order_status_history, work_order_journal, work_order_material, work_order_stage, work_order,
    operator_performance, operator, kaizen_action, ukp_record, yikama_record, operation_measurement,
    wip_record, supplier_score, workforce_turnover, changeover_record, downtime_record, quality_record,
    monthly_production, monthly_expense, line_process_capacity, line_capability, line_schedule,
    workshop_product, production_line, eder_model_islem, eder_alt_operasyon, eder_operasyon_grubu,
    eder_atolye_teklif, eder_model, workshop
    RESTART IDENTITY CASCADE`)

  // 1) ATÖLYELER
  const wsIds = {}
  for (const w of WORKSHOPS) {
    const total = Math.round(w.sewing / 0.72)
    const ukp = Math.round(w.sewing * 0.14), cutting = Math.round(w.sewing * 0.06)
    const mgmt = Math.max(2, Math.round(w.sewing * 0.03)), indirect = total - w.sewing - ukp - cutting - mgmt
    const lineCount = w.sewing >= 90 ? 4 : w.sewing >= 60 ? 3 : 2
    const [row] = await sql`INSERT INTO workshop
      (tenant_id, code, name, city, district, type, total_staff, sewing_staff, ukp_staff, cutting_staff,
       management, indirect, line_count, daily_target, net_hours_day, bolge, is_active)
      VALUES (${tid}, ${w.code}, ${w.name}, ${w.city}, ${w.district}, ${w.type}, ${total}, ${w.sewing},
       ${ukp}, ${cutting}, ${mgmt}, ${Math.max(0, indirect)}, ${lineCount}, ${w.sewing * 12}, 9.0, ${w.bolge}, true)
      RETURNING id`
    wsIds[w.code] = { id: row.id, ...w, total, lineCount }
  }
  console.log('atölyeler:', Object.keys(wsIds).length)

  // 2) BANTLAR
  const linesByWs = {}
  for (const code in wsIds) {
    const w = wsIds[code]; linesByWs[code] = []
    for (let i = 1; i <= w.lineCount; i++) {
      const opc = Math.round(w.sewing / w.lineCount)
      const [row] = await sql`INSERT INTO production_line
        (tenant_id, code, workshop_id, name, line_type, operator_count, daily_target, max_cycle_sec, is_active)
        VALUES (${tid}, ${code + '-B' + i}, ${w.id}, ${'Bant ' + i}, ${i === w.lineCount && w.lineCount > 2 ? 'Küçük' : 'Normal'},
          ${opc}, ${opc * 12}, ${ri(28, 55)}, true) RETURNING id`
      linesByWs[code].push(row.id)
    }
  }
  console.log('bantlar:', Object.values(linesByWs).flat().length)

  // 3) WORKSHOP_PRODUCT (hangi atölye hangi ürünü yapıyor)
  for (const code in wsIds) {
    const w = wsIds[code]
    const picks = [pick(cats), pick(cats)]
    for (const c of picks) {
      const tpl = templates.find(t => t.category_id === c.id)
      if (!tpl) continue
      await sql`INSERT INTO workshop_product (tenant_id, workshop_id, category_id, template_code, line_id, start_date, is_active)
        VALUES (${tid}, ${w.id}, ${c.id}, ${tpl.code}, ${linesByWs[code][0]}, '2025-09-01', true)
        ON CONFLICT DO NOTHING`
    }
  }

  // 4) AYLIK ÜRETİM + GİDER + KALİTE + İŞGÜCÜ + SKOR (3 dönem)
  const scorePrev = {}
  for (const [yi, [year, month]] of PERIODS.entries()) {
    for (const code in wsIds) {
      const w = wsIds[code], band = TIER[w.tier]
      const workDays = ri(21, 24)
      // üretim (bant başına)
      let wsTarget = 0, wsActual = 0
      for (const lineId of linesByWs[code]) {
        const model = pick(MODELS)
        const gt = pick(['Alt', 'Üst'])
        const sam = +(rnd() * 12 + 6).toFixed(1)
        const dailyCap = Math.round((w.sewing / w.lineCount) * 9 * 60 / sam)
        const target = dailyCap * workDays
        const effPct = ri(band.eff[0], band.eff[1]) + yi * 1.2 // hafif iyileşme trendi
        const actual = Math.round(target * effPct / 100)
        wsTarget += target; wsActual += actual
        await sql`INSERT INTO monthly_production
          (tenant_id, line_id, workshop_id, year, month, model_code, group_type, total_sam, target_qty, actual_qty, work_days)
          VALUES (${tid}, ${lineId}, ${w.id}, ${year}, ${month}, ${model}, ${gt}, ${sam}, ${target}, ${actual}, ${workDays})`
      }
      // gider
      const perStaff = ri(28000, 36000)
      const personnel = w.total * perStaff
      const target_revenue = Math.round(wsActual * (rnd() * 18 + 32)) // adet başı ~32-50 TL
      await sql`INSERT INTO monthly_expense
        (tenant_id, workshop_id, year, month, work_days, personnel, sgk, food, electricity, water, gas,
         transport, vehicle, cargo, machine_maint, thread, other, target_revenue)
        VALUES (${tid}, ${w.id}, ${year}, ${month}, ${workDays}, ${personnel}, ${Math.round(personnel * 0.34)},
          ${w.total * 2400}, ${jitter(85000, .2)}, ${jitter(12000, .3)}, ${jitter(45000, .3)},
          ${w.total * 1600}, ${jitter(38000, .3)}, ${jitter(22000, .3)}, ${jitter(31000, .25)},
          ${jitter(28000, .3)}, ${jitter(40000, .3)}, ${target_revenue})`
      // kalite
      const inspected = Math.round(wsActual * 0.9)
      const fpqPct = ri(band.fpq[0], band.fpq[1])
      const firstPass = Math.round(inspected * fpqPct / 100)
      const rejected = Math.round(inspected * (band.defectRate[0] + rnd() * (band.defectRate[1] - band.defectRate[0])) / 100)
      const rework = inspected - firstPass - rejected
      await sql`INSERT INTO quality_record
        (tenant_id, workshop_id, line_id, year, month, inspected_qty, first_pass_qty, rejected_qty, rework_qty,
         top_defect_cat, customer_return, model_code)
        VALUES (${tid}, ${w.id}, ${linesByWs[code][0]}, ${year}, ${month}, ${inspected}, ${firstPass}, ${rejected},
          ${Math.max(0, rework)}, ${pick(['Dikiş Atlaması', 'Ölçü Hatası', 'Leke', 'İplik Ucu', 'Renk Farkı'])},
          ${ri(0, Math.round(rejected * 0.2))}, ${pick(MODELS)})`
      // işgücü
      const turnoverPct = band.turnover[0] + rnd() * (band.turnover[1] - band.turnover[0])
      const left = Math.round(w.total * turnoverPct / 100)
      await sql`INSERT INTO workforce_turnover
        (tenant_id, workshop_id, year, month, total_staff, left_count, joined_count, in_warmup, avg_tenure_mon)
        VALUES (${tid}, ${w.id}, ${year}, ${month}, ${w.total}, ${left}, ${left + ri(-1, 3)},
          ${ri(0, Math.round(w.total * 0.08))}, ${+(rnd() * 20 + 10).toFixed(1)})`
      // skor
      const effSc = Math.min(100, Math.round(wsTarget > 0 ? wsActual / wsTarget * 100 : 0))
      const qualSc = fpqPct
      const delivSc = ri(band.eff[0] - 5, 98)
      const costSc = ri(band.eff[0] - 8, 96)
      const compSc = ri(75, 99)
      const composite = Math.round(effSc * .3 + qualSc * .25 + delivSc * .2 + costSc * .15 + compSc * .1)
      const tier = composite >= 85 ? 'Stratejik' : composite >= 70 ? 'Gelişen' : composite >= 55 ? 'İzlemede' : composite >= 40 ? 'Risk' : 'Kritik'
      const prev = scorePrev[code] ?? null
      const trend = prev === null ? 'Sabit' : composite - prev > 2 ? 'Artış' : composite - prev < -2 ? 'Düşüş' : 'Sabit'
      scorePrev[code] = composite
      await sql`INSERT INTO supplier_score
        (tenant_id, workshop_id, year, month, efficiency_sc, quality_sc, delivery_sc, cost_sc, compliance_sc,
         composite_sc, tier, prev_sc, trend, on_time_delivery_pct, cost_efficiency_pct)
        VALUES (${tid}, ${w.id}, ${year}, ${month}, ${effSc}, ${qualSc}, ${delivSc}, ${costSc}, ${compSc},
          ${composite}, ${tier}, ${prev}, ${trend}, ${delivSc}, ${costSc})`
    }
  }
  console.log('aylık üretim/gider/kalite/işgücü/skor: 3 dönem ×', WORKSHOPS.length, 'atölye')

  // 5) DURUŞ + CHANGEOVER (son dönem, bant başına birkaç kayıt)
  let dtN = 0, coN = 0
  for (const code in wsIds) {
    for (const lineId of linesByWs[code]) {
      for (let k = 0; k < ri(2, 5); k++) {
        const day = ri(1, 27)
        await sql`INSERT INTO downtime_record
          (tenant_id, line_id, workshop_id, occurred_at, duration_min, downtime_type, reason, affected_ops)
          VALUES (${tid}, ${lineId}, ${wsIds[code].id},
            ${`2026-01-${String(day).padStart(2, '0')} ${String(ri(8, 17)).padStart(2, '0')}:00:00+03`},
            ${ri(10, 90)}, ${pick(['Plansız', 'Plansız', 'Planlı', 'Organizasyonel', 'Tedarik'])},
            ${pick(['Makine arızası', 'İplik değişimi', 'Elektrik kesintisi', 'Malzeme bekleme', 'Bakım'])},
            ${ri(1, 8)})`; dtN++
      }
      for (let k = 0; k < ri(1, 3); k++) {
        const day = ri(1, 27)
        const total = ri(35, 120)
        await sql`INSERT INTO changeover_record
          (tenant_id, line_id, occurred_date, total_min, machine_adj_min, balancing_min, first_batch_min, warmup_min)
          VALUES (${tid}, ${lineId}, ${`2026-01-${String(day).padStart(2, '0')}`},
            ${total}, ${Math.round(total * .3)}, ${Math.round(total * .3)}, ${Math.round(total * .25)}, ${Math.round(total * .15)})`; coN++
      }
    }
  }
  console.log('duruş:', dtN, 'changeover:', coN)

  // 6) OPERATÖRLER + PERFORMANS (FA-01 & FA-03)
  let opN = 0, perfN = 0
  for (const code of ['FA-01', 'FA-03']) {
    const w = wsIds[code]
    const n = Math.min(ISIMLER.length, Math.round(w.sewing * 0.12))
    for (let i = 0; i < n; i++) {
      const lineId = pick(linesByWs[code])
      const [op] = await sql`INSERT INTO operator
        (tenant_id, workshop_id, line_id, sicil_no, ad_soyad, operasyon, makine_tipi, giris_tarihi, skill_level, aktif)
        VALUES (${tid}, ${w.id}, ${lineId}, ${code + '-' + String(1000 + i)}, ${ISIMLER[i]},
          ${pick(OPERASYONLAR)}, ${pick(MAKINELER)}, ${`202${ri(2, 5)}-0${ri(1, 9)}-1${ri(0, 9)}`},
          ${pick(['JUNIOR', 'SENIOR', 'SENIOR', 'EXPERT'])}, true) RETURNING id`; opN++
      for (let d = 0; d < 5; d++) {
        const sam = +(rnd() * 3 + 4).toFixed(1)
        const uret = ri(280, 620)
        const calis = 540
        const perf = Math.min(135, Math.round(uret * sam / calis * 100))
        await sql`INSERT INTO operator_performance
          (tenant_id, operator_id, tarih, uretilen_adet, sam_dk, calisma_dk, off_standard_dk, hata_adet, performans_pct)
          VALUES (${tid}, ${op.id}, ${`2026-01-${String(20 + d).padStart(2, '0')}`}, ${uret}, ${sam}, ${calis},
            ${ri(0, 60)}, ${ri(0, 6)}, ${perf})`; perfN++
      }
    }
  }
  console.log('operatör:', opN, 'performans:', perfN)

  // 7) İŞ EMİRLERİ + AŞAMALAR + MALZEME + GÜNLÜK
  const durumlar = ['Planlandi', 'Devam', 'Devam', 'Devam', 'Bekleniyor', 'Tamamlandi', 'Sevk Edildi']
  const oncelikler = ['Düşük', 'Normal', 'Normal', 'Yüksek', 'Kritik']
  let woN = 0
  const focusWs = ['FA-01', 'FA-02', 'FA-03', 'FA-04']
  for (let i = 0; i < 14; i++) {
    const code = pick(focusWs); const w = wsIds[code]
    const model = pick(MODELS); const qty = ri(800, 6000)
    const durum = pick(durumlar)
    const ilerleme = (durum === 'Tamamlandi' || durum === 'Sevk Edildi') ? 100 : durum === 'Devam' ? ri(20, 85) : durum === 'Bekleniyor' ? ri(0, 15) : 0
    const start = `2026-01-${String(ri(2, 15)).padStart(2, '0')}`
    const teslim = `2026-0${ri(2, 3)}-${String(ri(1, 28)).padStart(2, '0')}`
    const [wo] = await sql`INSERT INTO work_order
      (tenant_id, is_emri_no, workshop_id, line_id, musteri, siparis_no, model_adi, stil_kodu, siparis_miktari,
       baslangic_tarihi, teslim_tarihi, mtm_toplam_sn, sam_toplam_sn, darbogaz_op, darbogaz_sure_sn,
       anlasmali_fiyat, durum, tamamlanan_adet, oncelik, risk_seviyesi, ilerleme_pct, materyal_durumu_pct,
       musteri_kodu, sezon)
      VALUES (${tid}, ${'IE-2026-' + String(1000 + i)}, ${w.id}, ${pick(linesByWs[code])}, ${pick(MUSTERILER)},
        ${'SIP-' + ri(10000, 99999)}, ${model}, ${'ST-' + ri(100, 999)}, ${qty}, ${start}, ${teslim},
        ${ri(400, 900)}, ${ri(350, 800)}, ${pick(OPERASYONLAR)}, ${ri(30, 60)}, ${+(rnd() * 30 + 25).toFixed(2)},
        ${durum}, ${Math.round(qty * ilerleme / 100)}, ${pick(oncelikler)}, ${pick(['Düşük', 'Orta', 'Yüksek'])},
        ${ilerleme}, ${ri(40, 100)}, ${'M' + ri(100, 999)}, ${pick(['2026 İlkbahar', '2026 Yaz', '2025 Kış'])})
      RETURNING id`
    try { await sql`SELECT wo_init_stages(${wo.id})` } catch (e) { /* fonksiyon yoksa geç */ }
    // malzeme
    for (const m of [['KUMAŞ', 'Ana Kumaş', 'Geldi'], ['AKSESUAR', 'Düğme', 'Bekleniyor'], ['ETİKET', 'Marka Etiketi', 'Geldi'], ['İPLİK', 'Dikiş İpliği', pick(['Geldi', 'Yolda'])]]) {
      await sql`INSERT INTO work_order_material (tenant_id, work_order_id, tip, ad, miktar, birim, durum, tedarikci)
        VALUES (${tid}, ${wo.id}, ${m[0]}, ${m[1]}, ${ri(50, 5000)}, ${pick(['mt', 'adet', 'kg', 'koli'])}, ${m[2]}, ${pick(['Söktaş', 'Yünsa', 'Aker', 'Bossa'])})`
    }
    // günlük not
    await sql`INSERT INTO work_order_journal (tenant_id, work_order_id, tarih, vardiya, tip, baslik, aciklama, yazan)
      VALUES (${tid}, ${wo.id}, ${start}, 'Gündüz', ${pick(['NOT', 'PROBLEM', 'UYARI', 'BAŞARI'])},
        ${pick(['Üretim başladı', 'Kumaş gecikmesi', 'Bant dengesi', 'Kalite uyarısı'])},
        ${pick(['Bant düzgün akıyor, hedef tutuyor.', 'Aksesuar tedarikinde 2 gün gecikme bekleniyor.', 'Darboğaz operasyonuna 1 operatör takviye yapıldı.', 'İlk parti kalite kontrolden geçti.'])},
        ${pick(ISIMLER)})`
    // durum geçmişi
    await sql`INSERT INTO work_order_status_history (tenant_id, work_order_id, eski_durum, yeni_durum, sebep, yapan)
      VALUES (${tid}, ${wo.id}, 'Planlandi', ${durum}, 'Planlı geçiş', ${pick(ISIMLER)})`
    woN++
  }
  console.log('iş emri:', woN)

  // 8) WIP + ÖLÇÜM + YIKAMA + UKP
  for (const code of ['FA-01', 'FA-03', 'FA-05']) {
    const w = wsIds[code]
    for (let k = 0; k < 4; k++) {
      await sql`INSERT INTO wip_record (tenant_id, workshop_id, line_id, model_code, operation_name, recorded_date, wip_qty)
        VALUES (${tid}, ${w.id}, ${pick(linesByWs[code])}, ${pick(MODELS)}, ${pick(OPERASYONLAR)}, '2026-01-25', ${ri(50, 900)})`
      await sql`INSERT INTO operation_measurement (tenant_id, workshop_id, line_id, model_code, operation_name, cycle_time_sn, operator_count, measured_date, observer_name)
        VALUES (${tid}, ${w.id}, ${pick(linesByWs[code])}, ${pick(MODELS)}, ${pick(OPERASYONLAR)}, ${+(rnd() * 40 + 15).toFixed(1)}, ${ri(1, 3)}, '2026-01-22', ${pick(ISIMLER)})`
    }
    await sql`INSERT INTO ukp_record (tenant_id, workshop_id, tarih, utu_adet, kontrol_adet, paket_adet, hatali_adet, personel_sayisi)
      VALUES (${tid}, ${w.id}, '2026-01-24', ${ri(800, 2500)}, ${ri(800, 2500)}, ${ri(700, 2400)}, ${ri(5, 60)}, ${ri(6, 18)})`
  }
  // yıkama (denim atölyeler)
  for (const code of ['FA-03']) {
    for (let k = 0; k < 3; k++) {
      const giren = ri(500, 2000)
      await sql`INSERT INTO yikama_record (tenant_id, workshop_id, tarih, giren_adet, cikan_adet, hatali_adet, cevrim_sayisi, cevrim_sure_dk, enerji_kwh, su_litre)
        VALUES (${tid}, ${wsIds[code].id}, ${`2026-01-${String(15 + k * 3).padStart(2, '0')}`}, ${giren}, ${giren - ri(5, 40)}, ${ri(5, 40)}, ${ri(2, 5)}, ${ri(70, 100)}, ${ri(200, 600)}, ${ri(3000, 9000)})`
    }
  }
  console.log('wip/ölçüm/ukp/yıkama eklendi')

  // 9) KAIZEN
  const kaizenler = [
    ['Darboğaz operasyonu dengeleme', 'DARBOGAZ', 'cevrim_sn', 52, 38, 'UYGULA', 'Bant B1 kol takma darboğazı'],
    ['Model değişim süresini kısaltma (SMED)', 'CHANGEOVER', 'changeover_dk', 95, 45, 'UYGULA', 'Hazırlık dış zamana alındı'],
    ['Fire oranı azaltma', 'KALITE', 'red_pct', 4.2, 2.0, 'PLAN', 'İlk parti kontrol sıklığı artırıldı'],
    ['İşgücü devir hızını düşürme', 'GENEL', 'turnover_pct', 11, 6, 'PLAN', 'Oryantasyon + mentorluk programı'],
    ['Duruş sürelerini azaltma', 'GENEL', 'durus_dk', 320, 180, 'STANDART', 'Önleyici bakım planı uygulandı'],
  ]
  for (const [i, k] of kaizenler.entries()) {
    const code = ['FA-01', 'FA-06', 'FA-07', 'FA-08', 'FA-03'][i]
    await sql`INSERT INTO kaizen_action
      (tenant_id, workshop_id, baslik, kategori, hedef_metrik, mevcut_deger, hedef_deger, durum, sorumlu,
       baslangic_tarihi, bitis_tarihi, sonuc_deger, notlar)
      VALUES (${tid}, ${wsIds[code].id}, ${k[0]}, ${k[1]}, ${k[2]}, ${k[3]}, ${k[4]}, ${k[5]}, ${pick(ISIMLER)},
        '2026-01-05', '2026-02-15', ${k[5] === 'STANDART' ? k[4] : null}, ${k[6]})`
  }
  console.log('kaizen:', kaizenler.length)

  // 10) MODEL KÜTÜPHANESİ (SAM)
  let mlN = 0
  const mlModels = [
    ['TS-BASIC', 'Basic Tişört', 8.5], ['TS-POLO', 'Polo Yaka T-Shirt', 11.2], ['GM-ERK', 'Erkek Gömlek', 18.6],
    ['BL-KDN', 'Kadın Bluz', 15.4], ['JN-5CEP', '5 Cep Jean', 24.8], ['ES-ALT', 'Eşofman Altı', 12.0],
    ['SW-BASIC', 'Sweatshirt', 16.5], ['HR-KAP', 'Kapüşonlu Hırka', 21.3], ['SR-BASIC', 'Şort', 9.4], ['EL-ORME', 'Örme Elbise', 19.7],
  ]
  for (const [i, m] of mlModels.entries()) {
    const c = cats[i % cats.length]
    const tpl = templates.find(t => t.category_id === c.id) || templates[0]
    const proc = processes[i % processes.length]
    await sql`INSERT INTO model_library
      (tenant_id, code, name, category_id, template_code, process_id, sam_minutes, source, valid_from, bottleneck_sec)
      VALUES (${tid}, ${m[0]}, ${m[1]}, ${c.id}, ${tpl.code}, ${proc.id}, ${m[2]}, ${pick(['Pratik', 'MTM'])}, '2025-10-01', ${ri(30, 65)})
      ON CONFLICT DO NOTHING`; mlN++
  }
  console.log('model kütüphanesi:', mlN)

  // 11) BANT YETENEKLERİ (line_capability)
  const dims = await sql`SELECT d.code AS dim, v.code AS val FROM capability_dimension d JOIN capability_value v ON v.dimension_id = d.id`
  let lcN = 0
  for (const code of ['FA-01', 'FA-02', 'FA-03', 'FA-04', 'FA-05']) {
    for (const lineId of linesByWs[code]) {
      const chosen = new Set()
      for (let k = 0; k < 6; k++) {
        const d = pick(dims)
        const key = d.dim
        if (chosen.has(key)) continue; chosen.add(key)
        await sql`INSERT INTO line_capability (tenant_id, line_id, dimension_code, value_code, attribute_type)
          VALUES (${tid}, ${lineId}, ${d.dim}, ${d.val}, 'PROFILE') ON CONFLICT DO NOTHING`; lcN++
      }
    }
  }
  console.log('bant yetenekleri:', lcN)

  // özet
  const summary = await sql`SELECT
    (SELECT count(*) FROM workshop) ws, (SELECT count(*) FROM production_line) pl,
    (SELECT count(*) FROM monthly_production) mp, (SELECT count(*) FROM supplier_score) ss,
    (SELECT count(*) FROM work_order) wo, (SELECT count(*) FROM operator) op,
    (SELECT count(*) FROM kaizen_action) kz`
  console.log('\n== ÖZET ==', JSON.stringify(summary[0]))
}

main().then(() => sql.end({ timeout: 5 })).catch(async e => { console.error('HATA:', e.message); await sql.end({ timeout: 3 }); process.exit(1) })
