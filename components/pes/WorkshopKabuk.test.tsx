// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

let yol = '/workshop'
vi.mock('next/navigation', () => ({ usePathname: () => yol }))

import WorkshopKabuk from './WorkshopKabuk'

/* jsdom matchMedia bilmez. Testler tablet genişliğini (lg altı) taklit eder.
   '(min-width: 1024px)' sorgusunun nesnesini ve 'change' dinleyicisini
   saklarız: böylece testte genişlik değişimini (iPad döndürme) taklit
   edebiliriz — matches'i çevirip dinleyiciyi elle çağırarak. */
let mqNesne: { matches: boolean } | null = null
let mqDinleyici: (() => void) | null = null

function matchMediaKur(masaustu: boolean) {
  mqNesne = null
  mqDinleyici = null
  window.matchMedia = vi.fn().mockImplementation((q: string) => {
    const nesne = {
      matches: q.includes('1024') ? masaustu : false,
      media: q,
      addEventListener: (_tur: string, fn: () => void) => { mqDinleyici = fn },
      removeEventListener: vi.fn(),
    }
    if (q.includes('1024')) mqNesne = nesne
    return nesne
  }) as unknown as typeof window.matchMedia
}

function ciz() {
  return render(
    <WorkshopKabuk baslik="B002 SAYAN" kenar={<nav><a href="/workshop/quality">Kalite</a></nav>}>
      <p>içerik</p>
    </WorkshopKabuk>,
  )
}

/* getByRole('dialog', { hidden: true }) SADECE çekmece kapalıyken gerekir:
   kapalı çekmece `inert` olduğu için erişilebilirlik ağacında gizlidir ve
   varsayılan sorgu onu bulamaz. Açıldıktan sonra düz getByRole('dialog')
   çalışır — aşağıda en az bir testte bilerek öyle sorguluyoruz. */

describe('WorkshopKabuk (tablet)', () => {
  beforeEach(() => { yol = '/workshop'; matchMediaKur(false) })
  afterEach(cleanup)

  it('kapalı başlar; menü düğmesi açar', () => {
    ciz()
    const cekmece = screen.getByRole('dialog', { hidden: true })
    expect(cekmece.getAttribute('data-acik')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    expect(screen.getByRole('dialog').getAttribute('data-acik')).toBe('true')
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

  it('masaüstü genişliğine geçince kapanır (iPad döndürme)', () => {
    ciz()
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    expect(screen.getByRole('dialog').getAttribute('data-acik')).toBe('true')
    act(() => { mqNesne!.matches = true; mqDinleyici!() })
    /* Masaüstünde dialog rolü kalkar; etiketten sorgula. */
    expect(screen.getByLabelText('Gezinti').getAttribute('data-acik')).toBe('false')
  })

  it('kapanınca odak menü düğmesine döner', () => {
    ciz()
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menüyü aç' }))
  })

  it('açıkken gövde kaydırması kilitlenir, kapanınca geri gelir', () => {
    ciz()
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.body.style.overflow).toBe('')
  })

  it('açılışta odak çekmecenin içine gider', () => {
    ciz()
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    const cekmece = screen.getByRole('dialog')
    expect(cekmece.contains(document.activeElement)).toBe(true)
  })
})

describe('WorkshopKabuk (masaüstü)', () => {
  beforeEach(() => { yol = '/workshop'; matchMediaKur(true) })
  afterEach(cleanup)

  it('masaüstünde kenar çubuğu inert değildir ve dialog rolü taşımaz', () => {
    ciz()
    const kenar = screen.getByLabelText('Gezinti')
    expect(kenar.hasAttribute('inert')).toBe(false)
    expect(kenar.hasAttribute('role')).toBe(false)
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
  })
})
