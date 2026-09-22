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
