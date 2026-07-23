#!/usr/bin/env node
/**
 * MATRIS master verisini (bant düzeyi yetenek matrisi) PES'e aktarır.
 *
 * KAYNAK: bant_kapasite_formu_MATRIS_mevcut_durum (1).xlsx → "Bant Yetkinlik (Matris) (4)"
 *
 * VARSAYILAN KURU ÇALIŞMADIR — hiçbir şey yazmaz, ne olacağını raporlar.
 *   node scripts/import-matris.mjs           # kuru çalışma + rapor
 *   node scripts/import-matris.mjs --apply   # gerçekten yaz
 *   node scripts/import-matris.mjs --tenant=demo-atolye --file=/yol.xlsx
 *
 * SESSİZ VERİ UYDURMA YOK: katalogda karşılığı olmayan terim görülürse
 *   hiçbir şey yazmadan durur, eksik terimleri listeler.
 *
 * BANT UZLAŞTIRMA (dosya esas): eşleşen atölyenin bantları BANT_ADI ile
 *   uzlaştırılır. Eşleşen bant güncellenir (üretim/iş emri korunur), dosyada
 *   olmayan mevcut bant üzerinde veri varsa arşivlenir yoksa silinir, dosyadaki
 *   yeni bant açılır. Bant PROFILE yetenekleri her seferinde silinip yeniden
 *   yazılır; ASSIGNED'a dokunulmaz.
 *
 * EKSİK ATÖLYE: PES'te adı bulunmayan atölye yeni açılır (type='X').
 */
import postgres from 'postgres'
import XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : def
}
const APPLY = process.argv.includes('--apply')
const TENANT_SLUG = arg('tenant', 'default')
const FILE = arg('file', 'C:/Users/bhaka/Downloads/bant_kapasite_formu_MATRIS_mevcut_durum (1).xlsx')
const SHEET = 'Bant Yetkinlik (Matris) (4)'

const env = Object.fromEntries(
  readFileSync(join(__dir, '../.env.local'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

/* Normalizasyon — 023b/import-klasman ile AYNI kural */
const TR = { 'ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I','ö':'o','Ö':'O','ş':'s','Ş':'S','ü':'u','Ü':'U' }
const norm = (s) => String(s ?? '').split('').map((c) => TR[c] ?? c).join('')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
const txt = (v) => String(v ?? '').trim()
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null }
/* production_line.name VARCHAR(50) — view bağımlılığı yüzünden genişletilemiyor;
   uzun ticari unvan bant adı olarak gelince kırp. */
const kes50 = (s) => (s && s.length > 50 ? s.slice(0, 50) : s)

/* Grup başlığı → PES boyut kodu */
const GRUP_BOYUT = {
  'ANA GRUP': 'ana_grup', 'KUMAŞ GRUBU': 'kumas_grubu', 'CİNSİYET': 'cinsiyet_yas',
  'KALİTE': 'kalite', 'SEZON': 'sezon', 'KLASMAN': 'klasman',
  'MAKİNE PARKURU': 'makine_parkuru', 'KUMAŞ TÜRÜ': 'kumas_turu', 'KOL': 'kol_turu',
  'YAKA': 'yaka_turu', 'KALIP': 'kalip_turu', 'SİLUET': 'siluet', 'CEP': 'cep_turu',
}
/* Yazım farkı olan terimler — norm(label) → mevcut value_code */
const ALIAS = {
  kol_turu:  { 'TRUVAKAR_KOL': 'TRUVAKAR' },
  kalip_turu:{ 'WIDELEG': 'WIDELEG', 'STRAIGHT_DUZ': 'STRAIGHT' },
  makine_parkuru: { 'PUNTEREZ': 'PUNTERIZ' },
}
/* Atölye eşleştirme — elle onaylanmış (kullanıcı, 2026-07-23). Dosyadaki uzun
   ticari unvan, PES'teki kısa adla tam eşleşmiyor; bu 4'ü mevcut atölyeye
   bağla, gerisi yeni açılsın. Anahtar okunabilir prefix, betik norm'lar ve
   norm(dosyaAd) bu prefix'le başlıyorsa mevcut koda bağlar.
   Şüpheliler (DORUK 55, DOĞUŞ GRUP 2, iki SİNCİK) bilinçli olarak YOK —
   kullanıcı kararıyla yeni açılıyorlar. */
const ATOLYE_ALIAS = [
  ['ŞAHİNLER DENİM', 'B001'],
  ['E K GİYİM',      'B046'],
  ['ŞİMŞEK TASARIM', 'B007'],
  ['DT GİYİM',       'B005'],
].map(([p, k]) => [norm(p), k])
/* Bant düzeyi tekil kolon indeksleri (sabit; başlıktan da doğrulanır) */
const KOL = {
  atolyeAd: 1, tier: 2, anaTedarik: 3, ikinciTedarik: 4, bantTuru: 5,
  bantNo: 6, bantAd: 7, calisan: 153, makine: 154, kapasite: 155,
  minSiparis: 156, doluluk: 157, gorusulen: 158, tarih: 159, notlar: 160,
}

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })

/* ---------- 1. Kaynak + kolon haritası ---------- */
const s = XLSX.utils.sheet_to_json(XLSX.readFile(FILE).Sheets[SHEET], { header: 1, defval: null, blankrows: true })
if (!s.length) { console.error(`✗ Sayfa boş/yok: ${SHEET}`); process.exit(1) }

/* Başlıklardan {sutun, boyut, deger} yetenek haritası — grup birleştirilmiş
   hücre olduğu için ileri taşınır. Sütun eklenirse betik kırılmaz. */
let g = null
const yetenekKolon = []
for (let i = 0; i < Math.max(s[0].length, s[1].length); i++) {
  if (s[0][i]) g = txt(s[0][i])
  const deger = s[1][i] ? txt(s[1][i]) : null
  const boyut = GRUP_BOYUT[g]
  if (deger && boyut) yetenekKolon.push({ sutun: i, boyut, deger })
}

/* ---------- 2. Katalog: norm(label) → value_code (boyut bazında) ---------- */
const catRows = await sql`
  SELECT d.code AS boyut, v.code, v.label
  FROM capability_dimension d JOIN capability_value v ON v.dimension_id = d.id`
const katalog = {}    // boyut -> Map(normLabel -> code)
const gecerliKod = {} // boyut -> Set(code)
for (const r of catRows) {
  (katalog[r.boyut] ??= new Map()).set(norm(r.label), r.code)
  ;(gecerliKod[r.boyut] ??= new Set()).add(r.code)
}

/* Dosya değeri → value_code çöz. Sıra: ALIAS, sonra norm(label) eşleşmesi. */
function cozValueCode(boyut, deger) {
  const n = norm(deger)
  const alias = ALIAS[boyut]?.[n]
  if (alias && gecerliKod[boyut]?.has(alias)) return alias
  return katalog[boyut]?.get(n) ?? null
}

const [tenant] = await sql`SELECT id, name FROM tenant WHERE slug = ${TENANT_SLUG}`
if (!tenant) { console.error(`✗ tenant bulunamadı: ${TENANT_SLUG}`); process.exit(1) }

/* ---------- 3. Çözümle: atölye → bant → yetenek ---------- */
const eksik = new Map()
const atolyeler = new Map()  // norm(ad) -> { ad, bantlar: [] }

for (let r = 2; r < s.length; r++) {
  const satir = s[r]
  if (!satir || !txt(satir[KOL.atolyeAd])) continue
  const ad = txt(satir[KOL.atolyeAd])
  const anahtar = norm(ad)
  if (!atolyeler.has(anahtar)) atolyeler.set(anahtar, { ad, bantlar: [] })

  const caps = []
  for (const yk of yetenekKolon) {
    if (!txt(satir[yk.sutun])) continue   // işaret yok
    const vcode = cozValueCode(yk.boyut, yk.deger)
    if (!vcode) {
      const k = `${yk.boyut} :: ${yk.deger}  (norm: ${norm(yk.deger)})`
      eksik.set(k, (eksik.get(k) ?? 0) + 1)
      continue
    }
    caps.push({ boyut: yk.boyut, vcode })
  }

  atolyeler.get(anahtar).bantlar.push({
    bantNo: txt(satir[KOL.bantNo]),
    bantAd: txt(satir[KOL.bantAd]) || `Bant ${txt(satir[KOL.bantNo]) || '1'}`,
    bantTuru: txt(satir[KOL.bantTuru]) || null,
    calisan: num(satir[KOL.calisan]),
    makine: num(satir[KOL.makine]),
    kapasite: num(satir[KOL.kapasite]),
    minSiparis: num(satir[KOL.minSiparis]),
    doluluk: (() => { const n = Number(satir[KOL.doluluk]); return Number.isFinite(n) ? n : null })(),
    gorusulen: txt(satir[KOL.gorusulen]) || null,
    notlar: txt(satir[KOL.notlar]) || null,
    caps,
  })
}

/* ---------- 4. Eksik terim varsa DUR ---------- */
if (eksik.size) {
  console.error(`\n✗ Katalogda karşılığı olmayan ${eksik.size} terim — hiçbir şey yazılmadı.\n`)
  for (const [k, n] of [...eksik].sort((a, b) => b[1] - a[1])) {
    console.error(`   ${String(n).padStart(4)} işaret  ${k}`)
  }
  console.error(`\n   Çözüm: terimi migration 027'ye ekle ya da ALIAS haritasına yaz.`)
  await sql.end()
  process.exit(1)
}

/* ---------- 5. Atölye eşleştirme (isimle + elle alias) ---------- */
const pesAtolye = await sql`SELECT id, code, name FROM workshop WHERE tenant_id = ${tenant.id}`
const pesByAd = new Map(pesAtolye.map((a) => [norm(a.name), a]))
const pesByKod = new Map(pesAtolye.map((a) => [a.code, a]))
const aliasKodu = (anahtar) => {
  for (const [prefix, kod] of ATOLYE_ALIAS) if (anahtar.startsWith(prefix)) return kod
  return null
}
const eslesen = [], yeniAtolye = []
for (const [anahtar, a] of atolyeler) {
  if (pesByAd.has(anahtar)) { eslesen.push({ ...a, pes: pesByAd.get(anahtar) }); continue }
  const kod = aliasKodu(anahtar)
  if (kod && pesByKod.has(kod)) { eslesen.push({ ...a, pes: pesByKod.get(kod) }); continue }
  yeniAtolye.push(a)
}

/* ---------- 6. Rapor ---------- */
const bantToplam = [...atolyeler.values()].reduce((t, a) => t + a.bantlar.length, 0)
const capToplam = [...atolyeler.values()].reduce((t, a) => t + a.bantlar.reduce((x, b) => x + b.caps.length, 0), 0)
console.log(`\nKaynak    : ${FILE}`)
console.log(`Sayfa     : ${SHEET}`)
console.log(`Tenant    : ${tenant.name} (${TENANT_SLUG})`)
console.log(`Atölye    : ${atolyeler.size} (${eslesen.length} eşleşen, ${yeniAtolye.length} yeni)`)
console.log(`Bant      : ${bantToplam}`)
console.log(`Yetenek   : ${capToplam} işaret`)
console.log(`\nYENİ AÇILACAK ATÖLYELER (${yeniAtolye.length}):`)
for (const a of yeniAtolye) console.log(`   + ${a.ad}  (${a.bantlar.length} bant)`)

if (!APPLY) {
  console.log(`\nKURU ÇALIŞMA — hiçbir şey yazılmadı. Yazmak için: --apply\n`)
  await sql.end()
  process.exit(0)
}

/* ---------- 7. Yazma ---------- */
/* Yeni atölye kodları MTR-001, MTR-002… Başlangıç numarasını döngü öncesi
   BİR kez çek, JS'te artır — döngü içinde MAX sorgusu hem yavaş hem kırılgan
   (regexp_replace escape tuzağı). split_part güvenli: code LIKE 'MTR-%'. */
const [{ n: mtrBas }] = await sql`
  SELECT COALESCE(MAX(split_part(code,'-',2)::int),0) AS n
  FROM workshop WHERE tenant_id = ${tenant.id} AND code LIKE 'MTR-%'`
let mtrSira = Number(mtrBas)

await sql.begin(async (tx) => {
  for (const a of [...eslesen, ...yeniAtolye]) {
    let ws = a.pes
    if (!ws) {
      const kod = 'MTR-' + String(++mtrSira).padStart(3, '0')
      const [row] = await tx`
        INSERT INTO workshop (tenant_id, code, name, type, line_count)
        VALUES (${tenant.id}, ${kod}, ${a.ad}, 'X', ${a.bantlar.length})
        RETURNING id, code, name`
      ws = row
    }

    /* Bant uzlaştırma: dosyadaki bantlar BANT_ADI ile eşleşir. */
    const mevcutBant = await tx`SELECT id, code, name FROM production_line WHERE workshop_id = ${ws.id}`
    const mevcutByAd = new Map(mevcutBant.map((b) => [norm(b.name), b]))
    const dosyaAdlari = new Set(a.bantlar.map((b) => norm(b.bantAd)))

    /* Dosyada olmayan mevcut bant: üretim varsa arşivle, yoksa sil. */
    for (const mb of mevcutBant) {
      if (dosyaAdlari.has(norm(mb.name))) continue
      const [{ c }] = await tx`SELECT count(*)::int c FROM monthly_production WHERE line_id = ${mb.id}`
      if (c > 0) await tx`UPDATE production_line SET is_active = false, updated_at = NOW() WHERE id = ${mb.id}`
      else await tx`DELETE FROM production_line WHERE id = ${mb.id}`
    }

    /* Dosyadaki her bant: eşleşeni güncelle, yoksa aç. */
    let bantSira = 0
    for (const b of a.bantlar) {
      bantSira++
      const eski = mevcutByAd.get(norm(b.bantAd))
      let line
      if (eski) {
        const [row] = await tx`
          UPDATE production_line SET
            name = ${kes50(b.bantAd)}, bant_turu = ${b.bantTuru},
            operator_count = COALESCE(${b.calisan}, operator_count),
            daily_target = COALESCE(${b.kapasite}, daily_target),
            makine_sayisi = ${b.makine}, min_siparis_adet = ${b.minSiparis},
            doluluk_pct = ${b.doluluk}, gorusulen_kisi = ${b.gorusulen},
            notlar = ${b.notlar}, is_active = true, updated_at = NOW()
          WHERE id = ${eski.id} RETURNING id`
        line = row
      } else {
        const kod = `${ws.code}-B${bantSira}`
        const [row] = await tx`
          INSERT INTO production_line (tenant_id, workshop_id, code, name, line_type,
            bant_turu, operator_count, daily_target, makine_sayisi, min_siparis_adet,
            doluluk_pct, gorusulen_kisi, notlar)
          VALUES (${tenant.id}, ${ws.id}, ${kod}, ${kes50(b.bantAd)}, 'Normal',
            ${b.bantTuru}, ${b.calisan ?? 0}, ${b.kapasite ?? 0}, ${b.makine},
            ${b.minSiparis}, ${b.doluluk}, ${b.gorusulen}, ${b.notlar})
          ON CONFLICT (code) DO UPDATE SET workshop_id = EXCLUDED.workshop_id, updated_at = NOW()
          RETURNING id`
        line = row
      }

      /* PROFILE yetenekleri: sil + yeniden yaz. ASSIGNED'a dokunma. */
      await tx`DELETE FROM line_capability WHERE line_id = ${line.id} AND attribute_type = 'PROFILE'`
      if (b.caps.length) {
        const satirlar = b.caps.map((c) => ({
          tenant_id: tenant.id, line_id: line.id,
          dimension_code: c.boyut, value_code: c.vcode, attribute_type: 'PROFILE',
        }))
        await tx`
          INSERT INTO line_capability ${tx(satirlar, 'tenant_id', 'line_id', 'dimension_code', 'value_code', 'attribute_type')}
          ON CONFLICT (line_id, dimension_code, value_code, attribute_type) DO NOTHING`
      }
    }

    /* line_count'u gerçek bant sayısına eşitle. */
    await tx`UPDATE workshop SET line_count = ${a.bantlar.length}, updated_at = NOW() WHERE id = ${ws.id}`
  }
})

console.log(`\n✓ Aktarıldı.\n`)
await sql.end()
