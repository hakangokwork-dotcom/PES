# Yıllık Talep Planı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merkez panelde yıllık talep tahmini girilip kalemlere bölünür, sistem yetenek uyumu + aylık boş kapasiteye göre atölye × ay tahsisi önerir, planlamacı düzenler; gerçek PO tahmin kalemine bağlanınca tahmini tüketir.

**Architecture:** Yeni migration 049 üç tablo + `work_order.tahmin_kalem_id` ekler. Hesap saf bir kütüphanede (`lib/pes/yillik-plan.ts`, birim testli); veritabanı okuması ayrı (`lib/pes/yillik-plan-veri.ts`). Ortak birim **dakika**: kalem yükü = adet × SAM dk, atölye kapasitesi = aktif bantların operatör toplamı × 540 × 0,85 × çalışma günü (pazar hariç; `workshop_kapasite_gun` override'ı oranla uygulanır). Ekran `/pes/yillik-plan`, API `app/api/pes/yillik-plan/*`.

**Tech Stack:** Next.js 16 App Router, postgres.js (`withTenantRoute` / `withServerTenant`, RLS), vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-06-yillik-talep-plani-design.md`

**Bilinen tuzaklar (proje notları):**
- postgres.js DATE kolonlarını sorguda `::text` ile al — yoksa `Date` nesnesi gelir ve `.slice` çöker.
- `DATABASE_URL` BYPASSRLS'dir; RLS'i `APP_DATABASE_URL` ile doğrula.
- `scripts/verify_public_api.mjs` tablo listesi STATİK — yeni tabloları ekle.
- Migration tek tek: `node scripts/_migrate_one.mjs <dosya>`.
- vitest tip denetimi yapmaz; `npx tsc --noEmit` ayrıca çalıştır.

## Dosya haritası

| Dosya | Sorumluluk |
|---|---|
| `supabase/migrations/049_yillik_talep_plani.sql` | 3 tablo, `work_order.tahmin_kalem_id`, RLS, grant |
| `scripts/verify_public_api.mjs` | yeni tabloları listeye ekle |
| `lib/pes/yillik-plan.ts` | saf hesap: kapasite, profil, aylık adet, öneri |
| `lib/pes/yillik-plan.test.ts` | saf hesap testleri |
| `lib/pes/yillik-plan-veri.ts` | DB okuma: kapasite, PO yükü, tahsis yükü, referans SAM, uyum, puan |
| `app/api/pes/yillik-plan/route.ts` | tahmin POST/PATCH |
| `app/api/pes/yillik-plan/kalem/route.ts` | kalem POST/PATCH/DELETE |
| `app/api/pes/yillik-plan/oneri/route.ts` | öneri üret ve yaz |
| `app/api/pes/yillik-plan/tahsis/route.ts` | hücre düzenle (elle) |
| `app/api/pes/yillik-plan/bagla/route.ts` | PO ↔ kalem bağla/çöz |
| `app/pes/yillik-plan/page.tsx` | sunucu sayfası, veri toplama |
| `app/pes/yillik-plan/YillikPlan.tsx` | istemci: liste, formlar, ızgara |
| `components/pes/PesDevSidebar.tsx` | menü öğesi |
| `app/pes/plan-tezgahi/page.tsx`, `Tezgah.tsx` | havuz kartında tahmin ipucu |

---

### Task 1: Migration 049

**Files:**
- Create: `supabase/migrations/049_yillik_talep_plani.sql`
- Modify: `scripts/verify_public_api.mjs` (liste sonuna, `'vsim_tesis', 'vsim_urun_grubu',` satırından sonra)

- [ ] **Step 1: Migration dosyasını yaz**

```sql
-- 049 — Yıllık talep planı (forecast → atölye tahsisi)
--
-- Tedarikçi departmanı yıl başında tahmin verir ("bu kumaşla 1M pantolon").
-- Tahmin tipe göre kalemlere bölünür; her kalem künye taşır, böylece
-- yetenek uyumu iş emriyle AYNI kuralla sorulur (yetenek-uyum.ts).
-- Tahsis atölye × ay adettir. Günlük takvime (line_schedule) YAZILMAZ —
-- yumuşak rezervasyon aylık ızgaranın kendisidir.
--
-- İç ekip aracı: 043'teki gibi atölye kullanıcısı tamamen dışarıda.

BEGIN;

CREATE TABLE IF NOT EXISTS talep_tahmini (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    yil         INTEGER NOT NULL CHECK (yil BETWEEN 2020 AND 2100),
    departman   TEXT    NOT NULL,
    ad          TEXT    NOT NULL,
    kumas       TEXT,
    aciklama    TEXT,
    durum       TEXT    NOT NULL DEFAULT 'Taslak',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tt_durum_chk CHECK (durum IN ('Taslak', 'Onayli'))
);
CREATE INDEX IF NOT EXISTS tt_tenant_yil_idx ON talep_tahmini (tenant_id, yil);

-- SAM kalemde SAKLANIR (sam_kaynak ile). Referanstan her okumada yeniden
-- hesaplamak her yük sorgusunu JS'e taşırdı; referans değişirse kalem
-- kaydedilirken yenilenir.
CREATE TABLE IF NOT EXISTS talep_tahmini_kalem (
    id                SERIAL PRIMARY KEY,
    tahmin_id         INTEGER NOT NULL REFERENCES talep_tahmini(id) ON DELETE CASCADE,
    tenant_id         UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    ad                TEXT    NOT NULL,
    ana_grup_kodu     TEXT,
    klasman_kodu      TEXT,
    kumas_turu_kodu   TEXT,
    kumas_grubu_kodu  TEXT,
    cinsiyet_yas_kodu TEXT,
    kalite_kodu       TEXT,
    kumasci           TEXT,
    urun_tipi_id      INTEGER REFERENCES ref_urun_tipi(id),
    sam_dk            NUMERIC(10,3),
    sam_kaynak        TEXT,
    adet              INTEGER NOT NULL CHECK (adet > 0),
    aylik_profil      NUMERIC(6,2)[] NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ttk_profil_chk CHECK (array_length(aylik_profil, 1) = 12),
    CONSTRAINT ttk_sam_chk CHECK (sam_dk IS NULL OR sam_dk > 0),
    CONSTRAINT ttk_sam_kaynak_chk CHECK (sam_kaynak IS NULL OR sam_kaynak IN ('referans', 'elle'))
);
CREATE INDEX IF NOT EXISTS ttk_tahmin_idx ON talep_tahmini_kalem (tahmin_id);

CREATE TABLE IF NOT EXISTS talep_tahsis (
    id           SERIAL PRIMARY KEY,
    kalem_id     INTEGER NOT NULL REFERENCES talep_tahmini_kalem(id) ON DELETE CASCADE,
    tenant_id    UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    workshop_id  INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    ay           INTEGER NOT NULL CHECK (ay BETWEEN 1 AND 12),
    adet         INTEGER NOT NULL CHECK (adet > 0),
    kaynak       TEXT    NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (kalem_id, workshop_id, ay),
    CONSTRAINT tts_kaynak_chk CHECK (kaynak IN ('oneri', 'elle'))
);
CREATE INDEX IF NOT EXISTS tts_workshop_idx ON talep_tahsis (workshop_id, ay);

ALTER TABLE work_order
    ADD COLUMN IF NOT EXISTS tahmin_kalem_id INTEGER
        REFERENCES talep_tahmini_kalem(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS wo_tahmin_kalem_idx ON work_order (tahmin_kalem_id);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['talep_tahmini', 'talep_tahmini_kalem', 'talep_tahsis'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND current_workshop_id() IS NULL)
             WITH CHECK (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND current_workshop_id() IS NULL)',
            t || '_tenant_isolation', t);
    END LOOP;
END $$;

REVOKE ALL ON talep_tahmini, talep_tahmini_kalem, talep_tahsis FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON talep_tahmini, talep_tahmini_kalem, talep_tahsis TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE talep_tahmini_id_seq, talep_tahmini_kalem_id_seq, talep_tahsis_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;
```

- [ ] **Step 2: verify listesine ekle**

`scripts/verify_public_api.mjs` içinde `'vsim_tesis', 'vsim_urun_grubu',` satırından sonra:

```js
  // 049 — yıllık talep planı (iç ekip aracı)
  'talep_tahmini', 'talep_tahmini_kalem', 'talep_tahsis',
```

- [ ] **Step 3: Uygula ve doğrula**

Run: `node scripts/_migrate_one.mjs 049_yillik_talep_plani.sql`
Expected: hatasız biter.

Run: `node scripts/verify_public_api.mjs`
Expected: yeni üç tablo dahil tüm tablolar "kapalı" raporlanır, çıkış 0.

- [ ] **Step 4: RLS'i uygulama rolüyle doğrula**

Geçici betik `C:\Users\bhaka\AppData\Local\Temp\claude\...\scratchpad\rls049.mjs` (scratchpad'e yaz, repoya değil):

```js
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('C:/Users/bhaka/Desktop/WORK/PES/.env.local', 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const yon = postgres(env.DATABASE_URL, { max: 1, prepare: false })
const app = postgres(env.APP_DATABASE_URL, { max: 1, prepare: false })
const [t] = await yon`SELECT id FROM tenant WHERE slug = 'default'`
// tenant bağlamı YOKSA 0 satır görmeli; bağlamla insert/select/rollback çalışmalı
const bos = await app`SELECT count(*)::int AS n FROM talep_tahmini`
console.log('baglamsiz', bos[0].n)
await app.begin(async tx => {
  await tx`SELECT set_config('app.current_tenant_id', ${t.id}, true)`
  const [r] = await tx`INSERT INTO talep_tahmini (tenant_id, yil, departman, ad) VALUES (${t.id}, 2027, 'test', 'rls') RETURNING id`
  const g = await tx`SELECT count(*)::int AS n FROM talep_tahmini WHERE id = ${r.id}`
  console.log('baglamli gorunen', g[0].n)
  throw new Error('rollback')
}).catch(e => console.log(e.message))
await yon.end(); await app.end()
```

Run: `node <scratchpad>/rls049.mjs`
Expected: `baglamsiz 0`, `baglamli gorunen 1`, `rollback`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/049_yillik_talep_plani.sql scripts/verify_public_api.mjs
git commit -m "feat(yillik-plan): 049 talep tahmini, kalem, tahsis tabloları"
```

---

### Task 2: Saf hesap — kapasite ve profil

**Files:**
- Create: `lib/pes/yillik-plan.ts`
- Test: `lib/pes/yillik-plan.test.ts`

- [ ] **Step 1: Failing test yaz**

```ts
import { describe, expect, test } from 'vitest'
import {
  ayGunleri, aylikKapasiteDk, esitProfil, profilGecerli, aylikAdet, yukYuzdesi,
} from './yillik-plan'

describe('ayGunleri', () => {
  test('şubat 2027 28 gün, ISO biçimli', () => {
    const g = ayGunleri(2027, 2)
    expect(g).toHaveLength(28)
    expect(g[0]).toBe('2027-02-01')
    expect(g[27]).toBe('2027-02-28')
  })
})

describe('aylikKapasiteDk', () => {
  test('pazarlar sıfır: ocak 2027 = 26 çalışma günü (5 pazar)', () => {
    const k = aylikKapasiteDk(2027, 100, {})
    expect(k).toHaveLength(12)
    expect(k[0]).toBe(2600)
  })
  test('override oranı o günü ölçekler', () => {
    // 2027-01-04 pazartesi; yarım gün
    const k = aylikKapasiteDk(2027, 100, { '2027-01-04': 0.5 })
    expect(k[0]).toBe(2550)
  })
})

describe('profil', () => {
  test('eşit profil 12 eleman, toplam 100', () => {
    const p = esitProfil()
    expect(p).toHaveLength(12)
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6)
    expect(profilGecerli(p)).toBe(true)
  })
  test('toplam 100 değilse ya da negatifse geçersiz', () => {
    expect(profilGecerli(Array(12).fill(8))).toBe(false)
    expect(profilGecerli([...Array(11).fill(10), -10])).toBe(false)
    expect(profilGecerli(Array(11).fill(100 / 11))).toBe(false)
  })
})

describe('aylikAdet', () => {
  test('toplam korunur (en büyük kalan)', () => {
    const a = aylikAdet(1000, esitProfil())
    expect(a.reduce((x, y) => x + y, 0)).toBe(1000)
    expect(Math.max(...a) - Math.min(...a)).toBeLessThanOrEqual(1)
  })
  test('sıfır aylar sıfır kalır', () => {
    const p = [50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    expect(aylikAdet(101, p)).toEqual([51, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })
})

describe('yukYuzdesi', () => {
  test('kapasite sıfırsa null', () => {
    expect(yukYuzdesi(10, 0)).toBeNull()
    expect(yukYuzdesi(50, 200)).toBe(25)
  })
})
```

- [ ] **Step 2: Fail olduğunu gör**

Run: `npx vitest run lib/pes/yillik-plan.test.ts`
Expected: FAIL — `Failed to resolve import "./yillik-plan"`.

- [ ] **Step 3: Uygula**

```ts
/**
 * Yıllık talep planı — saf hesap.
 *
 * ORTAK BİRİM DAKİKA. Atölyeler karışık ürün diker; 1.000 gömlek ile
 * 1.000 mont aynı yük değildir. Kalem yükü = adet × SAM dk, atölye
 * kapasitesi = operatör × 540 × verim × çalışma günü.
 *
 * Çalışma günü kuralı bant-doluluk.ts ile aynı: yalnız pazar kapalı.
 * workshop_kapasite_gun ADET cinsinden (günlük hedef toplamının yerine);
 * burada o günün oranı olarak uygulanır: override ÷ normal hedef.
 */
import { pazarMi } from './bant-doluluk'
import type { GenelUyum } from './yetenek-uyum'

/** auto-plan/route.ts ile aynı varsayım. */
export const VARDIYA_DK = 540
export const VERIM = 0.85

export type Tahsis = { workshopId: number; ay: number; adet: number }

const iki = (n: number) => String(n).padStart(2, '0')

export function ayGunleri(yil: number, ay: number): string[] {
  const son = new Date(Date.UTC(yil, ay, 0)).getUTCDate()
  return Array.from({ length: son }, (_, i) => `${yil}-${iki(ay)}-${iki(i + 1)}`)
}

/**
 * @param gunlukDk normal bir çalışma gününün dakikası
 * @param oranlar  tarih → o günün normale oranı (override ÷ normal hedef)
 */
export function aylikKapasiteDk(
  yil: number, gunlukDk: number, oranlar: Record<string, number>,
): number[] {
  return Array.from({ length: 12 }, (_, i) =>
    ayGunleri(yil, i + 1).reduce(
      (t, g) => t + (pazarMi(g) ? 0 : gunlukDk * (oranlar[g] ?? 1)), 0))
}

export function esitProfil(): number[] {
  return Array.from({ length: 12 }, () => 100 / 12)
}

export function profilGecerli(p: unknown): p is number[] {
  if (!Array.isArray(p) || p.length !== 12) return false
  if (!p.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)) return false
  return Math.abs(p.reduce((a, b) => a + b, 0) - 100) < 0.05
}

/** Profil yüzdelerini adede çevirir; toplam en büyük kalan yöntemiyle korunur. */
export function aylikAdet(adet: number, profil: number[]): number[] {
  const ham = profil.map((p) => (adet * p) / 100)
  const taban = ham.map(Math.floor)
  let kalan = adet - taban.reduce((a, b) => a + b, 0)
  const sira = ham.map((h, i) => ({ i, k: h - taban[i] })).sort((a, b) => b.k - a.k || a.i - b.i)
  for (const { i } of sira) {
    if (kalan <= 0) break
    taban[i] += 1
    kalan -= 1
  }
  return taban
}

export function yukYuzdesi(yukDk: number, kapasiteDk: number): number | null {
  return kapasiteDk > 0 ? (yukDk / kapasiteDk) * 100 : null
}

export type OneriAdayi = {
  workshopId: number
  puan: number
  uyum: GenelUyum
  /** 12 ay; BU KALEMİN tahsisleri HARİÇ boş dakika. */
  bosDk: number[]
}
```

- [ ] **Step 4: Testleri geçir**

Run: `npx vitest run lib/pes/yillik-plan.test.ts`
Expected: PASS (8 test).

- [ ] **Step 5: Commit**

```bash
git add lib/pes/yillik-plan.ts lib/pes/yillik-plan.test.ts
git commit -m "feat(yillik-plan): kapasite, profil ve aylık adet hesabı"
```

---

### Task 3: Saf hesap — öneri

**Files:**
- Modify: `lib/pes/yillik-plan.ts` (sona ekle)
- Test: `lib/pes/yillik-plan.test.ts` (sona ekle)

- [ ] **Step 1: Failing test yaz**

`import` satırına `oneriUret, type OneriAdayi` ekle ve sona:

```ts
const sifir = () => Array(12).fill(0)
const ay1 = (n: number) => { const a = sifir(); a[0] = n; return a }
const aday = (id: number, puan: number, bosOcak: number, uyum: OneriAdayi['uyum'] = 'uygun'): OneriAdayi =>
  ({ workshopId: id, puan, uyum, bosDk: ay1(bosOcak) })

describe('oneriUret', () => {
  test('yüksek puanlı atölye önce dolar, kalan sıradakine geçer', () => {
    const r = oneriUret({
      aylikAdet: ay1(150), samDk: 10,
      adaylar: [aday(1, 50, 1000), aday(2, 90, 1000)], elle: [],
    })
    expect(r.tahsisler).toEqual([
      { workshopId: 2, ay: 1, adet: 100 },
      { workshopId: 1, ay: 1, adet: 50 },
    ])
    expect(r.tahsisEdilemeyen[0]).toBe(0)
  })

  test('uygun olmayan atölye kullanılmaz; sığmayan tahsis edilemeyen olur', () => {
    const r = oneriUret({
      aylikAdet: ay1(300), samDk: 10,
      adaylar: [aday(1, 99, 99999, 'uyumsuz'), aday(2, 99, 99999, 'bilinmiyor'), aday(3, 10, 1000)],
      elle: [],
    })
    expect(r.tahsisler).toEqual([{ workshopId: 3, ay: 1, adet: 100 }])
    expect(r.tahsisEdilemeyen[0]).toBe(200)
  })

  test('elle tahsis ihtiyaçtan ve o atölyenin boşluğundan düşer', () => {
    const r = oneriUret({
      aylikAdet: ay1(150), samDk: 10,
      adaylar: [aday(1, 90, 1000), aday(2, 50, 1000)],
      elle: [{ workshopId: 1, ay: 1, adet: 80 }],
    })
    // ihtiyaç 70; atölye 1'de 1000-800=200 dk = 20 adet, kalan 50 atölye 2'ye
    expect(r.tahsisler).toEqual([
      { workshopId: 1, ay: 1, adet: 20 },
      { workshopId: 2, ay: 1, adet: 50 },
    ])
  })

  test('negatif boşluk (aşırı yük) sıfır sayılır', () => {
    const r = oneriUret({ aylikAdet: ay1(10), samDk: 1, adaylar: [aday(1, 1, -500)], elle: [] })
    expect(r.tahsisler).toEqual([])
    expect(r.tahsisEdilemeyen[0]).toBe(10)
  })

  test('SAM sıfır ya da negatifse hata', () => {
    expect(() => oneriUret({ aylikAdet: ay1(1), samDk: 0, adaylar: [], elle: [] })).toThrow('SAM')
  })
})
```

- [ ] **Step 2: Fail olduğunu gör**

Run: `npx vitest run lib/pes/yillik-plan.test.ts`
Expected: FAIL — `oneriUret is not a function` (ya da export yok).

- [ ] **Step 3: Uygula** (`lib/pes/yillik-plan.ts` sonuna)

```ts
/**
 * Açgözlü öneri: her ay için uygun atölyeler puan sırasıyla boş
 * dakikaları kadar doldurulur.
 *
 * Yalnız `uygun` atölye alınır. `bilinmiyor` (künye ya da yetenek kaydı
 * eksik) ENGEL DEĞİLDİR ama öneri onu seçmez — planlamacı elle girebilir.
 * Sığmayan adet zorla atanmaz, `tahsisEdilemeyen` olarak döner.
 * Elle girilmiş tahsisler korunur: önce ihtiyaçtan ve o atölyenin
 * boşluğundan düşülür, öneri yalnız kalanı dağıtır.
 */
export function oneriUret(g: {
  aylikAdet: number[]
  samDk: number
  adaylar: OneriAdayi[]
  elle: Tahsis[]
}): { tahsisler: Tahsis[]; tahsisEdilemeyen: number[] } {
  if (!(g.samDk > 0)) throw new Error('SAM sıfırdan büyük olmalı')
  const sirali = g.adaylar
    .filter((a) => a.uyum === 'uygun')
    .sort((a, b) => b.puan - a.puan || a.workshopId - b.workshopId)

  const tahsisler: Tahsis[] = []
  const tahsisEdilemeyen: number[] = []
  for (let m = 0; m < 12; m++) {
    const ay = m + 1
    const elleAy = g.elle.filter((e) => e.ay === ay)
    let kalan = Math.max(0, (g.aylikAdet[m] ?? 0) - elleAy.reduce((t, e) => t + e.adet, 0))
    for (const a of sirali) {
      if (kalan <= 0) break
      const elleDk = elleAy
        .filter((e) => e.workshopId === a.workshopId)
        .reduce((t, e) => t + e.adet * g.samDk, 0)
      const sigar = Math.floor(Math.max(0, (a.bosDk[m] ?? 0) - elleDk) / g.samDk)
      const al = Math.min(kalan, sigar)
      if (al > 0) {
        tahsisler.push({ workshopId: a.workshopId, ay, adet: al })
        kalan -= al
      }
    }
    tahsisEdilemeyen.push(kalan)
  }
  return { tahsisler, tahsisEdilemeyen }
}
```

- [ ] **Step 4: Testleri geçir**

Run: `npx vitest run lib/pes/yillik-plan.test.ts`
Expected: PASS (13 test).

- [ ] **Step 5: Commit**

```bash
git add lib/pes/yillik-plan.ts lib/pes/yillik-plan.test.ts
git commit -m "feat(yillik-plan): açgözlü atölye tahsis önerisi"
```

---

### Task 4: Veri katmanı

**Files:**
- Create: `lib/pes/yillik-plan-veri.ts`

DB'ye bağlı, ince; doğruluğu Task 6'daki uçtan uca kontrol ve Task 9'daki tarayıcı doğrulaması kanıtlar.

- [ ] **Step 1: Yaz**

```ts
/**
 * Yıllık talep planı — veritabanı okuması. Hesap yillik-plan.ts'te.
 *
 * Tüm fonksiyonlar TRANSACTION handle'ı ister (withTenantRoute /
 * withServerTenant içi); aksi halde RLS tenant bağlamı yok, 0 satır.
 */
import type postgres from 'postgres'
import { aylikKapasiteDk, VARDIYA_DK, VERIM } from './yillik-plan'
import { referansDikimSn, type Aday } from './referans-model'
import {
  boyutUyumlari, uyumOzeti, genelUyum, GENEL_ETIKET,
  type AtolyeYetenegi, type GenelUyum,
} from './yetenek-uyum'
import { adayAtolyeler } from './aday-atolye'
import type { Kunye } from './kunye'

type Sql = postgres.TransactionSql
const bosYil = () => Array<number>(12).fill(0)

export type AtolyeKapasite = { workshopId: number; kod: string; ad: string; kapasiteDk: number[] }

export async function atolyeKapasiteleri(sql: Sql, yil: number): Promise<AtolyeKapasite[]> {
  const atolyeler = await sql`
    SELECT w.id, w.code, w.name,
           COALESCE(SUM(pl.operator_count) FILTER (WHERE pl.is_active), 0)::int AS operator,
           COALESCE(SUM(pl.daily_target)   FILTER (WHERE pl.is_active), 0)::int AS hedef
      FROM workshop w
      LEFT JOIN production_line pl ON pl.workshop_id = w.id
     WHERE w.is_active
     GROUP BY w.id
     ORDER BY w.code
  ` as unknown as Array<{ id: number; code: string; name: string; operator: number; hedef: number }>

  const ozel = await sql`
    SELECT workshop_id, tarih::text AS tarih, gunluk_kapasite
      FROM workshop_kapasite_gun
     WHERE tarih >= make_date(${yil}::int, 1, 1)
       AND tarih <  make_date(${yil}::int + 1, 1, 1)
  ` as unknown as Array<{ workshop_id: number; tarih: string; gunluk_kapasite: number }>

  return atolyeler.map((a) => {
    const oranlar: Record<string, number> = {}
    for (const o of ozel.filter((x) => x.workshop_id === a.id)) {
      /* Override ADET; normal hedefe oranla dakikaya çevrilir. Hedef
         girilmemişse oran kurulamaz: sıfır override kapatır, diğeri yok sayılır. */
      oranlar[o.tarih] = a.hedef > 0 ? o.gunluk_kapasite / a.hedef : (o.gunluk_kapasite === 0 ? 0 : 1)
    }
    return {
      workshopId: a.id, kod: a.code, ad: a.name,
      kapasiteDk: aylikKapasiteDk(yil, a.operator * VARDIYA_DK * VERIM, oranlar),
    }
  })
}

/** Atanmış gerçek PO'ların aylık dakikası. Ay = bitiş, yoksa teslim. */
export async function poAylikYuk(sql: Sql, yil: number): Promise<{
  yuk: Map<number, number[]>; samsizPo: number
}> {
  const satirlar = await sql`
    SELECT workshop_id,
           extract(month FROM COALESCE(bitis_tarihi, teslim_tarihi))::int AS ay,
           COALESCE(SUM(siparis_miktari * sam_toplam_sn / 60.0), 0)::float AS dk,
           COUNT(*) FILTER (WHERE COALESCE(sam_toplam_sn, 0) = 0)::int AS samsiz
      FROM work_order
     WHERE workshop_id IS NOT NULL
       AND durum <> 'Iptal'
       AND extract(year FROM COALESCE(bitis_tarihi, teslim_tarihi)) = ${yil}
     GROUP BY 1, 2
  ` as unknown as Array<{ workshop_id: number; ay: number; dk: number; samsiz: number }>
  const yuk = new Map<number, number[]>()
  let samsizPo = 0
  for (const s of satirlar) {
    const a = yuk.get(s.workshop_id) ?? bosYil()
    a[s.ay - 1] += s.dk
    yuk.set(s.workshop_id, a)
    samsizPo += s.samsiz
  }
  return { yuk, samsizPo }
}

/**
 * Tahsislerin aylık dakikası. Kaleme bağlanmış PO'lar zaten poAylikYuk'ta
 * sayıldığı için kalemin tahsisi TÜKETİLEN oranında küçültülür — yoksa
 * aynı iş iki kez yük olurdu.
 */
export async function tahsisAylikYuk(
  sql: Sql, yil: number, haricKalemId: number | null,
): Promise<Map<number, number[]>> {
  const satirlar = await sql`
    WITH tuketim AS (
      SELECT tahmin_kalem_id AS kalem_id, SUM(siparis_miktari)::float AS adet
        FROM work_order
       WHERE tahmin_kalem_id IS NOT NULL AND durum <> 'Iptal'
       GROUP BY 1)
    SELECT t.workshop_id, t.ay,
           SUM(t.adet * k.sam_dk
               * GREATEST(0, 1 - COALESCE(u.adet, 0) / k.adet))::float AS dk
      FROM talep_tahsis t
      JOIN talep_tahmini_kalem k ON k.id = t.kalem_id
      JOIN talep_tahmini h ON h.id = k.tahmin_id
      LEFT JOIN tuketim u ON u.kalem_id = k.id
     WHERE h.yil = ${yil}
       AND k.sam_dk IS NOT NULL
       AND (${haricKalemId}::int IS NULL OR t.kalem_id <> ${haricKalemId}::int)
     GROUP BY 1, 2
  ` as unknown as Array<{ workshop_id: number; ay: number; dk: number }>
  const yuk = new Map<number, number[]>()
  for (const s of satirlar) {
    const a = yuk.get(s.workshop_id) ?? bosYil()
    a[s.ay - 1] += s.dk
    yuk.set(s.workshop_id, a)
  }
  return yuk
}

/** Ürün tipinin referans dikim süresi (dk); referans yoksa null. */
export async function referansSamDk(sql: Sql, urunTipiId: number): Promise<number | null> {
  const satirlar = await sql`
    SELECT bolge, ek_parca_ad, gorulme, sn_medyan::float AS sn_medyan
      FROM ref_parca_sure WHERE urun_tipi_id = ${urunTipiId}
  ` as unknown as Array<{ bolge: string; ek_parca_ad: string; gorulme: number; sn_medyan: number }>
  if (satirlar.length === 0) return null
  const adaylar: Aday[] = satirlar.map((s) => ({
    bolge: s.bolge, ekParca: s.ek_parca_ad, gorulme: s.gorulme, snMedyan: s.sn_medyan,
  }))
  const sn = referansDikimSn(adaylar)
  return sn > 0 ? sn / 60 : null
}

export type AtolyeUyumu = { uyum: GenelUyum; neden: string | null }

export async function atolyeUyumlari(
  sql: Sql, kunye: Kunye,
): Promise<Map<number, AtolyeUyumu>> {
  const yetenek = await sql`
    SELECT DISTINCT pl.workshop_id, lc.dimension_code AS boyut, lc.value_code AS deger
      FROM line_capability lc
      JOIN production_line pl ON pl.id = lc.line_id
  ` as unknown as Array<{ workshop_id: number; boyut: string; deger: string }>
  const izlenen = new Set((await sql`
    SELECT DISTINCT dimension_code FROM line_capability
  ` as unknown as Array<{ dimension_code: string }>).map((r) => r.dimension_code))

  const atolyeYet = new Map<number, AtolyeYetenegi[]>()
  for (const y of yetenek) {
    const l = atolyeYet.get(y.workshop_id) ?? []
    l.push({ boyut: y.boyut, deger: y.deger })
    atolyeYet.set(y.workshop_id, l)
  }
  const atolyeler = await sql`SELECT id FROM workshop WHERE is_active` as unknown as Array<{ id: number }>
  const sonuc = new Map<number, AtolyeUyumu>()
  for (const { id } of atolyeler) {
    const ozet = uyumOzeti(boyutUyumlari(kunye, atolyeYet.get(id) ?? [], izlenen))
    const uyum = genelUyum(ozet)
    sonuc.set(id, {
      uyum,
      neden: uyum === 'uyumsuz' ? `Uymayan: ${ozet.eksikBoyutlar.join(', ')}`
        : uyum === 'bilinmiyor' ? GENEL_ETIKET.bilinmiyor : null,
    })
  }
  return sonuc
}

/** adayAtolyeler puanı; yıl sonuna teslim varsayılır. */
export async function atolyePuanlari(
  sql: Sql, yil: number, kunye: Kunye, adet: number,
): Promise<Map<number, number>> {
  const bugunIso = new Date().toISOString().slice(0, 10)
  const yilBasi = `${yil}-01-01`
  const adaylar = await adayAtolyeler(sql, {
    adet,
    teslimTarihi: `${yil}-12-31`,
    bugun: bugunIso > yilBasi ? bugunIso : yilBasi,
    klasmanKodu: kunye.klasman_kodu ?? null,
    kumasTuruKodu: kunye.kumas_turu_kodu ?? null,
  })
  return new Map(adaylar.map((a) => [a.workshopId, a.puan]))
}
```

- [ ] **Step 2: Tip denetimi**

Run: `npx tsc --noEmit -p .`
Expected: `lib/pes/yillik-plan-veri.ts` için hata yok. (Depoda önceden var olan hatalar çıkarsa yalnız bu dosyaya ait olanlara bak: `npx tsc --noEmit -p . 2>&1 | grep yillik-plan`.)

- [ ] **Step 3: Commit**

```bash
git add lib/pes/yillik-plan-veri.ts
git commit -m "feat(yillik-plan): kapasite, yük, referans SAM ve uyum okuması"
```

---

### Task 5: API — tahmin ve kalem

**Files:**
- Create: `app/api/pes/yillik-plan/route.ts`
- Create: `app/api/pes/yillik-plan/kalem/route.ts`

- [ ] **Step 1: Tahmin route'u**

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/** Tahmin başlığı oluştur / güncelle / onayla. */

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const yil = Number(b.yil)
  const departman = String(b.departman ?? '').trim()
  const ad = String(b.ad ?? '').trim()
  if (!Number.isInteger(yil) || yil < 2020 || yil > 2100) {
    return NextResponse.json({ error: 'yil geçersiz' }, { status: 400 })
  }
  if (!departman || !ad) {
    return NextResponse.json({ error: 'departman ve ad zorunlu' }, { status: 400 })
  }
  const [row] = await sql`
    INSERT INTO talep_tahmini (tenant_id, yil, departman, ad, kumas, aciklama)
    VALUES (${tenant.tenantId}, ${yil}, ${departman.slice(0, 120)}, ${ad.slice(0, 120)},
            ${b.kumas ? String(b.kumas).slice(0, 120) : null},
            ${b.aciklama ? String(b.aciklama).slice(0, 500) : null})
    RETURNING id
  ` as unknown as Array<{ id: number }>
  return NextResponse.json({ id: row.id })
})

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const id = Number(b.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  const durum = b.durum === undefined ? null : String(b.durum)
  if (durum !== null && !['Taslak', 'Onayli'].includes(durum)) {
    return NextResponse.json({ error: "durum 'Taslak' ya da 'Onayli' olmalı" }, { status: 400 })
  }
  const metin = (v: unknown, n: number) => (v === undefined ? null : String(v).trim().slice(0, n))
  const [row] = await sql`
    UPDATE talep_tahmini SET
      departman  = coalesce(nullif(${metin(b.departman, 120)}::text, ''), departman),
      ad         = coalesce(nullif(${metin(b.ad, 120)}::text, ''), ad),
      kumas      = CASE WHEN ${b.kumas !== undefined} THEN ${metin(b.kumas, 120)} ELSE kumas END,
      durum      = coalesce(${durum}::text, durum),
      updated_at = now()
    WHERE id = ${id}
    RETURNING id
  ` as unknown as Array<{ id: number }>
  if (!row) return NextResponse.json({ error: 'Tahmin bulunamadı' }, { status: 404 })
  return NextResponse.json({ id: row.id })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  const bagli = await sql`
    SELECT count(*)::int AS n FROM work_order w
      JOIN talep_tahmini_kalem k ON k.id = w.tahmin_kalem_id
     WHERE k.tahmin_id = ${id}` as unknown as Array<{ n: number }>
  if (bagli[0].n > 0) {
    return NextResponse.json({ error: 'Bu tahmine bağlı sipariş var; önce bağları çözün' }, { status: 409 })
  }
  await sql`DELETE FROM talep_tahmini WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
```

- [ ] **Step 2: Kalem route'u**

```ts
import { NextResponse } from 'next/server'
import type postgres from 'postgres'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { kodlariDogrula, kunyeyiAyikla, KUNYE_BOYUTLARI, type KunyeKolonu } from '@/lib/pes/kunye'
import { esitProfil, profilGecerli } from '@/lib/pes/yillik-plan'
import { referansSamDk } from '@/lib/pes/yillik-plan-veri'

/**
 * Tahmin kalemi. SAM: elle verildiyse 'elle'; verilmediyse ürün tipinin
 * referansından 'referans'; ikisi de yoksa null (ekranda "SAM eksik").
 */

async function samCoz(
  sql: postgres.TransactionSql,
  samGirdi: unknown, urunTipiId: number | null,
): Promise<{ sam: number | null; kaynak: 'elle' | 'referans' | null } | { hata: string }> {
  if (samGirdi !== undefined && samGirdi !== null && samGirdi !== '') {
    const s = Number(samGirdi)
    if (!(s > 0)) return { hata: 'sam_dk sıfırdan büyük olmalı' }
    return { sam: s, kaynak: 'elle' }
  }
  if (urunTipiId) {
    const r = await referansSamDk(sql, urunTipiId)
    if (r) return { sam: Math.round(r * 1000) / 1000, kaynak: 'referans' }
  }
  return { sam: null, kaynak: null }
}

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const tahminId = Number(b.tahminId)
  const ad = String(b.ad ?? '').trim()
  const adet = Number(b.adet)
  if (!Number.isInteger(tahminId) || !ad || !Number.isInteger(adet) || adet <= 0) {
    return NextResponse.json({ error: 'tahminId, ad ve pozitif adet zorunlu' }, { status: 400 })
  }
  const profil = b.aylikProfil ?? esitProfil()
  if (!profilGecerli(profil)) {
    return NextResponse.json({ error: 'Aylık profil 12 değer ve toplam 100 olmalı' }, { status: 400 })
  }
  const kunye = kunyeyiAyikla(b)
  const { hatalar } = await kodlariDogrula(sql, kunye)
  if (hatalar.length) return NextResponse.json({ error: hatalar.join('; ') }, { status: 400 })

  const urunTipiId = b.urunTipiId ? Number(b.urunTipiId) : null
  const sam = await samCoz(sql, b.samDk, urunTipiId)
  if ('hata' in sam) return NextResponse.json({ error: sam.hata }, { status: 400 })

  const [row] = await sql`
    INSERT INTO talep_tahmini_kalem (
      tahmin_id, tenant_id, ad, ana_grup_kodu, klasman_kodu, kumas_turu_kodu,
      kumas_grubu_kodu, cinsiyet_yas_kodu, kalite_kodu, kumasci,
      urun_tipi_id, sam_dk, sam_kaynak, adet, aylik_profil)
    VALUES (
      ${tahminId}, ${tenant.tenantId}, ${ad.slice(0, 120)},
      ${kunye.ana_grup_kodu ?? null}, ${kunye.klasman_kodu ?? null}, ${kunye.kumas_turu_kodu ?? null},
      ${kunye.kumas_grubu_kodu ?? null}, ${kunye.cinsiyet_yas_kodu ?? null}, ${kunye.kalite_kodu ?? null},
      ${kunye.kumasci ?? null}, ${urunTipiId}, ${sam.sam}, ${sam.kaynak}, ${adet},
      ${profil.map((p) => Math.round(p * 100) / 100)}::numeric[])
    RETURNING id
  ` as unknown as Array<{ id: number }>
  return NextResponse.json({ id: row.id })
})

export const PATCH = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const id = Number(b.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })

  const [mevcut] = await sql`
    SELECT urun_tipi_id, sam_dk::float AS sam_dk, sam_kaynak
      FROM talep_tahmini_kalem WHERE id = ${id}
  ` as unknown as Array<{ urun_tipi_id: number | null; sam_dk: number | null; sam_kaynak: string | null }>
  if (!mevcut) return NextResponse.json({ error: 'Kalem bulunamadı' }, { status: 404 })

  if (b.aylikProfil !== undefined && !profilGecerli(b.aylikProfil)) {
    return NextResponse.json({ error: 'Aylık profil 12 değer ve toplam 100 olmalı' }, { status: 400 })
  }
  if (b.adet !== undefined && !(Number.isInteger(Number(b.adet)) && Number(b.adet) > 0)) {
    return NextResponse.json({ error: 'adet pozitif tam sayı olmalı' }, { status: 400 })
  }
  const kunye = kunyeyiAyikla(b)
  const { hatalar } = await kodlariDogrula(sql, kunye)
  if (hatalar.length) return NextResponse.json({ error: hatalar.join('; ') }, { status: 400 })

  /* Ürün tipi ya da SAM değiştiyse SAM yeniden çözülür; samDk: null elle
     ezmeyi kaldırıp referansa döner. */
  const urunTipiId = b.urunTipiId === undefined ? mevcut.urun_tipi_id
    : (b.urunTipiId ? Number(b.urunTipiId) : null)
  let sam = { sam: mevcut.sam_dk, kaynak: mevcut.sam_kaynak }
  if (b.samDk !== undefined || b.urunTipiId !== undefined) {
    const girdi = b.samDk !== undefined ? b.samDk
      : (mevcut.sam_kaynak === 'elle' ? mevcut.sam_dk : null)
    const c = await samCoz(sql, girdi, urunTipiId)
    if ('hata' in c) return NextResponse.json({ error: c.hata }, { status: 400 })
    sam = c
  }

  const kunyeAlani = (k: KunyeKolonu | 'kumasci') => k in kunye
  const deger = (k: KunyeKolonu | 'kumasci') => (kunye as Record<string, string | null>)[k] ?? null
  const kolonlar = [...(Object.keys(KUNYE_BOYUTLARI) as KunyeKolonu[]), 'kumasci' as const]
  for (const k of kolonlar.filter(kunyeAlani)) {
    await sql`UPDATE talep_tahmini_kalem SET ${sql({ [k]: deger(k) })} WHERE id = ${id}`
  }

  await sql`
    UPDATE talep_tahmini_kalem SET
      ad           = coalesce(nullif(${b.ad === undefined ? null : String(b.ad).trim().slice(0, 120)}::text, ''), ad),
      adet         = coalesce(${b.adet === undefined ? null : Number(b.adet)}::int, adet),
      aylik_profil = coalesce(${b.aylikProfil === undefined ? null
                      : (b.aylikProfil as number[]).map((p) => Math.round(p * 100) / 100)}::numeric[], aylik_profil),
      urun_tipi_id = ${urunTipiId},
      sam_dk       = ${sam.sam},
      sam_kaynak   = ${sam.kaynak},
      updated_at   = now()
    WHERE id = ${id}`
  return NextResponse.json({ id })
})

export const DELETE = withTenantRoute(async (req, { sql }) => {
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  const [b] = await sql`SELECT count(*)::int AS n FROM work_order WHERE tahmin_kalem_id = ${id}` as unknown as Array<{ n: number }>
  if (b.n > 0) return NextResponse.json({ error: 'Kaleme bağlı sipariş var; önce bağları çözün' }, { status: 409 })
  await sql`DELETE FROM talep_tahmini_kalem WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
```

- [ ] **Step 3: Tip denetimi**

Run: `npx tsc --noEmit -p . 2>&1 | grep yillik-plan`
Expected: çıktı yok. (`withTenantRoute`'un verdiği `sql` tipi `TransactionSql` değilse `samCoz` imzasını onun tipine uyarla.)

- [ ] **Step 4: Commit**

```bash
git add app/api/pes/yillik-plan/route.ts app/api/pes/yillik-plan/kalem/route.ts
git commit -m "feat(yillik-plan): tahmin ve kalem API"
```

---

### Task 6: API — öneri, tahsis hücresi, PO bağlama

**Files:**
- Create: `app/api/pes/yillik-plan/oneri/route.ts`
- Create: `app/api/pes/yillik-plan/tahsis/route.ts`
- Create: `app/api/pes/yillik-plan/bagla/route.ts`

- [ ] **Step 1: Öneri route'u**

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { aylikAdet, oneriUret, type OneriAdayi, type Tahsis } from '@/lib/pes/yillik-plan'
import {
  atolyeKapasiteleri, poAylikYuk, tahsisAylikYuk, atolyeUyumlari, atolyePuanlari,
} from '@/lib/pes/yillik-plan-veri'
import type { Kunye } from '@/lib/pes/kunye'

/**
 * Kalem için öneriyi hesaplayıp yazar. Yalnız kaynak='oneri' satırları
 * silinip yeniden yazılır; elle girilenler korunur.
 */
export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const { kalemId } = await req.json()
  const id = Number(kalemId)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'kalemId zorunlu' }, { status: 400 })

  const [k] = await sql`
    SELECT k.*, k.sam_dk::float AS sam, k.aylik_profil::float8[] AS profil, h.yil
      FROM talep_tahmini_kalem k JOIN talep_tahmini h ON h.id = k.tahmin_id
     WHERE k.id = ${id}
  ` as unknown as Array<Record<string, unknown> & { sam: number | null; profil: number[]; yil: number; adet: number }>
  if (!k) return NextResponse.json({ error: 'Kalem bulunamadı' }, { status: 404 })
  if (!k.sam) return NextResponse.json({ error: 'SAM eksik: ürün tipi seçin ya da SAM girin' }, { status: 400 })

  const kunye: Kunye = {
    ana_grup_kodu: k.ana_grup_kodu as string | null, klasman_kodu: k.klasman_kodu as string | null,
    kumas_turu_kodu: k.kumas_turu_kodu as string | null, kumas_grubu_kodu: k.kumas_grubu_kodu as string | null,
    cinsiyet_yas_kodu: k.cinsiyet_yas_kodu as string | null, kalite_kodu: k.kalite_kodu as string | null,
  }

  const [kap, po, digerTahsis, uyumlar, puanlar] = [
    await atolyeKapasiteleri(sql, k.yil),
    await poAylikYuk(sql, k.yil),
    await tahsisAylikYuk(sql, k.yil, id),
    await atolyeUyumlari(sql, kunye),
    await atolyePuanlari(sql, k.yil, kunye, k.adet),
  ]

  const adaylar: OneriAdayi[] = kap.map((a) => {
    const p = po.yuk.get(a.workshopId) ?? []
    const t = digerTahsis.get(a.workshopId) ?? []
    return {
      workshopId: a.workshopId,
      puan: puanlar.get(a.workshopId) ?? 0,
      uyum: uyumlar.get(a.workshopId)?.uyum ?? 'bilinmiyor',
      bosDk: a.kapasiteDk.map((c, m) => c - (p[m] ?? 0) - (t[m] ?? 0)),
    }
  })

  const elle = await sql`
    SELECT workshop_id AS "workshopId", ay, adet FROM talep_tahsis
     WHERE kalem_id = ${id} AND kaynak = 'elle'
  ` as unknown as Tahsis[]

  const sonuc = oneriUret({ aylikAdet: aylikAdet(k.adet, k.profil), samDk: k.sam, adaylar, elle })

  await sql`DELETE FROM talep_tahsis WHERE kalem_id = ${id} AND kaynak = 'oneri'`
  for (const t of sonuc.tahsisler) {
    await sql`
      INSERT INTO talep_tahsis (kalem_id, tenant_id, workshop_id, ay, adet, kaynak)
      VALUES (${id}, ${tenant.tenantId}, ${t.workshopId}, ${t.ay}, ${t.adet}, 'oneri')
      ON CONFLICT (kalem_id, workshop_id, ay) DO NOTHING`
  }
  return NextResponse.json({
    tahsisSayisi: sonuc.tahsisler.length,
    tahsisEdilemeyen: sonuc.tahsisEdilemeyen,
  })
})
```

- [ ] **Step 2: Tahsis hücresi route'u**

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Hücreyi elle düzenle. adet 0 → satır silinir. Düzenlenen hücre
 * 'elle' olur ve sonraki "Öner" onu ezmez.
 */
export const PUT = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const kalemId = Number(b.kalemId)
  const workshopId = Number(b.workshopId)
  const ay = Number(b.ay)
  const adet = Number(b.adet)
  if (![kalemId, workshopId, ay, adet].every(Number.isInteger) || ay < 1 || ay > 12 || adet < 0) {
    return NextResponse.json({ error: 'kalemId, workshopId, ay (1-12) ve adet (>=0) zorunlu' }, { status: 400 })
  }
  if (adet === 0) {
    await sql`DELETE FROM talep_tahsis WHERE kalem_id = ${kalemId} AND workshop_id = ${workshopId} AND ay = ${ay}`
    return NextResponse.json({ ok: true })
  }
  await sql`
    INSERT INTO talep_tahsis (kalem_id, tenant_id, workshop_id, ay, adet, kaynak)
    VALUES (${kalemId}, ${tenant.tenantId}, ${workshopId}, ${ay}, ${adet}, 'elle')
    ON CONFLICT (kalem_id, workshop_id, ay)
    DO UPDATE SET adet = EXCLUDED.adet, kaynak = 'elle', updated_at = now()`
  return NextResponse.json({ ok: true })
})
```

- [ ] **Step 3: PO bağlama route'u**

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/** PO'yu tahmin kalemine bağla (kalemId null → çöz). */
export const POST = withTenantRoute(async (req, { sql }) => {
  const b = await req.json()
  const workOrderId = Number(b.workOrderId)
  const kalemId = b.kalemId === null ? null : Number(b.kalemId)
  if (!Number.isInteger(workOrderId) || (kalemId !== null && !Number.isInteger(kalemId))) {
    return NextResponse.json({ error: 'workOrderId zorunlu, kalemId tam sayı ya da null' }, { status: 400 })
  }
  const [r] = await sql`
    UPDATE work_order SET tahmin_kalem_id = ${kalemId} WHERE id = ${workOrderId} RETURNING id
  ` as unknown as Array<{ id: number }>
  if (!r) return NextResponse.json({ error: 'Sipariş bulunamadı' }, { status: 404 })
  return NextResponse.json({ ok: true })
})
```

- [ ] **Step 4: Tip denetimi ve uçtan uca duman testi**

Run: `npx tsc --noEmit -p . 2>&1 | grep yillik-plan`
Expected: çıktı yok.

Dev sunucusu: `npm run dev -- -p 3011` (arka planda). Tarayıcıda merkez hesabıyla giriş yaptıktan sonra (Playwright `browser_evaluate` ile, oturum çerezi gereklidir):

```js
const j = (u, m, b) => fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json())
const t = await j('/api/pes/yillik-plan', 'POST', { yil: 2027, departman: 'Test Dept', ad: 'Duman testi' })
const k = await j('/api/pes/yillik-plan/kalem', 'POST', { tahminId: t.id, ad: 'Chino', adet: 10000, samDk: 12 })
const o = await j('/api/pes/yillik-plan/oneri', 'POST', { kalemId: k.id })
const s = await fetch('/api/pes/yillik-plan?id=' + t.id, { method: 'DELETE' }).then(r => r.json())
;({ t, k, o, s })
```

Expected: `o.tahsisSayisi` > 0 ya da `o.tahsisEdilemeyen` toplamı 10000 (künye boşsa tüm atölyeler `bilinmiyor` → hepsi tahsis edilemeyen; bu doğru davranış). `s.ok === true`.

- [ ] **Step 5: Commit**

```bash
git add app/api/pes/yillik-plan/oneri app/api/pes/yillik-plan/tahsis app/api/pes/yillik-plan/bagla
git commit -m "feat(yillik-plan): öneri, hücre düzenleme ve PO bağlama API"
```

---

### Task 7: Ekran — sunucu sayfası

**Files:**
- Create: `app/pes/yillik-plan/page.tsx`

- [ ] **Step 1: Yaz**

```tsx
/**
 * /pes/yillik-plan — Yıllık Talep Planı
 *
 * Tedarikçi departmanının yıllık tahmini kalemlere bölünür; her kalem
 * yetenek uyumlu atölyelere aylık boş kapasiteye göre dağıtılır.
 * Izgara atölye × ay; hücre yükü = gerçek PO + tüm tahsisler (dk) ÷ kapasite.
 * Takvime günlük rezerve YAZILMAZ — yumuşak rezervasyon bu ızgaradır.
 */
import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import { aylikAdet, yukYuzdesi } from '@/lib/pes/yillik-plan'
import {
  atolyeKapasiteleri, poAylikYuk, tahsisAylikYuk, atolyeUyumlari,
} from '@/lib/pes/yillik-plan-veri'
import type { Kunye } from '@/lib/pes/kunye'
import YillikPlan, { type TahminOzet, type KalemDetay, type IzgaraSatiri } from './YillikPlan'

export const dynamic = 'force-dynamic'

export default async function YillikPlanSayfasi({
  searchParams,
}: { searchParams: Promise<{ yil?: string; tahmin?: string; kalem?: string }> }) {
  const sp = await searchParams
  const yil = Number(sp.yil) || new Date().getFullYear() + 1

  const veri = await withServerTenant(async (sql) => {
    const tahminler = await sql`
      SELECT h.id, h.departman, h.ad, h.kumas, h.durum,
             COALESCE(SUM(k.adet), 0)::int AS toplam
        FROM talep_tahmini h
        LEFT JOIN talep_tahmini_kalem k ON k.tahmin_id = h.id
       WHERE h.yil = ${yil}
       GROUP BY h.id ORDER BY h.departman, h.ad
    ` as unknown as TahminOzet[]
    const tahminId = Number(sp.tahmin) || tahminler[0]?.id || 0

    const kalemSatirlari = tahminId ? await sql`
      SELECT k.id, k.ad, k.adet, k.sam_dk::float AS "samDk", k.sam_kaynak AS "samKaynak",
             k.urun_tipi_id AS "urunTipiId", k.aylik_profil::float8[] AS profil,
             k.ana_grup_kodu, k.klasman_kodu, k.kumas_turu_kodu, k.kumas_grubu_kodu,
             k.cinsiyet_yas_kodu, k.kalite_kodu, k.kumasci,
             COALESCE((SELECT SUM(siparis_miktari) FROM work_order w
                        WHERE w.tahmin_kalem_id = k.id AND w.durum <> 'Iptal'), 0)::int AS tuketilen,
             COALESCE((SELECT SUM(adet) FROM talep_tahsis t WHERE t.kalem_id = k.id), 0)::int AS tahsisli
        FROM talep_tahmini_kalem k
       WHERE k.tahmin_id = ${tahminId}
       ORDER BY k.id
    ` as unknown as Array<Record<string, unknown>> : []
    const kalemId = Number(sp.kalem) || (kalemSatirlari[0]?.id as number | undefined) || 0
    const kalem = kalemSatirlari.find((k) => k.id === kalemId) ?? null

    const kap = await atolyeKapasiteleri(sql, yil)
    const po = await poAylikYuk(sql, yil)
    const tahsisYuk = await tahsisAylikYuk(sql, yil, null)
    const uyumlar = kalem ? await atolyeUyumlari(sql, kalem as unknown as Kunye) : null
    const kalemTahsis = kalem ? await sql`
      SELECT workshop_id AS "workshopId", ay, adet, kaynak FROM talep_tahsis WHERE kalem_id = ${kalemId}
    ` as unknown as Array<{ workshopId: number; ay: number; adet: number; kaynak: 'oneri' | 'elle' }> : []
    const urunTipleri = await sql`
      SELECT DISTINCT ut.id, ut.klasman_ad AS ad, ut.urun_grubu AS grup
        FROM ref_urun_tipi ut JOIN ref_parca_sure p ON p.urun_tipi_id = ut.id
       ORDER BY ut.urun_grubu NULLS LAST, ut.klasman_ad
    ` as unknown as Array<{ id: number; ad: string; grup: string | null }>

    return { tahminler, tahminId, kalemSatirlari, kalemId, kalem, kap, po, tahsisYuk,
             uyumlar, kalemTahsis, urunTipleri }
  })
  if (!veri) redirect('/login')

  const izgara: IzgaraSatiri[] = veri.kap.map((a) => {
    const p = veri.po.yuk.get(a.workshopId) ?? []
    const t = veri.tahsisYuk.get(a.workshopId) ?? []
    const u = veri.uyumlar?.get(a.workshopId)
    return {
      workshopId: a.workshopId, kod: a.kod, ad: a.ad,
      yuzde: a.kapasiteDk.map((c, m) => yukYuzdesi((p[m] ?? 0) + (t[m] ?? 0), c)),
      uyum: u?.uyum ?? null, neden: u?.neden ?? null,
      hucre: Array.from({ length: 12 }, (_, m) => {
        const x = veri.kalemTahsis.find((r) => r.workshopId === a.workshopId && r.ay === m + 1)
        return x ? { adet: x.adet, kaynak: x.kaynak } : null
      }),
    }
  })

  const kalemler: KalemDetay[] = veri.kalemSatirlari.map((k) => ({
    id: k.id as number, ad: k.ad as string, adet: k.adet as number,
    samDk: k.samDk as number | null, samKaynak: k.samKaynak as string | null,
    urunTipiId: k.urunTipiId as number | null, profil: k.profil as number[],
    klasman_kodu: k.klasman_kodu as string | null, kumas_turu_kodu: k.kumas_turu_kodu as string | null,
    kumas_grubu_kodu: k.kumas_grubu_kodu as string | null, cinsiyet_yas_kodu: k.cinsiyet_yas_kodu as string | null,
    tuketilen: k.tuketilen as number, tahsisli: k.tahsisli as number,
  }))

  const secili = kalemler.find((k) => k.id === veri.kalemId) ?? null
  const ihtiyac = secili ? aylikAdet(secili.adet, secili.profil) : null

  return (
    <YillikPlan
      yil={yil} tahminler={veri.tahminler} tahminId={veri.tahminId}
      kalemler={kalemler} kalemId={veri.kalemId} ihtiyac={ihtiyac}
      izgara={izgara} samsizPo={veri.po.samsizPo} urunTipleri={veri.urunTipleri}
    />
  )
}
```

- [ ] **Step 2: Commit (istemci bileşeniyle birlikte, Task 8 sonunda)**

---

### Task 8: Ekran — istemci bileşeni

**Files:**
- Create: `app/pes/yillik-plan/YillikPlan.tsx`

Künye girişi v1'de klasman / kumaş türü / kumaş grubu / cinsiyet-yaş kodlarını düz metin alanıyla alır; kodlar API'de `kodlariDogrula` ile doğrulanır ve hatalı kod mesajla reddedilir.

- [ ] **Step 1: Yaz**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export type TahminOzet = { id: number; departman: string; ad: string; kumas: string | null; durum: string; toplam: number }
export type KalemDetay = {
  id: number; ad: string; adet: number; samDk: number | null; samKaynak: string | null
  urunTipiId: number | null; profil: number[]
  klasman_kodu: string | null; kumas_turu_kodu: string | null
  kumas_grubu_kodu: string | null; cinsiyet_yas_kodu: string | null
  tuketilen: number; tahsisli: number
}
export type IzgaraSatiri = {
  workshopId: number; kod: string; ad: string
  yuzde: (number | null)[]
  uyum: 'uygun' | 'uyumsuz' | 'bilinmiyor' | null
  neden: string | null
  hucre: ({ adet: number; kaynak: 'oneri' | 'elle' } | null)[]
}

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const tr = new Intl.NumberFormat('tr-TR')

function renk(y: number | null): string {
  if (y === null) return 'bg-slate-100 text-slate-400'
  if (y > 100) return 'bg-red-100 text-red-700'
  if (y > 85) return 'bg-amber-100 text-amber-800'
  return 'bg-emerald-50 text-emerald-800'
}

export default function YillikPlan(p: {
  yil: number; tahminler: TahminOzet[]; tahminId: number
  kalemler: KalemDetay[]; kalemId: number; ihtiyac: number[] | null
  izgara: IzgaraSatiri[]; samsizPo: number
  urunTipleri: Array<{ id: number; ad: string; grup: string | null }>
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [bekliyor, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)

  const git = (degis: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(degis)) v === null ? q.delete(k) : q.set(k, v)
    router.push(`/pes/yillik-plan?${q.toString()}`)
  }

  async function istek(yol: string, method: string, govde?: unknown) {
    setHata(null)
    const r = await fetch(yol, {
      method, headers: { 'content-type': 'application/json' },
      body: govde === undefined ? undefined : JSON.stringify(govde),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setHata(j.error ?? `Hata ${r.status}`); return null }
    basla(() => router.refresh())
    return j
  }

  const secili = p.kalemler.find((k) => k.id === p.kalemId) ?? null
  const tahmin = p.tahminler.find((t) => t.id === p.tahminId) ?? null
  const kalemToplamAy = (m: number) => p.izgara.reduce((t, s) => t + (s.hucre[m]?.adet ?? 0), 0)

  async function tahminEkle(f: FormData) {
    const j = await istek('/api/pes/yillik-plan', 'POST', {
      yil: p.yil, departman: f.get('departman'), ad: f.get('ad'), kumas: f.get('kumas'),
    })
    if (j) git({ tahmin: String(j.id), kalem: null })
  }

  async function kalemEkle(f: FormData) {
    const j = await istek('/api/pes/yillik-plan/kalem', 'POST', {
      tahminId: p.tahminId, ad: f.get('ad'), adet: Number(f.get('adet')),
      urunTipiId: f.get('urunTipiId') || null, samDk: f.get('samDk') || null,
      klasman_kodu: f.get('klasman_kodu'), kumas_turu_kodu: f.get('kumas_turu_kodu'),
      kumas_grubu_kodu: f.get('kumas_grubu_kodu'), cinsiyet_yas_kodu: f.get('cinsiyet_yas_kodu'),
    })
    if (j) git({ kalem: String(j.id) })
  }

  async function profilKaydet(f: FormData) {
    const profil = AYLAR.map((_, i) => Number(f.get(`p${i}`)))
    await istek('/api/pes/yillik-plan/kalem', 'PATCH', { id: p.kalemId, aylikProfil: profil })
  }

  async function oner() {
    const j = await istek('/api/pes/yillik-plan/oneri', 'POST', { kalemId: p.kalemId })
    if (j) {
      const kalan = (j.tahsisEdilemeyen as number[]).reduce((a, b) => a + b, 0)
      setBilgi(kalan > 0 ? `Tahsis edilemeyen: ${tr.format(kalan)} adet` : 'Tümü tahsis edildi')
    }
  }

  async function hucreKaydet(workshopId: number, ay: number, deger: string) {
    const adet = Math.max(0, Math.floor(Number(deger) || 0))
    await istek('/api/pes/yillik-plan/tahsis', 'PUT', { kalemId: p.kalemId, workshopId, ay, adet })
  }

  const inp = 'border border-slate-300 rounded px-2 py-1 text-sm w-full'
  const btn = 'rounded bg-slate-900 text-white text-sm px-3 py-1.5 disabled:opacity-50'

  return (
    <div className="p-4 space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Yıllık Talep Planı</h1>
        <select className="border rounded px-2 py-1 text-sm" value={p.yil}
          onChange={(e) => git({ yil: e.target.value, tahmin: null, kalem: null })}>
          {[p.yil - 1, p.yil, p.yil + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {p.samsizPo > 0 && (
          <span className="text-xs text-amber-700">{p.samsizPo} siparişte SAM yok — yüke katılmadı</span>
        )}
        {bekliyor && <span className="text-xs text-slate-500">Güncelleniyor…</span>}
      </header>
      {hata && <div className="rounded bg-red-50 text-red-700 text-sm px-3 py-2">{hata}</div>}
      {bilgi && <div className="rounded bg-slate-50 text-slate-700 text-sm px-3 py-2">{bilgi}</div>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-slate-600">Tahminler</h2>
            <ul className="space-y-1">
              {p.tahminler.map((t) => (
                <li key={t.id}>
                  <button onClick={() => git({ tahmin: String(t.id), kalem: null })}
                    className={`w-full text-left rounded px-2 py-1.5 text-sm ${t.id === p.tahminId ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
                    <div className="font-medium">{t.departman} — {t.ad}</div>
                    <div className="text-xs opacity-75">{tr.format(t.toplam)} adet · {t.durum === 'Onayli' ? 'Onaylı' : 'Taslak'}</div>
                  </button>
                </li>
              ))}
            </ul>
            <form action={tahminEkle} className="space-y-1 border-t pt-2">
              <input name="departman" placeholder="Tedarikçi departmanı" className={inp} required />
              <input name="ad" placeholder="Tahmin adı (ör. Pantolon 2027)" className={inp} required />
              <input name="kumas" placeholder="Kumaş (isteğe bağlı)" className={inp} />
              <button className={btn} disabled={bekliyor}>Tahmin ekle</button>
            </form>
          </section>

          {tahmin && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-600">Kalemler</h2>
                <button className="text-xs underline" onClick={() => istek('/api/pes/yillik-plan', 'PATCH',
                  { id: tahmin.id, durum: tahmin.durum === 'Onayli' ? 'Taslak' : 'Onayli' })}>
                  {tahmin.durum === 'Onayli' ? 'Taslağa al' : 'Onayla'}
                </button>
              </div>
              <ul className="space-y-1">
                {p.kalemler.map((k) => (
                  <li key={k.id}>
                    <button onClick={() => git({ kalem: String(k.id) })}
                      className={`w-full text-left rounded px-2 py-1.5 text-sm ${k.id === p.kalemId ? 'bg-slate-200' : 'hover:bg-slate-100'}`}>
                      <div className="font-medium">{k.ad}</div>
                      <div className="text-xs text-slate-600">
                        {tr.format(k.adet)} adet · tahsisli {tr.format(k.tahsisli)} · PO {tr.format(k.tuketilen)}
                        {k.samDk === null ? <span className="text-red-600"> · SAM eksik</span>
                          : <> · {k.samDk.toFixed(1)} dk ({k.samKaynak})</>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <form action={kalemEkle} className="space-y-1 border-t pt-2">
                <input name="ad" placeholder="Kalem adı (ör. 5-cep denim)" className={inp} required />
                <input name="adet" type="number" min={1} placeholder="Adet" className={inp} required />
                <select name="urunTipiId" className={inp} defaultValue="">
                  <option value="">Ürün tipi (SAM referansı)</option>
                  {p.urunTipleri.map((u) => <option key={u.id} value={u.id}>{u.grup ? `${u.grup} / ` : ''}{u.ad}</option>)}
                </select>
                <input name="samDk" type="number" step="0.01" min={0} placeholder="SAM dk (boşsa referans)" className={inp} />
                <div className="grid grid-cols-2 gap-1">
                  <input name="klasman_kodu" placeholder="Klasman kodu" className={inp} />
                  <input name="kumas_turu_kodu" placeholder="Kumaş türü kodu" className={inp} />
                  <input name="kumas_grubu_kodu" placeholder="Kumaş grubu kodu" className={inp} />
                  <input name="cinsiyet_yas_kodu" placeholder="Cinsiyet/yaş kodu" className={inp} />
                </div>
                <button className={btn} disabled={bekliyor}>Kalem ekle</button>
              </form>
            </section>
          )}
        </aside>

        <main className="space-y-3 min-w-0">
          {secili && p.ihtiyac && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-medium">{secili.ad}</h2>
                <button className={btn} onClick={oner} disabled={bekliyor || secili.samDk === null}>Öner</button>
                <span className="text-xs text-slate-500">Öneri yalnız “öneri” hücrelerini yeniden yazar; elle girdikleriniz korunur.</span>
              </div>
              <form action={profilKaydet} className="flex flex-wrap items-end gap-1">
                {AYLAR.map((a, i) => (
                  <label key={a} className="text-[10px] text-slate-500 w-14">
                    {a} %
                    <input name={`p${i}`} type="number" step="0.01" min={0}
                      defaultValue={Number(secili.profil[i].toFixed(2))} className={inp} />
                  </label>
                ))}
                <button className="text-xs underline ml-2">Profili kaydet</button>
              </form>
            </section>
          )}

          <div className="overflow-x-auto">
            <table className="text-xs border-collapse min-w-full">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1 sticky left-0 bg-white">Atölye</th>
                  {AYLAR.map((a) => <th key={a} className="px-1 py-1 w-20">{a}</th>)}
                </tr>
                {p.ihtiyac && (
                  <tr className="text-slate-600">
                    <th className="text-left px-2 py-1 sticky left-0 bg-white font-normal">İhtiyaç / tahsisli</th>
                    {p.ihtiyac.map((n, m) => {
                      const t = kalemToplamAy(m)
                      return <td key={m} className={`px-1 text-center ${t < n ? 'text-red-600' : ''}`}>{tr.format(n)} / {tr.format(t)}</td>
                    })}
                  </tr>
                )}
              </thead>
              <tbody>
                {p.izgara.map((s) => {
                  const gri = secili && s.uyum !== 'uygun'
                  return (
                    <tr key={s.workshopId} className={gri ? 'opacity-50' : ''} title={s.neden ?? undefined}>
                      <td className="px-2 py-1 sticky left-0 bg-white whitespace-nowrap">
                        <span className="font-medium">{s.kod}</span> {s.ad}
                      </td>
                      {s.yuzde.map((y, m) => (
                        <td key={m} className={`px-1 py-1 text-center align-top ${renk(y)}`}>
                          <div>{y === null ? '—' : `%${Math.round(y)}`}</div>
                          {secili && (
                            <input key={`${s.workshopId}-${m}-${s.hucre[m]?.adet ?? 0}`}
                              defaultValue={s.hucre[m]?.adet ?? ''} inputMode="numeric"
                              className={`w-16 mt-0.5 rounded border text-right px-1 ${s.hucre[m]?.kaynak === 'elle' ? 'border-blue-500' : 'border-slate-300'}`}
                              onBlur={(e) => {
                                const eski = String(s.hucre[m]?.adet ?? '')
                                if (e.target.value !== eski) hucreKaydet(s.workshopId, m + 1, e.target.value)
                              }} />
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            Yüzde = (gerçek PO + tüm tahsisler) dk ÷ kapasite dk. Mavi çerçeve: elle girilen. Soluk satır: yetenek uyumu yok ya da kontrol edilemedi (satırın üzerine gelin).
          </p>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Tip ve derleme**

Run: `npx tsc --noEmit -p . 2>&1 | grep yillik-plan`
Expected: çıktı yok.

- [ ] **Step 3: Commit**

```bash
git add app/pes/yillik-plan
git commit -m "feat(yillik-plan): /pes/yillik-plan ekranı"
```

---

### Task 9: Menü ve Planlama Masası ipucu

**Files:**
- Modify: `components/pes/PesDevSidebar.tsx` (Operasyon grubu, `Planlama Masası` satırından sonra)
- Modify: `app/pes/plan-tezgahi/page.tsx` (havuz sorgusu ve `havuz` eşlemesi)
- Modify: `app/pes/plan-tezgahi/Tezgah.tsx` (`HavuzKarti` tipi ve kart gövdesi)

- [ ] **Step 1: Sidebar**

`lucide-react` import listesine `CalendarRange` ekle ve `Planlama Masası` satırından sonra:

```tsx
      { label: 'Yıllık Talep Planı', href: '/pes/yillik-plan', icon: CalendarRange },
```

- [ ] **Step 2: Planlama Masası — ipucu verisi**

`app/pes/plan-tezgahi/page.tsx` içinde `havuzSatirlari` sorgusundan hemen sonra (aynı `withServerTenant` bloğu içinde):

```ts
    /* Yıllık talep planı ipucu: onaylı bir tahmin kaleminin dolu künye
       alanlarının HEPSİ PO'yla aynıysa ve kalemin PO'nun teslim ayında
       tahsisi varsa, o ayın atölyeleri gösterilir. ENGELLEMEZ, söyler. */
    const tahminIpuclari = await sql`
      SELECT w.id AS wo_id, string_agg(DISTINCT a.code, ', ') AS atolyeler
        FROM work_order w
        JOIN talep_tahmini h ON h.durum = 'Onayli'
             AND h.yil = extract(year FROM w.teslim_tarihi)::int
        JOIN talep_tahmini_kalem k ON k.tahmin_id = h.id
        JOIN talep_tahsis t ON t.kalem_id = k.id
             AND t.ay = extract(month FROM w.teslim_tarihi)::int
        JOIN workshop a ON a.id = t.workshop_id
       WHERE w.id = ANY(${veriHavuzIdleri(havuzSatirlari)})
         AND (k.klasman_kodu      IS NULL OR k.klasman_kodu      = w.klasman_kodu)
         AND (k.kumas_turu_kodu   IS NULL OR k.kumas_turu_kodu   = w.kumas_turu_kodu)
         AND (k.kumas_grubu_kodu  IS NULL OR k.kumas_grubu_kodu  = w.kumas_grubu_kodu)
         AND (k.cinsiyet_yas_kodu IS NULL OR k.cinsiyet_yas_kodu = w.cinsiyet_yas_kodu)
         AND (k.ana_grup_kodu     IS NULL OR k.ana_grup_kodu     = w.ana_grup_kodu)
         AND (k.klasman_kodu IS NOT NULL OR k.kumas_turu_kodu IS NOT NULL
              OR k.kumas_grubu_kodu IS NOT NULL OR k.ana_grup_kodu IS NOT NULL)
       GROUP BY w.id
    ` as unknown as Array<{ wo_id: number; atolyeler: string }>
```

Dosyanın en üstüne (fonksiyon dışına) yardımcı:

```ts
const veriHavuzIdleri = (s: Array<Record<string, unknown>>) => s.map((h) => h.id as number)
```

`return { ... }` listesine `tahminIpuclari` ekle. `havuz` eşlemesinde (`atolyeAdi:` satırından sonra):

```ts
      tahminIpucu: veri.tahminIpuclari.find((t) => t.wo_id === (h.id as number))?.atolyeler ?? null,
```

- [ ] **Step 3: Tezgah kartı**

`app/pes/plan-tezgahi/Tezgah.tsx` `HavuzKarti` tipine:

```ts
  /** Yıllık talep planında bu PO'ya uyan ön-tahsisli atölye kodları. */
  tahminIpucu: string | null
```

Kartta `{h.atolyeAdi && (...)}` bloğundan sonra:

```tsx
                {h.tahminIpucu && (
                  <div className="text-[10px] text-indigo-600 truncate" title="Yıllık talep planı ön-tahsisi">
                    Tahmin: {h.tahminIpucu}
                  </div>
                )}
```

- [ ] **Step 4: Tip denetimi + tüm testler**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "yillik-plan|plan-tezgahi|PesDevSidebar"`
Expected: çıktı yok.

Run: `npm test`
Expected: önceden geçen testler yine geçer, `yillik-plan.test.ts` 13/13.

- [ ] **Step 5: Commit**

```bash
git add components/pes/PesDevSidebar.tsx app/pes/plan-tezgahi/page.tsx app/pes/plan-tezgahi/Tezgah.tsx
git commit -m "feat(yillik-plan): menü ve Planlama Masası tahmin ipucu"
```

---

### Task 10: Uçtan uca doğrulama ve sürüm

**Files:**
- Modify: `lib/version.ts` (sürümü `1.8.0` yap), `package.json` (`"version": "1.8.0"`)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: başarıyla biter; `/pes/yillik-plan` rotası listede.

- [ ] **Step 2: Tarayıcıda senaryo** (dev `-p 3011`, merkez hesabı, Playwright)

1. `/pes/yillik-plan?yil=2027` aç; sidebar'da "Yıllık Talep Planı" görünür.
2. Tahmin ekle: departman "Pantolon Tedarik", ad "Pantolon 2027", kumaş "Denim X".
3. Kalem ekle: "5-cep denim", 600000 adet, bir pantolon ürün tipi seç, klasman ve kumaş türü kodunu canlı katalogdan bir atölyenin sahip olduğu değerle doldur (kodu `/pes/yetenek-arama` sayfasından al).
4. Kalem listesinde SAM `(referans)` görünür.
5. "Öner" → uygun satırlarda hücrelere adet düşer; uygun olmayan satırlar soluk ve üzerine gelince neden görünür; "İhtiyaç / tahsisli" satırı ve "Tahsis edilemeyen" mesajı tutarlı.
6. Bir hücreyi elle değiştir → mavi çerçeve; tekrar "Öner" → o hücre korunur.
7. Profili ocak %50, şubat %50, diğerleri 0 yap, kaydet; toplam 100 değilse hata mesajı görünür.
8. Tahmini onayla; Planlama Masası'nda aynı künye ve 2027 teslimli bir PO varsa kartta "Tahmin: …" görünür.
9. Ekran görüntüsü al, sonra test tahminini sil (`DELETE /api/pes/yillik-plan?id=…`).

Expected: her adım tarif edildiği gibi; konsolda hata yok.

- [ ] **Step 3: Sürüm ve commit**

```bash
git add lib/version.ts package.json
git commit -m "chore: v1.8.0 — yıllık talep planı"
```

Sonra `superpowers:finishing-a-development-branch` ile main'e birleştirme / push / yayın (`node scripts/yayinla.mjs`) kararı kullanıcıya sorulur.
