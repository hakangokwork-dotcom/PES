/**
 * Atölye gider anketi (Atolye_Gider_Model.xlsx VERI_GIRIS) → PES.
 *
 * Akış: ham satır → economy_survey_staging → isim eşlemesi → aylara bölme
 *       → monthly_expense + workshop_economy
 *
 * Kullanım:
 *   node scripts/import_ekonomi_anket.mjs --baslangic 2026-04
 *   node scripts/import_ekonomi_anket.mjs --baslangic 2026-04 --uygula
 *   node scripts/import_ekonomi_anket.mjs --baslangic 2026-04 --dosya "C:\\yol\\anket.xlsx"
 *
 * --baslangic ZORUNLU: Excel kaç ay olduğunu söylüyor, hangi aydan
 *   başladığını söylemiyor. Tahmin edilmez.
 * --uygula olmadan hiçbir şey yazılmaz; rapor basılır.
 */
import postgres from 'postgres'
import XLSX from 'xlsx'
import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jetonlar, envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))

const arg = (ad, varsayilan = null) => {
  const i = process.argv.indexOf(`--${ad}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : varsayilan
}
const UYGULA = process.argv.includes('--uygula')
const BASLANGIC = arg('baslangic')
const DOSYA = arg('dosya',
  'C:\\Users\\bhaka\\Desktop\\WORK\\Facilty_Expence\\Atolye_Gider_Model.xlsx')
const ESLESME_DOSYA = arg('eslesme')

// Kullanıcı onaylı eşleşme (kisaAd → workshopId), --eslesme ile yüklenir
let eslesmeOverride = {}
if (ESLESME_DOSYA) {
  try {
    eslesmeOverride = JSON.parse(readFileSync(resolve(ESLESME_DOSYA), 'utf8'))
  } catch (e) {
    console.error(`HATA: eslesme dosyası okunamadı — ${ESLESME_DOSYA}: ${e.message}`)
    process.exit(1)
  }
}

if (!BASLANGIC || !/^\d{4}-(0[1-9]|1[0-2])$/.test(BASLANGIC)) {
  console.error('HATA: --baslangic YYYY-MM zorunlu.')
  console.error('  Excel anketin kaç ay olduğunu söylüyor ama hangi aydan')
  console.error('  başladığını söylemiyor. Bu yüzden tahmin edilmiyor.')
  process.exit(1)
}

// ---------- 1. Excel'i oku ----------
const wb = XLSX.readFile(DOSYA)
const ws = wb.Sheets['VERI_GIRIS']
if (!ws) { console.error(`HATA: VERI_GIRIS sayfası yok — ${DOSYA}`); process.exit(1) }

// Satır 1-2 açıklama, satır 3 başlık.
const hamSatirlar = XLSX.utils.sheet_to_json(ws, { range: 2, defval: null })
  .filter(r => r['Kısa ad'])

console.log(`Okundu: ${hamSatirlar.length} atölye satırı — ${DOSYA}`)

// ---------- 2. Çözümle ----------
// Not: anketSatiriCoz ve anketiAylaraBol TypeScript. Node'dan çağırmak için
// tsx gerekir; bunun yerine çözümlemeyi burada tekrar etmiyoruz — script
// derlenmiş JS'e değil, aynı sözlüğe dayansın diye lib'i tsx ile yüklüyoruz.
const { anketSatiriCoz, anketiAylaraBol, sgkSupheliMi } =
  await import('tsx/esm/api').then(async ({ register }) => {
    const un = register()
    const mod = await import('../lib/pes/ekonomi-anket.ts')
    un()
    return mod
  })

const cozumler = hamSatirlar.map((ham, i) => ({
  satirNo: i + 4,                       // Excel satır numarası (başlık 3)
  ham,
  cozum: anketSatiriCoz(ham),
}))

// ---------- 3. Atölyelerle eşle ----------
const sql = postgres(env.DATABASE_URL,
  { max: 1, prepare: false, connect_timeout: 15 })

const atolyeler = await sql`SELECT id, code, name, tenant_id FROM workshop`
const tenantId = atolyeler[0]?.tenant_id
if (!tenantId) { console.error('HATA: workshop tablosu boş, tenant belirlenemedi'); await sql.end(); process.exit(1) }

// Override dosyasındaki ID'lerin workshop tablosunda gerçekten bulunduğunu doğrula
for (const [kisaAd, id] of Object.entries(eslesmeOverride)) {
  const w = atolyeler.find(w => w.id === id)
  if (!w) {
    console.error(`HATA: eslesme dosyasindaki ID ${id} workshop tablosunda yok (kisaAd: "${kisaAd}")`)
    await sql.end()
    process.exit(1)
  }
}

function esle(kisaAd, unvan) {
  // Override kontrolü: kullanıcı onaylı eşleşme varsa doğrudan kullan
  if (Object.prototype.hasOwnProperty.call(eslesmeOverride, kisaAd)) {
    const id = eslesmeOverride[kisaAd]
    const w = atolyeler.find(w => w.id === id)
    return { durum: 'kesin', atolye: w, skor: 1 }
  }

  const aJ = new Set(jetonlar(kisaAd))
  const uJ = new Set(jetonlar(unvan ?? ''))
  let enIyi = null
  for (const w of atolyeler) {
    const dbJ = new Set(jetonlar(w.name))
    const ortakAd = [...aJ].filter(t => dbJ.has(t)).length
    const ortakUnvan = [...uJ].filter(t => dbJ.has(t)).length
    const skor = aJ.size ? ortakAd / aJ.size : 0
    const skorU = uJ.size ? ortakUnvan / uJ.size : 0
    const toplam = Math.max(skor, skorU)
    if (!enIyi || toplam > enIyi.skor) enIyi = { atolye: w, skor: toplam }
  }
  if (!enIyi || enIyi.skor === 0) return { durum: 'eslesmedi', atolye: null, skor: 0 }
  // Kesin sayılması için kısa adın TÜM ayırt edici jetonları eşleşmeli.
  return {
    durum: enIyi.skor === 1 ? 'kesin' : enIyi.skor >= 0.5 ? 'inceleme' : 'eslesmedi',
    atolye: enIyi.atolye,
    skor: enIyi.skor,
  }
}

const sonuc = cozumler.map(c => ({ ...c, eslesme: esle(c.cozum.kisaAd, c.cozum.unvan) }))
const kesinler = sonuc.filter(s => s.eslesme.durum === 'kesin')
const bekleyenler = sonuc.filter(s => s.eslesme.durum !== 'kesin')

console.log(`\nEşleştirme: kesin=${kesinler.length}  inceleme=${sonuc.filter(s => s.eslesme.durum === 'inceleme').length}  eşleşmedi=${sonuc.filter(s => s.eslesme.durum === 'eslesmedi').length}`)

// ---------- 4. Veri kalitesi uyarıları ----------
const uyarilar = []
for (const s of sonuc) {
  const g = s.cozum.gider
  if (sgkSupheliMi(g)) {
    uyarilar.push(`${s.cozum.kisaAd}: teşvik (${g.incentive_amount}) SGK'dan (${g.sgk}) büyük — SGK net bildirilmiş olabilir, net gider olduğundan DÜŞÜK çıkar`)
  }
  if (s.cozum.birlesikAlanlar.length) {
    uyarilar.push(`${s.cozum.kisaAd}: birleşik alan — ${s.cozum.birlesikAlanlar.join(', ')}`)
  }
  if (s.cozum.bolge === null) {
    uyarilar.push(`${s.cozum.kisaAd}: teşvik bölgesi okunamadı — 3D referans hesaplanamayacak`)
  }
}
if (uyarilar.length) {
  console.log('\nVERİ KALİTESİ UYARILARI')
  for (const u of uyarilar) console.log('  ! ' + u)
}

// ---------- 5. Bekleyenleri dosyaya yaz ----------
if (bekleyenler.length) {
  const yol = join(__dir, '../ekonomi_eslesmeyen.json')
  writeFileSync(yol, JSON.stringify(bekleyenler.map(b => ({
    satirNo: b.satirNo,
    kisaAd: b.cozum.kisaAd,
    unvan: b.cozum.unvan,
    onerilen: b.eslesme.atolye ? { id: b.eslesme.atolye.id, name: b.eslesme.atolye.name } : null,
    skor: Number(b.eslesme.skor.toFixed(2)),
  })), null, 2), 'utf8')
  console.log(`\n${bekleyenler.length} satır eşleşmedi ya da inceleme gerektiriyor → ${yol}`)
  console.log('Bunlar YAZILMADI. Eşleşmeleri onayla, sonra tekrar çalıştır.')
}

// ---------- 6. Yazma planı ----------
const plan = []
for (const s of kesinler) {
  const aylar = anketiAylaraBol(s.cozum, BASLANGIC)
  for (const ay of aylar) {
    plan.push({ workshopId: s.eslesme.atolye.id, ad: s.cozum.kisaAd, satirNo: s.satirNo,
                ham: s.ham, aySayisi: s.cozum.aySayisi, ...ay })
  }
}

console.log(`\nYazma planı: ${kesinler.length} atölye × ${plan.length / (kesinler.length || 1)} ay = ${plan.length} satır`)
console.log(`Dönem: ${BASLANGIC} → ${plan.length ? `${plan[plan.length - 1].year}-${String(plan[plan.length - 1].month).padStart(2, '0')}` : '-'}`)

if (!UYGULA) {
  console.log('\nKURU ÇALIŞMA — hiçbir şey yazılmadı. Yazmak için --uygula ekle.')
  await sql.end()
  process.exit(0)
}

// ---------- 7. Yaz ----------
let yazilanStaging = 0, yazilanGider = 0, yazilanEkonomi = 0, yazilanBolge = 0

await sql.begin(async (tx) => {
  for (const s of kesinler) {
    const [staging] = await tx`
      INSERT INTO economy_survey_staging
        (tenant_id, raw, workshop_name_raw, workshop_id, match_status,
         period_start, period_months, promoted_at)
      VALUES (${tenantId}, ${sql.json(s.ham)}, ${s.cozum.kisaAd},
              ${s.eslesme.atolye.id}, 'kesin', ${BASLANGIC},
              ${s.cozum.aySayisi}, now())
      RETURNING id`
    yazilanStaging++

    for (const ay of anketiAylaraBol(s.cozum, BASLANGIC)) {
      const g = ay.gider
      await tx`
        INSERT INTO monthly_expense (
          workshop_id, tenant_id, year, month, work_days,
          personnel, overtime, bonus, sgk, severance_reserve,
          food, transport, cargo, rent, building_depr,
          electricity, water, gas, thread, needle,
          ukp_consumables, consumables, machine_maint, machine_depr,
          vehicle_depr, vehicle, stationery, isg, consulting,
          official_fees, insurance, communication, other, incentive_amount)
        VALUES (
          ${s.eslesme.atolye.id}, ${tenantId}, ${ay.year}, ${ay.month},
          ${Math.round(ay.ekonomi.actual_days ?? 22)},
          ${Math.round(g.personnel ?? 0)}, ${g.overtime ?? null}, ${g.bonus ?? null},
          ${Math.round(g.sgk ?? 0)}, ${g.severance_reserve ?? null},
          ${Math.round(g.food ?? 0)}, ${Math.round(g.transport ?? 0)},
          ${Math.round(g.cargo ?? 0)}, ${g.rent ?? null}, ${g.building_depr ?? null},
          ${Math.round(g.electricity ?? 0)}, ${Math.round(g.water ?? 0)},
          ${Math.round(g.gas ?? 0)}, ${Math.round(g.thread ?? 0)}, ${g.needle ?? null},
          ${g.ukp_consumables ?? null}, ${g.consumables ?? null},
          ${Math.round(g.machine_maint ?? 0)}, ${g.machine_depr ?? null},
          ${g.vehicle_depr ?? null}, ${Math.round(g.vehicle ?? 0)},
          ${g.stationery ?? null}, ${g.isg ?? null}, ${g.consulting ?? null},
          ${g.official_fees ?? null}, ${g.insurance ?? null},
          ${g.communication ?? null}, ${Math.round(g.other ?? 0)},
          ${g.incentive_amount ?? null})
        ON CONFLICT (workshop_id, year, month) DO UPDATE SET
          personnel = EXCLUDED.personnel, overtime = EXCLUDED.overtime,
          bonus = EXCLUDED.bonus, sgk = EXCLUDED.sgk,
          severance_reserve = EXCLUDED.severance_reserve,
          food = EXCLUDED.food, transport = EXCLUDED.transport,
          cargo = EXCLUDED.cargo, rent = EXCLUDED.rent,
          building_depr = EXCLUDED.building_depr, electricity = EXCLUDED.electricity,
          water = EXCLUDED.water, gas = EXCLUDED.gas, thread = EXCLUDED.thread,
          needle = EXCLUDED.needle, ukp_consumables = EXCLUDED.ukp_consumables,
          consumables = EXCLUDED.consumables, machine_maint = EXCLUDED.machine_maint,
          machine_depr = EXCLUDED.machine_depr, vehicle_depr = EXCLUDED.vehicle_depr,
          vehicle = EXCLUDED.vehicle, stationery = EXCLUDED.stationery,
          isg = EXCLUDED.isg, consulting = EXCLUDED.consulting,
          official_fees = EXCLUDED.official_fees, insurance = EXCLUDED.insurance,
          communication = EXCLUDED.communication, other = EXCLUDED.other,
          incentive_amount = EXCLUDED.incentive_amount,
          updated_at = now()`
      yazilanGider++

      const e = ay.ekonomi
      await tx`
        INSERT INTO workshop_economy (
          workshop_id, tenant_id, year, month,
          revenue_declared, idle_days, qty_declared,
          nominal_days, actual_days, hours_per_day,
          cutting_staff, sewing_staff, ukp_staff, office_staff,
          area_m2, source, survey_id, note)
        VALUES (
          ${s.eslesme.atolye.id}, ${tenantId}, ${ay.year}, ${ay.month},
          ${e.revenue_declared}, ${e.idle_days},
          ${e.qty_declared === null ? null : Math.round(e.qty_declared)},
          ${e.nominal_days}, ${e.actual_days}, ${e.hours_per_day},
          ${e.cutting_staff === null ? null : Math.round(e.cutting_staff)},
          ${e.sewing_staff === null ? null : Math.round(e.sewing_staff)},
          ${e.ukp_staff === null ? null : Math.round(e.ukp_staff)},
          ${e.office_staff === null ? null : Math.round(e.office_staff)},
          ${e.area_m2 === null ? null : Math.round(e.area_m2)},
          ${e.source}, ${staging.id},
          ${`Atolye_Gider_Model.xlsx VERI_GIRIS satır ${s.satirNo}`})
        ON CONFLICT (workshop_id, year, month) DO UPDATE SET
          revenue_declared = EXCLUDED.revenue_declared,
          idle_days = EXCLUDED.idle_days, qty_declared = EXCLUDED.qty_declared,
          nominal_days = EXCLUDED.nominal_days, actual_days = EXCLUDED.actual_days,
          hours_per_day = EXCLUDED.hours_per_day,
          cutting_staff = EXCLUDED.cutting_staff, sewing_staff = EXCLUDED.sewing_staff,
          ukp_staff = EXCLUDED.ukp_staff, office_staff = EXCLUDED.office_staff,
          area_m2 = EXCLUDED.area_m2, source = EXCLUDED.source,
          survey_id = EXCLUDED.survey_id, note = EXCLUDED.note,
          updated_at = now()`
      yazilanEkonomi++
    }

    /* Teşvik bölgesini workshop'a yaz. workshop.bolge'nin varsayılanı 1 ve
       139 atölyenin 134'ü o varsayılanda duruyordu; anketteki bölge hiç
       taşınmıyordu. Sonuç: model fiyatlamanın 3D referansı 9 pilotta 6,00
       TL/dk ile hesaplanıyordu, olması gereken 4,76 — %26 yüksek, ve o
       sütun pazarlıkta kıyas noktası. */
    if (s.cozum.bolge !== null && s.cozum.bolge >= 1 && s.cozum.bolge <= 6) {
      const guncel = await tx`
        UPDATE workshop SET bolge = ${s.cozum.bolge}
        WHERE id = ${s.eslesme.atolye.id} AND bolge IS DISTINCT FROM ${s.cozum.bolge}
        RETURNING id`
      if (guncel.length) yazilanBolge++
    }
  }
})

console.log(`\nYAZILDI: staging=${yazilanStaging}  monthly_expense=${yazilanGider}  workshop_economy=${yazilanEkonomi}`)
if (bekleyenler.length) {
  console.log(`UYARI: ${bekleyenler.length} satır hâlâ eşleşmemiş durumda ve yazılmadı.`)
}
await sql.end()
