# Atölye Arşivleme ve Silme — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ekip `/pes` panelinden atölyeyi arşivleyebilsin, geri alabilsin ve yalnız tamamen boş olanı kalıcı silebilsin.

**Architecture:** Silme kararının tamamı `lib/pes/workshop-baglantilar.ts` içinde toplanır — hangi tabloların `workshop`'a bağlı olduğu `pg_constraint`'ten okunur, satır kilidi ve silme aynı transaction'da yapılır. API route bu fonksiyonun ince bir HTTP sarmalıdır. Arayüz tarafında liste ve detay sayfaları server component kalır; yalnız butonlar client component'tir ve `router.refresh()` ile sunucuyu yeniden çalıştırır (projede `AtolyeSecici.tsx` aynı desende).

**Tech Stack:** Next.js 16 App Router, TypeScript, postgres.js, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-22-atolye-arsivleme-ve-silme-design.md`

## Spec'ten bilinçli sapma

Spec doğrulamayı `scripts/verify_atolye_silme.mjs` olarak tarif ediyordu. Plan
bunun yerine `lib/pes/workshop-baglantilar.test.ts` (Vitest) kullanıyor.
Gerekçe: `.mjs` betik TypeScript modülünü import edemez, dolayısıyla sayım
SQL'i betikte ikinci kez yazılırdı — test edilen kod ile çalışan kod ayrışırdı.
Vitest projede zaten kurulu (`npm test`), TypeScript'i doğrudan çalıştırır ve
test gerçek veritabanına bağlanarak spec'in istediği beş şeyi aynen kanıtlar.
Doğrulanan davranış değişmiyor, yalnız dosya biçimi değişiyor.

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `lib/pes/workshop-baglantilar.ts` (yeni) | Bağlı kayıt sayımı + kilitli silme kararı. Tek iş: "bu atölye silinebilir mi, silinemiyorsa neden". |
| `lib/pes/workshop-baglantilar.test.ts` (yeni) | Yukarıdakinin gerçek veritabanına karşı entegrasyon testi. |
| `app/api/pes/workshops/[id]/route.ts` (değişecek) | `PATCH`'e `is_active` eklenir, `DELETE` eklenir. HTTP sarmalı, iş mantığı içermez. |
| `components/pes/AtolyeArsivDugmesi.tsx` (yeni) | Liste satırındaki Arşivle / Geri al butonu. |
| `components/pes/AtolyeTehlikeliIslemler.tsx` (yeni) | Detay sayfasındaki arşivleme + kalıcı silme bölümü, 409 dökümünü gösterir. |
| `app/pes/workshops/page.tsx` (değişecek) | `?arsiv=1` filtresi, iki sayaç, işlem sütunu. |
| `app/pes/workshops/[id]/page.tsx` (değişecek) | Tehlikeli işlemler bölümünü sayfaya takar. |

---

### Task 1: Bağlantı sayımı ve silme kararı

**Files:**
- Create: `lib/pes/workshop-baglantilar.ts`
- Test: `lib/pes/workshop-baglantilar.test.ts`

- [ ] **Step 1: Testi yaz**

`lib/pes/workshop-baglantilar.test.ts`:

```ts
import { beforeAll, afterAll, expect, test } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { bagimliliklariSay, atolyeSil } from './workshop-baglantilar'

/* Gerçek veritabanına bağlanır: sayım SQL'i pg_constraint ve RLS ile
   iç içe çalışıyor, sahte bağlantıyla test etmek hiçbir şey kanıtlamaz. */
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const yonetici = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })
const uygulama = postgres(env.APP_DATABASE_URL, { max: 2, prepare: false, connect_timeout: 15 })

let defaultTenant: string
let demoTenant: string | null = null
const KOD_ONEKI = 'ZZTEST'

beforeAll(async () => {
  const [d] = await yonetici`SELECT id FROM tenant WHERE slug = 'default'`
  defaultTenant = d.id
  const [m] = await yonetici`SELECT id FROM tenant WHERE slug = 'demo-atolye'`
  demoTenant = m?.id ?? null
  await yonetici`DELETE FROM workshop WHERE code LIKE ${KOD_ONEKI + '%'}`
})

afterAll(async () => {
  await yonetici`DELETE FROM workshop WHERE code LIKE ${KOD_ONEKI + '%'}`
  await yonetici.end()
  await uygulama.end()
})

/* Uygulamanın çalıştığı yol: pes_app rolü + SET LOCAL tenant context. */
function tenantIcinde<T>(tenantId: string, fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return uygulama.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    return fn(tx)
  }) as Promise<T>
}

async function atolyeAc(kod: string): Promise<number> {
  const [row] = await yonetici`
    INSERT INTO workshop (tenant_id, code, name, type, total_staff, sewing_staff,
                          ukp_staff, cutting_staff, management, indirect,
                          line_count, daily_target, net_hours_day)
    VALUES (${defaultTenant}, ${kod}, ${'Test ' + kod}, 'CMT', 0, 0, 0, 0, 0, 0, 0, 0, 9)
    RETURNING id`
  return row.id
}

test('boş atölyenin engeli yoktur ve silinir', async () => {
  const id = await atolyeAc(KOD_ONEKI + '-BOS')

  const engeller = await tenantIcinde(defaultTenant, (sql) => bagimliliklariSay(sql, id))
  expect(engeller).toEqual([])

  const sonuc = await tenantIcinde(defaultTenant, (sql) => atolyeSil(sql, id))
  expect(sonuc).toEqual({ bulundu: true, silindi: true, engeller: [] })

  const kalan = await yonetici`SELECT id FROM workshop WHERE id = ${id}`
  expect(kalan.length).toBe(0)
})

test('bandı olan atölye silinmez ve veritabanında durmaya devam eder', async () => {
  const id = await atolyeAc(KOD_ONEKI + '-DOLU')
  await yonetici`
    INSERT INTO production_line (tenant_id, workshop_id, code, name, operator_count)
    VALUES (${defaultTenant}, ${id}, ${KOD_ONEKI + '-B1'}, 'Test Bant', 10)`

  const sonuc = await tenantIcinde(defaultTenant, (sql) => atolyeSil(sql, id))
  expect(sonuc.silindi).toBe(false)
  expect(sonuc.bulundu).toBe(true)
  expect(sonuc.engeller.map((e) => e.tablo)).toContain('production_line')
  expect(sonuc.engeller.find((e) => e.tablo === 'production_line')?.adet).toBe(1)

  const kalan = await yonetici`SELECT id FROM workshop WHERE id = ${id}`
  expect(kalan.length).toBe(1)
})

test('arşivlenen atölye aktif sayımından düşer, geri alınca döner', async () => {
  const id = await atolyeAc(KOD_ONEKI + '-ARSIV')
  const aktifSay = async () => {
    const [r] = await yonetici`SELECT count(*)::int c FROM workshop WHERE is_active`
    return r.c
  }

  const once = await aktifSay()
  await yonetici`UPDATE workshop SET is_active = false WHERE id = ${id}`
  expect(await aktifSay()).toBe(once - 1)

  await yonetici`UPDATE workshop SET is_active = true WHERE id = ${id}`
  expect(await aktifSay()).toBe(once)
})

test('başka tenant’ın atölyesi görülemez, silinemez', async () => {
  if (!demoTenant) return
  const [baskasi] = await yonetici`
    SELECT id FROM workshop WHERE tenant_id = ${demoTenant} LIMIT 1`
  if (!baskasi) return

  const sonuc = await tenantIcinde(defaultTenant, (sql) => atolyeSil(sql, baskasi.id))
  expect(sonuc.bulundu).toBe(false)
  expect(sonuc.silindi).toBe(false)

  const kalan = await yonetici`SELECT id FROM workshop WHERE id = ${baskasi.id}`
  expect(kalan.length).toBe(1)
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `npx vitest run lib/pes/workshop-baglantilar.test.ts`
Expected: FAIL — `Failed to resolve import "./workshop-baglantilar"`

- [ ] **Step 3: Asgari uygulamayı yaz**

`lib/pes/workshop-baglantilar.ts`:

```ts
import type postgres from 'postgres'

/* Atölye silinebilir mi? Kararın tamamı burada.
 *
 * NEDEN pg_constraint: workshop'a bugün 24 tablo bağlı (23'ü CASCADE).
 * Listeyi elle yazsaydık, ileride bağlanan her yeni tablo sessizce kontrol
 * dışında kalır ve bir DELETE o tablodaki kayıtları da silerdi. Katalogdan
 * okuyunca kontrol kendiliğinden genişler. */

export type Engel = { tablo: string; etiket: string; adet: number }

/* Hata mesajı kullanıcıya gösteriliyor; tablo adı yerine Türkçe karşılık.
   Listede olmayan tablo kendi adıyla görünür — eksik etiket hatayı gizlemesin. */
const ETIKETLER: Record<string, string> = {
  production_line: 'bant',
  line_capability: 'yetenek kaydı',
  monthly_production: 'üretim kaydı',
  monthly_expense: 'gider kaydı',
  quality_record: 'kalite kaydı',
  downtime_record: 'duruş kaydı',
  work_order: 'iş emri',
  operator: 'operatör',
  supplier_score: 'skor kaydı',
  workshop_account: 'cari hesap',
  workshop_contact: 'ilgili kişi',
  model_library: 'model',
  kaizen_action: 'kaizen',
}

/** Atölyeye bağlı, sıfırdan fazla satırı olan tablolar. */
export async function bagimliliklariSay(
  sql: postgres.TransactionSql,
  workshopId: number
): Promise<Engel[]> {
  /* Bağlı (tablo, kolon) çiftleri — adlar pg_catalog'dan geldiği için
     quote_ident ile birlikte doğrudan sorguya gömülebilir. */
  const fkler = await sql`
    SELECT c.conrelid::regclass::text AS tablo,
           quote_ident(att.attname) AS kolon
    FROM pg_constraint c
    JOIN LATERAL unnest(c.conkey) AS k(attnum) ON TRUE
    JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = k.attnum
    WHERE c.contype = 'f' AND c.confrelid = 'workshop'::regclass
    ORDER BY 1` as unknown as Array<{ tablo: string; kolon: string }>

  if (fkler.length === 0) return []

  /* Tek turda say: 24 ayrı sorgu eu-west-1'e 24 gidiş-dönüş demekti. */
  const parcalar = fkler.map(
    (f) => `SELECT '${f.tablo}' AS tablo, count(*)::int AS adet FROM ${f.tablo} WHERE ${f.kolon} = $1`
  )
  const satirlar = (await sql.unsafe(
    parcalar.join(' UNION ALL '),
    [workshopId]
  )) as unknown as Array<{ tablo: string; adet: number }>

  return satirlar
    .filter((s) => s.adet > 0)
    .map((s) => ({ tablo: s.tablo, etiket: ETIKETLER[s.tablo] ?? s.tablo, adet: s.adet }))
}

export type SilmeSonucu = { bulundu: boolean; silindi: boolean; engeller: Engel[] }

/**
 * Atölyeyi siler — yalnız hiçbir bağlı kaydı yoksa.
 *
 * KİLİT: FOR UPDATE atölye satırını kilitler. Bir alt tabloya kayıt eklemek
 * yabancı anahtar kontrolü için üst satırda FOR KEY SHARE alır ve bu FOR UPDATE
 * ile çakışır; böylece sayım ile silme arasında kimse bu atölyeye kayıt giremez.
 * Dokuz kişi ortak alanda çalışıyor, bu teorik bir senaryo değil.
 *
 * Çağıran transaction içinde olmalıdır (withTenantRoute zaten açıyor).
 */
export async function atolyeSil(
  sql: postgres.TransactionSql,
  workshopId: number
): Promise<SilmeSonucu> {
  const [row] = await sql`SELECT id FROM workshop WHERE id = ${workshopId} FOR UPDATE`
  if (!row) return { bulundu: false, silindi: false, engeller: [] }

  const engeller = await bagimliliklariSay(sql, workshopId)
  if (engeller.length > 0) return { bulundu: true, silindi: false, engeller }

  await sql`DELETE FROM workshop WHERE id = ${workshopId}`
  return { bulundu: true, silindi: true, engeller: [] }
}

/** "3 bant, 12 yetenek kaydı" — kullanıcıya gösterilecek özet. */
export function engelleriYaz(engeller: Engel[]): string {
  return engeller.map((e) => `${e.adet} ${e.etiket}`).join(', ')
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `npx vitest run lib/pes/workshop-baglantilar.test.ts`
Expected: PASS — 4 test

- [ ] **Step 5: Commit**

```bash
git add lib/pes/workshop-baglantilar.ts lib/pes/workshop-baglantilar.test.ts
git commit -m "Atölye silme kararı: bağlı kayıt sayımı ve kilitli silme"
```

---

### Task 2: API — PATCH'e arşivleme, yeni DELETE

**Files:**
- Modify: `app/api/pes/workshops/[id]/route.ts`

- [ ] **Step 1: `is_active` alanını PATCH'e ekle**

`app/api/pes/workshops/[id]/route.ts` içinde `UPDATE workshop SET` listesinin
sonuna, `bolge` satırından sonra virgülle ekle:

```ts
      bolge = COALESCE(${body.bolge ?? null}, bolge),
      is_active = COALESCE(${body.is_active ?? null}, is_active)
```

Boolean için de doğru çalışır: `false` gönderildiğinde `??` onu korur,
alan hiç gönderilmediğinde `null` gider ve `COALESCE` mevcut değeri bırakır.

- [ ] **Step 2: DELETE'i ekle**

Aynı dosyanın sonuna:

```ts
export const DELETE = withTenantRoute<{ id: string }>(async (_req, { sql, params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Geçersiz atölye' }, { status: 400 })
  }

  const sonuc = await atolyeSil(sql, id)

  if (!sonuc.bulundu) {
    return NextResponse.json({ error: 'Bu atölye artık yok' }, { status: 404 })
  }
  if (!sonuc.silindi) {
    return NextResponse.json(
      {
        error: `Silinemez — ${engelleriYaz(sonuc.engeller)} bağlı. Bunun yerine arşivleyebilirsin.`,
        engeller: sonuc.engeller,
      },
      { status: 409 }
    )
  }
  return NextResponse.json({ ok: true })
})
```

Dosyanın başındaki import satırlarına ekle:

```ts
import { atolyeSil, engelleriYaz } from '@/lib/pes/workshop-baglantilar'
```

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: hata yok

- [ ] **Step 4: Commit**

```bash
git add app/api/pes/workshops/\[id\]/route.ts
git commit -m "Atölye API: PATCH ile arşivleme, DELETE ile kalıcı silme"
```

---

### Task 3: Liste sayfası — arşiv filtresi ve arşivle butonu

**Files:**
- Create: `components/pes/AtolyeArsivDugmesi.tsx`
- Modify: `app/pes/workshops/page.tsx`

- [ ] **Step 1: Buton bileşenini yaz**

`components/pes/AtolyeArsivDugmesi.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/* Liste satırındaki Arşivle / Geri al.
   Onay sormaz: işlem geri alınabilir, onay penceresi yalnız gürültü yapar. */
export default function AtolyeArsivDugmesi({ id, aktif }: { id: number; aktif: boolean }) {
  const [bekliyor, setBekliyor] = useState(false)
  const [hata, setHata] = useState('')
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function degistir() {
    setHata('')
    setBekliyor(true)
    try {
      const r = await fetch(`/api/pes/workshops/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !aktif }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setHata(d.error ?? 'İşlem başarısız')
      } else {
        startTransition(() => router.refresh())
      }
    } catch {
      setHata('Bağlantı hatası')
    } finally {
      setBekliyor(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={degistir}
        disabled={bekliyor}
        className="text-xs font-medium px-3 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
      >
        {bekliyor ? '…' : aktif ? 'Arşivle' : 'Geri al'}
      </button>
      {hata && <span className="text-[11px] text-red-600">{hata}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Liste sayfasını güncelle**

`app/pes/workshops/page.tsx` — dört değişiklik.

(a) En üste import ekle:

```tsx
import AtolyeArsivDugmesi from '@/components/pes/AtolyeArsivDugmesi'
```

(b) Fonksiyon imzasını ve sorguyu değiştir. `export default async function WorkshopsPage() {`
satırından `list = data` satırına kadar olan bloğu şununla değiştir:

```tsx
export default async function WorkshopsPage({
  searchParams,
}: {
  searchParams: Promise<{ arsiv?: string }>
}) {
  const { arsiv } = await searchParams
  const arsivGoster = arsiv === '1'

  // Not: list/dbError eskiden modül seviyesindeydi. Sunucu süreci uzun
  // yaşadığı için eşzamanlı istekler arasında paylaşılıyor ve bir
  // kullanıcının satırları başkasına görünebiliyordu; dbError bir kez
  // set olunca kalıcı takılıyordu. Artık istek-yerel.
  let list: Record<string, unknown>[] = []
  let dbError = ''
  let aktifSayi = 0
  let arsivSayi = 0

  // getDB() doğrudan kullanımı tenant context'ini atlıyordu (set_config yok).
  // 019c sonrası bu sayfa 0 satır görürdü; withServerTenant doğru yol.
  const data = await withServerTenant(async (sql) => {
    /* kullanici_eposta(): auth şemasına doğrudan erişilemiyor (pes_app rolü),
       SECURITY DEFINER köprü — migration 026. */
    const [satirlar, sayimlar] = await Promise.all([
      sql`
        SELECT w.*, kullanici_eposta(w.owner_user_id) AS owner_email
        FROM workshop w
        WHERE ${arsivGoster ? sql`TRUE` : sql`w.is_active`}
        ORDER BY w.code`,
      sql`
        SELECT count(*) FILTER (WHERE is_active)::int AS aktif,
               count(*) FILTER (WHERE NOT is_active)::int AS arsiv
        FROM workshop`,
    ])
    return { satirlar: satirlar as Record<string, unknown>[], sayimlar: sayimlar[0] }
  }).catch((err: unknown) => {
    dbError = err instanceof Error ? err.message : 'DB bağlantı hatası'
    return { satirlar: [] as Record<string, unknown>[], sayimlar: { aktif: 0, arsiv: 0 } }
  })

  if (data === null) redirect('/login')
  list = data.satirlar
  aktifSayi = Number(data.sayimlar?.aktif ?? 0)
  arsivSayi = Number(data.sayimlar?.arsiv ?? 0)
```

(c) Başlık altındaki `<p>` ve buton grubunu değiştir. Mevcut:

```tsx
          <p className="text-gray-500 mt-1">{dbError ? 'Bağlantı hatası' : `${list.length} atölye kayıtlı`}</p>
```

yerine:

```tsx
          <p className="text-gray-500 mt-1">
            {dbError
              ? 'Bağlantı hatası'
              : arsivSayi > 0
                ? `${aktifSayi} aktif · ${arsivSayi} arşivde`
                : `${aktifSayi} atölye kayıtlı`}
          </p>
```

`CSV Import` bağlantısının hemen öncesine arşiv anahtarını ekle:

```tsx
          <Link
            href={arsivGoster ? '/pes/workshops' : '/pes/workshops?arsiv=1'}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            {arsivGoster ? 'Arşivi gizle' : 'Arşivi göster'}
          </Link>
```

(d) Tabloya işlem sütunu ekle. `<thead>` içindeki son `<th>`den sonra:

```tsx
                <th className="px-5 py-3 text-right text-gray-500 font-medium">İşlem</th>
```

`<tbody>` içinde `<tr>` etiketini şununla değiştir (arşivlenmiş satır soluk):

```tsx
                <tr
                  key={w.id as number}
                  className={`hover:bg-gray-50 transition-colors ${w.is_active ? '' : 'opacity-50'}`}
                >
```

ve Durum hücresinden sonra, `</tr>` öncesine:

```tsx
                  <td className="px-5 py-3">
                    <AtolyeArsivDugmesi id={w.id as number} aktif={!!w.is_active} />
                  </td>
```

- [ ] **Step 3: Tip kontrolü ve derleme**

Run: `npx tsc --noEmit && npm run build`
Expected: hata yok, build tamamlanır

- [ ] **Step 4: Yerelde gözle doğrula**

Run: `npm run dev`, tarayıcıda `http://localhost:3000/pes/workshops`
Expected: 114 aktif atölye listelenir, sağda "Arşivle" butonu ve üstte
"Arşivi göster" bağlantısı görünür.

- [ ] **Step 5: Commit**

```bash
git add components/pes/AtolyeArsivDugmesi.tsx app/pes/workshops/page.tsx
git commit -m "Atölye listesi: arşiv filtresi, sayaçlar ve arşivle butonu"
```

---

### Task 4: Detay sayfası — tehlikeli işlemler

**Files:**
- Create: `components/pes/AtolyeTehlikeliIslemler.tsx`
- Modify: `app/pes/workshops/[id]/page.tsx`

- [ ] **Step 1: Bileşeni yaz**

`components/pes/AtolyeTehlikeliIslemler.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/* Arşivleme ve kalıcı silme.
 *
 * Kalıcı silme yalnız burada; listede yok. 114 satırlık tabloda yanlış satıra
 * tıklama riski, geri dönüşü olmayan bir işlem için kabul edilemez.
 *
 * Kod yazdırma gibi ek onay yok: sunucu zaten yalnız hiçbir bağlı kaydı
 * olmayan atölyeyi siliyor, kaybedilecek veri tanım gereği sıfır. */
export default function AtolyeTehlikeliIslemler({
  id,
  kod,
  aktif,
}: {
  id: number
  kod: string
  aktif: boolean
}) {
  const [bekliyor, setBekliyor] = useState(false)
  const [hata, setHata] = useState('')
  const [onayIstendi, setOnayIstendi] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function arsivDegistir() {
    setHata('')
    setBekliyor(true)
    try {
      const r = await fetch(`/api/pes/workshops/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !aktif }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setHata(d.error ?? 'İşlem başarısız')
      } else {
        startTransition(() => router.refresh())
      }
    } catch {
      setHata('Bağlantı hatası')
    } finally {
      setBekliyor(false)
    }
  }

  async function sil() {
    setHata('')
    setBekliyor(true)
    try {
      const r = await fetch(`/api/pes/workshops/${id}`, { method: 'DELETE' })
      if (r.ok) {
        router.push('/pes/workshops')
        return
      }
      const d = await r.json().catch(() => ({}))
      setHata(d.error ?? 'Silme başarısız')
      setOnayIstendi(false)
    } catch {
      setHata('Bağlantı hatası')
      setOnayIstendi(false)
    } finally {
      setBekliyor(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Atölye durumu</h2>
        <p className="text-xs text-gray-500 mt-1">
          Arşivlenen atölye listelerden, dashboard sayacından ve atölye
          seçicilerden düşer. Verisi silinmez, istediğin zaman geri alırsın.
        </p>
      </div>

      {hata && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
          {hata}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={arsivDegistir}
          disabled={bekliyor}
          className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {bekliyor ? '…' : aktif ? 'Arşivle' : 'Geri al'}
        </button>

        {!onayIstendi ? (
          <button
            onClick={() => { setHata(''); setOnayIstendi(true) }}
            disabled={bekliyor}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            Kalıcı Sil
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-700">
              {kod} kalıcı olarak silinecek. Emin misin?
            </span>
            <button
              onClick={sil}
              disabled={bekliyor}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40"
            >
              {bekliyor ? '…' : 'Evet, sil'}
            </button>
            <button
              onClick={() => setOnayIstendi(false)}
              disabled={bekliyor}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              Vazgeç
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Detay sayfasına tak**

`app/pes/workshops/[id]/page.tsx` — import ekle:

```tsx
import AtolyeTehlikeliIslemler from '@/components/pes/AtolyeTehlikeliIslemler'
```

ve `<details className="group">` bloğunun **hemen sonrasına**, kapanış
`</div>`'inden önce:

```tsx
      <AtolyeTehlikeliIslemler id={w.id} kod={w.code} aktif={!!w.is_active} />
```

- [ ] **Step 3: Tip kontrolü ve derleme**

Run: `npx tsc --noEmit && npm run build`
Expected: hata yok

- [ ] **Step 4: Commit**

```bash
git add components/pes/AtolyeTehlikeliIslemler.tsx app/pes/workshops/\[id\]/page.tsx
git commit -m "Atölye detayı: arşivleme ve kalıcı silme bölümü"
```

---

### Task 5: Uçtan uca doğrulama ve yayın

**Files:** yok (doğrulama)

- [ ] **Step 1: Tüm testleri çalıştır**

Run: `npm test`
Expected: `lib/pes/workshop-baglantilar.test.ts` 4 test geçer, mevcut vsim
testleri bozulmaz.

- [ ] **Step 2: Yerelde arayüz turu**

`npm run dev` çalışırken sırayla:

1. `/pes/workshops` → yeni bir atölye ekle (`/pes/workshops/new`, kod `TEST-1`)
2. Listede `TEST-1` satırında **Arşivle** → satır listeden düşer, başlık
   "113 aktif · 1 arşivde" olur
3. **Arşivi göster** → `TEST-1` soluk satır olarak görünür, butonu **Geri al**
4. **Geri al** → satır normale döner
5. `TEST-1` detayına gir → **Kalıcı Sil** → **Evet, sil** → listeye döner,
   `TEST-1` yok
6. Mevcut bir atölyenin (örn. `B001`) detayına gir → **Kalıcı Sil** →
   **Evet, sil** → "Silinemez — … bağlı" mesajı çıkar, atölye durur

Expected: altı adım da tarif edildiği gibi.

- [ ] **Step 3: Dashboard tutarlılığı**

`/pes` sayfasını aç. "Aktif Atölye" sayacı, `/pes/workshops` başlığındaki
aktif sayısıyla aynı olmalı.

- [ ] **Step 4: Yayına al**

```bash
vercel deploy --prod --scope promode --yes
```

Expected: `readyState: READY`

- [ ] **Step 5: Production'da doğrula**

`https://pes-platform-tan.vercel.app/pes/workshops` üzerinde Step 2'deki
1–6 adımlarını tekrarla.

- [ ] **Step 6: Commit ve birleştir**

```bash
git add -A
git commit -m "Atölye arşivleme ve silme: uçtan uca doğrulandı"
```
