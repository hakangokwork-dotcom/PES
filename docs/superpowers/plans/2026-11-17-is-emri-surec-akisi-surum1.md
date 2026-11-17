# İş Emri Süreç Akışı — Sürüm 1 (Adım 0–2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** İş emrine "Süreç" sekmesi; adım 0 (ölçü şartnamesi, merkezde yönetilir), adım 1 (top bazlı kumaş kabulü, karantina), adım 2 (top bazlı çekme testi, ton/çekme gruplaması) ve adımlara fotoğraf.

**Architecture:** İki migration (061 şartname, 062 kumaş/çekme/görsel/görünüm). Kurallar veritabanında (tetikleyici + RLS); adım durumları `v_is_emri_surec` görünümünde. API `withTenantRoute`; şartname yazımı yalnız merkez. Atölye ekranı iş emri sayfasında ayrı bileşen dosyalarında (`components/pes/surec/`). Fotoğraflar 060'ın `uretim-formlari` kovası ve yükleme deseni.

**Tech Stack:** Next.js 16 App Router, postgres.js (`sql` etiketli şablon), Supabase Postgres + Storage, vitest, Tailwind tema token'ları, `components/ui`.

**Spec:** `docs/superpowers/specs/2026-11-17-is-emri-surec-akisi-design.md`

---

## Ön koşul

- [ ] **Paralel iş commit edilmiş olmalı.** Çalışma alanında v1.18.0 "Üretim formları" commit edilmemiş değişiklikleri var (`app/workshop/is-emri/[id]/page.tsx`, sidebar'lar, `lib/version.ts`, 059/060). Bu plan o dosyalara dokunur. Başlamadan önce `git status` temiz olmalı; değilse **dur ve kullanıcıya sor** — başkasının değişikliğini commit etme, stash etme, geri alma.

- [ ] **Dal aç**

```bash
git checkout -b feat/surec-akisi-s1
```

## Dosya haritası

| Dosya | Sorumluluk |
|---|---|
| `lib/pes/olcu-sartname.ts` (yeni) | Saf fonksiyonlar: kabul aralığı, Excel'den yapıştırılan tabloyu ayrıştırma |
| `lib/pes/olcu-sartname.test.ts` (yeni) | Yukarıdakinin testleri |
| `lib/pes/resim-kucult.ts` (yeni) | `UretimFormlari.tsx`'teki istemci fotoğraf küçültme, ortaklaştırıldı |
| `lib/pes/form-dosya.ts` (değişir) | `surecYolu()` eklenir |
| `scripts/_migrate_kuru.mjs` (yeni) | Migration + kontrol SQL'ini tek işlemde çalıştırıp geri alır |
| `supabase/migrations/061_olcu_sartname.sql` (yeni) | Şartname tabloları, kilit tetikleyicileri, RLS |
| `supabase/migrations/062_kumas_top_surec.sql` (yeni) | `kumas_top`, çekme testi kolonları, `surec_gorsel`, `v_is_emri_surec` |
| `supabase/tests/061_kontrol.sql`, `062_kontrol.sql` (yeni) | Kuru çalıştırmada kuralları doğrulayan SQL |
| `app/api/_lib/with-tenant.ts` (değişir) | `PT422` → HTTP 422 |
| `app/api/pes/olcu-sartname/route.ts` (yeni) | Liste + yeni şartname (merkez) |
| `app/api/pes/olcu-sartname/[id]/route.ts` (yeni) | Oku, ızgarayı yaz (PUT), sil |
| `app/api/pes/olcu-sartname/[id]/onayla/route.ts` (yeni) | Müşteri onayı |
| `app/api/pes/olcu-sartname/[id]/revizyon/route.ts` (yeni) | Yeni revizyon (kopya) |
| `app/api/pes/work-orders/[id]/toplar/route.ts` (yeni) | Top CRUD + grup özetleri |
| `app/api/pes/work-orders/[id]/cekme-testi/route.ts` (değişir) | Top, reçete, hedef renk, ton alanları |
| `app/api/pes/work-orders/[id]/gorsel/route.ts` (yeni) | Süreç fotoğrafları |
| `app/api/pes/work-orders/[id]/surec/route.ts` (yeni) | Adım durumları + şartnameler |
| `app/pes/olcu-sartname/page.tsx`, `[id]/page.tsx` (yeni) | Merkez şartname ekranları |
| `components/pes/PesDevSidebar.tsx` (değişir) | "Ölçü Şartnamesi" menüsü |
| `components/pes/surec/SurecSekmesi.tsx` (yeni) | Adım listesi |
| `components/pes/surec/AdimSartname.tsx`, `AdimKumas.tsx`, `AdimCekme.tsx`, `SurecGorselleri.tsx` (yeni) | Adım formları |
| `components/pes/UretimFormlari.tsx` (değişir) | `resmiKucult` artık `lib/pes/resim-kucult.ts`'ten |
| `app/workshop/is-emri/[id]/page.tsx` (değişir) | "Süreç" sekmesi ilk ve varsayılan; eski "Çekme Testi" sekmesi ve `CekmeTestiTab` kaldırılır (adım 2'ye taşındı) |

---

### Task 1: Ölçü yardımcıları (saf fonksiyonlar)

**Files:**
- Create: `lib/pes/olcu-sartname.ts`
- Test: `lib/pes/olcu-sartname.test.ts`

- [ ] **Step 1: Failing test yaz**

```ts
// lib/pes/olcu-sartname.test.ts
import { describe, it, expect } from 'vitest'
import { kabulAraligi, sartnameYapistir } from './olcu-sartname'

/* Kullanıcının gönderdiği 32 beden tablosu (2026-11-17), sekmeyle ayrılmış. */
const TABLO = [
  'Measurement / Ölçü\tSize 32 nominal / 32 beden nominal\tNew tolerance − / + / Yeni tolerans − / +\tAcceptance range / Kabul aralığı',
  'Waist width / Bel genişliği ortadan\t43,00\t−1,50 / +1,00\t41,50–44,00',
  'Hip width / Basen genişliği\t53,50\t−1,50 / +1,00\t52,00–54,50',
  'Width labelled “Baldır” / Tablodaki adıyla “Baldır genişliği”\t32,50\t−1,00 / +1,00\t31,50–33,50',
  'Front rise, waistband included / Ön ağ, kemer dahil\t27,00\t−1,00 / +1,00\t26,00–28,00',
  'Back rise, waistband included / Arka ağ, kemer dahil\t40,50\t−1,00 / +1,00\t39,50–41,50',
  'Knee width / Diz genişliği\t22,00\t−0,70 / +0,70\t21,30–22,70',
  'Leg opening / Paça genişliği\t19,00\t−0,50 / +0,70\t18,50–19,70',
  'Inseam / İç boy\t78,70\t−1,50 / +1,50\t77,20–80,20',
  'Front pocket bag width / Ön cep torba eni\t18,00\t−0,50 / +0,50\t17,50–18,50',
  'Front pocket bag length / Ön cep torba boyu\t26,00\t−1,00 / +1,00\t25,00–27,00',
].join('\n')

describe('kabulAraligi', () => {
  it('nominalden eksi/artı toleransla, 2 haneye yuvarlı', () => {
    expect(kabulAraligi(43, 1.5, 1)).toEqual({ alt: 41.5, ust: 44 })
    expect(kabulAraligi(19, 0.5, 0.7)).toEqual({ alt: 18.5, ust: 19.7 })
  })
})

describe('sartnameYapistir', () => {
  it('başlığı atlar, 10 POM okur', () => {
    const r = sartnameYapistir(TABLO)
    expect(r.hatalar).toEqual([])
    expect(r.satirlar).toHaveLength(10)
  })

  it('Türkçe adı ayırır, müşteri adını tam tutar, virgüllü ondalık ve − işareti', () => {
    const [bel] = sartnameYapistir(TABLO).satirlar
    expect(bel).toEqual({
      kod: 'P01', ad: 'Bel genişliği ortadan', musteri_adi: 'Waist width / Bel genişliği ortadan',
      nominal: 43, tol_eksi: 1.5, tol_arti: 1,
    })
  })

  it('asimetrik tolerans (paça −0,50 / +0,70)', () => {
    const paca = sartnameYapistir(TABLO).satirlar[6]
    expect(paca.ad).toBe('Paça genişliği')
    expect([paca.tol_eksi, paca.tol_arti]).toEqual([0.5, 0.7])
  })

  it('kabul aralığı nominal ± toleransla uyuşmazsa satır hatası', () => {
    const r = sartnameYapistir('Bel\t43,00\t−1,50 / +1,00\t41,00–44,00')
    expect(r.satirlar).toHaveLength(1)
    expect(r.hatalar[0]).toMatch(/Satır 1: kabul aralığı/)
  })

  it('tolerans okunamazsa satır atlanır ve hata yazılır', () => {
    const r = sartnameYapistir('Bel\t43,00\t±1')
    expect(r.satirlar).toHaveLength(0)
    expect(r.hatalar[0]).toMatch(/Satır 1: tolerans/)
  })
})
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run lib/pes/olcu-sartname.test.ts`
Expected: FAIL — `Failed to resolve import "./olcu-sartname"`

- [ ] **Step 3: Uygula**

```ts
// lib/pes/olcu-sartname.ts
/* Ölçü şartnamesi — sunucu ve istemcinin ortak saf hesapları.
   Kabul aralığı veritabanında saklanmaz (hedef nominaldir, aralık ortası
   hedef olmaz); ekran ve görünüm bu formülle hesaplar. */

export type YapistirSatiri = {
  kod: string; ad: string; musteri_adi: string
  nominal: number; tol_eksi: number; tol_arti: number
}
export type YapistirSonucu = { satirlar: YapistirSatiri[]; hatalar: string[] }

const yuvarla = (n: number) => Math.round(n * 100) / 100

export function kabulAraligi(nominal: number, tolEksi: number, tolArti: number): { alt: number; ust: number } {
  return { alt: yuvarla(nominal - tolEksi), ust: yuvarla(nominal + tolArti) }
}

const sayi = (s: string) => Number(s.trim().replace(/\s/g, '').replace(',', '.'))

/** Excel'den kopyalanan tablo: ölçü \t nominal \t "−1,50 / +1,00" [\t "41,50–44,00"].
 *  Nominali sayı olmayan satır (başlık) sessizce atlanır. */
export function sartnameYapistir(metin: string): YapistirSonucu {
  const satirlar: YapistirSatiri[] = []
  const hatalar: string[] = []
  metin.split(/\r?\n/).forEach((ham, i) => {
    if (!ham.trim()) return
    const h = ham.split('\t')
    const no = i + 1
    if (h.length < 3) { hatalar.push(`Satır ${no}: en az 3 sütun gerekli (ölçü, nominal, tolerans)`); return }
    const nominal = sayi(h[1])
    if (!Number.isFinite(nominal)) return
    const tol = h[2].match(/[−–-]\s*([\d.,]+)\s*\/\s*\+\s*([\d.,]+)/)
    if (!tol) { hatalar.push(`Satır ${no}: tolerans "−a / +b" biçiminde olmalı`); return }
    const tol_eksi = sayi(tol[1]), tol_arti = sayi(tol[2])
    const musteri_adi = h[0].trim()
    const ad = musteri_adi.includes(' / ') ? musteri_adi.split(' / ').slice(1).join(' / ').trim() : musteri_adi
    if (h[3]?.trim()) {
      const a = h[3].match(/([\d.,]+)\s*[–—-]\s*([\d.,]+)/)
      const k = kabulAraligi(nominal, tol_eksi, tol_arti)
      if (a && (Math.abs(sayi(a[1]) - k.alt) > 0.005 || Math.abs(sayi(a[2]) - k.ust) > 0.005)) {
        hatalar.push(`Satır ${no}: kabul aralığı ${h[3].trim()} nominal ve toleransla uyuşmuyor (${k.alt}–${k.ust})`)
      }
    }
    satirlar.push({ kod: `P${String(satirlar.length + 1).padStart(2, '0')}`, ad, musteri_adi, nominal, tol_eksi, tol_arti })
  })
  return { satirlar, hatalar }
}

/* Ekran etiketleri — merkez şartname ekranı ve atölye süreç adımı ortak kullanır. */
export const DURUM_TONU: Record<string, 'neutral' | 'good' | 'warn' | 'bad'> = {
  'Önerilen': 'warn', 'Müşteri onaylı': 'good', 'Geçersiz': 'neutral',
}
export const ASAMA_ETIKET: Record<string, string> = { FINAL: 'Final (bitmiş ürün)', YIKAMA_ONCESI: 'Yıkama öncesi' }
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx vitest run lib/pes/olcu-sartname.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add lib/pes/olcu-sartname.ts lib/pes/olcu-sartname.test.ts
git commit -m "feat(olcu): şartname kabul aralığı ve tablo yapıştırma ayrıştırıcısı"
```

---

### Task 2: Kuru çalıştırma betiği

**Files:**
- Create: `scripts/_migrate_kuru.mjs`

- [ ] **Step 1: Betiği yaz**

```js
// scripts/_migrate_kuru.mjs
/**
 * Migration'ı ve kontrol SQL'ini TEK işlemde çalıştırır, sonra GERİ ALIR.
 * Üretim DB'sine hiçbir şey yazılmaz.
 *
 * Kullanım: node scripts/_migrate_kuru.mjs 061_olcu_sartname.sql [supabase/tests/061_kontrol.sql]
 *
 * Migration dosyası BEGIN; ... COMMIT; biçiminde olmalı: son COMMIT; kesilir,
 * yerine kontrol SQL'i ve ROLLBACK; gelir. Kontrol SQL'i hatada RAISE EXCEPTION yapar.
 */
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(join(__dir, '../.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const [file, kontrol] = process.argv.slice(2)
if (!file) { console.error('Kullanım: node scripts/_migrate_kuru.mjs <dosya.sql> [kontrol.sql]'); process.exit(1) }

const text = readFileSync(join(__dir, '../supabase/migrations', file), 'utf8')
const son = text.lastIndexOf('COMMIT;')
if (son < 0) { console.error('FAIL', file, '-> COMMIT; bulunamadı'); process.exit(1) }
const govde = text.slice(0, son) + '\n' + (kontrol ? readFileSync(join(__dir, '..', kontrol), 'utf8') : '') + '\nROLLBACK;\n'

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15, onnotice: n => console.log('  ', n.message) })
try {
  await sql.unsafe(govde)
  console.log('KURU OK (geri alındı)', file)
} catch (e) {
  console.error('KURU FAIL', file, '->', e.message)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 3 })
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/_migrate_kuru.mjs
git commit -m "chore(migration): kuru çalıştırma betiği (işlem içinde uygula, kontrol et, geri al)"
```

---

### Task 3: Migration 061 — ölçü şartnamesi

**Files:**
- Create: `supabase/migrations/061_olcu_sartname.sql`
- Test: `supabase/tests/061_kontrol.sql`

- [ ] **Step 1: Kontrol SQL'ini yaz (failing test)**

```sql
-- supabase/tests/061_kontrol.sql — yalnız _migrate_kuru.mjs ile, işlem içinde çalışır.
DO $$
DECLARE t UUID; m INT; s INT; n INT;
BEGIN
    SELECT id INTO t FROM tenant ORDER BY created_at LIMIT 1;
    INSERT INTO model_bulten (tenant_id, model_adi) VALUES (t, '__kontrol__') RETURNING id INTO m;
    INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama)
        VALUES (t, m, 'Esnek', 'FINAL') RETURNING id INTO s;
    INSERT INTO olcu_noktasi (tenant_id, sartname_id, kod, ad) VALUES (t, s, 'P01', 'Bel') RETURNING id INTO n;
    INSERT INTO olcu_degeri (tenant_id, nokta_id, beden, nominal, tol_eksi, tol_arti) VALUES (t, n, '32', 43, 1.5, 1);

    -- Önerilen şartname düzenlenebilir
    UPDATE olcu_degeri SET tol_arti = 1.0 WHERE nokta_id = n;

    -- Onaysız "Müşteri onaylı" yapılamaz (onaylayan zorunlu)
    BEGIN
        UPDATE olcu_sartname SET durum = 'Müşteri onaylı' WHERE id = s;
        RAISE EXCEPTION 'KONTROL: onaylayansız onay geçti';
    EXCEPTION WHEN check_violation THEN NULL; END;

    UPDATE olcu_sartname SET durum = 'Müşteri onaylı', onaylayan = 'Müşteri QA', onay_tarihi = current_date WHERE id = s;

    -- Onaylı şartnamenin değeri değişmez (hedef 43 → 42,75 kendiliğinden olamaz)
    BEGIN
        UPDATE olcu_degeri SET nominal = 42.75 WHERE nokta_id = n;
        RAISE EXCEPTION 'KONTROL: onaylı şartnamenin değeri değişti';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Onaylı şartnamenin notu da değişmez
    BEGIN
        UPDATE olcu_sartname SET notlar = 'x' WHERE id = s;
        RAISE EXCEPTION 'KONTROL: onaylı şartname başlığı değişti';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Onaylı şartname silinemez
    BEGIN
        DELETE FROM olcu_sartname WHERE id = s;
        RAISE EXCEPTION 'KONTROL: onaylı şartname silindi';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Aynı model × kategori × aşamada ikinci onaylı revizyon olamaz
    BEGIN
        INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama, revizyon, durum, onaylayan, onay_tarihi)
            VALUES (t, m, 'Esnek', 'FINAL', 2, 'Müşteri onaylı', 'y', current_date);
        RAISE EXCEPTION 'KONTROL: ikinci onaylı revizyon girdi';
    EXCEPTION WHEN unique_violation THEN NULL; END;

    -- Rijit ayrı şartname: aynı model için ayrıca onaylanabilir
    INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama, durum, onaylayan, onay_tarihi)
        VALUES (t, m, 'Rijit', 'FINAL', 'Müşteri onaylı', 'y', current_date);

    -- Onaylı → Geçersiz izinli; Geçersiz sonra değişmez
    UPDATE olcu_sartname SET durum = 'Geçersiz' WHERE id = s;
    BEGIN
        UPDATE olcu_sartname SET durum = 'Önerilen' WHERE id = s;
        RAISE EXCEPTION 'KONTROL: geçersiz şartname canlandı';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    RAISE NOTICE '061 kontrolleri geçti';
END $$;
```

- [ ] **Step 2: Migration olmadan kontrolün düştüğünü gör**

Migration dosyasını önce yalnız `BEGIN;\nCOMMIT;` olarak oluştur ve çalıştır:

Run: `node scripts/_migrate_kuru.mjs 061_olcu_sartname.sql supabase/tests/061_kontrol.sql`
Expected: `KURU FAIL ... relation "olcu_sartname" does not exist`

- [ ] **Step 3: Migration'ı yaz**

```sql
-- ============================================================
-- Migration 061 — Ölçü şartnamesi (model × kumaş kategorisi × aşama × revizyon)
-- ============================================================
--
-- HEDEF (2026-11-17): Model × kumaş kategorisi × beden × ölçü noktası için
-- nominal, eksi/artı tolerans, ölçüm yöntemi ve revizyon. Tasarım:
-- docs/superpowers/specs/2026-11-17-is-emri-surec-akisi-design.md §4.1
--
-- KURALLAR:
--   - Kabul aralığı SAKLANMAZ: hedef nominaldir, aralık ortası hedef olmaz.
--   - 'Önerilen' sınırlar sevkiyat kabulü değildir; müşteri onayı ayrı durum.
--   - Onaylı/geçersiz şartname ve ölçüleri değişmez (PT422); değişiklik = yeni revizyon.
--   - Aynı model × kategori × aşama için tek 'Müşteri onaylı'.
--   - Rijit ve esnek toleransları aynı olsa da ayrı şartnamedir.
--   - Yazma yalnız merkez (current_workshop_id() IS NULL). Atölye, kendi
--     iş emirlerinin modeline ait şartnameyi okur.
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS olcu_sartname (
    id               SERIAL PRIMARY KEY,
    tenant_id        UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    model_bulten_id  INTEGER NOT NULL REFERENCES model_bulten(id) ON DELETE CASCADE,
    kumas_kategorisi TEXT    NOT NULL CHECK (kumas_kategorisi IN ('Rijit', 'Esnek')),
    asama            TEXT    NOT NULL CHECK (asama IN ('FINAL', 'YIKAMA_ONCESI')),
    revizyon         INTEGER NOT NULL DEFAULT 1 CHECK (revizyon >= 1),
    durum            TEXT    NOT NULL DEFAULT 'Önerilen'
                     CHECK (durum IN ('Önerilen', 'Müşteri onaylı', 'Geçersiz')),
    onaylayan        TEXT,
    onay_tarihi      DATE,
    notlar           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    giren_taraf      TEXT CHECK (giren_taraf IN ('atolye', 'merkez')),
    giren_eposta     TEXT,
    girildi_at       TIMESTAMPTZ,
    UNIQUE (model_bulten_id, kumas_kategorisi, asama, revizyon),
    CONSTRAINT olcu_sartname_onay_chk CHECK (
        durum <> 'Müşteri onaylı' OR (onaylayan IS NOT NULL AND onay_tarihi IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_olcu_sartname_onayli
    ON olcu_sartname (model_bulten_id, kumas_kategorisi, asama) WHERE durum = 'Müşteri onaylı';

CREATE TABLE IF NOT EXISTS olcu_noktasi (
    id          SERIAL PRIMARY KEY,
    tenant_id   UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    sartname_id INTEGER NOT NULL REFERENCES olcu_sartname(id) ON DELETE CASCADE,
    kod         TEXT    NOT NULL,
    ad          TEXT    NOT NULL,
    musteri_adi TEXT,
    yontem      TEXT,   -- düğme, hizalama, referans mesafe, kemer dahil mi, serbest/yük altında
    kritik      BOOLEAN NOT NULL DEFAULT false,
    sira        INTEGER NOT NULL DEFAULT 0,
    UNIQUE (sartname_id, kod)
);
CREATE INDEX IF NOT EXISTS idx_olcu_noktasi_sartname ON olcu_noktasi(sartname_id);

CREATE TABLE IF NOT EXISTS olcu_degeri (
    tenant_id UUID         NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    nokta_id  INTEGER      NOT NULL REFERENCES olcu_noktasi(id) ON DELETE CASCADE,
    beden     TEXT         NOT NULL,
    nominal   NUMERIC(6,2) NOT NULL,
    tol_eksi  NUMERIC(5,2) NOT NULL CHECK (tol_eksi >= 0),
    tol_arti  NUMERIC(5,2) NOT NULL CHECK (tol_arti >= 0),
    PRIMARY KEY (nokta_id, beden)
);

COMMENT ON TABLE olcu_sartname IS
'061: ölçü şartnamesi başlığı. Kabul aralığı saklanmaz (nominal ± tolerans). Onaylı/geçersiz değişmez; değişiklik yeni revizyon.';

-- ---------- Kilitler ----------
CREATE OR REPLACE FUNCTION olcu_sartname_kilit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.durum <> 'Önerilen' THEN
            RAISE EXCEPTION 'Onaylı ya da geçersiz şartname silinemez.' USING ERRCODE = 'PT422';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.durum = 'Geçersiz' THEN
        RAISE EXCEPTION 'Geçersiz şartname değiştirilemez.' USING ERRCODE = 'PT422';
    END IF;
    IF OLD.durum = 'Müşteri onaylı' AND NOT (
        NEW.durum = 'Geçersiz'
        AND (NEW.model_bulten_id, NEW.kumas_kategorisi, NEW.asama, NEW.revizyon, NEW.onaylayan, NEW.onay_tarihi, NEW.notlar)
            IS NOT DISTINCT FROM
            (OLD.model_bulten_id, OLD.kumas_kategorisi, OLD.asama, OLD.revizyon, OLD.onaylayan, OLD.onay_tarihi, OLD.notlar)
    ) THEN
        RAISE EXCEPTION 'Müşteri onaylı şartname değiştirilemez; yeni revizyon açın.' USING ERRCODE = 'PT422';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_olcu_sartname_kilit ON olcu_sartname;
CREATE TRIGGER trg_olcu_sartname_kilit
    BEFORE UPDATE OR DELETE ON olcu_sartname
    FOR EACH ROW EXECUTE FUNCTION olcu_sartname_kilit();

-- Nokta ve değer: yalnız 'Önerilen' şartnamede değişir. Şartname silinirken
-- (yalnız Önerilen silinebilir) cascade bu kontrolden geçer.
CREATE OR REPLACE FUNCTION olcu_alt_kilit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
    sid INTEGER;
    d   TEXT;
BEGIN
    IF TG_TABLE_NAME = 'olcu_noktasi' THEN
        IF TG_OP = 'DELETE' THEN sid := OLD.sartname_id; ELSE sid := NEW.sartname_id; END IF;
    ELSE
        SELECT n.sartname_id INTO sid FROM olcu_noktasi n
         WHERE n.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.nokta_id ELSE NEW.nokta_id END;
    END IF;
    SELECT durum INTO d FROM olcu_sartname WHERE id = sid;
    IF d IS NOT NULL AND d <> 'Önerilen' THEN
        RAISE EXCEPTION 'Yalnız "Önerilen" şartnamenin ölçüleri değiştirilebilir; yeni revizyon açın.' USING ERRCODE = 'PT422';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_olcu_noktasi_kilit ON olcu_noktasi;
CREATE TRIGGER trg_olcu_noktasi_kilit
    BEFORE INSERT OR UPDATE OR DELETE ON olcu_noktasi
    FOR EACH ROW EXECUTE FUNCTION olcu_alt_kilit();
DROP TRIGGER IF EXISTS trg_olcu_degeri_kilit ON olcu_degeri;
CREATE TRIGGER trg_olcu_degeri_kilit
    BEFORE INSERT OR UPDATE OR DELETE ON olcu_degeri
    FOR EACH ROW EXECUTE FUNCTION olcu_alt_kilit();

-- 054/055: kim girdi + sürüm kontrolü (başlıkta)
DROP TRIGGER IF EXISTS trg_kayit_giren ON olcu_sartname;
CREATE TRIGGER trg_kayit_giren
    BEFORE INSERT OR UPDATE ON olcu_sartname
    FOR EACH ROW EXECUTE FUNCTION kayit_giren_yaz();

-- ---------- RLS ----------
-- İki politika OR'lanır: yazma yalnız merkez; okuma atölyeye kendi iş
-- emirlerinin modeli için de açık.
ALTER TABLE olcu_sartname ENABLE ROW LEVEL SECURITY;
ALTER TABLE olcu_sartname FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS olcu_sartname_merkez ON olcu_sartname;
CREATE POLICY olcu_sartname_merkez ON olcu_sartname FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin()) AND current_workshop_id() IS NULL);
DROP POLICY IF EXISTS olcu_sartname_atolye_oku ON olcu_sartname;
CREATE POLICY olcu_sartname_atolye_oku ON olcu_sartname FOR SELECT USING (
    (tenant_id = current_tenant_id() OR is_internal_admin())
    AND EXISTS (SELECT 1 FROM work_order wo
                 WHERE wo.model_bulten_id = olcu_sartname.model_bulten_id
                   AND wo.workshop_id = current_workshop_id()));

ALTER TABLE olcu_noktasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE olcu_noktasi FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS olcu_noktasi_merkez ON olcu_noktasi;
CREATE POLICY olcu_noktasi_merkez ON olcu_noktasi FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin()) AND current_workshop_id() IS NULL);
DROP POLICY IF EXISTS olcu_noktasi_atolye_oku ON olcu_noktasi;
CREATE POLICY olcu_noktasi_atolye_oku ON olcu_noktasi FOR SELECT USING (
    EXISTS (SELECT 1 FROM olcu_sartname s WHERE s.id = olcu_noktasi.sartname_id));

ALTER TABLE olcu_degeri ENABLE ROW LEVEL SECURITY;
ALTER TABLE olcu_degeri FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS olcu_degeri_merkez ON olcu_degeri;
CREATE POLICY olcu_degeri_merkez ON olcu_degeri FOR ALL USING (
    (tenant_id = current_tenant_id() OR is_internal_admin()) AND current_workshop_id() IS NULL);
DROP POLICY IF EXISTS olcu_degeri_atolye_oku ON olcu_degeri;
CREATE POLICY olcu_degeri_atolye_oku ON olcu_degeri FOR SELECT USING (
    EXISTS (SELECT 1 FROM olcu_noktasi n WHERE n.id = olcu_degeri.nokta_id));

REVOKE ALL ON olcu_sartname, olcu_noktasi, olcu_degeri FROM anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON olcu_sartname, olcu_noktasi, olcu_degeri TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE olcu_sartname_id_seq, olcu_noktasi_id_seq TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT model_bulten_id, kumas_kategorisi, asama, revizyon, durum FROM olcu_sartname ORDER BY 1,2,3,4;
--
-- ROLLBACK
--   DROP TABLE IF EXISTS olcu_degeri, olcu_noktasi, olcu_sartname;
--   DROP FUNCTION IF EXISTS olcu_sartname_kilit(), olcu_alt_kilit();
-- ============================================================
```

- [ ] **Step 4: Kuru çalıştır, kontrollerin geçtiğini gör**

Run: `node scripts/_migrate_kuru.mjs 061_olcu_sartname.sql supabase/tests/061_kontrol.sql`
Expected: `061 kontrolleri geçti` ve `KURU OK (geri alındı) 061_olcu_sartname.sql`

(Supabase uykudaysa ilk deneme 1–3 dk zaman aşımı verebilir; tekrar dene.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/061_olcu_sartname.sql supabase/tests/061_kontrol.sql
git commit -m "feat(olcu): migration 061 ölçü şartnamesi; onaylı revizyon kilidi, merkez yazar atölye okur"
```

---

### Task 4: Migration 062 — kumaş topu, çekme testi kolonları, süreç görseli, adım görünümü

**Files:**
- Create: `supabase/migrations/062_kumas_top_surec.sql`
- Test: `supabase/tests/062_kontrol.sql`

- [ ] **Step 1: Kontrol SQL'ini yaz**

```sql
-- supabase/tests/062_kontrol.sql — yalnız _migrate_kuru.mjs ile.
DO $$
DECLARE t UUID; w INT; wo INT; tp INT; v RECORD;
BEGIN
    SELECT id, tenant_id INTO wo, t FROM work_order WHERE tenant_id IS NOT NULL ORDER BY id LIMIT 1;
    SELECT workshop_id INTO w FROM work_order WHERE id = wo;

    INSERT INTO kumas_top (tenant_id, work_order_id, workshop_id, tedarikci_lotu, top_no, metre)
        VALUES (t, wo, w, 'L-1', 'T-1', 85) RETURNING id INTO tp;

    -- Varsayılan karantina
    PERFORM 1 FROM kumas_top WHERE id = tp AND durum = 'Karantina';
    IF NOT FOUND THEN RAISE EXCEPTION 'KONTROL: yeni top karantinada değil'; END IF;

    -- Aynı lot + top no iki kez girilemez
    BEGIN
        INSERT INTO kumas_top (tenant_id, work_order_id, workshop_id, tedarikci_lotu, top_no) VALUES (t, wo, w, 'L-1', 'T-1');
        RAISE EXCEPTION 'KONTROL: aynı top iki kez girildi';
    EXCEPTION WHEN unique_violation THEN NULL; END;

    -- RED test → top serbest bırakılamaz
    INSERT INTO kumas_cekme_testi (work_order_id, tenant_id, workshop_id, tarih, sonuc, top_id, boy_cekme_pct)
        VALUES (wo, t, w, current_date, 'RED', tp, -6.5);
    BEGIN
        UPDATE kumas_top SET durum = 'Serbest' WHERE id = tp;
        RAISE EXCEPTION 'KONTROL: RED testli top serbest oldu';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Serbest topa RED test girilemez (önce karantina/red)
    DELETE FROM kumas_cekme_testi WHERE top_id = tp;
    UPDATE kumas_top SET durum = 'Serbest' WHERE id = tp;
    BEGIN
        INSERT INTO kumas_cekme_testi (work_order_id, tenant_id, workshop_id, tarih, sonuc, top_id)
            VALUES (wo, t, w, current_date, 'RED', tp);
        RAISE EXCEPTION 'KONTROL: serbest topa RED test girildi';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

    -- Görünüm: tek top serbest, karantina yok → adım 1 'Tamam'
    SELECT * INTO v FROM v_is_emri_surec WHERE work_order_id = wo;
    IF v.adim1 <> 'Tamam' THEN RAISE EXCEPTION 'KONTROL: adim1 % (Tamam beklenirdi)', v.adim1; END IF;

    INSERT INTO kumas_cekme_testi (work_order_id, tenant_id, workshop_id, tarih, sonuc, top_id)
        VALUES (wo, t, w, current_date, 'UYGUN', tp);
    SELECT * INTO v FROM v_is_emri_surec WHERE work_order_id = wo;
    IF v.adim2 <> 'Devam' THEN RAISE EXCEPTION 'KONTROL: grupsuz serbest topla adim2 % (Devam beklenirdi)', v.adim2; END IF;

    UPDATE kumas_top SET ton_grubu = 'A', cekme_grubu = '1' WHERE id = tp;
    SELECT * INTO v FROM v_is_emri_surec WHERE work_order_id = wo;
    IF v.adim2 <> 'Tamam' THEN RAISE EXCEPTION 'KONTROL: adim2 % (Tamam beklenirdi)', v.adim2; END IF;

    RAISE NOTICE '062 kontrolleri geçti';
END $$;
```

Not: Bu kontrol yalnız 062'nin tablolarına dayanır; `work_order`'da hiç satır yoksa ilk SELECT `wo` NULL döner — o durumda kontrol `null value in column "work_order_id"` ile düşer, bu da doğru bir uyarıdır.

- [ ] **Step 2: Migration'ı yaz**

```sql
-- ============================================================
-- Migration 062 — Kumaş topu, top bazlı çekme testi, süreç görseli, adım görünümü
-- ============================================================
--
-- HEDEF (2026-11-17): İş emri süreç akışı adım 1–2. Tasarım:
-- docs/superpowers/specs/2026-11-17-is-emri-surec-akisi-design.md §4.2, §4.3, §4.8, §4.9
--
-- KURALLAR:
--   - Top kabulde 'Karantina'; kesime yalnız 'Serbest' top girer (sürüm 2).
--   - RED testli top 'Serbest' olamaz; 'Serbest' topa RED test girilemez (PT422).
--   - Tedarikçi lotu, top kimliği, ton grubu, çekme grubu AYRI alanlar.
--   - kumas_cekme_testi'nin mevcut kolonları kalır: boy = çözgü, en = atkı,
--     may = dönme (ekranda bu adlarla). top_id NULL = eski iş emri bazlı kayıt.
--   - surec_gorsel: dosya 060'ın 'uretim-formlari' kovasında, 'surec/' önekiyle.
--   - Adım durumu elle girilmez, v_is_emri_surec türetir (security_invoker).
--
-- ROLLBACK: dosya sonunda.
-- ============================================================

BEGIN;

-- ---------- 1. Kumaş topu ----------
CREATE TABLE IF NOT EXISTS kumas_top (
    id                   SERIAL PRIMARY KEY,
    tenant_id            UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    work_order_id        INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
    workshop_id          INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    tedarikci            TEXT,
    artikel              TEXT,
    kompozisyon          TEXT,
    tedarikci_lotu       TEXT    NOT NULL,
    parti_no             TEXT,
    top_no               TEXT    NOT NULL,
    metre                NUMERIC(8,2) CHECK (metre > 0),
    kullanilabilir_en_cm NUMERIC(6,1) CHECK (kullanilabilir_en_cm > 0),
    irsaliye_no          TEXT,
    gelis_tarihi         DATE    NOT NULL DEFAULT CURRENT_DATE,
    durum                TEXT    NOT NULL DEFAULT 'Karantina' CHECK (durum IN ('Karantina', 'Serbest', 'Red')),
    ton_grubu            TEXT,
    cekme_grubu          TEXT,
    notlar               TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    giren_taraf          TEXT CHECK (giren_taraf IN ('atolye', 'merkez')),
    giren_eposta         TEXT,
    girildi_at           TIMESTAMPTZ,
    UNIQUE (work_order_id, tedarikci_lotu, top_no)
);
CREATE INDEX IF NOT EXISTS idx_kumas_top_wo ON kumas_top(work_order_id);
COMMENT ON TABLE kumas_top IS
'062: top bazlı kumaş kabulü. Karantina → Serbest/Red. Tedarikçi lotu, ton grubu ve çekme grubu ayrı alanlar.';

-- ---------- 2. Çekme testi: top ve proses alanları ----------
ALTER TABLE kumas_cekme_testi
    ADD COLUMN IF NOT EXISTS top_id            INTEGER REFERENCES kumas_top(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS yikama_receti     TEXT,
    ADD COLUMN IF NOT EXISTS hedef_renk        TEXT,
    ADD COLUMN IF NOT EXISTS ton_degerlendirme TEXT;
CREATE INDEX IF NOT EXISTS idx_kct_top ON kumas_cekme_testi(top_id) WHERE top_id IS NOT NULL;
COMMENT ON COLUMN kumas_cekme_testi.top_id IS
'062: testin yapıldığı top. NULL = 062 öncesi iş emri bazlı test. boy_cekme_pct = çözgü, en_cekme_pct = atkı.';

-- ---------- 3. Kurallar ----------
CREATE OR REPLACE FUNCTION kumas_top_serbest_kontrol()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.durum = 'Serbest' AND EXISTS (
        SELECT 1 FROM kumas_cekme_testi WHERE top_id = NEW.id AND sonuc = 'RED'
    ) THEN
        RAISE EXCEPTION 'Top % için RED sonuçlu çekme testi var; serbest bırakılamaz.', NEW.top_no
            USING ERRCODE = 'PT422';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_kumas_top_serbest ON kumas_top;
CREATE TRIGGER trg_kumas_top_serbest
    BEFORE UPDATE OF durum ON kumas_top
    FOR EACH ROW EXECUTE FUNCTION kumas_top_serbest_kontrol();

CREATE OR REPLACE FUNCTION cekme_red_kontrol()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.sonuc = 'RED' AND NEW.top_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM kumas_top WHERE id = NEW.top_id AND durum = 'Serbest'
    ) THEN
        RAISE EXCEPTION 'Top serbest bırakılmış; RED sonuç girmeden önce topu Karantina ya da Red yapın.'
            USING ERRCODE = 'PT422';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cekme_red ON kumas_cekme_testi;
CREATE TRIGGER trg_cekme_red
    BEFORE INSERT OR UPDATE OF sonuc, top_id ON kumas_cekme_testi
    FOR EACH ROW EXECUTE FUNCTION cekme_red_kontrol();

-- ---------- 4. Süreç görseli ----------
CREATE TABLE IF NOT EXISTS surec_gorsel (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID    NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    work_order_id INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
    workshop_id   INTEGER NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    adim          TEXT    NOT NULL CHECK (adim IN ('KUMAS', 'CEKME', 'PASTAL', 'KONTROL', 'SEVK', 'YIKAMA', 'DONUS', 'FINAL')),
    kayit_id      INTEGER,          -- adımın kaydı (ör. kumas_top.id); NULL = adımın geneli
    yol           TEXT    NOT NULL UNIQUE,
    ad            TEXT    NOT NULL,
    tur           TEXT    NOT NULL,
    boyut         INTEGER NOT NULL,
    aciklama      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    giren_taraf   TEXT CHECK (giren_taraf IN ('atolye', 'merkez')),
    giren_eposta  TEXT,
    girildi_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_surec_gorsel_wo ON surec_gorsel(work_order_id, adim);
COMMENT ON TABLE surec_gorsel IS
'062: süreç adımı fotoğrafları. Dosya uretim-formlari kovasında surec/ önekiyle; satır silinince API depodan da siler.';

-- ---------- 5. 054/055 + RLS ----------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['kumas_top', 'surec_gorsel'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_kayit_giren ON %I', t);
        EXECUTE format('CREATE TRIGGER trg_kayit_giren BEFORE INSERT OR UPDATE ON %I
                        FOR EACH ROW EXECUTE FUNCTION kayit_giren_yaz()', t);
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                 (tenant_id = current_tenant_id() OR is_internal_admin())
                 AND (current_workshop_id() IS NULL OR workshop_id = current_workshop_id()))',
            t || '_tenant_isolation', t);
        EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    END LOOP;
END $$;

-- ---------- 6. Adım görünümü (sürüm 1: adım 0–2) ----------
CREATE OR REPLACE VIEW v_is_emri_surec WITH (security_invoker = true) AS
WITH s AS (
    SELECT wo.id AS work_order_id,
           count(os.id) FILTER (WHERE os.asama = 'FINAL'         AND os.durum <> 'Geçersiz')       AS final_sartname,
           count(os.id) FILTER (WHERE os.asama = 'FINAL'         AND os.durum = 'Müşteri onaylı')  AS final_onayli,
           count(os.id) FILTER (WHERE os.asama = 'YIKAMA_ONCESI' AND os.durum <> 'Geçersiz')       AS yo_sartname
      FROM work_order wo
      LEFT JOIN olcu_sartname os ON os.model_bulten_id = wo.model_bulten_id
     GROUP BY wo.id
), t AS (
    SELECT work_order_id,
           count(*)                                       AS top_sayisi,
           count(*) FILTER (WHERE durum = 'Karantina')    AS karantina,
           count(*) FILTER (WHERE durum = 'Serbest')      AS serbest,
           count(*) FILTER (WHERE durum = 'Red')          AS red,
           count(*) FILTER (WHERE durum = 'Serbest' AND (ton_grubu IS NULL OR cekme_grubu IS NULL)) AS grupsuz_serbest,
           coalesce(sum(metre), 0)                        AS toplam_metre
      FROM kumas_top GROUP BY work_order_id
), c AS (
    SELECT work_order_id,
           count(*)                                              AS test_sayisi,
           count(*) FILTER (WHERE sonuc IN ('RİSKLİ', 'RED'))    AS sorunlu_test
      FROM kumas_cekme_testi GROUP BY work_order_id
)
SELECT wo.id AS work_order_id,
       wo.workshop_id,
       wo.model_bulten_id,
       s.final_sartname, s.final_onayli, s.yo_sartname,
       coalesce(t.top_sayisi, 0)      AS top_sayisi,
       coalesce(t.karantina, 0)       AS karantina,
       coalesce(t.serbest, 0)         AS serbest,
       coalesce(t.red, 0)             AS red,
       coalesce(t.grupsuz_serbest, 0) AS grupsuz_serbest,
       coalesce(t.toplam_metre, 0)    AS toplam_metre,
       coalesce(c.test_sayisi, 0)     AS test_sayisi,
       coalesce(c.sorunlu_test, 0)    AS sorunlu_test,
       CASE WHEN s.final_sartname > 0 AND s.yo_sartname > 0 THEN 'Tamam'
            WHEN s.final_sartname + s.yo_sartname > 0       THEN 'Devam'
            ELSE 'Bekliyor' END AS adim0,
       CASE WHEN coalesce(t.red, 0) > 0         THEN 'Sorunlu'
            WHEN coalesce(t.top_sayisi, 0) = 0  THEN 'Bekliyor'
            WHEN t.karantina > 0                THEN 'Devam'
            ELSE 'Tamam' END AS adim1,
       CASE WHEN coalesce(c.sorunlu_test, 0) > 0                    THEN 'Sorunlu'
            WHEN coalesce(c.test_sayisi, 0) = 0                     THEN 'Bekliyor'
            WHEN coalesce(t.serbest, 0) = 0 OR t.grupsuz_serbest > 0 THEN 'Devam'
            ELSE 'Tamam' END AS adim2
  FROM work_order wo
  JOIN s ON s.work_order_id = wo.id
  LEFT JOIN t ON t.work_order_id = wo.id
  LEFT JOIN c ON c.work_order_id = wo.id;

COMMENT ON VIEW v_is_emri_surec IS
'062: iş emri süreç adımlarının durumu (0 şartname, 1 kumaş, 2 çekme). Bekliyor/Devam/Tamam/Sorunlu veriden türer.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pes_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON kumas_top, surec_gorsel TO pes_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE kumas_top_id_seq, surec_gorsel_id_seq TO pes_app';
        EXECUTE 'GRANT SELECT ON v_is_emri_surec TO pes_app';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- DOĞRULAMA
--   SELECT * FROM v_is_emri_surec WHERE top_sayisi > 0;
--
-- ROLLBACK (önce kovadaki surec/ nesneleri Storage API ile silinmeli)
--   DROP VIEW IF EXISTS v_is_emri_surec;
--   DROP TABLE IF EXISTS surec_gorsel;
--   DROP TRIGGER IF EXISTS trg_cekme_red ON kumas_cekme_testi;
--   ALTER TABLE kumas_cekme_testi DROP COLUMN IF EXISTS top_id, DROP COLUMN IF EXISTS yikama_receti,
--         DROP COLUMN IF EXISTS hedef_renk, DROP COLUMN IF EXISTS ton_degerlendirme;
--   DROP TABLE IF EXISTS kumas_top;
--   DROP FUNCTION IF EXISTS kumas_top_serbest_kontrol(), cekme_red_kontrol();
-- ============================================================
```

- [ ] **Step 3: Kuru çalıştır (061 henüz üretimde yok → ikisini sırayla aynı işlemde dene)**

062, 061'e (`olcu_sartname`) bağlı. 061 üretime uygulanmadan önce 062'yi tek başına kuru çalıştırmak düşer. Geçici birleştirilmiş dosya ile dene:

```bash
node -e "const f=require('fs');const a=f.readFileSync('supabase/migrations/061_olcu_sartname.sql','utf8');const b=f.readFileSync('supabase/migrations/062_kumas_top_surec.sql','utf8');f.writeFileSync('supabase/migrations/_kuru_061_062.sql',a.slice(0,a.lastIndexOf('COMMIT;'))+b.replace(/^\s*BEGIN;/m,''))"
node scripts/_migrate_kuru.mjs _kuru_061_062.sql supabase/tests/062_kontrol.sql
rm supabase/migrations/_kuru_061_062.sql
```

Expected: `062 kontrolleri geçti` ve `KURU OK (geri alındı)`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/062_kumas_top_surec.sql supabase/tests/062_kontrol.sql
git commit -m "feat(surec): migration 062 kumaş topu, top bazlı çekme testi, süreç görseli, adım görünümü"
```

---

### Task 5: Migration'ları üretime uygula

**Bu adım üretim veritabanına yazar. Uygulamadan önce kullanıcıdan açık onay al.**

- [ ] **Step 1: Kullanıcıya sor:** "061 ve 062 kuru çalıştırmada geçti. Üretim DB'ye (esucqswvhlnrmcownhbd) uygulayayım mı?" — onay gelmeden devam etme.

- [ ] **Step 2: Uygula**

```bash
node scripts/_migrate_one.mjs 061_olcu_sartname.sql
node scripts/_migrate_one.mjs 062_kumas_top_surec.sql
```

Expected: `OK   061_olcu_sartname.sql`, `OK   062_kumas_top_surec.sql`

- [ ] **Step 3: Salt okunur doğrula** (bkz. hafıza: havuzda `BEGIN READ ONLY`)

```bash
node -e "const p=require('postgres');const f=require('fs');const e=Object.fromEntries(f.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));const s=p(e.DATABASE_URL,{max:1,prepare:false});s.begin('read only',async q=>console.log(await q\`SELECT count(*)::int AS is_emri, count(*) FILTER (WHERE adim0='Bekliyor')::int AS sartnamesiz FROM v_is_emri_surec\`)).finally(()=>s.end())"
```

Expected: `[ { is_emri: <iş emri sayısı>, sartnamesiz: <aynı sayı> } ]`

---

### Task 6: `PT422` → HTTP 422

**Files:**
- Modify: `app/api/_lib/with-tenant.ts` (catch bloğu)

- [ ] **Step 1: Ekle** — `PT409` kontrolünün hemen altına:

```ts
      /* 061/062: veritabanı kuralı (onaylı şartname, RED top…). Mesaj Türkçe, kullanıcıya gösterilir. */
      if ((err as { code?: string })?.code === 'PT422') {
        return NextResponse.json({ error: (err as Error).message }, { status: 422 })
      }
```

- [ ] **Step 2: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: hata yok

- [ ] **Step 3: Commit**

```bash
git add app/api/_lib/with-tenant.ts
git commit -m "feat(api): veritabanı kuralı ihlali (PT422) 422 döner"
```

---

### Task 7: Şartname API'si (merkez)

**Files:**
- Create: `app/api/pes/olcu-sartname/route.ts`
- Create: `app/api/pes/olcu-sartname/[id]/route.ts`
- Create: `app/api/pes/olcu-sartname/[id]/onayla/route.ts`
- Create: `app/api/pes/olcu-sartname/[id]/revizyon/route.ts`

- [ ] **Step 1: Liste ve oluşturma**

```ts
// app/api/pes/olcu-sartname/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Ölçü şartnamesi (061). Yazma yalnız merkez; RLS de atölye yazımını durdurur,
 * burada erken ve anlaşılır cevap verilir.
 *
 *   GET  /api/pes/olcu-sartname           → { sartnameler, modeller }
 *   POST /api/pes/olcu-sartname           { model_bulten_id, kumas_kategorisi, asama, notlar? }
 *        Aynı anahtarda en yüksek revizyon + 1 ile 'Önerilen' açar.
 */
const KATEGORILER = new Set(['Rijit', 'Esnek'])
const ASAMALAR = new Set(['FINAL', 'YIKAMA_ONCESI'])
const merkezDegil = () => NextResponse.json({ error: 'Ölçü şartnamesini yalnız merkez yönetir' }, { status: 403 })

export const GET = withTenantRoute(async (_req, { sql, tenant }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const sartnameler = await sql`
    SELECT s.id, s.model_bulten_id, mb.model_adi, mb.plm_id, s.kumas_kategorisi, s.asama, s.revizyon,
           s.durum, s.onaylayan, s.onay_tarihi::text, s.notlar,
           (SELECT count(*)::int FROM olcu_noktasi n WHERE n.sartname_id = s.id) AS nokta_sayisi
      FROM olcu_sartname s JOIN model_bulten mb ON mb.id = s.model_bulten_id
     ORDER BY mb.model_adi, s.kumas_kategorisi, s.asama, s.revizyon DESC`
  const modeller = await sql`SELECT id, model_adi, plm_id FROM model_bulten ORDER BY model_adi`
  return NextResponse.json({ sartnameler, modeller })
})

export const POST = withTenantRoute(async (req, { sql, tenant }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const b = await req.json()
  const model = Number(b.model_bulten_id)
  if (!Number.isInteger(model)) return NextResponse.json({ error: 'Model seçilmeli' }, { status: 400 })
  if (!KATEGORILER.has(b.kumas_kategorisi)) return NextResponse.json({ error: 'Kumaş kategorisi Rijit ya da Esnek olmalı' }, { status: 400 })
  if (!ASAMALAR.has(b.asama)) return NextResponse.json({ error: 'Aşama FINAL ya da YIKAMA_ONCESI olmalı' }, { status: 400 })
  const [m] = await sql`SELECT id FROM model_bulten WHERE id = ${model}`
  if (!m) return NextResponse.json({ error: 'Model bulunamadı' }, { status: 404 })
  const [s] = await sql`
    INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama, revizyon, notlar)
    SELECT ${tenant.tenantId}, ${model}, ${b.kumas_kategorisi}, ${b.asama},
           coalesce(max(revizyon), 0) + 1, ${b.notlar ? String(b.notlar).trim() : null}
      FROM olcu_sartname
     WHERE model_bulten_id = ${model} AND kumas_kategorisi = ${b.kumas_kategorisi} AND asama = ${b.asama}
    RETURNING id`
  return NextResponse.json({ id: s.id })
})
```

- [ ] **Step 2: Oku / ızgarayı yaz / sil**

```ts
// app/api/pes/olcu-sartname/[id]/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 *   GET    → { sartname, noktalar: [{ id, kod, ad, musteri_adi, yontem, kritik, sira,
 *                                     degerler: { [beden]: { nominal, tol_eksi, tol_arti } } }] }
 *            Atölye de okur (RLS: kendi iş emrinin modeli).
 *   PUT    { notlar, noktalar: [{ kod, ad, musteri_adi?, yontem?, kritik?, degerler }] }
 *            Izgarayı tümden değiştirir. Yalnız 'Önerilen' (tetikleyici PT422 → 422).
 *            x-kayit-surum başlığı: araya giren değişiklik 409.
 *   DELETE → yalnız 'Önerilen'.
 */
type Deger = { nominal: number; tol_eksi: number; tol_arti: number }
type NoktaGirdi = { kod: string; ad: string; musteri_adi?: string | null; yontem?: string | null; kritik?: boolean; degerler: Record<string, Deger> }

const merkezDegil = () => NextResponse.json({ error: 'Ölçü şartnamesini yalnız merkez yönetir' }, { status: 403 })

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  const [sartname] = await sql`
    SELECT s.id, s.model_bulten_id, s.kumas_kategorisi, s.asama, s.revizyon, s.durum,
           s.onaylayan, s.onay_tarihi::text, s.notlar, s.giren_taraf, s.giren_eposta, s.girildi_at
      FROM olcu_sartname s WHERE s.id = ${id}`
  if (!sartname) return NextResponse.json({ error: 'Şartname bulunamadı' }, { status: 404 })
  const noktalar = await sql`
    SELECT n.id, n.kod, n.ad, n.musteri_adi, n.yontem, n.kritik, n.sira,
           coalesce(jsonb_object_agg(d.beden, jsonb_build_object(
               'nominal', d.nominal, 'tol_eksi', d.tol_eksi, 'tol_arti', d.tol_arti))
             FILTER (WHERE d.beden IS NOT NULL), '{}'::jsonb) AS degerler
      FROM olcu_noktasi n LEFT JOIN olcu_degeri d ON d.nokta_id = n.id
     WHERE n.sartname_id = ${id}
     GROUP BY n.id ORDER BY n.sira, n.id`
  return NextResponse.json({ sartname, noktalar })
})

function dogrula(noktalar: unknown): string | null {
  if (!Array.isArray(noktalar)) return 'noktalar dizi olmalı'
  const kodlar = new Set<string>()
  for (const [i, n] of (noktalar as NoktaGirdi[]).entries()) {
    if (!n?.kod?.trim() || !n?.ad?.trim()) return `${i + 1}. nokta: kod ve ad zorunlu`
    if (kodlar.has(n.kod.trim())) return `Kod tekrarlanıyor: ${n.kod}`
    kodlar.add(n.kod.trim())
    for (const [beden, d] of Object.entries(n.degerler ?? {})) {
      if (!beden.trim()) return `${n.kod}: beden boş`
      for (const k of ['nominal', 'tol_eksi', 'tol_arti'] as const) {
        if (typeof d?.[k] !== 'number' || !Number.isFinite(d[k])) return `${n.kod} / ${beden}: ${k} sayı olmalı`
      }
      if (d.tol_eksi < 0 || d.tol_arti < 0) return `${n.kod} / ${beden}: tolerans negatif olamaz`
    }
  }
  return null
}

export const PUT = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const id = Number(params.id)
  const b = await req.json()
  const hata = dogrula(b.noktalar)
  if (hata) return NextResponse.json({ error: hata }, { status: 400 })

  // Başlığa yazmak 055 sürüm kontrolünü tetikler (x-kayit-surum); 409 burada oluşur.
  const [s] = await sql`
    UPDATE olcu_sartname SET notlar = ${b.notlar ? String(b.notlar).trim() : null}
     WHERE id = ${id} RETURNING id, durum`
  if (!s) return NextResponse.json({ error: 'Şartname bulunamadı' }, { status: 404 })

  await sql`DELETE FROM olcu_noktasi WHERE sartname_id = ${id}`
  for (const [i, n] of (b.noktalar as NoktaGirdi[]).entries()) {
    const [nk] = await sql`
      INSERT INTO olcu_noktasi ${sql({
        tenant_id: tenant.tenantId, sartname_id: id, kod: n.kod.trim(), ad: n.ad.trim(),
        musteri_adi: n.musteri_adi?.trim() || null, yontem: n.yontem?.trim() || null,
        kritik: !!n.kritik, sira: i,
      })} RETURNING id`
    const degerler = Object.entries(n.degerler ?? {}).map(([beden, d]) => ({
      tenant_id: tenant.tenantId, nokta_id: nk.id, beden: beden.trim(),
      nominal: d.nominal, tol_eksi: d.tol_eksi, tol_arti: d.tol_arti,
    }))
    if (degerler.length) await sql`INSERT INTO olcu_degeri ${sql(degerler)}`
  }
  return NextResponse.json({ ok: true })
})

export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) return merkezDegil()
  const silinen = await sql`DELETE FROM olcu_sartname WHERE id = ${Number(params.id)} RETURNING id`
  if (!silinen.length) return NextResponse.json({ error: 'Şartname bulunamadı' }, { status: 404 })
  return NextResponse.json({ ok: true })
})
```

Not: Onaylı şartnamede `UPDATE ... SET notlar` aynı değerle bile tetikleyiciden geçer; değer aynıysa kilit izin verir (IS NOT DISTINCT FROM), ardından `DELETE FROM olcu_noktasi` PT422 ile durur → 422 "Yalnız Önerilen…". İşlem bütünüyle geri alınır (withTenant tek transaction).

- [ ] **Step 3: Onay**

```ts
// app/api/pes/olcu-sartname/[id]/onayla/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * POST { onaylayan, onay_tarihi } — 'Önerilen' → 'Müşteri onaylı'.
 * Aynı model × kategori × aşamadaki önceki onaylı revizyon 'Geçersiz' olur
 * (aynı transaction; tekil onaylı indeksi sırayı zorunlu kılar).
 */
const TARIH = /^\d{4}-\d{2}-\d{2}$/

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) {
    return NextResponse.json({ error: 'Müşteri onayını yalnız merkez işler' }, { status: 403 })
  }
  const id = Number(params.id)
  const b = await req.json()
  const onaylayan = String(b.onaylayan ?? '').trim()
  if (!onaylayan) return NextResponse.json({ error: 'Onaylayan (müşteri tarafı kişi/birim) zorunlu' }, { status: 400 })
  if (!TARIH.test(String(b.onay_tarihi ?? ''))) return NextResponse.json({ error: 'Onay tarihi YYYY-AA-GG olmalı' }, { status: 400 })

  const [s] = await sql`SELECT model_bulten_id, kumas_kategorisi, asama, durum FROM olcu_sartname WHERE id = ${id}`
  if (!s) return NextResponse.json({ error: 'Şartname bulunamadı' }, { status: 404 })
  if (s.durum !== 'Önerilen') return NextResponse.json({ error: 'Yalnız Önerilen şartname onaylanır' }, { status: 422 })
  const [n] = await sql`SELECT count(*)::int AS c FROM olcu_noktasi WHERE sartname_id = ${id}`
  if (n.c === 0) return NextResponse.json({ error: 'Ölçü noktası olmayan şartname onaylanamaz' }, { status: 422 })

  await sql`
    UPDATE olcu_sartname SET durum = 'Geçersiz'
     WHERE model_bulten_id = ${s.model_bulten_id} AND kumas_kategorisi = ${s.kumas_kategorisi}
       AND asama = ${s.asama} AND durum = 'Müşteri onaylı'`
  await sql`
    UPDATE olcu_sartname SET durum = 'Müşteri onaylı', onaylayan = ${onaylayan}, onay_tarihi = ${b.onay_tarihi}
     WHERE id = ${id}`
  return NextResponse.json({ ok: true })
})
```

- [ ] **Step 4: Yeni revizyon**

```ts
// app/api/pes/olcu-sartname/[id]/revizyon/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/** POST → kaynak şartnamenin noktaları ve değerleriyle yeni 'Önerilen' revizyon. { id } döner. */
export const POST = withTenantRoute<{ id: string }>(async (_req, { sql, tenant, params }) => {
  if (tenant.workshopId !== null) {
    return NextResponse.json({ error: 'Ölçü şartnamesini yalnız merkez yönetir' }, { status: 403 })
  }
  const kaynak = Number(params.id)
  const [s] = await sql`SELECT model_bulten_id, kumas_kategorisi, asama FROM olcu_sartname WHERE id = ${kaynak}`
  if (!s) return NextResponse.json({ error: 'Şartname bulunamadı' }, { status: 404 })

  const [yeni] = await sql`
    INSERT INTO olcu_sartname (tenant_id, model_bulten_id, kumas_kategorisi, asama, revizyon, notlar)
    SELECT ${tenant.tenantId}, ${s.model_bulten_id}, ${s.kumas_kategorisi}, ${s.asama},
           max(revizyon) + 1, ${`Rev. kaynağı: #${kaynak}`}
      FROM olcu_sartname
     WHERE model_bulten_id = ${s.model_bulten_id} AND kumas_kategorisi = ${s.kumas_kategorisi} AND asama = ${s.asama}
    RETURNING id`
  const noktalar = await sql`
    SELECT id, kod, ad, musteri_adi, yontem, kritik, sira FROM olcu_noktasi WHERE sartname_id = ${kaynak} ORDER BY sira, id`
  for (const n of noktalar) {
    const [nk] = await sql`
      INSERT INTO olcu_noktasi (tenant_id, sartname_id, kod, ad, musteri_adi, yontem, kritik, sira)
      VALUES (${tenant.tenantId}, ${yeni.id}, ${n.kod}, ${n.ad}, ${n.musteri_adi}, ${n.yontem}, ${n.kritik}, ${n.sira})
      RETURNING id`
    await sql`
      INSERT INTO olcu_degeri (tenant_id, nokta_id, beden, nominal, tol_eksi, tol_arti)
      SELECT tenant_id, ${nk.id}, beden, nominal, tol_eksi, tol_arti FROM olcu_degeri WHERE nokta_id = ${n.id}`
  }
  return NextResponse.json({ id: yeni.id })
})
```

- [ ] **Step 5: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: hata yok

- [ ] **Step 6: Commit**

```bash
git add app/api/pes/olcu-sartname
git commit -m "feat(olcu): şartname API'si — liste, ızgara, müşteri onayı, yeni revizyon (yalnız merkez yazar)"
```

---

### Task 8: Merkez şartname ekranları

**Files:**
- Create: `app/pes/olcu-sartname/page.tsx`
- Create: `app/pes/olcu-sartname/[id]/page.tsx`
- Modify: `components/pes/PesDevSidebar.tsx` (Üretim Formları satırının altına)

- [ ] **Step 1: Liste sayfası**

```tsx
// app/pes/olcu-sartname/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader, Card, CardBody, Badge, Button, Field, Select, EmptyState } from '@/components/ui'
import { DURUM_TONU, ASAMA_ETIKET } from '@/lib/pes/olcu-sartname'

type Sartname = {
  id: number; model_adi: string; plm_id: string | null; kumas_kategorisi: string; asama: string
  revizyon: number; durum: string; onaylayan: string | null; onay_tarihi: string | null; nokta_sayisi: number
}
type Model = { id: number; model_adi: string; plm_id: string | null }

export default function OlcuSartnameListesi() {
  const router = useRouter()
  const [liste, setListe] = useState<Sartname[]>([])
  const [modeller, setModeller] = useState<Model[]>([])
  const [yeni, setYeni] = useState({ model_bulten_id: '', kumas_kategorisi: 'Esnek', asama: 'FINAL' })
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pes/olcu-sartname').then(r => r.json()).then(d => {
      setListe(d.sartnameler ?? []); setModeller(d.modeller ?? [])
    })
  }, [])

  async function olustur() {
    setHata(null)
    const r = await fetch('/api/pes/olcu-sartname', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...yeni, model_bulten_id: Number(yeni.model_bulten_id) }),
    })
    const d = await r.json()
    if (!r.ok) { setHata(d.error ?? 'Oluşturulamadı'); return }
    router.push(`/pes/olcu-sartname/${d.id}`)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Ölçü Şartnamesi" context="Model × kumaş kategorisi × aşama; nominal, tolerans, ölçüm yöntemi ve revizyon. Hedef nominaldir." />

      <Card>
        <CardBody className="grid gap-3 md:grid-cols-4 items-end">
          <Field label="Model">
            <Select value={yeni.model_bulten_id} onChange={e => setYeni({ ...yeni, model_bulten_id: e.target.value })}>
              <option value="">Seçin</option>
              {modeller.map(m => <option key={m.id} value={m.id}>{m.model_adi}{m.plm_id ? ` · ${m.plm_id}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Kumaş kategorisi">
            <Select value={yeni.kumas_kategorisi} onChange={e => setYeni({ ...yeni, kumas_kategorisi: e.target.value })}>
              <option>Esnek</option><option>Rijit</option>
            </Select>
          </Field>
          <Field label="Aşama">
            <Select value={yeni.asama} onChange={e => setYeni({ ...yeni, asama: e.target.value })}>
              <option value="FINAL">{ASAMA_ETIKET.FINAL}</option>
              <option value="YIKAMA_ONCESI">{ASAMA_ETIKET.YIKAMA_ONCESI}</option>
            </Select>
          </Field>
          <Button onClick={olustur} disabled={!yeni.model_bulten_id}>Yeni şartname</Button>
          {hata && <p className="md:col-span-4 text-sm text-danger">{hata}</p>}
        </CardBody>
      </Card>

      {liste.length === 0 ? (
        <EmptyState title="Henüz şartname yok" description="Bir model seçip yeni şartname açın; ölçü tablosunu Excel'den yapıştırabilirsiniz." />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-faint text-xs">
              <tr><th className="p-3">Model</th><th>Kategori</th><th>Aşama</th><th>Rev.</th><th>POM</th><th>Durum</th><th>Onay</th></tr>
            </thead>
            <tbody>
              {liste.map(s => (
                <tr key={s.id} className="border-t border-line-soft hover:bg-canvas">
                  <td className="p-3"><Link href={`/pes/olcu-sartname/${s.id}`} className="text-accent hover:underline">{s.model_adi}</Link></td>
                  <td>{s.kumas_kategorisi}</td>
                  <td>{ASAMA_ETIKET[s.asama]}</td>
                  <td className="num">{s.revizyon}</td>
                  <td className="num">{s.nokta_sayisi}</td>
                  <td><Badge tone={DURUM_TONU[s.durum]}>{s.durum}</Badge></td>
                  <td className="text-faint text-xs">{s.onaylayan ? `${s.onaylayan} · ${s.onay_tarihi}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Izgara sayfası**

```tsx
// app/pes/olcu-sartname/[id]/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageHeader, Card, CardBody, Badge, Button, Field, Input } from '@/components/ui'
import { kabulAraligi, sartnameYapistir, DURUM_TONU, ASAMA_ETIKET } from '@/lib/pes/olcu-sartname'
import { girenMetni, surumBasligi, type GirenAlanlari } from '@/lib/pes/giren'

type Deger = { nominal: number; tol_eksi: number; tol_arti: number }
type Nokta = { kod: string; ad: string; musteri_adi: string | null; yontem: string | null; kritik: boolean; degerler: Record<string, Deger> }
type Sartname = GirenAlanlari & {
  id: number; kumas_kategorisi: string; asama: string; revizyon: number; durum: string
  onaylayan: string | null; onay_tarihi: string | null; notlar: string | null
}

const sayiOku = (s: string) => Number(s.replace(',', '.'))

export default function OlcuSartnameDetay() {
  const id = Number(useParams<{ id: string }>().id)
  const router = useRouter()
  const [s, setS] = useState<Sartname | null>(null)
  const [noktalar, setNoktalar] = useState<Nokta[]>([])
  const [bedenler, setBedenler] = useState<string[]>([])
  const [mesaj, setMesaj] = useState<{ tur: 'iyi' | 'kotu'; metin: string } | null>(null)
  const [yapistir, setYapistir] = useState({ beden: '', metin: '' })
  const [onay, setOnay] = useState({ onaylayan: '', onay_tarihi: new Date().toISOString().slice(0, 10) })

  const yukle = useCallback(async () => {
    const d = await fetch(`/api/pes/olcu-sartname/${id}`).then(r => r.json())
    setS(d.sartname)
    const n: Nokta[] = (d.noktalar ?? []).map((x: Nokta) => ({ ...x, degerler: Object.fromEntries(
      Object.entries(x.degerler).map(([b, v]) => [b, { nominal: Number(v.nominal), tol_eksi: Number(v.tol_eksi), tol_arti: Number(v.tol_arti) }])) }))
    setNoktalar(n)
    setBedenler([...new Set(n.flatMap(x => Object.keys(x.degerler)))].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true })))
  }, [id])
  useEffect(() => { yukle() }, [yukle])

  const duzenlenebilir = s?.durum === 'Önerilen'

  function degerYaz(i: number, beden: string, alan: keyof Deger, v: string) {
    setNoktalar(ns => ns.map((n, j) => j !== i ? n : {
      ...n, degerler: { ...n.degerler, [beden]: { ...(n.degerler[beden] ?? { nominal: 0, tol_eksi: 0, tol_arti: 0 }), [alan]: sayiOku(v) } },
    }))
  }

  function yapistirUygula() {
    const beden = yapistir.beden.trim()
    if (!beden) { setMesaj({ tur: 'kotu', metin: 'Yapıştırılan tablonun bedenini yazın (ör. 32)' }); return }
    const r = sartnameYapistir(yapistir.metin)
    setNoktalar(ns => {
      const sonuc = [...ns]
      for (const y of r.satirlar) {
        const i = sonuc.findIndex(n => n.ad === y.ad)
        const deger = { nominal: y.nominal, tol_eksi: y.tol_eksi, tol_arti: y.tol_arti }
        if (i >= 0) sonuc[i] = { ...sonuc[i], degerler: { ...sonuc[i].degerler, [beden]: deger } }
        else sonuc.push({ kod: `P${String(sonuc.length + 1).padStart(2, '0')}`, ad: y.ad, musteri_adi: y.musteri_adi, yontem: null, kritik: false, degerler: { [beden]: deger } })
      }
      return sonuc
    })
    setBedenler(bs => bs.includes(beden) ? bs : [...bs, beden])
    setMesaj(r.hatalar.length
      ? { tur: 'kotu', metin: `${r.satirlar.length} satır alındı. Uyarılar: ${r.hatalar.join(' · ')}` }
      : { tur: 'iyi', metin: `${r.satirlar.length} ölçü noktası ${beden} bedenine işlendi. Kaydetmeyi unutmayın.` })
  }

  async function istek(url: string, method: string, body?: unknown, basliklar: Record<string, string> = {}) {
    setMesaj(null)
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...basliklar }, body: body ? JSON.stringify(body) : undefined })
    const d = await r.json()
    if (!r.ok) { setMesaj({ tur: 'kotu', metin: d.error ?? 'İşlem yapılamadı' }); return null }
    return d
  }

  async function kaydet() {
    const d = await istek(`/api/pes/olcu-sartname/${id}`, 'PUT', { notlar: s?.notlar, noktalar }, surumBasligi(s))
    if (d) { setMesaj({ tur: 'iyi', metin: 'Kaydedildi' }); await yukle() }
  }
  async function onayla() {
    if (await istek(`/api/pes/olcu-sartname/${id}/onayla`, 'POST', onay)) await yukle()
  }
  async function revizyon() {
    const d = await istek(`/api/pes/olcu-sartname/${id}/revizyon`, 'POST')
    if (d) router.push(`/pes/olcu-sartname/${d.id}`)
  }

  function yeniBeden() {
    const b = prompt('Beden')?.trim()
    if (b && !bedenler.includes(b)) setBedenler([...bedenler, b])
  }

  if (!s) return <div className="p-6 text-faint">Yükleniyor…</div>

  return (
    <div className="space-y-5">
      <Link href="/pes/olcu-sartname" className="text-xs text-faint hover:text-ink">← Şartnameler</Link>
      <PageHeader
        title={`${s.kumas_kategorisi} · ${ASAMA_ETIKET[s.asama]} · Rev. ${s.revizyon}`}
        context={girenMetni(s)}
      />
      <div className="flex items-center gap-3">
        <Badge tone={DURUM_TONU[s.durum]}>{s.durum}</Badge>
        {s.durum === 'Önerilen' && <span className="text-xs text-faint">Önerilen sınırlar sevkiyat kabul kriteri değildir; müşteri onayından sonra geçerlidir.</span>}
        {s.durum !== 'Önerilen' && <Button variant="secondary" onClick={revizyon}>Yeni revizyon aç</Button>}
      </div>

      {mesaj && <p className={mesaj.tur === 'iyi' ? 'text-sm text-ok-ink' : 'text-sm text-danger'}>{mesaj.metin}</p>}

      {duzenlenebilir && (
        <Card>
          <CardBody className="grid gap-3 md:grid-cols-[120px_1fr_auto] items-end">
            <Field label="Beden"><Input value={yapistir.beden} onChange={e => setYapistir({ ...yapistir, beden: e.target.value })} placeholder="32" /></Field>
            <Field label="Excel'den yapıştır (ölçü · nominal · −/+ tolerans · kabul aralığı)">
              <textarea className="min-h-24 rounded-lg border border-line bg-surface p-2 text-sm"
                value={yapistir.metin} onChange={e => setYapistir({ ...yapistir, metin: e.target.value })} />
            </Field>
            <Button variant="secondary" onClick={yapistirUygula}>Tabloya işle</Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-faint text-xs">
              <tr>
                <th className="p-2">Kod</th><th>Ölçü noktası</th><th>Ölçüm yöntemi</th><th>Kritik</th>
                {bedenler.map(b => <th key={b} className="p-2 text-center">{b}<div className="font-normal">nominal · −tol · +tol</div></th>)}
                {duzenlenebilir && <th><Button size="sm" variant="ghost" onClick={yeniBeden}>+ beden</Button></th>}
              </tr>
            </thead>
            <tbody>
              {noktalar.map((n, i) => (
                <tr key={i} className="border-t border-line-soft align-top">
                  <td className="p-2 num">{n.kod}</td>
                  <td className="p-2">
                    {duzenlenebilir
                      ? <Input value={n.ad} onChange={e => setNoktalar(ns => ns.map((x, j) => j === i ? { ...x, ad: e.target.value } : x))} />
                      : n.ad}
                    {n.musteri_adi && <div className="text-xs text-faint">{n.musteri_adi}</div>}
                  </td>
                  <td className="p-2 min-w-56">
                    {duzenlenebilir
                      ? <textarea className="w-full rounded-lg border border-line bg-surface p-1 text-xs" value={n.yontem ?? ''}
                          placeholder="Düğme kapalı, düz zemin, kemer dahil, serbest halde…"
                          onChange={e => setNoktalar(ns => ns.map((x, j) => j === i ? { ...x, yontem: e.target.value } : x))} />
                      : <span className="text-xs">{n.yontem ?? '—'}</span>}
                  </td>
                  <td className="p-2">
                    <input type="checkbox" checked={n.kritik} disabled={!duzenlenebilir}
                      onChange={e => setNoktalar(ns => ns.map((x, j) => j === i ? { ...x, kritik: e.target.checked } : x))} />
                  </td>
                  {bedenler.map(b => {
                    const d = n.degerler[b]
                    const k = d ? kabulAraligi(d.nominal, d.tol_eksi, d.tol_arti) : null
                    return (
                      <td key={b} className="p-2">
                        {duzenlenebilir ? (
                          <div className="flex gap-1">
                            {(['nominal', 'tol_eksi', 'tol_arti'] as const).map(a => (
                              <Input key={`${a}-${d?.[a] ?? ''}`} align="right" className="w-16" inputMode="decimal"
                                defaultValue={d ? String(d[a]).replace('.', ',') : ''}
                                onBlur={e => degerYaz(i, b, a, e.target.value)} />
                            ))}
                          </div>
                        ) : d ? (
                          <span className="num">{d.nominal} <span className="text-faint">−{d.tol_eksi} / +{d.tol_arti}</span></span>
                        ) : '—'}
                        {k && <div className="text-xs text-faint num">{k.alt}–{k.ust}</div>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {duzenlenebilir && (
          <CardBody className="flex gap-2">
            <Button variant="ghost" onClick={() => setNoktalar(ns => [...ns, { kod: `P${String(ns.length + 1).padStart(2, '0')}`, ad: '', musteri_adi: null, yontem: null, kritik: false, degerler: {} }])}>+ ölçü noktası</Button>
            <Button onClick={kaydet}>Kaydet</Button>
          </CardBody>
        )}
      </Card>

      {duzenlenebilir && (
        <Card>
          <CardBody className="grid gap-3 md:grid-cols-3 items-end">
            <Field label="Onaylayan (müşteri)"><Input value={onay.onaylayan} onChange={e => setOnay({ ...onay, onaylayan: e.target.value })} /></Field>
            <Field label="Onay tarihi"><Input type="date" value={onay.onay_tarihi} onChange={e => setOnay({ ...onay, onay_tarihi: e.target.value })} /></Field>
            <Button onClick={onayla} disabled={!onay.onaylayan.trim()}>Müşteri onaylı yap</Button>
            <p className="md:col-span-3 text-xs text-faint">Onaylanınca değiştirilemez; aynı model × kategori × aşamadaki önceki onaylı revizyon geçersiz olur.</p>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
```

Not: `prompt()`/`confirm()` proje genelinde kullanılıyor (ör. çekme testi silme). Değer kutuları `defaultValue` + `onBlur`: virgüllü ondalık yazılırken imleç bozulmasın. Yapıştırma sonrası kutular yeni değeri göstersin diye hücre anahtarı değeri içerir (aşağıdaki `key`).

- [ ] **Step 3: Menüye ekle** — `components/pes/PesDevSidebar.tsx`, `Üretim Formları` satırının altına:

```tsx
      { label: 'Ölçü Şartnamesi', href: '/pes/olcu-sartname', icon: Ruler },
```

(`Ruler` dosyada zaten import edili — satır 78'de kullanılıyor.)

- [ ] **Step 4: Tip kontrolü ve tarayıcı denemesi**

Run: `npx tsc --noEmit` → hata yok.
Run: `npm run dev`, `/pes/olcu-sartname` aç: bir model seç → Esnek / Final → "Yeni şartname" → beden `32` → kullanıcının tablosunu yapıştır → "Tabloya işle" → 10 satır, Bel `43 −1.5/+1` altında `41.5–44` → Kaydet → sayfayı yenile, değerler duruyor.

- [ ] **Step 5: Commit**

```bash
git add app/pes/olcu-sartname components/pes/PesDevSidebar.tsx lib/pes/olcu-sartname.ts
git commit -m "feat(olcu): merkez ölçü şartnamesi ekranları; Excel'den yapıştırma, müşteri onayı, revizyon"
```

---

### Task 9: Top API'si ve çekme testi genişletmesi

**Files:**
- Create: `app/api/pes/work-orders/[id]/toplar/route.ts`
- Modify: `app/api/pes/work-orders/[id]/cekme-testi/route.ts`

- [ ] **Step 1: Top API'si**

```ts
// app/api/pes/work-orders/[id]/toplar/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/**
 * Kumaş topları (062). Atölye ve merkez yazar (ortak kayıt, 409).
 *
 *   GET    → { toplar, gruplar }  gruplar: çekme grubu başına çözgü/atkı ortalama, min, max (SQL'de)
 *   POST   { tedarikci?, artikel?, kompozisyon?, tedarikci_lotu, parti_no?, top_no, metre?,
 *            kullanilabilir_en_cm?, irsaliye_no?, gelis_tarihi?, notlar? }   → her zaman 'Karantina'
 *   PATCH  ?top=ID  { durum?, ton_grubu?, cekme_grubu?, ...yukarıdaki alanlar }  (x-kayit-surum)
 *   DELETE ?top=ID
 */
const METIN = ['tedarikci', 'artikel', 'kompozisyon', 'tedarikci_lotu', 'parti_no', 'top_no', 'irsaliye_no', 'notlar', 'ton_grubu', 'cekme_grubu'] as const
const SAYI = ['metre', 'kullanilabilir_en_cm'] as const
const DURUMLAR = new Set(['Karantina', 'Serbest', 'Red'])
const TARIH = /^\d{4}-\d{2}-\d{2}$/

function alanlar(b: Record<string, unknown>): { veri: Record<string, unknown>; hata: string | null } {
  const veri: Record<string, unknown> = {}
  for (const k of METIN) if (k in b) veri[k] = b[k] == null || String(b[k]).trim() === '' ? null : String(b[k]).trim()
  for (const k of SAYI) if (k in b) {
    if (b[k] == null || String(b[k]).trim() === '') { veri[k] = null; continue }
    const n = Number(String(b[k]).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return { veri, hata: `${k} pozitif sayı olmalı` }
    veri[k] = n
  }
  if ('gelis_tarihi' in b) {
    if (!TARIH.test(String(b.gelis_tarihi))) return { veri, hata: 'Geliş tarihi YYYY-AA-GG olmalı' }
    veri.gelis_tarihi = b.gelis_tarihi
  }
  if ('durum' in b) {
    if (!DURUMLAR.has(String(b.durum))) return { veri, hata: 'Durum Karantina, Serbest ya da Red olmalı' }
    veri.durum = b.durum
  }
  return { veri, hata: null }
}

export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const wo = Number(params.id)
  const toplar = await sql`
    SELECT t.*, t.gelis_tarihi::text,
           (SELECT row_to_json(x) FROM (
               SELECT c.id, c.tarih::text, c.sonuc, c.boy_cekme_pct, c.en_cekme_pct, c.may_kaymasi_pct, c.hedef_renk
                 FROM kumas_cekme_testi c WHERE c.top_id = t.id ORDER BY c.tarih DESC, c.id DESC LIMIT 1) x) AS son_test
      FROM kumas_top t WHERE t.work_order_id = ${wo} ORDER BY t.tedarikci_lotu, t.top_no`
  const gruplar = await sql`
    SELECT t.cekme_grubu, count(DISTINCT t.id)::int AS top_sayisi,
           round(avg(c.boy_cekme_pct), 2) AS cozgu_ort, min(c.boy_cekme_pct) AS cozgu_min, max(c.boy_cekme_pct) AS cozgu_max,
           round(avg(c.en_cekme_pct), 2)  AS atki_ort,  min(c.en_cekme_pct)  AS atki_min,  max(c.en_cekme_pct)  AS atki_max
      FROM kumas_top t JOIN kumas_cekme_testi c ON c.top_id = t.id
     WHERE t.work_order_id = ${wo} AND t.cekme_grubu IS NOT NULL
     GROUP BY t.cekme_grubu ORDER BY t.cekme_grubu`
  return NextResponse.json({ toplar, gruplar })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, tenant, params }) => {
  const wo = Number(params.id)
  const [w] = await sql`SELECT workshop_id FROM work_order WHERE id = ${wo}`
  if (!w) return NextResponse.json({ error: 'İş emri bulunamadı' }, { status: 404 })
  const b = await req.json()
  const { veri, hata } = alanlar(b)
  if (hata) return NextResponse.json({ error: hata }, { status: 400 })
  if (!veri.tedarikci_lotu || !veri.top_no) return NextResponse.json({ error: 'Tedarikçi lotu ve top no zorunlu' }, { status: 400 })
  delete veri.durum // kabulde her zaman karantina
  try {
    const [t] = await sql`
      INSERT INTO kumas_top ${sql({ ...veri, tenant_id: tenant.tenantId, work_order_id: wo, workshop_id: w.workshop_id })}
      RETURNING id`
    return NextResponse.json({ id: t.id })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      return NextResponse.json({ error: `Bu lotta ${veri.top_no} numaralı top zaten kayıtlı` }, { status: 409 })
    }
    throw e
  }
})

export const PATCH = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const top = Number(req.nextUrl.searchParams.get('top'))
  const { veri, hata } = alanlar(await req.json())
  if (hata) return NextResponse.json({ error: hata }, { status: 400 })
  if (Object.keys(veri).length === 0) return NextResponse.json({ error: 'Değişecek alan yok' }, { status: 400 })
  const [t] = await sql`
    UPDATE kumas_top SET ${sql(veri)} WHERE id = ${top} AND work_order_id = ${Number(params.id)} RETURNING id`
  if (!t) return NextResponse.json({ error: 'Top bulunamadı' }, { status: 404 })
  return NextResponse.json({ ok: true })
})

export const DELETE = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const top = Number(req.nextUrl.searchParams.get('top'))
  const silinen = await sql`DELETE FROM kumas_top WHERE id = ${top} AND work_order_id = ${Number(params.id)} RETURNING id`
  if (!silinen.length) return NextResponse.json({ error: 'Top bulunamadı' }, { status: 404 })
  return NextResponse.json({ ok: true })
})
```

- [ ] **Step 2: Çekme testi API'sini genişlet** — `app/api/pes/work-orders/[id]/cekme-testi/route.ts`:

GET sorgusunun SELECT listesine ekle:

```ts
           may_kaymasi_pct, sonuc, yapan, notlar,
           top_id, yikama_receti, hedef_renk, ton_degerlendirme,
           (SELECT top_no FROM kumas_top kt WHERE kt.id = kumas_cekme_testi.top_id) AS top_no
```

POST'ta `const yikama = ...` satırından sonra ekle:

```ts
  const topId = b.topId == null || b.topId === '' ? null : Number(b.topId)
  if (topId !== null) {
    const [t] = await sql`SELECT id FROM kumas_top WHERE id = ${topId} AND work_order_id = ${wo}`
    if (!t) return NextResponse.json({ error: 'Top bu iş emrine ait değil' }, { status: 400 })
  }
  const metin = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim())
```

ve INSERT nesnesine ekle:

```ts
      top_id: topId,
      yikama_receti: metin(b.yikamaReceti),
      hedef_renk: metin(b.hedefRenk),
      ton_degerlendirme: metin(b.tonDegerlendirme),
```

Dosya başı yorumundaki POST gövdesine `topId?, yikamaReceti?, hedefRenk?, tonDegerlendirme?` ekle ve "boyCekme = çözgü, enCekme = atkı (062)" notunu yaz.

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit` → hata yok

- [ ] **Step 4: Commit**

```bash
git add "app/api/pes/work-orders/[id]/toplar" "app/api/pes/work-orders/[id]/cekme-testi/route.ts"
git commit -m "feat(surec): top API'si ve top bazlı çekme testi (reçete, hedef renk, ton)"
```

---

### Task 10: Süreç fotoğrafları (060 desenini paylaşarak)

**Files:**
- Create: `lib/pes/resim-kucult.ts`
- Modify: `components/pes/UretimFormlari.tsx` (yerel `resmiKucult` silinir, import edilir)
- Modify: `lib/pes/form-dosya.ts` (`surecYolu` eklenir)
- Create: `app/api/pes/work-orders/[id]/gorsel/route.ts`
- Create: `components/pes/surec/SurecGorselleri.tsx`
- Test: `lib/pes/form-dosya.test.ts` (yoksa oluştur)

- [ ] **Step 1: Yol fonksiyonu için failing test**

```ts
// lib/pes/form-dosya.test.ts
import { describe, it, expect } from 'vitest'
import { surecYolu } from './form-dosya'

describe('surecYolu', () => {
  it('surec/ öneki, kullanıcı dosya adı yola girmez', () => {
    expect(surecYolu('t1', 270, 'KUMAS', 'u-1', 'image/jpeg')).toBe('surec/t1/270/KUMAS/u-1.jpg')
  })
})
```

Run: `npx vitest run lib/pes/form-dosya.test.ts` → FAIL (`surecYolu` yok)

- [ ] **Step 2: Uygula** — `lib/pes/form-dosya.ts` sonuna:

```ts
/** 062: süreç fotoğrafı yolu: surec/<tenant>/<iş emri>/<adım>/<uuid>.<uzantı>. Form ekleriyle aynı kova. */
export function surecYolu(tenantId: string, workOrderId: number, adim: string, uuid: string, tur: string): string {
  return `surec/${tenantId}/${workOrderId}/${adim}/${uuid}.${IZINLI_TURLER[tur]}`
}
```

Run: `npx vitest run lib/pes/form-dosya.test.ts` → PASS

- [ ] **Step 3: Küçültmeyi ortaklaştır** — `components/pes/UretimFormlari.tsx`'teki `resmiKucult` fonksiyonunu (yorumuyla birlikte) **olduğu gibi** `lib/pes/resim-kucult.ts`'e taşı:

```ts
// lib/pes/resim-kucult.ts
'use client'
import { IZINLI_TURLER } from './form-dosya'

/* Fotoğraf 4 MB sınırına (Vercel gövde sınırı) sığsın ve kâğıt form okunur
   kalsın: uzun kenar 2400 px, JPEG %85. Çözülemeyen dosya olduğu gibi gider;
   sunucu türünü yine denetler. */
export async function resmiKucult(f: File): Promise<File> {
  if (!f.type.startsWith('image/') || (f.size < 1.5 * 1024 * 1024 && IZINLI_TURLER[f.type])) return f
  try {
    const bmp = await createImageBitmap(f)
    const oran = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * oran); c.height = Math.round(bmp.height * oran)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85))
    return blob ? new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : f
  } catch {
    return f
  }
}
```

`UretimFormlari.tsx`'te yerel fonksiyonu sil, başa `import { resmiKucult } from '@/lib/pes/resim-kucult'` ekle. `IZINLI_TURLER` importu dosyada başka yerde kullanılmıyorsa onu da kaldır.

- [ ] **Step 4: Görsel API'si**

```ts
// app/api/pes/work-orders/[id]/gorsel/route.ts
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import { DOSYA_KOVASI, dosyaHatasi, surecYolu } from '@/lib/pes/form-dosya'

/* 062: süreç fotoğrafları. 060 form ekleriyle aynı kova ve kural: yetki RLS'li
   satırdan gelir (iş emri / görsel satırı görünmüyorsa depoya gidilmez),
   depo erişimi service role, görüntüleme 1 saatlik imzalı bağlantı.
     GET    ?adim=KUMAS[&kayit=ID]
     POST   formData: dosya, adim, kayit?, aciklama?
     DELETE ?gorsel=ID */
const ADIMLAR = new Set(['KUMAS', 'CEKME', 'PASTAL', 'KONTROL', 'SEVK', 'YIKAMA', 'DONUS', 'FINAL'])

export const GET = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const adim = req.nextUrl.searchParams.get('adim') ?? ''
  const kayit = req.nextUrl.searchParams.get('kayit')
  const gorseller = await sql`
    SELECT id, yol, ad, tur, boyut, aciklama, kayit_id, giren_taraf, giren_eposta, girildi_at
      FROM surec_gorsel
     WHERE work_order_id = ${Number(params.id)} AND adim = ${adim}
       ${kayit ? sql`AND kayit_id = ${Number(kayit)}` : sql``}
     ORDER BY id`
  if (gorseller.length === 0) return NextResponse.json({ gorseller: [] })
  const { data, error } = await createAdminClient().storage.from(DOSYA_KOVASI)
    .createSignedUrls(gorseller.map(g => g.yol as string), 3600)
  if (error) throw error
  const url = new Map(data.map(d => [d.path, d.signedUrl]))
  return NextResponse.json({ gorseller: gorseller.map(({ yol, ...g }) => ({ ...g, url: url.get(yol) ?? null })) })
})

export const POST = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const wo = Number(params.id)
  const [w] = await sql`SELECT tenant_id, workshop_id FROM work_order WHERE id = ${wo}`
  if (!w) return NextResponse.json({ error: 'İş emri bulunamadı' }, { status: 404 })

  const fd = await req.formData()
  const adim = String(fd.get('adim') ?? '')
  if (!ADIMLAR.has(adim)) return NextResponse.json({ error: 'Geçersiz adım' }, { status: 400 })
  const dosya = fd.get('dosya')
  if (!(dosya instanceof File)) return NextResponse.json({ error: 'Dosya seçilmedi' }, { status: 400 })
  const hata = dosyaHatasi(dosya.type, dosya.size)
  if (hata) return NextResponse.json({ error: hata }, { status: 400 })
  const kayitHam = fd.get('kayit')
  const kayit = kayitHam ? Number(kayitHam) : null
  if (kayit !== null && !Number.isInteger(kayit)) return NextResponse.json({ error: 'Geçersiz kayıt' }, { status: 400 })

  const yol = surecYolu(w.tenant_id, wo, adim, randomUUID(), dosya.type)
  const depo = createAdminClient().storage.from(DOSYA_KOVASI)
  const { error } = await depo.upload(yol, dosya, { contentType: dosya.type })
  if (error) throw error
  try {
    const [g] = await sql`
      INSERT INTO surec_gorsel (tenant_id, work_order_id, workshop_id, adim, kayit_id, yol, ad, tur, boyut, aciklama)
      VALUES (${w.tenant_id}, ${wo}, ${w.workshop_id}, ${adim}, ${kayit}, ${yol},
              ${dosya.name.slice(0, 200) || 'foto'}, ${dosya.type}, ${dosya.size},
              ${String(fd.get('aciklama') ?? '').slice(0, 500) || null})
      RETURNING id`
    return NextResponse.json({ id: g.id })
  } catch (e) {
    await depo.remove([yol]) // satır yazılamadıysa sahipsiz dosya kalmasın
    throw e
  }
})

export const DELETE = withTenantRoute<{ id: string }>(async (req, { sql, params }) => {
  const id = Number(req.nextUrl.searchParams.get('gorsel'))
  const [g] = await sql`
    DELETE FROM surec_gorsel WHERE id = ${id} AND work_order_id = ${Number(params.id)} RETURNING yol`
  if (!g) return NextResponse.json({ error: 'Fotoğraf bulunamadı' }, { status: 404 })
  const { error } = await createAdminClient().storage.from(DOSYA_KOVASI).remove([g.yol])
  if (error) throw error // satır silinmesi de geri alınır (aynı işlem)
  return NextResponse.json({ ok: true })
})
```

- [ ] **Step 5: Bileşen**

```tsx
// components/pes/surec/SurecGorselleri.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { resmiKucult } from '@/lib/pes/resim-kucult'
import { girenMetni, type GirenAlanlari } from '@/lib/pes/giren'

type Gorsel = GirenAlanlari & { id: number; ad: string; aciklama: string | null; url: string | null }

/** Bir süreç adımının (ve isteğe bağlı bir kaydın) fotoğrafları. Telefonda kamerayı açar. */
export default function SurecGorselleri({ woId, adim, kayitId }: { woId: number; adim: string; kayitId?: number }) {
  const [gorseller, setGorseller] = useState<Gorsel[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const sorgu = `adim=${adim}${kayitId ? `&kayit=${kayitId}` : ''}`

  const yukle = useCallback(async () => {
    const d = await fetch(`/api/pes/work-orders/${woId}/gorsel?${sorgu}`).then(r => r.json())
    setGorseller(d.gorseller ?? [])
  }, [woId, sorgu])
  useEffect(() => { yukle() }, [yukle])

  async function gonder(dosyalar: File[]) {
    setHata(null); setYukleniyor(true)
    try {
      for (const f of dosyalar) {
        const fd = new FormData()
        fd.append('dosya', await resmiKucult(f)); fd.append('adim', adim)
        if (kayitId) fd.append('kayit', String(kayitId))
        const r = await fetch(`/api/pes/work-orders/${woId}/gorsel`, { method: 'POST', body: fd })
        if (!r.ok) { setHata((await r.json()).error ?? 'Yüklenemedi'); break }
      }
    } finally { setYukleniyor(false); await yukle() }
  }

  async function sil(id: number) {
    if (!confirm('Fotoğraf silinsin mi?')) return
    const r = await fetch(`/api/pes/work-orders/${woId}/gorsel?gorsel=${id}`, { method: 'DELETE' })
    if (!r.ok) setHata((await r.json()).error ?? 'Silinemedi')
    await yukle()
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {gorseller.map(g => (
          <figure key={g.id} className="w-28">
            <a href={g.url ?? undefined} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded-lg bg-canvas">
              {g.url && <img src={g.url} alt={g.aciklama ?? g.ad} className="h-full w-full object-cover" />}
            </a>
            <figcaption className="text-[11px] text-faint truncate" title={girenMetni(g)}>{girenMetni(g)}</figcaption>
            <button onClick={() => sil(g.id)} className="text-[11px] text-danger hover:underline">Sil</button>
          </figure>
        ))}
      </div>
      <label className="inline-flex">
        <input type="file" accept="image/*" capture="environment" multiple className="sr-only"
          onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) gonder(f) }} />
        <Button size="sm" variant="secondary" loading={yukleniyor} onClick={e => (e.currentTarget.previousElementSibling as HTMLInputElement)?.click()}>
          + Fotoğraf
        </Button>
      </label>
      {hata && <p className="text-xs text-danger">{hata}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Tip kontrolü ve testler**

Run: `npx tsc --noEmit && npm test` → hepsi yeşil

- [ ] **Step 7: Commit**

```bash
git add lib/pes/resim-kucult.ts lib/pes/form-dosya.ts lib/pes/form-dosya.test.ts components/pes/UretimFormlari.tsx "app/api/pes/work-orders/[id]/gorsel" components/pes/surec/SurecGorselleri.tsx
git commit -m "feat(surec): süreç fotoğrafları — form ekleri kovası ve küçültme ortak"
```

---

### Task 11: Süreç API'si ve "Süreç" sekmesi (adım 0–2)

**Files:**
- Create: `app/api/pes/work-orders/[id]/surec/route.ts`
- Create: `components/pes/surec/SurecSekmesi.tsx`, `AdimSartname.tsx`, `AdimKumas.tsx`, `AdimCekme.tsx`
- Modify: `app/workshop/is-emri/[id]/page.tsx`

- [ ] **Step 1: Süreç API'si**

```ts
// app/api/pes/work-orders/[id]/surec/route.ts
import { NextResponse } from 'next/server'
import { withTenantRoute } from '@/app/api/_lib/with-tenant'

/** GET → { durum: v_is_emri_surec satırı, sartnameler: modelin şartnameleri (geçersizler hariç) } */
export const GET = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const wo = Number(params.id)
  const [durum] = await sql`SELECT * FROM v_is_emri_surec WHERE work_order_id = ${wo}`
  if (!durum) return NextResponse.json({ error: 'İş emri bulunamadı' }, { status: 404 })
  const sartnameler = durum.model_bulten_id ? await sql`
    SELECT s.id, s.kumas_kategorisi, s.asama, s.revizyon, s.durum, s.onaylayan, s.onay_tarihi::text,
           (SELECT count(*)::int FROM olcu_noktasi n WHERE n.sartname_id = s.id) AS nokta_sayisi
      FROM olcu_sartname s
     WHERE s.model_bulten_id = ${durum.model_bulten_id} AND s.durum <> 'Geçersiz'
     ORDER BY s.asama, s.kumas_kategorisi, s.revizyon DESC` : []
  return NextResponse.json({ durum, sartnameler })
})
```

- [ ] **Step 2: Adım listesi**

```tsx
// components/pes/surec/SurecSekmesi.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui'
import AdimSartname, { type SartnameOzet } from './AdimSartname'
import AdimKumas from './AdimKumas'
import AdimCekme from './AdimCekme'

export type AdimDurumu = 'Bekliyor' | 'Devam' | 'Tamam' | 'Sorunlu'
export type SurecDurumu = {
  model_bulten_id: number | null
  adim0: AdimDurumu; adim1: AdimDurumu; adim2: AdimDurumu
  top_sayisi: number; karantina: number; serbest: number; red: number; grupsuz_serbest: number
  toplam_metre: string; test_sayisi: number; sorunlu_test: number; final_onayli: number
}

const TON: Record<AdimDurumu, 'neutral' | 'warn' | 'good' | 'bad'> = { Bekliyor: 'neutral', Devam: 'warn', Tamam: 'good', Sorunlu: 'bad' }

/* Sürüm 1: adım 0–2 çalışır; 3–8 listede görünür ama kapalı (sürüm 2–3). */
const SONRAKI = ['Pastal / kesim', 'Kesim ve dikim kontrol', 'Yıkamaya sevk', 'Yıkama (yıkamacı)', 'Dönüş kabulü', 'Ütü / final / paket']

export default function SurecSekmesi({ woId }: { woId: number }) {
  const [d, setD] = useState<{ durum: SurecDurumu; sartnameler: SartnameOzet[] } | null>(null)
  const [acik, setAcik] = useState<number | null>(null)

  const yukle = useCallback(async () => {
    const r = await fetch(`/api/pes/work-orders/${woId}/surec`)
    if (r.ok) setD(await r.json())
  }, [woId])
  useEffect(() => { yukle() }, [yukle])

  if (!d) return <div className="text-faint text-sm">Yükleniyor…</div>
  const { durum } = d

  const adimlar: { baslik: string; durum: AdimDurumu; ozet: string; icerik: React.ReactNode }[] = [
    { baslik: 'Ölçü şartnamesi', durum: durum.adim0,
      ozet: durum.model_bulten_id ? `${d.sartnameler.length} şartname${durum.final_onayli ? '' : ' · final onaysız'}` : 'İş emrine model bülteni bağlı değil',
      icerik: <AdimSartname sartnameler={d.sartnameler} modelVar={!!durum.model_bulten_id} /> },
    { baslik: 'Kumaş kabul', durum: durum.adim1,
      ozet: `${durum.top_sayisi} top · ${Number(durum.toplam_metre).toLocaleString('tr-TR')} m · ${durum.karantina} karantinada`,
      icerik: <AdimKumas woId={woId} onDegisti={yukle} /> },
    { baslik: 'Çekme testi ve gruplama', durum: durum.adim2,
      ozet: `${durum.test_sayisi} test · ${durum.grupsuz_serbest} serbest top grupsuz${durum.sorunlu_test ? ` · ${durum.sorunlu_test} riskli/red` : ''}`,
      icerik: <AdimCekme woId={woId} onDegisti={yukle} /> },
  ]

  return (
    <ol className="space-y-2">
      {adimlar.map((a, i) => (
        <li key={i} className="rounded-xl border border-line-soft bg-surface">
          <button onClick={() => setAcik(acik === i ? null : i)} className="flex w-full items-center gap-3 p-3 text-left">
            <span className="num w-6 text-faint">{i}</span>
            <span className="font-medium text-ink">{a.baslik}</span>
            <Badge tone={TON[a.durum]}>{a.durum}</Badge>
            <span className="ml-auto text-xs text-faint">{a.ozet}</span>
          </button>
          {acik === i && <div className="border-t border-line-soft p-3">{a.icerik}</div>}
        </li>
      ))}
      {SONRAKI.map((b, j) => (
        <li key={b} className="flex items-center gap-3 rounded-xl border border-dashed border-line-soft p-3 text-faint">
          <span className="num w-6">{j + 3}</span><span>{b}</span>
          <span className="ml-auto text-xs">Sonraki sürümde</span>
        </li>
      ))}
    </ol>
  )
}
```

- [ ] **Step 3: Adım 0**

```tsx
// components/pes/surec/AdimSartname.tsx
'use client'

import { Badge } from '@/components/ui'
import { DURUM_TONU, ASAMA_ETIKET } from '@/lib/pes/olcu-sartname'

export type SartnameOzet = {
  id: number; kumas_kategorisi: string; asama: string; revizyon: number; durum: string
  onaylayan: string | null; onay_tarihi: string | null; nokta_sayisi: number
}

/** Atölye için salt okunur: şartnameyi merkez yönetir. */
export default function AdimSartname({ sartnameler, modelVar }: { sartnameler: SartnameOzet[]; modelVar: boolean }) {
  if (!modelVar) return <p className="text-sm text-faint">Bu iş emrine model bülteni bağlı değil; merkez bağlayınca şartname burada görünür.</p>
  if (sartnameler.length === 0) return <p className="text-sm text-faint">Bu model için ölçü şartnamesi yok. Ölçü girilemez; merkeze bildirin.</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-faint"><tr><th className="py-1">Aşama</th><th>Kategori</th><th>Rev.</th><th>POM</th><th>Durum</th></tr></thead>
      <tbody>
        {sartnameler.map(s => (
          <tr key={s.id} className="border-t border-line-soft">
            <td className="py-1">{ASAMA_ETIKET[s.asama]}</td><td>{s.kumas_kategorisi}</td>
            <td className="num">{s.revizyon}</td><td className="num">{s.nokta_sayisi}</td>
            <td>
              <Badge tone={DURUM_TONU[s.durum]}>{s.durum}</Badge>
              {s.durum === 'Önerilen' && s.asama === 'FINAL' && <span className="ml-2 text-xs text-faint">sevkiyat kabulü için müşteri onayı bekleniyor</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Adım 1**

```tsx
// components/pes/surec/AdimKumas.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Field, Input, Select } from '@/components/ui'
import { girenMetni, surumBasligi, type GirenAlanlari } from '@/lib/pes/giren'
import SurecGorselleri from './SurecGorselleri'

export type Top = GirenAlanlari & {
  id: number; tedarikci: string | null; artikel: string | null; kompozisyon: string | null
  tedarikci_lotu: string; parti_no: string | null; top_no: string; metre: string | null
  kullanilabilir_en_cm: string | null; irsaliye_no: string | null; gelis_tarihi: string
  durum: 'Karantina' | 'Serbest' | 'Red'; ton_grubu: string | null; cekme_grubu: string | null; notlar: string | null
  son_test: { sonuc: string; boy_cekme_pct: string | null; en_cekme_pct: string | null } | null
}

const TON = { Karantina: 'warn', Serbest: 'good', Red: 'bad' } as const
const BOS = { tedarikci: '', artikel: '', kompozisyon: '', tedarikci_lotu: '', parti_no: '', top_no: '', metre: '', kullanilabilir_en_cm: '', irsaliye_no: '' }

export default function AdimKumas({ woId, onDegisti }: { woId: number; onDegisti: () => void }) {
  const [toplar, setToplar] = useState<Top[]>([])
  const [yeni, setYeni] = useState(BOS)
  const [hata, setHata] = useState<string | null>(null)

  const yukle = useCallback(async () => {
    const d = await fetch(`/api/pes/work-orders/${woId}/toplar`).then(r => r.json())
    setToplar(d.toplar ?? [])
  }, [woId])
  useEffect(() => { yukle() }, [yukle])

  async function ekle() {
    setHata(null)
    const r = await fetch(`/api/pes/work-orders/${woId}/toplar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yeni),
    })
    const d = await r.json()
    if (!r.ok) { setHata(d.error ?? 'Kaydedilemedi'); return }
    // Aynı irsaliyeden sıradaki top: lot, tedarikçi, artikel kalır; top no ve metre boşalır.
    setYeni({ ...yeni, top_no: '', metre: '' })
    await yukle(); onDegisti()
  }

  async function durumYaz(t: Top, durum: Top['durum']) {
    setHata(null)
    const r = await fetch(`/api/pes/work-orders/${woId}/toplar?top=${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...surumBasligi(t) }, body: JSON.stringify({ durum }),
    })
    if (!r.ok) setHata((await r.json()).error ?? 'Değiştirilemedi')
    await yukle(); onDegisti()
  }

  async function sil(t: Top) {
    if (!confirm(`${t.top_no} numaralı top silinsin mi? Testleri de silinir.`)) return
    await fetch(`/api/pes/work-orders/${woId}/toplar?top=${t.id}`, { method: 'DELETE' })
    await yukle(); onDegisti()
  }

  const alan = (k: keyof typeof BOS, etiket: string, ek: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <Field label={etiket}><Input value={yeni[k]} onChange={e => setYeni({ ...yeni, [k]: e.target.value })} {...ek} /></Field>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-faint">Her top karantinada kabul edilir. Fiziksel kontrol, renk ve çekme testi sonrası serbest bırakılır; karantinadaki top kesime giremez.</p>
      <div className="grid gap-2 md:grid-cols-5">
        {alan('irsaliye_no', 'İrsaliye')}{alan('tedarikci', 'Tedarikçi')}{alan('artikel', 'Artikel')}
        {alan('kompozisyon', 'Kompozisyon')}{alan('tedarikci_lotu', 'Tedarikçi lotu *')}
        {alan('parti_no', 'Parti')}{alan('top_no', 'Top no *')}
        {alan('metre', 'Metre', { inputMode: 'decimal', align: 'right' })}
        {alan('kullanilabilir_en_cm', 'Kullanılabilir en (cm)', { inputMode: 'decimal', align: 'right' })}
        <div className="flex items-end"><Button onClick={ekle} disabled={!yeni.tedarikci_lotu || !yeni.top_no}>Topu ekle</Button></div>
      </div>
      {hata && <p className="text-sm text-danger">{hata}</p>}

      {toplar.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint">
              <tr><th className="py-1">Lot / parti</th><th>Top</th><th className="text-right">Metre</th><th className="text-right">En</th><th>Artikel</th><th>Son test</th><th>Durum</th><th></th></tr>
            </thead>
            <tbody>
              {toplar.map(t => (
                <tr key={t.id} className="border-t border-line-soft" title={girenMetni(t)}>
                  <td className="py-1">{t.tedarikci_lotu}{t.parti_no ? ` · ${t.parti_no}` : ''}</td>
                  <td>{t.top_no}</td>
                  <td className="num text-right">{t.metre ?? '—'}</td>
                  <td className="num text-right">{t.kullanilabilir_en_cm ?? '—'}</td>
                  <td>{t.artikel ?? '—'}</td>
                  <td className="text-xs">{t.son_test ? `${t.son_test.sonuc} · çözgü ${t.son_test.boy_cekme_pct ?? '—'} / atkı ${t.son_test.en_cekme_pct ?? '—'}` : '—'}</td>
                  <td>
                    <Select value={t.durum} onChange={e => durumYaz(t, e.target.value as Top['durum'])} className="w-32">
                      <option>Karantina</option><option>Serbest</option><option>Red</option>
                    </Select>
                    <Badge tone={TON[t.durum]} className="ml-1">{t.durum}</Badge>
                  </td>
                  <td><button onClick={() => sil(t)} className="text-xs text-danger hover:underline">Sil</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs text-faint">İrsaliye, top etiketi, hasar fotoğrafları</p>
        <SurecGorselleri woId={woId} adim="KUMAS" />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Adım 2** — sayfadaki `CekmeTestiTab`'ın yerini alır.

```tsx
// components/pes/surec/AdimCekme.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Field, Input, Select } from '@/components/ui'
import { surumBasligi } from '@/lib/pes/giren'
import SurecGorselleri from './SurecGorselleri'
import type { Top } from './AdimKumas'

type Test = {
  id: number; tarih: string; top_id: number | null; top_no: string | null; yikama_sayisi: number | null
  boy_cekme_pct: string | null; en_cekme_pct: string | null; may_kaymasi_pct: string | null
  yikama_receti: string | null; hedef_renk: string | null; ton_degerlendirme: string | null
  sonuc: 'UYGUN' | 'RİSKLİ' | 'RED' | 'BEKLIYOR'; yapan: string | null; notlar: string | null
}
type Grup = { cekme_grubu: string; top_sayisi: number; cozgu_ort: string; cozgu_min: string; cozgu_max: string; atki_ort: string; atki_min: string; atki_max: string }

const SONUC_TON = { UYGUN: 'good', 'RİSKLİ': 'warn', RED: 'bad', BEKLIYOR: 'neutral' } as const
const bugun = () => new Date().toISOString().slice(0, 10)
const BOS = { topId: '', tarih: bugun(), yikamaReceti: '', hedefRenk: '', yikamaSayisi: '1', boyCekme: '', enCekme: '', mayKaymasi: '', tonDegerlendirme: '', sonuc: 'UYGUN', yapan: '', notlar: '' }

export default function AdimCekme({ woId, onDegisti }: { woId: number; onDegisti: () => void }) {
  const [testler, setTestler] = useState<Test[]>([])
  const [toplar, setToplar] = useState<Top[]>([])
  const [gruplar, setGruplar] = useState<Grup[]>([])
  const [yeni, setYeni] = useState(BOS)
  const [hata, setHata] = useState<string | null>(null)

  const yukle = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch(`/api/pes/work-orders/${woId}/cekme-testi`).then(r => r.json()),
      fetch(`/api/pes/work-orders/${woId}/toplar`).then(r => r.json()),
    ])
    setTestler(a.testler ?? []); setToplar(b.toplar ?? []); setGruplar(b.gruplar ?? [])
  }, [woId])
  useEffect(() => { yukle() }, [yukle])

  async function ekle() {
    setHata(null)
    const r = await fetch(`/api/pes/work-orders/${woId}/cekme-testi`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yeni),
    })
    const d = await r.json()
    if (!r.ok) { setHata(d.error ?? 'Kaydedilemedi'); return }
    setYeni({ ...BOS, tarih: yeni.tarih, yikamaReceti: yeni.yikamaReceti, hedefRenk: yeni.hedefRenk, yapan: yeni.yapan })
    await yukle(); onDegisti()
  }

  async function sil(id: number) {
    if (!confirm('Bu test kaydı silinsin mi?')) return
    await fetch(`/api/pes/work-orders/${woId}/cekme-testi?testId=${id}`, { method: 'DELETE' })
    await yukle(); onDegisti()
  }

  async function grupYaz(t: Top, alan: 'ton_grubu' | 'cekme_grubu', deger: string) {
    if ((t[alan] ?? '') === deger.trim()) return
    setHata(null)
    const r = await fetch(`/api/pes/work-orders/${woId}/toplar?top=${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...surumBasligi(t) }, body: JSON.stringify({ [alan]: deger }),
    })
    if (!r.ok) setHata((await r.json()).error ?? 'Kaydedilemedi')
    await yukle(); onDegisti()
  }

  const g = (k: keyof typeof BOS, etiket: string, ek: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <Field label={etiket}><Input value={yeni[k]} onChange={e => setYeni({ ...yeni, [k]: e.target.value })} {...ek} /></Field>
  )

  return (
    <div className="space-y-5">
      <p className="text-xs text-faint">
        Topu kullanılacağı yıkama yolunda test edin; çözgü ve atkıyı ayrı yazın (küçülme negatif). Bir top birden çok renge gidecekse her yol için ayrı test girin.
      </p>
      <div className="grid gap-2 md:grid-cols-6">
        <Field label="Top">
          <Select value={yeni.topId} onChange={e => setYeni({ ...yeni, topId: e.target.value })}>
            <option value="">— iş emri geneli —</option>
            {toplar.map(t => <option key={t.id} value={t.id}>{t.tedarikci_lotu} · {t.top_no}</option>)}
          </Select>
        </Field>
        {g('tarih', 'Tarih', { type: 'date' })}
        {g('yikamaReceti', 'Yıkama reçetesi / rev.')}
        {g('hedefRenk', 'Hedef renk (C1…)')}
        {g('yikamaSayisi', 'Yıkama sayısı', { inputMode: 'numeric', align: 'right' })}
        {g('boyCekme', 'Çözgü (boy) %', { inputMode: 'decimal', align: 'right' })}
        {g('enCekme', 'Atkı (en) %', { inputMode: 'decimal', align: 'right' })}
        {g('mayKaymasi', 'Dönme %', { inputMode: 'decimal', align: 'right' })}
        {g('tonDegerlendirme', 'Ton değerlendirmesi')}
        <Field label="Sonuç">
          <Select value={yeni.sonuc} onChange={e => setYeni({ ...yeni, sonuc: e.target.value })}>
            <option>UYGUN</option><option>RİSKLİ</option><option>RED</option><option>BEKLIYOR</option>
          </Select>
        </Field>
        {g('yapan', 'Yapan')}
        <div className="flex items-end"><Button onClick={ekle}>Testi ekle</Button></div>
      </div>
      {hata && <p className="text-sm text-danger">{hata}</p>}

      {testler.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint">
              <tr><th className="py-1">Tarih</th><th>Top</th><th>Reçete / renk</th><th className="text-right">Çözgü</th><th className="text-right">Atkı</th><th className="text-right">Dönme</th><th>Ton</th><th>Sonuç</th><th></th></tr>
            </thead>
            <tbody>
              {testler.map(t => (
                <tr key={t.id} className="border-t border-line-soft">
                  <td className="py-1 num">{t.tarih}</td>
                  <td>{t.top_no ?? <span className="text-faint">geneli</span>}</td>
                  <td className="text-xs">{[t.yikama_receti, t.hedef_renk].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="num text-right">{t.boy_cekme_pct ?? '—'}</td>
                  <td className="num text-right">{t.en_cekme_pct ?? '—'}</td>
                  <td className="num text-right">{t.may_kaymasi_pct ?? '—'}</td>
                  <td className="text-xs">{t.ton_degerlendirme ?? '—'}</td>
                  <td><Badge tone={SONUC_TON[t.sonuc]}>{t.sonuc}</Badge></td>
                  <td><button onClick={() => sil(t.id)} className="text-xs text-danger hover:underline">Sil</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toplar.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-ink">Gruplama</h4>
          <p className="text-xs text-faint">Topları yıkama sonrası renk ve çekme davranışına göre gruplayın. İki lot aynı gruba girebilir, bir lot birkaç gruba ayrılabilir. Hem ortalamaya hem aralığa bakın.</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint"><tr><th className="py-1">Lot · top</th><th>Durum</th><th>Ton grubu</th><th>Çekme grubu</th></tr></thead>
            <tbody>
              {toplar.map(t => (
                <tr key={`${t.id}-${t.girildi_at}`} className="border-t border-line-soft">
                  <td className="py-1">{t.tedarikci_lotu} · {t.top_no}</td>
                  <td className="text-xs">{t.durum}</td>
                  <td><Input className="w-24" defaultValue={t.ton_grubu ?? ''} onBlur={e => grupYaz(t, 'ton_grubu', e.target.value)} /></td>
                  <td><Input className="w-24" defaultValue={t.cekme_grubu ?? ''} onBlur={e => grupYaz(t, 'cekme_grubu', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {gruplar.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-faint"><tr><th className="py-1">Çekme grubu</th><th className="text-right">Top</th><th className="text-right">Çözgü ort. (min…max)</th><th className="text-right">Atkı ort. (min…max)</th></tr></thead>
              <tbody>
                {gruplar.map(gr => (
                  <tr key={gr.cekme_grubu} className="border-t border-line-soft">
                    <td className="py-1">{gr.cekme_grubu}</td>
                    <td className="num text-right">{gr.top_sayisi}</td>
                    <td className="num text-right">{gr.cozgu_ort ?? '—'} ({gr.cozgu_min ?? '—'}…{gr.cozgu_max ?? '—'})</td>
                    <td className="num text-right">{gr.atki_ort ?? '—'} ({gr.atki_min ?? '—'}…{gr.atki_max ?? '—'})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs text-faint">Renk battaniyesi / test numunesi fotoğrafları</p>
        <SurecGorselleri woId={woId} adim="CEKME" />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: İş emri sayfasına bağla** — `app/workshop/is-emri/[id]/page.tsx`:

1. Import ekle: `import SurecSekmesi from '@/components/pes/surec/SurecSekmesi'`
2. Satır 141 tab tipi: `'cekme'` yerine `'surec'`, başlangıç değeri `'surec'`:
   `useState<'surec'|'ozet'|'asamalar'|'plangercek'|'malzemeler'|'gunluk'|'gecmis'>('surec')`
3. Sekme listesinde başa `['surec','Süreç','🧭'],` ekle; `['cekme','Çekme Testi','🧪'],` satırını sil; `onClick` içindeki tip birleşimini 2. maddedekiyle aynı yap.
4. `{tab === 'cekme' ... <CekmeTestiTab woId={id} />}` satırını sil, yerine en başa: `{tab === 'surec' && <SurecSekmesi woId={id} />}`
5. `function CekmeTestiTab` ve yalnız onun kullandığı `CekmeTesti` tipini sil (çekme testi artık adım 2'de). Silmeden önce `grep -n "CekmeTesti" "app/workshop/is-emri/[id]/page.tsx"` ile başka kullanım olmadığını doğrula.

- [ ] **Step 7: Tip, test, tarayıcı**

Run: `npx tsc --noEmit && npm test` → yeşil.
Run: `npm run dev`; merkez olarak `/workshop/gir` ile bir atölyeye gir, bir iş emri aç:
- "Süreç" ilk sekme; adım 0 "Bekliyor" (ya da şartname varsa listeli).
- Adım 1: iki top ekle → ikisi Karantina, adım 1 "Devam". Biri "Serbest" → hâlâ "Devam"; ikincisi "Serbest" → "Tamam".
- Adım 2: top 1 için RED test girmeyi dene → 422 "Top serbest bırakılmış…" mesajı görünür. Top 1'i Karantina yap, RED gir, Serbest yapmayı dene → 422 "RED sonuçlu çekme testi var". 
- Top 2'ye UYGUN test, ton `A`, çekme grubu `1` → grup tablosunda 1 top, ortalama görünür.
- Telefon genişliğinde (DevTools 390 px) "+ Fotoğraf" → dosya seç → küçük resim ve "Atölye beyanı · …" görünür.
- Merkez panelinde aynı top satırını açıkken atölye panelinden değiştir, sonra merkezde durum değiştir → 409 mesajı.

- [ ] **Step 8: Commit**

```bash
git add "app/api/pes/work-orders/[id]/surec" components/pes/surec "app/workshop/is-emri/[id]/page.tsx"
git commit -m "feat(surec): iş emrinde Süreç sekmesi — şartname, kumaş kabul, çekme ve gruplama"
```

---

### Task 12: Sürüm, wiki, son doğrulama

**Files:**
- Modify: `lib/version.ts`, `package.json`
- Modify: `_wiki_PES/log.md`, `_wiki_PES/index.md`
- Create: `_wiki_PES/kararlar/2026-11-17-is-emri-surec-akisi.md`

- [ ] **Step 1: Sürüm** — `lib/version.ts`: `export const APP_VERSION = 'v1.19.0'`; `package.json`: `"version": "1.19.0"`

- [ ] **Step 2: Wiki kararı** — `_wiki_PES/CLAUDE.md` şemasını oku ve ona uygun yaz; içerik:

```markdown
---
tur: karar
durum: gecerli
tarih: 2026-11-17
guncelleme: 2026-11-17
kaynaklar: [docs/superpowers/specs/2026-11-17-is-emri-surec-akisi-design.md, supabase/migrations/061_olcu_sartname.sql, supabase/migrations/062_kumas_top_surec.sql]
---
# İş emri süreç akışı: kumaştan bitmiş ürüne tek akış

## Bağlam
Denim üretiminde ölçü ve renk sorunları kesimden önce (kumaş topu, çekme grubu) belirleniyor; kayıtlar dağınıktı ve iş emri bazındaki tek çekme testi top farkını göremiyordu.

## Karar
- İş emrinde "Süreç" sekmesi, adım 0–8; adım durumu `v_is_emri_surec` görünümünde.
- Ölçü şartnamesi (061): model × kumaş kategorisi × aşama × revizyon; kabul aralığı saklanmaz (hedef nominal); onaylı revizyon kilitli; yalnız merkez yazar, atölye okur.
- Kumaş topu (062): karantina → serbest/red; RED testli top serbest olamaz; lot, top, ton grubu, çekme grubu ayrı alanlar. Çekme testi top bazlı (eski kolonlar: boy = çözgü, en = atkı).
- Fotoğraflar üretim formlarının kovasında (`surec/` öneki), aynı küçültme.
- Kurallar `PT422` ile veritabanında; API 422 döner.

## Seçilmeyenler ve neden
- Ayrı kontrol formu tablosu: `uretim_formu` (059) zaten var.
- Ölçüyü JSONB formlarda tutmak: POM bazlı geçti/kaldı ve yıkama öncesi/sonrası eşleştirme zayıf kalır (kullanıcı kararı: süreç ölçümü esas).
- Yıkamacıyı `workshop` satırı yapmak: o tabloyu okuyan 88 dosya; yıkamacılar atölye kıyaslarına karışırdı (sürüm 3).

## Sonuçlar
- Sürüm 2: pastal/demet, ölçüm + `v_olcum_sonuc`, ölçü formlarının bu kayıtları göstermesi, yıkamaya sevk.
- Sürüm 3: yıkamacı hesabı (`current_workshop_id = 0` ile varsayılan kapalı), yıkama yükü, dönüş, final.
```

`index.md`'ye bu sayfanın satırını, `log.md` sonuna şunu ekle:

```markdown
## [2026-11-17] karar | İş emri süreç akışı → v1.19.0 (sürüm 1: adım 0–2)
- oluşturuldu: kararlar/2026-11-17-is-emri-surec-akisi.md
- güncellendi: index.md
- migration 061 (ölçü şartnamesi) ve 062 (kumaş topu, top bazlı çekme, süreç görseli, v_is_emri_surec) üretim DB'ye uygulandı.
```

- [ ] **Step 3: Son doğrulama**

Run: `npx tsc --noEmit` → hata yok
Run: `npm test` → tüm testler yeşil

- [ ] **Step 4: Commit**

```bash
git add lib/version.ts package.json _wiki_PES
git commit -m "chore(surum): v1.19.0 iş emri süreç akışı sürüm 1; wiki kararı"
```

- [ ] **Step 5: Birleştirme ve yayın kullanıcıya sorulur** — `superpowers:finishing-a-development-branch`. Yayın (push + `yayinla.mjs`) yalnız kullanıcı isterse.
