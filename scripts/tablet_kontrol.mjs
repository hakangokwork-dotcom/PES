/* Tablet kabuğu kontrolü — tasarım §8. Sistem Chrome'u ile iki tablet
   boyutunda çekmece, manifest, SW ve dokunma boyutunu doğrular.

   Çalıştır (dev sunucu 3011'de açıkken):
     PES_TEST_EPOSTA=... PES_TEST_SIFRE=... node scripts/tablet_kontrol.mjs
   İsteğe bağlı: PES_URL (varsayılan http://localhost:3011)

   Şifre depoya yazılmaz; ortam değişkeninden gelir. */
import { chromium } from 'playwright-core'

const URL_KOK = process.env.PES_URL ?? 'http://localhost:3011'
const EPOSTA = process.env.PES_TEST_EPOSTA
const SIFRE = process.env.PES_TEST_SIFRE
if (!EPOSTA || !SIFRE) { console.error('PES_TEST_EPOSTA ve PES_TEST_SIFRE gerekli'); process.exit(2) }

const sonuclar = []
function kontrol(ad, kosul) { sonuclar.push([ad, !!kosul]); console.log(kosul ? '  ✓' : '  ✗', ad) }

const browser = await chromium.launch({ channel: 'chrome' })
/* hasTouch: pointer: coarse medya kuralı devreye girsin (44 px). */
const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true })
const page = await ctx.newPage()
const konsolHatalari = []
/* Chrome'un ağ 404 mesajının metninde URL yok (yalnız location().url'de) —
   favicon.ico'yu elemek için ikisini de saklıyoruz. */
page.on('console', (m) => { if (m.type() === 'error') konsolHatalari.push({ metin: m.text(), url: m.location()?.url ?? '' }) })
page.on('pageerror', (e) => konsolHatalari.push({ metin: 'pageerror: ' + e.message, url: '' }))

try {
  /* Giriş */
  await page.goto(`${URL_KOK}/login`)
  await page.fill('#email', EPOSTA)
  await page.fill('#password', SIFRE)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })

  /* Manifest ve SW dosyaları */
  const man = await page.request.get(`${URL_KOK}/manifest.webmanifest`)
  kontrol('manifest 200', man.status() === 200)
  const manJson = await man.json()
  kontrol('manifest start_url /workshop', manJson.start_url === '/workshop')
  const sw = await page.request.get(`${URL_KOK}/sw.js`)
  kontrol('sw.js 200', sw.status() === 200)
  const cevrimdisi = await page.request.get(`${URL_KOK}/cevrimdisi`)
  kontrol('/cevrimdisi 200', cevrimdisi.status() === 200)

  /* 820 px: çekmece */
  await page.goto(`${URL_KOK}/workshop`)
  await page.waitForSelector('main')
  /* role=dialog yalnız tablette (masaüstünde undefined — WorkshopKabuk
     incelemesinde kasıtlı: masaüstünde bu sadece bir sütun, kipli pencere
     değil). Seçici bu yüzden yalnız aria-label'a dayanır, role'e değil. */
  const cekmece = page.locator('[aria-label="Gezinti"]')
  kontrol('820: çekmece kapalı başlar', (await cekmece.getAttribute('data-acik')) === 'false')
  const kutu = await cekmece.boundingBox()
  kontrol('820: çekmece ekran dışında', !kutu || kutu.x + kutu.width <= 0)
  await page.click('button[aria-label="Menüyü aç"]')
  kontrol('820: menü düğmesi açar', (await cekmece.getAttribute('data-acik')) === 'true')
  kontrol('820: menüde Kalite bağlantısı var', await cekmece.locator('a', { hasText: 'Kalite' }).isVisible())
  await page.keyboard.press('Escape')
  kontrol('820: ESC kapatır', (await cekmece.getAttribute('data-acik')) === 'false')

  /* SW kaydı (kapsam /workshop) */
  await page.waitForTimeout(1500)
  const swAktif = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration('/workshop')
    return !!(r && (r.active || r.installing || r.waiting))
  })
  kontrol('820: service worker kayıtlı', swAktif)

  /* Dokunma boyutu: bir düğme 44 px.
     Test hesabı atölyeye bağlı olmayan bir merkez/admin kullanıcısı —
     /workshop'a wid'siz gidince "Atölye Seçin" listesi çıkar ve
     /workshop/quality'de form yerine "Atölye seçin" yazısı görünür, düğme
     olmaz. Önce listeden bir atölye seçip wid'i URL'ye taşıyoruz. */
  await page.goto(`${URL_KOK}/workshop`)
  await page.waitForSelector('main')
  const atolyeKarti = page.locator('a[href^="/workshop?wid="]').first()
  if (await atolyeKarti.count()) {
    await atolyeKarti.click()
    await page.waitForURL((u) => u.searchParams.has('wid'))
  }
  const wid = new URL(page.url()).searchParams.get('wid')
  await page.goto(wid ? `${URL_KOK}/workshop/quality?wid=${wid}` : `${URL_KOK}/workshop/quality`)
  await page.waitForSelector('main')
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
  const menuDugmesi = page.locator('button[aria-label="Menüyü aç"]')
  kontrol('1024: menü düğmesi yok', (await menuDugmesi.count()) === 0 || !(await menuDugmesi.isVisible()))

  /* Konsol: favicon 404'ü eski ve ilgisiz; onun dışında hata olmamalı */
  const ciddi = konsolHatalari.filter((h) => !/favicon/i.test(h.url) && !/favicon/i.test(h.metin))
  kontrol('konsolda hata yok (favicon hariç)', ciddi.length === 0)
  if (ciddi.length) console.log('    konsol:', ciddi.slice(0, 5).map((h) => h.metin))
} finally {
  await browser.close()
}

const hatali = sonuclar.filter(([, ok]) => !ok)
console.log(`\n${sonuclar.length - hatali.length}/${sonuclar.length} kontrol geçti`)
process.exit(hatali.length ? 1 : 0)
