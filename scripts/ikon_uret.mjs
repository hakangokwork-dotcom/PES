/* SVG ikondan PNG'ler üretir. Depoda görüntü kütüphanesi yok; playwright-core
   sistem Chrome'uyla SVG'yi çizip ekran görüntüsü alır.
   Çalıştır: node scripts/ikon_uret.mjs  (Chrome kurulu olmalı)

   maskable: Android ikonu daire/kare maskeyle keser; köşe yuvarlatma yok,
   yazı %80 güvenli alanda kalsın diye küçük.
   apple-touch-icon: iOS köşeyi kendi yuvarlar; kare veriyoruz. */
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..')
const IKON_DIZINI = join(KOK, 'public', 'icons')

const svg = readFileSync(join(IKON_DIZINI, 'pes.svg'), 'utf8')
const kare = svg.replace('rx="96"', 'rx="0"')
const maskable = kare.replace('font-size="168"', 'font-size="136"')

/* replace() eşleşmezse sessizce aynı SVG döner ve maskable ikon yuvarlak
   köşeli / büyük yazılı çıkar. pes.svg değişirse burada patlasın. */
if (kare === svg || maskable === kare) {
  throw new Error('pes.svg beklenen rx="96" / font-size="168" özniteliklerini taşımıyor')
}

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
  writeFileSync(join(IKON_DIZINI, ad), png)
  console.log('yazıldı', ad, png.length, 'bayt')
}
await browser.close()
