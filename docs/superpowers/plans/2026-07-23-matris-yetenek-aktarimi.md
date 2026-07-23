# MATRIS Yetenek Aktarımı — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** MATRIS Excel'inin (4) sayfasındaki bant düzeyi yetenek matrisini PES'e aktarmak ve yeteneğe göre filtrelenebilen bir arama sayfası eklemek.

**Architecture:** Faz A şema + ETL: migration 027 kataloğu genişletir ve bant düzeyi kolonlar açar; `import-matris.mjs` (dry-run varsayılan) dosyayı okur, terimleri katalogla eşler, bantları BANT_ADI ile uzlaştırır. Faz B: `/pes/yetenek-arama` server component, filtre SQL'de. A ve B bağımsız; A'nın verisi B'nin girdisi.

**Tech Stack:** postgres.js, xlsx, Next.js 16 App Router, TypeScript, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-23-matris-yetenek-aktarimi-ve-arama-design.md`

## Ölçülmüş sabitler (bu plana gömülü — subagent DB'ye sormasın)

**Kaynak:** `C:/Users/bhaka/Downloads/bant_kapasite_formu_MATRIS_mevcut_durum (1).xlsx`, sayfa `Bant Yetkinlik (Matris) (4)`. 162 sütun, 2 başlık satırı (0=grup birleştirilmiş, 1=değer), veri satır 2'den başlar.

**Grup başlığı → PES boyut kodu:**
```
'ANA GRUP'→ana_grup, 'KUMAŞ GRUBU'→kumas_grubu, 'CİNSİYET'→cinsiyet_yas,
'KALİTE'→kalite, 'SEZON'→sezon, 'KLASMAN'→klasman, 'MAKİNE PARKURU'→makine_parkuru,
'KUMAŞ TÜRÜ'→kumas_turu, 'KOL'→kol_turu, 'YAKA'→yaka_turu, 'KALIP'→kalip_turu,
'SİLUET'→siluet, 'CEP'→cep_turu
```

**Bant düzeyi tekil kolon başlıkları (değer satırı boş):** ATOLYE_ID(0), ATOLYE_ADI(1), TIER(2), ANA TEDARİK(3), 2. TEDARİK(4)*, BANT TÜRÜ(5)*, BANT_NO(6), BANT_ADI(7), CALISAN_SAYISI(153), MAKINE_SAYISI(154), KAPASITE_ADET_GUN(155), MIN_SIPARIS_ADET(156), DOLULUK_%(157), GORUSULEN_KISI(158), TARIH(159), NOT(160).
*Not: sütun 4-5'in değer satırında "2. TEDARİK"/"BANT TÜRÜ" yazıyor ama bunlar birleştirilmiş "ANA TEDARİK" grubunun altında; kolon başlıklarına indeksle erişilir, grup-değer haritasından DEĞİL.

**ALIAS (norm(dosya_label) → mevcut value_code, migration'a girmez):**
```
kol_turu:  'Truvakar Kol'  → TRUVAKAR
kalip_turu:'Wideleg'       → WIDELEG
kalip_turu:'Straight / Düz'→ STRAIGHT
makine_parkuru:'Punterez'  → PUNTERIZ
```

**Migration 027'nin ekleyeceği 21 yeni değer + 2 boyut:** aşağıda Task 1'de tam liste.

---

### Task 1: Migration 027 — katalog ve bant kolonları

**Files:**
- Create: `supabase/migrations/027_matris_katalog_ve_bant_alanlari.sql`

- [ ] **Step 1: Migration'ı yaz**

`supabase/migrations/027_matris_katalog_ve_bant_alanlari.sql`:

```sql
-- ============================================================
-- 027_matris_katalog_ve_bant_alanlari.sql
-- MATRIS master verisinin (bant düzeyi yetenek matrisi) girebilmesi için
-- katalog genişletmesi ve bant düzeyi alanlar.
--
-- KAYNAK: bant_kapasite_formu_MATRIS_mevcut_durum (1).xlsx, sayfa (4).
--
-- İKİ YENİ BOYUT: kalite, sezon — dosyada var, katalogda yoktu.
-- 10 YENİ DEĞER: mevcut boyutlara (yaka_turu, kalip_turu, siluet).
-- BANT KOLONLARI: bant_turu ve saha alanları — line_type'a sığmayan kavramlar.
--
-- NEDEN bant_turu AYRI KOLON: mevcut line_type yalnız Normal/Küçük (bandın
--   boyutu). CMT/UKP/DİKİM üretim tipidir, farklı kavram — 023c'de
--   workshop.type için aynı gerekçeyle production_type açılmıştı.
--
-- İDEMPOTENT: ON CONFLICT DO NOTHING / ADD COLUMN IF NOT EXISTS.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. YENİ BOYUTLAR: kalite, sezon (global katalog, tenant_id = NULL)
-- ============================================================
INSERT INTO capability_dimension (code, label, applies_to, sort_order, tenant_id) VALUES
  ('kalite', 'Kalite Segmenti', NULL, 11, NULL),
  ('sezon',  'Sezon',           NULL, 12, NULL)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. YENİ DEĞERLER
-- ============================================================
-- code = norm(label): TR harf sadeleştir, boşluk/ayraç → _, büyük harf.
-- sort_order boyut içinde mevcut max'tan devam eder.
INSERT INTO capability_value (dimension_id, code, label, sort_order, tenant_id)
SELECT d.id, v.code, v.label, v.sort_order, NULL
FROM capability_dimension d
JOIN (VALUES
  -- kalite (yeni boyut, 1'den)
  ('kalite', 'PREMIUM_KLASIK',  'Premium Klasik',   1),
  ('kalite', 'STANDART_VISION', 'Standart Vision',  2),
  ('kalite', 'CASUAL_TRENDY',   'Casual Trendy',    3),
  ('kalite', 'BEBEK_COCUK',     'Bebek/Çocuk',      4),
  ('kalite', 'GELENEKSEL',      'Geleneksel',       5),
  ('kalite', 'MODEST',          'Modest',           6),
  ('kalite', 'OUTLET',          'Outlet',           7),
  -- sezon (yeni boyut, 1'den)
  ('sezon',  'YIL_BOYU',        'Yıl Boyu',         1),
  ('sezon',  'YAZ_AGIRLIKLI',   'Yaz Ağırlıklı',    2),
  ('sezon',  'KIS_AGIRLIKLI',   'Kış Ağırlıklı',    3),
  ('sezon',  'SEZONLUK_ESNEK',  'Sezonluk-Esnek',   4),
  -- yaka_turu (mevcut max sort 9 → 10)
  ('yaka_turu', 'DUGMELI_GOMLEK_YAKA', 'Düğmeli Gömlek Yaka', 10),
  -- kalip_turu (mevcut max sort 8 → 9,10)
  ('kalip_turu', 'LOOSE_BOL', 'Loose & Bol', 9),
  ('kalip_turu', 'SIGARET',   'Sigaret',     10),
  -- siluet (mevcut max sort 6 → 7..13)
  ('siluet', 'FLARE',      'Flare',       7),
  ('siluet', 'JUPITER',    'Jüpiter',     8),
  ('siluet', 'MARS',       'Mars',        9),
  ('siluet', 'MERCURY',    'Mercury',     10),
  ('siluet', 'BALIK_ETEK', 'Balık Etek',  11),
  ('siluet', 'BALON',      'Balon',       12),
  ('siluet', 'FIRFIRLI',   'Fırfırlı',    13)
) AS v(dim, code, label, sort_order) ON v.dim = d.code
ON CONFLICT (dimension_id, code) DO NOTHING;

-- ============================================================
-- 3. BANT DÜZEYİ ALANLAR
-- ============================================================
-- Çalışan sayısı → mevcut operator_count, kapasite → mevcut daily_target.
-- Kalanlar yeni:
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS bant_turu        VARCHAR(20);
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS makine_sayisi    INTEGER;
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS min_siparis_adet INTEGER;
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS doluluk_pct      NUMERIC(5,2);
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS gorusulen_kisi   VARCHAR(120);
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS gorusme_tarihi   DATE;
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS notlar           TEXT;

COMMENT ON COLUMN production_line.bant_turu IS
  'Üretim tipi: CMT / UKP / DİKİM / DİKİM-UKP / KESİM-DİKİM. line_type (Normal/Küçük) ile karıştırılmaz.';

COMMIT;
```

- [ ] **Step 2: Migration'ı uygula**

Run: `node scripts/_migrate_one.mjs 027_matris_katalog_ve_bant_alanlari.sql`
(Bu betiğin argüman biçimini önce doğrula: `node scripts/_migrate_one.mjs` argümansız çalıştırıp kullanımını gör. Yanlışsa `_migrate.mjs`'e bak.)
Expected: hatasız uygulanır.

- [ ] **Step 3: Doğrula**

Geçici bir kontrol scripti yaz (`scripts/_tmp-027-kontrol.mjs`), `DATABASE_URL` ile bağlan, şunları yazdır ve çalıştırdıktan sonra sil:
- `SELECT code, label FROM capability_dimension WHERE code IN ('kalite','sezon')` → 2 satır
- `SELECT count(*)::int FROM capability_value cv JOIN capability_dimension cd ON cd.id=cv.dimension_id WHERE cd.code IN ('kalite','sezon')` → 11
- `SELECT count(*)::int FROM capability_value cv JOIN capability_dimension cd ON cd.id=cv.dimension_id WHERE cd.code='siluet'` → 13 (6 eski + 7 yeni)
- `SELECT column_name FROM information_schema.columns WHERE table_name='production_line' AND column_name IN ('bant_turu','makine_sayisi','min_siparis_adet','doluluk_pct','gorusulen_kisi','gorusme_tarihi','notlar')` → 7 satır

Expected: hepsi beklenen sayıda.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/027_matris_katalog_ve_bant_alanlari.sql
git commit -m "Migration 027: kalite+sezon boyutları, 21 yeni değer, bant düzeyi alanlar"
```

---

### Task 2: import-matris.mjs — kuru çalışma raporu

**Files:**
- Create: `scripts/import-matris.mjs`

Bu betik `scripts/import-klasman.mjs` desenini izler (onu referans olarak oku).
Farklar: kaynak sayfa (4), bant düzeyi kırılım, alias haritası, bant uzlaştırma.

- [ ] **Step 1: Betiği yaz**

`scripts/import-matris.mjs`:

```js
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
const katalog = {}   // boyut -> Map(normLabel -> code)
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

/* ---------- 5. Atölye eşleştirme (isimle) ---------- */
const pesAtolye = await sql`SELECT id, code, name FROM workshop WHERE tenant_id = ${tenant.id}`
const pesByAd = new Map(pesAtolye.map((a) => [norm(a.name), a]))
const eslesen = [], yeniAtolye = []
for (const [anahtar, a] of atolyeler) {
  if (pesByAd.has(anahtar)) eslesen.push({ ...a, pes: pesByAd.get(anahtar) })
  else yeniAtolye.push(a)
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
// Bant kodu deseni: {atölye_kodu}-B{n}. Yeni atölye kodu: sıradaki ZZ-> yok,
// mevcut import-klasman gibi code üret. Eşleşen atölyede pes.code kullanılır.
await sql.begin(async (tx) => {
  for (const a of [...eslesen, ...yeniAtolye]) {
    let ws = a.pes
    if (!ws) {
      /* Yeni atölye kodu: MTR-001, MTR-002… çakışmayı önlemek için mevcut
         MTR kodlarının sonrasından devam. */
      const [{ n }] = await tx`
        SELECT COALESCE(MAX(NULLIF(regexp_replace(code,'\\D','','g'),'')::int),0)+1 AS n
        FROM workshop WHERE tenant_id = ${tenant.id} AND code LIKE 'MTR-%'`
      const kod = 'MTR-' + String(n).padStart(3, '0')
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
            name = ${b.bantAd}, bant_turu = ${b.bantTuru},
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
          VALUES (${tenant.id}, ${ws.id}, ${kod}, ${b.bantAd}, 'Normal',
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
```

- [ ] **Step 2: Kuru çalışmayı çalıştır**

Run: `node scripts/import-matris.mjs`
Expected: eksik terim YOK (migration 027 sonrası), rapor basılır: ~111 atölye (91 eşleşen + 20 yeni), ~139 bant, yeni açılacak atölye listesi.

**Eğer eksik terim çıkarsa:** DUR, listeyi kullanıcıya göster. Ölçümde eksik çıkmamalı; çıkarsa ALIAS/migration eksiği vardır, kullanıcıya bildir, apply etme.

- [ ] **Step 3: Betiği commit et (apply ETME)**

```bash
git add scripts/import-matris.mjs
git commit -m "import-matris.mjs: MATRIS bant yetenek aktarımı (dry-run)"
```

---

### Task 3: Kuru çalışma onayı → apply → doğrula

**Files:** yok (veri işlemi). **Bu task kullanıcı onayı gerektirir.**

- [ ] **Step 1: Kuru çalışma raporunu kullanıcıya göster**

Task 2 Step 2'nin çıktısını (özellikle "yeni açılacak atölyeler" listesini) kullanıcıya sun. Onay al. Kullanıcı bir atölyenin yeni açılmaması gerektiğini söylerse (aslında mevcut bir atölyenin farklı yazımı ise) DUR ve nasıl eşleneceğini sor — apply etme.

- [ ] **Step 2: Apply**

Onay gelince:
Run: `node scripts/import-matris.mjs --apply`
Expected: `✓ Aktarıldı.`

- [ ] **Step 3: Doğrula**

Geçici kontrol scripti (`scripts/_tmp-matris-dogrula.mjs`), çalıştır + sil:
- `SELECT count(*)::int FROM workshop WHERE tenant_id=<default>` → ~134 (114 + 20 yeni)
- `SELECT count(*)::int FROM production_line WHERE tenant_id=<default>` → ~139+
- Çok bantlı bir atölye örneği (ŞAHİNLER): `SELECT code, name, bant_turu FROM production_line pl JOIN workshop w ON w.id=pl.workshop_id WHERE w.name ILIKE '%ŞAHİNLER%'` → 3 bant, farklı adlar
- `SELECT dimension_code, count(*)::int FROM line_capability WHERE attribute_type='PROFILE' GROUP BY 1 ORDER BY 2 DESC` → kalite/sezon dahil dağılım
- Bir bandın yetenekleri boş DEĞİL: `SELECT count(*)::int FROM line_capability lc JOIN production_line pl ON pl.id=lc.line_id WHERE pl.name ILIKE '%ŞAHİNLER 1%'` → >0

Expected: bantlar ayrışmış, her bandın kendi yetenek matrisi var.

- [ ] **Step 4: Commit (varsa doğrulama notu)**

Veri değişikliği commit gerektirmez; doğrulama scripti silinir. Bu task'ta yeni dosya commit'i yok.

---

### Task 4 (FAZ B): /pes/yetenek-arama sayfası

**Files:**
- Create: `app/pes/yetenek-arama/page.tsx`
- Modify: `components/pes/WorkshopSidebar.tsx` (menüye bağlantı)

**KAPSAM NOTU:** Bu task Faz A apply edilip doğrulandıktan SONRA **ayrı bir
writing-plans turuyla tam koda dökülür.** Sebep: filtre panelinin davranışı
(hangi boyut kaç değerle dolu, sayaç performansı, boş boyutların gizlenmesi)
gerçek aktarılmış veriye bakılarak tasarlanmalı — tahminle yazılan tam kod
büyük olasılıkla yeniden yazılır. Aşağıdaki gereksinimler o planın girdisidir,
adım adım uygulama kodu değildir.

- [ ] **Step 1: Sayfayı yaz**

`app/pes/yetenek-arama/page.tsx` — server component. Detaylı gereksinim:

- URL: `?<boyut>=<code1>,<code2>&...` (örn. `?klasman=GOMLEK,ELBISE&kumas_turu=KETEN`).
- Sol panel: her boyut ve değerleri, yanında **mevcut seçime göre daralan** bant sayısı. Değer seçili değilse tümü, seçiliyse o boyut hariç diğer filtreler uygulanmış sayı.
- Sağ: filtreleri sağlayan atölyeler, altında eşleşen bantlar.
- Filtre mantığı: boyut-içi VEYA, boyutlar-arası VE. Bir bant tüm seçili boyutları (her boyutta en az bir seçili değeri) sağlamalı.
- Sadece `attribute_type='PROFILE'` ve `is_active` bant.

SQL çekirdeği (eşleşen bant id'leri) — seçili boyut sayısı = N ise, bant o N boyutun HEPSİNDE en az bir seçili değere sahip olmalı:

```sql
SELECT lc.line_id
FROM line_capability lc
WHERE lc.attribute_type = 'PROFILE'
  AND (
    (lc.dimension_code = 'klasman'    AND lc.value_code = ANY($1)) OR
    (lc.dimension_code = 'kumas_turu' AND lc.value_code = ANY($2))
  )
GROUP BY lc.line_id
HAVING count(DISTINCT lc.dimension_code) = 2   -- seçili boyut sayısı
```

`withServerTenant` ile çalıştır (RLS + tenant context). Seçili boyut yoksa
tüm aktif bantları göster. Boyut/değer listesini `capability_dimension` +
`capability_value` `WHERE tenant_id IS NULL OR tenant_id = <tenant>` ile çek,
`sort_order`'a göre sırala.

Sol panel sayaçları: her (boyut, değer) için, o değeri O BOYUTA ekleyince kaç
bant eşleşir — yani diğer boyutların mevcut filtresi + bu boyutta bu değer.
Performans için tek sorguda: eşleşen bantların yetenek dağılımını çek, JS'te say.

Tam kod uzun; `app/pes/compare/page.tsx` ve `app/pes/yetenek-rapor/page.tsx`
mevcut desenleri (server component + withServerTenant + Tailwind tablo) izlensin.
Client etkileşimi (checkbox → URL) için `AtolyeSecici.tsx`'teki
`useRouter`/`useSearchParams` deseni; filtre paneli ayrı client component olur.

- [ ] **Step 2: Menüye ekle**

`components/pes/WorkshopSidebar.tsx` içinde "Performans & Karşılaştırma" grubuna,
"Yetenek Raporu"nun yanına: `{ href: '/pes/yetenek-arama', label: 'Yetenek Arama', icon: '⌕' }`
(gruptaki mevcut madde biçimini birebir izle).

- [ ] **Step 3: Tip kontrolü ve derleme**

Run: `npx tsc --noEmit` then `npm run build`
Expected: hata yok.

- [ ] **Step 4: Yerelde doğrula**

`http://localhost:3000/pes/yetenek-arama` — bir boyuttan değer seç, sağdaki
liste daralsın; ikinci boyuttan değer seç, VE mantığıyla daha da daralsın;
sol panel sayaçları güncellensin.

- [ ] **Step 5: Commit**

```bash
git add app/pes/yetenek-arama/page.tsx components/pes/WorkshopSidebar.tsx
git commit -m "Yetenek Arama sayfası: boyut filtreleriyle bant/atölye arama"
```

---

### Task 5: Yayın

- [ ] **Step 1: Tüm testler**

Run: `npm test`
Expected: mevcut 328 test yeşil kalır (bu iş yeni test eklemez; ETL ve sayfa
gerçek-veri doğrulamasıyla test edildi).

- [ ] **Step 2: Yayına al**

Run: `vercel deploy --prod --scope promode --yes`
Expected: `readyState: READY`

- [ ] **Step 3: Production'da doğrula**

`https://pes-platform-tan.vercel.app/pes/yetenek-arama` — filtreleme çalışır,
`https://pes-platform-tan.vercel.app/pes/workshops` — yeni atölyeler ve bant
sayıları görünür.
```
