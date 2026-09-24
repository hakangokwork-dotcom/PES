# Model Fiyatlama (E3) Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bir modelin belirli bir atölyede kaça dikileceğini, o atölyenin kendi dakika maliyetiyle hesaplamak; teorik süreyle gerçekleşeni yan yana koymak.

**Architecture:** 30.319 satırlık operasyon zamanı kütüphanesi hâlihazırda boş duran `ref_*` tablolarına yüklenir. Model operasyon bültenleri ayrı tablolara (`model_bulten`, `model_bulten_operasyon`) girer; her operasyon düzenlenebilir kurallarla KESİM/DİKİM/UKP'ye eşlenir. Fiyat, bölüm sürelerini E0'ın atölyeye özel dakika maliyetleriyle çarparak hesaplanır ve `model_fiyat`'ta saklanır.

**Tech Stack:** Next.js 16 App Router, TypeScript, vitest, postgres.js, PostgreSQL (RLS), xlsx/openpyxl, Tailwind 4.

**Tasarım dokümanı:** `docs/superpowers/specs/2026-09-24-model-fiyatlama-e3-design.md`

**Dal:** `feat/model-fiyatlama`

---

## Dosya haritası

| Dosya | Sorumluluk |
|---|---|
| `lib/pes/kutuphane-sayfa.ts` | Kütüphane dosyasının 7 sayfasının tanımı + ham satır → kayıt çevrimi. Saf. |
| `lib/pes/kutuphane-sayfa.test.ts` | Sayfa tanımı ve iki tuzağın testi. |
| `scripts/import_operasyon_kutuphanesi.mjs` | Kütüphaneyi `ref_*`'a yükler. Kuru çalışma varsayılan. |
| `lib/pes/bulten-bolum.ts` | `(seviye1, tip)` → KESİM/DİKİM/UKP kural motoru. Saf. |
| `lib/pes/bulten-bolum.test.ts` | Örnek dosyanın 70 satırı fixture; 28/1241/99 beklenen. |
| `lib/pes/bulten-oku.ts` | Bülten xlsx → `model_bulten` + operasyon satırları. Saf. |
| `lib/pes/bulten-oku.test.ts` | Başlık eşleme, boş 3.seviye, eksik kolon davranışı. |
| `lib/pes/model-fiyat.ts` | Fiyat çekirdeği. E0'ın `hesapla()` çıktısını girdi alır. Saf. |
| `lib/pes/model-fiyat.test.ts` | Excel `MODEL_HESAP` satır 4 fixture'ı. |
| `lib/pes/gercek-sure.ts` | Üretimden türetme; karışık günleri atlar. Saf. |
| `lib/pes/gercek-sure.test.ts` | Karışık gün, eksik kadro, sıfır adet. |
| `supabase/migrations/039_model_fiyatlama.sql` | 5 yeni tablo + `work_order.model_bulten_id` + RLS. |
| `scripts/import_model_bulten.mjs` | Bülten dosyası → DB. |
| `app/pes/model/page.tsx` | Bülten listesi. |
| `app/pes/model/[id]/page.tsx` | Bülten satırları + bölüm dağılımı + elle ezme. |
| `app/pes/model/[id]/fiyat/page.tsx` | Atölye × fiyat karşılaştırması. |
| `app/pes/model/kutuphane/page.tsx` | `ref_*` gezgini, güven seviyesi rozetli. |
| `app/pes/model/[id]/fiyat/SureKarsilastirma.tsx` | Teorik / üretim / beyan üçlüsü. |
| `app/api/pes/model/...` | Bülten CRUD, bölüm ezme, fiyat hesaplama, gerçek süre yazma. |
| `components/pes/PesDevSidebar.tsx` | **Değişir** — "Model Fiyatlama" girişi. |

**Faz sırası:** Faz 1 (kütüphane) → Faz 2 (bülten) → Faz 3 (fiyat) → Faz 4 (gerçek süre). Her faz tek başına çalışan bir şey bırakır.

**Spec'ten bilerek sapılan tek yer:** tasarım `/pes/model/[id]/yukle` diye bir
import ekranı sayıyordu; plan bunun yerine `scripts/import_model_bulten.mjs`
kullanıyor (Task 8). Sebep: bülten yükleme bugün seyrek ve tek kişilik bir iş,
ve script kuru çalışmada bölüm dağılımını ve tanınmayan satırları zaten
raporluyor. Yükleme sıklaşırsa ekran ayrı bir turda eklenir.

---

# FAZ 1 — Operasyon zamanı kütüphanesi

## Task 1: Kütüphane sayfa tanımı ve satır çevrimi

**Files:**
- Create: `lib/pes/kutuphane-sayfa.ts`
- Test: `lib/pes/kutuphane-sayfa.test.ts`

Kaynak dosya `C:\Users\bhaka\Desktop\WORK\PES\Konfeksiyon_operasyonları\konfeksiyon_veri_modeli.xlsx`.

**İki tuzak ölçüldü, ikisi de teste giriyor:**

1. **Başlık satırı sayfaya göre değişiyor.** Altı sayfada düzen `r1=başlık metni, r2=boş, r3=kolon adları, r4+=veri`. Ama `04_operasyon_grup`'ta **kolon adları r1'de, veri r2'den** başlıyor. Tek bir offset varsayılırsa o sayfanın ilk satırı başlık sanılıp atılır ya da başlık veri sanılıp yazılır.
2. **`02_ek_parca_tipi`'nin ilk veri satırında `ad` BOŞ** (id=1). `ref_ek_parca_tipi.ad` `NOT NULL`. Üstelik `03_ek_parca_varyant`'ta bir varyant bu id'ye bağlı, yani satır atılamaz — atılırsa varyant ve ona bağlı `operasyon_zamani` satırları yabancı anahtar hatası verir.

- [x] **Step 1: Başarısız testi yaz**

`lib/pes/kutuphane-sayfa.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SAYFALAR, satirlariCoz, adDuzelt } from './kutuphane-sayfa'

describe('SAYFALAR', () => {
  it('yedi sayfa tanımlı', () => {
    expect(Object.keys(SAYFALAR)).toHaveLength(7)
  })

  it('04_operasyon_grup başlığı 1. satırda — diğerlerinden farklı', () => {
    expect(SAYFALAR['04_operasyon_grup'].baslikSatiri).toBe(1)
  })

  it('diğer altı sayfanın başlığı 3. satırda', () => {
    for (const [ad, t] of Object.entries(SAYFALAR)) {
      if (ad === '04_operasyon_grup') continue
      expect(t.baslikSatiri, `${ad} başlık satırı`).toBe(3)
    }
  })

  it('her sayfa bir ref_ tablosuna gidiyor', () => {
    for (const t of Object.values(SAYFALAR)) {
      expect(t.tablo).toMatch(/^ref_/)
    }
  })

  it('operasyon_zamani 13 kolon taşıyor', () => {
    expect(SAYFALAR['07_operasyon_zamani'].kolonlar).toHaveLength(13)
    expect(SAYFALAR['07_operasyon_zamani'].kolonlar).toContain('guven_seviyesi')
  })
})

describe('satirlariCoz', () => {
  it('kolon adlarını değerlerle eşler', () => {
    const k = ['id', 'ad']
    expect(satirlariCoz(k, [['1', 'Apolet'], ['2', 'Ara Parça']]))
      .toEqual([{ id: '1', ad: 'Apolet' }, { id: '2', ad: 'Ara Parça' }])
  })

  it('tamamen boş satırı atar', () => {
    expect(satirlariCoz(['id', 'ad'], [['1', 'A'], [null, null], ['2', 'B']]))
      .toHaveLength(2)
  })

  it('id boş olan satırı atar — yabancı anahtar kurulamaz', () => {
    expect(satirlariCoz(['id', 'ad'], [[null, 'Adı var ama id yok']])).toHaveLength(0)
  })

  it('eksik hücreleri null yapar, kolon sayısını korur', () => {
    expect(satirlariCoz(['id', 'ad', 'aciklama'], [['1', 'A']]))
      .toEqual([{ id: '1', ad: 'A', aciklama: null }])
  })
})

describe('adDuzelt', () => {
  it('boş adı yer tutucuyla doldurur', () => {
    expect(adDuzelt(null, 1)).toBe('(adsız #1)')
    expect(adDuzelt('', 7)).toBe('(adsız #7)')
    expect(adDuzelt('   ', 7)).toBe('(adsız #7)')
  })

  it('dolu adı olduğu gibi bırakır', () => {
    expect(adDuzelt('2 Yan Ekstrafor', 2)).toBe('2 Yan Ekstrafor')
  })

  it('baştaki ve sondaki boşluğu kırpar', () => {
    expect(adDuzelt('  Apolet  ', 3)).toBe('Apolet')
  })
})
```

- [x] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/kutuphane-sayfa.test.ts`
Expected: FAIL — `Failed to resolve import "./kutuphane-sayfa"`

- [x] **Step 3: Uygulamayı yaz**

`lib/pes/kutuphane-sayfa.ts`:

```ts
/**
 * Operasyon zamanı kütüphanesi dosyasının sayfa tanımları.
 *
 * Kaynak: PES/Konfeksiyon_operasyonları/konfeksiyon_veri_modeli.xlsx
 * Hedef:  migration 012'nin ref_* tabloları (kurulu, boş).
 *
 * İKİ ÖLÇÜLMÜŞ TUZAK:
 *
 * 1. Başlık satırı sayfaya göre değişiyor. Altı sayfa "başlık metni /
 *    boş / kolon adları / veri" düzeninde (kolonlar r3). 04_operasyon_grup
 *    ise doğrudan kolon adlarıyla başlıyor (r1). Tek offset varsayılırsa
 *    o sayfanın ilk grubu ya kaybolur ya başlık veri olarak yazılır.
 *
 * 2. 02_ek_parca_tipi'nin id=1 satırında ad BOŞ, ama ref_ek_parca_tipi.ad
 *    NOT NULL ve 03_ek_parca_varyant'ta bir varyant bu id'ye bağlı.
 *    Satır atılamaz (yabancı anahtar kırılır), boş da yazılamaz —
 *    adDuzelt() yer tutucu koyar ve kayıp görünür kalır.
 */

export type SayfaTanimi = {
  /** Hedef ref_ tablosu. */
  tablo: string
  /** Kolon adlarının bulunduğu 1-tabanlı satır numarası. Veri bir sonrakinden. */
  baslikSatiri: number
  /** Kolon adları — hedef tablonun kolonlarıyla birebir. */
  kolonlar: string[]
  /** Beklenen veri satırı sayısı; import bunu doğrular. */
  beklenenSatir: number
}

export const SAYFALAR: Record<string, SayfaTanimi> = {
  '01_urun_tipi': {
    tablo: 'ref_urun_tipi',
    baslikSatiri: 3,
    kolonlar: ['id', 'klasman_ad', 'segment', 'kumas_grubu', 'urun_grubu', 'kol_tipi', 'ozellik'],
    beklenenSatir: 117,
  },
  '02_ek_parca_tipi': {
    tablo: 'ref_ek_parca_tipi',
    baslikSatiri: 3,
    kolonlar: ['id', 'ad'],
    beklenenSatir: 464,
  },
  '03_ek_parca_varyant': {
    tablo: 'ref_ek_parca_varyant',
    baslikSatiri: 3,
    kolonlar: ['id', 'ek_parca_tipi_id', 'tam_ad', 'ozellikler'],
    beklenenSatir: 1270,
  },
  // TUZAK: başlık r1'de, veri r2'den. Diğer altı sayfadan farklı.
  '04_operasyon_grup': {
    tablo: 'ref_operasyon_grup',
    baslikSatiri: 1,
    kolonlar: ['id', 'ad'],
    beklenenSatir: 273,
  },
  '05_operasyon': {
    tablo: 'ref_operasyon',
    baslikSatiri: 3,
    kolonlar: ['id', 'ad', 'makine_tipi_id', 'skill_level', 'setup_suresi'],
    beklenenSatir: 1338,
  },
  '06_makine_tipi': {
    tablo: 'ref_makine_tipi',
    baslikSatiri: 3,
    kolonlar: ['id', 'ad', 'aciklama'],
    beklenenSatir: 17,
  },
  '07_operasyon_zamani': {
    tablo: 'ref_operasyon_zamani',
    baslikSatiri: 3,
    kolonlar: [
      'id', 'urun_tipi_id', 'ek_parca_varyant_id', 'operasyon_grup_id', 'operasyon_id',
      'mtm', 'mtm_min', 'mtm_max', 'mtm_ortalama', 'mtm_std',
      'orneklem', 'varyasyon_yuzde', 'guven_seviyesi',
    ],
    beklenenSatir: 30319,
  },
}

export type HamSatir = Array<unknown>
export type Kayit = Record<string, unknown>

/**
 * Ham satırları kolon adlarıyla eşler.
 *
 * Tamamen boş satır ve id'si boş satır atılır: id olmadan yabancı anahtar
 * kurulamaz, o satıra bağlı çocuk kayıtlar zaten yüklenemez.
 */
export function satirlariCoz(kolonlar: string[], hamSatirlar: HamSatir[]): Kayit[] {
  const cikti: Kayit[] = []
  for (const ham of hamSatirlar) {
    if (!ham || ham.every(h => h === null || h === undefined || h === '')) continue
    const kayit: Kayit = {}
    kolonlar.forEach((k, i) => {
      const v = ham[i]
      kayit[k] = v === undefined || v === '' ? null : v
    })
    if (kayit.id === null) continue
    cikti.push(kayit)
  }
  return cikti
}

/**
 * NOT NULL ad kolonları için: boş adı yer tutucuyla doldurur.
 * Kayıt silinmez çünkü çocuk tablolar id'ye bağlı; yer tutucu sayesinde
 * eksik veri ekranda görünür kalır ve sonradan düzeltilebilir.
 */
export function adDuzelt(ad: unknown, id: number | string): string {
  const s = ad === null || ad === undefined ? '' : String(ad).trim()
  return s === '' ? `(adsız #${id})` : s
}
```

- [x] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/kutuphane-sayfa.test.ts`
Expected: PASS — 12 test

- [x] **Step 5: Commit**

```bash
git add lib/pes/kutuphane-sayfa.ts lib/pes/kutuphane-sayfa.test.ts
git commit -m "feat(model): kutuphane sayfa tanimi ve satir cevrimi

Yedi sayfanin hedef tablosu, baslik satiri ve kolonlari tek yerde.
Iki olculmus tuzak teste bagli: 04_operasyon_grup'un basligi r1'de
(digerlerinde r3), ve 02_ek_parca_tipi'nin id=1 satirinda ad bos
ama kolon NOT NULL ve bir varyant o id'ye bagli.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Kütüphaneyi `ref_*` tablolarına yükle

**Files:**
- Create: `scripts/import_operasyon_kutuphanesi.mjs`

`ref_*` tablolarında `tenant_id` **yok** — bunlar ortak katalog, kiracıya göre bölünmüyor. Yükleme sırası yabancı anahtarlara göre: `makine_tipi → urun_tipi → ek_parca_tipi → ek_parca_varyant → operasyon_grup → operasyon → operasyon_zamani`.

Dosyadaki `id` değerleri **korunur**; `07_operasyon_zamani`'nin dört yabancı anahtarı onlara dayanıyor. Bu yüzden yükleme sonunda `SERIAL` dizileri elle ileri alınır, yoksa bir sonraki elle ekleme çakışır.

- [x] **Step 1: Script'i yaz**

```js
/**
 * Operasyon zamanı kütüphanesi → ref_* tabloları.
 *
 * Kaynak: PES/Konfeksiyon_operasyonları/konfeksiyon_veri_modeli.xlsx
 *   117 ürün tipi / 464 ek parça / 1.270 varyant / 273 grup /
 *   1.338 operasyon / 17 makine / 30.319 MTM değeri
 *
 * Kullanım:
 *   node scripts/import_operasyon_kutuphanesi.mjs
 *   node scripts/import_operasyon_kutuphanesi.mjs --uygula
 *
 * --uygula olmadan hiçbir şey yazılmaz.
 *
 * DİKKAT: dosyadaki id'ler KORUNUR (operasyon_zamani'nin dört FK'si onlara
 * dayanıyor). Yükleme sonunda diziler ileri alınır.
 */
import postgres from 'postgres'
import XLSX from 'xlsx'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))
const UYGULA = process.argv.includes('--uygula')
const arg = (ad, v = null) => {
  const i = process.argv.indexOf(`--${ad}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : v
}
const DOSYA = arg('dosya', join(__dir, '../Konfeksiyon_operasyonları/konfeksiyon_veri_modeli.xlsx'))

const { SAYFALAR, satirlariCoz, adDuzelt } = await import('tsx/esm/api').then(async ({ register }) => {
  const un = register()
  const mod = await import('../lib/pes/kutuphane-sayfa.ts')
  un()
  return mod
})

/** NOT NULL ad kolonları — boş gelirse adDuzelt yer tutucu koyar. */
const AD_KOLONU = {
  ref_urun_tipi: 'klasman_ad',
  ref_ek_parca_tipi: 'ad',
  ref_ek_parca_varyant: 'tam_ad',
  ref_operasyon_grup: 'ad',
  ref_operasyon: 'ad',
  ref_makine_tipi: 'ad',
}

/** Yabancı anahtar sırası — ebeveyn önce. */
const SIRA = [
  '06_makine_tipi', '01_urun_tipi', '02_ek_parca_tipi', '03_ek_parca_varyant',
  '04_operasyon_grup', '05_operasyon', '07_operasyon_zamani',
]

const wb = XLSX.readFile(DOSYA)
const paket = {}
let hata = 0

for (const sayfa of SIRA) {
  const t = SAYFALAR[sayfa]
  const ws = wb.Sheets[sayfa]
  if (!ws) { console.error(`HATA: sayfa yok — ${sayfa}`); process.exit(1) }

  // header:1 ham dizi verir; baslikSatiri'ndan SONRAKİ satırlar veridir.
  const tumu = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null })
  const ham = tumu.slice(t.baslikSatiri)
  const kayitlar = satirlariCoz(t.kolonlar, ham)

  const adKol = AD_KOLONU[t.tablo]
  let duzeltilen = 0
  if (adKol) {
    for (const k of kayitlar) {
      const once = k[adKol]
      k[adKol] = adDuzelt(once, k.id)
      if (String(once ?? '').trim() === '') duzeltilen++
    }
  }

  const uyari = kayitlar.length === t.beklenenSatir ? '' : `  << BEKLENEN ${t.beklenenSatir}`
  if (uyari) hata++
  console.log(`  ${sayfa.padEnd(22)} ${String(kayitlar.length).padStart(6)} satır` +
              (duzeltilen ? `  (${duzeltilen} boş ad dolduruldu)` : '') + uyari)
  paket[sayfa] = { tanim: t, kayitlar }
}

if (hata) {
  console.error('\nSatır sayıları beklenenden farklı. Dosya değişmiş olabilir —')
  console.error('lib/pes/kutuphane-sayfa.ts içindeki beklenenSatir değerlerini gözden geçir.')
  if (!UYGULA) console.error('(Kuru çalışma olduğu için yine de devam edilmedi.)')
  process.exit(1)
}

if (!UYGULA) {
  console.log('\nKURU ÇALIŞMA — hiçbir şey yazılmadı. Yazmak için --uygula ekle.')
  process.exit(0)
}

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30 })

try {
  await sql.begin(async (tx) => {
    // Ters sırada temizle — çocuk önce.
    for (const sayfa of [...SIRA].reverse()) {
      await tx.unsafe(`DELETE FROM ${SAYFALAR[sayfa].tablo}`)
    }

    for (const sayfa of SIRA) {
      const { tanim, kayitlar } = paket[sayfa]
      if (kayitlar.length === 0) continue
      // 1.000'lik gruplar: 30.319 satırı tek INSERT'te göndermek parametre
      // sınırını aşıyor.
      for (let i = 0; i < kayitlar.length; i += 1000) {
        const grup = kayitlar.slice(i, i + 1000)
        await tx`INSERT INTO ${tx(tanim.tablo)} ${tx(grup, ...tanim.kolonlar)}`
      }
      console.log(`  yazıldı: ${tanim.tablo} ${kayitlar.length}`)
    }

    // id'ler korunduğu için diziler geride kaldı; ileri al.
    for (const sayfa of SIRA) {
      const tablo = SAYFALAR[sayfa].tablo
      await tx.unsafe(
        `SELECT setval(pg_get_serial_sequence('${tablo}','id'),
                       COALESCE((SELECT MAX(id) FROM ${tablo}), 1))`)
    }
  })

  console.log('\nYAZILDI. Güven seviyesi dağılımı:')
  for (const r of await sql`
    SELECT guven_seviyesi, count(*)::int AS n FROM ref_operasyon_zamani
    GROUP BY guven_seviyesi ORDER BY n DESC`) {
    console.log(`  ${String(r.guven_seviyesi).padEnd(12)} ${r.n}`)
  }
} finally {
  await sql.end()
}
```

- [x] **Step 2: Kuru çalıştır**

Run: `node scripts/import_operasyon_kutuphanesi.mjs`
Expected:
```
  06_makine_tipi             17 satır
  01_urun_tipi              117 satır
  02_ek_parca_tipi          464 satır  (1 boş ad dolduruldu)
  03_ek_parca_varyant      1270 satır
  04_operasyon_grup         273 satır
  05_operasyon             1338 satır
  07_operasyon_zamani     30319 satır

KURU ÇALIŞMA — hiçbir şey yazılmadı.
```

Satır sayısı tutmuyorsa **dur**. `04_operasyon_grup` 272 ya da 274 çıkıyorsa başlık satırı varsayımı bozulmuş demektir; `02_ek_parca_tipi`'de "boş ad dolduruldu" satırı görünmüyorsa o tuzak kaybolmuş ya da sayfa değişmiş.

- [x] **Step 3: Uygula**

Run: `node scripts/import_operasyon_kutuphanesi.mjs --uygula`
Expected:
```
  yazıldı: ref_makine_tipi 17
  ...
  yazıldı: ref_operasyon_zamani 30319

YAZILDI. Güven seviyesi dağılımı:
  TEK_OLCUM    21595
  YUKSEK        4824
  DUSUK         2039
  ORTA          1861
```

- [x] **Step 4: Yabancı anahtar bütünlüğünü doğrula**

Run:
```bash
node -e "
import('postgres').then(async ({default:pg})=>{
  const fs=await import('node:fs');
  const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
    .filter(l=>l.includes('=')&&!l.startsWith('#'))
    .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}));
  const sql=pg(env.DATABASE_URL,{max:1,prepare:false});
  console.log('oksuz varyant:', await sql\`SELECT count(*)::int n FROM ref_ek_parca_varyant v
     LEFT JOIN ref_ek_parca_tipi t ON t.id=v.ek_parca_tipi_id WHERE t.id IS NULL\`);
  console.log('oksuz zaman  :', await sql\`SELECT count(*)::int n FROM ref_operasyon_zamani z
     LEFT JOIN ref_urun_tipi u ON u.id=z.urun_tipi_id
     LEFT JOIN ref_operasyon o ON o.id=z.operasyon_id
     WHERE u.id IS NULL OR o.id IS NULL\`);
  await sql.end();
});"
```
Expected: ikisi de `n: 0`

- [x] **Step 5: Commit**

```bash
git add scripts/import_operasyon_kutuphanesi.mjs
git commit -m "feat(model): operasyon zamani kutuphanesi yukleyicisi

30.319 MTM degeri + 117 urun tipi + 1.338 operasyon ref_* tablolarina.
Dosyadaki id'ler korunuyor (operasyon_zamani'nin dort FK'si onlara
dayaniyor), yukleme sonunda SERIAL dizileri ileri aliniyor.

Satir sayilari beklenenle karsilastiriliyor; tutmazsa yazmadan duruyor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `/pes/model/kutuphane` — kütüphane gezgini

**Files:**
- Create: `app/pes/model/kutuphane/page.tsx`
- Create: `app/api/pes/model/kutuphane/route.ts`

30.319 satır tek sayfada gösterilmez. Gezinti: **ürün tipi seç → o tipin operasyon grupları → grubun operasyonları ve MTM'leri.** Güven seviyesi her satırda rozet; `DUSUK` ayrıca filtrelenebilir çünkü kaynak doküman "önce bunlar doğrulanmalı" diyor.

- [x] **Step 1: API ucunu yaz**

`app/api/pes/model/kutuphane/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Kütüphane gezgini verisi.
 *   ?urun_tipi_id=            → o tipin operasyon grupları + satır sayısı
 *   ?urun_tipi_id=&grup_id=   → grubun operasyonları ve MTM'leri
 *   ?q=                       → ürün tipi araması
 *   ?guven=DUSUK              → yalnız o güven seviyesi
 * Parametresiz: ürün tipi listesi.
 */
export const GET = withTenantRoute(async (req, { sql }) => {
  const u = new URL(req.url)
  const urunTipiId = u.searchParams.get('urun_tipi_id')
  const grupId = u.searchParams.get('grup_id')
  const q = (u.searchParams.get('q') ?? '').trim()
  const guven = u.searchParams.get('guven')

  if (!urunTipiId) {
    const tipler = await sql`
      SELECT ut.id, ut.klasman_ad, ut.segment, ut.kumas_grubu, ut.urun_grubu,
             count(z.id)::int AS olcum_sayisi
      FROM ref_urun_tipi ut
      LEFT JOIN ref_operasyon_zamani z ON z.urun_tipi_id = ut.id
      WHERE ${q ? sql`ut.klasman_ad ILIKE ${'%' + q + '%'}` : sql`TRUE`}
      GROUP BY ut.id
      ORDER BY olcum_sayisi DESC, ut.klasman_ad
      LIMIT 200`
    return NextResponse.json({ tipler })
  }

  if (!grupId) {
    const gruplar = await sql`
      SELECT og.id, og.ad, count(*)::int AS olcum_sayisi,
             round(avg(z.mtm)::numeric, 2)::float AS ort_mtm
      FROM ref_operasyon_zamani z
      JOIN ref_operasyon_grup og ON og.id = z.operasyon_grup_id
      WHERE z.urun_tipi_id = ${Number(urunTipiId)}
        AND ${guven ? sql`z.guven_seviyesi = ${guven}` : sql`TRUE`}
      GROUP BY og.id
      ORDER BY olcum_sayisi DESC, og.ad`
    return NextResponse.json({ gruplar })
  }

  const satirlar = await sql`
    SELECT z.id, o.ad AS operasyon, v.tam_ad AS ek_parca,
           z.mtm::float, z.mtm_min::float, z.mtm_max::float,
           z.orneklem, z.varyasyon_yuzde::float, z.guven_seviyesi,
           mt.ad AS makine
    FROM ref_operasyon_zamani z
    JOIN ref_operasyon o ON o.id = z.operasyon_id
    LEFT JOIN ref_ek_parca_varyant v ON v.id = z.ek_parca_varyant_id
    LEFT JOIN ref_makine_tipi mt ON mt.id = o.makine_tipi_id
    WHERE z.urun_tipi_id = ${Number(urunTipiId)}
      AND z.operasyon_grup_id = ${Number(grupId)}
      AND ${guven ? sql`z.guven_seviyesi = ${guven}` : sql`TRUE`}
    ORDER BY z.mtm DESC
    LIMIT 500`
  return NextResponse.json({ satirlar })
})
```

- [x] **Step 2: Sayfayı yaz**

`app/pes/model/kutuphane/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'

/**
 * /pes/model/kutuphane — operasyon zamanı kütüphanesi gezgini
 *
 * 30.319 satır tek sayfada gösterilemez: ürün tipi → operasyon grubu →
 * operasyon kırılımıyla gezilir. Seçim URL'de, paylaşılabilir.
 *
 * Güven seviyesi her satırda: kaynak dokümanın deyimiyle 2.039 DUSUK
 * kayıt "sahada doğrulanmalı" — filtreyle ayrıca listelenebiliyor.
 */
export const dynamic = 'force-dynamic'

const GUVEN_RENK: Record<string, string> = {
  YUKSEK: 'bg-emerald-100 text-emerald-800',
  ORTA: 'bg-amber-100 text-amber-800',
  DUSUK: 'bg-rose-100 text-rose-800',
  TEK_OLCUM: 'bg-slate-100 text-slate-600',
}

export default async function Kutuphane({
  searchParams,
}: { searchParams: Promise<{ tip?: string; grup?: string; q?: string; guven?: string }> }) {
  const sp = await searchParams
  const tipId = sp.tip ? Number(sp.tip) : null
  const grupId = sp.grup ? Number(sp.grup) : null
  const q = (sp.q ?? '').trim()
  const guven = sp.guven ?? null

  const data = await withServerTenant(async (sql) => {
    const toplam = await sql`
      SELECT count(*)::int AS n, count(*) FILTER (WHERE guven_seviyesi='DUSUK')::int AS dusuk
      FROM ref_operasyon_zamani` as Array<{ n: number; dusuk: number }>

    const tipler = await sql`
      SELECT ut.id, ut.klasman_ad, ut.urun_grubu, count(z.id)::int AS olcum
      FROM ref_urun_tipi ut
      LEFT JOIN ref_operasyon_zamani z ON z.urun_tipi_id = ut.id
      WHERE ${q ? sql`ut.klasman_ad ILIKE ${'%' + q + '%'}` : sql`TRUE`}
      GROUP BY ut.id ORDER BY olcum DESC, ut.klasman_ad LIMIT 120`

    const gruplar = tipId ? await sql`
      SELECT og.id, og.ad, count(*)::int AS olcum
      FROM ref_operasyon_zamani z JOIN ref_operasyon_grup og ON og.id = z.operasyon_grup_id
      WHERE z.urun_tipi_id = ${tipId}
        AND ${guven ? sql`z.guven_seviyesi = ${guven}` : sql`TRUE`}
      GROUP BY og.id ORDER BY olcum DESC, og.ad` : []

    const satirlar = tipId && grupId ? await sql`
      SELECT z.id, o.ad AS operasyon, v.tam_ad AS ek_parca, z.mtm::float AS mtm,
             z.mtm_min::float AS mtm_min, z.mtm_max::float AS mtm_max,
             z.orneklem, z.varyasyon_yuzde::float AS vk, z.guven_seviyesi
      FROM ref_operasyon_zamani z
      JOIN ref_operasyon o ON o.id = z.operasyon_id
      LEFT JOIN ref_ek_parca_varyant v ON v.id = z.ek_parca_varyant_id
      WHERE z.urun_tipi_id = ${tipId} AND z.operasyon_grup_id = ${grupId}
        AND ${guven ? sql`z.guven_seviyesi = ${guven}` : sql`TRUE`}
      ORDER BY z.mtm DESC LIMIT 400` : []

    return { toplam: toplam[0], tipler, gruplar, satirlar }
  })

  if (!data) redirect('/login')
  const { toplam, tipler, gruplar, satirlar } = data
  const bag = (p: Record<string, string | number | null>) => {
    const u = new URLSearchParams()
    if (p.tip) u.set('tip', String(p.tip))
    if (p.grup) u.set('grup', String(p.grup))
    if (q) u.set('q', q)
    if (p.guven) u.set('guven', String(p.guven))
    return `/pes/model/kutuphane?${u.toString()}`
  }

  return (
    <main className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Operasyon Zamanı Kütüphanesi</h1>
        <p className="text-sm text-slate-500">
          {toplam?.n.toLocaleString('tr-TR')} MTM ölçümü ·{' '}
          <Link href={bag({ guven: 'DUSUK' })} className="underline text-rose-700">
            {toplam?.dusuk.toLocaleString('tr-TR')} düşük güvenli
          </Link>
          {' · '}<Link href="/pes/model" className="underline">modeller →</Link>
        </p>
      </header>

      {guven && (
        <p className="text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Yalnız <strong>{guven}</strong> güven seviyesindeki ölçümler gösteriliyor.{' '}
          <Link href={bag({ tip: tipId, grup: grupId })} className="underline">filtreyi kaldır</Link>
        </p>
      )}

      <form className="flex gap-2" action="/pes/model/kutuphane">
        <input name="q" defaultValue={q} placeholder="Klasman ara (ör. JEAN, GOMLEK)"
               className="border rounded px-2 py-1 text-sm w-80" />
        {guven && <input type="hidden" name="guven" value={guven} />}
        <button className="px-3 py-1 rounded bg-slate-900 text-white text-sm">Ara</button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="border rounded overflow-hidden">
          <h2 className="px-3 py-2 bg-slate-50 text-sm font-medium">Ürün tipi ({tipler.length})</h2>
          <ul className="max-h-[28rem] overflow-y-auto text-sm">
            {tipler.map((t: Record<string, unknown>) => (
              <li key={String(t.id)}>
                <Link href={bag({ tip: String(t.id), guven })}
                      className={`block px-3 py-1.5 hover:bg-slate-50 ${Number(t.id) === tipId ? 'bg-slate-100 font-medium' : ''}`}>
                  {String(t.klasman_ad)}
                  <span className="text-xs text-slate-400"> · {String(t.olcum)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="border rounded overflow-hidden">
          <h2 className="px-3 py-2 bg-slate-50 text-sm font-medium">Operasyon grubu</h2>
          {gruplar.length === 0
            ? <p className="p-3 text-sm text-slate-400">Soldan bir ürün tipi seç.</p>
            : <ul className="max-h-[28rem] overflow-y-auto text-sm">
                {gruplar.map((g: Record<string, unknown>) => (
                  <li key={String(g.id)}>
                    <Link href={bag({ tip: tipId, grup: String(g.id), guven })}
                          className={`block px-3 py-1.5 hover:bg-slate-50 ${Number(g.id) === grupId ? 'bg-slate-100 font-medium' : ''}`}>
                      {String(g.ad)}
                      <span className="text-xs text-slate-400"> · {String(g.olcum)}</span>
                    </Link>
                  </li>
                ))}
              </ul>}
        </section>

        <section className="border rounded overflow-hidden">
          <h2 className="px-3 py-2 bg-slate-50 text-sm font-medium">Operasyonlar</h2>
          {satirlar.length === 0
            ? <p className="p-3 text-sm text-slate-400">Bir operasyon grubu seç.</p>
            : <div className="max-h-[28rem] overflow-y-auto">
                <table className="text-sm w-full">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-1.5">Operasyon</th>
                      <th className="text-right px-3 py-1.5">MTM (sn)</th>
                      <th className="text-right px-3 py-1.5">Örneklem</th>
                      <th className="text-left px-3 py-1.5">Güven</th>
                    </tr>
                  </thead>
                  <tbody>
                    {satirlar.map((s: Record<string, unknown>) => (
                      <tr key={String(s.id)} className="border-t">
                        <td className="px-3 py-1.5">
                          {String(s.operasyon)}
                          {s.ek_parca ? <span className="block text-xs text-slate-400">{String(s.ek_parca)}</span> : null}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {Number(s.mtm).toFixed(2)}
                          {Number(s.orneklem) > 1 && (
                            <span className="block text-xs text-slate-400">
                              {Number(s.mtm_min).toFixed(1)}–{Number(s.mtm_max).toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{String(s.orneklem)}</td>
                        <td className="px-3 py-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${GUVEN_RENK[String(s.guven_seviyesi)] ?? ''}`}>
                            {String(s.guven_seviyesi)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </section>
      </div>

      <p className="text-xs text-slate-400">
        MTM değerleri <strong>medyan</strong>; birden fazla ölçüm varsa altında min–maks
        aralığı yazar. <code>TEK_OLCUM</code> tek ölçümden gelir, doğrulanmamıştır.
        <code>DUSUK</code> ölçümlerde varyasyon katsayısı %20'nin üstünde — bunlar
        sahada doğrulanmadan fiyatlamada dayanak yapılmamalı.
      </p>
    </main>
  )
}
```

- [x] **Step 3: Derle ve aç**

Run: `npm run build`
Expected: derleme başarılı, `/pes/model/kutuphane` listede

Tarayıcıda aç: ürün tipi listesi ölçüm sayısına göre sıralı gelir; bir tip seç → gruplar; bir grup seç → operasyonlar, MTM medyanı ve güven rozetiyle.

- [x] **Step 4: Commit**

```bash
git add app/pes/model/kutuphane/page.tsx app/api/pes/model/kutuphane/route.ts
git commit -m "feat(model): kutuphane gezgini — urun tipi > grup > operasyon

30.319 satir tek sayfada gosterilemez; uc kademeli gezinti, secim URL'de.
Guven seviyesi her satirda rozet, DUSUK ayrica filtrelenebiliyor —
kaynak dokuman o 2.039 kaydin sahada dogrulanmasi gerektigini soyluyor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FAZ 2 — Bülten ve bölüm eşlemesi

## Task 4: Bülten fixture'ı üret

**Files:**
- Create: `scripts/bulten_fixture_uret.mjs`
- Create: `lib/pes/__fixtures__/bulten-ornek.json` (script üretir)

Task 5'in kural motoru 70 gerçek satıra karşı test edilecek; satırları koda gömmek yerine kaynaktan üretiyoruz ki dosya değişince fixture yeniden üretilebilsin (E0'daki `ekonomi_fixture_uret.mjs` deseni).

- [x] **Step 1: Script'i yaz**

```js
/**
 * pantolon-jean-uretim-case.xlsx → lib/pes/__fixtures__/bulten-ornek.json
 *
 * Bülten kural motorunun testi bu dosyayı okur. Kaynak değişirse script
 * yeniden çalıştırılır ve testler yeni gerçeğe karşı koşar.
 *
 * Kullanım: node scripts/bulten_fixture_uret.mjs [--dosya <yol>]
 */
import XLSX from 'xlsx'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const arg = (ad, v = null) => {
  const i = process.argv.indexOf(`--${ad}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : v
}
const KAYNAK = arg('dosya', 'C:\\Users\\bhaka\\Desktop\\pantolon-jean-uretim-case.xlsx')
const HEDEF = join(__dir, '../lib/pes/__fixtures__/bulten-ornek.json')

const wb = XLSX.readFile(KAYNAK)

const bilgiSatirlari = XLSX.utils.sheet_to_json(wb.Sheets['Bilgi'], { header: 1, defval: null })
const bilgi = {}
for (const [alan, deger] of bilgiSatirlari.slice(1)) {
  if (alan) bilgi[String(alan).trim()] = deger === null ? null : String(deger)
}

const ops = XLSX.utils.sheet_to_json(wb.Sheets['Operasyonlar'], { defval: null })
  .filter(r => r['Sıra'] !== null && r['Sıra'] !== undefined)
  .map(r => ({
    sira_no: Number(r['Sıra']),
    seviye1: r['1.Seviye Süreç'] ?? null,
    seviye2: r['2.Seviye Süreç'] ?? null,
    seviye3: r['3.Seviye Süreç'] ?? null,
    cevrim_sn: Number(r['Çevrim (sn)']) || 0,
    tip: r['Tip'] ?? null,
    makine_kodu: r['Makine Kodu'] ?? null,
    oncesi: r['Öncesi'] ?? null,
  }))

const toplam = ops.reduce((a, o) => a + o.cevrim_sn, 0)

mkdirSync(dirname(HEDEF), { recursive: true })
writeFileSync(HEDEF, JSON.stringify({
  uretildi: new Date().toISOString(), kaynak: KAYNAK, bilgi, operasyonlar: ops, toplamSn: toplam,
}, null, 2), 'utf8')

console.log(`OK  ${ops.length} operasyon, toplam ${toplam} sn (${(toplam / 60).toFixed(2)} dk) → ${HEDEF}`)
```

- [x] **Step 2: Çalıştır ve doğrula**

Run: `node scripts/bulten_fixture_uret.mjs`
Expected: `OK  70 operasyon, toplam 1368 sn (22.80 dk) → ...`

70 ve 1368 tutmuyorsa kaynak dosya değişmiş demektir; devam etmeden önce nedenini bul.

- [x] **Step 3: Commit**

```bash
git add scripts/bulten_fixture_uret.mjs lib/pes/__fixtures__/bulten-ornek.json
git commit -m "feat(model): bulten fixture ureteci — ornek dosyadan 70 operasyon

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Bölüm eşleme kural motoru

**Files:**
- Create: `lib/pes/bulten-bolum.ts`
- Test: `lib/pes/bulten-bolum.test.ts`

Spec §3'te ölçülen sonuç: tohum kurallarla örnek dosya **KESİM 28 / DİKİM 1241 / UKP 99** saniyeye ayrışmalı. Kural sırası kritik — tip tabanlı DİKİM kuralı (30), `Son İşlem → UKP` kuralından (40) **önce** gelmeli; yoksa paça kıvırma ve punteriz UKP'ye yazılır.

- [x] **Step 1: Başarısız testi yaz**

`lib/pes/bulten-bolum.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TOHUM_KURALLAR, bolumBul, bolumToplamlari } from './bulten-bolum'
import type { BolumKurali, BultenSatiri } from './bulten-bolum'
import fixture from './__fixtures__/bulten-ornek.json'

const OPS = fixture.operasyonlar as BultenSatiri[]

describe('fixture', () => {
  it('70 operasyon, 1368 saniye', () => {
    expect(OPS).toHaveLength(70)
    expect(OPS.reduce((a, o) => a + o.cevrim_sn, 0)).toBe(1368)
  })
})

describe('bolumBul', () => {
  it('Kesim aşaması KESIM', () => {
    expect(bolumBul({ seviye1: 'Kesim', tip: 'Serme' } as BultenSatiri, TOHUM_KURALLAR)).toBe('KESIM')
    expect(bolumBul({ seviye1: 'Kesim', tip: 'Yardımcı (El)' } as BultenSatiri, TOHUM_KURALLAR)).toBe('KESIM')
  })

  it('dikiş makinesi tipleri DIKIM — aşama ne olursa olsun', () => {
    for (const tip of ['Düz Dikiş', 'Overlok', 'Punteriz', 'Çift İğne', 'Zincir (FOA)', 'Zincir Dikiş', 'Kemer (Kansai)']) {
      expect(bolumBul({ seviye1: 'Son İşlem', tip } as BultenSatiri, TOHUM_KURALLAR), tip).toBe('DIKIM')
    }
  })

  it('Son İşlem içindeki dikiş dışı işler UKP', () => {
    expect(bolumBul({ seviye1: 'Son İşlem', tip: 'Ütü/Pres' } as BultenSatiri, TOHUM_KURALLAR)).toBe('UKP')
    expect(bolumBul({ seviye1: 'Son İşlem', tip: 'Yardımcı (El)' } as BultenSatiri, TOHUM_KURALLAR)).toBe('UKP')
    expect(bolumBul({ seviye1: 'Son İşlem', tip: 'Pres/Aksesuar' } as BultenSatiri, TOHUM_KURALLAR)).toBe('UKP')
  })

  it('hazırlık aşamasındaki ütü ve el işi DIKIM — dikim hazırlığıdır', () => {
    expect(bolumBul({ seviye1: 'Ön Hazırlık', tip: 'Ütü/Pres' } as BultenSatiri, TOHUM_KURALLAR)).toBe('DIKIM')
    expect(bolumBul({ seviye1: 'Ön Hazırlık', tip: 'Yardımcı (El)' } as BultenSatiri, TOHUM_KURALLAR)).toBe('DIKIM')
  })

  it('tanınmayan her şey son kuralla DIKIM', () => {
    expect(bolumBul({ seviye1: 'Bilinmeyen Aşama', tip: 'Bilinmeyen Tip' } as BultenSatiri, TOHUM_KURALLAR)).toBe('DIKIM')
  })

  it('kural önceliği: düşük öncelik önce uygulanır', () => {
    const kurallar: BolumKurali[] = [
      { oncelik: 5, seviye1: null, tip: 'Düz Dikiş', bolum: 'UKP' },
      { oncelik: 30, seviye1: null, tip: 'Düz Dikiş', bolum: 'DIKIM' },
    ]
    expect(bolumBul({ seviye1: 'X', tip: 'Düz Dikiş' } as BultenSatiri, kurallar)).toBe('UKP')
  })
})

describe('bolumToplamlari — gerçek dosya', () => {
  const t = bolumToplamlari(OPS, TOHUM_KURALLAR)

  it('KESİM 28 saniye', () => expect(t.KESIM).toBe(28))
  it('DİKİM 1241 saniye', () => expect(t.DIKIM).toBe(1241))
  it('UKP 99 saniye', () => expect(t.UKP).toBe(99))

  it('üç bölümün toplamı dosyanın toplamı', () => {
    expect(t.KESIM + t.DIKIM + t.UKP).toBe(1368)
  })

  it('yalnız 1.seviyeye bakan kural setiyle sonuç FARKLI — eşleme önemli', () => {
    const naif: BolumKurali[] = [
      { oncelik: 10, seviye1: 'Kesim', tip: null, bolum: 'KESIM' },
      { oncelik: 40, seviye1: 'Son İşlem', tip: null, bolum: 'UKP' },
      { oncelik: 99, seviye1: null, tip: null, bolum: 'DIKIM' },
    ]
    const n = bolumToplamlari(OPS, naif)
    expect(n.UKP).toBe(203)
    expect(n.DIKIM).toBe(1137)
    expect(n.UKP - t.UKP).toBe(104)   // 104 saniye yer değiştiriyor
  })

  it('elle ezilen satır kuralı geçersiz kılar', () => {
    const ezili = OPS.map((o, i) => i === 0 ? { ...o, bolum: 'UKP' as const, bolum_kaynak: 'elle' as const } : o)
    const t2 = bolumToplamlari(ezili, TOHUM_KURALLAR)
    expect(t2.KESIM).toBe(28 - OPS[0].cevrim_sn)
    expect(t2.UKP).toBe(99 + OPS[0].cevrim_sn)
  })
})
```

- [x] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/bulten-bolum.test.ts`
Expected: FAIL — `Failed to resolve import "./bulten-bolum"`

- [x] **Step 3: Uygulamayı yaz**

`lib/pes/bulten-bolum.ts`:

```ts
/**
 * Bülten operasyonlarını KESİM / DİKİM / UKP bölümlerine eşler.
 *
 * NEDEN İKİ KOLONA BAKIYOR: aşama adı tek başına yetmiyor. Örnek dosyada
 * "Son İşlem" karışık — paça kıvırma (36 sn, düz dikiş) ve dört punteriz
 * gerçek dikim; iplik temizleme, son ütü, perçin ve paket UKP. Yalnız
 * aşamaya bakılırsa 104 saniye (sürenin %7,6'sı) yanlış bölüme yazılıyor.
 *
 * Bugün üç bölümün dakika maliyeti eşit olduğu için toplam fiyat
 * değişmiyor; ama KAPASİTE PAYI yalnız DİKİM dakikasına baktığı için onu
 * bugün de değiştiriyor, ve bölüm maaş ağırlıkları ayrıştığı gün fiyatı da
 * değiştirecek. economy_param bu ayrışmaya hazır.
 *
 * Kurallar veritabanında (bulten_bolum_kurali) ve düzenlenebilir;
 * buradaki tohum set ilk yüklemede yazılır.
 */

export type Bolum = 'KESIM' | 'DIKIM' | 'UKP'

export type BolumKurali = {
  /** Küçük olan önce uygulanır; ilk eşleşen kazanır. */
  oncelik: number
  /** null = herhangi bir aşama. Birebir eşleşme. */
  seviye1: string | null
  /** null = herhangi bir tip. Birebir eşleşme. */
  tip: string | null
  bolum: Bolum
}

export type BultenSatiri = {
  sira_no: number
  seviye1: string | null
  seviye2: string | null
  seviye3: string | null
  cevrim_sn: number
  tip: string | null
  makine_kodu: string | null
  oncesi: string | null
  /** Elle ezilmişse dolu; kural uygulanmaz. */
  bolum?: Bolum
  bolum_kaynak?: 'kural' | 'elle'
}

/** Dikiş makinesi sayılan tipler — aşama ne olursa olsun DİKİM. */
const DIKIS_TIPLERI = [
  'Düz Dikiş', 'Overlok', 'Punteriz', 'Çift İğne',
  'Zincir (FOA)', 'Zincir Dikiş', 'Kemer (Kansai)',
]

/** Kesim sayılan tipler. */
const KESIM_TIPLERI = ['Serme', 'Kesim']

export const TOHUM_KURALLAR: BolumKurali[] = [
  { oncelik: 10, seviye1: 'Kesim', tip: null, bolum: 'KESIM' },
  ...KESIM_TIPLERI.map((tip, i) => ({ oncelik: 20 + i, seviye1: null, tip, bolum: 'KESIM' as Bolum })),
  ...DIKIS_TIPLERI.map((tip, i) => ({ oncelik: 30 + i, seviye1: null, tip, bolum: 'DIKIM' as Bolum })),
  { oncelik: 40, seviye1: 'Son İşlem', tip: null, bolum: 'UKP' },
  // Tanınmayan operasyon en olası yere düşer. "Eşleşmedi" bırakmak
  // süreyi hiçbir bölüme yazmaz ve fiyat SESSİZCE eksik çıkar; import
  // raporu kaç satırın bu kurala düştüğünü söyler.
  { oncelik: 99, seviye1: null, tip: null, bolum: 'DIKIM' },
]

/** Satırın bölümü. Elle ezilmişse o kullanılır, yoksa ilk eşleşen kural. */
export function bolumBul(satir: BultenSatiri, kurallar: BolumKurali[]): Bolum {
  if (satir.bolum_kaynak === 'elle' && satir.bolum) return satir.bolum
  const sirali = [...kurallar].sort((a, b) => a.oncelik - b.oncelik)
  for (const k of sirali) {
    if (k.seviye1 !== null && k.seviye1 !== satir.seviye1) continue
    if (k.tip !== null && k.tip !== satir.tip) continue
    return k.bolum
  }
  return 'DIKIM'
}

/** Kaçıncı kuralın uygulandığı — import raporu son kurala düşenleri sayar. */
export function uygulananKural(satir: BultenSatiri, kurallar: BolumKurali[]): BolumKurali | null {
  if (satir.bolum_kaynak === 'elle') return null
  const sirali = [...kurallar].sort((a, b) => a.oncelik - b.oncelik)
  for (const k of sirali) {
    if (k.seviye1 !== null && k.seviye1 !== satir.seviye1) continue
    if (k.tip !== null && k.tip !== satir.tip) continue
    return k
  }
  return null
}

export type BolumToplami = Record<Bolum, number>

/** Bölüm başına toplam saniye. */
export function bolumToplamlari(
  satirlar: BultenSatiri[], kurallar: BolumKurali[],
): BolumToplami {
  const t: BolumToplami = { KESIM: 0, DIKIM: 0, UKP: 0 }
  for (const s of satirlar) t[bolumBul(s, kurallar)] += s.cevrim_sn
  return t
}
```

- [x] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/bulten-bolum.test.ts`
Expected: PASS — 14 test

Özellikle `KESİM 28 / DİKİM 1241 / UKP 99` üçlüsü geçmeli. Geçmiyorsa ya kural sırası bozulmuştur (tip kuralı `Son İşlem` kuralından sonra kalmıştır) ya da fixture yeniden üretilmemiştir.

- [x] **Step 5: Commit**

```bash
git add lib/pes/bulten-bolum.ts lib/pes/bulten-bolum.test.ts
git commit -m "feat(model): bolum esleme kural motoru

(seviye1, tip) cifti uzerinden KESIM/DIKIM/UKP. Asama adi tek basina
yetmiyor: 'Son Islem' karisik — paca kivirma ve punteriz dikim, utu ve
paket UKP. Yalniz asamaya bakilirsa 104 saniye yanlis bolume yaziliyor;
test bu farki da dogruluyor.

Son kural her seyi DIKIM'e dusurur. 'Eslesmedi' birakmak sureyi hicbir
bolume yazmaz ve fiyat sessizce eksik cikar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Migration 039 — bülten, kurallar, fiyat, gerçek süre

**Files:**
- Create: `supabase/migrations/039_model_fiyatlama.sql`

**İki kural, ikisi de daha önce ısırdı:**

1. **`OR workshop_id IS NULL` KULLANILMAYACAK** (035 kalıbı). Beş yeni tablo iç ekip verisi; `current_workshop_id() IS NULL` ile atölye kullanıcısı tamamen dışarıda. 037 ve 038 aynı şekilde.
2. **`ref_*` tablolarına DOKUNULMAYACAK** — ortak katalog, mevcut politikaları var.

- [x] **Step 1: Migration'ı yaz**

```sql
-- ============================================================
-- Migration 039 — Model fiyatlama
-- ============================================================
--
-- Kaynak tasarım: docs/superpowers/specs/2026-09-24-model-fiyatlama-e3-design.md
-- Uygulama planı:  docs/superpowers/plans/2026-09-24-model-fiyatlama-e3.md
--
-- NE EKLİYOR:
--   1. model_bulten            — teorik operasyon bülteni (atölyeden bağımsız)
--   2. model_bulten_operasyon  — bültenin satırları + bölüm
--   3. bulten_bolum_kurali     — (seviye1, tip) → bölüm, düzenlenebilir
--   4. model_fiyat             — model × atölye × dönem, HESAPLANIP SAKLANIR
--   5. model_gercek_sure       — üretimden türetilen + atölye beyanı
--   6. work_order.model_bulten_id
--
-- NE EKLEMİYOR:
--   ref_* tabloları (012'de kurulu, bu turda yalnız veriyle dolduruluyor).
--   eder_* modülü — dokunulmuyor, akıbeti ayrı karar.
--
-- GÖRÜNÜRLÜK: beş yeni tablo İÇ EKİP verisi. 035'in "OR workshop_id IS NULL"
--   kalıbı BİLEREK yok; o kalıp NULL satırı her atölyeye açıyor (bkz. 037, 038).
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. model_bulten ----------
CREATE TABLE IF NOT EXISTS model_bulten (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    model_adi     VARCHAR(200) NOT NULL,
    plm_id        VARCHAR(50),
    kumas_tipi    VARCHAR(200),
    sezon         VARCHAR(20),
    siparis_adedi INTEGER,
    klasman_kodu  VARCHAR(50),
    kaynak_dosya  TEXT,
    toplam_sn     NUMERIC(10,2),
    not_metni     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE model_bulten IS
'Teorik operasyon bülteni. ATÖLYE VE DÖNEM YOK: bülten modelin standart akışıdır, atölye/dönem model_fiyat''ta. Fiyatlama bunu kullanır (kullanıcı: "fiyatlamalar genelde teorik olan ile yapılmaktadır").';
COMMENT ON COLUMN model_bulten.klasman_kodu IS
'capability_value.code. Klasman kârlılığının anahtarı — E0''da atölye seviyesinde cevaplanamayan soru buradan çözülür.';
COMMENT ON COLUMN model_bulten.toplam_sn IS
'Operasyon satırlarının toplamı. Türetilmiş; satır yazıldıkça güncellenir.';

CREATE INDEX IF NOT EXISTS idx_mb_tenant  ON model_bulten(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mb_plm     ON model_bulten(plm_id);
CREATE INDEX IF NOT EXISTS idx_mb_klasman ON model_bulten(klasman_kodu);

DROP TRIGGER IF EXISTS trg_mb_updated ON model_bulten;
CREATE TRIGGER trg_mb_updated BEFORE UPDATE ON model_bulten
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 2. model_bulten_operasyon ----------
CREATE TABLE IF NOT EXISTS model_bulten_operasyon (
    id            SERIAL PRIMARY KEY,
    bulten_id     INTEGER NOT NULL REFERENCES model_bulten(id) ON DELETE CASCADE,
    tenant_id     UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    sira_no       INTEGER NOT NULL,
    seviye1       VARCHAR(200),
    seviye2       VARCHAR(200),
    seviye3       VARCHAR(200),
    cevrim_sn     NUMERIC(8,2) NOT NULL CHECK (cevrim_sn >= 0),
    tip           VARCHAR(50),
    makine_kodu   VARCHAR(50),
    oncesi        VARCHAR(200),
    bolum         VARCHAR(10) NOT NULL,
    bolum_kaynak  VARCHAR(10) NOT NULL DEFAULT 'kural',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bulten_id, sira_no),
    CONSTRAINT mbo_bolum_chk  CHECK (bolum IN ('KESIM','DIKIM','UKP')),
    CONSTRAINT mbo_kaynak_chk CHECK (bolum_kaynak IN ('kural','elle'))
);

COMMENT ON COLUMN model_bulten_operasyon.bolum_kaynak IS
'kural = eşleme kuralından geldi | elle = kullanıcı ezdi. Ezilen satır kural yeniden uygulandığında KORUNUR.';
COMMENT ON COLUMN model_bulten_operasyon.oncesi IS
'Öncelik bağı. Bu turda saklanıyor, kullanılmıyor — örnek dosyada 70 satırın yalnız 6''sında dolu, akış analizine yetmiyor.';

CREATE INDEX IF NOT EXISTS idx_mbo_bulten ON model_bulten_operasyon(bulten_id, sira_no);
CREATE INDEX IF NOT EXISTS idx_mbo_tenant ON model_bulten_operasyon(tenant_id);

-- ---------- 3. bulten_bolum_kurali ----------
CREATE TABLE IF NOT EXISTS bulten_bolum_kurali (
    id         SERIAL PRIMARY KEY,
    tenant_id  UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    oncelik    INTEGER NOT NULL,
    seviye1    VARCHAR(200),
    tip        VARCHAR(50),
    bolum      VARCHAR(10) NOT NULL,
    aciklama   TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT bbk_bolum_chk CHECK (bolum IN ('KESIM','DIKIM','UKP'))
);

COMMENT ON TABLE bulten_bolum_kurali IS
'(seviye1, tip) → bölüm. NULL = herhangi. Küçük öncelik önce; ilk eşleşen kazanır. Tip kuralları aşama kurallarından ÖNCE gelmeli: "Son İşlem" karışıktır ve paça kıvırma/punteriz dikimdir.';

CREATE INDEX IF NOT EXISTS idx_bbk_tenant ON bulten_bolum_kurali(tenant_id, oncelik);

-- ---------- 4. model_fiyat ----------
CREATE TABLE IF NOT EXISTS model_fiyat (
    id             SERIAL PRIMARY KEY,
    bulten_id      INTEGER NOT NULL REFERENCES model_bulten(id) ON DELETE CASCADE,
    workshop_id    INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id      UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    donem          VARCHAR(7) NOT NULL,
    kesim_dk       NUMERIC(10,4),
    dikim_dk       NUMERIC(10,4),
    ukp_dk         NUMERIC(10,4),
    kesim_tl       NUMERIC(12,4),
    dikim_tl       NUMERIC(12,4),
    ukp_tl         NUMERIC(12,4),
    toplam_maliyet NUMERIC(12,4),
    adil_fiyat     NUMERIC(12,4),
    cmt_fiyat      NUMERIC(12,2),
    kar_adet       NUMERIC(12,4),
    marj           NUMERIC(8,6),
    gunluk_adet    INTEGER,
    kapasite_payi  NUMERIC(8,4),
    referans_3d    NUMERIC(12,4),
    cmt_3d_sapma   NUMERIC(8,6),
    param_donem    VARCHAR(7),
    hesaplandi_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bulten_id, workshop_id, donem),
    CONSTRAINT mf_donem_chk CHECK (donem ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON TABLE model_fiyat IS
'Hesaplanmış fiyat, SAKLANIR. Fiyat bir karar anıdır: üç ay sonra "bu fiyatı neye göre verdik" sorusunun cevabı, o günkü parametre ve dakika maliyetiyle birlikte durmalı.';
COMMENT ON COLUMN model_fiyat.param_donem IS
'Hesapta kullanılan economy_param dönemi. Parametre değişince eski fiyat yeniden hesaplanmaz; hangi varsayımla verildiği burada kalır.';

CREATE INDEX IF NOT EXISTS idx_mf_tenant ON model_fiyat(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mf_bulten ON model_fiyat(bulten_id, donem);

-- ---------- 5. model_gercek_sure ----------
CREATE TABLE IF NOT EXISTS model_gercek_sure (
    id           SERIAL PRIMARY KEY,
    bulten_id    INTEGER NOT NULL REFERENCES model_bulten(id) ON DELETE CASCADE,
    workshop_id  INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tenant_id    UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    donem        VARCHAR(7) NOT NULL,
    kaynak       VARCHAR(10) NOT NULL,
    dk_adet      NUMERIC(10,4),
    gun_sayisi   INTEGER,
    atlanan_gun  INTEGER NOT NULL DEFAULT 0,
    not_metni    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bulten_id, workshop_id, donem, kaynak),
    CONSTRAINT mgs_kaynak_chk CHECK (kaynak IN ('uretim','beyan')),
    CONSTRAINT mgs_donem_chk  CHECK (donem ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON COLUMN model_gercek_sure.atlanan_gun IS
'Bir bant aynı gün birden fazla iş emri işlediyse o gün paylaştırılamaz ve türetmeye girmez. Uydurulmuş bir dakika fiyat pazarlığında yanlış tarafa çeker.';

CREATE INDEX IF NOT EXISTS idx_mgs_tenant ON model_gercek_sure(tenant_id);

DROP TRIGGER IF EXISTS trg_mgs_updated ON model_gercek_sure;
CREATE TRIGGER trg_mgs_updated BEFORE UPDATE ON model_gercek_sure
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 6. work_order bağı ----------
ALTER TABLE work_order
    ADD COLUMN IF NOT EXISTS model_bulten_id INTEGER REFERENCES model_bulten(id) ON DELETE SET NULL;

COMMENT ON COLUMN work_order.model_bulten_id IS
'Teorik bülten bağı. Bugün model serbest metin (model_adi, stil_kodu); bülten bağlanmadan üretimden gerçek süre türetilemez. Geçmiş iş emirlerinde NULL kalır.';

CREATE INDEX IF NOT EXISTS idx_wo_bulten ON work_order(model_bulten_id)
    WHERE model_bulten_id IS NOT NULL;

-- ---------- 7. RLS ----------
-- Beş tablo da İÇ EKİP verisi. Atölye oturumunda current_workshop_id()
-- dolu olur; bu şart onu tamamen dışarıda tutar.
-- 035'in "OR workshop_id IS NULL" kalıbı BİLEREK yok.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['model_bulten','model_bulten_operasyon',
                             'bulten_bolum_kurali','model_fiyat','model_gercek_sure'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND current_workshop_id() IS NULL)',
            t || '_tenant_isolation', t);
    END LOOP;
END $$;

REVOKE ALL ON model_bulten, model_bulten_operasyon, bulten_bolum_kurali,
              model_fiyat, model_gercek_sure FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON
                 model_bulten, model_bulten_operasyon, bulten_bolum_kurali,
                 model_fiyat, model_gercek_sure TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE
                 model_bulten_id_seq, model_bulten_operasyon_id_seq,
                 bulten_bolum_kurali_id_seq, model_fiyat_id_seq,
                 model_gercek_sure_id_seq TO pes_app';
    END IF;
END $$;

-- ---------- 8. Tohum kurallar ----------
-- lib/pes/bulten-bolum.ts TOHUM_KURALLAR ile birebir. Sıra kritik:
-- tip kuralları (30-36) "Son İşlem → UKP" kuralından (40) ÖNCE gelir.
INSERT INTO bulten_bolum_kurali (tenant_id, oncelik, seviye1, tip, bolum, aciklama)
SELECT t.id, k.oncelik, k.seviye1, k.tip, k.bolum, k.aciklama
FROM tenant t
CROSS JOIN (VALUES
    (10, 'Kesim',      NULL,             'KESIM', 'Kesim aşamasının tamamı'),
    (20, NULL,         'Serme',          'KESIM', 'Serme her aşamada kesim'),
    (21, NULL,         'Kesim',          'KESIM', 'Kesim tipi her aşamada kesim'),
    (30, NULL,         'Düz Dikiş',      'DIKIM', 'Dikiş makinesi'),
    (31, NULL,         'Overlok',        'DIKIM', 'Dikiş makinesi'),
    (32, NULL,         'Punteriz',       'DIKIM', 'Dikiş makinesi'),
    (33, NULL,         'Çift İğne',      'DIKIM', 'Dikiş makinesi'),
    (34, NULL,         'Zincir (FOA)',   'DIKIM', 'Dikiş makinesi'),
    (35, NULL,         'Zincir Dikiş',   'DIKIM', 'Dikiş makinesi'),
    (36, NULL,         'Kemer (Kansai)', 'DIKIM', 'Dikiş makinesi'),
    (40, 'Son İşlem',  NULL,             'UKP',   'Son işlemde dikiş dışı kalanlar'),
    (99, NULL,         NULL,             'DIKIM', 'Tanınmayan operasyon; import raporu bunları sayar')
) AS k(oncelik, seviye1, tip, bolum, aciklama)
WHERE NOT EXISTS (
    SELECT 1 FROM bulten_bolum_kurali b
    WHERE b.tenant_id = t.id AND b.oncelik = k.oncelik);

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT count(*) FROM bulten_bolum_kurali;   -- → tenant sayısı × 12
--
-- Atölye kullanıcısı görememeli:
--   SET LOCAL pes.workshop_id = '1';
--   SELECT count(*) FROM model_bulten;        -- → 0
--
-- node scripts/verify_public_api.mjs
-- node scripts/verify_workshop_isolation.mjs
--
-- ROLLBACK:
--   BEGIN;
--   ALTER TABLE work_order DROP COLUMN IF EXISTS model_bulten_id;
--   DROP TABLE IF EXISTS model_gercek_sure;
--   DROP TABLE IF EXISTS model_fiyat;
--   DROP TABLE IF EXISTS model_bulten_operasyon;
--   DROP TABLE IF EXISTS bulten_bolum_kurali;
--   DROP TABLE IF EXISTS model_bulten;
--   COMMIT;
```

- [x] **Step 2: Commit (henüz uygulama yok)**

```bash
git add supabase/migrations/039_model_fiyatlama.sql
git commit -m "feat(model): migration 039 — bulten, kurallar, fiyat, gercek sure

Bes yeni tablo + work_order.model_bulten_id. RLS: hepsi ic ekip verisi,
atolye kullanicisi goremez (current_workshop_id() IS NULL). 035'in
OR workshop_id IS NULL kalibi bilerek kullanilmadi.

Tohum kurallar lib/pes/bulten-bolum.ts ile birebir; tip kurallari
'Son Islem -> UKP' kuralindan once geliyor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [x] **Step 3: Uygula**

Run: `node scripts/_migrate_one.mjs 039_model_fiyatlama.sql`
Expected: `OK   039_model_fiyatlama.sql`

- [x] **Step 4: Tohum kuralları ve izolasyonu doğrula**

Run:
```bash
node -e "
import('postgres').then(async ({default:pg})=>{
  const fs=await import('node:fs');
  const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
    .filter(l=>l.includes('=')&&!l.startsWith('#'))
    .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}));
  const sql=pg(env.DATABASE_URL,{max:1,prepare:false});
  console.log(await sql\`SELECT count(*)::int kural, count(DISTINCT tenant_id)::int tenant
    FROM bulten_bolum_kurali\`);
  console.log(await sql\`SELECT column_name FROM information_schema.columns
    WHERE table_name='work_order' AND column_name='model_bulten_id'\`);
  await sql.end();
});"
```
Expected: `kural = tenant × 12`, ve `model_bulten_id` kolonu listelenir

Run: `node scripts/verify_public_api.mjs`
Expected: beş yeni tablo için `erisim yok (HTTP 401)`

Run: `node scripts/verify_workshop_isolation.mjs`
Expected: geçer

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(model): migration 039 uygulandi ve izolasyon dogrulandi

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Bülten dosyasını okuma

**Files:**
- Create: `lib/pes/bulten-oku.ts`
- Test: `lib/pes/bulten-oku.test.ts`

Excel'den okunan ham satırları `model_bulten` + `model_bulten_operasyon` şekline çevirir. Saf: dosya okumaz, kendisine verilen satır dizilerini çevirir — böylece test edilebilir.

- [x] **Step 1: Başarısız testi yaz**

`lib/pes/bulten-oku.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { bilgiCoz, operasyonlariCoz, bultenOzeti } from './bulten-oku'
import fixture from './__fixtures__/bulten-ornek.json'

const HAM_BILGI: Array<[string, string]> = [
  ['Model Adı', 'Erkek 5 Cep Denim Jean (regular fit)'],
  ['Model No / PLM ID', 'JN-2026-001'],
  ['Kumaş Tipi', 'Denim %100 pamuk ~12 oz'],
  ['Sipariş Adedi', '10000'],
  ['Sezon', '2026'],
  ['Notlar', 'Toplam SMV ~22.33 dk'],
]

describe('bilgiCoz', () => {
  const b = bilgiCoz(HAM_BILGI)

  it('model adını ve PLM kodunu okur', () => {
    expect(b.model_adi).toBe('Erkek 5 Cep Denim Jean (regular fit)')
    expect(b.plm_id).toBe('JN-2026-001')
  })

  it('sipariş adedini sayıya çevirir', () => {
    expect(b.siparis_adedi).toBe(10000)
  })

  it('kumaş ve sezonu taşır', () => {
    expect(b.kumas_tipi).toContain('Denim')
    expect(b.sezon).toBe('2026')
  })

  it('model adı yoksa hata atar — bültenin kimliği budur', () => {
    expect(() => bilgiCoz([['Sezon', '2026']])).toThrow(/Model Adı/)
  })

  it('tanınmayan alanları yok sayar', () => {
    const b2 = bilgiCoz([...HAM_BILGI, ['Uydurma Alan', 'x']])
    expect(b2.model_adi).toBe(HAM_BILGI[0][1])
  })
})

describe('operasyonlariCoz', () => {
  const ham = [
    { 'Sıra': 1, '1.Seviye Süreç': 'Kesim', '2.Seviye Süreç': 'Serme', '3.Seviye Süreç': null,
      'Çevrim (sn)': 4, 'Tip': 'Serme', 'Makine Kodu': 'Serme', 'Operatör': null, 'Öncesi': null },
    { 'Sıra': 2, '1.Seviye Süreç': 'Ön Hazırlık', '2.Seviye Süreç': 'Cep takma', '3.Seviye Süreç': null,
      'Çevrim (sn)': 18, 'Tip': 'Düz Dikiş', 'Makine Kodu': 'SNLS', 'Operatör': null, 'Öncesi': 'Kesim' },
  ]

  it('başlıkları alanlara eşler', () => {
    const o = operasyonlariCoz(ham)
    expect(o[0]).toMatchObject({
      sira_no: 1, seviye1: 'Kesim', seviye2: 'Serme', seviye3: null,
      cevrim_sn: 4, tip: 'Serme', makine_kodu: 'Serme', oncesi: null,
    })
    expect(o[1].oncesi).toBe('Kesim')
  })

  it('sırası olmayan satırı atar', () => {
    expect(operasyonlariCoz([...ham, { 'Sıra': null, 'Çevrim (sn)': 9 }])).toHaveLength(2)
  })

  it('çevrim süresi okunamıyorsa 0 yazar, satırı atmaz', () => {
    const o = operasyonlariCoz([{ 'Sıra': 5, 'Çevrim (sn)': 'yok', '1.Seviye Süreç': 'X' }])
    expect(o[0].cevrim_sn).toBe(0)
  })

  it('boş 3.seviye null kalır', () => {
    expect(operasyonlariCoz(ham)[0].seviye3).toBeNull()
  })

  it('gerçek dosyanın 70 satırını çözer', () => {
    const o = operasyonlariCoz(
      fixture.operasyonlar.map(x => ({
        'Sıra': x.sira_no, '1.Seviye Süreç': x.seviye1, '2.Seviye Süreç': x.seviye2,
        '3.Seviye Süreç': x.seviye3, 'Çevrim (sn)': x.cevrim_sn, 'Tip': x.tip,
        'Makine Kodu': x.makine_kodu, 'Öncesi': x.oncesi,
      })),
    )
    expect(o).toHaveLength(70)
    expect(o.reduce((a, s) => a + s.cevrim_sn, 0)).toBe(1368)
  })
})

describe('bultenOzeti', () => {
  it('toplam saniye ve operasyon sayısı', () => {
    const o = bultenOzeti(fixture.operasyonlar as never)
    expect(o.operasyonSayisi).toBe(70)
    expect(o.toplamSn).toBe(1368)
    expect(o.toplamDk).toBeCloseTo(22.8, 4)
  })

  it('boş bültende sıfır, null değil', () => {
    expect(bultenOzeti([])).toEqual({ operasyonSayisi: 0, toplamSn: 0, toplamDk: 0 })
  })
})
```

- [x] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/bulten-oku.test.ts`
Expected: FAIL — `Failed to resolve import "./bulten-oku"`

- [x] **Step 3: Uygulamayı yaz**

`lib/pes/bulten-oku.ts`:

```ts
/**
 * Model operasyon bülteni (Excel) → model_bulten + model_bulten_operasyon.
 *
 * Saf: dosya okumaz. Çağıran xlsx'i okur, sayfaları bu fonksiyonlara verir.
 * Böylece başlık eşlemesi ve sayı çevrimi dosyasız test edilebilir.
 *
 * Beklenen yapı (örnek: pantolon-jean-uretim-case.xlsx):
 *   Bilgi       → Alan | Bilgi  ikilileri
 *   Operasyonlar→ Sıra | 1.Seviye Süreç | 2.Seviye Süreç | 3.Seviye Süreç |
 *                 Çevrim (sn) | Tip | Makine Kodu | Operatör | Öncesi
 */
import type { BultenSatiri } from './bulten-bolum'

export type BultenBilgisi = {
  model_adi: string
  plm_id: string | null
  kumas_tipi: string | null
  sezon: string | null
  siparis_adedi: number | null
  not_metni: string | null
}

/** Bilgi sayfasının tanıdığı alan adları. Tanınmayanlar yok sayılır. */
const BILGI_ALANI: Record<string, keyof BultenBilgisi> = {
  'Model Adı': 'model_adi',
  'Model No / PLM ID': 'plm_id',
  'PLM ID': 'plm_id',
  'Kumaş Tipi': 'kumas_tipi',
  'Sipariş Adedi': 'siparis_adedi',
  'Sezon': 'sezon',
  'Notlar': 'not_metni',
}

function sayi(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function bilgiCoz(satirlar: Array<[unknown, unknown]>): BultenBilgisi {
  const b: BultenBilgisi = {
    model_adi: '', plm_id: null, kumas_tipi: null,
    sezon: null, siparis_adedi: null, not_metni: null,
  }
  for (const [alanHam, degerHam] of satirlar) {
    const alan = BILGI_ALANI[String(alanHam ?? '').trim()]
    if (!alan) continue
    const deger = degerHam === null || degerHam === undefined ? null : String(degerHam).trim()
    if (alan === 'siparis_adedi') b.siparis_adedi = sayi(deger)
    else if (alan === 'model_adi') b.model_adi = deger ?? ''
    else (b as Record<string, unknown>)[alan] = deger
  }
  if (!b.model_adi) {
    throw new Error('Bilgi sayfasında "Model Adı" yok — bültenin kimliği bu alandır')
  }
  return b
}

/** Operasyon satırı başlıkları. Sıra ve süre dışındakiler isteğe bağlı. */
export function operasyonlariCoz(ham: Array<Record<string, unknown>>): BultenSatiri[] {
  const cikti: BultenSatiri[] = []
  for (const r of ham) {
    const sira = sayi(r['Sıra'])
    if (sira === null) continue        // sıra yoksa satır değil
    const metin = (k: string) => {
      const v = r[k]
      if (v === null || v === undefined) return null
      const s = String(v).trim()
      return s === '' ? null : s
    }
    cikti.push({
      sira_no: sira,
      seviye1: metin('1.Seviye Süreç'),
      seviye2: metin('2.Seviye Süreç'),
      seviye3: metin('3.Seviye Süreç'),
      // Süre okunamazsa 0: satırı atmak operasyonu kaybeder, 0 ise
      // toplamı bozmaz ve eksikliği ekranda görünür kalır.
      cevrim_sn: sayi(r['Çevrim (sn)']) ?? 0,
      tip: metin('Tip'),
      makine_kodu: metin('Makine Kodu'),
      oncesi: metin('Öncesi'),
    })
  }
  return cikti
}

export type BultenOzet = { operasyonSayisi: number; toplamSn: number; toplamDk: number }

export function bultenOzeti(satirlar: BultenSatiri[]): BultenOzet {
  const toplamSn = satirlar.reduce((a, s) => a + s.cevrim_sn, 0)
  return { operasyonSayisi: satirlar.length, toplamSn, toplamDk: toplamSn / 60 }
}
```

- [x] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/bulten-oku.test.ts`
Expected: PASS — 13 test

- [x] **Step 5: Commit**

```bash
git add lib/pes/bulten-oku.ts lib/pes/bulten-oku.test.ts
git commit -m "feat(model): bulten dosyasi cozumleyicisi

Saf: dosya okumaz, satir dizilerini cevirir; baslik eslemesi ve sayi
cevrimi dosyasiz test edilebiliyor. Model Adi yoksa hata atar — bultenin
kimligi o alan. Suresi okunamayan satir atilmaz, 0 yazilir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Bülten import script'i

**Files:**
- Create: `scripts/import_model_bulten.mjs`

- [x] **Step 1: Script'i yaz**

```js
/**
 * Model operasyon bülteni (Excel) → model_bulten + model_bulten_operasyon.
 *
 * Kullanım:
 *   node scripts/import_model_bulten.mjs --dosya "C:\\...\\pantolon-jean-uretim-case.xlsx"
 *   node scripts/import_model_bulten.mjs --dosya "..." --uygula
 *
 * --uygula olmadan hiçbir şey yazılmaz; bölüm dağılımı ve son kurala
 * düşen satırlar raporlanır.
 */
import postgres from 'postgres'
import XLSX from 'xlsx'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envOku } from './_atolye_profil_lib.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = envOku(join(__dir, '../.env.local'))
const UYGULA = process.argv.includes('--uygula')
const arg = (ad, v = null) => {
  const i = process.argv.indexOf(`--${ad}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : v
}
const DOSYA = arg('dosya')
const KLASMAN = arg('klasman')
if (!DOSYA) { console.error('HATA: --dosya zorunlu'); process.exit(1) }

const lib = await import('tsx/esm/api').then(async ({ register }) => {
  const un = register()
  const oku = await import('../lib/pes/bulten-oku.ts')
  const bolum = await import('../lib/pes/bulten-bolum.ts')
  un()
  return { ...oku, ...bolum }
})

const wb = XLSX.readFile(DOSYA)
if (!wb.Sheets['Bilgi'] || !wb.Sheets['Operasyonlar']) {
  console.error('HATA: dosyada "Bilgi" ve "Operasyonlar" sayfaları olmalı')
  process.exit(1)
}

const bilgiHam = XLSX.utils.sheet_to_json(wb.Sheets['Bilgi'], { header: 1, defval: null }).slice(1)
const bilgi = lib.bilgiCoz(bilgiHam)
const operasyonlar = lib.operasyonlariCoz(
  XLSX.utils.sheet_to_json(wb.Sheets['Operasyonlar'], { defval: null }))
const ozet = lib.bultenOzeti(operasyonlar)

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })

const [tenant] = await sql`SELECT id FROM tenant ORDER BY created_at LIMIT 1`
if (!tenant) { console.error('HATA: tenant yok'); await sql.end(); process.exit(1) }

const kurallarDb = await sql`
  SELECT oncelik, seviye1, tip, bolum FROM bulten_bolum_kurali
  WHERE tenant_id = ${tenant.id} ORDER BY oncelik`
const kurallar = kurallarDb.length ? kurallarDb : lib.TOHUM_KURALLAR
if (!kurallarDb.length) console.log('UYARI: veritabanında kural yok, tohum set kullanılıyor')

const bolumlu = operasyonlar.map(o => ({ ...o, bolum: lib.bolumBul(o, kurallar), bolum_kaynak: 'kural' }))
const toplam = lib.bolumToplamlari(operasyonlar, kurallar)
const sonKurala = operasyonlar.filter(o => lib.uygulananKural(o, kurallar)?.oncelik === 99)

console.log(`\n${bilgi.model_adi}  (${bilgi.plm_id ?? 'PLM yok'})`)
console.log(`  ${ozet.operasyonSayisi} operasyon, ${ozet.toplamSn} sn = ${ozet.toplamDk.toFixed(2)} dk`)
console.log(`  KESİM ${toplam.KESIM} sn · DİKİM ${toplam.DIKIM} sn · UKP ${toplam.UKP} sn`)

if (sonKurala.length) {
  console.log(`\n  ${sonKurala.length} satır son kurala (99) düştü — tanınmayan aşama/tip, DİKİM sayıldı:`)
  const gruplu = {}
  for (const o of sonKurala) {
    const k = `${o.seviye1 ?? '-'} / ${o.tip ?? '-'}`
    gruplu[k] = (gruplu[k] ?? 0) + 1
  }
  for (const [k, n] of Object.entries(gruplu)) console.log(`    ${k}  ×${n}`)
  console.log('  Bunlar doğru bölümde değilse bulten_bolum_kurali\'na kural ekle.')
}

if (!UYGULA) {
  console.log('\nKURU ÇALIŞMA — hiçbir şey yazılmadı. Yazmak için --uygula ekle.')
  await sql.end(); process.exit(0)
}

const [bulten] = await sql.begin(async (tx) => {
  const [b] = await tx`
    INSERT INTO model_bulten (tenant_id, model_adi, plm_id, kumas_tipi, sezon,
                              siparis_adedi, klasman_kodu, kaynak_dosya, toplam_sn, not_metni)
    VALUES (${tenant.id}, ${bilgi.model_adi}, ${bilgi.plm_id}, ${bilgi.kumas_tipi},
            ${bilgi.sezon}, ${bilgi.siparis_adedi}, ${KLASMAN},
            ${DOSYA}, ${ozet.toplamSn}, ${bilgi.not_metni})
    RETURNING id, model_adi`
  for (const o of bolumlu) {
    await tx`
      INSERT INTO model_bulten_operasyon
        (bulten_id, tenant_id, sira_no, seviye1, seviye2, seviye3,
         cevrim_sn, tip, makine_kodu, oncesi, bolum, bolum_kaynak)
      VALUES (${b.id}, ${tenant.id}, ${o.sira_no}, ${o.seviye1}, ${o.seviye2}, ${o.seviye3},
              ${o.cevrim_sn}, ${o.tip}, ${o.makine_kodu}, ${o.oncesi}, ${o.bolum}, 'kural')`
  }
  return [b]
})

console.log(`\nYAZILDI: bülten #${bulten.id} — ${bulten.model_adi}, ${bolumlu.length} operasyon`)
await sql.end()
```

- [x] **Step 2: Kuru çalıştır**

Run: `node scripts/import_model_bulten.mjs --dosya "C:\Users\bhaka\Desktop\pantolon-jean-uretim-case.xlsx"`
Expected:
```
Erkek 5 Cep Denim Jean (regular fit)  (JN-2026-001)
  70 operasyon, 1368 sn = 22.80 dk
  KESİM 28 sn · DİKİM 1241 sn · UKP 99 sn

KURU ÇALIŞMA — hiçbir şey yazılmadı.
```

Bölüm dağılımı bu üçlüyü vermiyorsa Task 5'in kuralları veritabanına doğru yazılmamıştır.

- [x] **Step 3: Uygula**

Run: `node scripts/import_model_bulten.mjs --dosya "C:\Users\bhaka\Desktop\pantolon-jean-uretim-case.xlsx" --klasman PANTOLON --uygula`
Expected: `YAZILDI: bülten #1 — Erkek 5 Cep Denim Jean (regular fit), 70 operasyon`

- [x] **Step 4: Commit**

```bash
git add scripts/import_model_bulten.mjs
git commit -m "feat(model): bulten import script'i

Kuru calisma varsayilan; bolum dagilimini ve son kurala (99) dusen
satirlari asama/tip kirilimiyla raporluyor — tanimayan operasyon
sessizce DIKIM sayilmasin, kullanici gorup kural eklesin diye.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FAZ 3 — Fiyatlama

## Task 9: Fiyat çekirdeği

**Files:**
- Create: `lib/pes/model-fiyat.ts`
- Test: `lib/pes/model-fiyat.test.ts`

Excel `MODEL_HESAP` ile birebir. Fixture değerleri spec §9'dan: Netclass, klasik gömlek, MTM 150/1380/300 sn, bölüm dk maliyeti 3,322142950541009 TL, bölge 6 → 3D 5,05, CMT 377, günlük adet 1.200, dikim kapasitesi 32.400 dk/gün, nominal 22 gün.

- [x] **Step 1: Başarısız testi yaz**

`lib/pes/model-fiyat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { gercekDakika, bolumMaliyeti, modelFiyati } from './model-fiyat'
import type { FiyatGirdisi } from './model-fiyat'
import { VARSAYILAN_PARAM } from './ekonomi-tipler'

/* Excel MODEL_HESAP satır 4 — Netclass, "ÖRNEK — Klasik gömlek, uzun kol".
   Değerler Excel'in önbelleğinden okundu ve formüller elle doğrulandı. */
const GIRDI: FiyatGirdisi = {
  bolumSn: { KESIM: 150, DIKIM: 1380, UKP: 300 },
  bolumDkMaliyet: {
    KESIM: 3.322142950541009,
    DIKIM: 3.322142950541009,
    UKP: 3.322142950541009,
  },
  param: VARSAYILAN_PARAM,
  cmtFiyat: 377,
  gunlukAdet: 1200,
  dikimKapasiteDk: 32400,
  dkMaliyet3D: 5.05,
}

describe('gercekDakika', () => {
  it('MTM saniyesini verimlilikle bölerek dakikaya çevirir', () => {
    expect(gercekDakika(150, 0.75)).toBeCloseTo(3.3333333333, 9)
    expect(gercekDakika(1380, 0.65)).toBeCloseTo(35.3846153846, 9)
    expect(gercekDakika(300, 0.75)).toBeCloseTo(6.6666666667, 9)
  })

  it('verimlilik sıfırsa null — bölme yok', () => {
    expect(gercekDakika(150, 0)).toBeNull()
  })

  it('süre sıfırsa sıfır, null değil', () => {
    expect(gercekDakika(0, 0.65)).toBe(0)
  })
})

describe('bolumMaliyeti', () => {
  it('gerçek dakika × bölüm dakika maliyeti', () => {
    expect(bolumMaliyeti(3.3333333333333335, 3.322142950541009)).toBeCloseTo(11.0738098351, 8)
  })

  it('dakika maliyeti yoksa null', () => {
    expect(bolumMaliyeti(3.33, null)).toBeNull()
  })
})

describe('modelFiyati — Excel MODEL_HESAP satır 4', () => {
  const f = modelFiyati(GIRDI)

  it('bölüm gerçek dakikaları', () => {
    expect(f.kesimDk).toBeCloseTo(3.3333333333, 9)
    expect(f.dikimDk).toBeCloseTo(35.3846153846, 9)
    expect(f.ukpDk).toBeCloseTo(6.6666666667, 9)
  })

  it('bölüm maliyetleri', () => {
    expect(f.kesimTl).toBeCloseTo(11.0738098351, 8)
    expect(f.dikimTl).toBeCloseTo(117.5527505576, 8)
    expect(f.ukpTl).toBeCloseTo(22.1476196703, 8)
  })

  it('toplam maliyet / adet', () => {
    expect(f.toplamMaliyet).toBeCloseTo(150.7741800630, 8)
  })

  it('adil fiyat hedef marjla', () => {
    expect(f.adilFiyat).toBeCloseTo(173.3903070725, 8)
  })

  it('kâr ve marj', () => {
    expect(f.karAdet).toBeCloseTo(226.2258199370, 8)
    expect(f.marj).toBeCloseTo(0.6000684879, 9)
  })

  it('fiyat sapması — CMT adil fiyatın kaç katı üstünde', () => {
    expect(f.fiyatSapmasi).toBeCloseTo(1.1742853240, 8)
  })

  it('kapasite payı 1 üstünde — bu adet bu banda sığmıyor', () => {
    expect(f.gunlukDikimIhtiyaci).toBeCloseTo(42461.5384615385, 6)
    expect(f.kapasitePayi).toBeCloseTo(1.3105413105, 8)
    expect(f.kapasiteAsimi).toBe(true)
  })

  it('3D referans maliyet VERİMLİLİK DÜZELTMESİZ hesaplanır', () => {
    // (150 + 1380 + 300) / 60 × 5,05 = 30,5 × 5,05
    expect(f.referans3D).toBeCloseTo(154.025, 6)
    expect(f.cmt3dSapma).toBeCloseTo(1.4476546015, 8)
  })

  it('aylık sonuç = parça kârı × günlük adet × nominal gün', () => {
    expect(f.aylikSonuc).toBeCloseTo(5972361.6463364, 4)
  })
})

describe('modelFiyati — eksik veri', () => {
  it('bölüm dakika maliyeti yoksa o bölüm null, toplam da null', () => {
    const f = modelFiyati({ ...GIRDI, bolumDkMaliyet: { KESIM: null, DIKIM: 3.32, UKP: 3.32 } })
    expect(f.kesimTl).toBeNull()
    expect(f.toplamMaliyet).toBeNull()
    expect(f.adilFiyat).toBeNull()
  })

  it('CMT yoksa marj ve sapma null ama maliyet hesaplanır', () => {
    const f = modelFiyati({ ...GIRDI, cmtFiyat: null })
    expect(f.toplamMaliyet).toBeCloseTo(150.7741800630, 8)
    expect(f.karAdet).toBeNull()
    expect(f.marj).toBeNull()
  })

  it('3D değeri yoksa referans null, gerisi etkilenmez', () => {
    const f = modelFiyati({ ...GIRDI, dkMaliyet3D: null })
    expect(f.referans3D).toBeNull()
    expect(f.cmt3dSapma).toBeNull()
    expect(f.toplamMaliyet).toBeCloseTo(150.7741800630, 8)
  })

  it('kapasite sıfırsa pay null, aşım false değil null', () => {
    const f = modelFiyati({ ...GIRDI, dikimKapasiteDk: 0 })
    expect(f.kapasitePayi).toBeNull()
    expect(f.kapasiteAsimi).toBeNull()
  })
})
```

- [x] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/model-fiyat.test.ts`
Expected: FAIL — `Failed to resolve import "./model-fiyat"`

- [x] **Step 3: Uygulamayı yaz**

`lib/pes/model-fiyat.ts`:

```ts
/**
 * Model fiyatlama — Excel MODEL_HESAP ile birebir.
 *
 * Girdi ikiye dayanır:
 *   - Bültenin bölüm süreleri (teorik MTM, saniye)
 *   - E0'ın ATÖLYEYE ÖZEL bölüm dakika maliyetleri (hesapla() çıktısı)
 *
 * Bölgesel 3D değeri ayrı bir referanstır, maliyetin kendisi değil.
 *
 * KURAL: hesaplanamayan her alan null döner, 0 değil (E0'ın kuralı).
 */
import { bol } from './ekonomi-hesap'
import type { EkonomiParam } from './ekonomi-tipler'
import type { Bolum } from './bulten-bolum'

export type FiyatGirdisi = {
  /** Bültenin bölüm başına toplam süresi, saniye. */
  bolumSn: Record<Bolum, number>
  /** E0'dan, bu atölyenin bu dönemdeki bölüm dakika maliyetleri. */
  bolumDkMaliyet: Record<Bolum, number | null>
  param: EkonomiParam
  cmtFiyat: number | null
  gunlukAdet: number | null
  /** Atölyenin günlük dikim kapasitesi, dakika (dikim kişi × saat × 60). */
  dikimKapasiteDk: number | null
  /** Bölgesel 3D dakika maliyeti; yoksa referans hesaplanmaz. */
  dkMaliyet3D: number | null
}

export type FiyatSonucu = {
  kesimDk: number | null
  dikimDk: number | null
  ukpDk: number | null
  kesimTl: number | null
  dikimTl: number | null
  ukpTl: number | null
  toplamMaliyet: number | null
  adilFiyat: number | null
  karAdet: number | null
  marj: number | null
  fiyatSapmasi: number | null
  gunlukDikimIhtiyaci: number | null
  kapasitePayi: number | null
  kapasiteAsimi: boolean | null
  aylikSonuc: number | null
  referans3D: number | null
  cmt3dSapma: number | null
}

/**
 * MTM saniyesi → gerçek bant dakikası.
 * Kimse gün boyu standart hızda dikmez; verimlilik bunu düzeltir.
 * FORMULLER!E38: verimlilik = (üretilen × SAM) ÷ (operatör × çalışılan dk).
 */
export function gercekDakika(sn: number, verimlilik: number): number | null {
  if (verimlilik === 0) return null
  return sn / 60 / verimlilik
}

/** Gerçek dakika × bölümün dakika maliyeti. */
export function bolumMaliyeti(dk: number | null, dkMaliyet: number | null): number | null {
  if (dk === null || dkMaliyet === null) return null
  return dk * dkMaliyet
}

export function modelFiyati(g: FiyatGirdisi): FiyatSonucu {
  const kesimDk = gercekDakika(g.bolumSn.KESIM, g.param.eff_cutting)
  const dikimDk = gercekDakika(g.bolumSn.DIKIM, g.param.eff_sewing)
  const ukpDk = gercekDakika(g.bolumSn.UKP, g.param.eff_ukp)

  const kesimTl = bolumMaliyeti(kesimDk, g.bolumDkMaliyet.KESIM)
  const dikimTl = bolumMaliyeti(dikimDk, g.bolumDkMaliyet.DIKIM)
  const ukpTl = bolumMaliyeti(ukpDk, g.bolumDkMaliyet.UKP)

  // Üçünden biri hesaplanamıyorsa toplam da hesaplanamaz: eksik bir bölümü
  // 0 saymak maliyeti olduğundan düşük gösterir ve fiyat yanlış verilir.
  const toplamMaliyet =
    kesimTl === null || dikimTl === null || ukpTl === null ? null : kesimTl + dikimTl + ukpTl

  const adilFiyat = toplamMaliyet === null ? null : toplamMaliyet * (1 + g.param.target_margin)
  const karAdet =
    toplamMaliyet === null || g.cmtFiyat === null ? null : g.cmtFiyat - toplamMaliyet
  const marj = bol(karAdet, g.cmtFiyat)
  const sapmaOrani = bol(g.cmtFiyat, adilFiyat)
  const fiyatSapmasi = sapmaOrani === null ? null : sapmaOrani - 1

  const gunlukDikimIhtiyaci =
    dikimDk === null || g.gunlukAdet === null ? null : g.gunlukAdet * dikimDk
  const kapasitePayi = bol(gunlukDikimIhtiyaci, g.dikimKapasiteDk)
  const kapasiteAsimi = kapasitePayi === null ? null : kapasitePayi > 1

  const aylikSonuc =
    karAdet === null || g.gunlukAdet === null
      ? null
      : karAdet * g.gunlukAdet * g.param.nominal_days

  /* 3D referans VERİMLİLİK DÜZELTMESİZ: FORMULLER!E51'e göre 3D değeri
     verimlilik kaybını zaten içeriyor, standart dakikayla çarpılır.
     Verimlilikle ikinci kez düzeltmek çifte sayım olur. */
  const toplamStandartDk = (g.bolumSn.KESIM + g.bolumSn.DIKIM + g.bolumSn.UKP) / 60
  const referans3D = g.dkMaliyet3D === null ? null : toplamStandartDk * g.dkMaliyet3D
  const ref3dOran = bol(g.cmtFiyat, referans3D)
  const cmt3dSapma = ref3dOran === null ? null : ref3dOran - 1

  return {
    kesimDk, dikimDk, ukpDk,
    kesimTl, dikimTl, ukpTl,
    toplamMaliyet, adilFiyat, karAdet, marj, fiyatSapmasi,
    gunlukDikimIhtiyaci, kapasitePayi, kapasiteAsimi, aylikSonuc,
    referans3D, cmt3dSapma,
  }
}

export type Hukum = 'YESIL' | 'SARI' | 'KIRMIZI' | 'HESAPLANAMADI'

/**
 * MODEL_HESAP!Z karşılığı: marja göre hüküm.
 * Kapasite aşımı ayrı bir bayrak — fiyat kararını değil, adet kararını
 * ilgilendirir; ikisini tek metne gömmek hangisinin sorun olduğunu gizler.
 */
export function hukum(f: FiyatSonucu, hedefMarj: number): Hukum {
  if (f.marj === null) return 'HESAPLANAMADI'
  if (f.marj >= hedefMarj) return 'YESIL'
  if (f.marj >= 0) return 'SARI'
  return 'KIRMIZI'
}
```

- [x] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/model-fiyat.test.ts`
Expected: PASS — 18 test

Bir gösterge tutmuyorsa önce Excel'in mi kodun mu doğru olduğuna karar ver: `FORMULLER` sayfasındaki sözlü tanımı oku ve elle hesapla. 3D referansta verimlilik kullanılmadığına dikkat.

- [x] **Step 5: Commit**

```bash
git add lib/pes/model-fiyat.ts lib/pes/model-fiyat.test.ts
git commit -m "feat(model): fiyat cekirdegi — Excel MODEL_HESAP'a karsi dogrulandi

Bultenin bolum sureleri x E0'in ATOLYEYE OZEL dakika maliyetleri.
Excel satir 4 fixture'i: toplam maliyet 150,7742, adil fiyat 173,3903,
kapasite payi 1,3105, 3D referans 154,025.

Uc bolumden biri hesaplanamiyorsa toplam da null — eksik bolumu 0
saymak maliyeti dusuk gosterir ve fiyat yanlis verilir.

3D referans verimlilik duzeltmesiz: FORMULLER!E51'e gore 3D degeri
verimlilik kaybini zaten iceriyor, ikinci kez duzeltmek cifte sayim.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Bülten listesi ve detayı

**Files:**
- Create: `app/pes/model/page.tsx`
- Create: `app/pes/model/[id]/page.tsx`
- Create: `app/pes/model/[id]/BolumEz.tsx`
- Create: `app/api/pes/model/[id]/bolum/route.ts`

- [x] **Step 1: Bölüm ezme ucunu yaz**

`app/api/pes/model/[id]/bolum/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Bir operasyonun bölümünü elle ezer. bolum_kaynak='elle' olur ve kural
 * yeniden uygulandığında KORUNUR — kullanıcının kararı kuralı yener.
 */
export const PATCH = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const opId = Number(b.operasyon_id)
  const bolum = String(b.bolum ?? '')
  if (!Number.isInteger(opId) || !['KESIM', 'DIKIM', 'UKP'].includes(bolum)) {
    return NextResponse.json({ error: 'operasyon_id ve bolum (KESIM|DIKIM|UKP) zorunlu' }, { status: 400 })
  }
  const [row] = await sql`
    UPDATE model_bulten_operasyon
       SET bolum = ${bolum}, bolum_kaynak = 'elle'
     WHERE id = ${opId}
    RETURNING id, bolum, bolum_kaynak`
  if (!row) return NextResponse.json({ error: 'Operasyon bulunamadı' }, { status: 404 })
  return NextResponse.json({ operasyon: row })
})
```

- [x] **Step 2: Liste sayfasını yaz**

`app/pes/model/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'

/**
 * /pes/model — teorik bülten listesi.
 * Bülten atölyeden bağımsızdır; fiyat atölye seçilince çıkar.
 */
export const dynamic = 'force-dynamic'

export default async function ModelListesi() {
  const data = await withServerTenant(async (sql) => sql`
    SELECT b.id, b.model_adi, b.plm_id, b.klasman_kodu, b.sezon,
           b.toplam_sn::float AS toplam_sn,
           count(DISTINCT o.id)::int AS operasyon_sayisi,
           coalesce(sum(o.cevrim_sn) FILTER (WHERE o.bolum='KESIM'),0)::float AS kesim_sn,
           coalesce(sum(o.cevrim_sn) FILTER (WHERE o.bolum='DIKIM'),0)::float AS dikim_sn,
           coalesce(sum(o.cevrim_sn) FILTER (WHERE o.bolum='UKP'),0)::float AS ukp_sn,
           count(DISTINCT f.workshop_id)::int AS fiyatlanan_atolye
    FROM model_bulten b
    LEFT JOIN model_bulten_operasyon o ON o.bulten_id = b.id
    LEFT JOIN model_fiyat f ON f.bulten_id = b.id
    GROUP BY b.id
    ORDER BY b.created_at DESC`)

  if (!data) redirect('/login')

  return (
    <main className="p-6 space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Model Fiyatlama</h1>
          <p className="text-sm text-slate-500">
            {data.length} bülten ·{' '}
            <Link href="/pes/model/kutuphane" className="underline">operasyon kütüphanesi →</Link>
          </p>
        </div>
      </header>

      {data.length === 0 ? (
        <p className="text-slate-500 border rounded p-6">
          Henüz bülten yok. Yüklemek için:{' '}
          <code>node scripts/import_model_bulten.mjs --dosya &quot;...xlsx&quot; --uygula</code>
        </p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="text-sm w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2">Model</th>
                <th className="text-left px-3 py-2">PLM</th>
                <th className="text-left px-3 py-2">Klasman</th>
                <th className="text-right px-3 py-2">Operasyon</th>
                <th className="text-right px-3 py-2">Toplam dk</th>
                <th className="text-left px-3 py-2">Bölüm dağılımı</th>
                <th className="text-right px-3 py-2">Fiyatlanan atölye</th>
              </tr>
            </thead>
            <tbody>
              {data.map((b: Record<string, unknown>) => {
                const top = Number(b.kesim_sn) + Number(b.dikim_sn) + Number(b.ukp_sn)
                const pay = (v: unknown) => top ? `${(Number(v) / top * 100).toFixed(0)}%` : '—'
                return (
                  <tr key={String(b.id)} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/pes/model/${b.id}`} className="underline font-medium">
                        {String(b.model_adi)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{String(b.plm_id ?? '—')}</td>
                    <td className="px-3 py-2 text-slate-500">{String(b.klasman_kodu ?? '—')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{String(b.operasyon_sayisi)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {(Number(b.toplam_sn) / 60).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                      K {pay(b.kesim_sn)} · D {pay(b.dikim_sn)} · U {pay(b.ukp_sn)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(b.fiyatlanan_atolye) > 0
                        ? <Link href={`/pes/model/${b.id}/fiyat`} className="underline">{String(b.fiyatlanan_atolye)}</Link>
                        : <Link href={`/pes/model/${b.id}/fiyat`} className="underline text-slate-400">fiyatla</Link>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
```

- [x] **Step 3: Bölüm ezme bileşenini yaz**

`app/pes/model/[id]/BolumEz.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const BOLUMLER = ['KESIM', 'DIKIM', 'UKP'] as const

export default function BolumEz({ bultenId, operasyonId, bolum, kaynak }: {
  bultenId: number
  operasyonId: number
  bolum: string
  kaynak: string
}) {
  const router = useRouter()
  const [bekliyor, setBekliyor] = useState(false)

  async function degistir(yeni: string) {
    if (yeni === bolum) return
    setBekliyor(true)
    await fetch(`/api/pes/model/${bultenId}/bolum`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operasyon_id: operasyonId, bolum: yeni }),
    })
    setBekliyor(false)
    router.refresh()
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select value={bolum} disabled={bekliyor}
              onChange={e => degistir(e.target.value)}
              className="border rounded px-1 py-0.5 text-xs">
        {BOLUMLER.map(b => <option key={b} value={b}>{b}</option>)}
      </select>
      {kaynak === 'elle' && (
        <span className="text-xs text-amber-700" title="Kural değil, elle seçildi">elle</span>
      )}
    </span>
  )
}
```

- [x] **Step 4: Detay sayfasını yaz**

`app/pes/model/[id]/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import BolumEz from './BolumEz'

/**
 * /pes/model/[id] — bültenin satırları.
 * Her satırın bölümü elle ezilebilir; ezilen satır 'elle' işaretiyle
 * kalır ve kural yeniden uygulandığında korunur.
 */
export const dynamic = 'force-dynamic'

const BOLUM_RENK: Record<string, string> = {
  KESIM: 'bg-amber-100 text-amber-800',
  DIKIM: 'bg-blue-100 text-blue-800',
  UKP: 'bg-emerald-100 text-emerald-800',
}

export default async function BultenDetay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bultenId = Number(id)
  if (!Number.isInteger(bultenId)) notFound()

  const data = await withServerTenant(async (sql) => {
    const [bulten] = await sql`SELECT * FROM model_bulten WHERE id = ${bultenId}`
    if (!bulten) return { bulten: null, satirlar: [], toplam: null }
    const satirlar = await sql`
      SELECT id, sira_no, seviye1, seviye2, seviye3, cevrim_sn::float AS cevrim_sn,
             tip, makine_kodu, bolum, bolum_kaynak
      FROM model_bulten_operasyon WHERE bulten_id = ${bultenId} ORDER BY sira_no`
    const [toplam] = await sql`
      SELECT coalesce(sum(cevrim_sn) FILTER (WHERE bolum='KESIM'),0)::float AS kesim,
             coalesce(sum(cevrim_sn) FILTER (WHERE bolum='DIKIM'),0)::float AS dikim,
             coalesce(sum(cevrim_sn) FILTER (WHERE bolum='UKP'),0)::float AS ukp,
             count(*) FILTER (WHERE bolum_kaynak='elle')::int AS elle
      FROM model_bulten_operasyon WHERE bulten_id = ${bultenId}`
    return { bulten, satirlar, toplam }
  })

  if (!data) redirect('/login')
  if (!data.bulten) notFound()
  const { bulten, satirlar, toplam } = data
  const top = Number(toplam?.kesim) + Number(toplam?.dikim) + Number(toplam?.ukp)

  return (
    <main className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">{String(bulten.model_adi)}</h1>
        <p className="text-sm text-slate-500">
          {String(bulten.plm_id ?? 'PLM yok')} · {satirlar.length} operasyon ·{' '}
          {(top / 60).toFixed(2)} dk ·{' '}
          <Link href={`/pes/model/${bultenId}/fiyat`} className="underline">fiyatla →</Link>
          {' · '}<Link href="/pes/model" className="underline">tüm modeller</Link>
        </p>
      </header>

      <div className="flex h-6 rounded overflow-hidden text-xs" role="img" aria-label="Bölüm dağılımı">
        {(['kesim', 'dikim', 'ukp'] as const).map((k, i) => {
          const v = Number(toplam?.[k])
          if (!v) return null
          const renk = ['#f59e0b', '#2563eb', '#10b981'][i]
          return (
            <div key={k} style={{ width: `${v / top * 100}%`, background: renk }}
                 className="text-white flex items-center justify-center"
                 title={`${k.toUpperCase()}: ${v} sn`}>
              {v / top > 0.08 ? `${k.toUpperCase()} ${(v / top * 100).toFixed(0)}%` : ''}
            </div>
          )
        })}
      </div>

      {Number(toplam?.elle) > 0 && (
        <p className="text-sm text-amber-700">
          {String(toplam?.elle)} satırın bölümü elle seçilmiş; kural yeniden uygulansa da korunur.
        </p>
      )}

      <div className="overflow-x-auto border rounded">
        <table className="text-sm w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-right px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Aşama</th>
              <th className="text-left px-3 py-2">Operasyon</th>
              <th className="text-right px-3 py-2">Çevrim (sn)</th>
              <th className="text-left px-3 py-2">Tip</th>
              <th className="text-left px-3 py-2">Makine</th>
              <th className="text-left px-3 py-2">Bölüm</th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s: Record<string, unknown>) => (
              <tr key={String(s.id)} className="border-t hover:bg-slate-50">
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{String(s.sira_no)}</td>
                <td className="px-3 py-1.5">{String(s.seviye1 ?? '—')}</td>
                <td className="px-3 py-1.5">
                  {String(s.seviye2 ?? '—')}
                  {s.seviye3 ? <span className="block text-xs text-slate-400">{String(s.seviye3)}</span> : null}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{Number(s.cevrim_sn).toFixed(0)}</td>
                <td className="px-3 py-1.5 text-slate-600">{String(s.tip ?? '—')}</td>
                <td className="px-3 py-1.5 text-slate-400 text-xs">{String(s.makine_kodu ?? '—')}</td>
                <td className="px-3 py-1.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded mr-2 ${BOLUM_RENK[String(s.bolum)] ?? ''}`}>
                    {String(s.bolum)}
                  </span>
                  <BolumEz bultenId={bultenId} operasyonId={Number(s.id)}
                           bolum={String(s.bolum)} kaynak={String(s.bolum_kaynak)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Bölüm, <code>(aşama, tip)</code> kurallarıyla atanır. Aşama tek başına yetmez:
        “Son İşlem” karışıktır — paça kıvırma ve punteriz dikim, ütüleme ve paket UKP.
        Yanlış gördüğün satırı burada ezebilirsin; ezilen satır kural yeniden
        uygulandığında korunur.
      </p>
    </main>
  )
}
```

- [x] **Step 5: Derle ve aç**

Run: `npm run build`
Expected: derleme başarılı; `/pes/model` ve `/pes/model/[id]` listede

Tarayıcıda `/pes/model` → bülten → bölüm şeridi K %2 · D %91 · U %7 görünür; bir satırın bölümünü değiştir, “elle” etiketi çıkar.

- [x] **Step 6: Commit**

```bash
git add app/pes/model/page.tsx "app/pes/model/[id]/page.tsx" "app/pes/model/[id]/BolumEz.tsx" "app/api/pes/model/[id]/bolum/route.ts"
git commit -m "feat(model): bulten listesi, detayi ve bolum ezme

Detayda bolum dagilimi seridi; her satirin bolumu elle ezilebilir ve
'elle' isaretiyle kalir — kullanicinin karari kurali yener.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Fiyat ekranı — atölye karşılaştırması

**Files:**
- Create: `app/pes/model/[id]/fiyat/page.tsx`
- Create: `app/api/pes/model/[id]/fiyat/route.ts`

E3'ün asıl ekranı. Bültenin bölüm süreleri × her atölyenin E0'dan gelen dakika maliyeti → yan yana fiyat.

- [x] **Step 1: Hesaplama ucunu yaz**

`app/api/pes/model/[id]/fiyat/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { EKONOMI_SORGUSU, dbSatiriCoz, paramCoz } from '@/lib/pes/ekonomi-sorgu'
import { hesapla } from '@/lib/pes/ekonomi-hesap'
import { modelFiyati } from '@/lib/pes/model-fiyat'

/**
 * POST — bülteni verilen dönemde, ekonomi verisi olan bütün atölyeler için
 * fiyatlar ve model_fiyat'a YAZAR.
 *
 * Fiyat saklanıyor çünkü bir karar anıdır; param_donem hangi varsayımla
 * hesaplandığını kaydeder.
 */
export const POST = withTenantRoute(async (req, { sql, tenantId }) => {
  const b = await req.json()
  const bultenId = Number(b.bulten_id)
  const donem = String(b.donem ?? '')
  const cmtFiyat = b.cmt_fiyat === null || b.cmt_fiyat === undefined ? null : Number(b.cmt_fiyat)
  const gunlukAdet = b.gunluk_adet === null || b.gunluk_adet === undefined ? null : Number(b.gunluk_adet)

  if (!Number.isInteger(bultenId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(donem)) {
    return NextResponse.json({ error: 'bulten_id ve donem (YYYY-MM) zorunlu' }, { status: 400 })
  }
  const [yil, ay] = donem.split('-').map(Number)

  const [bolum] = await sql`
    SELECT coalesce(sum(cevrim_sn) FILTER (WHERE bolum='KESIM'),0)::float AS kesim,
           coalesce(sum(cevrim_sn) FILTER (WHERE bolum='DIKIM'),0)::float AS dikim,
           coalesce(sum(cevrim_sn) FILTER (WHERE bolum='UKP'),0)::float  AS ukp
    FROM model_bulten_operasyon WHERE bulten_id = ${bultenId}`
  if (!bolum || (bolum.kesim + bolum.dikim + bolum.ukp) === 0) {
    return NextResponse.json({ error: 'Bültende operasyon yok' }, { status: 400 })
  }

  const paramSatirlari = await sql`
    SELECT DISTINCT ON (param_key) param_key, param_value
    FROM economy_param WHERE donem <= ${donem} ORDER BY param_key, donem DESC`
  const param = paramCoz(paramSatirlari as Array<{ param_key: string; param_value: unknown }>)

  const [paramDonem] = await sql`
    SELECT max(donem) AS d FROM economy_param WHERE donem <= ${donem}`

  const ham = await sql.unsafe(EKONOMI_SORGUSU, [donem, yil, ay])
  const yazilan: unknown[] = []

  for (const r of ham) {
    if (r.veri_var !== true) continue
    const girdi = dbSatiriCoz(r as never, param)
    const rasyo = hesapla(girdi)

    const dikimKapasiteDk =
      girdi.ekonomi.sewing_staff === null || girdi.ekonomi.hours_per_day === null
        ? null
        : girdi.ekonomi.sewing_staff * girdi.ekonomi.hours_per_day * 60

    const f = modelFiyati({
      bolumSn: { KESIM: bolum.kesim, DIKIM: bolum.dikim, UKP: bolum.ukp },
      bolumDkMaliyet: {
        KESIM: rasyo.kesimDkMaliyet,
        DIKIM: rasyo.dikimDkMaliyet,
        UKP: rasyo.ukpDkMaliyet,
      },
      param,
      cmtFiyat,
      gunlukAdet,
      dikimKapasiteDk,
      dkMaliyet3D: girdi.dkMaliyet3D,
    })

    const [satir] = await sql`
      INSERT INTO model_fiyat (
        bulten_id, workshop_id, tenant_id, donem,
        kesim_dk, dikim_dk, ukp_dk, kesim_tl, dikim_tl, ukp_tl,
        toplam_maliyet, adil_fiyat, cmt_fiyat, kar_adet, marj,
        gunluk_adet, kapasite_payi, referans_3d, cmt_3d_sapma, param_donem)
      VALUES (
        ${bultenId}, ${r.workshop_id as number}, ${tenantId}, ${donem},
        ${f.kesimDk}, ${f.dikimDk}, ${f.ukpDk}, ${f.kesimTl}, ${f.dikimTl}, ${f.ukpTl},
        ${f.toplamMaliyet}, ${f.adilFiyat}, ${cmtFiyat}, ${f.karAdet}, ${f.marj},
        ${gunlukAdet}, ${f.kapasitePayi}, ${f.referans3D}, ${f.cmt3dSapma},
        ${(paramDonem?.d as string) ?? null})
      ON CONFLICT (bulten_id, workshop_id, donem) DO UPDATE SET
        kesim_dk = EXCLUDED.kesim_dk, dikim_dk = EXCLUDED.dikim_dk, ukp_dk = EXCLUDED.ukp_dk,
        kesim_tl = EXCLUDED.kesim_tl, dikim_tl = EXCLUDED.dikim_tl, ukp_tl = EXCLUDED.ukp_tl,
        toplam_maliyet = EXCLUDED.toplam_maliyet, adil_fiyat = EXCLUDED.adil_fiyat,
        cmt_fiyat = EXCLUDED.cmt_fiyat, kar_adet = EXCLUDED.kar_adet, marj = EXCLUDED.marj,
        gunluk_adet = EXCLUDED.gunluk_adet, kapasite_payi = EXCLUDED.kapasite_payi,
        referans_3d = EXCLUDED.referans_3d, cmt_3d_sapma = EXCLUDED.cmt_3d_sapma,
        param_donem = EXCLUDED.param_donem, hesaplandi_at = now()
      RETURNING workshop_id`
    yazilan.push(satir)
  }

  return NextResponse.json({ yazilan: yazilan.length, donem })
})
```

- [x] **Step 2: Fiyat sayfasını yaz**

`app/pes/model/[id]/fiyat/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import FiyatHesapla from './FiyatHesapla'

/**
 * /pes/model/[id]/fiyat — E3'ün asıl ekranı.
 * Bültenin bölüm süreleri × atölyenin E0'dan gelen dakika maliyeti.
 */
export const dynamic = 'force-dynamic'

const tl = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = new Intl.NumberFormat('tr-TR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const f = (v: unknown, fmt = tl) => v === null || v === undefined ? '—' : fmt.format(Number(v))

export default async function FiyatSayfasi({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ donem?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const bultenId = Number(id)
  if (!Number.isInteger(bultenId)) notFound()
  const donem = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.donem ?? '') ? (sp.donem as string) : '2026-01'

  const data = await withServerTenant(async (sql) => {
    const [bulten] = await sql`SELECT * FROM model_bulten WHERE id = ${bultenId}`
    if (!bulten) return null
    const [bolum] = await sql`
      SELECT coalesce(sum(cevrim_sn) FILTER (WHERE bolum='KESIM'),0)::float AS kesim,
             coalesce(sum(cevrim_sn) FILTER (WHERE bolum='DIKIM'),0)::float AS dikim,
             coalesce(sum(cevrim_sn) FILTER (WHERE bolum='UKP'),0)::float  AS ukp
      FROM model_bulten_operasyon WHERE bulten_id = ${bultenId}`
    const fiyatlar = await sql`
      SELECT mf.*, w.name AS atolye, w.bolge,
             mf.toplam_maliyet::float AS toplam_maliyet, mf.adil_fiyat::float AS adil_fiyat,
             mf.kar_adet::float AS kar_adet, mf.marj::float AS marj,
             mf.kapasite_payi::float AS kapasite_payi, mf.referans_3d::float AS referans_3d,
             mf.cmt_3d_sapma::float AS cmt_3d_sapma, mf.dikim_dk::float AS dikim_dk
      FROM model_fiyat mf JOIN workshop w ON w.id = mf.workshop_id
      WHERE mf.bulten_id = ${bultenId} AND mf.donem = ${donem}
      ORDER BY mf.toplam_maliyet NULLS LAST`
    const donemler = await sql`
      SELECT DISTINCT year::int AS yil, month::int AS ay FROM workshop_economy
      ORDER BY yil DESC, ay DESC LIMIT 12`
    return { bulten, bolum, fiyatlar, donemler }
  })

  if (!data) redirect('/login')
  const { bulten, bolum, fiyatlar, donemler } = data
  const hedefMarj = 0.15

  return (
    <main className="p-6 space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{String(bulten.model_adi)} — fiyat</h1>
          <p className="text-sm text-slate-500">
            {donem} · KESİM {Number(bolum?.kesim)} sn · DİKİM {Number(bolum?.dikim)} sn · UKP {Number(bolum?.ukp)} sn ·{' '}
            <Link href={`/pes/model/${bultenId}`} className="underline">bültene dön</Link>
          </p>
        </div>
        <nav className="flex gap-1 text-sm">
          {donemler.map((d: Record<string, unknown>) => {
            const s = `${d.yil}-${String(d.ay).padStart(2, '0')}`
            return (
              <Link key={s} href={`/pes/model/${bultenId}/fiyat?donem=${s}`}
                    className={`px-2 py-1 rounded ${s === donem ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
                {s}
              </Link>
            )
          })}
        </nav>
      </header>

      <FiyatHesapla bultenId={bultenId} donem={donem}
                    varsayilanAdet={bulten.siparis_adedi ? Math.round(Number(bulten.siparis_adedi) / 22) : null} />

      {fiyatlar.length === 0 ? (
        <p className="text-slate-500 border rounded p-6">
          Bu dönem için henüz fiyat hesaplanmamış. Yukarıdan CMT ve günlük adet girip hesapla.
        </p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="text-sm w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2">Atölye</th>
                <th className="text-right px-3 py-2">Dikim dk/adet</th>
                <th className="text-right px-3 py-2">Toplam maliyet</th>
                <th className="text-right px-3 py-2">Adil fiyat</th>
                <th className="text-right px-3 py-2">CMT</th>
                <th className="text-right px-3 py-2">Kâr/adet</th>
                <th className="text-right px-3 py-2">Marj</th>
                <th className="text-right px-3 py-2">Kapasite payı</th>
                <th className="text-right px-3 py-2">3D referans</th>
              </tr>
            </thead>
            <tbody>
              {fiyatlar.map((r: Record<string, unknown>) => {
                const marj = r.marj === null ? null : Number(r.marj)
                const renk = marj === null ? '' : marj >= hedefMarj ? 'text-emerald-700'
                  : marj >= 0 ? 'text-amber-700' : 'text-rose-700'
                const asim = r.kapasite_payi !== null && Number(r.kapasite_payi) > 1
                return (
                  <tr key={String(r.id)} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/pes/ekonomi/${r.workshop_id}?donem=${donem}`} className="underline">
                        {String(r.atolye)}
                      </Link>
                      <span className="text-xs text-slate-400"> · {String(r.bolge ?? '—')}. bölge</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{f(r.dikim_dk)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{f(r.toplam_maliyet)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f(r.adil_fiyat)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f(r.cmt_fiyat)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${renk}`}>{f(r.kar_adet)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${renk}`}>{f(r.marj, pct)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${asim ? 'text-rose-700' : ''}`}>
                      {f(r.kapasite_payi, pct)}
                      {asim && <span className="block text-xs">aşım</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {f(r.referans_3d)}
                      {r.cmt_3d_sapma !== null && (
                        <span className="block text-xs">{f(r.cmt_3d_sapma, pct)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Maliyet, bültenin <strong>teorik</strong> süresiyle ve her atölyenin <strong>kendi</strong>
        {' '}dakika maliyetiyle hesaplanır — bölgesel 3D değeriyle değil; 3D yalnız referans sütununda.
        Kapasite payı %100'ü geçiyorsa iş bu günlük adetle o banda sığmıyor demektir;
        bu bir fiyat sorunu değil adet sorunudur. “—” hesaplanamadı demektir, sıfır değil.
      </p>
    </main>
  )
}
```

`app/pes/model/[id]/fiyat/FiyatHesapla.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FiyatHesapla({ bultenId, donem, varsayilanAdet }: {
  bultenId: number; donem: string; varsayilanAdet: number | null
}) {
  const router = useRouter()
  const [cmt, setCmt] = useState('')
  const [adet, setAdet] = useState(varsayilanAdet ? String(varsayilanAdet) : '')
  const [durum, setDurum] = useState('hazir')

  async function hesapla(e: React.FormEvent) {
    e.preventDefault()
    setDurum('hesaplaniyor')
    const r = await fetch(`/api/pes/model/${bultenId}/fiyat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bulten_id: bultenId, donem,
        cmt_fiyat: cmt === '' ? null : Number(cmt),
        gunluk_adet: adet === '' ? null : Number(adet),
      }),
    })
    const j = await r.json()
    setDurum(r.ok ? `${j.yazilan} atölye için hesaplandı` : (j.error ?? 'Hesaplanamadı'))
    router.refresh()
  }

  return (
    <form onSubmit={hesapla} className="flex flex-wrap items-end gap-3 border rounded p-3 bg-slate-50">
      <label className="text-sm">
        <span className="block text-slate-600">CMT fiyat (TL/adet)</span>
        <input value={cmt} onChange={e => setCmt(e.target.value)} type="number" step="any"
               className="border rounded px-2 py-1 w-32 tabular-nums" />
      </label>
      <label className="text-sm">
        <span className="block text-slate-600">Günlük adet</span>
        <input value={adet} onChange={e => setAdet(e.target.value)} type="number"
               className="border rounded px-2 py-1 w-32 tabular-nums" />
      </label>
      <button disabled={durum === 'hesaplaniyor'}
              className="px-4 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
        {durum === 'hesaplaniyor' ? 'Hesaplanıyor…' : 'Hesapla'}
      </button>
      {durum !== 'hazir' && durum !== 'hesaplaniyor' && (
        <span className="text-sm text-slate-600">{durum}</span>
      )}
      <span className="text-xs text-slate-400 basis-full">
        CMT boş bırakılırsa maliyet ve adil fiyat yine hesaplanır; marj ve kâr boş kalır.
      </span>
    </form>
  )
}
```

- [x] **Step 3: Derle, hesapla ve doğrula**

Run: `npm run build`
Expected: derleme başarılı

Tarayıcıda `/pes/model/1/fiyat?donem=2026-01` → CMT 377, günlük adet 1200 → Hesapla.
Expected: 11 atölye için satır; her birinin toplam maliyeti kendi dakika maliyetine göre farklı; 3D referans sütunu bölgeye göre.

- [x] **Step 4: Commit**

```bash
git add "app/pes/model/[id]/fiyat" "app/api/pes/model/[id]/fiyat/route.ts"
git commit -m "feat(model): fiyat ekrani — atolye karsilastirmasi

Bultenin bolum sureleri x her atolyenin E0'dan gelen dakika maliyeti.
Fiyat model_fiyat'a yazilir ve param_donem ile hangi varsayimla
hesaplandigi kaydedilir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FAZ 4 — Gerçek süre

## Task 12: Üretimden süre türetme

**Files:**
- Create: `lib/pes/gercek-sure.ts`
- Test: `lib/pes/gercek-sure.test.ts`

- [x] **Step 1: Başarısız testi yaz**

`lib/pes/gercek-sure.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { gunlukDakikaAdet, sureTuret } from './gercek-sure'
import type { UretimGunu } from './gercek-sure'

/* 40 dikimci × 9 saat × 60 = 21.600 dk/gün */
const KADRO = { sewingStaff: 40, hoursPerDay: 9 }

const GUNLER: UretimGunu[] = [
  { tarih: '2026-01-05', workOrderId: 1, adet: 600, bantIsEmriSayisi: 1 },
  { tarih: '2026-01-06', workOrderId: 1, adet: 720, bantIsEmriSayisi: 1 },
  { tarih: '2026-01-07', workOrderId: 1, adet: 500, bantIsEmriSayisi: 2 },  // karışık
  { tarih: '2026-01-08', workOrderId: 1, adet: 800, bantIsEmriSayisi: 1 },
]

describe('gunlukDakikaAdet', () => {
  it('kadro dakikasını adede böler', () => {
    expect(gunlukDakikaAdet(600, KADRO)).toBeCloseTo(36, 10)   // 21600 / 600
  })

  it('adet sıfırsa null', () => {
    expect(gunlukDakikaAdet(0, KADRO)).toBeNull()
  })

  it('dikim kişi yoksa null', () => {
    expect(gunlukDakikaAdet(600, { sewingStaff: null, hoursPerDay: 9 })).toBeNull()
  })
})

describe('sureTuret', () => {
  const s = sureTuret(GUNLER, KADRO)

  it('karışık günü hesaba katmaz', () => {
    expect(s.gunSayisi).toBe(3)
    expect(s.atlananGun).toBe(1)
  })

  it('ortalama dakika/adet yalnız tek iş emirli günlerden', () => {
    // 21600/600=36, 21600/720=30, 21600/800=27 → ortalama 31
    expect(s.dkAdet).toBeCloseTo(31, 10)
  })

  it('hiç uygun gün yoksa null döner ve atlananı sayar', () => {
    const hepsiKarisik = GUNLER.map(g => ({ ...g, bantIsEmriSayisi: 3 }))
    const r = sureTuret(hepsiKarisik, KADRO)
    expect(r.dkAdet).toBeNull()
    expect(r.gunSayisi).toBe(0)
    expect(r.atlananGun).toBe(4)
  })

  it('adet sıfır olan gün de atlanır', () => {
    const r = sureTuret([{ tarih: '2026-01-09', workOrderId: 1, adet: 0, bantIsEmriSayisi: 1 }], KADRO)
    expect(r.dkAdet).toBeNull()
    expect(r.atlananGun).toBe(1)
  })

  it('boş listede null, sıfır gün', () => {
    expect(sureTuret([], KADRO)).toEqual({ dkAdet: null, gunSayisi: 0, atlananGun: 0 })
  })
})
```

- [x] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/gercek-sure.test.ts`
Expected: FAIL — `Failed to resolve import "./gercek-sure"`

- [x] **Step 3: Uygulamayı yaz**

`lib/pes/gercek-sure.ts`:

```ts
/**
 * Üretimden gerçek süre türetme.
 *
 *   dk/adet = (dikim kişi × saat × 60) ÷ günlük adet
 *
 * Bu bir BANT ORTALAMASIDIR: duruş, model değişimi ve fire içindedir.
 * Teorik süreden farklı çıkması normaldir; farkın kendisi bilgidir.
 *
 * KARIŞIK GÜNLER HESABA GİRMEZ. Bir bant aynı gün birden fazla iş emri
 * işliyorsa o günün dakikası iş emirleri arasında paylaştırılamaz —
 * paylaştırma uydurmak olurdu ve uydurulmuş bir dakika fiyat
 * pazarlığında yanlış tarafa çeker. Atlanan gün sayılır ve gösterilir.
 */

export type Kadro = { sewingStaff: number | null; hoursPerDay: number | null }

export type UretimGunu = {
  tarih: string
  workOrderId: number
  adet: number
  /** O gün o bantta üretim kaydı olan farklı iş emri sayısı. */
  bantIsEmriSayisi: number
}

/** Tek günün dakika/adet değeri. Adet ya da kadro yoksa null. */
export function gunlukDakikaAdet(adet: number, kadro: Kadro): number | null {
  if (kadro.sewingStaff === null || kadro.hoursPerDay === null) return null
  if (adet <= 0) return null
  return (kadro.sewingStaff * kadro.hoursPerDay * 60) / adet
}

export type TuretmeSonucu = {
  dkAdet: number | null
  gunSayisi: number
  atlananGun: number
}

export function sureTuret(gunler: UretimGunu[], kadro: Kadro): TuretmeSonucu {
  const degerler: number[] = []
  let atlanan = 0
  for (const g of gunler) {
    if (g.bantIsEmriSayisi > 1) { atlanan++; continue }
    const d = gunlukDakikaAdet(g.adet, kadro)
    if (d === null) { atlanan++; continue }
    degerler.push(d)
  }
  if (degerler.length === 0) return { dkAdet: null, gunSayisi: 0, atlananGun: atlanan }
  const ort = degerler.reduce((a, b) => a + b, 0) / degerler.length
  return { dkAdet: ort, gunSayisi: degerler.length, atlananGun: atlanan }
}
```

- [x] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/gercek-sure.test.ts`
Expected: PASS — 9 test

- [x] **Step 5: Commit**

```bash
git add lib/pes/gercek-sure.ts lib/pes/gercek-sure.test.ts
git commit -m "feat(model): uretimden gercek sure turetme

dk/adet = (dikim kisi x saat x 60) / gunluk adet, is emrinin uretim
gunleri uzerinden. Bant ortalamasidir: durus, model degisimi ve fire
icinde; teorikten farki bilgidir.

Karisik gunler hesaba girmez — bir bant ayni gun birden fazla is emri
islerse paylastirilamaz ve uydurulmus bir dakika fiyat pazarliginda
yanlis tarafa ceker. Atlanan gun sayilip gosteriliyor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```


---

## Task 13: Gerçek süreyi yaz ve teorikle karşılaştır

**Files:**
- Create: `app/api/pes/model/[id]/gercek-sure/route.ts`
- Create: `app/pes/model/[id]/fiyat/SureKarsilastirma.tsx`
- Modify: `app/pes/model/[id]/fiyat/page.tsx`

Task 12 türetmeyi hesaplıyor ama hiçbir yere yazmıyor. Bu görev üç süreyi — **teorik / üretimden türetilen / atölye beyanı** — `model_gercek_sure`'ye yazar ve fiyat ekranının altında yan yana gösterir.

- [x] **Step 1: Ucu yaz**

`app/api/pes/model/[id]/gercek-sure/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { sureTuret, type UretimGunu } from '@/lib/pes/gercek-sure'

/**
 * POST { bulten_id, workshop_id, donem, kaynak, dk_adet? }
 *
 * kaynak='beyan' → dk_adet gövdeden gelir (atölye ne diyor).
 * kaynak='uretim' → iş emri günlük üretiminden türetilir; bültene bağlı
 *   iş emirleri okunur, karışık günler atlanır.
 */
export const POST = withTenantRoute(async (req, { sql, tenantId }) => {
  const b = await req.json()
  const bultenId = Number(b.bulten_id)
  const workshopId = Number(b.workshop_id)
  const donem = String(b.donem ?? '')
  const kaynak = String(b.kaynak ?? '')

  if (!Number.isInteger(bultenId) || !Number.isInteger(workshopId) ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(donem) || !['uretim', 'beyan'].includes(kaynak)) {
    return NextResponse.json(
      { error: 'bulten_id, workshop_id, donem (YYYY-MM) ve kaynak (uretim|beyan) zorunlu' },
      { status: 400 })
  }

  let dkAdet: number | null = null
  let gunSayisi = 0
  let atlananGun = 0

  if (kaynak === 'beyan') {
    dkAdet = b.dk_adet === null || b.dk_adet === undefined ? null : Number(b.dk_adet)
    if (dkAdet === null || !Number.isFinite(dkAdet) || dkAdet <= 0) {
      return NextResponse.json({ error: 'beyan için dk_adet pozitif olmalı' }, { status: 400 })
    }
  } else {
    const [yil, ay] = donem.split('-').map(Number)
    const [kadro] = await sql`
      SELECT sewing_staff, hours_per_day::float AS hours_per_day
      FROM workshop_economy
      WHERE workshop_id = ${workshopId} AND year = ${yil} AND month = ${ay}`
    if (!kadro) {
      return NextResponse.json(
        { error: 'Bu atölyenin bu dönemde ekonomi satırı yok; kadro bilinmeden türetilemez' },
        { status: 400 })
    }

    /* Bültene bağlı iş emirlerinin üretim günleri. bantIsEmriSayisi: o gün
       o bantta üretim kaydı olan FARKLI iş emri sayısı — 1'den büyükse gün
       paylaştırılamaz ve atlanır. */
    const gunler = await sql`
      WITH gun AS (
        SELECT g.tarih::text AS tarih, a.line_id, wo.id AS work_order_id, g.adet
        FROM work_order_gunluk_uretim g
        JOIN work_order_stage_atama a ON a.id = g.atama_id
        JOIN production_line pl ON pl.id = a.line_id
        JOIN work_order wo ON wo.id = a.work_order_id
        WHERE pl.workshop_id = ${workshopId}
          AND wo.model_bulten_id = ${bultenId}
          AND g.adet IS NOT NULL
          AND date_part('year', g.tarih) = ${yil}
          AND date_part('month', g.tarih) = ${ay}
      ),
      bant_gun AS (
        SELECT g2.tarih, a2.line_id, count(DISTINCT a2.work_order_id)::int AS is_emri
        FROM work_order_gunluk_uretim g2
        JOIN work_order_stage_atama a2 ON a2.id = g2.atama_id
        JOIN production_line pl2 ON pl2.id = a2.line_id
        WHERE pl2.workshop_id = ${workshopId} AND g2.adet IS NOT NULL
        GROUP BY g2.tarih, a2.line_id
      )
      SELECT gun.tarih, gun.work_order_id, gun.adet, bg.is_emri
      FROM gun JOIN bant_gun bg ON bg.tarih = gun.tarih AND bg.line_id = gun.line_id
      ORDER BY gun.tarih` as Array<{ tarih: string; work_order_id: number; adet: number; is_emri: number }>

    const girdi: UretimGunu[] = gunler.map(g => ({
      tarih: g.tarih, workOrderId: g.work_order_id,
      adet: Number(g.adet), bantIsEmriSayisi: Number(g.is_emri),
    }))
    const s = sureTuret(girdi, {
      sewingStaff: kadro.sewing_staff === null ? null : Number(kadro.sewing_staff),
      hoursPerDay: kadro.hours_per_day === null ? null : Number(kadro.hours_per_day),
    })
    dkAdet = s.dkAdet
    gunSayisi = s.gunSayisi
    atlananGun = s.atlananGun

    if (dkAdet === null) {
      return NextResponse.json({
        error: girdi.length === 0
          ? 'Bu bültene bağlı üretim kaydı yok. İş emrine bülten bağlanmadan türetilemez.'
          : `Uygun gün yok: ${atlananGun} gün atlandı (karışık bant ya da sıfır adet).`,
        atlananGun,
      }, { status: 400 })
    }
  }

  const [row] = await sql`
    INSERT INTO model_gercek_sure
      (bulten_id, workshop_id, tenant_id, donem, kaynak, dk_adet, gun_sayisi, atlanan_gun, not_metni)
    VALUES (${bultenId}, ${workshopId}, ${tenantId}, ${donem}, ${kaynak},
            ${dkAdet}, ${gunSayisi}, ${atlananGun}, ${b.not_metni ?? null})
    ON CONFLICT (bulten_id, workshop_id, donem, kaynak) DO UPDATE SET
      dk_adet = EXCLUDED.dk_adet, gun_sayisi = EXCLUDED.gun_sayisi,
      atlanan_gun = EXCLUDED.atlanan_gun, not_metni = EXCLUDED.not_metni, updated_at = now()
    RETURNING *`

  return NextResponse.json({ sure: row })
})
```

- [x] **Step 2: Karşılaştırma bileşenini yaz**

`app/pes/model/[id]/fiyat/SureKarsilastirma.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type SureSatiri = {
  workshopId: number
  atolye: string
  teorikDk: number | null
  uretimDk: number | null
  uretimGun: number | null
  uretimAtlanan: number | null
  beyanDk: number | null
}

const dk = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const f = (v: number | null) => v === null ? '—' : dk.format(v)

export default function SureKarsilastirma({ bultenId, donem, satirlar }: {
  bultenId: number; donem: string; satirlar: SureSatiri[]
}) {
  const router = useRouter()
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [bekleyen, setBekleyen] = useState<number | null>(null)

  async function cagir(workshopId: number, kaynak: 'uretim' | 'beyan', dkAdet?: number) {
    setBekleyen(workshopId); setMesaj(null)
    const r = await fetch(`/api/pes/model/${bultenId}/gercek-sure`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bulten_id: bultenId, workshop_id: workshopId, donem, kaynak, dk_adet: dkAdet }),
    })
    const j = await r.json()
    setBekleyen(null)
    setMesaj(r.ok ? null : (j.error ?? 'İşlem başarısız'))
    if (r.ok) router.refresh()
  }

  async function beyanSor(workshopId: number) {
    const girilen = window.prompt('Atölyenin beyan ettiği dakika/adet:')
    if (!girilen) return
    const n = Number(girilen.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) { setMesaj('Geçerli bir sayı gir'); return }
    await cagir(workshopId, 'beyan', n)
  }

  return (
    <section className="space-y-2">
      <h2 className="font-medium">Süre karşılaştırması</h2>
      {mesaj && <p className="text-sm text-rose-700">{mesaj}</p>}
      <div className="overflow-x-auto border rounded">
        <table className="text-sm w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2">Atölye</th>
              <th className="text-right px-3 py-2">Teorik dk/adet</th>
              <th className="text-right px-3 py-2">Üretimden</th>
              <th className="text-right px-3 py-2">Fark</th>
              <th className="text-right px-3 py-2">Beyan</th>
              <th className="text-left px-3 py-2">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map(s => {
              const fark = s.teorikDk !== null && s.uretimDk !== null ? s.uretimDk - s.teorikDk : null
              return (
                <tr key={s.workshopId} className="border-t">
                  <td className="px-3 py-2">{s.atolye}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f(s.teorikDk)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {f(s.uretimDk)}
                    {s.uretimGun !== null && (
                      <span className="block text-xs text-slate-400">
                        {s.uretimGun} gün{s.uretimAtlanan ? `, ${s.uretimAtlanan} atlandı` : ''}
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${
                    fark === null ? 'text-slate-300' : fark > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {fark === null ? '—' : `${fark > 0 ? '+' : ''}${dk.format(fark)}`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{f(s.beyanDk)}</td>
                  <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                    <button onClick={() => cagir(s.workshopId, 'uretim')}
                            disabled={bekleyen === s.workshopId}
                            className="text-xs underline disabled:opacity-50">üretimden türet</button>
                    <button onClick={() => beyanSor(s.workshopId)}
                            disabled={bekleyen === s.workshopId}
                            className="text-xs underline disabled:opacity-50">beyan gir</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        <strong>Fiyatlama teorik süreyi kullanır.</strong> Üretimden türetilen bant
        ortalamasıdır — duruş, model değişimi ve fire içindedir, teorikten yüksek
        çıkması normaldir. Bir bant aynı gün birden fazla iş emri işlediyse o gün
        paylaştırılamadığı için hesaba girmez ve “atlandı” diye sayılır.
      </p>
    </section>
  )
}
```

- [x] **Step 3: Fiyat sayfasına bağla**

`app/pes/model/[id]/fiyat/page.tsx` içinde, `withServerTenant` bloğunun sonuna (`return { bulten, bolum, fiyatlar, donemler }` satırından önce):

```tsx
    const sureler = await sql`
      SELECT mf.workshop_id, w.name AS atolye,
             mf.dikim_dk::float AS teorik_dk,
             u.dk_adet::float AS uretim_dk, u.gun_sayisi, u.atlanan_gun,
             b2.dk_adet::float AS beyan_dk
      FROM model_fiyat mf
      JOIN workshop w ON w.id = mf.workshop_id
      LEFT JOIN model_gercek_sure u
             ON u.bulten_id = mf.bulten_id AND u.workshop_id = mf.workshop_id
            AND u.donem = mf.donem AND u.kaynak = 'uretim'
      LEFT JOIN model_gercek_sure b2
             ON b2.bulten_id = mf.bulten_id AND b2.workshop_id = mf.workshop_id
            AND b2.donem = mf.donem AND b2.kaynak = 'beyan'
      WHERE mf.bulten_id = ${bultenId} AND mf.donem = ${donem}
      ORDER BY w.name`
```

`return` satırı `sureler` de döndürecek şekilde genişletilir, bileşen import edilir ve tablonun altına konur:

```tsx
import SureKarsilastirma, { type SureSatiri } from './SureKarsilastirma'
// ...
      {fiyatlar.length > 0 && (
        <SureKarsilastirma
          bultenId={bultenId}
          donem={donem}
          satirlar={(sureler as Array<Record<string, unknown>>).map(s => ({
            workshopId: Number(s.workshop_id),
            atolye: String(s.atolye),
            teorikDk: s.teorik_dk === null ? null : Number(s.teorik_dk),
            uretimDk: s.uretim_dk === null ? null : Number(s.uretim_dk),
            uretimGun: s.gun_sayisi === null ? null : Number(s.gun_sayisi),
            uretimAtlanan: s.atlanan_gun === null ? null : Number(s.atlanan_gun),
            beyanDk: s.beyan_dk === null ? null : Number(s.beyan_dk),
          })) satisfies SureSatiri[]}
        />
      )}
```

- [x] **Step 4: Derle ve dene**

Run: `npm run build`
Expected: derleme başarılı

Tarayıcıda `/pes/model/1/fiyat?donem=2026-01` → fiyat tablosunun altında süre karşılaştırması.
"üretimden türet" → bültene bağlı iş emri yoksa açık hata: *"Bu bültene bağlı üretim kaydı yok. İş emrine bülten bağlanmadan türetilemez."* Bu **beklenen** davranış; `work_order.model_bulten_id` henüz doldurulmadı.
"beyan gir" → bir sayı gir, satırda görünür.

- [x] **Step 5: Commit**

```bash
git add "app/api/pes/model/[id]/gercek-sure/route.ts" "app/pes/model/[id]/fiyat/SureKarsilastirma.tsx" "app/pes/model/[id]/fiyat/page.tsx"
git commit -m "feat(model): gercek sureyi yaz ve teorikle karsilastir

Uc sure yan yana: teorik (fiyatlama bunu kullanir), uretimden turetilen
ve atolye beyani. model_gercek_sure'ye yaziliyor.

Turetme bultene bagli is emirlerinin uretim gunlerinden; ayni gun
birden fazla is emri isleyen bant gunu paylastirilamadigi icin atlanir
ve kac gun atlandigi ekranda yazar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 14: Navigasyon ve kapanış doğrulaması

**Files:**
- Modify: `components/pes/PesDevSidebar.tsx`

- [x] **Step 1: Sidebar'a ekle**

`components/pes/PesDevSidebar.tsx` — "Klasman Kıyası" satırının altına, aynı grup içine:

```tsx
      { label: 'Model Fiyatlama', href: '/pes/model',          icon: Ruler },
```

`lucide-react` import listesine `Ruler` eklenir. Kütüphane ve fiyat ekranları menüde ayrı satır almaz; `/pes/model` başlığından bağlantılılar.

- [x] **Step 2: Tüm testleri çalıştır**

Run: `npm test`
Expected: PASS — hepsi; yeni dosyalar dahil

`malzeme-uyari` ya da `yerlestir-kaydet` kırılırsa **ikinci kez çalıştır**: ikisi gerçek uzak veritabanına bağlanıyor ve paralel yükte 30 sn zaman aşımını ara sıra aşıyor (`vitest.config.ts` bunu açıklıyor). İki turda da kırılıyorsa gerçek hatadır.

- [x] **Step 3: Derle**

Run: `npm run build`
Expected: derleme başarılı; `/pes/model`, `/pes/model/[id]`, `/pes/model/[id]/fiyat`, `/pes/model/kutuphane` listede

- [x] **Step 4: Uçtan uca doğrula**

Run: `node scripts/verify_public_api.mjs` → beş yeni tablo 401
Run: `node scripts/verify_workshop_isolation.mjs` → geçer
Run: `node scripts/verify_ekonomi.mjs --donem 2026-01` → 132 kontrol, 0 sapma (E0 bozulmamış)

Tarayıcıda sırayla:
- `/pes/model/kutuphane` → ürün tipi → grup → operasyon, güven rozetleri görünüyor
- `/pes/model` → bülten listesi, bölüm dağılımı K %2 · D %91 · U %7
- `/pes/model/1` → 70 satır, bir satırın bölümünü ez, "elle" etiketi çıkıyor
- `/pes/model/1/fiyat` → CMT 377, günlük adet 1200 → 11 atölye için fiyat
- `/pes/ekonomi` → **kırılmamış** (E3, E0'ın çekirdeğini okuyor ama değiştirmiyor)

- [x] **Step 5: Commit**

```bash
git add components/pes/PesDevSidebar.tsx
git commit -m "feat(model): sidebar'a Model Fiyatlama baglantisi

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Bitiş durumu

E3 tamamlandığında:

- **30.319 MTM ölçümü** aranabilir, güven seviyeleriyle — 2.039 `DUSUK` kayıt ayrıca filtrelenebiliyor
- **Model bülteni** içeri alınıyor, operasyonları KESİM/DİKİM/UKP'ye düzenlenebilir kurallarla ayrışıyor
- **"Bu model bu atölyede kaça dikilir"** cevaplanıyor — her atölyenin kendi dakika maliyetiyle, yanında bölgesel 3D referansı
- **Adil fiyat** pazarlık için hazır; kapasite payı işin banda sığıp sığmadığını söylüyor
- **Teorik ↔ gerçek** farkı ölçülebiliyor

**Sonraki tur (E5)** bunun üstüne biner: parti büyüklüğü (50.000 tek sipariş ↔ 10×5.000), model değişim süresi etkisi, öğrenme eğrisi ve fast-track teşvik yapısı — hepsi bu fiyat çekirdeğini çağırır.

**Açık kalan:** `work_order.model_bulten_id` eklendi ama geçmiş iş emirlerinde NULL. Üretimden türetme (Task 12'nin çekirdeği) ancak yeni iş emirleri bültene bağlandıkça gerçek veri üretir. Atölye beyanı (`model_gercek_sure.kaynak='beyan'`) girişi bu turda şema düzeyinde hazır, ekranı yok — ilk beyan geldiğinde eklenecek.

---

## Uygulama kaydı — 2026-09-24

14 görevin tamamı uygulandı. Doğrulama:

- `npm test` → **1198 geçti / 65 dosya**
- `npm run build` → temiz; `/pes/model`, `/pes/model/[id]`, `/pes/model/[id]/fiyat`, `/pes/model/kutuphane` ve üç API ucu
- `verify_ekonomi.mjs --donem 2026-01` → 132 kontrol, 0 sapma (E0 bozulmadı)
- `verify_public_api.mjs` → yeni beş tablo + `ref_operasyon_zamani` 401
- Kütüphane: 30.319 MTM ölçümü yüklü, güven dağılımı kaynak dokümanla birebir
- Bülten: 70 operasyon, 28/1241/99 sn — hesaplananla yazılan aynı
- Fiyat: 11 atölye, 109,77–271,32 TL aralığı

### Plan yazılırken öngörülmeyen, uygulamada çıkan üç şey

**1. `blankrows: false` altı sayfada ilk veri satırını yutuyordu.** Planın koyduğu
satır sayısı kontrolü yakaladı; `blankrows: true` ile düzeltildi. Kontrol
olmasaydı 6 kayıt sessizce eksik yüklenecekti.

**2. `verify_public_api.mjs` yeni tabloları hiç kontrol etmiyordu.** Listesi
statik; yeşil veriyordu ama 039'un tablolarına bakmamıştı. Eklendi.

**3. `workshop.bolge` hiç doldurulmamış.** Varsayılanı 1 ve 139 atölyenin 134'ü
o varsayılanda. Anketteki bölge `workshop`'a hiç taşınmıyordu — E0'ın eksiği.
Sonuç 3D referansta göründü: 9 pilotta 6,00 TL/dk yerine 4,76 olmalıydı, yani
referans %26 yüksekti. Canlı veri düzeltildi ve `import_ekonomi_anket.mjs`'e
yazma adımı eklendi.
