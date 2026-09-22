/* PES Atölye service worker — tasarım 2026-09-22 §3.2.
   Klasik worker; modül/paket yok (Next 16 Turbopack ile next-pwa/Serwist
   uyumsuz, kabuk ihtiyacı küçük).

   Sürüm: SwKayit bu dosyayı /sw.js?v=<build damgası> ile kaydeder. Damga
   değişince önbellek adı değişir, eski kabuk activate'te silinir.

   Ne yapar / yapmaz:
   - Gezinme (sayfa açma): ağ önce; ağ yoksa /cevrimdisi, o da yoksa satır içi
     yedek HTML (aşağıda) — yanıt asla undefined olmaz.
   - /_next/static/*: önbellek önce (içerik hash'li, güvenle saklanır).
     Geliştirme kipinde (?gelistirme=1) bu kural kapanır, bkz. GELISTIRME.
   - Kabuk = yalnız çevrimdışı sayfası (/cevrimdisi); başka hiçbir dosya
     önceden önbelleğe alınmaz. Kurulum başarısız olursa install reddedilir
     (yarım kabuk yayına çıkmasın) ve hata DevTools'a yazılır.
   - /api/*: DOKUNMAZ. RLS'li veri cihazda kalmaz; çevrimdışı yazma kuyruğu
     Faz 2'de IndexedDB'de yaşar, burada değil.
   - GET dışı ve başka origin: dokunmaz. */

const SURUM = new URL(self.location.href).searchParams.get('v') || 'dev'
/* Turbopack'in dev chunk adresleri içerik değil kimlik (ident) hash'lidir:
   dosyayı düzenleyince adres aynı kalır. Önbellek-önce bu yüzden her
   düzenlemeden sonra bayat kodu servis eder — geliştirmede statik önbellek
   tamamen kapalı. Gezinme yedeği açık kalır ki çevrimdışı sayfa denenebilsin. */
const GELISTIRME = new URL(self.location.href).searchParams.get('gelistirme') === '1'
const KABUK = 'pes-kabuk-' + SURUM
const STATIK = 'pes-statik-' + SURUM
const CEVRIMDISI = '/cevrimdisi'
/* Kabuk = yalnız çevrimdışı sayfası. Manifest ve ikonlar buraya konulmuştu ama
   strateji() onları hiçbir zaman önbellekten servis etmiyor (gezinme değiller,
   /_next/static altında da değiller) — kurulumu gereksiz yere uzatan ve
   başarısız olunca install'ı reddettiren ölü girdilerdi. */
const KABUK_DOSYALARI = [CEVRIMDISI]

/* Son çare: Safari bellek baskısında / ITP ile önbelleği silebilir, o zaman
   caches.match(CEVRIMDISI) undefined döner ve respondWith çöker. */
const YEDEK_HTML = '<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bağlantı yok</title><body style="font-family:system-ui;padding:2rem;text-align:center"><h1>Bağlantı yok</h1><p>Wi-Fi bağlanınca <a href="/workshop">yeniden deneyin</a>.</p></body></html>'

async function cevrimdisiYaniti() {
  return (await caches.match(CEVRIMDISI)) ??
    new Response(YEDEK_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(KABUK)
      .then((c) => c.addAll(KABUK_DOSYALARI))
      /* Hatayı yutmuyoruz: günlük DevTools için, throw ise install'ı
         reddetsin diye — eksik kabuklu bir worker denetimi almasın. */
      .catch((err) => { console.error('SW kabuk kurulamadı', err); throw err })
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
  if (url.pathname.startsWith('/_next/static/')) return GELISTIRME ? 'dokunma' : 'statik'
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
  else if (s === 'gezinme') e.respondWith(fetch(req).catch(cevrimdisiYaniti))
})

async function onbellekOnce(req) {
  const c = await caches.open(STATIK)
  const varOlan = await c.match(req)
  if (varOlan) return varOlan
  const yanit = await fetch(req)
  /* put'u bekliyoruz: worker yanıt döndükten hemen sonra sonlandırılabilir ve
     "ateşle-unut" yazma diske inmeden iptal olur. */
  if (yanit.ok) await c.put(req, yanit.clone())
  return yanit
}
