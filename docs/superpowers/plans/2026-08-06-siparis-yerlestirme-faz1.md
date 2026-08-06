# Sipariş Yerleştirme — Faz 1 (şema + algoritma + API) Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bir siparişi seçilen atölyenin bantlarına, teslim tarihinden geriye doğru, kapasiteye orantılı bölerek yerleştiren ve aşama zincirini kuran çekirdeği çalışır hale getirmek.

**Architecture:** Saf hesap fonksiyonları (`lib/pes/yerlestirme.ts`) veritabanından bağımsız ve birim testli; kalıcılık ve API ayrı katmanda. Şema `work_order_stage`'in üzerine bant tahsisi ve atölye×aşama kapasitesi ekler. Faz 1'in çıktısı arayüzsüz ama uçtan uca test edilebilir bir yerleştirme uçudur.

**Tech Stack:** PostgreSQL (Supabase), postgres.js, Next.js 16 App Router, TypeScript, Vitest.

**Kaynak tasarım:** `docs/superpowers/specs/2026-08-06-siparis-yerlestirme-design.md`

---

## Dosya yapısı

| dosya | sorumluluk |
|---|---|
| `supabase/migrations/030_siparis_yerlestirme.sql` | Yeni tablolar, `work_order_stage.workshop_id`, RLS, yetkiler |
| `lib/pes/yerlestirme.ts` | Saf hesap: bant payları, aşama süresi, geriye planlama. DB bilmez. |
| `lib/pes/yerlestirme.test.ts` | Yukarıdakinin birim testleri. DB'ye bağlanmaz. |
| `lib/pes/aday-atolye.ts` | Aday atölye puanlaması (SQL + puan birleştirme) |
| `lib/pes/aday-atolye.test.ts` | Gerçek DB'ye bağlanan test |
| `lib/pes/yerlestir-kaydet.ts` | Yerleştirmeyi tek transaction'da yazan fonksiyon |
| `lib/pes/yerlestir-kaydet.test.ts` | Gerçek DB'ye bağlanan test; kendi ZZTEST verisini açar ve siler |
| `app/api/pes/work-orders/yerlestir/route.ts` | POST ucu |

Saf hesap ile DB erişimi ayrı dosyalarda: hesap kurallarını (bölme, geriye planlama) DB olmadan test edebilmek, bu işin en kırılgan kısmını hızlı doğrulamanın tek yolu.

---

## Görev 1: Şema — migration 030

**Files:**
- Create: `supabase/migrations/030_siparis_yerlestirme.sql`

- [ ] **Adım 1: Migration dosyasını yaz**

```sql
-- ============================================================
-- Migration 030 — Sipariş yerleştirme çekirdeği
-- ============================================================
--
-- Kaynak tasarım: docs/superpowers/specs/2026-08-06-siparis-yerlestirme-design.md
--
-- NE EKLİYOR:
--   1. work_order_stage.workshop_id — aşama başka atölyede olabilir (K4).
--      NULL ise siparişin atölyesi; dolu ve farklıysa DIŞ ATÖLYE.
--   2. work_order_stage_atama — bir aşamanın bant tahsisleri (K1, K9).
--      3 banda bölünen dikim = 3 satır. Bant bazlı olmayan aşamalarda
--      hiç satır olmaz; tarihleri doğrudan work_order_stage'de durur.
--   3. work_order_gunluk_uretim — isteğe bağlı günlük adet girişi (K6).
--   4. workshop_stage_capacity — atölye x aşama günlük kapasite (K2).
--      ELLE girilir; sistem çıkarmaz.
--
-- line_schedule'IN ANLAMI DARALIYOR: bundan sonra yalnız iş emri DIŞI
-- bloklar (bakım, izin, tatil). İş emri doluluğu artık atama tablosundan
-- okunur. Aynı bilgi iki tabloda dursaydı zamanla birbirini tutmazdı.
-- Tablo boş olduğu için bu daraltmanın veri maliyeti yok.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. Aşama başka atölyede olabilir ----------
ALTER TABLE work_order_stage
    ADD COLUMN IF NOT EXISTS workshop_id INTEGER REFERENCES workshop(id) ON DELETE SET NULL;

COMMENT ON COLUMN work_order_stage.workshop_id IS
'Aşamayı yapan atölye. NULL = siparişin atölyesi. Farklı bir değer = dış atölye (UKP/yıkama dışarı çıktığında).';

CREATE INDEX IF NOT EXISTS idx_wos_workshop ON work_order_stage(workshop_id)
    WHERE workshop_id IS NOT NULL;

-- ---------- 2. Bant tahsisleri ----------
CREATE TABLE IF NOT EXISTS work_order_stage_atama (
    id                SERIAL PRIMARY KEY,
    stage_row_id      INTEGER NOT NULL REFERENCES work_order_stage(id) ON DELETE CASCADE,
    tenant_id         UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    line_id           INTEGER NOT NULL REFERENCES production_line(id) ON DELETE CASCADE,

    adet              INTEGER NOT NULL CHECK (adet > 0),
    plan_baslangic    DATE NOT NULL,
    plan_bitis        DATE NOT NULL,
    gercek_baslangic  DATE,
    gercek_bitis      DATE,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT wosa_tarih_sirasi CHECK (plan_bitis >= plan_baslangic),
    UNIQUE (stage_row_id, line_id)
);

COMMENT ON TABLE work_order_stage_atama IS
'Bir aşamanın bant tahsisi. Sipariş birden çok banda bölünürse her bant bir satır. Kesim/yıkama/UKP bant bazlı değil — onlarda satır olmaz.';

CREATE INDEX IF NOT EXISTS idx_wosa_line_tarih ON work_order_stage_atama(line_id, plan_baslangic, plan_bitis);
CREATE INDEX IF NOT EXISTS idx_wosa_stage ON work_order_stage_atama(stage_row_id);

DROP TRIGGER IF EXISTS trg_wosa_updated ON work_order_stage_atama;
CREATE TRIGGER trg_wosa_updated BEFORE UPDATE ON work_order_stage_atama
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 3. Günlük üretim (isteğe bağlı) ----------
CREATE TABLE IF NOT EXISTS work_order_gunluk_uretim (
    id           SERIAL PRIMARY KEY,
    atama_id     INTEGER NOT NULL REFERENCES work_order_stage_atama(id) ON DELETE CASCADE,
    tenant_id    UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    tarih        DATE NOT NULL,
    adet         INTEGER NOT NULL DEFAULT 0 CHECK (adet >= 0),
    hatali_adet  INTEGER NOT NULL DEFAULT 0 CHECK (hatali_adet >= 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (atama_id, tarih)
);

COMMENT ON TABLE work_order_gunluk_uretim IS
'Günlük gerçekleşen adet. İSTEĞE BAĞLI: girilirse plan/gerçek eğrisi çıkar, girilmezse aşamanın başla/bitir tarihleri yeterlidir.';

-- ---------- 4. Atölye x aşama kapasitesi ----------
CREATE TABLE IF NOT EXISTS workshop_stage_capacity (
    workshop_id      INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    stage_id         INTEGER NOT NULL REFERENCES production_stage(id) ON DELETE CASCADE,
    tenant_id        UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    gunluk_kapasite  INTEGER NOT NULL CHECK (gunluk_kapasite > 0),
    notlar           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workshop_id, stage_id)
);

COMMENT ON TABLE workshop_stage_capacity IS
'Atölyenin bir aşamadaki günlük kapasitesi (adet/gün). ELLE girilir. Kaydı yoksa o aşamanın tarihleri elle yazılır — sistem kapasite tahmin etmez.';

DROP TRIGGER IF EXISTS trg_wsc_updated ON workshop_stage_capacity;
CREATE TRIGGER trg_wsc_updated BEFORE UPDATE ON workshop_stage_capacity
    FOR EACH ROW EXECUTE FUNCTION pes_update_updated_at();

-- ---------- 5. line_schedule daralıyor ----------
COMMENT ON TABLE line_schedule IS
'YALNIZ iş emri DIŞI bloklar: bakım, izin, tatil, blok. İş emri doluluğu work_order_stage_atama''dan okunur (030).';

-- ---------- 6. RLS — 019b tenant_isolation deseni ----------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'work_order_stage_atama','work_order_gunluk_uretim','workshop_stage_capacity'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL
                USING (tenant_id = current_tenant_id() OR is_internal_admin())',
            t || '_tenant_isolation', t
        );
    END LOOP;
END $$;

-- 028: anon/authenticated public şemada yetkisiz; yeni tablolar da öyle kalsın.
REVOKE ALL ON work_order_stage_atama, work_order_gunluk_uretim, workshop_stage_capacity
    FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON
                 work_order_stage_atama, work_order_gunluk_uretim, workshop_stage_capacity
                 TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE
                 work_order_stage_atama_id_seq, work_order_gunluk_uretim_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT count(*) FROM workshop_stage_capacity;   -- 0 (elle doldurulacak)
-- node scripts/verify_public_api.mjs              -- yeni tablolar 401 dönmeli
--
-- ROLLBACK:
--   BEGIN;
--   DROP TABLE IF EXISTS work_order_gunluk_uretim;
--   DROP TABLE IF EXISTS work_order_stage_atama;
--   DROP TABLE IF EXISTS workshop_stage_capacity;
--   ALTER TABLE work_order_stage DROP COLUMN IF EXISTS workshop_id;
--   COMMIT;
-- ============================================================
```

- [ ] **Adım 2: Migration'ı uygula**

Çalıştır: `node scripts/_migrate_one.mjs 030_siparis_yerlestirme.sql`
Beklenen: `OK   030_siparis_yerlestirme.sql`

- [ ] **Adım 3: Yeni tabloların dışarı açık olmadığını doğrula**

`scripts/verify_public_api.mjs` dosyasındaki `UCLAR` dizisine ekle:

```js
  'work_order_stage_atama', 'work_order_gunluk_uretim', 'workshop_stage_capacity',
```

Çalıştır: `node scripts/verify_public_api.mjs`
Beklenen: son satır `✓ Anon anahtarıyla hiçbir uçtan veri okunamıyor.`

- [ ] **Adım 4: Commit**

```bash
git add supabase/migrations/030_siparis_yerlestirme.sql scripts/verify_public_api.mjs
git commit -m "feat(siparis): yerlestirme semasi - bant tahsisi, asama kapasitesi, gunluk uretim"
```

---

## Görev 2: Bant payları — kapasiteye orantılı bölme

**Files:**
- Create: `lib/pes/yerlestirme.ts`
- Test: `lib/pes/yerlestirme.test.ts`

- [ ] **Adım 1: Başarısız testi yaz**

`lib/pes/yerlestirme.test.ts`:

```ts
import { expect, test } from 'vitest'
import { bantPaylari } from './yerlestirme'

test('kapasiteye orantılı böler ve toplam adedi korur', () => {
  const paylar = bantPaylari(10_000, [
    { lineId: 1, gunlukHedef: 1000 },
    { lineId: 2, gunlukHedef: 500 },
  ])
  expect(paylar.map(p => p.adet)).toEqual([6667, 3333])
  expect(paylar.reduce((t, p) => t + p.adet, 0)).toBe(10_000)
})

test('yuvarlama artığı en büyük kapasiteli banda gider', () => {
  // 10 adet, 3 esit bant: 3.33 -> 3/3/3 = 9, artan 1 ilk banda
  const paylar = bantPaylari(10, [
    { lineId: 1, gunlukHedef: 100 },
    { lineId: 2, gunlukHedef: 100 },
    { lineId: 3, gunlukHedef: 100 },
  ])
  expect(paylar.reduce((t, p) => t + p.adet, 0)).toBe(10)
  expect(paylar[0].adet).toBe(4)
})

test('tek bant hepsini alır', () => {
  expect(bantPaylari(500, [{ lineId: 7, gunlukHedef: 250 }]))
    .toEqual([{ lineId: 7, gunlukHedef: 250, adet: 500 }])
})

test('gunluk hedefi 0 olan bant pay almaz', () => {
  const paylar = bantPaylari(100, [
    { lineId: 1, gunlukHedef: 100 },
    { lineId: 2, gunlukHedef: 0 },
  ])
  expect(paylar).toHaveLength(1)
  expect(paylar[0].lineId).toBe(1)
})

test('hicbir bantta kapasite yoksa hata verir', () => {
  expect(() => bantPaylari(100, [{ lineId: 1, gunlukHedef: 0 }]))
    .toThrow('kapasitesi tanımlı bant yok')
})
```

- [ ] **Adım 2: Testin başarısız olduğunu gör**

Çalıştır: `npx vitest run lib/pes/yerlestirme.test.ts`
Beklenen: FAIL — `Failed to resolve import "./yerlestirme"`

- [ ] **Adım 3: En küçük uygulamayı yaz**

`lib/pes/yerlestirme.ts`:

```ts
/* Sipariş yerleştirme — SAF hesap katmanı.
   Bu dosya veritabanı bilmez. Sebebi: bölme ve geriye planlama bu işin
   en kırılgan kısmı; DB olmadan test edilebilmesi hızlı doğrulamanın
   tek yolu. Kalıcılık lib/pes/yerlestir-kaydet.ts'te. */

export type BantKapasite = { lineId: number; gunlukHedef: number }
export type BantPay = BantKapasite & { adet: number }

/**
 * Adedi bantlara KAPASİTEYE ORANTILI böler (tasarım K9).
 * Amaç bütün bantların aynı gün bitmesi: hızlı bant daha çok alır.
 *
 * Yuvarlama artığı en büyük kapasiteli banda eklenir — toplam adet
 * her zaman korunur, aksi halde sipariş miktarı sessizce eksilir.
 * Kapasitesi 0 olan bant hiç pay almaz (sonsuz süre demek olurdu).
 */
export function bantPaylari(adet: number, bantlar: BantKapasite[]): BantPay[] {
  const uygun = bantlar.filter(b => b.gunlukHedef > 0)
  if (uygun.length === 0) throw new Error('Bölme yapılamaz: kapasitesi tanımlı bant yok')

  const toplamHedef = uygun.reduce((t, b) => t + b.gunlukHedef, 0)
  const paylar: BantPay[] = uygun.map(b => ({
    ...b,
    adet: Math.floor((adet * b.gunlukHedef) / toplamHedef),
  }))

  const artik = adet - paylar.reduce((t, p) => t + p.adet, 0)
  if (artik > 0) {
    const enBuyuk = paylar.reduce((a, b) => (b.gunlukHedef > a.gunlukHedef ? b : a))
    enBuyuk.adet += artik
  }
  return paylar
}
```

- [ ] **Adım 4: Testin geçtiğini gör**

Çalıştır: `npx vitest run lib/pes/yerlestirme.test.ts`
Beklenen: `Tests  5 passed (5)`

- [ ] **Adım 5: Commit**

```bash
git add lib/pes/yerlestirme.ts lib/pes/yerlestirme.test.ts
git commit -m "feat(siparis): bant paylari - kapasiteye orantili bolme"
```

---

## Görev 3: Aşama süresi

**Files:**
- Modify: `lib/pes/yerlestirme.ts`
- Modify: `lib/pes/yerlestirme.test.ts`

- [ ] **Adım 1: Başarısız testi yaz**

`lib/pes/yerlestirme.test.ts` dosyasının SONUNA ekle:

```ts
import { asamaGunu } from './yerlestirme'

test('sure yukari yuvarlanir', () => {
  expect(asamaGunu(10_000, 1000)).toBe(10)
  expect(asamaGunu(10_001, 1000)).toBe(11)
  expect(asamaGunu(1, 1000)).toBe(1)
})

test('kapasite yoksa null doner - tarih elle girilecek', () => {
  expect(asamaGunu(10_000, null)).toBeNull()
  expect(asamaGunu(10_000, 0)).toBeNull()
})
```

Not: `import` satırını dosyanın en üstündeki mevcut import ile birleştir:
`import { bantPaylari, asamaGunu } from './yerlestirme'`

- [ ] **Adım 2: Testin başarısız olduğunu gör**

Çalıştır: `npx vitest run lib/pes/yerlestirme.test.ts`
Beklenen: FAIL — `asamaGunu is not a function`

- [ ] **Adım 3: Uygulamayı yaz**

`lib/pes/yerlestirme.ts` sonuna ekle:

```ts
/**
 * Bir aşamanın kaç gün süreceği.
 *
 * gunlukKapasite null veya 0 ise NULL döner: sistem tarih üretmez,
 * kullanıcı "girer/çıkar" tarihini elle yazar (tasarım K2). Buraya
 * varsayılan bir kapasite uydurmak, olmayan bir bilgiyi varmış gibi
 * göstermek olurdu.
 */
export function asamaGunu(adet: number, gunlukKapasite: number | null): number | null {
  if (!gunlukKapasite || gunlukKapasite <= 0) return null
  return Math.max(1, Math.ceil(adet / gunlukKapasite))
}
```

- [ ] **Adım 4: Testin geçtiğini gör**

Çalıştır: `npx vitest run lib/pes/yerlestirme.test.ts`
Beklenen: `Tests  7 passed (7)`

- [ ] **Adım 5: Commit**

```bash
git add lib/pes/yerlestirme.ts lib/pes/yerlestirme.test.ts
git commit -m "feat(siparis): asama suresi hesabi"
```

---

## Görev 4: Geriye doğru planlama

**Files:**
- Modify: `lib/pes/yerlestirme.ts`
- Modify: `lib/pes/yerlestirme.test.ts`

- [ ] **Adım 1: Başarısız testi yaz**

`lib/pes/yerlestirme.test.ts` sonuna ekle:

```ts
import { geriyePlanla, type AsamaGirdi } from './yerlestirme'

const ASAMALAR: AsamaGirdi[] = [
  { stageId: 1, kod: 'KESIM', siraNo: 10, gun: 2 },
  { stageId: 3, kod: 'DIKIM', siraNo: 20, gun: 5 },
  { stageId: 10, kod: 'UKP', siraNo: 50, gun: 1 },
]

test('teslimden geriye kurar, son asama teslimde biter', () => {
  const p = geriyePlanla('2026-09-30', ASAMALAR, '2026-08-06')
  const ukp = p.pencereler.find(x => x.kod === 'UKP')!
  expect(ukp.bitis).toBe('2026-09-30')
  expect(ukp.baslangic).toBe('2026-09-30')   // 1 gun
})

test('asamalar sira_no tersine dizilir ve cakismaz', () => {
  const p = geriyePlanla('2026-09-30', ASAMALAR, '2026-08-06')
  const kesim = p.pencereler.find(x => x.kod === 'KESIM')!
  const dikim = p.pencereler.find(x => x.kod === 'DIKIM')!
  const ukp = p.pencereler.find(x => x.kod === 'UKP')!
  expect(dikim.bitis < ukp.baslangic).toBe(true)
  expect(kesim.bitis < dikim.baslangic).toBe(true)
  expect(dikim.baslangic).toBe('2026-09-25')  // 5 gun: 25,26,27,28,29
  expect(dikim.bitis).toBe('2026-09-29')
})

test('bugunden onceye dusen zincir yetismiyor olarak isaretlenir', () => {
  const p = geriyePlanla('2026-08-10', ASAMALAR, '2026-08-06')
  // toplam 8 gun gerek, 5 gun var
  expect(p.yetisiyor).toBe(false)
  expect(p.pencereler[0].baslangic < '2026-08-06').toBe(true)
})

test('bol zaman varsa yetisiyor', () => {
  const p = geriyePlanla('2026-12-31', ASAMALAR, '2026-08-06')
  expect(p.yetisiyor).toBe(true)
})

test('suresi bilinmeyen asama pencere almaz', () => {
  const p = geriyePlanla('2026-09-30', [
    { stageId: 3, kod: 'DIKIM', siraNo: 20, gun: 5 },
    { stageId: 4, kod: 'YIKAMA', siraNo: 30, gun: null },
  ], '2026-08-06')
  const yikama = p.pencereler.find(x => x.kod === 'YIKAMA')!
  expect(yikama.baslangic).toBeNull()
  expect(yikama.bitis).toBeNull()
  expect(p.elleTarihGereken).toEqual(['YIKAMA'])
})
```

- [ ] **Adım 2: Testin başarısız olduğunu gör**

Çalıştır: `npx vitest run lib/pes/yerlestirme.test.ts`
Beklenen: FAIL — `geriyePlanla is not a function`

- [ ] **Adım 3: Uygulamayı yaz**

`lib/pes/yerlestirme.ts` sonuna ekle:

```ts
export type AsamaGirdi = {
  stageId: number
  kod: string
  siraNo: number
  /** null = kapasite tanımsız, tarih elle girilecek */
  gun: number | null
}

export type AsamaPencere = {
  stageId: number
  kod: string
  siraNo: number
  baslangic: string | null
  bitis: string | null
}

export type PlanSonucu = {
  pencereler: AsamaPencere[]
  /** Zincir bugünden önce başlamak zorunda kaldıysa false */
  yetisiyor: boolean
  /** Kapasitesi tanımsız olduğu için tarihi elle girilecek aşamalar */
  elleTarihGereken: string[]
}

/** 'YYYY-MM-DD' + gün. Date nesnesi döndürmez: bu projede DATE'in
    Date'e dönüşmesi daha önce arayüzü çökertti, metin kalması güvenli. */
export function gunEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split('-').map(Number)
  const d = new Date(Date.UTC(y, a - 1, g))
  d.setUTCDate(d.getUTCDate() + gun)
  return d.toISOString().slice(0, 10)
}

/**
 * Zinciri TESLİM TARİHİNDEN GERİYE kurar (tasarım K8).
 *
 * Son aşama teslim tarihinde biter, her aşama bir öncekinin
 * başlangıcından bir gün önce biter. Aralarında boşluk kalması normaldir
 * (yıkamada sıra beklemek gerçek bir durum) ama geriye planlamada boşluk
 * kendiliğinden oluşmaz; en sıkı yerleşim üretilir.
 *
 * Zincir bugünden öncesine düşerse plan YİNE kurulur, sadece
 * yetisiyor=false olur. Sessizce bugüne kaydırmak, yetişmediğini
 * gizlemek olurdu.
 *
 * Süresi bilinmeyen aşama pencere almaz ve elleTarihGereken'e düşer;
 * zincirin kalanı sanki o aşama sıfır gün sürüyormuş gibi devam eder.
 */
export function geriyePlanla(
  teslimTarihi: string,
  asamalar: AsamaGirdi[],
  bugun: string,
): PlanSonucu {
  const sirali = [...asamalar].sort((a, b) => b.siraNo - a.siraNo)  // sondan başa
  const pencereler: AsamaPencere[] = []
  const elleTarihGereken: string[] = []

  let imlec = teslimTarihi   // bu tarihte veya öncesinde bitmeli

  for (const a of sirali) {
    if (a.gun === null) {
      elleTarihGereken.push(a.kod)
      pencereler.push({ stageId: a.stageId, kod: a.kod, siraNo: a.siraNo, baslangic: null, bitis: null })
      continue
    }
    const bitis = imlec
    const baslangic = gunEkle(bitis, -(a.gun - 1))
    pencereler.push({ stageId: a.stageId, kod: a.kod, siraNo: a.siraNo, baslangic, bitis })
    imlec = gunEkle(baslangic, -1)   // bir önceki aşama bundan önce bitmeli
  }

  pencereler.sort((a, b) => a.siraNo - b.siraNo)

  const ilkBaslangic = pencereler.find(p => p.baslangic !== null)?.baslangic ?? null
  const yetisiyor = ilkBaslangic === null ? true : ilkBaslangic >= bugun

  return { pencereler, yetisiyor, elleTarihGereken }
}
```

- [ ] **Adım 4: Testin geçtiğini gör**

Çalıştır: `npx vitest run lib/pes/yerlestirme.test.ts`
Beklenen: `Tests  12 passed (12)`

- [ ] **Adım 5: Commit**

```bash
git add lib/pes/yerlestirme.ts lib/pes/yerlestirme.test.ts
git commit -m "feat(siparis): teslimden geriye zincir planlamasi"
```

---

## Görev 5: Aday atölye puanlaması

**Files:**
- Create: `lib/pes/aday-atolye.ts`
- Test: `lib/pes/aday-atolye.test.ts`

- [ ] **Adım 1: Başarısız testi yaz**

`lib/pes/aday-atolye.test.ts`:

```ts
import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { adayAtolyeler, AGIRLIK } from './aday-atolye'

/* Gerçek veritabanına bağlanır: puanlama dört ayrı tablodan besleniyor
   (tahsisler, line_capability, v_atolye_denetim_durum, workshop_profil)
   ve RLS altında çalışıyor. Sahte veriyle test etmek hiçbir şey kanıtlamaz. */
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 15 })

let defaultTenant: string
beforeAll(async () => {
  const [d] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  defaultTenant = d.id
})
afterAll(async () => { await yonetici.end(); await uygulama.end() })

function tenantIcinde<T>(fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${defaultTenant}, true)`
    return fn(tx)
  }) as Promise<T>
}

test('aday listesi doner ve puana gore sirali', async () => {
  const adaylar = await tenantIcinde(sql =>
    adayAtolyeler(sql, { adet: 5000, teslimTarihi: '2026-12-31', bugun: '2026-08-06' }))

  expect(adaylar.length).toBeGreaterThan(0)
  for (let i = 1; i < adaylar.length; i++) {
    expect(adaylar[i - 1].puan).toBeGreaterThanOrEqual(adaylar[i].puan)
  }
})

test('pasif atolye aday olmaz', async () => {
  const adaylar = await tenantIcinde(sql =>
    adayAtolyeler(sql, { adet: 5000, teslimTarihi: '2026-12-31', bugun: '2026-08-06' }))
  const pasifler = await tenantIcinde(sql =>
    sql`SELECT id FROM workshop WHERE NOT is_active`)
  const pasifIdler = new Set(pasifler.map(r => r.id as number))
  expect(adaylar.some(a => pasifIdler.has(a.workshopId))).toBe(false)
})

test('denetimi dolmus atolye uyari tasir', async () => {
  const adaylar = await tenantIcinde(sql =>
    adayAtolyeler(sql, { adet: 5000, teslimTarihi: '2026-12-31', bugun: '2026-08-06' }))
  const uyarili = adaylar.filter(a => a.uyarilar.some(u => u.includes('denetim')))
  expect(uyarili.length).toBeGreaterThan(0)
})

test('agirliklar toplami 100', () => {
  const toplam = Object.values(AGIRLIK).reduce((t, v) => t + v, 0)
  expect(toplam).toBe(100)
})
```

- [ ] **Adım 2: Testin başarısız olduğunu gör**

Çalıştır: `npx vitest run lib/pes/aday-atolye.test.ts`
Beklenen: FAIL — `Failed to resolve import "./aday-atolye"`

- [ ] **Adım 3: Uygulamayı yaz**

`lib/pes/aday-atolye.ts`:

```ts
import type postgres from 'postgres'
import { asamaGunu } from './yerlestirme'

/* Aday atölye puanlaması (tasarım K10, 5.6).

   Ağırlıklar burada, tek yerde. Koda gömülmemesinin sebebi: hangi
   ölçütün ne kadar ağır bastığı kullanımla ayarlanacak bir şey; her
   ayarda dosya aramak zorunda kalınmamalı. */
export const AGIRLIK = {
  doluluk: 40,   // bant boşluğu — asıl ölçüt
  yetenek: 30,   // line_capability eşleşmesi
  denetim: 20,   // v_atolye_denetim_durum
  tedarik: 10,   // tedarik müdürlüğü / bölge yakınlığı
} as const

export type AdayIstek = {
  adet: number
  teslimTarihi: string
  bugun: string
  /** Verilirse bu tedarik müdürlüğündeki atölyeler puan alır */
  tedarikMudurlugu?: string | null
}

export type Aday = {
  workshopId: number
  kod: string
  ad: string
  toplamGunlukHedef: number
  gerekenGun: number | null
  yetisiyor: boolean
  puan: number
  uyarilar: string[]
}

type Satir = {
  id: number
  code: string
  name: string
  toplam_hedef: number | null
  dolu_gun: number | null
  denetim_dolmus: number | null
  yetenek_kaydi: number | null
  tedarik_mudurlugu: string | null
}

/**
 * Adayları puanlayıp sıralar. Yetişmeyen atölye listeden ATILMAZ —
 * en alta düşer ve işaretlenir; kullanıcı "hiç aday yok" ile
 * karşılaşmamalı, neden yetişmediğini görmeli.
 */
export async function adayAtolyeler(
  sql: postgres.TransactionSql,
  istek: AdayIstek,
): Promise<Aday[]> {
  const satirlar = await sql`
    SELECT
      w.id, w.code, w.name,
      (SELECT COALESCE(SUM(pl.daily_target), 0)::int
         FROM production_line pl
        WHERE pl.workshop_id = w.id AND pl.is_active)             AS toplam_hedef,
      (SELECT COUNT(*)::int
         FROM work_order_stage_atama a
         JOIN production_line pl2 ON pl2.id = a.line_id
        WHERE pl2.workshop_id = w.id
          AND a.plan_bitis >= ${istek.bugun}::date
          AND a.plan_baslangic <= ${istek.teslimTarihi}::date)     AS dolu_gun,
      (SELECT COUNT(*)::int
         FROM v_atolye_denetim_durum d
        WHERE d.workshop_id = w.id AND d.durum = 'SURESI_DOLMUS')  AS denetim_dolmus,
      (SELECT COUNT(*)::int
         FROM line_capability lc
         JOIN production_line pl3 ON pl3.id = lc.line_id
        WHERE pl3.workshop_id = w.id)                              AS yetenek_kaydi,
      p.tedarik_mudurlugu
    FROM workshop w
    LEFT JOIN workshop_profil p ON p.workshop_id = w.id
    WHERE w.is_active
    ORDER BY w.code` as unknown as Satir[]

  const enCokYetenek = Math.max(1, ...satirlar.map(s => Number(s.yetenek_kaydi ?? 0)))
  const enCokDolu = Math.max(1, ...satirlar.map(s => Number(s.dolu_gun ?? 0)))

  const adaylar: Aday[] = satirlar.map(s => {
    const hedef = Number(s.toplam_hedef ?? 0)
    const gerekenGun = asamaGunu(istek.adet, hedef)
    const uyarilar: string[] = []

    // 1) Doluluk + yetişme
    let dolulukPuan = 0
    let yetisiyor = false
    if (gerekenGun === null) {
      uyarilar.push('Aktif bandı veya günlük hedefi yok')
    } else {
      const kalanGun = gunFarki(istek.bugun, istek.teslimTarihi) + 1
      yetisiyor = gerekenGun <= kalanGun
      if (!yetisiyor) uyarilar.push(`Teslime yetişmiyor — ${gerekenGun} gün gerekiyor, ${kalanGun} gün var`)
      const bosluk = 1 - Number(s.dolu_gun ?? 0) / enCokDolu
      dolulukPuan = (yetisiyor ? 1 : 0) * bosluk * AGIRLIK.doluluk
    }

    // 2) Yetenek
    const yetenekPuan = (Number(s.yetenek_kaydi ?? 0) / enCokYetenek) * AGIRLIK.yetenek

    // 3) Denetim
    const dolmus = Number(s.denetim_dolmus ?? 0)
    if (dolmus > 0) uyarilar.push(`${dolmus} denetimin süresi dolmuş`)
    const denetimPuan = dolmus === 0 ? AGIRLIK.denetim : 0

    // 4) Tedarik müdürlüğü
    const tedarikPuan = istek.tedarikMudurlugu && s.tedarik_mudurlugu === istek.tedarikMudurlugu
      ? AGIRLIK.tedarik : 0

    return {
      workshopId: s.id,
      kod: s.code,
      ad: s.name,
      toplamGunlukHedef: hedef,
      gerekenGun,
      yetisiyor,
      puan: Math.round(dolulukPuan + yetenekPuan + denetimPuan + tedarikPuan),
      uyarilar,
    }
  })

  return adaylar.sort((a, b) => b.puan - a.puan)
}

function gunFarki(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((t(b) - t(a)) / 86_400_000)
}
```

- [ ] **Adım 4: Testin geçtiğini gör**

Çalıştır: `npx vitest run lib/pes/aday-atolye.test.ts`
Beklenen: `Tests  4 passed (4)`

- [ ] **Adım 5: Commit**

```bash
git add lib/pes/aday-atolye.ts lib/pes/aday-atolye.test.ts
git commit -m "feat(siparis): aday atolye puanlamasi - doluluk, yetenek, denetim, tedarik"
```

---

## Görev 6: Yerleştirmeyi kaydet

**Files:**
- Create: `lib/pes/yerlestir-kaydet.ts`
- Test: `lib/pes/yerlestir-kaydet.test.ts`

- [ ] **Adım 1: Başarısız testi yaz**

`lib/pes/yerlestir-kaydet.test.ts`:

```ts
import { afterAll, beforeAll, afterEach, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { yerlestir } from './yerlestir-kaydet'

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
const KOD = 'ZZTESTYRL'

beforeAll(async () => {
  const [d] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  defaultTenant = d.id
  await temizle()
  const [w] = await yonetici`
    INSERT INTO workshop (tenant_id, code, name, type, total_staff, sewing_staff, ukp_staff,
                          cutting_staff, management, indirect, line_count, daily_target, net_hours_day)
    VALUES (${defaultTenant}, ${KOD}, 'Yerlestirme Testi', 'X', 0,0,0,0,0,0,2,0,9)
    RETURNING id`
  wsId = w.id
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

async function temizle() {
  await yonetici`DELETE FROM work_order WHERE workshop_id IN (SELECT id FROM workshop WHERE code = ${KOD})`
  await yonetici`DELETE FROM production_line WHERE code LIKE ${KOD + '%'}`
  await yonetici`DELETE FROM workshop WHERE code = ${KOD}`
}

function tenantIcinde<T>(fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${defaultTenant}, true)`
    return fn(tx)
  }) as Promise<T>
}

test('siparis, zincir ve bant tahsisleri tek seferde yazilir', async () => {
  const sonuc = await tenantIcinde(sql => yerlestir(sql, defaultTenant, {
    siparisNo: 'ZZ-001', musteri: 'Test', modelAdi: 'M1',
    adet: 10_000, teslimTarihi: '2026-12-31', bugun: '2026-08-06',
    workshopId: wsId, lineIds,
    asamaKodlari: ['KESIM', 'DIKIM', 'UKP'],
  }))

  expect(sonuc.workOrderId).toBeGreaterThan(0)
  expect(sonuc.yetisiyor).toBe(true)

  const asamalar = await tenantIcinde(sql =>
    sql`SELECT ps.code, wos.id FROM work_order_stage wos
        JOIN production_stage ps ON ps.id = wos.stage_id
        WHERE wos.work_order_id = ${sonuc.workOrderId} ORDER BY ps.sira_no`)
  expect(asamalar.map(a => a.code)).toEqual(['KESIM', 'DIKIM', 'UKP'])

  const tahsis = await tenantIcinde(sql =>
    sql`SELECT a.adet, a.line_id FROM work_order_stage_atama a
        JOIN work_order_stage wos ON wos.id = a.stage_row_id
        WHERE wos.work_order_id = ${sonuc.workOrderId} ORDER BY a.adet DESC`)
  expect(tahsis).toHaveLength(2)
  expect(Number(tahsis[0].adet) + Number(tahsis[1].adet)).toBe(10_000)
  expect(Number(tahsis[0].adet)).toBe(6667)
})

test('tarihler metin olarak doner, Date nesnesi degil', async () => {
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

test('yetismeyen siparis yine yazilir ama isaretli', async () => {
  const sonuc = await tenantIcinde(sql => yerlestir(sql, defaultTenant, {
    siparisNo: 'ZZ-003', musteri: 'Test', modelAdi: 'M1',
    adet: 100_000, teslimTarihi: '2026-08-10', bugun: '2026-08-06',
    workshopId: wsId, lineIds,
    asamaKodlari: ['DIKIM'],
  }))
  expect(sonuc.yetisiyor).toBe(false)
  expect(sonuc.workOrderId).toBeGreaterThan(0)
})
```

- [ ] **Adım 2: Testin başarısız olduğunu gör**

Çalıştır: `npx vitest run lib/pes/yerlestir-kaydet.test.ts`
Beklenen: FAIL — `Failed to resolve import "./yerlestir-kaydet"`

- [ ] **Adım 3: Uygulamayı yaz**

`lib/pes/yerlestir-kaydet.ts`:

```ts
import type postgres from 'postgres'
import { bantPaylari, asamaGunu, geriyePlanla, type AsamaGirdi } from './yerlestirme'

export type YerlestirIstek = {
  siparisNo: string
  musteri: string
  modelAdi: string
  adet: number
  teslimTarihi: string
  bugun: string
  workshopId: number
  /** Dikim aşamasının paylaştırılacağı bantlar (tasarım K1: tek atölye) */
  lineIds: number[]
  /** İşaretlenen zincir, ör. ['KESIM','DIKIM','YIKAMA','UKP','SEVK'] */
  asamaKodlari: string[]
}

export type YerlestirSonuc = {
  workOrderId: number
  yetisiyor: boolean
  elleTarihGereken: string[]
}

/**
 * Siparişi, zincirini ve bant tahsislerini TEK transaction'da yazar.
 *
 * sql bir TRANSACTION handle'ı olmalı (withTenant/withTenantRoute içi).
 * Yarım kalmış plan diye bir şey olmamalı: aşamalar yazılıp tahsisler
 * yazılmazsa sipariş sistemde "planlanmış ama hiçbir bantta değil"
 * olarak kalır ve kimse fark etmez.
 */
export async function yerlestir(
  sql: postgres.TransactionSql,
  tenantId: string,
  istek: YerlestirIstek,
): Promise<YerlestirSonuc> {
  // 1) Bantların günlük hedefleri
  const bantlar = await sql`
    SELECT id, COALESCE(daily_target, 0)::int AS daily_target
    FROM production_line
    WHERE id = ANY(${istek.lineIds}) AND workshop_id = ${istek.workshopId} AND is_active`
  if (bantlar.length === 0) throw new Error('Seçilen bantlar bu atölyede bulunamadı')

  const paylar = bantPaylari(istek.adet, bantlar.map(b => ({
    lineId: b.id as number, gunlukHedef: Number(b.daily_target),
  })))
  const dikimGunu = asamaGunu(istek.adet, paylar.reduce((t, p) => t + p.gunlukHedef, 0))

  // 2) Aşama tanımları + atölyenin aşama kapasiteleri
  const stageRows = await sql`
    SELECT ps.id, ps.code, ps.sira_no, c.gunluk_kapasite
    FROM production_stage ps
    LEFT JOIN workshop_stage_capacity c
           ON c.stage_id = ps.id AND c.workshop_id = ${istek.workshopId}
    WHERE ps.code = ANY(${istek.asamaKodlari})
    ORDER BY ps.sira_no`
  if (stageRows.length !== istek.asamaKodlari.length) {
    throw new Error('Bilinmeyen aşama kodu var')
  }

  const girdiler: AsamaGirdi[] = stageRows.map(r => ({
    stageId: r.id as number,
    kod: r.code as string,
    siraNo: Number(r.sira_no),
    gun: r.code === 'DIKIM'
      ? dikimGunu
      : asamaGunu(istek.adet, r.gunluk_kapasite === null ? null : Number(r.gunluk_kapasite)),
  }))

  const plan = geriyePlanla(istek.teslimTarihi, girdiler, istek.bugun)

  /* 3) Sipariş.
     work_order'ın NOT NULL kolonları (doğrulandı): is_emri_no,
     workshop_id, model_adi, siparis_miktari, tenant_id — hepsi burada.
     durum CHECK listesi: Taslak / Planlandi / Bekleniyor / Devam /
     Duraklatildi / Tamamlandi / İptal / Sevk Edildi. */
  const [wo] = await sql`
    INSERT INTO work_order ${sql({
      tenant_id: tenantId,
      is_emri_no: istek.siparisNo,
      siparis_no: istek.siparisNo,
      workshop_id: istek.workshopId,
      musteri: istek.musteri,
      model_adi: istek.modelAdi,
      siparis_miktari: istek.adet,
      teslim_tarihi: istek.teslimTarihi,
      baslangic_tarihi: plan.pencereler.find(p => p.baslangic)?.baslangic ?? null,
      bitis_tarihi: istek.teslimTarihi,
      durum: 'Planlandi',
    })}
    RETURNING id`
  const workOrderId = wo.id as number

  // 4) Zincir + tahsisler
  for (const p of plan.pencereler) {
    const [stage] = await sql`
      INSERT INTO work_order_stage ${sql({
        work_order_id: workOrderId,
        stage_id: p.stageId,
        sira_no: p.siraNo,
        workshop_id: istek.workshopId,
        plan_baslangic: p.baslangic,
        plan_bitis: p.bitis,
        durum: 'Beklemede',
      })}
      RETURNING id`

    if (p.kod !== 'DIKIM' || p.baslangic === null || p.bitis === null) continue

    for (const pay of paylar) {
      await sql`INSERT INTO work_order_stage_atama ${sql({
        stage_row_id: stage.id as number,
        tenant_id: tenantId,
        line_id: pay.lineId,
        adet: pay.adet,
        plan_baslangic: p.baslangic,
        plan_bitis: p.bitis,
      })}`
    }
  }

  return { workOrderId, yetisiyor: plan.yetisiyor, elleTarihGereken: plan.elleTarihGereken }
}
```

- [ ] **Adım 4: Testin geçtiğini gör**

Çalıştır: `npx vitest run lib/pes/yerlestir-kaydet.test.ts`
Beklenen: `Tests  3 passed (3)`

- [ ] **Adım 5: Commit**

```bash
git add lib/pes/yerlestir-kaydet.ts lib/pes/yerlestir-kaydet.test.ts
git commit -m "feat(siparis): yerlestirmeyi tek transaction'da kaydet"
```

---

## Görev 7: API ucu

**Files:**
- Create: `app/api/pes/work-orders/yerlestir/route.ts`

- [ ] **Adım 1: Route'u yaz**

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { adayAtolyeler } from '@/lib/pes/aday-atolye'
import { yerlestir } from '@/lib/pes/yerlestir-kaydet'

/**
 * GET  /api/pes/work-orders/yerlestir?adet=10000&teslim=2026-12-31
 *        → puanlanmış aday atölye listesi (sihirbaz 3. adım)
 * POST /api/pes/work-orders/yerlestir
 *        → siparişi, zincirini ve bant tahsislerini yazar (sihirbaz 7. adım)
 */

function bugun(): string {
  return new Date().toISOString().slice(0, 10)
}

export const GET = withTenantRoute(async (req, { sql }) => {
  const u = new URL(req.url)
  const adet = Number(u.searchParams.get('adet'))
  const teslim = u.searchParams.get('teslim') ?? ''

  if (!Number.isFinite(adet) || adet <= 0) {
    return NextResponse.json({ error: 'adet gerekli' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(teslim)) {
    return NextResponse.json({ error: 'teslim tarihi gerekli (YYYY-MM-DD)' }, { status: 400 })
  }

  const adaylar = await adayAtolyeler(sql, {
    adet,
    teslimTarihi: teslim,
    bugun: bugun(),
    tedarikMudurlugu: u.searchParams.get('tedarik'),
  })
  return NextResponse.json({ adaylar })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()

  /* modelAdi burada: work_order.model_adi NOT NULL. Boş dize NOT NULL'ı
     geçer ama sipariş "adı olmayan model" olarak kayda girer — sessiz
     bozuk veri. İstemciden zorunlu istemek doğrusu. */
  const eksik = ['siparisNo', 'modelAdi', 'adet', 'teslimTarihi', 'workshopId', 'lineIds', 'asamaKodlari']
    .filter(k => b[k] === undefined || b[k] === null || b[k] === '')
  if (eksik.length) {
    return NextResponse.json({ error: `Eksik alan: ${eksik.join(', ')}` }, { status: 400 })
  }
  if (!Array.isArray(b.lineIds) || b.lineIds.length === 0) {
    return NextResponse.json({ error: 'En az bir bant seçilmeli' }, { status: 400 })
  }

  try {
    const sonuc = await yerlestir(sql, tenant.tenantId, {
      siparisNo: String(b.siparisNo),
      musteri: String(b.musteri ?? ''),
      modelAdi: String(b.modelAdi ?? ''),
      adet: Number(b.adet),
      teslimTarihi: String(b.teslimTarihi),
      bugun: bugun(),
      workshopId: Number(b.workshopId),
      lineIds: b.lineIds.map(Number),
      asamaKodlari: b.asamaKodlari.map(String),
    })
    return NextResponse.json(sonuc)
  } catch (err) {
    /* Teknik ayrıntı log'a, kullanıcıya tek cümle. */
    console.error('[yerlestir]', err)
    const msg = err instanceof Error ? err.message : 'Yerleştirme başarısız'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
})
```

- [ ] **Adım 2: Tip kontrolü ve derleme**

Çalıştır: `npx tsc --noEmit`
Beklenen: çıktı yok

Çalıştır: `npx next build`
Beklenen: `✓ Compiled successfully` ve rota listesinde `/api/pes/work-orders/yerlestir`

- [ ] **Adım 3: Tüm testleri çalıştır**

Çalıştır: `npm test`
Beklenen: mevcut 378 test + bu plandaki 12 test geçer

- [ ] **Adım 4: Commit**

```bash
git add app/api/pes/work-orders/yerlestir/route.ts
git commit -m "feat(siparis): yerlestirme API ucu - aday listesi ve yerlestirme"
```

---

## Görev 8: Aşama zinciri seçilebilir olsun

**Files:**
- Create: `supabase/migrations/030b_wo_init_stages_secilebilir.sql`

`wo_init_stages()` şu an yalnız `zorunlu=TRUE` aşamaları açıyor (Kesim, Dikim, UKP); yıkama ve sevk hiç açılmıyor. Görev 6 zinciri kendisi yazdığı için bu fonksiyon artık yeni siparişlerde kullanılmıyor, ama elle çağrılabildiği için kodda kalıyor ve yanlış zincir kurabiliyor.

- [ ] **Adım 1: Migration'ı yaz**

```sql
-- ============================================================
-- Migration 030b — wo_init_stages seçilebilir zincir alır
-- ============================================================
-- 017'deki hali yalnız zorunlu=TRUE aşamaları açıyordu; yıkama ve sevk
-- hiç açılmıyordu. Artık zincir sipariş bazında seçiliyor (030 / Görev 6),
-- bu fonksiyon da aynı zinciri kabul etmeli. Parametre verilmezse eski
-- davranışı sürdürür — mevcut çağıranlar bozulmasın.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION wo_init_stages(
    p_wo_id INTEGER,
    p_kodlar TEXT[] DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  ins_count INTEGER := 0;
BEGIN
  INSERT INTO work_order_stage (work_order_id, stage_id, sira_no, durum)
  SELECT p_wo_id, ps.id, ps.sira_no, 'Beklemede'
  FROM production_stage ps
  WHERE (CASE WHEN p_kodlar IS NULL THEN ps.zorunlu ELSE ps.code = ANY(p_kodlar) END)
    AND NOT EXISTS (
      SELECT 1 FROM work_order_stage wos
      WHERE wos.work_order_id = p_wo_id AND wos.stage_id = ps.id
    );
  GET DIAGNOSTICS ins_count = ROW_COUNT;
  RETURN ins_count;
END;
$$;

COMMENT ON FUNCTION wo_init_stages(INTEGER, TEXT[]) IS
'İş emrinin aşama zincirini açar. p_kodlar verilirse o zincir, verilmezse zorunlu aşamalar.';

COMMIT;

-- DOĞRULAMA:
--   SELECT wo_init_stages(<test_wo_id>, ARRAY['KESIM','DIKIM','YIKAMA','UKP','SEVK']);
--   -- 5 dönmeli
```

- [ ] **Adım 2: Migration'ı uygula**

Çalıştır: `node scripts/_migrate_one.mjs 030b_wo_init_stages_secilebilir.sql`
Beklenen: `OK   030b_wo_init_stages_secilebilir.sql`

- [ ] **Adım 3: Eski imzanın hâlâ çalıştığını doğrula**

Çalıştır: `npm test`
Beklenen: tüm testler geçer (mevcut çağıranlar bozulmadı)

- [ ] **Adım 4: Commit**

```bash
git add supabase/migrations/030b_wo_init_stages_secilebilir.sql
git commit -m "feat(siparis): wo_init_stages secilebilir zincir kabul ediyor"
```

---

## Faz 1 bitiş kontrolü

- [ ] `npm test` — mevcut 378 + yeni 12 test geçiyor
- [ ] `npx tsc --noEmit` — çıktı yok
- [ ] `npx next build` — başarılı
- [ ] `node scripts/verify_public_api.mjs` — yeni üç tablo 401 dönüyor
- [ ] `node scripts/verify_tenant_isolation.mjs` — RLS izolasyonu bozulmadı

## Faz 1'in KAPSAMADIĞI

Bunlar Faz 2'nin planına girecek — burada yapılmadıkları bilinçli:

- Sihirbaz arayüzü (7 adım)
- Dış atölye seçimi (K4/K5) — şema hazır (`work_order_stage.workshop_id`), akış yok
- Kapasitesiz aşamalar için elle tarih girişi (K2) — `geriyePlanla` bunları
  `elleTarihGereken` olarak işaretliyor, girecek ekran yok
- Malzeme uyarısı (K3) — hesap Faz 2'de, veri zaten `work_order_material`'da
- Günlük üretim girişi (K6) — tablo var, ekran yok
- Atölye kapasite tanımlama ekranı (K2) — tablo var, ekran yok
- Bant çakışma kontrolü (5.4) — Faz 1 tahsisi yazar ama mevcut tahsislerle
  çakışıp çakışmadığını kontrol etmez. **Bu, Faz 2'nin ilk işi olmalı:**
  çakışma kontrolü olmadan iki sipariş aynı bandı aynı gün kullanabilir.
