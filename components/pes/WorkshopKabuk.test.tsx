// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

let yol = '/workshop'
vi.mock('next/navigation', () => ({ usePathname: () => yol }))

import WorkshopKabuk from './WorkshopKabuk'

/* jsdom matchMedia bilmez. Testler tablet genişliğini (lg altı) taklit eder. */
function matchMediaKur(masaustu: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes('1024') ? masaustu : false,
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function ciz() {
  return render(
    <WorkshopKabuk baslik="B002 SAYAN" kenar={<nav><a href="/workshop/quality">Kalite</a></nav>}>
      <p>içerik</p>
    </WorkshopKabuk>,
  )
}

describe('WorkshopKabuk (tablet)', () => {
  beforeEach(() => { cleanup(); yol = '/workshop'; matchMediaKur(false) })

  it('kapalı başlar; menü düğmesi açar', () => {
    ciz()
    const cekmece = screen.getByRole('dialog', { hidden: true })
    expect(cekmece.getAttribute('data-acik')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    expect(cekmece.getAttribute('data-acik')).toBe('true')
    expect(cekmece.getAttribute('aria-modal')).toBe('true')
  })

  it('ESC kapatır', () => {
    ciz()
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog', { hidden: true }).getAttribute('data-acik')).toBe('false')
  })

  it('karartmaya dokunmak kapatır', () => {
    ciz()
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü kapat' }))
    expect(screen.getByRole('dialog', { hidden: true }).getAttribute('data-acik')).toBe('false')
  })

  it('rota değişince kapanır', () => {
    const { rerender } = ciz()
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    yol = '/workshop/quality'
    rerender(
      <WorkshopKabuk baslik="B002 SAYAN" kenar={<nav><a href="/workshop/quality">Kalite</a></nav>}>
        <p>içerik</p>
      </WorkshopKabuk>,
    )
    expect(screen.getByRole('dialog', { hidden: true }).getAttribute('data-acik')).toBe('false')
  })

  it('kapalıyken çekmece inert, açıkken değil', () => {
    ciz()
    const cekmece = screen.getByRole('dialog', { hidden: true })
    expect(cekmece.hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    expect(cekmece.hasAttribute('inert')).toBe(false)
  })

  it('üst bar başlığı ve içeriği gösterir', () => {
    ciz()
    expect(screen.getByText('B002 SAYAN')).toBeTruthy()
    expect(screen.getByText('içerik')).toBeTruthy()
  })
})

describe('WorkshopKabuk (masaüstü)', () => {
  beforeEach(() => { cleanup(); matchMediaKur(true) })

  it('masaüstünde kenar çubuğu inert değildir', () => {
    ciz()
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('inert')).toBe(false)
  })
})
