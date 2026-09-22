'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'

/* Atölye paneli kabuğu — tasarım 2026-09-22 §3.3.

   lg (1024 px) ve üstü: kenar çubuğu bugünkü gibi sabit sütun, üst bar yok.
   Altı: 56 px üst bar (menü düğmesi + atölye adı + sağ yuva) ve soldan
   kayan çekmece. Kenar çubuğu TEK kez render edilir; konumu CSS belirler.

   Çekmece kapalıyken `inert`: ekran dışındaki bağlantılar sekmeyle
   gezilmesin. Masaüstünde inert asla uygulanmaz (useMasaustu).

   Z katmanları (üst üste binmeleri tek yerden okuyabilmek için):
   sayfa içi yapışkanlar ≤ 40 (ör. takvim GanttSatirlari z-30/z-40),
   kabuk 45–50 (üst bar 45, karartma 48, çekmece 50),
   üstü kaplayanlar daha yukarıda: PoPaneli z-60, HucreMenusu z-70,
   Toast/SwKayit z-50 ama DOM'da daha sonra geldiği için kabuğu örter. */

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
  const menuRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { setAcik(false) }, [pathname])

  /* Masaüstüne geçişte kapan: iPad dikeyden yataya döndüğünde çekmece açık
     kalırsa üst bar kaybolur ama gövde kaydırma kilidi ve Tab hapsi sürer;
     kullanıcının kapatacağı bir düğme de kalmaz. */
  useEffect(() => { if (masaustu) setAcik(false) }, [masaustu])

  useEffect(() => {
    if (!acik) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAcik(false); return }
      if (e.key !== 'Tab' || !cekmeceRef.current) return
      /* Odak çekmecede kalır: uçlarda sar. */
      const odaklanabilir = cekmeceRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (odaklanabilir.length === 0) return
      const ilk = odaklanabilir[0], son = odaklanabilir[odaklanabilir.length - 1]
      const etkin = document.activeElement as HTMLElement | null
      const listede = etkin ? Array.prototype.includes.call(odaklanabilir, etkin) : false
      if (!listede) {
        /* Açılışta odak kabın kendisinde (tabIndex=-1) olur; listede değildir.
           Tarayıcıya bırakırsak sekme çekmecenin dışına kaçar. */
        e.preventDefault()
        if (e.shiftKey) son.focus(); else ilk.focus()
        return
      }
      if (e.shiftKey && etkin === ilk) { e.preventDefault(); son.focus() }
      else if (!e.shiftKey && etkin === son) { e.preventDefault(); ilk.focus() }
    }
    document.addEventListener('keydown', onKey)
    const eskiOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cekmeceRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = eskiOverflow
      /* Odak dönüşü: çekmece kapanınca odak kaybolmasın, menü düğmesine
         dönsün. Masaüstünde düğme display:none olduğu için etkisiz. */
      menuRef.current?.focus()
    }
  }, [acik])

  const cekmeceInert = !masaustu && !acik

  return (
    <div className="min-h-screen flex bg-canvas">
      {acik && (
        /* Karartma bilerek <button>: adlandırılmış, klavyeyle ulaşılabilir bir
           kapatma hedefi olsun (div + onClick ekran okuyucuya görünmez).
           touch-none (touch-action: none): iOS gövdedeki overflow:hidden'ı
           dokunmatik kaydırmada yok sayar, kaydırmayı burada keseriz. */
        <button
          type="button"
          aria-label="Menüyü kapat"
          onClick={() => setAcik(false)}
          className="fixed inset-0 z-[48] touch-none bg-ink/40 lg:hidden"
        />
      )}

      {/* data-acik hem durum hem de animasyon anahtarı: transform'u CSS
          seçicisi (data-[acik=true]) sürdüğü için açılış ve kapanış geçişlerinin
          ikisi de CSS'te kalır; JS ile sınıf değiştirsek kapanış geçişi kaçardı.
          role yalnızca tablette 'dialog': masaüstünde bu sadece sayfa düzeninin
          bir sütunu, kipli pencere değil. masaustu SSR'da true olduğu için
          sunucu çıktısı da rolsüzdür (hidrasyon uyumlu). */}
      <div
        ref={cekmeceRef}
        role={masaustu ? undefined : 'dialog'}
        aria-label="Gezinti"
        aria-modal={acik || undefined}
        data-acik={acik}
        inert={cekmeceInert}
        tabIndex={-1}
        onClick={(e) => {
          /* Zaten açık olan sayfanın bağlantısına dokunulursa pathname
             değişmez, rota efekti tetiklenmez; çekmeceyi burada kapatırız. */
          if (!masaustu && (e.target as HTMLElement).closest('a[href]')) setAcik(false)
        }}
        className="fixed inset-y-0 left-0 z-50 flex max-w-[85vw] -translate-x-full pt-[env(safe-area-inset-top)] outline-none transition-transform duration-200 motion-reduce:transition-none data-[acik=true]:translate-x-0 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:pt-0 lg:transition-none"
      >
        {kenar}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* min-h-14 (sabit h-14 değil): env(safe-area-inset-top) dolgusu sabit
            yükseklikte içerik kutusunu daraltır ve 44 px'lik düğme taşar. */}
        <header
          className="sticky top-0 z-[45] flex min-h-14 items-center gap-2 border-b border-line-soft bg-surface px-2 lg:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <button
            ref={menuRef}
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
