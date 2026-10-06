# Yıllık Plan — Basit Yapı (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/pes/yillik-plan` v1'in tahmin → kalem → dakika → öneri yapısını kaldırıp yerine adet tabanlı basit bir plan koymak: atölye başına aylık kapasite (baz + ay düzeltmesi), planlamacının elle yazdığı atölye × ay × klasman adetleri, klasman × ay talep hedefi ve doluluk / açık görünümü.

**Architecture:** Migration 050 üç yeni tablo kurar (`atolye_kapasite_ay`, `plan_atolye_ay`, `plan_talep_ay`; 043 RLS kalıbı). 049 nesneleri 051 ile, **v1.9.0 canlıya çıktıktan sonra** düşürülür (gerekçe aşağıda). Saf hesap `lib/pes/yillik-plan.ts` (kapasite çözme, çalışma günü, doluluk, talep açığı, klasman uyumu; birim testli), DB okuma `lib/pes/yillik-plan-veri.ts`, API `app/api/pes/yillik-plan/{plan,talep,kapasite,kapasite-ay}`, ekran `app/pes/yillik-plan/*` (sunucu sayfası + 4 istemci parçası). Baz kapasite `workshop_profil.aylik_kapasite`'ye yazılır (satır yoksa oluşturulur).

**Tech Stack:** Next.js 16 App Router, React 19, postgres.js (`withTenantRoute` / `withServerTenant`, RLS), vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-06-yillik-plan-basit-design.md`

## Spec'ten sapmalar ve kararlar (uygulamadan önce oku)

1. **Migration ikiye bölündü: 050 (oluştur) + 051 (049'u düşür).** Geliştirme ve canlı AYNI Supabase veritabanını kullanıyor. Canlıdaki v1.8.0'ın Planlama Masası sorgusu `w.tahmin_kalem_id` ve `talep_tahmini_kalem`'i okuyor; 049 nesneleri v1.9.0 yayına çıkmadan düşürülürse canlı Planlama Masası 500 verir. 050 yalnız ekler (v1.8.0'ı bozmaz); 051 Task 10'da, v1.9.0 canlıdayken uygulanır. Kod Task 2'den itibaren 049 nesnelerine hiç dokunmaz.
2. **`workshop_profil` yazımı: spec'teki gibi profil tablosuna yazılır.** Doğrulandı: `pes_app` INSERT/UPDATE yetkili; politika `(tenant_id = current_tenant_id() OR is_internal_admin()) AND (current_workshop_id() IS NULL OR workshop_id IS NULL OR workshop_id = current_workshop_id())`, WITH CHECK yok (USING yazmada da geçerli) → merkez kullanıcısı yazabilir. `app/api/pes/atolye-profil/[id]/route.ts` PATCH aynı yolu (profil yoksa `eslesme_yontemi='elle'` ile INSERT) zaten kullanıyor. Tüm tenant'larda 131 aktif atölye var (merkez `default` tenant'ında 123); 87 profil satırı var, aktiflerden 45'inde `aylik_kapasite > 0`. Yan etkiler: (a) `scripts/import_atolye_profil.mjs` ve `scripts/eslestirme_uygula.mjs` `ON CONFLICT (workshop_id) DO UPDATE SET aylik_kapasite = EXCLUDED.aylik_kapasite` yapar — yeniden içe aktarım elle girilen bazı ezer (ekranda not olarak yazılır); (b) yeni profil satırı `/pes/atolye-profil` özetindeki "profilli" sayısını artırır — bu yüzden değer boş/0 iken satır OLUŞTURULMAZ, yalnız mevcut satır NULL'lanır.
3. **Talep hücresine 0 yazmak satırı siler** (plan hücresiyle aynı davranış). Talep yokluğu = 0; ayrı satır tutmaya gerek yok.
4. **Kapasite düzeltmesi 0 olabilir** ("o ay kapalı"). Kapasite 0 iken plan > 0 ise yüzde `∞` (kırmızı), plan 0 ise %0.
5. **Bilgi (karar değil):** `workshop.monthly_capacity` (023c, Klasman kaynağı) diye ikinci bir beyan kolonu var: 99 aktif atölyede dolu, bunların 66'sının profil kapasitesi yok; 11 atölye yalnız bu kolonda kapasite taşıyor (profil ve hat hedefi yok) ve spec zincirinde "kapasite yok" görünecek. Plan spec zincirine (düzeltme → profil → hedef → yok) sadık; bu kolonu zincire eklemek kullanıcı kararıdır.

## Bilinen tuzaklar (proje notları)

- postgres.js DATE kolonlarını sorguda `::text` ile al — yoksa `Date` nesnesi gelir ve `.slice` çöker. (Bu planda tarih yalnız `extract(...)::int` ile okunuyor.)
- `DATABASE_URL` BYPASSRLS'dir; RLS'i `APP_DATABASE_URL` ile doğrula, yazma testinde etkilenen satıra bak.
- `scripts/verify_public_api.mjs` tablo listesi STATİK — yeni tabloları ekle, düşürülenleri çıkar.
- Migration tek tek: `node scripts/_migrate_one.mjs <dosya>`.
- vitest tip denetimi yapmaz; `npx tsc --noEmit` ayrıca çalıştır.
- **Silinen rota dosyaları `.next/types` ve `.next/dev/types` içinde bayat tip doğrulayıcı bırakır** ve `tsc` bunları `tsconfig.json` `include` üzerinden okur → silme sonrası `rm -rf .next/types .next/dev/types` ve ardından `tsc`.
- **Scratchpad'teki betik `import postgres from 'postgres'` ile ÇALIŞMAZ** (paket çözümü dosyanın dizininden yapılır → `ERR_MODULE_NOT_FOUND`). `createRequire('C:/Users/bhaka/Desktop/WORK/PES/package.json')('postgres')` kullan.
- `capability_value`'da `dimension_code` kolonu YOK; `capability_dimension` ile `dimension_id` üzerinden birleştir.
- Yetenek uyumu kuralları (`lib/pes/yetenek-uyum.ts`): atölyenin klasman boyutunda hiç kaydı yoksa sonuç "uygun değil" DEĞİL, "kontrol edilemedi"dir.
- Atölye kullanıcısı (ve atölye panelini seçmiş merkez yöneticisi) `workshopId` taşır → tüm uçlar `_yetki.ts` ile 403; RLS de bu tabloları ona 0 satır gösterir.
- ESLint bu depoda bozuk; doğrulama `tsc` + `vitest` + `next build` ile yapılır.
- Klasman kodları büyük harf ASCII (`PANTOLON`, `GOMLEK`, `ELBISE` …), 50 değer.
- Git worktree'de `node_modules` junction/symlink ile bağlanırsa `next build` (Turbopack) "Symlink … points out of the filesystem root" ile çöker; build'i ana çalışma dizininde ya da gerçek `npm ci` yapılmış worktree'de çalıştır.

**Plan doğrulaması (2026-10-06):** Task 2–8'deki kod geçici bir worktree'de uygulanıp `npx tsc --noEmit` (temiz) ve `npx vitest run lib/pes/yillik-plan.test.ts` (23/23) ile sınandı; `next build` yukarıdaki junction tuzağı yüzünden orada çalıştırılamadı.

## Dosya haritası

| Dosya | İşlem | Sorumluluk |
|---|---|---|
| `supabase/migrations/050_yillik_plan_basit.sql` | Oluştur | 3 tablo, RLS (043 kalıbı), grant |
| `supabase/migrations/051_yillik_plan_v1_kaldir.sql` | Oluştur (Task 10) | 049 nesnelerini düşür |
| `scripts/verify_public_api.mjs` | Değiştir | yeni 3 tablo ekle (Task 1), 049 tablolarını çıkar (Task 10) |
| `app/api/pes/yillik-plan/route.ts`, `kalem/`, `oneri/`, `tahsis/`, `bagla/` | Sil | v1 uçları |
| `app/api/pes/yillik-plan/_yetki.ts` | Koru | atölye kullanıcısına 403 |
| `app/api/pes/yillik-plan/_dogrula.ts` | Oluştur | gövde/yıl-ay/id/metin ayrıştırma, atölye görünürlüğü |
| `app/api/pes/yillik-plan/plan/route.ts` | Oluştur | plan hücresi PUT (0 → sil) / DELETE |
| `app/api/pes/yillik-plan/talep/route.ts` | Oluştur | talep hücresi PUT (0 → sil) |
| `app/api/pes/yillik-plan/kapasite/route.ts` | Oluştur | baz kapasite PUT → `workshop_profil` |
| `app/api/pes/yillik-plan/kapasite-ay/route.ts` | Oluştur | ay düzeltmesi PUT (null → sil) |
| `lib/pes/yillik-plan.ts` | Yeniden yaz | saf hesap + paylaşılan tipler |
| `lib/pes/yillik-plan.test.ts` | Yeniden yaz | saf hesap testleri |
| `lib/pes/yillik-plan-veri.ts` | Yeniden yaz | DB okuma |
| `app/pes/yillik-plan/page.tsx` | Yeniden yaz | sunucu sayfası |
| `app/pes/yillik-plan/ortak.ts` | Oluştur | istemci tipleri, biçimleyici, form yardımcısı |
| `app/pes/yillik-plan/YillikPlan.tsx` | Yeniden yaz | kabuk: başlık, yıl, klasman filtresi, sekmeler, hata |
| `app/pes/yillik-plan/DolulukTablosu.tsx` | Oluştur | atölye × ay doluluk, uyum grupları, talep satırı |
| `app/pes/yillik-plan/AtolyePaneli.tsx` | Oluştur | yan panel: baz, 12 ay plan satırları, düzeltmeler |
| `app/pes/yillik-plan/TalepTablosu.tsx` | Oluştur | klasman × ay talep girişi, yerleşen/açık |
| `app/pes/plan-tezgahi/page.tsx`, `Tezgah.tsx` | Değiştir | v1 ipucu + bağla kaldır (Task 2), plan ipucu ekle (Task 8) |
| `components/pes/PesDevSidebar.tsx` | Dokunma | menü öğesi `/pes/yillik-plan` aynı kalır |
| `lib/version.ts`, `package.json` | Değiştir | v1.9.0 |

---

### Task 1: Migration 050 — yeni tablolar

**Files:**
- Create: `supabase/migrations/050_yillik_plan_basit.sql`
- Modify: `scripts/verify_public_api.mjs`

- [ ] **Step 1: Migration dosyasını yaz**

`supabase/migrations/050_yillik_plan_basit.sql`:

```sql
-- 050 — Yıllık plan, basit yapı (v2)
--
-- Kullanıcı planı ters yönden kuruyor: atölyenin aylık kapasitesi belli,
-- planlamacı her ay hangi atölyeye hangi klasmandan kaç adet
-- yaptıracağını kendisi yazıyor. Her şey ADET; dakika/SAM yok.
--
-- Kapasite çözümü (lib/pes/yillik-plan.ts kapasiteCoz):
--   1. atolye_kapasite_ay düzeltmesi (0 = o ay kapalı)
--   2. workshop_profil.aylik_kapasite (> 0)
--   3. aktif bantların daily_target toplamı × çalışma günü
--   4. yok
--
-- 049 (talep_tahmini…) BURADA DÜŞÜRÜLMEZ: canlı v1.8.0 Planlama Masası
-- o nesneleri okuyor. v1.9.0 yayına çıkınca 051 düşürür.
--
-- İç ekip aracı: 043'teki gibi atölye kullanıcısı tamamen dışarıda.

BEGIN;

-- Ay bazında kapasite düzeltmesi (bayram, bakım, geçici bant ekleme…).
CREATE TABLE IF NOT EXISTS atolye_kapasite_ay (
    id           SERIAL PRIMARY KEY,
    tenant_id    UUID    NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
    workshop_id  INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    yil          INTEGER NOT NULL CHECK (yil BETWEEN 2020 AND 2100),
    ay           INTEGER NOT NULL CHECK (ay BETWEEN 1 AND 12),
    adet         INTEGER NOT NULL CHECK (adet >= 0),
    sebep        TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workshop_id, yil, ay)
);
CREATE INDEX IF NOT EXISTS aka_tenant_yil_idx ON atolye_kapasite_ay (tenant_id, yil);

-- Planlamacının yazdığı hücre: atölye × ay × klasman → adet.
-- klasman_kodu katalogda (capability_value, boyut 'klasman') olmalı;
-- katalog (dimension_id, code) tekil olduğu için FK kurulamıyor —
-- API doğrular (kunye.ts ile aynı gerekçe).
CREATE TABLE IF NOT EXISTS plan_atolye_ay (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID    NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
    workshop_id   INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    yil           INTEGER NOT NULL CHECK (yil BETWEEN 2020 AND 2100),
    ay            INTEGER NOT NULL CHECK (ay BETWEEN 1 AND 12),
    klasman_kodu  TEXT    NOT NULL,
    adet          INTEGER NOT NULL CHECK (adet > 0),
    not_metni     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workshop_id, yil, ay, klasman_kodu)
);
CREATE INDEX IF NOT EXISTS paa_tenant_yil_idx ON plan_atolye_ay (tenant_id, yil);

-- Klasman × ay talep hedefi (tenant geneli).
CREATE TABLE IF NOT EXISTS plan_talep_ay (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    yil           INTEGER NOT NULL CHECK (yil BETWEEN 2020 AND 2100),
    ay            INTEGER NOT NULL CHECK (ay BETWEEN 1 AND 12),
    klasman_kodu  TEXT    NOT NULL,
    adet          INTEGER NOT NULL CHECK (adet >= 0),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, yil, ay, klasman_kodu)
);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['atolye_kapasite_ay', 'plan_atolye_ay', 'plan_talep_ay'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
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

REVOKE ALL ON atolye_kapasite_ay, plan_atolye_ay, plan_talep_ay FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON atolye_kapasite_ay, plan_atolye_ay, plan_talep_ay TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE atolye_kapasite_ay_id_seq, plan_atolye_ay_id_seq, plan_talep_ay_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;
```

- [ ] **Step 2: verify listesine yeni tabloları ekle**

`scripts/verify_public_api.mjs` içinde şu iki satırı bul:

```js
  // 049 — yıllık talep planı (iç ekip aracı)
  'talep_tahmini', 'talep_tahmini_kalem', 'talep_tahsis',
```

hemen ALTINA ekle (049 satırları Task 10'a kadar kalır — tablolar o zamana kadar var):

```js
  // 050 — yıllık plan, basit yapı (iç ekip aracı)
  'atolye_kapasite_ay', 'plan_atolye_ay', 'plan_talep_ay',
```

- [ ] **Step 3: Uygula ve public API'yi doğrula**

Run: `node scripts/_migrate_one.mjs 050_yillik_plan_basit.sql`
Expected: `OK   050_yillik_plan_basit.sql`

Run: `node scripts/verify_public_api.mjs`
Expected: üç yeni tablo `ok … erisim yok (HTTP 4xx)` ya da `ok … 0 satir`; son satır `✓ Anon anahtarıyla hiçbir uçtan veri okunamıyor.`; çıkış kodu 0.

- [ ] **Step 4: RLS'i ve `workshop_profil` yazma yolunu uygulama rolüyle doğrula**

Scratchpad'e (repoya DEĞİL) `rls050.mjs` yaz:

```js
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const KOK = 'C:/Users/bhaka/Desktop/WORK/PES'
const postgres = createRequire(`${KOK}/package.json`)('postgres')
const env = Object.fromEntries(readFileSync(`${KOK}/.env.local`, 'utf8')
  .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const yon = postgres(env.DATABASE_URL, { max: 1, prepare: false })
const app = postgres(env.APP_DATABASE_URL, { max: 1, prepare: false })

const [t] = await yon`SELECT id FROM tenant WHERE slug = 'default'`
/* Profil satırı OLMAYAN aktif atölye: upsert'in INSERT kolunu sınar. */
const [w] = await yon`
  SELECT w.id FROM workshop w
    LEFT JOIN workshop_profil p ON p.workshop_id = w.id
   WHERE w.tenant_id = ${t.id} AND w.is_active AND p.workshop_id IS NULL
   ORDER BY w.id LIMIT 1`
const [k] = await yon`
  SELECT v.code FROM capability_value v
    JOIN capability_dimension d ON d.id = v.dimension_id
   WHERE d.code = 'klasman' ORDER BY v.code LIMIT 1`

for (const tablo of ['atolye_kapasite_ay', 'plan_atolye_ay', 'plan_talep_ay']) {
  const [r] = await app.unsafe(`SELECT count(*)::int AS n FROM ${tablo}`)
  console.log('baglamsiz', tablo, r.n)
}

await app.begin(async (tx) => {
  await tx`SELECT set_config('app.current_tenant_id', ${t.id}, true)`
  await tx`SELECT set_config('app.current_workshop_id', '', true)`
  await tx`INSERT INTO plan_atolye_ay (tenant_id, workshop_id, yil, ay, klasman_kodu, adet)
           VALUES (${t.id}, ${w.id}, 2027, 1, ${k.code}, 100)`
  await tx`INSERT INTO plan_talep_ay (tenant_id, yil, ay, klasman_kodu, adet)
           VALUES (${t.id}, 2027, 1, ${k.code}, 100)`
  await tx`INSERT INTO atolye_kapasite_ay (tenant_id, workshop_id, yil, ay, adet)
           VALUES (${t.id}, ${w.id}, 2027, 1, 0)`
  const [g] = await tx`
    SELECT (SELECT count(*) FROM plan_atolye_ay     WHERE yil = 2027)::int AS a,
           (SELECT count(*) FROM plan_talep_ay      WHERE yil = 2027)::int AS b,
           (SELECT count(*) FROM atolye_kapasite_ay WHERE yil = 2027)::int AS c`
  console.log('merkez gorunen', g.a, g.b, g.c)

  const [p] = await tx`
    INSERT INTO workshop_profil (workshop_id, tenant_id, aylik_kapasite, eslesme_yontemi, data_confidence)
    VALUES (${w.id}, ${t.id}, 30000, 'elle', 'yuksek')
    ON CONFLICT (workshop_id) DO UPDATE SET aylik_kapasite = EXCLUDED.aylik_kapasite
    RETURNING aylik_kapasite`
  console.log('profil yazildi', p.aylik_kapasite)

  await tx`SELECT set_config('app.current_workshop_id', ${String(w.id)}, true)`
  const [h] = await tx`
    SELECT (SELECT count(*) FROM plan_atolye_ay)::int AS a,
           (SELECT count(*) FROM plan_talep_ay)::int AS b,
           (SELECT count(*) FROM atolye_kapasite_ay)::int AS c`
  console.log('atolye gorunen', h.a, h.b, h.c)
  throw new Error('rollback')
}).catch((e) => console.log(e.message))

await yon.end(); await app.end()
```

Run: `node "<scratchpad>/rls050.mjs"`
Expected (sırayla):
```
baglamsiz atolye_kapasite_ay 0
baglamsiz plan_atolye_ay 0
baglamsiz plan_talep_ay 0
merkez gorunen 1 1 1
profil yazildi 30000
atolye gorunen 0 0 0
rollback
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/050_yillik_plan_basit.sql scripts/verify_public_api.mjs
git commit -m "feat(yillik-plan): 050 kapasite düzeltmesi, plan ve talep tabloları

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: v1 kodunu kaldır (uygulama derlenir kalır)

**Files:**
- Delete: `app/api/pes/yillik-plan/route.ts`, `app/api/pes/yillik-plan/kalem/route.ts`, `app/api/pes/yillik-plan/oneri/route.ts`, `app/api/pes/yillik-plan/tahsis/route.ts`, `app/api/pes/yillik-plan/bagla/route.ts`, `app/pes/yillik-plan/page.tsx`, `app/pes/yillik-plan/YillikPlan.tsx`, `lib/pes/yillik-plan.ts`, `lib/pes/yillik-plan.test.ts`, `lib/pes/yillik-plan-veri.ts`
- Keep: `app/api/pes/yillik-plan/_yetki.ts`
- Modify: `app/pes/plan-tezgahi/page.tsx`, `app/pes/plan-tezgahi/Tezgah.tsx`

- [ ] **Step 1: v1 dosyalarını sil**

```bash
git rm app/api/pes/yillik-plan/route.ts \
  app/api/pes/yillik-plan/kalem/route.ts \
  app/api/pes/yillik-plan/oneri/route.ts \
  app/api/pes/yillik-plan/tahsis/route.ts \
  app/api/pes/yillik-plan/bagla/route.ts \
  app/pes/yillik-plan/page.tsx \
  app/pes/yillik-plan/YillikPlan.tsx \
  lib/pes/yillik-plan.ts \
  lib/pes/yillik-plan.test.ts \
  lib/pes/yillik-plan-veri.ts
```

Expected: 10 `rm '…'` satırı. `app/api/pes/yillik-plan/_yetki.ts` yerinde kalır.

- [ ] **Step 2: Planlama Masası sayfasından v1 ipucunu kaldır (`app/pes/plan-tezgahi/page.tsx`)**

(a) `tahminKarti` fonksiyonunu tamamen sil — şu bloğun TAMAMI (boş satır dahil) silinir:

```tsx
/** Havuz kartının yıllık plan alanları: bağlıysa kalem adı, değilse ipucu. */
function tahminKarti(
  h: Record<string, unknown>,
  ipucu: { kalem_id: number; atolyeler: string } | undefined,
): Pick<HavuzKarti, 'tahminKalemId' | 'tahminBagli' | 'tahminIpucu'> {
  const bagli = (h.tahmin_kalem_id as number | null) ?? null
  if (bagli !== null) {
    return { tahminKalemId: bagli, tahminBagli: true, tahminIpucu: (h.tahmin_kalem_ad as string | null) ?? `#${bagli}` }
  }
  return { tahminKalemId: ipucu?.kalem_id ?? null, tahminBagli: false, tahminIpucu: ipucu?.atolyeler ?? null }
}

```

(b) Havuz sorgusunda şu üç satırı:

```tsx
             w.kumas_grubu_kodu, w.cinsiyet_yas_kodu, w.kalite_kodu,
             w.tahmin_kalem_id,
             (SELECT k.ad FROM talep_tahmini_kalem k WHERE k.id = w.tahmin_kalem_id) AS tahmin_kalem_ad
```

şununla değiştir:

```tsx
             w.kumas_grubu_kodu, w.cinsiyet_yas_kodu, w.kalite_kodu
```

(c) `    /* Yıllık talep planı ipucu: onaylı bir tahmin kaleminin dolu künye` satırından başlayıp

```tsx
    ` as unknown as Array<{ wo_id: number; kalem_id: number; kalem_ad: string; atolyeler: string }>
```

satırıyla biten bloğun TAMAMINI (aradaki `const havuzIdleri = …` ve `const tahminIpuclari = …` sorgusu dahil) ve ardından gelen bir boş satırı sil. Bloktan sonra `    /* ---- Gönderilen teklifler ve atölye cevapları ---- */` satırı gelmeli.

(d) Dönüş nesnesinde:

```tsx
             havuzSatirlari, tahminIpuclari, yerlesikWo, teklifSatirlari, teklifKalemleri, bildirimSatirlari,
```

şununla değiştir:

```tsx
             havuzSatirlari, yerlesikWo, teklifSatirlari, teklifKalemleri, bildirimSatirlari,
```

(e) Havuz eşlemesindeki şu satırı sil:

```tsx
      ...tahminKarti(h, veri.tahminIpuclari.find((t) => t.wo_id === (h.id as number))),
```

- [ ] **Step 3: Tezgah bileşeninden bağla/çöz'ü kaldır (`app/pes/plan-tezgahi/Tezgah.tsx`)**

(a) `HavuzKarti` tipinde şu satırları:

```tsx
  atolyeAdi: string | null
  /** Bağlıysa bağlı kalem; değilse ipucundaki (en küçük id'li) uyan kalem. */
  tahminKalemId: number | null
  tahminBagli: boolean
  /** Bağlıysa kalem adı; değilse uyan ön-tahsisli atölye kodları. */
  tahminIpucu: string | null
}
```

şununla değiştir:

```tsx
  atolyeAdi: string | null
}
```

(b) Şu fonksiyonu ve ardından gelen boş satırı sil:

```tsx
  function tahminBagla(workOrderId: number, kalemId: number | null) {
    return cagir('/api/pes/yillik-plan/bagla', 'POST', { workOrderId, kalemId })
  }

```

(c) Havuz kartındaki şu JSX bloğunu sil:

```tsx
                {h.tahminIpucu && h.tahminKalemId !== null && (
                  <div className="flex items-center gap-1 text-[10px] text-indigo-600">
                    <span className="truncate" title="Yıllık talep planı">
                      Tahmin: {h.tahminBagli ? `bağlı (${h.tahminIpucu})` : h.tahminIpucu}
                    </span>
                    <button type="button" draggable={false}
                      disabled={bekliyor}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); tahminBagla(h.workOrderId, h.tahminBagli ? null : h.tahminKalemId) }}
                      className="shrink-0 underline disabled:opacity-50">
                      {h.tahminBagli ? 'çöz' : 'bağla'}
                    </button>
                  </div>
                )}
```

- [ ] **Step 4: Artık referans kalmadığını doğrula**

Run: `git grep -n "tahmin_kalem\|talep_tahmin\|talep_tahsis\|tahminIpucu\|tahminBagla\|yillik-plan-veri\|lib/pes/yillik-plan" -- ':!docs' ':!supabase/migrations'`
Expected: yalnız `scripts/verify_public_api.mjs` içindeki `'talep_tahmini', 'talep_tahmini_kalem', 'talep_tahsis',` satırı.

- [ ] **Step 5: Tip denetimi**

Run (Bash): `rm -rf .next/types .next/dev/types && npx tsc --noEmit`
Expected: çıktı yok, çıkış kodu 0.

- [ ] **Step 6: Commit**

```bash
git add app/pes/plan-tezgahi
git status --short   # 10 silme (D) + 2 değişiklik (M) staged olmalı
git commit -m "refactor(yillik-plan): v1 tahmin/kalem/öneri/bağla kodunu kaldır

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Saf hesap (TDD)

**Files:**
- Create: `lib/pes/yillik-plan.test.ts`
- Create: `lib/pes/yillik-plan.ts`

- [ ] **Step 1: Başarısız testleri yaz**

`lib/pes/yillik-plan.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  calismaGunu, kapasiteCoz, yillikKapasite, bazKaynagi,
  dolulukYuzdesi, dolulukRengi, yuzdeMetni, talepAcigi, ayToplamlari,
  hucreAdedi, adetGecerli, klasmanUyumu, planIpucuMetni, type AySatiri,
} from './yillik-plan'

describe('calismaGunu', () => {
  test('pazar kapalı: ocak 2027 = 26, şubat 2027 = 24, mart 2027 = 27', () => {
    expect(calismaGunu(2027, 1)).toBe(26)
    expect(calismaGunu(2027, 2)).toBe(24)
    expect(calismaGunu(2027, 3)).toBe(27)
  })
  test('2026 yılı toplamı 313', () => {
    const t = Array.from({ length: 12 }, (_, m) => calismaGunu(2026, m + 1)).reduce((a, b) => a + b, 0)
    expect(t).toBe(313)
  })
})

describe('kapasiteCoz', () => {
  const taban = { duzeltme: null, profil: null, gunlukHedef: 0, calismaGunu: 26 }
  test('düzeltme her şeyi ezer, 0 dahil (ay kapalı)', () => {
    expect(kapasiteCoz({ ...taban, duzeltme: 0, profil: 40000, gunlukHedef: 1000 }))
      .toEqual({ adet: 0, kaynak: 'duzeltme' })
  })
  test('düzeltme yoksa profil', () => {
    expect(kapasiteCoz({ ...taban, profil: 40000, gunlukHedef: 1000 }))
      .toEqual({ adet: 40000, kaynak: 'profil' })
  })
  test('profil 0 ya da yoksa günlük hedef × çalışma günü', () => {
    expect(kapasiteCoz({ ...taban, profil: 0, gunlukHedef: 1000 }))
      .toEqual({ adet: 26000, kaynak: 'hedef' })
  })
  test('hiçbiri yoksa null', () => {
    expect(kapasiteCoz(taban)).toEqual({ adet: null, kaynak: 'yok' })
  })
})

describe('yillikKapasite', () => {
  test('ay bazında çözer; düzeltme yalnız kendi ayını etkiler', () => {
    const d = Array<number | null>(12).fill(null)
    d[1] = 5000
    const k = yillikKapasite(2027, { duzeltmeler: d, profil: null, gunlukHedef: 1000 })
    expect(k.adet).toHaveLength(12)
    expect(k.adet[0]).toBe(26000)
    expect(k.kaynak[0]).toBe('hedef')
    expect(k.adet[1]).toBe(5000)
    expect(k.kaynak[1]).toBe('duzeltme')
    expect(k.adet[2]).toBe(27000)
  })
})

describe('bazKaynagi', () => {
  test('profil > hedef > yok', () => {
    expect(bazKaynagi(40000, 1000)).toBe('profil')
    expect(bazKaynagi(null, 500)).toBe('hedef')
    expect(bazKaynagi(0, 0)).toBe('yok')
  })
})

describe('doluluk', () => {
  test('yüzde', () => {
    expect(dolulukYuzdesi(20000, 40000)).toBe(50)
    expect(dolulukYuzdesi(5, null)).toBeNull()
    expect(dolulukYuzdesi(1, 0)).toBe(Number.POSITIVE_INFINITY)
    expect(dolulukYuzdesi(0, 0)).toBe(0)
  })
  test('renk eşikleri: ≤85 yeşil, ≤100 sarı, >100 kırmızı', () => {
    expect(dolulukRengi(null)).toBe('yok')
    expect(dolulukRengi(85)).toBe('yesil')
    expect(dolulukRengi(85.5)).toBe('sari')
    expect(dolulukRengi(100)).toBe('sari')
    expect(dolulukRengi(100.1)).toBe('kirmizi')
    expect(dolulukRengi(Number.POSITIVE_INFINITY)).toBe('kirmizi')
  })
  test('metin', () => {
    expect(yuzdeMetni(null)).toBe('—')
    expect(yuzdeMetni(Number.POSITIVE_INFINITY)).toBe('∞')
    expect(yuzdeMetni(0.4)).toBe('<%1')
    expect(yuzdeMetni(0)).toBe('%0')
    expect(yuzdeMetni(84.6)).toBe('%85')
  })
})

describe('talepAcigi', () => {
  test('açık ve fazla', () => {
    expect(talepAcigi(100, 60)).toEqual({ acik: 40, fazla: 0 })
    expect(talepAcigi(100, 130)).toEqual({ acik: 0, fazla: 30 })
    expect(talepAcigi(0, 0)).toEqual({ acik: 0, fazla: 0 })
  })
})

describe('ayToplamlari', () => {
  const s: AySatiri[] = [
    { workshopId: 1, ay: 1, klasmanKodu: 'PANTOLON', adet: 100 },
    { workshopId: 1, ay: 1, klasmanKodu: 'GOMLEK', adet: 50 },
    { workshopId: 2, ay: 3, klasmanKodu: 'PANTOLON', adet: 70 },
    { workshopId: 1, ay: 12, klasmanKodu: null, adet: 5 },
  ]
  test('süzgeçsiz: ay toplamları', () => {
    const t = ayToplamlari(s)
    expect(t).toHaveLength(12)
    expect(t[0]).toBe(150)
    expect(t[2]).toBe(70)
    expect(t[11]).toBe(5)
  })
  test('atölye süzgeci', () => {
    expect(ayToplamlari(s, { workshopId: 1 })).toEqual([150, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5])
  })
  test('klasman süzgeci; null klasman = hepsi', () => {
    expect(ayToplamlari(s, { klasman: 'PANTOLON' })).toEqual([100, 0, 70, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(ayToplamlari(s, { klasman: null })).toEqual(ayToplamlari(s))
  })
  test('ikisi birlikte', () => {
    const t = ayToplamlari(s, { workshopId: 1, klasman: 'PANTOLON' })
    expect(t[0]).toBe(100)
    expect(t[2]).toBe(0)
  })
})

describe('adet girdisi', () => {
  test('hucreAdedi: Türkçe binlik nokta ve boşluk atılır, boş = 0', () => {
    expect(hucreAdedi('20.000')).toBe(20000)
    expect(hucreAdedi(' 1 500 ')).toBe(1500)
    expect(hucreAdedi('')).toBe(0)
    expect(hucreAdedi('-5')).toBeNull()
    expect(hucreAdedi('1,5')).toBeNull()
    expect(hucreAdedi('abc')).toBeNull()
  })
  test('adetGecerli: yalnız negatif olmayan tam sayı (number)', () => {
    expect(adetGecerli(0)).toBe(0)
    expect(adetGecerli(20000)).toBe(20000)
    expect(adetGecerli(-1)).toBeNull()
    expect(adetGecerli(1.5)).toBeNull()
    expect(adetGecerli('100')).toBeNull()
    expect(adetGecerli(null)).toBeNull()
    expect(adetGecerli(3_000_000_000)).toBeNull()
  })
})

describe('klasmanUyumu', () => {
  test('kayıtta var → uygun, başka değer var → uyumsuz', () => {
    expect(klasmanUyumu('PANTOLON', ['PANTOLON', 'GOMLEK'], true)).toBe('uygun')
    expect(klasmanUyumu('ELBISE', ['PANTOLON'], true)).toBe('uyumsuz')
  })
  test('atölyenin klasman kaydı yok → kontrol edilemedi (uyumsuz DEĞİL)', () => {
    expect(klasmanUyumu('ELBISE', [], true)).toBe('bilinmiyor')
  })
  test('klasman boyutu hiç izlenmiyorsa → kontrol edilemedi', () => {
    expect(klasmanUyumu('PANTOLON', ['PANTOLON'], false)).toBe('bilinmiyor')
  })
})

describe('planIpucuMetni', () => {
  test('Türkçe binlik ile kod (adet) listesi', () => {
    expect(planIpucuMetni([{ kod: 'B021', adet: 20000 }, { kod: 'B005', adet: 8000 }]))
      .toBe('B021 (20.000), B005 (8.000)')
  })
  test('boşsa null', () => {
    expect(planIpucuMetni([])).toBeNull()
  })
})
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx vitest run lib/pes/yillik-plan.test.ts`
Expected: FAIL — `Failed to resolve import "./yillik-plan"` (dosya yok).

- [ ] **Step 3: Saf hesabı yaz**

`lib/pes/yillik-plan.ts`:

```ts
/**
 * Yıllık plan (v2, basit yapı) — saf hesap ve paylaşılan tipler.
 *
 * HER ŞEY ADET. Atölyenin aylık kapasitesi tek sayıdır (klasmandan
 * bağımsız); planlamacı her ay hangi atölyeye hangi klasmandan kaç adet
 * yaptıracağını kendisi yazar. v1'in dakika/SAM hesabı ve öneri motoru
 * bilerek kaldırıldı (spec 2026-10-06-yillik-plan-basit-design.md).
 *
 * Kapasite öncelik sırası (spec §1):
 *   1. ay düzeltmesi (atolye_kapasite_ay) — 0 dahil, "o ay kapalı"
 *   2. profil bazı (workshop_profil.aylik_kapasite > 0)
 *   3. aktif bantların günlük hedef toplamı × çalışma günü (≈ tahmin)
 *   4. yok
 *
 * İstemci bileşenleri de bu dosyayı içe aktarır: sunucuya özgü import YOK.
 */
import { pazarMi } from './bant-doluluk'
import { boyutUyumlari, uyumOzeti, genelUyum, type GenelUyum } from './yetenek-uyum'

export const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

export type KapasiteKaynagi = 'duzeltme' | 'profil' | 'hedef' | 'yok'

export const KAYNAK_ETIKET: Record<KapasiteKaynagi, string> = {
  duzeltme: 'düzeltme',
  profil: 'profil',
  hedef: 'hedef≈',
  yok: 'kapasite yok',
}

export const KAYNAK_ACIKLAMA: Record<KapasiteKaynagi, string> = {
  duzeltme: 'Bu ay için elle girilen kapasite düzeltmesi',
  profil: 'Atölye profilindeki aylık kapasite',
  hedef: 'Aktif bantların günlük hedef toplamı × ayın çalışma günü (kaba tahmin)',
  yok: 'Kapasite bilgisi yok; doluluk yüzdesi hesaplanamaz',
}

export type Klasman = { code: string; label: string }

/** Plan, fiili sipariş ve talep satırlarının ortak biçimi. Talepte workshopId null. */
export type AySatiri = { workshopId: number | null; ay: number; klasmanKodu: string | null; adet: number }

export type PlanSatiri = {
  id: number
  workshopId: number
  ay: number
  klasmanKodu: string
  adet: number
  notMetni: string | null
}

export type AyDuzeltmesi = { adet: number; sebep: string | null }

export type AtolyeKapasitesi = {
  workshopId: number
  kod: string
  ad: string
  /** workshop_profil.aylik_kapasite (ham; 0/null = baz yok). */
  profilKapasite: number | null
  /** Aktif bantların daily_target toplamı. */
  gunlukHedef: number
  /** Düzeltmeler hariç bazın kaynağı — satır etiketi. */
  bazKaynak: KapasiteKaynagi
  kapasite: (number | null)[]
  kaynak: KapasiteKaynagi[]
  duzeltme: (AyDuzeltmesi | null)[]
  /** Atölyenin bantlarında kayıtlı klasman kodları (line_capability). */
  klasmanlar: string[]
}

const iki = (n: number) => String(n).padStart(2, '0')

/** Ayın çalışma günü: pazartesi–cumartesi; pazar kapalı (bant-doluluk.ts kuralı). */
export function calismaGunu(yil: number, ay: number): number {
  const son = new Date(Date.UTC(yil, ay, 0)).getUTCDate()
  let n = 0
  for (let g = 1; g <= son; g++) {
    if (!pazarMi(`${yil}-${iki(ay)}-${iki(g)}`)) n++
  }
  return n
}

export function kapasiteCoz(g: {
  duzeltme: number | null
  profil: number | null
  gunlukHedef: number
  calismaGunu: number
}): { adet: number | null; kaynak: KapasiteKaynagi } {
  if (g.duzeltme !== null && g.duzeltme >= 0) return { adet: g.duzeltme, kaynak: 'duzeltme' }
  if (g.profil !== null && g.profil > 0) return { adet: g.profil, kaynak: 'profil' }
  if (g.gunlukHedef > 0 && g.calismaGunu > 0) {
    return { adet: g.gunlukHedef * g.calismaGunu, kaynak: 'hedef' }
  }
  return { adet: null, kaynak: 'yok' }
}

export function yillikKapasite(yil: number, g: {
  duzeltmeler: (number | null)[]
  profil: number | null
  gunlukHedef: number
}): { adet: (number | null)[]; kaynak: KapasiteKaynagi[] } {
  const c = Array.from({ length: 12 }, (_, m) => kapasiteCoz({
    duzeltme: g.duzeltmeler[m] ?? null,
    profil: g.profil,
    gunlukHedef: g.gunlukHedef,
    calismaGunu: calismaGunu(yil, m + 1),
  }))
  return { adet: c.map((x) => x.adet), kaynak: c.map((x) => x.kaynak) }
}

/** Atölye satırı etiketi: düzeltmeler hariç bazın kaynağı. */
export function bazKaynagi(profil: number | null, gunlukHedef: number): KapasiteKaynagi {
  return kapasiteCoz({ duzeltme: null, profil, gunlukHedef, calismaGunu: 1 }).kaynak
}

/**
 * Doluluk yüzdesi. Kapasite yoksa null. Kapasite 0 (ay kapalı) iken plan
 * varsa sonsuz — kırmızı görünmeli; plan yoksa %0.
 */
export function dolulukYuzdesi(plan: number, kapasite: number | null): number | null {
  if (kapasite === null) return null
  if (kapasite <= 0) return plan > 0 ? Number.POSITIVE_INFINITY : 0
  return (plan / kapasite) * 100
}

export type DolulukRengi = 'yok' | 'yesil' | 'sari' | 'kirmizi'

export function dolulukRengi(y: number | null): DolulukRengi {
  if (y === null) return 'yok'
  if (y > 100) return 'kirmizi'
  if (y > 85) return 'sari'
  return 'yesil'
}

export function yuzdeMetni(y: number | null): string {
  if (y === null) return '—'
  if (!Number.isFinite(y)) return '∞'
  if (y > 0 && y < 1) return '<%1'
  return `%${Math.round(y)}`
}

/** Talep − yerleşen. Negatifse "fazla" olarak döner. */
export function talepAcigi(talep: number, yerlesen: number): { acik: number; fazla: number } {
  return { acik: Math.max(0, talep - yerlesen), fazla: Math.max(0, yerlesen - talep) }
}

/**
 * 12 aylık toplam. `workshopId` verilmezse tüm atölyeler; `klasman`
 * null/undefined ise tüm klasmanlar.
 */
export function ayToplamlari(
  satirlar: AySatiri[],
  f: { workshopId?: number; klasman?: string | null } = {},
): number[] {
  const t = Array<number>(12).fill(0)
  for (const s of satirlar) {
    if (f.workshopId !== undefined && s.workshopId !== f.workshopId) continue
    if (f.klasman != null && s.klasmanKodu !== f.klasman) continue
    if (s.ay >= 1 && s.ay <= 12) t[s.ay - 1] += s.adet
  }
  return t
}

/**
 * Ekran girdisi → adet. Türkçe binlik nokta ve boşluk atılır; boş = 0
 * (sil). Negatif/ondalık/harf için null.
 */
export function hucreAdedi(girdi: string): number | null {
  const t = girdi.replace(/[.\s]/g, '')
  if (t === '') return 0
  return /^\d+$/.test(t) ? Number(t) : null
}

/** API gövdesindeki adet: yalnız negatif olmayan, INTEGER'a sığan tam sayı (number). */
export function adetGecerli(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 2_147_483_647 ? v : null
}

/**
 * Klasman-yalnız yetenek uyumu — yetenek-uyum.ts kuralları, künye yalnız
 * klasman_kodu. Atölyenin klasman kaydı yoksa "bilinmiyor" (uyumsuz değil).
 */
export function klasmanUyumu(
  kod: string, atolyeKlasmanlari: string[], klasmanIzleniyor: boolean,
): GenelUyum {
  const izlenen = new Set<string>(klasmanIzleniyor ? ['klasman'] : [])
  const yetenek = atolyeKlasmanlari.map((d) => ({ boyut: 'klasman', deger: d }))
  return genelUyum(uyumOzeti(boyutUyumlari({ klasman_kodu: kod }, yetenek, izlenen)))
}

/** Klasman seçiliyken atölye grup sırası: uygun → kontrol edilemedi → uygun değil. */
export const UYUM_SIRASI: Record<GenelUyum, number> = { uygun: 0, bilinmiyor: 1, uyumsuz: 2 }

export const UYUM_GRUP_ETIKET: Record<GenelUyum, string> = {
  uygun: 'Uygun',
  bilinmiyor: 'Kontrol edilemedi (klasman kaydı yok)',
  uyumsuz: 'Uygun değil',
}

const tr = new Intl.NumberFormat('tr-TR')

/** Planlama Masası ipucu: "B021 (20.000), B005 (8.000)". */
export function planIpucuMetni(satirlar: Array<{ kod: string; adet: number }>): string | null {
  if (satirlar.length === 0) return null
  return satirlar.map((s) => `${s.kod} (${tr.format(s.adet)})`).join(', ')
}
```

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run lib/pes/yillik-plan.test.ts`
Expected: PASS — `Tests  23 passed (23)`.

- [ ] **Step 5: Tip denetimi**

Run: `npx tsc --noEmit`
Expected: çıktı yok.

- [ ] **Step 6: Commit**

```bash
git add lib/pes/yillik-plan.ts lib/pes/yillik-plan.test.ts
git commit -m "feat(yillik-plan): adet tabanlı saf hesap (kapasite çözme, doluluk, talep açığı)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Veri katmanı

**Files:**
- Create: `lib/pes/yillik-plan-veri.ts`

- [ ] **Step 1: Okuma fonksiyonlarını yaz**

`lib/pes/yillik-plan-veri.ts`:

```ts
/**
 * Yıllık plan (v2) — veritabanı okuması. Hesap yillik-plan.ts'te.
 *
 * Tüm fonksiyonlar TRANSACTION handle'ı ister (withTenantRoute /
 * withServerTenant içi); aksi halde RLS tenant bağlamı yok, 0 satır.
 */
import type postgres from 'postgres'
import {
  bazKaynagi, yillikKapasite,
  type AtolyeKapasitesi, type AyDuzeltmesi, type AySatiri, type Klasman, type PlanSatiri,
} from './yillik-plan'

type Sql = postgres.TransactionSql

/** Klasman kataloğu (capability_value, boyut 'klasman'), katalog sırasıyla. */
export async function klasmanKatalogu(sql: Sql): Promise<Klasman[]> {
  return await sql`
    SELECT v.code, v.label
      FROM capability_value v
      JOIN capability_dimension d ON d.id = v.dimension_id
     WHERE d.code = 'klasman'
     ORDER BY v.sort_order, v.label
  ` as unknown as Klasman[]
}

export async function klasmanVarMi(sql: Sql, kod: string): Promise<boolean> {
  const r = await sql`
    SELECT 1
      FROM capability_value v
      JOIN capability_dimension d ON d.id = v.dimension_id
     WHERE d.code = 'klasman' AND v.code = ${kod}
     LIMIT 1`
  return r.length > 0
}

/**
 * Klasman boyutu yetenek kataloğunda tutuluyor mu. Hiç kayıt yoksa uyum
 * sorulamaz — her atölye "kontrol edilemedi" görünür, "uygun değil" değil.
 */
export async function klasmanIzleniyor(sql: Sql): Promise<boolean> {
  const r = await sql`SELECT 1 FROM line_capability WHERE dimension_code = 'klasman' LIMIT 1`
  return r.length > 0
}

/** Aktif atölyeler: 12 aylık kapasite (kaynağıyla), düzeltmeler, klasman yetenekleri. */
export async function atolyeKapasiteleri(sql: Sql, yil: number): Promise<AtolyeKapasitesi[]> {
  const atolyeler = await sql`
    SELECT w.id, w.code, w.name,
           wp.aylik_kapasite AS profil,
           COALESCE((SELECT SUM(pl.daily_target) FROM production_line pl
                      WHERE pl.workshop_id = w.id AND pl.is_active), 0)::int AS hedef
      FROM workshop w
      LEFT JOIN workshop_profil wp ON wp.workshop_id = w.id
     WHERE w.is_active
     ORDER BY w.code
  ` as unknown as Array<{ id: number; code: string; name: string; profil: number | null; hedef: number }>

  const duzeltmeSatirlari = await sql`
    SELECT workshop_id, ay, adet, sebep
      FROM atolye_kapasite_ay
     WHERE yil = ${yil}
  ` as unknown as Array<{ workshop_id: number; ay: number; adet: number; sebep: string | null }>

  const yetenekSatirlari = await sql`
    SELECT DISTINCT pl.workshop_id, lc.value_code AS kod
      FROM line_capability lc
      JOIN production_line pl ON pl.id = lc.line_id
     WHERE lc.dimension_code = 'klasman'
  ` as unknown as Array<{ workshop_id: number; kod: string }>

  const duzeltmeler = new Map<number, (AyDuzeltmesi | null)[]>()
  for (const d of duzeltmeSatirlari) {
    const l = duzeltmeler.get(d.workshop_id) ?? Array<AyDuzeltmesi | null>(12).fill(null)
    l[d.ay - 1] = { adet: d.adet, sebep: d.sebep }
    duzeltmeler.set(d.workshop_id, l)
  }
  const yetenek = new Map<number, string[]>()
  for (const y of yetenekSatirlari) {
    const l = yetenek.get(y.workshop_id) ?? []
    l.push(y.kod)
    yetenek.set(y.workshop_id, l)
  }

  return atolyeler.map((a) => {
    const duzeltme = duzeltmeler.get(a.id) ?? Array<AyDuzeltmesi | null>(12).fill(null)
    const k = yillikKapasite(yil, {
      duzeltmeler: duzeltme.map((d) => d?.adet ?? null),
      profil: a.profil,
      gunlukHedef: a.hedef,
    })
    return {
      workshopId: a.id,
      kod: a.code,
      ad: a.name,
      profilKapasite: a.profil,
      gunlukHedef: a.hedef,
      bazKaynak: bazKaynagi(a.profil, a.hedef),
      kapasite: k.adet,
      kaynak: k.kaynak,
      duzeltme,
      klasmanlar: yetenek.get(a.id) ?? [],
    }
  })
}

export async function planSatirlari(sql: Sql, yil: number): Promise<PlanSatiri[]> {
  return await sql`
    SELECT id, workshop_id AS "workshopId", ay, klasman_kodu AS "klasmanKodu",
           adet, not_metni AS "notMetni"
      FROM plan_atolye_ay
     WHERE yil = ${yil}
     ORDER BY workshop_id, ay, klasman_kodu
  ` as unknown as PlanSatiri[]
}

export async function talepSatirlari(sql: Sql, yil: number): Promise<AySatiri[]> {
  return await sql`
    SELECT NULL::int AS "workshopId", ay, klasman_kodu AS "klasmanKodu", adet
      FROM plan_talep_ay
     WHERE yil = ${yil}
  ` as unknown as AySatiri[]
}

/**
 * Atanmış gerçek siparişler (bilgi amaçlı). Ay = bitiş, yoksa teslim
 * (v1 poAylikYuk ve Planlama Masası ipucuyla aynı kural).
 */
export async function fiiliSiparisler(sql: Sql, yil: number): Promise<AySatiri[]> {
  return await sql`
    SELECT workshop_id AS "workshopId",
           extract(month FROM COALESCE(bitis_tarihi, teslim_tarihi))::int AS ay,
           klasman_kodu AS "klasmanKodu",
           COALESCE(SUM(siparis_miktari), 0)::int AS adet
      FROM work_order
     WHERE workshop_id IS NOT NULL
       AND durum <> 'Iptal'
       AND extract(year FROM COALESCE(bitis_tarihi, teslim_tarihi)) = ${yil}
     GROUP BY 1, 2, 3
  ` as unknown as AySatiri[]
}
```

- [ ] **Step 2: Tip denetimi**

Run: `npx tsc --noEmit`
Expected: çıktı yok.

- [ ] **Step 3: Sorguları gerçek veritabanında sına (scratchpad)**

Scratchpad'e `veri050.mjs` yaz (aynı SQL'ler, tenant bağlamıyla, uygulama rolü):

```js
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const KOK = 'C:/Users/bhaka/Desktop/WORK/PES'
const postgres = createRequire(`${KOK}/package.json`)('postgres')
const env = Object.fromEntries(readFileSync(`${KOK}/.env.local`, 'utf8')
  .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const yon = postgres(env.DATABASE_URL, { max: 1, prepare: false })
const app = postgres(env.APP_DATABASE_URL, { max: 1, prepare: false })
const [t] = await yon`SELECT id FROM tenant WHERE slug = 'default'`
await app.begin(async (tx) => {
  await tx`SELECT set_config('app.current_tenant_id', ${t.id}, true)`
  await tx`SELECT set_config('app.current_workshop_id', '', true)`
  const [a] = await tx`
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE wp.aylik_kapasite > 0)::int AS profil
      FROM workshop w LEFT JOIN workshop_profil wp ON wp.workshop_id = w.id
     WHERE w.is_active`
  const [k] = await tx`
    SELECT count(*)::int AS n FROM capability_value v
      JOIN capability_dimension d ON d.id = v.dimension_id WHERE d.code = 'klasman'`
  const f = await tx`
    SELECT workshop_id, extract(month FROM COALESCE(bitis_tarihi, teslim_tarihi))::int AS ay,
           klasman_kodu, COALESCE(SUM(siparis_miktari), 0)::int AS adet
      FROM work_order
     WHERE workshop_id IS NOT NULL AND durum <> 'Iptal'
       AND extract(year FROM COALESCE(bitis_tarihi, teslim_tarihi)) = 2026
     GROUP BY 1, 2, 3`
  console.log('atolye', a.n, 'profilli', a.profil, 'klasman', k.n, 'fiili satir', f.length)
})
await yon.end(); await app.end()
```

Run: `node "<scratchpad>/veri050.mjs"`
Expected: `atolye 123 profilli 45 klasman 50 fiili satir <N≥0>` (sayılar canlı veriyle biraz oynayabilir; atölye sayısı 0 ise tenant bağlamı kurulmamıştır — dur ve incele).

- [ ] **Step 4: Commit**

```bash
git add lib/pes/yillik-plan-veri.ts
git commit -m "feat(yillik-plan): veri katmanı (kapasite, plan, talep, fiili sipariş, katalog)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: API uçları

**Files:**
- Create: `app/api/pes/yillik-plan/_dogrula.ts`
- Create: `app/api/pes/yillik-plan/plan/route.ts`
- Create: `app/api/pes/yillik-plan/talep/route.ts`
- Create: `app/api/pes/yillik-plan/kapasite/route.ts`
- Create: `app/api/pes/yillik-plan/kapasite-ay/route.ts`
- Keep: `app/api/pes/yillik-plan/_yetki.ts`

Hata sözleşmesi (spec §7): katalogda olmayan klasman → 400; negatif / tam sayı olmayan adet → 400; plan/talep adet 0 → satır silinir; atölye kullanıcısı → 403 (tüm uçlar, ilk kontrol); görünmeyen atölye → 404.

- [ ] **Step 1: Ortak doğrulama yardımcıları**

`app/api/pes/yillik-plan/_dogrula.ts`:

```ts
import { NextResponse } from 'next/server'
import type postgres from 'postgres'

type Sql = postgres.TransactionSql

export const hata = (mesaj: string, status = 400) => NextResponse.json({ error: mesaj }, { status })

export async function govdeOku(req: Request): Promise<Record<string, unknown> | null> {
  const b: unknown = await req.json().catch(() => null)
  return b !== null && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null
}

export function yilAyCoz(b: Record<string, unknown>): { yil: number; ay: number } | null {
  const { yil, ay } = b
  if (typeof yil !== 'number' || !Number.isInteger(yil) || yil < 2020 || yil > 2100) return null
  if (typeof ay !== 'number' || !Number.isInteger(ay) || ay < 1 || ay > 12) return null
  return { yil, ay }
}

/** Pozitif tam sayı id; sayı ya da sayısal metin (query string) kabul eder. */
export function idCoz(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null
}

export function metinCoz(v: unknown, enUzun: number): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, enUzun) : null
}

/** RLS altında görünen atölyenin tenant'ı; görünmüyorsa null (→ 404). */
export async function atolyeTenant(sql: Sql, workshopId: number): Promise<string | null> {
  const [w] = await sql`SELECT tenant_id FROM workshop WHERE id = ${workshopId}` as unknown as
    Array<{ tenant_id: string }>
  return w?.tenant_id ?? null
}
```

- [ ] **Step 2: Plan hücresi ucu**

`app/api/pes/yillik-plan/plan/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { adetGecerli } from '@/lib/pes/yillik-plan'
import { klasmanVarMi } from '@/lib/pes/yillik-plan-veri'
import { atolyeyseReddet } from '../_yetki'
import { atolyeTenant, govdeOku, hata, idCoz, metinCoz, yilAyCoz } from '../_dogrula'

/**
 * Atölye × ay × klasman plan hücresi.
 *   PUT    { workshopId, yil, ay, klasmanKodu, adet, notMetni? }   adet 0 → satır silinir
 *   DELETE ?id=…
 */
export const PUT = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const b = await govdeOku(req)
  if (!b) return hata('Gövde JSON nesnesi olmalı')
  const ya = yilAyCoz(b)
  if (!ya) return hata('yil (2020-2100) ve ay (1-12) tam sayı olmalı')
  const workshopId = idCoz(b.workshopId)
  if (workshopId === null) return hata('workshopId zorunlu')
  const adet = adetGecerli(b.adet)
  if (adet === null) return hata('adet negatif olmayan tam sayı olmalı')
  const klasmanKodu = metinCoz(b.klasmanKodu, 50)
  if (!klasmanKodu || !(await klasmanVarMi(sql, klasmanKodu))) {
    return hata(`Klasman katalogda yok: ${klasmanKodu ?? '(boş)'}`)
  }
  const tenantId = await atolyeTenant(sql, workshopId)
  if (!tenantId) return hata('Atölye bulunamadı', 404)

  if (adet === 0) {
    await sql`
      DELETE FROM plan_atolye_ay
       WHERE workshop_id = ${workshopId} AND yil = ${ya.yil} AND ay = ${ya.ay}
         AND klasman_kodu = ${klasmanKodu}`
    return NextResponse.json({ ok: true, silindi: true })
  }
  const [r] = await sql`
    INSERT INTO plan_atolye_ay (tenant_id, workshop_id, yil, ay, klasman_kodu, adet, not_metni)
    VALUES (${tenantId}, ${workshopId}, ${ya.yil}, ${ya.ay}, ${klasmanKodu}, ${adet},
            ${metinCoz(b.notMetni, 300)})
    ON CONFLICT (workshop_id, yil, ay, klasman_kodu)
    DO UPDATE SET adet = EXCLUDED.adet, not_metni = EXCLUDED.not_metni, updated_at = now()
    RETURNING id
  ` as unknown as Array<{ id: number }>
  return NextResponse.json({ id: r.id })
})

export const DELETE = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const id = idCoz(new URL(req.url).searchParams.get('id'))
  if (id === null) return hata('id zorunlu')
  const silinen = await sql`DELETE FROM plan_atolye_ay WHERE id = ${id} RETURNING id`
  if (silinen.length === 0) return hata('Plan satırı bulunamadı', 404)
  return NextResponse.json({ ok: true })
})
```

- [ ] **Step 3: Talep hücresi ucu**

`app/api/pes/yillik-plan/talep/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { adetGecerli } from '@/lib/pes/yillik-plan'
import { klasmanVarMi } from '@/lib/pes/yillik-plan-veri'
import { atolyeyseReddet } from '../_yetki'
import { govdeOku, hata, metinCoz, yilAyCoz } from '../_dogrula'

/**
 * Klasman × ay talep hedefi.
 *   PUT { yil, ay, klasmanKodu, adet }   adet 0 → satır silinir (talep yok = 0)
 */
export const PUT = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const b = await govdeOku(req)
  if (!b) return hata('Gövde JSON nesnesi olmalı')
  const ya = yilAyCoz(b)
  if (!ya) return hata('yil (2020-2100) ve ay (1-12) tam sayı olmalı')
  const adet = adetGecerli(b.adet)
  if (adet === null) return hata('adet negatif olmayan tam sayı olmalı')
  const klasmanKodu = metinCoz(b.klasmanKodu, 50)
  if (!klasmanKodu || !(await klasmanVarMi(sql, klasmanKodu))) {
    return hata(`Klasman katalogda yok: ${klasmanKodu ?? '(boş)'}`)
  }

  if (adet === 0) {
    await sql`
      DELETE FROM plan_talep_ay
       WHERE tenant_id = ${tenant.tenantId} AND yil = ${ya.yil} AND ay = ${ya.ay}
         AND klasman_kodu = ${klasmanKodu}`
    return NextResponse.json({ ok: true, silindi: true })
  }
  await sql`
    INSERT INTO plan_talep_ay (tenant_id, yil, ay, klasman_kodu, adet)
    VALUES (${tenant.tenantId}, ${ya.yil}, ${ya.ay}, ${klasmanKodu}, ${adet})
    ON CONFLICT (tenant_id, yil, ay, klasman_kodu)
    DO UPDATE SET adet = EXCLUDED.adet, updated_at = now()`
  return NextResponse.json({ ok: true })
})
```

- [ ] **Step 4: Baz kapasite ucu (`workshop_profil`)**

`app/api/pes/yillik-plan/kapasite/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { adetGecerli } from '@/lib/pes/yillik-plan'
import { atolyeyseReddet } from '../_yetki'
import { atolyeTenant, govdeOku, hata, idCoz } from '../_dogrula'

/**
 * Atölyenin baz aylık kapasitesi → workshop_profil.aylik_kapasite.
 *   PUT { workshopId, aylikKapasite: number | null }   null/0 → baz kaldırılır
 *
 * Profil satırı yoksa OLUŞTURULUR (eslesme_yontemi 'elle') —
 * /api/pes/atolye-profil/[id] PATCH ile aynı yol. Değer boşken yeni satır
 * açılmaz: boş profil satırı atölye-profil ekranındaki "profilli" sayısını
 * yanlış artırırdı.
 *
 * DİKKAT: scripts/import_atolye_profil.mjs ve eslestirme_uygula.mjs
 * aylik_kapasite'yi Excel'den ezer; ekranda bu not gösteriliyor.
 */
export const PUT = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const b = await govdeOku(req)
  if (!b) return hata('Gövde JSON nesnesi olmalı')
  const workshopId = idCoz(b.workshopId)
  if (workshopId === null) return hata('workshopId zorunlu')
  if (!('aylikKapasite' in b)) return hata('aylikKapasite zorunlu (silmek için null)')
  const ham = b.aylikKapasite ?? null
  const temiz = ham === null ? null : adetGecerli(ham)
  if (ham !== null && temiz === null) {
    return hata('aylikKapasite negatif olmayan tam sayı ya da null olmalı')
  }
  const deger = temiz !== null && temiz > 0 ? temiz : null
  const tenantId = await atolyeTenant(sql, workshopId)
  if (!tenantId) return hata('Atölye bulunamadı', 404)

  if (deger === null) {
    await sql`UPDATE workshop_profil SET aylik_kapasite = NULL WHERE workshop_id = ${workshopId}`
  } else {
    await sql`
      INSERT INTO workshop_profil (workshop_id, tenant_id, aylik_kapasite, eslesme_yontemi, data_confidence)
      VALUES (${workshopId}, ${tenantId}, ${deger}, 'elle', 'yuksek')
      ON CONFLICT (workshop_id) DO UPDATE SET aylik_kapasite = EXCLUDED.aylik_kapasite`
  }
  return NextResponse.json({ ok: true, aylikKapasite: deger })
})
```

- [ ] **Step 5: Ay düzeltmesi ucu**

`app/api/pes/yillik-plan/kapasite-ay/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { adetGecerli } from '@/lib/pes/yillik-plan'
import { atolyeyseReddet } from '../_yetki'
import { atolyeTenant, govdeOku, hata, idCoz, metinCoz, yilAyCoz } from '../_dogrula'

/**
 * Atölye × ay kapasite düzeltmesi.
 *   PUT { workshopId, yil, ay, adet: number | null, sebep? }
 *   adet null → düzeltme kaldırılır; 0 geçerli ("o ay kapalı").
 */
export const PUT = withTenantRoute(async (req, { sql, tenant }) => {
  const red = atolyeyseReddet(tenant)
  if (red) return red
  const b = await govdeOku(req)
  if (!b) return hata('Gövde JSON nesnesi olmalı')
  const ya = yilAyCoz(b)
  if (!ya) return hata('yil (2020-2100) ve ay (1-12) tam sayı olmalı')
  const workshopId = idCoz(b.workshopId)
  if (workshopId === null) return hata('workshopId zorunlu')
  if (!('adet' in b)) return hata('adet zorunlu (düzeltmeyi kaldırmak için null)')
  const ham = b.adet ?? null
  const adet = ham === null ? null : adetGecerli(ham)
  if (ham !== null && adet === null) return hata('adet negatif olmayan tam sayı ya da null olmalı')
  const tenantId = await atolyeTenant(sql, workshopId)
  if (!tenantId) return hata('Atölye bulunamadı', 404)

  if (adet === null) {
    await sql`
      DELETE FROM atolye_kapasite_ay
       WHERE workshop_id = ${workshopId} AND yil = ${ya.yil} AND ay = ${ya.ay}`
    return NextResponse.json({ ok: true, silindi: true })
  }
  await sql`
    INSERT INTO atolye_kapasite_ay (tenant_id, workshop_id, yil, ay, adet, sebep)
    VALUES (${tenantId}, ${workshopId}, ${ya.yil}, ${ya.ay}, ${adet}, ${metinCoz(b.sebep, 200)})
    ON CONFLICT (workshop_id, yil, ay)
    DO UPDATE SET adet = EXCLUDED.adet, sebep = EXCLUDED.sebep, updated_at = now()`
  return NextResponse.json({ ok: true })
})
```

- [ ] **Step 6: Tip denetimi**

Run: `npx tsc --noEmit`
Expected: çıktı yok. (Uçlar oturum ister; uçtan uca denetim Task 9'da tarayıcıdan yapılır.)

- [ ] **Step 7: Commit**

```bash
git add app/api/pes/yillik-plan
git commit -m "feat(yillik-plan): plan, talep, baz kapasite ve ay düzeltmesi uçları

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ekran — sayfa, doluluk tablosu, atölye paneli

**Files:**
- Create: `app/pes/yillik-plan/ortak.ts`
- Create: `app/pes/yillik-plan/page.tsx`
- Create: `app/pes/yillik-plan/YillikPlan.tsx` (bu task'ta sekmesiz kabuk; Task 7 son hâlini yazar)
- Create: `app/pes/yillik-plan/DolulukTablosu.tsx`
- Create: `app/pes/yillik-plan/AtolyePaneli.tsx`

- [ ] **Step 1: Ortak istemci tipleri ve yardımcılar**

`app/pes/yillik-plan/ortak.ts`:

```ts
import type { FormEvent } from 'react'
import type { AtolyeKapasitesi, AySatiri, Klasman, PlanSatiri } from '@/lib/pes/yillik-plan'

export type Sekme = 'doluluk' | 'talep'

export type YillikPlanVerisi = {
  yil: number
  sekme: Sekme
  /** Klasman filtresi (katalogda doğrulanmış) ya da null. */
  klasman: string | null
  /** Yan paneli açık atölye ya da null. */
  atolyeId: number | null
  klasmanIzleniyor: boolean
  katalog: Klasman[]
  atolyeler: AtolyeKapasitesi[]
  planlar: PlanSatiri[]
  fiili: AySatiri[]
  talepler: AySatiri[]
}

export type Istek = (yol: string, method: 'PUT' | 'DELETE', govde?: unknown) => Promise<boolean>
export type HataYaz = (mesaj: string | null) => void

export const tr = new Intl.NumberFormat('tr-TR')
export const ADET_HATASI = 'Adet negatif olmayan tam sayı olmalı (ör. 20000 ya da 20.000)'
export const inp = 'border border-slate-300 rounded px-2 py-1 text-xs w-full'
export const btn = 'rounded bg-slate-900 text-white text-xs px-2 py-1 disabled:opacity-50'

/**
 * Form gönderimini FormData'ya çevirir. `action` yerine onSubmit: React 19
 * `action` formu her gönderimde sıfırlar; hata alınca kullanıcının yazdığı
 * kaybolurdu.
 */
export function gonder(fn: (f: FormData, form: HTMLFormElement) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    fn(new FormData(e.currentTarget), e.currentTarget)
  }
}
```

- [ ] **Step 2: Sunucu sayfası**

`app/pes/yillik-plan/page.tsx`:

```tsx
/**
 * /pes/yillik-plan — Yıllık Plan (v2, basit yapı)
 *
 * Atölyenin aylık kapasitesi belli; planlamacı her ay hangi atölyeye hangi
 * klasmandan kaç adet yaptıracağını kendisi yazar. Her şey ADET.
 * Doluluk yüzdesi PLAN üzerinden; fiili sipariş yalnız bilgi.
 * Panel yetkisi app/pes/layout.tsx'te (requirePanel('yonetim')).
 */
import { redirect } from 'next/navigation'
import { withServerTenant } from '@/lib/supabase/tenant-server'
import {
  atolyeKapasiteleri, fiiliSiparisler, klasmanIzleniyor, klasmanKatalogu,
  planSatirlari, talepSatirlari,
} from '@/lib/pes/yillik-plan-veri'
import YillikPlan from './YillikPlan'
import type { YillikPlanVerisi } from './ortak'

export const dynamic = 'force-dynamic'

export default async function YillikPlanSayfasi({
  searchParams,
}: { searchParams: Promise<{ yil?: string; sekme?: string; klasman?: string; atolye?: string }> }) {
  const sp = await searchParams
  const yilHam = Number(sp.yil)
  const yil = Number.isInteger(yilHam) && yilHam >= 2020 && yilHam <= 2100
    ? yilHam
    : new Date().getFullYear() + 1

  const veri = await withServerTenant(async (sql) => {
    const katalog = await klasmanKatalogu(sql)
    const izleniyor = await klasmanIzleniyor(sql)
    const atolyeler = await atolyeKapasiteleri(sql, yil)
    const planlar = await planSatirlari(sql, yil)
    const talepler = await talepSatirlari(sql, yil)
    const fiili = await fiiliSiparisler(sql, yil)
    return { katalog, izleniyor, atolyeler, planlar, talepler, fiili }
  })
  if (!veri) redirect('/login')

  const klasman = sp.klasman && veri.katalog.some((k) => k.code === sp.klasman) ? sp.klasman : null
  const atolyeNo = Number(sp.atolye)
  const atolyeId = veri.atolyeler.some((a) => a.workshopId === atolyeNo) ? atolyeNo : null

  const props: YillikPlanVerisi = {
    yil,
    sekme: sp.sekme === 'talep' ? 'talep' : 'doluluk',
    klasman,
    atolyeId,
    klasmanIzleniyor: veri.izleniyor,
    katalog: veri.katalog,
    atolyeler: veri.atolyeler,
    planlar: veri.planlar,
    fiili: veri.fiili,
    talepler: veri.talepler,
  }
  return <YillikPlan veri={props} />
}
```

- [ ] **Step 3: Doluluk tablosu**

`app/pes/yillik-plan/DolulukTablosu.tsx`:

```tsx
'use client'
import { Fragment, useMemo } from 'react'
import {
  AYLAR, KAYNAK_ACIKLAMA, KAYNAK_ETIKET, UYUM_GRUP_ETIKET, UYUM_SIRASI,
  ayToplamlari, dolulukRengi, dolulukYuzdesi, klasmanUyumu, talepAcigi, yuzdeMetni,
  type AtolyeKapasitesi, type DolulukRengi,
} from '@/lib/pes/yillik-plan'
import type { GenelUyum } from '@/lib/pes/yetenek-uyum'
import { tr, type YillikPlanVerisi } from './ortak'

const RENK: Record<DolulukRengi, string> = {
  yok: 'bg-slate-50 text-slate-400',
  yesil: 'bg-emerald-50 text-emerald-800',
  sari: 'bg-amber-100 text-amber-800',
  kirmizi: 'bg-red-100 text-red-700',
}

type Satir = {
  a: AtolyeKapasitesi
  /** Hücrede gösterilen plan: klasman seçiliyse yalnız o klasman. */
  gorunen: number[]
  /** Yüzde HER ZAMAN atölyenin toplam planından (kapasite paylaşılır). */
  yuzde: (number | null)[]
  sip: number[]
  uyum: GenelUyum | null
}

export default function DolulukTablosu({ veri, sec }: {
  veri: YillikPlanVerisi
  sec: (workshopId: number) => void
}) {
  const k = veri.klasman
  const satirlar = useMemo(() => {
    const s: Satir[] = veri.atolyeler.map((a) => {
      const toplam = ayToplamlari(veri.planlar, { workshopId: a.workshopId })
      return {
        a,
        gorunen: k ? ayToplamlari(veri.planlar, { workshopId: a.workshopId, klasman: k }) : toplam,
        yuzde: toplam.map((p, m) => dolulukYuzdesi(p, a.kapasite[m])),
        sip: ayToplamlari(veri.fiili, { workshopId: a.workshopId, klasman: k }),
        uyum: k ? klasmanUyumu(k, a.klasmanlar, veri.klasmanIzleniyor) : null,
      }
    })
    if (k) {
      s.sort((x, y) =>
        UYUM_SIRASI[x.uyum as GenelUyum] - UYUM_SIRASI[y.uyum as GenelUyum]
        || x.a.kod.localeCompare(y.a.kod, 'tr'))
    }
    return s
  }, [veri, k])

  const talep = k ? ayToplamlari(veri.talepler, { klasman: k }) : null
  const yerlesen = k ? ayToplamlari(veri.planlar, { klasman: k }) : null

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-max">
          <thead>
            <tr>
              <th className="text-left px-2 py-1 sticky left-0 z-10 bg-white">Atölye</th>
              {AYLAR.map((ad) => <th key={ad} className="px-1 py-1 w-24">{ad}</th>)}
            </tr>
            {talep && yerlesen && (
              <tr className="border-b text-slate-600">
                <th className="text-left px-2 py-1 sticky left-0 z-10 bg-white font-normal">
                  Talep / yerleşen / açık
                </th>
                {talep.map((t, m) => {
                  const { acik, fazla } = talepAcigi(t, yerlesen[m])
                  return (
                    <td key={m} className="px-1 py-1 text-center align-top">
                      <div>{tr.format(t)}</div>
                      <div>{tr.format(yerlesen[m])}</div>
                      <div className={acik > 0 ? 'text-red-600' : fazla > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                        {acik > 0 ? `açık ${tr.format(acik)}` : fazla > 0 ? `fazla ${tr.format(fazla)}` : 'tamam'}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {satirlar.map((s, i) => {
              const grupBasi = s.uyum !== null && (i === 0 || satirlar[i - 1].uyum !== s.uyum)
              const secili = veri.atolyeId === s.a.workshopId
              return (
                <Fragment key={s.a.workshopId}>
                  {grupBasi && (
                    <tr>
                      <td colSpan={13} className="px-2 pt-3 pb-1 text-[11px] font-semibold text-slate-500">
                        {UYUM_GRUP_ETIKET[s.uyum as GenelUyum]}
                      </td>
                    </tr>
                  )}
                  <tr onClick={() => sec(s.a.workshopId)}
                      className={`cursor-pointer hover:bg-slate-50 ${s.uyum === 'uyumsuz' ? 'opacity-50' : ''}`}>
                    <td className={`px-2 py-1 sticky left-0 z-10 whitespace-nowrap max-w-[16rem] ${secili ? 'bg-slate-200' : 'bg-white'}`}>
                      <div className="flex items-center gap-1">
                        <span className="font-medium shrink-0">{s.a.kod}</span>
                        <span className="truncate" title={s.a.ad}>{s.a.ad}</span>
                        <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-500"
                              title={KAYNAK_ACIKLAMA[s.a.bazKaynak]}>
                          {KAYNAK_ETIKET[s.a.bazKaynak]}
                        </span>
                      </div>
                    </td>
                    {s.yuzde.map((y, m) => {
                      const kap = s.a.kapasite[m]
                      const duz = s.a.kaynak[m] === 'duzeltme'
                      const sebep = s.a.duzeltme[m]?.sebep
                      return (
                        <td key={m}
                            className={`px-1 py-1 w-24 min-w-24 text-center align-top ${RENK[dolulukRengi(y)]}`}
                            title={duz ? `Kapasite düzeltmesi${sebep ? `: ${sebep}` : ''}` : undefined}>
                          <div className="font-medium">
                            {yuzdeMetni(y)}
                            {duz && <sup className="ml-0.5 text-[9px]">d</sup>}
                          </div>
                          <div className="text-[10px]">
                            {tr.format(s.gorunen[m])} / {kap === null ? '—' : tr.format(kap)}
                          </div>
                          {s.sip[m] > 0 && (
                            <div className="text-[10px] text-slate-500">sip: {tr.format(s.sip[m])}</div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Hücre: plan / kapasite (adet). Yüzde atölyenin TOPLAM planından hesaplanır — klasman seçiliyken
        de (kapasite klasmanlar arasında paylaşılır). Yeşil ≤ %85, sarı ≤ %100, kırmızı &gt; %100.
        “sip”: atanmış gerçek siparişler (bitiş, yoksa teslim ayı; bilgi amaçlı). “d”: ay düzeltmesi.
        Satıra tıklayın: atölye paneli.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Atölye yan paneli**

`app/pes/yillik-plan/AtolyePaneli.tsx`:

```tsx
'use client'
import { useState } from 'react'
import {
  AYLAR, KAYNAK_ACIKLAMA, KAYNAK_ETIKET,
  ayToplamlari, dolulukYuzdesi, hucreAdedi, klasmanUyumu, yuzdeMetni,
  type AtolyeKapasitesi, type PlanSatiri,
} from '@/lib/pes/yillik-plan'
import { ADET_HATASI, btn, gonder, inp, tr, type HataYaz, type Istek, type YillikPlanVerisi } from './ortak'

type Ortak = { atolye: AtolyeKapasitesi; veri: YillikPlanVerisi; istek: Istek; setHata: HataYaz }

const UYUMSUZ_UYARI = 'Bu atölyede bu klasman yeteneği kayıtlı değil — yine de planlanabilir'

export default function AtolyePaneli({ atolye, veri, istek, setHata, kapat }: Ortak & { kapat: () => void }) {
  const planlar = veri.planlar.filter((p) => p.workshopId === atolye.workshopId)
  const toplam = ayToplamlari(planlar)

  async function bazKaydet(f: FormData) {
    const ham = String(f.get('baz') ?? '').trim()
    const n = ham === '' ? null : hucreAdedi(ham)
    if (ham !== '' && n === null) { setHata(ADET_HATASI); return }
    await istek('/api/pes/yillik-plan/kapasite', 'PUT', { workshopId: atolye.workshopId, aylikKapasite: n })
  }

  return (
    <aside className="self-start space-y-3 rounded border border-slate-200 bg-white p-3 text-sm xl:sticky xl:top-4 xl:max-h-[85vh] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{atolye.kod} — {atolye.ad}</div>
          <div className="text-xs text-slate-500">
            Hat hedefi toplamı: {tr.format(atolye.gunlukHedef)}/gün · baz:{' '}
            <span title={KAYNAK_ACIKLAMA[atolye.bazKaynak]}>{KAYNAK_ETIKET[atolye.bazKaynak]}</span>
          </div>
        </div>
        <button type="button" onClick={kapat} aria-label="Paneli kapat"
                className="text-slate-500 hover:text-slate-900">✕</button>
      </div>

      <form key={`baz-${atolye.profilKapasite ?? ''}`} onSubmit={gonder(bazKaydet)} className="flex items-end gap-2">
        <label className="flex-1 text-xs text-slate-600">
          Baz aylık kapasite (adet)
          <input name="baz" defaultValue={atolye.profilKapasite ?? ''} inputMode="numeric" className={inp}
                 placeholder={atolye.gunlukHedef > 0 ? 'boş: hat hedefinden tahmin' : 'boş: kapasite yok'} />
        </label>
        <button className={btn}>Kaydet</button>
      </form>
      <p className="text-[11px] text-slate-500">
        Atölye profiline yazılır. Profil içe aktarımı bu değeri sonradan ezebilir.
      </p>

      <div className="space-y-2">
        {AYLAR.map((ad, m) => (
          <AyBolumu key={m} ay={m + 1} ad={ad} atolye={atolye} veri={veri} istek={istek} setHata={setHata}
                    planlar={planlar.filter((p) => p.ay === m + 1)} toplam={toplam[m]} />
        ))}
      </div>
    </aside>
  )
}

function AyBolumu({ ay, ad, atolye, veri, istek, setHata, planlar, toplam }: Ortak & {
  ay: number; ad: string; planlar: PlanSatiri[]; toplam: number
}) {
  const dolu = new Set(planlar.map((p) => p.klasmanKodu))
  const [yeni, setYeni] = useState(veri.klasman && !dolu.has(veri.klasman) ? veri.klasman : '')
  const kap = atolye.kapasite[ay - 1]
  const kaynak = atolye.kaynak[ay - 1]
  const duz = atolye.duzeltme[ay - 1]
  const y = dolulukYuzdesi(toplam, kap)
  const etiket = (kod: string) => veri.katalog.find((k) => k.code === kod)?.label ?? kod
  const uyumsuz = (kod: string) =>
    kod !== '' && klasmanUyumu(kod, atolye.klasmanlar, veri.klasmanIzleniyor) === 'uyumsuz'
  const govde = (klasmanKodu: string, adet: number, notMetni: string) =>
    ({ workshopId: atolye.workshopId, yil: veri.yil, ay, klasmanKodu, adet, notMetni })

  function oku(ham: string): number | null {
    const n = hucreAdedi(ham)
    if (n === null) setHata(ADET_HATASI)
    return n
  }

  async function satirKaydet(p: PlanSatiri, f: FormData) {
    const n = oku(String(f.get('adet') ?? ''))
    if (n === null) return
    await istek('/api/pes/yillik-plan/plan', 'PUT', govde(p.klasmanKodu, n, String(f.get('not') ?? '')))
  }

  async function ekle(f: FormData, form: HTMLFormElement) {
    if (!yeni) { setHata('Klasman seçin'); return }
    const n = oku(String(f.get('adet') ?? ''))
    if (n === null) return
    if (n === 0) { setHata('Adet sıfırdan büyük olmalı'); return }
    if (await istek('/api/pes/yillik-plan/plan', 'PUT', govde(yeni, n, String(f.get('not') ?? '')))) {
      form.reset()
      setYeni('')
    }
  }

  async function duzeltmeKaydet(f: FormData) {
    const ham = String(f.get('adet') ?? '').trim()
    const n = ham === '' ? null : oku(ham)
    if (ham !== '' && n === null) return
    await istek('/api/pes/yillik-plan/kapasite-ay', 'PUT', {
      workshopId: atolye.workshopId, yil: veri.yil, ay, adet: n, sebep: String(f.get('sebep') ?? ''),
    })
  }

  return (
    <section className="space-y-1.5 rounded border border-slate-200 p-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">{ad}</span>
        <span className="text-slate-600">
          plan {tr.format(toplam)} / {kap === null ? 'kapasite yok' : tr.format(kap)} · {yuzdeMetni(y)}
          <span className="ml-1 text-[10px] text-slate-400" title={KAYNAK_ACIKLAMA[kaynak]}>
            ({KAYNAK_ETIKET[kaynak]})
          </span>
        </span>
      </div>

      {planlar.map((p) => (
        <form key={`${p.id}-${p.adet}-${p.notMetni ?? ''}`} onSubmit={gonder((f) => satirKaydet(p, f))}
              className="grid grid-cols-[1fr_5.5rem_1fr_auto_auto] items-center gap-1">
          <span className={`truncate text-xs ${uyumsuz(p.klasmanKodu) ? 'text-amber-700' : ''}`}
                title={uyumsuz(p.klasmanKodu) ? UYUMSUZ_UYARI : p.klasmanKodu}>
            {etiket(p.klasmanKodu)}{uyumsuz(p.klasmanKodu) && ' ⚠'}
          </span>
          <input name="adet" aria-label={`${ad} ${etiket(p.klasmanKodu)} adet`} defaultValue={p.adet}
                 inputMode="numeric" className={`${inp} text-right`} />
          <input name="not" aria-label={`${ad} ${etiket(p.klasmanKodu)} not`} defaultValue={p.notMetni ?? ''}
                 placeholder="not" className={inp} />
          <button className={btn}>Kaydet</button>
          <button type="button" className="text-xs text-red-600 underline"
                  onClick={() => istek(`/api/pes/yillik-plan/plan?id=${p.id}`, 'DELETE')}>Sil</button>
        </form>
      ))}

      <form onSubmit={gonder(ekle)} className="grid grid-cols-[1fr_5.5rem_1fr_auto] items-center gap-1">
        <select aria-label={`${ad} yeni klasman`} value={yeni} onChange={(e) => setYeni(e.target.value)} className={inp}>
          <option value="">Klasman…</option>
          {veri.katalog.filter((k) => !dolu.has(k.code)).map((k) => (
            <option key={k.code} value={k.code}>{k.label}</option>
          ))}
        </select>
        <input name="adet" aria-label={`${ad} yeni adet`} inputMode="numeric" placeholder="adet"
               className={`${inp} text-right`} />
        <input name="not" aria-label={`${ad} yeni not`} placeholder="not" className={inp} />
        <button className={btn}>Ekle</button>
      </form>
      {uyumsuz(yeni) && <p className="text-[11px] text-amber-700">{UYUMSUZ_UYARI}</p>}

      <form key={`duz-${duz?.adet ?? ''}-${duz?.sebep ?? ''}`} onSubmit={gonder(duzeltmeKaydet)}
            className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-1"
            title="Bu ayın kapasitesini ezer; 0 = kapalı. Boş bırakıp kaydetmek düzeltmeyi kaldırır.">
        <input name="adet" aria-label={`${ad} kapasite düzeltmesi`} defaultValue={duz?.adet ?? ''}
               inputMode="numeric" placeholder="düzeltme" className={`${inp} text-right`} />
        <input name="sebep" aria-label={`${ad} düzeltme sebebi`} defaultValue={duz?.sebep ?? ''}
               placeholder="sebep (ör. bayram)" className={inp} />
        <button className={btn}>{duz ? 'Güncelle' : 'Düzelt'}</button>
      </form>
    </section>
  )
}
```

- [ ] **Step 5: Kabuk (sekmesiz ilk hâl)**

`app/pes/yillik-plan/YillikPlan.tsx`:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DolulukTablosu from './DolulukTablosu'
import AtolyePaneli from './AtolyePaneli'
import type { Istek, YillikPlanVerisi } from './ortak'

export default function YillikPlan({ veri }: { veri: YillikPlanVerisi }) {
  const router = useRouter()
  const params = useSearchParams()
  const [bekliyor, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)

  const git = (degis: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(degis)) {
      if (v === null) q.delete(k)
      else q.set(k, v)
    }
    router.push(`/pes/yillik-plan?${q.toString()}`)
  }

  const istek: Istek = async (yol, method, govde) => {
    setHata(null)
    const r = await fetch(yol, {
      method,
      headers: { 'content-type': 'application/json' },
      body: govde === undefined ? undefined : JSON.stringify(govde),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setHata(j.error ?? `Hata ${r.status}`); return false }
    basla(() => router.refresh())
    return true
  }

  const secili = veri.atolyeler.find((a) => a.workshopId === veri.atolyeId) ?? null

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Yıllık Plan</h1>
        <select aria-label="Yıl" className="rounded border px-2 py-1 text-sm" value={veri.yil}
                onChange={(e) => git({ yil: e.target.value })}>
          {[veri.yil - 1, veri.yil, veri.yil + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {bekliyor && <span className="text-xs text-slate-500">Güncelleniyor…</span>}
      </header>
      {hata && <div role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{hata}</div>}

      <div className={secili ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]' : ''}>
        <div className="min-w-0">
          <DolulukTablosu veri={veri}
            sec={(id) => git({ atolye: id === veri.atolyeId ? null : String(id) })} />
        </div>
        {secili && (
          <AtolyePaneli key={secili.workshopId} atolye={secili} veri={veri} istek={istek} setHata={setHata}
                        kapat={() => git({ atolye: null })} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Tip denetimi ve build**

Run: `npx tsc --noEmit`
Expected: çıktı yok.

Run: `npm run build`
Expected: başarılı; rota listesinde `ƒ /pes/yillik-plan` ve `ƒ /api/pes/yillik-plan/plan`, `/talep`, `/kapasite`, `/kapasite-ay`.

- [ ] **Step 7: Hızlı göz kontrolü** (dev `npx next dev -p 3011`, merkez hesabı)

`/pes/yillik-plan?yil=2027` aç: 123 atölye satırı (default tenant'ın aktif atölyeleri); her satırda `profil` / `hedef≈` / `kapasite yok` etiketi; hücreler `0 / <kapasite>` ve `%0`; kapasitesiz satırda `—`. Bir satıra tıkla → sağda panel, 12 ay bölümü. `?klasman=PANTOLON` ekle → “Uygun / Kontrol edilemedi / Uygun değil” grup başlıkları ve en üstte talep/yerleşen/açık satırı.

- [ ] **Step 8: Commit**

```bash
git add app/pes/yillik-plan
git commit -m "feat(yillik-plan): doluluk tablosu ve atölye paneli

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ekran — talep sekmesi ve klasman filtresi

**Files:**
- Create: `app/pes/yillik-plan/TalepTablosu.tsx`
- Modify (tamamen yeniden yaz): `app/pes/yillik-plan/YillikPlan.tsx`

- [ ] **Step 1: Talep tablosu**

`app/pes/yillik-plan/TalepTablosu.tsx`:

```tsx
'use client'
import { AYLAR, ayToplamlari, hucreAdedi, talepAcigi } from '@/lib/pes/yillik-plan'
import { ADET_HATASI, tr, type HataYaz, type Istek, type YillikPlanVerisi } from './ortak'

const topla = (a: number[]) => a.reduce((x, y) => x + y, 0)

/** Klasman × ay talep hedefi; her hücrenin altında yerleşen (Σ plan) ve açık/fazla. */
export default function TalepTablosu({ veri, istek, setHata }: {
  veri: YillikPlanVerisi; istek: Istek; setHata: HataYaz
}) {
  const satirlar = veri.klasman ? veri.katalog.filter((k) => k.code === veri.klasman) : veri.katalog

  async function kaydet(klasmanKodu: string, ay: number, ham: string) {
    const adet = hucreAdedi(ham)
    if (adet === null) { setHata(ADET_HATASI); return }
    await istek('/api/pes/yillik-plan/talep', 'PUT', { yil: veri.yil, ay, klasmanKodu, adet })
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-max">
          <thead>
            <tr>
              <th className="text-left px-2 py-1 sticky left-0 z-10 bg-white">Klasman</th>
              {AYLAR.map((ad) => <th key={ad} className="px-1 py-1 w-24">{ad}</th>)}
              <th className="px-2 py-1">Yıl</th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((k) => {
              const talep = ayToplamlari(veri.talepler, { klasman: k.code })
              const yer = ayToplamlari(veri.planlar, { klasman: k.code })
              const yil = talepAcigi(topla(talep), topla(yer))
              return (
                <tr key={k.code} className="border-t border-slate-100">
                  <td className="px-2 py-1 sticky left-0 z-10 bg-white whitespace-nowrap">
                    <div className="font-medium">{k.label}</div>
                    <div className="text-[10px] text-slate-400">{k.code}</div>
                  </td>
                  {talep.map((t, m) => {
                    const { acik, fazla } = talepAcigi(t, yer[m])
                    const eski = t > 0 ? String(t) : ''
                    return (
                      <td key={m} className="px-1 py-1 w-24 min-w-24 text-center align-top">
                        <input aria-label={`${k.label} ${AYLAR[m]} talep`} key={`${k.code}-${m}-${t}`}
                               defaultValue={eski} inputMode="numeric"
                               className="w-20 rounded border border-slate-300 px-1 text-right"
                               onBlur={(e) => { if (e.target.value.trim() !== eski) kaydet(k.code, m + 1, e.target.value) }} />
                        <div className="text-[10px] text-slate-500">yer: {tr.format(yer[m])}</div>
                        {(t > 0 || yer[m] > 0) && (
                          <div className={`text-[10px] ${acik > 0 ? 'text-red-600' : fazla > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                            {acik > 0 ? `açık ${tr.format(acik)}` : fazla > 0 ? `fazla ${tr.format(fazla)}` : 'tamam'}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-2 py-1 text-right align-top whitespace-nowrap">
                    <div>{tr.format(topla(talep))}</div>
                    <div className="text-[10px] text-slate-500">yer: {tr.format(topla(yer))}</div>
                    <div className={`text-[10px] ${yil.acik > 0 ? 'text-red-600' : yil.fazla > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {yil.acik > 0 ? `açık ${tr.format(yil.acik)}` : yil.fazla > 0 ? `fazla ${tr.format(yil.fazla)}` : 'tamam'}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Hücreye talep adedini yazın (20000 ya da 20.000); boş ya da 0 talebi siler.
        “yer”: o klasmanın tüm atölyelerdeki planı. Açık = talep − yerleşen.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Kabuğun son hâli — sekmeler ve klasman filtresi**

`app/pes/yillik-plan/YillikPlan.tsx` dosyasının TAMAMINI şununla değiştir:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DolulukTablosu from './DolulukTablosu'
import TalepTablosu from './TalepTablosu'
import AtolyePaneli from './AtolyePaneli'
import type { Istek, Sekme, YillikPlanVerisi } from './ortak'

export default function YillikPlan({ veri }: { veri: YillikPlanVerisi }) {
  const router = useRouter()
  const params = useSearchParams()
  const [bekliyor, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)

  const git = (degis: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(degis)) {
      if (v === null) q.delete(k)
      else q.set(k, v)
    }
    router.push(`/pes/yillik-plan?${q.toString()}`)
  }

  const istek: Istek = async (yol, method, govde) => {
    setHata(null)
    const r = await fetch(yol, {
      method,
      headers: { 'content-type': 'application/json' },
      body: govde === undefined ? undefined : JSON.stringify(govde),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setHata(j.error ?? `Hata ${r.status}`); return false }
    basla(() => router.refresh())
    return true
  }

  const secili = veri.sekme === 'doluluk'
    ? veri.atolyeler.find((a) => a.workshopId === veri.atolyeId) ?? null
    : null
  const sekmeSinif = (s: Sekme) =>
    `rounded px-3 py-1 text-sm ${veri.sekme === s ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200'}`

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Yıllık Plan</h1>
        <select aria-label="Yıl" className="rounded border px-2 py-1 text-sm" value={veri.yil}
                onChange={(e) => git({ yil: e.target.value })}>
          {[veri.yil - 1, veri.yil, veri.yil + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select aria-label="Klasman" className="rounded border px-2 py-1 text-sm" value={veri.klasman ?? ''}
                onChange={(e) => git({ klasman: e.target.value || null })}>
          <option value="">Tüm klasmanlar</option>
          {veri.katalog.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
        </select>
        <nav className="flex gap-1" aria-label="Sekmeler">
          <button type="button" className={sekmeSinif('doluluk')} onClick={() => git({ sekme: null })}>
            Doluluk
          </button>
          <button type="button" className={sekmeSinif('talep')} onClick={() => git({ sekme: 'talep', atolye: null })}>
            Talep
          </button>
        </nav>
        {bekliyor && <span className="text-xs text-slate-500">Güncelleniyor…</span>}
      </header>
      {hata && <div role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{hata}</div>}

      {veri.sekme === 'talep' ? (
        <TalepTablosu veri={veri} istek={istek} setHata={setHata} />
      ) : (
        <div className={secili ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]' : ''}>
          <div className="min-w-0">
            <DolulukTablosu veri={veri}
              sec={(id) => git({ atolye: id === veri.atolyeId ? null : String(id) })} />
          </div>
          {secili && (
            <AtolyePaneli key={secili.workshopId} atolye={secili} veri={veri} istek={istek} setHata={setHata}
                          kapat={() => git({ atolye: null })} />
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Tip denetimi**

Run: `npx tsc --noEmit`
Expected: çıktı yok.

- [ ] **Step 4: Hızlı göz kontrolü** (dev 3011)

Klasman açılır listesinden “Pantolon” seç → URL `klasman=PANTOLON`, doluluk gruplanır. “Talep” sekmesi → 1 satır (Pantolon); “Tüm klasmanlar” → 50 satır. Bir hücreye `50.000` yaz, odaktan çık → “Güncelleniyor…”, sonra hücre `50000`, altında `yer: …` ve `açık …`.

- [ ] **Step 5: Commit**

```bash
git add app/pes/yillik-plan
git commit -m "feat(yillik-plan): talep sekmesi ve klasman filtresi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Planlama Masası plan ipucu

**Files:**
- Modify: `app/pes/plan-tezgahi/page.tsx`
- Modify: `app/pes/plan-tezgahi/Tezgah.tsx`

- [ ] **Step 1: `HavuzKarti` tipine alan ekle (`Tezgah.tsx`)**

```tsx
  atolyeAdi: string | null
}
```

(HavuzKarti tipinin sonu — Task 2'den sonraki hâl) şununla değiştir:

```tsx
  atolyeAdi: string | null
  /** Yıllık plan: PO'nun klasmanı ve ayı için planı olan atölyeler ("B021 (20.000), B005 (8.000)"). */
  planIpucu: string | null
}
```

(`atolyeAdi: string | null` dosyada yalnız `HavuzKarti` içinde geçer — 2026-10-06'da doğrulandı.)

- [ ] **Step 2: Kartta göster (`Tezgah.tsx`)**

Havuz kartında şu bloğu:

```tsx
                {h.atolyeAdi && (
                  <div className="text-[10px] text-slate-400 truncate">{h.atolyeAdi}</div>
                )}
```

şununla değiştir:

```tsx
                {h.atolyeAdi && (
                  <div className="text-[10px] text-slate-400 truncate">{h.atolyeAdi}</div>
                )}
                {h.planIpucu && (
                  <div className="text-[10px] text-indigo-600 truncate" title={`Yıllık plan: ${h.planIpucu}`}>
                    Plan: {h.planIpucu}
                  </div>
                )}
```

- [ ] **Step 3: Sorgu ve eşleme (`page.tsx`)**

(a) İçe aktarmalara ekle — `import type { TeklifDurumu, GerekceKodu, TeklifKalem } from '@/lib/pes/plan-onay'` satırının altına:

```tsx
import { planIpucuMetni } from '@/lib/pes/yillik-plan'
```

(b) Havuz sorgusunun bitişi olan

```tsx
       ORDER BY w.teslim_tarihi NULLS LAST, w.id
       LIMIT 200
    ` as unknown as Array<Record<string, unknown>>
```

satırlarının hemen ALTINA ekle:

```tsx

    /* Yıllık plan ipucu (v2): PO'nun klasmanı ve ayı (bitiş, yoksa teslim —
       yillik-plan-veri fiiliSiparisler ile aynı kural) için planı olan
       atölyeler, büyük plandan küçüğe. ENGELLEMEZ, söyler; bağlama yok. */
    const havuzIdleri = havuzSatirlari.map((h) => h.id as number)
    const planIpuclari = havuzIdleri.length === 0 ? [] : await sql`
      SELECT w.id AS wo_id, a.code AS kod, p.adet
        FROM work_order w
        JOIN plan_atolye_ay p
          ON p.klasman_kodu = w.klasman_kodu
         AND p.yil = extract(year  FROM COALESCE(w.bitis_tarihi, w.teslim_tarihi))::int
         AND p.ay  = extract(month FROM COALESCE(w.bitis_tarihi, w.teslim_tarihi))::int
        JOIN workshop a ON a.id = p.workshop_id
       WHERE w.id = ANY(${havuzIdleri}::int[])
       ORDER BY w.id, p.adet DESC, a.code
    ` as unknown as Array<{ wo_id: number; kod: string; adet: number }>
```

(c) Dönüş nesnesinde:

```tsx
             havuzSatirlari, yerlesikWo, teklifSatirlari, teklifKalemleri, bildirimSatirlari,
```

şununla değiştir:

```tsx
             havuzSatirlari, planIpuclari, yerlesikWo, teklifSatirlari, teklifKalemleri, bildirimSatirlari,
```

(d) Havuz eşlemesinde:

```tsx
      atolyeAdi: (h.atolye_adi as string) ?? null,
    }))
```

şununla değiştir:

```tsx
      atolyeAdi: (h.atolye_adi as string) ?? null,
      planIpucu: planIpucuMetni(veri.planIpuclari.filter((p) => p.wo_id === (h.id as number))),
    }))
```

- [ ] **Step 4: Tip denetimi**

Run: `npx tsc --noEmit`
Expected: çıktı yok.

- [ ] **Step 5: Commit**

```bash
git add app/pes/plan-tezgahi/page.tsx app/pes/plan-tezgahi/Tezgah.tsx
git commit -m "feat(plan-tezgahi): havuz kartında yıllık plan ipucu (klasman + ay)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Uçtan uca doğrulama ve sürüm v1.9.0

**Files:**
- Modify: `lib/version.ts` (`export const APP_VERSION = 'v1.8.0'` → `'v1.9.0'`)
- Modify: `package.json` (`"version": "1.8.0"` → `"version": "1.9.0"`)

- [ ] **Step 1: Birim testleri**

Run: `npx vitest run lib/pes/yillik-plan.test.ts`
Expected: tümü PASS.

Run: `npm test`
Expected: tüm paket PASS. (Bazı testler gerçek veritabanına bağlanır; bu işle ilgisiz bir test kırmızıysa aynı testi `main` üzerinde çalıştırıp önceden de kırık olduğunu doğrula ve not et.)

- [ ] **Step 2: Tip denetimi ve build**

Run (Bash): `rm -rf .next/types .next/dev/types && npx tsc --noEmit`
Expected: çıktı yok.

Run: `npm run build`
Expected: başarılı; `/pes/yillik-plan` ve dört API rotası listede; `/api/pes/yillik-plan/bagla`, `/kalem`, `/oneri`, `/tahsis` listede YOK.

- [ ] **Step 3: Tarayıcıda senaryo** (dev `npx next dev -p 3011`, merkez hesabıyla giriş, Playwright; deneme yılı **2027**)

Başlamadan önce profil satırı OLMAYAN ve `hedef≈` etiketli bir atölye seç ve kodunu/id'sini not et (temizlikte gerekir).

1. `/pes/yillik-plan?yil=2027` → sidebar'da menü öğesi açılır; 123 satır; kaynak etiketleri görünür; konsolda hata yok.
2. Seçilen atölyenin satırına tıkla → panel. Baz alanına `30.000` → Kaydet → satır etiketi `profil`, tüm aylarda `0 / 30.000`.
3. Ocak bölümünde Klasman “Pantolon”, adet `20.000` → Ekle → Ocak hücresi `%67`, yeşil, `20.000 / 30.000`.
4. Şubat'a Pantolon `32.000` → Şubat kırmızı (`%107`). Şubat satırının adedini `27.000` yap, Kaydet → sarı (`%90`). Sonra `0` yazıp Kaydet → satır silinir.
5. Ağustos düzeltmesi: adet `0`, sebep “bayram” → Düzelt → Ağustos hücresinde `d` işareti, `%0`, üzerine gelince “Kapasite düzeltmesi: bayram”. Ağustos'a Pantolon `1.000` ekle → `∞`, kırmızı. Düzeltme alanını boşalt, Güncelle → düzeltme kalkar, kapasite `30.000`.
6. Klasman filtresi “Pantolon” → gruplar (Uygun / Kontrol edilemedi / Uygun değil, sonuncusu soluk). Seçili atölyenin Ocak hücresi `20.000 / 30.000`; yüzde toplam plandan.
7. “Uygun değil” grubundan bir atölyenin panelinde yeni satır klasmanı “Pantolon” seç → turuncu uyarı “…kayıtlı değil — yine de planlanabilir”; `100` ile Ekle → kaydedilir (engellenmez). Sonra Sil.
8. “Talep” sekmesi → Pantolon Ocak `50.000` → altında `yer: 20.000`, `açık 30.000` (kırmızı). Doluluk sekmesine dön, klasman Pantolon → üst satırda Ocak `50.000 / 20.000 / açık 30.000`.
9. Hata sözleşmesi — tarayıcı konsolunda:
   ```js
   const p = (y, b) => fetch(y, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.status)
   await p('/api/pes/yillik-plan/plan', { workshopId: 1, yil: 2027, ay: 1, klasmanKodu: 'YOKBOYLE', adet: 5 })   // 400
   await p('/api/pes/yillik-plan/plan', { workshopId: 1, yil: 2027, ay: 1, klasmanKodu: 'PANTOLON', adet: -1 })  // 400
   await p('/api/pes/yillik-plan/plan', { workshopId: 1, yil: 2027, ay: 1, klasmanKodu: 'PANTOLON', adet: 1.5 }) // 400
   await p('/api/pes/yillik-plan/plan', { workshopId: 999999, yil: 2027, ay: 1, klasmanKodu: 'PANTOLON', adet: 5 }) // 404
   await p('/api/pes/yillik-plan/talep', { yil: 2027, ay: 13, klasmanKodu: 'PANTOLON', adet: 5 })               // 400
   ```
   Expected: yorumlardaki kodlar.
10. 403: Atölye panelinden bir atölye seçili oturumla (ya da bir atölye kullanıcısıyla) aynı konsolda `await p('/api/pes/yillik-plan/talep', { yil: 2027, ay: 1, klasmanKodu: 'PANTOLON', adet: 5 })` → `403`. Seçimi geri al.
11. Planlama Masası: havuzda klasmanı `PANTOLON` ve bitiş/teslim tarihi 2027-01 olan bir PO varsa kartında `Plan: <kod> (20.000)` görünür. Yoksa adımı şu sorguyla doğrula (DATABASE_URL, scratchpad): `SELECT id FROM work_order WHERE workshop_id IS NULL AND klasman_kodu = 'PANTOLON' AND durum IN ('Taslak','Planlandi','Bekleniyor')` → bir PO'nun ayına (`COALESCE(bitis_tarihi, teslim_tarihi)`) Pantolon planı ekleyip kartı kontrol et, sonra planı sil.
12. Ekran görüntüsü al (doluluk + panel, talep sekmesi).

- [ ] **Step 4: Test verisini temizle**

Panelden eklenen plan satırlarını sil, talep hücresini boşalt. Sonra scratchpad betiğiyle (DATABASE_URL) kalanları ve deneme profilini kaldır — `<ID>` adım 3 başında not edilen atölye:

```sql
DELETE FROM plan_atolye_ay     WHERE yil = 2027;
DELETE FROM plan_talep_ay      WHERE yil = 2027;
DELETE FROM atolye_kapasite_ay WHERE yil = 2027;
DELETE FROM workshop_profil
 WHERE workshop_id = <ID> AND eslesme_yontemi = 'elle' AND t_kod IS NULL
   AND created_at > now() - interval '1 day';
```

Expected: son DELETE tam 1 satır siler (deneme sırasında açılan profil). 2027 tablolarında başka gerçek veri varsa (kullanıcı girmişse) ilk üç DELETE'i yalnız deneme atölyesi/klasmanıyla sınırla.

- [ ] **Step 5: Sürüm ve commit**

`lib/version.ts`: `export const APP_VERSION = 'v1.9.0'`
`package.json`: `"version": "1.9.0",`

```bash
git add lib/version.ts package.json
git commit -m "chore: v1.9.0 — yıllık plan basit yapı

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Sonra `superpowers:finishing-a-development-branch` ile main'e birleştirme / push kararı kullanıcıya sorulur. Push sonrası alias `node scripts/yayinla.mjs` ile taşınır (bkz. proje notu “PES canlı adresi ve alias tuzağı”). **Task 10, v1.9.0 canlıda görünmeden başlamaz.**

---

### Task 10: 049 nesnelerini düşür (051) — YALNIZ v1.9.0 canlıdayken

**Files:**
- Create: `supabase/migrations/051_yillik_plan_v1_kaldir.sql`
- Modify: `scripts/verify_public_api.mjs`

- [ ] **Step 1: Önkoşul**

`https://pes-platform-tan.vercel.app` sidebar sol altındaki sürüm `v1.9.0` olmalı ve Planlama Masası açılmalı. Değilse DUR — 051 canlı v1.8.0'ı kırar.

- [ ] **Step 2: Bağımlılık denetimi** (scratchpad, DATABASE_URL)

```sql
SELECT DISTINCT v.relname
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid
  JOIN pg_class v ON v.oid = r.ev_class
  LEFT JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
 WHERE (d.refobjid = 'work_order'::regclass AND a.attname = 'tahmin_kalem_id')
    OR d.refobjid IN ('talep_tahmini'::regclass, 'talep_tahmini_kalem'::regclass, 'talep_tahsis'::regclass);
```

Expected: 0 satır (2026-10-06'da doğrulandı). Satır gelirse DUR ve o view'ı incele.

- [ ] **Step 3: Migration dosyası**

`supabase/migrations/051_yillik_plan_v1_kaldir.sql`:

```sql
-- 051 — Yıllık talep planı v1 (049) nesnelerini kaldır
--
-- v2 (050, basit yapı) yerini aldı. 050'den ayrı çünkü geliştirme ve canlı
-- aynı veritabanı: canlı v1.8.0 Planlama Masası work_order.tahmin_kalem_id
-- ve talep_tahmini_kalem'i okuyordu. Bu dosya v1.9.0 yayına çıktıktan
-- sonra uygulanır. 049'da yalnız 2 deneme tahmini vardı, tahsis ve bağlı
-- PO yoktu.
--
-- CASCADE YOK: beklenmedik bir bağımlılık varsa hata verip dursun.

BEGIN;

DROP INDEX IF EXISTS wo_tahmin_kalem_idx;
ALTER TABLE work_order DROP COLUMN IF EXISTS tahmin_kalem_id;

DROP TABLE IF EXISTS talep_tahsis;
DROP TABLE IF EXISTS talep_tahmini_kalem;
DROP TABLE IF EXISTS talep_tahmini;

COMMIT;
```

- [ ] **Step 4: Uygula**

Run: `node scripts/_migrate_one.mjs 051_yillik_plan_v1_kaldir.sql`
Expected: `OK   051_yillik_plan_v1_kaldir.sql`

- [ ] **Step 5: verify listesinden 049'u çıkar**

`scripts/verify_public_api.mjs` içinde şu iki satırı sil:

```js
  // 049 — yıllık talep planı (iç ekip aracı)
  'talep_tahmini', 'talep_tahmini_kalem', 'talep_tahsis',
```

Run: `node scripts/verify_public_api.mjs`
Expected: `✓ Anon anahtarıyla hiçbir uçtan veri okunamıyor.`, çıkış 0.

- [ ] **Step 6: Canlıda duman testi**

`https://pes-platform-tan.vercel.app/pes/plan-tezgahi` ve `/pes/yillik-plan` açılır, hata yok.

- [ ] **Step 7: Commit ve push**

```bash
git add supabase/migrations/051_yillik_plan_v1_kaldir.sql scripts/verify_public_api.mjs
git commit -m "chore(db): 051 — yıllık talep planı v1 tablolarını kaldır

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Push kullanıcı onayıyla (yalnız migration + script; uygulama kodu değişmediği için yeniden yayın gerekmez).

---

## Spec kapsama denetimi

| Spec | Task |
|---|---|
| §1 kapasite öncelik sırası, çalışma günü (pazar kapalı), kaynak etiketi | 3 (`kapasiteCoz`, `calismaGunu`, `KAYNAK_ETIKET`), 4, 6 |
| §1 baz kapasite → `workshop_profil` (yoksa oluştur), ezilme notu | 5 Step 4, 6 Step 4 |
| §2 049 nesneleri kaldırılır | 2 (kod), 10 (DB, 051 — sapma 1) |
| §2 üç tablo, UNIQUE'ler, 043 RLS, verify listesi | 1, 10 |
| §2 klasman katalogda doğrulanır | 4 `klasmanVarMi`, 5 |
| §3 fiili sipariş (atanmış, Iptal hariç, bitiş∨teslim ayı, klasman süzgeci), yüzde plandan | 4 `fiiliSiparisler`, 6 |
| §4 doluluk: plan/kapasite, yüzde, renk eşikleri, sip: N | 3, 6 |
| §4 klasman seçili: hücre o klasman, yüzde toplam, uyum grupları, talep/yerleşen/açık satırı | 6 |
| §4 yan panel: 12 ay, klasman satırları (seçici+adet+not, ekle/sil), baz, ay düzeltmeleri, uyumsuz UYARI | 6 |
| §4 talep sekmesi: klasman × ay giriş, yerleşen, açık / fazla | 7 |
| §5 Planlama Masası ipucu, bağla yok | 2, 8 |
| §6 v1 API'leri, dakika fonksiyonları, öneri, bagla, testler kalkar | 2 |
| §7 400 / 0 → sil / 403 / 404 | 5, 9 Step 3 (9–10) |
| §8 vitest, RLS `APP_DATABASE_URL`, tarayıcı | 3, 1 Step 4, 9 |
