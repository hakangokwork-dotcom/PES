#!/usr/bin/env node
/* VSIM → PES senkronu.
 *
 * VSIM (standalone Vite uygulaması) bu modülün TEK KAYNAĞIDIR; geliştirme orada yapılır.
 * Bu betik VSIM/src ağacını PES/components/vsim altına birebir kopyalar. Hedef dizin
 * TÜRETİLMİŞTİR — elle düzenlenmemelidir, her senkronda silinip yeniden yazılır.
 *
 * Kopyalanmayanlar (yalnız standalone'a ait):
 *   main.jsx    — Vite giriş noktası, createRoot çağrısı
 *   index.css   — @fontsource yüklemeleri + html/body kuralları (PES bunları next/font
 *                 ve .vsim-root ile kendi katmanında çözer; tema vsim-theme.css'te)
 *
 * Ayrı yere kopyalanan:
 *   vsim-theme.css → app/styles/ — app/globals.css bunu @import eder ve Tailwind 4'ün
 *                 çözümleyicisi `../` ile üst dizine çıkamıyor; bu yüzden tema dosyası
 *                 bileşen ağacında değil, globals.css'in altındaki styles/ dizininde durur.
 *
 * Kullanım:  npm run sync:vsim
 * VSIM başka bir yoldaysa:  VSIM_DIR=/yol/VSIM npm run sync:vsim
 */
import { cp, rm, mkdir, readdir, stat, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PES_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const VSIM_DIR = resolve(process.env.VSIM_DIR || join(PES_ROOT, '..', '..', 'IDEAMD', 'VSIM'))
const SRC = join(VSIM_DIR, 'src')
const DEST = join(PES_ROOT, 'components', 'vsim')
const STYLES = join(PES_ROOT, 'app', 'styles')

// DEVRE DIŞI (2026-07-24 — kullanıcı kararı): Artık PES, VSIM'in KAYNAĞIDIR. Geliştirme
// doğrudan components/vsim içinde yapılıyor (Akış-n8n vb.). Bu senkron DEST'i siler ve
// IDEAMD\VSIM'den yeniden yazar → doğrudan yapılan işi EZER. Kazayı önlemek için kapalı.
// Bilerek çalıştırmak (ör. PES→VSIM backport sonrası tersine kurulumla) için: SYNC_VSIM_FORCE=1
if (!process.env.SYNC_VSIM_FORCE) {
  console.error('sync-vsim DEVRE DIŞI: PES artık source-of-truth; bu senkron components/vsim\'i ezerdi.\n' +
    'Bilerek çalıştıracaksan: SYNC_VSIM_FORCE=1 npm run sync:vsim');
  process.exit(1)
}

/* Standalone'a özel dosyalar — kopyalanmaz (yukarıdaki başlıkta gerekçeleri).
   vsim-theme.css burada atlanır çünkü bileşen ağacına değil app/styles'a gider. */
const SKIP = new Set(['main.jsx', 'index.css', 'vsim-theme.css'])

if (!existsSync(SRC)) {
  console.error(`✗ VSIM kaynağı bulunamadı: ${SRC}`)
  console.error('  VSIM_DIR ortam değişkeniyle doğru yolu verin.')
  process.exit(1)
}

/* Hedefi sıfırla: yukarıda silinen dosyalar PES'te hayalet olarak kalmasın. */
await rm(DEST, { recursive: true, force: true })
await mkdir(DEST, { recursive: true })

await cp(SRC, DEST, {
  recursive: true,
  filter: (from) => {
    const rel = relative(SRC, from)
    return rel === '' || !SKIP.has(rel)   // yalnız kök seviyedeki dosya adlarını ele
  },
})

/* Tema, globals.css'in @import edebildiği tek yere: app/styles/ */
await mkdir(STYLES, { recursive: true })
await copyFile(join(SRC, 'vsim-theme.css'), join(STYLES, 'vsim-theme.css'))

/* Özet: kaç dosya, kaç test dosyası geldi. */
async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...await walk(p))
    else out.push(p)
  }
  return out
}
const files = await walk(DEST)
const tests = files.filter((f) => f.endsWith('.test.js'))
const bytes = (await Promise.all(files.map((f) => stat(f).then((s) => s.size)))).reduce((a, b) => a + b, 0)

console.log(`✓ VSIM senkronlandı`)
console.log(`  kaynak : ${SRC}`)
console.log(`  hedef  : components${sep}vsim`)
console.log(`  dosya  : ${files.length} (${tests.length} test) · ${(bytes / 1024).toFixed(0)} KB`)
console.log(`  tema   : app${sep}styles${sep}vsim-theme.css`)
console.log(`  atlanan: main.jsx, index.css`)
console.log(`\n  Değişenleri görmek için: git status components/vsim`)
