'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'

/* Atölye paneli kabuğu — tasarım 2026-09-22 §3.3.

   lg (1024 px) ve üstü: kenar çubuğu bugünkü gibi sabit sütun, üst bar yok.
   Altı: 56 px üst bar (menü düğmesi + atölye adı + sağ yuva) ve soldan
   kayan çekmece. Kenar çubuğu TEK kez render edilir; konumu CSS belirler.

   Çekmece kapalıyken `inert`: ekran dışındaki bağlantılar sekmeyle
   gezilmesin. Masaüstünde inert asla uygulanmaz (useMasaustu). */

function useMasaustu() {
  /* SSR ve ilk boyamada true: masaüstü kullanıcı ilk karede inert görmesin. */
  const [masaustu, setMasaustu] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const guncelle = () => setMasaustu(mq.matches)
    guncelle()
    mq.addEventListener('change', guncelle)
    return () => mq.removeEventListener('change', guncelle)
  }, [])
  return masaustu
}

export default function WorkshopKabuk({
  kenar, baslik, sagUst, children,
}: {
  kenar: ReactNode
  baslik: string
  /** Üst barın sağ yuvası — Faz 2'de senkron çipi buraya gelir. */
  sagUst?: ReactNode
  children: ReactNode
}) {
  const [acik, setAcik] = useState(false)
  const pathname = usePathname()
  const masaustu = useMasaustu()
  const cekmeceRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setAcik(false) }, [pathname])

  useEffect(() => {
    if (!acik) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAcik(false); return }
      if (e.key !== 'Tab' || !cekmeceRef.current) return
      /* Odak çekmecede kalır: uçlarda sar. */
      const odaklanabilir = cekmeceRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
      )
      if (odaklanabilir.length === 0) return
      const ilk = odaklanabilir[0], son = odaklanabilir[odaklanabilir.length - 1]
      if (e.shiftKey && document.activeElement === ilk) { e.preventDefault(); son.focus() }
      else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus() }
    }
    document.addEventListener('keydown', onKey)
    const eskiOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cekmeceRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = eskiOverflow
    }
  }, [acik])

  const cekmeceInert = !masaustu && !acik

  return (
    <div className="min-h-screen flex bg-canvas">
      {acik && (
        <button
          type="button"
          aria-label="Menüyü kapat"
          onClick={() => setAcik(false)}
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
        />
      )}

      <div
        ref={cekmeceRef}
        role="dialog"
        aria-label="Gezinti"
        aria-modal={acik || undefined}
        data-acik={acik}
        inert={cekmeceInert}
        tabIndex={-1}
        className="fixed inset-y-0 left-0 z-50 flex max-w-[85vw] -translate-x-full outline-none transition-transform duration-200 data-[acik=true]:translate-x-0 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:transition-none"
      >
        {kenar}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line-soft bg-surface px-2 lg:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <button
            type="button"
            aria-label="Menüyü aç"
            aria-expanded={acik}
            onClick={() => setAcik(true)}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink hover:bg-canvas"
          >
            <Menu className="size-5" />
          </button>
          <span className="truncate text-sm font-semibold text-ink">{baslik}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2 pr-1">{sagUst}</span>
        </header>

        <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
