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
