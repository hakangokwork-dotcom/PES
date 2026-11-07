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

  it('sayı olarak verilen ondalık step → decimal', () => {
    render(<Input type="number" step={0.5} aria-label="a" />)
    expect(screen.getByLabelText('a').getAttribute('inputmode')).toBe('decimal')
  })

  it('step="any" → decimal', () => {
    render(<Input type="number" step="any" aria-label="a" />)
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

/* Etiket alana bağlı olsun: ekran okuyucu adı okur, etikete dokununca odak
   alana gider. Yardım/hata metni aria-describedby ile okunur. */
describe('Field etiket bağlantısı', () => {
  afterEach(cleanup)

  it('etiket Input\'u adlandırır, yardım metni açıklar', async () => {
    const { Field } = await import('./Field')
    render(<Field label="Ayrılan" hint="Bu ay işten ayrılan"><Input type="number" /></Field>)
    const alan = screen.getByLabelText('Ayrılan')
    expect(alan.tagName).toBe('INPUT')
    const aciklama = document.getElementById(alan.getAttribute('aria-describedby')!)
    expect(aciklama?.textContent).toBe('Bu ay işten ayrılan')
    expect(alan.hasAttribute('aria-invalid')).toBe(false)
  })

  it('hata varsa aria-invalid', async () => {
    const { Field } = await import('./Field')
    render(<Field label="Süre" error="Süre girin"><Input /></Field>)
    expect(screen.getByLabelText('Süre').getAttribute('aria-invalid')).toBe('true')
  })

  it('Select de bağlanır', async () => {
    const { Field, Select } = await import('./Field')
    render(<Field label="Ay"><Select><option>Ocak</option></Select></Field>)
    expect(screen.getByLabelText('Ay').tagName).toBe('SELECT')
  })
})
