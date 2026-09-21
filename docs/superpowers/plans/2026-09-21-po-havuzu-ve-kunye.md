# PO Havuzu ve Künye Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gelen PO'yu atölyeye atamadan havuza yazmak, künyesini katalogdan seçmek ve sihirbazla havuzdan yerleştirmek — 035'in `work_order`/`work_order_stage` sızıntısını kapatarak.

**Architecture:** Tek kayıt: `work_order` havuzda doğar (`workshop_id NULL`, `durum='Taslak'`), yerleştirme aynı satırı günceller. Künye doğrulama `lib/pes/kunye.ts`'de tek yerde; havuz uçları ve sihirbaz aynı fonksiyonu çağırır. RLS iki tablo için özel politikayla düzeltilir ve doğrudan testle kanıtlanır.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, postgres.js, Vitest, Tailwind (PES jetonları).

**Spec:** `docs/superpowers/specs/2026-09-21-po-havuzu-ve-kunye-design.md`
**Dal:** `feat/po-havuzu`

---

## Durum

**5/9 görev.** Havuz uçları ve sihirbaz UPDATE modu bitti. Sıradaki **Task 6** (aday-atolye kodlarla). Ek: 038b — durum geçmişi tetikleyicisi tenant_id yazmıyordu (eski gizli hata), düzeltildi.

---

## Mevcut kodda ne var — yeniden yazma

| Modül | Ne yapıyor | Bu planda |
|---|---|---|
| `lib/pes/yerlestir-kaydet.ts` | `yerlestir(sql, tenantId, istek)` — iş emri INSERT + zincir + tahsis | `workOrderId?` ile UPDATE modu eklenir |
| `lib/pes/aday-atolye.ts` | `adayAtolyeler()` — doluluk/yetenek/denetim/tedarik puanı | `AdayIstek`'e `klasmanKodu?`, `kumasTuruKodu?`; yetenek alt sorgusu bu kodlarla süzülür |
| `components/pes/SiparisYerlestirSihirbazi.tsx` | 5 adımlı sihirbaz; 1. adım sipariş bilgisi | `havuzPo?` prop ile 1. adım dolu+kilitli, atölye listesi ikiye bölünür |
| `components/pes/takvim/HucreMenusu.tsx` | "Sipariş yerleştir" bağlantısı | Havuza yönlendirir (K8) |
| `app/api/pes/work-orders/route.ts` POST | Sıfırdan iş emri + `wo_init_stages` | Dokunulmaz; havuz ayrı uç |

Test deseni: `lib/pes/gunluk-uretim-izolasyon.test.ts` — `yonetici` (DATABASE_URL) + `uygulama` (APP_DATABASE_URL), `baglamda(workshopId, fn)` ile atölye kullanıcısı taklidi, `ZZ` önekli fikstür, `afterAll` temizlik.

---

## Dosya yapısı

**Yeni:**
- `supabase/migrations/038_po_havuzu_ve_kunye.sql`
- `lib/pes/po-havuzu-izolasyon.test.ts` — RLS kanıtı
- `lib/pes/kunye.ts` + `lib/pes/kunye.test.ts` — katalog doğrulama
- `app/api/pes/katalog/route.ts` — seçenek listeleri
- `app/api/pes/siparisler/route.ts` — GET liste, POST havuza
- `app/api/pes/siparisler/[id]/route.ts` — PATCH künye, DELETE (Taslak)
- `app/pes/siparisler/page.tsx` — ince sunucu sayfası
- `components/pes/siparisler/SiparisListesi.tsx` — liste + görünüm sekmeleri
- `components/pes/siparisler/SiparisFormu.tsx` — oluştur/düzenle
- `components/pes/siparisler/tipler.ts`

**Değişen:**
- `lib/pes/yerlestir-kaydet.ts`, `lib/pes/yerlestir-kaydet.test.ts`
- `lib/pes/aday-atolye.ts`
- `app/api/pes/work-orders/yerlestir/route.ts`
- `components/pes/SiparisYerlestirSihirbazi.tsx`, `app/pes/siparis-yerlestir/page.tsx`
- `components/pes/takvim/HucreMenusu.tsx`
- `components/pes/PesDevSidebar.tsx`
- `app/workshop/is-emri/[id]/page.tsx`

---

## Faz A — Veri modeli

### Task 1: Migration 038 ve RLS kanıtı

**Files:**
- Create: `supabase/migrations/038_po_havuzu_ve_kunye.sql`
- Test: `lib/pes/po-havuzu-izolasyon.test.ts`

- [x] **Step 1: Başarısız testi yaz**

`lib/pes/po-havuzu-izolasyon.test.ts`:

```ts
import { afterAll, beforeAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'

/* 035 sızıntısının kapandığının kanıtı (spec K2).

   035 atölye kısıtına "OR workshop_id IS NULL" ekledi — ortak katalog
   için doğru, work_order ve work_order_stage için YANLIŞ: havuzdaki PO
   (workshop_id NULL) her atölyeye görünürdü; normal aşama satırı
   (NULL = siparişin atölyesi) zaten görünüyordu. 038 iki tabloya özel
   politika yazıyor. Bu test dört şeyi kanıtlar:
     1. Havuz PO'sunu atölye kullanıcısı GÖRMEZ, merkez görür.
     2. Başka atölyenin NULL-atölyeli aşama satırını GÖRMEZ.
     3. Kendi iş emrinin NULL-atölyeli aşamasını GÖRÜR.
     4. Dış atölyeye çıkan aşamayı o dış atölye GÖRÜR. */

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 20 })

const KOD = 'ZZHAVUZ'
let tenantId: string
let wsA: number, wsB: number
let havuzWo: number, aWo: number
let aStageNull: number, aStageDis: number

async function temizle() {
  await yonetici`DELETE FROM work_order WHERE is_emri_no LIKE ${KOD + '%'}`
  await yonetici`DELETE FROM workshop WHERE code LIKE ${KOD + '%'}`
}

function baglamda<T>(workshopId: number | null, fn: (tx: postgres.Sql) => Promise<T>) {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    await tx`SELECT set_config('app.current_workshop_id',
               ${workshopId === null ? '' : String(workshopId)}, true)`
    return fn(tx as unknown as postgres.Sql)
  })
}

beforeAll(async () => {
  const [t] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  tenantId = t.id as string
  await temizle()

  const atolyeKur = async (ek: string) => (await yonetici`
    INSERT INTO workshop (tenant_id, code, name, type, total_staff, sewing_staff, ukp_staff,
                          cutting_staff, management, indirect, line_count, daily_target, net_hours_day)
    VALUES (${tenantId}, ${KOD + ek}, ${'Havuz Izolasyon ' + ek}, 'X', 0,0,0,0,0,0, 1, 1000, 9)
    RETURNING id`)[0].id as number
  wsA = await atolyeKur('A'); wsB = await atolyeKur('B')

  const [dikim] = await yonetici`SELECT id FROM production_stage WHERE code = 'DIKIM'`
  const [yikama] = await yonetici`SELECT id FROM production_stage WHERE code = 'YIKAMA'`

  /* Havuz PO: atölyesiz, Taslak — 038 sonrası yazılabilir. */
  havuzWo = (await yonetici`
    INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum)
    VALUES (${tenantId}, NULL, ${KOD + '-HAVUZ'}, 'Havuz Modeli', 1000, 'Taslak') RETURNING id`)[0].id as number

  /* A'ya atanmış PO; bir aşaması NULL (A'nın), biri dış atölye B'de. */
  aWo = (await yonetici`
    INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum)
    VALUES (${tenantId}, ${wsA}, ${KOD + '-A'}, 'A Modeli', 1000, 'Planlandi') RETURNING id`)[0].id as number
  aStageNull = (await yonetici`
    INSERT INTO work_order_stage (work_order_id, tenant_id, stage_id, sira_no, workshop_id, durum)
    VALUES (${aWo}, ${tenantId}, ${dikim.id}, 20, NULL, 'Beklemede') RETURNING id`)[0].id as number
  aStageDis = (await yonetici`
    INSERT INTO work_order_stage (work_order_id, tenant_id, stage_id, sira_no, workshop_id, durum)
    VALUES (${aWo}, ${tenantId}, ${yikama.id}, 30, ${wsB}, 'Beklemede') RETURNING id`)[0].id as number
})

afterAll(async () => { await temizle(); await yonetici.end(); await uygulama.end() })

test('havuzdaki PO merkeze görünür, atölyeye GÖRÜNMEZ', async () => {
  const merkez = await baglamda(null, tx => tx`SELECT id FROM work_order WHERE id = ${havuzWo}`)
  expect(merkez).toHaveLength(1)
  const atolye = await baglamda(wsA, tx => tx`SELECT id FROM work_order WHERE id = ${havuzWo}`)
  expect(atolye).toHaveLength(0)
})

test('başka atölyenin NULL-atölyeli aşaması GÖRÜNMEZ', async () => {
  const b = await baglamda(wsB, tx => tx`SELECT id FROM work_order_stage WHERE id = ${aStageNull}`)
  expect(b).toHaveLength(0)
})

test('kendi iş emrinin NULL-atölyeli aşaması GÖRÜNÜR', async () => {
  const a = await baglamda(wsA, tx => tx`SELECT id FROM work_order_stage WHERE id = ${aStageNull}`)
  expect(a).toHaveLength(1)
})

test('dış atölyeye çıkan aşamayı dış atölye GÖRÜR', async () => {
  const b = await baglamda(wsB, tx => tx`SELECT id FROM work_order_stage WHERE id = ${aStageDis}`)
  expect(b).toHaveLength(1)
})

test('atölye kullanıcısı havuza yazamaz', async () => {
  await expect(baglamda(wsA, tx => tx`
    INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum)
    VALUES (${tenantId}, NULL, ${KOD + '-SIZINTI'}, 'X', 1, 'Taslak')`)).rejects.toThrow()
})
```

- [x] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/po-havuzu-izolasyon.test.ts`
Expected: FAIL — `beforeAll` içinde `null value in column "workshop_id" violates not-null constraint` (038 henüz yok).

- [x] **Step 3: Migration'ı yaz**

`supabase/migrations/038_po_havuzu_ve_kunye.sql`:

```sql
-- ============================================================
-- Migration 038 — PO havuzu ve künye
-- ============================================================
-- Kaynak tasarım: docs/superpowers/specs/2026-09-21-po-havuzu-ve-kunye-design.md
--
-- NE EKLİYOR:
--   1. work_order.workshop_id nullable — NULL = havuzda, henüz atanmadı (K1).
--   2. Künye: altı katalog kodu + kumaşçı (K3). FK yok; katalog (dimension_id,
--      code) tekil, tek kolon FK kuramaz. API lib/pes/kunye.ts ile doğrular.
--   3. 035'in "OR workshop_id IS NULL" kuralı work_order ve work_order_stage
--      için EZİLİYOR (K2). İki tablo ticari kayıt, ortak katalog değil:
--      NULL "herkese açık" değil "henüz atanmadı" / "siparişin atölyesi".
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. Havuz ----------
ALTER TABLE work_order ALTER COLUMN workshop_id DROP NOT NULL;
COMMENT ON COLUMN work_order.workshop_id IS
'NULL = havuzda, henüz atölyeye atanmadı (durum Taslak). Yerleştirme yazar; başka yerden yazılmaz.';

-- ---------- 2. Künye ----------
ALTER TABLE work_order
  ADD COLUMN IF NOT EXISTS ana_grup_kodu     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS klasman_kodu      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kumas_turu_kodu   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kumas_grubu_kodu  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cinsiyet_yas_kodu VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kalite_kodu       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kumasci           VARCHAR(150);

COMMENT ON COLUMN work_order.klasman_kodu IS
'capability_value.code (boyut: klasman). line_capability.value_code ile aynı katalog — yetkinlik eşleşmesi buradan.';

CREATE INDEX IF NOT EXISTS idx_wo_havuz ON work_order(tenant_id, durum) WHERE workshop_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_wo_klasman ON work_order(klasman_kodu);

-- ---------- 3. 035 istisnası ----------
-- work_order: NULL atölye yalnız merkeze görünür.
DROP POLICY IF EXISTS work_order_tenant_isolation ON work_order;
CREATE POLICY work_order_tenant_isolation ON work_order FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin())
    AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()));

-- work_order_stage: aşamanın kendi atölyesi doluysa o; NULL ise İŞ EMRİNİN
-- atölyesi (030 K4). Alt sorgu work_order'ın RLS'inden geçer — iş emrini
-- göremeyen aşamasını da göremez; istenen davranış bu.
DROP POLICY IF EXISTS work_order_stage_tenant_isolation ON work_order_stage;
CREATE POLICY work_order_stage_tenant_isolation ON work_order_stage FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin())
    AND (current_workshop_id() IS NULL
         OR workshop_id = current_workshop_id()
         OR (workshop_id IS NULL AND EXISTS (
               SELECT 1 FROM work_order wo
                WHERE wo.id = work_order_stage.work_order_id
                  AND wo.workshop_id = current_workshop_id()))));

-- ---------- 4. v_work_order_full künyeyi taşısın ----------
-- İş emri GET'i bu view'dan SELECT * okuyor (app/api/pes/work-orders/[id]).
-- View kolonları açık listelenmiş; yeni kolon kendiliğinden GELMEZ.
-- CREATE OR REPLACE yalnız SONA kolon eklemeye izin verir: mevcut liste
-- (id … aciliyet) aynen korunur, yedi künye kolonu sona eklenir.
-- Mevcut tanım: SELECT pg_get_viewdef('v_work_order_full', true) — 017'deki
-- gövdeyi aynen kopyala, FROM'dan önceki son satıra şunları ekle:
--     , wo.ana_grup_kodu, wo.klasman_kodu, wo.kumas_turu_kodu, wo.kumas_grubu_kodu,
--       wo.cinsiyet_yas_kodu, wo.kalite_kodu, wo.kumasci
-- Kolon SIRASI ve ADLARI değişirse Postgres "cannot change name of view
-- column" ile reddeder; o zaman DROP VIEW + CREATE VIEW gerekir ve 028'in
-- REVOKE/GRANT'i yeniden uygulanmalıdır. Sona eklemede gerek yok.
CREATE OR REPLACE VIEW v_work_order_full AS
  <017'deki SELECT gövdesi, sonuna yedi künye kolonu eklenmiş hâli>;

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='v_work_order_full' AND column_name LIKE '%_kodu' → 6 satır + kumasci
-- npx vitest run lib/pes/po-havuzu-izolasyon.test.ts   → 5 test geçer
-- node scripts/verify_workshop_isolation.mjs           → sızıntı yok
--
-- ROLLBACK:
--   BEGIN;
--   DROP POLICY IF EXISTS work_order_stage_tenant_isolation ON work_order_stage;
--   CREATE POLICY work_order_stage_tenant_isolation ON work_order_stage FOR ALL USING (
--       (tenant_id = current_tenant_id() OR is_internal_admin())
--       AND (current_workshop_id() IS NULL OR workshop_id IS NULL OR workshop_id = current_workshop_id()));
--   DROP POLICY IF EXISTS work_order_tenant_isolation ON work_order;
--   CREATE POLICY work_order_tenant_isolation ON work_order FOR ALL USING (
--       (tenant_id = current_tenant_id() OR is_internal_admin())
--       AND (current_workshop_id() IS NULL OR workshop_id IS NULL OR workshop_id = current_workshop_id()));
--   DROP INDEX IF EXISTS idx_wo_klasman; DROP INDEX IF EXISTS idx_wo_havuz;
--   ALTER TABLE work_order DROP COLUMN IF EXISTS ana_grup_kodu, DROP COLUMN IF EXISTS klasman_kodu,
--       DROP COLUMN IF EXISTS kumas_turu_kodu, DROP COLUMN IF EXISTS kumas_grubu_kodu,
--       DROP COLUMN IF EXISTS cinsiyet_yas_kodu, DROP COLUMN IF EXISTS kalite_kodu,
--       DROP COLUMN IF EXISTS kumasci;
--   -- Önce havuz satırı kalmadığından emin ol: SELECT count(*) FROM work_order WHERE workshop_id IS NULL;
--   ALTER TABLE work_order ALTER COLUMN workshop_id SET NOT NULL;
--   COMMIT;
-- ============================================================
```

- [x] **Step 3b: View gövdesini migration'a yerleştir**

Yer tutucuyu gerçek gövdeyle doldur — elle yazma, veritabanından al:
```bash
node -e "
import('postgres').then(async ({default:pg})=>{const fs=await import('node:fs');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('
').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const sql=pg(env.DATABASE_URL,{max:1,prepare:false});
const [v]=await sql\`SELECT pg_get_viewdef('v_work_order_full', true) AS d\`; console.log(v.d); await sql.end();});"
```
Çıktıdaki `END AS aciliyet` satırından sonra, `FROM work_order wo` satırından ÖNCE şu satırı ekle:
```sql
        END AS aciliyet,
    wo.ana_grup_kodu, wo.klasman_kodu, wo.kumas_turu_kodu, wo.kumas_grubu_kodu,
    wo.cinsiyet_yas_kodu, wo.kalite_kodu, wo.kumasci
   FROM work_order wo
```
ve tamamını migration'daki `<…>` yerine koy (sondaki `;` kalsın).

- [x] **Step 4: Migration'ı uygula ve testi çalıştır**

Run: `node scripts/_migrate_one.mjs 038_po_havuzu_ve_kunye.sql && npx vitest run lib/pes/po-havuzu-izolasyon.test.ts`
Expected: `OK   038_po_havuzu_ve_kunye.sql`, sonra 5/5 PASS.

- [x] **Step 5: İzolasyon betiği ve mevcut testler**

Run: `node scripts/verify_workshop_isolation.mjs && npx vitest run lib/pes/yerlestir-kaydet.test.ts lib/pes/gunluk-uretim.test.ts`
Expected: betik "0 kaldı"; mevcut testler geçer (`work_order_stage` politikası sıkılaştı, sihirbaz testleri kendi atölyesinin aşamasını hâlâ görmeli).

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/038_po_havuzu_ve_kunye.sql lib/pes/po-havuzu-izolasyon.test.ts
git commit -m "feat(havuz): migration 038 — nullable atolye, kunye kolonlari, 035 istisnasi"
```

---

## Faz B — Künye doğrulama

### Task 2: `lib/pes/kunye.ts`

**Files:**
- Create: `lib/pes/kunye.ts`
- Test: `lib/pes/kunye.test.ts`

- [x] **Step 1: Başarısız testi yaz**

```ts
import { afterAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { kodlariDogrula, KUNYE_BOYUTLARI } from './kunye'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20 })
afterAll(() => sql.end())

test('yedi künye alanı ve boyut eşlemesi tanımlı', () => {
  expect(Object.keys(KUNYE_BOYUTLARI)).toEqual([
    'ana_grup_kodu', 'klasman_kodu', 'kumas_turu_kodu',
    'kumas_grubu_kodu', 'cinsiyet_yas_kodu', 'kalite_kodu',
  ])
})

test('katalogdaki kod geçer', async () => {
  const [v] = await sql`
    SELECT v.code FROM capability_value v
    JOIN capability_dimension d ON d.id = v.dimension_id
    WHERE d.code = 'klasman' LIMIT 1`
  const s = await sql.begin(tx => kodlariDogrula(tx, { klasman_kodu: v.code as string }))
  expect(s.hatalar).toEqual([])
})

test('olmayan kod alan adıyla reddedilir', async () => {
  const s = await sql.begin(tx => kodlariDogrula(tx, {
    klasman_kodu: 'YOK_BOYLE_KOD', kumas_turu_kodu: 'YOK_BOYLE_KOD',
  }))
  expect(s.hatalar).toEqual([
    'klasman_kodu: YOK_BOYLE_KOD katalogda yok',
    'kumas_turu_kodu: YOK_BOYLE_KOD katalogda yok',
  ])
})

test('boş ve null alan doğrulanmaz — künye isteğe bağlı (K3)', async () => {
  const s = await sql.begin(tx => kodlariDogrula(tx, { klasman_kodu: null, kalite_kodu: '' }))
  expect(s.hatalar).toEqual([])
})
```

- [x] **Step 2: Çalıştır, başarısız gör**

Run: `npx vitest run lib/pes/kunye.test.ts`
Expected: FAIL — `Failed to resolve import "./kunye"`.

- [x] **Step 3: Modülü yaz**

```ts
import type postgres from 'postgres'

/* Künye doğrulama — tek yerde (spec K3, §4).

   Altı alan katalog kodu taşır; katalog capability_value(dimension_id, code)
   tekil olduğu için tek kolon FK kurulamıyor. POST ve PATCH bu fonksiyonu
   çağırır; yazmadan önce kodun o boyutta var olduğu doğrulanır.
   Boş / null alan doğrulanmaz — künye isteğe bağlıdır. */

/** kolon → capability_dimension.code */
export const KUNYE_BOYUTLARI = {
  ana_grup_kodu: 'ana_grup',
  klasman_kodu: 'klasman',
  kumas_turu_kodu: 'kumas_turu',
  kumas_grubu_kodu: 'kumas_grubu',
  cinsiyet_yas_kodu: 'cinsiyet_yas',
  kalite_kodu: 'kalite',
} as const

export type KunyeKolonu = keyof typeof KUNYE_BOYUTLARI
export type Kunye = Partial<Record<KunyeKolonu, string | null>> & { kumasci?: string | null }

export async function kodlariDogrula(
  sql: postgres.TransactionSql, kunye: Kunye,
): Promise<{ hatalar: string[] }> {
  const dolu = (Object.keys(KUNYE_BOYUTLARI) as KunyeKolonu[])
    .filter(k => kunye[k] != null && String(kunye[k]).trim() !== '')
  if (dolu.length === 0) return { hatalar: [] }

  const boyutlar = [...new Set(dolu.map(k => KUNYE_BOYUTLARI[k]))]
  const satirlar = await sql`
    SELECT d.code AS boyut, v.code
      FROM capability_value v
      JOIN capability_dimension d ON d.id = v.dimension_id
     WHERE d.code IN ${sql(boyutlar)}`
  const var_ = new Set(satirlar.map(r => `${r.boyut}|${r.code}`))

  const hatalar: string[] = []
  for (const k of dolu) {
    const kod = String(kunye[k]).trim()
    if (!var_.has(`${KUNYE_BOYUTLARI[k]}|${kod}`)) hatalar.push(`${k}: ${kod} katalogda yok`)
  }
  return { hatalar }
}

/** İstek gövdesinden künyeyi ayıklar; boş dizeyi null yapar. */
export function kunyeyiAyikla(b: Record<string, unknown>): Kunye {
  const out: Kunye = {}
  for (const k of Object.keys(KUNYE_BOYUTLARI) as KunyeKolonu[]) {
    if (b[k] !== undefined) out[k] = b[k] === null || String(b[k]).trim() === '' ? null : String(b[k]).trim()
  }
  if (b.kumasci !== undefined) out.kumasci = b.kumasci === null || String(b.kumasci).trim() === '' ? null : String(b.kumasci).trim()
  return out
}
```

- [x] **Step 4: Çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/kunye.test.ts`
Expected: 4/4 PASS.

- [x] **Step 5: Commit**

```bash
git add lib/pes/kunye.ts lib/pes/kunye.test.ts
git commit -m "feat(havuz): kunye dogrulama — katalog kodlari tek yerde"
```

---

## Faz C — API

### Task 3: Katalog seçenekleri ucu

**Files:**
- Create: `app/api/pes/katalog/route.ts`

- [x] **Step 1: Ucu yaz**

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Katalog seçenekleri — tek istekte birden çok boyut.
 *   GET /api/pes/katalog?boyut=klasman,kumas_turu,ana_grup
 *   → { secenekler: { klasman: [{ code, label }], kumas_turu: [...] } }
 *
 * Form açılışında bir kez çekilir. Boyut adı capability_dimension.code'dur;
 * bilinmeyen boyut sessizce boş dizi döner, 400 değil — form kırılmasın.
 */
export const GET = withTenantRoute(async (req, { sql }) => {
  const ham = new URL(req.url).searchParams.get('boyut') ?? ''
  const boyutlar = [...new Set(ham.split(',').map(s => s.trim()).filter(Boolean))]
  if (boyutlar.length === 0) {
    return NextResponse.json({ error: 'boyut gerekli' }, { status: 400 })
  }
  const satirlar = await sql`
    SELECT d.code AS boyut, v.code, v.label
      FROM capability_value v
      JOIN capability_dimension d ON d.id = v.dimension_id
     WHERE d.code IN ${sql(boyutlar)}
     ORDER BY d.code, v.sort_order, v.label`
  const secenekler: Record<string, { code: string; label: string }[]> = {}
  for (const b of boyutlar) secenekler[b] = []
  for (const r of satirlar) secenekler[r.boyut as string].push({ code: r.code as string, label: r.label as string })
  return NextResponse.json({ secenekler })
})
```

- [x] **Step 2: Tip kontrolü**

Run: `npx tsc --noEmit 2>&1 | grep katalog/route || echo "tip hatasi yok"`
Expected: `tip hatasi yok`

- [x] **Step 3: Commit**

```bash
git add app/api/pes/katalog/route.ts
git commit -m "feat(havuz): katalog secenekleri ucu"
```

---

### Task 4: Havuz uçları

**Files:**
- Create: `app/api/pes/siparisler/route.ts`
- Create: `app/api/pes/siparisler/[id]/route.ts`

- [x] **Step 1: Liste ve oluşturma ucunu yaz**

`app/api/pes/siparisler/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { kodlariDogrula, kunyeyiAyikla } from '@/lib/pes/kunye'

/**
 * PO havuzu (spec K1, K4, §4).
 *   GET  /api/pes/siparisler?gorunum=havuz|atanmis|hepsi&q=
 *   POST /api/pes/siparisler  → havuza PO açar (workshop_id NULL, durum Taslak)
 *
 * Havuz kaydı AŞAMA ZİNCİRİ KURMAZ — wo_init_stages çağrılmaz. Zinciri
 * yerleştirme kurar (K5); aksi halde sihirbaz UPDATE modunda önce eski
 * zinciri silmek zorunda kalırdı.
 */
const TARIH = /^\d{4}-\d{2}-\d{2}$/
const KUNYE_KOLONLARI = `ana_grup_kodu, klasman_kodu, kumas_turu_kodu, kumas_grubu_kodu,
                         cinsiyet_yas_kodu, kalite_kodu, kumasci`

export const GET = withTenantRoute(async (req, { sql }) => {
  const u = new URL(req.url)
  const gorunum = u.searchParams.get('gorunum') ?? 'havuz'
  const q = (u.searchParams.get('q') ?? '').trim()

  const satirlar = await sql`
    SELECT wo.id, wo.is_emri_no, wo.siparis_no, wo.musteri, wo.model_adi, wo.stil_kodu, wo.sezon,
           wo.siparis_miktari, wo.teslim_tarihi::text, wo.oncelik, wo.durum, wo.workshop_id,
           w.name AS atolye_adi,
           wo.ana_grup_kodu, wo.klasman_kodu, wo.kumas_turu_kodu, wo.kumas_grubu_kodu,
           wo.cinsiyet_yas_kodu, wo.kalite_kodu, wo.kumasci,
           kl.label AS klasman, kt.label AS kumas_turu,
           (wo.teslim_tarihi - CURRENT_DATE)::int AS kalan_gun
      FROM work_order wo
      LEFT JOIN workshop w ON w.id = wo.workshop_id
      LEFT JOIN capability_value kl ON kl.code = wo.klasman_kodu
           AND kl.dimension_id = (SELECT id FROM capability_dimension WHERE code = 'klasman')
      LEFT JOIN capability_value kt ON kt.code = wo.kumas_turu_kodu
           AND kt.dimension_id = (SELECT id FROM capability_dimension WHERE code = 'kumas_turu')
     WHERE (${gorunum} = 'hepsi'
            OR (${gorunum} = 'havuz'   AND wo.workshop_id IS NULL)
            OR (${gorunum} = 'atanmis' AND wo.workshop_id IS NOT NULL))
       AND (${q} = '' OR wo.is_emri_no ILIKE ${'%' + q + '%'} OR wo.musteri ILIKE ${'%' + q + '%'}
            OR wo.model_adi ILIKE ${'%' + q + '%'})
     ORDER BY wo.teslim_tarihi NULLS LAST, wo.id DESC
     LIMIT 500`
  return NextResponse.json({ siparisler: satirlar })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  const b = await req.json()
  const isEmriNo = String(b.is_emri_no ?? '').trim()
  const modelAdi = String(b.model_adi ?? '').trim()
  const adet = Number(b.siparis_miktari)
  if (!isEmriNo) return NextResponse.json({ error: 'Sipariş no gerekli' }, { status: 400 })
  if (!modelAdi) return NextResponse.json({ error: 'Model adı gerekli' }, { status: 400 })
  if (!Number.isInteger(adet) || adet <= 0) {
    return NextResponse.json({ error: 'Adet 0’dan büyük tam sayı olmalı' }, { status: 400 })
  }
  if (b.teslim_tarihi && !TARIH.test(String(b.teslim_tarihi))) {
    return NextResponse.json({ error: 'Teslim tarihi YYYY-AA-GG olmalı' }, { status: 400 })
  }

  const kunye = kunyeyiAyikla(b)
  const { hatalar } = await kodlariDogrula(sql, kunye)
  if (hatalar.length) return NextResponse.json({ error: hatalar.join('; ') }, { status: 400 })

  const [var_] = await sql`SELECT id FROM work_order WHERE is_emri_no = ${isEmriNo}`
  if (var_) return NextResponse.json({ error: 'Bu sipariş no zaten var' }, { status: 409 })

  const [row] = await sql`
    INSERT INTO work_order ${sql({
      tenant_id: tenant.tenantId,
      workshop_id: null,
      is_emri_no: isEmriNo,
      siparis_no: b.siparis_no ? String(b.siparis_no).trim() : isEmriNo,
      musteri: b.musteri ? String(b.musteri).trim() : null,
      model_adi: modelAdi,
      stil_kodu: b.stil_kodu ? String(b.stil_kodu).trim() : null,
      sezon: b.sezon ? String(b.sezon).trim() : null,
      siparis_miktari: adet,
      teslim_tarihi: b.teslim_tarihi || null,
      oncelik: ['Düşük', 'Normal', 'Yüksek', 'Kritik'].includes(b.oncelik) ? b.oncelik : 'Normal',
      durum: 'Taslak',
      ...kunye,
    })}
    RETURNING id`
  return NextResponse.json({ ok: true, id: row.id })
})
```

- [x] **Step 2: Düzenleme ve silme ucunu yaz**

`app/api/pes/siparisler/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { kodlariDogrula, kunyeyiAyikla } from '@/lib/pes/kunye'

/**
 *   PATCH  /api/pes/siparisler/57  — künye ve temel alanlar
 *   DELETE /api/pes/siparisler/57  — yalnız Taslak (K7)
 *
 * workshop_id ve durum BURADAN DEĞİŞMEZ: yerleştirme yazar. İki yerden
 * yazılan atama zamanla birbirini tutmaz.
 */
const TARIH = /^\d{4}-\d{2}-\d{2}$/

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = parseInt(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz sipariş' }, { status: 400 })
  const b = await req.json()

  const [wo] = await sql`SELECT id FROM work_order WHERE id = ${id}`
  if (!wo) return NextResponse.json({ error: 'Sipariş bulunamadı' }, { status: 404 })

  const kunye = kunyeyiAyikla(b)
  const { hatalar } = await kodlariDogrula(sql, kunye)
  if (hatalar.length) return NextResponse.json({ error: hatalar.join('; ') }, { status: 400 })
  if (b.teslim_tarihi !== undefined && b.teslim_tarihi && !TARIH.test(String(b.teslim_tarihi))) {
    return NextResponse.json({ error: 'Teslim tarihi YYYY-AA-GG olmalı' }, { status: 400 })
  }
  if (b.siparis_miktari !== undefined && (!Number.isInteger(Number(b.siparis_miktari)) || Number(b.siparis_miktari) <= 0)) {
    return NextResponse.json({ error: 'Adet 0’dan büyük tam sayı olmalı' }, { status: 400 })
  }

  const metin = (v: unknown) => (v === undefined ? undefined : v === null || String(v).trim() === '' ? null : String(v).trim())
  const alanlar: Record<string, unknown> = { ...kunye }
  for (const k of ['musteri', 'model_adi', 'stil_kodu', 'sezon', 'siparis_no'] as const) {
    const v = metin(b[k]); if (v !== undefined) alanlar[k] = v
  }
  if (b.siparis_miktari !== undefined) alanlar.siparis_miktari = Number(b.siparis_miktari)
  if (b.teslim_tarihi !== undefined) alanlar.teslim_tarihi = b.teslim_tarihi || null
  if (b.oncelik !== undefined && ['Düşük', 'Normal', 'Yüksek', 'Kritik'].includes(b.oncelik)) alanlar.oncelik = b.oncelik
  if (alanlar.model_adi === null) return NextResponse.json({ error: 'Model adı boş olamaz' }, { status: 400 })
  if (Object.keys(alanlar).length === 0) return NextResponse.json({ error: 'Değişecek alan yok' }, { status: 400 })

  await sql`UPDATE work_order SET ${sql(alanlar)}, updated_at = now() WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = parseInt(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Geçersiz sipariş' }, { status: 400 })
  const [wo] = await sql`SELECT durum, workshop_id FROM work_order WHERE id = ${id}`
  if (!wo) return NextResponse.json({ error: 'Sipariş bulunamadı' }, { status: 404 })
  if (wo.durum !== 'Taslak' || wo.workshop_id !== null) {
    return NextResponse.json(
      { error: 'Yerleştirilmiş sipariş havuzdan silinemez; iş emri ekranından iptal edin' }, { status: 409 })
  }
  await sql`DELETE FROM work_order WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
```

- [x] **Step 3: Tip kontrolü ve elle deneme**

Run: `npx tsc --noEmit 2>&1 | grep siparisler || echo "tip hatasi yok"`
Sonra `npm run dev` ile oturumlu tarayıcı konsolundan:
```js
await fetch('/api/pes/siparisler', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ is_emri_no: 'ZZDENEME-1', model_adi: 'Deneme', siparis_miktari: 100,
    klasman_kodu: 'YOK' }) }).then(r => r.json())
```
Expected: `{ error: 'klasman_kodu: YOK katalogda yok' }` — 400. Geçerli kodla `{ ok: true, id }`; sonra `DELETE /api/pes/siparisler/<id>` → `{ ok: true }`.

- [x] **Step 4: Commit**

```bash
git add app/api/pes/siparisler
git commit -m "feat(havuz): siparis havuzu uclari — liste, olustur, duzenle, sil"
```

---

### Task 5: Sihirbaz UPDATE modu

**Files:**
- Modify: `lib/pes/yerlestir-kaydet.ts` (tip satır 7–22, INSERT satır ~137–152)
- Modify: `app/api/pes/work-orders/yerlestir/route.ts` (POST, satır 54–80)
- Test: `lib/pes/yerlestir-kaydet.test.ts`

- [x] **Step 1: Başarısız testi yaz**

`lib/pes/yerlestir-kaydet.test.ts` sonuna ekle (dosyadaki `yonetici`, `uygulama`, `defaultTenant`, `wsId`, `lineIds` fikstürlerini kullanır; `test()` ve `expect` zaten import edilmiş):

```ts
test('havuzdaki iş emri yerleştirilince aynı satır güncellenir, yeni satır açılmaz', async () => {
  const [havuz] = await yonetici`
    INSERT INTO work_order (tenant_id, workshop_id, is_emri_no, model_adi, siparis_miktari, durum, klasman_kodu)
    VALUES (${defaultTenant}, NULL, 'ZZYRLTST-HAVUZ', 'Havuz Modeli', 2000, 'Taslak', NULL)
    RETURNING id`
  const havuzId = havuz.id as number
  const [once] = await yonetici`SELECT count(*)::int AS n FROM work_order WHERE is_emri_no = 'ZZYRLTST-HAVUZ'`

  const sonuc = await uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${defaultTenant}, true)`
    await tx`SELECT set_config('app.current_workshop_id', '', true)`
    return yerlestir(tx, defaultTenant, {
      workOrderId: havuzId,
      siparisNo: 'ZZYRLTST-HAVUZ', musteri: '', modelAdi: 'Havuz Modeli',
      adet: 2000, teslimTarihi: '2026-12-20', bugun: '2026-12-01',
      workshopId: wsId, lineIds: [lineIds[0]], asamaKodlari: ['KESIM', 'DIKIM', 'UKP'],
    })
  })

  expect(sonuc.workOrderId).toBe(havuzId)
  const [sonra] = await yonetici`SELECT count(*)::int AS n FROM work_order WHERE is_emri_no = 'ZZYRLTST-HAVUZ'`
  expect(sonra.n).toBe(once.n)   // yeni satır AÇILMADI
  const [wo] = await yonetici`SELECT workshop_id, durum FROM work_order WHERE id = ${havuzId}`
  expect(wo.workshop_id).toBe(wsId)
  expect(wo.durum).toBe('Planlandi')
  const [z] = await yonetici`SELECT count(*)::int AS n FROM work_order_stage WHERE work_order_id = ${havuzId}`
  expect(z.n).toBe(3)
})

test('workOrderId başka atölyeye atanmışsa yerleştirme reddedilir', async () => {
  const [dolu] = await yonetici`SELECT id FROM work_order WHERE is_emri_no = 'ZZYRLTST-HAVUZ'`
  await expect(uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${defaultTenant}, true)`
    await tx`SELECT set_config('app.current_workshop_id', '', true)`
    return yerlestir(tx, defaultTenant, {
      workOrderId: dolu.id as number,
      siparisNo: 'ZZYRLTST-HAVUZ', musteri: '', modelAdi: 'Havuz Modeli',
      adet: 2000, teslimTarihi: '2026-12-20', bugun: '2026-12-01',
      workshopId: wsId, lineIds: [lineIds[0]], asamaKodlari: ['DIKIM'],
    })
  })).rejects.toThrow(/zaten yerleştirilmiş/)
})
```

Dosyanın `temizle()` fonksiyonu `work_order`'ı `workshop_id`'ye göre siliyor; havuz satırı `NULL` olduğu için ek bir satır gerekir:
```ts
await yonetici`DELETE FROM work_order WHERE is_emri_no = 'ZZYRLTST-HAVUZ'`
```

- [x] **Step 2: Çalıştır, başarısız gör**

Run: `npx vitest run lib/pes/yerlestir-kaydet.test.ts -t "havuz"`
Expected: FAIL — `workOrderId` tipte yok (tsc) ya da INSERT ikinci satırı açtığı için `sonra.n` ≠ `once.n`.

- [x] **Step 3: `YerlestirIstek` ve `yerlestir()` düzenle**

`lib/pes/yerlestir-kaydet.ts` tipine ekle:
```ts
export type YerlestirIstek = {
  /** Doluysa havuzdaki bu iş emri GÜNCELLENİR, yeni satır açılmaz (spec K5). */
  workOrderId?: number
  siparisNo: string
  // ... mevcut alanlar
```

INSERT bloğunu (satır ~137) şununla değiştir:
```ts
  /* 3) Sipariş. workOrderId varsa HAVUZ modu: aynı satır güncellenir.
     Havuz kaydı aşama zinciri kurmadı (K5), burada kurulur. */
  let workOrderId: number
  if (istek.workOrderId) {
    const [mevcut] = await sql`
      SELECT id, workshop_id, durum FROM work_order WHERE id = ${istek.workOrderId}`
    if (!mevcut) throw new Error('Havuzdaki sipariş bulunamadı')
    if (mevcut.workshop_id !== null || mevcut.durum !== 'Taslak') {
      throw new Error('Bu sipariş zaten yerleştirilmiş; havuzdan tekrar yerleştirilemez')
    }
    await sql`
      UPDATE work_order SET
        workshop_id = ${istek.workshopId},
        musteri = ${istek.musteri},
        siparis_miktari = ${istek.adet},
        teslim_tarihi = ${istek.teslimTarihi},
        baslangic_tarihi = ${plan.pencereler.find(p => p.baslangic)?.baslangic ?? null},
        bitis_tarihi = ${istek.teslimTarihi},
        durum = 'Planlandi',
        updated_at = now()
      WHERE id = ${istek.workOrderId}`
    workOrderId = istek.workOrderId
  } else {
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
    workOrderId = wo.id as number
  }
```
(`const workOrderId = wo.id as number` satırı kalkar; devamı `workOrderId`'yi kullanmaya devam eder.)

- [x] **Step 4: Route'a `workOrderId` geçir**

`app/api/pes/work-orders/yerlestir/route.ts` POST'ta `yerlestir(...)` çağrısına ekle:
```ts
      workOrderId: b.workOrderId ? Number(b.workOrderId) : undefined,
```
ve zorunlu alan listesindeki `'siparisNo', 'modelAdi'` havuz modunda gövdeden gelmeyebilir — `eksik` hesabını şöyle değiştir:
```ts
  const zorunlu = b.workOrderId
    ? ['adet', 'teslimTarihi', 'workshopId', 'lineIds', 'asamaKodlari']
    : ['siparisNo', 'modelAdi', 'adet', 'teslimTarihi', 'workshopId', 'lineIds', 'asamaKodlari']
  const eksik = zorunlu.filter(k => b[k] === undefined || b[k] === null || b[k] === '')
```
Havuz modunda `siparisNo` ve `modelAdi` sunucuda kayıttan okunur:
```ts
    let siparisNo = String(b.siparisNo ?? ''), modelAdi = String(b.modelAdi ?? '')
    if (b.workOrderId) {
      const [wo] = await sql`SELECT is_emri_no, model_adi FROM work_order WHERE id = ${Number(b.workOrderId)}`
      if (!wo) return NextResponse.json({ error: 'Havuzdaki sipariş bulunamadı' }, { status: 404 })
      siparisNo = wo.is_emri_no as string; modelAdi = wo.model_adi as string
    }
```
ve `yerlestir()`'e `siparisNo, modelAdi` bu değişkenlerden gider.

- [x] **Step 5: Çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/yerlestir-kaydet.test.ts`
Expected: mevcut testler + 2 yeni, hepsi PASS.

- [x] **Step 6: Commit**

```bash
git add lib/pes/yerlestir-kaydet.ts lib/pes/yerlestir-kaydet.test.ts app/api/pes/work-orders/yerlestir/route.ts
git commit -m "feat(havuz): sihirbaz UPDATE modu — havuzdaki siparis ayni satirda yerlesir"
```

---

### Task 6: Yetkinlik eşleşmesi künyeden

**Files:**
- Modify: `lib/pes/aday-atolye.ts` (tip satır 16–22, sorgu satır 70–76)
- Modify: `app/api/pes/work-orders/yerlestir/route.ts` GET (satır 18–51)

- [ ] **Step 1: `AdayIstek`'i genişlet**

```ts
export type AdayIstek = {
  adet: number
  teslimTarihi: string
  bugun: string
  tedarikMudurlugu?: string | null
  /** Verilirse yetenek puanı yalnız bu klasman/kumaş türüne sahip bantlardan gelir (spec K6) */
  klasmanKodu?: string | null
  kumasTuruKodu?: string | null
}
```

- [ ] **Step 2: Yetenek alt sorgusunu kodlarla süz**

`yetenek_kaydi` alt sorgusunu (satır ~73) şununla değiştir:
```sql
      (SELECT COUNT(*)::int
         FROM line_capability lc
         JOIN production_line pl3 ON pl3.id = lc.line_id
        WHERE pl3.workshop_id = w.id
          AND (${istek.klasmanKodu ?? null}::text IS NULL
               OR (lc.dimension_code = 'klasman' AND lc.value_code = ${istek.klasmanKodu ?? null}))
          AND (${istek.kumasTuruKodu ?? null}::text IS NULL
               OR (lc.dimension_code = 'kumas_turu' AND lc.value_code = ${istek.kumasTuruKodu ?? null})))
                                                                  AS yetenek_kaydi,
```
Kod verilmemişse davranış bugünkü gibi (tüm yetenek kayıtları sayılır).

`Aday` tipine `yapabilir: boolean` ekle ve `map` içinde:
```ts
      yapabilir: (istek.klasmanKodu || istek.kumasTuruKodu) ? Number(s.yetenek_kaydi ?? 0) > 0 : true,
```

- [ ] **Step 3: GET ucuna parametreleri geçir**

`app/api/pes/work-orders/yerlestir/route.ts` GET'te `adayAtolyeler(sql, {...})` çağrısına:
```ts
    klasmanKodu: u.searchParams.get('klasman'),
    kumasTuruKodu: u.searchParams.get('kumas'),
```

- [ ] **Step 4: Mevcut aday testi ve tip kontrolü**

Run: `npx vitest run lib/pes/aday-atolye.test.ts && npx tsc --noEmit 2>&1 | grep -E "aday-atolye|yerlestir/route" || echo "tip hatasi yok"`
Expected: PASS; tip hatası yok.

- [ ] **Step 5: Commit**

```bash
git add lib/pes/aday-atolye.ts app/api/pes/work-orders/yerlestir/route.ts
git commit -m "feat(havuz): aday atolye puani klasman ve kumas turune gore"
```

---

## Faz D — Ekran

### Task 7: `/pes/siparisler` — havuz listesi ve formu

**Files:**
- Create: `components/pes/siparisler/tipler.ts`
- Create: `components/pes/siparisler/SiparisFormu.tsx`
- Create: `components/pes/siparisler/SiparisListesi.tsx`
- Create: `app/pes/siparisler/page.tsx`
- Modify: `components/pes/PesDevSidebar.tsx:34`

- [ ] **Step 1: Tipler**

```ts
export type Siparis = {
  id: number; is_emri_no: string; siparis_no: string | null; musteri: string | null
  model_adi: string; stil_kodu: string | null; sezon: string | null
  siparis_miktari: number; teslim_tarihi: string | null; oncelik: string | null
  durum: string; workshop_id: number | null; atolye_adi: string | null
  ana_grup_kodu: string | null; klasman_kodu: string | null; kumas_turu_kodu: string | null
  kumas_grubu_kodu: string | null; cinsiyet_yas_kodu: string | null; kalite_kodu: string | null
  kumasci: string | null; klasman: string | null; kumas_turu: string | null
  kalan_gun: number | null
}
export type Secenek = { code: string; label: string }
export type Secenekler = Record<string, Secenek[]>
export const KUNYE_ALANLARI: { kolon: keyof Siparis; boyut: string; etiket: string }[] = [
  { kolon: 'ana_grup_kodu', boyut: 'ana_grup', etiket: 'Ana grup' },
  { kolon: 'klasman_kodu', boyut: 'klasman', etiket: 'Klasman' },
  { kolon: 'kumas_turu_kodu', boyut: 'kumas_turu', etiket: 'Kumaş türü' },
  { kolon: 'kumas_grubu_kodu', boyut: 'kumas_grubu', etiket: 'Kumaş grubu' },
  { kolon: 'cinsiyet_yas_kodu', boyut: 'cinsiyet_yas', etiket: 'Cinsiyet / yaş' },
  { kolon: 'kalite_kodu', boyut: 'kalite', etiket: 'Kalite segmenti' },
]
```

- [ ] **Step 2: Form**

`SiparisFormu.tsx` — `'use client'`; props `{ mevcut?: Siparis; secenekler: Secenekler; onKapat: () => void; onKaydedildi: () => void }`. Alanlar: sipariş no (düzenlemede kilitli), müşteri, model adı, stil kodu, sezon, adet, teslim, öncelik; altında künye — `KUNYE_ALANLARI.map` ile altı `<select>` (`<option value="">—</option>` + `secenekler[boyut]`), sonra kumaşçı `<input>`. Gönderim: `mevcut` yoksa `POST /api/pes/siparisler`, varsa `PATCH /api/pes/siparisler/${mevcut.id}`; hata metnini formun altında göster; başarıda `onKaydedildi()`. Girdi bileşenleri `@/components/ui`'den `Input`, `Select`, `Button`, `Field` (hepsi `components/ui/index.ts`'te dışa verilmiş). Her kontrolde sabit `id` (`sp-is-emri-no`, `sp-klasman` …).

- [ ] **Step 3: Liste**

`SiparisListesi.tsx` — `'use client'`; `useSearchParams` ile `havuz`, `atolye`, `bant`, `tarih` okur. Durum: `gorunum` ('havuz' | 'atanmis' | 'hepsi'; URL'de `havuz=1` ise 'havuz'), `q`, `siparisler`, `secenekler` (açılışta `GET /api/pes/katalog?boyut=ana_grup,klasman,kumas_turu,kumas_grubu,cinsiyet_yas,kalite`), `formAcik`, `duzenlenen`. Tablo sütunları: sipariş no · müşteri · model · klasman · kumaş türü · adet · teslim · kalan gün · atölye · eylemler. `kalan_gun <= 7` satır `bg-warn-soft`, `< 0` `bg-danger-soft`. Havuz satırında **Atölyeye ata** → `router.push('/pes/siparis-yerlestir?po=' + id + (bant ? '&bant=' + bant : '') + (tarih ? '&tarih=' + tarih : '') + (atolye ? '&atolye=' + atolye : ''))`; **Düzenle** formu açar; **Sil** (`confirm`) → `DELETE`, 409 gelirse hata metnini toast'la.

- [ ] **Step 4: Sayfa ve kenar çubuğu**

`app/pes/siparisler/page.tsx`:
```tsx
import { Suspense } from 'react'
import { PageHeader } from '@/components/ui'
import SiparisListesi from '@/components/pes/siparisler/SiparisListesi'

export const dynamic = 'force-dynamic'

export default function SiparislerPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        crumbs={[{ label: 'Merkez', href: '/pes' }, { label: 'Siparişler' }]}
        title="Siparişler"
        context="Gelen PO'lar önce havuza yazılır, künyesi girilir, sonra atölyeye atanır"
      />
      <Suspense fallback={<p className="text-[13px] text-faint">Yükleniyor…</p>}>
        <SiparisListesi />
      </Suspense>
    </div>
  )
}
```
`PesDevSidebar.tsx` satır 34'ün ÜSTÜNE:
```ts
      { label: 'Siparişler',        href: '/pes/siparisler',     icon: ClipboardList },
```
(`ClipboardList` `lucide-react`'ten; dosyanın import satırına ekle.)

- [ ] **Step 5: Tarayıcıda dene**

`npm run dev`, `/pes/siparisler`: havuza PO yaz (klasman ve kumaş türü seçerek), listede görün, düzenle, sil. Konsol temiz.

- [ ] **Step 6: Commit**

```bash
git add components/pes/siparisler app/pes/siparisler/page.tsx components/pes/PesDevSidebar.tsx
git commit -m "feat(havuz): /pes/siparisler — havuz listesi, kunye formu, kenar cubugu"
```

---

### Task 8: Sihirbaz havuz modu

**Files:**
- Modify: `app/pes/siparis-yerlestir/page.tsx`
- Modify: `components/pes/SiparisYerlestirSihirbazi.tsx` (durumlar satır 34–63, aday çağrısı satır 70, gönderim satır 144–150, aday listesi satır 261–265)

- [ ] **Step 1: Sayfa havuz kaydını sunucuda yükler**

`app/pes/siparis-yerlestir/page.tsx` — `searchParams` prop'unu al; `po` varsa `withServerTenant` içinde:
```ts
const [po] = await sql`
  SELECT id, is_emri_no, musteri, model_adi, siparis_miktari, teslim_tarihi::text,
         klasman_kodu, kumas_turu_kodu, kumas_grubu_kodu, workshop_id, durum
    FROM work_order WHERE id = ${Number(sp.po)}`
```
`po` bulunamazsa ya da `workshop_id !== null` ise sayfa üstünde uyarı ("Bu sipariş zaten yerleştirilmiş") ve sihirbaz havuz modu olmadan açılır. Sihirbaza `havuzPo={po}`, `onBantId={Number(sp.bant) || undefined}`, `onTarih={sp.tarih}`, `onAtolyeId={Number(sp.atolye) || undefined}` geçir.

- [ ] **Step 2: Sihirbazda 1. adım dolu ve kilitli**

Prop tipi:
```ts
type HavuzPo = { id: number; is_emri_no: string; musteri: string | null; model_adi: string
  siparis_miktari: number; teslim_tarihi: string | null
  klasman_kodu: string | null; kumas_turu_kodu: string | null; kumas_grubu_kodu: string | null }
```
`useState` başlangıçları `havuzPo`'dan: `siparisNo = havuzPo?.is_emri_no ?? ''` vb. Havuz modunda 1. adımdaki `Input`'lar `disabled`; üstte künye şeridi:
```tsx
{havuzPo && (
  <p className="rounded-lg border border-line-soft bg-canvas px-3 py-2 text-xs text-muted">
    Havuzdan: <b className="text-ink">{havuzPo.is_emri_no}</b>
    {havuzPo.klasman_kodu && <> · {havuzPo.klasman_kodu}</>}
    {havuzPo.kumas_turu_kodu && <> · {havuzPo.kumas_turu_kodu}</>}
    {havuzPo.kumas_grubu_kodu && <> · {havuzPo.kumas_grubu_kodu}</>}
    {' '}— künye havuz ekranında düzenlenir.
  </p>
)}
```

- [ ] **Step 3: Aday çağrısına kodları ekle, listeyi ikiye böl**

Satır 70'teki fetch:
```ts
const q = new URLSearchParams({ adet: String(adetSayi), teslim: teslimTarihi })
if (havuzPo?.klasman_kodu) q.set('klasman', havuzPo.klasman_kodu)
if (havuzPo?.kumas_turu_kodu) q.set('kumas', havuzPo.kumas_turu_kodu)
const r = await fetch(`/api/pes/work-orders/yerlestir?${q}`)
```
`Aday` tipine `yapabilir: boolean` ekle. Satır 261–265'teki listeyi:
```tsx
{[
  ['Bu ürünü yapabilenler', adaylar.filter(a => a.yapabilir)],
  ['Diğerleri', adaylar.filter(a => !a.yapabilir)],
].map(([baslik, grup]) => (grup as Aday[]).length > 0 && (
  <div key={baslik as string}>
    {havuzPo && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{baslik as string}</p>}
    {(grup as Aday[]).map(a => ( /* mevcut satır çizimi */ ))}
  </div>
))}
```
`onAtolyeId` verildiyse o aday `useEffect` ile otomatik seçilir (`atolyeSec`); `onBantId` verildiyse bant adımında o bant işaretli gelir; `onTarih` başlangıç tarihi alanına yazılır.

- [ ] **Step 4: Gönderime `workOrderId`**

Satır 144–150'deki POST gövdesine `workOrderId: havuzPo?.id` ekle. Başarıda yönlendirme mevcut davranış (iş emri sayfası).

- [ ] **Step 5: Tarayıcıda uçtan uca**

`/pes/siparisler` → havuz PO'da **Atölyeye ata** → sihirbaz 1. adım dolu/kilitli, künye şeridi görünür → atölye listesi iki gruplu → yerleştir → `/pes/takvim`'de blok görünür, `/pes/siparisler?gorunum=atanmis`'ta satır atölyeli.

- [ ] **Step 6: Commit**

```bash
git add app/pes/siparis-yerlestir/page.tsx components/pes/SiparisYerlestirSihirbazi.tsx
git commit -m "feat(havuz): sihirbaz havuz modu — 1. adim kilitli, yapabilenler ustte, UPDATE ile yerlesir"
```

---

### Task 9: Takvim bağlantısı ve iş emrinde künye

**Files:**
- Modify: `components/pes/takvim/HucreMenusu.tsx` ("Sipariş yerleştir" `href`)
- Modify: `app/workshop/is-emri/[id]/page.tsx` (Özet sekmesi)

- [ ] **Step 1: Hücre menüsü havuza gider**

`HucreMenusu.tsx`'de bağlantıyı değiştir:
```tsx
<a href={`/pes/siparisler?havuz=1&atolye=${hedef.atolyeId}&bant=${hedef.lineId}&tarih=${hedef.tarih}`}
```
ve `<small>`'daki metni `havuz` yap.

- [ ] **Step 2: İş emri Özet'e künye**

`OzetTab` içindeki `DataRow` listesine, `Order` tipine yedi alanı ekledikten sonra:
```tsx
<DataRow label="Ana grup" value={order.ana_grup_kodu} />
<DataRow label="Klasman" value={order.klasman_kodu} />
<DataRow label="Kumaş türü" value={order.kumas_turu_kodu} />
<DataRow label="Kumaş grubu" value={order.kumas_grubu_kodu} />
<DataRow label="Cinsiyet / yaş" value={order.cinsiyet_yas_kodu} />
<DataRow label="Kalite segmenti" value={order.kalite_kodu} />
<DataRow label="Kumaşçı" value={order.kumasci} />
```
İş emri GET ucu `v_work_order_full`'dan `SELECT *` okuyor; Task 1'deki view yeniden tanımıyla yedi kolon gelir, uçta değişiklik gerekmez. `Order` tipine yedi alan eklenir. Atölye düzenleyemez — `DataRow` salt okunur (K9).

- [ ] **Step 3: Tam doğrulama**

```bash
npx vitest run
npx next build
node scripts/verify_public_api.mjs
node scripts/verify_workshop_isolation.mjs
```
Expected: hepsi geçer; yeni uçlar 401.

- [ ] **Step 4: Commit**

```bash
git add components/pes/takvim/HucreMenusu.tsx "app/workshop/is-emri/[id]/page.tsx"
git commit -m "feat(havuz): takvim menusu havuza gider, is emri ozetinde kunye"
```

---

## Kapanış

- [ ] `superpowers:finishing-a-development-branch` ile dalı `main`'e taşı.

## Spec kapsama kontrolü

| Spec | Görev |
|---|---|
| K1 tek kayıt, Taslak | Task 1, 4 |
| K2 politika istisnası + stage kuralı | Task 1 |
| K3 yedi alan, katalog doğrulama | Task 1, 2, 4 |
| K4 havuz ekranı | Task 7 |
| K5 sihirbaz UPDATE, zinciri yerleştirme kurar | Task 5, 8 |
| K6 aday-atolye kodlarla | Task 6, 8 |
| K7 silme yalnız Taslak | Task 4 |
| K8 takvim menüsü havuza | Task 7 (URL okuma), 9 |
| K9 roller | Task 1 (RLS), 9 |
| §4 katalog ucu | Task 3 |
| §8 doğrulama | Task 1, 2, 5, 9 |
