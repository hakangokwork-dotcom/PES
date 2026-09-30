#!/usr/bin/env node
/* ProVSM → PES senkronu.
 *
 * Simülasyon çekirdeğinin TEK KAYNAĞI ProVSM reposudur (2026-09-30'dan beri):
 *   WORK/ProVSM/packages/vsim-core/src
 * Geliştirme orada yapılır. Bu betik o ağacı PES/components/vsim altına birebir
 * kopyalar. Hedef dizin TÜRETİLMİŞTİR — elle düzenlenmemelidir, her senkronda
 * silinip yeniden yazılır. PES'e özgü parçalar (components/pes/vsimPesDepo.ts,
 * VsimEmbed.tsx, app/styles/vsim-bridge.css) hedefin DIŞINDA durur, dokunulmaz.
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
 * ProVSM başka bir yoldaysa:  VSIM_DIR=/yol/ProVSM/packages/vsim-core npm run sync:vsim
 */
import { cp, rm, mkdir, readdir, stat, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PES_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const VSIM_DIR = resolve(process.env.VSIM_DIR || join(PES_ROOT, '..', 'ProVSM', 'packages', 'vsim-core'))
const SRC = join(VSIM_DIR, 'src')
const DEST = join(PES_ROOT, 'components', 'vsim')
const STYLES = join(PES_ROOT, 'app', 'styles')

/* Koruma: components/vsim'de commit'lenmemiş değişiklik varsa DURUR — biri yanlışlıkla
   PES tarafında düzenlemiş olabilir; senkron o işi ezerdi. Önce değişikliği ProVSM'e
   taşı (ya da geri al). Bilerek ezmek için: SYNC_VSIM_FORCE=1 */
if (!process.env.SYNC_VSIM_FORCE) {
  const kirli = execFileSync('git', ['status', '--porcelain', '--', 'components/vsim', 'app/styles/vsim-theme.css'], { cwd: PES_ROOT, encoding: 'utf8' }).trim()
  if (kirli) {
    console.error(`✗ components/vsim içinde commit'lenmemiş değişiklik var — senkron bunları ezer:\n${kirli}`)
    console.error("  Çekirdek artık ProVSM'de geliştiriliyor; değişikliği oraya taşı. Bilerek ezmek için: SYNC_VSIM_FORCE=1")
    process.exit(1)
  }
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
