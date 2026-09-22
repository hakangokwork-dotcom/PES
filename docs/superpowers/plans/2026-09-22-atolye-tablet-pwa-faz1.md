# Atölye Tablet PWA — Faz 1 Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/workshop` panelini iPad ve Android tabletlerde ana ekrana kurulabilir, çekmece menülü, 44 px dokunma hedefli bir uygulamaya çevirmek (tasarım §3: PWA kabuğu ve tablet temeli).

**Architecture:** Mevcut rotalar ve iş mantığı değişmez. Üç yeni katman eklenir: (1) `app/manifest.ts` + ikonlar + `public/sw.js` ile kurulabilir kabuk; (2) `WorkshopKabuk` istemci bileşeni — 1024 px altında off-canvas çekmece ve 56 px üst bar, üstünde bugünkü sabit sütun; (3) `globals.css`'te `pointer: coarse` medya kuralı ve `Input`'ta otomatik `inputMode` ile dokunma boyutları. Masaüstü davranışı aynı kalır.

**Tech Stack:** Next 16.2 (App Router, Turbopack), React 19, Tailwind 4, Supabase SSR auth, vitest 4 (+ jsdom, @testing-library/react — bu planla ekleniyor), playwright-core (sistem Chrome ile).

**Spec:** `docs/superpowers/specs/2026-09-22-atolye-tablet-pwa-design.md` §3. Bir sapma: çevrimdışı sayfa `/workshop/cevrimdisi` yerine `/cevrimdisi` (Task 3 açıklıyor, spec güncelleniyor).

**Çalışma kuralları:**
- Depo Windows'ta; komutlar Git Bash için yazıldı. Yollar `/c/Users/bhaka/Desktop/WORK/PES` altından.
- Testlerin bir kısmı gerçek Supabase'e bağlanır; tek dosya çalıştırmak için `npx vitest run <dosya>`.
- Commit mesajları Türkçe, sonunda `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `components/vsim/**` üretilmiş koddur, dokunma.

---

## Dosya haritası

| Dosya | Sorumluluk | Durum |
|---|---|---|
| `app/manifest.ts` | Web app manifest (ad, start_url, ikonlar, renkler) | yeni |
| `app/manifest.test.ts` | Manifest alanlarının sözleşmesi | yeni |
| `app/layout.tsx` | `viewport` export'u, Apple standalone meta, apple-touch-icon | değişir |
| `public/icons/pes.svg` | Kaynak ikon | yeni |
| `scripts/ikon_uret.mjs` | SVG'den PNG ikonlar (Chrome ekran görüntüsü ile) | yeni |
| `public/icons/*.png` | 192, 512, maskable 512, apple-touch 180 | üretilir |
| `app/cevrimdisi/page.tsx` | Statik "bağlantı yok" sayfası | yeni |
| `public/sw.js` | Service worker: kabuk precache, gezinme network-first, statik cache-first | yeni |
| `lib/pwa/sw.test.ts` | sw.js'i sahte `self/caches/fetch` ile çalıştıran testler | yeni |
| `next.config.ts` | `NEXT_PUBLIC_SW_SURUM` build damgası | değişir |
| `components/pes/SwKayit.tsx` | SW kaydı + "Yeni sürüm" şeridi | yeni |
| `components/pes/WorkshopKabuk.tsx` | Çekmece + üst bar + ana alan; masaüstünde sabit sütun | yeni |
| `components/pes/WorkshopKabuk.test.tsx` | Aç/kapat/ESC/rota değişimi testleri | yeni |
| `components/pes/WorkshopSidebar.tsx` | Kök `aside` yükseklik sınıfı (çekmecede `h-full`) | değişir |
| `app/workshop/layout.tsx` | `WorkshopKabuk` kullanır, `SwKayit` bağlar | değişir |
| `app/globals.css` | `pointer: coarse` dokunma kuralları, yapışkan tablo başlığı | değişir |
| `components/ui/Field.tsx` | `Input`: `type="number"` → otomatik `inputMode` | değişir |
| `components/ui/Field.test.tsx` | inputMode sözleşmesi | yeni |
| `components/ui/TabloSarmal.tsx` | Yatay kaydırma + yapışkan başlık sarmalayıcı | yeni |
| `components/ui/index.ts` | `TabloSarmal` export'u | değişir |
| `app/workshop/**/page.tsx`, 5 bileşen | Ham `type="number"` → `inputMode`; şartsız `grid-cols-N` → kademeli | değişir |
| `scripts/tablet_kontrol.mjs` | Chrome ile 820×1180 / 1024×768 çekmece ve kurulum kontrolü | yeni |
| `package.json` | devDeps: jsdom, @testing-library/react, @testing-library/dom | değişir |

---

### Task 0: DOM test altyapısı

**Files:**
- Modify: `package.json` (devDependencies)

- [ ] **Step 1: Paketleri kur**

```bash
cd /c/Users/bhaka/Desktop/WORK/PES && npm i -D jsdom@30 @testing-library/react@16 @testing-library/dom@10
```
Expected: `added N packages`, hata yok.

- [ ] **Step 2: jsdom ortamının çalıştığını kanıtla**

`components/ui/_ortam.test.tsx` adında geçici dosya:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('jsdom ortamı', () => {
  it('bileşen render eder', () => {
    render(<p>merhaba</p>)
    expect(screen.getByText('merhaba')).toBeTruthy()
  })
})
```
Run: `npx vitest run components/ui/_ortam.test.tsx`
Expected: `1 passed`.

- [ ] **Step 3: Geçici dosyayı sil, commit**

```bash
rm components/ui/_ortam.test.tsx
git add package.json package-lock.json
git commit -m "test(tablet): jsdom ve testing-library eklendi — bileşen testleri için

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: Manifest ve viewport meta

**Files:**
- Create: `app/manifest.ts`
- Create: `app/manifest.test.ts`
- Modify: `app/layout.tsx:36-39` (metadata) ve import satırı

- [ ] **Step 1: Başarısız testi yaz**

`app/manifest.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import manifest from './manifest'

/* Tasarım §3.1: kurulan uygulama doğrudan atölye panelinde açılır,
   tam ekran çalışır, PES yeşilini taşır. */
describe('manifest', () => {
  const m = manifest()

  it('atölye panelinde açılır ve tam ekrandır', () => {
    expect(m.start_url).toBe('/workshop')
    expect(m.display).toBe('standalone')
    expect(m.name).toBe('PES Atölye')
    expect(m.short_name).toBe('PES')
  })

  it('tema rengi mevcut vurgu yeşilidir', () => {
    expect(m.theme_color).toBe('#197A56')
    expect(m.background_color).toBe('#F6F8F9')
  })

  it('192, 512 ve maskable ikon taşır', () => {
    const boyutlar = (m.icons ?? []).map(i => `${i.sizes}:${i.purpose ?? 'any'}`)
    expect(boyutlar).toContain('192x192:any')
    expect(boyutlar).toContain('512x512:any')
    expect(boyutlar).toContain('512x512:maskable')
  })
})
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx vitest run app/manifest.test.ts`
Expected: FAIL — `Cannot find module './manifest'`.

- [ ] **Step 3: Manifesti yaz**

`app/manifest.ts`:
```ts
import type { MetadataRoute } from 'next'

/* PWA manifesti — tasarım 2026-09-22 §3.1. Next bunu /manifest.webmanifest
   olarak sunar ve <link rel="manifest"> etiketini kendisi ekler.
   start_url /workshop: atölye tableti kurunca doğrudan kendi paneline düşer;
   oturum yoksa layout /login'e yönlendirir. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PES Atölye',
    short_name: 'PES',
    description: 'Atölye veri girişi ve performans — Production Efficiency System',
    lang: 'tr',
    start_url: '/workshop',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#197A56',
    background_color: '#F6F8F9',
    icons: [
      { src: '/icons/pes-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/pes-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/pes-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx vitest run app/manifest.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: layout.tsx'e viewport ve Apple meta ekle**

`app/layout.tsx` — import satırını ve `metadata` bloğunu değiştir:
```ts
import type { Metadata, Viewport } from "next"
```
```ts
export const metadata: Metadata = {
  title: "PES — Atölye Verimlilik Sistemi",
  description: "Production Efficiency System — 200 fason atölye verimlilik değerlendirme ve tedarikçi skorlama sistemi",
  applicationName: "PES Atölye",
  /* iOS "Ana Ekrana Ekle": tam ekran, durum çubuğu varsayılan, ikon 180 px.
     Android bunu manifest'ten okur (app/manifest.ts). */
  appleWebApp: { capable: true, statusBarStyle: "default", title: "PES Atölye" },
  icons: { apple: "/icons/apple-touch-icon.png" },
}

/* viewport-fit=cover: çentikli tabletlerde üst bar güvenli alana kadar uzar
   (WorkshopKabuk env(safe-area-inset-top) kullanır). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#197A56",
}
```

- [ ] **Step 6: Tip kontrolü**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/(layout|manifest)" ; echo "exit:$?"`
Expected: eşleşme yok (`exit:1` grep için normaldir).

- [ ] **Step 7: Commit**

```bash
git add app/manifest.ts app/manifest.test.ts app/layout.tsx
git commit -m "feat(tablet): PWA manifesti, viewport ve Apple standalone meta

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: İkonlar

**Files:**
- Create: `public/icons/pes.svg`
- Create: `scripts/ikon_uret.mjs`
- Create (üretilir): `public/icons/pes-192.png`, `pes-512.png`, `pes-maskable-512.png`, `apple-touch-icon.png`

- [ ] **Step 1: Kaynak SVG**

`public/icons/pes.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#197A56"/>
  <text x="256" y="304" font-family="Arial, Helvetica, sans-serif" font-size="168" font-weight="700" fill="#FFFFFF" text-anchor="middle" letter-spacing="10">PES</text>
</svg>
```

- [ ] **Step 2: Üretici betik**

`scripts/ikon_uret.mjs`:
```js
/* SVG ikondan PNG'ler üretir. Depoda görüntü kütüphanesi yok; playwright-core
   sistem Chrome'uyla SVG'yi çizip ekran görüntüsü alır.
   Çalıştır: node scripts/ikon_uret.mjs  (Chrome kurulu olmalı)

   maskable: Android ikonu daire/kare maskeyle keser; köşe yuvarlatma yok,
   yazı %80 güvenli alanda kalsın diye küçük.
   apple-touch-icon: iOS köşeyi kendi yuvarlar; kare veriyoruz. */
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('public/icons/pes.svg', 'utf8')
const kare = svg.replace('rx="96"', 'rx="0"')
const maskable = kare.replace('font-size="168"', 'font-size="136"')

const hedefler = [
  ['pes-192.png', 192, svg],
  ['pes-512.png', 512, svg],
  ['pes-maskable-512.png', 512, maskable],
  ['apple-touch-icon.png', 180, kare],
]

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
for (const [ad, boyut, kaynak] of hedefler) {
  await page.setViewportSize({ width: boyut, height: boyut })
  const body = kaynak.replace('<svg ', `<svg width="${boyut}" height="${boyut}" `)
  await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`)
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: boyut, height: boyut } })
  writeFileSync(`public/icons/${ad}`, png)
  console.log('yazıldı', ad, png.length, 'bayt')
}
await browser.close()
```

- [ ] **Step 3: Üret ve doğrula**

Run: `node scripts/ikon_uret.mjs && ls -la public/icons`
Expected: dört `yazıldı …` satırı; `ls` beş dosya gösterir, PNG'ler > 1 KB.

Run: `node -e "const b=require('fs').readFileSync('public/icons/pes-512.png');console.log(b.readUInt32BE(16),b.readUInt32BE(20))"`
Expected: `512 512` (PNG başlığındaki genişlik/yükseklik).

- [ ] **Step 4: Commit**

```bash
git add public/icons scripts/ikon_uret.mjs
git commit -m "feat(tablet): uygulama ikonları (192/512/maskable/apple) ve üretici betik

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Çevrimdışı sayfası

**Files:**
- Create: `app/cevrimdisi/page.tsx`
- Modify: `docs/superpowers/specs/2026-09-22-atolye-tablet-pwa-design.md` (yol düzeltmesi)

Neden `/cevrimdisi`, `/workshop/cevrimdisi` değil: `/workshop/*` layout'u sunucuda oturum ve atölye sorgusu yapar. Service worker bu sayfayı önbelleğe alırken tam sunucu render'ını (kenar çubuğu dahil) saklardı ve oturum düşünce içerik yanlış olurdu. Layout dışı statik sayfa güvenli ve küçüktür.

- [ ] **Step 1: Sayfayı yaz**

`app/cevrimdisi/page.tsx`:
```tsx
import { WifiOff } from 'lucide-react'

/* Service worker gezinme isteği ağa ulaşamayınca bunu gösterir (public/sw.js).
   Statik ve oturumsuz: /workshop layout'u dışında durur ki önbellekteki kopya
   kimseye ait bilgi taşımasın. */
export const dynamic = 'force-static'

export default function CevrimdisiSayfasi() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent-ink">
        <WifiOff className="size-7" strokeWidth={1.8} />
      </span>
      <h1 className="text-lg font-semibold text-ink">Bağlantı yok</h1>
      <p className="max-w-[320px] text-sm text-muted">
        Sayfa açılamadı. Wi-Fi bağlanınca aşağıdaki düğmeyle devam edin.
        Girdiğiniz kayıtlar bu ekrana düşmez; formda kalır.
      </p>
      <a
        href="/workshop"
        className="inline-flex h-11 items-center rounded-md bg-accent px-[18px] text-sm font-medium text-white"
      >
        Yeniden dene
      </a>
    </main>
  )
}
```

- [ ] **Step 2: Spec'teki yolu düzelt**

```bash
sed -i 's|/workshop/cevrimdisi|/cevrimdisi|g' docs/superpowers/specs/2026-09-22-atolye-tablet-pwa-design.md
grep -c "/cevrimdisi" docs/superpowers/specs/2026-09-22-atolye-tablet-pwa-design.md
```
Expected: `2`.

- [ ] **Step 3: Sayfayı tarayıcıda gör**

Dev sunucu açık değilse: `npx next dev -p 3011` (ayrı terminal). Sonra:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3011/cevrimdisi
```
Expected: `200`.

- [ ] **Step 4: Commit**

```bash
git add app/cevrimdisi/page.tsx docs/superpowers/specs/2026-09-22-atolye-tablet-pwa-design.md
git commit -m "feat(tablet): statik /cevrimdisi sayfası — SW gezinme yedeği

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Service worker

**Files:**
- Create: `public/sw.js`
- Create: `lib/pwa/sw.test.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Başarısız testi yaz**

`lib/pwa/sw.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeEach } from 'vitest'

/* public/sw.js klasik bir worker'dır (modül değil). Dosya metnini sahte
   self / caches / fetch ile Function içinde çalıştırır, kaydettiği
   dinleyicileri elle tetikleriz. Gerçek tarayıcı testi Task 10'da. */

type Dinleyici = (e: unknown) => void
type SahteYanit = { body: string; ok: boolean }

function sahteCaches() {
  const depolar = new Map<string, Map<string, SahteYanit>>()
  const anahtar = (r: { url: string } | string) =>
    typeof r === 'string' ? r : new URL(r.url).pathname
  const open = async (ad: string) => {
    if (!depolar.has(ad)) depolar.set(ad, new Map())
    const d = depolar.get(ad)!
    return {
      addAll: async (yollar: string[]) => { for (const y of yollar) d.set(y, { body: 'önbellek:' + y, ok: true }) },
      match: async (r: { url: string } | string) => d.get(anahtar(r)),
      put: async (r: { url: string }, res: SahteYanit) => { d.set(anahtar(r), res) },
    }
  }
  const match = async (y: string) => {
    for (const d of depolar.values()) { const r = d.get(y); if (r) return r }
    return undefined
  }
  return {
    depolar,
    caches: {
      open, match,
      keys: async () => [...depolar.keys()],
      delete: async (ad: string) => depolar.delete(ad),
    },
  }
}

function swYukle(agVar: boolean) {
  const kod = readFileSync('public/sw.js', 'utf8')
  const dinleyiciler: Record<string, Dinleyici> = {}
  const { caches, depolar } = sahteCaches()
  const fetchCagrilari: string[] = []
  const fetch = async (r: { url: string }) => {
    fetchCagrilari.push(r.url)
    if (!agVar) throw new TypeError('Failed to fetch')
    const res: SahteYanit & { clone: () => SahteYanit } = { body: 'ağ:' + new URL(r.url).pathname, ok: true, clone() { return { body: this.body, ok: true } } }
    return res
  }
  const self = {
    location: { href: 'https://pes.test/sw.js?v=v9-test', origin: 'https://pes.test' },
    addEventListener: (ad: string, fn: Dinleyici) => { dinleyiciler[ad] = fn },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  }
  new Function('self', 'caches', 'fetch', kod)(self, caches, fetch)
  return { dinleyiciler, caches, depolar, fetchCagrilari }
}

async function kur(sw: ReturnType<typeof swYukle>) {
  let bekle: Promise<unknown> = Promise.resolve()
  sw.dinleyiciler.install({ waitUntil: (p: Promise<unknown>) => { bekle = p } })
  await bekle
}

function istek(url: string, ek: Partial<{ method: string; mode: string }> = {}) {
  return { url, method: 'GET', mode: 'cors', ...ek }
}

async function fetchTetikle(sw: ReturnType<typeof swYukle>, req: ReturnType<typeof istek>) {
  let yanit: Promise<SahteYanit> | null = null
  sw.dinleyiciler.fetch({ request: req, respondWith: (p: Promise<SahteYanit>) => { yanit = p } })
  return yanit ? await yanit : null
}

describe('public/sw.js', () => {
  let sw: ReturnType<typeof swYukle>
  beforeEach(() => { sw = swYukle(true) })

  it('kurulumda kabuğu sürümlü önbelleğe alır', async () => {
    await kur(sw)
    expect([...sw.depolar.keys()]).toContain('pes-kabuk-v9-test')
    expect(await sw.caches.match('/cevrimdisi')).toBeTruthy()
  })

  it('gezinme ağ varken ağdan gelir', async () => {
    await kur(sw)
    const y = await fetchTetikle(sw, istek('https://pes.test/workshop', { mode: 'navigate' }))
    expect(y?.body).toBe('ağ:/workshop')
  })

  it('gezinme ağ yokken /cevrimdisi döner', async () => {
    sw = swYukle(true); await kur(sw)
    const kapali = swYukle(false); kapali.depolar.set('pes-kabuk-v9-test', sw.depolar.get('pes-kabuk-v9-test')!)
    const y = await fetchTetikle(kapali, istek('https://pes.test/workshop/quality', { mode: 'navigate' }))
    expect(y?.body).toBe('önbellek:/cevrimdisi')
  })

  it('/_next/static önce önbellekten, ilk seferde ağdan alıp saklar', async () => {
    await kur(sw)
    const url = 'https://pes.test/_next/static/chunks/a.js'
    const ilk = await fetchTetikle(sw, istek(url))
    expect(ilk?.body).toBe('ağ:/_next/static/chunks/a.js')
    const ikinci = await fetchTetikle(sw, istek(url))
    expect(ikinci?.body).toBe('ağ:/_next/static/chunks/a.js')
    expect(sw.fetchCagrilari.filter(u => u === url)).toHaveLength(1)
  })

  it('/api isteklerine, POST\'a ve başka origin\'e karışmaz', async () => {
    await kur(sw)
    expect(await fetchTetikle(sw, istek('https://pes.test/api/pes/quality'))).toBeNull()
    expect(await fetchTetikle(sw, istek('https://pes.test/workshop', { method: 'POST', mode: 'navigate' }))).toBeNull()
    expect(await fetchTetikle(sw, istek('https://baska.test/_next/static/x.js'))).toBeNull()
  })

  it('etkinleşince eski sürüm önbelleklerini siler', async () => {
    await kur(sw)
    sw.depolar.set('pes-kabuk-eski', new Map())
    let bekle: Promise<unknown> = Promise.resolve()
    sw.dinleyiciler.activate({ waitUntil: (p: Promise<unknown>) => { bekle = p } })
    await bekle
    expect([...sw.depolar.keys()]).not.toContain('pes-kabuk-eski')
    expect([...sw.depolar.keys()]).toContain('pes-kabuk-v9-test')
  })
})
```

- [ ] **Step 2: Başarısız olduğunu gör**

Run: `npx vitest run lib/pwa/sw.test.ts`
Expected: FAIL — `ENOENT … public/sw.js`.

- [ ] **Step 3: Service worker'ı yaz**

`public/sw.js`:
```js
/* PES Atölye service worker — tasarım 2026-09-22 §3.2.
   Klasik worker; modül/paket yok (Next 16 Turbopack ile next-pwa/Serwist
   uyumsuz, kabuk ihtiyacı küçük).

   Sürüm: SwKayit bu dosyayı /sw.js?v=<build damgası> ile kaydeder. Damga
   değişince önbellek adı değişir, eski kabuk activate'te silinir.

   Ne yapar / yapmaz:
   - Gezinme (sayfa açma): ağ önce; ağ yoksa /cevrimdisi.
   - /_next/static/*: önbellek önce (içerik hash'li, güvenle saklanır).
   - /api/*: DOKUNMAZ. RLS'li veri cihazda kalmaz; çevrimdışı yazma kuyruğu
     Faz 2'de IndexedDB'de yaşar, burada değil.
   - GET dışı ve başka origin: dokunmaz. */

const SURUM = new URL(self.location.href).searchParams.get('v') || 'dev'
const KABUK = 'pes-kabuk-' + SURUM
const STATIK = 'pes-statik-' + SURUM
const CEVRIMDISI = '/cevrimdisi'
const KABUK_DOSYALARI = [CEVRIMDISI, '/manifest.webmanifest', '/icons/pes-192.png', '/icons/pes-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(KABUK)
      .then((c) => c.addAll(KABUK_DOSYALARI))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(
        adlar.filter((ad) => ad !== KABUK && ad !== STATIK).map((ad) => caches.delete(ad)),
      ))
      .then(() => self.clients.claim()),
  )
})

function strateji(url, mode) {
  if (url.pathname.startsWith('/_next/static/')) return 'statik'
  if (mode === 'navigate') return 'gezinme'
  return 'dokunma'
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  const s = strateji(url, req.mode)
  if (s === 'statik') e.respondWith(onbellekOnce(req))
  else if (s === 'gezinme') e.respondWith(fetch(req).catch(() => caches.match(CEVRIMDISI)))
})

async function onbellekOnce(req) {
  const c = await caches.open(STATIK)
  const varOlan = await c.match(req)
  if (varOlan) return varOlan
  const yanit = await fetch(req)
  if (yanit.ok) c.put(req, yanit.clone())
  return yanit
}
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx vitest run lib/pwa/sw.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Build damgası**

`next.config.ts`:
```ts
import type { NextConfig } from "next";
import { APP_VERSION } from "./lib/version";

/* NEXT_PUBLIC_SW_SURUM: her build'de değişen damga. SwKayit bunu
   /sw.js?v=… olarak kullanır; sw.js önbellek adını bundan türetir.
   Böylece deploy sonrası eski kabuk kendiliğinden geçersiz olur. */
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SW_SURUM: `${APP_VERSION}-${Date.now().toString(36)}`,
  },
};

export default nextConfig;
```

- [ ] **Step 6: Dev sunucu damgayı görüyor mu**

Dev sunucuyu yeniden başlat (`npx next dev -p 3011`), sonra:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3011/sw.js
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3011/manifest.webmanifest
```
Expected: iki satır `200`.

- [ ] **Step 7: Commit**

```bash
git add public/sw.js lib/pwa/sw.test.ts next.config.ts
git commit -m "feat(tablet): elle yazılmış service worker — kabuk precache, gezinme yedeği, sürüm damgası

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: SW kaydı ve "Yeni sürüm" şeridi

**Files:**
- Create: `components/pes/SwKayit.tsx`

Toast bileşeni düğme taşımıyor; yenileme kararı kullanıcıya bırakılmalı (form doldururken otomatik reload veri kaybettirir). Bu yüzden küçük bir alt şerit.

- [ ] **Step 1: Bileşeni yaz**

`components/pes/SwKayit.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

/* Service worker kaydı — yalnız /workshop layout'unda bağlanır; yönetim
   paneli (/pes) SW almaz. Sürüm damgası build'de üretilir (next.config.ts).

   Yeni sürüm akışı: sw.js skipWaiting + clients.claim yaptığı için yeni
   worker hemen denetimi alır (controllerchange). Sayfa hâlâ eski JS'i
   çalıştırır; kullanıcıya "Yenile" düğmesi gösteririz, otomatik reload
   YAPMAYIZ — yarım kalmış form kaybolmasın. */
export default function SwKayit() {
  const [yeniSurum, setYeniSurum] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    const surum = process.env.NEXT_PUBLIC_SW_SURUM ?? 'dev'
    let ilkDenetim = !!navigator.serviceWorker.controller

    const onDegisim = () => {
      /* İlk kurulumda controller null'dan dolu hale gelir; o "yeni sürüm" değildir. */
      if (ilkDenetim) setYeniSurum(true)
      ilkDenetim = true
    }
    navigator.serviceWorker.addEventListener('controllerchange', onDegisim)
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(surum)}`).catch((err) => {
      console.error('SW kaydı başarısız', err)
    })
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onDegisim)
  }, [])

  if (!yeniSurum) return null
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-[0_4px_14px_rgba(15,23,32,0.12)] md:inset-x-auto md:right-5"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span className="text-[13px] text-ink">Uygulamanın yeni sürümü hazır.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="ml-auto inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white"
      >
        <RefreshCw className="size-4" /> Yenile
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep SwKayit ; echo done`
Expected: yalnız `done`.

- [ ] **Step 3: Commit**

```bash
git add components/pes/SwKayit.tsx
git commit -m "feat(tablet): SW kaydı ve yeni sürüm şeridi (SwKayit)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Çekmece kabuğu (WorkshopKabuk)

**Files:**
- Create: `components/pes/WorkshopKabuk.tsx`
- Create: `components/pes/WorkshopKabuk.test.tsx`

Tek `kenar` örneği render edilir (ikinci kopya iki kez `/api/pes/workshops` çekerdi); 1024 px altında `fixed` + `translate-x` ile çekmece, üstünde `lg:static` sütun.

- [ ] **Step 1: Başarısız testi yaz**

`components/pes/WorkshopKabuk.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

let yol = '/workshop'
vi.mock('next/navigation', () => ({ usePathname: () => yol }))

import WorkshopKabuk from './WorkshopKabuk'

/* jsdom matchMedia bilmez. Testler tablet genişliğini (lg altı) taklit eder. */
function matchMediaKur(masaustu: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes('1024') ? masaustu : false,
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function ciz() {
  return render(
    <WorkshopKabuk baslik="B002 SAYAN" kenar={<nav><a href="/workshop/quality">Kalite</a></nav>}>
      <p>içerik</p>
    </WorkshopKabuk>,
  )
}

describe('WorkshopKabuk (tablet)', () => {
  beforeEach(() => { cleanup(); yol = '/workshop'; matchMediaKur(false) })

  it('kapalı başlar; menü düğmesi açar', () => {
    ciz()
    const cekmece = screen.getByRole('dialog', { hidden: true })
    expect(cekmece.getAttribute('data-acik')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    expect(cekmece.getAttribute('data-acik')).toBe('true')
    expect(cekmece.getAttribute('aria-modal')).toBe('true')
  })

  it('ESC kapatır', () => {
    ciz()
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog', { hidden: true }).getAttribute('data-acik')).toBe('false')
  })

  it('karartmaya dokunmak kapatır', () => {
    ciz()
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü kapat' }))
    expect(screen.getByRole('dialog', { hidden: true }).getAttribute('data-acik')).toBe('false')
  })

  it('rota değişince kapanır', () => {
    const { rerender } = ciz()
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    yol = '/workshop/quality'
    rerender(
      <WorkshopKabuk baslik="B002 SAYAN" kenar={<nav><a href="/workshop/quality">Kalite</a></nav>}>
        <p>içerik</p>
      </WorkshopKabuk>,
    )
    expect(screen.getByRole('dialog', { hidden: true }).getAttribute('data-acik')).toBe('false')
  })

  it('kapalıyken çekmece inert, açıkken değil', () => {
    ciz()
    const cekmece = screen.getByRole('dialog', { hidden: true })
    expect(cekmece.hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    expect(cekmece.hasAttribute('inert')).toBe(false)
  })

  it('üst bar başlığı ve içeriği gösterir', () => {
    ciz()
    expect(screen.getByText('B002 SAYAN')).toBeTruthy()
    expect(screen.getByText('içerik')).toBeTruthy()
  })
})

describe('WorkshopKabuk (masaüstü)', () => {
  beforeEach(() => { cleanup(); matchMediaKur(true) })

  it('masaüstünde kenar çubuğu inert değildir', () => {
    ciz()
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('inert')).toBe(false)
  })
})
```

- [ ] **Step 2: Başarısız olduğunu gör**

Run: `npx vitest run components/pes/WorkshopKabuk.test.tsx`
Expected: FAIL — `Cannot find module './WorkshopKabuk'`.

- [ ] **Step 3: Bileşeni yaz**

`components/pes/WorkshopKabuk.tsx`:
```tsx
'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'

/* Atölye paneli kabuğu — tasarım 2026-09-22 §3.3.

   lg (1024 px) ve üstü: kenar çubuğu bugünkü gibi sabit sütun, üst bar yok.
   Altı: 56 px üst bar (menü düğmesi + atölye adı + sağ yuva) ve soldan
   kayan çekmece. Kenar çubuğu TEK kez render edilir; konumu CSS belirler.

   Çekmece kapalıyken `inert`: ekran dışındaki bağlantılar sekmeyle
   gezilmesin. Masaüstünde inert asla uygulanmaz (useMasaustu). */

function useMasaustu() {
  /* SSR ve ilk boyamada true: masaüstü kullanıcı ilk karede inert görmesin. */
  const [masaustu, setMasaustu] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const guncelle = () => setMasaustu(mq.matches)
    guncelle()
    mq.addEventListener('change', guncelle)
    return () => mq.removeEventListener('change', guncelle)
  }, [])
  return masaustu
}

export default function WorkshopKabuk({
  kenar, baslik, sagUst, children,
}: {
  kenar: ReactNode
  baslik: string
  /** Üst barın sağ yuvası — Faz 2'de senkron çipi buraya gelir. */
  sagUst?: ReactNode
  children: ReactNode
}) {
  const [acik, setAcik] = useState(false)
  const pathname = usePathname()
  const masaustu = useMasaustu()
  const cekmeceRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setAcik(false) }, [pathname])

  useEffect(() => {
    if (!acik) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAcik(false); return }
      if (e.key !== 'Tab' || !cekmeceRef.current) return
      /* Odak çekmecede kalır: uçlarda sar. */
      const odaklanabilir = cekmeceRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
      )
      if (odaklanabilir.length === 0) return
      const ilk = odaklanabilir[0], son = odaklanabilir[odaklanabilir.length - 1]
      if (e.shiftKey && document.activeElement === ilk) { e.preventDefault(); son.focus() }
      else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus() }
    }
    document.addEventListener('keydown', onKey)
    const eskiOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cekmeceRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = eskiOverflow
    }
  }, [acik])

  const cekmeceInert = !masaustu && !acik

  return (
    <div className="min-h-screen flex bg-canvas">
      {acik && (
        <button
          type="button"
          aria-label="Menüyü kapat"
          onClick={() => setAcik(false)}
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
        />
      )}

      <div
        ref={cekmeceRef}
        role="dialog"
        aria-label="Gezinti"
        aria-modal={acik || undefined}
        data-acik={acik}
        inert={cekmeceInert}
        tabIndex={-1}
        className="fixed inset-y-0 left-0 z-50 flex max-w-[85vw] -translate-x-full outline-none transition-transform duration-200 data-[acik=true]:translate-x-0 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:transition-none"
      >
        {kenar}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line-soft bg-surface px-2 lg:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <button
            type="button"
            aria-label="Menüyü aç"
            aria-expanded={acik}
            onClick={() => setAcik(true)}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink hover:bg-canvas"
          >
            <Menu className="size-5" />
          </button>
          <span className="truncate text-sm font-semibold text-ink">{baslik}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2 pr-1">{sagUst}</span>
        </header>

        <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
```

Kapatma yolları: karartmaya dokunma, ESC, rota değişimi. Çekmece içinde ayrı X yok — kenar çubuğunun marka başlığıyla çakışırdı.

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx vitest run components/pes/WorkshopKabuk.test.tsx`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add components/pes/WorkshopKabuk.tsx components/pes/WorkshopKabuk.test.tsx
git commit -m "feat(tablet): WorkshopKabuk — 1024 px altında çekmece menü ve üst bar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Layout entegrasyonu

**Files:**
- Modify: `app/workshop/layout.tsx`
- Modify: `components/pes/WorkshopSidebar.tsx:130` (kök `aside` sınıfı)

- [ ] **Step 1: Kenar çubuğu yüksekliği**

`components/pes/WorkshopSidebar.tsx` içinde
```tsx
    <aside className="flex min-h-screen w-64 flex-col border-r border-line-soft bg-surface">
```
satırını şununla değiştir:
```tsx
    /* Çekmecede (fixed, inset-y-0) h-full; masaüstü sütununda min-h-screen. */
    <aside className="flex h-full w-64 flex-col border-r border-line-soft bg-surface lg:h-auto lg:min-h-screen">
```

- [ ] **Step 2: Layout'u kabuğa geçir**

`app/workshop/layout.tsx` — return bloğunu değiştir, import ekle:
```tsx
import WorkshopKabuk from '@/components/pes/WorkshopKabuk'
import SwKayit from '@/components/pes/SwKayit'
```
```tsx
  const baslik = sabitAtolye ? `${sabitAtolye.code} ${sabitAtolye.name}` : 'Atölye Paneli'

  return (
    <AktifAtolyeSaglayici sabitAtolyeId={sabitAtolye?.id ?? null}>
      <WorkshopKabuk
        baslik={baslik}
        kenar={<WorkshopSidebar eposta={eposta} tenantAdi={tenantAdi} sabitAtolye={sabitAtolye ?? null} />}
      >
        {/* SW yalnız atölye panelinde: /pes kabuk önbelleği almaz. */}
        <SwKayit />
        {children}
      </WorkshopKabuk>
    </AktifAtolyeSaglayici>
  )
```
Eski `<div className="min-h-screen flex bg-canvas">…</div>` bloğu tamamen kalkar.

- [ ] **Step 3: Tip ve lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "workshop/layout|WorkshopSidebar" ; npm run lint 2>&1 | tail -3`
Expected: tsc eşleşmesi yok; lint hatasız.

- [ ] **Step 4: Tarayıcıda gör**

Dev sunucu açıkken Chrome'da `http://localhost:3011/workshop` aç, giriş yap (hakan.gok@pes.local — şifre notta), pencereyi 900 px genişliğe daralt.
Expected: Sol sütun kaybolur, üstte menü düğmesi + başlık; düğme çekmeceyi açar; bir menü bağlantısına dokununca çekmece kapanır ve sayfa değişir. 1200 px'e genişlet: eski sabit sütun, üst bar yok. Konsolda "SW kaydı başarısız" YOK; Application ▸ Service Workers'ta `sw.js?v=v1.2.0-…` aktif.

- [ ] **Step 5: Commit**

```bash
git add app/workshop/layout.tsx components/pes/WorkshopSidebar.tsx
git commit -m "feat(tablet): atölye layout'u WorkshopKabuk'a geçti, SW kaydı bağlandı

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Dokunma boyutları, Input inputMode, TabloSarmal

**Files:**
- Modify: `app/globals.css` (sona ekle)
- Modify: `components/ui/Field.tsx:31-56` (`Input`)
- Create: `components/ui/Field.test.tsx`
- Create: `components/ui/TabloSarmal.tsx`
- Modify: `components/ui/index.ts`

- [ ] **Step 1: Başarısız Input testini yaz**

`components/ui/Field.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Input } from './Field'

/* Tablette sayısal alan sayı klavyesi açsın (tasarım §3.4). Ondalık adımlı
   alanlar decimal, gerisi numeric. Açıkça verilen inputMode korunur. */
describe('Input inputMode', () => {
  afterEach(cleanup)

  it('type=number → numeric', () => {
    render(<Input type="number" aria-label="a" />)
    expect(screen.getByLabelText('a').getAttribute('inputmode')).toBe('numeric')
  })

  it('ondalık step → decimal', () => {
    render(<Input type="number" step="0.01" aria-label="a" />)
    expect(screen.getByLabelText('a').getAttribute('inputmode')).toBe('decimal')
  })

  it('metin alanı inputMode almaz', () => {
    render(<Input type="text" aria-label="a" />)
    expect(screen.getByLabelText('a').hasAttribute('inputmode')).toBe(false)
  })

  it('açık inputMode korunur', () => {
    render(<Input type="number" inputMode="tel" aria-label="a" />)
    expect(screen.getByLabelText('a').getAttribute('inputmode')).toBe('tel')
  })

  it('suffix\'li sürüm de inputMode taşır', () => {
    render(<Input type="number" suffix="adet" aria-label="a" />)
    expect(screen.getByLabelText('a').getAttribute('inputmode')).toBe('numeric')
  })
})
```

- [ ] **Step 2: Başarısız olduğunu gör**

Run: `npx vitest run components/ui/Field.test.tsx`
Expected: 3 FAIL (numeric, decimal, suffix), 2 pass.

- [ ] **Step 3: Input'u güncelle**

`components/ui/Field.tsx` — `Input` fonksiyonunu şununla değiştir:
```tsx
/* type="number" alanlar tablette sayı klavyesi açsın: ondalık step varsa
   decimal, yoksa numeric. Açık inputMode her zaman kazanır. */
function sayisalKlavye(rest: InputHTMLAttributes<HTMLInputElement>) {
  if (rest.inputMode) return rest.inputMode
  if (rest.type !== 'number') return undefined
  return String(rest.step ?? '').includes('.') ? 'decimal' : 'numeric'
}

export function Input({ align = 'left', suffix, invalid, className, ...rest }: InputProps) {
  const numeric = align === 'right' || rest.type === 'number'
  const inputMode = sayisalKlavye(rest)
  const field = (
    <input
      {...rest}
      inputMode={inputMode}
      className={cn(
        BASE,
        invalid ? 'border-danger-line' : 'border-line',
        numeric && 'text-right num',
        suffix && 'pr-1',
        className,
      )}
    />
  )
  if (!suffix) return field
  return (
    <div className={cn(
      'flex h-9 items-center rounded-md border bg-surface pr-2.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15',
      invalid ? 'border-danger-line' : 'border-line',
    )}>
      <input
        {...rest}
        inputMode={inputMode}
        className={cn('h-full w-full border-0 bg-transparent px-2.5 text-[13px] text-ink outline-none', numeric && 'text-right num', className)}
      />
      <span className="shrink-0 pl-1.5 text-xs text-faint">{suffix}</span>
    </div>
  )
}
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx vitest run components/ui/Field.test.tsx`
Expected: `5 passed`.

- [ ] **Step 5: TabloSarmal**

`components/ui/TabloSarmal.tsx`:
```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* El yapımı <table> için yatay kaydırma + yapışkan başlık (tasarım §3.4).
   Sayfalar DataTable kullanmıyor; tabloyu yeniden yazmak yerine sarıyoruz.
   Yapışkan thead CSS'i globals.css'te (.tablo-sarmal thead th). */
export function TabloSarmal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('tablo-sarmal w-full overflow-x-auto', className)}>
      {children}
    </div>
  )
}
```

`components/ui/index.ts` sonuna:
```ts
export { TabloSarmal } from './TabloSarmal'
```

- [ ] **Step 6: globals.css dokunma kuralları**

`app/globals.css` sonuna ekle:
```css
/* ---------------------------------------------------------------------------
   Tablet / dokunma — tasarım 2026-09-22 §3.4.
   Kurallar yalnız kaba işaretçide (parmak) devreye girer; masaüstü yoğunluğu
   değişmez. 44 px: iOS ve Android erişilebilirlik alt sınırı.
   --------------------------------------------------------------------------- */
@media (pointer: coarse) {
  input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]),
  select,
  textarea,
  button,
  [role="button"] {
    min-height: 44px;
  }
  input[type="checkbox"],
  input[type="radio"] {
    width: 22px;
    height: 22px;
  }
  /* Kenar çubuğu satırları parmakla seçilebilsin. */
  aside nav a {
    min-height: 44px;
  }
  /* Tablo satırları: hücre dolgusu büyür, satır 44 px'e yaklaşır. */
  table td,
  table th {
    padding-top: 10px;
    padding-bottom: 10px;
  }
}

/* TabloSarmal: başlık kaydırırken üstte kalır. */
.tablo-sarmal thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface);
}
```

- [ ] **Step 7: Tarayıcıda gör**

Chrome DevTools ▸ cihaz modu ▸ iPad (dokunma). `/workshop/quality` aç: girdiler ve "Kaydet" düğmesi 44 px; sayı alanına dokununca (gerçek cihazda) sayı klavyesi. Cihaz modunu kapat: eski 36 px.

- [ ] **Step 8: Commit**

```bash
git add app/globals.css components/ui/Field.tsx components/ui/Field.test.tsx components/ui/TabloSarmal.tsx components/ui/index.ts
git commit -m "feat(tablet): dokunmada 44 px hedef, Input otomatik inputMode, TabloSarmal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Sayfa taraması — ham sayı girdileri, ızgaralar, duruş tablosu

**Files:**
- Modify: `app/workshop/**/*.tsx`, `components/pes/WorkshopForm.tsx`, `components/pes/LineManager.tsx`, `components/pes/WorkshopTabs.tsx`, `components/pes/takvim/HucreMenusu.tsx`, `components/pes/siparisler/SiparisFormu.tsx`
- Modify: `app/workshop/costs/page.tsx:223`, `app/workshop/downtime/page.tsx:58,80`, `app/workshop/is-emri/[id]/page.tsx:672`, `app/workshop/kaizen/page.tsx:66`, `app/workshop/quality/page.tsx:83`, `app/workshop/yikama-ukp/page.tsx:114`

Sayfaların çoğu paylaşılan `Input`'u değil ham `<input type="number">` kullanır (18 dosya, ~80 alan). Tek tek elle dolaşmak yerine iki düzenli ifade: önce ondalık step'liler decimal, sonra kalanlar numeric. Zaten `inputMode` taşıyan satırlara dokunulmaz.

- [ ] **Step 1: Başlangıç sayımı**

```bash
cd /c/Users/bhaka/Desktop/WORK/PES
grep -rho 'type="number"' app/workshop components/pes/WorkshopForm.tsx components/pes/LineManager.tsx components/pes/WorkshopTabs.tsx components/pes/takvim/HucreMenusu.tsx components/pes/siparisler/SiparisFormu.tsx | wc -l
grep -rho 'inputMode=' app/workshop components/pes --include=*.tsx | wc -l
```
Expected: ilk sayı ~80, ikinci ~5 (GunlukUretimTablo + sihirbaz). Sayıları not al.

- [ ] **Step 2: Toplu değişiklik**

```bash
DOSYALAR=$(grep -rl 'type="number"' app/workshop components/pes/WorkshopForm.tsx components/pes/LineManager.tsx components/pes/WorkshopTabs.tsx components/pes/takvim/HucreMenusu.tsx components/pes/siparisler/SiparisFormu.tsx)
# 1) aynı etikette ondalık step olanlar → decimal
perl -pi -e 's/type="number"(?=[^>]*step="0\.)(?![^>]*inputMode)/type="number" inputMode="decimal"/g' $DOSYALAR
# 2) kalanlar → numeric
perl -pi -e 's/type="number"(?![^>]*inputMode)/type="number" inputMode="numeric"/g' $DOSYALAR
```

- [ ] **Step 3: Doğrula**

```bash
grep -rho 'inputMode="decimal"' app/workshop components/pes --include=*.tsx | wc -l
grep -rho 'inputMode="numeric"' app/workshop components/pes --include=*.tsx | wc -l
# hiçbir etikette iki inputMode olmasın:
grep -rn 'inputMode=.*inputMode=' app/workshop components/pes --include=*.tsx | wc -l
# inputMode'suz type="number" kalmasın (çok satırlı etiketler hariç, elle bak):
grep -rn 'type="number"' app/workshop components/pes --include=*.tsx | grep -v inputMode
```
Expected: decimal ≈ 9, numeric ≈ Step 1'deki sayı − 9 − zaten olanlar; çift sayımı `0`; son grep boş (boş değilse o satırlara elle `inputMode="numeric"` ekle).

- [ ] **Step 4: Şartsız ızgaralar**

Her satırda tam metin değişikliği:

`app/workshop/costs/page.tsx:223`
`grid grid-cols-7 gap-2` → `grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7`

`app/workshop/downtime/page.tsx:58`
`grid grid-cols-3 gap-4` → `grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3`

`app/workshop/is-emri/[id]/page.tsx:672`
`grid grid-cols-3 gap-2` → `grid grid-cols-1 gap-2 md:grid-cols-3`

`app/workshop/kaizen/page.tsx:66`
`grid grid-cols-4 gap-4` → `grid grid-cols-2 gap-4 lg:grid-cols-4`

`app/workshop/quality/page.tsx:83`
`grid grid-cols-3 gap-4` → `grid grid-cols-1 gap-4 md:grid-cols-3`

`app/workshop/yikama-ukp/page.tsx:114`
`grid grid-cols-3 gap-3` → `grid grid-cols-1 gap-3 md:grid-cols-3`

Doğrula:
```bash
grep -rn "grid-cols-[3-9]\b" app/workshop --include=*.tsx | grep -v "md:\|lg:\|sm:"
```
Expected: boş.

- [ ] **Step 5: Duruş tablosunu sar**

`app/workshop/downtime/page.tsx:80-94` — dış kutu ve tabloyu şöyle değiştir (import: `import { TabloSarmal } from '@/components/ui'` — dosya zaten `@/components/ui`'den import ediyorsa aynı satıra ekle):
```tsx
        <div className="bg-white border border-line-soft rounded-xl overflow-hidden">
          <TabloSarmal>
            <table className="w-full min-w-[640px] text-sm">
              {/* … mevcut thead / tbody aynen … */}
            </table>
          </TabloSarmal>
        </div>
```
Yalnız `<TabloSarmal>` açılış/kapanışı ve `min-w-[640px]` eklenir; thead/tbody içeriği değişmez.

- [ ] **Step 6: Tip, lint, mevcut testler**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | tail -3
npm run lint 2>&1 | tail -3
npx vitest run lib/pes/gunluk-uretim.test.ts components/ui components/pes app
```
Expected: tsc temiz, lint temiz, testler geçer.

- [ ] **Step 7: Tarayıcıda gör**

900 px genişlikte `/workshop/downtime`, `/workshop/quality`, `/workshop/kaizen`, `/workshop/costs`: ızgaralar taşmıyor, duruş tablosu yatay kayıyor, başlık sabit.

- [ ] **Step 8: Commit**

```bash
git add app/workshop components/pes/WorkshopForm.tsx components/pes/LineManager.tsx components/pes/WorkshopTabs.tsx components/pes/takvim/HucreMenusu.tsx components/pes/siparisler/SiparisFormu.tsx
git commit -m "feat(tablet): sayı alanlarına inputMode, kademeli ızgaralar, duruş tablosu sarmalı

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Tarayıcı kontrol betiği

**Files:**
- Create: `scripts/tablet_kontrol.mjs`

Giriş bilgisi ortam değişkeninden; depoya şifre yazılmaz. Dev sunucu 3011'de açık olmalı.

- [ ] **Step 1: Betiği yaz**

`scripts/tablet_kontrol.mjs`:
```js
/* Tablet kabuğu kontrolü — tasarım §8. Sistem Chrome'u ile iki tablet
   boyutunda çekmece, manifest ve SW'yi doğrular.

   Çalıştır:
     PES_TEST_EPOSTA=... PES_TEST_SIFRE=... node scripts/tablet_kontrol.mjs
   İsteğe bağlı: PES_URL (varsayılan http://localhost:3011) */
import { chromium } from 'playwright-core'

const URL_KOK = process.env.PES_URL ?? 'http://localhost:3011'
const EPOSTA = process.env.PES_TEST_EPOSTA
const SIFRE = process.env.PES_TEST_SIFRE
if (!EPOSTA || !SIFRE) { console.error('PES_TEST_EPOSTA ve PES_TEST_SIFRE gerekli'); process.exit(2) }

const sonuclar = []
function kontrol(ad, kosul) { sonuclar.push([ad, !!kosul]); console.log(kosul ? '  ✓' : '  ✗', ad) }

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true })
const page = await ctx.newPage()

/* Giriş */
await page.goto(`${URL_KOK}/login`)
await page.fill('#email', EPOSTA)
await page.fill('#password', SIFRE)
await page.click('button[type=submit]')
await page.waitForURL(/\/(pes|workshop)/, { timeout: 20000 })

/* Manifest ve SW dosyaları */
const man = await page.request.get(`${URL_KOK}/manifest.webmanifest`)
kontrol('manifest 200', man.status() === 200)
const manJson = await man.json()
kontrol('manifest start_url /workshop', manJson.start_url === '/workshop')
const sw = await page.request.get(`${URL_KOK}/sw.js`)
kontrol('sw.js 200', sw.status() === 200)

/* 820 px: çekmece */
await page.goto(`${URL_KOK}/workshop`)
await page.waitForSelector('main')
const cekmece = page.locator('[role=dialog][aria-label=Gezinti]')
kontrol('820: çekmece kapalı başlar', (await cekmece.getAttribute('data-acik')) === 'false')
const kutu = await cekmece.boundingBox()
kontrol('820: çekmece ekran dışında', !kutu || kutu.x + kutu.width <= 0)
await page.click('button[aria-label="Menüyü aç"]')
kontrol('820: menü düğmesi açar', (await cekmece.getAttribute('data-acik')) === 'true')
kontrol('820: menüde Kalite bağlantısı var', await cekmece.locator('a', { hasText: 'Kalite' }).isVisible())
await page.keyboard.press('Escape')
kontrol('820: ESC kapatır', (await cekmece.getAttribute('data-acik')) === 'false')

/* SW kaydı */
await page.waitForTimeout(1500)
const swAktif = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration()
  return !!(r && (r.active || r.installing || r.waiting))
})
kontrol('820: service worker kayıtlı', swAktif)

/* Dokunma boyutu: bir düğme 44 px */
await page.goto(`${URL_KOK}/workshop/quality`)
const dugmeYuk = await page.evaluate(() => {
  const b = document.querySelector('main button')
  return b ? b.getBoundingClientRect().height : 0
})
kontrol('820: main içindeki düğme ≥ 44 px', dugmeYuk >= 44)

/* 1024 px: sabit sütun, üst bar yok */
await page.setViewportSize({ width: 1024, height: 768 })
await page.goto(`${URL_KOK}/workshop`)
await page.waitForSelector('main')
const kutu2 = await cekmece.boundingBox()
kontrol('1024: kenar çubuğu görünür ve solda', !!kutu2 && kutu2.x === 0 && kutu2.width >= 250)
kontrol('1024: menü düğmesi yok', (await page.locator('button[aria-label="Menüyü aç"]').count()) === 0 ||
  !(await page.locator('button[aria-label="Menüyü aç"]').isVisible()))

await browser.close()
const hatali = sonuclar.filter(([, ok]) => !ok)
console.log(`\n${sonuclar.length - hatali.length}/${sonuclar.length} kontrol geçti`)
process.exit(hatali.length ? 1 : 0)
```

- [ ] **Step 2: Çalıştır**

```bash
PES_TEST_EPOSTA='hakan.gok@pes.local' PES_TEST_SIFRE='<nottaki şifre>' node scripts/tablet_kontrol.mjs
```
Expected: son satır `12/12 kontrol geçti`, çıkış kodu 0. Bir kontrol düşerse ilgili task'a dön; betiği geçecek şekilde gevşetme.

- [ ] **Step 3: Commit**

```bash
git add scripts/tablet_kontrol.mjs
git commit -m "test(tablet): Chrome ile çekmece, manifest, SW ve dokunma boyutu kontrolü

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Tam doğrulama ve kapanış

**Files:**
- Modify: `docs/superpowers/specs/2026-09-22-atolye-tablet-pwa-design.md:3` (durum satırı)
- Modify: `lib/version.ts`

- [ ] **Step 1: Tüm testler**

Run: `npx vitest run 2>&1 | tail -6`
Expected: `Test Files  N passed`, `Tests  M passed` — başarısız yok (M ≥ 1079 + 21 yeni).

- [ ] **Step 2: Üretim build'i**

Run: `npx next build 2>&1 | tail -25`
Expected: hata yok; rota listesinde `○ /cevrimdisi` (statik) ve `○ /manifest.webmanifest` görünür.

- [ ] **Step 3: İzolasyon ve açık API kontrolü (değişmemeli)**

```bash
node scripts/verify_workshop_isolation.mjs 2>&1 | tail -2
node scripts/verify_public_api.mjs 2>&1 | tail -2
```
Expected: 76/76; açık API temiz.

- [ ] **Step 4: Sürüm ve spec durumu**

`lib/version.ts`: `'v1.2.0'` → `'v1.3.0'` (tablet kabuğu kullanıcıya görünen değişiklik).

Spec 3. satır:
```
Tarih: 2026-09-22 · Durum: **Faz 1 uygulandı** (PWA kabuğu, çekmece, dokunma boyutları) — Faz 2 (çevrimdışı giriş) plan bekliyor
```

- [ ] **Step 5: Commit**

```bash
git add lib/version.ts docs/superpowers/specs/2026-09-22-atolye-tablet-pwa-design.md
git commit -m "docs(tablet): Faz 1 kapandı — sürüm v1.3.0, spec durumu güncellendi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Gerçek cihaz kontrolü (elle, deploy sonrası)**

main'e merge ve Vercel deploy sonrası (`pes-platform-promode.vercel.app`; alias notu: memory `pes-vercel-dogru-adres`):
1. iPad Safari: adresi aç, giriş yap, Paylaş ▸ Ana Ekrana Ekle. Simge PES yeşili, açılınca tam ekran ve `/workshop`.
2. Android Chrome: "Uygulamayı yükle" istemi çıkar; kurulunca tam ekran.
3. Uçak modu ▸ uygulamayı aç ▸ "Bağlantı yok" sayfası; Wi-Fi ▸ "Yeniden dene" ▸ panel.
4. Yeni deploy sonrası açık uygulamada "Uygulamanın yeni sürümü hazır" şeridi, Yenile çalışır.

Sonucu spec §8'e bir satır olarak ekle ve commit'le.

---

## Spec kapsam kontrolü (öz-inceleme)

| Spec §3 maddesi | Task |
|---|---|
| 3.1 manifest, ikonlar, viewport, Apple meta | 1, 2 |
| 3.2 sw.js, precache, stratejiler, sürüm damgası, SwKayit, güncelleme uyarısı | 3, 4, 5 |
| 3.2 Android Background Sync `sync` olayı | Faz 2 (kuyruk yokken dinleyicinin işi yok) |
| 3.3 çekmece, üst bar, dialog/ESC/karartma/rota, odak, layout dolgusu | 6, 7 |
| 3.4 44 px coarse kuralı, inputMode, TabloSarmal, ızgaralar | 8, 9 |
| 3.4 hover-only → tıkla-aç | Mevcut durum yeterli: `MetricInfo` ve `TermTip` zaten tıkla-aç; `group-hover` ile gizlenen satır aksiyonu yok (grep boş). Task yok. |
| 3.4 tüm sayfalardaki tabloların sarılması | Faz 1'de duruş; kalan sayfalar Faz 3–4 (sayfa başına iş) |
| 3.5 oturum: 400 gün çerez, 401'de kuyruk durur | Çerez mevcut; 401 kuralı Faz 2 (kuyrukla gelir) |
| §8 Playwright 820/1024, Lighthouse, elle cihaz | 10, 11 (Lighthouse: Chrome DevTools ▸ Lighthouse ▸ PWA, Task 11 Step 6 ile birlikte) |
