# İş Emri Sürüm 2a — İş Ortağı, Rota, Plan Geçmişi, Sorun Kaydı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merkez, iş emrinin adımlarını (operasyonlarını) firmalarıyla planlar; her plan değişikliği gerekçesiyle saklanır; ilk plan / güncel plan / gerçek ve adıma bağlı sorunlar görünür; sorun panosu adım × firma × neden gösterir.

**Architecture:** Mevcut yapı genişler: `work_order_stage` = adım, `work_order_journal` = sorun kaydı. Yeni ana veri: `is_ortagi`, `rota_sablonu`, `rota_operasyonu`, `sorun_neden`. Plan geçmişi tetikleyiciyle `adim_plan_gecmisi`'ne yazılır (gerekçe işlem-yerel ayardan). Hesaplar görünümlerde: `v_is_emri_adim`, `v_sorun_kayit`. Ekranlar mevcut iş emri sayfasındaki "Aşamalar", "Plan / Gerçek", "Günlük" sekmeleri + yeni merkez sayfaları.

**Tech Stack:** Next.js 16, postgres.js, Supabase Postgres, vitest, `components/ui`.

**Spec:** `docs/superpowers/specs/2026-11-17-is-emri-sap-operasyon-design.md` — özellikle §2.1 (çerçeve düzeltmesi: TNA, plan elle + geçmiş, hafıza kuralı), §4.1, §4.3, §4.6, §9.

**Kapsam dışı (2b–2d):** firma hesapları/`/ortak`, kabul/ret, teslimat kabul/red/iade, PO tabloları, pastal/demet/ölçüm.

---

## Ön koşul

- [ ] Ana klasör (`C:\Users\bhaka\Desktop\IDEAMD\WORK\PES`) paralel oturumla paylaşılıyor. Çalışma **worktree**'de: `git worktree add ../PES-2a -b feat/is-emri-2a main`, `.env.local` kopyala, `node_modules` için junction (`New-Item -ItemType Junction`). Dev sunucusu worktree'de `npx next dev --webpack -p 3100` (Turbopack junction'ı reddediyor). `tsc` öncesi `rm -rf .next/dev/types` (webpack dev artığı, bilinen).
- [ ] Mevcut `PES-surec` worktree'si birleşti; dokunma.

## Dosya haritası

| Dosya | Sorumluluk |
|---|---|
| `supabase/migrations/064_is_ortagi_rota_plan_gecmisi.sql` | Tablolar, tetikleyici, görünümler, geçiş |
| `supabase/tests/064_kontrol.sql` | Kuru çalıştırma kontrolleri + yetki |
| `lib/pes/is-emri-adim.ts` (+ `.test.ts`) | Gerekçe/neden/etki/ortak tipi sabitleri ve etiketleri; saf yardımcılar |
| `app/api/pes/is-ortaklari/route.ts`, `[id]/route.ts` | İş ortağı CRUD (merkez) |
| `app/api/pes/rotalar/route.ts`, `[id]/route.ts` | Rota şablonu CRUD (merkez) |
| `app/api/pes/work-orders/[id]/rota/route.ts` | Şablonu iş emrine uygula |
| `app/api/pes/work-orders/[id]/adimlar/route.ts` | `v_is_emri_adim` + plan geçmişi |
| `app/api/pes/work-orders/stage/route.ts` (değişir) | `is_ortagi_id`, gerekçe |
| `app/api/pes/work-orders/[id]/journal/route.ts` (değişir) | `neden_kodu`, `etki` |
| `app/api/pes/sorunlar/route.ts` | Sorun panosu |
| `app/pes/is-ortaklari/page.tsx`, `app/pes/rotalar/page.tsx`, `app/pes/rotalar/[id]/page.tsx`, `app/pes/sorunlar/page.tsx` | Merkez ekranları |
| `components/pes/PesDevSidebar.tsx` | Menü |
| `app/workshop/is-emri/[id]/page.tsx` (değişir) | Aşamalar: firma + gerekçeli plan değişikliği + rota uygula; Günlük: neden/etki |
| `components/pes/AdimPlanGecmisi.tsx` + `components/pes/PlanGercekSekmesi.tsx` (değişir) | İlk/güncel/gerçek, kayma, gecikme, sorun; geçmiş listesi |

---

### Task 1: Sabitler ve yardımcılar

**Files:** Create `lib/pes/is-emri-adim.ts`, `lib/pes/is-emri-adim.test.ts`

- [ ] **Step 1: Test**

```ts
// lib/pes/is-emri-adim.test.ts
import { describe, it, expect } from 'vitest'
import { ORTAK_TIPLERI, PLAN_GEREKCELERI, SORUN_ETKILERI, gerekceGerekli } from './is-emri-adim'

describe('is-emri-adim', () => {
  it('ortak tipleri migration CHECK listesiyle aynı', () => {
    expect(ORTAK_TIPLERI).toEqual(['Kumaşçı', 'Aksesuar', 'Kesimhane', 'Atölye', 'Yıkamacı', 'UKP', 'Baskı', 'Nakış', 'Diğer'])
  })
  it('gerekçe kodları 044 kodlarını içerir', () => {
    for (const k of ['KAPASITE_YOK', 'MALZEME_GEC', 'DIGER']) expect(PLAN_GEREKCELERI.map(g => g.kod)).toContain(k)
  })
  it('ilk plan girişi gerekçesiz, sonraki değişiklik gerekçeli', () => {
    expect(gerekceGerekli({ plan_baslangic: null, plan_bitis: null }, { plan_bitis: '2026-12-01' })).toBe(false)
    expect(gerekceGerekli({ plan_baslangic: null, plan_bitis: '2026-12-01' }, { plan_bitis: '2026-12-05' })).toBe(true)
    expect(gerekceGerekli({ plan_baslangic: '2026-11-20', plan_bitis: '2026-12-01' }, { plan_bitis: '2026-12-01' })).toBe(false)
  })
  it('etki listesi', () => { expect(SORUN_ETKILERI).toEqual(['Gecikme', 'Kalite', 'Maliyet', 'Diğer']) })
})
```

- [ ] **Step 2:** `npx vitest run lib/pes/is-emri-adim.test.ts` → FAIL (modül yok)

- [ ] **Step 3: Uygula**

```ts
// lib/pes/is-emri-adim.ts
/* Sürüm 2a: iş emri adımı — iş ortağı tipleri, plan değişikliği gerekçeleri,
   sorun etkileri. Listeler 064'teki CHECK kısıtlarıyla aynı tutulur (test). */

export const ORTAK_TIPLERI = ['Kumaşçı', 'Aksesuar', 'Kesimhane', 'Atölye', 'Yıkamacı', 'UKP', 'Baskı', 'Nakış', 'Diğer'] as const
export type OrtakTipi = (typeof ORTAK_TIPLERI)[number]

/* 044 gerekçe kodları + iki ek. Atölyenin ve planlamacının dili aynı kalsın. */
export const PLAN_GEREKCELERI = [
  { kod: 'KAPASITE_YOK', ad: 'Kapasite yok' },
  { kod: 'MALZEME_GEC', ad: 'Malzeme geç geldi' },
  { kod: 'ONCEKI_IS_GECIKTI', ad: 'Önceki iş gecikti' },
  { kod: 'MAKINE_ARIZA', ad: 'Makine arızası' },
  { kod: 'ISGUCU_YETERSIZ', ad: 'İşgücü yetersiz' },
  { kod: 'NUMUNE_ONAY_BEKLIYOR', ad: 'Numune onayı bekleniyor' },
  { kod: 'TATIL_IZIN', ad: 'Tatil / izin' },
  { kod: 'MUSTERI_TALEBI', ad: 'Müşteri talebi' },
  { kod: 'KALITE_SORUNU', ad: 'Kalite sorunu' },
  { kod: 'DIGER', ad: 'Diğer (not zorunlu)' },
] as const

export const SORUN_ETKILERI = ['Gecikme', 'Kalite', 'Maliyet', 'Diğer'] as const

type Plan = { plan_baslangic?: string | null; plan_bitis?: string | null }

/** Önceden girilmiş bir plan tarihi değişiyorsa gerekçe istenir; ilk giriş gerekçesizdir. */
export function gerekceGerekli(eski: Plan, yeni: Plan): boolean {
  return (['plan_baslangic', 'plan_bitis'] as const).some(k =>
    k in yeni && eski[k] != null && (yeni[k] ?? null) !== eski[k])
}
```

- [ ] **Step 4:** test PASS · **Step 5:** commit `feat(is-emri): adım sabitleri ve gerekçe kuralı`

---

### Task 2: Migration 064

**Files:** Create `supabase/migrations/064_is_ortagi_rota_plan_gecmisi.sql`, `supabase/tests/064_kontrol.sql`

- [ ] **Step 1: Kontrol SQL'i** (`supabase/tests/064_kontrol.sql`)

```sql
DO $$
DECLARE t UUID; w INT; w2 INT; wo INT; o INT; r INT; st INT; s_kesim INT; s_dikim INT; n INT; v RECORD;
BEGIN
    SELECT id, tenant_id, workshop_id INTO wo, t, w FROM work_order WHERE workshop_id IS NOT NULL ORDER BY id LIMIT 1;

    -- Geçiş: her atölyenin tek ortağı var
    SELECT count(*) INTO n FROM workshop ws WHERE NOT EXISTS (SELECT 1 FROM is_ortagi io WHERE io.workshop_id = ws.id);
    IF n > 0 THEN RAISE EXCEPTION 'KONTROL: % atölyenin ortağı yok', n; END IF;
    SELECT id INTO o FROM is_ortagi WHERE workshop_id = w;

    -- Atölye tipi workshop'suz olamaz
    BEGIN
        INSERT INTO is_ortagi (tenant_id, tip, unvan) VALUES (t, 'Atölye', '__x__');
        RAISE EXCEPTION 'KONTROL: workshopsuz atölye ortağı girdi';
    EXCEPTION WHEN check_violation THEN NULL; END;

    -- Rota: Kesim (atölye) → Yıkama (yıkamacı, varsayılan firma)
    INSERT INTO is_ortagi (tenant_id, tip, unvan) VALUES (t, 'Yıkamacı', '__Yıkama A__') RETURNING id INTO n;
    INSERT INTO rota_sablonu (tenant_id, ad) VALUES (t, '__kontrol rota__') RETURNING id INTO r;
    SELECT id INTO s_kesim FROM production_stage WHERE code = 'KESIM';
    INSERT INTO rota_operasyonu (sablon_id, sira, stage_id, ortak_tipi, zorunlu_formlar) VALUES (r, 10, s_kesim, 'Atölye', ARRAY['inline_kalite']);
    INSERT INTO rota_operasyonu (sablon_id, sira, stage_id, ortak_tipi, varsayilan_ortak_id)
        SELECT r, 20, id, 'Yıkamacı', n FROM production_stage WHERE code = 'YIKAMA';

    UPDATE work_order SET rota_sablonu_id = r WHERE id = wo;
    PERFORM wo_rota_kur(wo);
    SELECT id INTO st FROM work_order_stage WHERE work_order_id = wo AND stage_id = s_kesim;
    PERFORM 1 FROM work_order_stage WHERE id = st AND is_ortagi_id = o AND zorunlu_formlar = ARRAY['inline_kalite'];
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: kesim adımı atölye ortağı/form almadı'; END IF;
    PERFORM 1 FROM work_order_stage s JOIN production_stage p ON p.id = s.stage_id
     WHERE s.work_order_id = wo AND p.code = 'YIKAMA' AND s.is_ortagi_id = n;
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: yıkama adımı varsayılan firmayı almadı'; END IF;

    -- Plan geçmişi: ilk giriş + gerekçeli değişiklik
    UPDATE work_order_stage SET plan_baslangic = DATE '2026-12-01', plan_bitis = DATE '2026-12-05' WHERE id = st;
    PERFORM set_config('app.plan_gerekce', 'MALZEME_GEC', true);
    UPDATE work_order_stage SET plan_bitis = DATE '2026-12-09' WHERE id = st;
    PERFORM set_config('app.plan_gerekce', '', true);
    SELECT count(*) INTO n FROM adim_plan_gecmisi WHERE stage_kayit_id = st AND plan_bitis IS NOT NULL;
    IF n < 2 THEN RAISE EXCEPTION 'KONTROL: plan geçmişi % satır', n; END IF;
    PERFORM 1 FROM adim_plan_gecmisi WHERE stage_kayit_id = st AND plan_bitis = DATE '2026-12-09' AND gerekce_kodu = 'MALZEME_GEC';
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: gerekçe yazılmadı'; END IF;

    -- Plan dışı kolon değişince geçmiş yazılmaz
    SELECT count(*) INTO n FROM adim_plan_gecmisi WHERE stage_kayit_id = st;
    UPDATE work_order_stage SET notlar = 'x' WHERE id = st;
    PERFORM 1 FROM adim_plan_gecmisi WHERE stage_kayit_id = st HAVING count(*) = n;
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: plan dışı değişiklik geçmişe yazıldı'; END IF;

    -- Geçmiş silinmez / değişmez
    BEGIN
        DELETE FROM adim_plan_gecmisi WHERE stage_kayit_id = st;
        RAISE EXCEPTION 'KONTROL: plan geçmişi silindi';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Görünüm: ilk plan 12-05, güncel 12-09, kayma 4, 1 revizyon
    SELECT * INTO v FROM v_is_emri_adim WHERE stage_kayit_id = st;
    IF v.ilk_plan_bitis <> DATE '2026-12-05' OR v.plan_kayma_gun <> 4 OR v.revizyon_sayisi <> 1 THEN
        RAISE EXCEPTION 'KONTROL: görünüm ilk=% kayma=% rev=%', v.ilk_plan_bitis, v.plan_kayma_gun, v.revizyon_sayisi;
    END IF;

    -- Sorun: neden kodu katalogdan, açık sorun sayısı görünümde
    INSERT INTO work_order_journal (tenant_id, work_order_id, stage_id, tip, aciklama, neden_kodu, etki)
        VALUES (t, wo, s_kesim, 'PROBLEM', '3 top en farkı', 'EN_FARKI', 'Kalite');
    SELECT * INTO v FROM v_is_emri_adim WHERE stage_kayit_id = st;
    IF v.acik_sorun <> 1 THEN RAISE EXCEPTION 'KONTROL: açık sorun %', v.acik_sorun; END IF;
    BEGIN
        INSERT INTO work_order_journal (tenant_id, work_order_id, tip, aciklama, neden_kodu) VALUES (t, wo, 'PROBLEM', 'x', 'YOK_BOYLE');
        RAISE EXCEPTION 'KONTROL: bilinmeyen neden kodu girdi';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;

    -- Yetki: başka atölye oturumu bu iş emrinin plan geçmişini görmez
    SELECT id INTO w2 FROM workshop WHERE tenant_id = t AND id <> w ORDER BY id LIMIT 1;
    BEGIN
        EXECUTE 'GRANT pes_app TO ' || quote_ident(current_user);
        SET LOCAL ROLE pes_app;
        PERFORM set_config('app.current_tenant_id', t::text, true);
        PERFORM set_config('app.current_workshop_id', w2::text, true);
        SELECT count(*) INTO n FROM adim_plan_gecmisi WHERE stage_kayit_id = st;
        IF n <> 0 THEN RAISE EXCEPTION 'KONTROL: başka atölye plan geçmişini gördü'; END IF;
        BEGIN
            INSERT INTO is_ortagi (tenant_id, tip, unvan) VALUES (t, 'Kumaşçı', '__atölye yazdı__');
            RAISE EXCEPTION 'KONTROL: atölye iş ortağı yazdı';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        RESET ROLE;
        PERFORM set_config('app.current_workshop_id', '', true);
        RAISE NOTICE '064 yetki kontrolleri geçti';
    EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN
        RAISE NOTICE '064 yetki kontrolleri ATLANDI: %', SQLERRM;
    END;

    RAISE NOTICE '064 kontrolleri geçti';
END $$;
```

Not: `app.current_tenant_id` adını 063_kontrol.sql'deki kullanımdan doğrula (aynı yöntem orada çalıştı). İç blokta 'KONTROL:' istisnası `insufficient_privilege` değildir; yakalanmaz, dışarı çıkar (doğru).

- [ ] **Step 2:** migration'ı önce `BEGIN;\nCOMMIT;` olarak oluştur → `node scripts/_migrate_kuru.mjs 064_is_ortagi_rota_plan_gecmisi.sql supabase/tests/064_kontrol.sql` → FAIL bekle.

- [ ] **Step 3: Migration**

```sql
-- ============================================================
-- Migration 064 — İş ortağı, rota şablonu, plan geçmişi, sorun nedeni
-- ============================================================
--
-- HEDEF (2026-11-17/18): iş emri SAP benzeri ana veriyle, ama ERP değil
-- operasyon yönetimi (TNA): her adımda plan, gerçekleşen, kontrol, sorun.
-- Tasarım: docs/superpowers/specs/2026-11-17-is-emri-sap-operasyon-design.md §2.1, §4
--
-- KURALLAR:
--   - Adım = work_order_stage (plan tezgahı/takvim aynen çalışır).
--   - Plan tarihleri elle girilir; her değişiklik adim_plan_gecmisi'ne
--     tetikleyiciyle yazılır. Gerekçe işlem-yerel 'app.plan_gerekce'
--     ayarından (set_config(..., true)); verilmezse NULL = "belirtilmedi".
--     Gerekçe zorunluluğu API'dedir: mevcut çağıranlar (plan tezgahı,
--     yerleştirme) DB'de bozulmasın.
--   - Hafıza kuralı: plan geçmişi silinmez, değişmez (PT422).
--   - is_ortagi: tip Atölye ⇔ workshop_id dolu. 141 atölye geçişte açılır.
--   - Ana veri yazımı yalnız merkez (current_workshop_id() IS NULL).
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. İş ortağı ----------
CREATE TABLE IF NOT EXISTS is_ortagi (
    id           SERIAL PRIMARY KEY,
    tenant_id    UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    tip          TEXT NOT NULL CHECK (tip IN ('Kumaşçı','Aksesuar','Kesimhane','Atölye','Yıkamacı','UKP','Baskı','Nakış','Diğer')),
    unvan        TEXT NOT NULL,
    kisa_ad      TEXT,
    vergi_no     TEXT,
    adres        TEXT,
    il           TEXT,
    telefon      TEXT,
    eposta       TEXT,
    notlar       TEXT,
    aktif        BOOLEAN NOT NULL DEFAULT true,
    workshop_id  INTEGER UNIQUE REFERENCES workshop(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    giren_taraf  TEXT CHECK (giren_taraf IN ('atolye', 'merkez')),
    giren_eposta TEXT,
    girildi_at   TIMESTAMPTZ,
    CONSTRAINT is_ortagi_atolye_chk CHECK ((tip = 'Atölye') = (workshop_id IS NOT NULL)),
    UNIQUE (tenant_id, tip, unvan)
);
COMMENT ON TABLE is_ortagi IS
'064: iş ortağı (SAP LFA1 karşılığı). Atölye tipi mevcut workshop kaydına bağlı; diğer tipler (kumaşçı, yıkamacı, UKP, baskı, nakış…) yalnız burada.';

INSERT INTO is_ortagi (tenant_id, tip, unvan, aktif, workshop_id)
SELECT w.tenant_id, 'Atölye', w.name, coalesce(w.is_active, true), w.id
  FROM workshop w
 WHERE w.tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Yeni atölye açılınca ortağı da açılsın (ikinci kopya elle tutulmaz).
CREATE OR REPLACE FUNCTION workshop_ortak_ac()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.tenant_id IS NOT NULL THEN
        INSERT INTO is_ortagi (tenant_id, tip, unvan, aktif, workshop_id)
        VALUES (NEW.tenant_id, 'Atölye', NEW.name, coalesce(NEW.is_active, true), NEW.id)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_workshop_ortak ON workshop;
CREATE TRIGGER trg_workshop_ortak AFTER INSERT ON workshop
    FOR EACH ROW EXECUTE FUNCTION workshop_ortak_ac();

-- ---------- 2. Aşama kataloğu: kabul adımları ----------
INSERT INTO production_stage (code, name, sira_no, zorunlu, renk) VALUES
    ('KUMAS_KABUL',    'Kumaş kabul',    5, FALSE, '#0ea5e9'),
    ('AKSESUAR_KABUL', 'Aksesuar kabul', 6, FALSE, '#14b8a6')
ON CONFLICT (code) DO NOTHING;

-- ---------- 3. Rota şablonu ----------
CREATE TABLE IF NOT EXISTS rota_sablonu (
    id         SERIAL PRIMARY KEY,
    tenant_id  UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    ad         TEXT NOT NULL,
    aciklama   TEXT,
    aktif      BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, ad)
);
CREATE TABLE IF NOT EXISTS rota_operasyonu (
    id                  SERIAL PRIMARY KEY,
    sablon_id           INTEGER NOT NULL REFERENCES rota_sablonu(id) ON DELETE CASCADE,
    sira                INTEGER NOT NULL,
    stage_id            INTEGER NOT NULL REFERENCES production_stage(id),
    ortak_tipi          TEXT NOT NULL CHECK (ortak_tipi IN ('Kumaşçı','Aksesuar','Kesimhane','Atölye','Yıkamacı','UKP','Baskı','Nakış','Diğer')),
    zorunlu_formlar     TEXT[] NOT NULL DEFAULT '{}',   -- lib/pes/formlar.ts kodları
    varsayilan_ortak_id INTEGER REFERENCES is_ortagi(id) ON DELETE SET NULL,
    UNIQUE (sablon_id, sira),
    UNIQUE (sablon_id, stage_id)                         -- work_order_stage (work_order_id, stage_id) tekil
);
COMMENT ON TABLE rota_operasyonu IS
'064: rota şablonu satırı (SAP PLPO). İş emrine wo_rota_kur() ile kopyalanır; iş emrinde değiştirilebilir.';

-- ---------- 4. İş emri ve adım ----------
ALTER TABLE work_order
    ADD COLUMN IF NOT EXISTS rota_sablonu_id INTEGER REFERENCES rota_sablonu(id) ON DELETE SET NULL;
ALTER TABLE work_order_stage
    ADD COLUMN IF NOT EXISTS is_ortagi_id    INTEGER REFERENCES is_ortagi(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS zorunlu_formlar TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_wos_ortak ON work_order_stage(is_ortagi_id) WHERE is_ortagi_id IS NOT NULL;

-- Şablonu uygular: eksik adımları ekler; var olan adımın planına/gerçeğine
-- dokunmaz, firması boşsa doldurur. Atölye tipi adım firması = iş emrinin atölyesi.
CREATE OR REPLACE FUNCTION wo_rota_kur(p_wo INTEGER)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE n INTEGER;
BEGIN
    INSERT INTO work_order_stage (tenant_id, work_order_id, stage_id, sira_no, is_ortagi_id, zorunlu_formlar)
    SELECT wo.tenant_id, wo.id, ro.stage_id, ro.sira,
           coalesce(ro.varsayilan_ortak_id,
                    CASE WHEN ro.ortak_tipi = 'Atölye'
                         THEN (SELECT io.id FROM is_ortagi io WHERE io.workshop_id = wo.workshop_id) END),
           ro.zorunlu_formlar
      FROM work_order wo
      JOIN rota_operasyonu ro ON ro.sablon_id = wo.rota_sablonu_id
     WHERE wo.id = p_wo
    ON CONFLICT (work_order_id, stage_id) DO UPDATE
       SET sira_no         = EXCLUDED.sira_no,
           zorunlu_formlar = EXCLUDED.zorunlu_formlar,
           is_ortagi_id    = coalesce(work_order_stage.is_ortagi_id, EXCLUDED.is_ortagi_id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

-- ---------- 5. Plan geçmişi ----------
CREATE TABLE IF NOT EXISTS adim_plan_gecmisi (
    id             SERIAL PRIMARY KEY,
    tenant_id      UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    work_order_id  INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
    stage_kayit_id INTEGER NOT NULL REFERENCES work_order_stage(id) ON DELETE CASCADE,
    plan_baslangic DATE,
    plan_bitis     DATE,
    is_ortagi_id   INTEGER REFERENCES is_ortagi(id) ON DELETE SET NULL,
    gerekce_kodu   TEXT CHECK (gerekce_kodu IN ('KAPASITE_YOK','MALZEME_GEC','ONCEKI_IS_GECIKTI','MAKINE_ARIZA',
                       'ISGUCU_YETERSIZ','NUMUNE_ONAY_BEKLIYOR','TATIL_IZIN','MUSTERI_TALEBI','KALITE_SORUNU','DIGER')),
    not_metni      TEXT,
    giren_eposta   TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apg_stage ON adim_plan_gecmisi(stage_kayit_id, id);
COMMENT ON TABLE adim_plan_gecmisi IS
'064: adım planının her hâli (ilk plan = en eski satır). Tetikleyici yazar; silinmez, değişmez.';

CREATE OR REPLACE FUNCTION adim_plan_kaydet()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.plan_baslangic IS NULL AND NEW.plan_bitis IS NULL AND NEW.is_ortagi_id IS NULL THEN RETURN NEW; END IF;
    ELSIF (NEW.plan_baslangic, NEW.plan_bitis, NEW.is_ortagi_id)
          IS NOT DISTINCT FROM (OLD.plan_baslangic, OLD.plan_bitis, OLD.is_ortagi_id) THEN
        RETURN NEW;
    END IF;
    INSERT INTO adim_plan_gecmisi (tenant_id, work_order_id, stage_kayit_id, plan_baslangic, plan_bitis,
                                   is_ortagi_id, gerekce_kodu, not_metni, giren_eposta)
    VALUES (NEW.tenant_id, NEW.work_order_id, NEW.id, NEW.plan_baslangic, NEW.plan_bitis, NEW.is_ortagi_id,
            NULLIF(current_setting('app.plan_gerekce', true), ''),
            NULLIF(current_setting('app.plan_notu', true), ''),
            NULLIF(current_setting('app.current_user_email', true), ''));
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_adim_plan ON work_order_stage;
CREATE TRIGGER trg_adim_plan AFTER INSERT OR UPDATE ON work_order_stage
    FOR EACH ROW EXECUTE FUNCTION adim_plan_kaydet();

CREATE OR REPLACE FUNCTION kayit_degismez()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    -- İş emri/adım silinirken cascade geçer; doğrudan silme/değiştirme yasak.
    IF pg_trigger_depth() = 1 THEN
        RAISE EXCEPTION 'Geçmiş kaydı değiştirilemez ya da silinemez.' USING ERRCODE = 'PT422';
    END IF;
    RETURN COALESCE(OLD, NEW);
END $$;
DROP TRIGGER IF EXISTS trg_apg_degismez ON adim_plan_gecmisi;
CREATE TRIGGER trg_apg_degismez BEFORE UPDATE OR DELETE ON adim_plan_gecmisi
    FOR EACH ROW EXECUTE FUNCTION kayit_degismez();

-- Geçiş: mevcut planlar ilk plan olarak yazılır.
INSERT INTO adim_plan_gecmisi (tenant_id, work_order_id, stage_kayit_id, plan_baslangic, plan_bitis, not_metni)
SELECT s.tenant_id, s.work_order_id, s.id, s.plan_baslangic, s.plan_bitis, '064 öncesi plan'
  FROM work_order_stage s
 WHERE (s.plan_baslangic IS NOT NULL OR s.plan_bitis IS NOT NULL) AND s.tenant_id IS NOT NULL;

-- Geçiş: atölyesi olan iş emirlerinde KESIM/DIKIM adımına atölye ortağı.
UPDATE work_order_stage s SET is_ortagi_id = io.id
  FROM work_order wo, is_ortagi io, production_stage ps
 WHERE wo.id = s.work_order_id AND io.workshop_id = wo.workshop_id
   AND ps.id = s.stage_id AND ps.code IN ('KESIM', 'DIKIM') AND s.is_ortagi_id IS NULL;

-- ---------- 6. Sorun nedeni ----------
CREATE TABLE IF NOT EXISTS sorun_neden (
    kod  TEXT PRIMARY KEY,
    ad   TEXT NOT NULL,
    sira INTEGER NOT NULL DEFAULT 0
);
INSERT INTO sorun_neden (kod, ad, sira) VALUES
    ('KUMAS_HATA',     'Kumaş hatası',              10),
    ('EN_FARKI',       'En farkı',                  20),
    ('TON_FARKI',      'Ton / renk farkı',          30),
    ('CEKME_FARKI',    'Çekme farkı',               40),
    ('MALZEME_GEC',    'Malzeme geç geldi',         50),
    ('AKSESUAR_EKSIK', 'Aksesuar eksik / hatalı',   60),
    ('OLCU_DISI',      'Ölçü dışı',                 70),
    ('DIKIS_HATA',     'Dikiş hatası',              80),
    ('YIKAMA_HATA',    'Yıkama hatası',             90),
    ('KAPASITE',       'Kapasite / işgücü',        100),
    ('MAKINE_ARIZA',   'Makine arızası',           110),
    ('DIGER',          'Diğer',                    999)
ON CONFLICT (kod) DO NOTHING;

ALTER TABLE work_order_journal
    ADD COLUMN IF NOT EXISTS neden_kodu TEXT REFERENCES sorun_neden(kod),
    ADD COLUMN IF NOT EXISTS etki       TEXT CHECK (etki IN ('Gecikme', 'Kalite', 'Maliyet', 'Diğer'));

-- ---------- 7. Görünümler ----------
CREATE OR REPLACE VIEW v_is_emri_adim WITH (security_invoker = true) AS
SELECT s.id AS stage_kayit_id, s.work_order_id, s.stage_id, ps.code AS stage_code, ps.name AS stage_name, s.sira_no,
       s.is_ortagi_id, o.unvan AS ortak_unvan, o.tip AS ortak_tipi, s.zorunlu_formlar,
       ilk.plan_baslangic AS ilk_plan_baslangic, ilk.plan_bitis AS ilk_plan_bitis,
       s.plan_baslangic, s.plan_bitis, s.gercek_baslangic, s.gercek_bitis, s.durum,
       GREATEST(coalesce(g.n, 0) - 1, 0)::int AS revizyon_sayisi,
       CASE WHEN ilk.plan_bitis IS NULL OR s.plan_bitis IS NULL THEN NULL
            ELSE s.plan_bitis - ilk.plan_bitis END AS plan_kayma_gun,
       CASE WHEN s.plan_bitis IS NULL THEN NULL
            WHEN s.gercek_bitis IS NOT NULL THEN s.gercek_bitis - s.plan_bitis
            WHEN current_date > s.plan_bitis THEN current_date - s.plan_bitis
            ELSE 0 END AS gecikme_gun,
       coalesce(j.acik, 0)::int AS acik_sorun,
       coalesce(j.toplam, 0)::int AS toplam_sorun
  FROM work_order_stage s
  JOIN production_stage ps ON ps.id = s.stage_id
  LEFT JOIN is_ortagi o ON o.id = s.is_ortagi_id
  LEFT JOIN LATERAL (
      SELECT plan_baslangic, plan_bitis FROM adim_plan_gecmisi
       WHERE stage_kayit_id = s.id AND (plan_baslangic IS NOT NULL OR plan_bitis IS NOT NULL)
       ORDER BY id LIMIT 1) ilk ON true
  LEFT JOIN LATERAL (
      SELECT count(DISTINCT (plan_baslangic, plan_bitis)) AS n FROM adim_plan_gecmisi
       WHERE stage_kayit_id = s.id AND (plan_baslangic IS NOT NULL OR plan_bitis IS NOT NULL)) g ON true
  LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE NOT coalesce(resolved, false)) AS acik, count(*) AS toplam
        FROM work_order_journal
       WHERE work_order_id = s.work_order_id AND stage_id = s.stage_id AND tip IN ('PROBLEM', 'BLOKAJ')) j ON true;
COMMENT ON VIEW v_is_emri_adim IS
'064: adım başına ilk plan / güncel plan / gerçek, plan kayması, gecikme, sorun sayısı.';

CREATE OR REPLACE VIEW v_sorun_kayit WITH (security_invoker = true) AS
SELECT j.id, j.work_order_id, wo.is_emri_no, wo.model_adi, wo.workshop_id, j.stage_id, ps.name AS stage_name,
       s.is_ortagi_id, o.unvan AS ortak_unvan, o.tip AS ortak_tipi,
       j.tip, j.neden_kodu, sn.ad AS neden_ad, j.etki, j.baslik, j.aciklama, j.tarih,
       coalesce(j.resolved, false) AS cozuldu, j.resolved_at, j.created_at
  FROM work_order_journal j
  JOIN work_order wo ON wo.id = j.work_order_id
  LEFT JOIN production_stage ps ON ps.id = j.stage_id
  LEFT JOIN work_order_stage s ON s.work_order_id = j.work_order_id AND s.stage_id = j.stage_id
  LEFT JOIN is_ortagi o ON o.id = s.is_ortagi_id
  LEFT JOIN sorun_neden sn ON sn.kod = j.neden_kodu
 WHERE j.tip IN ('PROBLEM', 'BLOKAJ');

-- ---------- 8. 054/055 + RLS ----------
DROP TRIGGER IF EXISTS trg_kayit_giren ON is_ortagi;
CREATE TRIGGER trg_kayit_giren BEFORE INSERT OR UPDATE ON is_ortagi
    FOR EACH ROW EXECUTE FUNCTION kayit_giren_yaz();

DO $$
DECLARE t TEXT;
BEGIN
    -- Ana veri: herkes (kiracı içi) okur, yalnız merkez yazar.
    FOREACH t IN ARRAY ARRAY['is_ortagi', 'rota_sablonu'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_oku', t);
        EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = current_tenant_id() OR is_internal_admin())', t || '_oku', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_merkez', t);
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING ((tenant_id = current_tenant_id() OR is_internal_admin()) AND current_workshop_id() IS NULL)', t || '_merkez', t);
        EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    END LOOP;
END $$;

ALTER TABLE rota_operasyonu ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_operasyonu FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rota_operasyonu_oku ON rota_operasyonu;
CREATE POLICY rota_operasyonu_oku ON rota_operasyonu FOR SELECT USING (
    EXISTS (SELECT 1 FROM rota_sablonu r WHERE r.id = rota_operasyonu.sablon_id));
DROP POLICY IF EXISTS rota_operasyonu_merkez ON rota_operasyonu;
CREATE POLICY rota_operasyonu_merkez ON rota_operasyonu FOR ALL USING (
    current_workshop_id() IS NULL AND EXISTS (SELECT 1 FROM rota_sablonu r WHERE r.id = rota_operasyonu.sablon_id));
REVOKE ALL ON rota_operasyonu FROM anon, authenticated;

-- Plan geçmişi: iş emrini gören görür; tetikleyici atölyenin kendi adımında da yazar.
ALTER TABLE adim_plan_gecmisi ENABLE ROW LEVEL SECURITY;
ALTER TABLE adim_plan_gecmisi FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS adim_plan_gecmisi_tenant_isolation ON adim_plan_gecmisi;
CREATE POLICY adim_plan_gecmisi_tenant_isolation ON adim_plan_gecmisi FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin())
    AND (current_workshop_id() IS NULL OR EXISTS (
        SELECT 1 FROM work_order wo WHERE wo.id = adim_plan_gecmisi.work_order_id AND wo.workshop_id = current_workshop_id())));
REVOKE ALL ON adim_plan_gecmisi FROM anon, authenticated;

-- sorun_neden: global katalog, salt okunur.
ALTER TABLE sorun_neden ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sorun_neden_oku ON sorun_neden;
CREATE POLICY sorun_neden_oku ON sorun_neden FOR SELECT USING (true);
REVOKE ALL ON sorun_neden FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON is_ortagi, rota_sablonu, rota_operasyonu TO pes_app';
        EXECUTE 'GRANT SELECT, INSERT ON adim_plan_gecmisi TO pes_app';
        EXECUTE 'GRANT SELECT ON sorun_neden, v_is_emri_adim, v_sorun_kayit TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE is_ortagi_id_seq, rota_sablonu_id_seq, rota_operasyonu_id_seq, adim_plan_gecmisi_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT tip, count(*) FROM is_ortagi GROUP BY 1;
--   SELECT * FROM v_is_emri_adim WHERE revizyon_sayisi > 0;
--
-- ROLLBACK
--   DROP VIEW IF EXISTS v_sorun_kayit, v_is_emri_adim;
--   ALTER TABLE work_order_journal DROP COLUMN IF EXISTS neden_kodu, DROP COLUMN IF EXISTS etki;
--   DROP TABLE IF EXISTS sorun_neden, adim_plan_gecmisi;
--   DROP TRIGGER IF EXISTS trg_adim_plan ON work_order_stage;
--   ALTER TABLE work_order_stage DROP COLUMN IF EXISTS is_ortagi_id, DROP COLUMN IF EXISTS zorunlu_formlar;
--   ALTER TABLE work_order DROP COLUMN IF EXISTS rota_sablonu_id;
--   DROP TABLE IF EXISTS rota_operasyonu, rota_sablonu;
--   DROP TRIGGER IF EXISTS trg_workshop_ortak ON workshop;
--   DROP TABLE IF EXISTS is_ortagi;
--   DROP FUNCTION IF EXISTS wo_rota_kur(INTEGER), adim_plan_kaydet(), kayit_degismez(), workshop_ortak_ac();
--   DELETE FROM production_stage WHERE code IN ('KUMAS_KABUL','AKSESUAR_KABUL');
-- ============================================================
```

Doğrula (kuru çalıştırma düşerse kök nedeni bul, kuralı gevşetme): `work_order_stage.tenant_id` ve `work_order_journal.tenant_id` NOT NULL mı (019a); `workshop.tenant_id` NULL atölye var mı (o zaman ortağı açılmaz — kontrol SQL'inin ilk sayımı bunu yakalar; NULL tenant'lı atölyeleri sayımdan çıkar ve raporla); `UNIQUE(work_order_id, stage_id)` adı ON CONFLICT için yeterli.

- [ ] **Step 4:** `node scripts/_migrate_kuru.mjs 064_is_ortagi_rota_plan_gecmisi.sql supabase/tests/064_kontrol.sql` → "064 yetki kontrolleri geçti", "064 kontrolleri geçti", "KURU OK".
- [ ] **Step 5:** commit `feat(is-emri): migration 064 iş ortağı, rota şablonu, plan geçmişi, sorun nedeni`

### Task 3: Üretime uygula — KULLANICI ONAYI GEREKİR

- [ ] Kullanıcıya sor; onaydan sonra `node scripts/_migrate_one.mjs 064_is_ortagi_rota_plan_gecmisi.sql`; salt okunur doğrula: `SELECT tip, count(*) FROM is_ortagi GROUP BY 1` (Atölye ≈ 141).

---

### Task 4: API

Kalıplar: `withTenantRoute`, `idOku`/`gecersizKimlik` (`app/api/_lib/with-tenant.ts`), merkez kontrolü `tenant.workshopId !== null → 403` (bkz. `app/api/pes/olcu-sartname/route.ts`), `sql(obj)` ekleme/güncelleme, 23505 → 409. Her uç dosya başında Türkçe yorum bloğu.

- [ ] **4a `app/api/pes/is-ortaklari/route.ts`**: `GET ?tip=&q=&aktif=` → `{ ortaklar }` (id, tip, unvan, kisa_ad, il, telefon, eposta, aktif, workshop_id, giren_*); atölye kullanıcısı da okur. `POST` (merkez) `{ tip, unvan, kisa_ad?, vergi_no?, adres?, il?, telefon?, eposta?, notlar? }`: `tip` `ORTAK_TIPLERI`'nde ve `!== 'Atölye'` (atölye ortağı atölye açılınca kendiliğinden gelir → 400 "Atölyeler atölye ekranından açılır"); `unvan` zorunlu; `tenant_id = tenant.tenantId`.
- [ ] **4b `app/api/pes/is-ortaklari/[id]/route.ts`**: `PATCH` (merkez, `x-kayit-surum`): yalnız iletişim alanları + `aktif`; atölye ortağında `unvan`/`tip` değişmez (400). Silme yok (hafıza kuralı; pasifleştir).
- [ ] **4c `app/api/pes/rotalar/route.ts`**: `GET` → şablonlar + operasyon sayısı; `POST` (merkez) `{ ad, aciklama? }`.
- [ ] **4d `app/api/pes/rotalar/[id]/route.ts`**: `GET` → şablon + operasyonlar (stage adı, varsayılan ortak unvanı) + `asamalar` (production_stage listesi) + `formlar` (`FORMLAR` kod/ad, `lib/pes/formlar.ts`); `PUT` (merkez) `{ ad, aciklama, aktif, operasyonlar: [{ stage_id, ortak_tipi, zorunlu_formlar, varsayilan_ortak_id }] }` — doğrula (stage tekil, ortak_tipi listede, form kodları `FORMLAR`'da, varsayılan ortak aynı tipte), sonra operasyonları sil + sıra 10,20,30… ile yeniden ekle (şablon iş emrine kopyalandığı için geçmiş iş emirleri etkilenmez).
- [ ] **4e `app/api/pes/work-orders/[id]/rota/route.ts`**: `POST { rota_sablonu_id }` (merkez) → `UPDATE work_order SET rota_sablonu_id`, `SELECT wo_rota_kur(id)` → `{ eklenen }`.
- [ ] **4f `app/api/pes/work-orders/[id]/adimlar/route.ts`**: `GET` → `{ adimlar: v_is_emri_adim WHERE work_order_id ORDER BY sira_no, gecmis: adim_plan_gecmisi (+ ortak unvanı) ORDER BY stage_kayit_id, id }`.
- [ ] **4g `app/api/pes/work-orders/stage/route.ts` PATCH**: gövdeye `is_ortagi_id` (COALESCE deseninde; `null` göndermek firmayı silmez — bilinçli: firma kaldırma 2a dışı), `gerekce_kodu`, `gerekce_notu`. Önce `SELECT plan_baslangic::text, plan_bitis::text FROM work_order_stage WHERE id` → `gerekceGerekli(eski, body)` true ve `gerekce_kodu` yoksa 400 "Plan tarihi değişiyor: gerekçe seçin."; `gerekce_kodu` `PLAN_GEREKCELERI`'nde değilse 400; `DIGER` ise not zorunlu. UPDATE'ten önce `SELECT set_config('app.plan_gerekce', ${kod ?? ''}, true), set_config('app.plan_notu', ${not ?? ''}, true)`. `id` → `idOku`.
- [ ] **4h `app/api/pes/work-orders/[id]/journal/route.ts` POST**: `neden_kodu` (varsa `sorun_neden`'de olmalı; FK zaten durdurur → 23503'ü 400'e çevir), `etki` (`SORUN_ETKILERI`). GET seçimine iki kolonu ekle.
- [ ] **4i `app/api/pes/sorunlar/route.ts`**: `GET ?durum=acik|hepsi&gun=90` → `{ kayitlar (v_sorun_kayit, son N gün), ozet: GROUP BY stage_name, ortak_unvan, neden_ad (açık + toplam) }`; ayrıca `nedenler: SELECT * FROM sorun_neden ORDER BY sira`.
- [ ] `npx tsc --noEmit` temiz → commit `feat(is-emri): iş ortağı, rota, plan geçmişi ve sorun API'leri`

### Task 5: Merkez ekranları

Kalıplar: `app/pes/olcu-sartname/page.tsx` (liste + üstte oluşturma kartı), `components/ui`, tema token'ları, `Input` genişliği saran `div` ile.

- [ ] **`/pes/is-ortaklari`**: tip filtresi (sekme ya da Select) + arama; tablo (unvan, tip, il, telefon, e-posta, aktif); "Yeni iş ortağı" kartı (tip listesinde Atölye yok, not: "Atölyeler atölye kaydından gelir"); satırda düzenle (iletişim + aktif) — `surumBasligi`.
- [ ] **`/pes/rotalar`** liste + yeni şablon; **`/pes/rotalar/[id]`**: operasyon satırları (sıra yukarı/aşağı, aşama Select, firma tipi Select, varsayılan firma Select — o tipteki aktif ortaklar, zorunlu formlar çoklu seçim — onay kutuları), satır ekle/sil, Kaydet (PUT).
- [ ] **`/pes/sorunlar`**: üstte özet tablo (adım × firma × neden: açık / toplam, en çok sorunlu üstte), altta kayıt listesi (iş emri bağlantısı `/workshop/is-emri/{id}`, adım, firma, neden, etki, durum); filtre açık/hepsi.
- [ ] `PesDevSidebar`: "Ana veri" grubuna (yoksa Üretim Formları'nın yanına) "İş Ortakları" (`Building2`), "Rota Şablonları" (`Route`), "Sorun Panosu" (`TriangleAlert`) — lucide ikonlarının sürümde var olduğunu kontrol et.
- [ ] `tsc` → commit `feat(is-emri): iş ortakları, rota şablonları ve sorun panosu ekranları`

### Task 6: İş emri sayfası

- [ ] **Aşamalar sekmesi** (`AsamalarTab`): (1) üstte "Rota uygula" (merkezde; Select şablon → POST rota → yenile); (2) her aşama kartına "Firma" Select (o aşamanın firma tipine uyan ortaklar; tip bilinmiyorsa tümü) → PATCH `is_ortagi_id`; (3) plan tarihi değişikliği: `gerekceGerekli` true ise kaydetmeden önce küçük bir satır içi form açılır (gerekçe Select + not), sonra PATCH; 400 mesajını göster. Mevcut "Başlat/Bitir" davranışı aynen.
- [ ] **Günlük sekmesi** (`GunlukTab`): tip PROBLEM/BLOKAJ seçilince "Neden" (sorun_neden) ve "Etki" Select'leri görünür; liste satırında neden/etki rozetleri.
- [ ] **Plan / Gerçek sekmesi**: `components/pes/AdimPlanGecmisi.tsx` (yeni) — `GET adimlar` ile tablo: adım, firma, ilk plan bitiş, güncel plan bitiş (kayma +N gün, >0 ise uyarı tonu), gerçek bitiş, gecikme (>0 kırmızı), revizyon sayısı, açık sorun; satır tıklanınca o adımın plan geçmişi (tarih, eski→yeni, gerekçe, not, kim). `PlanGercekSekmesi`'nin üstüne yerleştir, mevcut içerik altında kalır.
- [ ] `tsc` + `npm test` → commit `feat(is-emri): aşamada firma ve gerekçeli plan, sorunda neden/etki, plan geçmişi tablosu`

### Task 7: Sürüm, wiki, doğrulama, yayın

- [ ] `lib/version.ts` + `package.json` → `v1.20.0` / `1.20.0` (önce `main`'deki sürüme bak; paralel oturum ilerlediyse bir üstü).
- [ ] Wiki: `_wiki_PES/kararlar/2026-11-18-is-emri-2a.md` (karar: TNA çerçevesi, plan geçmişi tetikleyici + API'de zorunlu gerekçe, hafıza kuralı, atölye = iş ortağı geçişi); `index.md`, `log.md`.
- [ ] `rm -rf .next/dev/types && npx tsc --noEmit`; `npm test`.
- [ ] Tarayıcıda (dev, worktree): `/pes/is-ortaklari` atölyeler listede; `/pes/rotalar` şablon ekranı açılıyor; bir iş emrinin Plan / Gerçek sekmesi tabloyu gösteriyor. **Üretim DB'ye yazan denemeleri kullanıcı onayı olmadan yapma** (salt okunur gezinti).
- [ ] Bağımsız kod incelemesi (güvenlik: merkez-yalnız uçlar, RLS; doğruluk: gerekçe kuralı, görünüm hesapları) → bulguları düzelt.
- [ ] Kullanıcı onayıyla `main`'e ileri sarma birleştirme (paralel oturumun commit edilmemiş değişikliği varsa dur), `git push`, `node scripts/yayinla.mjs --bekle`, canlıda sürüm etiketini doğrula.
