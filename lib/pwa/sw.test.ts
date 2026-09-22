import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeEach, vi } from 'vitest'

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

/* adres: SW'nin kendi URL'si — sorgu dizesi hem sürümü hem gelistirme
   bayrağını taşıdığı için testler bunu ezebilmeli. */
function swYukle(agVar: boolean, adres = 'https://pes.test/sw.js?v=v9-test') {
  /* Yol testin çalışma dizinine değil dosyanın kendi konumuna göre çözülsün. */
  const kod = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')
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
    location: { href: adres, origin: 'https://pes.test' },
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
  /* `as` şart: değer yalnız respondWith geri çağrısında atandığı için TS
     düz bildirimi `null` diye daraltır ve `yanit.body` erişimi TS2339 verir. */
  let yanit = null as Promise<SahteYanit> | null
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

  it('yedek sayfa önbellekte yoksa satır içi HTML döner', async () => {
    /* Safari önbelleği tahliye edebilir: kur() çağırmıyoruz, kabuk boş. */
    const kapali = swYukle(false)
    const y = await fetchTetikle(kapali, istek('https://pes.test/workshop', { mode: 'navigate' })) as unknown as Response
    expect(y).toBeInstanceOf(Response)
    expect(await y.text()).toContain('Bağlantı yok')
    expect(y.headers.get('content-type')).toMatch(/^text\/html/)
  })

  it('geliştirme kipinde /_next/static önbelleğe alınmaz', async () => {
    const gel = swYukle(true, 'https://pes.test/sw.js?v=v9-test&gelistirme=1')
    await kur(gel)
    const url = 'https://pes.test/_next/static/chunks/a.js'
    expect(await fetchTetikle(gel, istek(url))).toBeNull()
    expect(await fetchTetikle(gel, istek(url))).toBeNull()
    /* respondWith hiç çağrılmadı: isteği tarayıcının kendisi yapar. */
    expect(gel.fetchCagrilari.filter(u => u === url)).toHaveLength(0)
  })

  it('kabuk dosyası kurulamazsa install reddedilir', async () => {
    const gunluk = vi.spyOn(console, 'error').mockImplementation(() => {})
    /* addAll'ı bu test için bozuyoruz; yarım kabuklu worker denetimi almamalı. */
    sw.caches.open = async () => ({
      addAll: async () => { throw new TypeError('Failed to fetch') },
      match: async () => undefined,
      put: async () => {},
    })
    let bekle: Promise<unknown> = Promise.resolve()
    sw.dinleyiciler.install({ waitUntil: (p: Promise<unknown>) => { bekle = p } })
    await expect(bekle).rejects.toThrow()
    expect(gunluk).toHaveBeenCalled()
    gunluk.mockRestore()
  })
})
