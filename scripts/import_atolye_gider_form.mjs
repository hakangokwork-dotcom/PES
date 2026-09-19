#!/usr/bin/env node
/**
 * "Atölye Gider Bilgileri-FORM 1.xlsx" (Microsoft Forms export) → PES
 *
 * NEDEN VAR: Bu, Taha Giyim tedarikçilerine gönderilen anketin ham
 * Microsoft Forms çıktısı. Başlıkları soru cümlesi ("AYLIK ELEKTRİK
 * GİDERİ NE KADARDIR?") olduğu için genel importer (/api/pes/expenses/
 * import) SYNONYMS tablosunda birebir eşleşme bulamıyor. Bu tabloyu
 * kirletmemek için, form biçimine özel bu bir kerelik betiği yazdık.
 *
 * BETİK NE YAPAR:
 *   1. Sheet1'deki 10 satırı okur (her satır bir atölye cevabı).
 *      Sayfa1'in son sütununda ek bir atölye varsa (BOZ MODA gibi
 *      Forms cevabı olmayıp elle eklenen), onu da yakalar.
 *   2. Atölye adını fuzzy eşleştirir (ilk-jeton önek eşlemesi ≥4 harf).
 *      Yanlış eşleşmeyi engellemek için 'contains' fallback KULLANMAZ.
 *   3. 44 form sütununu 27 monthly_expense kolonuna çevirir. Birleşik
 *      alanlar için toplayıcı: UKP sarf + genel üretim sarf → consumables.
 *      İğne+iplik birleşik geldiği için tamamı thread'e yazılır, needle NULL.
 *   4. work_days'i haftalık*4'ten üretir (15–28 arasında değilse 22).
 *   5. Atölye künyesindeki boş alanları (staff sayıları, bölge) formdan
 *      doldurur — mevcut değer varsa DOKUNMAZ.
 *   6. expense_declaration_staging + monthly_expense + declaration_quality
 *      yazar. Aynı dönem daha önce beyan edilmişse 022c revizyon zinciri.
 *
 *   node scripts/import_atolye_gider_form.mjs           # kuru çalışma
 *   node scripts/import_atolye_gider_form.mjs --uygula  # DB'ye yazar
 *   node scripts/import_atolye_gider_form.mjs --donem=2026-08 --dosya=...
 */
import xlsx from 'xlsx'
import postgres from 'postgres'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const arg = (n, d) => {
  const h = process.argv.find(a => a.startsWith(`--${n}=`))
  return h ? h.slice(n.length + 3) : d
}
const UYGULA = process.argv.includes('--uygula')
const DOSYA = arg('dosya', 'C:/Users/bhaka/Desktop/WORK/Facilty_Expence/Atölye Gider Bilgileri-FORM 1 (1).xlsx')
const DONEM = arg('donem', '2026-08')
const [YIL_STR, AY_STR] = DONEM.split('-')
const YIL = Number(YIL_STR), AY = Number(AY_STR)
if (!YIL || !AY || AY < 1 || AY > 12) {
  console.error(`donem geçersiz: ${DONEM} (YYYY-MM bekleniyor)`)
  process.exit(1)
}

/* ---- env ---- */
const envRaw = fs.readFileSync(join(__dir, '../.env.local'), 'utf8').split(/\r?\n/)
for (const l of envRaw) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL yok'); process.exit(1) }

/* ---- Excel ---- */
const buf = fs.readFileSync(DOSYA)
const wb = xlsx.read(buf, { type: 'buffer', cellDates: true })
const sh1 = wb.Sheets['Sheet1']
if (!sh1) { console.error('Sheet1 yok'); process.exit(1) }
const rows = xlsx.utils.sheet_to_json(sh1, { defval: null })
console.log(`${basename(DOSYA)} / Sheet1: ${rows.length} form cevabı`)

/* ---- Sütun sözlüğü — form başlığı → monthly_expense kolonu ---- */
/* Birden fazla form sütunu tek kolona toplanabilir (sum). null = atla. */
const KOLON_ESLEME = {
  personnel: ['PERSONELE ÖDENEN AYLIK TOPLAM MAAŞ MİKTARI NEDİR? '],
  sgk: ['AYLIK TOPLAM SGK TUTARI NEDİR?'],
  overtime: ['AYLIK FAZLA MESAİ GİDERİ NEDİR?'],
  bonus: ['AYLIK TOLAM PRİM VE İKRAMİYE MİKTARI NEDİR?'],
  severance_reserve: ['AYLIK KIDEM TAZMİNATI KARŞILIK TUTARI NEDİR?\n', 'AYLIK KIDEM TAZMİNATI KARŞILIK TUTARI NEDİR?'],
  food: ['AYLIK YEMEK MASRAFI NE KADARDIR?'],
  transport: ['AYLIK ÇALIŞAN SERVİS GİDERLERİ NE KADARDIR? '],
  cargo: ['AYLIK NAKLİYE GİDERLERİ NE KADARDIR?'],
  rent: ['KİRA İSE AYLIK KİRA GİDERİ NE KADARDIR?'],
  building_depr: ['AYLIK BİNA AMORTİSMAN PAYI NE KADARDIR?'],
  electricity: ['AYLIK ELEKTRİK GİDERİ NE KADARDIR?'],
  water: ['AYLIK SU GİDERİ NE KADARDIR?'],
  gas: ['AYLIK ISITMA GİDERLERİ NE KADARDIR?'],
  thread: ['AYLIK İĞNE VE İPLİK GİDERLERİ  NE KADARDIR?'],
  needle: [],
  consumables: [
    'AYLIK UKP SARF MALZEME GİDERLERİ NE KADARDIR?',
    'AYLIK GENEL ÜRETİM SARF MALZEME GİDERLERİ NE KADARDIR?',
    'AYLIK KIRTASİYE ve SARF MALZEME GİDERLERİ NE KADARDIR?',
  ],
  machine_maint: ['AYLIK SERVİS BAKIM  VE YEDEK PARÇA GİDERLERİ NE KADARDIR?'],
  machine_depr: [
    'AYLIK MAKİNE AMORTİSMAN PAYLARINIZ NE KADARDIR?',
    'AYLIK TAŞIT, DEMİRBAŞ, ÖZEL MALİYET AMORTİSMAN PAYLARI NE KADARDIR?',
  ],
  vehicle: ['ARAÇ TOPLAM YAKIT VE BAKIM GİDERLERİ NE KADARDIR?'],
  isg: ['AYLIK İSG GİDERLERİ NE KADARDIR?'],
  consulting: ['AYLIK ÖDEDİĞİ DANIŞMANLIK ÜCRETLERİ NE KADARDIR?'],
  official_fees: ['AYLIK EK RESMİ GİDERLERİ NE KADARDIR?'],
  insurance: ['AYLIK SİGORTA GİDERLERİ NE KADARDIR?'],
  communication: ['DİĞER GİDERLER (Telefon, internet )'],
  stationery: [],
  incentive_amount: ['TOPLAM ALINAN TEŞVİK TUTARI NEDİR?'],
  other: [],
}

const META_ESLEME = {
  isletme_unvani: 'İşletme Unvanı ',
  klasman: 'HANGİ TAHA GİYİM TEDARİK YÖNETİMİ İLE ÇALIŞMAKTASINIZ?',
  urun_tipi: 'EN İYİ HANGİ KLASMANDA ÜRÜN DİKEBİLİYORSUNUZ?',
  alan_m2: 'ÜRETİM YAPILAN ALAN KAÇ M2 DİR ?',
  kesim_kisi: 'KESİM OPERASYONLARINDA ÇALIŞAN TOPLAM KİŞİ SAYISI(SERİM ELEMANI, METO ELEMANI, KESİM ŞEFİ, KESİM OPERATÖRÜ, VB.)',
  dikim_kisi: 'DİKİM OPERASYONLARINDA ÇALIŞAN SAYISI( PEDAL BASAN, TASNİF, ORTACI, BANT ŞEFİ, VB.)',
  ukp_kisi: 'ÜTÜ PAKET OPERASYONLARINDA ÇALIŞAN SAYISI( ÜTÜCÜ, TEMİZLEMECİ, KALİTE KONTROL ELEMANI, ASORTİLEME ELEMANI, PAKETLEME ELEMANI VB.)',
  ofis_kisi: 'OFİS ÇALIŞANLARI(MUHASEBE, İNSAN KAYNAKLARI, İDARİ İŞLER, YEMEKHANE ÇALIŞANLARI, ŞOFÖRLER VB.)',
  gunluk_saat: 'GÜNLÜK ÇALIŞMA SAATİ ',
  haftalik_gun: 'HAFTALIK ÇALIŞILAN GÜN SAYISI NEDİR?',
  aylik_gun: 'AYLIK ÇALIŞILAN GÜN SAYISI NEDİR?',
  bolge_metin: 'HANGİ TEŞVİK BÖLGESİNDE YER ALMAKTADIR?',
}

/* Microsoft Forms başlıklarında düzenli boşluk yerine U+00A0 (non-breaking
   space) ve CRLF geçiyor — hem sözlükteki hem satırdaki anahtarlar aynı
   şekilde sadeleştirilmezse eşleşme kaçıyor (sessizce NULL yazılıyor). */
function anahtarSadelesir(k) {
  return String(k ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}
function sadeSatir(r) {
  const out = {}
  for (const k of Object.keys(r)) out[anahtarSadelesir(k)] = r[k]
  return out
}
for (let i = 0; i < rows.length; i++) rows[i] = sadeSatir(rows[i])
for (const col of Object.keys(KOLON_ESLEME)) {
  KOLON_ESLEME[col] = KOLON_ESLEME[col].map(anahtarSadelesir)
}
for (const k of Object.keys(META_ESLEME)) {
  META_ESLEME[k] = anahtarSadelesir(META_ESLEME[k])
}

/* Sayfa1'in son sütununda Sheet1'de bulunmayan bir atölye varsa (BOZ MODA
   gibi manuel eklenen), onu da Sheet1 satır biçimine çevirip ekle.
   Bu adım normalizasyondan SONRA olmalı — Sheet1 adları NBSP taşıyordu. */
const sh2 = wb.Sheets['Sayfa1']
const manuelSatir = sh2 ? sayfa1DanEkAtolye(sh2, rows) : null
if (manuelSatir) {
  console.log(`Sayfa1'den elle eklenmiş ek atölye: ${manuelSatir[META_ESLEME.isletme_unvani]}`)
  rows.push(manuelSatir)
}

/* Görülen başlıkları doğrula — form başlığı değişmişse burada patlarız
   (sessiz atlamak yerine). */
const gorulen = new Set(Object.keys(rows[0] ?? {}))
const eksik = []
for (const [col, hs] of Object.entries(KOLON_ESLEME)) {
  for (const h of hs) if (!gorulen.has(h)) eksik.push(`gider.${col}: "${h}"`)
}
for (const [k, h] of Object.entries(META_ESLEME)) {
  if (!gorulen.has(h)) eksik.push(`meta.${k}: "${h}"`)
}
if (eksik.length > 0) {
  console.warn('UYARI: form başlıkları değişmiş olabilir, bulunamayan:')
  for (const e of eksik) console.warn(' ', e)
}

/* ---- parseAmount: importer'daki mantığın aynısı ---- */
function parseAmount(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[^\d,.-]/g, '').trim()
  if (!s) return null
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.')
  let n
  if (lc > ld) n = s.replace(/\./g, '').replace(',', '.')
  else if (ld > lc) n = s.replace(/,/g, '')
  else n = s
  const x = Number(n); return Number.isFinite(x) ? x : null
}

/* BIGINT kolonlar — kuruş yazılmaz, yuvarlanır. */
const INT_KOLONLAR = new Set([
  'personnel', 'sgk', 'food', 'electricity', 'water', 'gas',
  'transport', 'vehicle', 'cargo', 'machine_maint', 'thread', 'other',
])
function kolonUyarla(k, v) {
  if (v === null || v === undefined) return null
  return INT_KOLONLAR.has(k) ? Math.round(v) : Number(v)
}

/* ---- Fuzzy adı normalize ---- */
function norm(s) {
  return (s ?? '').toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\b(ltd|sti|san|tic|a\.?s|as|ltd\.|sti\.|san\.|tic\.|sirketi|limited|sirket|ith|ihr|ins|otom|dis|nak|lojistik)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}
function ilkJeton(s) { return norm(s).split(' ').filter(Boolean)[0] ?? '' }

/* Skor sıralaması (yüksek = güvenli):
    tam eşleşme       → 1000
    biri tamamen diğerinin öneki (≥3 harf) → 100 + ortakLen
    kısmi ortak önek (≥4 harf) → ortakLen
   Böylece "srt" ⊂ "srtteks" (form "SRT TEKSTİL" ↔ DB "SRTTEKS") tutar,
   ama "sr" ⊂ "sra" gibi rasgele iki harf tutmaz. */
function onekEsleme(formIlk, dbIlk) {
  if (!formIlk || !dbIlk) return 0
  if (formIlk === dbIlk) return 1000
  if (formIlk.length < 3 || dbIlk.length < 3) return 0
  const min = Math.min(formIlk.length, dbIlk.length)
  let i = 0
  while (i < min && formIlk[i] === dbIlk[i]) i++
  if (i === min) return 100 + i           // biri diğerinin tam öneki
  return i >= 4 ? i : 0
}

/* ---- DB ---- */
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })
const [tenant] = await sql`SELECT id FROM tenant WHERE slug = 'default'`
if (!tenant) { console.error('default tenant yok'); await sql.end(); process.exit(1) }
console.log(`tenant: ${tenant.id}`)

const atolyeler = await sql`
  SELECT id, code, name, city, type, bolge, total_staff, sewing_staff,
         cutting_staff, ukp_staff, management
  FROM workshop WHERE tenant_id = ${tenant.id}
`
const dbHaz = atolyeler.map(a => ({ ...a, ilk: ilkJeton(a.name) }))
console.log(`DB (default tenant): ${dbHaz.length} atölye`)

/* ---- Her form satırını işle ---- */
const rapor = []
for (const [i, r] of rows.entries()) {
  const raw = normalizeAyniAnahtarlar(r) // "İşletme Unvanı " vs "İşletme Unvanı"
  const ad = String(raw[META_ESLEME.isletme_unvani] ?? '').trim()
  const satir = { rowIndex: i + 2, ad, matched: false, notlar: [] }
  if (!ad) { satir.notlar.push('isletme unvanı boş'); rapor.push(satir); continue }

  /* Fuzzy eşleştirme */
  const formIlk = ilkJeton(ad)
  let en = null, enSkor = 0
  for (const w of dbHaz) {
    const p = onekEsleme(formIlk, w.ilk)
    if (p > enSkor) { enSkor = p; en = w }
  }
  if (!en) { satir.notlar.push(`atölye bulunamadı (form ilk jeton: "${formIlk}")`); rapor.push(satir); continue }
  satir.matched = true
  satir.atolye = { id: en.id, code: en.code, name: en.name }

  /* Gider değerleri — birleşik alanlarda topla */
  const gider = {}
  for (const [col, hs] of Object.entries(KOLON_ESLEME)) {
    let t = null
    for (const h of hs) {
      const v = parseAmount(raw[h])
      if (v !== null) t = (t ?? 0) + v
    }
    gider[col] = kolonUyarla(col, t)
  }
  satir.gider = gider

  /* Meta */
  const meta = {
    alan_m2: parseAmount(raw[META_ESLEME.alan_m2]),
    kesim: parseAmount(raw[META_ESLEME.kesim_kisi]),
    dikim: parseAmount(raw[META_ESLEME.dikim_kisi]),
    ukp: parseAmount(raw[META_ESLEME.ukp_kisi]),
    ofis: parseAmount(raw[META_ESLEME.ofis_kisi]),
    gunluk_saat: parseAmount(raw[META_ESLEME.gunluk_saat]),
    haftalik_gun: parseAmount(raw[META_ESLEME.haftalik_gun]),
    aylik_gun: parseAmount(raw[META_ESLEME.aylik_gun]),
    bolge_metin: String(raw[META_ESLEME.bolge_metin] ?? '').trim(),
  }
  satir.meta = meta

  /* work_days üret: aylık > haftalık*4 > 22. 15-28 dışına çıkmasın. */
  let wd
  if (meta.aylik_gun && meta.aylik_gun >= 15 && meta.aylik_gun <= 28) wd = Math.round(meta.aylik_gun)
  else if (meta.haftalik_gun && meta.haftalik_gun >= 4 && meta.haftalik_gun <= 7) wd = Math.round(meta.haftalik_gun * 4)
  else { wd = 22; satir.notlar.push(`work_days=22 varsayıldı (haftalik=${meta.haftalik_gun}, aylik=${meta.aylik_gun})`) }
  satir.work_days = Math.max(15, Math.min(28, wd))

  /* Bölge — "6.Bölge" → 6 */
  const bm = meta.bolge_metin.match(/(\d)/)
  satir.bolge = bm ? Number(bm[1]) : null

  /* Kaba tutarsızlık uyarısı — kıdem karşılık > maaş*5 muhtemelen typo */
  if (gider.severance_reserve && gider.personnel && gider.severance_reserve > gider.personnel * 5) {
    satir.notlar.push(`kıdem karşılık şüpheli: ${gider.severance_reserve.toLocaleString('tr')} vs maaş ${gider.personnel.toLocaleString('tr')}`)
  }

  rapor.push(satir)
}

/* ---- Raporu bas ---- */
console.log(`\n=== Rapor (${rapor.length} satır) ===`)
for (const r of rapor) {
  const bilgi = r.matched ? `${r.atolye.code} ${r.atolye.name}` : '(eşleşme yok)'
  const brut = r.gider ? Object.values(r.gider).filter(v => v).reduce((a, b) => a + Number(b), 0) : 0
  console.log(` ${r.rowIndex}  ${(r.matched ? 'OK ' : '-- ')}${r.ad.slice(0, 45).padEnd(45)} → ${bilgi}  brut=${brut.toLocaleString('tr')}`)
  for (const n of r.notlar) console.log(`      · ${n}`)
}
const eslesen = rapor.filter(r => r.matched).length
console.log(`\nÖzet: ${eslesen}/${rapor.length} eşleşti  (${UYGULA ? 'YAZILACAK' : 'KURU'})`)

if (!UYGULA) {
  await sql.end()
  console.log('Not: DB\'ye yazmak için --uygula ekleyin.')
  process.exit(0)
}

/* ---- Yazma ---- */
let yazi = 0, atl = 0, rev = 0
for (const r of rapor) {
  if (!r.matched) { atl++; continue }
  const donem = DONEM

  /* 1) Atölye künyesi — YALNIZ boş alanları doldur (dokunmama ilkesi). */
  const guncelle = {}
  if (r.bolge && (r.atolye_full?.bolge ?? null) === null) {}
  /* Atölye full bilgisini yeniden çek — .bolge güncel olmalı */
  const [aFull] = await sql`
    SELECT bolge, total_staff, sewing_staff, cutting_staff, ukp_staff, management
    FROM workshop WHERE id = ${r.atolye.id}
  `
  if (r.bolge && !aFull.bolge) guncelle.bolge = r.bolge
  if (r.meta.dikim && !aFull.sewing_staff) guncelle.sewing_staff = Math.round(r.meta.dikim)
  if (r.meta.kesim && !aFull.cutting_staff) guncelle.cutting_staff = Math.round(r.meta.kesim)
  if (r.meta.ukp && !aFull.ukp_staff) guncelle.ukp_staff = Math.round(r.meta.ukp)
  if (r.meta.ofis && !aFull.management) guncelle.management = Math.round(r.meta.ofis)
  const toplamKisi = ['kesim', 'dikim', 'ukp', 'ofis'].reduce((s, k) => s + (Math.round(r.meta[k] ?? 0)), 0)
  if (toplamKisi > 0 && !aFull.total_staff) guncelle.total_staff = toplamKisi
  if (Object.keys(guncelle).length > 0) {
    await sql`UPDATE workshop SET ${sql(guncelle)}, updated_at = NOW() WHERE id = ${r.atolye.id}`
    r.notlar.push(`workshop güncellendi: ${Object.keys(guncelle).join(', ')}`)
  }

  /* 2) Staging — revizyon zinciri (022c) */
  const [oncekiVar] = await sql`
    SELECT id, revision_no FROM expense_declaration_staging
    WHERE workshop_id = ${r.atolye.id} AND donem = ${donem}
      AND superseded_at IS NULL AND match_status = 'matched'
    ORDER BY revision_no DESC NULLS LAST LIMIT 1
  `
  const yeniRev = (oncekiVar?.revision_no ?? 0) + 1
  if (oncekiVar) {
    await sql`UPDATE expense_declaration_staging SET superseded_at = NOW() WHERE id = ${oncekiVar.id}`
  }
  const [staged] = await sql`
    INSERT INTO expense_declaration_staging
      (tenant_id, source, source_ref, donem, raw, workshop_id, match_status,
       promoted_at, revision_no, revision_note)
    VALUES (
      ${tenant.id}, 'forms_xlsx', ${basename(DOSYA)}, ${donem},
      ${sql.json({ sheet1: rows[r.rowIndex - 2] ?? null })}, ${r.atolye.id}, 'matched',
      NOW(), ${yeniRev}, ${'Taha Giyim tedarikçi anketi (Forms) ' + DONEM}
    )
    RETURNING id
  `
  if (oncekiVar) {
    await sql`UPDATE expense_declaration_staging SET superseded_by = ${staged.id} WHERE id = ${oncekiVar.id}`
    rev++
  }

  /* 3) monthly_expense upsert */
  const giderKolonlari = Object.fromEntries(
    Object.entries(r.gider).filter(([, v]) => v !== null)
  )
  const [exp] = await sql`
    INSERT INTO monthly_expense ${sql({
      workshop_id: r.atolye.id, tenant_id: tenant.id,
      year: YIL, month: AY, work_days: r.work_days,
      current_staging_id: staged.id, revision_no: yeniRev, revised_at: new Date(),
      ...giderKolonlari,
    })}
    ON CONFLICT (workshop_id, year, month) DO UPDATE SET ${sql({
      work_days: r.work_days,
      current_staging_id: staged.id, revision_no: yeniRev, revised_at: new Date(),
      ...giderKolonlari,
    })}
    RETURNING id
  `

  /* 4) Basit güven skoru — tam scoring lib'i buradan çağırmak yerine
        completeness + tutarsızlık bayrakları. Daha zengin skor için
        UI'daki importer akışı kullanılabilir. */
  const doldurulan = Object.values(r.gider).filter(v => v !== null && v > 0).length
  const completeness = Math.round((doldurulan / 27) * 1000) / 10
  const flags = r.notlar.filter(n => n.includes('şüpheli') || n.includes('varsayıldı')).map(msg => ({
    severity: msg.includes('şüpheli') ? 'warn' : 'info', message: msg,
  }))
  await sql`
    INSERT INTO declaration_quality (
      tenant_id, staging_id, expense_id, workshop_id, donem,
      completeness_sc, consistency_sc, plausibility_sc, crosscheck_sc, total_sc,
      flags, status, rule_version
    ) VALUES (
      ${tenant.id}, ${staged.id}, ${exp.id}, ${r.atolye.id}, ${donem},
      ${completeness}, 100, 100, 100, ${completeness},
      ${sql.json(flags)}, ${completeness >= 70 ? 'accepted' : 'pending_fix'}, 'import-form-1'
    )
    ON CONFLICT (expense_id) DO UPDATE SET
      staging_id = EXCLUDED.staging_id,
      completeness_sc = EXCLUDED.completeness_sc,
      total_sc = EXCLUDED.total_sc,
      flags = EXCLUDED.flags, status = EXCLUDED.status,
      computed_at = NOW()
  `
  yazi++
}

console.log(`\nYazıldı: ${yazi}  revize: ${rev}  atlandı: ${atl}`)
await sql.end()

/* ---- yardımcı: bazı başlıklar sondaki boşlukla farklı geliyor ---- */
function normalizeAyniAnahtarlar(row) {
  const out = {}
  for (const k of Object.keys(row)) out[k.trim()] = row[k], out[k] = row[k]
  return out
}

/* Sayfa1'in son sütununda Sheet1'de olmayan bir atölye varsa,
   Sayfa1'deki değerleri Sheet1 formatına çevirip döner. */
function sayfa1DanEkAtolye(sayfa, sheet1Rows) {
  const aoa = xlsx.utils.sheet_to_json(sayfa, { header: 1, defval: null })
  if (aoa.length === 0) return null
  const isim0 = aoa[0] ?? []
  const adlar = isim0.slice(1).map(v => (v ? anahtarSadelesir(v) : ''))
  const nameKey = META_ESLEME.isletme_unvani /* zaten sadesleşti */
  const sheet1Adlar = new Set(
    sheet1Rows
      .map(r => anahtarSadelesir(r[nameKey]))
      .filter(Boolean),
  )
  const ekIdx = adlar.findIndex(a => a && !sheet1Adlar.has(a))
  if (ekIdx < 0) return null
  const col = ekIdx + 1
  const adEk = adlar[ekIdx]
  /* Sayfa1'de her satır bir soru; soru metni kolon 0 */
  const yeni = { [nameKey]: adEk }
  for (const satir of aoa) {
    const q = satir?.[0]
    if (!q || typeof q !== 'string') continue
    yeni[anahtarSadelesir(q)] = satir[col] ?? null
  }
  return yeni
}
