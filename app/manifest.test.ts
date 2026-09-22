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
