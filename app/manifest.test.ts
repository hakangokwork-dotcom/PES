import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
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

  it('ikon dosyaları public/ altında gerçekten var', () => {
    /* Eksik veya yeniden adlandırılmış PNG Chrome'un kurulabilirlik şartını
       ve iOS ana ekran simgesini sessizce bozar. */
    const yollar = [...(m.icons ?? []).map(i => i.src), '/icons/apple-touch-icon.png']
    for (const y of yollar) {
      expect(existsSync(join(process.cwd(), 'public', y)), y).toBe(true)
    }
  })
})
